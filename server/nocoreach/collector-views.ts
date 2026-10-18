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

/**
 * Collector platforms return a publication date and the counts read at collection time, never a series. A data page
 * therefore counts the saved records published in the range (falling back to when they were first collected) and
 * sums their latest counts; the previous period compares publications only.
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
  const previous = window.all
    ? null
    : within(window.previousStart, window.previousEnd);
  return {
    window,
    items: current.map((d) => d.item),
    kpis: [
      kpi('published', current.length, previous ? previous.length : null),
      ...metrics.map((m) =>
        kpi(m.key, sum(current.map((d) => m.value(d.item))), null),
      ),
      kpi('total', items.length, null),
    ],
  };
}
