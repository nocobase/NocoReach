import { useNocoReachLocale } from '#i18n';
import {
  enUS,
  zhCN,
  zhTW,
  ja,
  es,
  ptBR,
  fr,
  de,
  vi,
  id,
  ko,
  ru,
} from 'react-day-picker/locale';
import { resolveLocale } from '../../shared/i18n/locales';

/** The calendar's language: the interface's, as every date picker shows it. */
export function useDayPickerLocale() {
  const localeCode = useNocoReachLocale();
  return {
    'en-US': enUS,
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    'ja-JP': ja,
    'es-ES': es,
    'pt-BR': ptBR,
    'fr-FR': fr,
    'de-DE': de,
    'vi-VN': vi,
    'id-ID': id,
    'ko-KR': ko,
    'ru-RU': ru,
  }[resolveLocale(localeCode)];
}
