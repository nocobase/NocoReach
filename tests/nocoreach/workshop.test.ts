// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sums = vi.hoisted(() => ({ rows: [] as unknown[], periods: [] as unknown[] }));
vi.mock('../../server/nocoreach/page-days.js', () => ({
  sumPageDays: vi.fn(async (_db, _project, _source, _site, periods) => {
    sums.periods = periods;
    return { rows: sums.rows };
  }),
}));

import { WorkshopService } from '../../server/nocoreach/workshop.js';
import { projectWork } from '../../server/nocoreach/execution/model.js';
import { taskSource } from '../../shared/task-source.js';

// Content workshop (2026-11-13; homepage v5): Trending now comes from Opportunities and leaves once handled in the
// workshop, Library lists every blog article with what was made from it, the records are the project's workshop tasks,
// and creating hands one task per form and place to the chosen Agent.

const ORIGIN = 'https://acme.example';
const NOW = '2026-11-13T12:00:00Z';
const STAMP = '2026-10-26';

function fixture() {
  const state = { nrTasks: [], nrSnapshots: [] };
  let sequence = 1;
  const match = (r, filter = {}) =>
    Object.entries(filter).every(([k, v]) =>
      v && typeof v === 'object' && '$gt' in v
        ? Number(r[k]) > Number(v.$gt)
        : v && typeof v === 'object' && '$startsWith' in v
          ? String(r[k]).startsWith(v.$startsWith)
          : String(r[k]) === String(v),
    );
  const row = (r) => r && { ...r, get: (k) => structuredClone(r[k]), toJSON: () => structuredClone(r) };
  const repo = (name) => ({
    findOne: async ({ filter }) => row(state[name].find((r) => match(r, filter))),
    find: async ({ filter, limit = 100 }) =>
      state[name]
        .filter((r) => match(r, filter))
        .sort((a, b) => Number(a.id) - Number(b.id))
        .slice(0, limit)
        .map(row),
    create: async ({ values }) => {
      const r = { id: sequence++, ...structuredClone(values) };
      state[name].push(r);
      return row(r);
    },
    update: async ({ filterByTk, values }) => {
      Object.assign(state[name].find((r) => r.id === filterByTk), structuredClone(values));
    },
  });
  const site = { pages: [] };
  const started = [];
  const p = {
    db: {
      getRepository: repo,
      sequelize: { query: async () => {}, transaction: async (fn) => fn({}) },
    },
    project: async () => ({ name: 'Acme' }),
    projects: { get: async () => ({ name: 'Acme', memory: { voice: 'Plain and direct.' } }) },
    siteContent: { state: async () => site },
    sync: {
      link: async () => ({ get: (k) => (k === 'gscSiteUrl' ? 'sc-domain:acme.example' : null) }),
      snapshots: async () => [{ key: 'history-search', payload: [{ date: '2026-11-11' }, { date: '2026-11-12' }] }],
    },
    reddit: {
      state: async () => ({
        topicPosts: {
          a: { subreddit: 'projectmanagement', postedAt: '2026-11-10', topics: ['Kanban'] },
          b: { subreddit: 'r/ProjectManagement', postedAt: '2026-11-01', topics: ['kanban'] },
          c: { subreddit: 'productivity', postedAt: '2026-10-25', topics: ['kanban'] },
          old: { subreddit: 'agile', postedAt: '2026-09-01', topics: ['kanban'] },
          other: { subreddit: 'gaming', postedAt: '2026-11-10', topics: ['games'] },
        },
      }),
    },
    followedTopics: { of: async () => ['Kanban'] },
    taskExecution: {
      playbooks: {
        list: async () => ({
          playbooks: [
            { id: 'x-posts', name: 'X 帖子', form: 'x' },
            { id: 'linkedin-post', name: 'LinkedIn 帖子', form: 'linkedin' },
            { id: 'community-post', name: '社区帖', form: 'community' },
          ],
        }),
      },
      key: (kind, project, task, id = '') => `nr-task-${kind}:${project}:${task}:${id}`,
      put: async (key, payload) => {
        state.nrSnapshots.push({ id: sequence++, key, payload });
      },
      agents: {
        taskAgent: vi.fn(async (agentId) => {
          if (agentId === 'agent-1') return { id: 'agent-1', name: 'Agent One', type: 'runner' };
          throw Object.assign(new Error('gone'), { status: 409 });
        }),
      },
      updateTask: vi.fn(async (_project, v) => {
        started.push([v.taskId, v.command, v.agentId ?? v.playbookId]);
        return { work: { revision: v.revision + 1 } };
      }),
    },
    articleTargets: { match: async () => null },
    app: { logger: { warn: vi.fn() } },
  };
  return { s: new WorkshopService(p), p, state, site, started };
}

const page = (path, lastmod, extra = {}) => ({
  url: `${ORIGIN}${path}`,
  title: `${path.split('/').at(-1)} | Acme`,
  type: path.startsWith('/blog/') ? 'blog' : 'page',
  lastmod,
  firstSeenAt: '2026-09-01T08:00:00Z',
  ...extra,
});
// A page's Search Console clicks over the last 30 days, as sumPageDays returns them for the one period asked for.
const END = '2026-11-12';
const clicks = (path, n) => ({ host: 'acme.example', path, period: 0, clicks: n });
const ago = (days) => new Date(Date.parse(NOW) - days * 86400000).toISOString();
const task = (f, id, work, extra = {}) =>
  f.state.nrTasks.push({
    id,
    projectId: '1',
    title: `T${id}`,
    createdAt: `2026-11-${String(id).padStart(2, '0')}T09:00:00Z`,
    updatedAt: `2026-11-${String(id).padStart(2, '0')}T10:00:00Z`,
    evidence: { no: id, work: { ...projectWork({ evidence: {} }), ...work } },
    ...extra,
  });
const article = (path) => ({ kind: 'article', url: `${ORIGIN}${path}`, title: path });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
  sums.rows = [];
});

describe('Content workshop view', () => {
  it('lists every blog article in Library, newest first, with what was made from it, and the workshop tasks', async () => {
    const f = fixture();
    f.site.pages = [
      ...Array.from({ length: 10 }, (_, i) => page(`/docs/p${i}`, STAMP)),
      page('/blog/new-board', '2026-11-04'),
      page('/blog/compare', STAMP),
      page('/blog/old-hit', '2025-06-10'),
      page('/blog/done-all', '2025-01-01'),
      page('/blog/partly', '2025-03-01'),
      page('/blog/hidden', '2026-11-05', { noindex: true }),
      // A build stamp and no later sighting: no known date.
      page('/blog/quiet', STAMP),
      page('/blog/undated-hit', STAMP),
    ];
    sums.rows = [
      clicks('/blog/new-board', 840),
      clicks('/blog/new-board/', 6),
      clicks('/blog/compare', 105),
      clicks('/blog/undated-hit', 300),
      clicks('/blog/quiet', 1),
      clicks('/docs/p0', 900),
    ];
    for (const [id, form, destination] of [[1, 'x'], [2, 'linkedin'], [3, 'community', { kind: 'hn' }]])
      task(f, id, { stage: 'done', repurpose: { form, source: article('/blog/done-all'), ...(destination ? { destination } : {}) } }, { createdAt: ago(5), taskKey: 'workshop:r1:0' });
    task(f, 4, {
      stage: 'flow',
      stageIndex: 0,
      flow: { stages: [{ key: 'analyze', kind: 'agent' }, { key: 'accept', kind: 'review' }] },
      latestRun: { id: 'r', status: 'failed' },
      repurpose: { form: 'x', source: article('/blog/partly') },
    });
    task(f, 5, {
      stage: 'done',
      repurpose: {
        form: 'community',
        source: { kind: 'topic', topic: 'November meetup' },
        destination: { kind: 'own', name: 'Acme Community', url: 'https://community.acme.example/', section: 'Announcements' },
      },
    });
    // Closed: the article does not count as made into X posts.
    task(f, 6, { stage: 'done', cancelledAt: '2026-11-06', repurpose: { form: 'x', source: article('/blog/new-board') } });
    // A published article task: NocoReach knows when the page went out.
    task(f, 7, { stage: 'done', release: { state: 'live', pages: [`${ORIGIN}/blog/compare`], article: { published: { at: '2026-10-20T09:00:00Z' } } } });

    const v = await f.s.view('1');
    // The 30 days back from the last synced day.
    expect(sums.periods).toEqual([{ start: '2026-10-14', end: END }]);
    // Dated ones newest first, then those without a date, most clicked first.
    expect(v.articles.map((a) => [a.url.slice(ORIGIN.length), a.published ?? null, a.clicks30])).toEqual([
      ['/blog/new-board', '2026-11-04', 846],
      ['/blog/compare', '2026-10-20', 105],
      ['/blog/old-hit', '2025-06-10', 0],
      ['/blog/partly', '2025-03-01', 0],
      ['/blog/done-all', '2025-01-01', 0],
      ['/blog/undated-hit', null, 300],
      ['/blog/quiet', null, 1],
    ]);
    const of = (path) => v.articles.find((a) => a.url.endsWith(path));
    // Latest first, as the records.
    expect(of('/blog/done-all').made.map((m) => [m.form, m.destination?.kind ?? null, m.standing])).toEqual([
      ['community', 'hn', 'done'],
      ['linkedin', null, 'done'],
      ['x', null, 'done'],
    ]);
    expect(of('/blog/partly').made).toEqual([{ form: 'x', taskId: '4', no: 4, standing: 'review', at: '2026-11-04T09:00:00Z' }]);
    expect(of('/blog/new-board').made).toEqual([]);
    expect(Object.keys(of('/blog/compare')).sort()).toEqual(['clicks30', 'made', 'published', 'title', 'url']);
    // Records: workshop tasks only, newest first, a failed run marked, nothing kept for the server.
    expect(v.records.map((r) => [r.taskId, r.form, r.standing, r.failed ?? false])).toEqual([
      ['6', 'x', 'closed', false],
      ['5', 'community', 'done', false],
      ['4', 'x', 'review', true],
      ['3', 'community', 'done', false],
      ['2', 'linkedin', 'done', false],
      ['1', 'x', 'done', false],
    ]);
    expect(v.records.some((r) => 'internal' in r)).toBe(false);
    expect(v.recordCount).toBe(6);
    expect(v.hot).toEqual([]);
    expect(Object.keys(v).sort()).toEqual(['articles', 'brand', 'destinations', 'hot', 'recordCount', 'records', 'voice']);
    expect(v.voice).toBe('Plain and direct.');
    expect(v.brand).toEqual({ revision: 0, community: null });
    expect(v.destinations.reddit).toEqual({
      subreddits: [
        { subreddit: 'projectmanagement', discussions: 2 },
        { subreddit: 'productivity', discussions: 1 },
      ],
      weeks: 4,
      recent: [],
    });
  });

  it('shows no clicks without Search Console', async () => {
    const f = fixture();
    f.p.sync.link = async () => ({ get: () => null });
    f.site.pages = [page('/blog/a', '2026-11-10'), page('/blog/b', '2024-01-01')];
    const v = await f.s.view('1');
    expect(v.articles.map((a) => [a.url, a.clicks30])).toEqual([
      [`${ORIGIN}/blog/a`, null],
      [`${ORIGIN}/blog/b`, null],
    ]);
  });

  it('lists live Trending now opportunities with what is hot, their discussions, material and tasks', async () => {
    const f = fixture();
    f.site.pages = [page('/blog/compare', STAMP, { title: 'Compare boards | Acme' }), page('/', STAMP)];
    hot(f);
    task(f, 31, { stage: 'flow', playbook: { name: 'Write blog post' }, playbookId: 'write-blog-post' }, { status: '进行中' });
    task(f, 32, { stage: 'done', repurpose: { form: 'x', source: { kind: 'opportunity', id: 'o35', no: 35, headline: 'h' } } });
    const v = await f.s.view('1');
    expect(v.hot).toHaveLength(1);
    expect(v.hot[0]).toMatchObject({
      id: 'o35',
      no: 35,
      kind: 'rising',
      // T-32 was made from it in the workshop: it has left the workshop's Trending now.
      away: 'adapted',
      headline: { key: 'workshop.hot.searchRise', params: { 0: 'ai project assistant', 1: '126%' } },
      figures: [{ value: 2750 }, { value: 1.26 }],
      chart: { unit: 'month', label: { key: 'workshop.hot.chartSearches' }, points: [900, 1200, 2750] },
      discussionCount: 3,
      communities: { subreddits: [{ subreddit: 'projectmanagement', discussions: 2 }, { subreddit: 'agile', discussions: 1 }], hn: 0 },
      material: [{ title: 'Compare boards', url: `${ORIGIN}/blog/compare` }],
      handed: [{ taskId: '31', no: 31, playbook: 'Write blog post', playbookId: 'write-blog-post' }],
      made: [{ form: 'x', taskId: '32', no: 32, standing: 'done' }],
    });
    expect(v.hot[0].discussions.map((d) => d.title)).toEqual(['Who writes weekly updates?', 'AI status reports']);
    expect(v.hot[0].foundAt).toBe('2026-11-13T06:00:00Z');
  });

  it('takes a Trending now item off once adapted, skipped or not found for 7 days; Opportunities still adapts it', async () => {
    const f = fixture();
    const S = hot(f);
    const away = async () => (await f.s.view('1')).hot.map((h) => [h.id, h.away ?? null]);
    expect(await away()).toEqual([['o35', null]]);
    // A closed workshop task does not count.
    task(f, 40, { stage: 'done', cancelledAt: '2026-11-12', repurpose: { form: 'x', source: { kind: 'opportunity', id: 'o35', no: 35, headline: 'h' } } });
    expect(await away()).toEqual([['o35', null]]);
    // Last found six days before the latest analysis: still listed; seven: left.
    const latest = { generatedAt: '2026-11-13T06:00:00Z', items: [], evidence: { signals: { items: [] } } };
    S.insightHistory = [{ ...S.insights, generatedAt: '2026-11-07T06:00:00Z' }];
    S.insights = latest;
    expect(await away()).toEqual([['o35', null]]);
    S.insightHistory[0].generatedAt = '2026-11-06T06:00:00Z';
    expect(await away()).toEqual([['o35', 'stale']]);
    // Opportunities keeps it pending for 14 days, so Adapt into short posts still makes tasks from it.
    const r = await f.s.create('1', { requestId: 'ad2b6a6e-5f0d-4c1e-9b7a-1f2e3d4c5b6a', source: { kind: 'opportunity', id: 'o35' }, items: [{ form: 'x' }] }, '1', 'Tester');
    expect(r.taskIds).toHaveLength(1);
    expect(await away()).toEqual([['o35', 'adapted']]);
  });

  it('keeps a skip per project for the workshop only', async () => {
    const f = fixture();
    const S = hot(f);
    expect(await f.s.skip('1', { opportunityId: 'o35' }, '7')).toEqual({ skipped: 'o35' });
    await f.s.skip('1', { opportunityId: 'o35' }, '8');
    await f.s.skip('1', { opportunityId: 'o36' }, '7');
    const kept = f.state.nrSnapshots.filter((x) => x.key.startsWith('workshop-skips:'));
    expect(kept.map((x) => x.key)).toEqual(['workshop-skips:1']);
    expect(Object.keys(kept[0].payload.skipped)).toEqual(['o35', 'o36']);
    expect(kept[0].payload.skipped.o35).toEqual({ at: NOW.replace('Z', '.000Z'), by: '8' });
    expect((await f.s.view('1')).hot.map((h) => [h.id, h.away])).toEqual([['o35', 'skipped']]);
    // Opportunities is unchanged, and another project sees nothing skipped.
    expect(S.opportunityMeta).toEqual({});
    expect(await f.s.skips('2')).toEqual({});
    await expect(f.s.skip('1', { opportunityId: ' ' }, '7')).rejects.toMatchObject({ status: 409 });
  });
});

// One Trending now opportunity, O-35, with its analysis, three Reddit discussions and a page of the site; a blog post
// was handed off from it as T-31.
function hot(f) {
  const opportunity = {
    id: 'o35',
    no: 35,
    title: 'Write a starter guide to AI project assistants',
    priority: 'high',
    reason: 'Searches for AI project assistants more than doubled.',
    meaning: 'Few tools answer it yet.',
    suggestion: 'Explain where an assistant saves a project manager time.',
    target: `${ORIGIN}/blog/compare`,
    signalIds: [],
    growth: {
      kind: 'rising',
      category: 'trending',
      subject: 'ai project assistant',
      figures: [
        { label: { key: 'growth.figure.monthlySearches' }, value: 2750 },
        { label: { key: 'growth.figure.threeMonthChange' }, value: 1.26, format: 'change' },
      ],
      evidence: {
        columns: [{ key: 'month' }, { key: 'volume' }, { key: 'discussion' }, { key: 'source' }],
        rows: [
          { month: '2026-08', volume: 900 },
          { month: '2026-09', volume: 1200 },
          { month: '2026-10', volume: 2750 },
          { discussion: 'Who writes weekly updates?', source: 'Reddit · r/projectmanagement', url: 'https://www.reddit.com/r/projectmanagement/1' },
          { discussion: 'AI status reports', source: 'Reddit · r/agile', url: 'https://www.reddit.com/r/agile/2' },
          { discussion: 'Status by AI', source: 'Reddit · r/projectmanagement', url: 'https://www.reddit.com/r/projectmanagement/3' },
        ],
        total: 6,
        unit: 'rows',
        link: '/keywords',
      },
    },
  };
  const S = {
    insights: { generatedAt: '2026-11-13T06:00:00Z', items: [opportunity], evidence: { signals: { items: [] } } },
    insightHistory: [],
    proposals: [{ id: 'p1', insight: { id: 'o35' }, taskId: 31, taskNo: 31 }],
    opportunityMeta: {},
  };
  f.p.strategy = { state: async () => S };
  return S;
}

describe('Content workshop create', () => {
  const brand = (f) =>
    f.state.nrSnapshots.push({
      id: 900,
      key: 'brand-kit:1',
      payload: { revision: 1, community: { name: 'Acme Community', url: 'https://community.acme.example/', sections: ['Tutorials', 'Announcements'] } },
    });
  const requestId = '7d2b6a6e-5f0d-4c1e-9b7a-1f2e3d4c5b6a';

  it('makes one task per form and place in one go with the chosen Agent, then starts each', async () => {
    const f = fixture();
    brand(f);
    const r = await f.s.create(
      '1',
      {
        requestId,
        agentId: 'agent-1',
        source: { kind: 'article', url: `${ORIGIN}/blog/new-board`, title: 'New board' },
        items: [
          { form: 'x' },
          { form: 'community', destination: { kind: 'reddit', subreddit: 'r/ProjectManagement', discussions: 2 } },
          { form: 'community', destination: { kind: 'own', section: 'Tutorials' } },
          { form: 'community', destination: { kind: 'hn' } },
          { form: 'x' },
        ],
      },
      '1',
      'Tester',
      'zh-CN',
    );
    expect(r.taskIds).toHaveLength(4);
    expect(r.started).toEqual(r.taskIds);
    const rows = f.state.nrTasks;
    expect(rows.map((t) => t.title)).toEqual([
      'X 帖子：New board',
      '社区帖：New board → r/ProjectManagement',
      '社区帖：New board → Acme Community · Tutorials',
      '社区帖：New board → Hacker News',
    ]);
    expect(rows[1].evidence.work.repurpose).toEqual({
      form: 'community',
      source: { kind: 'article', url: `${ORIGIN}/blog/new-board`, title: 'New board' },
      destination: { kind: 'reddit', subreddit: 'ProjectManagement', discussions: 2, weeks: 4 },
    });
    expect(rows[2].evidence.work.repurpose.destination).toEqual({
      kind: 'own',
      name: 'Acme Community',
      url: 'https://community.acme.example/',
      section: 'Tutorials',
    });
    expect(rows[0].evidence).toMatchObject({ origin: 'workshop', createdBy: { id: '1', name: 'Tester' }, suggestedPlaybook: 'x-posts' });
    expect(rows[0].evidence.work).toMatchObject({ playbookId: 'x-posts', humanOwnerId: '1', agentId: 'agent-1', agentName: 'Agent One' });
    // Each brief names its own form and place.
    expect(rows.map((t) => t.brief)).toEqual([
      `把文章《New board》改编成三条 X 帖子。原文：${ORIGIN}/blog/new-board`,
      `把文章《New board》改编成一篇发到 Reddit r/ProjectManagement 的社区帖。原文：${ORIGIN}/blog/new-board`,
      `把文章《New board》改编成一篇发到 Acme Community · Tutorials 的社区帖。原文：${ORIGIN}/blog/new-board`,
      `把文章《New board》改编成一篇发到 Hacker News 的社区帖。原文：${ORIGIN}/blog/new-board`,
    ]);
    // The Agent was stored with the task, so starting is the only command.
    expect(f.started.filter(([id]) => id === r.taskIds[0])).toEqual([[r.taskIds[0], 'startTask', 'x-posts']]);
    // The same request again (a lost response) finds the tasks it made.
    const again = await f.s.create('1', { requestId, source: { kind: 'topic', topic: 'x' }, items: [{ form: 'x' }] }, '1', 'Tester');
    expect(again.taskIds).toEqual(r.taskIds);
    expect(f.state.nrTasks).toHaveLength(4);
  });

  it('makes a trending opportunity into posts linked to it, with its analysis, discussions, material and the angle', async () => {
    const f = fixture();
    f.site.pages = [page('/blog/compare', STAMP, { title: 'Compare boards | Acme' })];
    hot(f);
    const r = await f.s.create(
      '1',
      { requestId, agentId: 'agent-1', source: { kind: 'opportunity', id: 'o35' }, angle: '  Start from  weekly status reports ', items: [{ form: 'linkedin' }] },
      '1',
      'Tester',
      'en-US',
    );
    expect(r.taskIds).toHaveLength(1);
    const t = f.state.nrTasks.find((x) => String(x.id) === r.taskIds[0]);
    const { source, angle } = t.evidence.work.repurpose;
    expect(source).toMatchObject({ kind: 'opportunity', id: 'o35', no: 35, headline: 'Searches for “ai project assistant” up 126% in 3 months' });
    expect(source.links).toEqual([
      'https://www.reddit.com/r/projectmanagement/1',
      'https://www.reddit.com/r/agile/2',
      'https://www.reddit.com/r/projectmanagement/3',
      `${ORIGIN}/blog/compare`,
    ]);
    expect(angle).toBe('Start from weekly status reports');
    expect(t.title).toBe('LinkedIn 帖子: Searches for “ai project assistant” up 126% in 3 months');
    expect(t.brief).toContain('Write a LinkedIn post on the trending opportunity O-35: Searches for “ai project assistant” up 126% in 3 months.');
    expect(t.brief).toContain('Few tools answer it yet.');
    expect(t.brief).toContain('Who writes weekly updates? — r/projectmanagement, https://www.reddit.com/r/projectmanagement/1');
    expect(t.brief).toContain(`Compare boards — ${ORIGIN}/blog/compare`);
    expect(t.brief).toContain('Angle for this piece: Start from weekly status reports');
    // Linked to the opportunity as made in Content workshop, never as its hand-off.
    expect(taskSource(t)).toMatchObject({ by: 'person', via: 'workshop', insight: { id: 'o35', no: 35 } });
    expect(t.evidence.insight).toBeUndefined();
    // Gone from Trending now since the page loaded.
    f.p.strategy = { state: async () => ({ ...(await hot(f)), opportunityMeta: { o35: { status: 'ignored' } } }) };
    await expect(
      f.s.create('1', { requestId: '8d2b6a6e-5f0d-4c1e-9b7a-1f2e3d4c5b6a', source: { kind: 'opportunity', id: 'o35' }, items: [{ form: 'x' }] }, '1', 'Tester'),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.s.create('1', { requestId: '9d2b6a6e-5f0d-4c1e-9b7a-1f2e3d4c5b6a', source: { kind: 'topic', topic: 't' }, angle: 'x'.repeat(301), items: [{ form: 'x' }] }, '1', 'Tester'),
    ).rejects.toThrow();
  });

  // Homepage v5: a draft waiting for review counts too, so What to make names every earlier adaptation with a draft.
  it('gives the Agent the drafts of earlier adaptations, approved or waiting for review, to take another angle', async () => {
    const f = fixture();
    f.site.pages = [page('/blog/again', '2025-02-01')];
    task(f, 8, { stage: 'done', results: [{ approvedAt: '2026-10-28T10:00:00Z', content: 'Earlier X thread' }], repurpose: { form: 'x', source: article('/blog/again') } }, { createdAt: '2026-10-28T09:00:00Z' });
    // Still being written: no draft yet.
    task(f, 9, { stage: 'flow', repurpose: { form: 'linkedin', source: article('/blog/again') } });
    // Waiting for review: its latest draft, not the one rejected before it.
    task(f, 10, { stage: 'flow', results: [{ content: 'Rejected LinkedIn post', rejectedAt: '2026-11-10T08:00:00Z' }, { content: 'LinkedIn post for review' }], repurpose: { form: 'linkedin', source: article('/blog/again') } });
    // Only a rejected draft: nothing to read.
    task(f, 11, { stage: 'flow', results: [{ content: 'Rejected thread', rejectedAt: '2026-11-11T08:00:00Z' }], repurpose: { form: 'community', destination: { kind: 'hn' }, source: article('/blog/again') } });
    const view = await f.s.view('1');
    expect(view.articles[0].made.map((m) => [m.taskId, Boolean(m.drafted)])).toEqual([
      ['11', false],
      ['10', true],
      ['9', false],
      ['8', true],
    ]);
    await f.s.create('1', { requestId, source: article('/blog/again'), items: [{ form: 'x' }] }, '1', 'Tester', 'en-US');
    const t = f.state.nrTasks.at(-1);
    expect(t.evidence.work.repurpose).toEqual({
      form: 'x',
      source: article('/blog/again'),
      earlier: [
        { taskId: '10', no: 10, form: 'linkedin', at: '2026-11-10T09:00:00Z' },
        { taskId: '8', no: 8, form: 'x', at: '2026-10-28T09:00:00Z' },
      ],
    });
    expect(t.brief).toContain('Adapted before: LinkedIn post T-10, 2026-11-10; X posts T-8, 2026-10-28. Their drafts are in the context.');
    const kept = f.state.nrSnapshots.find((x) => x.key === `nr-task-source:1:${t.id}:`);
    expect(kept.payload.earlier).toEqual([
      { no: 10, form: 'linkedin', at: '2026-11-10T09:00:00Z', text: 'LinkedIn post for review' },
      { no: 8, form: 'x', at: '2026-10-28T09:00:00Z', text: 'Earlier X thread' },
    ]);
  });

  it('keeps a topic with its points and links, and a task that cannot start waits at Start', async () => {
    const f = fixture();
    f.p.taskExecution.updateTask = vi.fn(async () => {
      throw Object.assign(new Error('no agent'), { status: 409 });
    });
    const r = await f.s.create(
      '1',
      { requestId, source: { kind: 'topic', topic: ' November  meetup ', points: 'Live demo', links: ['https://acme.example/events'] }, items: [{ form: 'linkedin' }] },
      '1',
      'Tester',
    );
    expect(r.started).toEqual([]);
    expect(f.state.nrTasks[0].evidence.work.repurpose.source).toEqual({
      kind: 'topic',
      topic: 'November meetup',
      points: 'Live demo',
      links: ['https://acme.example/events'],
    });
    expect(f.state.nrTasks[0].brief).toBe('围绕话题“November meetup”写一篇 LinkedIn 帖子。\n\nLive demo\n\nhttps://acme.example/events');
    expect(f.p.app.logger.warn).toHaveBeenCalled();
  });

  it('leaves the tasks at Start when the chosen Agent cannot be used', async () => {
    const f = fixture();
    const r = await f.s.create(
      '1',
      { requestId, agentId: 'gone', source: { kind: 'topic', topic: 'Meetup' }, items: [{ form: 'x' }] },
      '1',
      'Tester',
      'en-US',
    );
    expect(r.started).toEqual([]);
    expect(f.started).toEqual([]);
    expect(f.state.nrTasks[0].evidence.work.agentId).toBeUndefined();
    expect(f.state.nrTasks[0].brief).toBe('Write 3 X posts on the topic “Meetup”.');
    expect(f.p.app.logger.warn).toHaveBeenCalled();
  });

  it('refuses what cannot be made', async () => {
    const f = fixture();
    const make = (v) => f.s.create('1', { requestId, source: { kind: 'topic', topic: 't' }, items: [{ form: 'x' }], ...v }, '1', 'Tester');
    await expect(make({ requestId: 'short' })).rejects.toMatchObject({ status: 400 });
    await expect(make({ source: { kind: 'topic', topic: ' ' } })).rejects.toThrow();
    await expect(make({ source: { kind: 'topic', topic: 'x'.repeat(201) } })).rejects.toThrow();
    await expect(make({ source: { kind: 'topic', topic: 't', links: ['ftp://a'] } })).rejects.toThrow();
    await expect(make({ source: { kind: 'article', url: 'javascript:alert(1)', title: 't' } })).rejects.toThrow();
    await expect(make({ items: [] })).rejects.toThrow();
    await expect(make({ items: [{ form: 'xhs' }] })).rejects.toThrow();
    await expect(make({ items: [{ form: 'community' }] })).rejects.toThrow();
    await expect(make({ items: [{ form: 'community', destination: { kind: 'reddit', subreddit: 'a b' } }] })).rejects.toThrow();
    // A section the brand kit does not have (the kit changed in another window).
    await expect(make({ items: [{ form: 'community', destination: { kind: 'own', section: 'Tutorials' } }] })).rejects.toMatchObject({ status: 409 });
    expect(f.state.nrTasks).toEqual([]);
  });
});

describe('Content workshop brand kit', () => {
  it('saves the own community under a revision and refuses a stale save', async () => {
    const f = fixture();
    const saved = await f.s.saveBrand('1', {
      revision: 0,
      community: { name: ' Acme Community ', url: 'https://community.acme.example/', sections: ['Tutorials', 'Tutorials', ' Q&A '] },
    });
    expect(saved).toMatchObject({ revision: 1, community: { name: 'Acme Community', sections: ['Tutorials', 'Q&A'] } });
    await expect(f.s.saveBrand('1', { revision: 0, community: null })).rejects.toMatchObject({ status: 409 });
    await expect(f.s.saveBrand('1', { revision: 1, community: { name: 'A', url: 'https://a.example/', sections: [] } })).rejects.toThrow();
    expect(await f.s.saveBrand('1', { revision: 1, community: null })).toMatchObject({ revision: 2, community: null });
    expect((await f.s.view('1')).brand).toEqual({ revision: 2, community: null });
  });
});
