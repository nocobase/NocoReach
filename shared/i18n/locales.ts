/** Application UI languages; content-generation language remains a project setting. */
export const supportedLocales = [
  'en-US',
  'zh-CN',
  'zh-TW',
  'ja-JP',
  'es-ES',
  'pt-BR',
  'fr-FR',
  'de-DE',
  'vi-VN',
  'id-ID',
] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export function resolveLocale(value: string): SupportedLocale {
  const tag = value.toLowerCase().replaceAll('_', '-');
  const exact = supportedLocales.find((locale) => locale.toLowerCase() === tag);
  if (exact) return exact;
  if (/^zh-(?:tw|hk|mo|hant)(?:-|$)/.test(tag)) return 'zh-TW';
  return (
    supportedLocales.find(
      (locale) => locale.split('-')[0] === tag.split('-')[0],
    ) ?? 'en-US'
  );
}
