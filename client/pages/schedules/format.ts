import { useTranslation } from '@nocobase/i18n/client';
import cronstrue from 'cronstrue';
import 'cronstrue/locales/zh_CN';

export function useScheduleFormatting() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
