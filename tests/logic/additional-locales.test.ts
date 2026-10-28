// @vitest-environment node
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

/** Preserve numbered, named single-brace and i18next placeholders. */
const slots = (value: string) =>
  [...new Set(value.match(/\{\{[^{}]+\}\}|\{(?:\d+|[A-Za-z_]\w*)\}/gu) ?? [])]
    .sort()
    .join(' ');

/** Names each key a translation lacks, adds or interpolates differently from English. */
function differences(
  source: ReadonlyMap<string, string>,
  translation: ReadonlyMap<string, string>,
  locale?: string,
): string[] {
  // CLDR languages such as Russian need forms that the English catalog does not have.
  const categories = new Set(
    locale
      ? new Intl.PluralRules(locale).resolvedOptions().pluralCategories
      : [],
  );
  const sourceKey = (key: string): string => {
    if (source.has(key)) return key;
    const match = /^(.*)_(zero|one|two|few|many|other)$/.exec(key);
    return match && categories.has(match[2] as Intl.LDMLPluralRule)
      ? source.has(`${match[1]}_other`)
        ? `${match[1]}_other`
        : match[1]
      : key;
  };
  const sameSlots = (key: string, original: string, translated: string) => {
    const expected = slots(original);
    const actual = slots(translated);
    if (expected === actual) return true;
    // Russian "one" includes 21 and 101, so an English singular without a count may need it.
    return (
      locale === 'ru-RU' &&
      key.endsWith('_one') &&
      !expected.includes('{{count}}') &&
      slots(`${original} {{count}}`) === actual &&
      slots(source.get(key.replace(/_one$/u, '_other')) ?? '') === actual
    );
  };
  return [
    ...[...source.keys()]
      .filter((key) => !translation.has(key))
      .map((key) => 'missing ' + key),
    ...[...translation.keys()]
      .filter((key) => !source.has(sourceKey(key)))
      .map((key) => 'extra ' + key),
    ...[...source]
      .filter(
        ([key, value]) =>
          translation.has(key) && !sameSlots(key, value, translation.get(key)!),
      )
      .map(
        ([key, value]) =>
          `placeholders ${key}: "${slots(value)}" in English, "${slots(translation.get(key)!)}" translated`,
      ),
    ...[...translation]
      .filter(
        ([key, value]) =>
          !source.has(key) &&
          source.has(sourceKey(key)) &&
          slots(value) !== slots(source.get(sourceKey(key))!),
      )
      .map(([key]) => `placeholders ${key}: differ from ${sourceKey(key)}`),
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
  it('checks locale-specific plural forms against their source placeholders', () => {
    const singularSource = new Map([
      ['runs_one', 'The last run succeeded'],
      ['runs_other', '{{count}} runs succeeded'],
    ]);
    const numberedSingular = new Map([
      ['runs_one', 'Успешных запусков: {{count}}'],
      ['runs_other', 'Успешных запусков: {{count}}'],
    ]);
    expect(differences(singularSource, numberedSingular, 'ru-RU')).toEqual([]);
    expect(differences(singularSource, numberedSingular, 'ko-KR')).toHaveLength(
      1,
    );
    const source = new Map([['items_other', '{{count}} items']]);
    expect(
      differences(
        source,
        new Map([
          ['items_other', '{{count}} элемента'],
          ['items_few', '{{count}} элемента'],
          ['items_many', '{{count}} элементов'],
        ]),
        'ru-RU',
      ),
    ).toEqual([]);
    expect(
      differences(
        source,
        new Map([
          ['items_other', '{{count}} элемента'],
          ['items_few', '{{total}} элемента'],
          ['items_two', '{{count}} элемента'],
          ['unknown_many', '{{count}} элементов'],
        ]),
        'ru-RU',
      ),
    ).toEqual([
      'extra items_two',
      'extra unknown_many',
      'placeholders items_few: differ from items_other',
    ]);
  });

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
          ['a.singleNamed', 'Hi {name}'],
        ]),
        new Map([
          ['a.kept', 'Behalten'],
          ['a.extra', 'Extra'],
          ['a.slots', '{0} von'],
          ['a.named', 'Hallo {{user}}'],
          ['a.singleNamed', 'Hallo {user}'],
        ]),
      ),
    ).toEqual([
      'missing a.missing',
      'extra a.extra',
      'placeholders a.slots: "{0} {1}" in English, "{0}" translated',
      'placeholders a.named: "{{name}}" in English, "{{user}}" translated',
      'placeholders a.singleNamed: "{name}" in English, "{user}" translated',
    ]);
  });

  it.each(additionalLocales)(
    'shared/i18n/%s.json matches the keys and placeholders of en.json',
    (locale) => {
      expect(
        differences(businessSource, read(`shared/i18n/${locale}.json`), locale),
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
          locale,
        ),
      ).toEqual([]);
    },
  );

  it.each(['ko-KR', 'ru-RU'])(
    '%s supplies installed plugin keys, placeholders and required plural forms',
    async (locale) => {
      for (const side of ['client', 'server'] as const) {
        const resources = JSON.parse(
          fs.readFileSync(
            `${root}${side}/locales/translations/plugins-${locale}.json`,
            'utf8',
          ),
        );
        const plugins = new Set(
          fs
            .readFileSync(`${root}${side}/plugins.ts`, 'utf8')
            .match(/@nocobase\/app-plugin-[a-z-]+/gu),
        );
        let checked = 0;
        for (const plugin of plugins) {
          const file = `${root}node_modules/${plugin}/dist/${side}/locales/en-US.js`;
          if (!fs.existsSync(file)) continue;
          const englishResource = (
            await import(/* @vite-ignore */ pathToFileURL(file).href)
          ).default;
          const source = leaves(englishResource);
          if (!source.size) continue;
          checked += 1;
          if (side === 'client') {
            const overrides = enUS.overrides as Record<
              string,
              Record<string, unknown>
            >;
            for (const [key, value] of leaves(overrides[plugin] ?? {}))
              source.set(key, value);
          }
          const translation = leaves(resources[plugin] ?? {});
          expect(
            differences(source, translation, locale),
            `${side}: ${plugin}`,
          ).toEqual([]);
          for (const key of source.keys()) {
            if (!key.endsWith('_other')) continue;
            for (const category of new Intl.PluralRules(
              locale,
            ).resolvedOptions().pluralCategories) {
              expect(
                translation.has(key.replace(/_other$/u, `_${category}`)),
                `${side}: ${plugin}.${key} (${category})`,
              ).toBe(true);
            }
          }
        }
        expect(checked, `${side}: installed plugin catalogs`).toBeGreaterThan(
          0,
        );
      }
    },
  );
});
