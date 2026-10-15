import { createHash } from 'node:crypto';

import type { MockRunContext } from './types.js';

/** The dispatcher accepts an immutable run snapshot. It never reads the clock or network. */
export type FixtureContext = MockRunContext;

type ObjectValue = Record<string, unknown>;
const DAY = 86_400_000;
export const FIXTURE_PRODUCT = Object.freeze({
  name: 'NocoBloom',
  domain: 'nocobloom.example',
  origin: 'https://nocobloom.example',
  community: 'https://community.nocobloom.example',
  repository: 'nocobloom/nocobloom',
  npm: '@nocobloom/core',
  competitors: ['flowgrove.example', 'stackmeadow.example'],
});

/** Per-run synthetic identity, not a claim about the real site's product or integrations. */
export function fixtureProduct(c: FixtureContext) {
  if (!c.project) return FIXTURE_PRODUCT;
  const { name, domain } = c.project;
  const slug = domain.split('.')[0];
  return {
    name,
    domain,
    origin: `https://${domain}`,
    community: `https://community.${domain}`,
    repository: `${slug}/${slug}`,
    npm: `@${slug}/core`,
    competitors: FIXTURE_PRODUCT.competitors,
  };
}
export const projectText = (c: FixtureContext, value: string) =>
  value.replaceAll('NocoBloom', fixtureProduct(c).name);

/** Stable ASCII labels for synthetic channels and media; never a live account lookup. */
export const fixtureSlug = (c: FixtureContext): string =>
  c.project
    ? c.project.domain
        .split('.')[0]
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase() || 'project'
    : 'nocobloom';

const publicFixtureHost = (host: string): boolean =>
  /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host);

/** Concrete supported operations, rather than a catch-all successful response. */
export const FIXTURE_COVERAGE = Object.freeze({
  google: {
    operations: [
      'token',
      'userinfo',
      'accountSummaries',
      'properties',
      'sites',
      'ga4:runReport',
      'ga4:batchRunReports',
      'ga4:runRealtimeReport',
      'gsc:searchAnalytics/query',
      'gsc:urlInspection/index:inspect',
      'gsc:sitemaps',
    ],
    limits:
      '550 inclusive UTC days; requested dimensions, metrics, date windows (including today, yesterday and NdaysAgo, with today up to the clock hour), dimension filters, ordering and offset/limit are respected; realtime covers the 30 minutes before the clock',
  },
  dataforseo: {
    operations: [
      'appendix/user_data',
      'dataforseo_labs/id_list',
      'google/related_keywords',
      'google/keyword_suggestions',
      'google/keyword_ideas',
      'google/keyword_overview',
      'google/domain_rank_overview',
      'google/historical_rank_overview',
      'google/ranked_keywords',
      'google/relevant_pages',
      'google/domain_intersection',
      'backlinks/summary',
      'backlinks/backlinks',
      'backlinks/referring_domains',
      'backlinks/domain_pages_summary',
      'backlinks/domain_intersection',
      'backlinks/history',
      'serp/google/organic/live/advanced',
      'serp/google/organic/live/regular',
      'keywords_data/google_ads/keywords_for_keywords/live',
      'keywords_data/google_trends/explore/live',
      'ai_optimization/llm_mentions/aggregated_metrics',
      'ai_optimization/llm_mentions/cross_aggregated_metrics',
      'ai_optimization/llm_mentions/search',
      'ai_optimization/{chat_gpt,claude,gemini,perplexity}/llm_responses/{models,live}',
      'on_page/lighthouse/live/json',
    ],
    limits:
      'One task per request; up to 250 list rows, 52 trend weeks and 13 history months; zero billed cost',
  },
  github: {
    operations: [
      'repository',
      'issues/list',
      'issues/detail',
      'issues/search',
      'releases/list',
      'releases/detail',
      'traffic/views',
      'traffic/clones',
      'traffic/popular/referrers',
      'traffic/popular/paths',
      'stargazers',
      'stargazers/history',
      'forks',
      'graphql/discussions',
      'graphql/stargazers',
      'graphql/forks',
      'contents',
      'git/trees',
    ],
    limits:
      'Requested repositories in project-aware runs (legacy catalog otherwise); page/per_page and GraphQL cursor pagination; 14 traffic days',
  },
  x: {
    operations: [
      'tweets/counts/recent',
      'tweets/search/recent',
      'tweets/detail',
    ],
    limits:
      'Seven complete days; since_id, start_time and next_token pagination',
  },
  slack: {
    operations: [
      'auth.test',
      'conversations.list',
      'conversations.join',
      'conversations.history',
      'conversations.replies',
    ],
    limits:
      'Two project-named synthetic channels; timestamps, oldest and cursor pagination',
  },
  discord: {
    operations: [
      'users/@me',
      'users/@me/guilds',
      'guilds/channels',
      'channels/messages',
      'guilds/threads/active',
      'channels/threads/archived/public',
    ],
    limits:
      'One project-named synthetic guild; channel/thread messages, valid snowflakes and after/before/limit pagination',
  },
  community: {
    operations: [
      'about.json',
      'site.json',
      'latest.json',
      't/:id.json',
      't/:id/posts.json',
    ],
    limits:
      'List/detail/post-stream IDs match; latest page and requested post IDs respected',
  },
  public: {
    operations: [
      'homepage',
      'robots.txt',
      'sitemap.xml',
      'sitemap-pages.xml',
      'sitemap-docs.xml',
      'page/detail',
      'favicon.svg',
    ],
    limits:
      'Current project and www/docs/blog subdomains plus the legacy demo catalog; unsupported hosts fail closed; mock mode never verifies proxy reachability',
  },
  packages: {
    operations: [
      'npm/latest',
      'npm/package',
      'npm/downloads/range',
      'npm/versions/last-week',
      'pypi/json',
      'pypistats/overall',
      'pypistats/python_minor',
      'pypistats/system',
      'docker/repository',
      'docker/tags',
    ],
    limits:
      'Valid requested npm/PyPI/Docker names in project-aware runs; npm requested dates up to 550 days; PyPI 180 days',
  },
  hackernews: {
    operations: ['search_by_date', 'items/:id'],
    limits:
      'Fictional stories and comments with consistent parents; numeric date filters, page and hitsPerPage',
  },
});

export class MockUnsupportedOperationError extends Error {
  readonly code = 'mock_unsupported_operation';
  readonly status = 501;
  constructor(operation: string) {
    super(`Mock fixture does not support ${operation}`);
    this.name = 'MockUnsupportedOperationError';
  }
}

const object = (value: unknown): ObjectValue =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const string = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const integer = (value: unknown, fallback = 0): number =>
  value !== null &&
  value !== undefined &&
  value !== '' &&
  Number.isFinite(Number(value))
    ? Math.max(0, Math.floor(Number(value)))
    : fallback;
const names = (value: unknown): string[] =>
  list(value).map((v) => (typeof v === 'string' ? v : string(object(v).name)));
const empty = (c: FixtureContext): boolean => c.scenario === 'empty';
const added = (c: FixtureContext): boolean =>
  ['newdata', 'new-data', 'new_data', 'newData'].includes(c.scenario);
const size = (c: FixtureContext, normal = 8): number =>
  empty(c)
    ? 0
    : c.scenario === 'pagination'
      ? 207
      : normal + (added(c) ? 3 : 0);
export const fixtureHash = (
  c: Pick<FixtureContext, 'projectId' | 'seed'>,
  key: string,
): string =>
  createHash('sha256').update(`${c.projectId}:${c.seed}:${key}`).digest('hex');
export const fixtureNumber = (
  c: FixtureContext,
  key: string,
  max = 100,
): number => parseInt(fixtureHash(c, key).slice(0, 8), 16) % max;
const identity = (c: FixtureContext, key: string): number =>
  100_000 + fixtureNumber(c, key, 800_000);
const time = (c: FixtureContext): number => {
  const t = Date.parse(c.clock);
  if (!Number.isFinite(t))
    throw new MockUnsupportedOperationError('invalid fixture clock');
  return t;
};
const iso = (t: number): string => new Date(t).toISOString();
const day = (t: number): string => iso(t).slice(0, 10);
const at = (c: FixtureContext, days = 0, hours = 0): string =>
  iso(time(c) - days * DAY - hours * 3_600_000);
const utcDay = (c: FixtureContext): number => Date.parse(day(time(c)));
function dates(
  c: FixtureContext,
  from?: unknown,
  to?: unknown,
  fallback = 28,
): string[] {
  const end =
    typeof to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(to)
      ? Date.parse(to)
      : utcDay(c) - DAY;
  const start =
    typeof from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(from)
      ? Date.parse(from)
      : end - (fallback - 1) * DAY;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    (end - start) / DAY >= 550
  )
    throw new MockUnsupportedOperationError('date window outside 1–550 days');
  const availableEnd = Math.min(end, utcDay(c) - DAY);
  if (start > availableEnd) return [];
  return Array.from({ length: (availableEnd - start) / DAY + 1 }, (_, i) =>
    day(start + i * DAY),
  );
}
const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-nocoreach-mock': 'true',
      ...headers,
    },
  });
const textResponse = (
  value: string,
  type = 'text/plain; charset=utf-8',
  status = 200,
): Response =>
  new Response(value, {
    status,
    headers: { 'content-type': type, 'x-nocoreach-mock': 'true' },
  });
const notFound = (kind: string): Response =>
  json(
    { message: `Fictional ${kind} not found`, error: 'mock_not_found' },
    404,
  );
function body(init: RequestInit): ObjectValue {
  if (init.body === undefined || init.body === null) return {};
  if (init.body instanceof URLSearchParams)
    return Object.fromEntries(init.body);
  if (typeof init.body !== 'string')
    throw new MockUnsupportedOperationError('non-text request body');
  try {
    return object(JSON.parse(init.body));
  } catch {
    return Object.fromEntries(new URLSearchParams(init.body));
  }
}
function taskInput(init: RequestInit): ObjectValue {
  if (typeof init.body !== 'string') return {};
  const parsed: unknown = JSON.parse(init.body);
  if (!Array.isArray(parsed) || parsed.length !== 1)
    throw new MockUnsupportedOperationError(
      'DataForSEO request requires one task',
    );
  return object(parsed[0]);
}
const offsetToken = (value: unknown): number => {
  if (!value) return 0;
  const m = string(value).match(/^mock-(\d+)$/);
  if (!m) throw new MockUnsupportedOperationError('invalid pagination cursor');
  return Number(m[1]);
};
function page<T>(
  rows: T[],
  offset: unknown,
  limit: unknown,
  fallback = 100,
): T[] {
  return rows.slice(
    integer(offset),
    integer(offset) + Math.min(25_000, Math.max(1, integer(limit, fallback))),
  );
}
function cursorPage<T>(
  rows: T[],
  cursor: unknown,
  limit: unknown,
  fallback = 100,
): { items: T[]; next: string } {
  const offset = offsetToken(cursor),
    items = page(rows, offset, limit, fallback);
  return {
    items,
    next:
      offset + items.length < rows.length
        ? `mock-${offset + items.length}`
        : '',
  };
}
const restPage = <T>(rows: T[], u: URL, fallback = 100): T[] =>
  page(
    rows,
    (Math.max(1, integer(u.searchParams.get('page'), 1)) - 1) *
      Math.max(1, integer(u.searchParams.get('per_page'), fallback)),
    u.searchParams.get('per_page') ?? fallback,
    fallback,
  );

const PAGE_DEFINITIONS = [
  [
    '/',
    'NocoBloom: build calm internal tools',
    'Build internal tools with visual data models, templates, and clear permissions.',
  ],
  [
    '/pricing',
    'Simple NocoBloom pricing',
    'Choose a workspace for your team. Explore the fictional Community, Team, and Studio plans.',
  ],
  [
    '/docs/getting-started',
    'Start your first NocoBloom workspace',
    'Create a workspace, select an onboarding template, and invite teammates to build together.',
  ],
  [
    '/docs/workflows',
    'Connect Slack and GitHub workflows',
    'Use reviewed workflow steps to turn support requests into tracked GitHub issues.',
  ],
  [
    '/docs/reporting',
    'Build a reporting dashboard',
    'Connect a data source, choose a chart, and explain each metric with a clear date range.',
  ],
  [
    '/blog/template-onboarding',
    'A gentler onboarding template',
    'The new onboarding template helps teams map roles and publish a useful first dashboard.',
  ],
  [
    '/blog/workflow-checklist',
    'A practical workflow checklist',
    'Check permissions, owner assignment, and audit history before publishing an automated workflow.',
  ],
  [
    '/templates/customer-success',
    'Customer success workspace template',
    'Manage onboarding milestones and share progress with customer success teammates.',
  ],
  [
    '/blog/reporting-release',
    'New reporting blocks in NocoBloom',
    'New reporting blocks bring grouped metrics and accessible labels to workspace dashboards.',
  ],
  [
    '/docs/import-data',
    'Import team data safely',
    'Preview columns and validate rows before importing data into an existing workspace.',
  ],
  [
    '/templates/issue-triage',
    'Issue triage template',
    'Triage requests with clear priorities, reproducible evidence, and a named owner.',
  ],
] as const;
function pages(
  c: FixtureContext,
  origin: string = fixtureProduct(c).origin,
): { url: string; path: string; title: string; description: string }[] {
  return PAGE_DEFINITIONS.slice(0, empty(c) ? 0 : added(c) ? 11 : 8).map(
    ([path, title, description]) => ({
      url: origin + path,
      path,
      title: projectText(c, title),
      description: projectText(c, description),
    }),
  );
}
const keywords = [
  'no code internal tools',
  'workflow automation templates',
  'open source reporting dashboard',
  'customer onboarding workspace',
  'slack github workflow',
  'visual data model',
  'team permissions guide',
  'internal tools comparison',
  'reporting blocks',
  'data import validation',
  'issue triage template',
];

function google(
  u: URL,
  init: RequestInit,
  c: FixtureContext,
): Response | undefined {
  const p = u.pathname,
    b = body(init);
  if (u.hostname === 'oauth2.googleapis.com' && p === '/token')
    return json({
      access_token: `mock-access-${fixtureHash(c, 'google').slice(0, 16)}`,
      refresh_token: `mock-refresh-${fixtureHash(c, 'google').slice(0, 16)}`,
      token_type: 'Bearer',
      expires_in: 3600,
      scope:
        'openid email https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',
    });
  if (u.hostname === 'openidconnect.googleapis.com' && p === '/v1/userinfo')
    return json({
      sub: `mock-${identity(c, 'google-user')}`,
      email: `demo@${fixtureProduct(c).domain}`,
      email_verified: true,
      name: `${fixtureProduct(c).name} Demo`,
    });
  const propertyId = String(100_000_000 + identity(c, 'ga4'));
  if (
    u.hostname === 'analyticsadmin.googleapis.com' &&
    p === '/v1beta/accountSummaries'
  ) {
    const rows = [
      {
        name: `accountSummaries/${identity(c, 'account')}`,
        account: `accounts/${identity(c, 'account')}`,
        displayName: `${fixtureProduct(c).name} demo`,
        propertySummaries: [
          {
            property: `properties/${propertyId}`,
            displayName: `${fixtureProduct(c).name} website`,
            propertyType: 'PROPERTY_TYPE_ORDINARY',
          },
        ],
      },
    ];
    const result = cursorPage(
      rows,
      u.searchParams.get('pageToken'),
      u.searchParams.get('pageSize') ?? 200,
    );
    return json({
      accountSummaries: result.items,
      ...(result.next ? { nextPageToken: result.next } : {}),
    });
  }
  if (
    u.hostname === 'analyticsadmin.googleapis.com' &&
    p === `/v1beta/properties/${propertyId}`
  )
    return json({
      name: `properties/${p.split('/').at(-1)}`,
      displayName: `${fixtureProduct(c).name} website`,
      timeZone: 'UTC',
      currencyCode: 'USD',
      industryCategory: 'COMPUTERS_AND_ELECTRONICS',
    });
  if (u.hostname === 'www.googleapis.com' && p === '/webmasters/v3/sites')
    return json({
      siteEntry: [
        {
          siteUrl: `sc-domain:${fixtureProduct(c).domain}`,
          permissionLevel: 'siteOwner',
        },
        {
          siteUrl: fixtureProduct(c).origin + '/',
          permissionLevel: 'siteOwner',
        },
      ],
    });
  if (
    u.hostname === 'analyticsdata.googleapis.com' &&
    p === `/v1beta/properties/${propertyId}:runReport`
  )
    return ga4(b, c);
  if (
    u.hostname === 'analyticsdata.googleapis.com' &&
    p === `/v1beta/properties/${propertyId}:batchRunReports`
  )
    return ga4Batch(b, c);
  if (
    u.hostname === 'analyticsdata.googleapis.com' &&
    p === `/v1beta/properties/${propertyId}:runRealtimeReport`
  )
    return ga4Realtime(b, c);
  if (
    u.hostname === 'www.googleapis.com' &&
    [
      `sc-domain:${fixtureProduct(c).domain}`,
      fixtureProduct(c).origin + '/',
    ].some(
      (site) =>
        p ===
        `/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    )
  )
    return gsc(b, c);
  // Existing mock connections may still select the original fictional GSC site.
  // Honor only that explicit legacy resource, not arbitrary unconfigured sites.
  if (
    c.project &&
    u.hostname === 'www.googleapis.com' &&
    [`sc-domain:${FIXTURE_PRODUCT.domain}`, FIXTURE_PRODUCT.origin + '/'].some(
      (site) =>
        p ===
        `/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    )
  )
    return gsc(b, { ...c, project: undefined });
  if (
    u.hostname === 'searchconsole.googleapis.com' &&
    p === '/v1/urlInspection/index:inspect'
  ) {
    const site = string(b.siteUrl),
      scope = gscScope(site, c);
    if (!scope)
      throw new MockUnsupportedOperationError('Search Console property');
    return inspection(string(b.inspectionUrl), site, scope);
  }
  const sitemapSite = p.match(/^\/webmasters\/v3\/sites\/([^/]+)\/sitemaps$/);
  if (u.hostname === 'www.googleapis.com' && sitemapSite) {
    const scope = gscScope(decodeURIComponent(sitemapSite[1]), c);
    if (!scope)
      throw new MockUnsupportedOperationError('Search Console property');
    return sitemaps(scope, u.searchParams.get('sitemapIndex'));
  }
  if (u.hostname === 'www.googleapis.com' && p === '/discovery/v1/apis')
    return json({
      kind: 'discovery#directoryList',
      items: [
        {
          name: 'analyticsdata',
          version: 'v1beta',
          title: 'Google Analytics Data API',
        },
      ],
    });
  return undefined;
}

type Fact = {
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
};
function aggregate(
  rows: Fact[],
  dimensions: string[],
  metrics: string[],
): Fact[] {
  const grouped = new Map<string, Fact>();
  for (const row of rows) {
    const selected = Object.fromEntries(
      dimensions.map((d) => [d, row.dimensions[d] ?? '']),
    );
    const key = JSON.stringify(selected),
      old = grouped.get(key) ?? {
        dimensions: selected,
        metrics: Object.fromEntries(metrics.map((m) => [m, 0])),
      };
    for (const metric of metrics)
      old.metrics[metric] += row.metrics[metric] ?? 0;
    grouped.set(key, old);
  }
  return [...grouped.values()];
}
// GA4 dimension filters: and/or/not groups over exact, prefix, suffix or substring matches and value lists.
function ga4Filter(
  expression: unknown,
  allowed: readonly string[],
): (fact: Fact) => boolean {
  const e = object(expression);
  const group = (value: unknown) =>
    list(object(value).expressions).map((x) => ga4Filter(x, allowed));
  if (e.andGroup) {
    const all = group(e.andGroup);
    return (fact) => all.every((f) => f(fact));
  }
  if (e.orGroup) {
    const any = group(e.orGroup);
    return (fact) => any.some((f) => f(fact));
  }
  if (e.notExpression) {
    const not = ga4Filter(e.notExpression, allowed);
    return (fact) => !not(fact);
  }
  const filter = object(e.filter),
    field = string(filter.fieldName);
  if (!allowed.includes(field))
    throw new MockUnsupportedOperationError('GA4 filter field');
  const text = object(filter.stringFilter),
    inList = object(filter.inListFilter);
  if (filter.inListFilter) {
    const sensitive = inList.caseSensitive === true,
      values = list(inList.values).map((v) =>
        sensitive ? string(v) : string(v).toLowerCase(),
      );
    return (fact) => {
      const v = fact.dimensions[field] ?? '';
      return values.includes(sensitive ? v : v.toLowerCase());
    };
  }
  const match = string(text.matchType, 'EXACT');
  if (
    !filter.stringFilter ||
    !['EXACT', 'BEGINS_WITH', 'ENDS_WITH', 'CONTAINS'].includes(match)
  )
    throw new MockUnsupportedOperationError('GA4 filter');
  const sensitive = text.caseSensitive === true,
    wanted = sensitive ? string(text.value) : string(text.value).toLowerCase();
  return (fact) => {
    const raw = fact.dimensions[field] ?? '',
      v = sensitive ? raw : raw.toLowerCase();
    return match === 'EXACT'
      ? v === wanted
      : match === 'BEGINS_WITH'
        ? v.startsWith(wanted)
        : match === 'ENDS_WITH'
          ? v.endsWith(wanted)
          : v.includes(wanted);
  };
}
const filterFields = (expression: unknown): string[] => {
  const e = object(expression);
  return [
    string(object(e.filter).fieldName),
    ...['andGroup', 'orGroup'].flatMap((g) =>
      list(object(e[g]).expressions).flatMap(filterFields),
    ),
    ...(e.notExpression ? filterFields(e.notExpression) : []),
  ].filter(Boolean);
};
// GA4 also accepts today, yesterday and NdaysAgo, in the property's time zone (UTC here).
function ga4Day(c: FixtureContext, value: unknown): unknown {
  const v = string(value),
    ago = /^(\d+)daysAgo$/.exec(v);
  if (v === 'today') return day(utcDay(c));
  if (v === 'yesterday') return day(utcDay(c) - DAY);
  return ago ? day(utcDay(c) - Number(ago[1]) * DAY) : value;
}
// Days of one date range. Today is included while it is in the range; only its hours before the clock have data.
function ga4Dates(c: FixtureContext, range: ObjectValue): string[] {
  const start = ga4Day(c, range.startDate),
    end = ga4Day(c, range.endDate),
    today = day(utcDay(c)),
    days = dates(c, start, end);
  const coversToday =
    typeof end === 'string' &&
    end >= today &&
    (typeof start !== 'string' || start <= today);
  return coversToday ? [...days, today] : days;
}
// A day's share of visits per hour, quiet at night: hour h gets HOURS[h] / 100.
const HOURS = [
  1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 4, 3, 3,
];
// Splits a fact into its hours, keeping the totals: each hour gets the rounded running share.
function hourly(fact: Fact, before = 24): Fact[] {
  const out: Fact[] = [];
  let share = 0;
  for (let h = 0; h < before; h++) {
    const from = share;
    share += HOURS[h] / 100;
    out.push({
      dimensions: { ...fact.dimensions, hour: String(h).padStart(2, '0') },
      metrics: Object.fromEntries(
        Object.entries(fact.metrics).map(([m, v]) => [
          m,
          Math.round(v * share) - Math.round(v * from),
        ]),
      ),
    });
  }
  return out;
}
// A session fact as its events; their counts add up to the fact's eventCount and sign_up is the key event.
function events(fact: Fact): Fact[] {
  const m = fact.metrics,
    rest =
      (m.eventCount ?? 0) -
      (m.screenPageViews ?? 0) -
      (m.sessions ?? 0) -
      (m.engagedSessions ?? 0) -
      (m.keyEvents ?? 0);
  return (
    [
      ['page_view', m.screenPageViews ?? 0],
      ['session_start', m.sessions ?? 0],
      ['user_engagement', m.engagedSessions ?? 0],
      ['scroll', Math.max(0, rest)],
      ['sign_up', m.keyEvents ?? 0],
    ] as const
  ).map(([eventName, eventCount]) => ({
    dimensions: { ...fact.dimensions, eventName },
    metrics: {
      ...m,
      eventCount,
      keyEvents: eventName === 'sign_up' ? eventCount : 0,
    },
  }));
}
function ga4Order(rows: Fact[], b: ObjectValue): Fact[] {
  const orders = list(b.orderBys).map(object);
  if (!orders.length) return rows;
  return [...rows].sort((x, y) => {
    for (const o of orders) {
      const metric = string(object(o.metric).metricName),
        dimension = string(object(o.dimension).dimensionName),
        diff = metric
          ? (x.metrics[metric] ?? 0) - (y.metrics[metric] ?? 0)
          : (x.dimensions[dimension] ?? '').localeCompare(
              y.dimensions[dimension] ?? '',
            );
      if (diff) return o.desc === true ? -diff : diff;
    }
    return 0;
  });
}
const RATIOS = [
  'engagementRate',
  'averageSessionDuration',
  'bounceRate',
  'sessionKeyEventRate',
];
function ga4Response(
  dim: string[],
  met: string[],
  rows: Fact[],
  b: ObjectValue,
  kind: string,
): ObjectValue {
  return {
    dimensionHeaders: dim.map((name) => ({ name })),
    metricHeaders: met.map((name) => ({
      name,
      type: RATIOS.includes(name) ? 'TYPE_FLOAT' : 'TYPE_INTEGER',
    })),
    rows: page(ga4Order(rows, b), b.offset, b.limit, 10_000).map((r) => ({
      dimensionValues: dim.map((d) => ({ value: r.dimensions[d] })),
      metricValues: met.map((m) => ({ value: String(r.metrics[m]) })),
    })),
    rowCount: rows.length,
    metadata: {
      currencyCode: 'USD',
      timeZone: 'UTC',
      dataLossFromOtherRow: false,
    },
    kind,
  };
}
const GA4_DIMENSIONS = [
  'date',
  'hour',
  'sessionDefaultChannelGroup',
  'sessionSource',
  'sessionMedium',
  'sessionCampaignName',
  'country',
  'countryId',
  'city',
  'deviceCategory',
  'browser',
  'operatingSystem',
  'language',
  'languageCode',
  'newVsReturning',
  'eventName',
  'hostName',
  'pagePath',
  'pageTitle',
  'pageReferrer',
  'landingPagePlusQueryString',
];
const GA4_METRICS = [
  'sessions',
  'engagedSessions',
  'activeUsers',
  'totalUsers',
  'newUsers',
  'keyEvents',
  'conversions',
  'eventCount',
  'userEngagementDuration',
  'screenPageViews',
  'engagementRate',
  'averageSessionDuration',
  'bounceRate',
  'sessionKeyEventRate',
];
// One GA4 report: every requested date range (named ones add the dateRange dimension, as GA4 does when there are
// several), dimension filters, metric or dimension ordering, and offset/limit.
function ga4Report(b: ObjectValue, c: FixtureContext): ObjectValue {
  const dim = names(b.dimensions),
    met = names(b.metrics),
    ranges = list(b.dateRanges).map(object);
  if (
    dim.some((d) => !GA4_DIMENSIONS.includes(d)) ||
    met.some((m) => !GA4_METRICS.includes(m))
  )
    throw new MockUnsupportedOperationError('GA4 dimension or metric');
  if (ranges.length > 4)
    throw new MockUnsupportedOperationError('GA4 date ranges');
  const keep = b.dimensionFilter
      ? ga4Filter(b.dimensionFilter, GA4_DIMENSIONS)
      : () => true,
    fields = [...dim, ...filterFields(b.dimensionFilter)],
    today = day(utcDay(c)),
    clockHour = new Date(time(c)).getUTCHours(),
    named = ranges.length > 1;
  const rows = (ranges.length ? ranges : [{}]).flatMap((range, r) => {
    const facts = ga4Dates(c, range).flatMap((date) =>
      pages(c).flatMap((p, i) =>
        ['google', 'reddit.com'].map((source, j): Fact => {
          const sessions =
            12 +
            fixtureNumber(c, `${date}:${p.path}:${source}`, 55) +
            (added(c) ? 9 : 0);
          return {
            dimensions: {
              date: date.replaceAll('-', ''),
              sessionDefaultChannelGroup: j ? 'Referral' : 'Organic Search',
              sessionSource: source,
              sessionMedium: j ? 'referral' : 'organic',
              sessionCampaignName: '(organic)',
              country: j ? 'Canada' : 'United States',
              countryId: j ? 'CA' : 'US',
              city: j ? 'Toronto' : 'Portland',
              deviceCategory: i % 2 ? 'mobile' : 'desktop',
              browser: 'Chrome',
              operatingSystem: i % 2 ? 'Android' : 'Linux',
              language: 'en',
              languageCode: 'en-us',
              newVsReturning: (i + j) % 3 ? 'returning' : 'new',
              hostName: fixtureProduct(c).domain,
              pagePath: p.path,
              pageTitle: p.title,
              pageReferrer: j
                ? `https://www.reddit.com/r/${c.project ? fixtureSlug(c) : 'NocoBloom'}/comments/mockdemo/`
                : 'https://www.google.com/',
              landingPagePlusQueryString: p.path,
            },
            metrics: {
              sessions,
              engagedSessions: Math.floor(sessions * 0.7),
              activeUsers: Math.floor(sessions * 0.82),
              totalUsers: Math.floor(sessions * 0.88),
              newUsers: Math.floor(sessions * 0.6),
              keyEvents: Math.floor(sessions * 0.08),
              conversions: Math.floor(sessions * 0.08),
              eventCount: sessions * 4,
              userEngagementDuration: sessions * 92,
              screenPageViews: sessions * 2,
              keySessions: Math.floor(sessions * 0.06),
              engagementRate: 0.7,
              averageSessionDuration: 92,
              bounceRate: 0.3,
            },
          };
        }),
      ),
    );
    const split = facts
      .flatMap((f) =>
        f.dimensions.date === today.replaceAll('-', '')
          ? hourly(f, clockHour)
          : fields.includes('hour')
            ? hourly(f)
            : [f],
      )
      .flatMap((f) => (fields.includes('eventName') ? events(f) : [f]))
      .filter(keep);
    const name = string(range.name) || `date_range_${r}`;
    return aggregate(
      split.map((f) => ({ ...f, metrics: { ...f.metrics, __count: 1 } })),
      dim,
      [...new Set([...met, 'sessions', 'keySessions', '__count'])],
    ).map((row) => ({
      dimensions: named
        ? { ...row.dimensions, dateRange: name }
        : row.dimensions,
      metrics: row.metrics,
    }));
  });
  for (const row of rows) {
    const count = Math.max(1, row.metrics.__count);
    for (const m of ['engagementRate', 'averageSessionDuration', 'bounceRate'])
      if (m in row.metrics) row.metrics[m] /= count;
    if ('sessionKeyEventRate' in row.metrics)
      row.metrics.sessionKeyEventRate = row.metrics.sessions
        ? row.metrics.keySessions / row.metrics.sessions
        : 0;
  }
  return ga4Response(
    named ? [...dim, 'dateRange'] : dim,
    met,
    rows,
    b,
    'analyticsData#runReport',
  );
}
function ga4(b: ObjectValue, c: FixtureContext): Response {
  return json(ga4Report(b, c));
}
function ga4Batch(b: ObjectValue, c: FixtureContext): Response {
  const requests = list(b.requests).map(object);
  if (!requests.length || requests.length > 5)
    throw new MockUnsupportedOperationError('GA4 batch of 1–5 reports');
  return json({
    kind: 'analyticsData#batchRunReports',
    reports: requests.map((r) => ga4Report(r, c)),
  });
}
// GA4 Realtime: the last 30 minutes before the fixture clock, per minute and page.
function ga4Realtime(b: ObjectValue, c: FixtureContext): Response {
  const dim = names(b.dimensions),
    met = names(b.metrics),
    allowed = [
      'minutesAgo',
      'unifiedScreenName',
      'country',
      'countryId',
      'city',
      'deviceCategory',
      'eventName',
    ];
  if (
    dim.some((d) => !allowed.includes(d)) ||
    met.some(
      (m) =>
        !['activeUsers', 'screenPageViews', 'eventCount', 'keyEvents'].includes(
          m,
        ),
    )
  )
    throw new MockUnsupportedOperationError('GA4 realtime dimension or metric');
  const minute = Math.floor(time(c) / 60_000);
  const facts = Array.from({ length: 30 }, (_, ago) =>
    pages(c).map((p, i): Fact => {
      const users = fixtureNumber(c, `realtime:${minute - ago}:${p.path}`, 3),
        views = users
          ? users + fixtureNumber(c, `views:${minute - ago}`, 2)
          : 0,
        far = (i + ago) % 3 === 0;
      return {
        dimensions: {
          minutesAgo: String(ago).padStart(2, '0'),
          unifiedScreenName: p.title,
          country: far ? 'Canada' : 'United States',
          countryId: far ? 'CA' : 'US',
          city: far ? 'Toronto' : 'Portland',
          deviceCategory: i % 2 ? 'mobile' : 'desktop',
        },
        metrics: {
          activeUsers: users,
          screenPageViews: views,
          sessions: users,
          engagedSessions: users,
          eventCount: views * 3,
          keyEvents:
            users && fixtureNumber(c, `key:${minute - ago}`, 10) === 0 ? 1 : 0,
        },
      };
    }),
  )
    .flat()
    .filter((f) => f.metrics.activeUsers)
    .flatMap((f) => (dim.includes('eventName') ? events(f) : [f]));
  return json(
    ga4Response(
      dim,
      met,
      aggregate(facts, dim, met),
      b,
      'analyticsData#runRealtimeReport',
    ),
  );
}
function gsc(b: ObjectValue, c: FixtureContext): Response {
  const dim = names(b.dimensions),
    allowed = [
      'date',
      'query',
      'page',
      'country',
      'device',
      'searchAppearance',
    ];
  if (dim.some((d) => !allowed.includes(d)))
    throw new MockUnsupportedOperationError('Search Console dimension');
  let facts = dates(c, b.startDate, b.endDate).flatMap((date) =>
    pages(c).map((p, i) => {
      const impressions =
          90 + fixtureNumber(c, `${date}:${p.path}:impressions`, 900),
        clicks = Math.floor(impressions * (0.035 + i * 0.005));
      return {
        dimensions: {
          date,
          query: keywords[i % keywords.length],
          page: p.url,
          country: i % 3 ? 'usa' : 'can',
          device: i % 2 ? 'MOBILE' : 'DESKTOP',
          searchAppearance: 'WEB_LIGHT_RESULT',
        },
        metrics: { clicks, impressions, position: (3 + i) * impressions },
      };
    }),
  );
  for (const group of list(b.dimensionFilterGroups))
    for (const filter of list(object(group).filters)) {
      const f = object(filter),
        d = string(f.dimension),
        value = string(f.expression),
        op = string(f.operator, 'equals');
      facts = facts.filter((row) => {
        const actual = row.dimensions[d as keyof typeof row.dimensions] ?? '';
        return op === 'notEquals'
          ? actual !== value
          : op === 'contains'
            ? actual.includes(value)
            : actual === value;
      });
    }
  const rows = aggregate(facts, dim, ['clicks', 'impressions', 'position']).map(
    (r) => ({
      keys: dim.map((d) => r.dimensions[d]),
      clicks: r.metrics.clicks,
      impressions: r.metrics.impressions,
      ctr: r.metrics.impressions ? r.metrics.clicks / r.metrics.impressions : 0,
      position: r.metrics.impressions
        ? r.metrics.position / r.metrics.impressions
        : 0,
    }),
  );
  return json({
    rows: page(rows, b.startRow, b.rowLimit, 25_000),
    responseAggregationType: dim.includes('page') ? 'byPage' : 'byProperty',
  });
}

// The Search Console property a request names: the run's own site, or (from a project-aware run) the original fictional
// one; any other property is not simulated.
function gscScope(site: string, c: FixtureContext): FixtureContext | undefined {
  const own = (x: FixtureContext) => [
    `sc-domain:${fixtureProduct(x).domain}`,
    fixtureProduct(x).origin + '/',
  ];
  if (own(c).includes(site)) return c;
  if (c.project && own({ ...c, project: undefined }).includes(site))
    return { ...c, project: undefined };
  return undefined;
}
// URL Inspection: one fixed outcome per path. Most pages are indexed; a docs page is crawled and a blog post only
// discovered, a template is a duplicate whose Google-selected canonical differs, the added pages bring one unknown URL
// and one 404, and rich results carry an error (FAQ on pricing) and a warning.
type Inspected = {
  verdict: string;
  coverage: string;
  crawled?: number;
  fetch?: string;
  canonical?: string;
  rich?: [string, string?, ('ERROR' | 'WARNING')?][];
};
const INSPECTED: Record<string, Inspected> = {
  '/': { verdict: 'PASS', coverage: 'Submitted and indexed', crawled: 1 },
  '/pricing': {
    verdict: 'PASS',
    coverage: 'Submitted and indexed',
    crawled: 2,
    rich: [['FAQ', 'Missing field "acceptedAnswer"', 'ERROR']],
  },
  '/docs/getting-started': {
    verdict: 'PASS',
    coverage: 'Submitted and indexed',
    crawled: 3,
    rich: [['Breadcrumbs']],
  },
  '/docs/workflows': {
    verdict: 'PASS',
    coverage: 'Submitted and indexed',
    crawled: 5,
    rich: [['Breadcrumbs']],
  },
  '/docs/reporting': {
    verdict: 'NEUTRAL',
    coverage: 'Crawled - currently not indexed',
    crawled: 21,
  },
  '/blog/template-onboarding': {
    verdict: 'PASS',
    coverage: 'Submitted and indexed',
    crawled: 9,
    rich: [
      ['Breadcrumbs'],
      ['Image metadata', 'Missing field "creator"', 'WARNING'],
    ],
  },
  '/blog/workflow-checklist': {
    verdict: 'NEUTRAL',
    coverage: 'Discovered - currently not indexed',
  },
  '/templates/customer-success': {
    verdict: 'NEUTRAL',
    coverage: 'Duplicate, Google chose different canonical than user',
    crawled: 12,
    canonical: '/templates/issue-triage',
  },
  '/blog/reporting-release': {
    verdict: 'NEUTRAL',
    coverage: 'URL is unknown to Google',
  },
  '/docs/import-data': {
    verdict: 'FAIL',
    coverage: 'Not found (404)',
    crawled: 4,
    fetch: 'NOT_FOUND',
  },
};
function inspection(url: string, site: string, c: FixtureContext): Response {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return json(
      {
        error: {
          code: 400,
          message: 'Invalid inspectionUrl.',
          status: 'INVALID_ARGUMENT',
        },
      },
      400,
    );
  }
  const domain = fixtureProduct(c).domain,
    host = target.hostname;
  if (
    site.startsWith('sc-domain:')
      ? host !== domain && !host.endsWith(`.${domain}`)
      : !url.startsWith(site)
  )
    return json(
      {
        error: {
          code: 403,
          message:
            'You do not own this site, or the inspected URL is not part of this property.',
          status: 'PERMISSION_DENIED',
        },
      },
      403,
    );
  const path = target.pathname.replace(/\/+$/, '') || '/',
    o = INSPECTED[path] ?? {
      verdict: 'PASS',
      coverage: 'Submitted and indexed',
      crawled: 7,
    },
    origin = target.origin,
    known = o.coverage !== 'URL is unknown to Google',
    fetched = o.crawled !== undefined && !o.fetch;
  return json({
    inspectionResult: {
      inspectionResultLink: `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(site)}&id=${fixtureHash(c, url).slice(0, 22)}`,
      indexStatusResult: {
        verdict: o.verdict,
        coverageState: o.coverage,
        robotsTxtState: 'ALLOWED',
        indexingState: 'INDEXING_ALLOWED',
        pageFetchState:
          o.crawled === undefined
            ? 'PAGE_FETCH_STATE_UNSPECIFIED'
            : (o.fetch ?? 'SUCCESSFUL'),
        ...(known
          ? {
              sitemap: [
                `${origin}/sitemap-${path.startsWith('/docs/') ? 'docs' : 'pages'}.xml`,
              ],
              referringUrls: path === '/' ? [] : [origin + '/'],
            }
          : {}),
        ...(o.crawled !== undefined
          ? { lastCrawlTime: at(c, o.crawled, 3), crawledAs: 'MOBILE' }
          : {}),
        ...(fetched
          ? {
              googleCanonical: o.canonical ? origin + o.canonical : url,
              userCanonical: url,
            }
          : {}),
      },
      mobileUsabilityResult: { verdict: 'VERDICT_UNSPECIFIED' },
      ...(o.rich && fetched
        ? {
            richResultsResult: {
              verdict: o.rich.some(([, , level]) => level === 'ERROR')
                ? 'FAIL'
                : 'PASS',
              detectedItems: o.rich.map(([type, message, severity]) => ({
                richResultType: type,
                items: [
                  {
                    name: 'Unnamed item',
                    issues: message
                      ? [{ issueMessage: message, severity }]
                      : [],
                  },
                ],
              })),
            },
          }
        : {}),
    },
  });
}
// Sitemaps: the pages sitemap submitted long ago and an old one Google can no longer fetch. The index and the docs
// sitemap that robots.txt points to were never submitted. An index's files are listed when asked for.
function sitemaps(c: FixtureContext, index: string | null): Response {
  const origin = fixtureProduct(c).origin,
    list = pages(c),
    docs = list.filter((row) => row.path.startsWith('/docs/')).length;
  const entry = (
    path: string,
    submitted: number,
    downloaded: number,
    urls: number,
    extra: ObjectValue = {},
  ) => ({
    path: origin + path,
    lastSubmitted: at(c, submitted),
    isPending: false,
    isSitemapsIndex: false,
    type: 'sitemap',
    lastDownloaded: at(c, downloaded, 5),
    warnings: '0',
    errors: '0',
    contents: [{ type: 'web', submitted: String(urls), indexed: '0' }],
    ...extra,
  });
  if (index !== null)
    return json(
      index === origin + '/sitemap.xml'
        ? {
            sitemap: [
              entry('/sitemap-pages.xml', 142, 1, list.length - docs),
              entry('/sitemap-docs.xml', 142, 2, docs),
            ],
          }
        : {},
    );
  if (empty(c)) return json({});
  return json({
    sitemap: [
      entry('/sitemap-pages.xml', 142, 1, list.length - docs),
      entry('/sitemap-old.xml', 410, 3, 0, { errors: '1', contents: [] }),
    ],
  });
}

function seoEnvelope(
  c: FixtureContext,
  operation: string,
  result: unknown[],
): Response {
  return json({
    version: '0.1.20261012',
    status_code: 20000,
    status_message: 'Ok. (fictional mock data)',
    time: '0 sec.',
    cost: 0,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: `mock-${fixtureHash(c, operation).slice(0, 24)}`,
        status_code: 20000,
        status_message: 'Ok.',
        time: '0 sec.',
        cost: 0,
        result_count: result.length,
        path: ['v3', ...operation.split('/')],
        result,
      },
    ],
  });
}
function keywordRows(
  c: FixtureContext,
  words: string[] = keywords,
): ObjectValue[] {
  return Array.from(
    { length: empty(c) ? 0 : Math.min(250, words.length) },
    (_, i) => {
      const keyword = words[i],
        volume =
          200 +
          fixtureNumber(c, `${keyword}:volume`, 8000) +
          (added(c) ? 200 : 0);
      return {
        keyword,
        keyword_info: {
          search_volume: volume,
          cpc: 1.2 + fixtureNumber(c, keyword, 50) / 10,
          competition: 0.22,
          competition_level: 'LOW',
          monthly_searches: Array.from({ length: 12 }, (_, j) => {
            const d = new Date(utcDay(c));
            d.setUTCMonth(d.getUTCMonth() - 11 + j, 1);
            return {
              year: d.getUTCFullYear(),
              month: d.getUTCMonth() + 1,
              search_volume: Math.max(10, volume - 300 + j * 30),
            };
          }),
        },
        keyword_properties: {
          keyword_difficulty: 12 + fixtureNumber(c, keyword, 50),
        },
        search_intent_info: {
          main_intent: i % 2 ? 'commercial' : 'informational',
        },
        serp_info: {
          check_url: `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
          serp_item_types: ['organic'],
          se_results_count: 42_000,
        },
      };
    },
  );
}
const seoTarget = (b: ObjectValue, c: FixtureContext): string =>
  string(b.target, string(b.target1, fixtureProduct(c).domain));
function dataforseo(
  u: URL,
  init: RequestInit,
  c: FixtureContext,
): Response | undefined {
  if (u.hostname !== 'api.dataforseo.com') return undefined;
  const operation = u.pathname.replace(/^\/v3\//, '').replace(/\/$/, ''),
    b = taskInput(init);
  const wrap = (result: unknown[]): Response =>
    seoEnvelope(c, operation, result);
  const result = (rows: ObjectValue[], extra: ObjectValue = {}): Response =>
    wrap([
      {
        datetime: at(c),
        total_count: rows.length,
        items_count: page(rows, b.offset, b.limit, 100).length,
        items: page(rows, b.offset, b.limit, 100),
        ...extra,
      },
    ]);
  if (operation === 'appendix/user_data')
    return wrap([
      {
        login: `demo@${fixtureProduct(c).domain}`,
        money: { balance: 0 },
        mock: true,
      },
    ]);
  if (operation === 'dataforseo_labs/id_list') return wrap([]);
  const models = operation.match(
    /^ai_optimization\/(chat_gpt|claude|gemini|perplexity)\/llm_responses\/(models|live)$/,
  );
  if (models) {
    const modelNames: Record<string, string> = {
      chat_gpt: 'gpt-5.6-luna',
      claude: 'claude-sonnet-4-5',
      gemini: 'gemini-2.5-pro',
      perplexity: 'sonar-reasoning-pro',
    };
    if (models[2] === 'models')
      return wrap([
        {
          model_name: modelNames[models[1]],
          name: modelNames[models[1]],
          description: 'Fictional response fixture; no model call',
        },
      ]);
    return wrap([
      {
        model_name: string(b.model_name, modelNames[models[1]]),
        web_search: true,
        fan_out_queries: [
          `${fixtureProduct(c).name} workflow templates`,
          `${fixtureProduct(c).name} reporting dashboard`,
        ],
        items: empty(c)
          ? []
          : [
              {
                type: 'message',
                sections: [
                  {
                    type: 'text',
                    text:
                      `${string(b.user_prompt)}\n\n` +
                      projectText(
                        c,
                        'NocoBloom is the configured project in this synthetic test response, not a factual product description. Its sample onboarding templates, reviewed workflows and reporting blocks demonstrate the application. Compare the fictional FlowGrove and StackMeadow examples.',
                      ),
                    annotations: [
                      {
                        type: 'url_citation',
                        url: fixtureProduct(c).origin + '/docs/getting-started',
                        title: projectText(c, 'NocoBloom getting started'),
                      },
                      {
                        type: 'url_citation',
                        url: 'https://flowgrove.example/docs/workflows',
                        title: 'FlowGrove workflow guide',
                      },
                    ],
                  },
                ],
              },
            ],
      },
    ]);
  }
  if (operation === 'on_page/lighthouse/live/json') {
    const audits: ObjectValue = {};
    for (const [key, value, score] of [
      ['largest-contentful-paint', '2.8 s', 0.65],
      ['cumulative-layout-shift', '0.04', 0.96],
      ['total-blocking-time', '180 ms', 0.83],
      ['first-contentful-paint', '1.4 s', 0.89],
      ['speed-index', '2.9 s', 0.79],
      ['interactive', '3.2 s', 0.78],
      ['server-response-time', '420 ms', 0.88],
    ] as const)
      audits[key] = {
        id: key,
        title: key,
        displayValue: value,
        score,
        scoreDisplayMode: 'numeric',
      };
    audits['render-blocking-resources'] = {
      id: 'render-blocking-resources',
      title: 'Eliminate render-blocking styles',
      description: 'Load the fictional reporting styles only where needed.',
      displayValue: 'Estimated savings of 1,200 ms',
      score: 0.3,
      scoreDisplayMode: 'opportunity',
      details: { overallSavingsMs: 1200, overallSavingsBytes: 34000 },
    };
    audits['image-alt'] = {
      id: 'image-alt',
      title: 'Add alternative text to the template preview',
      description:
        'An informative preview needs a descriptive text alternative.',
      score: 0,
      scoreDisplayMode: 'binary',
    };
    const categories = Object.fromEntries(
      ['performance', 'accessibility', 'best-practices', 'seo'].map((k, i) => [
        k,
        {
          id: k,
          title: k,
          score: empty(c) ? null : [0.74, 0.91, 0.96, 0.88][i],
          auditRefs: [
            {
              id: i === 1 ? 'image-alt' : 'render-blocking-resources',
              weight: 1,
            },
          ],
        },
      ]),
    );
    return wrap([
      {
        requestedUrl: string(b.url, fixtureProduct(c).origin),
        finalUrl: string(b.url, fixtureProduct(c).origin),
        fetchTime: at(c),
        lighthouseVersion: '12.0.0-mock',
        categories,
        audits,
      },
    ]);
  }
  if (operation === 'keywords_data/google_trends/explore/live') {
    const words = names(b.keywords).slice(0, 5),
      weekly = Array.from({ length: empty(c) ? 0 : 52 }, (_, i) => ({
        date_from: day(utcDay(c) - (52 - i) * 7 * DAY),
        date_to: day(utcDay(c) - (51 - i) * 7 * DAY - DAY),
        timestamp: (utcDay(c) - (52 - i) * 7 * DAY) / 1000,
        missing_data: false,
        is_partial: false,
        values: words.map((w, j) =>
          Math.min(100, 25 + fixtureNumber(c, `${w}:${i}`, 45) + i / 3 + j * 2),
        ),
      }));
    const all = [
      {
        type: 'google_trends_graph',
        keywords: words,
        data: weekly,
        averages: words.map((_, i) =>
          Math.round(
            weekly.reduce((sum, p) => sum + p.values[i], 0) /
              Math.max(1, weekly.length),
          ),
        ),
      },
      {
        type: 'google_trends_map',
        keywords: words,
        data: empty(c)
          ? []
          : [
              {
                geo_id: 'US',
                geo_name: 'United States',
                values: words.map((_, i) => 70 - i * 8),
              },
              {
                geo_id: 'CA',
                geo_name: 'Canada',
                values: words.map((_, i) => 60 + i * 4),
              },
            ],
      },
      {
        type: 'google_trends_queries_list',
        keywords: words,
        data: {
          top: empty(c)
            ? []
            : keywords
                .slice(0, 5)
                .map((query, i) => ({ query, value: 100 - i * 13 })),
          rising: empty(c)
            ? []
            : keywords
                .slice(5, added(c) ? 11 : 8)
                .map((query, i) => ({ query, value: 80 + i * 40 })),
        },
      },
    ];
    const requested = names(b.item_types);
    return wrap([
      {
        datetime: at(c),
        keywords: words,
        check_url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(words.join(','))}`,
        items: all.filter(
          (i) => !requested.length || requested.includes(i.type),
        ),
      },
    ]);
  }
  if (operation === 'keywords_data/google_ads/keywords_for_keywords/live')
    return wrap(
      keywordRows(
        c,
        names(b.keywords).length
          ? names(b.keywords).flatMap((w) => [
              w,
              `${w} templates`,
              `${w} reporting`,
            ])
          : keywords,
      ).map((k) => ({
        keyword: k.keyword,
        ...object(k.keyword_info),
        competition: 'LOW',
        competition_index: 22,
        low_top_of_page_bid: 1.1,
        high_top_of_page_bid: 3.7,
        keyword_annotations: { concepts: [] },
      })),
    );
  if (operation.startsWith('ai_optimization/llm_mentions/')) {
    const platform = string(b.platform, 'chat_gpt');
    if (operation === 'ai_optimization/llm_mentions/aggregated_metrics/live')
      return wrap([
        {
          total: {
            platform: [
              {
                key: platform,
                mentions: empty(c) ? 0 : 34 + (added(c) ? 9 : 0),
                ai_search_volume: empty(c) ? 0 : 780,
              },
            ],
          },
        },
      ]);
    if (
      operation === 'ai_optimization/llm_mentions/cross_aggregated_metrics/live'
    )
      return result(
        list(b.targets).map((v, i) => ({
          key: string(object(v).aggregation_key),
          platform: [
            {
              key: platform,
              mentions: empty(c) ? 0 : 34 - i * 7 + (added(c) ? 5 : 0),
            },
          ],
        })),
      );
    if (operation === 'ai_optimization/llm_mentions/search/live') {
      const targets = list(b.target).map(object),
        isGap = targets.some((t) => t.search_filter === 'exclude'),
        term = string(
          targets.find((t) => t.search_filter !== 'exclude')?.keyword,
          isGap ? 'FlowGrove' : fixtureProduct(c).name,
        );
      const brand = term,
        origin = isGap ? 'https://flowgrove.example' : fixtureProduct(c).origin;
      return result(
        Array.from({ length: size(c, 8) }, (_, i) => ({
          id: `mock-question-${identity(c, `question:${i}`)}`,
          question: `How can ${term} help with ${['team onboarding', 'reviewed workflows', 'reporting dashboards', 'template permissions'][i % 4]}?`,
          answer: `${brand} provides fictional templates for ${keywords[i % keywords.length]}. Start with a reviewed setup guide, connect the data source, and verify the reporting window before publishing.`,
          ai_search_volume: 140 - (i % 8) * 11,
          last_response_at: at(c, 1 + (i % 14)),
          sources: [
            {
              url:
                origin + '/docs/' + (i % 2 ? 'workflows' : 'getting-started'),
              title: `${brand} documentation`,
              domain: new URL(origin).hostname,
            },
          ],
          brand_entities: [{ title: brand }],
        })),
      );
    }
    return undefined;
  }
  if (/^serp\/google\/organic\/live\/(advanced|regular)$/.test(operation)) {
    const reddit = string(b.keyword).includes('site:reddit.com');
    const rows = Array.from(
      {
        length: Math.min(size(c, 8), integer(b.depth, 100), reddit ? 250 : 24),
      },
      (_, i) => ({
        type: 'organic',
        rank_group: i + 1,
        rank_absolute: i + 1,
        domain: reddit
          ? 'www.reddit.com'
          : i % 3 === 0
            ? fixtureProduct(c).domain
            : i % 3 === 1
              ? 'flowgrove.example'
              : 'stackmeadow.example',
        url: reddit
          ? `https://www.reddit.com/r/${c.project ? fixtureSlug(c) : 'NocoBloom'}/comments/nb${identity(c, `reddit:${i}`).toString(36)}/workflow_templates/`
          : `https://${i % 3 === 0 ? fixtureProduct(c).domain : i % 3 === 1 ? 'flowgrove.example' : 'stackmeadow.example'}${PAGE_DEFINITIONS[i % 8][0]}`,
        title: reddit
          ? `${fixtureProduct(c).name} ${keywords[i % keywords.length]} discussion : r/${c.project ? fixtureSlug(c) : 'NocoBloom'}`
          : projectText(c, PAGE_DEFINITIONS[i % 8][1]),
        description: projectText(
          c,
          'A fictional team shares its NocoBloom onboarding, workflow, and reporting experience.',
        ),
        timestamp: at(c, 1 + (i % 28))
          .replace('T', ' ')
          .replace('.000Z', ' +00:00'),
        etv: 120 - (i % 8) * 9,
      }),
    );
    return result(rows, {
      keyword: string(b.keyword),
      se_results_count: rows.length,
      check_url: `https://www.google.com/search?q=${encodeURIComponent(string(b.keyword))}`,
    });
  }
  const lab = operation.match(
    /^dataforseo_labs\/google\/(related_keywords|keyword_suggestions|keyword_ideas|keyword_overview|domain_rank_overview|historical_rank_overview|ranked_keywords|relevant_pages|domain_intersection)\/live$/,
  );
  if (lab) {
    const op = lab[1],
      target = seoTarget(b, c),
      count = size(c, 8);
    const organic = (i: number) => ({
      etv: 1400 + i * 75 + fixtureNumber(c, target, 250),
      count: 160 + i * 9,
      pos_1: 9 + i,
      pos_2_3: 16 + i,
      pos_4_10: 32 + i,
    });
    if (op === 'domain_rank_overview')
      return result(
        empty(c) ? [] : [{ target, metrics: { organic: organic(8) } }],
      );
    if (op === 'historical_rank_overview')
      return result(
        Array.from({ length: empty(c) ? 0 : 13 }, (_, i) => {
          const d = new Date(utcDay(c));
          d.setUTCMonth(d.getUTCMonth() - 12 + i, 1);
          return {
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1,
            metrics: { organic: organic(i) },
          };
        }),
      );
    if (op === 'relevant_pages')
      return result(
        Array.from({ length: Math.min(count, pages(c).length) }, (_, i) => ({
          page_address: `https://${target}${PAGE_DEFINITIONS[i][0]}`,
          metrics: { organic: organic(i) },
          backlinks: 14 + i,
          referring_domains: 5 + i,
        })),
      );
    let words = names(b.keywords);
    if (!words.length)
      words =
        op === 'keyword_overview'
          ? [string(b.keyword, 'no code internal tools')]
          : Array.from({ length: count }, (_, i) =>
              c.project && string(b.keyword)
                ? `${string(b.keyword)} ${keywords[i % keywords.length]}${i >= keywords.length ? ` ${i + 1}` : ''}`
                : i < keywords.length
                  ? keywords[i]
                  : `${keywords[i % keywords.length]} ${i + 1}`,
            );
    const rows = keywordRows(c, words);
    if (
      ['keyword_overview', 'keyword_suggestions', 'keyword_ideas'].includes(op)
    )
      return result(rows);
    if (op === 'related_keywords')
      return result(
        rows.map((keyword_data, i) => ({ keyword_data, depth: (i % 3) + 1 })),
      );
    return result(
      rows.map((keyword_data, i) => {
        const serp = {
          type: 'organic',
          url: `https://${target}${PAGE_DEFINITIONS[i % 8][0]}`,
          domain: target,
          title: projectText(c, PAGE_DEFINITIONS[i % 8][1]),
          rank_group: 3 + (i % 14),
          rank_absolute: 3 + (i % 14),
          etv: 270 - (i % 8) * 22,
        };
        return {
          keyword_data,
          ranked_serp_element: { serp_item: serp },
          first_domain_serp_element: serp,
          second_domain_serp_element: null,
        };
      }),
      op === 'ranked_keywords'
        ? {
            metrics: {
              organic: empty(c)
                ? { etv: 0, count: 0, pos_1: 0, pos_2_3: 0, pos_4_10: 0 }
                : organic(8),
            },
          }
        : {},
    );
  }
  const backlink = operation.match(
    /^backlinks\/(summary|backlinks|referring_domains|domain_pages_summary|domain_intersection|history)\/live$/,
  );
  if (backlink) {
    const op = backlink[1],
      target = seoTarget(b, c),
      count = size(c, 8);
    if (op === 'summary')
      return wrap([
        {
          target,
          backlinks: empty(c) ? 0 : 384,
          referring_domains: empty(c) ? 0 : 63,
          referring_main_domains: empty(c) ? 0 : 57,
          rank: empty(c) ? 0 : 42,
          backlinks_spam_score: 4,
          first_seen: at(c, 300),
          last_updated_time: at(c),
          broken_backlinks: 3,
          broken_pages: 1,
        },
      ]);
    return result(
      Array.from({ length: count }, (_, i) => ({
        date: day(utcDay(c) - (count - i) * 7 * DAY),
        domain: `journal-${i + 1}.example`,
        domain_from: `journal-${i + 1}.example`,
        url_from: `https://journal-${i + 1}.example/${fixtureSlug(c)}-workspaces`,
        url_to: `https://${target}${PAGE_DEFINITIONS[i % 8][0]}`,
        page_address: `https://${target}${PAGE_DEFINITIONS[i % 8][0]}`,
        title: projectText(c, 'A fictional NocoBloom workspace review'),
        anchor:
          i % 2
            ? projectText(c, 'NocoBloom workflow guide')
            : 'no code workspace',
        dofollow: i % 3 !== 0,
        is_lost: false,
        backlinks: 18 + i,
        referring_domains: 4 + i,
        rank: 24 + (i % 20),
        backlink_spam_score: 3,
        first_seen: at(c, 90 + i),
        last_seen: at(c, 1),
        new_backlinks: 4 + (i % 4),
        lost_backlinks: i % 2,
        domain_intersection: {
          '1': {
            domain: `journal-${i + 1}.example`,
            backlinks: 18 + i,
            referring_domains: 4 + i,
            rank: 24 + (i % 20),
          },
        },
      })),
    );
  }
  return undefined;
}

const repositories = [
  FIXTURE_PRODUCT.repository,
  'flowgrove/flowgrove',
  'stackmeadow/stackmeadow',
];
function repoName(
  u: URL,
  b: ObjectValue = {},
  fallback: string = FIXTURE_PRODUCT.repository,
): string {
  const matched = u.pathname.match(/^\/repos\/([^/]+\/[^/]+)/)?.[1];
  const q = u.searchParams.get('q')?.match(/repo:([^ ]+)/)?.[1];
  const vars = object(b.variables);
  return (
    matched ||
    q ||
    (vars.owner && vars.name
      ? `${string(vars.owner)}/${string(vars.name)}`
      : fallback)
  );
}
function issues(c: FixtureContext, repo: string): ObjectValue[] {
  return Array.from({ length: size(c, 8) }, (_, i) => ({
    id: identity(c, `issue:${repo}:${i}`),
    number: i + 1,
    title: `${['Clarify onboarding roles', 'Document Slack workflow permissions', 'Improve reporting date labels', 'Add a customer success template'][i % 4]}${i > 3 ? ` (${i + 1})` : ''}`,
    body: `Synthetic issue for ${repo}, with reproduction steps, current behavior and expected results.`,
    state: i % 3 ? 'open' : 'closed',
    html_url: `https://github.com/${repo}/issues/${i + 1}`,
    user: { login: MOCK_AUTHORS[(i + 1) % 5] },
    author_association: (i + 1) % 5 < 2 ? 'MEMBER' : 'CONTRIBUTOR',
    created_at: at(c, 2 + (i % 70)),
    updated_at: at(c, 1 + (i % 7)),
    closed_at: i % 3 ? null : at(c, 1 + (i % 7)),
    comments: 3 + (i % 9),
    reactions: { total_count: 2 + (i % 6) },
    labels: [
      {
        name: i % 2 ? 'documentation' : 'enhancement',
        color: i % 2 ? '2868bd' : '75ba7f',
      },
    ],
  }));
}
// Pull requests and commits for the repository history on the GitHub page (2026-10-14): a few team members and outside
// contributors, one bot, spread over the last four months.
const MOCK_TEAM = ['nocobloom-maintainer', 'nocobloom-designer'];
const MOCK_AUTHORS = [
  ...MOCK_TEAM,
  'community-writer',
  'workflow-fan',
  'report-builder',
  'dependabot[bot]',
];
function pulls(c: FixtureContext, repo: string): ObjectValue[] {
  return Array.from({ length: size(c, 12) }, (_, i) => {
    const opened = 3 + ((i * 9) % 118);
    const merged = i % 4 !== 3;
    const closedAgo = i % 5 === 4 ? null : Math.max(0, opened - 1 - (i % 3));
    const author = MOCK_AUTHORS[i % MOCK_AUTHORS.length];
    return {
      id: identity(c, `pull:${repo}:${i}`),
      number: 1000 + i,
      title: `${['Add reporting block filters', 'Fix workflow permission check', 'Document onboarding roles'][i % 3]} (#${1000 + i})`,
      state: closedAgo === null ? 'open' : 'closed',
      html_url: `https://github.com/${repo}/pull/${1000 + i}`,
      user: { login: author },
      author_association: MOCK_TEAM.includes(author)
        ? 'MEMBER'
        : author.endsWith('[bot]')
          ? 'NONE'
          : 'CONTRIBUTOR',
      created_at: at(c, opened),
      updated_at: at(c, closedAgo ?? 1),
      closed_at: closedAgo === null ? null : at(c, closedAgo),
      pull_request: {
        url: `https://api.github.com/repos/${repo}/pulls/${1000 + i}`,
        merged_at: closedAgo !== null && merged ? at(c, closedAgo) : null,
      },
      labels: [],
      comments: i % 4,
    };
  });
}
function commits(c: FixtureContext, repo: string): ObjectValue[] {
  return Array.from({ length: size(c, 40) }, (_, i) => {
    const author = MOCK_AUTHORS[(i * 5) % MOCK_AUTHORS.length];
    const date = at(c, 1 + ((i * 7) % 120), i % 12);
    return {
      sha: identity(c, `commit:${repo}:${i}`).toString(16).padStart(40, '0'),
      html_url: `https://github.com/${repo}/commit/${i}`,
      author: { login: author },
      commit: {
        message: `${['Improve reporting labels', 'Tidy workflow templates', 'Update onboarding guide'][i % 3]}`,
        author: { name: author, date },
        committer: { name: author, date },
      },
    };
  });
}
const since = (u: URL, field: string) => (row: ObjectValue) =>
  !u.searchParams.get('since') ||
  String(row[field]) >= String(u.searchParams.get('since'));
function releases(c: FixtureContext, repo: string): ObjectValue[] {
  return Array.from({ length: empty(c) ? 0 : added(c) ? 4 : 3 }, (_, i) => ({
    id: identity(c, `release:${repo}:${i}`),
    tag_name: `v1.${3 - i}.0`,
    name: `${repo.split('/')[1]} ${1}.${3 - i}: ${['Reporting blocks', 'Workflow templates', 'Workspace onboarding', 'Data preview'][i]}`,
    body: 'Fictional release: clearer reporting, reviewed workflow templates, and improved onboarding documentation.',
    html_url: `https://github.com/${repo}/releases/tag/v1.${3 - i}.0`,
    published_at: at(c, 2 + i * 14),
    created_at: at(c, 3 + i * 14),
    updated_at: at(c, 2 + i * 14),
    draft: false,
    prerelease: false,
  }));
}
function repositoryFile(c: FixtureContext, filename: string): string {
  const text =
    filename === 'SKILL.md'
      ? '---\nname: nocobloom-workspace\ndescription: Build a fictional NocoBloom workspace.\n---\nUse reviewed onboarding, workflow and reporting templates.'
      : '# NocoBloom\n\nA fictional workspace builder for onboarding templates, reviewed workflows, and reporting dashboards.';
  return projectText(c, text).replaceAll(
    'nocobloom-workspace',
    `${fixtureSlug(c)}-workspace`,
  );
}
// GitHub 热点 (2026-10-14): repository search by topic and creation date, stars that grow a little each fictional day
// (so the 涨星榜 has gains), and github.com/trending in GitHub's markup, with a competitor among the entries.
const repoStars = (c: FixtureContext, repo: string): number =>
  1000 +
  fixtureNumber(c, `stars:${repo}`, 40_000) +
  Math.max(0, Math.floor((time(c) - Date.parse('2026-01-01')) / DAY)) *
    (1 + fixtureNumber(c, `pace:${repo}`, 12));
function searchRepositories(u: URL, c: FixtureContext): Response {
  const q = u.searchParams.get('q') ?? '';
  const topic = q.match(/topic:([a-z0-9-]+)/)?.[1] ?? null;
  const created = q.match(/created:(\S+)/)?.[1] ?? null;
  const per = Math.min(100, integer(u.searchParams.get('per_page'), 30));
  const total = empty(c)
    ? 0
    : created
      ? 12 + fixtureNumber(c, `created:${topic}:${created}`, 180)
      : 900 + fixtureNumber(c, `topic:${topic}`, 60_000);
  const owner = topic ?? 'fresh';
  const items = Array.from({ length: Math.min(per, total) }, (_, i) => {
    const repo = `${owner}-labs/${owner}-${created ? 'starter' : 'kit'}-${i + 1}`;
    return {
      full_name: repo,
      html_url: `https://github.com/${repo}`,
      description: `Fictional ${owner} repository for NocoReach demonstrations.`,
      language: ['TypeScript', 'Python', 'Go', 'Rust'][i % 4],
      topics: topic ? [topic, 'open-source'] : ['open-source'],
      stargazers_count: repoStars(c, repo),
      created_at: at(c, created ? 1 + (i % 6) : 300 + i * 20),
    };
  }).sort((a, b) => b.stargazers_count - a.stargazers_count);
  return json({ total_count: total, incomplete_results: false, items });
}
function githubTrending(u: URL, c: FixtureContext): Response | undefined {
  if (u.hostname !== 'github.com' || u.pathname !== '/trending')
    return undefined;
  const since = u.searchParams.get('since') ?? 'daily';
  const word =
    since === 'weekly'
      ? 'this week'
      : since === 'monthly'
        ? 'this month'
        : 'today';
  const rows = (
    empty(c)
      ? []
      : Array.from({ length: 8 }, (_, i) =>
          i === 1 ? 'flowgrove/flowgrove' : `trend-${since}/project-${i + 1}`,
        )
  ).map((repo, i) => {
    const [owner, name] = repo.split('/');
    return `<article class="Box-row"><h2 class="h3 lh-condensed"><a href="/${repo}" class="Link"><svg aria-hidden="true"></svg><span class="text-normal">${owner} /</span> ${name}</a></h2><p class="col-9 color-fg-muted my-1">Fictional trending project &amp; demo ${i + 1}.</p><div class="f6 color-fg-muted mt-2"><span itemprop="programmingLanguage">${['TypeScript', 'Python', 'Rust'][i % 3]}</span><a href="/${repo}/stargazers" class="Link"><svg aria-label="star"></svg> ${repoStars(c, repo).toLocaleString('en-US')}</a><a href="/${repo}/forks" class="Link"><svg aria-label="fork"></svg> ${(40 + i * 7).toLocaleString('en-US')}</a><span class="d-inline-block float-sm-right"><svg aria-hidden="true"></svg> ${(300 - i * 30).toLocaleString('en-US')} stars ${word}</span></div></article>`;
  });
  return textResponse(
    `<!doctype html><html><body><main>${rows.join('')}</main></body></html>`,
    'text/html; charset=utf-8',
  );
}
function github(
  u: URL,
  init: RequestInit,
  c: FixtureContext,
): Response | undefined {
  if (u.hostname !== 'api.github.com') return undefined;
  const b = body(init),
    repo = repoName(u, b, fixtureProduct(c).repository),
    p = u.pathname;
  // Organization/search and batched star-count requests do not address the
  // project's inferred repository: a valid site label may exceed GitHub's owner limit.
  const repositoryIndependent =
    p === '/search/repositories' ||
    /^\/orgs\/[^/]+\/public_members$/.test(p) ||
    (p === '/graphql' && string(b.query).includes('stargazerCount'));
  if (
    !repositoryIndependent &&
    !repositories.includes(repo) &&
    !(
      c.project &&
      /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i.test(repo) &&
      !['.', '..'].includes(repo.split('/')[1])
    )
  )
    throw new MockUnsupportedOperationError(
      'invalid repository or repository outside the legacy fixture catalog',
    );
  if (p === '/graphql') {
    const query = string(b.query),
      vars = object(b.variables);
    if (/\bmutation\b/.test(query))
      throw new MockUnsupportedOperationError('GitHub GraphQL mutation');
    if (query.includes('stargazerCount'))
      return json({
        data: Object.fromEntries(
          [
            ...query.matchAll(
              /(r\d+):repository\(owner:"([^"]+)",name:"([^"]+)"\)/g,
            ),
          ].map(([, alias, owner, name]) => [
            alias,
            {
              nameWithOwner: `${owner}/${name}`,
              stargazerCount: repoStars(c, `${owner}/${name}`),
            },
          ]),
        ),
      });
    if (query.includes('discussions')) {
      const rows = issues(c, repo).map((r, i) => ({
        id: `D_mock_${integer(r.id)}`,
        number: r.number,
        title: r.title,
        url: `https://github.com/${repo}/discussions/${integer(r.number)}`,
        body: r.body,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        upvoteCount: 4 + (i % 6),
        isAnswered: i % 3 === 0,
        comments: { totalCount: i % 3 === 0 ? 3 : 0 },
        category: { name: i % 2 ? 'Ideas' : 'Q&A', isAnswerable: i % 2 === 0 },
      }));
      const paged = cursorPage(rows, vars.after, 100);
      return json({
        data: {
          repository: {
            hasDiscussionsEnabled: true,
            discussions: {
              totalCount: rows.length,
              nodes: paged.items,
              pageInfo: {
                hasNextPage: Boolean(paged.next),
                endCursor: paged.next || null,
              },
            },
          },
        },
      });
    }
    const kind = query.includes('stargazers')
      ? 'stargazers'
      : query.includes('forks')
        ? 'forks'
        : null;
    if (kind) {
      const rows = Array.from({ length: size(c, 12) }, (_, i) => ({
        starredAt: at(c, c.project ? 1 + (i % 90) : 80 - (i % 70)),
        createdAt: at(c, c.project ? 1 + (i % 90) : 80 - (i % 70)),
      }));
      const paged = cursorPage(rows, vars.after, 100);
      return json({
        data: {
          repository: {
            [kind]: {
              totalCount: rows.length,
              [kind === 'stargazers' ? 'edges' : 'nodes']: paged.items,
              pageInfo: {
                hasNextPage: Boolean(paged.next),
                endCursor: paged.next || null,
              },
            },
          },
        },
      });
    }
    throw new MockUnsupportedOperationError('GitHub GraphQL selection');
  }
  if (p === '/search/repositories') return searchRepositories(u, c);
  if (/^\/orgs\/[^/]+\/public_members$/.test(p))
    return json(
      restPage(
        MOCK_TEAM.map((login) => ({ login })),
        u,
      ),
    );
  if (p === `/repos/${repo}`)
    return json({
      id: identity(c, `repo:${repo}`),
      name: repo.split('/')[1],
      full_name: repo,
      private: false,
      html_url: `https://github.com/${repo}`,
      description: `Synthetic test repository ${repo}; these metrics do not describe the real repository.`,
      homepage:
        repo === fixtureProduct(c).repository
          ? fixtureProduct(c).origin
          : `https://${repo.split('/')[0]}.example`,
      stargazers_count: empty(c)
        ? 0
        : 1240 + fixtureNumber(c, repo, 200) + (added(c) ? 28 : 0),
      forks_count: empty(c) ? 0 : 143 + (added(c) ? 4 : 0),
      subscribers_count: 87,
      open_issues_count: issues(c, repo).filter((i) => i.state === 'open')
        .length,
      has_discussions: true,
      default_branch: 'main',
      language: 'TypeScript',
      topics: ['low-code', 'no-code', 'workflow', 'reporting'],
      license: { spdx_id: 'MIT' },
      updated_at: at(c, 1),
      pushed_at: at(c, 1),
      created_at: at(c, 400),
    });
  if (p === '/search/issues')
    return json({
      total_count: issues(c, repo).length,
      incomplete_results: false,
      items: restPage(issues(c, repo), u, 50),
    });
  const suffix = p.replace(`/repos/${repo}`, '');
  if (suffix === '/issues')
    return json(
      restPage(
        [
          ...issues(c, repo),
          ...(u.searchParams.get('state') === 'all' ? pulls(c, repo) : []),
        ]
          .filter((i) =>
            u.searchParams.get('state') === 'open' ? i.state === 'open' : true,
          )
          .filter(since(u, 'updated_at')),
        u,
      ),
    );
  if (suffix === '/commits')
    return json(
      restPage(
        commits(c, repo).filter((x) =>
          since(u, 'date')(object(object(x.commit).author)),
        ),
        u,
      ),
    );
  if (suffix === '/languages')
    return json(
      empty(c) ? {} : { TypeScript: 812_345, JavaScript: 42_118, CSS: 12_904 },
    );
  if (suffix === '/contributors')
    return json(
      restPage(
        MOCK_AUTHORS.filter(() => !empty(c)).map((login, i) => ({
          login,
          contributions: 120 - i * 17,
          html_url: `https://github.com/${login.replace('[bot]', '')}`,
        })),
        u,
      ),
    );
  const issue = suffix.match(/^\/issues\/(\d+)$/);
  if (issue)
    return json(
      issues(c, repo).find((i) => i.number === Number(issue[1])) ?? {
        message: 'Not Found',
      },
      issues(c, repo).some((i) => i.number === Number(issue[1])) ? 200 : 404,
    );
  if (suffix === '/releases') return json(restPage(releases(c, repo), u, 30));
  if (suffix === '/releases/latest')
    return releases(c, repo)[0]
      ? json(releases(c, repo)[0])
      : notFound('release');
  const release = suffix.match(/^\/releases\/(?:tags\/)?([^/]+)$/);
  if (release) {
    const row = releases(c, repo).find(
      (r) => String(r.id) === release[1] || r.tag_name === release[1],
    );
    return row ? json(row) : notFound('release');
  }
  if (suffix === '/traffic/views' || suffix === '/traffic/clones') {
    const field = suffix.endsWith('views') ? 'views' : 'clones';
    const rows = dates(c, undefined, undefined, 14)
      .filter(() => !empty(c))
      .map((d, i) => ({
        timestamp: d + 'T00:00:00Z',
        count: 40 + fixtureNumber(c, `${field}:${d}`, 80) + i,
        uniques: 20 + fixtureNumber(c, `${field}:${d}`, 20),
      }));
    return json({
      count: rows.reduce((s, r) => s + r.count, 0),
      uniques: rows.reduce((s, r) => s + r.uniques, 0),
      [field]: rows,
    });
  }
  if (suffix === '/traffic/popular/referrers')
    return json(
      empty(c)
        ? []
        : [
            { referrer: 'Google', count: 132, uniques: 85 },
            {
              referrer: new URL(fixtureProduct(c).community).hostname,
              count: 61,
              uniques: 43,
            },
          ],
    );
  if (suffix === '/traffic/popular/paths')
    return json(
      empty(c)
        ? []
        : [
            ['', repo],
            ['/blob/main/README.md', 'README.md'],
            ['/blob/main/SKILL.md', 'SKILL.md'],
            ['/issues', 'Issues'],
          ].map(([path, title], i) => ({
            path: `/${repo}${path}`,
            title,
            count: 180 - i * 25,
            uniques: 60 - i * 8,
          })),
    );
  if (suffix === '/stargazers/history')
    return json(
      restPage(
        Array.from(
          { length: empty(c) ? 0 : c.scenario === 'pagination' ? 32 : 12 },
          (_, i) => {
            const start = utcDay(c) - (c.project ? i : 12 + i) * 7 * DAY;
            return {
              week: (start - new Date(start).getUTCDay() * DAY) / 1000,
              days: Array.from(
                { length: 7 },
                (_, j) => 2 + fixtureNumber(c, `stars:${i}:${j}`, 8),
              ),
            };
          },
        ),
        u,
        30,
      ),
    );
  if (suffix === '/stargazers' || suffix === '/forks')
    return json(
      restPage(
        Array.from({ length: size(c, 12) }, (_, i) => ({
          id: identity(c, `fork:${i}`),
          starred_at: at(c, c.project ? 1 + (i % 90) : 80 - (i % 70)),
          created_at: at(c, c.project ? 1 + (i % 90) : 80 - (i % 70)),
          html_url: `https://github.com/${fixtureSlug(c)}-demo-${i + 1}/${repo.split('/')[1]}`,
          user: { login: `${fixtureSlug(c)}-demo-${i + 1}` },
        })),
        u,
      ),
    );
  if (suffix === '/git/trees/main') {
    return json({
      sha: fixtureHash(c, 'repository-tree'),
      url: `https://api.github.com/repos/${repo}/git/trees/main`,
      truncated: false,
      tree: ['README.md', 'SKILL.md'].map((path) => ({
        path,
        mode: '100644',
        type: 'blob',
        sha: fixtureHash(c, path),
        size: 160,
      })),
    });
  }
  if (suffix.startsWith('/contents')) {
    const requested = decodeURIComponent(suffix.replace(/^\/contents\/?/, ''));
    if (!requested)
      return json([
        {
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          download_url: `https://raw.githubusercontent.com/${repo}/main/README.md`,
        },
        {
          name: 'SKILL.md',
          path: 'SKILL.md',
          type: 'file',
          download_url: `https://raw.githubusercontent.com/${repo}/main/SKILL.md`,
        },
      ]);
    if (['README.md', 'SKILL.md'].includes(requested)) {
      const content = repositoryFile(c, requested);
      return json({
        name: requested,
        path: requested,
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(content).toString('base64'),
        sha: fixtureHash(c, requested),
        size: Buffer.byteLength(content),
        html_url: `https://github.com/${repo}/blob/main/${requested}`,
        download_url: `https://raw.githubusercontent.com/${repo}/main/${requested}`,
      });
    }
    return notFound('repository file');
  }
  return undefined;
}

const snowflake = (
  c: FixtureContext,
  key: string,
  days = 1,
  hours = 0,
): string =>
  String(
    ((BigInt(time(c) - days * DAY - hours * 3_600_000) - 1420070400000n) <<
      22n) |
      BigInt(identity(c, key)),
  );
export function fixtureCatalog(c: FixtureContext): ObjectValue {
  return {
    ...fixtureProduct(c),
    ga4PropertyId: String(100_000_000 + identity(c, 'ga4')),
    gscSiteUrl: `sc-domain:${fixtureProduct(c).domain}`,
    googleEmail: `demo@${fixtureProduct(c).domain}`,
    slackChannels: slackChannels(c),
    discordGuildId: String(100000000000000000n + BigInt(identity(c, 'guild'))),
    discordChannels: discordChannels(c),
    communityTopicIds: topics(
      communityContext(c, fixtureProduct(c).community),
    ).map((t) => t.id),
  };
}
function xPosts(c: FixtureContext): ObjectValue[] {
  return Array.from({ length: size(c, 8) }, (_, i) => ({
    id: snowflake(c, `x:${i}`, 1, Math.floor(i / 2)),
    text: `${fixtureProduct(c).name} ${['onboarding template helped our team get started.', 'workflow checklist connects Slack and GitHub clearly.', 'reporting dashboard makes weekly reviews easier.', 'could use more examples for team permissions.'][i % 4]}`,
    created_at: at(c, 1, Math.floor(i / 2)),
    lang: 'en',
    public_metrics: {
      like_count: 12 + (i % 10),
      retweet_count: 3 + (i % 4),
      reply_count: i % 3,
      quote_count: 1,
      impression_count: 120 + i * 12,
    },
  })).sort((a, b) => (BigInt(String(a.id)) > BigInt(String(b.id)) ? -1 : 1));
}
function xApi(u: URL, c: FixtureContext): Response | undefined {
  if (!['api.x.com', 'api.twitter.com'].includes(u.hostname)) return undefined;
  if (u.pathname === '/2/tweets/counts/recent') {
    const data = dates(c, undefined, undefined, 7).map((d) => ({
      start: d + 'T00:00:00Z',
      end: iso(Date.parse(d) + DAY),
      tweet_count: empty(c) ? 0 : 2 + fixtureNumber(c, d, 15),
    }));
    return json({
      data,
      meta: {
        total_tweet_count: data.reduce((sum, d) => sum + d.tweet_count, 0),
      },
    });
  }
  if (u.pathname === '/2/tweets/search/recent') {
    const rows = xPosts(c).filter(
      (p) =>
        (!u.searchParams.get('since_id') ||
          BigInt(String(p.id)) > BigInt(u.searchParams.get('since_id')!)) &&
        (!u.searchParams.get('start_time') ||
          String(p.created_at) >= u.searchParams.get('start_time')!),
    );
    const part = cursorPage(
      rows,
      u.searchParams.get('next_token'),
      u.searchParams.get('max_results') ?? 100,
    );
    return json({
      data: part.items,
      meta: {
        result_count: part.items.length,
        ...(part.items.length
          ? { newest_id: part.items[0].id, oldest_id: part.items.at(-1)?.id }
          : {}),
        ...(part.next ? { next_token: part.next } : {}),
      },
    });
  }
  const detail = u.pathname.match(/^\/2\/tweets\/(\d+)$/);
  if (detail) {
    const row = xPosts(c).find((p) => p.id === detail[1]);
    return row ? json({ data: row }) : notFound('post');
  }
  return undefined;
}
function slackChannels(c: FixtureContext): ObjectValue[] {
  return ['help', 'templates'].map((name, i) => ({
    id: `C${fixtureHash(c, `slack-channel:${i}`).slice(0, 10).toUpperCase()}`,
    name: `${fixtureSlug(c)}-${name}`,
    is_channel: true,
    is_member: true,
    is_archived: false,
    num_members: 32 + i * 12,
  }));
}
function slackMessages(c: FixtureContext, channel: string): ObjectValue[] {
  return Array.from({ length: size(c, 8) }, (_, i) => ({
    type: 'message',
    ts: `${Math.floor((time(c) - (1 + (i % 12)) * DAY) / 1000)}.${String(identity(c, `${channel}:${i}`)).padStart(6, '0')}`,
    text: [
      projectText(c, 'How do I assign onboarding roles in NocoBloom?'),
      'The workflow checklist solved our Slack and GitHub handoff.',
      'Can reporting blocks compare the previous week?',
      'The customer success template is ready for review.',
    ][i % 4],
    reply_count: i % 3 === 0 ? 2 : 0,
  })).sort((a, b) => Number(b.ts) - Number(a.ts));
}
function slack(u: URL, c: FixtureContext): Response | undefined {
  if (u.hostname !== 'slack.com') return undefined;
  const method = u.pathname.replace(/^\/api\//, ''),
    channel = u.searchParams.get('channel') || String(slackChannels(c)[0].id);
  if (method === 'auth.test')
    return json({
      ok: true,
      url: `https://${fixtureSlug(c)}-demo.slack.com/`,
      team: projectText(c, 'NocoBloom fictional workspace'),
      user: `${fixtureSlug(c)}-demo-bot`,
      team_id: `T${identity(c, 'slack-team')}`,
      user_id: `U${identity(c, 'slack-bot')}`,
      bot_id: `B${identity(c, 'slack-bot')}`,
    });
  if (method === 'api.test') return json({ ok: true, args: {}, mock: true });
  if (method === 'conversations.list') {
    const p = cursorPage(
      slackChannels(c),
      u.searchParams.get('cursor'),
      u.searchParams.get('limit') ?? 200,
    );
    return json({
      ok: true,
      channels: p.items,
      response_metadata: { next_cursor: p.next },
    });
  }
  const selected = slackChannels(c).find((x) => x.id === channel);
  if (
    [
      'conversations.join',
      'conversations.history',
      'conversations.replies',
    ].includes(method) &&
    !selected
  )
    return json({ ok: false, error: 'channel_not_found' });
  if (method === 'conversations.join')
    return json({ ok: true, channel: selected });
  if (
    method === 'conversations.history' ||
    method === 'conversations.replies'
  ) {
    let rows = slackMessages(c, channel).filter(
      (m) =>
        !u.searchParams.get('oldest') ||
        Number(m.ts) >= Number(u.searchParams.get('oldest')),
    );
    if (method === 'conversations.replies') {
      const root = rows.find((m) => m.ts === u.searchParams.get('ts'));
      rows = root
        ? [
            root,
            ...Array.from({ length: Number(root.reply_count) }, (_, i) => ({
              type: 'message',
              thread_ts: root.ts,
              ts: (Number(root.ts) + (i + 1) * 60).toFixed(6),
              text: 'The fictional setup guide covers this step. Please review the workflow permissions first.',
              reply_count: 0,
            })),
          ]
        : [];
    }
    const part = cursorPage(
      rows,
      u.searchParams.get('cursor'),
      u.searchParams.get('limit') ?? 200,
    );
    return json({
      ok: true,
      messages: part.items,
      has_more: Boolean(part.next),
      response_metadata: { next_cursor: part.next },
    });
  }
  return undefined;
}
function discordChannels(c: FixtureContext): ObjectValue[] {
  return ['help', 'templates', 'showcase'].map((name, i) => ({
    id: String(
      200000000000000000n + BigInt(identity(c, `discord-channel:${i}`)),
    ),
    name: `${fixtureSlug(c)}-${name}`,
    type: i === 2 ? 15 : 0,
    position: i,
    guild_id: String(100000000000000000n + BigInt(identity(c, 'guild'))),
  }));
}
function discordMessages(c: FixtureContext, channel: string): ObjectValue[] {
  return Array.from({ length: size(c, 8) }, (_, i) => ({
    id: snowflake(c, `${channel}:${i}`, 1 + (i % 12)),
    type: 0,
    content: [
      projectText(c, 'How do NocoBloom onboarding roles work?'),
      'The Slack and GitHub workflow guide is helpful.',
      'Can reporting blocks show a previous-period comparison?',
      'Our fictional template review is complete.',
    ][i % 4],
    timestamp: at(c, 1 + (i % 12)),
    channel_id: channel,
    ...(i % 4 === 3
      ? {
          message_reference: {
            message_id: snowflake(c, `${channel}:${i - 1}`, 1 + ((i - 1) % 12)),
          },
        }
      : {}),
  })).sort((a, b) => (BigInt(String(a.id)) < BigInt(String(b.id)) ? -1 : 1));
}
function discord(u: URL, c: FixtureContext): Response | undefined {
  if (u.hostname !== 'discord.com') return undefined;
  const p = u.pathname.replace(/^\/api\/v10/, ''),
    guild = String(100000000000000000n + BigInt(identity(c, 'guild')));
  if (p === '/users/@me')
    return json({
      id: String(300000000000000000n + BigInt(identity(c, 'discord-bot'))),
      username: `${fixtureSlug(c)}-demo`,
      bot: true,
    });
  if (p === '/users/@me/guilds')
    return json([
      {
        id: guild,
        name: projectText(c, 'NocoBloom fictional community'),
        owner: false,
        permissions: '66560',
      },
    ]);
  if (p === `/guilds/${guild}/channels`) return json(discordChannels(c));
  if (p === '/gateway')
    return json({ url: 'wss://gateway.discord.gg', mock: true });
  const channel = p.match(
    /^\/channels\/(\d+)\/(messages|threads\/archived\/public)$/,
  );
  const channelId = channel?.[1];
  if (
    channelId &&
    !discordChannels(c).some((v) => v.id === channelId) &&
    ![false, true].some((archived) =>
      Array.from({ length: archived ? 1 : 3 }, (_, i) =>
        snowflake(c, `thread:${archived}:${i}`, 3 + i),
      ).includes(channelId),
    )
  )
    return notFound('channel');
  if (channel?.[2] === 'messages') {
    let rows = discordMessages(c, channelId!);
    if (u.searchParams.get('after'))
      rows = rows.filter(
        (r) => BigInt(String(r.id)) > BigInt(u.searchParams.get('after')!),
      );
    if (u.searchParams.get('before'))
      rows = rows.filter(
        (r) => BigInt(String(r.id)) < BigInt(u.searchParams.get('before')!),
      );
    return json(page(rows, 0, u.searchParams.get('limit') ?? 100));
  }
  if (
    p === `/guilds/${guild}/threads/active` ||
    channel?.[2] === 'threads/archived/public'
  ) {
    const archived = Boolean(channel),
      parent = String(discordChannels(c)[2].id);
    return json({
      threads: Array.from(
        { length: empty(c) ? 0 : archived ? 1 : 3 },
        (_, i) => ({
          id: snowflake(c, `thread:${archived}:${i}`, 3 + i),
          parent_id: parent,
          guild_id: guild,
          name: `How do I use the ${fixtureProduct(c).name} ${['onboarding', 'workflow', 'reporting'][i % 3]} template?`,
          message_count: i % 2 ? 3 : 0,
          thread_metadata: { archived, archive_timestamp: at(c, 2 + i) },
        }),
      ),
      members: [],
      has_more: false,
    });
  }
  return undefined;
}

function topics(c: FixtureContext): ObjectValue[] {
  return Array.from({ length: size(c, 8) }, (_, i) => ({
    id: identity(c, `topic:${i}`),
    title:
      [
        'How do I assign onboarding roles?',
        'Share your Slack and GitHub workflow',
        'Comparing weekly reporting dashboards',
        'Customer success template feedback',
      ][i % 4] + (i > 3 ? ` (${i + 1})` : ''),
    slug: `${fixtureSlug(c)}-workspace-${i + 1}`,
    posts_count: i % 3 === 0 ? 3 : 1,
    reply_count: i % 3 === 0 ? 2 : 0,
    views: 40 + i * 11,
    like_count: 3 + (i % 8),
    category_id: (i % 2) + 1,
    created_at: at(c, 2 + (i % 40)),
    last_posted_at: at(c, 1 + (i % 12)),
    bumped_at: at(c, 1 + (i % 12)),
    pinned: false,
    closed: false,
    archived: false,
    visible: true,
    has_accepted_answer: i % 3 === 0,
    tags: [fixtureSlug(c), i % 2 ? 'workflow' : 'onboarding'],
  }));
}
function topicPosts(c: FixtureContext, topic: ObjectValue): ObjectValue[] {
  return Array.from({ length: Number(topic.posts_count) }, (_, i) => ({
    id: identity(c, `topic:${integer(topic.id)}:post:${i}`),
    post_number: i + 1,
    topic_id: topic.id,
    created_at: iso(Date.parse(string(topic.created_at)) + i * 3_600_000),
    updated_at: iso(Date.parse(string(topic.created_at)) + i * 3_600_000),
    raw:
      i === 0
        ? projectText(
            c,
            'How should our fictional NocoBloom team choose onboarding roles and review workflow permissions before publishing a reporting dashboard?',
          )
        : i === 1
          ? 'Start with the onboarding template, assign a reviewer, and test the Slack and GitHub workflow in a demo workspace.'
          : 'The reporting guide also explains the date window and comparison labels. That resolved the question for our demo team.',
    cooked: `<p>${i === 0 ? escapeHtml(projectText(c, 'How should we configure NocoBloom onboarding roles?')) : 'Review the fictional setup guide and permissions checklist.'} See <a href="${fixtureProduct(c).origin}/docs/${i === 2 ? 'reporting' : 'getting-started'}">${escapeHtml(fixtureProduct(c).name)} documentation</a>.</p>`,
  }));
}
function communityContext(c: FixtureContext, origin: string): FixtureContext {
  return origin === FIXTURE_PRODUCT.community
    ? { ...c, project: undefined }
    : { ...c, seed: `${c.seed}:community:${origin}` };
}
function community(u: URL, c: FixtureContext): Response | undefined {
  const configured =
    u.hostname === new URL(fixtureProduct(c).community).hostname;
  const dynamic = Boolean(
    c.project && c.connection === 'community' && publicFixtureHost(u.hostname),
  );
  if (u.hostname !== 'community.nocobloom.example' && !configured && !dynamic)
    return undefined;
  // Explicit legacy forum URLs retain their historical catalog and IDs. Other origins are isolated.
  c = communityContext(c, u.origin);
  if (u.pathname === '/about.json')
    return json({
      about: {
        title: projectText(c, 'NocoBloom fictional community'),
        description:
          'Demo discussions about onboarding, workflow templates and reporting.',
        stats: {
          topics_count: topics(c).length,
          posts_count: topics(c).reduce((n, t) => n + Number(t.posts_count), 0),
        },
        admin_names: [],
        moderator_names: [],
      },
    });
  if (u.pathname === '/site.json')
    return json({
      categories: [
        { id: 1, name: 'Getting started', slug: 'getting-started' },
        { id: 2, name: 'Workflows and reporting', slug: 'workflows' },
      ],
    });
  if (u.pathname === '/latest.json') {
    const offset = integer(u.searchParams.get('page')) * 30,
      rows = topics(c),
      items = page(rows, offset, 30);
    return json({
      users: [],
      topic_list: {
        can_create_topic: false,
        per_page: 30,
        topics: items,
        ...(offset + items.length < rows.length
          ? { more_topics_url: `/latest.json?page=${offset / 30 + 1}` }
          : {}),
      },
    });
  }
  const detail = u.pathname.match(
    /^\/t\/(?:[^/]+\/)?(\d+)(?:\.json|\/posts\.json|\/?)$/,
  );
  if (detail) {
    const t = topics(c).find((row) => row.id === Number(detail[1]));
    if (!t) return notFound('topic');
    const posts = topicPosts(c, t),
      wanted = u.searchParams.getAll('post_ids[]');
    const selected = u.pathname.endsWith('/posts.json')
      ? posts.filter((p) => !wanted.length || wanted.includes(String(p.id)))
      : c.scenario === 'pagination'
        ? posts.slice(0, 1)
        : posts;
    if (!u.pathname.endsWith('.json'))
      return textResponse(
        `<!doctype html><html><head><title>${escapeHtml(String(t.title))}</title></head><body><h1>${escapeHtml(String(t.title))}</h1>${posts.map((p) => p.cooked).join('')}</body></html>`,
        'text/html; charset=utf-8',
      );
    return json({
      ...t,
      post_stream: { stream: posts.map((p) => p.id), posts: selected },
    });
  }
  if (u.pathname === '/')
    return textResponse(
      `<!doctype html><html><head><title>${escapeHtml(fixtureProduct(c).name)} fictional community</title></head><body><h1>${escapeHtml(fixtureProduct(c).name)} community</h1><p>Discuss workspace onboarding, reviewed Slack and GitHub workflows, and reporting templates in this entirely fictional demonstration.</p></body></html>`,
      'text/html; charset=utf-8',
    );
  return undefined;
}
// The synthetic packages' releases: a stable line, a beta and an alpha, a few days apart, newest first.
function releaseLine(c: FixtureContext): { version: string; time: string }[] {
  const latest = added(c) ? 4 : 3;
  return [
    { version: `1.${latest + 2}.0-alpha.1`, time: at(c, 2, 3) },
    { version: `1.${latest + 1}.0-beta.2`, time: at(c, 4, 5) },
    ...Array.from({ length: latest + 1 }, (_, i) => ({
      version: `1.${latest - i}.0`,
      time: at(c, 9 + i * 21, 2),
    })),
  ];
}
function packages(u: URL, c: FixtureContext): Response | undefined {
  let p: string;
  try {
    p = decodeURIComponent(u.pathname);
  } catch {
    return undefined;
  }
  const npmName = (name: string) =>
    name.length <= 214 &&
    /^(@[a-z0-9~][a-z0-9-._~]*\/)?[a-z0-9~][a-z0-9-._~]*$/.test(name);
  const pypiName = (name: string) =>
    name.length <= 100 &&
    /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(name);
  const dockerName = (name: string) =>
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(name);
  const supported = (
    name: string,
    valid: (name: string) => boolean,
    legacy: readonly string[],
  ) => legacy.includes(name) || Boolean(c.project && valid(name));
  const scoped = (name: string) => ({
    ...c,
    seed: `${c.seed}:package:${name}`,
  });
  if (u.hostname === 'registry.npmjs.org') {
    const name = p.replace(/^\//, '').replace(/\/latest$/, '');
    if (!supported(name, npmName, ['@nocobloom/core', 'nocobloom', 'core']))
      return undefined;
    // The whole package document: dist-tags, versions and their publish times.
    if (!p.endsWith('/latest')) {
      const line = empty(c) ? [] : releaseLine(c);
      const stable = line.find((x) => !x.version.includes('-'));
      return json({
        name,
        'dist-tags': stable
          ? {
              latest: stable.version,
              beta: line[1].version,
              alpha: line[0].version,
            }
          : {},
        versions: Object.fromEntries(
          line.map((x) => [x.version, { name, version: x.version }]),
        ),
        time: {
          created: at(c, 400),
          modified: at(c, 1),
          ...Object.fromEntries(line.map((x) => [x.version, x.time])),
        },
      });
    }
    return json({
      name,
      version: added(c) ? '1.4.0' : '1.3.0',
      description: `Synthetic test package ${name} for ${fixtureProduct(c).name}; not the real package metadata.`,
      homepage: fixtureProduct(c).origin,
      repository: {
        type: 'git',
        url: `https://github.com/${fixtureProduct(c).repository}`,
      },
      license: 'MIT',
    });
  }
  if (u.hostname === 'api.npmjs.org' && /^\/versions\/.+\/last-week$/.test(p)) {
    const name = p.replace(/^\/versions\//, '').replace(/\/last-week$/, '');
    if (!supported(name, npmName, ['@nocobloom/core', 'nocobloom']))
      return undefined;
    return json({
      package: name,
      downloads: Object.fromEntries(
        (empty(c) ? [] : releaseLine(c)).map((x, i) => [
          x.version,
          (i === 2 ? 900 : 40) +
            fixtureNumber(
              scoped(name),
              `version:${x.version}`,
              i === 2 ? 300 : 160,
            ),
        ]),
      ),
    });
  }
  if (u.hostname === 'api.npmjs.org') {
    const match = p.match(
      /^\/downloads\/range\/(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})\/(.+)$/,
    );
    if (
      !match ||
      !supported(match[3], npmName, ['@nocobloom/core', 'nocobloom'])
    )
      return undefined;
    return json({
      start: match[1],
      end: match[2],
      package: match[3],
      downloads: dates(c, match[1], match[2]).map((d) => ({
        day: d,
        downloads: empty(c)
          ? 0
          : 80 +
            fixtureNumber(scoped(match[3]), `npm:${d}`, 700) +
            (added(c) ? 90 : 0),
      })),
    });
  }
  if (u.hostname === 'pypi.org') {
    const match = p.match(/^\/pypi\/([^/]+)\/json$/);
    if (
      !match ||
      !supported(match[1], pypiName, ['nocobloom', 'nocobloom-sdk'])
    )
      return undefined;
    return json({
      info: {
        name: match[1],
        version: added(c) ? '1.4.0' : '1.3.0',
        summary: `Synthetic test Python package ${match[1]} for ${fixtureProduct(c).name}`,
        home_page: fixtureProduct(c).origin,
      },
      releases: Object.fromEntries(
        (empty(c) ? [] : releaseLine(c))
          .filter((x) => !x.version.includes('-'))
          .map((x) => [
            x.version,
            ['sdist', 'bdist_wheel'].map((packagetype, i) => ({
              packagetype,
              size: 48_000 + i * 4_000,
              upload_time_iso_8601: x.time,
              yanked: false,
            })),
          ]),
      ),
    });
  }
  if (u.hostname === 'pypistats.org') {
    const split = p.match(/^\/api\/packages\/([^/]+)\/(python_minor|system)$/);
    if (split) {
      if (!supported(split[1], pypiName, ['nocobloom', 'nocobloom-sdk']))
        return undefined;
      const categories =
        split[2] === 'system'
          ? ['Linux', 'Darwin', 'Windows', 'null']
          : ['3.12', '3.11', '3.10', '3.9'];
      return json({
        package: split[1],
        type: `${split[2]}_downloads`,
        data: dates(c, undefined, undefined, 180).flatMap((date) =>
          categories.map((category, i) => ({
            category,
            date,
            downloads: empty(c)
              ? 0
              : Math.round(
                  (30 +
                    fixtureNumber(
                      scoped(split[1]),
                      `pypi:${split[2]}:${category}:${date}`,
                      60,
                    )) /
                    (i + 1),
                ),
          })),
        ),
      });
    }
    const match = p.match(/^\/api\/packages\/([^/]+)\/overall$/);
    if (
      !match ||
      !supported(match[1], pypiName, ['nocobloom', 'nocobloom-sdk'])
    )
      return undefined;
    return json({
      package: match[1],
      type: 'overall_downloads',
      data: dates(c, undefined, undefined, 180).map((date) => ({
        category: 'without_mirrors',
        date,
        downloads: empty(c)
          ? 0
          : 30 + fixtureNumber(scoped(match[1]), `pypi:${date}`, 180),
      })),
    });
  }
  if (
    u.hostname === 'hub.docker.com' &&
    /^\/v2\/repositories\/[^/]+\/[^/]+\/tags\/?$/.test(p)
  ) {
    const image = p.split('/').slice(3, 5).join('/');
    if (
      !supported(image, dockerName, ['nocobloom/nocobloom', 'nocobloom/server'])
    )
      return undefined;
    const line = releaseLine(c);
    const names = empty(c)
      ? []
      : line.flatMap((x, i) => [
          ...(i === 2
            ? ['latest']
            : x.version.includes('alpha')
              ? ['alpha']
              : x.version.includes('beta')
                ? ['beta']
                : []),
          x.version,
          `${x.version}-full`,
        ]);
    const page = Math.max(1, Number(u.searchParams.get('page')) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(u.searchParams.get('page_size')) || 10),
    );
    const pushed = (name: string) =>
      line.find((x) => name.startsWith(x.version))?.time ?? at(c, 9, 2);
    return json({
      count: names.length,
      next:
        page * pageSize < names.length
          ? `https://hub.docker.com/v2/repositories/${image}/tags?page=${page + 1}&page_size=${pageSize}`
          : null,
      previous: null,
      results: names
        .slice((page - 1) * pageSize, page * pageSize)
        .map((name) => ({
          name,
          full_size: name.endsWith('-full') ? 412_000_000 : 268_000_000,
          digest: `sha256:${fixtureHash(scoped(image), `docker:${name}`).slice(0, 64)}`,
          last_updated: pushed(name),
          tag_last_pushed: pushed(name),
          tag_last_pulled: at(
            c,
            0,
            1 + fixtureNumber(scoped(image), `pulled:${name}`, 20),
          ),
          tag_status: 'active',
          images: [
            ...['amd64', 'arm64'].map((architecture) => ({
              architecture,
              os: 'linux',
              variant: null,
              size: name.endsWith('-full') ? 206_000_000 : 134_000_000,
            })),
            // An attestation manifest, which is not a platform.
            {
              architecture: 'unknown',
              os: 'unknown',
              variant: null,
              size: 12_000,
            },
          ],
        })),
    });
  }
  if (u.hostname === 'hub.docker.com') {
    const match = p.match(/^\/v2\/repositories\/([^/]+\/[^/]+)\/?$/);
    if (
      !match ||
      !supported(match[1], dockerName, [
        'nocobloom/nocobloom',
        'nocobloom/server',
      ])
    )
      return undefined;
    const [namespace, name] = match[1].split('/');
    return json({
      namespace,
      name,
      description: `Synthetic test image ${match[1]} for ${fixtureProduct(c).name}`,
      pull_count: empty(c)
        ? 0
        : 24500 +
          (added(c) ? 250 : 0) +
          fixtureNumber(scoped(match[1]), 'docker', 500),
      star_count: 37,
      last_updated: at(c, 1),
      is_private: false,
    });
  }
  return undefined;
}
function hnRows(c: FixtureContext): ObjectValue[] {
  if (c.project) c = { ...c, seed: `${c.seed}:hn:${c.project.domain}` };
  return Array.from({ length: size(c, 8) }, (_, i) => {
    const story = i % 2 === 0,
      id = String(identity(c, `hn:${i}`)),
      storyId = String(identity(c, `hn:${i - (i % 2)}`));
    return {
      objectID: id,
      _tags: [story ? 'story' : 'comment'],
      title: story
        ? `Show HN: ${fixtureProduct(c).name} ${['onboarding templates', 'reviewed workflows', 'reporting blocks', 'customer success workspace'][Math.floor(i / 2) % 4]}`
        : null,
      story_title: `Show HN: ${fixtureProduct(c).name} ${['onboarding templates', 'reviewed workflows', 'reporting blocks', 'customer success workspace'][Math.floor(i / 2) % 4]}`,
      story_id: story ? null : Number(storyId),
      parent_id: story ? null : Number(storyId),
      url: story
        ? fixtureProduct(c).origin + '/blog/template-onboarding'
        : null,
      story_url: fixtureProduct(c).origin + '/blog/template-onboarding',
      comment_text: story
        ? null
        : `<p>The fictional ${escapeHtml(fixtureProduct(c).name)} workflow guide explains the review and reporting steps clearly.</p>`,
      points: story ? 54 + i : 3,
      num_comments: story ? 1 : 0,
      created_at_i: Math.floor(
        (time(c) -
          (2 + (Math.floor(i / 2) % 30)) * DAY +
          (story ? 0 : 3_600_000)) /
          1000,
      ),
      created_at: iso(
        time(c) -
          (2 + (Math.floor(i / 2) % 30)) * DAY +
          (story ? 0 : 3_600_000),
      ),
    };
  }).sort((a, b) => Number(b.created_at_i) - Number(a.created_at_i));
}
function hackernews(u: URL, c: FixtureContext): Response | undefined {
  if (u.hostname !== 'hn.algolia.com') return undefined;
  if (['/api/v1/search_by_date', '/api/v1/search'].includes(u.pathname)) {
    const min = u.searchParams
      .get('numericFilters')
      ?.match(/created_at_i>(\d+)/)?.[1];
    const query = (u.searchParams.get('query') || '')
      .replaceAll('"', '')
      .toLowerCase();
    const context = query.includes('nocobloom')
      ? { ...c, project: undefined }
      : c;
    const rows = hnRows(context).filter(
      (r) =>
        (!min || Number(r.created_at_i) > Number(min)) &&
        (!query || JSON.stringify(r).toLowerCase().includes(query)),
    );
    const count = Math.max(1, integer(u.searchParams.get('hitsPerPage'), 100)),
      number = integer(u.searchParams.get('page'));
    return json({
      hits: page(rows, number * count, count),
      page: number,
      nbHits: rows.length,
      nbPages: Math.ceil(rows.length / count),
      hitsPerPage: count,
      exhaustiveNbHits: true,
      query: u.searchParams.get('query') || '',
      processingTimeMS: 0,
    });
  }
  const item = u.pathname.match(/^\/api\/v1\/items\/(\d+)$/);
  if (item) {
    let rows = hnRows(c);
    if (c.project && !rows.some((r) => r.objectID === item[1]))
      rows = hnRows({ ...c, project: undefined });
    const row = rows.find((r) => r.objectID === item[1]);
    if (!row) return notFound('Hacker News item');
    const children = rows
      .filter((r) => r.parent_id === Number(item[1]))
      .map((r) => ({
        id: Number(r.objectID),
        created_at: r.created_at,
        type: 'comment',
        text: r.comment_text,
        children: [],
      }));
    return json({
      id: Number(row.objectID),
      title: row.title || row.story_title,
      url: row.url,
      created_at: row.created_at,
      points: row.points,
      type: list(row._tags)[0],
      text: row.comment_text,
      parent_id: row.parent_id,
      children,
    });
  }
  return undefined;
}
const escapeHtml = (s: string): string =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
function website(u: URL, c: FixtureContext): Response | undefined {
  // Explicit legacy demo targets stay reproducible when opened from a project-aware run.
  if (
    c.project &&
    /^(www\.|docs\.|blog\.)?nocobloom\.example$/.test(u.hostname) &&
    c.project.domain !== FIXTURE_PRODUCT.domain &&
    c.connection !== 'competitors'
  )
    c = { ...c, project: undefined };
  if (
    c.project &&
    c.connection === 'competitors' &&
    publicFixtureHost(u.hostname) &&
    u.hostname !== c.project.domain &&
    !u.hostname.endsWith(`.${c.project.domain}`) &&
    !FIXTURE_PRODUCT.competitors.includes(u.hostname)
  ) {
    c = {
      ...c,
      seed: `${c.seed}:competitor:${u.origin}`,
      project: { name: u.hostname, domain: u.hostname },
    };
  }
  const product = fixtureProduct(c);
  const hosts = [
    product.domain,
    `www.${product.domain}`,
    `docs.${product.domain}`,
    `blog.${product.domain}`,
    FIXTURE_PRODUCT.domain,
    'www.nocobloom.example',
    'docs.nocobloom.example',
    'blog.nocobloom.example',
    ...FIXTURE_PRODUCT.competitors,
  ];
  if (
    !hosts.includes(u.hostname) &&
    !(
      c.project &&
      c.connection === 'competitors' &&
      publicFixtureHost(u.hostname)
    )
  )
    return undefined;
  const origin = u.origin,
    content = pages(c, origin),
    p = u.pathname;
  if (p === '/robots.txt')
    return textResponse(
      `User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${origin}/sitemap.xml\n`,
    );
  if (p === '/sitemap.xml' || p === '/sitemap_index.xml')
    return textResponse(
      `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin}/sitemap-pages.xml</loc></sitemap><sitemap><loc>${origin}/sitemap-docs.xml</loc></sitemap></sitemapindex>`,
      'application/xml; charset=utf-8',
    );
  if (p === '/sitemap-pages.xml' || p === '/sitemap-docs.xml')
    return textResponse(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${content
        .filter((row) =>
          p.includes('-docs')
            ? row.path.startsWith('/docs/')
            : !row.path.startsWith('/docs/'),
        )
        .map(
          (row) =>
            `<url><loc>${row.url}</loc><lastmod>${day(utcDay(c) - DAY)}</lastmod></url>`,
        )
        .join('')}</urlset>`,
      'application/xml; charset=utf-8',
    );
  if (p === '/favicon.svg')
    return textResponse(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#245b50"/><path d="M17 46V18h7l16 18V18h7v28h-7L24 28v18z" fill="#e7f5d3"/></svg>',
      'image/svg+xml',
    );
  const definition = PAGE_DEFINITIONS.find(
    (row) => row[0] === p || row[0] === p.replace(/\/$/, ''),
  );
  if (!definition) return notFound('website page');
  const title = definition[1].replaceAll(
    'NocoBloom',
    u.hostname.includes('flowgrove')
      ? 'FlowGrove'
      : u.hostname.includes('stackmeadow')
        ? 'StackMeadow'
        : product.name,
  );
  const description = projectText(c, definition[2]),
    nav = content
      .map((row) => `<a href="${row.url}">${escapeHtml(row.title)}</a>`)
      .join(' ');
  return textResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow"><link rel="canonical" href="${origin}${p}"><link rel="icon" type="image/svg+xml" href="${origin}/favicon.svg"></head><body><header><a href="${origin}/">${escapeHtml(product.name)}</a><nav>${nav}</nav></header><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><p>This is an entirely fictional product dataset for testing NocoReach. ${escapeHtml(product.name)} is the configured project name; this generated page is a test fixture, not a copy or factual description of the real website. Begin with workspace onboarding, assign team roles, connect Slack and GitHub, and review permissions before publishing. Every metric and story shown here is synthetic.</p><h2>Review the workflow</h2><p>Choose an owner, explain the date range, test the expected outcome, and keep a readable audit trail. Use a customer success template to track milestones and report progress without losing context.</p>${p === '/docs/reporting' ? '<img src="/template-preview.svg">' : '<img src="/favicon.svg" alt="Synthetic project mark">'}<footer><a href="${product.community}">Community forum</a><a href="https://github.com/${product.repository}">GitHub</a><a href="https://www.npmjs.com/package/${product.npm}">npm package</a><a href="https://docs.${product.domain}/">Documentation</a><a href="https://www.youtube.com/@${encodeURIComponent(product.domain.split('.')[0])}">YouTube</a></footer></main></body></html>`,
    'text/html; charset=utf-8',
  );
}

/** Raw provider payloads only. Delays/errors/cancellation and run logs belong to the engine. */
export async function fixtureResponse(
  url: string | URL,
  init: RequestInit = {},
  context: FixtureContext,
): Promise<Response> {
  const u = new URL(url),
    method = (init.method || 'GET').toUpperCase();
  if (
    u.username ||
    u.password ||
    !['https:', 'http:'].includes(u.protocol) ||
    u.port
  )
    throw new MockUnsupportedOperationError('unsafe or unsupported URL');
  const allowedPost =
    (u.hostname === 'api.github.com' && u.pathname === '/graphql') ||
    (u.hostname === 'api.dataforseo.com' && u.pathname.startsWith('/v3/')) ||
    (u.hostname === 'oauth2.googleapis.com' && u.pathname === '/token') ||
    (u.hostname === 'analyticsdata.googleapis.com' &&
      /:(?:runReport|batchRunReports|runRealtimeReport)$/.test(u.pathname)) ||
    (u.hostname === 'www.googleapis.com' &&
      u.pathname.endsWith('/searchAnalytics/query')) ||
    (u.hostname === 'searchconsole.googleapis.com' &&
      u.pathname === '/v1/urlInspection/index:inspect');
  if (!['GET', 'HEAD'].includes(method) && !(method === 'POST' && allowedPost))
    throw new MockUnsupportedOperationError(
      `${method} ${u.origin}${u.pathname}`,
    );
  let response =
    google(u, init, context) ??
    dataforseo(u, init, context) ??
    githubTrending(u, context) ??
    github(u, init, context) ??
    xApi(u, context) ??
    slack(u, context) ??
    discord(u, context) ??
    community(u, context) ??
    packages(u, context) ??
    hackernews(u, context) ??
    website(u, context);
  if (!response && u.hostname === 'raw.githubusercontent.com') {
    const m = u.pathname.match(
      /^\/([^/]+\/[^/]+)\/main\/(README\.md|SKILL\.md)$/,
    );
    if (
      m &&
      (repositories.includes(m[1]) ||
        Boolean(
          context.project &&
          /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i.test(m[1]) &&
          !['.', '..'].includes(m[1].split('/')[1]),
        ))
    )
      response = textResponse(repositoryFile(context, m[2]));
  }
  if (!response)
    throw new MockUnsupportedOperationError(
      `${method} ${u.origin}${u.pathname}`,
    );
  if (method === 'HEAD')
    response = new Response(null, {
      status: response.status,
      headers: response.headers,
    });
  Object.defineProperty(response, 'url', { value: u.href });
  return response;
}
