// @vitest-environment node
import { fileURLToPath } from 'node:url';
import {
  createTestDatabase,
  describeMigration,
} from '@nocobase/app-testing/server';
import { expect, it, onTestFinished } from 'vitest';

const migrations = [
  {
    packageName: 'nocoreach',
    directory: fileURLToPath(
      new URL('../../database/main/migrations', import.meta.url),
    ),
  },
];
const newCollections = [
  'nrLifecycleTransitions',
  'nrLifecycleEffectRuns',
  'nrAnalysisRuns',
  'nrAnalysisOccurrences',
  'nrTaskRuns',
  'nrTaskObservations',
];
const oldEvidence = {
  work: { stage: 'running', revision: 7, flow: { stageIndex: 2 } },
  results: [{ id: 'legacy-result', approved: true }],
};
const oldRun = {
  id: 'legacy-run',
  status: 'running',
  requestFingerprint: 'kept',
};

describeMigration('202610120002_create_nocoreach_lifecycles', {
  sources: migrations,
  before: async ({ connection }) => {
    await connection.repository('nrTasks').createOne({
      values: {
        id: '1',
        projectId: '1',
        taskKey: 'legacy-task',
        title: 'Existing task',
        status: 'doing',
        evidence: oldEvidence,
      },
    });
    await connection.repository('nrSnapshots').createOne({
      values: { id: '1', key: 'task-run:legacy-run', payload: oldRun },
    });
  },
  up: async ({ connection, expectCollection }) => {
    for (const name of newCollections) await expectCollection(name).toExist();
    for (const field of [
      'executionState',
      'executionStateChangedAt',
      'executionEngine',
      'activeRunId',
      'nextCheckAt',
    ])
      await expectCollection('nrTasks').toHaveField(field, { nullable: true });
    await expectCollection('nrTasks').toHaveField('lifecycleVersion', {
      nullable: false,
    });
    await expectCollection('nrLifecycleTransitions').toHaveIndex(
      ['lifecycle', 'recordId', 'version'],
      { unique: true },
    );
    await expectCollection('nrLifecycleTransitions').toHaveIndex(
      ['lifecycle', 'recordId', 'requestKey'],
      { unique: true },
    );
    await expectCollection('nrLifecycleEffectRuns').toHaveField('stayBound', {
      nullable: false,
    });
    for (const field of [
      'claimedAt',
      'runAfter',
      'continuation',
      'continuationDueAt',
      'continuationAbandonedAt',
    ])
      await expectCollection('nrLifecycleEffectRuns').toHaveField(field, {
        nullable: true,
      });
    await expectCollection('nrLifecycleEffectRuns').toHaveIndex([
      'continuationDueAt',
    ]);
    await expectCollection('nrLifecycleEffectRuns').toHaveIndex([
      'continuationAbandonedAt',
    ]);
    await expectCollection('nrAnalysisRuns').toHaveIndex(['runKey'], {
      unique: true,
    });
    await expectCollection('nrAnalysisRuns').toHaveIndex(['activeKey'], {
      unique: true,
    });
    await expectCollection('nrTaskRuns').toHaveIndex(['nextSyncAt', 'id']);
    await expectCollection('nrTaskObservations').toHaveIndex(
      ['taskId', 'day'],
      {
        unique: true,
      },
    );
    await expectCollection('nrTaskObservations').toHaveIndex([
      'status',
      'dueAt',
      'id',
    ]);
    const task = await connection
      .repository('nrTasks')
      .findOne({ filter: { id: '1' } });
    expect(task).toMatchObject({
      status: 'doing',
      evidence: oldEvidence,
      executionEngine: null,
      executionState: null,
      executionStateChangedAt: null,
      activeRunId: null,
      nextCheckAt: null,
      lifecycleVersion: 0,
    });
    const snapshot = await connection
      .repository('nrSnapshots')
      .findOne({ filter: { id: '1' } });
    expect(snapshot?.payload).toEqual(oldRun);
    for (const name of newCollections)
      expect(await connection.repository(name).count()).toBe(0);
  },
  down: async ({ connection, expectCollection }) => {
    for (const name of newCollections)
      await expectCollection(name).not.toExist();
    await expectCollection('nrTasks').not.toHaveField('executionEngine');
    await expectCollection('nrTasks').not.toHaveField('lifecycleVersion');
    const task = await connection
      .repository('nrTasks')
      .findOne({ filter: { id: '1' } });
    expect(task).toMatchObject({ status: 'doing', evidence: oldEvidence });
    expect(
      (
        await connection
          .repository('nrSnapshots')
          .findOne({ filter: { id: '1' } })
      )?.payload,
    ).toEqual(oldRun);
  },
});

it('enforces daily occurrence, active project and observation uniqueness in the database', async () => {
  const f = await createTestDatabase({ migrations });
  onTestFinished(() => f.destroy());
  const now = new Date('2026-10-12T10:00:00.000Z');
  const values = {
    runKey: 'daily:1:2026-10-12',
    activeKey: 'project:1',
    projectId: '1',
    trigger: 'schedule',
    day: '2026-10-12',
    status: 'queued',
    statusChangedAt: now,
    requestedAt: now,
  };
  const runs = f.database.repository('nrAnalysisRuns');
  const first = await runs.createOne({ values });
  await expect(
    runs.createOne({ values: { ...values, activeKey: 'run:duplicate-day' } }),
  ).rejects.toThrow();
  await expect(
    runs.createOne({ values: { ...values, runKey: 'manual:concurrent' } }),
  ).rejects.toThrow();
  expect(await runs.count()).toBe(1);
  const occurrences = f.database.repository('nrAnalysisOccurrences');
  const occurrence = {
    id: 'schedule-occurrence-1',
    acceptedAt: now,
    projectRuns: { '1': String(first.record.id) },
  };
  await occurrences.createOne({ values: occurrence });
  await expect(occurrences.createOne({ values: occurrence })).rejects.toThrow();
  const observations = f.database.repository('nrTaskObservations');
  const observation = {
    observationKey: '1:7',
    taskId: '1',
    projectId: '1',
    day: 7,
    observeFrom: now,
    dueAt: new Date('2026-10-19T10:00:00.000Z'),
    status: 'pending',
    statusChangedAt: now,
  };
  await observations.createOne({ values: observation });
  await expect(
    observations.createOne({
      values: { ...observation, observationKey: 'another-key' },
    }),
  ).rejects.toThrow();
  expect(await observations.count()).toBe(1);
});
