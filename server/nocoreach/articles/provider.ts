import {
  ARTICLE_FIELDS,
  type ArticleCapabilities,
  type ArticleContent,
  type ArticleFields,
  type ArticleSnapshot,
  type ArticleSummary,
} from '../../../shared/article-publishing.js';

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Only the fields to change; absent locales and fields keep the target's current value. */
export type ArticleChanges = Partial<
  Pick<ArticleContent, 'slug' | 'status'>
> & {
  locales: Record<string, ArticleFields>;
};

export type ArticleErrorCode =
  | 'conflict'
  | 'not_found'
  | 'slug_taken'
  | 'unauthorized'
  | 'invalid'
  | 'unavailable'
  // The request may have reached the target; read it again before retrying.
  | 'unknown_outcome';

/** The translation key of a provider error (`articles.provider.unknownOutcome`). */
export const providerErrorKey = (code: ArticleErrorCode) =>
  `articles.provider.${code.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;

export class ArticleError extends Error {
  constructor(
    readonly code: ArticleErrorCode,
    message: string = code,
    readonly current?: ArticleSnapshot,
  ) {
    super(message);
  }
  get status() {
    return this.code === 'not_found'
      ? 404
      : this.code === 'invalid'
        ? 400
        : this.code === 'unavailable' || this.code === 'unknown_outcome'
          ? 503
          : 409;
  }
}

/** A request that got no answer. The transport error stays as the cause, so a failure can say why. */
export const unreachable = (
  code: 'unavailable' | 'unknown_outcome',
  cause: unknown,
  message?: string,
) => Object.assign(new ArticleError(code, message), { cause });

// Credentials that an error text could carry: bearer tokens, URL user info, key-like parameters and GitHub tokens.
const SECRETS: [RegExp, string][] = [
  [/\b(Bearer|Basic)\s+[\w.~+/=-]{8,}/g, '$1 ***'],
  [/(\/\/)[^\s/@:]+:[^\s/@]+@/g, '$1***@'],
  [
    /\b((?:api[_-]?key|access[_-]?token|token|secret|password|passwd|authorization|sig|signature)["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi,
    '$1***',
  ],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/g, '***'],
];
const DETAIL_MAX = 500;

/**
 * Why a target request failed, for Technical details and the server log: an ArticleError's own detail (`github:429`, a
 * response snippet), the network layer's code, reason and host for a request that got no answer, or any other error's
 * name and message, following causes. One line, clipped, credentials masked. Undefined when there is nothing beyond
 * the code.
 */
export function errorDetail(error: unknown): string | undefined {
  const parts: string[] = [];
  let e: unknown = error;
  for (let depth = 0; e && depth < 4; depth++) {
    const o = e as Record<string, unknown>;
    const code = typeof o.code === 'string' ? o.code : '';
    if (e instanceof ArticleError) {
      if (e.message && e.message !== e.code) parts.push(e.message);
    } else if (typeof o.reason === 'string' && typeof o.host === 'string') {
      // outbound-network.ts networkFailure: its message is translated text and its cause only repeats the code.
      parts.push(
        `${code || 'network'} (${o.reason}) ${o.host}${o.proxied ? ' via proxy' : ''}`,
      );
      break;
    } else if (e instanceof Error)
      parts.push(
        `${e.name}: ${e.message}${code && !e.message.includes(code) ? ` (${code})` : ''}`,
      );
    else if (typeof e === 'string') parts.push(e);
    else if (code) parts.push(code);
    e = o.cause;
  }
  let text = parts.join(' ← ').replace(/\s+/g, ' ').trim();
  for (const [pattern, mask] of SECRETS) text = text.replace(pattern, mask);
  if (!text) return undefined;
  return text.length > DETAIL_MAX ? `${text.slice(0, DETAIL_MAX - 1)}…` : text;
}

/** One kind of publishing target. Conditional targets enforce `baseVersion` themselves in the write. */
export interface ArticleProvider {
  readonly capabilities: ArticleCapabilities;
  search(query: string, limit: number): Promise<ArticleSummary[]>;
  get(id: string): Promise<ArticleSnapshot>;
  findBySlug(slug: string): Promise<ArticleSnapshot | null>;
  create(
    content: ArticleContent,
    opts: { key: string },
  ): Promise<ArticleSnapshot>;
  update(
    id: string,
    changes: ArticleChanges,
    opts: { baseVersion: string; key: string },
  ): Promise<ArticleSnapshot>;
}

export const now = () => new Date().toISOString();
const norm = (v: unknown) =>
  typeof v === 'string' ? v.replace(/\r\n/g, '\n').replace(/\s+$/, '') : '';
export const sameText = (a: unknown, b: unknown) => norm(a) === norm(b);

/** Field-level differences between two versions of an article, as `locale.field` (plus `slug` and `status`). */
export function changedFields(
  from: ArticleContent | null,
  to: ArticleChanges | ArticleContent,
): string[] {
  const out: string[] = [];
  if (to.slug !== undefined && to.slug !== from?.slug) out.push('slug');
  if (to.status !== undefined && to.status !== from?.status) out.push('status');
  for (const [locale, fields] of Object.entries(to.locales))
    for (const field of ARTICLE_FIELDS)
      if (
        fields[field] !== undefined &&
        !sameText(fields[field], from?.locales[locale]?.[field])
      )
        out.push(`${locale}.${field}`);
  return out.sort();
}

export function valueAt(
  content: ArticleContent | ArticleChanges | null | undefined,
  path: string,
): string | undefined {
  if (!content) return undefined;
  if (path === 'slug') return content.slug;
  if (path === 'status') return content.status;
  const [locale, field] = path.split('.') as [string, keyof ArticleFields];
  return content.locales[locale]?.[field];
}

/** The changes a draft makes against its base: only fields whose value differs. */
export function changesOf(
  base: ArticleContent | null,
  draft: ArticleChanges,
): ArticleChanges {
  const out: ArticleChanges = { locales: {} };
  for (const path of changedFields(base, draft)) {
    if (path === 'slug') out.slug = draft.slug;
    else if (path === 'status') out.status = draft.status;
    else {
      const [locale, field] = path.split('.') as [string, keyof ArticleFields];
      (out.locales[locale] ||= {})[field] = draft.locales[locale][field];
    }
  }
  return out;
}

export const isEmpty = (c: ArticleChanges) =>
  c.slug === undefined &&
  c.status === undefined &&
  !Object.keys(c.locales).length;

/** Every change already holds in `current` (a retried write that reached the target). */
export const applied = (current: ArticleContent, changes: ArticleChanges) =>
  changedFields(current, changes).length === 0;

/** Read a JSON response; transport and server failures before a write map to `unavailable`. */
export async function json(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new ArticleError('unavailable', 'invalid_response');
  }
}

/** One property of a parsed JSON object, or undefined. */
export const field = (value: unknown, key: string): unknown =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)[key]
    : undefined;

/** A JSON scalar as text (ids may be numbers); anything else is empty. */
export const scalar = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : '';

export function httpError(status: number, body: unknown): ArticleError {
  const message = JSON.stringify(body ?? '').slice(0, 300);
  if (status === 401 || status === 403)
    return new ArticleError('unauthorized', message);
  if (status === 404) return new ArticleError('not_found', message);
  if (status === 409 || status === 412)
    return new ArticleError('conflict', message);
  if (status === 400 || status === 422)
    return new ArticleError('invalid', message);
  return new ArticleError('unavailable', message);
}

/** A write whose request failed in transit may still have been applied. */
export async function sendWrite(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetcher(url, init);
  } catch (error) {
    throw unreachable('unknown_outcome', error);
  }
}
