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
export type ArticleChanges = Partial<Pick<ArticleContent, 'slug' | 'status'>> & {
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
export const providerErrorKey = (code: ArticleErrorCode) => `articles.provider.${code.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;

export class ArticleError extends Error {
  constructor(
    readonly code: ArticleErrorCode,
    message: string = code,
    readonly current?: ArticleSnapshot,
  ) {
    super(message);
  }
  get status() {
    return this.code === 'not_found' ? 404 : this.code === 'invalid' ? 400 : this.code === 'unavailable' || this.code === 'unknown_outcome' ? 503 : 409;
  }
}

/** One kind of publishing target. Conditional targets enforce `baseVersion` themselves in the write. */
export interface ArticleProvider {
  readonly capabilities: ArticleCapabilities;
  search(query: string, limit: number): Promise<ArticleSummary[]>;
  get(id: string): Promise<ArticleSnapshot>;
  findBySlug(slug: string): Promise<ArticleSnapshot | null>;
  create(content: ArticleContent, opts: { key: string }): Promise<ArticleSnapshot>;
  update(id: string, changes: ArticleChanges, opts: { baseVersion: string; key: string }): Promise<ArticleSnapshot>;
}

export const now = () => new Date().toISOString();
const norm = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').replace(/\s+$/, '') : '');
export const sameText = (a: unknown, b: unknown) => norm(a) === norm(b);

/** Field-level differences between two versions of an article, as `locale.field` (plus `slug` and `status`). */
export function changedFields(from: ArticleContent | null, to: ArticleChanges | ArticleContent): string[] {
  const out: string[] = [];
  if (to.slug !== undefined && to.slug !== from?.slug) out.push('slug');
  if (to.status !== undefined && to.status !== from?.status) out.push('status');
  for (const [locale, fields] of Object.entries(to.locales))
    for (const field of ARTICLE_FIELDS)
      if (fields[field] !== undefined && !sameText(fields[field], from?.locales[locale]?.[field])) out.push(`${locale}.${field}`);
  return out.sort();
}

export function valueAt(content: ArticleContent | ArticleChanges | null | undefined, path: string): string | undefined {
  if (!content) return undefined;
  if (path === 'slug') return content.slug;
  if (path === 'status') return content.status;
  const [locale, field] = path.split('.') as [string, keyof ArticleFields];
  return content.locales[locale]?.[field];
}

/** The changes a draft makes against its base: only fields whose value differs. */
export function changesOf(base: ArticleContent | null, draft: ArticleChanges): ArticleChanges {
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

export const isEmpty = (c: ArticleChanges) => c.slug === undefined && c.status === undefined && !Object.keys(c.locales).length;

/** Every change already holds in `current` (a retried write that reached the target). */
export const applied = (current: ArticleContent, changes: ArticleChanges) => changedFields(current, changes).length === 0;

/** Read a JSON response; transport and server failures before a write map to `unavailable`. */
export async function json(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new ArticleError('unavailable', 'invalid_response');
  }
}

export function httpError(status: number, body: unknown): ArticleError {
  const message = JSON.stringify(body ?? '').slice(0, 300);
  if (status === 401 || status === 403) return new ArticleError('unauthorized', message);
  if (status === 404) return new ArticleError('not_found', message);
  if (status === 409 || status === 412) return new ArticleError('conflict', message);
  if (status === 400 || status === 422) return new ArticleError('invalid', message);
  return new ArticleError('unavailable', message);
}

/** A write whose request failed in transit may still have been applied. */
export async function sendWrite(fetcher: Fetcher, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetcher(url, init);
  } catch {
    throw new ArticleError('unknown_outcome');
  }
}
