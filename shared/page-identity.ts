// One page, one identity (2026-11-03, T-55 and T-56 were one article): the places that tell whether two addresses are
// the same page (an opportunity's places, a task's pages, its numbers and results, the tasks about a page, changes
// grouped by page) all read it from here. Two addresses are one page when they differ only in scheme, `www.`, a
// trailing slash, the query or the fragment, and also when the site says so through what Website content read:
//
// - A page whose canonical names another page of the same host is that page (www.nocobase.com/cn/blog/x names
//   /zh-CN/blog/x/). Website content keeps the canonical of every sitemap page it reads, and of the addresses outside
//   the sitemap that people reach (`outsidePages`).
// - Fallback for addresses not read yet: a first path part that looks like a language and that the canonicals read on
//   that host drop (/en/blog/x names /blog/x/), with none read keeping it, is the host's default language served under
//   a prefix, so every /en/… address of the host is the page without it. Other languages keep their prefix (/cn/,
//   /ja/ stay their own pages), and nothing is guessed for a host until a canonical has shown it.
//
// A canonical named by more than MAX_ALIASES other pages is ignored (a site that names its home page, or a list's first
// page, as the canonical of many pages), and so is one on another host.

/** What the project's site says about which addresses are one page; empty when Website content has read nothing. */
export type PageIdentity = {
  /** A page's key → the address its canonical names, where the dropped prefixes do not already say so. */
  canonical?: Record<string, string>;
  /** A host (without `www.`) → the first path parts its canonicals drop (`en`). */
  dropped?: Record<string, string[]>;
};

const LOCALE_PART = /^[a-z]{2}(-[a-z0-9]{2,4})?$/i;
const MAX_ALIASES = 3;

function addressKey(url: unknown) {
  if (typeof url !== 'string') return '';
  const value = url.trim();
  // An address never holds whitespace: two addresses joined by a word ("https://a/x and https://a/y") are two pages
  // written as one, not a page.
  if (!value || /\s/.test(value)) return '';
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return `${u.host.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return '';
  }
}
const split = (key: string) => {
  const i = key.indexOf('/');
  return [key.slice(0, i), key.slice(i)] as const;
};
const firstPart = (path: string) => path.split('/')[1] || '';

/**
 * The address a page goes by: the one its canonical names, the address without its host's dropped prefix, or the
 * address itself. Anything but an http(s) address comes back as it was.
 */
export function canonicalUrl(
  url: string,
  identity?: PageIdentity | null,
): string {
  const key = addressKey(url);
  if (!key || !identity) return url;
  const named = identity.canonical?.[key];
  if (named) return named;
  const [host, path] = split(key),
    first = firstPart(path);
  if (!first || !identity.dropped?.[host]?.includes(first)) return url;
  const u = new URL(url.trim());
  u.pathname = u.pathname.slice(first.length + 1) || '/';
  return u.href;
}

/** A page whatever the scheme, `www.`, trailing slash, query or fragment, and whatever address the site says it has. */
export function pageKey(url: unknown, identity?: PageIdentity | null) {
  const key = addressKey(url);
  return key && identity
    ? addressKey(canonicalUrl(String(url), identity))
    : key;
}

type ReadPage = { url?: unknown; canonical?: unknown };
type SiteState =
  { pages?: ReadPage[]; outsidePages?: ReadPage[] } | null | undefined;

/** What the canonicals Website content read say about the project's pages (shared, so the client reads the same). */
export function pageIdentity(site: SiteState): PageIdentity {
  const read = [
    ...(Array.isArray(site?.pages) ? site.pages : []),
    ...(Array.isArray(site?.outsidePages) ? site.outsidePages : []),
  ];
  const named = new Map<string, { href: string; from: string[] }>(),
    prefixes = new Map<string, { drop: number; keep: number }>();
  for (const p of read) {
    const from = addressKey(p?.url),
      to = addressKey(p?.canonical);
    if (!from || !to) continue;
    const [host, path] = split(from),
      [toHost, toPath] = split(to);
    if (host !== toHost) continue;
    const first = firstPart(path);
    if (LOCALE_PART.test(first)) {
      const count = prefixes.get(`${host}/${first}`) || { drop: 0, keep: 0 };
      if (toPath === (path.slice(first.length + 1) || '/')) count.drop++;
      else if (firstPart(toPath) === first) count.keep++;
      prefixes.set(`${host}/${first}`, count);
    }
    if (from === to) continue;
    const entry = named.get(to) || {
      href: String(p.canonical).trim(),
      from: [],
    };
    if (!entry.from.includes(from)) entry.from.push(from);
    named.set(to, entry);
  }
  const dropped: Record<string, string[]> = {};
  for (const [hostPart, { drop, keep }] of prefixes) {
    if (!drop || keep) continue;
    const [host, part] = [
      hostPart.slice(0, hostPart.lastIndexOf('/')),
      hostPart.slice(hostPart.lastIndexOf('/') + 1),
    ];
    (dropped[host] ||= []).push(part);
  }
  const identity: PageIdentity = Object.keys(dropped).length ? { dropped } : {};
  const canonical: Record<string, string> = {};
  for (const [to, { href, from }] of named) {
    if (from.length > MAX_ALIASES) continue;
    for (const key of from)
      if (addressKey(canonicalUrl(`https://${key}`, identity)) !== to)
        canonical[key] = href;
  }
  return Object.keys(canonical).length ? { ...identity, canonical } : identity;
}
