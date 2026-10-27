import { $t, getCurrentLocale } from '#i18n';
import { timeZoneName } from '#lib/time-zone-name';
import type { AnalysisStatus } from './service';

/** The daily analysis time from the workflow's cron ("0 9 * * *"), in its time zone, named only when it is not the
 * browser's; null when the cron is not a daily time. Insights and Analysis rules say the same time. */
export function dailyAnalysisTime(
  schedule?: AnalysisStatus['schedule'],
): string | null {
  const [minute, hour] = String(schedule?.cron || '')
    .trim()
    .split(/\s+/);
  if (!/^\d+$/.test(minute || '') || !/^\d+$/.test(hour || '')) return null;
  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
    zone = schedule?.timezone,
    local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && zone !== local
    ? $t('strategy.timeInZone', {
        0: time,
        1: timeZoneName(zone, getCurrentLocale()),
      })
    : time;
}
