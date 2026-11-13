// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sums = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('../../server/nocoreach/page-days.js', () => ({
  sumPageDays: vi.fn(async () => ({ rows: sums.rows })),
}));
const cited = vi.hoisted(() => ({ questions: [] as unknown[] }));
vi.mock('../../server/nocoreach/ai-questions.js', () => ({
  markQuestions: vi.fn(() => cited.questions),
}));

import { WorkshopService } from '../../server/nocoreach/workshop.js';
import { projectWork } from '../../server/nocoreach/execution/model.js';
import { clickPeriods } from '../../shared/workshop-recommend.js';
import { taskSource } from '../../shared/task-source.js';

// Content workshop (2026-11-13): the page's recommendations come from the site's own figures, its records from the
// project's workshop tasks, and creating hands one task per form and place to the chosen Agent.

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
    aiQuestions: { state: async () => ({}), parties: async () => ({}) },
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
// Search Console clicks per day back from the last synced day (day 0), summed into the periods the view asks for.
const END = '2026-11-12';
const daily = (path, perDay) =>
  clickPeriods(END).map((p, period) => {
    let clicks = 0;
    for (let d = Math.round((Date.parse(END) - Date.parse(p.end)) / 86400000); d <= Math.round((Date.parse(END) - Date.parse(p.start)) / 86400000); d++)
      clicks += perDay(d);
    return { host: 'acme.example', path, period, clicks };
  });
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
  cited.questions = [];
});

describe('Content workshop view', () => {
  it('recommends site articles by their reasons, after a while again, and lists the workshop tasks', async () => {
    const f = fixture();
    f.site.pages = [
      ...Array.from({ length: 10 }, (_, i) => page(`/docs/p${i}`, STAMP)),
      page('/blog/new-board', '2026-11-04'),
      page('/blog/compare', STAMP),
      page('/blog/old-hit', '2025-06-10'),
      page('/blog/done-all', '2025-01-01'),
      page('/blog/again', '2025-02-01'),
      page('/blog/steady-old', '2024-03-01'),
      page('/blog/steady-recent', '2024-04-01'),
      page('/blog/partly', '2025-03-01'),
      page('/blog/hidden', '2026-11-05', { noindex: true }),
      page('/blog/quiet', STAMP),
    ];
    sums.rows = [
      // Published inside the week before: no full week to compare with, so new only.
      ...daily('/blog/new-board', (d) => (d <= 8 ? 120 : 0)),
      ...daily('/blog/compare', (d) => (d < 7 ? 15 : d < 14 ? 7 : 3)),
      ...daily('/blog/old-hit', () => 50),
      ...daily('/blog/done-all', (d) => (d < 7 ? 10 : d < 14 ? 5 : 1)),
      ...daily('/blog/again', (d) => (d < 7 ? 20 : d < 14 ? 10 : 2)),
      ...daily('/blog/steady-old', () => 2),
      ...daily('/blog/steady-recent', () => 2),
      ...daily('/blog/partly', (d) => (d % 40 ? 0 : 3)),
      ...daily('/blog/quiet', (d) => (d % 30 ? 0 : 1)),
      ...daily('/docs/p0', () => 900),
    ];
    cited.questions = [
      { sources: [{ own: true, url: `${ORIGIN}/blog/new-board` }] },
      { sources: [{ own: true, url: `${ORIGIN}/blog/new-board/` }, { own: false, url: 'https://other.example/' }] },
    ];
    // Adapted 5 days ago: not recommended for 14 days.
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
    task(f, 6, { stage: 'done', cancelledAt: '2026-11-06', repurpose: { form: 'x', source: article('/blog/new-board') } });
    // A published article task: NocoReach knows when the page went out.
    task(f, 7, { stage: 'done', release: { state: 'live', pages: [`${ORIGIN}/blog/compare`], article: { published: { at: '2026-10-20T09:00:00Z' } } } });
    // Adapted 20 days ago at 30 clicks a week; 140 now.
    task(f, 8, { stage: 'done', repurpose: { form: 'x', source: article('/blog/again'), baseline: { clicks7: 30, cited: 0 } } }, { createdAt: ago(20), taskKey: 'workshop:r8:0' });
    // Steady: back 90 days after its adaptation, not 30.
    task(f, 9, { stage: 'done', repurpose: { form: 'linkedin', source: article('/blog/steady-old') } }, { createdAt: ago(100), taskKey: 'workshop:r9:0' });
    task(f, 10, { stage: 'done', repurpose: { form: 'linkedin', source: article('/blog/steady-recent') } }, { createdAt: ago(30), taskKey: 'workshop:r10:0' });

    const v = await f.s.view('1');
    expect(v.searchConnected).toBe(true);
    expect(v.dataThrough).toBe(END);
    expect(v.suggested.map((a) => [a.url.slice(ORIGIN.length), a.reasons, a.clicks7, a.spark?.unit])).toEqual([
      // Rising leads; its clicks all year make it steady too.
      ['/blog/again', ['rising', 'steady'], 140, 'week'],
      ['/blog/compare', ['rising', 'new'], 105, 'week'],
      ['/blog/new-board', ['new'], 840, 'week'],
      ['/blog/old-hit', ['steady'], 350, 'month'],
      ['/blog/steady-old', ['steady'], 14, 'month'],
    ]);
    const again = v.suggested[0];
    expect(again.spark.points).toEqual([14, 14, 14, 14, 14, 14, 70, 140]);
    expect(again.last).toMatchObject({
      at: ago(20),
      made: [{ form: 'x', taskId: '8', no: 8, standing: 'done', at: ago(20) }],
    });
    expect(again.last.since).toBeCloseTo(140 / 30 - 1);
    expect(v.suggested[2]).toMatchObject({ title: 'new-board', cited: 2, published: '2026-11-04' });
    expect(v.suggested[2].last).toBeUndefined();
    expect(v.suggested[4].last).toMatchObject({ at: ago(100) });
    expect(v.suggested[4].last.since).toBeUndefined();
    expect(v.suggested.every((a) => !('series' in a) && !('partial' in a))).toBe(true);
    const partly = v.articles.find((a) => a.url.endsWith('/blog/partly'));
    expect(partly.made).toEqual([{ form: 'x', taskId: '4', no: 4, standing: 'review', at: '2026-11-04T09:00:00Z' }]);
    expect(v.articles.some((a) => a.url.endsWith('/hidden'))).toBe(false);
    expect(v.articles.some((a) => a.url.includes('/docs/'))).toBe(false);
    // Records: workshop tasks only, newest first, a failed run marked, nothing kept for the server.
    expect(v.records.map((r) => [r.taskId, r.form, r.standing, r.failed ?? false])).toEqual([
      ['10', 'linkedin', 'done', false],
      ['9', 'linkedin', 'done', false],
      ['8', 'x', 'done', false],
      ['6', 'x', 'closed', false],
      ['5', 'community', 'done', false],
      ['4', 'x', 'review', true],
      ['3', 'community', 'done', false],
      ['2', 'linkedin', 'done', false],
      ['1', 'x', 'done', false],
    ]);
    expect(v.records.some((r) => 'internal' in r)).toBe(false);
    expect(v.recordCount).toBe(9);
    expect(v.hot).toEqual([]);
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

  it('without Search Console recommends new articles by date only', async () => {
    const f = fixture();
    f.p.sync.link = async () => ({ get: () => null });
    f.site.pages = [page('/blog/a', '2026-11-10'), page('/blog/b', '2024-01-01')];
    const v = await f.s.view('1');
    expect(v.searchConnected).toBe(false);
    expect(v.suggested.map((a) => [a.url, a.reasons, a.spark])).toEqual([[`${ORIGIN}/blog/a`, ['new'], null]]);
    expect(v.articles).toHaveLength(2);
  });

  it('lists live Trending now opportunities with what is hot, their discussions, material and tasks', async () => {
    const f = fixture();
    f.site.pages = [page('/blog/compare', STAMP, { title: 'Compare boards | Acme' }), page('/', STAMP)];
    hot(f);
    task(f, 31, { stage: 'flow', playbook: { name: 'Write blog post' } }, { status: '进行中' });
    task(f, 32, { stage: 'done', repurpose: { form: 'x', source: { kind: 'opportunity', id: 'o35', no: 35, headline: 'h' } } });
    const v = await f.s.view('1');
    expect(v.hot).toHaveLength(1);
    expect(v.hot[0]).toMatchObject({
      id: 'o35',
      no: 35,
      kind: 'rising',
      headline: { key: 'workshop.hot.searchRise', params: { 0: 'ai project assistant', 1: '126%' } },
      figures: [{ value: 2750 }, { value: 1.26 }],
      chart: { unit: 'month', label: { key: 'workshop.hot.chartSearches' }, points: [900, 1200, 2750] },
      discussionCount: 3,
      communities: { subreddits: [{ subreddit: 'projectmanagement', discussions: 2 }, { subreddit: 'agile', discussions: 1 }], hn: 0 },
      material: [{ title: 'Compare boards', url: `${ORIGIN}/blog/compare` }],
      handed: [{ taskId: '31', no: 31, playbook: 'Write blog post' }],
      made: [{ form: 'x', taskId: '32', no: 32, standing: 'done' }],
    });
    expect(v.hot[0].discussions.map((d) => d.title)).toEqual(['Who writes weekly updates?', 'AI status reports']);
    expect(v.hot[0].foundAt).toBe('2026-11-13T06:00:00Z');
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
    // The article's clicks and AI citations now, for when it is recommended again.
    expect(rows[1].evidence.work.repurpose).toEqual({
      form: 'community',
      source: { kind: 'article', url: `${ORIGIN}/blog/new-board`, title: 'New board' },
      destination: { kind: 'reddit', subreddit: 'ProjectManagement', discussions: 2, weeks: 4 },
      baseline: { clicks7: 0, cited: 0 },
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

  it('gives the Agent the approved drafts of earlier adaptations to take another angle', async () => {
    const f = fixture();
    f.site.pages = [page('/blog/again', '2025-02-01')];
    sums.rows = daily('/blog/again', (d) => (d < 7 ? 20 : 2));
    task(f, 8, { stage: 'done', results: [{ approvedAt: '2026-10-28T10:00:00Z', content: 'Earlier X thread' }], repurpose: { form: 'x', source: article('/blog/again') } }, { createdAt: '2026-10-28T09:00:00Z' });
    task(f, 9, { stage: 'flow', repurpose: { form: 'linkedin', source: article('/blog/again') } });
    await f.s.create('1', { requestId, source: article('/blog/again'), items: [{ form: 'x' }] }, '1', 'Tester', 'en-US');
    const t = f.state.nrTasks.at(-1);
    expect(t.evidence.work.repurpose).toMatchObject({
      earlier: [{ taskId: '8', no: 8, form: 'x', at: '2026-10-28T09:00:00Z' }],
      baseline: { clicks7: 140, cited: 0 },
    });
    expect(t.brief).toContain('Adapted before: X posts T-8, 2026-10-28. Their approved drafts are in the context.');
    const kept = f.state.nrSnapshots.find((x) => x.key === `nr-task-source:1:${t.id}:`);
    expect(kept.payload.earlier).toEqual([{ no: 8, form: 'x', at: '2026-10-28T09:00:00Z', text: 'Earlier X thread' }]);
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
