// @ts-nocheck
// GitHub page (2026-10-14): the history GitHub keeps with dates (issues, pull requests, commits, releases) read once in
// full and then daily, and the page's view of it next to the 14-day Traffic NocoReach saves.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { GitHubSource, TOKEN, ACTIVITY, activityDays, addIssue, addCommit } from '../../server/nocoreach/github-source.js';
import { githubView, referrerKind, pathArea } from '../../server/nocoreach/github-view.js';
import { windowFor } from '../../server/nocoreach/data-views.js';

const issue = (n, created, closed = null, extra = {}) => ({ number: n, created_at: `${created}T08:00:00Z`, closed_at: closed ? `${closed}T20:00:00Z` : null, author_association: 'CONTRIBUTOR', user: { login: `u${n}` }, ...extra });
const pr = (n, created, merged, closed = merged, extra = {}) => issue(n, created, closed, { pull_request: { merged_at: merged ? `${merged}T20:00:00Z` : null }, ...extra });
const commit = (date, login) => ({ author: login ? { login } : null, commit: { author: { date: `${date}T10:00:00Z`, email: 'someone@example.com', name: 'Someone' } } });

test('per day: issues and pull requests opened, closed and merged; commits, active, first-time and external authors; bots never external', () => {
  const items = {}, team = new Set(), commits = {};
  addIssue(items, team, issue(1, '2026-01-01', '2026-01-03'));
  addIssue(items, team, issue(2, '2026-01-02', null, { author_association: 'MEMBER', user: { login: 'lead' } }));
  addIssue(items, team, pr(3, '2026-01-02', '2026-01-04'));
  addIssue(items, team, pr(4, '2026-01-02', null, '2026-01-05', { author_association: 'OWNER', user: { login: 'owner' } }));
  addIssue(items, team, pr(5, '2026-01-03', null, null, { user: { login: 'dependabot[bot]' }, author_association: 'NONE' }));
  assert.deepEqual(items[3], ['2026-01-02', '2026-01-04', '2026-01-04', 1, 1, 60], 'opened, closed, merged, PR, external, hours to merge');
  assert.deepEqual(items[1].slice(3), [0, 1, 60], 'an issue keeps the hours to close');
  assert.equal(items[5][4], 0, 'a bot is not an outside contributor');
  assert.deepEqual([...team].sort(), ['lead', 'owner']);
  for (const [d, who] of [['2026-01-01', 'lead'], ['2026-01-01', 'ann'], ['2026-01-01', 'ann'], ['2026-01-02', 'ann'], ['2026-01-02', 'bob'], ['2026-01-02', 'dependabot[bot]'], ['2026-01-03', null]]) addCommit(commits, commit(d, who));
  assert.deepEqual(commits['2026-01-01'], { lead: 1, ann: 2 });
  assert.ok(Object.keys(commits['2026-01-03'])[0].startsWith('~'), 'an author without an account is a hash, never the e-mail address');
  const days = activityDays({ items, commits, team: [...team], members: [], releases: [{ tag: 'v1', date: '2026-01-04' }] });
  assert.deepEqual([days['2026-01-02'].issuesOpened, days['2026-01-02'].prsOpened, days['2026-01-02'].externalPrsOpened], [1, 2, 1]);
  assert.deepEqual([days['2026-01-04'].prsMerged, days['2026-01-04'].prsClosed, days['2026-01-04'].releases], [1, 1, 1]);
  assert.equal(days['2026-01-05'].prsClosed, 1);
  assert.equal(days['2026-01-03'].issuesClosed, 1);
  assert.deepEqual([days['2026-01-01'].commits, days['2026-01-01'].externalCommits, days['2026-01-01'].activeContributors, days['2026-01-01'].newContributors], [3, 2, 2, 2]);
  assert.deepEqual([days['2026-01-02'].commits, days['2026-01-02'].externalCommits, days['2026-01-02'].activeContributors, days['2026-01-02'].newContributors], [3, 2, 2, 1], 'ann is no longer new; the bot commits but is neither external nor a contributor');
});

test('referring sites and popular paths are told apart', () => {
  assert.deepEqual(['chatgpt.com', 'Google', 'nocobase.com', 'docs.nocobase.com', 'news.ycombinator.com', 'medium.com', 'github.com', 'example.org'].map((x) => referrerKind(x, ['nocobase.com'])), ['ai', 'search', 'own', 'own', 'community', 'content', 'github', 'other']);
  assert.deepEqual(['/o/r', '/o/r/releases', '/o/r/blob/main/README.md', '/o/r/issues/12', '/o/r/pulls', '/o/r/x'].map(pathArea), ['home', 'releases', 'code', 'issues', 'pulls', 'other']);
});

const gh = () => {
  const daily = {}, views = {}, clones = {};
  for (let i = 0; i < 10; i++) { const d = `2026-10-${String(i + 1).padStart(2, '0')}`; daily[d] = { stars: 100 + i * 3, forks: 10 + (i % 2), watchers: 8 }; }
  for (const d of ['2026-10-08', '2026-10-09', '2026-10-10']) { views[d] = { count: 50, uniques: 20 }; clones[d] = { count: 10, uniques: 4 }; }
  return { repo: 'o/r', url: 'https://github.com/o/r', status: 'active', daily, traffic: { views, clones,
    referrers: { '2026-10-09': [{ referrer: 'Google', count: 30, uniques: 20 }, { referrer: 'chatgpt.com', count: 5, uniques: 4 }], '2026-10-11': [{ referrer: 'Google', count: 40, uniques: 25 }, { referrer: 'chatgpt.com', count: 9, uniques: 7 }, { referrer: 'nocobase.com', count: 51, uniques: 30 }] },
    paths: { '2026-10-11': [{ path: '/o/r', title: 'r', count: 70, uniques: 40 }, { path: '/o/r/releases', title: 'Releases', count: 30, uniques: 20 }] } },
    profile: { languages: { TypeScript: 900, CSS: 100 }, topics: ['low-code'], contributors: [{ login: 'lead', contributions: 50 }, { login: 'ann', contributions: 9 }] },
    issues: { total: 1, top: [], labels: { bug: 3, docs: 1 } }, starHistory: { complete: true } };
};
const activity = () => {
  const items = {}, team = new Set(), commits = {};
  addIssue(items, team, issue(1, '2026-10-02', '2026-10-04'));
  addIssue(items, team, issue(2, '2026-10-05'));
  addIssue(items, team, pr(3, '2026-10-03', '2026-10-06'));
  addIssue(items, team, pr(4, '2026-10-08', null, null, { author_association: 'MEMBER', user: { login: 'lead' } }));
  addCommit(commits, commit('2026-10-02', 'lead'));
  addCommit(commits, commit('2026-10-09', 'ann'));
  return { repo: 'o/r', complete: true, items, commits, team: [...team], members: [], releases: [{ tag: 'v2', name: 'v2', date: '2026-10-07', downloads: 12, assets: [{ name: 'app.zip', downloads: 12, size: 2048 }] }] };
};
const opts = (extra = {}) => ({ windowFor, end: '2026-10-10', own: ['nocobase.com'], token: true, ...extra });

test('全部时间 starts at the first record; each day has the history figures, zeros only where history is known', () => {
  const v = githubView(gh(), activity(), { range: 'all' }, opts());
  assert.deepEqual([v.window.start, v.window.end, v.window.all], ['2026-10-01', '2026-10-10', true]);
  assert.deepEqual(v.previousCommunity, [], 'no previous period for all time');
  const day = (d) => v.community.find((r) => r.date === d);
  assert.equal(day('2026-10-01').starsAdded, undefined, 'no earlier sample to subtract from');
  assert.deepEqual([day('2026-10-02').starsAdded, day('2026-10-02').forksAdded, day('2026-10-02').starsTotal], [3, 1, 103]);
  assert.deepEqual([day('2026-10-02').issuesOpened, day('2026-10-02').commits, day('2026-10-02').newContributors], [1, 1, 1]);
  assert.equal(day('2026-10-01').issuesOpened, undefined, 'before the first activity the history is unknown, not zero');
  assert.equal(day('2026-10-10').issuesOpened, 0);
  assert.deepEqual([v.figures.prsMerged, v.figures.prsClosed, v.figures.newContributors, v.figures.externalCommits], [1, 1, 2, 1]);
  assert.equal(v.figures.prMergeHours, 84);
  assert.deepEqual([v.totals.openIssues, v.totals.openPrs, v.totals.contributors, v.totals.releases, v.totals.releaseDownloads], [1, 1, 2, 1, 12]);
  assert.deepEqual(v.composition.languages.map((l) => [l.name, l.share]), [['TypeScript', 0.9], ['CSS', 0.1]]);
  assert.deepEqual(v.composition.contributors.map((c) => [c.login, c.external]), [['lead', false], ['ann', true]]);
  assert.deepEqual(v.composition.assets, [{ name: 'app.zip', downloads: 12, size: 2048, release: 'v2' }]);
});

test('a 7-day window with the period before; Traffic and snapshots as NocoReach saved them', () => {
  const v = githubView(gh(), activity(), { range: '7' }, opts());
  assert.deepEqual([v.window.start, v.window.previousStart, v.community.length, v.previousCommunity.length], ['2026-10-04', '2026-09-27', 7, 7]);
  assert.deepEqual([v.figures.views, v.figures.uniques, v.figures.trafficDays], [150, 60, 3]);
  assert.equal(v.previous.views, null, 'nothing saved before: unknown, not zero');
  assert.equal(v.history.savedSince, '2026-10-08');
  assert.deepEqual(v.referrers.dates, ['2026-10-09', '2026-10-11'], 'the snapshot read on 10-11 covers up to 10-10');
  assert.deepEqual(v.referrers.series.map((s) => [s.key, s.values]), [['nocobase.com', [null, 51]], ['google', [30, 40]], ['chatgpt.com', [5, 9]]]);
  assert.deepEqual(v.referrers.latest.items.map((x) => [x.referrer, x.kind]), [['nocobase.com', 'own'], ['Google', 'search'], ['chatgpt.com', 'ai']]);
  assert.equal(v.totals.aiReferrals, 9);
  assert.deepEqual(v.paths.latest.items.map((x) => [x.path, x.area, x.share]), [['/o/r', 'home', 0.7], ['/o/r/releases', 'releases', 0.3]]);
  assert.ok(v.notes.some((n) => n.includes('2026-10-08 起每天保存')));
});

test('notes say why history is missing: no token, still reading, or failed', () => {
  assert.ok(githubView(gh(), null, { range: '28' }, opts({ token: false })).notes[0].includes('接入 token'));
  assert.ok(githubView(gh(), null, { range: '28' }, opts({ running: true })).notes[0].includes('正在补全'));
  const failed = githubView(gh(), { repo: 'o/r', complete: false, error: 'GitHub 拒绝了' }, { range: '28' }, opts());
  assert.equal(failed.history.activity, 'failed');
  assert.ok(failed.notes[0].includes('GitHub 拒绝了'));
  assert.equal(failed.community.find((r) => r.date === '2026-10-05').issuesOpened, undefined);
});

// A fake GitHub with the lists the history reads, and snapshot rows by key.
function source(lists) {
  const rows = { 'github:1': { repo: 'o/r', status: 'active', daily: {}, traffic: { views: {}, clones: {}, referrers: {}, paths: {} }, starHistory: { complete: true }, forkHistory: { complete: true } } };
  const repo = { findOne: async ({ filter }) => (rows[filter.key] != null ? { id: filter.key, get: () => rows[filter.key] } : null), update: async ({ filterByTk, values }) => { rows[filterByTk] = values.payload; }, create: async ({ values }) => { rows[values.key] = values.payload; } };
  const plugin = { env: (k) => (k === TOKEN('1') ? 'github_pat_x' : ''), db: { getRepository: () => repo, sequelize: { transaction: (fn) => fn({}), query: async () => {} } } };
  const asked = [];
  const gh = new GitHubSource(plugin, async (url) => { const u = new URL(url); asked.push(u.pathname + u.search); const page = Number(u.searchParams.get('page')); const list = lists(u.pathname, u.searchParams); return { status: list === 404 ? 404 : 200, ok: list !== 404, headers: { get: () => null }, json: async () => (list === 404 ? { message: 'Not Found' } : page > 1 ? [] : list) }; });
  gh.pause = async () => {};
  return { gh, rows, asked };
}

test('the history is read once in full, then only what changed since; a failure is kept with the history', async () => {
  let fail = false;
  const { gh, rows, asked } = source((path, q) => {
    if (fail && path.endsWith('/commits')) return 404;
    if (path.endsWith('/issues')) return q.get('since') ? [issue(1, '2026-10-02', '2026-10-09'), issue(9, '2026-10-09')] : [issue(1, '2026-10-02'), pr(2, '2026-10-03', '2026-10-04')];
    if (path.endsWith('/commits')) return q.get('since') ? [commit('2026-10-09', 'ann')] : [commit('2026-10-02', 'lead'), commit('2026-10-03', 'ann')];
    if (path.endsWith('/releases')) return q.get('page') === '1' ? [{ tag_name: 'v1', published_at: '2026-10-04T00:00:00Z', assets: [{ name: 'a.zip', download_count: 3, size: 10 }] }] : [];
    if (path === '/orgs/o/public_members') return [{ login: 'lead' }];
    return [];
  });
  await gh.backfill('1');
  const a = rows[ACTIVITY('1')];
  assert.equal(a.complete, true);
  assert.deepEqual(Object.keys(a.items).sort(), ['1', '2']);
  assert.deepEqual(a.members, ['lead']);
  assert.equal(a.releases[0].downloads, 3);
  assert.ok(asked.some((x) => x.startsWith('/repos/o/r/issues?state=all&sort=created&direction=asc&per_page=100&page=1')));
  const status = await gh.status('1');
  assert.deepEqual([status.history.activity.complete, status.history.activity.items, status.history.activity.from], [true, 2, '2026-10-02']);
  await gh.refreshActivity('1', rows['github:1'], 'github_pat_x');
  const b = rows[ACTIVITY('1')];
  assert.deepEqual(b.items['1'].slice(0, 2), ['2026-10-02', '2026-10-09'], 'an updated issue replaces its old record');
  assert.deepEqual(Object.keys(b.items).sort(), ['1', '2', '9']);
  assert.deepEqual(b.commits['2026-10-09'], { ann: 1 });
  assert.equal(b.commits['2026-10-02'].lead, 1, 'earlier days are not read again');
  assert.ok(asked.some((x) => x.includes('/issues?state=all&sort=updated&direction=asc&since=')));
  rows[ACTIVITY('1')] = null; fail = true;
  await gh.backfill('1');
  assert.equal(rows[ACTIVITY('1')].complete, false);
  assert.match(rows[ACTIVITY('1')].error, /仓库不存在|Not Found/);
  assert.equal(rows['github:1'].starHistory.complete, true, 'the star history is untouched by a failed activity read');
});
