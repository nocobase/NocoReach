// @vitest-environment node
import { createTestDatabase } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, it, onTestFinished } from 'vitest';
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

async function fixture() {
  const testDb = await createTestDatabase();
  onTestFinished(() => testDb.destroy());
  // Match the production schema: calendar dates are string fields, not timestamps.
  await testDb.connection.builder.createCollection('nrSyncPartitions', (c) => {
    c.bigInt('id').notNull();
    for (const name of ['projectId', 'source', 'resource', 'date', 'grain'])
      c.string(name, { length: 255 }).nullable();
    c.json('payload').nullable();
    c.datetime('createdAt').nullable();
    c.datetime('updatedAt').nullable();
    c.primary('id');
  });
  await testDb.connection.builder.createCollection('nrSnapshots', (c) => {
    c.bigInt('id').notNull();
    c.string('key', { length: 255 }).nullable();
    c.json('payload').nullable();
    c.datetime('createdAt').nullable();
    c.datetime('updatedAt').nullable();
    c.primary('id');
  });
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

it('reads search, filtered comparison, ranks and page ranges through the real string-field Repository', async () => {
  const { views } = await fixture();
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
  const ranks = await views.ranks(projectId, { keywords: ['crm'] });
  expect(ranks.ranks.crm.clicks).toBe(280);
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

it('supports the maximum 490-day selection and its preceding comparison without unsupported comparisons', async () => {
  const { views } = await fixture();
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
    if (operation !== 'link')
      await expect(views.website(projectId, {})).rejects.toBe(error);
    if (operation === 'snapshots')
      await expect(views.overview(projectId, {})).rejects.toBe(error);
    if (operation === 'link')
      await expect(
        views.searchCountries(projectId, { start: end, end }),
      ).rejects.toBe(error);
  },
);
