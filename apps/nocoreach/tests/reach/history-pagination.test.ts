import { afterEach, expect, it, vi } from 'vitest';
import { GoogleDailySync } from '../../server/providers/reach/domain/google-sync.cjs';
import { GitHubSource } from '../../server/providers/reach/domain/github-source.cjs';
afterEach(() => vi.unstubAllGlobals());
it('reads every Search Console page with smaller responses and preserves rows', async () => {
  const calls: { rowLimit: number; startRow: number }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      const length = body.startRow === 0 ? 5000 : 1;
      return {
        ok: true,
        json: async () => ({
          rows: Array.from({ length }, (_, i) => ({
            keys: [
              '2026-09-29',
              'query-' + (body.startRow + i),
              'https://example.com/',
              'usa',
              'DESKTOP',
            ],
            clicks: 1,
            impressions: 2,
            ctr: 0.5,
            position: 1,
          })),
        }),
      };
    }),
  );
  const runner = new GoogleDailySync({
    store: { transaction: (fn: (tx: null) => unknown) => fn(null) },
    getAccessToken: async () => 'test',
    siteUrl: 'sc-domain:example.com',
    reportTypes: ['query_page'],
    searchTypes: ['web'],
    dataState: 'final',
  });
  runner.createRun = async () => 1;
  runner.finishRun = async () => undefined;
  runner.replaceWindow = async () => undefined;
  const queries: string[] = [];
  runner.writeRows = async (
    _resource: string,
    rows: { queryFull: string }[],
  ) => {
    queries.push(...rows.map((row) => row.queryFull));
    return rows.length;
  };
  const result = await runner.syncGsc({
    startDate: '2026-09-29',
    endDate: '2026-09-29',
  });
  expect(
    calls.map(({ rowLimit, startRow }) => ({ rowLimit, startRow })),
  ).toEqual([
    { rowLimit: 5000, startRow: 0 },
    { rowLimit: 5000, startRow: 5000 },
  ]);
  expect(result.recordsRead).toBe(5001);
  expect(new Set(queries).size).toBe(5001);
});
it('reads paginated Fork creation dates without downloading complete repository objects', async () => {
  const request = vi.fn(async (_url, init) => {
    const { variables } = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        data: {
          repository: {
            forks: {
              pageInfo: { hasNextPage: !variables.after, endCursor: 'next' },
              nodes: [
                {
                  createdAt: variables.after
                    ? '2026-09-02T00:00:00Z'
                    : '2026-09-01T00:00:00Z',
                },
              ],
            },
          },
        },
      }),
    };
  });
  const source = new GitHubSource({}, request);
  const result = await source.readHistory(
    'forks',
    { repo: 'org/repo' },
    'test',
  );
  expect(result.total).toBe(2);
  expect([...result.days]).toEqual([
    ['2026-09-01', 1],
    ['2026-09-02', 1],
  ]);
  expect(request).toHaveBeenCalledTimes(2);
});
