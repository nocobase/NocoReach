import { DAY } from './kit.js';
import type { Change } from './script/types.js';

/** A change's factor on a day `ago` days back, relative to today's level. */
function factor(change: Change, ago: number): number {
  if (change.kind === 'launch') {
    if (ago > change.at) return 0;
    return Math.min(1, (change.at - ago + 1) / (change.ramp ?? 7));
  }
  if (change.kind === 'spike') {
    if (ago > change.at) return 1;
    return (
      1 + change.size * 0.5 ** ((change.at - ago) / (change.halfLife ?? 1.5))
    );
  }
  const over = Math.max(1, change.over ?? 3);
  const before = 1 / change.to;
  if (ago >= change.at) return before;
  if (ago <= change.at - over) return 1;
  return before + ((change.at - ago) / over) * (1 - before);
}

/** The level on a day `ago` days back as a multiple of today's, from all changes together. */
export const level = (
  changes: readonly Change[] | undefined,
  ago: number,
): number =>
  (changes ?? []).reduce((value, change) => value * factor(change, ago), 1);

// Business tools are used on weekdays: Monday to Sunday.
const WEEK = [1.08, 1.1, 1.08, 1.05, 0.95, 0.58, 0.62];
const WEEK_MEAN = WEEK.reduce((sum, v) => sum + v, 0) / WEEK.length;

/** A day's share of a normal week, with the week averaging one. */
export function weekday(date: string): number {
  const index = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return WEEK[index] / WEEK_MEAN;
}

/** Slow growth: the site had a little over half of today's visits eighteen months ago. */
export const growth = (ago: number): number => 0.9989 ** ago;

/** Annual planning peaks and holiday slowdowns differ between the two product audiences. */
export function annualDemand(date: string, crm: boolean): number {
  const month = Number(date.slice(5, 7)) - 1;
  const monthly = crm
    ? [0.94, 0.98, 1.14, 1.02, 1.04, 1.12, 0.88, 0.91, 1.18, 1.08, 1.12, 0.79]
    : [1.12, 1.02, 1.08, 1.04, 1.01, 0.96, 0.84, 0.9, 1.14, 1.08, 1.02, 0.75];
  return monthly[month];
}

/** Whole days between a YYYY-MM-DD date and today's. */
export const daysAgo = (date: string, today: string): number =>
  Math.round((Date.parse(today) - Date.parse(date)) / DAY);

// A day's visits by hour, quieter at night; sums to 100.
const HOURS = [
  1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 4, 3, 3,
];

/** The share of a day's visits in hour `hour`. */
export const hourShare = (hour: number): number => HOURS[hour] / 100;

/** The share of a day's visits before the start of hour `hour`. */
export const shareBefore = (hour: number): number =>
  HOURS.slice(0, hour).reduce((sum, v) => sum + v, 0) / 100;

/** The local calendar day and hour of an instant in a time zone. */
export function localTime(
  t: number,
  timeZone: string,
): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(t)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

/** Days before `date`. */
export const shiftDay = (date: string, days: number): string =>
  new Date(Date.parse(date) - days * DAY).toISOString().slice(0, 10);
