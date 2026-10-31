import { z } from 'zod';
import type { OnlineTool } from '../../online-agent/executor.js';
import { systemMessageText } from '../../../shared/i18n/messages.js';
import { windowFor } from '../data-views.js';
import { keywordSummary, summary as termSummary } from '../trends-source.js';

type Obj = Record<string, unknown>;
type Reader = {
  [method: string]:
    ((id: string, ...rest: unknown[]) => Promise<unknown>) | undefined;
};
/** The application services the data pages call, by the names `Connections` gives them. */
export type QuerySources = Partial<
  Record<
    | 'dataViews'
    | 'siteContent'
    | 'audit'
    | 'searchIndex'
    | 'keywordService'
    | 'rankTracking'
    | 'keywordSuggest'
    | 'trends'
    | 'competitors'
    | 'aiSearch'
    | 'community'
    | 'hackernews'
    | 'reddit'
    | 'xSource'
    | 'chat'
    | 'youtube'
    | 'bilibili'
    | 'xiaohongshu'
    | 'githubTrends'
    | 'sources',
    Reader
  >
>;

const RANGES = ['7', '28', '90', '3m', '6m', '12m', '16m', 'all'] as const;
const ANY_RANGE = [...RANGES, 'custom'];
// Traffic reads GA4 for the windows its page offers.
const WEB_RANGES = ['7', '28', '90', '3m', '12m', 'all', 'custom'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filtersInput = z.strictObject({
  keyword: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe(
      'Text a row must contain (a query, title, term or message); exact for search_detail.',
    ),
  page: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .optional()
    .describe(
      'A page URL or path the row must contain; the page itself for page and search_detail.',
    ),
  country: z
    .string()
    .regex(/^[a-z]{3}$/)
    .optional()
    .describe(
      'Search Console country, ISO 3166-1 alpha-3 in lower case (usa, deu, chn).',
    ),
});
type Filters = z.infer<typeof filtersInput>;

class QueryError extends Error {
  constructor(
    readonly code: string,
    readonly detail: Obj = {},
  ) {
    super(code);
  }
}

const obj = (v: unknown): Obj =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
const list = (v: unknown): Obj[] =>
  Array.isArray(v)
    ? v.filter(
        (x): x is Obj =>
          Boolean(x) && typeof x === 'object' && !Array.isArray(x),
      )
    : [];
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const dateOf = (v: unknown) => text(v).slice(0, 10);
const pick = (row: Obj, keys: readonly string[]) =>
  Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]]));
const newest = (field: string) => (a: Obj, b: Obj) =>
  text(b[field]).localeCompare(text(a[field]));
const total = (rows: Obj[], field: string) => {
  const values = rows.map((r) => num(r[field])).filter((v) => v !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
};

// What reaches the model: short strings, bounded nested lists and no field that names a credential.
const SECRET =
  /token|secret|password|cookie|credential|authorization|api_?key/i;
function clean(value: unknown, depth = 0): unknown {
  if (typeof value === 'string')
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value === 'number')
    return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
  if (value === null || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== 'object' || depth >= 4) return undefined;
  if (Array.isArray(value))
    return value.slice(0, depth > 1 ? 12 : 100).map((x) => clean(x, depth + 1));
  const out: Obj = {};
  for (const [key, x] of Object.entries(value)) {
    if (SECRET.test(key)) continue;
    const kept = clean(x, depth + 1);
    if (kept !== undefined) out[key] = kept;
  }
  return out;
}

interface Query {
  id: string;
  range: string;
  from?: string;
  to?: string;
  filters: Filters;
  table?: string;
  sort?: string;
  offset: number;
  limit: number;
  site?: string;
  allowed: (resource: string, action: string) => Promise<boolean>;
}
interface Table {
  rows: Obj[];
  /** Rows the source counts in all, when it returns only some of them. */
  total?: number;
  /** The source already sorted the rows as asked. */
  sorted?: boolean;
  /** How many rows paging can reach when the source returns only the asked page's rows. */
  readable?: number;
}
type TableSource = Obj[] | (() => Promise<Obj[] | Table>);
interface Read {
  connected?: boolean;
  dataThrough?: unknown;
  window?: unknown;
  summary?: unknown;
  notes?: unknown;
  tables: Record<string, TableSource>;
}
interface Source {
  page: string;
  path: string;
  access: [string, string];
  /** Ranges the page offers; none when the source is not read for a period. */
  ranges?: readonly string[];
  /** Filters the source applies itself; the others match the rows. */
  applies?: (keyof Filters)[];
  read(s: QuerySources, q: Query): Promise<Read>;
}
const NOT_CONNECTED: Read = { connected: false, tables: {} };
const noData = (dataThrough: unknown): Read => ({
  dataThrough: dataThrough ?? null,
  tables: {},
});

async function call(
  s: QuerySources,
  service: keyof QuerySources,
  method: string,
  id: string,
  ...rest: unknown[]
) {
  const target = s[service],
    fn = target?.[method];
  if (typeof fn !== 'function') throw new QueryError('unavailable');
  return fn.call(target, id, ...rest);
}
const rangeOf = (q: Query) =>
  q.from ? { range: 'custom', from: q.from, to: q.to } : { range: q.range };
const windowFields = (w: Obj) => ({
  start: w.start,
  end: w.end,
  previousStart: w.previousStart,
  previousEnd: w.previousEnd,
  all: w.all === true,
});
const flatten = (row: Obj) => {
  const { dims, ...rest } = row;
  return { ...rest, ...obj(dims) };
};
// GA4 "where the change came from" rows: one figure per period.
const changeRow = (row: Obj) => {
  const out: Obj = { key: row.key };
  for (const [k, v] of Object.entries(obj(row.current))) out[k] = v;
  for (const [k, v] of Object.entries(obj(row.previous)))
    out[`previous${k[0].toUpperCase()}${k.slice(1)}`] = v;
  return out;
};
const inWindow = (w: Obj) => (d: string) =>
  Boolean(d) && d >= text(w.start) && d <= text(w.end);
const VIDEO = [
  'id',
  'title',
  'url',
  'channel',
  'author',
  'query',
  'publishedAt',
  'estimatedPublishedAt',
  'firstSeenAt',
  'views',
  'likes',
  'comments',
  'coins',
  'favorites',
  'shares',
  'collects',
  'duration',
];
const REPO = [
  'repo',
  'url',
  'description',
  'language',
  'stars',
  'gained',
  'rival',
  'own',
];

/** A collector platform's report: the page's own order and counts, at most 200 records of the period. */
function collector(
  service: 'youtube' | 'bilibili' | 'xiaohongshu',
  items: string,
  metrics: string[],
) {
  return async (s: QuerySources, q: Query): Promise<Read> => {
    const field = q.sort?.replace(/^-/, '') ?? '',
      desc = q.sort?.startsWith('-') ?? true,
      order = metrics.includes(field)
        ? { sort: field, order: desc ? 'desc' : 'asc' }
        : field === 'published'
          ? { order: desc ? 'desc' : 'asc' }
          : {};
    const v = obj(
      await call(
        s,
        service,
        'report',
        q.id,
        {
          ...rangeOf(q),
          ...order,
          // A filter searches every record the report can return.
          limit:
            q.filters.keyword || q.filters.page
              ? 200
              : Math.min(200, q.offset + q.limit),
        },
        windowFor,
      ),
    );
    if (v.connected === false) return NOT_CONNECTED;
    const w = obj(v.window);
    return {
      window: w,
      dataThrough: w.end ?? null,
      summary: { kpis: v.kpis, matched: v.matched },
      tables: {
        [items]: async () => ({
          rows: list(v[items]).map((r) => pick(r, VIDEO)),
          total: num(v.matched) ?? undefined,
          readable: Math.min(num(v.matched) ?? 0, 200),
          sorted: Boolean(
            q.sort && (metrics.includes(field) || field === 'published'),
          ),
        }),
        groups: list(v.groups),
        daily: list(v.trend),
      },
    };
  };
}

/** Each source reads what its page reads, through the same service method, after the page's own permission. */
const SOURCES: Record<string, Source> = {
  search: {
    page: 'Search & market › Performance',
    path: '/seo-opportunities',
    access: ['nrDataViews', 'search'],
    ranges: ANY_RANGE,
    applies: ['keyword', 'page', 'country'],
    async read(s, q) {
      const f = q.filters,
        filters = {
          ...(f.country ? { country: f.country } : {}),
          ...(f.keyword
            ? { queryFilter: { operator: 'contains', expression: f.keyword } }
            : {}),
          ...(f.page
            ? { pageFilter: { operator: 'contains', expression: f.page } }
            : {}),
        };
      const v = { ...rangeOf(q), ...filters },
        base = obj(await call(s, 'dataViews', 'search', q.id, v));
      if (base.connected === false) return NOT_CONNECTED;
      if (!base.window) return noData(base.cutoff);
      const w = obj(base.window);
      let details: Promise<Obj> | undefined;
      // The tables read Search Console for the window, as the page's tables do.
      const detail = () =>
        (details ??= call(s, 'dataViews', 'search', q.id, {
          ...v,
          details: true,
        }).then(obj));
      const dimension = (key: string) => async () => {
        const d = obj((await detail())[key]);
        return { rows: list(d.rows), total: num(d.total) ?? undefined };
      };
      const moved = (key: string, kind: string) => async () =>
        list(obj(obj((await detail()).movers)[key])[kind]);
      const breakdown = (key: string) => async () => {
        if (!(await q.allowed('nrDataViews', 'searchBreakdown')))
          throw new QueryError('accessDenied');
        const b = obj(
          await call(s, 'dataViews', 'searchBreakdown', q.id, {
            ...windowFields(w),
            ...filters,
          }),
        );
        return list(b[key]);
      };
      return {
        dataThrough: base.cutoff ?? null,
        window: w,
        summary: {
          totals: base.totals ?? null,
          previous: base.previous ?? null,
          complete: base.complete ?? null,
          previousComplete: base.previousComplete ?? null,
        },
        tables: {
          queries: dimension('queries'),
          pages: dimension('pages'),
          striking: async () => list((await detail()).striking),
          rising_queries: moved('query', 'rising'),
          falling_queries: moved('query', 'falling'),
          new_queries: moved('query', 'fresh'),
          rising_pages: moved('page', 'rising'),
          falling_pages: moved('page', 'falling'),
          new_pages: moved('page', 'fresh'),
          daily: list(base.trend),
          countries: breakdown('countries'),
          devices: breakdown('devices'),
          appearances: breakdown('appearances'),
        },
      };
    },
  },
  search_detail: {
    page: 'Search & market › Performance',
    path: '/seo-opportunities',
    access: ['nrDataViews', 'searchRow'],
    ranges: ANY_RANGE,
    applies: ['keyword', 'page', 'country'],
    async read(s, q) {
      const { keyword, page, country } = q.filters;
      if (!keyword && !page) throw new QueryError('needsKeywordOrPage');
      const base = obj(await call(s, 'dataViews', 'search', q.id, rangeOf(q)));
      if (base.connected === false) return NOT_CONNECTED;
      if (!base.window) return noData(base.cutoff);
      const w = obj(base.window),
        row = obj(
          await call(s, 'dataViews', 'searchRow', q.id, {
            ...windowFields(w),
            dimension: keyword ? 'query' : 'page',
            key: keyword ?? page,
            ...(country ? { country } : {}),
          }),
        );
      if (row.connected === false) return NOT_CONNECTED;
      const daily = list(row.trend);
      return {
        dataThrough: base.cutoff ?? null,
        window: w,
        summary: {
          [keyword ? 'query' : 'page']: keyword ?? page,
          clicks: total(daily, 'clicks'),
          impressions: total(daily, 'impressions'),
          previousClicks: total(daily, 'previousClicks'),
          previousImpressions: total(daily, 'previousImpressions'),
        },
        tables: { related: list(row.related), daily },
      };
    },
  },
  traffic: {
    page: 'Site & product › Traffic',
    path: '/website',
    access: ['nrDataViews', 'website'],
    ranges: WEB_RANGES,
    async read(s, q) {
      const v = obj(await call(s, 'dataViews', 'website', q.id, rangeOf(q)));
      if (v.connected === false) return NOT_CONNECTED;
      if (!v.cutoff) return noData(null);
      const tables: Record<string, TableSource> = {},
        reports = obj(v.tables),
        changes = obj(v.changes);
      for (const name of [
        'page',
        'landing',
        'channel',
        'sourceMedium',
        'campaign',
        'event',
        'country',
        'city',
        'language',
        'device',
        'newVsReturning',
        'browser',
        'os',
      ])
        tables[name] = list(reports[name]).map(flatten);
      tables.daily = list(v.daily);
      for (const name of ['page', 'landing', 'channel'])
        tables[`${name}_changes`] = list(changes[name]).map(changeRow);
      return {
        dataThrough: v.cutoff,
        settledThrough: v.settledThrough ?? null,
        window: v.window,
        summary: {
          totals: v.totals ?? null,
          complete: v.complete ?? null,
          missing: v.missing ?? [],
        },
        tables,
      };
    },
  },
  page: {
    page: 'Site & product › Pages',
    path: '/content',
    access: ['nrDataViews', 'page'],
    ranges: ANY_RANGE,
    applies: ['page'],
    async read(s, q) {
      const page = q.filters.page;
      if (!page) throw new QueryError('needsPage');
      const url =
          page.startsWith('/') && q.site ? `https://${q.site}${page}` : page,
        v = obj(
          await call(s, 'dataViews', 'page', q.id, { url, ...rangeOf(q) }),
        );
      if (v.connected === false) return NOT_CONNECTED;
      const daily = list(v.daily);
      return {
        dataThrough:
          [v.gscCutoff, v.ga4Cutoff].map(text).filter(Boolean).sort().at(-1) ??
          null,
        window: v.window,
        summary: {
          url,
          clicks: total(daily, 'clicks'),
          impressions: total(daily, 'impressions'),
          views: total(daily, 'views'),
          searchDataThrough: v.gscCutoff ?? null,
          trafficDataThrough: v.ga4Cutoff ?? null,
        },
        tables: { daily },
      };
    },
  },
  pages: {
    page: 'Site & product › Pages',
    path: '/content',
    access: ['nrSiteContent', 'list'],
    ranges: ANY_RANGE,
    async read(s, q) {
      const v = obj(
          await call(
            s,
            'siteContent',
            'list',
            q.id,
            q.from ? 'custom' : q.range,
            q.from,
            q.to,
          ),
        ),
        sum = obj(v.summary);
      if (!num(sum.pages)) return NOT_CONNECTED;
      return {
        dataThrough: v.cutoff ?? null,
        window: v.window,
        summary: {
          pages: sum.pages,
          types: sum.types,
          outsideSitemap: v.outsideSitemap ?? null,
        },
        notes: v.limitations,
        tables: {
          pages: list(v.pages).map((p) =>
            pick(p, [
              'url',
              'type',
              'title',
              'description',
              'lastmod',
              'firstSeenAt',
              'views',
              'previousViews',
              'clicks',
              'impressions',
              'previousClicks',
              'outsideSitemap',
              'ga4Untracked',
              'fetchError',
            ]),
          ),
        },
      };
    },
  },
  audit: {
    page: 'Site & product › Site audit',
    path: '/audit',
    access: ['nrAudit', 'report'],
    async read(s, q) {
      const v = obj(await call(s, 'audit', 'report', q.id));
      if (v.connected === false) return NOT_CONNECTED;
      const issues = list(v.issues);
      return {
        dataThrough: dateOf(v.newestRead) || null,
        summary: pick(v, [
          'total',
          'read',
          'pending',
          'counts',
          'oldestRead',
          'newestRead',
        ]),
        tables: {
          issues: issues.map((i) =>
            pick(i, ['type', 'severity', 'title', 'description', 'count']),
          ),
          pages: issues.flatMap((i) =>
            list(i.pages).map((p) => ({
              issue: i.type,
              issueTitle: i.title,
              severity: i.severity,
              url: p.url,
              title: p.title,
              detail: p.detail,
            })),
          ),
        },
      };
    },
  },
  indexing: {
    page: 'Search & market › Performance › Indexing',
    path: '/seo-opportunities',
    access: ['nrSearchIndex', 'view'],
    async read(s, q) {
      // Opening the page starts the first inspection; reading here never does.
      const site = await call(s, 'searchIndex', 'site', q.id);
      if (!site) return NOT_CONNECTED;
      const state = obj(await call(s, 'searchIndex', 'state', q.id));
      if (state.site !== site || !Object.keys(obj(state.results)).length)
        return noData(null);
      const v = obj(await call(s, 'searchIndex', 'view', q.id)),
        pages = list(v.pages),
        counts: Record<string, number> = {};
      for (const p of pages)
        counts[text(p.status)] = (counts[text(p.status)] ?? 0) + 1;
      return {
        dataThrough: dateOf(v.lastRunAt) || null,
        summary: {
          site,
          total: v.total,
          statuses: counts,
          lastRunAt: v.lastRunAt ?? null,
          outside: v.outside ?? null,
        },
        tables: {
          pages: pages.map((p) =>
            pick(p, [
              'url',
              'type',
              'status',
              'coverageState',
              'verdict',
              'lastCrawlTime',
              'checkedAt',
              'canonicalMismatch',
              'error',
            ]),
          ),
        },
      };
    },
  },
  github: {
    page: 'Site & product › GitHub',
    path: '/data/github',
    access: ['nrDataViews', 'github'],
    ranges: ANY_RANGE,
    async read(s, q) {
      const v = obj(await call(s, 'dataViews', 'github', q.id, rangeOf(q)));
      if (v.connected === false) return NOT_CONNECTED;
      const t = obj(v.tables);
      return {
        dataThrough: v.cutoff ?? null,
        window: v.window,
        summary: {
          repo: v.repo,
          totals: v.totals ?? null,
          period: v.figures ?? null,
          previousPeriod: v.previous ?? null,
          visitSources: obj(v.sources).kinds ?? null,
        },
        notes: v.notes,
        tables: {
          daily: list(v.daily),
          referrers: list(obj(t.referrers).items),
          paths: list(obj(t.paths).items),
          contributors: list(t.contributors),
          issues: list(t.issues),
          pulls: list(t.pulls),
          releases: list(t.releases),
          top_issues: list(t.topIssues),
          discussions: list(t.discussions),
          languages: list(obj(v.composition).languages),
        },
      };
    },
  },
  downloads: {
    page: 'Site & product › Downloads',
    path: '/data/downloads',
    access: ['nrDataViews', 'downloads'],
    ranges: ANY_RANGE,
    async read(s, q) {
      const v = obj(await call(s, 'dataViews', 'downloads', q.id, rangeOf(q)));
      if (v.connected === false) return NOT_CONNECTED;
      const t = obj(v.tables);
      return {
        dataThrough: v.cutoff ?? null,
        window: v.window,
        summary: { sync: v.sync ?? null, coverage: v.coverage ?? null },
        notes: v.notes,
        tables: {
          packages: list(v.items),
          daily: list(v.daily),
          versions: list(t.versions),
          tags: list(t.tags),
          assets: list(t.assets),
        },
      };
    },
  },
  keywords: {
    page: 'Search & market › Keywords',
    path: '/keywords',
    access: ['nrKeywords', 'saved'],
    async read(s, q) {
      const saved = obj(await call(s, 'keywordService', 'saved', q.id)),
        items = list(saved.items),
        tags = new Map(
          list(saved.tags).map((t) => [
            text(t.id),
            text(t.name) || text(t.label),
          ]),
        );
      // The site's own rank: Search Console's last 28 synced days, as Keywords › Saved shows it.
      const ranks =
        items.length && (await q.allowed('nrDataViews', 'ranks'))
          ? obj(
              await call(s, 'dataViews', 'ranks', q.id, {
                keywords: items.map((k) => text(k.keyword)),
              }),
            )
          : {};
      const rankOf = obj(ranks.ranks);
      return {
        dataThrough: ranks.cutoff ?? null,
        window: ranks.window ?? null,
        summary: { saved: items.length, ownRankFrom: ranks.window ?? null },
        tables: {
          keywords: items.map((k) => {
            const m = obj(k.metrics),
              r = obj(rankOf[text(k.keyword).toLowerCase().trim()]);
            return {
              keyword: k.keyword,
              source: k.source,
              tags: (Array.isArray(k.tagIds) ? k.tagIds : [])
                .map((t) => tags.get(String(t)))
                .filter(Boolean),
              volume: m.volume ?? null,
              difficulty: m.difficulty ?? null,
              cpc: m.cpc ?? null,
              intent: m.intent ?? null,
              market: k.market ?? null,
              savedAt: k.savedAt ?? null,
              clicks: r.clicks ?? null,
              impressions: r.impressions ?? null,
              position: r.position ?? null,
              page: r.page ?? null,
            };
          }),
        },
      };
    },
  },
  rank_tracking: {
    page: 'Search & market › Keywords',
    path: '/keywords',
    access: ['nrRankTracking', 'status'],
    async read(s, q) {
      const v = obj(await call(s, 'rankTracking', 'status', q.id)),
        keywords = list(v.keywords);
      return {
        dataThrough:
          keywords
            .map((k) => dateOf(obj(k.latest).at))
            .filter(Boolean)
            .sort()
            .at(-1) ?? null,
        summary: { tracked: keywords.length, lastRun: v.lastRun ?? null },
        tables: {
          keywords: keywords.map((k) => {
            const latest = obj(k.latest),
              previous = obj(k.previous);
            return {
              keyword: k.keyword,
              locationCode: k.locationCode ?? null,
              language: k.language ?? null,
              position: latest.position ?? null,
              url: latest.url ?? null,
              checkedAt: latest.at ?? null,
              previousPosition: previous.position ?? null,
              history: list(k.history).map((h) => ({
                at: h.at,
                position: h.position ?? null,
              })),
              nextCheckAt: k.nextCheckAt ?? null,
            };
          }),
        },
      };
    },
  },
  keyword_suggestions: {
    page: 'Search & market › Keywords',
    path: '/keywords',
    access: ['nrKeywordSuggest', 'view'],
    async read(s, q) {
      const v = obj(await call(s, 'keywordSuggest', 'view', q.id));
      // How the list was made (seeds, real keywords found, minimum volume) and the groups dug from the chat.
      const flat = ({ metrics, ...item }: Obj) => {
        const { monthlySearches: _monthly, ...numbers } = obj(metrics);
        return { ...item, ...numbers };
      };
      return {
        dataThrough: dateOf(v.at) || null,
        summary: {
          market: v.market ?? null,
          generatedAt: v.generatedAt ?? v.at ?? null,
          seeds: v.seeds ?? [],
          realKeywordsFound: obj(v.stats).found ?? null,
          minimumMonthlyVolume: v.minVolume ?? null,
          running: v.running ?? null,
          lastError: obj(v.lastError).message ?? null,
          groups: list(v.digs).map((d) => ({
            id: d.id,
            name: d.direction,
            seeds: d.seeds,
            keywords: list(d.items).length,
            at: d.at,
          })),
        },
        tables: {
          suggestions: list(v.items).map(flat),
          dugGroups: list(v.digs).flatMap((d) =>
            list(d.items).map((item) => ({
              ...flat(item),
              dugFor: d.direction,
            })),
          ),
        },
      };
    },
  },
  trends: {
    page: 'Search & market › Trends',
    path: '/trends',
    access: ['nrTrends', 'view'],
    async read(s, q) {
      // The saved check, with the page's own summaries. The page's view also syncs the compared terms and may start
      // a paid check; reading here never does.
      const st = obj(await call(s, 'trends', 'state', q.id)),
        terms = (Array.isArray(st.terms) ? st.terms : []).map(String),
        brand = terms.length > 0 && st.status !== 'disconnected',
        keywords = list(st.keywords);
      if (!brand && !keywords.length) return NOT_CONNECTED;
      const latest = obj(st.latest),
        named = (Array.isArray(latest.terms) ? latest.terms : terms).map(
          String,
        );
      return {
        dataThrough: dateOf(latest.at) || null,
        summary: {
          product: st.product || terms[0] || null,
          terms,
          checkedAt: latest.at ?? null,
          lastRun: st.lastRun ?? null,
        },
        notes: [
          'Google Trends values are relative interest from 0 to 100, not search counts.',
        ],
        tables: {
          terms: brand ? (termSummary(st.latest) as Obj[]) : [],
          rising: brand ? list(latest.rising) : [],
          top: brand ? list(latest.top) : [],
          weekly: brand
            ? list(latest.points).map((p) => ({
                date: p.date,
                ...Object.fromEntries(
                  named.map((t, i) => [
                    t,
                    Array.isArray(p.values) ? (p.values[i] as unknown) : null,
                  ]),
                ),
              }))
            : [],
          keywords: keywords.map((k) => ({
            keyword: k.keyword,
            addedAt: k.addedAt ?? null,
            checkedAt: obj(k.latest).at ?? null,
            ...(keywordSummary(k) as Obj),
            rising: list(obj(k.latest).rising).slice(0, 10),
            top: list(obj(k.latest).top).slice(0, 10),
          })),
        },
      };
    },
  },
  competitors: {
    page: 'Search & market › Competitors',
    path: '/research/domain',
    access: ['nrCompetitors', 'view'],
    ranges: ['7', '28', '90'],
    async read(s, q) {
      const v = obj(
        await call(s, 'competitors', 'view', q.id, { days: Number(q.range) }),
      );
      if (v.connected === false) return NOT_CONNECTED;
      return {
        dataThrough: dateOf(obj(v.lastRun).at) || null,
        summary: {
          competitors: list(v.list).length,
          lastRun: v.lastRun ?? null,
          nextCheckAt: v.nextCheckAt ?? null,
          days: Number(q.range),
        },
        notes: v.notes,
        tables: {
          events: list(v.events)
            .map((e) => pick(e, ['competitor', 'type', 'title', 'url', 'at']))
            .sort(newest('at')),
          competitors: list(v.list).map((c) => ({
            ...pick(c, [
              'name',
              'domain',
              'site',
              'repo',
              'checkedAt',
              'pages',
              'stars',
              'week',
              'errors',
            ]),
            latestRelease: obj(c.latestRelease).name ?? null,
          })),
        },
      };
    },
  },
  ai_search: {
    page: 'Search & market › AI search',
    path: '/ai-search',
    access: ['nrAiSearch', 'list'],
    async read(s, q) {
      // Saved lookups only; asking again is a paid action on the page.
      const [state, lookups] = await Promise.all([
        call(s, 'aiSearch', 'state', q.id),
        call(s, 'aiSearch', 'list', q.id),
      ]);
      const st = obj(state);
      return {
        tables: {
          brands: list(st.brands).map((b) => {
            const spec = obj(b.spec),
              r = obj(b.result);
            return {
              platform: spec.platform,
              brand: spec.target,
              competitors: spec.competitors,
              at: b.at,
              mentions: r.mentions ?? null,
              aiSearchVolume: r.aiSearchVolume ?? null,
              share: r.share ?? null,
              questions: list(r.questions).slice(0, 10),
              pages: list(r.pages).slice(0, 10),
            };
          }),
          answers: list(st.answers).flatMap((a) =>
            Object.entries(obj(a.models)).map(([model, value]) => {
              const r = obj(value);
              return {
                question: a.question,
                model,
                mentioned: r.mentioned ?? null,
                ownCited: r.ownCited ?? null,
                citations: list(r.citations).slice(0, 10),
                answer: r.text ?? null,
                at: r.at ?? null,
              };
            }),
          ),
          lookups: list(lookups),
        },
      };
    },
  },
  forum: {
    page: 'Community › Forum',
    path: '/data/community',
    access: ['nrDataViews', 'community'],
    ranges: ANY_RANGE,
    async read(s, q) {
      const v = obj(await call(s, 'dataViews', 'community', q.id, rangeOf(q)));
      if (v.connected === false) return NOT_CONNECTED;
      const w = obj(v.window),
        within = inWindow(w),
        cm = obj(await call(s, 'community', 'state', q.id)),
        categories = obj(cm.categories),
        origin = text(v.origin);
      const topics = Object.values(obj(cm.topics))
        .map(obj)
        .map((t) => ({
          title: t.title,
          url: `${origin}/t/${text(t.slug)}/${String(t.id)}`,
          category:
            text(categories[String(t.categoryId)]) ||
            systemMessageText('communitySource.uncategorized'),
          date: dateOf(t.createdAt),
          replies: t.replies ?? 0,
          views: t.views ?? 0,
          likes: t.likes ?? 0,
          solved: Boolean(t.solved),
          tags: t.tags ?? [],
          lastPostedAt: t.lastPostedAt ?? null,
        }))
        .filter((t) => within(t.date))
        .sort(newest('date'));
      return {
        dataThrough: w.end ?? null,
        window: w,
        summary: { forum: v.title ?? origin, kpis: v.kpis },
        notes: v.notes,
        tables: {
          topics,
          unanswered: topics.filter((t) => !t.replies),
          categories: list(v.categories),
          daily: list(v.daily),
        },
      };
    },
  },
  hackernews: {
    page: 'Community › Hacker News',
    path: '/data/hackernews',
    access: ['nrDataViews', 'hackernews'],
    ranges: ANY_RANGE,
    async read(s, q) {
      const v = obj(await call(s, 'dataViews', 'hackernews', q.id, rangeOf(q)));
      if (v.connected === false) return NOT_CONNECTED;
      const w = obj(v.window),
        within = inWindow(w),
        mentions = Object.values(
          obj(obj(await call(s, 'hackernews', 'state', q.id)).mentions),
        )
          .map(obj)
          .filter((m) => within(dateOf(m.createdAt)));
      return {
        dataThrough: w.end ?? null,
        window: w,
        summary: { terms: v.terms, kpis: v.kpis },
        notes: v.notes,
        tables: {
          stories: mentions
            .filter((m) => m.type === 'story')
            .sort((a, b) => (num(b.points) ?? 0) - (num(a.points) ?? 0))
            .map((m) => ({
              ...pick(m, [
                'title',
                'url',
                'hnUrl',
                'points',
                'comments',
                'term',
              ]),
              date: dateOf(m.createdAt),
            })),
          comments: mentions
            .filter((m) => m.type === 'comment')
            .sort(newest('createdAt'))
            .map((m) => ({
              ...pick(m, ['title', 'hnUrl', 'excerpt', 'term']),
              date: dateOf(m.createdAt),
            })),
          daily: list(v.series),
        },
      };
    },
  },
  reddit: {
    page: 'Community › Reddit',
    path: '/data/reddit',
    access: ['nrReddit', 'view'],
    ranges: ANY_RANGE,
    async read(s, q) {
      const v = obj(
        await call(s, 'reddit', 'view', q.id, rangeOf(q), windowFor),
      );
      if (v.connected === false) return NOT_CONNECTED;
      const w = obj(v.window),
        within = inWindow(w),
        st = obj(await call(s, 'reddit', 'state', q.id)),
        seen = (p: Obj) => dateOf(p.postedAt || p.firstSeenAt);
      return {
        dataThrough: st.dataThrough ?? null,
        window: w,
        summary: {
          terms: v.terms,
          kpis: v.kpis,
          visitsFromReddit: v.visits ?? null,
          lastRun: v.lastRun ?? null,
        },
        notes: v.notes,
        tables: {
          posts: Object.values(obj(st.posts))
            .map(obj)
            .filter((p) => within(seen(p)))
            .sort((a, b) => seen(b).localeCompare(seen(a)))
            .map((p) =>
              pick(p, [
                'title',
                'url',
                'subreddit',
                'snippet',
                'postedAt',
                'firstSeenAt',
                'term',
              ]),
            ),
          subreddits: list(v.subreddits),
        },
      };
    },
  },
  x: {
    page: 'Community › X',
    path: '/data/x',
    access: ['nrX', 'view'],
    ranges: ANY_RANGE,
    async read(s, q) {
      const v = obj(
        await call(s, 'xSource', 'view', q.id, rangeOf(q), windowFor),
      );
      if (v.connected === false) return NOT_CONNECTED;
      const w = obj(v.window),
        within = inWindow(w),
        st = obj(await call(s, 'xSource', 'state', q.id));
      return {
        dataThrough: w.end ?? null,
        window: w,
        summary: {
          terms: v.terms,
          handle: v.handle || null,
          kpis: v.kpis,
          lastRun: v.lastRun ?? null,
        },
        notes: v.notes,
        tables: {
          posts: Object.values(obj(st.posts))
            .map(obj)
            .filter((p) => within(dateOf(p.createdAt)))
            .sort(newest('createdAt'))
            .map((p) => ({
              ...pick(p, ['text', 'url', 'createdAt', 'lang']),
              ...obj(p.metrics),
            })),
          daily: list(v.series),
        },
      };
    },
  },
  ...Object.fromEntries(
    (['discord', 'slack'] as const).map((platform) => [
      platform,
      {
        page: `Community › ${platform === 'discord' ? 'Discord' : 'Slack'}`,
        path: `/data/${platform}`,
        access: ['nrChat', 'view'],
        ranges: ANY_RANGE,
        async read(s: QuerySources, q: Query): Promise<Read> {
          const v = obj(
            await call(
              s,
              'chat',
              'view',
              q.id,
              { ...rangeOf(q), platform },
              windowFor,
            ),
          );
          if (v.connected === false) return NOT_CONNECTED;
          const w = obj(v.window),
            within = inWindow(w),
            st = obj(await call(s, 'chat', 'state', q.id)),
            message = (m: Obj) =>
              pick(m, [
                'channel',
                'text',
                'createdAt',
                'replies',
                'question',
                'url',
              ]);
          return {
            dataThrough: w.end ?? null,
            window: w,
            summary: { kpis: v.kpis, lastRun: v.lastRun ?? null },
            notes: v.notes,
            tables: {
              messages: Object.values(obj(st.messages))
                .map(obj)
                .filter(
                  (m) => m.platform === platform && within(dateOf(m.createdAt)),
                )
                .sort(newest('createdAt'))
                .map(message),
              open: list(v.open).map(message),
              busiest: list(v.busiest).map(message),
              channels: list(v.channels),
              daily: list(v.series),
            },
          };
        },
      } satisfies Source,
    ]),
  ),
  youtube: {
    page: 'Community › YouTube',
    path: '/data/youtube',
    access: ['nrYouTube', 'report'],
    ranges: ANY_RANGE,
    read: collector('youtube', 'videos', ['views', 'likes', 'comments']),
  },
  bilibili: {
    page: 'Community › Bilibili',
    path: '/data/bilibili',
    access: ['nrBilibili', 'report'],
    ranges: ANY_RANGE,
    read: collector('bilibili', 'videos', ['views', 'likes', 'comments']),
  },
  xiaohongshu: {
    page: 'Community › Xiaohongshu',
    path: '/data/xiaohongshu',
    access: ['nrXiaohongshu', 'report'],
    ranges: ANY_RANGE,
    read: collector('xiaohongshu', 'notes', ['likes']),
  },
  github_trends: {
    page: 'Site & product › GitHub',
    path: '/data/github',
    access: ['nrGitHubTrends', 'view'],
    async read(s, q) {
      const v = obj(await call(s, 'githubTrends', 'view', q.id));
      if (!v.ready) return NOT_CONNECTED;
      const repo = (r: Obj) => ({ ...pick(r, REPO), topics: r.matched ?? [] }),
        gainers = obj(v.gainers),
        trending = obj(v.trending);
      return {
        dataThrough: v.day ?? null,
        summary: {
          day: v.day ?? null,
          recordedSince: v.recordedSince ?? null,
          lastRun: v.lastRun ?? null,
          trendingDate: trending.date ?? null,
        },
        tables: {
          topics: list(v.topics).map((t) => ({
            ...pick(t, ['name', 'total', 'new7', 'lastWeek', 'priorAverage']),
            leaders: list(t.leaders).slice(0, 5).map(repo),
          })),
          gainers_week: list(gainers.week).map(repo),
          gainers_day: list(gainers.day).map(repo),
          gainers_month: list(gainers.month).map(repo),
          new_hot: list(obj(v.newHot).all).map(repo),
          trending_daily: list(trending.daily).map(repo),
          trending_weekly: list(trending.weekly).map(repo),
          trending_monthly: list(trending.monthly).map(repo),
        },
      };
    },
  },
  web_sources: {
    page: 'Settings › Data sources',
    path: '/connections',
    access: ['nrSources', 'list'],
    async read(s, q) {
      const sources = list(
        obj(await call(s, 'sources', 'state', q.id)).sources,
      );
      return {
        dataThrough:
          sources
            .map((x) => dateOf(x.capturedAt))
            .filter(Boolean)
            .sort()
            .at(-1) ?? null,
        tables: {
          sources: sources.map((x) => ({
            ...pick(x, [
              'id',
              'kind',
              'title',
              'url',
              'status',
              'capturedAt',
              'warnings',
            ]),
            items: list(x.items).length,
          })),
          items: sources.flatMap((x) =>
            list(x.items).map((i) => ({
              source: text(x.title) || text(x.url),
              ...pick(i, [
                'type',
                'title',
                'url',
                'date',
                'publishedAt',
                'text',
              ]),
            })),
          ),
        },
      };
    },
  },
};
export const QUERY_SOURCES = Object.keys(SOURCES);

const KEYWORD_FIELDS = [
  'key',
  'keyword',
  'query',
  'title',
  'term',
  'terms',
  'text',
  'name',
  'snippet',
  'excerpt',
  'question',
  'answer',
  'subreddit',
  'channel',
  'category',
  'competitor',
  'issueTitle',
  'login',
  'package',
  'version',
  'tag',
  'repo',
  'description',
  'detail',
];
const PAGE_FIELDS = [
  'page',
  'url',
  'path',
  'key',
  'pagePath',
  'landingPagePlusQueryString',
  'hnUrl',
];
const bare = (v: string) =>
  v
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
function matches(row: Obj, fields: string[], value: string) {
  const want = bare(value);
  return fields.some((f) => {
    const v = row[f];
    const values = Array.isArray(v) ? v : [v];
    return values.some((x) => typeof x === 'string' && bare(x).includes(want));
  });
}
function compare(field: string, desc: boolean) {
  return (a: Obj, b: Obj) => {
    const x = a[field],
      y = b[field];
    if (x === y) return 0;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    const order =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : JSON.stringify(x).localeCompare(JSON.stringify(y));
    return desc ? -order : order;
  };
}

/** The answer the model reads must stay well under the executor's 24,000-character tool output limit. */
const OUTPUT_LIMIT = 20000;

async function answer(
  name: string,
  q: Query,
  sources: QuerySources,
  link: (path: string) => string,
) {
  const source = SOURCES[name];
  const head = { source: name, page: source.page, url: link(source.path) };
  if (!(await q.allowed(...source.access)))
    return { ...head, accessDenied: true };
  const notes: string[] = [];
  if (source.ranges) {
    const range = q.from ? 'custom' : q.range;
    if (!source.ranges.includes(range))
      return { ...head, error: 'unsupportedRange', supported: source.ranges };
  } else if (q.from || q.range !== '28')
    notes.push('This source is not read for a period; the range was ignored.');
  const read = await source.read(sources, q);
  if (read.connected === false) return { ...head, connected: false };
  const w = obj(read.window),
    period = w.start ? { start: w.start, end: w.end } : null,
    previousPeriod =
      w.start && w.previousStart && w.all !== true
        ? { start: w.previousStart, end: w.previousEnd }
        : null;
  notes.push(...(Array.isArray(read.notes) ? read.notes.map(String) : []));
  const names = Object.keys(read.tables),
    base = {
      ...head,
      dataThrough: read.dataThrough ?? null,
      period,
      previousPeriod,
      summary: clean(read.summary ?? null),
      tables: names,
    };
  if (!names.length)
    return {
      ...base,
      available: false,
      reason: 'no_data_yet',
      notes: clean(notes),
    };
  const table = q.table ?? names[0];
  if (!names.includes(table))
    return { ...head, error: 'unknownTable', tables: names };
  const got = read.tables[table],
    value = typeof got === 'function' ? await got() : got,
    t: Table = Array.isArray(value) ? { rows: value } : value;
  let rows = t.rows,
    filtered = false;
  for (const [key, fields] of [
    ['keyword', KEYWORD_FIELDS],
    ['page', PAGE_FIELDS],
  ] as const) {
    const want = q.filters[key];
    if (!want || source.applies?.includes(key)) continue;
    if (rows.some((r) => fields.some((f) => f in r))) {
      rows = rows.filter((r) => matches(r, fields, want));
      filtered = true;
    } else if (rows.length)
      notes.push(`filters.${key} does not apply to the ${table} table.`);
  }
  if (q.filters.country && !source.applies?.includes('country'))
    notes.push('filters.country applies to search and search_detail only.');
  if (q.sort && !t.sorted) {
    const field = q.sort.replace(/^-/, '');
    if (rows.some((r) => field in r))
      rows = [...rows].sort(compare(field, q.sort.startsWith('-')));
    else notes.push(`No ${field} field to sort by in the ${table} table.`);
  }
  const count = filtered ? rows.length : (t.total ?? rows.length),
    readable = filtered
      ? rows.length
      : Math.min(count, t.readable ?? rows.length);
  if (count > readable)
    notes.push(`Only the first ${readable} of ${count} rows can be read.`);
  const out = {
    ...base,
    table,
    total: count,
    offset: q.offset,
    rows: rows.slice(q.offset, q.offset + q.limit).map((r) => clean(r, 1)),
    nextOffset: null as number | null,
    notes: clean(notes),
  };
  const next = () =>
    q.offset + out.rows.length < readable ? q.offset + out.rows.length : null;
  out.nextOffset = next();
  while (out.rows.length > 1 && JSON.stringify(out).length > OUTPUT_LIMIT) {
    out.rows.pop();
    out.nextOffset = next();
  }
  if (JSON.stringify(out).length > OUTPUT_LIMIT)
    out.summary = { omitted: 'too large; read the tables' };
  return out;
}

const input = z.strictObject({
  source: z.enum(QUERY_SOURCES as [string, ...string[]]),
  range: z
    .enum(RANGES)
    .default('28')
    .describe(
      'Days (7, 28, 90) or calendar months (3m, 6m, 12m, 16m) ending at the data cutoff, or all.',
    ),
  from: day.optional().describe('With to: a custom period instead of range.'),
  to: day.optional(),
  table: z
    .string()
    .regex(/^[a-z_A-Z]{1,40}$/)
    .optional()
    .describe(
      'Which list of the source to read; omit for its first. Every answer names its tables.',
    ),
  filters: filtersInput.default({}),
  sort: z
    .string()
    .regex(/^-?[A-Za-z][A-Za-z0-9_]{0,40}$/)
    .optional()
    .describe(
      'A row field to sort by; prefix - for descending. Omit for the page order.',
    ),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).max(100000).default(0),
});

const DESCRIPTION = `Read the data the NocoReach data pages show, with the same numbers and the user's permissions: one source, one table of it at a time, filtered, sorted and paged. Every answer gives the page, dataThrough (the data cutoff), the period and the one before it, a summary, the table names, total and nextOffset. Sources (tables, the first is the default):
search: Search Console (queries, pages, striking, rising_queries, falling_queries, new_queries, rising_pages, falling_pages, new_pages, daily, countries, devices, appearances); filters.keyword and filters.page contain-match queries and pages, filters.country is a country.
search_detail: one query (filters.keyword, exact) or page (filters.page, full URL): related (its pages or queries), daily.
traffic: GA4 (page, landing, channel, sourceMedium, campaign, event, country, city, language, device, newVsReturning, browser, os, daily, page_changes, landing_changes, channel_changes); ranges 7, 28, 90, 3m, 12m, all or from/to.
page: one page's daily clicks, impressions and views (filters.page, URL or path).
pages: every site page with visits, search clicks and impressions, last modified.
audit: site audit (issues, pages). indexing: Google indexing of site pages (pages).
github: repository (daily, referrers, paths, contributors, issues, pulls, releases, top_issues, discussions, languages). github_trends: repositories gaining stars (topics, gainers_week, gainers_day, gainers_month, new_hot, trending_daily, trending_weekly, trending_monthly).
downloads: npm, PyPI, Docker and release files (packages, daily, versions, tags, assets).
keywords: saved keywords with volume and the site's own rank. rank_tracking: tracked Google positions. keyword_suggestions: AI keyword suggestions.
trends: Google Trends (terms, rising, top, weekly, keywords). competitors: competitor watch (events, competitors); ranges 7, 28, 90.
ai_search: saved AI search lookups (brands, answers, lookups).
forum (topics, unanswered, categories, daily), hackernews (stories, comments, daily), reddit (posts, subreddits), x (posts, daily), discord and slack (messages, open, busiest, channels, daily), youtube and bilibili (videos, groups, daily), xiaohongshu (notes, groups, daily).
web_sources: public pages connected as sources (sources, items).
A source the user may not open answers accessDenied; one not connected answers connected: false.`;

/**
 * `query_data`: every data page's source for the online agent, read through the service method that page calls, after
 * checking the asking user's permission for that page's action. Read only: nothing is synced, checked or bought.
 */
export function queryDataTool({
  sources,
  projectId,
  authorize,
  allowed,
  link,
  site,
}: {
  sources: QuerySources;
  projectId: string;
  authorize: () => Promise<void>;
  allowed: (resource: string, action: string) => Promise<boolean>;
  link: (path: string) => string;
  site?: string;
}): OnlineTool {
  return {
    name: 'query_data',
    description: DESCRIPTION,
    inputSchema: z.toJSONSchema(input),
    async execute(args, signal) {
      await authorize();
      const v = input.parse(args);
      if (
        Boolean(v.from) !== Boolean(v.to) ||
        (v.from && v.to && v.from > v.to)
      )
        return { source: v.source, error: 'needsFromBeforeTo' };
      const q: Query = { ...v, id: projectId, site, allowed };
      const out = await answer(v.source, q, sources, link).catch(
        (error: unknown) => {
          signal.throwIfAborted();
          if (error instanceof QueryError)
            return error.code === 'accessDenied'
              ? { source: v.source, accessDenied: true }
              : { source: v.source, error: error.code, ...error.detail };
          // Business errors carry a status and a message written for people; anything else stays unnamed.
          const e = obj(error);
          if (typeof e.status === 'number' && typeof e.message === 'string')
            return {
              source: v.source,
              error: 'rejected',
              message: e.message.slice(0, 300),
            };
          return { source: v.source, error: 'unavailable' };
        },
      );
      // Revoked access while reading stops the run, as in every other tool.
      signal.throwIfAborted();
      await authorize();
      return out;
    },
  };
}
