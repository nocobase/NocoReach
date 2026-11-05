import { createHash } from 'node:crypto';
import {
  ARTICLE_CAPABILITIES,
  fill,
  SHARED_COVER,
  SLUG,
  type ArticleContent,
  type ArticleCovers,
  type ArticleFields,
  type ArticleSnapshot,
  type CoverSettings,
  type GitTarget,
} from '../../../shared/article-publishing.js';
import {
  coverSummary,
  DETECT_ARTICLES,
  imageSize,
  looksLikeImage,
  pickField,
} from './cover-detect.js';
import { GitHubFiles, type GitFile, type GitWrite } from './github.js';
import {
  ArticleError,
  now,
  type ArticleChanges,
  type ArticleImageFile,
  type ArticleProvider,
  type Fetcher,
} from './provider.js';

// Front matter is read and written as top-level `key: value` lines only; other lines are kept as they are.
const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
function scalar(raw: string) {
  const v = raw.trim();
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'") && v.endsWith("'"))
    return v.slice(1, -1).replace(/''/g, "'");
  return v;
}
export function readFrontmatter(text: string) {
  const m = FRONT.exec(text);
  const keys: Record<string, string> = {};
  if (!m) return { keys, body: text };
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):(.*)$/.exec(line);
    if (kv) keys[kv[1]] = scalar(kv[2]);
  }
  return { keys, body: text.slice(m[0].length).replace(/^\r?\n/, '') };
}
/** Front matter with `values` set; undefined leaves a key as it is and null removes it. */
export function writeFrontmatter(
  text: string | null,
  values: Record<string, string | null | undefined>,
  body: string | undefined,
) {
  const m = text ? FRONT.exec(text) : null;
  const lines = m ? m[1].split(/\r?\n/) : [];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const at = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (value === null) {
      if (at >= 0) lines.splice(at, 1);
      continue;
    }
    const line = `${key}: ${JSON.stringify(value)}`;
    if (at >= 0) lines[at] = line;
    else lines.push(line);
  }
  const rest = body ?? (text ? readFrontmatter(text).body : '');
  return lines.length ? `---\n${lines.join('\n')}\n---\n\n${rest}` : rest;
}

type Files = { body: Record<string, GitFile | null>; metadata: GitFile | null };

/**
 * Articles as files in a GitHub repository. Each write is one commit made on the head it was checked against
 * (fast-forward only), so a file changed by anyone after the draft's base was read is never overwritten.
 */
export class GitArticles implements ArticleProvider {
  readonly capabilities = ARTICLE_CAPABILITIES['git-files'];
  private readonly git: GitHubFiles;
  constructor(
    private readonly target: GitTarget,
    token: string | undefined,
    fetcher: Fetcher,
  ) {
    this.git = new GitHubFiles(target.repo, token, fetcher);
  }
  private paths(slug: string) {
    if (!SLUG.test(slug)) throw new ArticleError('invalid', 'slug');
    return {
      body: Object.fromEntries(
        this.target.locales
          .filter((l) => this.target.files[l])
          .map((l) => [l, fill(this.target.files[l], slug)]),
      ),
      metadata:
        this.target.format === 'metadata-json' && this.target.metadata
          ? fill(this.target.metadata.path, slug)
          : null,
    };
  }
  private async files(slug: string, ref: string): Promise<Files> {
    const p = this.paths(slug);
    const body: Files['body'] = {};
    for (const [locale, path] of Object.entries(p.body))
      body[locale] = await this.git.file(path, ref);
    return {
      body,
      metadata: p.metadata ? await this.git.file(p.metadata, ref) : null,
    };
  }
  private version(files: Files) {
    const parts = [...Object.values(files.body), files.metadata].map((f) =>
      f ? `${f.path}:${f.sha}` : '-',
    );
    return createHash('sha256').update(parts.join('\n')).digest('hex');
  }
  private metadataJson(file: GitFile | null): Record<string, unknown> {
    if (!file) return {};
    try {
      const v: unknown = JSON.parse(file.text);
      return v && typeof v === 'object' && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : {};
    } catch {
      throw new ArticleError('invalid', `metadata:${file.path}`);
    }
  }
  /**
   * The front matter key each cover is kept under (2026-11-05): the shared cover's key in every language's file, or a
   * key per language in its own file. Only front matter holds covers.
   */
  private coverKey(key: string) {
    const c = this.target.cover;
    if (!c || this.target.format !== 'frontmatter') return undefined;
    return key === SHARED_COVER ? c.field : c.locales?.[key];
  }
  private coverKeys(): string[] {
    const c = this.target.cover;
    if (!c || this.target.format !== 'frontmatter') return [];
    if (c.locales) return this.target.locales.filter((l) => c.locales?.[l]);
    return c.field ? [SHARED_COVER] : [];
  }
  private snapshotCovers(files: Files): ArticleCovers | undefined {
    const keys = this.coverKeys();
    if (!keys.length) return undefined;
    const read = (locale: string, name: string) => {
      const file = files.body[locale];
      return file ? readFrontmatter(file.text).keys[name] : undefined;
    };
    return Object.fromEntries(
      keys.map((key) => {
        const name = this.coverKey(key)!;
        const value =
          key === SHARED_COVER
            ? this.target.locales.map((l) => read(l, name)).find(Boolean)
            : read(key, name);
        return [key, value || ''];
      }),
    );
  }
  private snapshot(slug: string, files: Files): ArticleSnapshot {
    if (!Object.values(files.body).some(Boolean))
      throw new ArticleError('not_found');
    const cover = this.snapshotCovers(files);
    const meta = this.metadataJson(files.metadata),
      locales: ArticleContent['locales'] = {};
    for (const locale of this.target.locales) {
      const file = files.body[locale];
      const fields: ArticleFields = {};
      if (this.target.format === 'frontmatter') {
        const { keys, body } = readFrontmatter(file?.text || '');
        fields.body = file ? body : '';
        if (this.target.frontmatter) {
          fields.title = keys[this.target.frontmatter.title] || '';
          fields.description = keys[this.target.frontmatter.description] || '';
        }
      } else {
        fields.body = file?.text || '';
        const k = this.target.metadata?.keys[locale];
        if (k?.title)
          fields.title =
            typeof meta[k.title] === 'string' ? (meta[k.title] as string) : '';
        if (k?.description)
          fields.description =
            typeof meta[k.description] === 'string'
              ? (meta[k.description] as string)
              : '';
      }
      locales[locale] = fields;
    }
    return {
      id: slug,
      slug,
      status: 'published',
      locales,
      ...(cover ? { cover } : {}),
      version: this.version(files),
      readAt: now(),
    };
  }
  async search(query: string, limit: number) {
    const head = await this.git.head(this.target.branch);
    const q = query.trim().toLowerCase();
    return (await this.git.list(this.target.root, head))
      .filter((name) => SLUG.test(name) && (!q || name.includes(q)))
      .slice(0, Math.min(50, Math.max(1, limit)))
      .map((name) => ({ id: name, slug: name, title: name }));
  }
  async get(id: string) {
    const head = await this.git.head(this.target.branch);
    return this.snapshot(id, await this.files(id, head));
  }
  async findBySlug(slug: string) {
    try {
      return await this.get(slug);
    } catch (error) {
      if (error instanceof ArticleError && error.code === 'not_found')
        return null;
      throw error;
    }
  }
  private writes(
    slug: string,
    files: Files,
    changes: ArticleChanges,
  ): GitWrite[] {
    const p = this.paths(slug),
      out: GitWrite[] = [];
    const meta = this.metadataJson(files.metadata);
    let metaChanged = false;
    // The covers each language's file gets: the shared one in every file the article has or is given, else its own.
    const covers = Object.entries(changes.cover || {});
    const coverFor = (locale: string) => {
      const out: Record<string, string | null> = {};
      for (const [key, value] of covers) {
        if (key !== SHARED_COVER && key !== locale) continue;
        const name = this.coverKey(key);
        if (!name) throw new ArticleError('invalid', `cover:${key}`);
        out[name] = value || null;
      }
      return out;
    };
    const touched = new Set(Object.keys(changes.locales));
    if (covers.length)
      for (const l of this.target.locales)
        if (
          files.body[l] &&
          covers.some(([key]) => key === SHARED_COVER || key === l)
        )
          touched.add(l);
    for (const locale of touched) {
      const fields = changes.locales[locale] || {};
      const path = p.body[locale];
      if (!path) throw new ArticleError('invalid', `locale:${locale}`);
      const current = files.body[locale]?.text ?? null;
      if (this.target.format === 'frontmatter') {
        const fm = this.target.frontmatter;
        if (
          !fm &&
          (fields.title !== undefined || fields.description !== undefined)
        )
          throw new ArticleError('invalid', 'frontmatter');
        const cover = coverFor(locale);
        if (
          fields.title === undefined &&
          fields.description === undefined &&
          fields.body === undefined &&
          !Object.keys(cover).length
        )
          continue;
        out.push({
          path,
          content: writeFrontmatter(
            current,
            {
              ...(fm
                ? {
                    [fm.title]: fields.title,
                    [fm.description]: fields.description,
                  }
                : {}),
              ...cover,
            },
            fields.body,
          ),
        });
      } else {
        if (covers.length) throw new ArticleError('invalid', 'cover');
        if (fields.body !== undefined) out.push({ path, content: fields.body });
        const k = this.target.metadata?.keys[locale];
        for (const f of ['title', 'description'] as const) {
          if (fields[f] === undefined) continue;
          if (!k?.[f])
            throw new ArticleError('invalid', `field:${locale}.${f}`);
          meta[k[f]] = fields[f];
          metaChanged = true;
        }
      }
    }
    if (metaChanged && p.metadata) {
      const trailing = files.metadata?.text.endsWith('\n') ? '\n' : '';
      out.push({
        path: p.metadata,
        content: JSON.stringify(meta, null, 2) + trailing,
      });
    }
    return out;
  }
  private async commitWith(
    slug: string,
    check: (files: Files) => void,
    changes: ArticleChanges,
    message: string,
  ) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const head = await this.git.head(this.target.branch);
      const files = await this.files(slug, head);
      check(files);
      const writes = this.writes(slug, files, changes);
      if (!writes.length) return this.snapshot(slug, files);
      const sha = await this.git.commit(
        this.target.branch,
        head,
        writes,
        message,
        this.target.author,
      );
      if (sha) return this.snapshot(slug, await this.files(slug, sha));
    }
    throw new ArticleError('unavailable', 'branch_busy');
  }
  async create(content: ArticleContent) {
    return this.commitWith(
      content.slug,
      (files) => {
        if (Object.values(files.body).some(Boolean) || files.metadata)
          throw new ArticleError('slug_taken');
      },
      {
        locales: content.locales,
        ...(content.cover ? { cover: content.cover } : {}),
      },
      `docs: add article ${content.slug} (NocoReach)`,
    );
  }
  async update(
    id: string,
    changes: ArticleChanges,
    opts: { baseVersion: string },
  ) {
    if (changes.slug !== undefined && changes.slug !== id)
      throw new ArticleError('invalid', 'slug_rename');
    return this.commitWith(
      id,
      (files) => {
        if (this.version(files) !== opts.baseVersion)
          throw new ArticleError(
            'conflict',
            'version_conflict',
            this.snapshot(id, files),
          );
      },
      {
        locales: changes.locales,
        ...(changes.cover ? { cover: changes.cover } : {}),
      },
      `docs: update article ${id} (NocoReach)`,
    );
  }
  /**
   * A cover is committed into the cover folder (2026-11-05), named after the article and its content, so a retry finds
   * the same file instead of adding another; the front matter key gets the prefix and the file name.
   */
  async uploadCover(image: ArticleImageFile, opts: { slug: string }) {
    const c = this.target.cover;
    if (!c?.folder || !SLUG.test(opts.slug))
      throw new ArticleError('invalid', 'cover_folder');
    const ext =
      /\.([a-z0-9]{1,8})$/i.exec(image.name)?.[1]?.toLowerCase() ||
      image.type.split('/')[1] ||
      'png';
    const hash = createHash('sha256')
      .update(image.bytes)
      .digest('hex')
      .slice(0, 10);
    const name = `${opts.slug}-cover-${hash}.${ext}`;
    const path = `${fill(c.folder, opts.slug)}/${name}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const head = await this.git.head(this.target.branch);
      if (!(await this.git.raw(path, head))) {
        const sha = await this.git.commit(
          this.target.branch,
          head,
          [{ path, bytes: image.bytes }],
          `docs: add cover for ${opts.slug} (NocoReach)`,
          this.target.author,
        );
        if (!sha) continue;
      }
      return `${fill(c.prefix ?? '', opts.slug)}${name}`;
    }
    throw new ArticleError('unavailable', 'branch_busy');
  }
  /**
   * The front matter key recent articles keep an image path under (cover, image, featured_image …), whether each
   * language has its own, where the images are in the repository, and their sizes (2026-11-05). Null without one.
   */
  async detectCover(): Promise<CoverSettings | null> {
    if (this.target.format !== 'frontmatter') return null;
    const head = await this.git.head(this.target.branch);
    const slugs = (await this.git.list(this.target.root, head))
      .filter((name) => SLUG.test(name))
      .slice(-DETECT_ARTICLES)
      .reverse();
    const primary = this.target.locales[0];
    const read = async (slug: string, locale: string) => {
      const template = this.target.files[locale];
      if (!template) return null;
      const file = await this.git.file(fill(template, slug), head);
      return file ? readFrontmatter(file.text).keys : null;
    };
    const articles: { slug: string; keys: Record<string, string> }[] = [];
    for (const slug of slugs) {
      const keys = await read(slug, primary);
      if (keys) articles.push({ slug, keys });
    }
    const counts = new Map<string, number>();
    for (const a of articles)
      for (const [k, v] of Object.entries(a.keys))
        if (
          /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(k) &&
          looksLikeImage(v) &&
          !/^https?:/i.test(v)
        )
          counts.set(k, (counts.get(k) || 0) + 1);
    const key = pickField(counts);
    if (!key) return null;
    const withCover = articles.filter((a) => looksLikeImage(a.keys[key]));
    // Each language its own cover when another language's file holds a different one for the same article.
    let perLocale = false;
    for (const a of withCover.slice(0, 5)) {
      for (const l of this.target.locales.slice(1)) {
        const other = (await read(a.slug, l))?.[key];
        if (other && other !== a.keys[key]) perLocale = true;
      }
      if (perLocale) break;
    }
    // Where a cover is in the repository: next to the article for a relative path, else under a static folder.
    const located = withCover.length
      ? await this.coverFolder(withCover[0].slug, withCover[0].keys[key], head)
      : null;
    const sizes: { width: number; height: number }[] = [];
    if (located)
      for (const a of withCover.slice(0, DETECT_ARTICLES)) {
        const value = a.keys[key],
          file = value.slice(value.lastIndexOf('/') + 1);
        const bytes = await this.git
          .raw(`${fill(located.folder, a.slug)}/${file}`, head)
          .catch(() => null);
        const size = bytes ? imageSize(bytes.bytes) : null;
        if (size) sizes.push(size);
      }
    return {
      ...(perLocale
        ? {
            locales: Object.fromEntries(
              this.target.locales
                .filter((l) => this.target.files[l])
                .map((l) => [l, key]),
            ),
          }
        : { field: key }),
      ...coverSummary({
        articles: articles.length,
        covers: withCover.length,
        sizes,
      }),
      ...(located ? located : {}),
      detected: {
        at: now(),
        articles: articles.length,
        covers: withCover.length,
        fields: [...counts.keys()].slice(0, 20),
      },
    };
  }
  /** The repository folder a cover path is served from, as a template with {slug} where the article's name is. */
  private async coverFolder(slug: string, value: string, head: string) {
    const dir = value.slice(0, value.lastIndexOf('/') + 1),
      file = value.slice(dir.length);
    const exists = async (folder: string) =>
      Boolean(
        await this.git
          .raw(`${fill(folder, slug)}/${file}`, head)
          .catch(() => null),
      );
    // A repository path with `.` and `..` resolved; null when it climbs out of the repository.
    const clean = (path: string) => {
      const out: string[] = [];
      for (const x of path.split('/')) {
        if (!x || x === '.') continue;
        if (x !== '..') out.push(x);
        else if (!out.pop()) return null;
      }
      return out.join('/');
    };
    if (!value.startsWith('/')) {
      // Relative to the article's file: content/blog/{slug}/index.md with ./cover.png.
      const template = this.target.files[this.target.locales[0]];
      const base = template.slice(0, template.lastIndexOf('/'));
      const folder = clean(`${base}/${dir}`);
      return folder && (await exists(folder)) ? { folder, prefix: dir } : null;
    }
    const prefix = dir.split(slug).join('{slug}');
    for (const root of [
      'public',
      'static',
      '',
      'src/assets',
      'assets',
      'src',
    ]) {
      const folder = clean(`${root}/${dir.split(slug).join('{slug}')}`);
      if (folder && (await exists(folder))) return { folder, prefix };
    }
    return null;
  }
}
