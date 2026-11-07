// @vitest-environment node
import {
  createNocoReachTestDatabase,
  nocoReachSchemaPaths as paths,
  type NocoReachSchemaPath,
} from '../fixtures/nocoreach-database.js';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { afterEach, expect, it, vi } from 'vitest';
import { DataViews, windowFor } from '../../server/nocoreach/data-views.js';
import {
  LegacyDatabase,
  legacyRecord,
} from '../../server/nocoreach/legacy/database.js';
import { SyncService } from '../../server/nocoreach/sync-service.js';

afterEach(() => vi.useRealTimers());
const end = '2026-09-27';
const dateAt = (offset: number) =>
  new Date(Date.parse(`${end}T00:00:00Z`) + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const projectId = '901';
const site = 'sc-domain:example.test';
const url = 'https://example.test/docs/a';
const link = legacyRecord({
  ga4PropertyId: '123',
  gscSiteUrl: site,
  status: 'active',
});

async function fixture(path: NocoReachSchemaPath = 'fresh') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-09-30T12:00:00Z');
  const testDb = await createNocoReachTestDatabase(path);
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const partitions = db.getRepository('nrSyncPartitions');
  const gsc = (date: string, clicks = 10) => ({
    projectId,
    source: 'gsc',
    resource: site,
    date,
    grain: 'query_page',
    payload: [
      { keyword: 'crm', page: url, clicks, impressions: 100, position: 9 },
    ],
  });
  const daily = Array.from({ length: 28 }, (_, i) => ({
    date: dateAt(i - 27),
    clicks: 10,
    impressions: 100,
    position: 9,
  }));
  for (const day of daily) {
    await partitions.create({ values: gsc(day.date) });
    await partitions.create({ values: { ...gsc(day.date), grain: 'overview', payload: [day] } });
    await partitions.create({
      values: {
        projectId,
        source: 'ga4',
        resource: '123',
        date: day.date,
        grain: 'page',
        payload: [{ page: '/docs/a', views: 20 }],
      },
    });
  }
  for (const values of [
    gsc(dateAt(-28), 999),
    gsc(dateAt(1), 999),
    { ...gsc(end, 2000), projectId: 'another-project' },
    { ...gsc(end, 2000), resource: 'sc-domain:another.test' },
    { ...gsc(end, 2000), grain: 'overview' },
  ])
    await partitions.create({ values });
  const snapshots = [
    { key: 'project', payload: { end } },
    { key: 'history-search', payload: daily },
    { key: 'history-web', payload: daily },
  ];
  const views = new DataViews({
    db,
    sync: {
      link: async () => link,
      snapshotKey: async () => ({ key: 'partition-range-fixture' }),
      snapshots: async () => snapshots,
      fresh: async () => [],
    },
  });
  views.gscQuery = async (_id, _site, body) => body.dimensions[0] === 'date'
    ? daily.filter(r => r.date >= body.startDate && r.date <= body.endDate).map(r => ({ keys: [r.date], ...r }))
    : [{ keys: ['crm', url], clicks: 70, impressions: 700, position: 9 }];
  return { views, db };
}

it.each(paths)('reads filtered date ranges (%s)', async (path) => {
  const { views } = await fixture(path);
  const report = await views.search(projectId, { range: '7', details: true });
  expect(report.queries.rows).toEqual([
    { key: 'crm', clicks: 70, impressions: 700, ctr: 0.1, position: 9 },
  ]);
  expect(report.pairDays).toBe(7);
  const filtered = await views.search(projectId, {
    range: '7',
    queryFilter: { operator: 'equals', expression: 'crm' },
  });
  expect(filtered.totals.clicks).toBe(70);
  expect(filtered.previous?.clicks).toBe(70);
  expect(filtered.complete).toBe(true);
  expect(filtered.previousComplete).toBe(true);
  // 涨跌 compares the two synced periods; a flat query neither rises nor falls.
  expect(report.movers.query).toEqual({ rising: [], falling: [], fresh: [] });
  expect(report.trend[0]).toMatchObject({
    clicks: 10,
    ctr: 0.1,
    position: 9,
    previousCtr: 0.1,
    previousPosition: 9,
  });
  // Without the period before fully synced there is nothing to compare.
  expect((await views.search(projectId, { range: '28' })).movers).toBeNull();
  const ranks = await views.ranks(projectId, { keywords: ['crm'] });
  expect(ranks).toHaveProperty('ranks.crm.clicks', 280);
  const page = await views.page(projectId, { url, range: '7' });
  expect(page.daily).toEqual(
    Array.from({ length: 7 }, (_, i) => ({
      date: dateAt(i - 6),
      clicks: 10,
      impressions: 100,
      views: 20,
    })),
  );
});

it.each(paths)('reads 490-day comparison ranges (%s)', async (path) => {
  const { views } = await fixture(path);
  const report = await views.search(projectId, {
    range: 'custom',
    from: dateAt(-489),
    to: end,
    queryFilter: { operator: 'equals', expression: 'crm' },
  });
  expect(report.window.days).toBe(490);
  expect(report.totals.clicks).toBe(280);
  expect(report.complete).toBe(false);
  expect(report.previous).toBeNull();
  await expect(views.page(projectId, {
    url,
    range: 'custom',
    from: dateAt(1),
    to: dateAt(2),
  })).rejects.toMatchObject({ status: 400 });
});

it.each(['2026-02-30', '2026-13-01', '2026-1-01', 'not-a-date'])(
  'rejects invalid custom calendar date %s',
  (from) => {
    expect(() => windowFor(end, 'custom', from, end)).toThrow('有效的起止日期');
  },
);

it.each(paths)(
  'builds details from the synced days of this project, resource and grain alone, without Search Console (%s)',
  async (path) => {
    const { views } = await fixture(path);
    const asked = vi.fn(async () => []);
    views.gscQuery = asked;
    const report = await views.search(projectId, {
      range: '7',
      details: true,
    } as never);
    expect(asked).not.toHaveBeenCalled();
    expect(report).not.toHaveProperty('live');
    expect(report.pairDays).toBe(7);
    // Seven days of the fixture's one pair: the larger rows of another project, property or grain are not read.
    const pair = report.queries.rows[0];
    expect(report.queries.total).toBe(1);
    expect(pair.key).toBe('crm');
    expect(pair.clicks).toBeLessThan(2000);
    expect(report.pages.rows[0].key).toBe(url);
    expect(report.movers.query).toBeDefined();
  },
);

it.each([
  ['the last day', [0], -1],
  ['the last two days', [0, -1], -2],
])(
  'ends the tables at the last synced day while the daily sync has not stored %s, without Search Console',
  async (_name, missing, last) => {
    const { views, db } = await fixture();
    for (const offset of missing)
      await db.getRepository('nrSyncPartitions').destroy({
        filter: { projectId, grain: 'query_page', date: dateAt(offset) },
      });
    const asked = vi.fn(async () => []);
    views.gscQuery = asked;
    const report = await views.search(projectId, {
      range: '7',
      details: true,
    } as never);
    expect(asked).not.toHaveBeenCalled();
    expect(report).not.toHaveProperty('live');
    expect(report.window.end).toBe(dateAt(last));
    expect(report.window.days).toBe(7);
    expect(report.cutoff).toBe(dateAt(0));
    expect(report.queries.rows[0].key).toBe('crm');
    // A reader that states the period beside the tables gets exactly that period.
    const exact = await views.search(projectId, {
      range: '7',
      details: true,
      exactWindow: true,
    } as never);
    expect(exact).toMatchObject({ live: true });
    expect(exact.window.end).toBe(dateAt(0));
  },
);

it('does not take a last day the sync stored empty as held, as Google may not have published it', async () => {
  const { views, db } = await fixture();
  const partitions = db.getRepository('nrSyncPartitions');
  const empty = (offset: number) =>
    partitions.update({
      filter: {
        projectId,
        source: 'gsc',
        resource: site,
        grain: { $in: ['overview', 'query_page'] },
        date: dateAt(offset),
      },
      values: { payload: [] },
    });
  await empty(0);
  const asked = vi.fn(async () => []);
  views.gscQuery = asked;
  const report = await views.search(projectId, {
    range: '7',
    details: true,
  } as never);
  expect(asked).not.toHaveBeenCalled();
  expect(report).not.toHaveProperty('live');
  expect(report.window.end).toBe(dateAt(-1));
  expect(report.complete).toBe(true);
  expect(report.movers).not.toBeNull();
  // A reader that states the period gets that period, from Google.
  const exact = await views.search(projectId, {
    range: '7',
    details: true,
    exactWindow: true,
  } as never);
  expect(exact).toMatchObject({ live: true });
  expect(exact.window.end).toBe(dateAt(0));
});

it('still builds the tables over a quiet day further back in the window', async () => {
  const { views, db } = await fixture();
  await db.getRepository('nrSyncPartitions').update({
    filter: {
      projectId,
      source: 'gsc',
      resource: site,
      grain: { $in: ['overview', 'query_page'] },
      date: dateAt(-2),
    },
    values: { payload: [] },
  });
  const asked = vi.fn(async () => []);
  views.gscQuery = asked;
  const report = await views.search(projectId, {
    range: '7',
    details: true,
  } as never);
  expect(asked).not.toHaveBeenCalled();
  expect(report).not.toHaveProperty('live');
  expect(report.window.end).toBe(dateAt(0));
});

it('takes an empty last day as a real one once the sync has stopped reading it again', async () => {
  const { views, db } = await fixture();
  await db.getRepository('nrSyncPartitions').update({
    filter: {
      projectId,
      source: 'gsc',
      resource: site,
      grain: { $in: ['overview', 'query_page'] },
      date: dateAt(-9),
    },
    values: { payload: [] },
  });
  const asked = vi.fn(async () => []);
  views.gscQuery = asked;
  const report = await views.search(projectId, {
    range: 'custom',
    from: dateAt(-15),
    to: dateAt(-9),
    details: true,
  } as never);
  expect(asked).not.toHaveBeenCalled();
  expect(report).not.toHaveProperty('live');
  expect(report.window.end).toBe(dateAt(-9));
});

it('reads Search Console when more days are missing than a sync can be behind, or for a custom range', async () => {
  const { views, db } = await fixture();
  for (const offset of [0, -1, -2])
    await db.getRepository('nrSyncPartitions').destroy({
      filter: { projectId, grain: 'query_page', date: dateAt(offset) },
    });
  views.gscQuery = vi.fn(async () => []);
  const behind = await views.search(projectId, {
    range: '7',
    details: true,
  } as never);
  expect(behind).toMatchObject({ live: true });
  expect(behind.window.end).toBe(dateAt(0));
  const custom = await views.search(projectId, {
    range: 'custom',
    from: dateAt(-6),
    to: dateAt(0),
    details: true,
  } as never);
  expect(custom).toMatchObject({ live: true });
});

it('reads details, breakdowns and one row directly from Search Console, for web search only', async () => {
  const { views, db } = await fixture();
  await db.getRepository('nrSyncPartitions').destroy({
    filter: { projectId, grain: 'query_page', date: dateAt(-1) },
  });
  const asked: Record<string, unknown>[] = [];
  views.gscQuery = async (_id: string, _site: string, body: any) => {
    asked.push(body);
    const dims: string[] = body.dimensions;
    if (dims[0] === 'date')
      return Array.from({ length: 14 }, (_, i) => ({
        keys: [dateAt(i - 13)],
        clicks: 5,
        impressions: 50,
        position: 0,
      }));
    // One query's pages (its row opened) or every page (a Discover report).
    if (dims.join() === 'page')
      return body.dimensionFilterGroups
        ? [{ keys: [url], clicks: 7, impressions: 70, position: 9 }]
        : [
            {
              keys: [url],
              clicks: body.startDate === dateAt(-6) ? 35 : 20,
              impressions: 350,
              position: 0,
            },
          ];
    if (dims[0] === 'country')
      return [{ keys: ['usa'], clicks: 9, impressions: 90, position: 4 }];
    if (dims[0] === 'device')
      return [{ keys: ['MOBILE'], clicks: 3, impressions: 30, position: 5 }];
    if (dims[0] === 'searchAppearance') throw new Error('not for this type');
    return [{ keys: ['crm', url], clicks: 7, impressions: 70, position: 9 }];
  };
  // A search type in the request is ignored: the page reads web search only (2026-10-22).
  const live = await views.search(projectId, {
    range: '7',
    type: 'discover',
    details: true,
  } as never);
  expect(live).toMatchObject({ live: true });
  expect(live).not.toHaveProperty('type');
  expect(live.totals.clicks).toBe(35);
  expect(live.queries.rows[0].key).toBe('crm');
  expect(live.pages.rows[0].key).toBe(url);
  expect(asked.every((b) => !('type' in b))).toBe(true);
  expect(asked.some((b) => (b.dimensions as string[]).includes('query'))).toBe(
    true,
  );
  const w = live.window;
  const breakdown = await views.searchBreakdown(projectId, { ...w });
  expect(breakdown.countries[0]).toEqual({
    key: 'usa',
    clicks: 9,
    impressions: 90,
    position: 4,
    ctr: 0.1,
    previousClicks: 9,
    previousImpressions: 90,
  });
  expect(breakdown.devices[0].key).toBe('MOBILE');
  expect(breakdown.appearances).toBeNull();
  const row = await views.searchRow(projectId, {
    ...w,
    dimension: 'query',
    key: 'crm',
  });
  expect(row.trend).toHaveLength(7);
  expect(row.related).toEqual([
    { key: url, clicks: 7, impressions: 70, ctr: 0.1, position: 9 },
  ]);
  await expect(
    views.searchBreakdown(projectId, { start: 'x', end }),
  ).rejects.toThrow();
});

it('keeps only the explicit unconnected state as disconnected', async () => {
  const sync = new SyncService({ link: async () => null });
  await expect(sync.link(projectId)).rejects.toMatchObject({
    status: 409,
    code: 'NOCOREACH_GOOGLE_NOT_CONNECTED',
  });
  const views = new DataViews({ sync });
  await expect(views.search(projectId, {})).resolves.toEqual({
    connected: false,
  });
  await expect(views.page(projectId, { url })).resolves.toEqual({
    connected: false,
  });
  await expect(views.ranks(projectId, {})).resolves.toEqual({
    connected: false,
    ranks: {},
  });
  await expect(views.website(projectId, {})).resolves.toEqual({
    connected: false,
  });
  await expect(
    views.searchCountries(projectId, { start: end, end }),
  ).resolves.toEqual({ countries: [] });
});

it('does not turn a resource mismatch into disconnected or no data', async () => {
  const sync = new SyncService({
    link: async () => link,
    env: () => 'synthetic-test-value',
    project: async () => ({
      analyticsPropertyId: 'different',
      searchConsoleProperty: site,
    }),
  });
  const views = new DataViews({ sync });
  await expect(views.search(projectId, {})).rejects.toThrow(
    '连接资源与项目不一致',
  );
  await expect(views.page(projectId, { url })).rejects.toThrow(
    '连接资源与项目不一致',
  );
});

it.each(['link', 'snapshotKey', 'snapshots'] as const)(
  'propagates unexpected %s failures rather than returning disconnected',
  async (operation) => {
    const error = new Error('Synthetic database read failure');
    const sync = {
      link: async () => link,
      snapshotKey: async () => ({ key: 'failure-fixture' }),
      snapshots: async () => [],
    };
    sync[operation] = async () => {
      throw error;
    };
    const views = new DataViews({
      sync,
      db: { getRepository: () => ({ findOne: async () => null }) },
    });
    await expect(views.search(projectId, {})).rejects.toBe(error);
    if (operation !== 'snapshotKey') {
      await expect(views.page(projectId, { url })).rejects.toBe(error);
      await expect(views.ranks(projectId, {})).rejects.toBe(error);
      await expect(views.website(projectId, {})).rejects.toBe(error);
    }
    if (operation === 'snapshots')
      await expect(views.overview(projectId, {})).rejects.toBe(error);
    if (operation === 'link')
      await expect(
        views.searchCountries(projectId, { start: end, end }),
      ).rejects.toBe(error);
  },
);

it.each(paths)(
  'sums every page over the synced days of the period and the one before, for the Pages list (%s)',
  async (path) => {
    const { views } = await fixture(path);
    const figures = await views.pageFigures(projectId, '7');
    expect(figures.window).toMatchObject({ start: dateAt(-6), end });
    expect(figures.days).toEqual({
      gsc: { current: 7, previous: 7 },
      ga4: { current: 7, previous: 7 },
    });
    // Other projects, resources, grains and days outside both periods are left out.
    expect(figures.search).toEqual([
      {
        host: 'example.test',
        path: '/docs/a',
        current: { clicks: 70, impressions: 700 },
        previous: { clicks: 70, impressions: 700 },
      },
    ]);
    expect(figures.web).toEqual([
      {
        host: '',
        path: '/docs/a',
        current: { views: 140 },
        previous: { views: 140 },
      },
    ]);
    expect(await views.pageFigures(projectId, '7')).toEqual(figures);
    figures.web[0].current.views = -1;
    expect((await views.pageFigures(projectId, '7')).web[0].current.views).toBe(140);
  },
);

it('all-time search and page figures include stored history and custom caches keep date bounds', async () => {
 const {views}=await fixture(paths[0]);
 const all=await views.search(projectId,{range:'all'});
 expect(all.window.all).toBe(true);expect(all.window.start).toBe('2025-05-30');
 expect(all.previous).toBeNull();expect(all.movers).toBeNull();
 expect(all.trend.every(p=>p.previousClicks===null)).toBe(true);
 const one=await views.pageFigures(projectId,'custom',dateAt(-6),end);
 const two=await views.pageFigures(projectId,'custom',dateAt(-13),dateAt(-7));
 expect(one.window.start).toBe(dateAt(-6));expect(two.window.start).toBe(dateAt(-13));
});

it('keeps the figures of a site with many addresses, so Pages does not read every synced day again', async () => {
  const { views } = await fixture(paths[0]);
  // About 3 MB as objects, past the cache's 2 MB an entry; packed it is kept.
  const rows = (n: number, fields: string[]) =>
    Array.from({ length: n }, (_, i) => ({
      host: i % 2 ? 'docs.example.test' : 'example.test',
      path: `/docs/section-${i}/a-rather-long-page-name`,
      current: Object.fromEntries(fields.map((f, j) => [f, i + j])),
      previous: Object.fromEntries(fields.map((f) => [f, 0])),
    }));
  const built = {
    window: windowFor(end, '28'),
    days: {
      gsc: { current: 28, previous: 28 },
      ga4: { current: 28, previous: 28 },
    },
    search: rows(12000, ['clicks', 'impressions']),
    web: rows(12000, ['views']),
  };
  expect(Buffer.byteLength(JSON.stringify(built))).toBeGreaterThan(
    2 * 1024 * 1024,
  );
  const build = vi
    .spyOn(views, 'buildPageFigures')
    .mockResolvedValue(structuredClone(built));
  expect(await views.pageFigures(projectId, '28')).toEqual(built);
  expect(await views.pageFigures(projectId, '28')).toEqual(built);
  expect(build).toHaveBeenCalledTimes(1);
});

it.each(paths)(
  'keeps Pages figures and Keywords ranks through writes to other days, and sums them again when their own days change (%s)',
  async (path) => {
    const { views, db } = await fixture(path);
    const partitions = db.getRepository('nrSyncPartitions');
    const build = vi.spyOn(views, 'buildPageFigures');
    const first = await views.pageFigures(projectId, '7');
    const ranks = await views.ranks(projectId, { keywords: ['crm'] });
    // A history fill writes days before both periods; the other grain of the same days is not summed either.
    await partitions.create({
      values: { projectId, source: 'gsc', resource: site, date: '2024-01-01', grain: 'query_page', payload: [] },
    });
    expect(await views.pageFigures(projectId, '7')).toEqual(first);
    expect(build).toHaveBeenCalledTimes(1);
    const held = views.pairHold.get(projectId);
    expect(await views.ranks(projectId, { keywords: ['crm'] })).toEqual(ranks);
    expect(views.pairHold.get(projectId)).toBe(held);
    // A day of the window read again is.
    vi.setSystemTime(Date.now() + 60000);
    const row = await partitions.findOne({ filter: { projectId, source: 'gsc', grain: 'query_page', resource: site, date: end } });
    await partitions.update({
      filterByTk: row.get('id'),
      values: { payload: [{ keyword: 'crm', page: url, clicks: 110, impressions: 100, position: 9 }] },
    });
    expect((await views.pageFigures(projectId, '7')).search[0].current.clicks).toBe(170);
    expect(build).toHaveBeenCalledTimes(2);
    expect((await views.ranks(projectId, { keywords: ['crm'] })).ranks.crm.clicks).toBe(ranks.ranks.crm.clicks + 100);
  },
);

it.each(paths)(
  'sums each synced day by page once, and answers every page drawer from those rows (%s)',
  async (path) => {
    const { views, db } = await fixture(path);
    const partitions = db.getRepository('nrSyncPartitions');
    const marks = db.getRepository('nrPageDayMarks');
    const other = 'https://www.example.test/docs/b/';
    const row = await partitions.findOne({ filter: { projectId, source: 'gsc', grain: 'query_page', resource: site, date: end } });
    await partitions.update({
      filterByTk: row.get('id'),
      values: { payload: [{ keyword: 'crm', page: url, clicks: 10, impressions: 100, position: 9 }, { keyword: 'b', page: 'https://example.test/docs/b?ref=x', clicks: 3, impressions: 30, position: 4 }] },
    });
    const { fillPageDaysInBackground, pageDaysFilled, releasePageDay } = await import('../../server/nocoreach/page-days.js');
    const first = await views.page(projectId, { url, range: '7' });
    // The first drawer sums its page's days from the partitions and has every synced day summed in the background.
    await pageDaysFilled(db, projectId);
    expect(await marks.count({ filter: { projectId } })).toBe(58);
    const held = await db.getRepository('nrPageDays').count({ filter: { projectId } });
    const second = await views.page(projectId, { url: other, range: '7' });
    expect(await db.getRepository('nrPageDays').count({ filter: { projectId } })).toBe(held);
    expect(first.daily.at(-1)).toEqual({ date: end, clicks: 10, impressions: 100, views: 20 });
    // Another page's address matches whatever its scheme, www, trailing slash or query; GA4 counts by path.
    expect(second.daily.at(-1)).toEqual({ date: end, clicks: 3, impressions: 30, views: 0 });
    expect(second.daily[0]).toEqual({ date: dateAt(-6), clicks: 0, impressions: 0, views: 0 });
    expect((await views.page(projectId, { url, range: '7' })).daily).toEqual(first.daily);
    // A day the sync reads again unchanged keeps its rows.
    const sameDay = await partitions.findOne({ filter: { projectId, source: 'ga4', grain: 'page', resource: '123', date: end } });
    expect(await releasePageDay(db, { projectId, source: 'ga4', resource: '123', date: end, grain: 'page', payload: sameDay.get('payload') })).toBe(false);
    // Sources asked for while a fill runs are filled once it ends.
    const moved = [{ keyword: 'b', page: other, clicks: 5, impressions: 50, position: 4 }];
    await partitions.update({ filterByTk: row.get('id'), values: { payload: moved } });
    expect(await releasePageDay(db, { projectId, source: 'gsc', resource: site, date: end, grain: 'query_page', payload: moved })).toBe(true);
    fillPageDaysInBackground(db, projectId, [['ga4', '123']]);
    fillPageDaysInBackground(db, projectId, [['gsc', site]]);
    await pageDaysFilled(db, projectId);
    expect(await marks.count({ filter: { projectId, pages: { $gte: 0 } } })).toBe(58);
    expect((await views.page(projectId, { url: other, range: '7' })).daily.at(-1)).toEqual({ date: end, clicks: 5, impressions: 50, views: 0 });
    expect((await views.page(projectId, { url, range: '7' })).daily.at(-1)).toEqual({ date: end, clicks: 0, impressions: 0, views: 20 });
    expect(await marks.count({ filter: { projectId } })).toBe(58);
    // The sync writes a partition with other content and lets the day go in its transaction (releasePageDay): the
    // drawer sums the day from the partition until the background fill has written it again.
    const changed = [{ keyword: 'crm', page: url, clicks: 7, impressions: 70, position: 9 }];
    await partitions.update({ filterByTk: row.get('id'), values: { payload: changed } });
    expect(await releasePageDay(db, { projectId, source: 'gsc', resource: site, date: end, grain: 'query_page', payload: changed })).toBe(true);
    const heldMarks = () => marks.count({ filter: { projectId, pages: { $gte: 0 } } });
    expect(await heldMarks()).toBe(57);
    const released = await views.page(projectId, { url, range: '7' });
    expect(released.daily.at(-1)).toEqual({ date: end, clicks: 7, impressions: 70, views: 20 });
    await pageDaysFilled(db, projectId);
    expect(await heldMarks()).toBe(58);
    expect(await marks.count({ filter: { projectId } })).toBe(58);
    expect((await views.page(projectId, { url, range: '7' })).daily).toEqual(released.daily);
    expect(await releasePageDay(db, { projectId, source: 'gsc', resource: site, date: end, grain: 'query_page', payload: changed })).toBe(false);
  },
);

it('applies the page identity when a page is read, not when its days are written', async () => {
  const { views, db } = await fixture(paths[0]);
  let identity: { pages: { url: string; canonical: string }[] } | null = null;
  views.p.siteContent = { state: async () => identity };
  const before = await views.page(projectId, { url: 'https://example.test/docs/old', range: '7' });
  expect(before.daily.at(-1)).toEqual({ date: end, clicks: 0, impressions: 0, views: 0 });
  const { pageDaysFilled } = await import('../../server/nocoreach/page-days.js');
  await pageDaysFilled(db, projectId);
  const held = await db.getRepository('nrPageDays').count({ filter: { projectId } });
  // Website content reads that /docs/a names /docs/old as its canonical: /docs/a's rows are now /docs/old's.
  identity = { pages: [{ url, canonical: 'https://example.test/docs/old' }] };
  const after = await views.page(projectId, { url: 'https://example.test/docs/old', range: '7' });
  // GA4 rows stored without a host match by their own path, as before the page identity existed.
  expect(after.daily.at(-1)).toEqual({ date: end, clicks: 10, impressions: 100, views: 0 });
  expect(await db.getRepository('nrPageDays').count({ filter: { projectId } })).toBe(held);
});

it('reads one page whatever its www, trailing slash or query, with GA4 rows with and without a host', async () => {
  const { views, db } = await fixture(paths[0]);
  const partitions = db.getRepository('nrSyncPartitions');
  for (const [source, grain, resource, payload] of [
    ['gsc', 'query_page', site, [{ keyword: 'x', page: 'https://www.example.test/docs/a/', clicks: 3, impressions: 40 }, { keyword: 'y', page: 'https://example.test/docs/b', clicks: 9, impressions: 9 }]],
    ['ga4', 'page', '123', [{ page: '/docs/a', views: 12 }, { host: 'www.example.test', page: '/docs/a/?ref=1', views: 3 }, { page: '/', views: 99 }]],
  ] as const) {
    const row = await partitions.findOne({ filter: { projectId, source, grain, resource, date: end } });
    await partitions.update({ filterByTk: row.get('id'), values: { payload } });
  }
  const r = await views.page(projectId, { url: 'https://example.test/docs/a', range: '7' });
  expect(r.daily.at(-1)).toEqual({ date: end, clicks: 3, impressions: 40, views: 15 });
});

it('does not write a day from a partition the sync has replaced since it was read', async () => {
  const { views, db } = await fixture(paths[0]);
  const { fillDays, releasePageDay } = await import('../../server/nocoreach/page-days.js');
  const marks = db.getRepository('nrPageDayMarks');
  // The sync is about to write new content for the last day (and has marked the day pending it), while the stored
  // partition a fill reads is still the old one.
  const next = [{ keyword: 'crm', page: url, clicks: 99, impressions: 990, position: 9 }];
  expect(await releasePageDay(db, { projectId, source: 'gsc', resource: site, date: end, grain: 'query_page', payload: next })).toBe(true);
  expect(await fillDays(db, projectId, 'gsc', site)).toBe(29);
  expect(await marks.count({ filter: { projectId, source: 'gsc', pages: { $gte: 0 } } })).toBe(29);
  // The day is still pending, so the drawer sums it from the partition as stored.
  expect((await views.page(projectId, { url, range: '7' })).daily.at(-1)).toMatchObject({ date: end, clicks: 10, impressions: 100 });
  // Once the partition holds the new content, the next fill writes it.
  const partitions = db.getRepository('nrSyncPartitions');
  const row = await partitions.findOne({ filter: { projectId, source: 'gsc', grain: 'query_page', resource: site, date: end } });
  await partitions.update({ filterByTk: row.get('id'), values: { payload: next } });
  expect(await fillDays(db, projectId, 'gsc', site)).toBe(1);
  expect((await views.page(projectId, { url, range: '7' })).daily.at(-1)).toMatchObject({ date: end, clicks: 99, impressions: 990 });
});

it('fills a pending day whose partition reads back with its keys in another order, as MySQL returns JSON', async () => {
  const { db } = await fixture(paths[0]);
  const { fillDays, releasePageDay } = await import('../../server/nocoreach/page-days.js');
  const written = [{ keyword: 'crm', page: url, clicks: 12, impressions: 120, position: 9 }];
  const stored = [{ clicks: 12, impressions: 120, keyword: 'crm', page: url, position: 9 }];
  const partitions = db.getRepository('nrSyncPartitions');
  const row = await partitions.findOne({ filter: { projectId, source: 'gsc', grain: 'query_page', resource: site, date: end } });
  await partitions.update({ filterByTk: row.get('id'), values: { payload: stored } });
  expect(await releasePageDay(db, { projectId, source: 'gsc', resource: site, date: end, grain: 'query_page', payload: written })).toBe(true);
  expect(await fillDays(db, projectId, 'gsc', site)).toBe(30);
  expect(await db.getRepository('nrPageDayMarks').count({ filter: { projectId, source: 'gsc', pages: { $lt: 0 } } })).toBe(0);
});

it('refuses a page drawer for an address that is not one', async () => {
  const { views } = await fixture(paths[0]);
  await expect(views.page(projectId, { url: 'nope', range: '7' })).rejects.toThrow(/网址/);
});
