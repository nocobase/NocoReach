import {
  supportedLocales,
  type SupportedLocale,
} from '../../shared/i18n/locales';

/** The languages a project's AI-written content can be in: the UI languages (2026-10-24). */
export const contentLanguages = supportedLocales;

// Each language named in itself, as the account menu's language list names it: the two Chinese by script, Indonesian
// by its own name, and every name with a capital, as a menu item has.
const TAGS: Partial<Record<SupportedLocale, string>> = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
};
const OWN_NAMES: Partial<Record<SupportedLocale, string>> = {
  'id-ID': 'Bahasa Indonesia',
};

export function contentLanguageName(locale: SupportedLocale): string {
  const tag = TAGS[locale] ?? locale.split('-')[0];
  let name = OWN_NAMES[locale] ?? locale;
  if (!OWN_NAMES[locale])
    try {
      name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? name;
    } catch {
      // The tag stands.
    }
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/** A project's content language; projects made before it could be chosen write Chinese. */
export const contentLanguageOf = (language: unknown): SupportedLocale =>
  contentLanguages.find((l) => l === language) ?? 'zh-CN';
