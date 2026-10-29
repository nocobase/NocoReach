// @vitest-environment node
import { expect, it } from 'vitest';
import { timeZoneName } from '../../client/lib/time-zone-name.js';

function existingName(timeZone: string, locale: string): string {
  const name = (style: 'longGeneric' | 'long') =>
    new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: style })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value;
  const generic = name('longGeneric');
  if (generic && !/^GMT[+-]/.test(generic)) return generic;
  const specific = name('long');
  return specific && !/^GMT[+-]/.test(specific) ? specific : timeZone;
}

it.each(['UTC', 'Etc/UTC', 'Etc/UCT', 'Zulu', 'GMT', 'Etc/GMT', 'Greenwich'])(
  'keeps %s as UTC in Chinese UI and preserves the English name',
  (timeZone) => {
    expect(timeZoneName(timeZone, 'zh-CN')).toBe('UTC');
    expect(timeZoneName(timeZone, 'en-US')).toBe(
      existingName(timeZone, 'en-US'),
    );
  },
);

it('uses the short Intl timezone name for non-UTC Chinese displays', () => {
  const timeZone = 'America/Los_Angeles';
  const locale = 'zh-CN';
  const shortName = new Intl.DateTimeFormat(locale, {
    timeZone,
    timeZoneName: 'short',
  })
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')?.value;

  expect(timeZoneName(timeZone, locale)).toBe(shortName);
  expect(timeZoneName(timeZone, 'en-US')).toBe(existingName(timeZone, 'en-US'));
});
