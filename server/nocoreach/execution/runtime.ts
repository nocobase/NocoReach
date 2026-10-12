import type { DatabaseManager } from '@nocobase/db';
import { LifecycleError, type LifecycleRuntime } from '@nocobase/lifecycle';
import { z } from 'zod';

import type { LegacyDatabase, LegacyRecord } from '../legacy/database.js';
import type { LegacyVariables } from '../legacy/variables.js';
import { TASK_ENGINE, TaskLifecycle } from './lifecycle.js';
import { projectWork } from './model.js';
import { TaskObservations, type TaskObservationTask } from './observations.js';
import { TaskRunStore } from './run-store.js';
import type { TaskService } from './service.js';

interface TaskRuntimeOptions {
  readonly database: DatabaseManager;
  readonly lifecycle: LifecycleRuntime;
  readonly legacy: LegacyDatabase;
  readonly variables: LegacyVariables;
  readonly service: () => TaskService;
  readonly logger: { warn(message: string, details?: unknown): void };
}

const projection = (row: LegacyRecord): TaskObservationTask => ({
  id: String(row.id),
  projectId: String(row.projectId),
  title: typeof row.title === 'string' ? row.title : '',
  work: projectWork(row.toJSON()),
});

export const TASK_RUNTIME_BACKFILL_CHECKPOINT =
  'NOCOREACH_TASK_RUNTIME_BACKFILL_V1';
const checkpointSchema = z
  .object({
    runs: z.union([
      z.string().regex(/^\d+$/),
      z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    ]),
    runsDone: z.boolean(),
    tasks: z.string(),
    tasksDone: z.boolean(),
  })
  .strict();

/** Native execution services assembled once; business adapters share the caller's connection. */
export function createTaskRuntime(options: TaskRuntimeOptions) {
  const lifecycle = new TaskLifecycle(options.lifecycle);
  const runs = new TaskRunStore(options.database);
  // New idle tasks use the native engine from creation. Existing rows remain
  // untouched; classic imports write through the Repository and retain lineage.
  options.legacy.on('nrTasks.beforeCreate', (row) => {
    const work = projectWork(row.toJSON());
    if (
      work.stage !== 'plan' ||
      work.flow ||
      work.plan ||
      work.cancelledAt ||
      work.archivedAt
    )
      return;
    row.set('executionEngine', TASK_ENGINE);
    row.set('executionState', 'idle');
    row.set('executionStateChangedAt', new Date());
    row.set('lifecycleVersion', 0);
  });
  const observations = new TaskObservations(
    options.database,
    options.lifecycle,
    {
      pages: (work) => options.service().effectPages(work),
      tasks: (page, connection) => {
        const read = async () => {
          const rows = await options.legacy.getRepository('nrTasks').find({
            filter: {
              ...(page.projectId ? { projectId: page.projectId } : {}),
              ...(page.afterId ? { id: { $gt: page.afterId } } : {}),
            },
            sort: 'id',
            limit: page.limit,
          });
          return rows.map(projection);
        };
        return connection
          ? options.legacy.withConnection(connection, read)
          : read();
      },
      task: (projectId, taskId, connection) =>
        options.legacy.withConnection(connection, async () => {
          const row = await options.legacy
            .getRepository('nrTasks')
            .findOne({ filter: { id: taskId, projectId } });
          return row ? projection(row) : undefined;
        }),
      dataEnd: (projectId) => options.service().dataEnd(projectId),
      partitions: (projectId, start, end) =>
        options.service().partitions(projectId, start, end),
      saveResult: (observed, result, connection) =>
        options.legacy.withConnection(connection, () =>
          options
            .service()
            .lock(observed.projectId, observed.id, async (transaction) => {
              const task = await options
                .service()
                .task(observed.projectId, observed.id, transaction);
              const work = projectWork(task);
              if (
                work.cancelledAt ||
                work.observeFrom !== observed.work.observeFrom
              )
                throw new LifecycleError(
                  'CONFLICT',
                  'Task publication changed while observing results',
                );
              if (
                work.observation?.results.some(
                  (existing) => existing.day === result.day,
                )
              )
                return;
              work.observation = {
                results: [...(work.observation?.results ?? []), result].sort(
                  (a, b) => a.day - b.day,
                ),
              };
              work.history.push({
                at: result.computedAt,
                actor: 'system',
                action: 'effect',
                note: String(result.day),
              });
              await options.service().save(task, work, transaction);
            }),
        ),
    },
  );

  return {
    lifecycle,
    runs,
    observations,
    async initialize(): Promise<void> {
      const saved = await runs.readCheckpoint(TASK_RUNTIME_BACKFILL_CHECKPOINT);
      const checkpoint = saved
        ? checkpointSchema.parse(JSON.parse(saved))
        : { runs: '0', runsDone: false, tasks: '', tasksDone: false };
      // Committing a page before its cursor is harmless: restarting only repeats
      // an idempotent import. No historical Agent run is submitted here.
      while (!checkpoint.runsDone) {
        const page = await runs.backfillPage(checkpoint.runs);
        if (page.skipped)
          options.logger.warn(
            'Historical task runs without a matching task were retained in snapshots and skipped',
            { count: page.skipped },
          );
        checkpoint.runs = page.cursor;
        checkpoint.runsDone = page.done;
        await options.variables.set(
          TASK_RUNTIME_BACKFILL_CHECKPOINT,
          JSON.stringify(checkpoint),
          false,
        );
      }
      while (!checkpoint.tasksDone) {
        const page = await observations.backfillPage(
          checkpoint.tasks || undefined,
        );
        const rows = await options.legacy.getRepository('nrTasks').find({
          filter: checkpoint.tasks ? { id: { $gt: checkpoint.tasks } } : {},
          sort: 'id',
          limit: 100,
        });
        // Existing releases get an indexed due time, without changing their
        // engine or replaying a lifecycle entry/publishing operation.
        for (const row of rows)
          await options
            .service()
            .lock(
              String(row.projectId),
              String(row.id),
              async (transaction) => {
                const task = await options
                  .service()
                  .task(String(row.projectId), String(row.id), transaction);
                const work = projectWork(task);
                await options.legacy.getRepository('nrTasks').update({
                  filterByTk: row.id,
                  values: {
                    activeRunId:
                      work.latestRun &&
                      ['queued', 'running'].includes(work.latestRun.status)
                        ? work.latestRun.id
                        : null,
                    nextCheckAt:
                      !work.cancelledAt &&
                      work.release?.state === 'verifying' &&
                      work.release.nextCheckAt
                        ? new Date(work.release.nextCheckAt)
                        : null,
                  },
                  transaction,
                });
              },
            );
        checkpoint.tasks = page.nextCursor ?? checkpoint.tasks;
        checkpoint.tasksDone = page.nextCursor === undefined;
        await options.variables.set(
          TASK_RUNTIME_BACKFILL_CHECKPOINT,
          JSON.stringify(checkpoint),
          false,
        );
      }
    },
  };
}

export type TaskRuntime = ReturnType<typeof createTaskRuntime>;
