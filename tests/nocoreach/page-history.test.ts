// @vitest-environment node
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { afterEach, expect, it, vi } from 'vitest';
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database.js';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';
import { pageDaysFilled } from '../../server/nocoreach/page-days.js';
import { historyBounds } from '../../server/nocoreach/search-history.js';
import { SyncService } from '../../server/nocoreach/sync-service.js';

afterEach(() => vi.useRealTimers());
const projectId = '7';
const site = 'sc-domain:example.test';
const property = '123';
const day = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);

async function fixture() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-11-07T20:00:00Z');
  const testDb = await createNocoReachTestDatabase('fresh');
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  await db.getRepository('nrGoogleLinks').create({
    values: {
      projectId,
      ga4PropertyId: property,
      gscSiteUrl: site,
      status: 'active',
      scheduleEnabled: true,
    },
  });
  const link = () =>
    db.getRepository('nrGoogleLinks').findOne({ filter: { projectId } });
  const project = {
    id: projectId,
    analyticsPropertyId: property,
    searchConsoleProperty: site,
  };
  const logs: unknown[][] = [];
  const plugin = {
    db,
    link,
    env: () => 'secret',
    project: async () => project,
    projects: { update: async () => undefined },
    token: async () => 'token',
    googleJson: async () => ({ timeZone: 'UTC' }),
    app: {
      logger: {
        info: (...a: unknown[]) => logs.push(a),
        warn: (...a: unknown[]) => logs.push(a),
      },
    },
  };
  const sync = new SyncService(plugin);
  // Google answers one row a day for each report asked for.
  const asked: {
    source: string;
    reportTypes: string[];
    start: string;
    end: string;
  }[] = [];
  sync.collector = (o: { reportTypes: string[] }) => {
    const c = {
      batches: [] as Record<string, unknown>[],
      run(
        source: string,
        { startDate, endDate }: { startDate: string; endDate: string },
      ) {
        asked.push({
          source,
          reportTypes: o.reportTypes,
          start: startDate,
          end: endDate,
        });
        for (let d = startDate; d <= endDate; d = day(d, 1))
          for (const grain of o.reportTypes)
            c.batches.push(
              grain === 'query_page'
                ? {
                    periodDate: d,
                    grainType: grain,
                    queryFull: 'crm',
                    page: 'https://example.test/a',
                    clicks: 1,
                    impressions: 10,
                    avgPosition: 3,
                  }
                : grain === 'page'
                  ? {
                      periodDate: d,
                      grainType: grain,
                      hostname: 'example.test',
                      pagePath: '/a',
                      views: 5,
                      keyEvents: 0,
                    }
                  : {
                      periodDate: d,
                      grainType: grain,
                      views: 1,
                      clicks: 1,
                      impressions: 1,
                    },
            );
      },
      syncGsc: async (r: { startDate: string; endDate: string }) =>
        c.run('gsc', r),
      syncGa4: async (r: { startDate: string; endDate: string }) =>
        c.run('ga4', r),
    };
    return c;
  };
  const partitions = db.getRepository('nrSyncPartitions');
  const store = (
    source: string,
    grain: string,
    date: string,
    payload: unknown[] = [],
  ) =>
    partitions.create({
      values: {
        partitionKey: JSON.stringify([
          projectId,
          source,
          source === 'ga4' ? property : site,
          date,
          grain,
        ]),
        projectId,
        source,
        resource: source === 'ga4' ? property : site,
        date,
        grain,
        payload,
      },
    });
  const jobs = () =>
    db
      .getRepository('nrSyncJobs')
      .find({ filter: { projectId }, sort: ['createdAt'] });
  return { db, sync, link, asked, store, jobs, partitions, logs };
}

it('queues the days of each source with no page grain stored, once, leaving the recent days to the sync', async () => {
  const { sync, store, jobs, db } = await fixture();
  const { earliest, cutoff } = historyBounds({}, projectId);
  const last = day(cutoff, -14);
  // Search Console holds a stretch already; GA4 holds nothing.
  for (let d = day(last, -9); d <= day(last, -5); d = day(d, 1))
    await store('gsc', 'query_page', d);
  // An overview partition is not a page day.
  await store('ga4', 'overview', earliest);
  const queued = await sync.enqueuePageHistory(projectId);
  const ranges = queued.jobs.map((j: Record<string, unknown>) => [
    j.source,
    j.startDate,
    j.endDate,
    j.trigger,
  ]);
  expect(ranges).toEqual([
    ['gsc', earliest, day(last, -10), 'page-history'],
    ['gsc', day(last, -4), last, 'page-history'],
    ['ga4', earliest, last, 'page-history'],
  ]);
  expect((await sync.enqueuePageHistory(projectId)).jobs).toEqual([]);
  // A job that failed lately holds its days: Retry failed jobs retries it, nothing is queued again.
  await db
    .getRepository('nrSyncJobs')
    .update({ filter: { projectId }, values: { status: 'failed' } });
  expect(await sync.enqueuePageHistory(projectId)).toEqual({
    jobs: [],
    retried: 0,
  });
  expect((await jobs()).length).toBe(3);
  // A day later the failed jobs are queued again from where they stopped, not added again; only the day the cutoff
  // moved on is new.
  vi.setSystemTime(Date.now() + 86400000 + 1000);
  const later = await sync.enqueuePageHistory(projectId);
  expect(later.retried).toBe(3);
  expect(
    later.jobs.map((j: Record<string, unknown>) => [
      j.source,
      j.startDate,
      j.endDate,
    ]),
  ).toEqual([
    ['gsc', day(last, 1), day(last, 1)],
    ['ga4', day(last, 1), day(last, 1)],
  ]);
  expect((await jobs()).slice(0, 3).map((j) => j.get('status'))).toEqual([
    'queued',
    'queued',
    'queued',
  ]);
});

it('queues the days of a succeeded page history job again once they are no longer stored', async () => {
  const { sync, store, jobs, db, partitions } = await fixture();
  const { cutoff } = historyBounds({}, projectId);
  const last = day(cutoff, -14);
  await sync.enqueuePageHistory(projectId);
  await db
    .getRepository('nrSyncJobs')
    .update({ filter: { projectId }, values: { status: 'succeeded' } });
  // The succeeded jobs stored every day but one week of Search Console's (removed by an import, say).
  const { earliest } = historyBounds({}, projectId);
  for (const source of ['gsc', 'ga4'])
    for (let d = earliest; d <= last; d = day(d, 1))
      if (source === 'ga4' || d < day(last, -20) || d > day(last, -14))
        await store(source, source === 'ga4' ? 'page' : 'query_page', d);
  const queued = await sync.enqueuePageHistory(projectId);
  expect(
    queued.jobs.map((j: Record<string, unknown>) => [
      j.source,
      j.startDate,
      j.endDate,
    ]),
  ).toEqual([['gsc', day(last, -20), day(last, -14)]]);
  expect((await jobs()).length).toBe(3);
  expect(await partitions.count({ filter: { projectId } })).toBeGreaterThan(0);
});

it("leaves page history to the end of the tick's firing", async () => {
  const { sync, asked } = await fixture();
  await sync.enqueuePageHistory(projectId);
  // The firing's first loop takes no page history step.
  expect(await sync.step(undefined, { pageHistory: false })).toBe(false);
  expect(asked).toEqual([]);
  expect(await sync.step()).toBe(true);
  expect(asked[0].reportTypes).toEqual(['query_page']);
});

it('runs page history after the other jobs, writes the page grain only, and holds back neither a sync nor an overview fill', async () => {
  const { sync, store, jobs, asked, link, db, partitions } = await fixture();
  const { cutoff } = historyBounds({}, projectId);
  await sync.enqueuePageHistory(projectId);
  // A scheduled sync queued after it is still queued and runs first.
  const scheduled = await sync.enqueue(projectId, 7, 'scheduled');
  expect(scheduled.alreadyQueued).toBeUndefined();
  expect(scheduled.jobs.length).toBe(2);
  // An overview fill over the same days is not taken as covered by page history.
  const overview = await sync.enqueueHistory(projectId, {
    scope: 'gscOverview',
    mode: 'missing',
    startDate: day(cutoff, -120),
    endDate: day(cutoff, -100),
  });
  expect(overview.jobs.map((j: Record<string, unknown>) => j.trigger)).toEqual([
    'history-fill',
  ]);
  for (let i = 0; i < 3; i++) await sync.step();
  expect(asked.slice(0, 2).map((a) => [a.source, a.reportTypes])).toEqual([
    ['ga4', ['overview', 'source', 'page']],
    ['gsc', ['overview', 'query_page']],
  ]);
  expect(asked[2].reportTypes).toEqual(['overview']);
  await db.getRepository('nrSyncJobs').update({
    filter: { projectId, trigger: { $ne: 'page-history' } },
    values: { status: 'succeeded' },
  });
  await db
    .getRepository('nrGoogleLinks')
    .update({ filter: { projectId }, values: { lastSyncAt: null } });
  // The page history's first days: a day a sync stored meanwhile is left as it is.
  const history = (await jobs()).filter(
    (j) => j.get('trigger') === 'page-history',
  );
  const gsc = history.find((j) => j.get('source') === 'gsc')!;
  const first = String(gsc.get('startDate'));
  await store('gsc', 'query_page', day(first, 2));
  asked.length = 0;
  // The two sources' page history, in the order queued: GA4 page, then Search Console query × page.
  await sync.step();
  await sync.step();
  // Search Console's job a week a step, read around the day the sync stored; GA4's waits its turn.
  expect(asked.map((a) => [a.source, a.reportTypes, a.start, a.end])).toEqual([
    ['gsc', ['query_page'], first, day(first, 1)],
    ['gsc', ['query_page'], day(first, 3), day(first, 6)],
    ['gsc', ['query_page'], day(first, 7), day(first, 13)],
  ]);
  const written = await partitions.find({
    filter: {
      projectId,
      source: 'gsc',
      date: { $in: [first, day(first, 1), day(first, 2)] },
    },
  });
  expect(
    written
      .map((p) => [
        p.get('date'),
        p.get('grain'),
        (p.get('payload') as unknown[]).length,
      ])
      .sort(),
  ).toEqual([
    [first, 'query_page', 1],
    [day(first, 1), 'query_page', 1],
    [day(first, 2), 'query_page', 0],
  ]);
  expect((await link())!.get('lastSyncAt')).toBeNull();
  expect((await jobs()).find((j) => j.id === gsc.id)!.get('cursor')).toBe(
    day(first, 14),
  );
  await pageDaysFilled(db, projectId);
});

it('keeps the snapshots and their key through page days older than the snapshots read', async () => {
  const { sync, store } = await fixture();
  const { cutoff } = historyBounds({}, projectId);
  for (const source of ['gsc', 'ga4'])
    await store(source, 'overview', cutoff, [
      { date: cutoff, views: 1, clicks: 1, impressions: 1 },
    ]);
  const key = (await sync.snapshotKey(projectId)).key;
  await store('gsc', 'query_page', day(cutoff, -300));
  await store('ga4', 'page', day(cutoff, -300));
  expect((await sync.snapshotKey(projectId)).key).toBe(key);
  const built = await sync.snapshots(projectId);
  expect(
    built.find((s: { key: string }) => s.key === 'project').payload.end,
  ).toBe(cutoff);
  // A recent page day is read, and changes the key.
  await store('gsc', 'query_page', day(cutoff, -10));
  expect((await sync.snapshotKey(projectId)).key).not.toBe(key);
});

it('moves past a GA4 week the sync stored meanwhile without asking Google anything', async () => {
  const { sync, store, jobs, db, asked } = await fixture();
  const { earliest } = historyBounds({}, projectId);
  const google = vi.fn(async () => ({ timeZone: 'UTC' }));
  sync.p.googleJson = google;
  const token = vi.fn(async () => 'token');
  sync.p.token = token;
  await sync.enqueuePageHistory(projectId);
  await db.getRepository('nrSyncJobs').update({
    filter: { projectId, source: 'gsc' },
    values: { status: 'succeeded' },
  });
  for (let d = earliest; d <= day(earliest, 6); d = day(d, 1))
    await store('ga4', 'page', d);
  expect(await sync.step()).toBe(true);
  expect(asked).toEqual([]);
  expect(google).not.toHaveBeenCalled();
  expect(token).not.toHaveBeenCalled();
  const ga4 = (await jobs()).find((j) => j.get('source') === 'ga4')!;
  expect([ga4.get('status'), ga4.get('cursor')]).toEqual([
    'running',
    day(earliest, 7),
  ]);
});

it('retries only the failed jobs of the selected resources, and queues nothing while Google refuses the authorization', async () => {
  const { sync, jobs, db } = await fixture();
  const repo = db.getRepository('nrSyncJobs');
  await repo.create({
    values: {
      projectId,
      source: 'gsc',
      resource: 'sc-domain:old.test',
      status: 'failed',
      startDate: '2025-08-01',
      endDate: '2025-08-07',
      cursor: '2025-08-01',
      attempts: 3,
      recordCount: 0,
      trigger: 'page-history',
    },
  });
  vi.setSystemTime(Date.now() + 86400000 + 1000);
  const queued = await sync.enqueuePageHistory(projectId);
  expect(queued.retried).toBe(0);
  expect(queued.jobs.length).toBe(2);
  expect(
    (await jobs())
      .find((j) => j.get('resource') === 'sc-domain:old.test')!
      .get('status'),
  ).toBe('failed');
  // Google refuses the authorization: the failed job of the site is left, and no day is queued.
  await repo.update({
    filter: { projectId, resource: site },
    values: { status: 'failed' },
  });
  await db
    .getRepository('nrGoogleLinks')
    .update({
      filter: { projectId },
      values: { authFailedAt: new Date().toISOString() },
    });
  vi.setSystemTime(Date.now() + 2 * 86400000);
  expect(await sync.enqueuePageHistory(projectId)).toEqual({
    jobs: [],
    retried: 0,
  });
});

it('keeps the key when the day moves on with nothing written, and reads the page days back from the snapshots end', async () => {
  const { sync, store } = await fixture();
  const { cutoff } = historyBounds({}, projectId);
  // The overview stops 40 days before the cutoff, as when the sync has been failing.
  const end = day(cutoff, -40);
  await store('ga4', 'overview', end, [
    { date: end, views: 1, sessions: 1, conversions: 0 },
  ]);
  await store('gsc', 'overview', end, [
    { date: end, clicks: 1, impressions: 1 },
  ]);
  // The first day of the 90-day range's previous period, 219 days before the cutoff.
  await store('gsc', 'query_page', day(end, -179), [
    {
      keyword: 'crm',
      page: 'https://example.test/a',
      clicks: 9,
      impressions: 100,
      position: 2,
    },
  ]);
  const key = (await sync.snapshotKey(projectId)).key;
  const built = await sync.snapshots(projectId);
  expect(
    built.find((s: { key: string }) => s.key === 'queries-90').payload,
  ).toEqual([expect.objectContaining({ keyword: 'crm', previous: 9 })]);
  vi.setSystemTime(Date.now() + 86400000);
  expect((await sync.snapshotKey(projectId)).key).toBe(key);
});
