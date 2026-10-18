import {
  ARTICLE_CAPABILITIES,
  ARTICLE_FIELDS,
  type ArticleContent,
  type ArticleSnapshot,
  type ArticleStatus,
  type NocoBaseTarget,
} from '../../../shared/article-publishing.js';
import {
  ArticleError,
  field,
  httpError,
  scalar,
  json,
  now,
  sendWrite,
  type ArticleChanges,
  type ArticleProvider,
  type Fetcher,
} from './provider.js';

type Row = Record<string, unknown>;

/**
 * A NocoBase collection through its resource API (`/api/<collection>:<action>`), the same requests the NocoBase pages
 * send: ACL, validation, model hooks and collection-event workflows apply as for a person's save. NocoBase has no
 * conditional update, so the base is compared just before writing (see delivery.ts) — a small window remains.
 */
export class NocoBaseArticles implements ArticleProvider {
  readonly capabilities = ARTICLE_CAPABILITIES['nocobase-api'];
  constructor(
    private readonly target: NocoBaseTarget,
    private readonly apiKey: string,
    private readonly fetcher: Fetcher,
  ) {}
  private url(action: string, params: Record<string, string> = {}) {
    const url = new URL(
      `${this.target.baseUrl.replace(/\/+$/, '')}/api/${this.target.collection}:${action}`,
    );
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.href;
  }
  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }
  private async read(action: string, params: Record<string, string>) {
    let response: Response;
    try {
      response = await this.fetcher(this.url(action, params), {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new ArticleError('unavailable');
    }
    const body = await json(response);
    if (!response.ok)
      throw httpError(response.status, field(body, 'errors') ?? body);
    return field(body, 'data');
  }
  private status(value: unknown): ArticleStatus | undefined {
    const s = this.target.fields.status;
    return s && value === s.published
      ? 'published'
      : s && value === s.draft
        ? 'draft'
        : undefined;
  }
  private snapshot(row: Row): ArticleSnapshot {
    const f = this.target.fields;
    const id = row[f.id];
    if (!scalar(id)) throw new ArticleError('not_found');
    const locales: ArticleContent['locales'] = {};
    for (const locale of this.target.locales) {
      const map = f.locales[locale] || {};
      locales[locale] = Object.fromEntries(
        ARTICLE_FIELDS.filter((k) => map[k]).map((k) => [
          k,
          typeof row[map[k]!] === 'string' ? (row[map[k]!] as string) : '',
        ]),
      );
    }
    return {
      id: scalar(id),
      slug: typeof row[f.slug] === 'string' ? (row[f.slug] as string) : '',
      ...(f.status ? { status: this.status(row[f.status.field]) } : {}),
      locales,
      version: scalar(row[f.version]),
      readAt: now(),
    };
  }
  private columns() {
    const f = this.target.fields;
    return [
      f.id,
      f.slug,
      f.version,
      ...(f.status ? [f.status.field] : []),
      ...Object.values(f.locales).flatMap((m) => Object.values(m)),
    ].join(',');
  }
  async search(query: string, limit: number) {
    const f = this.target.fields,
      title = f.locales[this.target.locales[0]]?.title;
    const q = query.trim().slice(0, 100);
    const filter = q
      ? {
          $or: [
            { [f.slug]: { $includes: q } },
            ...(title ? [{ [title]: { $includes: q } }] : []),
          ],
        }
      : {};
    const rows = (await this.read('list', {
      pageSize: String(Math.min(50, Math.max(1, limit))),
      sort: `-${f.version}`,
      fields: [
        f.id,
        f.slug,
        f.version,
        ...(title ? [title] : []),
        ...(f.status ? [f.status.field] : []),
      ].join(','),
      filter: JSON.stringify(filter),
    })) as Row[] | undefined;
    return (rows || []).map((row) => ({
      id: scalar(row[f.id]),
      slug: scalar(row[f.slug]),
      title: title ? scalar(row[title]) : '',
      ...(f.status ? { status: this.status(row[f.status.field]) } : {}),
      updatedAt: scalar(row[f.version]),
    }));
  }
  async get(id: string) {
    const row = (await this.read('get', {
      filterByTk: id,
      fields: this.columns(),
    })) as Row | null;
    if (!row) throw new ArticleError('not_found');
    return this.snapshot(row);
  }
  async findBySlug(slug: string) {
    const f = this.target.fields;
    const rows = (await this.read('list', {
      pageSize: '2',
      fields: this.columns(),
      filter: JSON.stringify({ [f.slug]: { $eq: slug } }),
    })) as Row[] | undefined;
    if (!rows?.length) return null;
    if (rows.length > 1) throw new ArticleError('slug_taken', 'duplicate_slug');
    return this.snapshot(rows[0]);
  }
  private values(changes: ArticleChanges) {
    const f = this.target.fields,
      values: Row = {};
    if (changes.slug !== undefined) values[f.slug] = changes.slug;
    if (changes.status !== undefined && f.status)
      values[f.status.field] =
        changes.status === 'published' ? f.status.published : f.status.draft;
    for (const [locale, fields] of Object.entries(changes.locales)) {
      const map = f.locales[locale];
      if (!map) throw new ArticleError('invalid', `locale:${locale}`);
      for (const k of ARTICLE_FIELDS) {
        if (fields[k] === undefined) continue;
        if (!map[k]) throw new ArticleError('invalid', `field:${locale}.${k}`);
        values[map[k]] = fields[k];
      }
    }
    return values;
  }
  private async write(
    action: 'create' | 'update',
    params: Record<string, string>,
    values: Row,
  ) {
    if (this.target.triggerWorkflows?.length)
      params.triggerWorkflows = this.target.triggerWorkflows.join(',');
    const response = await sendWrite(this.fetcher, this.url(action, params), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(values),
      signal: AbortSignal.timeout(30000),
    });
    let body: unknown;
    try {
      body = await json(response);
    } catch {
      if (response.ok) throw new ArticleError('unknown_outcome');
      body = null;
    }
    // A server error after the request arrived does not prove that nothing was saved.
    if (response.status >= 500) throw new ArticleError('unknown_outcome');
    if (!response.ok)
      throw httpError(
        response.status,
        (body as { errors?: unknown })?.errors ?? body,
      );
    return (body as { data?: unknown })?.data;
  }
  async create(content: ArticleContent) {
    const data = await this.write('create', {}, this.values(content));
    const id = (data as Row | undefined)?.[this.target.fields.id];
    if (!scalar(id)) throw new ArticleError('unknown_outcome');
    return this.get(scalar(id));
  }
  async update(id: string, changes: ArticleChanges) {
    await this.write('update', { filterByTk: id }, this.values(changes));
    return this.get(id);
  }
}
