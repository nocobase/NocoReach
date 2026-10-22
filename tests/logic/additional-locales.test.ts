// @vitest-environment node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import enUS from '../../client/locales/en-US.ts';
import english from '../../shared/i18n/en.json';
import { supportedLocales } from '../../shared/i18n/locales';

const root = fileURLToPath(new URL('../..', import.meta.url));
/** Simplified Chinese is checked against English in nocoreach-locale-coverage.test.ts. */
const additionalLocales = supportedLocales.filter(
  (locale) => locale !== 'en-US' && locale !== 'zh-CN',
);

/** Every translated string by the dot-separated path `t()` reads it with. */
function leaves(
  resource: Record<string, unknown>,
  prefix = '',
): Map<string, string> {
  return new Map(
    Object.entries(resource).flatMap(([key, value]) => {
      const path = prefix ? prefix + '.' + key : key;
      return value && typeof value === 'object'
        ? [...leaves(value as Record<string, unknown>, path)]
        : [[path, String(value)] as const];
    }),
  );
}

/** Business copy interpolates `{0}`; shell copy uses i18next's `{{name}}`. */
const slots = (value: string) =>
  [...new Set(value.match(/\{\{[^{}]+\}\}|\{\d+\}/gu) ?? [])].sort().join(' ');

/** Names each key a translation lacks, adds or interpolates differently from English. */
function differences(
  source: ReadonlyMap<string, string>,
  translation: ReadonlyMap<string, string>,
): string[] {
  return [
    ...[...source.keys()]
      .filter((key) => !translation.has(key))
      .map((key) => 'missing ' + key),
    ...[...translation.keys()]
      .filter((key) => !source.has(key))
      .map((key) => 'extra ' + key),
    ...[...source]
      .filter(
        ([key, value]) =>
          translation.has(key) && slots(value) !== slots(translation.get(key)!),
      )
      .map(
        ([key, value]) =>
          `placeholders ${key}: "${slots(value)}" in English, "${slots(translation.get(key)!)}" translated`,
      ),
  ];
}

/** Plugin rewordings are not part of the shape every language must match; the locale modules load them apart. */
function withoutOverrides(
  resource: Record<string, unknown>,
): Record<string, unknown> {
  const { overrides: _overrides, ...rest } = resource;
  return rest;
}

const read = (file: string) =>
  leaves(withoutOverrides(JSON.parse(fs.readFileSync(root + file, 'utf8'))));

const businessSource = leaves(english);
// The shell file supplies what client/locales/en-US.ts adds to en.json.
const shellSource = new Map(
  [...leaves(withoutOverrides(enUS as Record<string, unknown>))].filter(
    ([key]) => !businessSource.has(key),
  ),
);

describe('additional interface languages', () => {
  it('reads the English sources and names missing, extra and reworded keys', () => {
    expect(businessSource.size).toBeGreaterThan(1000);
    expect(shellSource.size).toBeGreaterThan(100);
    expect(
      differences(
        new Map([
          ['a.kept', 'Kept'],
          ['a.missing', 'Gone'],
          ['a.slots', '{0} of {1}'],
          ['a.named', 'Hi {{name}}'],
        ]),
        new Map([
          ['a.kept', 'Behalten'],
          ['a.extra', 'Extra'],
          ['a.slots', '{0} von'],
          ['a.named', 'Hallo {{user}}'],
        ]),
      ),
    ).toEqual([
      'missing a.missing',
      'extra a.extra',
      'placeholders a.slots: "{0} {1}" in English, "{0}" translated',
      'placeholders a.named: "{{name}}" in English, "{{user}}" translated',
    ]);
  });

  it.each(additionalLocales)(
    'shared/i18n/%s.json matches the keys and placeholders of en.json',
    (locale) => {
      expect(
        differences(businessSource, read(`shared/i18n/${locale}.json`)),
      ).toEqual([]);
    },
  );

  it.each(additionalLocales)(
    'client/locales/translations/%s.json matches the shell keys and placeholders of client/locales/en-US.ts',
    (locale) => {
      expect(
        differences(
          shellSource,
          read(`client/locales/translations/${locale}.json`),
        ),
      ).toEqual([]);
    },
  );
});
