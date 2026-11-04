import { pageKey, type PageIdentity } from './page-identity.js';

// Finding a page by its link (2026-11-04, T-69: pasting https://www.nocobase.com/en/blog/sungrow into Which page to
// change? found nothing). A search that is a link names one page, whatever its scheme, `www.`, trailing slash, query or
// fragment, and whatever address the site says it has (shared/page-identity.ts): a whole address, a domain with a path
// (nocobase.com/en/blog/sungrow), or a path (/en/blog/sungrow) on one of the site's hosts. Anything else is searched in
// the titles and addresses as before; a link is searched there too, so a title that looks like a domain (Node.js) still
// finds its page. Every page search reads it from here: the start card's Which page to change?, Related page, the
// articles a publishing target holds (articles/targets.ts) and Site & product › Pages.

const SCHEME = /^https?:\/\//i;
const DOMAIN =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]|$)/i;
const MAX_LINK = 2000;
const MAX_TERM = 100;

// A domain, an origin or an address, read as an address.
const asUrl = (value: unknown) => {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return null;
  try {
    return new URL(SCHEME.test(v) ? v : `https://${v}`);
  } catch {
    return null;
  }
};
const bareHost = (value: unknown) =>
  asUrl(value)?.hostname.replace(/^www\./, '') || '';
// A web address of a site (a host with a dot), without credentials.
const address = (value: string) => {
  const u = asUrl(value);
  return u &&
    (u.protocol === 'https:' || u.protocol === 'http:') &&
    u.hostname.includes('.') &&
    !u.username &&
    !u.password
    ? u.href
    : '';
};

/**
 * The addresses a search names when it is a link; null when it is not one. A path is read on each of `hosts` (domains
 * or origins, the site's own first), so it names none when there are none.
 */
export function searchedLinks(
  q: unknown,
  hosts: string[] = [],
): string[] | null {
  const value = typeof q === 'string' ? q.trim() : '';
  if (!value || value.length > MAX_LINK || /\s/.test(value)) return null;
  if (value.startsWith('/') && !value.startsWith('//'))
    return [
      ...new Set(
        hosts
          .map((h) => asUrl(h)?.host)
          .filter(Boolean)
          .map((h) => address(`https://${h}${value}`))
          .filter(Boolean),
      ),
    ];
  if (!SCHEME.test(value) && !DOMAIN.test(value)) return null;
  const url = address(value);
  return url ? [url] : null;
}

/**
 * The page a link search names on one of the site's own hosts or below one (docs.example.com of example.com), without
 * its query and fragment, for Use this link; '' when the search is no link or names another site. A path is read on
 * the first of `hosts`.
 */
export function ownLink(q: unknown, hosts: string[]): string {
  const first = searchedLinks(q, hosts)?.[0],
    u = first ? new URL(first) : null,
    host = u ? bareHost(u.href) : '';
  return u &&
    hosts.map(bareHost).some((o) => o && (host === o || host.endsWith(`.${o}`)))
    ? `${u.protocol}//${u.host}${u.pathname}`
    : '';
}

/**
 * The pages a search finds: the ones its link names first, then the ones whose title or address holds the text, as
 * every page search always matched (every page for an empty search). `named` counts the first.
 */
export function findPages<P extends { url?: unknown; title?: unknown }>(
  pages: P[],
  q: unknown,
  hosts: string[],
  identity?: PageIdentity | null,
): { pages: P[]; named: number } {
  const term =
    typeof q === 'string' ? q.trim().toLowerCase().slice(0, MAX_TERM) : '';
  const keys = new Set(
    (searchedLinks(q, hosts) || [])
      .map((url) => pageKey(url, identity))
      .filter(Boolean),
  );
  const named = keys.size
    ? pages.filter((p) => keys.has(pageKey(p.url, identity)))
    : [];
  const holds = (p: P) =>
    !term ||
    `${typeof p.url === 'string' ? p.url : ''} ${typeof p.title === 'string' ? p.title : ''}`
      .toLowerCase()
      .includes(term);
  return {
    pages: [...named, ...pages.filter((p) => !named.includes(p) && holds(p))],
    named: named.length,
  };
}
