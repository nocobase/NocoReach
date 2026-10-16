import { calendarDateInTimeZone } from './google-sync.js';
import { businessNow } from './business-clock.js';

export const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const validDate = (date: unknown): date is string =>
  typeof date === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
  new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = shiftDate(date, 1))
    dates.push(date);
  return dates;
}
export function historyBounds(host: unknown, id: string | number) {
  const today = calendarDateInTimeZone(
    'America/Los_Angeles',
    new Date(businessNow(host, id, 'google')),
  );
  const month = new Date(`${today}T00:00:00Z`);
  month.setUTCDate(1);
  month.setUTCMonth(month.getUTCMonth() - 16);
  const day = Math.min(
    Number(today.slice(8)),
    new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
    ).getUTCDate(),
  );
  month.setUTCDate(day);
  return {
    earliest: month.toISOString().slice(0, 10),
    cutoff: shiftDate(today, -3),
  };
}
export function intervals(dates: string[]) {
  const result: { start: string; end: string; days: number }[] = [];
  for (const date of [...new Set(dates)].sort()) {
    const last = result.at(-1);
    if (last && shiftDate(last.end, 1) === date) {
      last.end = date;
      last.days++;
    } else result.push({ start: date, end: date, days: 1 });
  }
  return result;
}
export function validOverview(
  payload: unknown,
  date: string,
): payload is {
  date: string;
  clicks: number;
  impressions: number;
  position: number;
}[] {
  return (
    Array.isArray(payload) &&
    payload.every(
      (row: unknown) =>
        row !== null &&
        typeof row === 'object' &&
        'date' in row &&
        'clicks' in row &&
        'impressions' in row &&
        'position' in row &&
        row.date === date &&
        Number.isFinite(row.clicks) &&
        typeof row.clicks === 'number' &&
        row.clicks >= 0 &&
        Number.isFinite(row.impressions) &&
        typeof row.impressions === 'number' &&
        row.impressions >= 0 &&
        Number.isFinite(row.position),
    )
  );
}
export function historyCoverage(
  parts: { date: string; payload: unknown; updatedAt?: string }[],
  start: string,
  end: string,
) {
  const byDate = new Map(
    parts
      .filter((p) => validOverview(p.payload, p.date))
      .map((p) => [p.date, p]),
  );
  const dates = datesBetween(start, end);
  const records = dates.filter(
    (d) => (byDate.get(d)?.payload as unknown[] | undefined)?.length,
  );
  const noRecords = dates.filter(
    (d) => byDate.has(d) && !(byDate.get(d)?.payload as unknown[]).length,
  );
  const missing = dates.filter((d) => !byDate.has(d));
  return {
    start,
    end,
    days: dates.length,
    recordedDays: records.length,
    noRecordDays: noRecords.length,
    missingDays: missing.length,
    records: intervals(records),
    noRecords: intervals(noRecords),
    missing: intervals(missing),
    updatedAt:
      dates
        .map((d) => byDate.get(d)?.updatedAt)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
  };
}
