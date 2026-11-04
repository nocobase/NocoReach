// Finding a page by its link (2026-11-04, T-69): a whole address, a domain with a path or a path finds the page it is,
// whatever its scheme, www., trailing slash or language prefix the site drops; any other search reads titles and
// addresses as before (shared/page-search.ts).
import { expect, it } from 'vitest';
import { pageIdentity } from '../../shared/page-identity';
import { findPages, ownLink, searchedLinks } from '../../shared/page-search';

const post = 'https://www.nocobase.com/blog/sungrow/';
const customer = 'https://www.nocobase.com/customers/sungrow/';
const pricing = 'https://www.nocobase.com/pricing';
// Website content as www.nocobase.com reads: /en/ addresses name the page without the prefix as their canonical.
const site = {
  sites: [{ origin: 'https://www.nocobase.com' }],
  pages: [
    { url: customer, canonical: customer, title: 'Sungrow: a solar company' },
    { url: post, canonical: post, title: 'How Sungrow builds its tools' },
    { url: pricing, canonical: pricing, title: 'Pricing' },
  ],
  outsidePages: [
    { url: 'https://www.nocobase.com/en/pricing', canonical: pricing },
  ],
};
const identity = pageIdentity(site);
const hosts = ['https://www.nocobase.com', 'nocobase.com'];
const found = (q: string) =>
  findPages(site.pages, q, hosts, identity).pages.map((p) => p.url);

it('reads a whole address, a domain with a path and a path on the site as a link', () => {
  expect(searchedLinks('https://www.nocobase.com/en/blog/sungrow')).toEqual([
    'https://www.nocobase.com/en/blog/sungrow',
  ]);
  expect(searchedLinks('HTTP://NocoBase.com/blog/sungrow/?utm=x#top')).toEqual([
    'http://nocobase.com/blog/sungrow/?utm=x#top',
  ]);
  expect(searchedLinks('nocobase.com/en/blog/sungrow')).toEqual([
    'https://nocobase.com/en/blog/sungrow',
  ]);
  expect(searchedLinks('www.nocobase.com')).toEqual([
    'https://www.nocobase.com/',
  ]);
  // A path is read on each of the site's hosts, once each.
  expect(searchedLinks('/en/blog/sungrow', hosts)).toEqual([
    'https://www.nocobase.com/en/blog/sungrow',
    'https://nocobase.com/en/blog/sungrow',
  ]);
  expect(searchedLinks('/en/blog/sungrow')).toEqual([]);
  // Not a link: words, a path without its slash, a version number, two addresses, or another scheme.
  for (const q of [
    '',
    'sungrow',
    'blog/sungrow',
    'v2.2.29',
    'https://www.nocobase.com/a https://www.nocobase.com/b',
    'ftp://nocobase.com/x',
    '//nocobase.com/x',
    'https://',
  ])
    expect(searchedLinks(q, hosts)).toBeNull();
});

it('finds a page by its link with or without www, the scheme, a trailing slash or the language prefix', () => {
  for (const q of [
    'https://www.nocobase.com/blog/sungrow/',
    'https://www.nocobase.com/blog/sungrow',
    'http://nocobase.com/blog/sungrow?utm_source=x#top',
    'nocobase.com/blog/sungrow',
    'www.nocobase.com/blog/sungrow/',
    '/blog/sungrow',
    '/blog/sungrow/',
    // The /en/ prefix the site's canonicals drop.
    'https://www.nocobase.com/en/blog/sungrow',
    'nocobase.com/en/blog/sungrow/',
    '/en/blog/sungrow',
  ])
    expect({ q, found: found(q) }).toEqual({ q, found: [post] });
  expect(findPages(site.pages, '/en/pricing', hosts, identity).named).toBe(1);
  // A link names one page, not every page whose address holds it.
  expect(found('nocobase.com/customers/sungrow')).toEqual([customer]);
  // A language the site keeps is another page, and another site's page is none of these.
  expect(found('https://www.nocobase.com/cn/blog/sungrow')).toEqual([]);
  expect(found('https://other.example/blog/sungrow')).toEqual([]);
});

it('keeps searching titles and addresses as before', () => {
  expect(found('sungrow')).toEqual([customer, post]);
  expect(found('  SunGrow  ')).toEqual([customer, post]);
  expect(found('Pricing')).toEqual([pricing]);
  expect(found('blog/sungrow')).toEqual([post]);
  expect(found('')).toEqual(site.pages.map((p) => p.url));
  // A title that looks like a domain still finds its page.
  expect(
    findPages(
      [{ url: 'https://www.nocobase.com/blog/node', title: 'Node.js tools' }],
      'node.js',
      hosts,
      identity,
    ).pages,
  ).toHaveLength(1);
  // A link that names no page still finds the pages whose address holds it, as before.
  expect(
    findPages(site.pages, 'https://www.nocobase.com/', hosts, identity),
  ).toEqual({ pages: site.pages, named: 0 });
  // The page a link names comes first, then the ones whose address holds the text.
  const listed = [
    { url: 'https://www.nocobase.com/pricing-faq', title: 'Pricing FAQ' },
    ...site.pages,
  ];
  expect(
    findPages(
      listed,
      'https://www.nocobase.com/pricing',
      hosts,
      identity,
    ).pages.map((p) => p.url),
  ).toEqual([pricing, 'https://www.nocobase.com/pricing-faq']);
});

it('offers a link on the site its pages do not name as it is, never another site', () => {
  expect(
    ownLink('https://www.nocobase.com/en/blog/new-post?utm=x#a', hosts),
  ).toBe('https://www.nocobase.com/en/blog/new-post');
  expect(ownLink('nocobase.com/en/blog/new-post/', hosts)).toBe(
    'https://nocobase.com/en/blog/new-post/',
  );
  // A path is read on the site's first host; a host below the site's is the site's too.
  expect(ownLink('/en/blog/new-post', hosts)).toBe(
    'https://www.nocobase.com/en/blog/new-post',
  );
  expect(ownLink('https://docs.nocobase.com/handbook', ['nocobase.com'])).toBe(
    'https://docs.nocobase.com/handbook',
  );
  for (const q of [
    'https://other.example/en/blog/new-post',
    'https://nocobase.com.evil.example/x',
    'https://notnocobase.com/x',
    'new post',
  ])
    expect({ q, link: ownLink(q, hosts) }).toEqual({ q, link: '' });
  expect(ownLink('/en/blog/new-post', [])).toBe('');
});
