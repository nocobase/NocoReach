import { CronDate, CronExpressionParser } from 'cron-parser';

export function isScheduleTimezone(timezone: string): boolean {
  // Modern Intl also accepts numeric offsets, which are not IANA names.
  if (!timezone || /^[+-]/.test(timezone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function scheduleDay(date: Date, timezone?: string): string {
  const local = new CronDate(date, timezone);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
}

/** The first firing in today's task-local day, using the Jobs parser's DST rules. */
export function scheduledToday(
  cron: string,
  now = new Date(),
  timezone?: string,
): Date | null {
  const fields = String(cron || '')
    .trim()
    .split(/\s+/);
  const daily = fields.length === 6 ? fields.slice(1) : fields;
  if (
    daily.length !== 5 ||
    daily.slice(2).some((value) => value !== '*') ||
    !/^\d+$/.test(daily[0]) ||
    !/^\d+$/.test(daily[1])
  )
    return null;
  const midnight = new CronDate(now, timezone);
  midnight.setHours(0);
  midnight.setMinutes(0);
  midnight.setSeconds(0);
  midnight.setMilliseconds(0);
  // next() is exclusive: include a schedule at precisely midnight.
  const candidate = CronExpressionParser.parse(cron, {
    currentDate: new Date(midnight.getTime() - 1),
    tz: timezone,
  })
    .next()
    .toDate();
  return scheduleDay(candidate, timezone) === scheduleDay(now, timezone)
    ? candidate
    : null;
}
