// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@nocobase/app-testing/server';
import { createSecretsService } from '@nocobase/app-server/secrets';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, it, onTestFinished, vi } from 'vitest';

import {
  AnalysisRuntime,
  type AnalysisExecution,
} from '../../server/nocoreach/analysis-runtime.js';
import {
  registerClassicImport,
  TARGET_TABLES,
} from '../../server/nocoreach/classic-import.js';
import {
  createTaskRuntime,
  TASK_RUNTIME_BACKFILL_CHECKPOINT,
} from '../../server/nocoreach/execution/runtime.js';
import { TaskService } from '../../server/nocoreach/execution/service.js';
import type { Run } from '../../server/nocoreach/execution/model.js';
import { LegacyApp } from '../../server/nocoreach/legacy/app.js';
import {
  LegacyCache,
  legacyContext,
} from '../../server/nocoreach/legacy/context.js';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { LegacyVariables } from '../../server/nocoreach/legacy/variables.js';
import { NOCOREACH_LIFECYCLE_COLLECTIONS } from '../../server/nocoreach/lifecycle/runtime.js';
import { assertMockDatasetMode } from '../../server/nocoreach/mock-isolation.js';

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
  const database = testDb.database;
  const db = new LegacyDatabase(
    database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
  const variables = new LegacyVariables(db, createSecretsService({}));
  const legacy = new LegacyApp(db, logger, variables);
  const lifecycle = new LifecycleRuntime({
    store: createRepositoryLifecycleStore(database, {
      collections: NOCOREACH_LIFECYCLE_COLLECTIONS,
    }),
    dispatcher: { dispatch: async () => {} },
    logger,
  });
  const tasks = createTaskRuntime({
    database,
    lifecycle,
    legacy: db,
    variables,
    service: () => service,
    logger,
  });
  const service = new TaskService({
    db,
    taskLifecycle: tasks.lifecycle,
    taskRunStore: tasks.runs,
    taskObservations: tasks.observations,
  });
  const model = vi.fn(
    async (_id: string, trigger: string, execution: AnalysisExecution) => {
      await execution.beforeModel?.();
      return { at: new Date().toISOString(), trigger, ok: true, ms: 0 };
    },
  );
  const analysis = new AnalysisRuntime({
    database,
    lifecycle,
    appName: 'classic-import-test',
    host: () => ({
      db,
      projectIds: async () => ['1'],
      analysis: { run: model },
    }),
    ready: Promise.resolve(),
    logger,
  });
  registerClassicImport({
    legacy,
    variables,
    users: { find: async () => [] },
    tasks,
  });
  const call = async (action: string, values: Record<string, unknown> = {}) => {
    const ctx = legacyContext({
      resource: 'nrImport',
      action,
      method: 'POST',
      query: {},
      body: values,
      header: () => undefined,
      cookie: () => undefined,
      user: { id: 'root', name: 'Root' },
      roles: ['root'],
      app: legacy,
      cache: new LegacyCache(),
      logger,
    });
    await legacy.resources.action('nrImport', action)!(ctx, async () => {});
    return ctx.body as { tables: Record<string, number> };
  };
  return { database, db, variables, lifecycle, tasks, analysis, model, call };
}

const work = (runId: string, status: string) => ({
  schemaVersion: 2,
  revision: 0,
  stage: 'work',
  plan: null,
  planVersion: 1,
  step: 0,
  results: [],
  history: [{ action: 'approved', actor: 'classic-root' }],
  operations: [],
  receipt: null,
  verification: null,
  latestRun: { id: runId, status },
});
const run = (
  id: string,
  taskId: string,
  status: Run['status'] = 'running',
): Run => ({
  id,
  taskId,
  projectId: '1',
  status,
  executorKind: 'online',
  executorId: 'atlas',
  actor: 'classic-root',
  ownerId: 'classic-root',
  planVersion: 1,
  stepId: 'step',
  baseArtifactId: null,
  inputVersion: 1,
  capabilitySnapshot: ['context.read', 'text.generate'],
  model: { llmService: 'source', model: 'source-model' },
  createdAt: '2026-10-01T00:00:00.000Z',
  input: 'Source input',
});

it('treats the fresh backfill cursor as metadata and indexes imported runs immediately without replaying foreign work', async () => {
  const f = await fixture();
  await f.tasks.initialize();
  expect(
    await f.tasks.runs.readCheckpoint(TASK_RUNTIME_BACKFILL_CHECKPOINT),
  ).toEqual(expect.any(String));
  expect(
    Object.values((await f.call('plan')).tables).every((count) => count === 0),
  ).toBe(true);
  await f.call('begin');
  expect(
    await f.tasks.runs.readCheckpoint(TASK_RUNTIME_BACKFILL_CHECKPOINT),
  ).toBeUndefined();
  const artifact = {
    id: 'approved-artifact',
    content: 'Approved text',
    approvedBy: 'classic-root',
    approvedAt: '2026-10-02T00:00:00.000Z',
  };
  await f.call('rows', {
    table: 'nrTasks',
    users: { 'classic-root': 'root' },
    rows: [
      {
        id: '10',
        taskKey: '1:10',
        title: 'Queued source task',
        projectId: '1',
        evidence: { work: work('queued-source', 'queued') },
      },
      {
        id: '11',
        taskKey: '1:11',
        title: 'Unknown source merge',
        projectId: '1',
        evidence: {
          work: {
            ...work('runner-source', 'running'),
            release: {
              state: 'merging',
              pr: { number: 1 },
              note: 'Approved merge',
              pages: [],
            },
            prClose: { number: 2, state: 'closing' },
            revert: { of: 3, state: 'opening' },
          },
        },
      },
      {
        id: '12',
        taskKey: '1:12',
        title: 'Completed source task',
        projectId: '1',
        evidence: {
          work: {
            ...work('completed-source', 'succeeded'),
            results: [artifact],
          },
        },
      },
    ],
  });
  await f.call('rows', {
    table: 'nrSnapshots',
    users: { 'classic-root': 'root' },
    rows: [
      {
        id: '20',
        key: 'nr-task-run:1:10:queued-source',
        payload: run('queued-source', '10', 'queued'),
      },
      {
        id: '21',
        key: 'nr-task-run:1:11:runner-source',
        payload: {
          ...run('runner-source', '11'),
          executorKind: 'runner',
          pluginRunId: 'foreign-agent-run',
          runtimeRunId: 'foreign-runtime-run',
          mode: 'merge',
        },
      },
      {
        id: '22',
        key: 'nr-task-run:1:12:completed-source',
        payload: {
          ...run('completed-source', '12', 'succeeded'),
          executorKind: 'runner',
          pluginRunId: 'completed-foreign-run',
          artifactId: 'approved-artifact',
        },
      },
      {
        id: '23',
        key: 'daily-analysis:1',
        payload: {
          runningSince: new Date().toISOString(),
          retry: { attempt: 1, nextAt: new Date().toISOString() },
          runs: [
            {
              at: '2026-10-01T00:00:00.000Z',
              ok: true,
              trigger: 'workflow',
              ms: 1,
            },
          ],
        },
      },
    ],
  });
  await f.call('finish');
  expect(await f.database.repository('nrTaskRuns').count()).toBe(3);
  expect(await f.tasks.runs.due()).toEqual([]);
  expect(await f.tasks.runs.get('1', '10', 'queued-source')).toMatchObject({
    status: 'failed',
    error: 'imported_runtime_unavailable',
    errorDetail: 'classicImport.foreignExecutionStopped',
    actor: 'root',
  });
  const runner = await f.tasks.runs.get('1', '11', 'runner-source');
  expect(runner).toMatchObject({
    status: 'failed',
    pluginSettled: true,
    importedExecution: {
      status: 'running',
      pluginRunId: 'foreign-agent-run',
      runtimeRunId: 'foreign-runtime-run',
    },
  });
  expect(runner?.pluginRunId).toBeUndefined();
  expect(runner?.runtimeRunId).toBeUndefined();
  expect(await f.tasks.runs.get('1', '12', 'completed-source')).toMatchObject({
    status: 'succeeded',
    artifactId: 'approved-artifact',
    pluginSettled: true,
  });
  const merged = await f.db
    .getRepository('nrTasks')
    .findOne({ filterByTk: '11' });
  expect(merged).toMatchObject({
    activeRunId: null,
    nextCheckAt: null,
    evidence: {
      work: {
        latestRun: { status: 'failed' },
        release: { state: 'merge_failed' },
        prClose: { state: 'failed' },
        revert: { state: 'failed' },
      },
    },
  });
  const complete = await f.db
    .getRepository('nrTasks')
    .findOne({ filterByTk: '12' });
  expect(complete?.evidence).toMatchObject({
    work: {
      results: [{ ...artifact, approvedBy: 'root' }],
      history: [{ action: 'approved', actor: 'root' }],
    },
  });
  const imported = await f.analysis.enqueue('1', 'schedule');
  expect(imported).toMatchObject({ status: 'failed', retryAt: null });
  expect(imported.result?.entry?.error).toBe(
    'classicImport.foreignExecutionStopped',
  );
  for (const effect of await f.lifecycle.listEffectRuns({ status: 'queued' }))
    await f.lifecycle.runEffect(effect.id);
  await f.analysis.sweep();
  expect(f.model).not.toHaveBeenCalled();
  await f.call('finish');
  expect(await f.database.repository('nrTaskRuns').count()).toBe(3);
  expect(await f.tasks.runs.due()).toEqual([]);
});

it('replaces durable execution atomically, retains delivery receipts, and fences previously queued effects', async () => {
  const f = await fixture();
  await f.analysis.acceptOccurrence('delivery-before-import');
  const previousRun = (
    await f.database.repository('nrAnalysisRuns').findMany()
  )[0]!;
  const oldEffect = (
    await f.lifecycle.listEffectRuns({ status: 'queued' })
  )[0]!;
  await f.db.getRepository('nrTasks').create({
    values: {
      id: '10',
      taskKey: 'old',
      projectId: '1',
      title: 'Before replacement',
      evidence: { work: work('old-run', 'running') },
    },
  });
  await f.database.transaction((connection) =>
    f.tasks.runs.put(run('old-run', '10'), connection),
  );
  await f.database.repository('nrTaskObservations').createOne({
    values: {
      observationKey: '10:7',
      taskId: '10',
      projectId: '1',
      day: 7,
      observeFrom: new Date('2026-10-01'),
      dueAt: new Date('2026-10-08'),
      status: 'pending',
      statusChangedAt: new Date(),
      lifecycleVersion: 1,
    },
  });
  await f.variables.set(
    TASK_RUNTIME_BACKFILL_CHECKPOINT,
    '{"runs":"999","runsDone":true,"tasks":"999","tasksDone":true}',
    false,
  );
  for (const [key, payload] of [
    ['daily-analysis:workflow', {}],
    ['daily-analysis:occurrence:old-delivery', { status: 'running' }],
    ['project:1', { name: 'Old project' }],
  ] as const)
    await f.db
      .getRepository('nrSnapshots')
      .create({ values: { key, payload } });
  await expect(f.call('begin')).rejects.toMatchObject({ status: 409 });
  const before = await f.call('plan');
  const transaction = f.db.sequelize.transaction;
  f.db.sequelize.transaction = (fn) =>
    transaction(async (tx) => {
      await fn(tx);
      throw new Error('Injected failure before commit');
    });
  await expect(f.call('begin', { replace: true })).rejects.toThrow(
    'Injected failure',
  );
  f.db.sequelize.transaction = transaction;
  expect(await f.call('plan')).toEqual(before);
  expect(
    await f.tasks.runs.readCheckpoint(TASK_RUNTIME_BACKFILL_CHECKPOINT),
  ).toContain('999');
  await f.call('begin', { replace: true });
  for (const name of TARGET_TABLES.filter((name) => name !== 'nrSnapshots'))
    expect(await f.database.repository(name).count()).toBe(0);
  expect(
    (await f.db.getRepository('nrSnapshots').find())
      .map((row) => row.key)
      .sort(),
  ).toEqual([
    'daily-analysis:occurrence:old-delivery',
    'daily-analysis:workflow',
  ]);
  expect(await f.database.repository('nrAnalysisOccurrences').count()).toBe(1);
  expect(await f.analysis.inspect('delivery-before-import')).toMatchObject({
    state: 'completed',
    completion: { status: 'failed', reason: 'analysis-run-missing' },
  });
  await f.lifecycle.runEffect(oldEffect.id);
  await f.analysis.acceptOccurrence('delivery-before-import');
  await f.analysis.acceptOccurrence('old-delivery');
  expect(await f.database.repository('nrAnalysisRuns').count()).toBe(0);
  expect(f.model).not.toHaveBeenCalled();
  // Delivery history is intentionally not pristine; enabling simulation cannot
  // convert the installation that previously accepted live work into a mock one.
  await expect(assertMockDatasetMode(f.db, true)).rejects.toMatchObject({
    code: 'NR_MOCK_PRISTINE_DATABASE_REQUIRED',
  });
  const next = await f.analysis.enqueue('1', 'manual', 'root');
  expect(BigInt(next.id)).toBeGreaterThan(BigInt(previousRun.id as string));
  const nextEffect = (
    await f.lifecycle.listEffectRuns({ status: 'queued' })
  )[0]!;
  expect(BigInt(nextEffect.id)).toBeGreaterThan(BigInt(oldEffect.id));
  await f.lifecycle.runEffect(oldEffect.id);
  expect(f.model).not.toHaveBeenCalled();
});
