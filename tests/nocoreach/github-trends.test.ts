// @ts-nocheck
// GitHub 热点 (2026-10-14): topics followed through GitHub's search, stars recorded daily for the 涨星榜, the
// github.com/trending page parsed, and the two signals the daily analysis takes from them.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { GitHubTrends, parseTrending, gained, weekStart, KEY } from '../../server/nocoreach/github-trends.js';
import { computeAll } from '../../server/nocoreach/signals.js';
import { fixtureResponse } from '../../app-plugins/nocoreach-mock/server/fixtures.js';

// One entry as github.com/trending had it on 2026-10-14 (attributes and avatars trimmed).
const ENTRY = `<article class="Box-row">
  <div class="float-right d-flex"><a href="/login?return_to=%2Fmorluto%2Frea" class="btn-sm btn">Star</a></div>
  <h2 class="h3 lh-condensed">
    <a data-hydro-click="{}" href="/morluto/rea" data-view-component="true" class="Link"><svg class="octicon octicon-repo"><path d="M2 2.5"></path></svg>
      <span data-view-component="true" class="text-normal">
        morluto /
</span>
      rea</a>  </h2>
    <p class="col-9 color-fg-muted my-1 tmp-pr-4">
      Reverse engineer anything with agents, from app behavior down to native binaries &amp; more.
    </p>
  <div class="f6 color-fg-muted mt-2">
      <span class="tmp-mr-3 d-inline-block ml-0 tmp-ml-0"><span class="repo-language-color" style="background-color: #3178c6"></span>
  <span itemprop="programmingLanguage">TypeScript</span></span>
      <a href="/morluto/rea/stargazers" data-view-component="true" class="tmp-mr-3 Link Link--muted d-inline-block"><svg aria-label="star" class="octicon octicon-star"><path d="M8 .25"></path></svg>
        220,272</a>
      <a href="/morluto/rea/forks" data-view-component="true" class="tmp-mr-3 Link Link--muted d-inline-block"><svg aria-label="fork" class="octicon octicon-repo-forked"><path d="M5 5.372"></path></svg>
        54,545</a>
      <span data-view-component="true" class="d-inline-block float-sm-right">
        <svg aria-hidden="true" class="octicon octicon-star"><path d="M8 .25"></path></svg>
        54,679 stars today
</span>  </div>
</article>`;

test('Trending entries as GitHub marks them up: repository, description, language, stars, forks, stars gained', () => {
  assert.deepEqual(parseTrending(`<html>${ENTRY}${ENTRY.replace(/morluto\/rea/g, 'a.b/c-d').replace('54,679 stars today', '1,204 stars this week')}</html>`), [
    { repo: 'morluto/rea', url: 'https://github.com/morluto/rea', description: 'Reverse engineer anything with agents, from app behavior down to native binaries & more.', language: 'TypeScript', stars: 220272, forks: 54545, gained: 54679 },
    { repo: 'a.b/c-d', url: 'https://github.com/a.b/c-d', description: 'Reverse engineer anything with agents, from app behavior down to native binaries & more.', language: 'TypeScript', stars: 220272, forks: 54545, gained: 1204 },
  ]);
  assert.deepEqual(parseTrending('<html><body>changed</body></html>'), []);
});

test('stars gained over a period need both records; weeks start on Monday', () => {
  const s = { '2026-10-07': 100, '2026-10-13': 130, '2026-10-14': 140 };
  assert.deepEqual([gained(s, '2026-10-14', 1), gained(s, '2026-10-14', 7), gained(s, '2026-10-14', 30), gained(s, '2026-10-15', 1)], [10, 40, null, null]);
  assert.deepEqual(['2026-10-12', '2026-10-14', '2026-10-18'].map(weekStart), ['2026-10-12', '2026-10-12', '2026-10-12']);
});

// A fake GitHub: search answers by query, GraphQL star counts, the Trending page; snapshot rows by key.
function harness({ token = 'github_pat_x', limitAfter = Infinity, trendingHtml = ENTRY } = {}) {
  const rows = { 'github:1': { repo: 'me/app', profile: { topics: ['low-code', 'lowcode', 'ai-agents', 'crud'] } }, 'competitors:1': { list: [{ name: 'Rival', repo: 'rival/app' }] } };
  const repo = { findOne: async ({ filter }) => (rows[filter.key] != null ? { id: filter.key, get: () => rows[filter.key] } : null), update: async ({ filterByTk, values }) => { rows[filterByTk] = values.payload; }, create: async ({ values }) => { rows[values.key] = values.payload; } };
  const plugin = { mock: { enabled: true, clock: () => '2026-10-14T09:00:00Z' }, db: { getRepository: () => repo, sequelize: { transaction: (fn) => fn({}), query: async () => {} } },
    github: { token: () => token, state: async () => rows['github:1'] }, competitors: { state: async () => rows['competitors:1'] }, projectIds: async () => ['1'] };
  const asked = []; let searches = 0;
  const item = (name, stars, topics = []) => ({ full_name: name, html_url: `https://github.com/${name}`, description: name, language: 'TypeScript', topics, stargazers_count: stars, created_at: '2026-10-10T00:00:00Z' });
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => body });
  const t = new GitHubTrends(plugin, async (url, init) => {
    const u = new URL(url); asked.push(u.pathname + u.search);
    if (u.pathname === '/search/repositories') {
      if (++searches > limitAfter) return { ok: false, status: 403, json: async () => ({ message: 'API rate limit exceeded' }) };
      const q = u.searchParams.get('q'), topic = q.match(/topic:(\S+)/)?.[1];
      if (/created:\d{4}-\d{2}-\d{2}\.\./.test(q)) return ok({ total_count: q.includes('2026-10-05') ? 90 : 30, items: [] });
      if (q.includes('created:>=')) return ok({ total_count: 12, items: topic ? [item(`${topic}/new`, 80, [topic])] : [item('fresh/one', 500)] });
      return ok({ total_count: { 'low-code': 2700, 'ai-agents': 114000, crud: 900 }[topic] ?? 0, items: [item(`${topic}/top`, 5000, [topic]), item('me/app', 21000, [topic])] });
    }
    if (u.pathname === '/graphql') { const names = [...JSON.parse(init.body).query.matchAll(/(r\d+):repository\(owner:"([^"]+)",name:"([^"]+)"\)/g)]; return ok({ data: Object.fromEntries(names.map(([, a, o, n]) => [a, { nameWithOwner: `${o}/${n}`, stargazerCount: 700 }])) }); }
    if (u.pathname === '/trending') return ok(trendingHtml.replace(/morluto\/rea/g, u.searchParams.get('since') === 'daily' ? 'rival/app' : 'morluto/rea'));
    return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
  });
  t.sleep = async () => {};
  return { t, rows, asked, plugin };
}

test('a day: topics suggested from the repository (largest first, one spelling each), weeks filled once, stars recorded', async () => {
  const { t, rows, asked } = harness();
  await t.refresh('1');
  const s = rows[KEY('1')];
  assert.deepEqual(s.topics, ['ai-agents', 'low-code', 'crud'], 'lowcode and low-code are one topic');
  assert.equal(s.topicsAuto, true);
  assert.deepEqual(s.heat['low-code']['2026-10-14'], { total: 2700, new7: 12 });
  assert.equal(Object.keys(s.weekly['low-code']).length, 12);
  assert.equal(s.weekly['low-code']['2026-10-05'], 90);
  assert.deepEqual([s.stars['me/app']['2026-10-14'], s.stars['rival/app']['2026-10-14'], s.stars['fresh/one']['2026-10-14']], [21000, 220272, 500], 'Trending gives the rival its count; search the rest');
  assert.ok(asked.includes('/trending?since=weekly'));
  assert.equal(s.lastRun.day, '2026-10-14');
  // The next day: only the latest two weeks are read again, and yesterday's stars give the day's gain.
  s.stars['me/app']['2026-10-13'] = 20900; s.stars['low-code/top']['2026-10-07'] = 4000;
  const before = asked.length; t.p.mock.clock = () => '2026-10-14T09:00:00Z';
  const view = await t.view('1');
  assert.equal(view.topics.find((x) => x.name === 'low-code').lastWeek, 90);
  assert.equal(view.topics.find((x) => x.name === 'low-code').priorAverage, 30);
  assert.deepEqual(view.gainers.day.map((g) => [g.repo, g.gained, g.own]), [['me/app', 100, true]]);
  assert.deepEqual(view.gainers.week.map((g) => [g.repo, g.gained, g.matched]), [['low-code/top', 1000, ['low-code']]]);
  assert.deepEqual(view.trending.daily.map((x) => [x.repo, x.rival, x.gained]), [['rival/app', true, 54679]]);
  assert.equal(asked.length, before, 'the view reads nothing from GitHub');
});

test('the rate limit stops the run without marking the day done; topics are checked when set', async () => {
  const { t, rows } = harness({ limitAfter: 6 });
  await t.refresh('1');
  assert.equal(rows[KEY('1')].lastRun.limited, true);
  assert.equal(rows[KEY('1')].lastRun.day, null);
  await assert.rejects(t.setTopics('1', { topics: ['Low Code!'] }), /只能用小写字母/);
  await assert.rejects(t.setTopics('1', { topics: Array.from({ length: 13 }, (_, i) => `t${i}`) }), /最多关注 12 个/);
  await t.setTopics('1', { topics: ['MCP', 'mcp', 'workflow'] });
  assert.deepEqual(rows[KEY('1')].topics, ['mcp', 'workflow']);
  assert.equal(rows[KEY('1')].topicsAuto, false);
});

test('signals: a followed topic well above its four weeks before, and a competitor gaining stars far faster', () => {
  const ght = { topics: ['mcp', 'crud'], weekly: { mcp: { a: 20, b: 22, c: 18, d: 20, e: 60 }, crud: { a: 20, b: 22, c: 18, d: 20, e: 21 } },
    lastRun: { day: '2026-10-14' }, stars: { 'rival/app': { '2026-09-16': 1000, '2026-10-07': 1060, '2026-10-14': 1300 } } };
  const keys = computeAll({ now: Date.parse('2026-10-14T09:00:00Z'), ght, cw: { list: [{ name: 'Rival', repo: 'rival/app' }] } }).ranked.map((s) => [s.key, s.source]);
  assert.deepEqual(keys.filter(([k]) => k.startsWith('github-')), [['github-topic:mcp', 'github'], ['github-rival-stars:rival/app', 'github']]);
});

test('the demo data answers every request the day makes', async () => {
  const context = { projectId: '1', seed: 'nocobloom-demo', clock: '2026-10-14T09:00:00.000Z', scenario: 'normal', revision: 1, runId: '00000000-0000-4000-8000-000000000001' };
  const { rows, plugin } = harness();
  const t = new GitHubTrends(plugin, (url, init) => fixtureResponse(String(url), init, context));
  t.sleep = async () => {};
  await t.refresh('1');
  const s = rows[KEY('1')];
  assert.deepEqual(s.lastRun.errors, []);
  assert.ok(s.trending['2026-10-14'].daily.some((x) => x.repo === 'flowgrove/flowgrove'));
  assert.ok(Object.keys(s.stars).length > 10);
});
