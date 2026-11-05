// @vitest-environment node
// NocoReach's timers share one schedule executor that runs one firing at a time (the built-in memory jobs
// configuration). A firing that does not end used to stop every other timer, and kept the executor from shutting down:
// LegacyApp.tick now lets the executor go on after a deadline while the firing finishes on its own. GitHub trends'
// requests keep their own deadline, and a demo or simulated project's searches no longer wait for GitHub's pacing.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createJobExecutorService, type ScheduleEvent } from '@nocobase/jobs';
import { afterEach, expect, test } from 'vitest';

import { GitHubTrends, KEY } from '../../server/nocoreach/github-trends.js';
import {
  LegacyApp,
  type LegacyLogger,
} from '../../server/nocoreach/legacy/app.js';
import type { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import type { LegacyVariables } from '../../server/nocoreach/legacy/variables.js';

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
  expect(end.at - start.at).toBeGreaterThanOrEqual(250);
  expect(end.at - start.at).toBeLessThan(2000);
  expect(lines).toContainEqual(
    expect.objectContaining({
      level: 'warn',
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
