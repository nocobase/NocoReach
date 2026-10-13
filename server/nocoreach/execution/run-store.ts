import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';

import { TASK_ENGINE } from './lifecycle.js';
import type { Run } from './model.js';

interface RunRow {
  id: string;
  projectId: string;
  taskId: string;
  engine: string;
  status: Run['status'];
  pluginRunId: string | null;
  payload: Run;
  nextSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SnapshotRow {
  id: string;
  key: string;
  payload: Run;
}

interface Checkpoint {
  id: string;
  name: string;
  value: string;
}

export function runKey(
  key: string,
): { projectId: string; taskId: string; id: string } | undefined {
  const parts = /^nr-task-run:([^:]+):([^:]+):(.+)$/.exec(key);
  return parts
    ? { projectId: parts[1], taskId: parts[2], id: parts[3] }
    : undefined;
}

export function needsRunSync(run: Run): boolean {
  if (run.pluginRunId || run.executorKind === 'runner')
    return !run.pluginSettled;
  return run.status === 'queued' || run.status === 'running';
}

/** Durable run records with an indexed reconciliation queue; snapshots remain historical input. */
export class TaskRunStore {
  constructor(private readonly database: DatabaseManager) {}

  private connection(connection?: DatabaseConnection) {
    return connection ?? this.database.connection();
  }

  async get(
    projectId: string,
    taskId: string,
    id: string,
    connection?: DatabaseConnection,
  ): Promise<Run | undefined> {
    const row = await this.connection(connection)
      .repository<RunRow>('nrTaskRuns')
      .findOne({
        filter: (f) =>
          f.and([
            f.string('projectId').eq(projectId),
            f.string('taskId').eq(taskId),
            f.string('id').eq(id),
          ]),
      });
    return row?.payload;
  }

  async list(
    projectId: string,
    taskId: string,
    connection?: DatabaseConnection,
  ): Promise<Run[]> {
    const rows: Run[] = [];
    const repository =
      this.connection(connection).repository<RunRow>('nrTaskRuns');
    for (let offset = 0; ; offset += 100) {
      const batch = await repository.findMany({
        filter: (f) =>
          f.and([
            f.string('projectId').eq(projectId),
            f.string('taskId').eq(taskId),
          ]),
        sort: (s) => [s.field('createdAt').asc(), s.field('id').asc()],
        limit: 100,
        offset,
      });
      rows.push(...batch.map((row) => row.payload));
      if (batch.length < 100) return rows;
    }
  }

  async put(run: Run, connection: DatabaseConnection): Promise<void> {
    const task = await this.task(run, connection);
    if (!task)
      throw new Error(
        'A task run must belong to an existing task in its project',
      );
    const repository = connection.repository<RunRow>('nrTaskRuns');
    const existing = await repository.findOne({
      filter: (f) => f.string('id').eq(run.id),
    });
    if (
      existing &&
      (existing.projectId !== run.projectId || existing.taskId !== run.taskId)
    )
      throw new Error(
        'A task run cannot be reassigned to another task or project',
      );
    const values = this.values(
      run,
      existing?.engine ??
        (task.executionEngine === TASK_ENGINE ? TASK_ENGINE : 'legacy'),
    );
    if (existing) {
      await repository.updateOne({
        filter: (f) =>
          f.and([
            f.string('id').eq(run.id),
            f.string('projectId').eq(run.projectId),
            f.string('taskId').eq(run.taskId),
          ]),
        values: { ...values, createdAt: existing.createdAt },
      });
    } else {
      // A concurrent insert fails instead of silently changing an existing
      // run's scope or overwriting an input accepted by another transaction.
      await repository.createOne({ values });
    }
  }

  private task(run: Run, connection: DatabaseConnection) {
    return connection
      .repository<{ executionEngine?: string | null }>('nrTasks')
      .findOne({
        filter: (f) =>
          f.and([
            f.number('id').eq(run.taskId),
            f.string('projectId').eq(run.projectId),
          ]),
      });
  }

  private values(run: Run, engine: string): RunRow {
    const now = new Date();
    return {
      id: run.id,
      projectId: run.projectId,
      taskId: run.taskId,
      engine,
      status: run.status,
      pluginRunId: run.pluginRunId ?? null,
      payload: run,
      nextSyncAt: needsRunSync(run) ? now : null,
      createdAt: new Date(run.createdAt),
      updatedAt: now,
    };
  }

  async due(limit = 50, now = new Date()): Promise<Run[]> {
    const rows = await this.database.repository<RunRow>('nrTaskRuns').findMany({
      filter: (f) => f.date('nextSyncAt').notAfter(now),
      sort: (s) => [s.field('nextSyncAt').asc(), s.field('id').asc()],
      limit,
    });
    return rows.map((row) => row.payload);
  }

  /** Reserve the next poll before I/O, so one unavailable run cannot starve the queue. */
  async defer(runId: string, milliseconds = 15_000): Promise<void> {
    const now = new Date();
    await this.database.repository<RunRow>('nrTaskRuns').updateMany({
      // A terminal write clears nextSyncAt. A poll selected before that write
      // must not resurrect it, or repeatedly consume the bounded due page.
      filter: (f) =>
        f.and([f.string('id').eq(runId), f.date('nextSyncAt').notAfter(now)]),
      values: { nextSyncAt: new Date(now.getTime() + milliseconds) },
    });
  }

  /**
   * Resume the one-time import by primary key. Never overwrite a newer native
   * record with its archived snapshot, and never enqueue work during adoption.
   * The caller owns the small checkpoint in nrVariables (unique name).
   */
  async backfillPage(
    afterId: string | number = '0',
    limit = 100,
  ): Promise<{ cursor: string; done: boolean; skipped: number }> {
    if (typeof afterId === 'number' && !Number.isSafeInteger(afterId))
      throw new Error(
        'Task run backfill cursors must retain their exact integer value',
      );
    return this.database.transaction(async (connection) => {
      const rows = await connection
        .repository<SnapshotRow>('nrSnapshots')
        .findMany({
          filter: (f) =>
            f.and([
              f.string('key').startsWith('nr-task-run:'),
              f.number('id').gt(String(afterId)),
            ]),
          sort: (s) => s.field('id').asc(),
          limit,
        });
      let skipped = 0;
      for (const row of rows) {
        const key = runKey(row.key);
        if (
          !key ||
          !row.payload ||
          key.id !== row.payload.id ||
          key.taskId !== String(row.payload.taskId) ||
          key.projectId !== String(row.payload.projectId)
        )
          throw new Error(`Invalid archived task run at snapshot ${row.id}`);
        if (!(await this.task(row.payload, connection))) {
          skipped++;
          continue;
        }
        // Only restate the immutable key on conflict: an insert racing this
        // import keeps its newer payload, terminal result and polling state.
        const stored = await connection
          .repository<RunRow>('nrTaskRuns')
          .upsertOne({
            filter: (f) => f.string('id').eq(key.id),
            create: this.values(row.payload, 'legacy'),
            update: { id: key.id },
          });
        if (
          stored.record.projectId !== key.projectId ||
          stored.record.taskId !== key.taskId
        )
          skipped++;
      }
      return {
        cursor: String(rows.at(-1)?.id ?? afterId),
        done: rows.length < limit,
        skipped,
      };
    });
  }

  async readCheckpoint(name: string): Promise<string | undefined> {
    return (
      await this.database
        .repository<Checkpoint>('nrVariables')
        .findOne({ filter: (f) => f.string('name').eq(name) })
    )?.value;
  }
}
