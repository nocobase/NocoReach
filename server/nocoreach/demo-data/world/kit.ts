import { createHash } from 'node:crypto';

export type Language = 'zh-CN' | 'en-US';
export type Json = Record<string, unknown>;

export const DAY = 86_400_000;
export const HOUR = 3_600_000;

/** A request this world does not answer; the demo upstream refuses it rather than sending it anywhere. */
export class WorldUnsupported extends Error {
  readonly code = 'demo_world_unsupported';
  constructor(operation: string) {
    super(`The demo world does not answer ${operation}`);
  }
}

/** Stable pseudo-random numbers: the same key gives the same value, so a day's data reads the same all day. */
export class Seeded {
  constructor(private readonly seed: string) {}
  hash(key: string): string {
    return createHash('sha256').update(`${this.seed}|${key}`).digest('hex');
  }
  /** In [0, 1). A fast non-cryptographic hash (cyrb53): reports draw hundreds of thousands of these. */
  unit(key: string): number {
    const text = `${this.seed}|${key}`;
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 =
      Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
      Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 =
      Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
      Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)) / 2 ** 53;
  }
  int(key: string, max: number): number {
    return Math.floor(this.unit(key) * max);
  }
  /** Around 1, within ±spread. */
  jitter(key: string, spread: number): number {
    return 1 + (this.unit(key) * 2 - 1) * spread;
  }
  /** Rounds an expected count up or down so many small shares still add up to about their total. */
  round(key: string, expected: number): number {
    return Math.floor(expected + this.unit(key));
  }
  id(key: string, digits = 9): number {
    return 10 ** (digits - 1) + this.int(key, 9 * 10 ** (digits - 1));
  }
}

export const iso = (t: number): string => new Date(t).toISOString();
export const day = (t: number): string => iso(t).slice(0, 10);
export const startOfDay = (t: number): number => Date.parse(day(t));
export const isDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Days from `start` to `end`, inclusive, as YYYY-MM-DD. */
export function daysBetween(start: string, end: string): string[] {
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  if ((to - from) / DAY >= 550)
    throw new WorldUnsupported('a window over 550 days');
  return Array.from({ length: (to - from) / DAY + 1 }, (_, i) =>
    day(from + i * DAY),
  );
}

export const object = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : {};
export const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
export const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
export const integer = (value: unknown, fallback = 0): number =>
  value !== null &&
  value !== undefined &&
  value !== '' &&
  Number.isFinite(Number(value))
    ? Math.max(0, Math.floor(Number(value)))
    : fallback;
export const names = (value: unknown): string[] =>
  list(value).map((v) => (typeof v === 'string' ? v : text(object(v).name)));

export const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
export const textResponse = (
  value: string,
  type = 'text/plain; charset=utf-8',
  status = 200,
): Response =>
  new Response(value, { status, headers: { 'content-type': type } });
export const notFound = (): Response =>
  json({ message: 'Not Found', error: 'not_found' }, 404);

export function body(init: RequestInit): Json {
  if (init.body === undefined || init.body === null) return {};
  if (init.body instanceof URLSearchParams)
    return Object.fromEntries(init.body);
  if (typeof init.body !== 'string')
    throw new WorldUnsupported('a non-text request body');
  try {
    const parsed: unknown = JSON.parse(init.body);
    return Array.isArray(parsed) ? { tasks: parsed } : object(parsed);
  } catch {
    return Object.fromEntries(new URLSearchParams(init.body));
  }
}

export function slice<T>(
  rows: readonly T[],
  offset: unknown,
  limit: unknown,
  fallback = 100,
): T[] {
  const from = integer(offset);
  return rows.slice(
    from,
    from + Math.min(25_000, Math.max(1, integer(limit, fallback))),
  );
}

/** Opaque `c<offset>` cursors over a stable list. */
export function cursorPage<T>(
  rows: readonly T[],
  cursor: unknown,
  limit: unknown,
  fallback = 100,
): { items: T[]; next: string } {
  const raw = text(cursor);
  const match = raw ? /^c(\d+)$/.exec(raw) : null;
  if (raw && !match) throw new WorldUnsupported('an unknown cursor');
  const offset = match ? Number(match[1]) : 0;
  const items = slice(rows, offset, limit, fallback);
  return {
    items,
    next:
      offset + items.length < rows.length ? `c${offset + items.length}` : '',
  };
}

/** GitHub-style `page`/`per_page`. */
export const restPage = <T>(rows: readonly T[], u: URL, fallback = 30): T[] => {
  const per = Math.max(
    1,
    Math.min(100, integer(u.searchParams.get('per_page'), fallback)),
  );
  const page = Math.max(1, integer(u.searchParams.get('page'), 1));
  return rows.slice((page - 1) * per, page * per);
};

export const escapeHtml = (s: string): string =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** Normalized weights, so shares of a total always add up to one. */
export function shares<T extends { weight: number }>(
  rows: readonly T[],
): (T & { share: number })[] {
  const total = rows.reduce((sum, row) => sum + row.weight, 0) || 1;
  return rows.map((row) => ({ ...row, share: row.weight / total }));
}
