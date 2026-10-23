import { expect, it } from 'vitest';
import {
  QUERY_SOURCES,
  queryDataTool,
  type QuerySources,
} from '../../server/nocoreach/online-agent/query-tool';

type Row = Record<string, unknown>;
type Answer = {
  source: string;
  page?: string;
  url?: string;
  accessDenied?: boolean;
  connected?: boolean;
  error?: string;
  message?: string;
  supported?: string[];
  dataThrough?: string | null;
  period?: { start: string; end: string } | null;
  summary?: unknown;
  tables?: string[];
  table?: string;
  total?: number;
  rows?: Row[];
  nextOffset?: number | null;
  notes?: string[];
};

const N = 150;
const many = <T>(n: number, f: (i: number) => T) =>
  Array.from({ length: n }, (_, i) => f(i));
// Day i counts back from 2026-10-20, the cutoff of every fake source.
const day = (i: number) =>
  new Date(Date.UTC(2026, 9, 20) - i * 86400000).toISOString().slice(0, 10);
const window = {
  start: day(27),
  end: day(0),
  days: 28,
  previousStart: day(55),
  previousEnd: day(28),
};
const daily = (f: (i: number) => Row = () => ({})) =>
  many(28, (i) => ({ date: day(27 - i), ...f(i) }));
const kpis = [{ key: 'posts', value: 28, previous: 20, change: 0.4 }];

function fixture() {
  const calls: [string, ...unknown[]][] = [];
  const note = (name: string, ...args: unknown[]) =>
    calls.push([name, ...args]);
  const search = (prefix: string) => ({
    rows: many(N, (i) => ({
      key: `${prefix} ${i}`,
      clicks: N - i,
      impressions: 2000 - i,
      ctr: 0.05,
      position: 4.2,
    })),
    total: 4000,
  });
  const movers = {
    rising: many(N, (i) => ({
      key: `rising ${i}`,
      clicks: 10,
      previousClicks: 2,
      change: 8,
    })),
    falling: many(N, (i) => ({
      key: `falling ${i}`,
      clicks: 1,
      previousClicks: 9,
      change: -8,
    })),
    fresh: [],
  };
  const repo = (i: number) => ({
    repo: `owner/repo-${i}`,
    url: `https://github.com/owner/repo-${i}`,
    stars: 1000 - i,
    gained: N - i,
    matched: ['ai'],
  });
  const sources: QuerySources = {
    dataViews: {
      async search(id, v) {
        note('search', v);
        const values = v as Row;
        if (!values.details)
          return {
            connected: true,
            cutoff: day(0),
            window,
            totals: {
              clicks: 900,
              impressions: 40000,
              ctr: 0.0225,
              position: 7.1,
            },
            previous: {
              clicks: 1100,
              impressions: 38000,
              ctr: 0.0289,
              position: 6.8,
            },
            complete: true,
            previousComplete: true,
            trend: daily((i) => ({ clicks: 30 + i, impressions: 1400 })),
          };
        return {
          connected: true,
          cutoff: day(0),
          window,
          queries: search('query'),
          pages: search('https://example.test/docs/page'),
          striking: many(N, (i) => ({
            query: `near ${i}`,
            page: '/x',
            position: 8,
          })),
          movers: { query: movers, page: movers },
        };
      },
      async searchRow(id, v) {
        note('searchRow', v);
        return {
          connected: true,
          trend: daily(() => ({
            clicks: 2,
            impressions: 50,
            previousClicks: 1,
            previousImpressions: 40,
          })),
          related: many(N, (i) => ({
            key: `https://example.test/p/${i}`,
            clicks: 3,
          })),
        };
      },
      async searchBreakdown(id, v) {
        note('searchBreakdown', v);
        return {
          connected: true,
          countries: many(60, (i) => ({ key: `c${i}`, clicks: 60 - i })),
          devices: [{ key: 'MOBILE', clicks: 4 }],
          appearances: [],
        };
      },
      async website(id, v) {
        note('website', v);
        return {
          connected: true,
          cutoff: day(0),
          window,
          totals: { current: { sessions: 5000 }, previous: { sessions: 4200 } },
          daily: daily(() => ({ sessions: 180 })),
          tables: {
            page: many(300, (i) => ({
              key: `/docs/${i}`,
              dims: { pagePath: `/docs/${i}` },
              title: `Doc ${i}`,
              views: 3000 - i,
              queries: many(8, (j) => ({ keyword: `kw ${j}`, clicks: j })),
            })),
            channel: many(8, (i) => ({
              key: `ch${i}`,
              dims: { sessionDefaultChannelGroup: `Channel ${i}` },
              sessions: 100 - i,
            })),
          },
          changes: {
            page: many(N, (i) => ({
              key: `/docs/${i}`,
              current: { views: 10 },
              previous: { views: 20 },
            })),
          },
          missing: [],
          complete: true,
        };
      },
      async page(id, v) {
        note('page', v);
        return {
          connected: true,
          window,
          gscCutoff: day(1),
          ga4Cutoff: day(0),
          daily: daily(() => ({ clicks: 1, impressions: 10, views: 5 })),
        };
      },
      async github(id, v) {
        note('github', v);
        return {
          connected: true,
          repo: 'owner/product',
          window,
          cutoff: day(0),
          totals: { stars: 5000 },
          figures: { starsAdded: 120 },
          previous: { starsAdded: 100 },
          token: 'ghp_never_shown',
          daily: daily(() => ({ stars: 4 })),
          tables: {
            referrers: {
              items: many(N, (i) => ({ key: `site${i}.test`, count: N - i })),
            },
            issues: many(N, (i) => ({ number: i, title: `Issue ${i}` })),
          },
          composition: { languages: [{ name: 'TypeScript', share: 0.9 }] },
        };
      },
      async downloads(id, v) {
        note('downloads', v);
        return {
          connected: true,
          window,
          cutoff: day(0),
          items: [{ id: 'npm:product', downloads: 12000 }],
          daily: daily(() => ({ downloads: 400 })),
          tables: {
            versions: many(N, (i) => ({ version: `1.${i}.0` })),
            tags: [],
            assets: [],
          },
        };
      },
      async community(id, v) {
        note('community', v);
        return {
          connected: true,
          origin: 'https://forum.example.test',
          title: 'Forum',
          window,
          kpis,
          daily: daily(() => ({ topics: 1 })),
          categories: [{ name: 'Help', count: 20 }],
          top: [],
        };
      },
      async hackernews(id, v) {
        note('hackernews', v);
        return {
          connected: true,
          terms: ['product'],
          window,
          kpis,
          series: daily(() => ({ value: 1 })),
          stories: [],
        };
      },
      async ranks(id, v) {
        note('ranks', v);
        return {
          connected: true,
          cutoff: day(0),
          window: { start: window.start, end: window.end },
          ranks: {
            'keyword 1': {
              clicks: 7,
              impressions: 90,
              position: 3.5,
              page: 'https://example.test/k1',
            },
          },
        };
      },
    },
    siteContent: {
      async list(id, range, from, to) {
        note('siteContent.list', range, from, to);
        return {
          range,
          window,
          cutoff: day(0),
          pages: many(N, (i) => ({
            url:
              i % 2
                ? `https://example.test/docs/${i}`
                : `https://example.test/blog/${i}`,
            type: i % 2 ? 'docs' : 'blog',
            title: `Page ${i}`,
            lastmod: day(400 + i),
            views: N - i,
            links: many(100, (j) => `example.test/${j}`),
          })),
          summary: { pages: N, types: { docs: 75, blog: 75 } },
          limitations: ['Figures come from every synced day.'],
        };
      },
    },
    audit: {
      async report() {
        return {
          connected: true,
          total: N,
          read: N,
          pending: 0,
          newestRead: `${day(0)}T03:00:00Z`,
          counts: { critical: 1, warning: 30, notice: 0 },
          issues: [
            {
              type: 'broken',
              severity: 'critical',
              title: 'Broken',
              count: 1,
              pages: [
                {
                  url: 'https://example.test/gone',
                  title: 'Gone',
                  detail: '404',
                },
              ],
            },
            {
              type: 'noDescription',
              severity: 'warning',
              title: 'No description',
              count: 30,
              pages: many(30, (i) => ({
                url: `https://example.test/d/${i}`,
                title: '',
              })),
            },
          ],
        };
      },
    },
    searchIndex: {
      async site() {
        return 'sc-domain:example.test';
      },
      async state() {
        return {
          site: 'sc-domain:example.test',
          results: { 'https://example.test/': {} },
        };
      },
      async view() {
        note('searchIndex.view');
        return {
          connected: true,
          total: N,
          lastRunAt: `${day(0)}T00:00:00Z`,
          pages: many(N, (i) => ({
            url: `https://example.test/${i}`,
            status: i % 3 ? 'indexed' : 'notIndexed',
          })),
        };
      },
    },
    keywordService: {
      async saved() {
        return {
          tags: [{ id: 't1', name: 'Core' }],
          items: many(N, (i) => ({
            keyword: `keyword ${i}`,
            source: 'dataforseo',
            tagIds: i === 1 ? ['t1'] : [],
            metrics: { volume: 1000 - i, difficulty: 30 },
            savedAt: `${day(i)}T00:00:00Z`,
          })),
        };
      },
    },
    rankTracking: {
      async status() {
        return {
          lastRun: { at: `${day(0)}T00:00:00Z` },
          keywords: many(N, (i) => ({
            keyword: `tracked ${i}`,
            latest: {
              at: `${day(0)}T00:00:00Z`,
              position: i + 1,
              url: 'https://example.test/',
            },
            previous: { position: i + 2 },
            history: many(12, (j) => ({
              at: day(j * 7),
              position: i + 1,
              runId: 'r',
            })),
          })),
        };
      },
    },
    keywordSuggest: {
      async view() {
        return {
          market: { language: 'en' },
          items: many(N, (i) => ({
            id: String(i),
            keyword: `idea ${i}`,
            metrics: { volume: i },
          })),
        };
      },
    },
    trends: {
      async state() {
        return {
          terms: ['product', 'rival'],
          status: 'active',
          latest: {
            at: `${day(2)}T00:00:00Z`,
            terms: ['product', 'rival'],
            points: many(52, (i) => ({
              date: day(7 * (51 - i)),
              values: [40 + (i % 10), 30],
            })),
            top: [{ query: 'product docs', value: 100 }],
            rising: many(25, (i) => ({ query: `rising ${i}`, value: 100 - i })),
          },
          keywords: [
            {
              id: 'k',
              keyword: 'ai agent',
              latest: {
                at: day(3),
                points: many(52, () => ({ value: 20 })),
                rising: [],
                top: [],
              },
            },
          ],
        };
      },
      async view() {
        note('trends.view');
        throw new Error('the page view syncs terms');
      },
    },
    competitors: {
      async view(id, v) {
        note('competitors.view', v);
        return {
          connected: true,
          lastRun: { at: `${day(1)}T00:00:00Z` },
          list: [
            {
              id: 'c1',
              name: 'Rival',
              site: 'https://rival.test',
              latestRelease: { name: 'v2.0' },
            },
          ],
          events: many(N, (i) => ({
            competitor: 'Rival',
            type: 'page',
            title: `New page ${i}`,
            url: `https://rival.test/${i}`,
            at: `${day(i % 60)}T00:00:00Z`,
          })),
          notes: [],
        };
      },
    },
    aiSearch: {
      async state() {
        return {
          brands: [
            {
              spec: {
                platform: 'chat_gpt',
                target: 'Product',
                competitors: ['Rival'],
              },
              result: { mentions: 12, share: { mine: 12, total: 40 } },
              at: day(3),
            },
          ],
          answers: [
            {
              question: 'Best open source tool?',
              models: {
                chat_gpt: {
                  mentioned: true,
                  ownCited: 1,
                  text: 'x'.repeat(5000),
                  citations: [],
                  at: day(4),
                },
              },
            },
          ],
        };
      },
      async list() {
        return many(40, (i) => ({
          kind: 'brand',
          group: `g${i}`,
          label: `Lookup ${i}`,
          runs: {},
        }));
      },
    },
    community: {
      async state() {
        return {
          origin: 'https://forum.example.test',
          categories: { 1: 'Help' },
          topics: Object.fromEntries(
            many(N, (i) => [
              i,
              {
                id: i,
                slug: `topic-${i}`,
                title: `Topic ${i}`,
                categoryId: 1,
                replies: i % 4 ? 2 : 0,
                views: 10,
                createdAt: `${day(i)}T08:00:00Z`,
              },
            ]),
          ),
        };
      },
    },
    hackernews: {
      async state() {
        return {
          mentions: Object.fromEntries(
            many(N, (i) => [
              i,
              {
                type: i % 2 ? 'comment' : 'story',
                title: `HN ${i}`,
                url: 'https://example.test',
                hnUrl: `https://news.ycombinator.com/item?id=${i}`,
                points: (i * 37) % 101,
                comments: 3,
                createdAt: `${day(i % 40)}T00:00:00Z`,
                term: 'product',
              },
            ]),
          ),
        };
      },
    },
    reddit: {
      async view(id, v, windowFor) {
        note('reddit.view', v, typeof windowFor);
        return {
          connected: true,
          terms: ['product'],
          window,
          kpis,
          subreddits: [{ name: 'selfhosted', count: 9 }],
          notes: ['Found through Google once a week.'],
        };
      },
      async state() {
        return {
          dataThrough: day(1),
          posts: Object.fromEntries(
            many(N, (i) => [
              `p${i}`,
              {
                id: `p${i}`,
                title: i % 5 ? `Thread ${i}` : `Alternatives to product ${i}`,
                url: `https://reddit.com/r/x/${i}`,
                subreddit: 'selfhosted',
                snippet: 'a'.repeat(3000),
                postedAt: `${day(i % 50)}T00:00:00Z`,
                firstSeenAt: `${day(0)}T00:00:00Z`,
                term: 'product',
              },
            ]),
          ),
        };
      },
    },
    xSource: {
      async view(id, v) {
        note('x.view', v);
        return {
          connected: true,
          terms: ['product'],
          handle: 'product',
          window,
          kpis,
          series: daily(() => ({ value: 2 })),
          spend: { usd: 1 },
        };
      },
      async state() {
        return {
          posts: Object.fromEntries(
            many(N, (i) => [
              `x${i}`,
              {
                id: `x${i}`,
                text: `${i} `.padEnd(600, 'z'),
                url: `https://x.com/i/web/status/${i}`,
                createdAt: `${day(i % 28)}T00:00:00Z`,
                metrics: {
                  likes: i,
                  reposts: 0,
                  replies: 1,
                  quotes: 0,
                  views: 100,
                },
              },
            ]),
          ),
        };
      },
    },
    chat: {
      async view(id, v) {
        note('chat.view', v);
        const platform = (v as Row).platform;
        return {
          connected: true,
          platform,
          window,
          kpis,
          series: daily(),
          channels: [{ channel: 'help', messages: 9 }],
          open: [{ channel: 'help', text: 'How?', createdAt: day(2) }],
          busiest: [],
        };
      },
      async state() {
        return {
          messages: Object.fromEntries(
            many(N, (i) => [
              `m${i}`,
              {
                platform: i % 2 ? 'discord' : 'slack',
                channel: 'help',
                channelId: 'c',
                text: `Message ${i}`,
                createdAt: `${day(i % 40)}T00:00:00Z`,
                replies: 1,
                question: false,
              },
            ]),
          ),
        };
      },
    },
    youtube: {
      async report(id, v) {
        note('youtube.report', v);
        const limit = Number((v as Row).limit);
        return {
          connected: true,
          window,
          kpis,
          matched: 230,
          trend: daily(),
          groups: [],
          videos: many(limit, (i) => ({
            id: `v${i}`,
            title: `Video ${i}`,
            views: 1000 - i,
            captions: 'c'.repeat(9000),
          })),
        };
      },
    },
    bilibili: {
      async report(id, v) {
        note('bilibili.report', v);
        return {
          connected: true,
          window,
          kpis,
          matched: 3,
          trend: daily(),
          groups: [],
          videos: many(3, (i) => ({
            id: `b${i}`,
            title: `Bili ${i}`,
            views: 10,
          })),
        };
      },
    },
    xiaohongshu: {
      async report(id, v) {
        note('xiaohongshu.report', v);
        return {
          connected: true,
          window,
          kpis,
          matched: 2,
          trend: daily(),
          groups: [],
          notes: many(2, (i) => ({
            id: `n${i}`,
            title: `Note ${i}`,
            likes: 4,
            cookie: 'session=never',
          })),
        };
      },
    },
    githubTrends: {
      async view() {
        return {
          ready: true,
          day: day(0),
          topics: [
            { name: 'ai', total: 9000, new7: 40, leaders: many(10, repo) },
          ],
          gainers: { day: many(50, repo), week: many(50, repo), month: [] },
          newHot: { all: many(20, repo) },
          trending: {
            date: day(0),
            daily: many(25, repo),
            weekly: [],
            monthly: [],
          },
        };
      },
    },
    sources: {
      async state() {
        return {
          sources: [
            {
              id: 's1',
              kind: 'web',
              title: 'Changelog',
              url: 'https://example.test/changelog',
              status: 'ready',
              capturedAt: `${day(1)}T00:00:00Z`,
              items: many(40, (i) => ({
                type: 'entry',
                title: `Release ${i}`,
                text: 'Added '.repeat(300),
              })),
            },
          ],
        };
      },
    },
  };
  return { sources, calls };
}

function setup(denied: string[] = []) {
  const { sources, calls } = fixture();
  let authorizations = 0;
  const tool = queryDataTool({
    sources,
    projectId: '7',
    authorize: async () => {
      authorizations++;
    },
    allowed: async (resource, action) =>
      !denied.includes(`${resource}.${action}`),
    link: (path) => `/main${path}`,
    site: 'example.test',
  });
  const ask = async (args: Row) =>
    (await tool.execute(args, new AbortController().signal)) as Answer;
  return { ask, calls, authorizations: () => authorizations };
}
const required: Record<string, Row> = {
  page: { filters: { page: '/docs/start' } },
  search_detail: { filters: { keyword: 'open source crm' } },
};

it('every source answers bounded rows with its page, cutoff, period, total and next offset', async () => {
  const { ask } = setup();
  expect(QUERY_SOURCES).toHaveLength(26);
  const problems: string[] = [];
  for (const source of QUERY_SOURCES) {
    const out = await ask({ source, ...required[source] });
    const rows = out.rows ?? [];
    const checks: [string, boolean][] = [
      ['answers', !out.error && !out.accessDenied && out.connected !== false],
      ['names its page', Boolean(out.page) && /^\/main\//.test(out.url ?? '')],
      [
        'reads its first table',
        Boolean(out.tables?.length) && out.table === out.tables![0],
      ],
      ['bounds rows', rows.length <= 20 && JSON.stringify(out).length < 20000],
      ['gives the cutoff', 'dataThrough' in out],
      [
        'pages the rest',
        out.nextOffset === (out.total! > rows.length ? rows.length : null),
      ],
    ];
    for (const [check, ok] of checks)
      if (!ok) problems.push(`${source}: ${check}`);
  }
  expect(problems).toEqual([]);
  const search = await ask({ source: 'search' });
  expect(search).toMatchObject({
    page: 'Search & market › Performance',
    url: '/main/seo-opportunities',
    dataThrough: '2026-10-20',
    period: { start: '2026-09-23', end: '2026-10-20' },
    previousPeriod: { start: '2026-08-26', end: '2026-09-22' },
    summary: { totals: { clicks: 900 }, previous: { clicks: 1100 } },
    table: 'queries',
    total: 4000,
    nextOffset: 20,
  });
  expect(search.notes).toContain(
    'Only the first 150 of 4000 rows can be read.',
  );
  // The forum's topics are read from the same saved topics as the page, inside the page's window.
  const forum = await ask({ source: 'forum' });
  expect(forum).toMatchObject({ total: 28, nextOffset: 20 });
  expect(forum.rows![0]).toMatchObject({
    title: 'Topic 0',
    url: 'https://forum.example.test/t/topic-0/0',
    category: 'Help',
  });
});

it('pages through every row and keeps long rows under the output limit', async () => {
  const { ask } = setup();
  const seen: string[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const out: Answer = await ask({ source: 'reddit', limit: 100, offset });
    expect(JSON.stringify(out).length).toBeLessThan(20000);
    seen.push(...out.rows!.map((r) => String(r.url)));
    expect(out.rows![0].snippet).toHaveLength(501);
    offset = out.nextOffset!;
  }
  // 50 posting days, three posts each; the window holds 28 of them.
  expect(seen).toHaveLength(28 * 3);
  expect(new Set(seen).size).toBe(seen.length);
  const x = await ask({ source: 'x', limit: 100 });
  expect(x.rows!.length).toBeLessThan(100);
  expect(x.nextOffset).toBe(x.rows!.length);
  expect(x.rows![0]).toMatchObject({ likes: expect.any(Number) });
});

it('filters, sorts and ranges reach the source the way its page asks', async () => {
  const { ask, calls } = setup();
  await ask({
    source: 'search',
    range: '3m',
    table: 'pages',
    filters: { keyword: 'crm', page: '/docs/', country: 'usa' },
  });
  expect(calls.filter(([name]) => name === 'search').map(([, v]) => v)).toEqual(
    [
      {
        range: '3m',
        country: 'usa',
        queryFilter: { operator: 'contains', expression: 'crm' },
        pageFilter: { operator: 'contains', expression: '/docs/' },
      },
      {
        range: '3m',
        country: 'usa',
        queryFilter: { operator: 'contains', expression: 'crm' },
        pageFilter: { operator: 'contains', expression: '/docs/' },
        details: true,
      },
    ],
  );
  const detail = await ask({
    source: 'search_detail',
    filters: { keyword: 'open source crm' },
  });
  expect(calls.find(([name]) => name === 'searchRow')![1]).toMatchObject({
    dimension: 'query',
    key: 'open source crm',
    start: window.start,
    previousEnd: window.previousEnd,
  });
  expect(detail.summary).toMatchObject({ clicks: 56, previousClicks: 28 });
  expect(await ask({ source: 'search_detail' })).toEqual({
    source: 'search_detail',
    error: 'needsKeywordOrPage',
  });
  await ask({ source: 'page', filters: { page: '/docs/start' } });
  expect(calls.find(([name]) => name === 'page')![1]).toMatchObject({
    url: 'https://example.test/docs/start',
  });
  await ask({ source: 'github', from: '2026-01-01', to: '2026-03-31' });
  expect(calls.find(([name]) => name === 'github')![1]).toEqual({
    range: 'custom',
    from: '2026-01-01',
    to: '2026-03-31',
  });

  const docs = await ask({
    source: 'pages',
    filters: { page: '/docs/' },
    limit: 100,
  });
  expect(docs.total).toBe(75);
  expect(docs.rows!.every((r) => String(r.url).includes('/docs/'))).toBe(true);
  expect(docs.rows![0]).not.toHaveProperty('links');
  const alternatives = await ask({
    source: 'reddit',
    filters: { keyword: 'alternatives' },
  });
  expect(
    alternatives.rows!.every((r) => String(r.title).startsWith('Alternatives')),
  ).toBe(true);
  const ascending = await ask({
    source: 'hackernews',
    sort: 'points',
    limit: 100,
  });
  const points = ascending.rows!.map((r) => Number(r.points));
  expect(points).toEqual([...points].sort((a, b) => a - b));
  expect(
    (await ask({ source: 'hackernews', sort: 'nothing' })).notes,
  ).toContain('No nothing field to sort by in the stories table.');
  const subreddits = await ask({
    source: 'reddit',
    table: 'subreddits',
    filters: { page: '/r/' },
  });
  expect(subreddits.notes).toContain(
    'filters.page does not apply to the subreddits table.',
  );

  expect(await ask({ source: 'traffic', range: '6m' })).toMatchObject({
    error: 'unsupportedRange',
    supported: expect.arrayContaining(['12m']),
  });
  expect(
    await ask({ source: 'competitors', from: '2026-01-01', to: '2026-01-31' }),
  ).toMatchObject({ error: 'unsupportedRange' });
  await ask({ source: 'competitors', range: '7' });
  expect(calls.find(([name]) => name === 'competitors.view')![1]).toEqual({
    days: 7,
  });
  expect((await ask({ source: 'audit', range: '90' })).notes).toContain(
    'This source is not read for a period; the range was ignored.',
  );
  expect(await ask({ source: 'reddit', from: '2026-01-01' })).toEqual({
    source: 'reddit',
    error: 'needsFromBeforeTo',
  });
  expect(await ask({ source: 'traffic', table: 'nothing' })).toMatchObject({
    error: 'unknownTable',
    tables: expect.arrayContaining(['page', 'channel']),
  });

  // Collector reports sort and count themselves; at most 200 of their records can be read.
  const videos = await ask({
    source: 'youtube',
    sort: '-views',
    offset: 180,
    limit: 50,
  });
  expect(calls.find(([name]) => name === 'youtube.report')![1]).toMatchObject({
    sort: 'views',
    order: 'desc',
    limit: 200,
  });
  expect(videos).toMatchObject({ total: 230, nextOffset: null });
  expect(videos.rows).toHaveLength(20);
  expect(videos.rows![0]).not.toHaveProperty('captions');
  expect(videos.notes).toContain('Only the first 200 of 230 rows can be read.');
});

it('a source the user may not open is denied alone, and nothing is synced or checked', async () => {
  const { ask, calls, authorizations } = setup([
    'nrReddit.view',
    'nrDataViews.searchBreakdown',
    'nrDataViews.ranks',
  ]);
  expect(await ask({ source: 'reddit' })).toEqual({
    source: 'reddit',
    page: 'Community › Reddit',
    url: '/main/data/reddit',
    accessDenied: true,
  });
  expect(calls.some(([name]) => name === 'reddit.view')).toBe(false);
  expect((await ask({ source: 'forum' })).rows).toHaveLength(20);
  expect(await ask({ source: 'search', table: 'countries' })).toEqual({
    source: 'search',
    accessDenied: true,
  });
  expect((await ask({ source: 'search', table: 'queries' })).rows).toHaveLength(
    20,
  );
  // Without the rank permission saved keywords still answer, without the site's own rank.
  const keywords = await ask({ source: 'keywords' });
  expect(keywords.rows![1]).toMatchObject({
    keyword: 'keyword 1',
    tags: ['Core'],
    position: null,
  });
  expect(calls.some(([name]) => name === 'ranks')).toBe(false);
  expect(authorizations()).toBeGreaterThan(0);

  const all = setup();
  expect((await all.ask({ source: 'keywords' })).rows![1]).toMatchObject({
    position: 3.5,
    page: 'https://example.test/k1',
  });
  const trends = await all.ask({ source: 'trends' });
  expect(trends.rows![0]).toMatchObject({
    term: 'product',
    recent: expect.any(Number),
  });
  expect(all.calls.some(([name]) => name === 'trends.view')).toBe(false);
  expect(JSON.stringify(await all.ask({ source: 'github' }))).not.toContain(
    'ghp_never_shown',
  );
  expect(
    JSON.stringify(await all.ask({ source: 'xiaohongshu' })),
  ).not.toContain('session=never');
});

it('reads indexing only once checked, and reports errors without internals', async () => {
  const { sources } = fixture();
  const viewed: string[] = [];
  const unchecked: QuerySources = {
    ...sources,
    searchIndex: {
      site: async () => 'sc-domain:example.test',
      state: async () => null,
      view: async () => {
        viewed.push('view');
        return {};
      },
    },
    dataViews: {
      ...sources.dataViews,
      github: async () => {
        throw Object.assign(new Error('Pick a valid start and end date'), {
          status: 400,
        });
      },
      downloads: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.8:5432 password=hunter2');
      },
      hackernews: async () => ({ connected: false }),
    },
  };
  const tool = queryDataTool({
    sources: unchecked,
    projectId: '7',
    authorize: async () => undefined,
    allowed: async () => true,
    link: (path) => path,
  });
  const ask = async (args: Row) =>
    (await tool.execute(args, new AbortController().signal)) as Answer;
  expect(await ask({ source: 'indexing' })).toMatchObject({
    available: false,
    reason: 'no_data_yet',
    tables: [],
  });
  expect(viewed).toEqual([]);
  expect(await ask({ source: 'github' })).toEqual({
    source: 'github',
    error: 'rejected',
    message: 'Pick a valid start and end date',
  });
  expect(await ask({ source: 'downloads' })).toEqual({
    source: 'downloads',
    error: 'unavailable',
  });
  expect(await ask({ source: 'hackernews' })).toMatchObject({
    source: 'hackernews',
    connected: false,
  });
  await expect(ask({ source: 'nothing' })).rejects.toBeDefined();

  const revoked = queryDataTool({
    sources,
    projectId: '7',
    authorize: async () => {
      throw new Error('accessDenied');
    },
    allowed: async () => true,
    link: (path) => path,
  });
  await expect(
    revoked.execute({ source: 'forum' }, new AbortController().signal),
  ).rejects.toThrow('accessDenied');
  // Access revoked while the source was read stops the run instead of reading as a failed source.
  let checks = 0;
  const midway = queryDataTool({
    sources,
    projectId: '7',
    authorize: async () => {
      if (++checks > 1)
        throw Object.assign(new Error('accessDenied'), { status: 403 });
    },
    allowed: async () => true,
    link: (path) => path,
  });
  await expect(
    midway.execute({ source: 'forum' }, new AbortController().signal),
  ).rejects.toMatchObject({ status: 403 });
});
