import {
  ARTICLE_CAPABILITIES,
  ARTICLE_FIELDS,
  SHARED_COVER,
  type ArticleContent,
  type ArticleCovers,
  type ArticleSnapshot,
  type ArticleStatus,
  type CoverSettings,
  type NocoBaseTarget,
} from '../../../shared/article-publishing.js';
import {
  coverSummary,
  DETECT_ARTICLES,
  IMAGE_HEAD_BYTES,
  imageSize,
  pickField,
} from './cover-detect.js';
import {
  ArticleError,
  field,
  httpError,
  scalar,
  json,
  now,
  sendWrite,
  type ArticleChanges,
  type ArticleImageFile,
  type ArticleProvider,
  unreachable,
  type Fetcher,
} from './provider.js';

type Row = Record<string, unknown>;

// A cover is an attachment record related to the article (2026-11-05: nocobase.com's `articles.cover`, read with
// `appends=cover`). Its value is the file's address with the record's id after `#attachment=`, so a cover read back
// compares equal to the one written, and the relation can be set from it.
const ATTACHMENT = '#attachment=';
/** The attachment record id a cover value carries, or null. */
export const attachmentOf = (value: string) => {
  const at = value.lastIndexOf(ATTACHMENT);
  return at < 0 ? null : value.slice(at + ATTACHMENT.length) || null;
};

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
    } catch (error) {
      throw unreachable('unavailable', error);
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
  /** Each cover key with its attachment field: the shared one, or one per language. */
  private coverFields(): [string, string][] {
    const c = this.target.cover;
    if (!c) return [];
    if (c.locales)
      return this.target.locales
        .filter((l) => c.locales![l])
        .map((l) => [l, c.locales![l]]);
    return c.field ? [[SHARED_COVER, c.field]] : [];
  }
  private absolute(address: string) {
    return new URL(address, `${this.target.baseUrl.replace(/\/+$/, '')}/`).href;
  }
  /** A cover as the article keeps it: the file's address and its record, or '' for none. */
  private coverValue(file: unknown) {
    const url = scalar(field(file, 'url')),
      id = scalar(field(file, 'id'));
    return url && id ? `${this.absolute(url)}${ATTACHMENT}${id}` : '';
  }
  private appends(params: Record<string, string>) {
    const fields = this.coverFields().map(([, name]) => name);
    return fields.length
      ? { ...params, appends: [...new Set(fields)].join(',') }
      : params;
  }
  private snapshot(row: Row): ArticleSnapshot {
    const f = this.target.fields;
    const id = row[f.id];
    if (!scalar(id)) throw new ArticleError('not_found');
    const covers = this.coverFields();
    const cover: ArticleCovers = Object.fromEntries(
      covers.map(([key, name]) => [key, this.coverValue(row[name])]),
    );
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
      ...(covers.length ? { cover } : {}),
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
    const row = (await this.read(
      'get',
      this.appends({ filterByTk: id, fields: this.columns() }),
    )) as Row | null;
    if (!row) throw new ArticleError('not_found');
    return this.snapshot(row);
  }
  async findBySlug(slug: string) {
    const f = this.target.fields;
    const rows = (await this.read(
      'list',
      this.appends({
        pageSize: '2',
        fields: this.columns(),
        filter: JSON.stringify({ [f.slug]: { $eq: slug } }),
      }),
    )) as Row[] | undefined;
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
    // A cover sets the relation to its attachment record (NocoBase takes the record's id), or clears it.
    const covers = new Map(this.coverFields());
    for (const [key, value] of Object.entries(changes.cover || {})) {
      const name = covers.get(key);
      if (!name) throw new ArticleError('invalid', `cover:${key}`);
      const record = value ? attachmentOf(value) : null;
      if (value && !record) throw new ArticleError('invalid', `cover:${key}`);
      // A numeric id as a number, as the NocoBase pages send it; a larger one stays a string.
      values[name] =
        record && /^\d+$/.test(record) && Number.isSafeInteger(Number(record))
          ? Number(record)
          : record;
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
  /**
   * The CMS's file manager takes the image (`attachments:create`, multipart `file`), into the storage of the article
   * body field when it names one, as when an editor pastes an image there; the file record's `url` is its address.
   */
  async uploadImage(image: ArticleImageFile) {
    const body = this.target.fields.locales[this.target.locales[0]]?.body;
    const data = await this.attach(
      image,
      body ? `${this.target.collection}.${body}` : undefined,
    );
    const address = scalar(field(data, 'url'));
    if (!address) throw new ArticleError('unknown_outcome', 'image_upload');
    // A local storage answers with a path on the CMS itself.
    return this.absolute(address);
  }
  /** A cover goes into the cover field's own storage; the record it makes is what the article relates to. */
  async uploadCover(image: ArticleImageFile) {
    const name = this.coverFields()[0]?.[1];
    if (!name) throw new ArticleError('invalid', 'cover_unsupported');
    const data = await this.attach(image, `${this.target.collection}.${name}`);
    const value = this.coverValue(data);
    if (!value) throw new ArticleError('unknown_outcome', 'cover_upload');
    return value;
  }
  private async attach(image: ArticleImageFile, attachmentField?: string) {
    const url = new URL(
      `${this.target.baseUrl.replace(/\/+$/, '')}/api/attachments:create`,
    );
    if (attachmentField)
      url.searchParams.set('attachmentField', attachmentField);
    const form = new FormData();
    form.set(
      'file',
      new File([new Uint8Array(image.bytes)], image.name, { type: image.type }),
    );
    const response = await sendWrite(this.fetcher, url.href, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    let data: unknown;
    try {
      data = await json(response);
    } catch {
      if (response.ok)
        throw new ArticleError('unknown_outcome', 'image_upload');
      data = null;
    }
    if (!response.ok)
      throw httpError(response.status, field(data, 'errors') ?? data);
    return field(data, 'data');
  }
  /**
   * The collection's attachment fields, and the covers of its latest articles (2026-11-05): the field they fill (one per
   * language when the fields follow the title fields' language suffixes, `cover_cn` beside `title_cn`), their ratio and
   * narrowest width, and whether every one has a cover. Null when the collection has no attachment field.
   */
  async detectCover(): Promise<CoverSettings | null> {
    const listed = (await this.readAt(
      `/api/collections/${encodeURIComponent(this.target.collection)}/fields:list`,
      { paginate: 'false' },
    )) as Row[] | undefined;
    const attachments = (listed || [])
      .filter(
        (x) =>
          x.interface === 'attachment' ||
          (x.type === 'belongsTo' && x.target === 'attachments'),
      )
      .map((x) => scalar(x.name))
      .filter((n) => /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(n))
      .slice(0, 20);
    if (!attachments.length) return null;
    const f = this.target.fields;
    const rows = ((await this.read('list', {
      pageSize: String(DETECT_ARTICLES),
      sort: `-${f.version}`,
      fields: f.id,
      appends: attachments.join(','),
    })) || []) as Row[];
    const counts = new Map<string, number>(attachments.map((n) => [n, 0]));
    for (const row of rows)
      for (const n of attachments)
        if (this.coverValue(row[n])) counts.set(n, counts.get(n)! + 1);
    const chosen = pickField(counts);
    if (!chosen) return null;
    // Per language when the field has a sibling for each other language, named with its title field's suffix.
    const title = f.locales[this.target.locales[0]]?.title || 'title';
    const suffix = (l: string) => {
      const t = f.locales[l]?.title;
      return t && t.startsWith(title) ? t.slice(title.length) : null;
    };
    const perLocale =
      this.target.locales.slice(1).length > 0 &&
      this.target.locales.slice(1).every((l) => {
        const s = suffix(l);
        return Boolean(s) && attachments.includes(`${chosen}${s}`);
      });
    const files = rows
      .map((row) => row[chosen])
      .filter((x) => this.coverValue(x));
    const sizes: { width: number; height: number }[] = [];
    for (const file of files.slice(0, DETECT_ARTICLES)) {
      const meta = field(file, 'meta');
      const width = Number(field(meta, 'width')),
        height = Number(field(meta, 'height'));
      if (width > 0 && height > 0) sizes.push({ width, height });
      else {
        const size = await this.imageSizeAt(
          this.absolute(scalar(field(file, 'url'))),
        );
        if (size) sizes.push(size);
      }
    }
    return {
      ...(perLocale
        ? {
            locales: Object.fromEntries(
              this.target.locales.map((l, i) => [
                l,
                i ? `${chosen}${suffix(l)}` : chosen,
              ]),
            ),
          }
        : { field: chosen }),
      ...coverSummary({ articles: rows.length, covers: files.length, sizes }),
      detected: {
        at: now(),
        articles: rows.length,
        covers: files.length,
        fields: attachments,
      },
    };
  }
  private async readAt(path: string, params: Record<string, string>) {
    const url = new URL(`${this.target.baseUrl.replace(/\/+$/, '')}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let response: Response;
    try {
      response = await this.fetcher(url.href, {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      throw unreachable('unavailable', error);
    }
    const body = await json(response);
    if (!response.ok)
      throw httpError(response.status, field(body, 'errors') ?? body);
    return field(body, 'data');
  }
  /** An image's size from its first bytes; null when it cannot be read. */
  private async imageSizeAt(url: string) {
    try {
      const response = await this.fetcher(url, {
        method: 'GET',
        headers: { Range: `bytes=0-${IMAGE_HEAD_BYTES - 1}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer()).slice(
        0,
        IMAGE_HEAD_BYTES,
      );
      return imageSize(bytes);
    } catch {
      return null;
    }
  }
}
