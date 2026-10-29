import {
  DAY,
  WorldUnsupported,
  body,
  daysBetween,
  isDay,
  json,
  list,
  names,
  object,
  slice,
  text,
  type Json,
} from './kit.js';
import {
  daysAgo,
  annualDemand,
  growth,
  hourShare,
  level,
  shiftDay,
  weekday,
} from './series.js';
import type { Query } from './script/types.js';
import { split, type Visit, type World } from './world.js';

type Fact = {
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
};

function aggregate(
  rows: Iterable<Fact>,
  dimensions: string[],
  metrics: string[],
): Fact[] {
  const grouped = new Map<string, Fact>();
  for (const row of rows) {
    const selected = Object.fromEntries(
      dimensions.map((d) => [d, row.dimensions[d] ?? '']),
    );
    const key = JSON.stringify(selected);
    let into = grouped.get(key);
    if (!into) {
      into = {
        dimensions: selected,
        metrics: Object.fromEntries(metrics.map((m) => [m, 0])),
      };
      grouped.set(key, into);
    }
    for (const metric of metrics)
      into.metrics[metric] += row.metrics[metric] ?? 0;
  }
  return [...grouped.values()];
}

export const propertyId = (world: World): string =>
  String(300_000_000 + world.seeded.int('ga4-property', 90_000_000));
export const searchConsoleSite = (world: World): string =>
  `sc-domain:${world.project.domain}`;

/** The fictional Google account, property and site the demo project connects to. */
export function googleCatalog(world: World) {
  return {
    ga4PropertyId: propertyId(world),
    gscSiteUrl: searchConsoleSite(world),
    googleEmail: `analytics@${world.project.domain}`,
  };
}

// GA4 dimension filters: and/or/not groups over exact, prefix, suffix or substring matches and value lists.
function ga4Filter(expression: unknown): (fact: Fact) => boolean {
  const e = object(expression);
  const group = (value: unknown) =>
    list(object(value).expressions).map(ga4Filter);
  if (e.andGroup) {
    const all = group(e.andGroup);
    return (fact) => all.every((f) => f(fact));
  }
  if (e.orGroup) {
    const any = group(e.orGroup);
    return (fact) => any.some((f) => f(fact));
  }
  if (e.notExpression) {
    const not = ga4Filter(e.notExpression);
    return (fact) => !not(fact);
  }
  const filter = object(e.filter);
  const field = text(filter.fieldName);
  if (filter.inListFilter) {
    const inList = object(filter.inListFilter);
    const sensitive = inList.caseSensitive === true;
    const values = list(inList.values).map((v) =>
      sensitive ? text(v) : text(v).toLowerCase(),
    );
    return (fact) => {
      const v = fact.dimensions[field] ?? '';
      return values.includes(sensitive ? v : v.toLowerCase());
    };
  }
  const match = object(filter.stringFilter);
  const type = text(match.matchType, 'EXACT');
  const sensitive = match.caseSensitive === true;
  const wanted = sensitive
    ? text(match.value)
    : text(match.value).toLowerCase();
  if (type === 'FULL_REGEXP' || type === 'PARTIAL_REGEXP') {
    const pattern = new RegExp(
      type === 'FULL_REGEXP' ? `^(?:${text(match.value)})$` : text(match.value),
      sensitive ? '' : 'i',
    );
    return (fact) => pattern.test(fact.dimensions[field] ?? '');
  }
  return (fact) => {
    const raw = fact.dimensions[field] ?? '';
    const v = sensitive ? raw : raw.toLowerCase();
    return type === 'BEGINS_WITH'
      ? v.startsWith(wanted)
      : type === 'ENDS_WITH'
        ? v.endsWith(wanted)
        : type === 'CONTAINS'
          ? v.includes(wanted)
          : v === wanted;
  };
}
const filterFields = (expression: unknown): string[] => {
  const e = object(expression);
  return [
    text(object(e.filter).fieldName),
    ...['andGroup', 'orGroup'].flatMap((g) =>
      list(object(e[g]).expressions).flatMap(filterFields),
    ),
    ...(e.notExpression ? filterFields(e.notExpression) : []),
  ].filter(Boolean);
};

const GA4_DIMENSIONS = new Set([
  'date',
  'hour',
  'dateHour',
  'dayOfWeek',
  'sessionDefaultChannelGroup',
  'sessionSource',
  'sessionMedium',
  'sessionSourceMedium',
  'sessionCampaignName',
  'firstUserDefaultChannelGroup',
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
  'pagePathPlusQueryString',
  'pageReferrer',
  'landingPage',
  'landingPagePlusQueryString',
]);
const GA4_METRICS = new Set([
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
  'screenPageViewsPerSession',
]);
const RATIOS = new Set([
  'engagementRate',
  'averageSessionDuration',
  'bounceRate',
  'sessionKeyEventRate',
  'screenPageViewsPerSession',
]);

/** How a kind of page is read: engagement, pages per visit, seconds engaged and sign-ups, against the site average. */
function pageHabit(path: string) {
  if (
    path.startsWith('/docs') ||
    path.startsWith('/guides') ||
    path.startsWith('/tutorials')
  )
    return { engaged: 1.12, views: 1.35, seconds: 1.45, converts: 0.7 };
  if (path.startsWith('/blog') || path === '/changelog')
    return { engaged: 0.82, views: 0.75, seconds: 1.15, converts: 0.5 };
  if (
    ['/pricing', '/contact', '/enterprise', '/commercial-plugins'].includes(
      path,
    )
  )
    return { engaged: 1.05, views: 1.1, seconds: 0.8, converts: 3.2 };
  return { engaged: 1, views: 1, seconds: 1, converts: 1 };
}

function visitFact(
  world: World,
  date: string,
  visit: Visit,
  index: number,
): Fact {
  const { sources, regions, devices } = world.analytics;
  const source = sources[visit.source];
  const page = world.site.pages[visit.page];
  const region = regions[visit.region];
  const device = devices[visit.device];
  const [os, , browsers] = device.systems[visit.system];
  const habit = pageHabit(page.path);
  const s = world.seeded;
  const key = `${date}:${index}`;
  const n = visit.sessions;
  const mobile = device.category === 'mobile' ? 0.9 : 1;
  const engagedRate = Math.min(
    0.95,
    0.6 *
      habit.engaged *
      (source.engagement ?? 1) *
      mobile *
      (visit.returning ? 1.15 : 1),
  );
  const engaged = Math.min(n, s.round(`eng:${key}`, n * engagedRate));
  const users = Math.max(1, s.round(`users:${key}`, n * 0.87));
  const keyEvents = s.round(
    `key:${key}`,
    n * 0.016 * habit.converts * (source.converts ?? 1),
  );
  const views = Math.max(n, s.round(`pv:${key}`, n * 2.1 * habit.views));
  const seconds = Math.round(
    engaged * 74 * habit.seconds * s.jitter(`sec:${key}`, 0.25),
  );
  const scroll = s.round(`scroll:${key}`, views * 0.45);
  const title = world.text(page.title);
  const channel = source.channel;
  const campaign =
    source.campaign ??
    (channel === 'Direct'
      ? '(direct)'
      : source.medium === 'organic'
        ? '(organic)'
        : '(referral)');
  const dateKey = date.replaceAll('-', '');
  return {
    dimensions: {
      date: dateKey,
      dayOfWeek: String(new Date(`${date}T00:00:00Z`).getUTCDay()),
      sessionDefaultChannelGroup: channel,
      firstUserDefaultChannelGroup: channel,
      sessionSource: source.source,
      sessionMedium: source.medium,
      sessionSourceMedium: `${source.source} / ${source.medium}`,
      sessionCampaignName: campaign,
      country: region.country,
      countryId: region.countryId,
      city: region.cities[visit.city][0],
      language: region.language,
      languageCode: region.languageCode,
      deviceCategory: device.category,
      operatingSystem: os,
      browser: browsers[visit.browser][0],
      newVsReturning: visit.returning ? 'returning' : 'new',
      hostName: world.project.domain,
      pagePath: page.path,
      pagePathPlusQueryString: page.path,
      pageTitle: title,
      landingPage: page.path,
      landingPagePlusQueryString: page.path,
      pageReferrer: source.referrer ?? '',
    },
    metrics: {
      sessions: n,
      engagedSessions: engaged,
      activeUsers: users,
      totalUsers: users,
      newUsers: visit.returning ? 0 : users,
      keyEvents,
      conversions: keyEvents,
      keySessions: Math.min(n, keyEvents),
      eventCount: views + n + engaged + scroll + keyEvents,
      userEngagementDuration: seconds,
      screenPageViews: views,
      __scroll: scroll,
    },
  };
}

function byHour(
  world: World,
  fact: Fact,
  date: string,
  before: number,
  key: string,
): Fact[] {
  const hours = Array.from({ length: before }, (_, h) => hourShare(h));
  // Sessions pick their hours; every other count follows them, so an hour's users come with its sessions.
  const sessions = split(
    world.seeded,
    `${key}:sessions`,
    fact.metrics.sessions,
    hours,
  );
  const weights = sessions.some(Boolean) ? sessions : hours;
  const counts = Object.fromEntries(
    Object.entries(fact.metrics).map(([m, v]) => [
      m,
      m === 'sessions'
        ? sessions
        : split(world.seeded, `${key}:${m}`, v, weights),
    ]),
  );
  return hours
    .map((_, h) => ({
      dimensions: {
        ...fact.dimensions,
        hour: String(h).padStart(2, '0'),
        dateHour: `${date.replaceAll('-', '')}${String(h).padStart(2, '0')}`,
      },
      metrics: Object.fromEntries(
        Object.keys(fact.metrics).map((m) => [m, counts[m][h]]),
      ),
    }))
    .filter((f) => Object.values(f.metrics).some(Boolean));
}

// A visit fact as its events: their counts add up to its eventCount, and sign_up is the key event.
function events(fact: Fact): Fact[] {
  const m = fact.metrics;
  return (
    [
      ['page_view', m.screenPageViews],
      ['session_start', m.sessions],
      ['user_engagement', m.engagedSessions],
      ['scroll', m.__scroll],
      ['sign_up', m.keyEvents],
    ] as const
  )
    .filter(([, count]) => count > 0)
    .map(([eventName, eventCount]) => ({
      dimensions: { ...fact.dimensions, eventName },
      metrics: {
        ...m,
        eventCount,
        keyEvents: eventName === 'sign_up' ? eventCount : 0,
      },
    }));
}

function ga4Day(world: World, value: unknown): string {
  const v = text(value);
  const today = world.local().date;
  if (v === 'today') return today;
  if (v === 'yesterday') return shiftDay(today, 1);
  const ago = /^(\d+)daysAgo$/.exec(v);
  if (ago) return shiftDay(today, Number(ago[1]));
  if (!isDay(v)) throw new WorldUnsupported('a GA4 date');
  return v;
}

function ga4Order(rows: Fact[], b: Json): Fact[] {
  const orders = list(b.orderBys).map(object);
  if (!orders.length) return rows;
  return [...rows].sort((x, y) => {
    for (const o of orders) {
      const metric = text(object(o.metric).metricName);
      const dimension = text(object(o.dimension).dimensionName);
      const diff = metric
        ? (x.metrics[metric] ?? 0) - (y.metrics[metric] ?? 0)
        : (x.dimensions[dimension] ?? '').localeCompare(
            y.dimensions[dimension] ?? '',
          );
      if (diff) return o.desc === true ? -diff : diff;
    }
    return 0;
  });
}

function ratios(row: Fact): void {
  const m = row.metrics;
  const sessions = m.sessions || 0;
  m.engagementRate = sessions ? m.engagedSessions / sessions : 0;
  m.bounceRate = sessions ? 1 - m.engagedSessions / sessions : 0;
  m.averageSessionDuration = sessions ? m.userEngagementDuration / sessions : 0;
  m.sessionKeyEventRate = sessions ? m.keySessions / sessions : 0;
  m.screenPageViewsPerSession = sessions ? m.screenPageViews / sessions : 0;
}

function ga4Response(
  dim: string[],
  met: string[],
  rows: Fact[],
  b: Json,
  kind: string,
): Json {
  const sorted = ga4Order(rows, b);
  const totals = aggregate(
    rows,
    [],
    [
      ...new Set([
        ...met,
        'sessions',
        'engagedSessions',
        'userEngagementDuration',
        'keySessions',
        'screenPageViews',
      ]),
    ],
  );
  totals.forEach(ratios);
  const value = (m: string, v: number) =>
    RATIOS.has(m) ? String(Number(v.toFixed(6))) : String(Math.round(v));
  return {
    dimensionHeaders: dim.map((name) => ({ name })),
    metricHeaders: met.map((name) => ({
      name,
      type: RATIOS.has(name)
        ? 'TYPE_FLOAT'
        : name === 'userEngagementDuration'
          ? 'TYPE_SECONDS'
          : 'TYPE_INTEGER',
    })),
    rows: slice(sorted, b.offset, b.limit, 10_000).map((r) => ({
      dimensionValues: dim.map((d) => ({ value: r.dimensions[d] ?? '' })),
      metricValues: met.map((m) => ({ value: value(m, r.metrics[m] ?? 0) })),
    })),
    ...(list(b.metricAggregations).includes('TOTAL') && totals[0]
      ? {
          totals: [
            {
              dimensionValues: dim.map(() => ({ value: 'RESERVED_TOTAL' })),
              metricValues: met.map((m) => ({
                value: value(m, totals[0].metrics[m] ?? 0),
              })),
            },
          ],
        }
      : {}),
    rowCount: rows.length,
    metadata: { dataLossFromOtherRow: false },
    kind,
  };
}

// Pages read GA4 live, so a report repeated within the hour is answered once; the largest are recomputed instead.
const RETAINED_REPORT_ROWS = 2_000;

function ga4Report(world: World, b: Json): Json {
  const { date, hour } = world.local();
  return world.answer(
    `ga4:${date}:${hour}:${JSON.stringify(b)}`,
    () => computeGa4Report(world, b),
    (report) => (report.rows as unknown[]).length <= RETAINED_REPORT_ROWS,
  );
}

function computeGa4Report(world: World, b: Json): Json {
  const dim = names(b.dimensions);
  const met = names(b.metrics);
  const ranges = list(b.dateRanges).map(object);
  if (
    dim.some((d) => !GA4_DIMENSIONS.has(d)) ||
    met.some((m) => !GA4_METRICS.has(m))
  )
    throw new WorldUnsupported('a GA4 dimension or metric');
  if (ranges.length > 4)
    throw new WorldUnsupported('more than four GA4 date ranges');
  const keep = b.dimensionFilter ? ga4Filter(b.dimensionFilter) : () => true;
  const fields = new Set([...dim, ...filterFields(b.dimensionFilter)]);
  const { date: today, hour } = world.local();
  const named = ranges.length > 1;
  const wanted = [
    ...new Set([
      ...met,
      'sessions',
      'engagedSessions',
      'userEngagementDuration',
      'keySessions',
      'screenPageViews',
    ]),
  ];
  const rows = (ranges.length ? ranges : [{}]).flatMap((range, r) => {
    const start = ga4Day(world, range.startDate ?? '28daysAgo');
    const end = ga4Day(world, range.endDate ?? 'yesterday');
    const days = daysBetween(start, end < today ? end : today);
    // Consume one visit at a time; hour/event expansion never accumulates across days.
    function* facts(): Generator<Fact> {
      for (const date of days) {
        const visits = world.visitsOn(date);
        for (const [i, visit] of visits.entries()) {
          const fact = visitFact(world, date, visit, i);
          const hourly =
            fields.has('hour') || fields.has('dateHour')
              ? byHour(
                  world,
                  fact,
                  date,
                  date === today ? hour : 24,
                  `h:${date}:${i}`,
                )
              : [fact];
          for (const hourFact of hourly) {
            const expanded = fields.has('eventName')
              ? events(hourFact)
              : [hourFact];
            for (const row of expanded) if (keep(row)) yield row;
          }
        }
      }
    }
    const name = text(range.name) || `date_range_${r}`;
    return aggregate(facts(), dim, wanted).map((row) => ({
      dimensions: named
        ? { ...row.dimensions, dateRange: name }
        : row.dimensions,
      metrics: row.metrics,
    }));
  });
  rows.forEach(ratios);
  return ga4Response(
    named ? [...dim, 'dateRange'] : dim,
    met,
    rows,
    b,
    'analyticsData#runReport',
  );
}

// GA4 Realtime: the last 30 minutes, per minute, page, place and device.
function ga4Realtime(world: World, b: Json): Json {
  const dim = names(b.dimensions);
  const met = names(b.metrics);
  const allowed = [
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
    throw new WorldUnsupported('a GA4 realtime dimension or metric');
  const { date, hour } = world.local();
  const perMinute = (world.sessionsOn(date) * hourShare(hour) * 1.3) / 60;
  const s = world.seeded;
  const minute = Math.floor(world.now / 60_000);
  const { regions, devices } = world.analytics;
  const pages = world.site.pages;
  const facts: Fact[] = [];
  for (let ago = 0; ago < 30; ago++) {
    const users = s.round(`rt:${minute - ago}`, perMinute);
    split(
      s,
      `rtp:${minute - ago}`,
      users,
      pages.map((p) => p.weight),
    ).forEach((count, p) => {
      if (!count) return;
      split(
        s,
        `rtg:${minute - ago}:${p}`,
        count,
        regions.map((r) => r.weight),
      ).forEach((rc, r) => {
        if (!rc) return;
        const city =
          regions[r].cities[
            s.int(`rtc:${minute - ago}:${p}:${r}`, regions[r].cities.length)
          ][0];
        split(
          s,
          `rtd:${minute - ago}:${p}:${r}`,
          rc,
          devices.map((d) => d.weight),
        ).forEach((dc, d) => {
          if (!dc) return;
          const views =
            dc + s.round(`rtv:${minute - ago}:${p}:${r}:${d}`, dc * 0.4);
          const key =
            s.unit(`rtk:${minute - ago}:${p}:${r}:${d}`) < 0.03 ? 1 : 0;
          const base: Fact = {
            dimensions: {
              minutesAgo: String(ago).padStart(2, '0'),
              unifiedScreenName: world.text(pages[p].title),
              country: regions[r].country,
              countryId: regions[r].countryId,
              city,
              deviceCategory: devices[d].category,
            },
            metrics: {
              activeUsers: dc,
              screenPageViews: views,
              eventCount: views * 3 + key,
              keyEvents: key,
            },
          };
          if (!dim.includes('eventName')) return facts.push(base);
          for (const [eventName, eventCount] of [
            ['page_view', views],
            ['user_engagement', dc],
            ['scroll', views * 2],
            ['sign_up', key],
          ] as const)
            if (eventCount)
              facts.push({
                dimensions: { ...base.dimensions, eventName },
                metrics: {
                  ...base.metrics,
                  eventCount,
                  keyEvents: eventName === 'sign_up' ? key : 0,
                },
              });
        });
      });
    });
  }
  return ga4Response(
    dim,
    met,
    aggregate(facts, dim, met),
    b,
    'analyticsData#runRealtimeReport',
  );
}

// Search Console: clicks by position, from a typical organic click curve.
const CTR = [0.31, 0.17, 0.11, 0.075, 0.055, 0.042, 0.033, 0.027, 0.022, 0.019];
function ctrAt(position: number): number {
  if (position < 1) return CTR[0];
  if (position <= 10) {
    const i = Math.floor(position) - 1;
    const next = CTR[Math.min(9, i + 1)];
    return CTR[i] + (next - CTR[i]) * (position - Math.floor(position));
  }
  if (position <= 20) return 0.012 - (position - 10) * 0.0007;
  return 0.0035;
}

const DEVICES = [
  ['DESKTOP', 0.6, 0],
  ['MOBILE', 0.37, 0.6],
  ['TABLET', 0.03, 0.3],
] as const;

type SearchCell = {
  date: string;
  query: string;
  page: string;
  country: string;
  device: string;
  appearance: string;
  impressions: number;
  clicks: number;
  position: number;
};

/** Impressions, clicks and position of a query on a date, before splitting by page, country and device. */
function queryDay(world: World, query: Query, date: string, today: string) {
  const ago = daysAgo(date, today);
  const s = world.seeded;
  const key = `${query.q}:${date}`;
  const seasonal = weekday(date) ** (query.brand ? 0.9 : 0.6);
  const impressions = s.round(
    `imp:${key}`,
    query.impressions *
      level(query.changes, ago) *
      growth(ago) *
      annualDemand(date, !world.main) *
      seasonal *
      s.jitter(`impj:${key}`, 0.18),
  );
  const shift = query.rank
    ? ago >= query.rank.at
      ? 0
      : ago <= query.rank.at - 3
        ? query.rank.by
        : (query.rank.by * (query.rank.at - ago)) / 3
    : 0;
  // A position today is the script's; before a move it was where the move started from.
  const position = Math.max(
    1,
    query.position -
      (query.rank?.by ?? 0) +
      shift +
      (s.unit(`pos:${key}`) - 0.5) * 1.2,
  );
  const clicks = Math.min(
    impressions,
    s.round(`clk:${key}`, impressions * ctrAt(position) * (query.ctr ?? 1)),
  );
  return { impressions, clicks, position };
}

const TYPE = {
  web: { impressions: 1, clicks: 1, position: 0 },
  image: { impressions: 0.07, clicks: 0.012, position: 7 },
  video: { impressions: 0.025, clicks: 0.08, position: 3 },
  news: { impressions: 0, clicks: 0, position: 0 },
} as const;

function searchCells(world: World, b: Json, dims: string[]): SearchCell[] {
  const today = world.searchToday();
  // Search Console data arrives about two days late.
  const latest = shiftDay(today, 2);
  const start = text(b.startDate);
  const end = text(b.endDate);
  if (!isDay(start) || !isDay(end))
    throw new WorldUnsupported('Search Console dates');
  const days = daysBetween(start, end < latest ? end : latest);
  const type = text(b.type, text(b.searchType, 'web')).toLowerCase();
  const s = world.seeded;
  const split3 = dims.includes('country') || dims.includes('device');
  const regions = world.analytics.regions;
  const cells: SearchCell[] = [];
  if (type === 'discover' || type === 'googlenews') {
    if (type === 'googlenews') return [];
    for (const date of days) {
      const ago = daysAgo(date, today);
      const blog = world.site.pages.filter((p) => p.path.startsWith('/blog'));
      for (const page of blog) {
        const impressions = s.round(
          `disc:${page.path}:${date}`,
          page.weight *
            22 *
            level(page.changes, ago) *
            s.jitter(`discj:${page.path}:${date}`, 0.5),
        );
        if (!impressions) continue;
        const clicks = s.round(
          `discc:${page.path}:${date}`,
          impressions * 0.07,
        );
        split(
          s,
          `discg:${page.path}:${date}`,
          impressions,
          regions.map((r) => r.weight),
        ).forEach((count, r) => {
          if (count)
            cells.push({
              date,
              query: '',
              page: world.origin + page.path,
              country: regions[r].gsc,
              device: 'MOBILE',
              appearance: '',
              impressions: count,
              clicks: Math.min(
                count,
                Math.round((clicks * count) / impressions),
              ),
              position: 0,
            });
        });
      }
    }
    return cells;
  }
  const factor = TYPE[type as keyof typeof TYPE];
  if (!factor) throw new WorldUnsupported(`Search Console type ${type}`);
  if (!factor.impressions) return [];
  for (const date of days) {
    for (const query of world.queries) {
      if (type === 'video' && !query.path.startsWith('/tutorials')) continue;
      const day = queryDay(world, query, date, today);
      const impressions =
        type === 'web'
          ? day.impressions
          : s.round(
              `${type}:${query.q}:${date}`,
              day.impressions * factor.impressions,
            );
      if (!impressions) continue;
      const clicks =
        type === 'web'
          ? day.clicks
          : Math.min(
              impressions,
              s.round(
                `${type}c:${query.q}:${date}`,
                day.clicks * factor.clicks,
              ),
            );
      const position = day.position + factor.position;
      const pages: [string, number][] = query.also
        ? [
            [query.path, 1 - query.also[1]],
            [query.also[0], query.also[1]],
          ]
        : [[query.path, 1]];
      const pageImpressions = split(
        s,
        `qp:${query.q}:${date}`,
        impressions,
        pages.map((p) => p[1]),
      );
      const pageClicks = split(
        s,
        `qpc:${query.q}:${date}`,
        clicks,
        pageImpressions.map((v, i) => v * (i ? 0.4 : 1)),
      );
      pages.forEach(([path], pi) => {
        const imp = pageImpressions[pi];
        if (!imp) return;
        const pos = position + pi * 4.5;
        const appearance = query.path.startsWith('/tutorials') ? 'VIDEO' : '';
        const base = {
          date,
          query: query.q,
          page: world.origin + path,
          appearance,
        };
        if (!split3) {
          cells.push({
            ...base,
            country: '',
            device: '',
            impressions: imp,
            clicks: pageClicks[pi],
            position: pos,
          });
          return;
        }
        const weights = regions.flatMap((r) =>
          DEVICES.map(([, share]) => r.weight * share),
        );
        const cellImpressions = split(
          s,
          `qc:${query.q}:${date}:${pi}`,
          imp,
          weights,
        );
        const cellClicks = split(
          s,
          `qcc:${query.q}:${date}:${pi}`,
          pageClicks[pi],
          cellImpressions,
        );
        cellImpressions.forEach((count, i) => {
          if (!count) return;
          const region = regions[Math.floor(i / DEVICES.length)];
          const [device, , offset] = DEVICES[i % DEVICES.length];
          cells.push({
            ...base,
            country: region.gsc,
            device,
            impressions: count,
            clicks: Math.min(count, cellClicks[i]),
            position: Math.max(
              1,
              pos +
                offset +
                (s.unit(`qcp:${query.q}:${date}:${i}`) - 0.5) * 0.8,
            ),
          });
        });
      });
    }
  }
  return cells;
}

function gsc(world: World, b: Json) {
  const dims = names(b.dimensions);
  const allowed = [
    'date',
    'query',
    'page',
    'country',
    'device',
    'searchAppearance',
  ];
  if (dims.some((d) => !allowed.includes(d)))
    throw new WorldUnsupported('a Search Console dimension');
  let cells = searchCells(world, b, dims);
  if (dims.includes('searchAppearance'))
    cells = cells.filter((c) => c.appearance);
  for (const group of list(b.dimensionFilterGroups))
    for (const filter of list(object(group).filters)) {
      const f = object(filter);
      const d = text(f.dimension) as keyof SearchCell;
      const value = text(f.expression);
      const op = text(f.operator, 'equals');
      cells = cells.filter((cell) => {
        const actual = String(
          cell[
            d === ('searchAppearance' as keyof SearchCell) ? 'appearance' : d
          ] ?? '',
        );
        return op === 'notEquals'
          ? actual !== value
          : op === 'contains'
            ? actual.includes(value)
            : op === 'notContains'
              ? !actual.includes(value)
              : op === 'includingRegex'
                ? new RegExp(value).test(actual)
                : op === 'excludingRegex'
                  ? !new RegExp(value).test(actual)
                  : actual === value;
      });
    }
  const field = (cell: SearchCell, d: string) =>
    d === 'searchAppearance'
      ? cell.appearance
      : String(cell[d as keyof SearchCell]);
  const grouped = new Map<
    string,
    { keys: string[]; clicks: number; impressions: number; weighted: number }
  >();
  for (const cell of cells) {
    const keys = dims.map((d) => field(cell, d));
    const key = JSON.stringify(keys);
    const row = grouped.get(key) ?? {
      keys,
      clicks: 0,
      impressions: 0,
      weighted: 0,
    };
    row.clicks += cell.clicks;
    row.impressions += cell.impressions;
    row.weighted += cell.position * cell.impressions;
    grouped.set(key, row);
  }
  // Property totals include searches Google keeps private, so they exceed the sum of query rows.
  const anonymous =
    !dims.includes('query') && !dims.includes('page') && dims.length <= 1
      ? 1.16
      : 1;
  const rows = [...grouped.values()]
    .map((row) => ({
      keys: row.keys,
      clicks: Math.round(row.clicks * anonymous),
      impressions: Math.round(row.impressions * anonymous),
      ctr: row.impressions ? row.clicks / row.impressions : 0,
      position: row.impressions
        ? Number((row.weighted / row.impressions).toFixed(2))
        : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  return json({
    rows: slice(rows, b.startRow, b.rowLimit, 1000),
    responseAggregationType: dims.includes('page') ? 'byPage' : 'byProperty',
  });
}

const COVERAGE = {
  indexed: ['PASS', 'Submitted and indexed'],
  crawled: ['NEUTRAL', 'Crawled - currently not indexed'],
  discovered: ['NEUTRAL', 'Discovered - currently not indexed'],
  unknown: ['NEUTRAL', 'URL is unknown to Google'],
  'not-found': ['FAIL', 'Not found (404)'],
  duplicate: [
    'NEUTRAL',
    'Duplicate, Google chose different canonical than user',
  ],
  noindex: ['NEUTRAL', "Excluded by 'noindex' tag"],
  redirect: ['NEUTRAL', 'Page with redirect'],
} as const;

function inspection(world: World, url: string, site: string) {
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
  const domain = world.project.domain;
  if (target.hostname !== domain && !target.hostname.endsWith(`.${domain}`))
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
  const page = world.page(target.pathname);
  const missing = world.site.missing?.includes(
    target.pathname.replace(/\/+$/, ''),
  );
  const state =
    page?.index ?? (missing ? 'not-found' : page ? 'indexed' : 'unknown');
  const [verdict, coverage] = COVERAGE[state];
  const crawled =
    state === 'discovered' || state === 'unknown'
      ? undefined
      : 1 +
        world.seeded.int(
          `crawl:${target.pathname}`,
          state === 'crawled' ? 40 : 14,
        );
  const fetched = crawled !== undefined && state !== 'not-found';
  const section =
    target.pathname.startsWith('/docs') || target.pathname.startsWith('/guides')
      ? 'docs'
      : target.pathname.startsWith('/blog')
        ? 'blog'
        : 'pages';
  const rich =
    page && fetched && state === 'indexed'
      ? target.pathname.startsWith('/docs')
        ? [['Breadcrumbs', '', '']]
        : target.pathname === '/pricing'
          ? [['Product snippets', 'Missing field "offers"', 'ERROR']]
          : target.pathname.startsWith('/blog')
            ? [['Article', 'Missing field "image"', 'WARNING']]
            : undefined
      : undefined;
  return json({
    inspectionResult: {
      inspectionResultLink: `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(site)}&id=${world.seeded.hash(url).slice(0, 22)}`,
      indexStatusResult: {
        verdict,
        coverageState: coverage,
        robotsTxtState: 'ALLOWED',
        indexingState:
          state === 'noindex' ? 'BLOCKED_BY_META_TAG' : 'INDEXING_ALLOWED',
        pageFetchState:
          crawled === undefined
            ? 'PAGE_FETCH_STATE_UNSPECIFIED'
            : state === 'not-found'
              ? 'NOT_FOUND'
              : 'SUCCESSFUL',
        ...(state !== 'unknown' && !page?.flags?.includes('orphan')
          ? {
              sitemap: [`${world.origin}/sitemap-${section}.xml`],
              referringUrls:
                target.pathname === '/' ? [] : [`${world.origin}/`],
            }
          : {}),
        ...(crawled !== undefined
          ? {
              lastCrawlTime: new Date(
                world.now - crawled * DAY - 5 * 3_600_000,
              ).toISOString(),
              crawledAs: 'MOBILE',
            }
          : {}),
        ...(fetched
          ? {
              googleCanonical:
                state === 'duplicate' && page?.canonical
                  ? world.origin + page.canonical
                  : url,
              userCanonical: url,
            }
          : {}),
      },
      mobileUsabilityResult: { verdict: 'VERDICT_UNSPECIFIED' },
      ...(rich
        ? {
            richResultsResult: {
              verdict: rich.some((r) => r[2] === 'ERROR') ? 'FAIL' : 'PASS',
              detectedItems: rich.map(([type, message, severity]) => ({
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

/** The sitemaps listed in Search Console: the submitted index and its files, plus an old one Google cannot fetch. */
function sitemaps(world: World, index: string | null) {
  const counts = sitemapCounts(world);
  const at = (days: number, hours = 0) =>
    new Date(world.now - days * DAY - hours * 3_600_000).toISOString();
  const entry = (
    name: string,
    submitted: number,
    downloaded: number,
    urls: number,
    extra: Json = {},
  ) => ({
    path: `${world.origin}/${name}`,
    lastSubmitted: at(submitted),
    isPending: false,
    isSitemapsIndex: false,
    type: 'sitemap',
    lastDownloaded: at(downloaded, 4),
    warnings: '0',
    errors: '0',
    contents: [{ type: 'web', submitted: String(urls), indexed: '0' }],
    ...extra,
  });
  const children = [
    entry('sitemap-pages.xml', 210, 1, counts.pages),
    entry('sitemap-docs.xml', 210, 1, counts.docs, { warnings: '1' }),
    entry('sitemap-blog.xml', 120, 2, counts.blog),
  ];
  if (index !== null)
    return json(
      index === `${world.origin}/sitemap.xml` ? { sitemap: children } : {},
    );
  return json({
    sitemap: [
      {
        ...entry(
          'sitemap.xml',
          210,
          1,
          counts.pages + counts.docs + counts.blog,
        ),
        isSitemapsIndex: true,
        contents: [
          {
            type: 'web',
            submitted: String(counts.pages + counts.docs + counts.blog),
            indexed: '0',
          },
        ],
      },
      ...(world.main
        ? [entry('sitemap-v1.xml', 500, 6, 0, { errors: '1', contents: [] })]
        : []),
    ],
  });
}

export function sitemapSection(path: string): 'pages' | 'docs' | 'blog' {
  if (path.startsWith('/blog') || path === '/changelog') return 'blog';
  if (/^\/(docs|guides|tutorials|legacy)(\/|$)/.test(path)) return 'docs';
  return 'pages';
}
function sitemapCounts(world: World) {
  const counts = { pages: 0, docs: 0, blog: 0 };
  for (const page of world.site.pages)
    if (!page.flags?.includes('orphan')) counts[sitemapSection(page.path)]++;
  return counts;
}

export function google(
  world: World,
  u: URL,
  init: RequestInit,
): Response | undefined {
  const p = u.pathname;
  const property = propertyId(world);
  const site = searchConsoleSite(world);
  if (u.hostname === 'oauth2.googleapis.com' && p === '/token')
    return json({
      access_token: `ya29.demo-${world.seeded.hash('google-access').slice(0, 24)}`,
      refresh_token: `1//demo-${world.seeded.hash('google-refresh').slice(0, 24)}`,
      token_type: 'Bearer',
      expires_in: 3599,
      scope:
        'openid email https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',
    });
  if (u.hostname === 'openidconnect.googleapis.com' && p === '/v1/userinfo')
    return json({
      sub: String(world.seeded.id('google-user', 21)),
      email: googleCatalog(world).googleEmail,
      email_verified: true,
      name: `${world.site.name} Analytics`,
    });
  if (
    u.hostname === 'analyticsadmin.googleapis.com' &&
    p === '/v1beta/accountSummaries'
  )
    return json({
      accountSummaries: [
        {
          name: `accountSummaries/${world.seeded.id('ga-account')}`,
          account: `accounts/${world.seeded.id('ga-account')}`,
          displayName: world.site.name,
          propertySummaries: [
            {
              property: `properties/${property}`,
              displayName: `${world.site.name} – ${world.lang === 'zh' ? '官网' : 'Website'}`,
              propertyType: 'PROPERTY_TYPE_ORDINARY',
            },
          ],
        },
      ],
    });
  if (
    u.hostname === 'analyticsadmin.googleapis.com' &&
    p === `/v1beta/properties/${property}`
  )
    return json({
      name: `properties/${property}`,
      displayName: `${world.site.name} – ${world.lang === 'zh' ? '官网' : 'Website'}`,
      timeZone: world.timeZone,
      currencyCode: world.lang === 'zh' ? 'CNY' : 'USD',
      industryCategory: 'COMPUTERS_AND_ELECTRONICS',
    });
  if (u.hostname === 'www.googleapis.com' && p === '/webmasters/v3/sites')
    return json({
      siteEntry: [
        { siteUrl: site, permissionLevel: 'siteOwner' },
        { siteUrl: `${world.origin}/`, permissionLevel: 'siteFullUser' },
      ],
    });
  if (u.hostname === 'analyticsdata.googleapis.com') {
    const b = body(init);
    if (p === `/v1beta/properties/${property}:runReport`)
      return json(ga4Report(world, b));
    if (p === `/v1beta/properties/${property}:batchRunReports`) {
      const requests = list(b.requests).map(object);
      if (!requests.length || requests.length > 5)
        throw new WorldUnsupported('a GA4 batch of 1–5 reports');
      return json({
        kind: 'analyticsData#batchRunReports',
        reports: requests.map((r) => ga4Report(world, r)),
      });
    }
    if (p === `/v1beta/properties/${property}:runRealtimeReport`)
      return json(ga4Realtime(world, b));
    return undefined;
  }
  const own = [site, `${world.origin}/`];
  if (
    u.hostname === 'www.googleapis.com' &&
    own.some(
      (s) =>
        p ===
        `/webmasters/v3/sites/${encodeURIComponent(s)}/searchAnalytics/query`,
    )
  )
    return gsc(world, body(init));
  if (
    u.hostname === 'searchconsole.googleapis.com' &&
    p === '/v1/urlInspection/index:inspect'
  ) {
    const b = body(init);
    if (!own.includes(text(b.siteUrl)))
      throw new WorldUnsupported('another Search Console property');
    return inspection(world, text(b.inspectionUrl), text(b.siteUrl));
  }
  const sitemapSite = p.match(/^\/webmasters\/v3\/sites\/([^/]+)\/sitemaps$/);
  if (u.hostname === 'www.googleapis.com' && sitemapSite) {
    if (!own.includes(decodeURIComponent(sitemapSite[1])))
      throw new WorldUnsupported('another Search Console property');
    return sitemaps(world, u.searchParams.get('sitemapIndex'));
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
