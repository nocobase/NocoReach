import { systemMessageText } from '../../shared/i18n/messages.js';
import { businessNow } from './business-clock.js';
import type { Connection } from './proxy-profiles.js';

/** The reporting window shared by data pages (data-views.ts). */
export interface ReportWindow {
  start: string;
  end: string;
  days: number;
  previousStart: string;
  previousEnd: string;
  all?: boolean;
}
export type WindowFor = (
  end: string,
  range: string,
  from: unknown,
  to: unknown,
  first?: string,
) => ReportWindow;

export interface CollectorKpi {
  key: string;
  label: string;
  value: number;
  previous: number | null;
  complete: boolean;
  change: number | null;
}

const day = (value: string | null | undefined) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;
const sum = (values: (number | null | undefined)[]) =>
  values.reduce<number>(
    (n, v) => n + (typeof v === 'number' && Number.isFinite(v) ? v : 0),
    0,
  );
const kpi = (
  key: string,
  value: number,
  previous: number | null,
): CollectorKpi => ({
  key,
  label: systemMessageText(`collectorView.${key}`),
  value,
  previous,
  complete: true,
  change: previous ? (value - previous) / previous : null,
});

/** Where a record came from, counted per origin on the data page's side card. */
export interface CollectorGroup {
  kind: 'term' | 'video' | 'channel';
  name: string;
  count: number;
}
export interface CollectorTrend {
  unit: 'day' | 'week' | 'month';
  points: { date: string; published: number }[];
}

const DAY_MS = 86400000;
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);
/**
 * Publications per bucket of the window, empty buckets included. Long windows (all time) are grouped by week or
 * month so the chart stays readable; a bucket is labelled by its first day inside the window.
 */
function trendOf(window: ReportWindow, days: string[]): CollectorTrend {
  const unit =
    window.days <= 92 ? 'day' : window.days <= 730 ? 'week' : 'month';
  const bucket = (date: string) => {
    if (unit === 'day') return date;
    if (unit === 'month') return date.slice(0, 7);
    // Weeks start on Monday.
    return addDays(
      date,
      -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7),
    );
  };
  const points = new Map<string, { date: string; published: number }>();
  for (let d = window.start; d <= window.end; d = addDays(d, 1)) {
    const key = bucket(d);
    if (!points.has(key)) points.set(key, { date: d, published: 0 });
  }
  for (const d of days) {
    const point = points.get(bucket(d));
    if (point) point.published += 1;
  }
  return { unit, points: [...points.values()] };
}
function groupsOf<T>(
  items: T[],
  origins: (item: T) => Omit<CollectorGroup, 'count'>[],
): CollectorGroup[] {
  const counts = new Map<string, CollectorGroup>();
  for (const item of items) {
    // A record found by the same origin twice still counts once there.
    const seen = new Set<string>();
    for (const { kind, name } of origins(item)) {
      const key = `${kind}\u0000${name}`;
      if (!name || seen.has(key)) continue;
      seen.add(key);
      const group = counts.get(key) ?? { kind, name, count: 0 };
      group.count += 1;
      counts.set(key, group);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 10);
}

/** How many records of the period a report returns: the page shows 20 and asks for more. */
export function reportLimit(values: Record<string, unknown>) {
  const limit = Number(values.limit);
  return Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 20;
}

/**
 * Collector platforms return a publication date and the counts read at collection time, never a series. A data page
 * therefore counts the saved records published in the range (falling back to when they were first collected) and
 * sums their latest counts; the previous period compares publications only. Metrics cover every record of the period;
 * `items` holds only the first `limit` of them in the asked order (`sort`: `published` or a metric key, `order`:
 * `desc` by default), and `matched` counts them all. Records whose sorted count is unknown go last either way.
 * `trend` counts publications per day (week, month for long windows) and `groups` the records per origin.
 */
export function collectorPeriod<T>(
  host: unknown,
  id: string,
  connection: Connection,
  values: Record<string, unknown>,
  windowFor: WindowFor,
  items: T[],
  dateOf: (item: T) => { published: string | null; seen: string },
  metrics: { key: string; value: (item: T) => number | null | undefined }[],
  origins: (item: T) => Omit<CollectorGroup, 'count'>[] = () => [],
) {
  const dated = items.map((item) => {
    const { published, seen } = dateOf(item);
    return { item, day: day(published) ?? day(seen) ?? '' };
  });
  const first = dated
    .map((d) => d.day)
    .filter(Boolean)
    .sort()[0];
  const end = new Date(businessNow(host, id, connection))
    .toISOString()
    .slice(0, 10);
  const window = windowFor(
    end,
    typeof values.range === 'string' && values.range ? values.range : '28',
    values.from,
    values.to,
    first,
  );
  const within = (a: string, b: string) =>
    dated.filter((d) => d.day && d.day >= a && d.day <= b);
  const current = within(window.start, window.end).sort((a, b) =>
    b.day.localeCompare(a.day),
  );
  const ascending = values.order === 'asc';
  const metric = metrics.find((m) => m.key === values.sort);
  if (metric) {
    const known = (item: T) => {
      const v = metric.value(item);
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    };
    // Newest first among equal counts; the sort is stable.
    current.sort((a, b) => {
      const x = known(a.item),
        y = known(b.item);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return ascending ? x - y : y - x;
    });
  } else if (ascending) current.sort((a, b) => a.day.localeCompare(b.day));
  const previous = window.all
    ? null
    : within(window.previousStart, window.previousEnd);
  return {
    window,
    matched: current.length,
    items: current.slice(0, reportLimit(values)).map((d) => d.item),
    trend: trendOf(
      window,
      current.map((d) => d.day),
    ),
    groups: groupsOf(
      current.map((d) => d.item),
      origins,
    ),
    kpis: [
      kpi('published', current.length, previous ? previous.length : null),
      ...metrics.map((m) =>
        kpi(m.key, sum(current.map((d) => m.value(d.item))), null),
      ),
      kpi('total', items.length, null),
    ],
  };
}
