import { addDays, addMonths, format } from 'date-fns';
import { getCurrentLocale, isChinese } from '#i18n';
import { formatDate } from '#lib/format';

// The days a snooze is set to and how they read (task-snooze.tsx). A day is the calendar day "2026-11-11"; the server
// turns it into 09:00 of that day in the daily analysis's time zone (server/nocoreach/execution/snooze.ts).

export const dayOf = (d: Date) => format(d, 'yyyy-MM-dd');
/** The days the quick choices stand for, counted from today in the browser. */
export const snoozeDays = (today = new Date()) => ({
  week: dayOf(addDays(today, 7)),
  twoWeeks: dayOf(addDays(today, 14)),
  month: dayOf(addMonths(today, 1)),
});

/** A snooze day in a sentence: "Nov 11" (in Chinese, with spaces around the month and day), with the year when it is not this year. */
export function snoozeDay(day: string, now = new Date()): string {
  const [year, month, date] = day.split('-').map(Number);
  const other = year !== now.getFullYear();
  if (isChinese()) return `${other ? `${year} 年 ` : ''}${month} 月 ${date} 日`;
  return new Intl.DateTimeFormat(getCurrentLocale(), {
    month: 'short',
    day: 'numeric',
    ...(other ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}
/** Its day of the week: "Tue". */
export const snoozeWeekday = (day: string) =>
  new Intl.DateTimeFormat(getCurrentLocale(), {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
/** As the task list shows it: "Nov 11 Tue". */
export const snoozeListDay = (day: string) =>
  `${formatDate(day)} ${snoozeWeekday(day)}`;
