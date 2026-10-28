import { subset, validRange } from 'semver';
import type {
  DiscoveryEvidence,
  DiscoveryMatch,
  DiscoveryRule,
} from '../../../shared/github-discovery.js';
import { systemMessageText } from '../../../shared/i18n/messages.js';

import { ruleSchema } from '../../../shared/github-discovery-validation.js';
export function fail(key: string, status = 400): never {
  throw Object.assign(new Error(systemMessageText(key)), { status });
}
export function parseRule(input: unknown): DiscoveryRule {
  const result = ruleSchema.safeParse(input);
  if (!result.success) fail('githubDiscovery.invalidRule');
  return result.data;
}
export type FileReader = (path: string) => Promise<string | null>;
const parseJson = (text: string | null): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(text ?? '');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};
const fieldOf = (obj: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object' && Object.hasOwn(value, key)
          ? (value as Record<string, unknown>)[key]
          : undefined,
      obj,
    );

/** Check declarations conservatively: an overlapping or unresolvable version does not prove adoption. */
export async function verifyRule(
  rule: DiscoveryRule,
  repo: string,
  commit: string,
  read: FileReader,
  at: string,
  base = '',
): Promise<DiscoveryMatch> {
  const evidence: DiscoveryEvidence[] = [];
  const cache = new Map<string, Promise<string | null>>();
  const file = (path: string) => {
    const full = base + path;
    if (!cache.has(full)) cache.set(full, read(full));
    return cache.get(full)!;
  };
  const add = (
    path: string,
    expected: string,
    actual: string | null,
    matched: boolean,
    field?: string,
  ) =>
    evidence.push({
      path: base + path,
      url: `https://github.com/${repo}/blob/${commit}/${(base + path).split('/').map(encodeURIComponent).join('/')}`,
      expected,
      actual: actual?.slice(0, 500) ?? null,
      matched,
      ...(field ? { field } : {}),
    });
  if (rule.dependencies.length) {
    const manifest = parseJson(await file('package.json'));
    for (const check of rule.dependencies) {
      let value: unknown;
      let section = 'dependencies';
      for (const name of [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
      ]) {
        const deps = manifest?.[name];
        if (
          deps &&
          typeof deps === 'object' &&
          Object.hasOwn(deps, check.name)
        ) {
          value = (deps as Record<string, unknown>)[check.name];
          section = name;
          break;
        }
      }
      const actual = typeof value === 'string' ? value : null;
      let matched = false;
      try {
        matched =
          !!actual &&
          !!validRange(actual, { includePrerelease: true }) &&
          subset(actual, check.range, { includePrerelease: true });
      } catch {
        /* An unresolvable declaration stays a candidate. */
      }
      add(
        'package.json',
        check.range,
        actual,
        matched,
        `${section}.${check.name}`,
      );
    }
  }
  for (const check of rule.files) {
    const text = await file(check.path);
    add(
      check.path,
      check.contains || check.path,
      text === null
        ? null
        : check.contains
          ? text.includes(check.contains)
            ? check.contains
            : ''
          : check.path,
      text !== null && (!check.contains || text.includes(check.contains)),
    );
  }
  for (const check of rule.json) {
    const value = fieldOf(parseJson(await file(check.path)), check.field);
    const actual = ['string', 'number', 'boolean'].includes(typeof value)
      ? String(value)
      : null;
    add(check.path, check.equals, actual, actual === check.equals, check.field);
  }
  return {
    ruleId: rule.id,
    commit,
    base,
    checkedAt: at,
    status: !evidence.length
      ? 'mention'
      : evidence.every((x) => x.matched)
        ? 'verified'
        : 'candidate',
    evidence,
  };
}
