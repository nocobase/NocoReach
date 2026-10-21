import { useTranslation } from '@nocobase/i18n/client';
import cronstrue from 'cronstrue';
import 'cronstrue/locales/zh_CN';
import { timeZoneName } from '#lib/time-zone-name';

export function useScheduleFormatting() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dayOf = (value: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(value);
  return {
    timeZone,
    date: (value?: string) =>
      value && Number.isFinite(Date.parse(value))
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'medium',
            timeZone,
          }).format(new Date(value))
        : '—',
    /** "Today 09:00", "Tomorrow 09:00", or the date and time for other days, in the browser's timezone. */
    when: (value?: string) => {
      if (!value || !Number.isFinite(Date.parse(value))) return '—';
      const at = new Date(value);
      const time = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone,
      }).format(at);
      const offset =
        (Date.parse(dayOf(at)) - Date.parse(dayOf(new Date()))) / 86400000;
      if (offset === 0) return t('schedules.today', { time });
      if (offset === 1) return t('schedules.tomorrow', { time });
      if (offset === -1) return t('schedules.yesterday', { time });
      return new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone,
      }).format(at);
    },
    zone: (value: string) => timeZoneName(value, locale),
    cron: (value: string) => {
      try {
        return cronstrue.toString(value, {
          locale: locale.startsWith('zh') ? 'zh_CN' : 'en',
          use24HourTimeFormat: true,
        });
      } catch {
        return t('schedules.customSchedule');
      }
    },
    number: (value: number) => new Intl.NumberFormat(locale).format(value),
  };
}
