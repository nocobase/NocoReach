/**
 * A timezone as people say it ("China Standard Time", "Eastern Time") rather than its IANA id. The generic name stays
 * the same across daylight saving; where the locale has none, the specific name is used. Chinese UI uses the short
 * timezone form, and falls back to the IANA id when no localized name is known.
 */
export function timeZoneName(timeZone: string, locale?: string): string {
  if (/^zh(?:-|$)/i.test(locale || '')) {
    try {
      const formatter = new Intl.DateTimeFormat(locale, {
        timeZone,
        timeZoneName: 'short',
      });
      if (formatter.resolvedOptions().timeZone === 'UTC') return 'UTC';
      return (
        formatter
          .formatToParts(new Date())
          .find((part) => part.type === 'timeZoneName')?.value || timeZone
      );
    } catch {
      // Keep the existing fallback for invalid timezone identifiers.
    }
  }

  const name = (style: 'longGeneric' | 'long') => {
    try {
      return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: style })
        .formatToParts(new Date())
        .find((part) => part.type === 'timeZoneName')?.value;
    } catch {
      return undefined;
    }
  };
  const generic = name('longGeneric');
  if (generic && !/^GMT[+-]/.test(generic)) return generic;
  const specific = name('long');
  return specific && !/^GMT[+-]/.test(specific) ? specific : timeZone;
}
