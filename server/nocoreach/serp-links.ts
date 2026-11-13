// Google's result links (DataForSEO update 2026-11-02, https://dataforseo.com/update/new-goto-url-limits-and-how-this-affects-your-results):
// since late October 2026 Google wraps organic result links in encrypted redirects (https://www.google.com/goto?url=CAES…)
// and throttles opening them per result page, so DataForSEO's Live and High Priority answers leave many of them unresolved,
// with `domain` google.com; the Standard queue waits for them but may still miss some. The line Google shows under the
// title (`breadcrumb`) still starts with the result's own site. Every organic result read from a Google SERP goes through
// `organicLink`, so a result is credited to its site, never to Google, and keeps the redirect (it still opens the page for
// a person) marked `resolved: false`. The older /url?q=<address> wrapper carries the address and is unwrapped.

/** The share of a result page's organic results that may be unresolved before a missing site counts as unknown. */
export const UNRESOLVED_SHARE = 0.3;

const GOOGLE_HOST = /^(?:www\.)?google\.(?:com?\.)?[a-z]{2,3}$/i;
const HOST =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

export interface OrganicLink {
  url: string;
  domain: string;
  resolved: boolean;
  /** The breadcrumb Google showed, kept for an unresolved result so its page can still be recognised. */
  shown?: string;
  /** The site's name Google showed (`website_name`, "Reddit · r/selfhosted"), kept for an unresolved result. */
  site?: string;
}

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
const bare = (domain: string) =>
  domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');

function parse(url: string): URL | null {
  try {
    return new URL(url, 'https://www.google.com');
  } catch {
    return null;
  }
}

/** A Google redirect: any google.* host (or a path relative to Google) with the path /goto or /url. */
export function googleRedirect(url: unknown): boolean {
  const raw = text(url);
  if (!raw) return false;
  const u = parse(raw);
  return Boolean(
    u && GOOGLE_HOST.test(u.hostname) && ['/goto', '/url'].includes(u.pathname),
  );
}

/** The address a /url?q=… wrapper names, when it is a web address outside Google; /goto tokens name none. */
function unwrapped(url: string): string | null {
  const u = parse(url);
  for (const key of ['q', 'url']) {
    const value = u?.searchParams.get(key);
    const target = value && /^https?:\/\//i.test(value) ? parse(value) : null;
    if (target && !GOOGLE_HOST.test(target.hostname)) return target.toString();
  }
  return null;
}

/** The host a shown address starts with ("https://www.example.com › blog › …"), or '' when it is not one or is cut off. */
export function shownHost(value: unknown): string {
  const first = text(value).split(/\s+/)[0] || '';
  if (/…|\.\.\./.test(first)) return '';
  const host = first
    .replace(/^https?:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
  return HOST.test(host) ? host : '';
}

/** The path segments a shown address names after its host, without the ones Google cut off. */
export function shownPath(value: unknown): {
  segments: string[];
  cut: boolean;
} {
  const parts = text(value)
    .split(/\s*›\s*/)
    .slice(1)
    .map((s) => s.trim())
    .filter(Boolean);
  const cut = parts.some((s) => /…|\.\.\./.test(s));
  return {
    segments: parts
      .filter((s) => !/…|\.\.\./.test(s))
      .map((s) => s.toLowerCase()),
    cut,
  };
}

/** A redirect made absolute (a relative /goto opens on Google) without the session tail Google adds to some of them. */
function redirectLink(url: string): string {
  const u = parse(url);
  if (!u) return url;
  u.searchParams.delete('gsessionid');
  return u.toString();
}

/**
 * An organic result's address and site: as DataForSEO gave them, or for a Google redirect the address it wraps when it
 * names one, else the redirect with the site from the breadcrumb (then `website_name` when it is a domain). Results
 * saved before 2026-11-11 kept no breadcrumb; their redirects have no site ('').
 */
export function organicLink(item: {
  url?: unknown;
  domain?: unknown;
  breadcrumb?: unknown;
  website_name?: unknown;
  shown?: unknown;
  site?: unknown;
}): OrganicLink {
  const raw = text(item?.url);
  if (!googleRedirect(raw)) {
    const domain = text(item?.domain) || parse(raw)?.hostname || '';
    return { url: raw, domain, resolved: true };
  }
  const real = unwrapped(raw);
  if (real) return { url: real, domain: parse(real)!.hostname, resolved: true };
  const shown = text(item?.breadcrumb) || text(item?.shown),
    site = text(item?.website_name) || text(item?.site);
  const domain = shownHost(shown) || shownHost(site);
  return {
    url: redirectLink(raw),
    domain,
    resolved: false,
    ...(shown ? { shown: shown.slice(0, 300) } : {}),
    ...(site ? { site: site.slice(0, 100) } : {}),
  };
}

/** Whether a domain is one of the site's domains or their subdomains. */
export function ownDomain(domain: unknown, domains: string[]): boolean {
  const d = bare(text(domain));
  return Boolean(d) && domains.some((o) => d === o || d.endsWith('.' + o));
}

/** How many of the results are unresolved redirects. */
export function unresolvedCount(items: { resolved?: boolean }[]): number {
  return items.filter((i) => i?.resolved === false).length;
}

const words = (title: unknown) =>
  text(title)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(?:…|\.\.\.)\s*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
// Google and the page's own <title> both often end with the site's name after " - ", " | " or " · ".
const withoutSite = (title: unknown) =>
  words(text(title).replace(/\s+[-|–—·]\s+[^-|–—·]+$/, ''));

/**
 * The site's page an unresolved result is, from the site's known pages (Website content): the page whose title is the
 * result's title (Google may cut it off with "…" or drop the site's name), narrowed by the path the breadcrumb shows;
 * else the page at that path. Null unless exactly one page fits.
 */
export function pageFor(
  item: { title?: unknown; shown?: unknown },
  pages: { url?: unknown; title?: unknown }[],
): string | null {
  const known = (pages || [])
    .map((p) => ({
      url: text(p?.url),
      title: p?.title,
      path: parse(text(p?.url))?.pathname || '',
    }))
    .filter((p) => p.url);
  const title = words(item?.title),
    short = withoutSite(item?.title),
    cut = /(?:…|\.\.\.)\s*$/.test(text(item?.title));
  const path = shownPath(item?.shown),
    onPath = (p: { path: string }) => {
      const segments = p.path.toLowerCase().split('/').filter(Boolean);
      let at = 0;
      for (const s of path.segments) {
        const found = segments.indexOf(s, at);
        if (found < 0) return false;
        at = found + 1;
      }
      return true;
    };
  let found = title
    ? known.filter((p) => {
        const full = words(p.title),
          own = withoutSite(p.title);
        if (full === title || (short && (own === short || full === short)))
          return true;
        return (
          cut &&
          title.length >= 15 &&
          (full.startsWith(title) || own.startsWith(title))
        );
      })
    : [];
  if (found.length > 1 && path.segments.length) found = found.filter(onPath);
  if (!found.length && path.segments.length && !path.cut)
    found = known.filter(
      (p) =>
        p.path.toLowerCase().split('/').filter(Boolean).join('/') ===
        path.segments.join('/'),
    );
  return found.length === 1 ? found[0].url : null;
}

/** A Reddit community named in a result's site name, breadcrumb or title ("Reddit · r/selfhosted", "… : r/selfhosted"). */
export function subredditOf(...values: unknown[]): string | null {
  for (const v of values) {
    const m = text(v).match(/(?:^|[\s·:/(])r\/([A-Za-z0-9_]{2,40})\b/);
    if (m) return m[1];
  }
  return null;
}

/** A saved result read again: one saved before 2026-11-11 with a Google redirect loses the google.com it was credited to. */
export function savedResult<T extends { url?: unknown; domain?: unknown }>(
  item: T,
): T | (T & OrganicLink) {
  return googleRedirect(item?.url) ? { ...item, ...organicLink(item) } : item;
}
