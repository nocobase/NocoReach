// One page, one identity (2026-11-03): O-59 was handed off as T-55 for /blog/{slug}/ and T-56 for /en/blog/{slug},
// one article whose /en/ address names the first as its canonical. Every place that tells pages apart reads the same
// identity (shared/page-identity.ts), built from the canonicals Website content read.
import { expect, it } from 'vitest';
import {
  canonicalUrl,
  pageIdentity,
  pageKey,
} from '../../shared/page-identity';
import { partsOf, splitOf } from '../../shared/opportunity-parts';
import { distinctPages, pageUrlsOf } from '../../shared/task-start';
import {
  planOf,
  type PlanTask,
} from '../../server/nocoreach/opportunity-hand-off';
import { compare, pageNumbers } from '../../server/nocoreach/execution/effect';
import { settleVerdicts } from '../../server/nocoreach/verdict-coverage';
import { SiteContent } from '../../server/nocoreach/site-content.js';
import {
  contentSignals,
  searchSignals,
  webSignals,
} from '../../server/nocoreach/signals.js';
import { tasksForPage } from '../../client/pages/content-detail';
import type {
  Opportunity,
  Proposal,
  Signal,
  StrategyState,
} from '../../shared/strategy-model';

const slug = '6-open-source-no-code-low-code-tools-for-software-agencies';
// T-55's and T-56's pages, as the rank tracker reported them.
const t55 = `https://www.nocobase.com/blog/${slug}/`;
const t56 = `https://www.nocobase.com/en/blog/${slug}`;
const zh = `https://www.nocobase.com/zh-CN/blog/${slug}/`;
const ja = `https://www.nocobase.com/ja-JP/blog/${slug}/`;
// What www.nocobase.com serves (read on 2026-11-03): the sitemap lists the unprefixed English page and the zh-CN and
// ja-JP pages, each its own canonical; /en/, /cn/ and /ja/ are older addresses people still reach, outside the
// sitemap. /en/ names the English page, /cn/ the zh-CN page, and /ja/ redirects to another host.
const site = {
  sites: [{ origin: 'https://www.nocobase.com' }],
  pages: [
    {
      url: t55,
      canonical: t55,
      title: '6 Open-Source No-Code & Low-Code Tools',
    },
    { url: zh, canonical: zh },
    { url: ja, canonical: ja },
    {
      url: 'https://www.nocobase.com/pricing',
      canonical: 'https://www.nocobase.com/pricing',
    },
  ],
  outsidePages: [
    { url: t56, canonical: t55 },
    { url: `https://www.nocobase.com/cn/blog/${slug}`, canonical: zh },
    {
      url: `https://www.nocobase.com/ja/blog/${slug}`,
      canonical: `https://nocode.nocobase.com/ja/blog/${slug}`,
    },
  ],
};
const identity = pageIdentity(site);

it('the /en/ address and the page its canonical names are one page', () => {
  expect(pageKey(t56)).not.toBe(pageKey(t55));
  expect(pageKey(t56, identity)).toBe(pageKey(t55, identity));
  expect(pageKey(t56, identity)).toBe(`nocobase.com/blog/${slug}`);
  // The fallback: canonicals drop /en/ on this host and none keeps it, so an /en/ address not read yet is the page
  // without it too. Only that prefix: the identity lists no /en/ address one by one.
  expect(identity.dropped).toEqual({ 'nocobase.com': ['en'] });
  expect(identity.canonical).toEqual({
    [`nocobase.com/cn/blog/${slug}`]: zh,
  });
  expect(
    pageKey(
      'https://www.nocobase.com/en/blog/workflow-automation-tools',
      identity,
    ),
  ).toBe(pageKey('https://www.nocobase.com/blog/workflow-automation-tools/'));
  expect(canonicalUrl('https://www.nocobase.com/en', identity)).toBe(
    'https://www.nocobase.com/',
  );
});

it('other languages stay their own pages', () => {
  const english = pageKey(t55, identity);
  // /cn/ is the zh-CN page its canonical names, not the English one.
  expect(pageKey(`https://www.nocobase.com/cn/blog/${slug}`, identity)).toBe(
    pageKey(zh),
  );
  expect(pageKey(zh, identity)).not.toBe(english);
  expect(pageKey(ja, identity)).not.toBe(english);
  // A canonical on another host says nothing about this one.
  expect(pageKey(`https://www.nocobase.com/ja/blog/${slug}`, identity)).toBe(
    `nocobase.com/ja/blog/${slug}`,
  );
  // An unread /cn/ address is not guessed: nothing showed /cn/ is dropped.
  expect(
    pageKey(
      'https://www.nocobase.com/cn/blog/workflow-automation-tools',
      identity,
    ),
  ).toBe('nocobase.com/cn/blog/workflow-automation-tools');
});

it('nothing is guessed before a canonical shows it, and a canonical many pages share is ignored', () => {
  const sitemapOnly = pageIdentity({ pages: site.pages });
  expect(sitemapOnly).toEqual({});
  expect(pageKey(t56, sitemapOnly)).toBe(pageKey(t56));
  // A site naming its home page the canonical of every post.
  const home = 'https://ex.com/';
  const posts = ['a', 'b', 'c', 'd'].map((p) => ({
    url: `https://ex.com/blog/${p}`,
    canonical: home,
  }));
  expect(pageIdentity({ pages: posts })).toEqual({});
  // A prefix some canonicals keep is a language of its own, not the default one.
  const mixed = pageIdentity({
    pages: [
      { url: 'https://ex.com/de/a', canonical: 'https://ex.com/a' },
      { url: 'https://ex.com/de/b', canonical: 'https://ex.com/de/b' },
    ],
  });
  expect(mixed.dropped).toBeUndefined();
  expect(pageKey('https://ex.com/de/c', mixed)).toBe('ex.com/de/c');
});

it('a target naming two pages is not a page', () => {
  const joined = `${t55} 与 https://www.nocobase.com/en/blog/6-open-source-no-code-database-tools`;
  expect(pageKey(joined)).toBe('');
  // T-41: handed off before places, with no pages of its own; its pages are the cited changes'.
  const pages = pageUrlsOf({
    task: {
      evidence: {
        insight: {
          target: `https://www.nocobase.com/en/blog/open-source-airtable-alternatives 与 5-self-hosted-airtable-alternatives`,
          signalIds: ['gsc-near-first'],
        },
        context: {
          signals: {
            items: [
              {
                key: 'gsc-near-first',
                url: 'https://www.nocobase.com/en/blog/open-source-airtable-alternatives',
              },
            ],
          },
        },
      },
    },
    work: {},
  });
  expect(pages).toEqual([
    'https://www.nocobase.com/en/blog/open-source-airtable-alternatives',
  ]);
});

const signal = (key: string, url: string): Signal => ({
  key,
  type: 'page',
  source: 'rank',
  title: `${key} dropped`,
  facts: [],
  strength: 1,
  actionable: true,
  action: 'optimize',
  url,
});
// O-59's cited changes, in its order.
const o59 = [
  signal('rank-drop:bed55555-f2d', t55),
  signal('rank-drop:df5ca061-365', t56),
  signal(
    'rank-drop:69e6b232-afa',
    'https://www.nocobase.com/en/blog/6-open-source-no-code-database-tools',
  ),
];
const card: Opportunity = {
  id: 'o59',
  no: 59,
  title: 'Win back the dropped rankings',
  observation: 'o',
  meaning: 'm',
  evidenceText: 'e',
  limitation: 'l',
  suggestion: 's',
  objective: 'g',
  source: 'search',
  signalIds: o59.map((s) => s.key),
};

it("O-59's two addresses of one article are one place, with both changes", () => {
  expect(partsOf(card, o59).map((p) => p.url)).toEqual([t55, t56, o59[2].url]);
  expect(
    partsOf(card, o59, identity).map((p) => [p.key, p.url, p.signalIds]),
  ).toEqual([
    [
      `page:nocobase.com/blog/${slug}`,
      t55,
      ['rank-drop:bed55555-f2d', 'rank-drop:df5ca061-365'],
    ],
    [
      'page:nocobase.com/blog/6-open-source-no-code-database-tools',
      o59[2].url,
      ['rank-drop:69e6b232-afa'],
    ],
  ]);
  // Cited the other way round, the place still goes by the page's own address.
  const reversed = { ...card, signalIds: [o59[1].key, o59[0].key] };
  expect(partsOf(reversed, o59, identity).map((p) => p.url)).toEqual([t55]);
});

it('the hand-off plan makes one task for the article, and none while T-56 still covers it', () => {
  const plan = planOf({
    card,
    signals: o59,
    site,
    proposals: [],
    tasks: [],
    targets: [],
    locale: 'en-US',
  });
  expect(plan.map((p) => [p.url, p.label, p.signalIds.length])).toEqual([
    [t55, '6 Open-Source No-Code & Low-Code Tools', 2],
    [o59[2].url, '/en/blog/6-open-source-no-code-database-tools', 1],
  ]);
  // Two addresses of one page are still a place to hand off, as the Insights page counts them before asking.
  const two = { ...card, signalIds: [o59[0].key, o59[1].key] };
  expect(splitOf(two, o59)).toHaveLength(2);
  expect(
    planOf({
      card: two,
      signals: o59,
      site,
      proposals: [],
      tasks: [],
      targets: [],
      locale: 'en-US',
    }).map((p) => p.url),
  ).toEqual([t55]);
  // T-56 was made for the /en/ address and is open: the article's place is covered by it.
  const proposals = [
    {
      id: 'p56',
      insight: card,
      taskId: 56,
      taskNo: 56,
      part: {
        key: `page:nocobase.com/en/blog/${slug}`,
        kind: 'page',
        url: t56,
        label: '',
        signalIds: ['rank-drop:df5ca061-365'],
      },
    },
  ] as unknown as Proposal[];
  const tasks: PlanTask[] = [
    { id: 56, evidence: { no: 56, work: { stage: 'plan' } } },
  ];
  expect(
    planOf({
      card,
      signals: o59,
      site,
      proposals,
      tasks,
      targets: [],
      locale: 'en-US',
    }).map((p) => p.task?.no),
  ).toEqual([56, undefined]);
});

it("a task's pages list one page once, whichever address came first", () => {
  expect(distinctPages([t56, t55, zh])).toEqual([t56, t55, zh]);
  expect(distinctPages([t56, t55, zh], 30, identity)).toEqual([t56, zh]);
  const pages = pageUrlsOf({
    task: { evidence: { pages: [t55, t56] } },
    work: {},
    pageIdentity: identity,
  });
  expect(pages).toEqual([t55]);
});

// GSC and GA4 days around a go-live on 2026-10-10: both addresses get searches and visits.
const days = (from: string, n: number) =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.parse(`${from}T00:00:00Z`) + i * 86400000)
      .toISOString()
      .slice(0, 10),
  );
const parts = days('2026-10-03', 15).flatMap((date) => [
  {
    source: 'gsc',
    grain: 'query_page',
    date,
    payload: [
      { page: t55, clicks: 4, impressions: 40, position: 8 },
      { page: t56, clicks: 6, impressions: 60, position: 9 },
      { page: zh, clicks: 50, impressions: 500, position: 3 },
    ],
  },
  {
    source: 'ga4',
    grain: 'page',
    date,
    payload: [
      {
        page: `/blog/${slug}/`,
        host: 'www.nocobase.com',
        views: 10,
        conversions: 0,
      },
      {
        page: `/en/blog/${slug}`,
        host: 'www.nocobase.com',
        views: 5,
        conversions: 0,
      },
      {
        page: `/zh-CN/blog/${slug}/`,
        host: 'www.nocobase.com',
        views: 70,
        conversions: 0,
      },
    ],
  },
]);

it("a page's numbers and results count every address of it, and no other language", () => {
  const range = { start: '2026-10-03', end: '2026-10-09' };
  expect(pageNumbers(parts, [t55], range).pages).toEqual([
    { page: t55, clicks: 28, position: 8, views: 70 },
  ]);
  expect(pageNumbers(parts, [t55], range, identity).pages).toEqual([
    { page: t55, clicks: 70, position: 8.6, views: 105 },
  ]);
  // T-56 reads the same article's numbers.
  expect(pageNumbers(parts, [t56], range, identity).pages[0]).toMatchObject({
    clicks: 70,
    views: 105,
  });
  const result = compare(7, '2026-10-10', [t55], parts, 't', identity);
  expect(result.gsc?.clicks).toEqual([70, 70]);
  expect(result.ga4?.views).toEqual([105, 105]);
});

it('a change on one address is covered by a task on the other', () => {
  const change = signal('rank-drop:df5ca061-365', t56);
  const state = {
    revision: 1,
    goal: null,
    proposals: [],
    insights: {
      generatedAt: '2026-11-03',
      items: [],
      evidence: { signals: { items: [change] } },
      signalReviews: { [change.key]: { verdict: 'do', reason: 'worth it' } },
    },
  } as unknown as StrategyState;
  const tasks = [
    {
      id: 55,
      evidence: { no: 55, work: { stage: 'plan', page: { url: t55 } } },
    },
  ];
  const settled = settleVerdicts(
    structuredClone(state),
    tasks,
    't',
    () => 'id',
    'en-US',
    identity,
  );
  expect(settled.skipped).toEqual([change.key]);
  expect(
    settleVerdicts(structuredClone(state), tasks, 't', () => 'id', 'en-US')
      .raised,
  ).toEqual([change.key]);
});

it('the tasks about a page in Website content include those at its other address', () => {
  const tasks = [
    {
      id: 55,
      title: 'T-55',
      status: '',
      evidence: {
        no: 55,
        work: { stage: 'plan', page: { url: t56 } } as never,
      },
    },
  ];
  expect(tasksForPage(tasks, t55)).toEqual([]);
  expect(tasksForPage(tasks, t55, identity).map((t) => t.id)).toEqual([55]);
});

it('changes grouped by page count both addresses under the page itself', () => {
  const queries = [
    { page: t55, clicks: 3, impressions: 300, position: 12 },
    { page: t56, clicks: 2, impressions: 400, position: 14 },
  ];
  const near = (identityOf?: typeof identity) =>
    searchSignals({ queries, history: [], end: null, identity: identityOf })
      .filter((s) => s.key.startsWith('gsc-near-first'))
      .map((s) => [s.key, s.url]);
  expect(near()).toHaveLength(2);
  expect(near(identity)).toEqual([[`gsc-near-first:/blog/${slug}`, t55]]);
  // The /en/ address's visits are the page's, and a sitemap page naming another page as canonical raises nothing.
  const pages = [
    {
      page: `/blog/${slug}/`,
      host: 'www.nocobase.com',
      views: 30,
      conversions: 0,
    },
    {
      page: `/en/blog/${slug}`,
      host: 'www.nocobase.com',
      views: 30,
      conversions: 0,
    },
  ];
  const stale = (identityOf?: typeof identity) =>
    contentSignals({
      site: {
        pages: [{ url: t55, type: 'blog', lastmod: '2024-01-01' }],
      },
      queries: [],
      pages,
      now: Date.parse('2026-11-03T00:00:00Z'),
      identity: identityOf,
    }).map((s) => s.key);
  expect(stale()).toEqual([]);
  expect(stale(identity)).toEqual([`site-stale:/blog/${slug}`]);
  // 300 views at each address: neither reaches the 500 a low-conversion page needs, the page does.
  const lowConversion = (identityOf?: typeof identity) =>
    webSignals({
      pages: [
        ...pages.map((p) => ({ ...p, views: 300 })),
        {
          page: '/docs',
          host: 'www.nocobase.com',
          views: 2000,
          conversions: 900,
        },
      ],
      history: [],
      referral: [],
      end: null,
      identity: identityOf,
    })
      .filter((s) => s.key.includes(slug))
      .map((s) => s.key);
  expect(lowConversion()).toEqual([]);
  expect(lowConversion(identity)).toEqual([`ga4-low-conversion:/blog/${slug}`]);
});

it('Website content reads the canonical of addresses outside the sitemap and lists the page once', async () => {
  let payload: Record<string, unknown> = {
    sites: [
      { origin: 'https://www.nocobase.com', types: ['blog'], confirmedAt: 't' },
    ],
    pages: [
      {
        url: t55,
        type: 'blog',
        origin: 'https://www.nocobase.com',
        fetchedAt: new Date().toISOString(),
        canonical: t55,
      },
    ],
  };
  const repo = {
    findOne: async () => ({ id: 1, get: () => payload }),
    update: async ({ values }: { values: { payload: typeof payload } }) => {
      payload = values.payload;
    },
    create: async () => undefined,
  };
  const snaps = [
    { key: 'project', payload: { end: '2026-11-01' } },
    {
      key: 'pages-28',
      payload: [
        { page: `/blog/${slug}/`, host: 'www.nocobase.com', views: 100 },
        { page: `/en/blog/${slug}`, host: 'www.nocobase.com', views: 50 },
      ],
    },
    { key: 'queries-28', payload: [{ page: t56, clicks: 5, impressions: 80 }] },
  ];
  const asked: string[] = [];
  const read = async (url: string) => {
    asked.push(url);
    return {
      type: 'text/html',
      text: `<html><head><link rel="canonical" href="${t55}"><title>Old address</title></head><body></body></html>`,
    };
  };
  const plugin = {
    db: {
      getRepository: () => repo,
      sequelize: {
        transaction: (fn: (t: object) => unknown) => fn({}),
        query: async () => undefined,
      },
    },
    sync: { snapshots: async () => snaps },
  };
  const sc = new SiteContent(plugin, read);
  const before = await sc.list('1', '28');
  expect(before.pages.map((p: { url: string }) => p.url)).toEqual([
    t55,
    `https://www.nocobase.com/en/blog/${slug}`,
  ]);
  expect(await sc.enrich('1')).toBe(1);
  expect(asked).toEqual([`https://www.nocobase.com/en/blog/${slug}`]);
  expect(payload.outsidePages).toEqual([
    expect.objectContaining({
      url: `https://www.nocobase.com/en/blog/${slug}`,
      canonical: t55,
    }),
  ]);
  // Read once: nothing more to read until a week has passed.
  expect(await sc.enrich('1')).toBe(0);
  const after = await sc.list('1', '28');
  expect(
    after.pages.map((p: { url: string; views: number; clicks: number }) => [
      p.url,
      p.views,
      p.clicks,
    ]),
  ).toEqual([[t55, 150, 5]]);
  expect(after.identity).toEqual({ dropped: { 'nocobase.com': ['en'] } });
});
