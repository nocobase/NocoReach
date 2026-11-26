import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dataforseo/goto-serp.json' with { type: 'json' };
import {
  googleRedirect,
  organicLink,
  pageFor,
  savedResult,
  shownHost,
  subredditOf,
} from '../../server/nocoreach/serp-links.js';

type Item = Record<string, unknown>;
const items = (reply: { tasks: { result: { items: Item[] }[] }[] }) =>
  reply.tasks[0].result[0].items.filter((i) => i.type === 'organic');

describe("Google's hidden result links", () => {
  it('recognises /goto and /url on any Google host, also relative, and nothing else', () => {
    expect(googleRedirect('https://www.google.com/goto?url=CAES1')).toBe(true);
    expect(googleRedirect('https://google.co.uk/goto?url=CAES1')).toBe(true);
    expect(googleRedirect('https://www.google.com.br/url?q=x')).toBe(true);
    expect(googleRedirect('/goto?url=CAES1')).toBe(true);
    expect(googleRedirect('https://www.google.com/search?q=crm')).toBe(false);
    expect(googleRedirect('https://support.google.com/goto')).toBe(false);
    expect(googleRedirect('https://www.example.com/goto?url=1')).toBe(false);
    expect(googleRedirect('')).toBe(false);
  });

  it('credits a hidden result to the site its breadcrumb shows and keeps the redirect, absolute and without the session tail', () => {
    const [odoo, suite, ours, reddit, , , wiki, , , docs, vtiger] = items(
      fixture.rank,
    ).map(organicLink);
    expect(odoo).toEqual({
      url: 'https://www.google.com/goto?url=CAESFAKE0001x',
      domain: 'www.odoo.com',
      resolved: false,
      shown: 'https://www.odoo.com › app › crm',
      site: 'Odoo',
    });
    expect(suite).toEqual({
      url: 'https://suitecrm.com/',
      domain: 'suitecrm.com',
      resolved: true,
    });
    expect(ours.url).toBe('https://www.google.com/goto?url=CAESFAKE0003x');
    expect(ours.domain).toBe('www.nocobase.com');
    // A relative /goto opens on Google; Reddit's breadcrumb is a comment count, so no site is known.
    expect(reddit).toMatchObject({
      url: 'https://www.google.com/goto?url=CAESFAKE0004x',
      domain: '',
      resolved: false,
      site: 'Reddit · r/selfhosted',
    });
    expect(wiki.domain).toBe('en.wikipedia.org');
    expect(docs.domain).toBe('docs.nocobase.com');
    // The older wrapper names the address: resolved.
    expect(vtiger).toEqual({
      url: 'https://www.vtiger.com/open-source-crm/',
      domain: 'www.vtiger.com',
      resolved: true,
    });
  });

  it('reads a host only from a whole shown address', () => {
    expect(shownHost('https://www.nocobase.com › blog')).toBe(
      'www.nocobase.com',
    );
    expect(shownHost('github.com › nocobase')).toBe('github.com');
    expect(shownHost('https://www.a-very-long-domain-name-that-g...')).toBe('');
    expect(shownHost('230+ comments · 1 year ago')).toBe('');
    expect(shownHost('NocoBase')).toBe('');
  });

  it('a result saved before the fix loses the google.com it was credited to', () => {
    expect(
      savedResult({
        position: 3,
        domain: 'google.com',
        url: 'https://google.com/goto?url=CAES9',
        title: 'T',
      }),
    ).toMatchObject({ domain: '', resolved: false });
    const plain = { position: 1, domain: 'a.com', url: 'https://a.com/' };
    expect(savedResult(plain)).toBe(plain);
  });

  it("finds the site's page of a hidden result by its title, narrowed by the breadcrumb path", () => {
    const pages = [
      {
        url: 'https://www.nocobase.com/en/blog/top-open-source-crm',
        title: 'Top 10 Open Source CRM Systems in 2026',
      },
      {
        url: 'https://www.nocobase.com/en/blog/crm-guide',
        title: 'How to build a CRM - NocoBase',
      },
      {
        url: 'https://docs.nocobase.com/solution/crm',
        title: 'CRM solution',
      },
    ];
    const ours = organicLink(items(fixture.rank)[2]);
    expect(
      pageFor(
        { title: items(fixture.rank)[2].title, shown: ours.shown },
        pages,
      ),
    ).toBe('https://www.nocobase.com/en/blog/top-open-source-crm');
    // Google cut the title off.
    expect(pageFor({ title: 'How to build a CRM ...' }, pages)).toBe(
      'https://www.nocobase.com/en/blog/crm-guide',
    );
    // No title match: the path the breadcrumb shows, when Google did not cut it.
    expect(
      pageFor(
        {
          title: 'NocoBase CRM solution documentation',
          shown: 'https://docs.nocobase.com › solution › crm',
        },
        pages,
      ),
    ).toBe('https://docs.nocobase.com/solution/crm');
    expect(pageFor({ title: 'Something else' }, pages)).toBeNull();
  });

  it('names the subreddit from the site name, the breadcrumb or the title', () => {
    expect(subredditOf('Reddit · r/selfhosted')).toBe('selfhosted');
    expect(subredditOf('Reddit', 'r/nocode')).toBe('nocode');
    expect(subredditOf(null, '45 comments', 'Best CRM? : r/opensource')).toBe(
      'opensource',
    );
    expect(subredditOf('Reddit', '45 comments', 'No sub')).toBeNull();
  });
});
