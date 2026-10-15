// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { SyncService } from '../../server/nocoreach/sync-service';
import { TaskData } from '../../server/nocoreach/task-data';
import {
  legacyRecord,
  type LegacyDatabase,
} from '../../server/nocoreach/legacy/database';

let fixtureDb: LegacyDatabase | undefined;
let projectSequence = 900000;
const fixtureProjects: string[] = [];
function projectId(db: LegacyDatabase) {
  fixtureDb = db;
  const id = String(++projectSequence);
  fixtureProjects.push(id);
  return id;
}
afterEach(async () => {
  if (fixtureDb)
    for (const table of ['nrSyncJobs', 'nrSyncPartitions', 'nrGoogleLinks']) {
      await fixtureDb
        .getRepository(table)
        .destroy({ filter: { projectId: { $in: fixtureProjects } } });
    }
  fixtureProjects.length = 0;
  vi.restoreAllMocks();
});
vi.setConfig({ testTimeout: 30000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    database: {
      connections: { main: { pool: { acquireTimeoutMillis: 1500 } } },
    },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
const deferred = () => Promise.withResolvers<void>();

async function syncFixture(db: LegacyDatabase) {
  const id = projectId(db);
  const link = await db.getRepository('nrGoogleLinks').create({
    values: {
      projectId: id,
      ga4PropertyId: '123',
      gscSiteUrl: 'sc-domain:example.com',
      status: 'active',
    },
  });
  const plugin = {
    db,
    link: () =>
      db.getRepository('nrGoogleLinks').findOne({ filterByTk: link.id }),
    project: async () => ({
      id,
      name: 'Fixture',
      analyticsPropertyId: '123',
      searchConsoleProperty: 'sc-domain:example.com',
    }),
    env: () => 'synthetic-refresh-token',
    token: vi.fn(async () => 'synthetic-access-token'),
    googleJson: vi.fn(async () => ({ timeZone: 'UTC' })),
    googleFetch: () => async () => Response.json({ rows: [], rowCount: 0 }),
    app: { logger: { warn: vi.fn(), info: vi.fn() } },
  };
  const sync = new SyncService(plugin);
  const job = await db.getRepository('nrSyncJobs').create({
    values: {
      projectId: id,
      source: 'ga4',
      resource: '123',
      status: 'queued',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      cursor: '2026-09-01',
      attempts: 0,
      recordCount: 0,
    },
  });
  const readJob = () =>
    db.getRepository('nrSyncJobs').findOne({ filterByTk: job.id });
  return { id, link, job, plugin, sync, readJob };
}

for (const finish of [
  'success',
  'pause',
  'pause-resume',
  'late-failure',
  'disconnect',
] as const) {
  test(`Google wait leaves DB responsive and handles ${finish}`, async ({
    testApp,
    connection,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    vi.spyOn(runtime.plugin.sync, 'tick').mockResolvedValue(undefined);
    const f = await syncFixture(runtime.legacy.db);
    const entered = deferred(),
      release = deferred();
    f.plugin.googleJson.mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      if (finish === 'late-failure')
        throw Object.assign(new Error('proxy timeout'), {
          code: 'network_timeout',
        });
      return { timeZone: 'UTC' };
    });
    const step = f.sync.step();
    try {
      await Promise.race([
        entered.promise,
        step.then(() => {
          throw new Error('Sync finished before reaching Google');
        }),
      ]);
      // This query must finish while Google is still blocked, using the real application's connection pool.
      await connection.repository('nrSnapshots').count({});
      expect((await f.readJob())?.get('status')).toBe('running');
      expect(await f.sync.step()).toBe(false);
      if (['pause', 'pause-resume', 'late-failure'].includes(finish)) {
        await f.sync.control(f.id, 'pause');
        if (finish !== 'pause') await f.sync.control(f.id, 'resume');
      }
      if (finish === 'disconnect') {
        await runtime.legacy.db.getRepository('nrGoogleLinks').update({
          filterByTk: f.link.id,
          values: { status: 'disconnected' },
        });
      }
    } finally {
      release.resolve();
      await step;
    }
    expect(await step).toBe(finish === 'success');
    expect(await connection.repository('nrSyncPartitions').count({})).toBe(
      finish === 'success' ? 21 : 0,
    );
    const job = await f.readJob();
    expect(job?.get('cursor')).toBe(
      finish === 'success' ? '2026-09-08' : '2026-09-01',
    );
    expect(job?.get('status')).toBe(
      finish === 'success'
        ? 'succeeded'
        : finish === 'pause'
          ? 'paused'
          : finish === 'disconnect'
            ? 'failed'
            : 'queued',
    );
    if (finish === 'pause-resume' || finish === 'late-failure')
      expect(job?.get('attempts')).toBe(0);
  });
}

test('network failures preserve partitions, retry with backoff and stop after three attempts', async ({
  testApp,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  vi.spyOn(runtime.plugin.sync, 'tick').mockResolvedValue(undefined);
  const f = await syncFixture(runtime.legacy.db);
  f.plugin.token.mockRejectedValue(
    Object.assign(new Error('proxy timeout'), { code: 'network_timeout' }),
  );
  for (let attempt = 1; attempt <= 3; attempt++) {
    expect(await f.sync.step()).toBe(false);
    const job = await f.readJob();
    expect(job?.get('status')).toBe(attempt < 3 ? 'retrying' : 'failed');
    expect(job?.get('attempts')).toBe(attempt);
    expect(job?.get('errorCode')).toBe('network_timeout');
    expect(job?.get('cursor')).toBe('2026-09-01');
    if (attempt < 3) {
      expect(await f.sync.step()).toBe(false);
      expect(f.plugin.token).toHaveBeenCalledTimes(attempt);
      await runtime.legacy.db
        .getRepository('nrSyncJobs')
        .update({ filterByTk: f.job.id, values: { retryAt: '2000-01-01' } });
    }
  }
  expect(
    await runtime.legacy.db.getRepository('nrSyncPartitions').count(),
  ).toBe(0);
});

test('the block deadline aborts a waiting paginated Google request and schedules a retry', async ({
  testApp,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  vi.spyOn(runtime.plugin.sync, 'tick').mockResolvedValue(undefined);
  const f = await syncFixture(runtime.legacy.db);
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) =>
    timeout(ms === 120000 ? 50 : ms),
  );
  const fetcher = vi.fn(
    async (_url: unknown, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init.signal!;
        if (signal.aborted) reject(signal.reason);
        else
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
      }),
  );
  f.plugin.googleFetch = () => fetcher;
  expect(await f.sync.step()).toBe(false);
  expect(fetcher).toHaveBeenCalled();
  expect((await f.readJob())?.get('status')).toBe('retrying');
  expect((await f.readJob())?.get('errorCode')).toBe('network_timeout');
  expect(
    await runtime.legacy.db.getRepository('nrSyncPartitions').count(),
  ).toBe(0);
});

async function snapshotFixture(db: LegacyDatabase) {
  const id = projectId(db);
  const plugin = {
    db,
    env: () => 'synthetic',
    link: async () =>
      legacyRecord({
        id: '1',
        ga4PropertyId: '123',
        gscSiteUrl: 'sc-domain:example.com',
        status: 'active',
      }),
    project: async () => ({
      id,
      analyticsPropertyId: '123',
      searchConsoleProperty: 'sc-domain:example.com',
    }),
  };
  const sync = new SyncService(plugin);
  const write = (grain: string, payload: object[]) =>
    db.getRepository('nrSyncPartitions').create({
      values: {
        partitionKey: `${id}:${grain}`,
        projectId: id,
        source: 'ga4',
        resource: '123',
        date: '2026-09-07',
        grain,
        payload,
      },
    });
  await write('overview', [{ date: '2026-09-07', views: 42 }]);
  await write('page', [{ page: '/docs', views: 42, conversions: 0 }]);
  return { id, sync, taskData: new TaskData({ ...plugin, sync }) };
}

test('task materials build on their own transaction while a background snapshot waits for the connection', async ({
  testApp,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken),
    db = runtime.legacy.db;
  vi.spyOn(runtime.plugin.sync, 'tick').mockResolvedValue(undefined);
  const f = await snapshotFixture(db);
  const entered = deferred(),
    release = deferred(),
    requested = deferred();
  const originalBuild = f.sync.build.bind(f.sync);
  let first = true;
  const build = vi
    .spyOn(f.sync, 'build')
    .mockImplementation(async (...args) => {
      if (first) {
        first = false;
        entered.resolve();
        await release.promise;
        requested.resolve();
      }
      return originalBuild(...args);
    });
  const outside = f.sync.snapshots(f.id);
  // Handle a rejection immediately if the regression reappears, while still asserting the original promise below.
  void outside.catch(() => undefined);
  await entered.promise;
  try {
    await db.sequelize.transaction(async () => {
      release.resolve();
      await requested.promise;
      const materials = await f.taskData.forRun(f.id);
      expect(materials).toContain('/docs（浏览 42）');
      expect(materials).toContain('2026-09-07');
      expect(await f.sync.snapshots(f.id)).toBe(await f.sync.snapshots(f.id));
    });
    expect((await outside).length).toBeGreaterThan(0);
    expect(build).toHaveBeenCalledTimes(2);
  } finally {
    release.resolve();
    await outside.catch(() => undefined);
  }
});

test('rolled-back transaction snapshots never enter the shared cache', async ({
  testApp,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken),
    db = runtime.legacy.db;
  vi.spyOn(runtime.plugin.sync, 'tick').mockResolvedValue(undefined);
  const f = await snapshotFixture(db);
  const before = await f.sync.snapshots(f.id);
  const pages = (snapshots: Awaited<ReturnType<SyncService['snapshots']>>) =>
    snapshots.find((snapshot) => snapshot.key === 'pages-28')?.payload;
  expect(pages(before)).toEqual([
    { page: '/docs', views: 42, sessions: 0, conversions: 0 },
  ]);
  await expect(
    db.sequelize.transaction(async () => {
      await db.getRepository('nrSyncPartitions').update({
        filter: { projectId: f.id, grain: 'page' },
        values: { payload: [{ page: '/docs', views: 999, conversions: 0 }] },
      });
      expect(pages(await f.sync.snapshots(f.id))).toEqual([
        { page: '/docs', views: 999, sessions: 0, conversions: 0 },
      ]);
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  const after = await f.sync.snapshots(f.id);
  expect(pages(after)).toEqual([
    { page: '/docs', views: 42, sessions: 0, conversions: 0 },
  ]);
  expect(after).toBe(before);
});

test('legacy online task start reads the configured model on its existing transaction', async ({
  testApp,
  connection,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken),
    plugin = runtime.plugin;
  vi.spyOn(plugin.taskExecution, 'tick').mockResolvedValue(undefined);
  vi.spyOn(plugin.sync, 'tick').mockResolvedValue(undefined);
  const model = await plugin.agents.models.services.create({
    title: 'Fixture',
    provider: 'openai',
    models: [{ value: 'fixture-chat' }],
  });
  vi.spyOn(plugin, 'project').mockResolvedValue({
    id: '900003',
    name: 'Fixture',
  });
  const owner = 'fixture-owner';
  const task = await runtime.legacy.db.getRepository('nrTasks').create({
    values: {
      projectId: '900003',
      taskKey: randomUUID(),
      title: 'Draft',
      status: '待处理',
      evidence: {
        work: {
          schemaVersion: 2,
          revision: 0,
          stage: 'work',
          planVersion: 1,
          approvedPlanVersion: 1,
          plan: {
            deliverable: 'Draft',
            verification: 'Review',
            steps: [
              {
                id: 'draft',
                title: 'Draft',
                owner: 'ai',
                instruction: 'Draft',
                acceptance: 'Review',
              },
            ],
          },
          step: 0,
          results: [],
          history: [],
          operations: [],
          receipt: null,
          verification: null,
          humanOwnerId: owner,
          humanOwnerName: 'Fixture',
        },
      },
    },
  });
  await plugin.taskExecution.update(
    '900003',
    {
      taskId: String(task.id),
      revision: 0,
      requestId: randomUUID(),
      command: 'startRun',
      planVersion: 1,
      stepId: 'draft',
      executorId: 'atlas',
    },
    owner,
    'Fixture',
  );
  const view = await plugin.taskExecution.get('900003', String(task.id));
  expect(view.runs[0].status).toBe('queued');
  expect(view.runs[0].model).toEqual({
    llmService: model.name,
    model: 'fixture-chat',
  });
  await connection.repository('nrSnapshots').count({});
});
