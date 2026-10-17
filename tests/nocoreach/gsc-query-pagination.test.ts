// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { DataViews } from '../../server/nocoreach/data-views';

const oversized = () =>
  Object.assign(new Error('sanitized'), { code: 'NR_RESPONSE_TOO_LARGE' });
const site = 'https://example.com/';
const body = {
  startDate: '2026-10-01',
  endDate: '2026-10-01',
  dimensions: ['query', 'page'],
};
const row = (query: string) => ({
  keys: [query, site],
  clicks: 1,
  impressions: 10,
  ctr: 0.1,
  position: 4,
});
function fixture(fetcher: typeof fetch) {
  const googleFetch = vi.fn<(id: string) => typeof fetch>(() => fetcher);
  return {
    views: new DataViews({ token: async () => 'test-token', googleFetch }),
    googleFetch,
  };
}

it.each([25000, 250])(
  'shrinks GSC country view pages from %i and advances by actual rows read',
  async (limit) => {
    const requests: { rowLimit: number; startRow: number }[] = [];
    const total = limit / 2 + 1;
    const { views, googleFetch } = fixture(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      requests.push(request);
      if (request.rowLimit > limit / 2) throw oversized();
      return Response.json({
        rows: Array.from(
          { length: Math.min(request.rowLimit, total - request.startRow) },
          (_, i) => row(String(request.startRow + i)),
        ),
      });
    });
    const rows = await views.gscQuery('project', site, {
      ...body,
      ...(limit === 250 ? { rowLimit: limit } : {}),
    });
    expect(
      requests.map(({ rowLimit, startRow }) => [rowLimit, startRow]),
    ).toEqual([
      [limit, 0],
      [limit / 2, 0],
      [limit / 2, limit / 2],
    ]);
    expect(rows.map((row: { keys: string[] }) => row.keys[0])).toEqual(
      Array.from({ length: total }, (_, i) => String(i)),
    );
    expect(googleFetch.mock.calls.every((args) => args[0] === 'project')).toBe(
      true,
    );
  },
);

it('stops GSC country view pagination at the existing 100000-row limit', async () => {
  const starts: number[] = [];
  const { views } = fixture(async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    starts.push(request.startRow);
    return Response.json({
      rows: Array.from({ length: request.rowLimit }, () => row('query')),
    });
  });
  expect(await views.gscQuery('project', site, body)).toHaveLength(100000);
  expect(starts).toEqual([0, 25000, 50000, 75000]);
});

it('propagates an oversized single row without returning earlier partial pages', async () => {
  const requests: { rowLimit: number; startRow: number }[] = [];
  const { views } = fixture(async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    requests.push(request);
    if (request.startRow === 0)
      return Response.json({ rows: [row('a'), row('b')] });
    throw oversized();
  });
  await expect(
    views.gscQuery('project', site, { ...body, rowLimit: 2 }),
  ).rejects.toMatchObject({ code: 'response_too_large' });
  expect(
    requests.map(({ rowLimit, startRow }) => [rowLimit, startRow]),
  ).toEqual([
    [2, 0],
    [2, 2],
    [1, 2],
  ]);
});

it('does not retry ordinary network errors with smaller pages', async () => {
  const fetcher = vi.fn(async () => {
    throw new Error('offline');
  });
  const { views } = fixture(fetcher);
  await expect(views.gscQuery('project', site, body)).rejects.toMatchObject({
    code: 'network_unreachable',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([
  { ...row('query'), keys: ['query'] },
  { ...row('query'), clicks: undefined },
  { ...row('query'), impressions: '10' },
])(
  'rejects malformed rows without treating them as empty data: %j',
  async (invalid) => {
    const fetcher = vi.fn(async () => Response.json({ rows: [invalid] }));
    const { views } = fixture(fetcher);
    await expect(views.gscQuery('project', site, body)).rejects.toThrow(
      'Invalid Search Console rows',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
