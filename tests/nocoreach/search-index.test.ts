// @ts-nocheck
// 搜索表现 · 索引 and 站点地图 (server/nocoreach/search-index.ts), 2026-10-14: pages inspected a batch at a time through
// the project's Google connection (never-checked first, then the least recently checked, 500 a day, again after a week),
// the day's count, a page's whole result, and the submitted and unsubmitted sitemaps.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  SearchIndex,
  KEY,
  inProperty,
  DAILY,
  PER_TICK,
} from '../../server/nocoreach/search-index.js';
import { fixtureResponse } from '../../app-plugins/nocoreach-mock/server/fixtures.js';
import { systemMessageText } from '../../shared/i18n/messages.js';

const SITE = 'sc-domain:nocobloom.example';
const ORIGIN = 'https://nocobloom.example';
const ctx = {
  projectId: '1',
  seed: 'nocobloom-demo',
  clock: '2026-10-14T09:00:00.000Z',
  scenario: 'normal',
  revision: 1,
  runId: '00000000-0000-4000-8000-000000000001',
};
const fixture = (url, init = {}) => fixtureResponse(url, init, ctx);
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// A plugin with the parts SearchIndex uses: snapshots by key, the Google link, 内容's pages and a Google fetcher.
function harness({
  paths = ['/', '/pricing', '/docs/reporting', '/templates/customer-success'],
  extra = [],
  sitemaps = [`${ORIGIN}/sitemap.xml`, `${ORIGIN}/sitemap-pages.xml`],
  fetcher = fixture,
} = {}) {
  const rows = {};
  const repo = {
    findOne: async ({ filter }) =>
      rows[filter.key] != null
        ? { id: filter.key, get: () => rows[filter.key] }
        : null,
    update: async ({ filterByTk, values }) => {
      rows[filterByTk] = values.payload;
    },
    create: async ({ values }) => {
      rows[values.key] = values.payload;
    },
  };
  const state = {
    site: SITE,
    connected: true,
    pages: [...paths.map((p) => ({ url: ORIGIN + p, type: 'page' })), ...extra],
  };
  const asked = [];
  const plugin = {
    db: {
      getRepository: () => repo,
      sequelize: { transaction: (fn) => fn({}), query: async () => {} },
    },
    sync: {
      link: async () => {
        if (!state.connected)
          throw Object.assign(new Error('not connected'), {
            code: 'NOCOREACH_GOOGLE_NOT_CONNECTED',
          });
        return { get: (k) => (k === 'gscSiteUrl' ? state.site : null) };
      },
    },
    siteContent: {
      state: async () => ({
        sites: [{ origin: ORIGIN, sitemaps }],
        pages: state.pages,
      }),
    },
    token: async () => 'token',
    googleFetch: () => (url, init) => {
      asked.push({
        url: String(url),
        body: init?.body ? JSON.parse(init.body) : null,
      });
      return fetcher(url, init);
    },
    projectIds: async () => ['1'],
  };
  return { t: new SearchIndex(plugin), rows, state, asked, plugin };
}

test('a domain property covers its subdomains, a URL-prefix property the URLs under it', () => {
  assert.equal(inProperty(SITE, 'https://docs.nocobloom.example/a'), true);
  assert.equal(inProperty(SITE, 'https://nocobloom.example.evil/a'), false);
  assert.equal(
    inProperty('https://nocobloom.example/', 'https://nocobloom.example/a'),
    true,
  );
  assert.equal(
    inProperty('https://nocobloom.example/', 'http://nocobloom.example/a'),
    false,
  );
  assert.equal(inProperty(SITE, 'not a url'), false);
});

test('a batch inspects never-checked pages first, 25 at a time, and keeps the results, the quota and the day', async () => {
  const paths = Array.from({ length: 30 }, (_, i) => `/p${i}`);
  const { t, rows, asked } = harness({ paths });
  assert.equal(await t.run('1'), PER_TICK);
  assert.deepEqual(asked[0].body, {
    inspectionUrl: `${ORIGIN}/p0`,
    siteUrl: SITE,
    languageCode: 'en-US',
  });
  assert.equal(
    asked[0].url,
    'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
  );
  let s = rows[KEY('1')];
  assert.equal(Object.keys(s.results).length, 25);
  assert.equal(s.quota.count, 25);
  assert.equal(await t.run('1'), 5);
  s = rows[KEY('1')];
  assert.equal(s.quota.count, 30);
  assert.equal(await t.run('1'), 0, 'nothing is due within a week');
  assert.equal(asked.length, 30);
  assert.deepEqual(
    s.history.map((h) => [h.indexed, h.notIndexed, h.checked]),
    [[30, 0, 30]],
  );
});

test('pages are checked again after a week, least recently checked first, within the daily 500', async () => {
  const { t, rows, asked } = harness({ paths: ['/a', '/b', '/c'] });
  await t.run('1');
  const s = rows[KEY('1')],
    old = (d) => new Date(Date.now() - d * 86400000).toISOString();
  s.results[`${ORIGIN}/a`].checkedAt = old(8);
  s.results[`${ORIGIN}/b`].checkedAt = old(9);
  s.results[`${ORIGIN}/c`].checkedAt = old(2);
  s.quota.count = DAILY - 1;
  asked.length = 0;
  assert.equal(await t.run('1'), 1);
  assert.deepEqual(
    asked.map((a) => a.body.inspectionUrl),
    [`${ORIGIN}/b`],
  );
  assert.equal(await t.run('1'), 0, 'the day is used up');
  assert.equal(rows[KEY('1')].quota.count, DAILY);
});

test('a refused page keeps its error; rate limits end the batch without recording the rest', async () => {
  let calls = 0;
  const { t, rows } = harness({
    paths: ['/a', '/b', '/c'],
    fetcher: async (url, init) => {
      calls++;
      if (calls === 1)
        return json(
          { error: { code: 403, message: 'URL not in property' } },
          403,
        );
      if (calls === 2)
        return json({ error: { code: 429, message: 'Quota exceeded' } }, 429);
      return fixture(url, init);
    },
  });
  assert.equal(await t.run('1'), 1);
  const s = rows[KEY('1')];
  assert.deepEqual(Object.keys(s.results), [`${ORIGIN}/a`]);
  assert.equal(s.results[`${ORIGIN}/a`].error, 'URL not in property');
  assert.equal(s.lastError, 'Quota exceeded');
  assert.equal(s.quota.count, 1);
  // Nothing inspected at all: the failure is reported and kept for the page.
  const other = harness({
    fetcher: async () => json({ error: 'invalid_grant' }, 400),
  });
  await assert.rejects(other.t.run('1'));
  assert.deepEqual(other.rows[KEY('1')].results, {});
  assert.equal(other.rows[KEY('1')].lastError, 'invalid_grant');
  assert.equal((await other.t.view('1')).lastError, 'invalid_grant');
  await other.t.later?.catch(() => undefined);
});

test('the view: statuses, canonical mismatch, rich results per type, pages outside the property; opening it starts the first batch', async () => {
  const { t, state } = harness({
    extra: [{ url: 'https://elsewhere.example/x', type: 'page' }],
  });
  const first = await t.view('1');
  assert.equal(first.running, true);
  assert.equal(first.total, 4);
  assert.equal(first.outside, 1);
  assert.ok(first.pages.every((p) => p.status === 'unchecked'));
  await t.later;
  const v = await t.view('1');
  const by = Object.fromEntries(
    v.pages.map((p) => [p.url.slice(ORIGIN.length), p]),
  );
  assert.equal(by['/'].status, 'indexed');
  assert.equal(by['/docs/reporting'].status, 'notIndexed');
  assert.equal(
    by['/docs/reporting'].coverageState,
    'Crawled - currently not indexed',
  );
  assert.equal(by['/templates/customer-success'].canonicalMismatch, true);
  assert.deepEqual(by['/pricing'].rich, [
    { type: 'FAQ', errors: 1, warnings: 0 },
  ]);
  assert.equal(v.quota.used, 4);
  assert.equal(v.history.at(-1).indexed, 2);
  const detail = await t.page('1', {
    url: `${ORIGIN}/templates/customer-success`,
  });
  assert.equal(
    detail.result.googleCanonical,
    `${ORIGIN}/templates/issue-triage`,
  );
  assert.equal(
    detail.result.userCanonical,
    `${ORIGIN}/templates/customer-success`,
  );
  assert.equal(detail.result.indexed, false);
  assert.deepEqual(detail.result.sitemaps, [`${ORIGIN}/sitemap-pages.xml`]);
  // Another property: the old results no longer apply.
  state.site = 'https://nocobloom.example/';
  assert.ok((await t.view('1')).pages.every((p) => p.status === 'unchecked'));
  await t.later;
  state.connected = false;
  assert.deepEqual(await t.view('1'), { connected: false });
});

test('sitemaps: submitted ones with the files under an index, the ones only robots.txt names, indexed/checked per sitemap', async () => {
  const entry = (path, extra = {}) => ({
    path: ORIGIN + path,
    type: 'sitemap',
    isPending: false,
    isSitemapsIndex: false,
    lastSubmitted: '2026-05-01T00:00:00Z',
    lastDownloaded: '2026-10-13T00:00:00Z',
    warnings: '0',
    errors: '0',
    contents: [{ type: 'web', submitted: '3', indexed: '0' }],
    ...extra,
  });
  const { t, asked } = harness({
    sitemaps: [
      `${ORIGIN}/sitemap.xml`,
      `${ORIGIN}/sitemap-pages.xml`,
      `${ORIGIN}/sitemap-blog.xml`,
      'https://elsewhere.example/sitemap.xml',
    ],
    fetcher: async (url, init) => {
      const u = new URL(url);
      if (u.hostname === 'searchconsole.googleapis.com')
        return fixture(url, init);
      if (u.searchParams.get('sitemapIndex'))
        return json({
          sitemap: [
            entry('/sitemap-pages.xml'),
            entry('/sitemap-docs.xml', { warnings: '2' }),
          ],
        });
      return json({
        sitemap: [
          entry('/sitemap.xml', {
            isSitemapsIndex: true,
            contents: [
              { type: 'web', submitted: '6' },
              { type: 'image', submitted: '2' },
            ],
          }),
        ],
      });
    },
  });
  await t.run('1');
  const v = await t.sitemaps('1');
  assert.equal(v.connected, true);
  const [index] = v.sitemaps;
  assert.equal(index.isIndex, true);
  assert.deepEqual(index.contents, [
    { type: 'web', submitted: 6 },
    { type: 'image', submitted: 2 },
  ]);
  assert.deepEqual(
    index.children.map((c) => [
      c.path.slice(ORIGIN.length),
      c.warnings,
      c.checked,
      c.indexed,
    ]),
    [
      ['/sitemap-pages.xml', 0, 3, 2],
      ['/sitemap-docs.xml', 2, 1, 0],
    ],
  );
  assert.deepEqual([index.checked, index.indexed], [4, 2]);
  assert.deepEqual(v.unsubmitted, [
    { path: `${ORIGIN}/sitemap-blog.xml`, checked: 0, indexed: 0 },
  ]);
  const reads = asked.filter((a) => a.url.includes('/sitemaps')).length;
  await t.sitemaps('1');
  assert.equal(
    asked.filter((a) => a.url.includes('/sitemaps')).length,
    reads,
    'kept six hours',
  );
});

test('sitemaps say when the Google sign-in expired', async () => {
  const { t } = harness({
    fetcher: async () => json({ error: 'invalid_grant' }, 400),
  });
  await assert.rejects(t.sitemaps('1'), (e) => {
    assert.equal(e.status, 502);
    assert.equal(
      e.message,
      systemMessageText('dataViews.googleAuthorizationExpiredAuthorizeAgain'),
    );
    return true;
  });
});
