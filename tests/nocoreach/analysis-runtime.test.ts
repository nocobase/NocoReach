// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@nocobase/app-testing/server';
import type { ScheduleTargetType } from '@nocobase/app-plugin-scheduler/server';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, it, onTestFinished, vi } from 'vitest';

import { MockEngine } from '../../app-plugins/nocoreach-mock/server/engine.js';
import { DailyAnalysis } from '../../server/nocoreach/daily-analysis.js';
import {
  ANALYSIS_COLLECTION,
  ANALYSIS_LIFECYCLE,
  ANALYSIS_OCCURRENCES,
  ANALYSIS_SCHEDULE,
  AnalysisRuntime,
  type AnalysisRun,
} from '../../server/nocoreach/analysis-runtime.js';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { NOCOREACH_LIFECYCLE_COLLECTIONS } from '../../server/nocoreach/lifecycle/runtime.js';
import chinese from '../../shared/i18n/zh.json';

vi.setConfig({ testTimeout: 60_000 });
const successful = {
  text: '{"observations":["A documented change"],"insights":[]}',
  model: 'fixture',
};
const unreachable = () =>
  Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' });

async function fixture(projects = ['1']) {
  const testDb = await createTestDatabase({
    migrations: [
      {
        packageName: 'nocoreach',
        directory: fileURLToPath(
          new URL('../../database/main/migrations', import.meta.url),
        ),
      },
      {
        packageName: '@nocobase/app-plugin-scheduler',
        directory: fileURLToPath(
          new URL(
            '../../node_modules/@nocobase/app-plugin-scheduler/dist/database/migrations',
            import.meta.url,
          ),
        ),
      },
    ],
  });
  onTestFinished(() => testDb.destroy());
  const database = testDb.database;
  const legacy = new LegacyDatabase(
    database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const time = { now: new Date(2026, 9, 12, 9, 5) };
  const clock = () => time.now;
  const model = vi.fn(async (..._args: unknown[]) => successful);
  const host = {
    db: legacy,
    mock: undefined as MockEngine | undefined,
    projectIds: async () => projects,
    project: async (id: string) => ({ id, name: `Project ${id}` }),
    strategy: {
      context: async () => ({
        project: { name: 'Project' },
        evidence: { signals: { items: [] } },
      }),
      state: async () => ({ revision: 0, proposals: [] }),
      saveInsights: async (id: string, values: Record<string, unknown>) => {
        await legacy
          .getRepository('nrSnapshots')
          .create({ values: { key: `saved-analysis:${id}`, payload: values } });
        return { insights: { items: [], observations: values.observations } };
      },
    },
    notifications: { analysisFailed: vi.fn(async () => {}) },
    analysis: undefined as unknown as DailyAnalysis,
    analysisRuntime: undefined as unknown as AnalysisRuntime,
  };
  host.analysis = new DailyAnalysis(host, model);
  await database.repository('scheduleDefinitions').createOne({
    values: {
      id: 'daily',
      appName: 'analysis-test',
      key: ANALYSIS_SCHEDULE,
      sourceType: 'code',
      title: 'Daily analysis',
      definitionHash: 'fixture',
      cron: '0 9 * * *',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      enabled: true,
      targetType: 'app.nocoreach.daily-analysis',
      targetConfig: {},
      lifecycleState: 'active',
      createdAt: time.now,
      updatedAt: time.now,
    },
  });
  const reportCompletion = vi.fn(async () => {});
  let target: ScheduleTargetType | undefined;
  const scheduler = {
    defineSchedule: vi.fn(),
    registerTarget: vi.fn((registered: ScheduleTargetType) => {
      target = registered;
      return { reportCompletion };
    }),
  };
  const logger = { warn: vi.fn(), error: vi.fn() };
  const worker = (beforeEffect?: (name: string) => Promise<void>) => {
    const dispatch = vi.fn(async () => {});
    const lifecycle = new LifecycleRuntime({
      store: createRepositoryLifecycleStore(database, {
        collections: NOCOREACH_LIFECYCLE_COLLECTIONS,
      }),
      dispatcher: { dispatch },
      clock,
      leaseMs: 15 * 60_000,
      logger,
      beforeEffect,
    });
    const analysis = new AnalysisRuntime({
      database,
      lifecycle,
      scheduler,
      appName: 'analysis-test',
      host: () => host,
      ready: Promise.resolve(),
      logger,
      clock,
    });
    analysis.registerSchedule();
    host.analysisRuntime = analysis;
    return { lifecycle, analysis, dispatch };
  };
  const initial = worker();
  const drain = async (lifecycle = initial.lifecycle) => {
    for (let round = 0; round < 12; round++) {
      const queued = await lifecycle.listEffectRuns({ status: 'queued' });
      if (!queued.length) return;
      for (const run of queued) await lifecycle.runEffect(run.id);
    }
    throw new Error('Effect queue did not drain');
  };
  const runs = () =>
    database
      .repository<AnalysisRun>(ANALYSIS_COLLECTION)
      .findMany({ sort: (sort) => sort.field('id').asc() });
  const storedResults = () =>
    legacy
      .getRepository('nrSnapshots')
      .count({ filter: { key: { $startsWith: 'saved-analysis:' } } });
  return {
    ...initial,
    database,
    legacy,
    host,
    time,
    model,
    worker,
    drain,
    runs,
    storedResults,
    target: () => target!,
    reportCompletion,
    scheduler,
    logger,
  };
}

it('persists admission and effects before returning, deduplicates concurrent starts, and recovers with a new worker', async () => {
  const f = await fixture();
  const [one, two] = await Promise.all([
    f.analysis.enqueue('1', 'manual', 'member-1'),
    f.analysis.enqueue('1', 'manual', 'member-1'),
  ]);
  expect(String(one.id)).toBe(String(two.id));
  expect(f.model).not.toHaveBeenCalled();
  expect(await f.runs()).toHaveLength(1);
  expect((await f.analysis.status('1')).running).toBe(true);
  expect((await f.runs())[0]).toMatchObject({
    requestedBy: 'member-1',
    activeKey: 'project:1',
    status: 'running',
  });
  const afterRestart = f.worker();
  await afterRestart.lifecycle.recover();
  const effects = await afterRestart.lifecycle.listEffectRuns({
    lifecycle: ANALYSIS_LIFECYCLE,
    status: 'queued',
  });
  await Promise.all(
    effects.flatMap((run) => [
      afterRestart.lifecycle.runEffect(run.id),
      afterRestart.lifecycle.runEffect(run.id),
    ]),
  );
  expect(f.model).toHaveBeenCalledTimes(1);
  expect(await f.storedResults()).toBe(1);
  expect(await afterRestart.analysis.status('1')).toMatchObject({
    running: false,
    retry: null,
    last: { ok: true },
    runs: [{ trigger: 'manual', ok: true }],
  });
  const history = await afterRestart.lifecycle.history(
    ANALYSIS_LIFECYCLE,
    one.id,
  );
  expect(history.transitions.map((entry) => entry.transition)).toEqual([
    '$create',
    'launch',
    'claim',
    'request',
    'checkpoint',
    'settle',
  ]);
});

it('atomically links each Scheduler occurrence to its projects and reports only their terminal outcome', async () => {
  const f = await fixture(['1', '2']);
  await Promise.all([
    f.analysis.acceptOccurrence('occurrence-1'),
    f.analysis.acceptOccurrence('occurrence-1'),
  ]);
  expect(await f.database.repository(ANALYSIS_OCCURRENCES).count()).toBe(1);
  expect(await f.runs()).toHaveLength(2);
  expect(f.model).not.toHaveBeenCalled();
  expect(await f.analysis.inspect('occurrence-1')).toEqual({
    state: 'running',
  });
  await f.drain();
  expect(await f.analysis.inspect('occurrence-1')).toMatchObject({
    state: 'completed',
    completion: {
      status: 'succeeded',
      result: {
        projects: { '1': { ok: true, items: 0 }, '2': { ok: true, items: 0 } },
      },
    },
  });
  expect(f.reportCompletion).toHaveBeenCalledWith(
    'occurrence-1',
    { type: 'app.nocoreach.daily-analysis', id: 'occurrence-1' },
    expect.objectContaining({ status: 'succeeded' }),
  );
  await f.analysis.acceptOccurrence('occurrence-1');
  await f.analysis.acceptOccurrence('occurrence-2');
  await f.drain();
  expect(f.model).toHaveBeenCalledTimes(2);
  expect(await f.runs()).toHaveLength(2);
});

it('keeps 5, 15 and 60 minute safe retries durable across workers and does not finish Scheduler early', async () => {
  const f = await fixture();
  f.model.mockImplementation(async () => {
    throw unreachable();
  });
  await f.analysis.acceptOccurrence('retry-occurrence');
  let current = { lifecycle: f.lifecycle, analysis: f.analysis };
  for (const [index, minutes] of [5, 15, 60].entries()) {
    await f.drain(current.lifecycle);
    const state = await current.analysis.status('1');
    expect(state.retry).toMatchObject({ attempt: index + 1 });
    expect(
      Date.parse(state.retry!.nextAt) - Date.parse(state.runs[0]!.at),
    ).toBe(minutes * 60_000);
    expect(await current.analysis.inspect('retry-occurrence')).toEqual({
      state: 'pending',
    });
    expect(f.reportCompletion).not.toHaveBeenCalled();
    f.time.now = new Date(Date.parse(state.retry!.nextAt) - 1);
    await current.analysis.sweep();
    expect((await f.runs())[0]!.status).toBe('waiting');
    f.time.now = new Date(Date.parse(state.retry!.nextAt));
    current = f.worker();
    await current.analysis.sweep();
  }
  await f.drain(current.lifecycle);
  expect(f.model).toHaveBeenCalledTimes(4);
  expect((await current.analysis.status('1')).retry).toBe(null);
  expect((await f.runs())[0]!.status).toBe('failed');
  expect(f.host.notifications.analysisFailed).toHaveBeenCalledTimes(1);
  expect(await current.analysis.inspect('retry-occurrence')).toMatchObject({
    state: 'completed',
    completion: { status: 'failed' },
  });
});

it('does not retry manual or potentially paid failures; a manual success suppresses the pending automatic retry', async () => {
  const f = await fixture();
  f.model.mockRejectedValueOnce(unreachable());
  await f.analysis.enqueue('1', 'schedule');
  await f.drain();
  const planned = (await f.analysis.status('1')).retry;
  f.model.mockRejectedValueOnce(unreachable());
  await f.analysis.enqueue('1', 'manual');
  await f.drain();
  expect((await f.analysis.status('1')).retry).toEqual(planned);
  expect(
    (await f.runs()).filter((run) => run.trigger === 'manual'),
  ).toMatchObject([{ status: 'failed' }]);
  await f.analysis.enqueue('1', 'manual');
  await f.drain();
  expect((await f.analysis.status('1')).last?.ok).toBe(true);
  f.time.now = new Date(planned!.nextAt);
  await f.analysis.sweep();
  await f.drain();
  expect(f.model).toHaveBeenCalledTimes(3);
  expect((await f.analysis.status('1')).retry).toBe(null);
  expect((await f.runs())[0]!.status).toBe('skipped');
  const timeout = Object.assign(new Error('Unconfirmed provider outcome'), {
    name: 'TimeoutError',
  });
  f.model.mockRejectedValueOnce(timeout);
  await f.analysis.enqueue('1', 'manual');
  await f.drain();
  expect((await f.runs()).at(-1)).toMatchObject({
    status: 'failed',
    requestStartedAt: expect.anything(),
  });
  expect((await f.analysis.status('1')).retry).toBe(null);
});

it('waits until the catchup grace, respects administrator disabling and app identity, and runs each project once per day', async () => {
  const f = await fixture(['1', '2']);
  // A different application can use the same schedule key without controlling this one.
  await f.database.repository('scheduleDefinitions').createOne({
    values: {
      id: 'other-daily',
      appName: 'other-app',
      key: ANALYSIS_SCHEDULE,
      sourceType: 'code',
      title: 'Other daily',
      definitionHash: 'other',
      cron: '0 1 * * *',
      timezone: 'UTC',
      enabled: true,
      targetType: 'other',
      targetConfig: {},
      lifecycleState: 'active',
      createdAt: f.time.now,
      updatedAt: f.time.now,
    },
  });
  await f.analysis.sweep();
  expect(await f.runs()).toEqual([]);
  f.time.now = new Date(2026, 9, 12, 9, 16);
  await f.database
    .repository('scheduleDefinitions')
    .updateOne({ filter: { id: 'daily' }, values: { enabled: false } });
  await f.analysis.sweep();
  expect(await f.runs()).toEqual([]);
  expect((await f.analysis.status('1')).schedule).toMatchObject({
    enabled: false,
    cron: '0 9 * * *',
  });
  await f.database
    .repository('scheduleDefinitions')
    .updateOne({ filter: { id: 'daily' }, values: { enabled: true } });
  await f.analysis.sweep();
  await f.drain();
  await f.analysis.sweep();
  await f.drain();
  expect(f.model).toHaveBeenCalledTimes(2);
  expect(await f.runs()).toHaveLength(2);
});

it('never replays an unconfirmed model request after its worker loses the lease, and fences the late result', async () => {
  const f = await fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.model.mockImplementation(async () => {
    await gate;
    return successful;
  });
  const run = await f.analysis.enqueue('1', 'schedule');
  await f.analysis.acceptOccurrence('interrupted-request');
  const effect = (await f.lifecycle.listEffectRuns({ status: 'queued' }))[0]!;
  const oldAttempt = f.lifecycle.runEffect(effect.id);
  await vi.waitFor(async () =>
    expect((await f.runs())[0]!.requestStartedAt).not.toBe(null),
  );
  f.time.now = new Date(f.time.now.getTime() + 16 * 60_000);
  const restarted = f.worker();
  await restarted.lifecycle.reclaim();
  await restarted.lifecycle.runEffect(effect.id);
  await restarted.analysis.sweep();
  expect((await f.runs())[0]).toMatchObject({
    id: run.id,
    status: 'unknown',
    retryAt: null,
    result: { entry: { error: 'analysis.interruptedUnknown' } },
  });
  release();
  await oldAttempt;
  await f.drain(restarted.lifecycle);
  await restarted.analysis.sweep();
  expect(f.model).toHaveBeenCalledTimes(1);
  expect(await f.storedResults()).toBe(0);
  expect((await f.analysis.status('1')).runs[0]).toMatchObject({
    ok: false,
    retryable: false,
    error: 'analysis.interruptedUnknown',
  });
  expect(f.host.notifications.analysisFailed).toHaveBeenCalledWith(
    '1',
    chinese['analysis.interruptedUnknown'],
  );
  expect(await restarted.analysis.inspect('interrupted-request')).toMatchObject(
    {
      state: 'completed',
      completion: {
        reason: `1: ${chinese['analysis.interruptedUnknown']}`,
        result: {
          projects: { '1': { error: chinese['analysis.interruptedUnknown'] } },
        },
      },
    },
  );
  // Even an operator forcing the generic native effect retry cannot bypass the marker.
  await restarted.lifecycle.retryRun(effect.id, {
    force: true,
    reason: 'Test the business fence',
  });
  await f.drain(restarted.lifecycle);
  expect(f.model).toHaveBeenCalledTimes(1);
});

it('leaves schedules in another timezone to official delivery instead of making an early catchup call', async () => {
  const f = await fixture();
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const different =
    local === 'America/New_York' ? 'Asia/Tokyo' : 'America/New_York';
  await f.database
    .repository('scheduleDefinitions')
    .updateOne({ filter: { id: 'daily' }, values: { timezone: different } });
  f.time.now = new Date(2026, 9, 12, 9, 16);
  await f.analysis.sweep();
  expect(await f.runs()).toHaveLength(0);
  expect(f.model).not.toHaveBeenCalled();
  await f.analysis.acceptOccurrence('official-zoned-delivery');
  await f.drain();
  expect(f.model).toHaveBeenCalledTimes(1);
});

it('does not let 200 future retries hide a later accepted retry that is due now', async () => {
  const f = await fixture(['due']);
  const future = Array.from({ length: 200 }, (_, index) => ({
    runKey: `daily:future-${index}:2026-10-12`,
    activeKey: `run:future-${index}`,
    projectId: `future-${index}`,
    trigger: 'schedule',
    day: '2026-10-12',
    status: 'waiting',
    lifecycleVersion: 1,
    statusChangedAt: f.time.now,
    requestedAt: new Date(f.time.now.getTime() - 60_000),
    attempt: 1,
    retryAt: new Date(f.time.now.getTime() + 60 * 60_000),
  }));
  await f.database.repository(ANALYSIS_COLLECTION).createMany({
    values: [
      future[0]!,
      ...future.slice(1),
      {
        ...future[0]!,
        runKey: 'daily:due:2026-10-12',
        activeKey: 'run:due',
        projectId: 'due',
        requestedAt: f.time.now,
        retryAt: f.time.now,
      },
    ],
  });
  await f.analysis.sweep();
  await f.drain();
  expect((await f.runs()).find((run) => run.projectId === 'due')?.status).toBe(
    'succeeded',
  );
  expect(f.model).toHaveBeenCalledTimes(1);
});

it('can safely recover an interrupted worker that never sent a model request', async () => {
  const f = await fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = f.worker(async () => gate);
  const run = await original.analysis.enqueue('1', 'schedule');
  const effect = (
    await original.lifecycle.listEffectRuns({ status: 'queued' })
  )[0]!;
  const oldAttempt = original.lifecycle.runEffect(effect.id);
  await vi.waitFor(async () =>
    expect((await original.lifecycle.listEffectRuns())[0]!.status).toBe(
      'running',
    ),
  );
  f.time.now = new Date(f.time.now.getTime() + 16 * 60_000);
  const restarted = f.worker();
  await restarted.lifecycle.reclaim();
  await restarted.lifecycle.runEffect(effect.id);
  await restarted.analysis.sweep();
  expect((await f.runs())[0]).toMatchObject({
    id: run.id,
    status: 'waiting',
    requestStartedAt: null,
    result: { entry: { error: 'analysis.interruptedBeforeRequest' } },
  });
  release();
  await oldAttempt;
  expect(f.model).not.toHaveBeenCalled();
  f.time.now = new Date((await restarted.analysis.status('1')).retry!.nextAt);
  await restarted.analysis.sweep();
  // Retrying a historical effect must not take over the new business attempt.
  await restarted.lifecycle.retryRun(effect.id, {
    force: true,
    reason: 'Check old-round fencing',
  });
  await restarted.lifecycle.runEffect(effect.id);
  expect(f.model).not.toHaveBeenCalled();
  await f.drain(restarted.lifecycle);
  expect(f.model).toHaveBeenCalledTimes(1);
  expect((await f.runs())[0]!.status).toBe('succeeded');
});

it.each([false, true])(
  'settles a fenced effect retry before recovery, without losing the business outcome (request started: %s)',
  async (requestStarted) => {
    const f = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (requestStarted)
      f.model.mockImplementation(async () => {
        await gate;
        return successful;
      });
    else
      f.host.strategy.context = async () => {
        await gate;
        return {
          project: { name: 'Project' },
          evidence: { signals: { items: [] } },
        };
      };
    await f.analysis.enqueue('1', 'schedule');
    const effect = (await f.lifecycle.listEffectRuns({ status: 'queued' }))[0]!;
    const oldAttempt = f.lifecycle.runEffect(effect.id);
    await vi.waitFor(async () => {
      const run = (await f.runs())[0]!;
      expect(run.requestToken).not.toBe(null);
      expect(Boolean(run.requestStartedAt)).toBe(requestStarted);
    });
    f.time.now = new Date(f.time.now.getTime() + 16 * 60_000);
    const restarted = f.worker();
    await restarted.lifecycle.reclaim();
    await restarted.lifecycle.runEffect(effect.id);
    await restarted.lifecycle.retryRun(effect.id, {
      force: true,
      reason: 'Retry before the business recovery sweep',
    });
    await restarted.lifecycle.runEffect(effect.id);
    expect(
      (await restarted.lifecycle.listEffectRuns()).find(
        (run) => run.id === effect.id,
      )?.status,
    ).toBe('succeeded');
    expect((await f.runs())[0]!.status).toBe('running');
    await restarted.analysis.sweep();
    expect((await f.runs())[0]!.status).toBe(
      requestStarted ? 'unknown' : 'waiting',
    );
    release();
    await oldAttempt;
    expect(f.model).toHaveBeenCalledTimes(requestStarted ? 1 : 0);
    expect(await f.storedResults()).toBe(0);
  },
);

it('imports an outstanding legacy retry once while retaining legacy history and never replays old unknown occurrences', async () => {
  const f = await fixture();
  const entry = {
    at: f.time.now.toISOString(),
    trigger: 'workflow',
    ok: false,
    retryable: true,
    error: 'Connection refused',
    ms: 1,
  };
  const retryAt = new Date(f.time.now.getTime() + 5 * 60_000).toISOString();
  await f.legacy.getRepository('nrSnapshots').create({
    values: {
      key: 'daily-analysis:1',
      payload: { runs: [entry], retry: { attempt: 1, nextAt: retryAt } },
    },
  });
  await f.analysis.enqueue('1', 'schedule');
  expect((await f.runs())[0]).toMatchObject({ status: 'waiting', attempt: 1 });
  expect(f.model).not.toHaveBeenCalled();
  f.time.now = new Date(retryAt);
  await f.analysis.sweep();
  await f.drain();
  const status = await f.analysis.status('1');
  expect(status.runs).toHaveLength(2);
  expect(status.runs[0]).toMatchObject({ trigger: 'retry', ok: true });
  expect(status.runs[1]).toEqual(entry);
  await f.legacy.getRepository('nrSnapshots').create({
    values: {
      key: 'daily-analysis:occurrence:old',
      payload: {
        occurrenceId: 'old',
        status: 'running',
        updatedAt: entry.at,
      },
    },
  });
  await f.analysis.acceptOccurrence('old');
  expect(await f.analysis.inspect('old')).toMatchObject({
    state: 'completed',
    completion: { status: 'failed' },
  });
  expect(await f.database.repository(ANALYSIS_OCCURRENCES).count()).toBe(0);
  expect(f.model).toHaveBeenCalledTimes(1);
});

it('keeps immutable simulated settings across dispatch and rejects a result after the settings change', async () => {
  const f = await fixture();
  const settings: Record<string, string> = {};
  const mock = new MockEngine({ enabled: true, environment: 'test' });
  await mock.attach({
    assertPristine: async () => {},
    variables: {
      all: () => settings,
      set: async (key, value) => {
        settings[key] = value;
      },
    },
    app: { resourceManager: { define: vi.fn() }, acl: { allow: vi.fn() } },
    project: async () => ({}),
    requireAccess: async () => 'admin',
  });
  await mock.configure({
    projectId: '1',
    enabled: true,
    scenario: 'normal',
    seed: 'analysis',
    clock: '2026-10-12T00:00:00.000Z',
    revision: 0,
  });
  f.host.mock = mock;
  const contexts: unknown[] = [];
  f.model.mockImplementation(async () => {
    contexts.push(mock.context('1'));
    await mock.configure({
      projectId: '1',
      enabled: true,
      scenario: 'newdata',
      seed: 'analysis',
      clock: '2026-10-12T00:00:00.000Z',
      revision: 1,
    });
    return successful;
  });
  const run = await f.analysis.enqueue('1', 'manual');
  expect(run.mockSnapshot).toMatchObject({
    revision: 1,
    scenario: 'normal',
    projectId: '1',
  });
  await f.drain();
  expect(contexts).toEqual([run.mockSnapshot]);
  expect(await f.storedResults()).toBe(0);
  expect((await f.runs())[0]).toMatchObject({
    status: 'failed',
    result: { entry: { error: 'analysis.configurationChanged' } },
  });
  expect((await f.analysis.status('1')).retry).toBe(null);
  f.model.mockImplementation(async () => successful);
  const save = f.host.strategy.saveInsights;
  f.host.strategy.saveInsights = async (id, values) => {
    const result = await save(id, values);
    await mock.configure({
      projectId: '1',
      enabled: true,
      scenario: 'normal',
      seed: 'analysis',
      clock: '2026-10-12T00:00:00.000Z',
      revision: 2,
    });
    return result;
  };
  await f.analysis.enqueue('1', 'manual');
  await f.drain();
  expect(await f.storedResults()).toBe(0);
  expect((await f.runs()).at(-1)!.status).toBe('failed');
});
