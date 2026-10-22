import { useTranslation } from '@nocobase/i18n/client';
import cronstrue from 'cronstrue';
import 'cronstrue/locales/zh_CN';
import 'cronstrue/locales/zh_TW';
import 'cronstrue/locales/ja';
import 'cronstrue/locales/es';
import 'cronstrue/locales/pt_BR';
import 'cronstrue/locales/fr';
import 'cronstrue/locales/de';
import 'cronstrue/locales/vi';
import 'cronstrue/locales/id';
import { resolveLocale } from '../../../shared/i18n/locales';

import { timeZoneName } from '#lib/time-zone-name';
import { ANALYSIS_SCHEDULE, dailyTime, type Schedule } from './data.js';

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
    /** The daily analysis by its name in this language; the Scheduler keeps the title it was defined with. */
    name: (schedule: Pick<Schedule, 'key' | 'title'>) =>
      schedule.key === ANALYSIS_SCHEDULE
        ? t('schedules.analysisTitle')
        : schedule.title,
    cron: (value: string) => {
      // Reuse the native daily-time wording shown on schedule cards.
      const time =
        /^\s*(?:[0-5]?\d)\s+(?:[01]?\d|2[0-3])\s+\*\s+\*\s+\*\s*$/.test(value)
          ? dailyTime(value)
          : null;
      if (time) return t('schedules.dailyAt', { time });
      try {
        return cronstrue.toString(value, {
          locale: {
            'en-US': 'en',
            'zh-CN': 'zh_CN',
            'zh-TW': 'zh_TW',
            'ja-JP': 'ja',
            'es-ES': 'es',
            'pt-BR': 'pt_BR',
            'fr-FR': 'fr',
            'de-DE': 'de',
            'vi-VN': 'vi',
            'id-ID': 'id',
          }[resolveLocale(locale)],
          use24HourTimeFormat: true,
        });
      } catch {
        return t('schedules.customSchedule');
      }
    },
    number: (value: number) => new Intl.NumberFormat(locale).format(value),
  };
}
