// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@nocobase/app-testing/server';
import { expect, it, onTestFinished } from 'vitest';
import { TASK_ENGINE } from '../../server/nocoreach/execution/lifecycle.js';
import type { Run } from '../../server/nocoreach/execution/model.js';
import { TaskRunStore } from '../../server/nocoreach/execution/run-store.js';

const migrations = [
  {
    packageName: 'nocoreach',
    directory: fileURLToPath(
      new URL('../../database/main/migrations', import.meta.url),
    ),
  },
];
function run(id: string, values: Partial<Run> = {}): Run {
  return {
    id,
    projectId: '1',
    taskId: '1',
    planVersion: 0,
    stepId: 'research',
    baseArtifactId: null,
    ownerId: 'owner',
    actor: 'owner',
    executorId: 'runner-agent',
    executorKind: 'runner',
    inputVersion: 1,
    capabilitySnapshot: ['repo.read'],
    pluginRunId: `official-${id}`,
    status: 'queued',
    createdAt: '2026-10-12T00:00:00.000Z',
    input: '{"immutable":"source"}',
    model: { llmService: 'local', model: 'configured-agent' },
    ...values,
  };
}
async function fixture() {
  const testDb = await createTestDatabase({ migrations });
  onTestFinished(() => testDb.destroy());
  const store = new TaskRunStore(testDb.database);
  async function createTask(id = '1', projectId = '1', native = false) {
    await testDb.database.repository('nrTasks').createOne({
      values: {
        id,
        projectId,
        taskKey: `task:${id}`,
        executionEngine: native ? TASK_ENGINE : null,
        executionState: native ? 'idle' : null,
        lifecycleVersion: 0,
      },
    });
  }
  async function put(value: Run) {
    await testDb.database.transaction((connection) =>
      store.put(value, connection),
    );
  }
  async function archive(id: string, value: Run) {
    await testDb.database.repository('nrSnapshots').createOne({
      values: {
        id,
        key: `nr-task-run:${value.projectId}:${value.taskId}:${value.id}`,
        payload: value,
      },
    });
  }
  return { ...testDb, store, createTask, put, archive };
}

it('scopes reads and writes to the owning project and task, including bigint task identifiers', async () => {
  const f = await fixture();
  const bigId = '9007199254740993';
  await f.createTask(bigId, '1', true);
  await f.createTask('2', '2');
  const own = run('owned-run', { taskId: bigId });
  await f.put(own);
  expect(await f.store.get('1', bigId, own.id)).toEqual(own);
  expect(await f.store.get('2', bigId, own.id)).toBeUndefined();
  expect(await f.store.get('1', '2', own.id)).toBeUndefined();
  expect(await f.store.list('2', bigId)).toEqual([]);
  expect(
    await f.database
      .repository('nrTaskRuns')
      .findOne({ filter: { id: own.id } }),
  ).toMatchObject({ engine: TASK_ENGINE, taskId: bigId });
  await expect(
    f.put(run('wrong-project', { taskId: bigId, projectId: '2' })),
  ).rejects.toThrow();
  await expect(f.put(run('missing-task', { taskId: '99' }))).rejects.toThrow();
  await expect(
    f.put({ ...own, taskId: '2', projectId: '2' }),
  ).rejects.toThrow();
  expect(await f.database.repository('nrTaskRuns').count()).toBe(1);
});

it('backfills by exact bigint cursor without overwriting native results or resubmitting archived work', async () => {
  const f = await fixture();
  await f.createTask();
  const old = run('already-native', {
    status: 'running',
    runtimeRunId: 'original-runtime',
  });
  const latest = {
    ...old,
    status: 'succeeded' as const,
    pluginSettled: true,
    artifactId: 'reviewed-output',
  };
  await f.put(latest);
  await f.archive('9007199254740993', old);
  const pending = run('legacy-pending', {
    status: 'running',
    runtimeRunId: 'keep-runtime',
    startedAt: '2026-10-12T01:00:00.000Z',
    expiresAt: '2026-10-12T01:05:00.000Z',
  });
  await f.archive('9007199254740994', pending);
  const first = await f.store.backfillPage(0, 1);
  expect(first.cursor).toBe('9007199254740993');
  const second = await f.store.backfillPage(first.cursor, 1);
  expect(second.cursor).toBe('9007199254740994');
  expect(await f.store.backfillPage(second.cursor, 1)).toMatchObject({
    done: true,
  });
  expect(await f.store.get('1', '1', old.id)).toEqual(latest);
  expect(await f.store.get('1', '1', pending.id)).toEqual(pending);
  const due = await f.store.due(50, new Date(Date.now() + 1_000));
  expect(due.map((r) => r.id)).toEqual([pending.id]);
  expect(due[0]).toMatchObject({
    status: 'running',
    pluginRunId: 'official-legacy-pending',
    runtimeRunId: 'keep-runtime',
  });
  expect(await f.database.repository('nrSnapshots').count()).toBe(2);
  expect(await f.database.repository('nrLifecycleEffectRuns').count()).toBe(0);
  expect(await f.database.repository('nrLifecycleTransitions').count()).toBe(0);
});

it('keeps orphan archives intact and out of the reconciliation queue while reporting them', async () => {
  const f = await fixture();
  await f.createTask();
  const orphan = run('orphan', { taskId: '404' });
  await f.archive('1', orphan);
  await f.archive('2', run('valid'));
  const page = await f.store.backfillPage(0, 100);
  expect(page).toMatchObject({ cursor: '2', done: true, skipped: 1 });
  expect(await f.store.get('1', '404', orphan.id)).toBeUndefined();
  expect(await f.store.get('1', '1', 'valid')).toBeDefined();
  expect(await f.database.repository('nrSnapshots').count()).toBe(2);
});

it('lets later due rows advance after a failed poll and never revives a settled run from a stale poll', async () => {
  const f = await fixture();
  await f.createTask();
  const values = [run('a'), run('b'), run('c')];
  for (const value of values) await f.put(value);
  const dueAt = new Date(Date.now() - 60_000);
  await f.database.repository('nrTaskRuns').updateMany({
    filter: (filter) => filter.string('projectId').eq('1'),
    values: { nextSyncAt: dueAt },
  });
  expect((await f.store.due(1)).map((r) => r.id)).toEqual(['a']);
  // This reservation remains even when the external inspection throws.
  await f.store.defer('a', 60_000);
  expect((await f.store.due(1)).map((r) => r.id)).toEqual(['b']);
  await f.store.defer('b', 60_000);
  expect((await f.store.due(1)).map((r) => r.id)).toEqual(['c']);
  await f.put({ ...values[2], status: 'succeeded', pluginSettled: true });
  // A poll selected c before its terminal update committed.
  await f.store.defer('c', 60_000);
  const settled = await f.database
    .repository('nrTaskRuns')
    .findOne({ filter: { id: 'c' } });
  expect(settled?.nextSyncAt).toBeNull();
  expect(
    (await f.store.due(50, new Date(Date.now() + 120_000))).map((r) => r.id),
  ).toEqual(['a', 'b']);
});
