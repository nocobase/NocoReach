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
  const items = {}, team = new Set(), commits = {}, details = {};
  addIssue(items, team, issue(1, '2026-10-02', '2026-10-04', { title: 'Docs for linkage', html_url: 'https://github.com/o/r/issues/1', comments: 4 }), details);
  addIssue(items, team, issue(2, '2026-10-05'), details);
  addIssue(items, team, pr(3, '2026-10-03', '2026-10-06', '2026-10-06', { title: 'Add charts' }), details);
  addIssue(items, team, pr(4, '2026-10-08', null, null, { author_association: 'MEMBER', user: { login: 'lead' } }), details);
  addCommit(commits, commit('2026-10-02', 'lead'));
  addCommit(commits, commit('2026-10-09', 'ann'));
  addCommit(commits, commit('2026-10-09', 'ann'));
  addCommit(commits, commit('2026-10-10', 'dependabot[bot]'));
  return { repo: 'o/r', version: 2, complete: true, items, details, commits, team: [...team], members: [], releases: [{ tag: 'v2', name: 'v2', date: '2026-10-07', downloads: 12, assets: [{ name: 'app.zip', downloads: 12, size: 2048 }] }] };
};
const opts = (extra = {}) => ({ windowFor, end: '2026-10-10', own: ['nocobase.com'], token: true, ...extra });

test('全部时间 starts at the first record; new stars and forks never go below zero; history figures where known', () => {
  const v = githubView(gh(), activity(), { range: 'all' }, opts());
  assert.deepEqual([v.window.start, v.window.end, v.window.all], ['2026-10-01', '2026-10-10', true]);
  assert.deepEqual(v.previousDaily, [], 'no previous period for all time');
  const day = (d) => v.daily.find((r) => r.date === d);
  assert.equal(day('2026-10-01').starsAdded, undefined, 'no earlier sample to subtract from');
  assert.deepEqual([day('2026-10-02').starsAdded, day('2026-10-02').forksAdded, day('2026-10-03').forksAdded], [3, 1, 0], 'a deleted fork is not a negative addition');
  assert.deepEqual([day('2026-10-02').issuesOpened, day('2026-10-02').commits, day('2026-10-02').newContributors], [1, 1, 1]);
  assert.deepEqual([day('2026-10-09').views, day('2026-10-02').views], [50, undefined]);
  assert.equal(v.figures.forksAdded, 5);
  assert.deepEqual([v.figures.prsMerged, v.figures.prsClosed, v.figures.newContributors, v.figures.activeContributors, v.figures.commits, v.figures.externalCommits], [1, 1, 2, 2, 4, 2], 'ann committed twice on one day: one contributor; the bot counts as a commit only');
  assert.equal(v.figures.prMergeHours, 84);
  assert.deepEqual([v.totals.openIssues, v.totals.openPrs, v.totals.contributors, v.totals.releases, v.totals.releaseDownloads], [1, 1, 2, 1, 12]);
  assert.deepEqual(v.composition.languages.map((l) => [l.name, l.share]), [['TypeScript', 0.9], ['CSS', 0.1]]);
  assert.deepEqual(v.tables.contributors.map((c) => [c.login, c.commits, c.firstCommit, c.external, c.total]), [['ann', 2, '2026-10-09', true, 9], ['lead', 1, '2026-10-02', false, 50]]);
  assert.deepEqual(v.tables.issues.map((x) => [x.number, x.title, x.state, x.comments]), [[2, '#2', 'open', 0], [1, 'Docs for linkage', 'closed', 4]]);
  assert.deepEqual(v.tables.pulls.map((x) => [x.number, x.title, x.state, x.external]), [[4, '#4', 'open', false], [3, 'Add charts', 'merged', true]]);
  assert.deepEqual(v.tables.releases, [{ tag: 'v2', name: 'v2', date: '2026-10-07', downloads: 12, files: 1 }]);
  assert.equal(v.history.state, 'complete');
});

test('a 7-day window with the period before; referring sites against the snapshot a week before, by kind', () => {
  const v = githubView(gh(), activity(), { range: '7' }, opts());
  assert.deepEqual([v.window.start, v.window.previousStart, v.daily.length, v.previousDaily.length], ['2026-10-04', '2026-09-27', 7, 7]);
  assert.deepEqual([v.figures.views, v.figures.uniques, v.figures.trafficDays], [150, 60, 3]);
  assert.equal(v.previous.views, null, 'nothing saved before: unknown, not zero');
  assert.deepEqual([v.figures.activeContributors, v.previous.activeContributors], [1, 1]);
  assert.equal(v.history.savedSince, '2026-10-08');
  const r = v.tables.referrers;
  assert.deepEqual([r.date, r.comparedWith, r.dates], ['2026-10-11', null, ['2026-10-09', '2026-10-11']], 'no snapshot a week before the latest yet');
  assert.deepEqual(r.items.map((x) => [x.referrer, x.kind, x.share]), [['nocobase.com', 'own', 0.51], ['Google', 'search', 0.4], ['chatgpt.com', 'ai', 0.09]]);
  assert.deepEqual(r.series.google, [30, 40]);
  assert.deepEqual(v.sources.kinds.map((k) => [k.kind, k.count]), [['own', 51], ['search', 40], ['ai', 9]]);
  assert.equal(v.sources.ai, 9);
  assert.deepEqual(v.tables.paths.items.map((x) => [x.path, x.area, x.share]), [['/o/r', 'home', 0.7], ['/o/r/releases', 'releases', 0.3]]);
  assert.ok(v.notes.some((n) => n.includes('2026-10-08 起每天保存')));
  const later = gh(); later.traffic.referrers['2026-10-04'] = [{ referrer: 'Google', count: 10, uniques: 5 }];
  const w = githubView(later, activity(), { range: '7' }, opts()).tables.referrers;
  assert.deepEqual([w.comparedWith, w.items.map((x) => [x.referrer, x.previous])], ['2026-10-04', [['nocobase.com', 0], ['Google', 10], ['chatgpt.com', 0]]]);
});

test('the history state says why figures are missing: no token, still reading, or failed with the reason', () => {
  assert.equal(githubView(gh(), null, { range: '28' }, opts({ token: false })).history.state, 'token');
  assert.equal(githubView(gh(), null, { range: '28' }, opts({ running: true })).history.state, 'running');
  const failed = githubView(gh(), { repo: 'o/r', complete: false, error: 'GitHub 拒绝了' }, { range: '28' }, opts());
  assert.deepEqual([failed.history.state, failed.history.error], ['failed', 'GitHub 拒绝了']);
  assert.ok(failed.notes[0].includes('GitHub 拒绝了'));
  assert.equal(failed.daily.find((r) => r.date === '2026-10-05').issuesOpened, undefined);
  assert.equal(failed.figures.activeContributors, null);
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
  // A history of the first version (no titles) is read again once, in full.
  rows[ACTIVITY('1')] = { ...rows[ACTIVITY('1')], version: 1, details: undefined };
  const reads = asked.filter((x) => x.includes('sort=created')).length;
  await gh.backfill('1');
  assert.equal(asked.filter((x) => x.includes('sort=created')).length, reads + 1);
  assert.equal(rows[ACTIVITY('1')].version, 2);
  assert.ok(rows[ACTIVITY('1')].details['2']);
  rows[ACTIVITY('1')] = null; fail = true;
  await gh.backfill('1');
  assert.equal(rows[ACTIVITY('1')].complete, false);
  assert.match(rows[ACTIVITY('1')].error, /仓库不存在|Not Found/);
  assert.equal(rows['github:1'].starHistory.complete, true, 'the star history is untouched by a failed activity read');
});

test('one request that does not complete is tried again; a failed re-read keeps the history read in full before', async () => {
  let fail = false;
  const { gh, rows } = source((path) => {
    if (fail && path.endsWith('/commits')) return 404;
    if (path.endsWith('/issues')) return [issue(1, '2026-10-02')];
    if (path.endsWith('/commits')) return [commit('2026-10-02', 'lead')];
    return [];
  });
  const slept = [];
  gh.sleep = async (ms) => { slept.push(ms); };
  // The first page of issues does not complete once (a network failure, as on Studio on 2026-10-14).
  const read = gh.request;
  let dropped = false;
  gh.request = async (url, init) => {
    const u = new URL(url);
    if (!dropped && u.pathname.endsWith('/issues')) { dropped = true; throw new Error('直连请求未完成，请检查目标网络'); }
    return read(url, init);
  };
  await gh.backfill('1');
  assert.equal(rows[ACTIVITY('1')].complete, true, 'the dropped page was read again');
  assert.deepEqual(slept, [2000]);
  // A re-read (an older version) that fails keeps the complete history shown, with the reason.
  rows[ACTIVITY('1')] = { ...rows[ACTIVITY('1')], version: 1 };
  fail = true;
  await gh.backfill('1');
  const a = rows[ACTIVITY('1')];
  assert.equal(a.complete, true);
  assert.match(a.error, /仓库不存在|Not Found/);
  assert.ok(a.failedAt);
  const view = githubView({ ...rows['github:1'], daily: {} }, a, { range: 'all' }, { windowFor: (end) => ({ start: end, end, days: 1, previousStart: end, previousEnd: end }), end: '2026-10-10', token: true });
  assert.equal(view.history.state, 'complete');
  assert.ok(view.notes.some((n) => /最新历史没读成/.test(n)));
  assert.ok((await gh.status('1')).history.activity.error);
  // One never read in full has nothing to keep.
  rows[ACTIVITY('1')] = null;
  await gh.backfill('1');
  assert.equal(rows[ACTIVITY('1')].complete, false);
});
