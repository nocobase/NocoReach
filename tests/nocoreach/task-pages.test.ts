// Tasks carry their pages (2026-10-29, after T-54: Site audit handed off seven pages sharing one meta description, but
// they were only written into its brief, so its start card asked for an article and Performance had no page). Every
// hand-off that concerns the site's pages names them all, and a task whose pages are in two places hands the rest off.
import { expect, it } from 'vitest';
import { StrategyService } from '../../server/nocoreach/strategy-service.js';
import { SYSTEM_PLAYBOOKS } from '../../shared/playbook-catalog';
import { MAX_TASK_PAGES } from '../../shared/task-start';
import {
  contentPageDraft,
  indexDraft,
  ownPagesDraft,
  pageDraft,
  queryDraft,
  trackedDraft,
  visitPageDraft,
  visitPagesDraft,
} from '../../client/pages/seo-hand-off';
import { keywordDraft } from '../../client/pages/keyword-hand-off';
import { combineDrafts } from '../../client/pages/hand-off-bar';
import { auditDraft } from '../../client/pages/site-audit-draft';

const site = (path: string) => `https://www.example.com${path}`;
const pricing = site('/pricing'),
  features = site('/features'),
  crm = site('/solutions/crm'),
  blog = site('/en/blog/hello');

it('each hand-off from a data page names every page of the site it concerns', () => {
  const audit = auditDraft([
    {
      type: 'dupDescription',
      severity: 'warning',
      title: 'Pages share a meta description',
      description: 'd',
      job: 'content',
      count: 3,
      pages: [pricing, features, crm].map((url) => ({
        url,
        title: '',
        detail: '',
      })),
    },
    {
      type: 'noTitle',
      severity: 'warning',
      title: 'Missing title',
      description: 'd',
      job: 'content',
      count: 2,
      pages: [crm, blog].map((url) => ({ url, title: '', detail: '' })),
    },
  ]);
  expect(audit.pages).toEqual([pricing, features, crm, blog]);
  const row = { clicks: 1, impressions: 10, ctr: 0.1, position: 4 };
  expect(
    pageDraft(
      [
        { page: pricing, ...row },
        { page: features, ...row },
      ],
      undefined,
    ).pages,
  ).toEqual([pricing, features]);
  // Queries: the page most of them rank with first.
  expect(
    queryDraft(
      [
        { query: 'a', page: features, ...row },
        { query: 'b', page: pricing, ...row, impressions: 99 },
        { query: 'c', page: null, ...row },
      ],
      undefined,
    ).pages,
  ).toEqual([pricing, features]);
  expect(
    indexDraft(
      [pricing, features].map((url) => ({
        url,
        status: 'Not indexed',
        reason: null,
        lastCrawl: null,
        canonicalMismatch: false,
        rich: [],
      })),
    ).pages,
  ).toEqual([pricing, features]);
  expect(contentPageDraft({ url: pricing }, '28 days').pages).toEqual([
    pricing,
  ]);
  expect(visitPageDraft(pricing, '28 days', 1, 0, '1%', []).pages).toEqual([
    pricing,
  ]);
  expect(
    visitPagesDraft(
      [pricing, features].map((page) => ({
        page,
        views: 1,
        conversions: 0,
        share: '1%',
        queries: 0,
      })),
      '28 days',
    ).pages,
  ).toEqual([pricing, features]);
  expect(
    trackedDraft([
      {
        keyword: 'crm',
        market: 'US',
        latest: { at: '2026-10-28', position: 4, url: crm },
        previous: null,
      },
      {
        keyword: 'pricing',
        market: 'US',
        latest: null,
        previous: null,
        gsc: { position: 9, clicks: 3, page: pricing },
      },
    ]).pages,
  ).toEqual([crm, pricing]);
  expect(
    ownPagesDraft('example.com', 'US', [
      { url: pricing, traffic: 1, keywords: 1 },
    ]).pages,
  ).toEqual([pricing]);
  // Keywords: the pages the site ranks with, the best first; none when it does not rank yet.
  const kw = { market: null, volume: 10, difficulty: 1, intent: null };
  expect(
    keywordDraft([
      {
        keyword: 'a',
        ...kw,
        rank: { position: 9, clicks: 1, impressions: 9, page: features },
      },
      {
        keyword: 'b',
        ...kw,
        rank: { position: 2, clicks: 40, impressions: 99, page: pricing },
      },
    ]).pages,
  ).toEqual([pricing, features]);
  expect(keywordDraft([{ keyword: 'c', ...kw }]).pages).toEqual([]);
  // Lists ticked together go into one task with all their pages.
  expect(
    combineDrafts([
      { title: 'a', objective: 'o', brief: 'b', pages: [pricing] },
      { title: 'b', objective: 'o', brief: 'b', pages: [pricing, features] },
      { title: 'c', objective: 'o', brief: 'b' },
    ]).pages,
  ).toEqual([pricing, features]);
});

type Created = { values: Record<string, any> };
function service(tasks: Record<string, any>[]) {
  const created: Created[] = [];
  const s = new StrategyService({
    articleTargets: { list: () => ({ targets: [] }) },
    taskExecution: {
      task: async (_project: string, id: string) => {
        const t = tasks.find((x) => String(x.id) === id);
        if (!t) throw Object.assign(new Error('missing'), { status: 404 });
        return structuredClone(t);
      },
      playbooks: {
        list: async () => ({ playbooks: SYSTEM_PLAYBOOKS }),
        get: async (_project: string, id: string) =>
          SYSTEM_PLAYBOOKS.find((p) => p.id === id),
      },
    },
    db: {
      getRepository: () => ({
        create: async ({ values }: Created) => {
          const id = 200 + created.length;
          created.push({ values });
          return {
            id,
            get: (k: string) =>
              k === 'evidence'
                ? { ...values.evidence, no: id - 140 }
                : undefined,
          };
        },
        findOne: async () => null,
      }),
    },
  } as never);
  const state = {
    revision: 1,
    goal: null,
    proposals: [] as Record<string, any>[],
  };
  s.context = async () => ({ evidence: { capturedAt: 'now' } }) as never;
  s.mutate = (async (_id: unknown, _v: unknown, fn: any) => {
    await fn(state, {});
    return state;
  }) as never;
  const ctx = {
    getCurrentLocale: () => 'en-US',
    auth: { user: { id: 7, nickname: 'Ann' } },
  };
  return { s, state, created, ctx };
}

it('a hand-off keeps its pages on the task, each once and only web addresses', async () => {
  const f = service([]);
  await f.s.confirmDirection(
    1,
    {
      title: 'Fix 3 pages',
      brief: 'Site audit found 3 pages',
      objective: 'Fix them',
      playbookId: 'optimize-page',
      pages: [pricing, `${pricing}/`, 'javascript:alert(1)', features, 7],
    },
    f.ctx,
  );
  expect(f.created[0].values.evidence.pages).toEqual([pricing, features]);
  expect(f.state.proposals[0].pages).toEqual([pricing, features]);
  const many = Array.from({ length: 60 }, (_, i) => site(`/p${i}`));
  await f.s.confirmDirection(
    1,
    { title: 't', brief: 'b', objective: 'o', pages: many },
    f.ctx,
  );
  expect(f.created[1].values.evidence.pages).toHaveLength(MAX_TASK_PAGES);
});

it('pages in two places: Create separate tasks hands the rest off as siblings with the same brief and playbook', async () => {
  const t54 = {
    id: 54,
    title: 'Improve existing page: Duplicate descriptions',
    brief: 'Goal: Fix them\n\nSite audit found 9 pages',
    evidence: {
      no: 54,
      proposalId: 'p54',
      objective: 'Fix them',
      pages: [pricing, features, crm, blog, site('/en/blog/two')],
      entry: '/audit',
      work: { schemaVersion: 2, revision: 3, stage: 'plan', plan: null },
    },
  };
  const f = service([t54]);
  f.state.proposals.push({
    id: 'p54',
    taskId: 54,
    title: t54.title,
    objective: 'Fix them',
    brief: 'Site audit found 9 pages',
  });
  await f.s.splitTask(
    1,
    {
      taskId: '54',
      playbookId: 'optimize-page',
      groups: [
        { pages: [blog], subject: 'Hello' },
        { pages: [site('/en/blog/two')], subject: 'Two' },
      ],
    },
    f.ctx,
  );
  expect(f.created.map((c) => c.values.title)).toEqual([
    'Improve existing page: Hello',
    'Improve existing page: Two',
  ]);
  const [first] = f.created.map((c) => c.values);
  expect(first.evidence).toMatchObject({
    page: blog,
    pages: [blog],
    suggestedPlaybook: 'optimize-page',
    entry: '/audit',
  });
  expect(first.brief).toBe(
    `Goal: Fix them\n\nSplit off from T-54: this task changes only these pages.\n- ${blog}\n\nSite audit found 9 pages`,
  );
  // Siblings of the first task through their proposals' group; the first task itself is not changed.
  expect(f.state.proposals.slice(0, 2).map((p) => [p.group, p.pages])).toEqual([
    ['p54', [site('/en/blog/two')]],
    ['p54', [blog]],
  ]);
  // Only the task's own pages, and only before it starts.
  await expect(
    f.s.splitTask(
      1,
      { taskId: '54', groups: [{ pages: [site('/elsewhere')] }] },
      f.ctx,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const started = service([
    {
      ...t54,
      evidence: {
        ...t54.evidence,
        work: { ...t54.evidence.work, stage: 'flow', flow: { stages: [] } },
      },
    },
  ]);
  await expect(
    started.s.splitTask(
      1,
      { taskId: '54', groups: [{ pages: [blog] }] },
      f.ctx,
    ),
  ).rejects.toMatchObject({ status: 409 });
});

it("a task split off an opportunity's task keeps the opportunity, so it is listed with the others", async () => {
  const task = {
    id: 60,
    title: 'Update the comparison pages',
    brief: 'Goal: o\n\nb',
    evidence: {
      no: 60,
      insight: { id: 'o15', no: 15, target: pricing, signalIds: [] },
      context: { signals: { items: [] } },
      pages: [pricing, blog],
      work: { schemaVersion: 2, revision: 1, stage: 'plan', plan: null },
    },
  };
  const f = service([task]);
  await f.s.splitTask(
    1,
    { taskId: '60', playbookId: 'optimize-page', groups: [{ pages: [blog] }] },
    f.ctx,
  );
  expect(f.created[0].values.evidence.insight).toMatchObject({ id: 'o15' });
  // A task without a proposal of its own groups its split-off tasks by its id.
  expect(f.state.proposals[0]).toMatchObject({
    group: 'task:60',
    insight: { id: 'o15' },
    taskId: 200,
  });
});
