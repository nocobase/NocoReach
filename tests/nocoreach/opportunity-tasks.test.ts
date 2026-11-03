// One opportunity, several tasks (2026-10-22, after T-34 changed one of the six pages O-43 cited): the places an
// opportunity's changes point to, the hand-off that creates a task per place, and what each task's Agent reads.
import assert from 'node:assert/strict';
import { expect, it } from 'vitest';
import {
  ownSignalIds,
  partsOf,
  splitOf,
  taskSignals,
} from '../../shared/opportunity-parts';
import {
  planOf,
  scopeText,
  type PlanTask,
} from '../../server/nocoreach/opportunity-hand-off';
import { StrategyService } from '../../server/nocoreach/strategy-service.js';
import { flowRunInput } from '../../server/nocoreach/execution/flow';
import { SYSTEM_PLAYBOOKS } from '../../shared/playbook-catalog';
import type {
  Opportunity,
  Proposal,
  Signal,
} from '../../shared/strategy-model';

const top11 =
  'https://www.nocobase.com/en/blog/top-11-open-source-no-code-ai-tools';
const top15 = 'https://www.nocobase.com/en/blog/top-15-low-code-platforms/';
const release = 'https://github.com/nocobase/nocobase/releases/tag/v2.1.0';
const signal = (key: string, action: string | null, url?: string): Signal => ({
  key,
  type: 'change',
  source: 'gsc',
  title: `${key} changed`,
  facts: [],
  strength: 1,
  actionable: true,
  action,
  ...(url ? { url } : {}),
});
const signals = [
  signal('rank:top11', 'optimize', top11),
  signal('rank:top15', 'optimize', top15),
  // The same page as rank:top11, written without www and with a trailing slash.
  signal(
    'ctr:top11',
    'optimize',
    'https://nocobase.com/en/blog/top-11-open-source-no-code-ai-tools/',
  ),
  signal('site-clicks', null),
  signal('unanswered', 'reply'),
  signal('release', 'distribute', release),
  // Not places to change: a page of someone else's a change points to, a video seen, an audit issue across many pages.
  signal(
    'github-topic:workflow',
    'create',
    'https://github.com/topics/workflow',
  ),
  signal('bilibili-views:BV1', null, 'https://www.bilibili.com/video/BV1'),
  signal('audit-missing-description', 'optimize', `${top11}/`),
  // The repository's star spike is announced with the release.
  signal(
    'github-star-spike',
    'distribute',
    'https://github.com/nocobase/nocobase',
  ),
];
const card: Opportunity = {
  id: 'o43',
  no: 43,
  title: 'Add 2026 updates to the comparison pages',
  observation: 'Six comparison pages lost rankings the same week.',
  meaning: 'm',
  evidenceText: 'e',
  limitation: 'l',
  suggestion: 'Add a 2026 section to each page',
  objective: 'Win the rankings back',
  source: 'search',
  target: top11,
  signalIds: signals.map((s) => s.key),
};
const site = {
  sites: [{ origin: 'https://www.nocobase.com' }],
  pages: [{ url: `${top11}/`, title: 'Top 11 Open Source No-Code AI Tools' }],
};
const targets = [{ pages: { en: 'https://www.nocobase.com/en/blog/{slug}' } }];

it('an opportunity proposes one place per page, one for the replies, and none for changes without a page', () => {
  const parts = partsOf(card, signals);
  expect(parts.map((p) => [p.key, p.playbookId, p.signalIds])).toEqual([
    [
      'page:nocobase.com/en/blog/top-11-open-source-no-code-ai-tools',
      'optimize-page',
      ['rank:top11', 'ctr:top11'],
    ],
    [
      'page:nocobase.com/en/blog/top-15-low-code-platforms',
      'optimize-page',
      ['rank:top15'],
    ],
    ['replies', 'community-reply', ['unanswered']],
    ['announce', 'release-notes', ['release', 'github-star-spike']],
  ]);
  expect(partsOf(card, signals)[3].url).toBe(release);
  // One place, or none: handed off as one task, as before.
  expect(
    splitOf({ signalIds: ['rank:top11', 'ctr:top11', 'site-clicks'] }, signals),
  ).toEqual([]);
  expect(splitOf({ signalIds: ['site-clicks'] }, signals)).toEqual([]);
  // A task created for a place is about that place's changes; any other task about every change it was given.
  expect(
    ownSignalIds({
      part: { signalIds: ['rank:top15'] },
      insight: { signalIds: card.signalIds },
    }),
  ).toEqual(['rank:top15']);
  expect(
    ownSignalIds({ insight: { signalIds: ['a'] }, signalKey: 'b' }),
  ).toEqual(['a', 'b']);
  // What a place's task reads (its Why and its Agent's input): its own changes and the ones without a page.
  expect(
    taskSignals(
      {
        part: { signalIds: ['rank:top15'] },
        insight: { signalIds: card.signalIds },
      },
      signals,
    ).map((s) => s.key),
  ).toEqual(['rank:top15', 'site-clicks']);
  expect(
    taskSignals({ insight: { signalIds: card.signalIds } }, signals),
  ).toHaveLength(signals.length);
});

it('each place gets its label, task title and the open task already changing it', () => {
  const proposals = [
    // T-41 was created for the top-15 page and closed: the page can be handed off again.
    {
      id: 'p41',
      insight: card,
      taskId: 41,
      taskNo: 41,
      part: { key: 'page:nocobase.com/en/blog/top-15-low-code-platforms' },
    },
    // T-34 was handed off before places existed and changed the top-11 article.
    { id: 'p34', insight: card, taskId: 34, taskNo: 34 },
  ] as unknown as Proposal[];
  const tasks: PlanTask[] = [
    {
      id: 34,
      evidence: {
        no: 34,
        work: {
          stage: 'done',
          article: { slug: 'top-11-open-source-no-code-ai-tools' },
        },
      },
    },
    {
      id: 41,
      evidence: { no: 41, work: { stage: 'flow', archivedAt: '2026-10-22' } },
    },
  ];
  const plan = planOf({
    card,
    signals,
    site,
    proposals,
    tasks,
    targets,
    locale: 'en-US',
  });
  expect(plan.map((p) => [p.label, p.title, p.task?.no])).toEqual([
    [
      'Top 11 Open Source No-Code AI Tools',
      'Update Top 11 Open Source No-Code AI Tools',
      34,
    ],
    [
      '/en/blog/top-15-low-code-platforms',
      'Update /en/blog/top-15-low-code-platforms',
      undefined,
    ],
    [
      'Unanswered community posts',
      'Reply to unanswered community posts',
      undefined,
    ],
    [
      'github.com/nocobase/nocobase/releases/tag/v2.1.0',
      'Announce github.com/nocobase/nocobase/releases/tag/v2.1.0',
      undefined,
    ],
  ]);
  const zh = planOf({
    card,
    signals,
    site,
    proposals: [],
    tasks: [],
    targets,
    locale: 'zh-CN',
  });
  expect(zh[0].title).toBe('更新 Top 11 Open Source No-Code AI Tools');
  expect(scopeText(card, plan[1], [plan[0], plan[2]], 'en-US')).toBe(
    "This is one of 3 tasks for opportunity O-43. This task changes only: /en/blog/top-15-low-code-platforms (https://www.nocobase.com/en/blog/top-15-low-code-platforms/). The opportunity's other tasks handle: Top 11 Open Source No-Code AI Tools; Unanswered community posts. Keep the same approach as they do (the same structure, framing and extent of change) and change nothing outside this task's target.",
  );
});

type Created = { values: Record<string, any>; transaction: unknown };
function service(existing: Record<string, any>[] = []) {
  const created: Created[] = [],
    transaction = { test: true };
  const tasks = [...existing];
  const s = new StrategyService({
    articleTargets: { list: () => ({ targets }) },
    db: {
      getRepository: (name: string) =>
        name === 'nrTasks'
          ? {
              create: async ({ values }: Created) => {
                const id = 100 + created.length;
                created.push({ values, transaction });
                return {
                  id,
                  get: (k: string) =>
                    k === 'evidence'
                      ? { ...values.evidence, no: id - 50 }
                      : undefined,
                };
              },
              findOne: async ({ filter }: { filter: { id: string } }) => {
                const t = tasks.find((x) => String(x.id) === filter.id);
                return t ? { toJSON: () => t } : null;
              },
            }
          : {
              findOne: async ({ filter }: { filter: { key: string } }) =>
                filter.key === 'site-content:1' ? { get: () => site } : null,
            },
    },
  });
  const state = {
    revision: 1,
    goal: null,
    proposals: [] as Record<string, any>[],
    insights: {
      generatedAt: '2026-10-22',
      items: [card],
      evidence: {
        availableThrough: '2026-10-20',
        signals: { items: signals },
      },
    },
  };
  s.context = async () => ({ evidence: {} }) as any;
  s.mutate = (async (_id: unknown, _v: unknown, fn: any) => {
    await fn(state, transaction);
    return state;
  }) as any;
  s.state = (async () => state) as any;
  const ctx = {
    getCurrentLocale: () => 'en-US',
    auth: { user: { id: 7, nickname: 'Ann' } },
  };
  const hand = (v: Record<string, unknown> = {}) =>
    s.confirmDirection(
      1,
      {
        title: card.title,
        brief: 'Opportunity brief',
        objective: card.objective,
        insightId: 'o43',
        ...v,
      },
      ctx,
    );
  return { s, state, created, hand, ctx, transaction };
}

it('handing off creates one task per place, each with its title, page, playbook and a brief naming the others', async () => {
  const f = service();
  await f.hand();
  expect(f.created.map((c) => c.values.title)).toEqual([
    'Update Top 11 Open Source No-Code AI Tools',
    'Update /en/blog/top-15-low-code-platforms',
    'Reply to unanswered community posts',
    'Announce github.com/nocobase/nocobase/releases/tag/v2.1.0',
  ]);
  const [first, second, replies] = f.created.map((c) => c.values);
  expect(f.created.every((c) => c.transaction === f.transaction)).toBe(true);
  expect(first.evidence).toMatchObject({
    page: top11,
    suggestedPlaybook: 'optimize-page',
    part: {
      key: 'page:nocobase.com/en/blog/top-11-open-source-no-code-ai-tools',
      label: 'Top 11 Open Source No-Code AI Tools',
      signalIds: ['rank:top11', 'ctr:top11'],
    },
    insight: { id: 'o43' },
    createdBy: { id: '7', name: 'Ann' },
  });
  expect(replies.evidence.page).toBeUndefined();
  expect(replies.evidence.suggestedPlaybook).toBe('community-reply');
  expect(second.brief).toMatch(
    /^Goal: Win the rankings back\n\nThis is one of 4 tasks for opportunity O-43\. This task changes only: \/en\/blog\/top-15-low-code-platforms \(https:\/\/www\.nocobase\.com\/en\/blog\/top-15-low-code-platforms\/\)\. The opportunity's other tasks handle: Top 11 Open Source No-Code AI Tools; Unanswered community posts; github\.com\/nocobase\/nocobase\/releases\/tag\/v2\.1\.0\./,
  );
  expect(second.brief).toContain('\n\nOpportunity brief');
  // The opportunity lists them first first; their proposals keep no copy of the evidence.
  expect(
    [...f.state.proposals]
      .reverse()
      .map((p) => [p.taskId, p.part.key, 'evidence' in p]),
  ).toEqual([
    [
      100,
      'page:nocobase.com/en/blog/top-11-open-source-no-code-ai-tools',
      false,
    ],
    [101, 'page:nocobase.com/en/blog/top-15-low-code-platforms', false],
    [102, 'replies', false],
    [103, 'announce', false],
  ]);
});

it('only the ticked places without a task are handed off; nothing left is refused', async () => {
  // T-34 changed the top-11 article before places existed.
  const f = service([
    {
      id: 34,
      evidence: {
        no: 34,
        work: {
          stage: 'done',
          article: { slug: 'top-11-open-source-no-code-ai-tools' },
        },
      },
    },
  ]);
  f.state.proposals.push({ id: 'p34', insight: card, taskId: 34, taskNo: 34 });
  const plan = (await f.s.handOffPlan(1, { insightId: 'o43' }, f.ctx)) as {
    parts: { key: string; task?: { no?: number } }[];
  };
  expect(plan.parts.map((p) => p.task?.no ?? null)).toEqual([
    34,
    null,
    null,
    null,
  ]);
  await f.hand({
    parts: [
      'page:nocobase.com/en/blog/top-11-open-source-no-code-ai-tools',
      'page:nocobase.com/en/blog/top-15-low-code-platforms',
    ],
  });
  expect(f.created.map((c) => c.values.title)).toEqual([
    'Update /en/blog/top-15-low-code-platforms',
  ]);
  // The brief names T-34's page as the other task's.
  expect(f.created[0].values.brief).toContain(
    "This is one of 2 tasks for opportunity O-43. This task changes only: /en/blog/top-15-low-code-platforms (https://www.nocobase.com/en/blog/top-15-low-code-platforms/). The opportunity's other tasks handle: Top 11 Open Source No-Code AI Tools.",
  );
  await assert.rejects(
    f.hand({
      parts: ['page:nocobase.com/en/blog/top-11-open-source-no-code-ai-tools'],
    }),
    (e: { status?: number }) => e.status === 409,
  );
  await assert.rejects(
    f.hand({ parts: 'replies' }),
    (e: { status?: number }) => e.status === 400,
  );
});

it('an opportunity with one place is handed off as one task, as before', async () => {
  const f = service();
  f.state.insights.items = [
    { ...card, signalIds: ['rank:top11', 'ctr:top11', 'site-clicks'] },
  ];
  await f.hand({ playbookId: 'optimize-page' });
  expect(f.created).toHaveLength(1);
  expect(f.created[0].values.title).toBe(card.title);
  expect(f.created[0].values.evidence.part).toBeUndefined();
  expect(f.state.proposals[0].evidence).toBeTruthy();
  expect(
    (
      (await f.s.handOffPlan(1, { insightId: 'o43' }, f.ctx)) as {
        parts: unknown[];
      }
    ).parts,
  ).toEqual([]);
});

it("a place's Agent reads its own changes and the opportunity's changes without a page", () => {
  const task = {
    title: 'Update /en/blog/top-15-low-code-platforms',
    brief: 'b',
    evidence: {
      insight: card,
      part: {
        key: 'page:nocobase.com/en/blog/top-15-low-code-platforms',
        kind: 'page',
        url: top15,
        label: '/en/blog/top-15-low-code-platforms',
        signalIds: ['rank:top15'],
      },
      context: { signals: { items: signals } },
    },
  };
  const w = {
    flow: {
      stages: [
        {
          key: 'change',
          name: 'Change',
          kind: 'agent',
          mode: 'analyze',
          instruction: '',
        },
      ],
    },
    results: [],
    history: [],
  };
  const input = flowRunInput({}, task, w as any, 0, null, []) as {
    evidence: { signals: Signal[]; part?: unknown };
  };
  expect(input.evidence.signals.map((s) => s.key)).toEqual([
    'rank:top15',
    'site-clicks',
  ]);
  expect(input.evidence.part).toEqual({
    target: '/en/blog/top-15-low-code-platforms',
    url: top15,
  });
  // A task handed off as a whole still reads every change.
  const whole = flowRunInput(
    {},
    { ...task, evidence: { ...task.evidence, part: undefined } },
    w as any,
    0,
    null,
    [],
  ) as { evidence: { signals: Signal[]; part?: unknown } };
  expect(whole.evidence.signals).toHaveLength(signals.length);
  expect(whole.evidence.part).toBeUndefined();
});

// 2026-10-27 (T-49): every handed-off task is titled "<playbook>: <subject>" and keeps its subject, so another playbook
// chosen before the start retitles it (server/nocoreach/execution/task-title.ts).
it('a hand-off titles each task by its playbook and keeps the subject', async () => {
  const f = service();
  (f.s as any).p.taskExecution = {
    playbooks: {
      list: async () => ({ playbooks: SYSTEM_PLAYBOOKS }),
      get: async (_project: string, id: string) =>
        SYSTEM_PLAYBOOKS.find((p) => p.id === id),
    },
  };
  await f.hand();
  expect(f.created.map((c) => c.values.title)).toEqual([
    'Improve existing page: Top 11 Open Source No-Code AI Tools',
    'Improve existing page: /en/blog/top-15-low-code-platforms',
    'Draft community replies: Unanswered community posts',
    'Write release notes: github.com/nocobase/nocobase/releases/tag/v2.1.0',
  ]);
  expect(f.created[0].values.evidence.autoTitle).toEqual({
    subject: 'Top 11 Open Source No-Code AI Tools',
    locale: 'en-US',
  });
  // A hand-off from a data page sends its subject with the playbook it suggests.
  await f.s.confirmDirection(
    1,
    {
      title: 'Write content about "ai governance framework"',
      subject: 'ai governance framework',
      brief: 'Keywords',
      objective: 'Rank',
      playbookId: 'content-outline',
    },
    f.ctx,
  );
  const last = f.created[f.created.length - 1].values;
  expect(last.title).toBe('Content topic and outline: ai governance framework');
  expect(last.evidence.autoTitle).toEqual({
    subject: 'ai governance framework',
    locale: 'en-US',
  });
  expect(f.state.proposals[0].title).toBe(last.title);
  // Without a subject, the title it was sent is the person's: kept, and never retitled.
  await f.s.confirmDirection(
    1,
    {
      title: 'My own title',
      brief: 'b',
      objective: 'o',
      playbookId: 'content-outline',
    },
    f.ctx,
  );
  const own = f.created[f.created.length - 1].values;
  expect(own.title).toBe('My own title');
  expect(own.evidence.autoTitle).toBeUndefined();
});

// O-59 (2026-10-29) made T-55 for /blog/{slug}/ and T-56 for /en/blog/{slug}: two places, one CMS post.
it('pages that are one article in different forms are one place, with all their changes', () => {
  const post = 'https://www.nocobase.com/blog/6-open-source-tools/',
    en = 'https://www.nocobase.com/en/blog/6-open-source-tools',
    pricing = 'https://www.nocobase.com/pricing';
  const list = [
    signal('ctr:post', 'optimize', post),
    signal('rank:post', 'optimize', en),
    signal('rank:pricing', 'optimize', pricing),
  ];
  const plan = planOf({
    card: { ...card, signalIds: list.map((s) => s.key) },
    signals: list,
    site: null,
    proposals: [],
    tasks: [],
    targets: [
      {
        pages: { en: 'https://www.nocobase.com/en/blog/{slug}' },
        locales: ['en'],
      },
    ],
    locale: 'en-US',
  });
  expect(plan.map((p) => [p.url, p.signalIds])).toEqual([
    [post, ['ctr:post', 'rank:post']],
    [pricing, ['rank:pricing']],
  ]);
});
