// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@nocobase/app-testing/server';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import { createJobExecutorService } from '@nocobase/jobs';
import {
  defineLifecycle,
  SYSTEM_ACTOR,
  type LifecycleRecord,
} from '@nocobase/lifecycle';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, it, onTestFinished, vi } from 'vitest';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import {
  createNocoReachLifecycles,
  NOCOREACH_LIFECYCLE_COLLECTIONS,
  NOCOREACH_LIFECYCLE_SCOPE,
} from '../../server/nocoreach/lifecycle/runtime.js';

const migrations = [
  {
    packageName: 'nocoreach',
    directory: fileURLToPath(
      new URL('../../database/main/migrations', import.meta.url),
    ),
  },
];
const lifecycleName = 'nocoreach.runtimeTest';
interface TestLifecycleTypes {
  record: LifecycleRecord;
  state: 'idle' | 'running' | 'completed';
  services: {
    storeReceipt(taskId: string): Promise<void>;
    execute(): Promise<unknown>;
  };
}
const testLifecycle = defineLifecycle<TestLifecycleTypes>({
  name: lifecycleName,
  collection: 'nrTasks',
  stateField: 'executionState',
  changedAtField: 'executionStateChangedAt',
  initial: 'idle',
  states: ['idle', 'running', { name: 'completed', final: true }],
  transitions: {
    begin: {
      from: 'idle',
      to: 'running',
      onTransition: ({ record, services }) =>
        services.storeReceipt(String(record.id)),
    },
    complete: { from: 'running', to: 'completed', manual: false },
  },
  onEnter: {
    running: [
      {
        name: 'record-effect',
        timeoutMs: 1_000,
        onSuccess: 'complete',
        run: ({ services }) => services.execute(),
      },
    ],
  },
});

async function databaseFixture() {
  const testDb = await createTestDatabase({ migrations });
  onTestFinished(() => testDb.destroy());
  const legacy = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  return { ...testDb, legacy };
}

async function worker(
  database: DatabaseManager,
  execute: () => Promise<unknown>,
) {
  const storagePath = await mkdtemp(join(tmpdir(), 'nocoreach-lifecycle-'));
  const executors = createJobExecutorService(
    { default: 'memory', memory: { adapter: 'memory', concurrency: 1 } },
    { appName: 'nocoreach-test', storagePath },
  );
  const logger = { warn: vi.fn(), error: vi.fn() };
  const lifecycles = createNocoReachLifecycles({
    database,
    jobs: executors.getJobExecutor(NOCOREACH_LIFECYCLE_SCOPE),
    schedule: executors.getScheduleExecutor(NOCOREACH_LIFECYCLE_SCOPE),
    logger,
  });
  lifecycles.runtime.register(testLifecycle, {
    services: (handle) => ({
      async storeReceipt(taskId) {
        // The repository store supplies its real transaction connection to
        // services; reading through the manager here would deadlock on SQLite.
        const connection = handle as DatabaseConnection;
        await connection.repository('nrSnapshots').createOne({
          values: {
            id: `${taskId}00`,
            key: `lifecycle-receipt:${taskId}`,
            payload: { taskId },
          },
        });
      },
      execute,
    }),
  });
  onTestFinished(async () => {
    await lifecycles.shutdown();
    await executors.shutdown();
    await rm(storagePath, { recursive: true, force: true });
  });
  return { ...lifecycles, logger };
}

async function createTask(
  runtime: Awaited<ReturnType<typeof worker>>['runtime'],
) {
  return runtime.create(
    lifecycleName,
    {
      id: '1',
      projectId: '1',
      taskKey: 'lifecycle-test:1',
      title: 'Runtime integration fixture',
      status: 'todo',
      executionEngine: 'lifecycle-v1',
      evidence: { preserved: true },
    },
    { actor: SYSTEM_ACTOR },
  );
}

it('dispatches effects only after the outer legacy transaction commits, and replays a request without repeating them', async () => {
  const f = await databaseFixture();
  const effect = vi.fn(async () => {
    const receipt = await f.database
      .repository('nrSnapshots')
      .findOne({ filter: { key: 'lifecycle-receipt:1' } });
    expect(receipt?.payload).toEqual({ taskId: '1' });
    return { delivered: true };
  });
  const w = await worker(f.database, effect);
  await w.start();
  await createTask(w.runtime);
  await f.legacy.sequelize.transaction(async (transaction) => {
    const first = await w.runtime.fire(lifecycleName, '1', 'begin', {
      actor: SYSTEM_ACTOR,
      requestId: 'begin:1',
      transaction: transaction.connection,
    });
    expect(first.record.executionState).toBe('running');
    expect(effect).not.toHaveBeenCalled();
    // The native savepoint must remain attached to this transaction rather
    // than committing independently while the legacy caller is still active.
    expect(
      await f.legacy.getRepository('nrSnapshots').count({
        filter: { key: 'lifecycle-receipt:1' },
      }),
    ).toBe(1);
  });
  await vi.waitFor(async () => {
    const view = await w.runtime.view(lifecycleName, '1', SYSTEM_ACTOR);
    expect(view.record.executionState).toBe('completed');
  });
  const replay = await w.runtime.fire(lifecycleName, '1', 'begin', {
    actor: SYSTEM_ACTOR,
    requestId: 'begin:1',
  });
  expect(replay.replayed).toBe(true);
  expect(effect).toHaveBeenCalledTimes(1);
  const runs = await w.runtime.listEffectRuns({ lifecycle: lifecycleName });
  expect(runs).toMatchObject([
    { status: 'succeeded', attempts: 1, stayBound: true },
  ]);
  expect(w.logger.error).not.toHaveBeenCalled();
});

it('rolls back the native transition, related writes and outbox with an outer legacy failure', async () => {
  const f = await databaseFixture();
  const effect = vi.fn(async () => ({ delivered: true }));
  const w = await worker(f.database, effect);
  await w.start();
  await createTask(w.runtime);
  await expect(
    f.legacy.sequelize.transaction(async (transaction) => {
      await w.runtime.fire(lifecycleName, '1', 'begin', {
        actor: SYSTEM_ACTOR,
        requestId: 'rolled-back',
        transaction: transaction.connection,
      });
      expect(effect).not.toHaveBeenCalled();
      throw new Error('Outer business write failed');
    }),
  ).rejects.toThrow('Outer business write failed');
  await w.runtime.recover();
  const task = await f.database
    .repository('nrTasks')
    .findOne({ filter: { id: '1' } });
  expect(task).toMatchObject({ executionState: 'idle', lifecycleVersion: 1 });
  expect(await f.database.repository('nrSnapshots').count()).toBe(0);
  expect(
    await f.database
      .repository(NOCOREACH_LIFECYCLE_COLLECTIONS.transitions)
      .count(),
  ).toBe(1);
  expect(await w.runtime.listEffectRuns()).toEqual([]);
  expect(effect).not.toHaveBeenCalled();
});

it('recovers a committed outbox through a fresh worker with no shared memory queue snapshot', async () => {
  const f = await databaseFixture();
  const effect = vi.fn(async () => ({ delivered: true }));
  const beforeRestart = await worker(f.database, effect);
  await createTask(beforeRestart.runtime);
  await beforeRestart.runtime.fire(lifecycleName, '1', 'begin', {
    actor: SYSTEM_ACTOR,
    requestId: 'lost-dispatch',
  });
  expect(effect).not.toHaveBeenCalled();
  expect(await beforeRestart.runtime.listEffectRuns()).toMatchObject([
    { status: 'queued', attempts: 0 },
  ]);
  // The first dispatcher never started. Only the database, not a queue file,
  // can tell the new worker about the committed work.
  await beforeRestart.shutdown();
  const restarted = await worker(f.database, effect);
  await restarted.start();
  await vi.waitFor(async () => {
    const view = await restarted.runtime.view(lifecycleName, '1', SYSTEM_ACTOR);
    expect(view.record.executionState).toBe('completed');
  });
  await restarted.runtime.recover();
  expect(effect).toHaveBeenCalledTimes(1);
  expect(await restarted.runtime.listEffectRuns()).toMatchObject([
    { status: 'succeeded', attempts: 1 },
  ]);
  expect(restarted.logger.error).not.toHaveBeenCalled();
});
