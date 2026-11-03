// Website source repositories (2026-10-29 user request, ui-references/repos-2026-10-29/multi-repo.png): a project
// connects several repositories, each serving some of the site's addresses: a host ("docs.example.com") or a host and
// a path prefix ("example.com/docs"). One address belongs to one repository. A task's change goes to the repository
// serving its pages by the longest matching prefix; a project with one repository always uses it. Pages that no
// repository serves, or that different ones serve, leave the choice to a person on the start card.

export type RepoRef = { id: string; repo: string; urls: string[] };

const MAX_URLS = 30;

/**
 * An address as a repository serves it: host and path without scheme, query or trailing slash, lowercase host
 * ("https://Docs.Example.com/guide/?a" → "docs.example.com/guide"). Null when it is not an address.
 */
export function repoUrlKey(input: unknown): string | null {
  let s = typeof input === 'string' ? input.trim() : '';
  if (!s || s.length > 500) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.host.toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(host) || !host.includes('.')) return null;
  let path = u.pathname.replace(/\/+$/, '');
  try {
    path = decodeURI(path);
  } catch {
    /* Kept as written when it does not decode. */
  }
  return host + path;
}

/** The addresses a repository serves, each once and as `repoUrlKey` writes it; null when one is not an address. */
export function repoUrlsInput(v: unknown): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > MAX_URLS) return null;
  const out: string[] = [];
  for (const x of v) {
    const key = repoUrlKey(x);
    if (!key) return null;
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

/** How long a prefix of `page` the address `key` is, or -1 when it does not serve the page. */
function served(key: string, page: string) {
  const slash = key.indexOf('/'),
    host = slash < 0 ? key : key.slice(0, slash),
    path = slash < 0 ? '' : key.slice(slash);
  const at = page.indexOf('/'),
    pageHost = at < 0 ? page : page.slice(0, at),
    pagePath = at < 0 ? '' : page.slice(at);
  if (host !== pageHost) return -1;
  return !path || pagePath === path || pagePath.startsWith(`${path}/`)
    ? key.length
    : -1;
}

/** The repository serving one page by its longest matching address, with that address; null when none does. */
export function repoForPage<R extends RepoRef>(
  repos: readonly R[],
  url: string,
) {
  const page = repoUrlKey(url);
  if (!page) return null;
  let best: { repo: R; url: string; length: number } | null = null;
  for (const repo of repos)
    for (const key of repo.urls) {
      const length = served(key, page);
      if (length > (best?.length ?? -1)) best = { repo, url: key, length };
    }
  return best && { repo: best.repo, url: best.url };
}

export type RepoRoute<R> =
  /** The only repository; it serves every page. */
  | { repo: R; by: 'single' }
  /** The repository serving the task's pages, found from `page` by `url`. */
  | { repo: R; by: 'page'; page: string; url: string }
  /** No repository serves the pages, or several serve them: a person chooses. */
  | { repo: null; by: 'none' | 'mixed' };

/**
 * Which repository a task's change goes to, from its pages (most specific first, `pageUrlsOf`). Pages no repository
 * serves are not the site's (a forum thread, a competitor's page) and do not count; several repositories are mixed.
 */
export function routeRepo<R extends RepoRef>(
  repos: readonly R[],
  pages: readonly string[],
): RepoRoute<R> {
  if (repos.length === 1) return { repo: repos[0], by: 'single' };
  let first: { repo: R; url: string; page: string } | null = null;
  for (const page of pages) {
    const found = repoForPage(repos, page);
    if (!found) continue;
    if (!first) first = { ...found, page };
    else if (found.repo.id !== first.repo.id)
      return { repo: null, by: 'mixed' };
  }
  return first
    ? { repo: first.repo, by: 'page', page: first.page, url: first.url }
    : { repo: null, by: 'none' };
}

/** The repository a pull request is in ("owner/name"), from its address; null when it is not a GitHub pull request. */
export function prRepo(url: unknown) {
  return typeof url === 'string'
    ? (/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/\d+$/.exec(
        url,
      )?.[1] ?? null)
    : null;
}

/** Which repository holds an address now, besides `except` (the one being edited): saving it there moves it. */
export function urlOwner<R extends RepoRef>(
  repos: readonly R[],
  key: string,
  except?: string,
) {
  return repos.find((r) => r.id !== except && r.urls.includes(key)) || null;
}

/** What a task keeps of the repository it changes, and what its runs are given. */
export type TaskRepo = {
  id?: string;
  repo: string;
  baseBranch: string;
  allowedPaths: string[];
  contentCheck: boolean;
};
type RepoSettings = RepoRef & Omit<TaskRepo, 'id'>;

export const taskRepo = (r: RepoSettings): TaskRepo => ({
  id: r.id,
  repo: r.repo,
  baseBranch: r.baseBranch,
  allowedPaths: [...r.allowedPaths],
  contentCheck: r.contentCheck,
});

/**
 * The repository a started task changes: the one chosen at its start (`work.repo`). A task started before
 * 2026-10-29, when a project had one repository, keeps the one its pull request is in (even after it was removed:
 * the pull request is still there), else the one serving its pages.
 */
export function startedRepo(
  repos: readonly RepoSettings[],
  work: {
    repo?: TaskRepo | null;
    results?: readonly ({ pr?: { url?: unknown } } | null)[];
    release?: { pr?: { url?: unknown } } | null;
  },
  pages: readonly string[],
): TaskRepo | null {
  if (work.repo !== undefined) return work.repo;
  const name = prRepo(
    work.release?.pr?.url ??
      [...(work.results || [])].reverse().find((a) => a?.pr)?.pr?.url,
  );
  if (name) {
    const known = repos.find(
      (r) => r.repo.toLowerCase() === name.toLowerCase(),
    );
    return known
      ? taskRepo(known)
      : {
          repo: name,
          baseBranch: 'main',
          allowedPaths: [],
          contentCheck: true,
        };
  }
  const routed = routeRepo(repos, pages).repo;
  return routed ? taskRepo(routed) : null;
}
