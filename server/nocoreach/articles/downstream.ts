import { fill, type ArticleContent, type Downstream } from '../../../shared/article-publishing.js';
import { GitHubFiles } from './github.js';
import { sameText, valueAt, type ArticleChanges, type Fetcher } from './provider.js';

/** A file in the downstream repository that holds something else than the target: an edit made only in Git. */
export type Divergence = { path: string; field: string; git: string; target: string };

type Item = { path: string; field: string; read: (text: string) => string | undefined };

/**
 * Where a target's articles are exported to a Git repository by the target itself (the NocoBase CMS export), the
 * exporter rewrites a touched article's files from the target. Publishing would then silently replace any edit made
 * only in Git, so it is checked first; afterwards the same files show when the export has happened.
 */
export class DownstreamGit {
  private readonly git: GitHubFiles;
  constructor(
    private readonly config: Downstream,
    token: string | undefined,
    fetcher: Fetcher,
  ) {
    this.git = new GitHubFiles(config.repo, token, fetcher);
  }
  private items(slug: string): Item[] {
    const out: Item[] = Object.entries(this.config.files).map(([locale, path]) => ({ path: fill(path, slug), field: `${locale}.body`, read: (t) => t }));
    const meta = this.config.metadata;
    if (meta)
      for (const [locale, keys] of Object.entries(meta.keys))
        for (const f of ['title', 'description'] as const)
          if (keys[f])
            out.push({
              path: fill(meta.path, slug),
              field: `${locale}.${f}`,
              read: (t) => {
                try {
                  const v = JSON.parse(t)?.[keys[f]!];
                  return typeof v === 'string' ? v : undefined;
                } catch {
                  return undefined;
                }
              },
            });
    return out;
  }
  private exporter(commit: { name: string; email: string } | null) {
    const e = this.config.exporter;
    return Boolean(commit && e && (e.email ? commit.email === e.email : true) && (e.name ? commit.name === e.name : true) && (e.email || e.name));
  }
  /**
   * Fields the export would rewrite after this write whose Git copy differs from the target, and whose latest commit is
   * not the exporter's (that only means the export is still to come).
   */
  async divergence(current: ArticleContent, changes: ArticleChanges): Promise<Divergence[]> {
    const head = await this.git.head(this.config.branch);
    const cache = new Map<string, Awaited<ReturnType<GitHubFiles['file']>>>();
    const out: Divergence[] = [];
    for (const item of this.items(current.slug)) {
      const after = valueAt(changes, item.field) ?? valueAt(current, item.field) ?? '';
      // The export leaves a file alone when the target's value is empty.
      if (!after) continue;
      if (!cache.has(item.path)) cache.set(item.path, await this.git.file(item.path, head));
      const file = cache.get(item.path);
      if (!file) continue;
      const git = item.read(file.text);
      const target = valueAt(current, item.field) ?? '';
      if (git === undefined || sameText(git, target)) continue;
      if (this.exporter(await this.git.lastCommit(item.path, head))) continue;
      out.push({ path: item.path, field: item.field, git, target });
    }
    return out;
  }
  /** Whether the written fields are in Git yet, and the commit that brought the article's body there. */
  async exported(published: ArticleContent, written: string[]): Promise<{ done: boolean; commit?: string }> {
    const head = await this.git.head(this.config.branch);
    const items = this.items(published.slug).filter((i) => written.includes(i.field));
    if (!items.length) return { done: true };
    const cache = new Map<string, Awaited<ReturnType<GitHubFiles['file']>>>();
    for (const item of items) {
      if (!cache.has(item.path)) cache.set(item.path, await this.git.file(item.path, head));
      const file = cache.get(item.path);
      if (!file || !sameText(item.read(file.text), valueAt(published, item.field))) return { done: false };
    }
    return { done: true, commit: (await this.git.lastCommit(items[0].path, head))?.sha };
  }
  /** Paths the exporter owns: build changes must not edit them (they would be rewritten or conflict). */
  static owns(config: Downstream, path: string) {
    const templates = [...Object.values(config.files), ...(config.metadata ? [config.metadata.path] : [])];
    return templates.some((t) => new RegExp(`^${t.split('{slug}').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+')}$`).test(path));
  }
}
