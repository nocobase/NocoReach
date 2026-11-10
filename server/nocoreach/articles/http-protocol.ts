import { z } from 'zod';
import {
  ARTICLE_CAPABILITIES,
  COVER_RATIO,
  LOCALE,
  SHARED_COVER,
  type ArticleContent,
  type ArticleCovers,
  type ArticleSnapshot,
  type CoverSettings,
  type HttpTarget,
} from '../../../shared/article-publishing.js';
import {
  ArticleError,
  field,
  httpError,
  json,
  now,
  scalar,
  sendWrite,
  type ArticleChanges,
  type ArticleImageFile,
  type ArticleProvider,
  unreachable,
  type Fetcher,
} from './provider.js';

// The NocoReach article API (docs/ARTICLE-API.md): a small protocol a site implements so NocoReach can publish to it.
// Updates carry `baseVersion` and the server must refuse a stale one with 409; writes carry an Idempotency-Key.
// A cover is an image address (2026-11-05): the article's own, or a language's when the site keeps one per language.
const cover = z.string().nullable().optional();
const fields = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  body: z.string().optional(),
  cover,
});
const article = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  slug: z.string(),
  status: z.enum(['draft', 'published']).optional(),
  version: z.union([z.string(), z.number()]).transform(String),
  locales: z.record(z.string().regex(LOCALE), fields),
  cover,
});
// What the site says it does (GET /capabilities); every part is optional.
const capabilities = z.object({
  cover: z
    .object({
      ratio: z.string().regex(COVER_RATIO).optional(),
      minWidth: z.number().int().min(1).max(20000).optional(),
      required: z.boolean().optional(),
      perLocale: z.boolean().optional(),
    })
    .nullable()
    .optional(),
});
const summary = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  slug: z.string(),
  title: z.string().default(''),
  status: z.enum(['draft', 'published']).optional(),
  updatedAt: z.string().optional(),
});

export class HttpArticles implements ArticleProvider {
  readonly capabilities = ARTICLE_CAPABILITIES.http;
  constructor(
    private readonly target: HttpTarget,
    private readonly apiKey: string,
    private readonly fetcher: Fetcher,
  ) {}
  private url(path: string, params: Record<string, string> = {}) {
    const url = new URL(`${this.target.baseUrl.replace(/\/+$/, '')}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.href;
  }
  private headers(extra: Record<string, string> = {}) {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...extra,
    };
  }
  private snapshot(data: unknown): ArticleSnapshot {
    const parsed = article.safeParse(data);
    if (!parsed.success)
      throw new ArticleError('unavailable', 'invalid_article');
    const { cover: own, locales: raw, ...rest } = parsed.data;
    const locales: ArticleContent['locales'] = {};
    for (const [l, { cover: _, ...f }] of Object.entries(raw)) locales[l] = f;
    const c = this.target.cover;
    const covers: ArticleCovers | undefined = c?.locales
      ? Object.fromEntries(
          this.target.locales
            .filter((l) => c.locales?.[l])
            .map((l) => [l, raw[l]?.cover || '']),
        )
      : c?.field
        ? { [SHARED_COVER]: own || '' }
        : undefined;
    return {
      ...rest,
      locales,
      ...(covers ? { cover: covers } : {}),
      readAt: now(),
    };
  }
  /** The article as the protocol sends it: a shared cover beside the languages, a language's inside it, '' as null. */
  private body(content: ArticleChanges | ArticleContent) {
    const { cover: covers, ...rest } = content;
    if (!covers) return rest;
    const locales = { ...rest.locales };
    let own: string | null | undefined;
    for (const [key, value] of Object.entries(covers))
      if (key === SHARED_COVER) own = value || null;
      else locales[key] = { ...locales[key], cover: value || null } as never;
    return { ...rest, locales, ...(own !== undefined ? { cover: own } : {}) };
  }
  private async read(path: string, params?: Record<string, string>) {
    let response: Response;
    try {
      response = await this.fetcher(this.url(path, params), {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      throw unreachable('unavailable', error);
    }
    const body = await json(response);
    if (!response.ok)
      throw httpError(response.status, field(body, 'error') ?? body);
    return field(body, 'data');
  }
  async search(query: string, limit: number) {
    const data = await this.read('/articles', {
      q: query.trim().slice(0, 100),
      limit: String(Math.min(50, Math.max(1, limit))),
    });
    const parsed = z.array(summary).safeParse(data);
    if (!parsed.success) throw new ArticleError('unavailable', 'invalid_list');
    return parsed.data;
  }
  async get(id: string) {
    return this.snapshot(
      await this.read(`/articles/${encodeURIComponent(id)}`),
    );
  }
  async findBySlug(slug: string) {
    const data = await this.read('/articles', { slug, limit: '2' });
    const parsed = z.array(summary).safeParse(data);
    if (!parsed.success) throw new ArticleError('unavailable', 'invalid_list');
    const hits = parsed.data.filter((a) => a.slug === slug);
    if (hits.length > 1) throw new ArticleError('slug_taken', 'duplicate_slug');
    return hits.length ? this.get(hits[0].id) : null;
  }
  private async write(
    method: 'POST' | 'PATCH',
    path: string,
    key: string,
    body: unknown,
  ) {
    const response = await sendWrite(this.fetcher, this.url(path), {
      method,
      headers: this.headers({ 'Idempotency-Key': key }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    let data: {
      data?: unknown;
      error?: { code?: string; current?: unknown };
    } | null;
    try {
      data = (await json(response)) as typeof data;
    } catch {
      throw new ArticleError(
        response.ok || response.status >= 500 ? 'unknown_outcome' : 'invalid',
      );
    }
    if (response.status >= 500) throw new ArticleError('unknown_outcome');
    if (response.status === 409) {
      const code = data?.error?.code;
      const current = data?.error?.current
        ? this.snapshot(data.error.current)
        : undefined;
      throw new ArticleError(
        code === 'slug_taken' ? 'slug_taken' : 'conflict',
        String(code || 'version_conflict'),
        current,
      );
    }
    if (!response.ok) throw httpError(response.status, data?.error ?? data);
    return this.snapshot(data?.data);
  }
  create(content: ArticleContent, opts: { key: string }) {
    return this.write('POST', '/articles', opts.key, this.body(content));
  }
  update(
    id: string,
    changes: ArticleChanges,
    opts: { baseVersion: string; key: string },
  ) {
    return this.write(
      'PATCH',
      `/articles/${encodeURIComponent(id)}`,
      opts.key,
      { ...this.body(changes), baseVersion: opts.baseVersion },
    );
  }
  /** `POST /images` takes the cover (multipart `file`) and answers with the address the article's cover gets. */
  async uploadCover(image: ArticleImageFile, opts: { key: string }) {
    const form = new FormData();
    form.set(
      'file',
      new File([new Uint8Array(image.bytes)], image.name, { type: image.type }),
    );
    const response = await sendWrite(this.fetcher, this.url('/images'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
        'Idempotency-Key': `cover:${opts.key}`,
      },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    let data: unknown;
    try {
      data = await json(response);
    } catch {
      throw new ArticleError(
        response.ok || response.status >= 500 ? 'unknown_outcome' : 'invalid',
        'cover_upload',
      );
    }
    if (response.status >= 500)
      throw new ArticleError('unknown_outcome', 'cover_upload');
    if (!response.ok)
      throw httpError(response.status, field(data, 'error') ?? data);
    const url = scalar(field(field(data, 'data'), 'url'));
    if (!url) throw new ArticleError('unknown_outcome', 'cover_upload');
    return url;
  }
  /**
   * The cover the site declares (`GET /capabilities`, 2026-11-05): its ratio, narrowest width, whether new articles
   * need one, and whether each language has its own. A site without the endpoint or a cover takes none.
   */
  async detectCover(): Promise<CoverSettings | null> {
    let data: unknown;
    try {
      data = await this.read('/capabilities');
    } catch (error) {
      if (error instanceof ArticleError && error.code === 'not_found')
        return null;
      throw error;
    }
    const parsed = capabilities.safeParse(data ?? {});
    const c = parsed.success ? parsed.data.cover : null;
    if (!c) return null;
    return {
      ...(c.perLocale
        ? {
            locales: Object.fromEntries(
              this.target.locales.map((l) => [l, 'cover']),
            ),
          }
        : { field: 'cover' }),
      ...(c.ratio ? { ratio: c.ratio } : {}),
      ...(c.minWidth ? { minWidth: c.minWidth } : {}),
      required: Boolean(c.required),
      detected: { at: now(), articles: 0, covers: 0, fields: ['cover'] },
    };
  }
}
