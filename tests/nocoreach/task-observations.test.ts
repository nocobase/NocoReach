// @vitest-environment node
import { fileURLToPath } from 'node:url';

import { createTestDatabase } from '@nocobase/app-testing/server';
import { createSecretsService } from '@nocobase/app-server/secrets';
import type { DatabaseConnection } from '@nocobase/db';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, it, onTestFinished, vi } from 'vitest';

import {
  compare,
  type EffectResult,
  type Partition,
  shift,
} from '../../server/nocoreach/execution/effect.js';
import {
  projectWork,
  type Work,
} from '../../server/nocoreach/execution/model.js';
import {
  TASK_OBSERVATIONS_COLLECTION,
  TASK_OBSERVATIONS_LIFECYCLE,
  type TaskObservationHost,
  type TaskObservationRecord,
  type TaskObservationTask,
  TaskObservations,
} from '../../server/nocoreach/execution/observations.js';
import {
  TASK_ENGINE,
  type LifecycleTask,
} from '../../server/nocoreach/execution/lifecycle.js';
import { createTaskRuntime } from '../../server/nocoreach/execution/runtime.js';
import { TaskService } from '../../server/nocoreach/execution/service.js';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { LegacyVariables } from '../../server/nocoreach/legacy/variables.js';
import { NOCOREACH_LIFECYCLE_COLLECTIONS } from '../../server/nocoreach/lifecycle/runtime.js';

const LIVE_AT = '2026-09-01T12:00:00.000Z';
const LIVE_DAY = LIVE_AT.slice(0, 10);
const PAGE = 'https://example.com/product';
const GSC_SITE = 'sc-domain:example.com';
const GA4_PROPERTY = 'properties/42';

interface TaskRow {
  id: string | number;
  title: string;
  projectId: string;
  status: string;
  evidence: { original: string; work: Work };
}

interface PartitionRow extends Partition {
  id: string | number;
  projectId: string;
  resource: string;
  partitionKey: string;
}

function published(overrides: Partial<Work> = {}): Work {
  return {
    schemaVersion: 2,
    revision: 4,
    stage: 'done',
    plan: null,
    planVersion: 0,
    step: 0,
    results: [],
    history: [{ at: LIVE_AT, actor: 'operator', action: 'published' }],
    operations: [],
    receipt: null,
    verification: null,
    observeFrom: LIVE_AT,
    page: { url: PAGE, title: 'Product' },
    ...overrides,
  };
}

function taskProjection(row: TaskRow): TaskObservationTask {
  return {
    id: String(row.id),
    title: row.title,
    projectId: row.projectId,
    work: projectWork(row),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture() {
  const testDb = await createTestDatabase({
    migrations: [
      {
        packageName: 'nocoreach',
        directory: fileURLToPath(
          new URL('../../database/main/migrations', import.meta.url),
        ),
      },
    ],
  });
  onTestFinished(() => testDb.destroy());
  const { database, connection } = testDb;
  let instant = '2026-09-09T12:00:00.000Z';
  let partitionId = 1;
  const clock = () => new Date(instant);
  const rows = (tx = connection) => tx.repository<TaskRow>('nrTasks');
  const observations = () =>
    connection.repository<TaskObservationRecord>(TASK_OBSERVATIONS_COLLECTION);

  const host: TaskObservationHost = {
    pages(work) {
      return [
        ...new Set([...(work.release?.pages ?? []), work.page?.url ?? '']),
      ].filter(Boolean);
    },
    async tasks(page, tx = connection) {
      const tasks = await rows(tx).findMany({
        filter: (filter) =>
          filter.and([
            filter.number('id').gt(page.afterId ?? 0),
            ...(page.projectId
              ? [filter.string('projectId').eq(page.projectId)]
              : []),
          ]),
        sort: (sort) => sort.field('id').asc(),
        limit: page.limit,
      });
      return tasks.map(taskProjection);
    },
    async task(projectId, taskId, tx) {
      const row = await rows(tx).findOne({ filter: { id: taskId, projectId } });
      return row ? taskProjection(row) : undefined;
    },
    async dataEnd(projectId) {
      // Real persisted source partitions, including a configured source that
      // has not delivered even one day. A faster source cannot hide that gap.
      const ends: string[] = [];
      for (const [source, grain, resource] of [
        ['gsc', 'query_page', GSC_SITE],
        ['ga4', 'page', GA4_PROPERTY],
      ]) {
        const latest = await connection
          .repository<PartitionRow>('nrSyncPartitions')
          .findOne({
            filter: { projectId, source, grain, resource },
            sort: (sort) => sort.field('date').desc(),
          });
        ends.push(latest?.date ?? '');
      }
      return ends.sort()[0];
    },
    async partitions(projectId, start, end) {
      const partitions = await connection
        .repository<PartitionRow>('nrSyncPartitions')
        .findMany({
          filter: { projectId },
        });
      return partitions.filter(
        (part) =>
          part.date >= start &&
          part.date <= end &&
          part.resource === (part.source === 'gsc' ? GSC_SITE : GA4_PROPERTY),
      );
    },
    async saveResult(task, result, tx) {
      const row = await rows(tx).findOne({
        filter: { id: task.id, projectId: task.projectId },
      });
      if (!row) throw new Error('Task vanished during observation');
      const work = projectWork(row);
      const existing = work.observation?.results ?? [];
      if (existing.some((entry) => entry.day === result.day)) return;
      work.observation = {
        results: [...existing, result].sort((a, b) => a.day - b.day),
      };
      work.history.push({
        at: result.computedAt,
        actor: 'system',
        action: 'effect',
        note: String(result.day),
      });
      work.revision++;
      await rows(tx).updateOne({
        filter: { id: task.id },
        values: { evidence: { ...row.evidence, work } },
      });
    },
  };

  function worker() {
    const runtime = new LifecycleRuntime({
      store: createRepositoryLifecycleStore(database, {
        collections: NOCOREACH_LIFECYCLE_COLLECTIONS,
      }),
      clock,
    });
    return new TaskObservations(database, runtime, host, { clock });
  }

  async function putTask(
    id: number,
    work = published(),
    projectId = 'project-1',
    tx: DatabaseConnection = connection,
  ) {
    const { record } = await rows(tx).createOne({
      values: {
        id,
        projectId,
        title: `Task ${id}`,
        status: '已完成',
        evidence: { original: 'preserved', work },
      },
    });
    return taskProjection(record);
  }

  async function seedSource(
    source: 'gsc' | 'ga4',
    through: number,
    baseline = 7,
  ) {
    const repository = connection.repository<PartitionRow>('nrSyncPartitions');
    for (let offset = -baseline; offset <= through; offset++) {
      if (offset === 0) continue;
      const date = shift(LIVE_DAY, offset);
      const partitionKey = `${source}:${date}`;
      if (await repository.exists({ filter: { partitionKey } })) continue;
      const after = offset > 0;
      await repository.createOne({
        values: {
          id: partitionId++,
          projectId: 'project-1',
          source,
          grain: source === 'gsc' ? 'query_page' : 'page',
          resource: source === 'gsc' ? GSC_SITE : GA4_PROPERTY,
          partitionKey,
          date,
          payload:
            source === 'gsc'
              ? [
                  {
                    page: PAGE,
                    clicks: after ? 20 : 10,
                    impressions: 100,
                    position: 8,
                  },
                ]
              : [
                  {
                    page: '/product',
                    views: after ? 100 : 50,
                    conversions: after ? 4 : 2,
                  },
                ],
        },
      });
    }
  }

  async function storedTask(id = 1) {
    return (await rows().findOne({ filter: { id } }))!;
  }

  async function observation(day = 7, taskId = 1) {
    return (await observations().findOne({ filter: { day, taskId } }))!;
  }

  async function completions(taskId = 1, day = 7) {
    const record = await observation(day, taskId);
    return connection
      .repository(NOCOREACH_LIFECYCLE_COLLECTIONS.transitions)
      .count({
        filter: {
          lifecycle: TASK_OBSERVATIONS_LIFECYCLE,
          recordId: String(record.id),
          transition: 'complete',
        },
      });
  }

  return {
    ...testDb,
    host,
    worker,
    observations,
    putTask,
    seedSource,
    storedTask,
    observation,
    completions,
    setTime: (value: string) => {
      instant = value;
    },
  };
}

it('creates both child checkpoints in the publication transaction, and rolls them back with it', async () => {
  const f = await fixture();
  const worker = f.worker();
  await f.database.transaction(async (tx) => {
    const task = await f.putTask(1, published(), 'project-1', tx);
    expect(await worker.schedule(task, tx)).toBe(2);
    expect(await worker.schedule(task, tx)).toBe(0);
  });
  const children = await f
    .observations()
    .findMany({ sort: (sort) => sort.field('day').asc() });
  expect(
    children.map((child) => ({
      day: child.day,
      status: child.status,
      dueAt: new Date(child.dueAt).toISOString(),
    })),
  ).toEqual([
    { day: 7, status: 'pending', dueAt: '2026-09-09T00:00:00.000Z' },
    { day: 28, status: 'pending', dueAt: '2026-09-30T00:00:00.000Z' },
  ]);

  await expect(
    f.database.transaction(async (tx) => {
      const task = await f.putTask(2, published(), 'project-1', tx);
      await worker.schedule(task, tx);
      throw new Error('Publication rolled back');
    }),
  ).rejects.toThrow('Publication rolled back');
  expect(await f.connection.repository('nrTasks').count()).toBe(1);
  expect(await f.observations().count()).toBe(2);
  expect(
    await f.connection
      .repository(NOCOREACH_LIFECYCLE_COLLECTIONS.transitions)
      .count(),
  ).toBe(2);
});

it('waits for every configured source and preserves the existing comparison and completed task', async () => {
  const f = await fixture();
  const task = await f.putTask(1);
  const worker = f.worker();
  await worker.schedule(task);
  await f.seedSource('ga4', 7);
  const before = await f.observation();

  expect(await worker.sweep(1)).toMatchObject({
    scanned: 1,
    deferred: 1,
    completed: 0,
  });
  const deferredRow = await f.observation();
  expect(deferredRow).toMatchObject({
    status: 'pending',
    reason: 'waiting_for_data',
  });
  expect(deferredRow.lifecycleVersion).toBe(before.lifecycleVersion + 1);
  expect(new Date(deferredRow.dueAt).toISOString()).toBe(
    '2026-09-09T13:00:00.000Z',
  );
  expect(await worker.sweep(1)).toMatchObject({ scanned: 0 });

  // GSC begins delivering, but its latest day still lags behind GA4.
  f.setTime('2026-09-09T13:00:00.000Z');
  await f.seedSource('gsc', 6);
  expect(await worker.sweep(1)).toMatchObject({ deferred: 1, completed: 0 });
  expect(projectWork(await f.storedTask()).observation).toBeUndefined();

  f.setTime('2026-09-09T14:00:00.000Z');
  await f.seedSource('gsc', 7);
  expect(await worker.sweep(1)).toMatchObject({ completed: 1, deferred: 0 });
  const result = (await f.observation()).result!;
  expect(result).toMatchObject({
    day: 7,
    baseline: { start: '2026-08-25', end: '2026-08-31' },
    after: { start: '2026-09-02', end: '2026-09-08' },
    gsc: { clicks: [70, 140] },
    ga4: { views: [350, 700], conversions: [14, 28] },
    primary: 'clicks',
    change: 1,
    conclusion: 'up',
  });
  const stored = await f.storedTask();
  expect(stored.status).toBe('已完成');
  expect(stored.evidence.original).toBe('preserved');
  expect(projectWork(stored)).toMatchObject({
    stage: 'done',
    revision: task.work.revision + 1,
    observation: { results: [result] },
  });
  expect((await f.observation(28)).status).toBe('pending');
});

it('fences duplicate workers with the persisted lifecycle version and writes one result and log', async () => {
  const f = await fixture();
  const first = f.worker();
  const second = f.worker();
  await first.schedule(await f.putTask(1));
  await f.seedSource('gsc', 7);
  await f.seedSource('ga4', 7);
  const gate = deferred();
  const read = f.host.partitions;
  let readers = 0;
  vi.spyOn(f.host, 'partitions').mockImplementation(async (...args) => {
    if (++readers === 2) gate.resolve();
    await gate.promise;
    return read(...args);
  });

  const results = await Promise.all([first.sweep(1), second.sweep(1)]);
  expect(results.reduce((sum, result) => sum + result.completed, 0)).toBe(1);
  expect(results.reduce((sum, result) => sum + result.competed, 0)).toBe(1);
  expect(await f.completions()).toBe(1);
  const work = projectWork(await f.storedTask());
  expect(work.observation?.results).toHaveLength(1);
  expect(work.history).toEqual([
    { at: LIVE_AT, actor: 'operator', action: 'published' },
    {
      at: '2026-09-09T12:00:00.000Z',
      actor: 'system',
      action: 'effect',
      note: '7',
    },
  ]);
  expect(await second.sweep()).toMatchObject({ scanned: 0 });
});

it('rolls back a failed result write and resumes persisted 7/28-day work with a fresh runtime', async () => {
  const f = await fixture();
  const worker = f.worker();
  await worker.schedule(await f.putTask(1));
  await f.seedSource('gsc', 7);
  await f.seedSource('ga4', 7);
  const original = await f.observation();
  const save = f.host.saveResult;
  vi.spyOn(f.host, 'saveResult').mockImplementationOnce(async (...args) => {
    await save(...args);
    throw new Error('Crash before transaction commit');
  });
  await expect(worker.sweep(1)).rejects.toMatchObject({
    errors: [
      expect.objectContaining({ message: 'Crash before transaction commit' }),
    ],
  });
  expect(await f.observation()).toMatchObject({
    status: 'pending',
    lifecycleVersion: original.lifecycleVersion + 1,
    reason: 'observation_failed',
    result: null,
  });
  expect(await f.completions()).toBe(0);
  expect(projectWork(await f.storedTask()).observation).toBeUndefined();

  const restarted = f.worker();
  expect(await restarted.sweep(1)).toMatchObject({ scanned: 0 });
  f.setTime('2026-09-09T13:00:00.000Z');
  expect(await restarted.sweep(1)).toMatchObject({ completed: 1 });
  f.setTime('2026-09-30T00:00:00.000Z');
  await f.seedSource('gsc', 28, 28);
  await f.seedSource('ga4', 28, 28);
  expect(await restarted.sweep(1)).toMatchObject({ completed: 1 });
  const work = projectWork(await f.storedTask());
  expect(work.observation?.results.map((result) => result.day)).toEqual([
    7, 28,
  ]);
  expect(work.history).toHaveLength(3);
  expect(await f.observations().count()).toBe(2);
  expect(await f.completions(1, 7)).toBe(1);
  expect(await f.completions(1, 28)).toBe(1);
});

it('defers a failing project durably and still completes other projects in the same due batch', async () => {
  const f = await fixture();
  const worker = f.worker();
  await worker.schedule(await f.putTask(1, published(), 'unavailable-project'));
  await worker.schedule(await f.putTask(2));
  await f.seedSource('gsc', 7);
  await f.seedSource('ga4', 7);
  const dataEnd = f.host.dataEnd;
  vi.spyOn(f.host, 'dataEnd').mockImplementation(async (projectId) => {
    if (projectId === 'unavailable-project')
      throw new Error('Project metrics connection unavailable');
    return dataEnd(projectId);
  });

  await expect(worker.sweep(2)).rejects.toMatchObject({
    errors: [
      expect.objectContaining({
        message: 'Project metrics connection unavailable',
      }),
    ],
  });
  expect(await f.observation(7, 1)).toMatchObject({
    status: 'pending',
    reason: 'observation_failed',
    result: null,
  });
  expect(new Date((await f.observation(7, 1)).dueAt).toISOString()).toBe(
    '2026-09-09T13:00:00.000Z',
  );
  expect(await f.observation(7, 2)).toMatchObject({ status: 'completed' });
  expect(await f.completions(2, 7)).toBe(1);
  expect(projectWork(await f.storedTask(2)).observation?.results).toHaveLength(
    1,
  );

  // A fresh process sees the persisted backoff instead of encountering the
  // same failing head row again on every minute sweep.
  expect(await f.worker().sweep(2)).toMatchObject({ scanned: 0 });
});

it('commits through the production TaskService and legacy transaction adapter without reopening the completed parent', async () => {
  const f = await fixture();
  const legacy = new LegacyDatabase(
    f.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const variables = new LegacyVariables(legacy, createSecretsService({}));
  const runtime = new LifecycleRuntime({
    store: createRepositoryLifecycleStore(f.database, {
      collections: NOCOREACH_LIFECYCLE_COLLECTIONS,
    }),
  });
  const tasks = createTaskRuntime({
    database: f.database,
    lifecycle: runtime,
    legacy,
    variables,
    service: () => service,
    logger: { warn: vi.fn() },
  });
  // No Agent transport or model is involved. Metrics are real persisted source
  // partitions; TaskService owns the actual parent lock and Work update.
  const service = new TaskService({
    db: legacy,
    taskLifecycle: tasks.lifecycle,
    taskRunStore: tasks.runs,
    taskObservations: tasks.observations,
  });
  service.dataEnd = f.host.dataEnd;
  service.partitions = f.host.partitions;
  const task = await f.putTask(1);
  await f.connection.repository('nrTasks').updateOne({
    filter: { id: 1 },
    values: {
      executionEngine: TASK_ENGINE,
      executionState: 'completed',
      executionStateChangedAt: new Date(LIVE_AT),
      lifecycleVersion: 9,
    },
  });
  await tasks.observations.schedule(task);
  await f.seedSource('gsc', 7);
  await f.seedSource('ga4', 7);

  expect(await tasks.observations.sweep(1)).toMatchObject({ completed: 1 });
  const parent = await f.connection
    .repository<LifecycleTask>('nrTasks')
    .findOne({ filter: { id: 1 } });
  expect(parent).toMatchObject({
    executionState: 'completed',
    lifecycleVersion: 9,
  });
  expect(new Date(String(parent!.executionStateChangedAt)).toISOString()).toBe(
    LIVE_AT,
  );
  expect(projectWork(parent).revision).toBe(task.work.revision + 1);
  expect(projectWork(parent).observation?.results).toHaveLength(1);
  expect(await f.completions()).toBe(1);
  // The native commit must release the bridged task lock for the next command.
  await service.lock('project-1', '1', async (transaction) => {
    expect(
      (await service.task('project-1', '1', transaction)).executionState,
    ).toBe('completed');
  });
});

it('backfills only unfinished checkpoints in bounded cursor pages without republishing', async () => {
  const f = await fixture();
  const historical: EffectResult = compare(7, LIVE_DAY, [PAGE], [], LIVE_AT);
  await f.putTask(1, published({ observation: { results: [historical] } }));
  await f.putTask(2, published({ observeFrom: undefined, stage: 'work' }));
  await f.putTask(3, published({ cancelledAt: '2026-09-02T00:00:00.000Z' }));
  const worker = f.worker();
  expect(await worker.backfillPage(undefined, 2)).toEqual({
    scanned: 2,
    created: 1,
    nextCursor: '2',
  });
  expect(await worker.backfillPage(undefined, 2)).toEqual({
    scanned: 2,
    created: 0,
    nextCursor: '2',
  });
  expect(await worker.backfillPage('2', 2)).toEqual({
    scanned: 1,
    created: 0,
    nextCursor: undefined,
  });
  expect(await f.observations().count()).toBe(1);
  expect(await f.observation(28)).toMatchObject({ day: 28, status: 'pending' });
  const work = projectWork(await f.storedTask());
  expect(work.observation?.results).toEqual([historical]);
  expect(work.revision).toBe(4);
  expect(work.history).toHaveLength(1);
});

it('retains same-project concurrent-change notes across task pages and cancels obsolete children', async () => {
  const f = await fixture();
  const worker = f.worker();
  await worker.schedule(await f.putTask(1));
  for (let id = 2; id <= 100; id++) {
    await f.putTask(id, published({ observeFrom: undefined }));
  }
  await f.putTask(101, published({ observeFrom: '2026-09-03T12:00:00.000Z' }));
  await f.putTask(102, published(), 'another-project');
  await f.putTask(
    103,
    published({ page: { url: 'https://example.com/other', title: 'Other' } }),
  );
  await f.seedSource('gsc', 7);
  await f.seedSource('ga4', 7);
  expect(await worker.sweep(1)).toMatchObject({ completed: 1 });
  const notes = (await f.observation()).result!.notes.join('\n');
  expect(notes).toContain('Task 101');
  expect(notes).not.toContain('Task 102');
  expect(notes).not.toContain('Task 103');

  // Cancellation after day 7 preserves its result and cancels the later child.
  const row = await f.storedTask();
  const work = projectWork(row);
  work.cancelledAt = '2026-09-10T00:00:00.000Z';
  await f.connection.repository<TaskRow>('nrTasks').updateOne({
    filter: { id: 1 },
    values: { evidence: { ...row.evidence, work } },
  });
  f.setTime('2026-09-30T00:00:00.000Z');
  expect(await worker.sweep()).toMatchObject({ cancelled: 1, completed: 0 });
  expect(await f.observation(28)).toMatchObject({
    status: 'cancelled',
    result: null,
  });
  expect(
    projectWork(await f.storedTask()).observation?.results.map(
      (result) => result.day,
    ),
  ).toEqual([7]);
});
