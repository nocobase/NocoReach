// @vitest-environment node
// NocoReach's timers share one schedule executor that runs one firing at a time (the built-in memory jobs
// configuration). A firing that does not end used to stop every other timer, and kept the executor from shutting down:
// LegacyApp.tick now lets the executor go on after a deadline, or at shutdown, while the firing finishes on its own.
// A firing still running when shutdown gives up on it writes and sends nothing more, so the closing network is not
// recorded as its failure. GitHub trends' requests keep their own deadline, a read the server stops saves nothing, and a demo or
// simulated project's searches no longer wait for GitHub's pacing. The sync's stop is in
// transaction-responsiveness.test.ts.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createJobExecutorService, type ScheduleEvent } from '@nocobase/jobs';
import { afterEach, expect, test } from 'vitest';

import { GitHubTrends, KEY } from '../../server/nocoreach/github-trends.js';
import {
  LegacyApp,
  type LegacyLogger,
} from '../../server/nocoreach/legacy/app.js';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import type { LegacyVariables } from '../../server/nocoreach/legacy/variables.js';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';
import type { ProxyProfiles } from '../../server/nocoreach/proxy-profiles.js';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

function recordingLogger() {
  const lines: { level: string; message: string; details?: unknown }[] = [];
  const at = (level: string) => (message: string, details?: unknown) =>
    lines.push({ level, message, details });
  const logger: LegacyLogger = {
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
    debug: at('debug'),
  };
  return { logger, lines };
}

/** A project with a repository and one topic, its GitHub trends state kept in memory. */
function trendsPlugin(
  fetch: (url: string | URL, init: RequestInit) => Promise<Response>,
  network: object = {},
) {
  const rows: Record<string, unknown> = {};
  const repository = {
    findOne: async ({ filter }: { filter: { key: string } }) =>
      rows[filter.key] == null
        ? null
        : { id: filter.key, get: () => rows[filter.key] },
    update: async ({
      filterByTk,
      values,
    }: {
      filterByTk: string;
      values: { payload: unknown };
    }) => {
      rows[filterByTk] = values.payload;
    },
    create: async ({
      values,
    }: {
      values: { key: string; payload: unknown };
    }) => {
      rows[values.key] = values.payload;
    },
  };
  const plugin = {
    db: {
      getRepository: () => repository,
      sequelize: {
        transaction: (fn: (t: object) => unknown) => fn({}),
        query: async () => [[{}]],
      },
    },
    github: {
      token: () => '',
      state: async () => ({
        repo: 'acme/flow',
        profile: { topics: ['kanban'] },
      }),
    },
    competitors: { state: async () => ({ list: [] }) },
    // GitHub hot topics searches the followed topics in Memory.
    followedTopics: { of: async () => ['kanban'] },
    projectIds: async () => ['1'],
    network: {
      bind: () => {},
      fetch: (_connection: string, url: string | URL, init: RequestInit) =>
        fetch(url, init),
      ...network,
    },
  };
  return { plugin, rows };
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

test('a firing whose request never answers gives the executor back at its deadline, and the next timer still fires', async () => {
  const storagePath = await mkdtemp(path.join(tmpdir(), 'nocoreach-cron-'));
  cleanup.push(() => rm(storagePath, { recursive: true, force: true }));
  const { logger, lines } = recordingLogger();
  const legacy = new LegacyApp({} as LegacyDatabase, logger, {
    all: () => ({}),
  } as unknown as LegacyVariables);
  legacy.firingDeadline = 300;

  // GitHub never answers, and ignores the request's own abort signal too: only the firing's deadline frees the executor.
  let asked = 0;
  const { plugin } = trendsPlugin(() => {
    asked++;
    return new Promise<Response>(() => {});
  });
  const trends = new GitHubTrends(plugin);
  let trendFirings = 0;
  let taskFirings = 0;
  legacy.cronJobManager.addJob({
    name: 'githubTrendsCron',
    cronTime: '* * * * * *',
    onTick: () => {
      trendFirings++;
      return trends.tick();
    },
  });
  legacy.cronJobManager.addJob({
    name: 'taskCron',
    cronTime: '* * * * * *',
    onTick: () => {
      taskFirings++;
    },
  });

  // The application's default: the built-in memory configuration, one firing at a time.
  const service = createJobExecutorService(undefined, {
    appName: 'test',
    storagePath,
  });
  cleanup.push(() => service.shutdown());
  const executor = service.getScheduleExecutor('nocoreach');
  const events: (ScheduleEvent & { at: number })[] = [];
  executor.subscribe((event) => {
    events.push({ ...event, at: Date.now() });
  });
  for (const job of legacy.jobs)
    await executor.addJob(legacy.scheduleJob(job, 'UTC'));
  await executor.setup();

  await expect
    .poll(() => taskFirings, { timeout: 6000, interval: 50 })
    .toBeGreaterThanOrEqual(3);
  expect(asked).toBe(1);

  // The trends firing ended for the executor about its deadline after it started; its request is still waiting.
  const start = events.find(
    (e) => e.jobName === 'githubTrendsCron' && e.name === 'ScheduleStart',
  )!;
  const end = events.find(
    (e) =>
      e.jobName === 'githubTrendsCron' &&
      e.name === 'ScheduleEnd' &&
      e.jobId === start.jobId,
  )!;
  expect(end).toBeDefined();
  expect(end.at - start.runAt.getTime()).toBeGreaterThanOrEqual(250);
  expect(end.at - start.runAt.getTime()).toBeLessThan(2000);
  // Overrunning is routine for long reads: the first report is at info.
  expect(lines).toContainEqual(
    expect.objectContaining({
      level: 'info',
      message: expect.stringContaining('after its deadline'),
      details: expect.objectContaining({ job: 'githubTrendsCron' }),
    }),
  );
  // Its later firings are skipped while the first still runs: the timer never runs twice at once.
  expect(
    events.filter(
      (e) => e.jobName === 'githubTrendsCron' && e.name === 'ScheduleStart',
    ).length,
  ).toBeGreaterThan(1);
  expect(trendFirings).toBe(1);

  // Shutdown no longer waits for the firing either.
  const stopping = Date.now();
  await executor.shutdown();
  expect(Date.now() - stopping).toBeLessThan(1000);
  // The provider then gives such a firing a bounded moment, and goes on without it.
  expect(await legacy.settle(100)).toBe(false);
});

test('shutdown stops waiting for a firing at once, writes the schedule state and goes on without it', async () => {
  const storagePath = await mkdtemp(path.join(tmpdir(), 'nocoreach-cron-'));
  cleanup.push(() => rm(storagePath, { recursive: true, force: true }));
  const { logger, lines } = recordingLogger();
  const legacy = new LegacyApp({} as LegacyDatabase, logger, {
    all: () => ({}),
  } as unknown as LegacyVariables);
  // The deadline is far away: only the executor's signal releases the firing.
  legacy.firingDeadline = 60_000;
  legacy.cronJobManager.addJob({
    name: 'githubTrendsCron',
    cronTime: '* * * * * *',
    onTick: () => new Promise(() => {}),
  });
  const service = createJobExecutorService(undefined, {
    appName: 'test',
    storagePath,
  });
  cleanup.push(() => service.shutdown());
  const executor = service.getScheduleExecutor('nocoreach');
  let started = false;
  executor.subscribe((event) => {
    if (event.name === 'ScheduleStart') started = true;
  });
  for (const job of legacy.jobs)
    await executor.addJob(legacy.scheduleJob(job, 'UTC'));
  await executor.setup();
  await expect.poll(() => started, { timeout: 3000, interval: 20 }).toBe(true);

  const stopping = Date.now();
  await executor.shutdown();
  expect(Date.now() - stopping).toBeLessThan(1000);
  // The state reaches the disk, so the next start does not replay the firing from an older file.
  const state = JSON.parse(
    await readFile(path.join(storagePath, 'test.nocoreach.json'), 'utf8'),
  ) as { jobs: Record<string, { fired: number }> };
  expect(state.jobs.githubTrendsCron.fired).toBe(1);
  expect(await legacy.settle(50)).toBe(false);
  expect(lines).toContainEqual(
    expect.objectContaining({
      level: 'info',
      message: expect.stringContaining('at shutdown'),
    }),
  );
});

for (const finish of ['resolves', 'rejects'] as const) {
  test(`a firing that ${finish} after its deadline lets its timer fire again, and says how it ended`, async () => {
    const { logger, lines } = recordingLogger();
    const legacy = new LegacyApp({} as LegacyDatabase, logger, {
      all: () => ({}),
    } as unknown as LegacyVariables);
    legacy.overrunReport = 0;
    const later = Promise.withResolvers<void>();
    let firings = 0;
    const job = legacy.cronJobManager.addJob({
      name: 'syncCron',
      cronTime: '* * * * * *',
      onTick: () => (++firings === 1 ? later.promise : undefined),
    });
    expect(await legacy.tick(job, { deadline: 20 })).toBe(true);
    // Still running: the next firing is skipped, and reported again at warn once `overrunReport` has passed.
    expect(await legacy.tick(job, { deadline: 20 })).toBe(false);
    expect(firings).toBe(1);
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('firings are skipped'),
        details: expect.objectContaining({ job: 'syncCron', skipped: 1 }),
      }),
    );
    if (finish === 'resolves') later.resolve();
    else later.reject(new Error('Google went away'));
    await expect.poll(() => lines.at(-1)?.message).toMatch(/finished|failed/);
    expect(lines.at(-1)).toMatchObject(
      finish === 'resolves'
        ? {
            level: 'info',
            message: 'NocoReach timer that outlived its deadline finished',
          }
        : {
            level: 'warn',
            message: 'NocoReach timer that outlived its deadline failed',
            details: expect.objectContaining({ message: 'Google went away' }),
          },
    );
    expect(await legacy.tick(job, { deadline: 20 })).toBe(true);
    expect(firings).toBe(2);
  });
}

test('a firing still running when shutdown gives up on it writes and sends nothing more; other work still does', async () => {
  const written: unknown[] = [];
  const repository = {
    createOne: async ({ values }: { values: unknown }) => {
      written.push(values);
      return { record: values };
    },
  };
  const manager = {
    repository: () => repository,
    collections: () => ({ get: async () => ({ fields: [] }) }),
    transaction: async (fn: (connection: object) => unknown) =>
      fn({
        repository: () => repository,
        collections: { get: async () => ({ fields: [] }) },
      }),
  };
  const db = new LegacyDatabase(
    manager as unknown as ConstructorParameters<typeof LegacyDatabase>[0],
    { generate: () => '1' } as unknown as ConstructorParameters<
      typeof LegacyDatabase
    >[1],
  );
  const { logger } = recordingLogger();
  const legacy = new LegacyApp(db, logger, {
    all: () => ({}),
  } as unknown as LegacyVariables);
  db.refuseWritesWhen(() => legacy.abandoned());
  const network = new OutboundNetwork({} as ProxyProfiles);
  network.refuseWhen(() => legacy.abandoned());
  const closed = Promise.withResolvers<void>();
  const refused: Record<string, unknown> = {};
  const outcome = (name: string) => ({
    then: () => {
      refused[name] = 'allowed';
    },
    error: (error: unknown) => {
      refused[name] = error;
    },
  });
  const job = legacy.cronJobManager.addJob({
    name: 'articleCron',
    cronTime: '* * * * * *',
    // As a source does once the network is about to close: it sends the next request, then records the outcome.
    onTick: async () => {
      await closed.promise;
      const sent = outcome('fetch');
      await network
        .fetch('site', 'https://cms.example.com/api/upload', {}, '1')
        .then(sent.then, sent.error);
      const created = outcome('create');
      await db
        .getRepository('nrSnapshots')
        .create({ values: { key: 'github:1', payload: { failedAt: 'now' } } })
        .then(created.then, created.error);
      const opened = outcome('transaction');
      await db.sequelize
        .transaction(async () => undefined)
        .then(opened.then, opened.error);
    },
  });
  const shutdown = new AbortController();
  shutdown.abort();
  expect(await legacy.tick(job, { signal: shutdown.signal })).toBe(true);
  expect(await legacy.settle(20)).toBe(false);
  expect(legacy.abandon()).toBe(1);
  closed.resolve();
  await expect.poll(() => Object.keys(refused).length).toBe(3);
  expect(refused).toMatchObject({
    fetch: { code: 'NR_SHUTTING_DOWN' },
    create: { code: 'NR_SHUTTING_DOWN' },
    transaction: { code: 'NR_SHUTTING_DOWN' },
  });
  expect(written).toEqual([]);
  // Work outside the firing goes on.
  expect(() => network.admit()).not.toThrow();
  await db
    .getRepository('nrSnapshots')
    .create({ values: { key: 'other', payload: {} } });
  await db.sequelize.transaction(async () => undefined);
  expect(written).toHaveLength(1);
});

test('a GitHub trends read the server stops does not save the run, so the day is not marked as read', async () => {
  const entered = Promise.withResolvers<void>();
  // The network closes under the request in flight, as at shutdown.
  const closed = Promise.withResolvers<Response>();
  const { plugin, rows } = trendsPlugin(() => {
    entered.resolve();
    return closed.promise;
  });
  const trends = new GitHubTrends(plugin);
  trends.sleep = async () => {};
  const tick = trends.tick();
  await entered.promise;
  trends.stop();
  closed.reject(
    Object.assign(new Error('network closed'), {
      status: 502,
      code: 'NR_NETWORK_CLOSED',
    }),
  );
  await tick;
  expect(rows[KEY('1')]).toBeUndefined();
});

test('a GitHub request that never answers fails at its own deadline and is reported with the run', async () => {
  // The project fetcher (undici) rejects when the request's signal aborts.
  const { plugin, rows } = trendsPlugin(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(init.signal!.reason),
          { once: true },
        );
      }),
  );
  const trends = new GitHubTrends(plugin);
  trends.timeout = 30;
  trends.sleep = async () => {};
  const started = Date.now();
  await trends.tick();
  expect(Date.now() - started).toBeLessThan(2000);
  const lastRun = (
    rows[KEY('1')] as { lastRun: { ok: boolean; errors: string[] } }
  ).lastRun;
  expect(lastRun.ok).toBe(false);
  expect(lastRun.errors.length).toBeGreaterThan(0);
});

test("a demo or simulated project's searches wait for no pacing; a live project's still do", async () => {
  const answer = async (url: string | URL) =>
    String(url).includes('/trending')
      ? new Response('', { status: 200 })
      : json({ total_count: 1, items: [] });
  const waits = async (network: object) => {
    const { plugin } = trendsPlugin(answer, network);
    const trends = new GitHubTrends(plugin);
    const slept: number[] = [];
    trends.sleep = async (ms: number) => {
      slept.push(ms);
    };
    await trends.tick();
    return slept.length;
  };
  expect(await waits({ inDemoProject: async () => true })).toBe(0);
  expect(await waits({ simulation: { enabled: true } })).toBe(0);
  expect(await waits({ inDemoProject: async () => false })).toBeGreaterThan(0);
});
