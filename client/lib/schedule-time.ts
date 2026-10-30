import { CronExpressionParser } from 'cron-parser';
import { formatTime } from './format';

/** Show the next daily occurrence in browser time, using the scheduler's DST rules. */
export function dailyScheduleTime(
  schedule?: { cron: string | null; timezone?: string } | null,
  now = new Date(),
): string | null {
  const fields = String(schedule?.cron || '')
    .trim()
    .split(/\s+/);
  const daily = fields.length === 6 ? fields.slice(1) : fields;
  if (
    daily.length !== 5 ||
    daily.slice(2).some((field) => field !== '*') ||
    !/^\d+$/.test(daily[0]) ||
    !/^\d+$/.test(daily[1]) ||
    !schedule?.timezone
  )
    return null;
  try {
    const next = CronExpressionParser.parse(schedule.cron!, {
      currentDate: now,
      tz: schedule.timezone,
    })
      .next()
      .toDate();
    return formatTime(next);
  } catch {
    return null;
  }
}
