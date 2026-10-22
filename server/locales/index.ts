import type { LocaleLoaders } from '@nocobase/i18n';

// The languages the application offers. A plugin's locale file supplies translations for the languages listed here;
// it never adds one, so a language belongs in this map before anything can be served in it.
const locales: LocaleLoaders = {
  'en-US': () => import('./en-US.js'),
  'zh-CN': () => import('./zh-CN.js'),
  'zh-TW': () => import('./zh-TW.js'),
  'ja-JP': () => import('./ja-JP.js'),
  'es-ES': () => import('./es-ES.js'),
  'pt-BR': () => import('./pt-BR.js'),
  'fr-FR': () => import('./fr-FR.js'),
  'de-DE': () => import('./de-DE.js'),
  'vi-VN': () => import('./vi-VN.js'),
  'id-ID': () => import('./id-ID.js'),
};

export default locales;
