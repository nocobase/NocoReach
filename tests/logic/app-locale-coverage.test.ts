// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.ts';
import zhCN from '../../client/locales/zh-CN.ts';

const clientDirectory = fileURLToPath(new URL('../../client', import.meta.url));

/** Every addressable key of a locale, as the dot-separated path `t()` is called with. */
function translationKeys(
  resource: Record<string, unknown>,
  prefix = '',
): string[] {
  return Object.entries(resource).flatMap(([key, value]) => {
    if (!prefix && key === 'overrides') return [];
    const keyPath = prefix ? prefix + '.' + key : key;
    return value && typeof value === 'object'
      ? translationKeys(value as Record<string, unknown>, keyPath)
      : [keyPath.replace(/_(?:zero|one|two|few|many|other)$/u, '')];
  });
}

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.tsx?$/u.test(entry.name) &&
      !entryPath.includes(`${path.sep}locales${path.sep}`)
      ? [entryPath]
      : [];
  });
}

const english = new Set(translationKeys(enUS as Record<string, unknown>));
const chinese = new Set(translationKeys(zhCN as Record<string, unknown>));
/** The literal first argument of `t()`: `t('projects.title')`, but not the prefix of `t('appearance.' + mode)`. */
const calledKey = /(?<![$\w])t\(\s*'([^'$]+)'(?!\s*\+)/gu;
/** A key completed by concatenation, `t('appearance.' + mode)`: only its prefix is static. */
const concatenatedKey = /(?<![$\w])t\(\s*'([^']+)'\s*\+/gu;
/** A key a route or registry names for later translation: `navigation: { title: 'navigation.projects' }`. */
const namedKey =
  /\b(?:title|labelKey):\s*'([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+)'/gu;
/** A key the code completes at runtime, such as ``t(`projects.status.${status}`)``: only its prefix is static. */
const interpolatedKey = /(?<![$\w])t\(\s*\x60([^\x60]*?)\x24\{/gu;
/** `useTranslation('@nocobase/app-plugin-file')`: the file translates in a plugin's namespace, not the application's. */
const pluginNamespace = /\buseTranslation\(\s*'/u;

interface References {
  readonly file: string;
  readonly namespace?: string;
  readonly keys: readonly string[];
  readonly prefixes: readonly string[];
}

/**
 * The keys and key prefixes one source file references. Comment lines are skipped, and the rest is scanned as one
 * text, so a `t(` call that Prettier wrapped onto several lines is still read.
 */
function scan(source: string): {
  readonly keys: Set<string>;
  readonly prefixes: Set<string>;
} {
  const code = source
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\*)/u.test(line))
    .join('\n');
  const keys = new Set<string>();
  const prefixes = new Set<string>();
  for (const match of code.matchAll(calledKey)) keys.add(match[1]);
  for (const match of code.matchAll(namedKey)) keys.add(match[1]);
  for (const match of code.matchAll(interpolatedKey)) prefixes.add(match[1]);
  for (const match of code.matchAll(concatenatedKey)) prefixes.add(match[1]);
  return { keys, prefixes };
}

function referencedKeys(): References[] {
  return sourceFiles(clientDirectory).flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const relative = path.relative(clientDirectory, file);
    const settings = /^pages\/settings\/([^/]+)\//u.exec(relative)?.[1];
    // Migrated management pages keep the original namespace, including helpers
    // whose translator is passed in. Validate their application-owned overrides.
    if (!settings && pluginNamespace.test(source)) return [];
    const { keys, prefixes } = scan(source);
    return [
      {
        file: relative,
        namespace: settings ? `@nocobase/app-plugin-${settings}` : undefined,
        keys: [...keys].sort(),
        prefixes: [...prefixes].sort(),
      },
    ];
  });
}

describe('application translations', () => {
  const references = referencedKeys();

  const writtenFor = (
    written: ReadonlySet<string>,
    namespace?: string,
  ): ReadonlySet<string> => {
    if (!namespace) return written;
    const resource = written === english ? enUS : zhCN;
    const overrides = resource.overrides as Record<
      string,
      Record<string, unknown>
    >;
    // The three policy editors intentionally fall back to Authorization's
    // shared vocabulary through their useRulesTranslation helper.
    return new Set([
      ...translationKeys(overrides[namespace] ?? {}),
      ...(namespace.startsWith('@nocobase/app-plugin-authz-')
        ? translationKeys(overrides['@nocobase/app-plugin-authorization'])
        : []),
    ]);
  };

  const missing = (written: ReadonlySet<string>): string[] =>
    references.flatMap(({ file, keys, namespace }) =>
      keys
        .filter((key) => !writtenFor(written, namespace).has(key))
        .map((key) => key + ' (' + file + ')'),
    );
  const missingFamilies = (written: ReadonlySet<string>): string[] =>
    references.flatMap(({ file, prefixes, namespace }) =>
      prefixes
        .filter(
          (prefix) =>
            ![...writtenFor(written, namespace)].some((key) =>
              key.startsWith(prefix),
            ),
        )
        .map((prefix) => prefix + '… (' + file + ')'),
    );

  it('reads the keys the application uses', () => {
    // Guards the scan itself: a regex that quietly stops matching would turn this suite into a no-op.
    expect(
      references.reduce((total, { keys }) => total + keys.length, 0),
    ).toBeGreaterThan(10);
  });

  it('reads a t() call that Prettier wrapped onto several lines', () => {
    expect([
      ...scan("t(\n  'projects.delete.title',\n  { name },\n)").keys,
    ]).toEqual(['projects.delete.title']);
  });

  it('does not treat NocoReach $t() keys as framework locale keys', () => {
    expect([...scan("$t('保存'); t('projects.title')").keys]).toEqual([
      'projects.title',
    ]);
  });

  it('translates every key the application uses into English', () => {
    expect(missing(english)).toEqual([]);
  });

  it('translates every key the application uses into Chinese', () => {
    expect(missing(chinese)).toEqual([]);
  });

  it('translates the key families the application completes at runtime', () => {
    expect(missingFamilies(english)).toEqual([]);
    expect(missingFamilies(chinese)).toEqual([]);
  });
});
