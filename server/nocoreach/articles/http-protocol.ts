import { z } from 'zod';
import {
  ARTICLE_CAPABILITIES,
  LOCALE,
  type ArticleContent,
  type ArticleSnapshot,
  type HttpTarget,
} from '../../../shared/article-publishing.js';
import {
  ArticleError,
  field,
  httpError,
  json,
  now,
  sendWrite,
  type ArticleChanges,
  type ArticleProvider,
  type Fetcher,
} from './provider.js';

// The NocoReach article API (docs/ARTICLE-API.md): a small protocol a site implements so NocoReach can publish to it.
// Updates carry `baseVersion` and the server must refuse a stale one with 409; writes carry an Idempotency-Key.
const fields = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  body: z.string().optional(),
});
const article = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  slug: z.string(),
  status: z.enum(['draft', 'published']).optional(),
  version: z.union([z.string(), z.number()]).transform(String),
  locales: z.record(z.string().regex(LOCALE), fields),
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
    return { ...parsed.data, readAt: now() };
  }
  private async read(path: string, params?: Record<string, string>) {
    let response: Response;
    try {
      response = await this.fetcher(this.url(path, params), {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new ArticleError('unavailable');
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
    return this.write('POST', '/articles', opts.key, content);
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
      { ...changes, baseVersion: opts.baseVersion },
    );
  }
}
