// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database';
import { SyncService } from '../../server/nocoreach/sync-service';
import { DataViews } from '../../server/nocoreach/data-views';
import {
  datesBetween,
  historyBounds,
} from '../../server/nocoreach/search-history';
import { GOOGLE_HISTORY_CACHE_MS } from '../../shared/google-cache';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const site = 'sc-domain:example.test',
  id = '454';
const row = (date: string, clicks = 10) => ({
  date,
  clicks,
  impressions: clicks * 10,
  position: 4,
});
async function fixture() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-10-16T12:00:00Z');
  const testDb = await createNocoReachTestDatabase();
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const parts = db.getRepository('nrSyncPartitions'),
    jobs = db.getRepository('nrSyncJobs');
  await db.getRepository('nrGoogleLinks').create({
    values: {
      projectId: id,
      ga4PropertyId: '123',
      gscSiteUrl: site,
      status: 'active',
      scheduleEnabled: true,
    },
  });
  const state = {
    fail: false,
    empty: new Set<string>(),
    clicks: 10,
    malformed: false,
  };
  const upstream = vi.fn(async (_url: string | URL, init?: RequestInit) => {
    if (state.fail)
      throw Object.assign(new Error('synthetic timeout'), {
        code: 'network_unreachable',
      });
    if (state.malformed) return Response.json({ rows: 'invalid' });
    const body = JSON.parse(String(init?.body));
    if (body.dateRanges) return Response.json({ rows: [], rowCount: 0 });
    return Response.json({
      rows: datesBetween(body.startDate, body.endDate)
        .filter((d) => !state.empty.has(d))
        .map((date) => ({
          keys: body.dimensions.map(
            (dimension: string) =>
              ({
                date,
                query: 'query',
                page: 'https://example.test/',
                country: 'usa',
                device: 'DESKTOP',
              })[dimension],
          ),
          clicks: state.clicks,
          impressions: state.clicks * 10,
          position: 4,
          ctr: 0.1,
        })),
    });
  });
  const plugin = {
    db,
    link: async () =>
      (await db
        .getRepository('nrGoogleLinks')
        .findOne({ filter: { projectId: id } }))!,
    env: () => 'synthetic-test-secret',
    project: async () => ({
      id,
      domains: ['example.test'],
      analyticsPropertyId: '123',
      searchConsoleProperty: site,
    }),
    token: vi.fn(async () => 'synthetic-token'),
    googleJson: async () => ({ timeZone: 'UTC' }),
    googleFetch: () => upstream,
    app: { logger: { warn: vi.fn(), info: vi.fn() } },
  };
  const sync = new SyncService(plugin);
  const views = () => new DataViews({ ...plugin, sync });
  const enqueue = (startDate: string, endDate: string, mode = 'missing') =>
    sync.enqueueHistory(id, { scope: 'gscOverview', startDate, endDate, mode });
  const save = async (
    date: string,
    payload: unknown = [row(date)],
    extra = {},
  ) =>
    parts.create({
      values: {
        partitionKey: JSON.stringify([id, 'gsc', site, date, 'overview']),
        projectId: id,
        source: 'gsc',
        resource: site,
        grain: 'overview',
        date,
        payload,
        ...extra,
      },
    });
  const drain = async () => {
    for (let n = 0; n < 150 && (await sync.step(id)); n++);
  };
  return {
    db,
    parts,
    jobs,
    state,
    upstream,
    plugin,
    sync,
    views,
    enqueue,
    save,
    drain,
  };
}

it('durably reuses 90-day totals across a year, restart and report-cache expiry; only missing dates cost requests', async () => {
  const f = await fixture(),
    end = '2026-10-13';
  const short = datesBetween('2026-07-16', end);
  for (const date of short) await f.save(date);
  expect((await f.enqueue(short[0], end)).jobs).toEqual([]);
  const first = await f.views().search(id, { range: '90' });
  expect(first.complete).toBe(true);
  expect(first.totals.clicks).toBe(900);
  const year = await f.views().search(id, { range: '12m' });
  expect(year.window).toMatchObject({ start: '2025-10-14', end });
  expect(year.coverage.current.missingDays).toBe(275);
  const submitted = await f.enqueue(year.window.start, end);
  expect(submitted.jobs).toHaveLength(1);
  expect(submitted.jobs[0]).toMatchObject({
    startDate: '2025-10-14',
    endDate: '2026-07-15',
    trigger: 'history-fill',
  });
  await f.drain();
  expect(f.upstream).toHaveBeenCalledTimes(40);
  expect(
    f.upstream.mock.calls.every(([, init]) => {
      const b = JSON.parse(String(init?.body));
      return (
        b.type === 'web' &&
        b.dataState === 'final' &&
        b.dimensions.join() === 'date'
      );
    }),
  ).toBe(true);
  expect(
    await f.parts.count({ filter: { projectId: id, grain: 'query_page' } }),
  ).toBe(0);
  const full = await f.views().search(id, { range: '12m' });
  expect(full.totals.clicks).toBe(3650);
  expect(full.complete).toBe(true);
  vi.setSystemTime(Date.now() + GOOGLE_HISTORY_CACHE_MS + 1);
  expect((await f.views().search(id, { range: '12m' })).totals.clicks).toBe(
    3650,
  );
  expect((await f.views().search(id, { range: '90' })).totals.clicks).toBe(900);
  expect((await f.enqueue(year.window.start, end)).jobs).toEqual([]);
  expect(f.upstream).toHaveBeenCalledTimes(40);
  const link = await f.plugin.link();
  expect(link.get('lastSyncAt')).toBeFalsy();
  expect(link.get('nextSyncAt')).toBeFalsy();
});

it('keeps no-record dates, true zero values and missing days distinct and comparisons unavailable', async () => {
  const f = await fixture();
  f.state.empty.add('2026-10-12');
  f.state.clicks = 0;
  await f.enqueue('2026-10-11', '2026-10-13');
  await f.drain();
  const report = await f.views().search(id, { range: '7' });
  expect(report.coverage.current).toMatchObject({
    recordedDays: 2,
    noRecordDays: 1,
    missingDays: 4,
  });
  expect(report.trend.find((p) => p.date === '2026-10-11').clicks).toBe(0);
  expect(report.trend.find((p) => p.date === '2026-10-12').clicks).toBeNull();
  expect(report.trend.find((p) => p.date === '2026-10-10').clicks).toBeNull();
  expect(report.previous).toBeNull();
  expect(report.movers).toBeNull();
  const requests = f.upstream.mock.calls.length;
  await f.enqueue('2026-10-11', '2026-10-13');
  await f.drain();
  expect(f.upstream).toHaveBeenCalledTimes(requests);
  f.state.empty.clear();
  vi.setSystemTime(Date.now() + 1000);
  await f.enqueue('2026-10-12', '2026-10-12', 'refresh');
  await f.drain();
  expect(
    (await f.views().search(id, { range: '7' })).coverage.current.noRecordDays,
  ).toBe(0);
});

it('preserves saved values on failures, stops after bounded retries and resumes only by explicit retry', async () => {
  const f = await fixture();
  await f.save('2026-10-13', [row('2026-10-13', 42)]);
  await f.enqueue('2026-10-07', '2026-10-13', 'refresh');
  f.state.fail = true;
  for (let n = 0; n < 3; n++) {
    expect(await f.sync.step(id)).toBe(false);
    vi.setSystemTime(Date.now() + 180000);
  }
  expect(
    (await f.jobs.find({ filter: { projectId: id } }))[0].get('status'),
  ).toBe('failed');
  expect(await f.parts.count({ filter: { projectId: id } })).toBe(1);
  expect((await f.views().search(id, { range: '7' })).totals.clicks).toBe(42);
  await f.enqueue('2026-10-07', '2026-10-13');
  expect(await f.jobs.count({ filter: { projectId: id } })).toBe(1);
  f.state.fail = false;
  await f.sync.control(id, 'retry');
  await f.drain();
  expect((await f.views().search(id, { range: '7' })).complete).toBe(true);
  expect(f.upstream).toHaveBeenCalledTimes(4);
});

it('deduplicates overlapping requests, respects pause and skips dates filled by ordinary sync while waiting', async () => {
  const f = await fixture();
  await Promise.all([
    f.enqueue('2026-10-01', '2026-10-13'),
    f.enqueue('2026-10-01', '2026-10-13'),
  ]);
  expect(await f.jobs.count({ filter: { projectId: id } })).toBe(1);
  await f.sync.control(id, 'pause');
  await f.enqueue('2026-10-01', '2026-10-13');
  expect(await f.sync.step(id)).toBe(false);
  for (const date of datesBetween('2026-10-01', '2026-10-07'))
    await f.save(date, [row(date, 99)]);
  await f.sync.control(id, 'resume');
  await f.drain();
  expect(f.upstream).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(f.upstream.mock.calls[0][1]?.body))).toMatchObject({
    startDate: '2026-10-08',
    endDate: '2026-10-13',
  });
  expect(
    (
      await f.parts.findOne({ filter: { projectId: id, date: '2026-10-01' } })
    ).get('payload')[0].clicks,
  ).toBe(99);
});

it('refreshes recent saved values without touching old history, rejects malformed upstream data and isolates resources', async () => {
  const f = await fixture();
  await f.save('2025-12-01', [row('2025-12-01', 77)]);
  await f.save('2026-10-13', [row('2026-10-13', 42)]);
  await f.enqueue('2026-10-07', '2026-10-13', 'refresh');
  f.state.malformed = true;
  expect(await f.sync.step(id)).toBe(false);
  expect(await f.parts.count({ filter: { projectId: id } })).toBe(2);
  f.state.malformed = false;
  f.state.clicks = 20;
  await f.sync.control(id, 'retry');
  await f.drain();
  expect(
    (
      await f.parts.findOne({ filter: { projectId: id, date: '2025-12-01' } })
    ).get('payload')[0].clicks,
  ).toBe(77);
  expect(
    (
      await f.parts.findOne({ filter: { projectId: id, date: '2026-10-13' } })
    ).get('payload')[0].clicks,
  ).toBe(20);
  await f.save('2026-10-12', [row('2026-10-12', 900)], {
    projectId: 'other',
    partitionKey: 'other',
  });
  await f.save('2026-10-12', [row('2026-10-12', 900)], {
    resource: 'sc-domain:other.test',
    partitionKey: 'other-site',
  });
  expect((await f.views().search(id, { range: '7' })).totals.clicks).toBe(140);
  await expect(
    f.sync.enqueueHistory(id, {
      scope: 'gscOverview',
      startDate: 'bad',
      endDate: '2026-10-13',
      mode: 'missing',
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    f.sync.enqueueHistory(id, {
      scope: 'gscOverview',
      startDate: '2026-10-01',
      endDate: '2026-10-13',
      mode: 'missing',
      type: 'image',
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect(historyBounds({}, id)).toEqual({
    earliest: '2025-06-16',
    cutoff: '2026-10-13',
  });
});

it('scheduled seven-day sync refreshes recent overview only and leaves durable older days and the equal-period comparison intact', async () => {
  const f = await fixture();
  for (const date of datesBetween('2026-09-30', '2026-10-13'))
    await f.save(date);
  await f.save('2025-12-01', [row('2025-12-01', 77)]);
  const equal = await f.views().search(id, { range: '7' });
  expect(equal.complete && equal.previousComplete).toBe(true);
  expect(equal.previous.clicks).toBe(equal.totals.clicks);
  f.state.clicks = 20;
  vi.setSystemTime(Date.now() + 1000);
  await f.sync.enqueue(id, 7, 'scheduled');
  await f.drain();
  expect(
    (
      await f.parts.findOne({ filter: { projectId: id, date: '2025-12-01' } })
    ).get('payload')[0].clicks,
  ).toBe(77);
  expect((await f.views().search(id, { range: '7' })).totals.clicks).toBe(140);
  expect(
    f.upstream.mock.calls.filter(
      ([, init]) =>
        JSON.parse(String(init?.body)).dimensions?.join() === 'date',
    ),
  ).toHaveLength(1);
});

it('retries from the failed cursor without fetching previously committed batches', async () => {
  const f = await fixture();
  await f.enqueue('2026-10-01', '2026-10-13');
  expect(await f.sync.step(id)).toBe(true);
  f.state.malformed = true;
  expect(await f.sync.step(id)).toBe(false);
  const job = (await f.jobs.find({ filter: { projectId: id } }))[0];
  expect(job.get('cursor')).toBe('2026-10-08');
  expect(await f.parts.count({ filter: { projectId: id } })).toBe(7);
  f.state.malformed = false;
  await f.sync.control(id, 'retry');
  await f.drain();
  expect(
    f.upstream.mock.calls.map(
      ([, init]) => JSON.parse(String(init?.body)).startDate,
    ),
  ).toEqual(['2026-10-01', '2026-10-08', '2026-10-08']);
});

it('queries filters across their actual range independently of local coverage, without storing them as web totals', async () => {
  const f = await fixture();
  await f.save('2026-10-13');
  const views = f.views();
  const filtered = await views.search(id, {
    range: '12m',
    country: 'usa',
    queryFilter: { operator: 'equals', expression: 'query' },
  });
  expect(filtered.totals.clicks).toBe(3650);
  expect(filtered.complete).toBe(true);
  expect(filtered.trend[0].clicks).toBe(10);
  expect(f.upstream).toHaveBeenCalledTimes(1);
  const [request] = f.upstream.mock.calls.map(([, init]) =>
    JSON.parse(String(init?.body)),
  );
  expect(request.startDate >= '2025-06-16').toBe(true);
  expect(request.dimensions.join()).toBe('date');
  // Web search only (2026-10-22).
  expect(request.type).toBe('web');
  expect(request.dimensionFilterGroups[0].filters).toEqual([
    { dimension: 'country', operator: 'equals', expression: 'usa' },
    { dimension: 'query', operator: 'equals', expression: 'query' },
  ]);
  expect(await f.parts.count({ filter: { projectId: id } })).toBe(1);
  expect(
    (await views.search(id, { range: '12m' })).coverage.current.missingDays,
  ).toBe(364);
});
