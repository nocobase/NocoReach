/**
 * A timezone as people say it ("China Standard Time", "Eastern Time") rather than its IANA id. The generic name stays
 * the same across daylight saving; where the locale has none (UTC gives "GMT+00:00"), the specific name is used, and
 * the id itself when neither is known.
 */
export function timeZoneName(timeZone: string, locale?: string): string {
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
