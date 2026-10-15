// @vitest-environment node
import {
  createNocoReachTestDatabase,
  nocoReachSchemaPaths as paths,
  type NocoReachSchemaPath,
} from '../fixtures/nocoreach-database.js';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, it } from 'vitest';
import { DataViews, windowFor } from '../../server/nocoreach/data-views.js';
import {
  LegacyDatabase,
  legacyRecord,
} from '../../server/nocoreach/legacy/database.js';
import { SyncService } from '../../server/nocoreach/sync-service.js';

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
  return { views };
}

it.each(paths)('reads filtered date ranges (%s)', async (path) => {
  const { views } = await fixture(path);
  const report = await views.search(projectId, { range: '7' });
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
  expect(report.totals.clicks).toBe(1279);
  expect(report.complete).toBe(false);
  expect(report.previous).toBeNull();
  const future = await views.page(projectId, {
    url,
    range: 'custom',
    from: dateAt(1),
    to: dateAt(2),
  });
  expect(future.daily).toEqual([]);
});

it.each(['2026-02-30', '2026-13-01', '2026-1-01', 'not-a-date'])(
  'rejects invalid custom calendar date %s',
  (from) => {
    expect(() => windowFor(end, 'custom', from, end)).toThrow('有效的起止日期');
  },
);

it('reads other search types, breakdowns and one row directly from Search Console', async () => {
  const { views } = await fixture();
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
  const discover = await views.search(projectId, {
    range: '7',
    type: 'discover',
  });
  expect(discover).toMatchObject({
    type: 'discover',
    noQueries: true,
    noPosition: true,
    live: true,
    queries: null,
    striking: [],
  });
  expect(discover.totals.clicks).toBe(35);
  expect(discover.pages.rows[0].key).toBe(url);
  expect(
    discover.movers.page.rising.map((r: any) => [r.key, r.change]),
  ).toEqual([[url, 15]]);
  expect(discover.movers.query).toBeNull();
  expect(asked.every((b) => b.type === 'discover')).toBe(true);
  expect(asked.some((b) => (b.dimensions as string[]).includes('query'))).toBe(
    false,
  );
  const w = discover.window;
  const breakdown = await views.searchBreakdown(projectId, {
    ...w,
    type: 'web',
  });
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
    views.searchRow(projectId, {
      ...w,
      dimension: 'query',
      key: 'crm',
      type: 'googleNews',
    }),
  ).rejects.toMatchObject({ status: 400 });
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
    }
    await expect(views.website(projectId, {})).rejects.toBe(error);
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
    expect(await views.pageFigures(projectId, '7')).toBe(figures);
  },
);
