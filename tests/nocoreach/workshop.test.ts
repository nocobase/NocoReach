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
const clicks = (path, periods) =>
  periods.map((n, period) => ({ host: 'acme.example', path, period, clicks: n }));
const task = (f, id, work, extra = {}) =>
  f.state.nrTasks.push({
    id,
    projectId: '1',
    title: `T${id}`,
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
  it('recommends by the site figures, dates pages only from what is known, and lists the workshop tasks', async () => {
    const f = fixture();
    f.site.pages = [
      ...Array.from({ length: 10 }, (_, i) => page(`/docs/p${i}`, STAMP)),
      page('/blog/new-board', '2026-11-04'),
      page('/blog/compare', STAMP),
      page('/blog/old-hit', '2025-06-10'),
      page('/blog/done-all', '2026-11-01'),
      page('/blog/partly', '2025-03-01'),
      page('/blog/new-seen', STAMP, { firstSeenAt: '2026-11-08T08:00:00Z' }),
      page('/blog/hidden', '2026-11-05', { noindex: true }),
      page('/blog/quiet', STAMP),
    ];
    sums.rows = [
      ...clicks('/blog/new-board', [860, 253, 40, 0]),
      ...clicks('/blog/compare', [100, 50, 120, 900]),
      ...clicks('/blog/old-hit', [30, 30, 60, 18600]),
      ...clicks('/blog/done-all', [900, 0, 0, 0]),
      ...clicks('/blog/partly', [10, 9, 20, 12900]),
      ...clicks('/blog/new-seen', [12, 0, 0, 0]),
      ...clicks('/blog/quiet', [15, 12, 30, 400]),
      ...clicks('/docs/p0', [5000, 5000, 9000, 90000]),
    ];
    cited.questions = [
      { sources: [{ own: true, url: `${ORIGIN}/blog/new-board` }] },
      { sources: [{ own: true, url: `${ORIGIN}/blog/new-board/` }, { own: false, url: 'https://other.example/' }] },
    ];
    task(f, 1, { stage: 'done', repurpose: { form: 'x', source: article('/blog/done-all') } });
    task(f, 2, { stage: 'done', repurpose: { form: 'linkedin', source: article('/blog/done-all') } });
    task(f, 3, {
      stage: 'done',
      repurpose: { form: 'community', source: article('/blog/done-all'), destination: { kind: 'hn' } },
    });
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

    const v = await f.s.view('1');
    expect(v.searchConnected).toBe(true);
    expect(v.dataThrough).toBe('2026-11-12');
    // Published in 30 days, or clicks up 30% on 20 or more; never a page whose every form has a task.
    expect(v.recent.map((a) => [a.url.slice(ORIGIN.length), a.published, a.clicks7, a.previous7])).toEqual([
      // Published within the week before: no full week to compare with.
      ['/blog/new-board', '2026-11-04', 860, 0],
      ['/blog/compare', '2026-10-20', 100, 50],
      ['/blog/new-seen', '2026-11-08', 12, 0],
    ]);
    expect(v.recent[0]).toMatchObject({ title: 'new-board', cited: 2, made: [] });
    // Most clicks in 12 months, never adapted, not already in the left column.
    expect(v.earlier.map((a) => [a.url.slice(ORIGIN.length), a.published, a.clicks12m])).toEqual([
      ['/blog/old-hit', '2025-06-10', 18720],
      ['/blog/quiet', undefined, 457],
    ]);
    const partly = v.articles.find((a) => a.url.endsWith('/blog/partly'));
    expect(partly.made).toEqual([{ form: 'x', taskId: '4', no: 4, standing: 'review' }]);
    expect(v.articles.some((a) => a.url.endsWith('/hidden'))).toBe(false);
    expect(v.articles.some((a) => a.url.includes('/docs/'))).toBe(false);
    // Records: workshop tasks only, newest first, a failed run marked.
    expect(v.records.map((r) => [r.taskId, r.form, r.standing, r.failed ?? false])).toEqual([
      ['6', 'x', 'closed', false],
      ['5', 'community', 'done', false],
      ['4', 'x', 'review', true],
      ['3', 'community', 'done', false],
      ['2', 'linkedin', 'done', false],
      ['1', 'x', 'done', false],
    ]);
    expect(v.recordCount).toBe(6);
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

  it('without Search Console recommends recent pages by date only and nothing from earlier traffic', async () => {
    const f = fixture();
    f.p.sync.link = async () => ({ get: () => null });
    f.site.pages = [page('/blog/a', '2026-11-10'), page('/blog/b', '2024-01-01')];
    const v = await f.s.view('1');
    expect(v.searchConnected).toBe(false);
    expect(v.recent.map((a) => a.url)).toEqual([`${ORIGIN}/blog/a`]);
    expect(v.earlier).toEqual([]);
    expect(v.articles).toHaveLength(2);
  });
});

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
