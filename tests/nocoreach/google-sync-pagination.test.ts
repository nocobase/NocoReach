// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { GoogleDailySync } from '../../server/nocoreach/google-sync';

function fixture(fetcher: typeof fetch, source = 'ga4') {
  const sync = new GoogleDailySync({
    getAccessToken: async () => 'test-token',
    propertyId: '123',
    propertyTimeZone: 'UTC',
    siteUrl: 'https://example.com/',
    reportTypes: source === 'gsc' ? ['query_page'] : ['source'],
    searchTypes: ['web'],
    db: {
      sequelize: {
        transaction: (fn: (tx: object) => Promise<unknown>) => fn({}),
      },
    },
    fetcher,
  });
  vi.spyOn(sync, 'createRun').mockResolvedValue(1);
  vi.spyOn(sync, 'finishRun').mockResolvedValue(undefined);
  vi.spyOn(sync, 'replaceWindow').mockResolvedValue(undefined);
  const write = vi
    .spyOn(sync, 'writeRows')
    .mockImplementation(async (_resource, rows) => rows.length);
  return { sync, write };
}
const oversized = () =>
  Object.assign(new Error('sanitized'), { code: 'NR_RESPONSE_TOO_LARGE' });
const range = { startDate: '2026-10-01', endDate: '2026-10-01' };
it('shrinks oversized GA4 pages at the same offset and writes every row once', async () => {
  const requests: { limit: string; offset: string }[] = [];
  const { sync, write } = fixture(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    if (Number(body.limit) > 5000) throw oversized();
    const offset = Number(body.offset);
    const rows = Array.from({ length: offset === 0 ? 5000 : 1 }, (_, i) => ({
      dimensionValues: [
        '20261001',
        'Organic Search',
        `source-${offset + i}`,
      ].map((value) => ({ value })),
      metricValues: [{ value: '1' }],
    }));
    return Response.json({ rowCount: 5001, rows });
  });
  expect(await sync.syncGa4(range)).toMatchObject({
    recordsRead: 5001,
    recordsWritten: 5001,
  });
  expect(requests.map(({ limit, offset }) => [limit, offset])).toEqual([
    ['10000', '0'],
    ['5000', '0'],
    ['5000', '5000'],
  ]);
  expect(write).toHaveBeenCalledTimes(1);
  expect(
    new Set(
      write.mock.calls[0][1].map((row: { grainKey: string }) => row.grainKey),
    ).size,
  ).toBe(5001);
  expect(sync.finishRun).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ status: 'succeeded' }),
  );
});
it('shrinks oversized GSC pages at the same startRow, including later pages, without losing or duplicating rows', async () => {
  const requests: { rowLimit: number; startRow: number }[] = [];
  const { sync, write } = fixture(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    if (body.rowLimit > (body.startRow === 0 ? 12500 : 6250)) throw oversized();
    const rows = Array.from(
      { length: Math.min(body.rowLimit, 18751 - body.startRow) },
      (_, i) => ({
        keys: [
          '2026-10-01',
          `query-${body.startRow + i}`,
          'https://example.com/',
          'usa',
          'DESKTOP',
        ],
        clicks: 1,
        impressions: 2,
        ctr: 0.5,
        position: 1,
      }),
    );
    return Response.json({ rows });
  }, 'gsc');
  expect(await sync.syncGsc(range)).toMatchObject({
    recordsRead: 18751,
    recordsWritten: 18751,
  });
  expect(
    requests.map(({ rowLimit, startRow }) => [rowLimit, startRow]),
  ).toEqual([
    [25000, 0],
    [12500, 0],
    [12500, 12500],
    [6250, 12500],
    [6250, 18750],
  ]);
  expect(write).toHaveBeenCalledTimes(1);
  expect(
    new Set(
      write.mock.calls[0][1].map((row: { grainKey: string }) => row.grainKey),
    ).size,
  ).toBe(18751);
  expect(sync.finishRun).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ status: 'succeeded' }),
  );
});

it.each(['ga4', 'gsc'])(
  '%s stops shrinking at one row and preserves the size error without writing partial data',
  async (source) => {
    const fetcher = vi.fn(async () => {
      throw oversized();
    });
    const { sync, write } = fixture(fetcher, source);
    await expect(
      source === 'gsc' ? sync.syncGsc(range) : sync.syncGa4(range),
    ).rejects.toMatchObject({
      code: 'response_too_large',
    });
    expect(fetcher).toHaveBeenCalledTimes(source === 'gsc' ? 15 : 14);
    expect(write).not.toHaveBeenCalled();
    expect(sync.replaceWindow).not.toHaveBeenCalled();
    expect(sync.finishRun).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'failed' }),
    );
  },
);
it.each(['ga4', 'gsc'])(
  '%s does not shrink pages on ordinary network errors',
  async (source) => {
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    });
    const { sync } = fixture(fetcher, source);
    await expect(
      source === 'gsc' ? sync.syncGsc(range) : sync.syncGa4(range),
    ).rejects.toMatchObject({
      code: 'network_unreachable',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
