// @vitest-environment node
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createNocoReachTestDatabase,
  nocoReachSchemaPaths,
} from '../fixtures/nocoreach-database.js';
import {
  LegacyDatabase,
  legacyRecord,
} from '../../server/nocoreach/legacy/database.js';
import { Ga4ReportCache } from '../../server/nocoreach/ga4-report-cache.js';
import { DataViews, windowFor } from '../../server/nocoreach/data-views.js';
import {
  WebsiteReport,
  TABLES,
  CHANGES,
} from '../../server/nocoreach/website-report.js';
import {
  GA4_HISTORY_CACHE_MS,
  GA4_PARTIAL_CACHE_MS,
  GA4_TODAY_CACHE_MS,
  GA4_REALTIME_CACHE_MS,
} from '../../shared/ga4-cache.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function fixture(path: 'fresh' | 'upgrade' = 'fresh') {
  const testDb = await createNocoReachTestDatabase(path);
  const db = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  return { db, cache: new Ga4ReportCache(db) };
}

it.each(nocoReachSchemaPaths)(
  'reuses durable reports after service recreation and refreshes after six hours (%s)',
  async (path) => {
    const { db, cache } = await fixture(path);
    vi.useFakeTimers({ toFake: ['Date'] });
    const read = vi.fn(async () => ({ users: 123 }));
    const key = ['period', 'property-1', '2026-10-01', '2026-10-10'];
    const present = (value: { users: number }, expiresAt: number) => ({
      ...value,
      expiresAt,
    });
    const first = await cache.load('1', key, read, undefined, present);
    vi.setSystemTime(Date.now() + 3600000);
    expect(
      await new Ga4ReportCache(db).load('1', key, read, undefined, present),
    ).toEqual(first);
    expect(read).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + GA4_HISTORY_CACHE_MS - 3600000);
    read.mockResolvedValue({ users: 456 });
    expect(await new Ga4ReportCache(db).load('1', key, read)).toEqual({
      users: 456,
    });
    expect(read).toHaveBeenCalledTimes(2);
  },
);

it('isolates projects, properties, date ranges and simulated scopes, and bounds persisted entries', async () => {
  const { db, cache } = await fixture();
  const read = vi.fn(async () => ({ users: 123 }));
  for (const [project, property, scope, date] of [
    ['1', '123', 'a', '2026-10-10'],
    ['2', '123', 'a', '2026-10-10'],
    ['1', '456', 'a', '2026-10-10'],
    ['1', '123', 'b', '2026-10-10'],
    ['1', '123', 'a', '2026-10-11'],
  ])
    await cache.load(project, [property, scope, date], read);
  expect(read).toHaveBeenCalledTimes(5);
  for (let i = 0; i < 34; i++) await cache.load('1', ['row', i], read);
  const payload: unknown = (
    await db
      .getRepository('nrSnapshots')
      .findOne({ filter: { key: 'ga4-reports:1' } })
  )?.get('payload');
  expect(payload).toMatchObject({ entries: expect.any(Array) });
  expect((payload as { entries: unknown[] }).entries).toHaveLength(32);
  await new Ga4ReportCache(db).load('2', ['123', 'a', '2026-10-10'], read);
  expect(read).toHaveBeenCalledTimes(39);
});

it('shares in-flight builds, merges concurrent cache writes and returns independent response objects', async () => {
  const { db, cache } = await fixture();
  const gate = Promise.withResolvers<void>();
  const read = vi.fn(async () => {
    await gate.promise;
    return { rows: [{ users: 123 }] };
  });
  const results = Promise.all([
    cache.load('1', ['a'], read),
    cache.load('1', ['a'], read),
    cache.load('1', ['b'], read),
  ]);
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  gate.resolve();
  const [first, second] = await results;
  first.rows[0].users = 999;
  expect(second.rows[0].users).toBe(123);
  const restarted = new Ga4ReportCache(db);
  expect(await restarted.load('1', ['a'], read)).toEqual({
    rows: [{ users: 123 }],
  });
  await restarted.load('1', ['b'], read);
  expect(read).toHaveBeenCalledTimes(2);
});

it('does not cache failures and gives partial reports only their short retry lifetime', async () => {
  const { db, cache } = await fixture();
  const read = vi
    .fn<() => Promise<{ missing: string[] }>>()
    .mockRejectedValueOnce(new Error('429'))
    .mockResolvedValue({ missing: ['city'] });
  await expect(cache.load('1', ['period'], read)).rejects.toThrow('429');
  vi.useFakeTimers({ toFake: ['Date'] });
  await cache.load('1', ['period'], read, () => 300000);
  await new Ga4ReportCache(db).load('1', ['period'], read);
  expect(read).toHaveBeenCalledTimes(2);
  vi.setSystemTime(Date.now() + 300000);
  await new Ga4ReportCache(db).load('1', ['period'], read);
  expect(read).toHaveBeenCalledTimes(3);
});

it('does not publish rolled-back transaction results into the shared cache', async () => {
  const { db, cache } = await fixture();
  const read = vi.fn(async () => 'uncommitted');
  await expect(
    db.sequelize.transaction(async () => {
      expect(await cache.load('1', ['a'], read)).toBe('uncommitted');
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  read.mockResolvedValue('committed');
  expect(await cache.load('1', ['a'], read)).toBe('committed');
  expect(read).toHaveBeenCalledTimes(2);
});

it('does not cache a row detail when GA4 refuses one of its reports', async () => {
  const { db } = await fixture();
  const service = new WebsiteReport({ db });
  const batch = vi
    .fn()
    .mockResolvedValueOnce([null, {}])
    .mockResolvedValue([{}, {}]);
  service.batch = batch;
  const window = {
    start: '2026-10-04',
    end: '2026-10-10',
    previousStart: '2026-09-27',
    previousEnd: '2026-10-03',
  };
  const selection = { table: 'page', dims: { pagePath: '/docs' } };
  await expect(
    service.row('1', '123', window, selection),
  ).rejects.toMatchObject({ status: 502 });
  await expect(
    service.row('1', '123', window, selection),
  ).resolves.toMatchObject({ daily: [] });
  expect(batch).toHaveBeenCalledTimes(2);
});

it('reuses GA4 history after sync changes while rebuilding current Search Console enrichment', async () => {
  const { db } = await fixture();
  const snippets = (keyword: string) => [
    { key: 'history-web', payload: [{ date: '2026-10-10', views: 123 }] },
    {
      key: 'queries-7',
      payload: [
        {
          keyword,
          page: 'https://example.com/docs',
          clicks: 3,
          impressions: 10,
          position: 2,
        },
      ],
    },
  ];
  let snaps = snippets('before');
  const host = {
    db,
    sync: {
      link: async () => legacyRecord({ ga4PropertyId: '123' }),
      snapshots: async () => snaps,
      snapshotKey: vi.fn(async () => ({ key: 'changed-snapshot' })),
    },
  };
  const read = vi.fn(async () => ({
    totals: {},
    tables: { page: [{ key: '/docs' }] },
    missing: [],
  }));
  const views = new DataViews(host);
  views.ga4.readPeriod = read;
  const first = await views.website('1', { range: '7' });
  snaps = snippets('after');
  const next = await views.website('1', { range: '7' });
  expect(read).toHaveBeenCalledTimes(1);
  expect(first.tables.page[0].queries[0].keyword).toBe('before');
  expect(next.tables.page[0].queries[0].keyword).toBe('after');
  const restarted = new DataViews(host);
  restarted.ga4.readPeriod = read;
  await restarted.website('1', { range: '7' });
  expect(read).toHaveBeenCalledTimes(1);
  expect(host.sync.snapshotKey).not.toHaveBeenCalled();
  const original = read.mock.results[0].value;
  expect(await original).toEqual({
    totals: {},
    tables: { page: [{ key: '/docs' }] },
    missing: [],
  });
  host.sync.link = async () => {
    throw Object.assign(new Error('disconnected'), {
      code: 'NOCOREACH_GOOGLE_NOT_CONNECTED',
    });
  };
  expect(await restarted.website('1', { range: '7' })).toEqual({
    connected: false,
  });
  expect(read).toHaveBeenCalledTimes(1);
});

it('persists row details and rolls relative historical queries over on the next business day', async () => {
  const { db } = await fixture();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T23:30:00Z'));
  const service = new WebsiteReport({ db });
  const period = vi.fn(async () => ({ tables: {}, missing: [] }));
  const row = vi.fn(async () => ({ daily: [], totals: {} }));
  service.readPeriod = period;
  service.readRow = row;
  const window = {
    start: '2026-10-04',
    end: '2026-10-10',
    previousStart: '2026-09-27',
    previousEnd: '2026-10-03',
  };
  const selection = { table: 'page', dims: { pagePath: '/docs' } };
  await service.period('1', '123', window);
  await service.row('1', '123', window, selection);
  const restarted = new WebsiteReport({ db });
  restarted.readPeriod = period;
  restarted.readRow = row;
  vi.setSystemTime(new Date('2026-10-17T00:01:00Z'));
  await restarted.period('1', '123', window);
  await restarted.row('1', '123', window, selection);
  expect(period).toHaveBeenCalledTimes(2);
  expect(row).toHaveBeenCalledTimes(1);
});

it.each(['daily', 'change'])(
  'expires a missing %s subreport after five minutes through actual period parsing',
  async (part) => {
    const { db } = await fixture();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    const service = new WebsiteReport({ db });
    const reports = Array.from(
      { length: 2 + Object.keys(TABLES).length + Object.keys(CHANGES).length },
      () => ({}) as object | null,
    );
    reports[part === 'daily' ? 1 : reports.length - 1] = null;
    const batch = vi.fn(async () => reports);
    service.batch = batch;
    const first = await service.period(
      '1',
      '123',
      windowFor('2026-10-10', '7'),
    );
    expect(first).toMatchObject({
      missing: [],
      complete: false,
      cacheExpiresAt: Date.now() + GA4_PARTIAL_CACHE_MS,
    });
    const restarted = new WebsiteReport({ db });
    restarted.batch = batch;
    vi.setSystemTime(Date.now() + GA4_PARTIAL_CACHE_MS - 1);
    await restarted.period('1', '123', windowFor('2026-10-10', '7'));
    expect(batch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 1);
    await restarted.period('1', '123', windowFor('2026-10-10', '7'));
    expect(batch).toHaveBeenCalledTimes(2);
  },
);

it.each([
  { range: '7' },
  { range: 'all' },
  { range: 'custom', from: '2026-10-02', to: '2026-10-06' },
])(
  'keeps $range row details on the cached report window after sync advances and rejects invalid cutoffs',
  async (range) => {
    const { db } = await fixture();
    let end = '2026-10-10';
    const views = new DataViews({
      db,
      sync: {
        link: async () => legacyRecord({ ga4PropertyId: '123' }),
        snapshots: async () => [
          {
            key: 'history-web',
            payload: [{ date: '2026-10-01' }, { date: end }],
          },
        ],
      },
    });
    views.ga4.readPeriod = vi.fn(async () => ({ tables: {}, missing: [] }));
    const read = vi.fn(async () => ({ daily: [], totals: {} }));
    views.ga4.readRow = read;
    const main = await views.website('1', range);
    expect(main.window).toEqual(
      windowFor(end, range.range, range.from, range.to, '2026-10-01'),
    );
    end = '2026-10-11';
    const selection = {
      ...range,
      cutoff: main.cutoff,
      table: 'page',
      dims: { pagePath: '/docs' },
    };
    const detail = await views.websiteRow('1', selection);
    expect(detail.window).toEqual(main.window);
    expect(detail.cutoff).toBe('2026-10-10');
    expect(
      (await views.websiteRow('1', { ...selection, cutoff: undefined })).cutoff,
    ).toBe(end);
    for (const cutoff of ['2026-10-12', '2026-09-30', '2026-02-30', '', null])
      await expect(
        views.websiteRow('1', { ...selection, cutoff }),
      ).rejects.toMatchObject({ status: 400 });
    expect(read).toHaveBeenCalledTimes(range.range === 'custom' ? 1 : 2);
  },
);

it('keys row details by validated dimensions and dates rather than input object shape', async () => {
  const { db } = await fixture();
  const service = new WebsiteReport({ db });
  const batch = vi.fn(async () => [{}, {}]);
  service.batch = batch;
  const w = windowFor('2026-10-10', '7');
  await service.row('1', '123', w, {
    table: 'sourceMedium',
    dims: { sessionSource: 'google', sessionMedium: 'organic' },
  });
  await service.row(
    '1',
    '123',
    { ...w, days: 999 },
    {
      ignored: true,
      table: 'sourceMedium',
      dims: {
        ignored: 'extra',
        sessionMedium: 'organic',
        sessionSource: 'google',
      },
    },
  );
  expect(batch).toHaveBeenCalledTimes(1);
  await expect(
    service.row('1', '123', w, {
      table: 'sourceMedium',
      dims: { sessionSource: 'google' },
    }),
  ).rejects.toMatchObject({ status: 400 });
  await service.row('1', '123', w, {
    table: 'sourceMedium',
    dims: { sessionSource: 'google', sessionMedium: 'cpc' },
  });
  expect(batch).toHaveBeenCalledTimes(2);
});

it.each([
  ['today', GA4_TODAY_CACHE_MS],
  ['realtime', GA4_REALTIME_CACHE_MS],
] as const)(
  'preserves server expiry when reusing %s results',
  async (method, ttl) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const service = new WebsiteReport({});
    service.timeZone = async () => 'UTC';
    service.batch = vi.fn(async () => [{}]);
    service.post = vi.fn(async () => ({}));
    const first = (await service[method]('1', '123')) as {
      cacheExpiresAt: number;
    };
    expect(first.cacheExpiresAt).toBe(Date.now() + ttl);
    vi.setSystemTime(Date.now() + ttl - 1);
    const reused = await service[method]('1', '123');
    expect(reused).toBe(first);
    vi.setSystemTime(Date.now() + 1);
    const refreshed = (await service[method]('1', '123')) as {
      cacheExpiresAt: number;
    };
    expect(refreshed.cacheExpiresAt).toBe(Date.now() + ttl);
  },
);

it('bounds snapshot bytes and serves oversized results without retaining them', async () => {
  const { db, cache } = await fixture();
  const oversized = vi.fn(async () => ({ rows: 'x'.repeat(2 * 1024 * 1024) }));
  expect((await cache.load('1', ['large'], oversized)).rows).toHaveLength(
    2 * 1024 * 1024,
  );
  await cache.load('1', ['large'], oversized);
  expect(oversized).toHaveBeenCalledTimes(2);
  expect(
    await db
      .getRepository('nrSnapshots')
      .findOne({ filter: { key: 'ga4-reports:1' } }),
  ).toBeNull();
  const read = vi.fn(async () => ({ rows: 'x'.repeat(400000) }));
  for (let i = 0; i < 32; i++) await cache.load('1', ['bounded', i], read);
  const payload = (
    await db
      .getRepository('nrSnapshots')
      .findOne({ filter: { key: 'ga4-reports:1' } })
  )?.get('payload');
  expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(
    8 * 1024 * 1024,
  );
  await new Ga4ReportCache(db).load('1', ['bounded', 31], read);
  expect(read).toHaveBeenCalledTimes(32);
});
