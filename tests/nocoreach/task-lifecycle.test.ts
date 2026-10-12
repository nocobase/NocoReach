// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@nocobase/app-testing/server';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import { expect, it, onTestFinished } from 'vitest';
import {
  TaskLifecycle,
  TASK_ENGINE,
  TASK_LIFECYCLE,
  type LifecycleTask,
  type TaskMutation,
  type TaskState,
} from '../../server/nocoreach/execution/lifecycle.js';
import {
  projectWork,
  type Work,
} from '../../server/nocoreach/execution/model.js';
import { NOCOREACH_LIFECYCLE_COLLECTIONS } from '../../server/nocoreach/lifecycle/runtime.js';

const migrations = [
  {
    packageName: 'nocoreach',
    directory: fileURLToPath(
      new URL('../../database/main/migrations', import.meta.url),
    ),
  },
];
const owner = 'owner';
const flow: NonNullable<Work['flow']> = {
  id: 'test-flow',
  name: 'Task lifecycle test',
  version: 1,
  stages: [
    { key: 'change', name: 'Change', kind: 'agent', mode: 'change' },
    { key: 'review', name: 'Review', kind: 'review' },
    { key: 'release', name: 'Release', kind: 'release' },
    { key: 'observe', name: 'Observe', kind: 'observe' },
  ],
};
function work(values: Partial<Work> = {}): Work {
  return { ...projectWork({}), humanOwnerId: owner, ...values };
}
function inFlow(values: Partial<Work> = {}): Work {
  return work({ stage: 'flow', stageIndex: 0, flow, ...values });
}

async function fixture() {
  const testDb = await createTestDatabase({ migrations });
  onTestFinished(() => testDb.destroy());
  const runtime = new LifecycleRuntime({
    store: createRepositoryLifecycleStore(testDb.database, {
      collections: NOCOREACH_LIFECYCLE_COLLECTIONS,
    }),
  });
  const lifecycle = new TaskLifecycle(runtime);
  async function create(
    id: string,
    before = work(),
    state: TaskState | null = null,
    engine: string | null = state ? TASK_ENGINE : null,
  ) {
    const result = await testDb.database
      .repository<LifecycleTask>('nrTasks')
      .createOne({
        values: {
          id,
          projectId: '1',
          taskKey: `task:${id}`,
          evidence: { source: 'preserved', work: before },
          executionState: state,
          executionEngine: engine,
          executionStateChangedAt: state
            ? new Date('2026-10-12T00:00:00.000Z')
            : null,
          lifecycleVersion: 0,
        },
      });
    return result.record;
  }
  async function read(id: string) {
    const task = await testDb.database
      .repository<LifecycleTask>('nrTasks')
      .findOne({ filter: { id } });
    if (!task) throw new Error('Missing test task');
    return task;
  }
  async function commit(id: string, next: Work, mutation?: TaskMutation) {
    await testDb.database.transaction(async (connection) => {
      const task = await connection
        .repository<LifecycleTask>('nrTasks')
        .findOne({ filter: { id } });
      if (!task) throw new Error('Missing test task');
      await lifecycle.apply(task, next, connection, mutation);
      await connection.repository<LifecycleTask>('nrTasks').updateOne({
        filter: { id },
        values: { evidence: { ...task.evidence, work: next } },
      });
    });
    return read(id);
  }
  return { ...testDb, runtime, lifecycle, create, read, commit };
}

it('adopts an old idle task only with an explicit start and preserves an exact bigint identifier', async () => {
  const f = await fixture();
  const id = '9007199254740993';
  await f.create(id);
  const before = await f.read(id);
  expect(before.executionEngine).toBeNull();
  const next = inFlow({ latestRun: { id: 'run-1', status: 'queued' } });
  await f.database.transaction(async (connection) => {
    const task = await connection
      .repository<LifecycleTask>('nrTasks')
      .findOne({ filter: { id } });
    if (!task) throw new Error('Missing test task');
    await f.lifecycle.adopt(task, connection);
    await f.lifecycle.apply(task, next, connection, {
      command: 'startTask',
      actor: owner,
      requestId: 'explicit-start',
    });
    await connection.repository<LifecycleTask>('nrTasks').updateOne({
      filter: { id },
      values: { evidence: { ...task.evidence, work: next } },
    });
  });
  expect(await f.read(id)).toMatchObject({
    id,
    executionEngine: TASK_ENGINE,
    executionState: 'queued',
    lifecycleVersion: 1,
  });
  expect(await f.database.repository('nrLifecycleTransitions').count()).toBe(1);
});

it('leaves an already started legacy flow and its history outside native execution', async () => {
  const f = await fixture();
  const oldWork = inFlow({ latestRun: { id: 'old-run', status: 'running' } });
  await f.create('1', oldWork);
  const before = await f.read('1');
  await f.database.transaction(async (connection) => {
    const task = await connection
      .repository<LifecycleTask>('nrTasks')
      .findOne({ filter: { id: '1' } });
    if (!task) throw new Error('Missing test task');
    await f.lifecycle.adopt(task, connection);
  });
  expect(await f.read('1')).toMatchObject({
    executionEngine: null,
    executionState: null,
    lifecycleVersion: 0,
    evidence: before.evidence,
  });
  expect(await f.database.repository('nrLifecycleTransitions').count()).toBe(0);
  expect(await f.database.repository('nrLifecycleEffectRuns').count()).toBe(0);
});

it('cannot reset a task already adopted by another transaction using a stale legacy object', async () => {
  const f = await fixture();
  await f.create('1');
  const stale = await f.read('1');
  await f.database.transaction(async (connection) => {
    const task = await connection
      .repository<LifecycleTask>('nrTasks')
      .findOne({ filter: { id: '1' } });
    if (!task) throw new Error('Missing test task');
    await f.lifecycle.adopt(task, connection);
  });
  await f.commit(
    '1',
    inFlow({ latestRun: { id: 'run-1', status: 'queued' } }),
    {
      command: 'startTask',
      actor: owner,
    },
  );
  await expect(
    f.database.transaction((connection) =>
      f.lifecycle.adopt(stale, connection),
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(await f.read('1')).toMatchObject({
    executionState: 'queued',
    lifecycleVersion: 1,
  });
});

it('enforces declared transitions and rolls back prepared business writes when the native source state refuses them', async () => {
  const f = await fixture();
  await f.create('1', work(), 'idle');
  await expect(
    f.database.transaction(async (connection) => {
      const task = await connection
        .repository<LifecycleTask>('nrTasks')
        .findOne({ filter: { id: '1' } });
      if (!task) throw new Error('Missing test task');
      await connection.repository('nrSnapshots').createOne({
        values: {
          id: '1',
          key: 'prepared-review',
          payload: { accepted: true },
        },
      });
      await f.lifecycle.apply(task, inFlow({ stageIndex: 1 }), connection, {
        command: 'approveStage',
        actor: owner,
      });
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(await f.database.repository('nrSnapshots').count()).toBe(0);
  expect(await f.database.repository('nrLifecycleTransitions').count()).toBe(0);
  expect(await f.read('1')).toMatchObject({
    executionState: 'idle',
    lifecycleVersion: 0,
  });
  await f.commit(
    '1',
    inFlow({ latestRun: { id: 'run-1', status: 'queued' } }),
    {
      command: 'startTask',
      actor: owner,
    },
  );
  await f.commit(
    '1',
    inFlow({ latestRun: { id: 'run-1', status: 'running' } }),
    {
      command: 'runStarted',
      actor: 'system',
      system: true,
    },
  );
  const reviewed = await f.commit('1', inFlow({ stageIndex: 1 }), {
    command: 'runSucceeded',
    actor: 'system',
    system: true,
  });
  expect(reviewed).toMatchObject({
    executionState: 'review',
    lifecycleVersion: 3,
  });
});

it('does not re-enter execution for metadata updates or a completed task moved back on the board', async () => {
  const f = await fixture();
  const before = inFlow({ stageIndex: 1 });
  await f.create('1', before, 'review');
  const initial = await f.read('1');
  const edited = await f.commit(
    '1',
    {
      ...before,
      note: 'Updated note',
      revision: 1,
      history: [{ action: 'comment', actor: owner, comment: 'Review later' }],
    },
    { command: 'comment', actor: owner },
  );
  expect(edited.executionState).toBe('review');
  expect(edited.lifecycleVersion).toBe(initial.lifecycleVersion);
  expect(edited.executionStateChangedAt).toEqual(
    initial.executionStateChangedAt,
  );
  const finished = inFlow({
    stageIndex: 3,
    observeFrom: '2026-10-12T01:00:00.000Z',
    boardState: 'done',
  });
  await f.create('2', finished, 'completed');
  const reopened = await f.commit(
    '2',
    { ...finished, boardState: 'doing', revision: 1 },
    {
      command: 'moveWork',
      actor: owner,
    },
  );
  expect(reopened).toMatchObject({
    executionState: 'completed',
    lifecycleVersion: 0,
  });
  expect(await f.database.repository('nrLifecycleTransitions').count()).toBe(0);
});

it('supports manual merge acknowledgement, longer verification and live confirmation at their real source states', async () => {
  const f = await fixture();
  const release = {
    state: 'merge_failed' as const,
    note: 'Release',
    pages: ['https://example.com/'],
  };
  await f.create('1', inFlow({ stageIndex: 2, release }), 'release');
  const verifying = inFlow({
    stageIndex: 2,
    release: { ...release, state: 'verifying' },
  });
  expect(
    await f.commit('1', verifying, { command: 'markMerged', actor: owner }),
  ).toMatchObject({
    executionState: 'verifying',
    lifecycleVersion: 1,
  });
  const waiting = inFlow({
    stageIndex: 2,
    release: { ...release, state: 'not_seen' },
  });
  await f.commit('1', waiting, {
    command: 'notSeen',
    actor: 'system',
    system: true,
  });
  expect(
    await f.commit('1', verifying, { command: 'waitLonger', actor: owner }),
  ).toMatchObject({
    executionState: 'verifying',
    lifecycleVersion: 3,
  });
  expect(
    await f.commit(
      '1',
      inFlow({ stageIndex: 3, observeFrom: '2026-10-12T01:00:00.000Z' }),
      {
        command: 'confirmLive',
        actor: owner,
      },
    ),
  ).toMatchObject({ executionState: 'completed', lifecycleVersion: 4 });
});

it('reports invalid transition input as a lifecycle validation error and enforces project/system boundaries', async () => {
  const f = await fixture();
  await f.create('1', work(), 'idle');
  await expect(
    f.runtime.fire(TASK_LIFECYCLE, '1', 'start', {
      actor: { id: owner },
      input: { projectId: '1', nextState: 'unknown' },
    }),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  await expect(
    f.runtime.fire(TASK_LIFECYCLE, '1', 'start', {
      actor: { id: owner },
      input: { projectId: '2', nextState: 'queued' },
    }),
  ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
  await f.commit(
    '1',
    inFlow({ latestRun: { id: 'run-1', status: 'queued' } }),
    {
      command: 'startTask',
      actor: owner,
    },
  );
  await expect(
    f.runtime.fire(TASK_LIFECYCLE, '1', 'claim', {
      actor: { id: owner },
      input: { projectId: '1', nextState: 'running' },
    }),
  ).rejects.toMatchObject({ code: 'GUARD_REJECTED' });
});
