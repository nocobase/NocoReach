// @vitest-environment node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { demoDataToken } from '@nocobase/app-plugin-demo-mode/server/tokens';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { historyBounds } from '../../server/nocoreach/search-history';

const enabled = process.env.DEMO_RESOURCE_TEST === '1';
const test = createAppTest({
  createServer: createStandaloneServer,
  env: {
    ...process.env,
    NOCOBASE_TEST_DB_DIALECT: 'sqlite',
    NOCOBASE_TEST_DB_SQLITE_DIRECTORY: path.join(
      tmpdir(),
      `nr-resource-${randomUUID()}`,
    ),
  },
  server: {
    env: { DB_FILENAME: undefined, APP_PUBLIC_ORIGIN: 'http://localhost' },
  },
  config: {
    app: { publicOrigin: 'http://localhost' },
    users: {
      initialAdmin: { ...DEFAULT_ADMIN_CREDENTIALS, name: 'Resource test' },
    },
    secrets: { keys: [{ version: 1, key: 'a'.repeat(64) }] },
    agents: { vectors: { store: false } },
    nocoreach: { publicDns: '' },
    demoMode: { enabled: true },
  },
});
vi.setConfig({ testTimeout: 1_800_000, hookTimeout: 300_000 });
process.env.NOCOREACH_DEMO_AGENT_PACE = '0';

test.skipIf(!enabled)(
  'bounds resources across full application demo resets',
  async ({ testApp, connection }) => {
    assert.equal(process.version, 'v24.22.1');
    assert(global.gc, 'Run through tests/nocoreach/resource/run.py');
    // Freeze dates only: real timers, I/O and performance.now remain live.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-29T08:00:00Z'));
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        throw new Error(`Unexpected external fetch: ${String(input)}`);
      });
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const demo = testApp.application.container.resolve(demoDataToken);
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const adminId = String(
      (await connection
        .repository('user')
        .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } }))!.id,
    );
    const disk = testApp.application.container
      .resolve(driveManagerToken)
      .use('local');
    // A separate thread samples process RSS even while report generation blocks the main event loop.
    const rssBeforeSampler = process.memoryUsage.rss();
    const rssWorker = new Worker(
      `
      const { parentPort } = require('node:worker_threads');
      let peak = 0;
      const sample = () => { peak = Math.max(peak, process.memoryUsage.rss()); };
      const timer = setInterval(sample, 5);
      parentPort.on('message', (action) => {
        if (action === 'start') peak = 0;
        sample();
        parentPort.postMessage(peak);
      });
    `,
      { eval: true, execArgv: [] },
    );
    const sampleRss = (action: string) =>
      new Promise<number>((resolve) => {
        rssWorker.once('message', resolve);
        rssWorker.postMessage(action);
      });
    const rssAfterSampler = await sampleRss('stop');
    const profileEnabled = process.env.DEMO_RESOURCE_PROFILE === '1';
    let profiler: import('node:inspector/promises').Session | undefined;
    if (profileEnabled) {
      const { Session } = await import('node:inspector/promises');
      profiler = new Session();
      profiler.connect();
      await profiler.post('HeapProfiler.startSampling', {
        samplingInterval: 65536,
      });
    }
    const report: Record<string, unknown> = {
      node: process.version,
      pid: process.pid,
      parentPid: process.ppid,
      rssSamplerThreadId: rssWorker.threadId,
      rssSamplerIntervalMs: 5,
      heapSamplerIntervalMs: 10,
      rssBeforeSampler,
      rssAfterSampler,
      profileEnabled,
      date: new Date().toISOString(),
      language: 'en-US',
      rounds: [],
      warmup: null,
    };
    const save = () =>
      writeFileSync(
        process.env.DEMO_RESOURCE_RESULT!,
        JSON.stringify(report, null, 2),
      );
    const retained = async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      global.gc!();
      await new Promise<void>((resolve) => setImmediate(resolve));
      global.gc!();
      return process.memoryUsage().heapUsed;
    };
    const measure = async (name: string, action: () => Promise<unknown>) => {
      let heap = 0,
        rss = 0;
      const sample = () => {
        const m = process.memoryUsage();
        heap = Math.max(heap, m.heapUsed);
        rss = Math.max(rss, m.rss);
      };
      sample();
      const timer = setInterval(sample, 10);
      const start = performance.now();
      await sampleRss('start');
      console.log(`RESOURCE_PHASE_START ${name}`);
      try {
        await action();
      } finally {
        sample();
        clearInterval(timer);
      }
      const elapsedMs = performance.now() - start;
      const windowPeakRss = await sampleRss('stop');
      // GC is allowed only after the operation and peak sampling have stopped.
      const retainedHeap = await retained();
      const result = {
        name,
        elapsedMs,
        sampledPeakHeap: heap,
        sampledPeakRss: rss,
        windowPeakRss,
        processMaxRss: process.resourceUsage().maxRSS * 1024,
        retainedHeap,
      };
      console.log(`RESOURCE_PHASE_END ${JSON.stringify(result)}`);
      return result;
    };
    const integrity = async () => {
      const status = await demo.status();
      assert.equal(status.failure, null);
      assert.equal(status.present, true);
      assert.equal(status.language, 'en-US');
      assert.equal(status.accounts.length, 5);
      const marker = await connection
        .repository('demoModeDatasets')
        .findOne({ filter: { id: 'nocoreach' } });
      const data =
        typeof marker!.data === 'string'
          ? JSON.parse(marker!.data)
          : marker!.data;
      assert.deepEqual(data.skipped, []);
      const projects = (await runtime.plugin.projects.all()) as {
        id: string;
        name: string;
      }[];
      assert.equal(projects.length, 2);
      const counts = [];
      for (const project of projects) {
        const id = String(project.id);
        const tasks = await runtime.plugin.db
          .getRepository('nrTasks')
          .count({ filter: { projectId: id } });
        assert.equal(tasks, project.name === 'Acme' ? 47 : 39);
        const partitions = await connection.query
          .selectFrom('nrSyncPartitions')
          .select(['source', 'grain', 'date'])
          .where('projectId', '=', id)
          .execute<{ source: string; grain: string; date: string }>();
        const coverage: Record<string, string[]> = {};
        for (const row of partitions)
          (coverage[`${row.source}:${row.grain}`] ??= []).push(row.date);
        for (const dates of Object.values(coverage)) dates.sort();
        assert(partitions.length > 2000);
        assert(
          Object.values(coverage).some(
            (dates) => dates[0] === historyBounds(runtime.plugin, id).earliest,
          ),
        );
        counts.push({ name: project.name, tasks, coverage });
      }
      assert.equal(
        (await admin.fetch('/demoMode/data')).status,
        200,
        'Existing administrator session survives reset',
      );
      return counts;
    };
    try {
      report.warmup = await measure('warmup', () =>
        demo.importNow(adminId, 'en-US'),
      );
      await profiler?.post('HeapProfiler.stopSampling').then((profile) => {
        writeFileSync(
          path.join(
            path.dirname(process.env.DEMO_RESOURCE_RESULT!),
            'allocation-profile.json',
          ),
          JSON.stringify(profile),
        );
      });
      profiler?.disconnect();
      save();
      report.integrity = await integrity();
      save();
      for (let round = 1; round <= 5; round++) {
        const id = randomUUID();
        const key = `resource/${id}.txt`;
        await disk.put(key, Buffer.from('visitor attachment'));
        await connection.repository('nrTaskMedia').createOne({
          values: {
            id,
            disk: 'local',
            key,
            filename: 'visitor.txt',
            ext: 'txt',
            mimeType: 'text/plain',
            size: 18,
            createdAt: new Date(),
            updatedAt: new Date(),
            ownerId: adminId,
            sessionId: 'resource',
            projectId: 'orphan',
            draftId: id,
            expiresAt: new Date(Date.now() + 60000),
            deleting: false,
          },
        });
        const result = await measure(`reset-${round}`, () =>
          demo.reset(adminId, 'en-US', { wait: true }),
        );
        (report.rounds as unknown[]).push(result);
        save();
        assert.deepEqual(await integrity(), report.integrity);
        assert.equal(await disk.exists(key), false);
        assert.equal(await connection.repository('nrTaskMedia').count(), 0);
      }
      report.resetComplete = true;
      save();
      // A separate consumer stress phase: long reports are not part of reset timing.
      report.annualReports = await measure('annual-reports', async () => {
        for (const project of (await runtime.plugin.projects.all()) as {
          id: string;
        }[]) {
          const website = await runtime.plugin.dataViews.website(
            String(project.id),
            { range: '12m' },
          );
          assert.equal(website.complete, true);
          assert(
            website.daily.length >= 365 && website.previousDaily.length >= 365,
          );
          assert(
            website.totals.current.sessions > 0 &&
              website.totals.previous.sessions > 0,
          );
        }
      });
      save();
      report.clear = await measure('clear', () => demo.clear(adminId));
      assert.equal(
        ((await runtime.plugin.projects.all()) as unknown[]).length,
        0,
      );
      assert.equal((await demo.status()).present, false);
      save();
      report.externalFetches = network.mock.calls.length;
      assert.equal(network.mock.calls.length, 0);
      for (const result of report.rounds as {
        sampledPeakHeap: number;
        processMaxRss: number;
        windowPeakRss: number;
        retainedHeap: number;
        elapsedMs: number;
      }[]) {
        assert(
          result.sampledPeakHeap < 900 * 1024 ** 2,
          'Full application heap budget: 900 MiB',
        );
        assert(
          result.processMaxRss < 1400 * 1024 ** 2,
          'Full application RSS budget: 1400 MiB',
        );
        assert(
          result.retainedHeap < 400 * 1024 ** 2,
          'Retained heap budget: 400 MiB',
        );
        assert(result.elapsedMs < 300000, 'Reset deadline: 300 seconds');
      }
      report.complete = true;
      save();
    } finally {
      profiler?.disconnect();
      await rssWorker.terminate();
      network.mockRestore();
      vi.useRealTimers();
    }
  },
);
