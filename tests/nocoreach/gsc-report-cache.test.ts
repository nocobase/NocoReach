// @vitest-environment node
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { afterEach, expect, it, vi } from 'vitest';
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database.js';
import {
  LegacyDatabase,
  legacyRecord,
} from '../../server/nocoreach/legacy/database.js';
import { DataViews, windowFor } from '../../server/nocoreach/data-views.js';
import { SearchIndex } from '../../server/nocoreach/search-index.js';
import {
  GOOGLE_HISTORY_CACHE_MS,
  GOOGLE_PARTIAL_CACHE_MS,
} from '../../shared/google-cache.js';

const site = 'sc-domain:example.test';
const url = 'https://example.test/docs';
const end = '2026-10-10';
const window = windowFor(end, '7');
type Body = {
  dimensions: string[];
  startDate: string;
  endDate: string;
  dimensionFilterGroups?: unknown[];
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function fixture() {
  const testDb = await createNocoReachTestDatabase();
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  const state = {
    site,
    version: '1',
    mock: 'live',
    authorizedAt: '2026-10-01',
    connected: true,
    fail: '',
    empty: false,
    indexed: false,
  };
  const daily = Array.from({ length: 14 }, (_, i) => ({
    date: new Date(Date.parse(`${end}T00:00:00Z`) - (13 - i) * 86400000)
      .toISOString()
      .slice(0, 10),
    clicks: 10,
    impressions: 100,
    position: 4,
  }));
  await db.getRepository('nrSyncPartitions').create({
    values: {
      projectId: '1',
      source: 'gsc',
      grain: 'query_page',
      resource: site,
      date: end,
      payload: [
        {
          keyword: 'crm',
          page: url,
          clicks: 10,
          impressions: 100,
          position: 4,
        },
      ],
    },
  });
  const upstream = vi.fn(async (input: string | URL, init?: RequestInit) => {
    if (String(input).includes('/sitemaps')) {
      if (String(input).includes('sitemapIndex') && state.fail === 'child')
        return json({}, 503);
      return json({
        sitemap: [
          {
            path: `${url}/sitemap.xml`,
            isSitemapsIndex: !String(input).includes('sitemapIndex'),
          },
        ],
      });
    }
    const body = JSON.parse(String(init?.body)) as Body;
    if (state.fail === 'all' || state.fail === body.dimensions[0])
      return json({}, 503);
    const values: Record<string, string> = {
      date: end,
      country: 'usa',
      device: 'DESKTOP',
      searchAppearance: 'VIDEO',
      page: url,
      query: 'crm',
    };
    return json({
      rows: state.empty
        ? []
        : [
            {
              keys: body.dimensions.map((d) => values[d]),
              clicks: 10,
              impressions: 100,
              position: 4,
            },
          ],
    });
  });
  const plugin = {
    db,
    sync: {
      link: async () => {
        if (!state.connected)
          throw Object.assign(new Error('disconnected'), {
            code: 'NOCOREACH_GOOGLE_NOT_CONNECTED',
          });
        return legacyRecord({
          gscSiteUrl: state.site,
          ga4PropertyId: '123',
          authorizedAt: state.authorizedAt,
        });
      },
      snapshotKey: async () => ({ key: state.version }),
      snapshots: vi.fn(async () => [
        { key: 'project', payload: { end } },
        { key: 'history-search', payload: daily },
        { key: 'history-web', payload: daily },
      ]),
      fresh: async () => [],
    },
    network: { mockCacheKey: () => state.mock },
    token: vi.fn(async () => 'access-token'),
    googleFetch: () => upstream,
    siteContent: {
      state: async () => ({
        sites: [{ sitemaps: [] }],
        pages: [{ url, type: 'page' }],
      }),
    },
  };
  return { db, plugin, state, upstream, views: new DataViews(plugin) };
}

it('persists GSC reports, empty countries and row details, preserves expiry and avoids concurrent token refreshes', async () => {
  const { plugin, views, upstream, state } = await fixture();
  vi.useFakeTimers({ toFake: ['Date'] });
  const [first, duplicate] = await Promise.all([
    views.searchBreakdown('1', window),
    views.searchBreakdown('1', window),
  ]);
  expect(duplicate).toEqual(first);
  expect(upstream).toHaveBeenCalledTimes(6);
  expect(plugin.token).toHaveBeenCalledTimes(1);
  first.countries[0].clicks = -1;
  expect(duplicate.countries[0].clicks).toBe(10);
  const selection = {
    ...window,
    dimension: 'query',
    key: 'crm',
    pageFilter: { operator: 'contains', expression: '/docs' },
  };
  const detail = await views.searchRow('1', selection);
  const bodies = upstream.mock.calls
    .slice(-2)
    .map(([, init]) => JSON.parse(String(init?.body)));
  expect(bodies[0].dimensionFilterGroups[0].filters).toContainEqual({
    dimension: 'page',
    operator: 'contains',
    expression: '/docs',
  });
  state.empty = true;
  const countries = await views.searchCountries('1', window);
  expect(countries.countries).toEqual([]);
  const count = upstream.mock.calls.length;
  vi.setSystemTime(Date.now() + GOOGLE_HISTORY_CACHE_MS - 1);
  const restarted = new DataViews(plugin);
  expect(await restarted.searchBreakdown('1', window)).toEqual(duplicate);
  expect(await restarted.searchRow('1', selection)).toEqual(detail);
  expect(await restarted.searchCountries('1', window)).toEqual(countries);
  expect(upstream).toHaveBeenCalledTimes(count);
  vi.setSystemTime(Date.now() + 1);
  await restarted.searchBreakdown('1', window);
  expect(upstream).toHaveBeenCalledTimes(count + 6);
});

it('expires partial dimensions after five minutes and does not cache total failures', async () => {
  const { plugin, views, upstream, state } = await fixture();
  vi.useFakeTimers({ toFake: ['Date'] });
  state.fail = 'device';
  const partial = await views.searchBreakdown('1', window);
  expect(partial).toMatchObject({
    partial: true,
    devices: null,
    cacheExpiresAt: Date.now() + GOOGLE_PARTIAL_CACHE_MS,
  });
  state.fail = '';
  const restarted = new DataViews(plugin);
  expect(await restarted.searchBreakdown('1', window)).toEqual(partial);
  expect(upstream).toHaveBeenCalledTimes(6);
  vi.setSystemTime(Date.now() + GOOGLE_PARTIAL_CACHE_MS);
  expect((await restarted.searchBreakdown('1', window)).devices[0].clicks).toBe(
    10,
  );
  expect(upstream).toHaveBeenCalledTimes(12);
  state.fail = 'all';
  const selection = { ...window, dimension: 'query', key: 'crm' };
  await expect(restarted.searchRow('1', selection)).rejects.toMatchObject({
    status: 502,
  });
  state.fail = '';
  expect((await restarted.searchRow('1', selection)).related).toHaveLength(1);
  expect(upstream).toHaveBeenCalledTimes(16);
});

it('isolates projects, properties, authorization, simulated scopes, filters, countries, types and windows', async () => {
  const { views, state, upstream } = await fixture();
  const read = (id = '1', changes = {}) =>
    views.searchBreakdown(id, { ...window, ...changes });
  await read();
  await read('2');
  await read('1', { country: 'usa' });
  await read('1', { type: 'image' });
  await read('1', {
    pageFilter: { operator: 'contains', expression: '/docs' },
  });
  await read('1', { start: '2026-10-05' });
  state.site = 'sc-domain:other.test';
  await read();
  state.authorizedAt = '2026-10-02';
  await read();
  state.mock = 'simulated-revision-2';
  await read();
  expect(upstream).toHaveBeenCalledTimes(9 * 6);
  state.connected = false;
  expect(await read()).toEqual({ connected: false });
  expect(upstream).toHaveBeenCalledTimes(9 * 6);
});

it('reuses local aggregations after restart, invalidates by sync version, and reuses live queries across sync changes', async () => {
  const { views, plugin, state, upstream } = await fixture();
  const [first, duplicate] = await Promise.all([
    views.search('1', { range: '7' }),
    views.search('1', { range: '7' }),
  ]);
  expect(duplicate).toEqual(first);
  expect(first.queries).toBeUndefined();
  expect(upstream).not.toHaveBeenCalled();
  expect(plugin.sync.snapshots).toHaveBeenCalledTimes(1);
  const restarted = new DataViews(plugin);
  await restarted.search('1', { range: '7' });
  expect(plugin.sync.snapshots).toHaveBeenCalledTimes(1);
  await restarted.search('1', { range: '7', country: 'usa' });
  expect(upstream).toHaveBeenCalledTimes(1);
  state.version = '2';
  await restarted.search('1', { range: '7' });
  await restarted.search('1', { range: '7', country: 'usa' });
  expect(plugin.sync.snapshots).toHaveBeenCalledTimes(4);
  expect(upstream).toHaveBeenCalledTimes(1);
});

it.each([
  { range: 'all' },
  { range: 'custom', from: '2026-10-02', to: '2026-10-06' },
])(
  'uses the $range report dates in persisted details without inventing all-time comparisons',
  async (range) => {
    const { views, plugin, upstream } = await fixture();
    const report = await views.search('1', { ...range, type: 'image' });
    const selection = {
      ...report.window,
      type: 'image',
      dimension: 'query',
      key: 'crm',
    };
    const detail = await views.searchRow('1', selection);
    expect(detail.trend[0].date).toBe(report.window.start);
    expect(detail.trend.at(-1).date).toBe(report.window.end);
    if (range.range === 'all')
      expect(detail.trend.every((row) => row.previousClicks === null)).toBe(
        true,
      );
    const calls = upstream.mock.calls.length;
    expect(await new DataViews(plugin).searchRow('1', selection)).toEqual(
      detail,
    );
    expect(upstream).toHaveBeenCalledTimes(calls);
  },
);

it('does not consume shared pending work or retain results from a rolled-back transaction', async () => {
  const { db, views, upstream } = await fixture();
  const gate = Promise.withResolvers<void>();
  const original = upstream.getMockImplementation()!;
  let first = true;
  upstream.mockImplementation(async (...args) => {
    if (first) {
      first = false;
      await gate.promise;
    }
    return original(...args);
  });
  const outside = views.searchRow('1', {
    ...window,
    dimension: 'query',
    key: 'crm',
  });
  await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(2));
  await expect(
    db.sequelize.transaction(async () => {
      const report = await views.searchRow('1', {
        ...window,
        dimension: 'query',
        key: 'crm',
      });
      expect(report.related).toHaveLength(1);
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  gate.resolve();
  await outside;
  expect(upstream).toHaveBeenCalledTimes(4);
  await views.searchRow('1', { ...window, dimension: 'query', key: 'crm' });
  expect(upstream).toHaveBeenCalledTimes(4);
});

it('persists submitted sitemaps while recomputing local inspection tallies, and retries partial children promptly', async () => {
  const { db, plugin, state, upstream } = await fixture();
  vi.useFakeTimers({ toFake: ['Date'] });
  state.fail = 'child';
  const index = new SearchIndex(plugin);
  const [first] = await Promise.all([index.sitemaps('1'), index.sitemaps('1')]);
  expect(upstream).toHaveBeenCalledTimes(2);
  expect(first.cacheExpiresAt).toBe(Date.now() + GOOGLE_PARTIAL_CACHE_MS);
  await db.getRepository('nrSnapshots').create({
    values: {
      key: 'search-index:1',
      payload: {
        site,
        results: {
          [url]: { verdict: 'PASS', sitemaps: [`${url}/sitemap.xml`] },
        },
      },
    },
  });
  const restarted = new SearchIndex(plugin);
  const again = await restarted.sitemaps('1');
  expect(again.readAt).toBe(first.readAt);
  expect(again.cacheExpiresAt).toBe(first.cacheExpiresAt);
  expect(again.sitemaps[0].indexed).toBe(1);
  expect(upstream).toHaveBeenCalledTimes(2);
  state.fail = '';
  vi.setSystemTime(Date.now() + GOOGLE_PARTIAL_CACHE_MS);
  const refreshed = await restarted.sitemaps('1');
  expect(refreshed.sitemaps[0].children).toHaveLength(1);
  expect(refreshed.cacheExpiresAt).toBe(Date.now() + GOOGLE_HISTORY_CACHE_MS);
  expect(upstream).toHaveBeenCalledTimes(4);
  state.mock = 'other';
  await restarted.sitemaps('1');
  expect(upstream).toHaveBeenCalledTimes(6);
  state.connected = false;
  expect(await restarted.sitemaps('1')).toEqual({ connected: false });
});

it('does not reuse an old authorization token refresh for a newly authorized report', async () => {
  const { plugin, views, state, upstream } = await fixture();
  const oldToken = Promise.withResolvers<string>();
  plugin.token
    .mockImplementationOnce(() => oldToken.promise)
    .mockResolvedValue('new-token');
  const selection = { ...window, dimension: 'query', key: 'crm' };
  const old = views.searchRow('1', selection);
  await vi.waitFor(() => expect(plugin.token).toHaveBeenCalledTimes(1));
  state.authorizedAt = '2026-10-03';
  const current = await views.searchRow('1', selection);
  expect(plugin.token).toHaveBeenCalledTimes(2);
  expect(
    upstream.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get('Authorization'),
    ),
  ).toEqual(['Bearer new-token', 'Bearer new-token']);
  oldToken.resolve('old-token');
  await old;
  expect(await new DataViews(plugin).searchRow('1', selection)).toEqual(
    current,
  );
  expect(upstream).toHaveBeenCalledTimes(4);
});

it('persists bounded live aggregates instead of the original query-page matrix', async () => {
  const { db, views } = await fixture();
  views.gscQuery = async (_id: string, _site: string, body: Body) =>
    body.dimensions[0] === 'date'
      ? []
      : Array.from({ length: 10000 }, (_, i) => ({
          keys: [`crm-${i}`, `${url}/${i}`],
          clicks: 1,
          impressions: 10,
          position: 4,
        }));
  const report = await views.search('1', { range: '7', country: 'usa', details: true });
  expect(report.queries.total).toBe(10000);
  expect(report.queries.rows).toHaveLength(3000);
  const payload = (
    await db
      .getRepository('nrSnapshots')
      .findOne({ filter: { key: 'gsc-reports:1' } })
  )?.get('payload');
  const encoded = JSON.stringify(payload);
  expect(encoded).not.toContain('byPair');
  expect(encoded).not.toContain('byPrevious');
  expect(Buffer.byteLength(encoded)).toBeLessThan(2 * 1024 * 1024);
  const restarted = new DataViews(views.p);
  restarted.gscQuery = vi.fn();
  expect(await restarted.search('1', { range: '7', country: 'usa', details: true })).toEqual(
    report,
  );
  expect(restarted.gscQuery).not.toHaveBeenCalled();
});
