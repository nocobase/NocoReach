import { createHash } from 'node:crypto';
import {
  ARTICLE_CAPABILITIES,
  fill,
  SLUG,
  type ArticleContent,
  type ArticleFields,
  type ArticleSnapshot,
  type GitTarget,
} from '../../../shared/article-publishing.js';
import { GitHubFiles, type GitFile, type GitWrite } from './github.js';
import { ArticleError, now, type ArticleChanges, type ArticleProvider, type Fetcher } from './provider.js';

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
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
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
export function writeFrontmatter(text: string | null, values: Record<string, string | undefined>, body: string | undefined) {
  const m = text ? FRONT.exec(text) : null;
  const lines = m ? m[1].split(/\r?\n/) : [];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const line = `${key}: ${JSON.stringify(value)}`,
      at = lines.findIndex((l) => l.startsWith(`${key}:`));
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
      body: Object.fromEntries(this.target.locales.filter((l) => this.target.files[l]).map((l) => [l, fill(this.target.files[l], slug)])),
      metadata: this.target.format === 'metadata-json' && this.target.metadata ? fill(this.target.metadata.path, slug) : null,
    };
  }
  private async files(slug: string, ref: string): Promise<Files> {
    const p = this.paths(slug);
    const body: Files['body'] = {};
    for (const [locale, path] of Object.entries(p.body)) body[locale] = await this.git.file(path, ref);
    return { body, metadata: p.metadata ? await this.git.file(p.metadata, ref) : null };
  }
  private version(files: Files) {
    const parts = [...Object.values(files.body), files.metadata].map((f) => (f ? `${f.path}:${f.sha}` : '-'));
    return createHash('sha256').update(parts.join('\n')).digest('hex');
  }
  private metadataJson(file: GitFile | null): Record<string, unknown> {
    if (!file) return {};
    try {
      const v = JSON.parse(file.text);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      throw new ArticleError('invalid', `metadata:${file.path}`);
    }
  }
  private snapshot(slug: string, files: Files): ArticleSnapshot {
    if (!Object.values(files.body).some(Boolean)) throw new ArticleError('not_found');
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
        if (k?.title) fields.title = typeof meta[k.title] === 'string' ? (meta[k.title] as string) : '';
        if (k?.description) fields.description = typeof meta[k.description] === 'string' ? (meta[k.description] as string) : '';
      }
      locales[locale] = fields;
    }
    return { id: slug, slug, status: 'published', locales, version: this.version(files), readAt: now() };
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
      if (error instanceof ArticleError && error.code === 'not_found') return null;
      throw error;
    }
  }
  private writes(slug: string, files: Files, changes: ArticleChanges): GitWrite[] {
    const p = this.paths(slug),
      out: GitWrite[] = [];
    const meta = this.metadataJson(files.metadata);
    let metaChanged = false;
    for (const [locale, fields] of Object.entries(changes.locales)) {
      const path = p.body[locale];
      if (!path) throw new ArticleError('invalid', `locale:${locale}`);
      const current = files.body[locale]?.text ?? null;
      if (this.target.format === 'frontmatter') {
        const fm = this.target.frontmatter;
        if (!fm && (fields.title !== undefined || fields.description !== undefined)) throw new ArticleError('invalid', 'frontmatter');
        if (fields.title === undefined && fields.description === undefined && fields.body === undefined) continue;
        out.push({ path, content: writeFrontmatter(current, fm ? { [fm.title]: fields.title, [fm.description]: fields.description } : {}, fields.body) });
      } else {
        if (fields.body !== undefined) out.push({ path, content: fields.body });
        const k = this.target.metadata?.keys[locale];
        for (const f of ['title', 'description'] as const) {
          if (fields[f] === undefined) continue;
          if (!k?.[f]) throw new ArticleError('invalid', `field:${locale}.${f}`);
          meta[k[f]!] = fields[f];
          metaChanged = true;
        }
      }
    }
    if (metaChanged && p.metadata) {
      const trailing = files.metadata?.text.endsWith('\n') ? '\n' : '';
      out.push({ path: p.metadata, content: JSON.stringify(meta, null, 2) + trailing });
    }
    return out;
  }
  private async commitWith(slug: string, check: (files: Files) => void, changes: ArticleChanges, message: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const head = await this.git.head(this.target.branch);
      const files = await this.files(slug, head);
      check(files);
      const writes = this.writes(slug, files, changes);
      if (!writes.length) return this.snapshot(slug, files);
      const sha = await this.git.commit(this.target.branch, head, writes, message, this.target.author);
      if (sha) return this.snapshot(slug, await this.files(slug, sha));
    }
    throw new ArticleError('unavailable', 'branch_busy');
  }
  async create(content: ArticleContent) {
    return this.commitWith(
      content.slug,
      (files) => {
        if (Object.values(files.body).some(Boolean) || files.metadata) throw new ArticleError('slug_taken');
      },
      { locales: content.locales },
      `docs: add article ${content.slug} (NocoReach)`,
    );
  }
  async update(id: string, changes: ArticleChanges, opts: { baseVersion: string }) {
    if (changes.slug !== undefined && changes.slug !== id) throw new ArticleError('invalid', 'slug_rename');
    return this.commitWith(
      id,
      (files) => {
        if (this.version(files) !== opts.baseVersion) throw new ArticleError('conflict', 'version_conflict', this.snapshot(id, files));
      },
      { locales: changes.locales },
      `docs: update article ${id} (NocoReach)`,
    );
  }
}
