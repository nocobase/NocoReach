import { expect, it } from 'vitest';
import {
  insightPending,
  leadPriority,
  opportunityState,
  pendingOrder,
  rowsFor,
  sameOpportunity,
  sameSignals,
  sameWork,
  signalDisposition,
  targetKey,
  todaySuggestions,
} from '../../shared/strategy-pending';
import { taskOwner, taskState } from '../../shared/task-pending';
import type {
  Evidence,
  InsightBatch,
  Opportunity,
  Signal,
  StrategyState,
} from '../../shared/strategy-model';
const card = (id: string, extra: Partial<Opportunity> = {}): Opportunity => ({
  id,
  title: id,
  observation: '',
  meaning: '',
  evidenceText: '',
  limitation: '',
  suggestion: '',
  objective: '',
  source: 'gsc',
  ...extra,
});
const signal = (key: string): Signal => ({
  key,
  type: 'change',
  source: 'gsc',
  title: key,
  facts: [],
  strength: 1,
  actionable: true,
  action: null,
});
const evidence = (version = 3, signals: Signal[] = []): Evidence => ({
  analysisVersion: version,
  capturedAt: '',
  availableThrough: null,
  periodDays: 28,
  searchQueries: [],
  pages: [],
  industryCandidates: [],
  limitations: [],
  signals: { computedAt: '', coverage: {}, missing: [], items: signals },
});
const batch = (
  items: Opportunity[],
  version = 3,
  signals: Signal[] = [],
): InsightBatch => ({
  generatedAt: '2026-10-13',
  items,
  evidence: evidence(version, signals),
});
const state = (items: Opportunity[]): StrategyState => ({
  revision: 1,
  goal: null,
  proposals: [],
  insights: batch(items),
});
it('opportunities count unchanged/evidence/latest and restored history once, excluding ignored and handed-off records', () => {
  const s = state([
    card('new'),
    card('unchanged', { change: 'unchanged' }),
    card('evidence', { change: 'evidence' }),
    card('ignored'),
    card('handed'),
  ]);
  s.opportunityMeta = {
    ignored: { status: 'ignored' },
    restored: { restoredAt: 'today' },
  };
  s.proposals = [
    {
      id: 'p',
      title: '',
      brief: '',
      status: '',
      goalVersion: null,
      evidence: evidence(),
      taskId: 1,
      insight: card('handed'),
    },
  ];
  // Not raised again: pending for 14 days after the last analysis that raised it, counted from the latest analysis.
  s.insightHistory = [
    batch([card('unchanged'), card('restored')]),
    { ...batch([card('quiet')]), generatedAt: '2026-10-06T09:00:00Z' },
    { ...batch([card('lastDay')]), generatedAt: '2026-09-30T23:00:00Z' },
    { ...batch([card('expired'), card('quiet')]), generatedAt: '2026-09-29' },
  ];
  expect(
    rowsFor(s)
      .filter((r) => opportunityState(r, s).state === 'pending')
      .map((r) => r.card.id)
      .sort(),
  ).toEqual(['evidence', 'lastDay', 'new', 'quiet', 'restored', 'unchanged']);
  const expired = rowsFor(s).find((r) => r.card.id === 'expired')!;
  expect(opportunityState(expired, s)).toEqual({
    state: 'archived',
    reason: 'expired',
  });
  // Without a dated latest analysis nothing older stays pending.
  const undated = { ...s, insights: { ...s.insights!, generatedAt: '' } };
  expect(
    opportunityState(
      rowsFor(undated).find((r) => r.card.id === 'lastDay')!,
      undated,
    ).state,
  ).toBe('archived');
});
it('insights count opportunity rows once and standalone action signals, preserving linked task and verdict precedence', () => {
  const signals = [
    'a',
    'b',
    'standalone',
    'watch',
    'skip',
    'ignored',
    'unjudged',
    'working',
    'finished',
  ].map(signal);
  const s = state([card('one', { signalIds: ['a', 'b'] })]);
  s.insights = batch(s.insights!.items, 3, signals);
  s.insights.signalReviews = Object.fromEntries(
    [
      'a',
      'b',
      'standalone',
      'watch',
      'skip',
      'ignored',
      'working',
      'finished',
    ].map((key) => [
      key,
      {
        verdict: key === 'watch' ? 'watch' : key === 'skip' ? 'skip' : 'do',
        reason: '',
      },
    ]),
  );
  s.signalMeta = { ignored: { status: 'ignored' } };
  s.proposals = ['working', 'finished'].map((key, i) => ({
    id: key,
    title: '',
    brief: '',
    status: '',
    goalVersion: null,
    evidence: evidence(),
    signalKey: key,
    taskId: i + 1,
  }));
  expect(
    insightPending(s, [
      { id: 1, evidence: { work: { stage: 'plan' } } },
      { id: 2, evidence: { work: { stage: 'done' } } },
    ]),
  ).toBe(3);
  s.opportunityMeta = { one: { status: 'ignored' } };
  s.signalMeta = {
    standalone: { status: 'ignored' },
    ignored: { status: 'ignored' },
    finished: { status: 'ignored' },
  };
  expect(
    insightPending(s, [
      { id: 1, evidence: { work: { stage: 'plan' } } },
      { id: 2, evidence: { work: { stage: 'done' } } },
    ]),
  ).toBe(0);
});
it('keeps v2 supported, lifecycle, deadline and page display bounds', () => {
  const s = state([]);
  s.insights = batch(
    [
      card('supported', { confidence: 'supported' }),
      card('verify', { confidence: 'verify' }),
      card('watch', { confidence: 'supported', lifecycle: 'watch' }),
      card('expired', { confidence: 'supported', reviewAt: '2000-01-01' }),
      card('ignored', { confidence: 'supported' }),
    ],
    2,
  );
  s.opportunityMeta = { ignored: { status: 'ignored' } };
  expect(todaySuggestions(s, 50).map((r) => r.card.id)).toEqual(['supported']);
  expect(insightPending(s, [])).toBe(1);
  s.insights = batch(
    Array.from({ length: 60 }, (_, i) => card(String(i))),
    3,
  );
  expect(insightPending(s, [])).toBe(50);
});
it('matches raw home task owner fallback and state, without turning other unfinished stages into todo', () => {
  expect(
    taskOwner({
      evidence: { work: { stage: 'plan' }, createdBy: { id: 'creator' } },
    }),
  ).toBe('creator');
  expect(
    taskState({ stage: 'flow', flow: { stages: [{ kind: 'agent' }] } }),
  ).toBe('doing');
  expect(
    taskState({ stage: 'flow', flow: { stages: [{ kind: 'publish' }] } }),
  ).toBe('review');
  expect(taskState(undefined, '已完成')).toBe('done');
});
it('an earlier copy raised again later under another card never comes back, whatever was decided on the later one', () => {
  // The Studio cases of 2026-10-20: O-1…O-6 and O-27 came back to pending beside their later copies.
  const s = state([card('o29', { target: '/tutorials', signalIds: ['thin'] })]);
  s.insights!.generatedAt = '2026-10-19';
  const at = (generatedAt: string, items: Opportunity[]) => ({
    ...batch(items),
    generatedAt,
  });
  s.insightHistory = [
    at('2026-10-16', [
      card('o30', {
        title: '回复 4 个无人回应的论坛主题',
        target: '近 14 天无人回复的论坛主题',
        signalIds: ['unanswered'],
      }),
    ]),
    at('2026-10-15', [
      card('o27', {
        title: '回复 3 个无人回应的论坛主题',
        target: '近 14 天 3 个无人回复主题',
        signalIds: ['unanswered'],
      }),
    ]),
    at('2026-10-13', [
      card('o13', { target: '/docs/block', signalIds: ['block'] }),
    ]),
    at('2026-10-11', [
      card('o8', {
        title: '专题页',
        target: '插件主题',
        signalIds: ['digest'],
      }),
      card('o21', {
        title: 'AI Portal',
        target: 'AI Portal',
        signalIds: ['digest'],
      }),
    ]),
    at('2026-10-09', [
      card('o1', { title: '专栏', target: '插件主题', signalIds: ['digest'] }),
      card('o5', { target: '/docs/block', signalIds: ['block', 'bug'] }),
      card('kept', { target: '/docs/other', signalIds: ['digest'] }),
      card('restored', { target: '/docs/block', signalIds: ['block'] }),
    ]),
  ];
  s.opportunityMeta = {
    o13: { status: 'ignored' },
    o21: { status: 'ignored' },
    restored: { restoredAt: '2026-10-18' },
  };
  s.proposals = [8, 30].map((n) => ({
    id: `p${n}`,
    title: '',
    brief: '',
    status: '',
    goalVersion: null,
    evidence: evidence(),
    taskId: n,
    insight: card(`o${n}`),
  }));
  const states = Object.fromEntries(
    rowsFor(s).map((r) => [r.card.id, opportunityState(r, s)]),
  );
  expect(states.o1).toEqual({ state: 'archived', reason: 'replaced' });
  expect(states.o27).toEqual({ state: 'archived', reason: 'replaced' });
  expect(states.o5).toEqual({ state: 'archived', reason: 'replaced' });
  expect(states.kept.state).toBe('pending');
  expect(states.restored.state).toBe('pending');
  expect(states.o29.state).toBe('pending');
});

it('an opportunity ignored from an earlier analysis keeps its changes off Insights', () => {
  // Studio, 2026-10-21: every opportunity was ignored on Opportunities, yet Insights still listed three changes to act
  // on. O-19 and O-20 came from the analysis of 10/11; the analysis no longer raises them, so their changes in the
  // latest analysis had no opportunity of the day and read as standalone changes the AI advises acting on.
  const changes = ['commercial', 'all-in-one', 'timeline', 'fresh'].map(signal);
  const s = state([]);
  s.insights = { ...batch([], 3, changes), generatedAt: '2026-10-21' };
  s.insights.signalReviews = Object.fromEntries(
    changes.map((c) => [c.key, { verdict: 'do' as const, reason: '' }]),
  );
  s.insightHistory = [
    {
      ...batch(
        [
          card('o19', { signalIds: ['commercial'] }),
          card('o20', { signalIds: ['timeline', 'all-in-one'] }),
        ],
        3,
        changes,
      ),
      generatedAt: '2026-10-11',
    },
  ];
  s.opportunityMeta = {
    o19: { status: 'ignored' },
    o20: { status: 'ignored' },
  };
  for (const key of ['commercial', 'all-in-one', 'timeline'])
    expect(signalDisposition({ key }, s, [])).toMatchObject({
      next: 'hand',
      dismissed: true,
    });
  // A change no ignored opportunity rests on still asks for a decision; restoring the opportunity brings it back.
  expect(signalDisposition({ key: 'fresh' }, s, [])).toMatchObject({
    next: 'hand',
    verdict: 'do',
  });
  expect(insightPending(s, [])).toBe(1);
  s.opportunityMeta.o19 = { status: 'pending', restoredAt: '2026-10-21' };
  expect(signalDisposition({ key: 'commercial' }, s, [])).toMatchObject({
    next: 'opportunity',
  });
});

// Insights' first note and Opportunities agree on what comes first (2026-11-10 review): the list goes by priority, then
// Trending now, then the note's opportunity, and the note's opportunity takes the highest priority of its trending peers.
it('the opportunity of the first note is the first trending one in the list', () => {
  const growth = (kind: 'rising' | 'new-repo' | 'near-first') => ({
    kind,
    category: kind === 'near-first' ? 'optimize' : 'trending',
    figures: [{ label: { key: 'growth.figure.clicks28' }, value: 1 }],
  });
  const items = [
    card('near', { priority: 'high', growth: growth('near-first') }),
    card('repo', {
      priority: 'high',
      growth: growth('new-repo'),
      firstSeenAt: '2026-10-12',
    }),
    card('rising', {
      priority: 'medium',
      growth: growth('rising'),
      firstSeenAt: '2026-10-01',
    }),
  ];
  // A trending lead takes the highest priority among trending opportunities only; one already there keeps its own.
  expect(leadPriority(items[2], items)).toBe('high');
  expect(leadPriority(items[1], items)).toBeUndefined();
  // Not trending (none was): the highest of all.
  expect(
    leadPriority(card('x', { priority: 'low' }), [
      card('y', { priority: 'medium' }),
    ]),
  ).toBe('medium');
  items[2].priority = 'high';
  const s = state(items);
  s.insights!.leadId = 'rising';
  // At the same priority Trending now first, the lead before a newer trending one, then the rest.
  expect(
    rowsFor(s)
      .sort(pendingOrder)
      .map((r) => r.card.id),
  ).toEqual(['rising', 'repo', 'near']);
});

// nocoreach.nocobase.ai, project 1: O-93 was raised from 11-14 to 11-20 and came back as O-108 on 11-21, when the
// model gave no existingId. The changes the server computes were the same every day; the Skill's finding was keyed by
// the keywords it cited, which changed daily (skill-analysis.ts), so the cited changes never matched.
const builtIn = [
  'keyword-demand:dig-0280f607de7b',
  'people-also-ask:dig-0280f607de7b',
  'keyword-demand:产品与功能词',
  'people-also-ask:产品与功能词',
];
const rbac = (id: string, digest: string, no: number) =>
  card(id, {
    no,
    title: '写 RBAC 与 ABAC 权限指南',
    target: '',
    signalIds: [...builtIn, `skill:sk-a0aebe3f:demand-gap:${digest}`],
  });
it("a Skill's finding under another key each day does not make another opportunity (O-93 and O-108)", () => {
  const o93 = rbac('o93', '5580f8b95de7', 93),
    o108 = rbac('o108', '6239428b3385', 108);
  expect(sameSignals(o93, o108)).toBe(true);
  expect(sameOpportunity(o108, o93)).toBe(true);
  // Without its built-in changes it is another opportunity, as before; with other built-in changes too.
  expect(
    sameOpportunity(o93, { ...o108, signalIds: builtIn.slice(0, 2) }),
  ).toBe(false);
  expect(
    sameOpportunity(o93, { ...o108, signalIds: o108.signalIds!.slice(4) }),
  ).toBe(false);
  // As stored today, without rewriting history: O-93 reads as replaced by O-108, which alone stays on the list.
  const s = state([o108]);
  s.insights!.generatedAt = '2026-11-24';
  const at = (generatedAt: string, items: Opportunity[]) => ({
    ...batch(items),
    generatedAt,
  });
  s.insightHistory = [
    at('2026-11-21', [rbac('o108', '6239428b3385', 108)]),
    at('2026-11-20', [rbac('o93', '5580f8b95de7', 93)]),
    at('2026-11-19', [rbac('o93', '595f0d703fde', 93)]),
  ];
  const states = Object.fromEntries(
    rowsFor(s).map((r) => [r.card.id, opportunityState(r, s)]),
  );
  expect(states).toEqual({
    o108: { state: 'pending' },
    o93: { state: 'archived', reason: 'replaced' },
  });
});

it('cards resting on Skill findings alone are one opportunity only for the same Skill, kind and page or title', () => {
  const found = (id: string, key: string, extra: Partial<Opportunity> = {}) =>
    card(id, { title: '补 Gantt 对比页', signalIds: [key], ...extra });
  const gap = 'skill:sk-a0aebe3f:demand-gap:',
    yesterday = found('a', `${gap}595f0d703fde`);
  // The same finding under the next day's key, in the same title apart from its numbers or about the same page.
  expect(sameOpportunity(yesterday, found('b', `${gap}5580f8b95de7`))).toBe(
    true,
  );
  expect(
    sameOpportunity(
      found('a', `${gap}1`, { title: 'Write 3 guides', target: '' }),
      found('b', `${gap}2`, { title: 'Write 4 guides', target: '' }),
    ),
  ).toBe(true);
  expect(
    sameOpportunity(
      found('a', `${gap}1`, { title: 'one', target: '/gantt' }),
      found('b', `${gap}2`, { title: 'two', target: '/gantt' }),
    ),
  ).toBe(true);
  // One Skill finds many gaps of one kind: another page and title is another opportunity.
  expect(
    sameOpportunity(
      found('a', `${gap}1`, { title: '补 Gantt 对比页', target: '/gantt' }),
      found('b', `${gap}2`, { title: '写看板教程', target: '/kanban' }),
    ),
  ).toBe(false);
  // Another kind, or another Skill, is another finding.
  expect(
    sameOpportunity(yesterday, found('b', 'skill:sk-a0aebe3f:rising:2')),
  ).toBe(false);
  expect(
    sameOpportunity(yesterday, found('b', 'skill:sk-0b1c2d3e:demand-gap:2')),
  ).toBe(false);
  // Built-in changes on one side only: not the same changes.
  expect(
    sameOpportunity(
      yesterday,
      found('b', `${gap}2`, { signalIds: [`${gap}2`, builtIn[0]] }),
    ),
  ).toBe(false);
  // No changes cited at all decides nothing, as before.
  expect(sameOpportunity(card('a'), card('b', { title: 'a' }))).toBe(false);
});

it('a page target is the page it names, whatever its scheme, www., trailing slash, query or fragment', () => {
  const page = 'nocobase.com/blog/workflow-automation-tools';
  for (const t of [
    'https://www.nocobase.com/blog/workflow-automation-tools',
    'https://www.nocobase.com/blog/workflow-automation-tools/',
    'http://nocobase.com/blog/workflow-automation-tools?utm=x#top',
    'www.nocobase.com/blog/workflow-automation-tools/',
  ])
    expect(targetKey(t)).toBe(page);
  expect(targetKey('/blog/x/?a=1')).toBe('/blog/x');
  // Anything else is its text; two pages in one target are not a page.
  expect(targetKey('  英文站新增 Lovable 替代对比页 ')).toBe(
    '英文站新增 lovable 替代对比页',
  );
  expect(targetKey('/cn/commercial 与 /cn/solutions/all-in-one')).toBe(
    '/cn/commercial 与 /cn/solutions/all-in-one',
  );
  expect(targetKey(undefined)).toBe('');
});

// nocoreach.nocobase.ai, project 1, 2026-11-26: five pending opportunities were earlier copies of later ones, raised
// again in other words after the analysis stopped seeing them.
const at = (generatedAt: string, items: Opportunity[]) => ({
  ...batch(items),
  generatedAt,
});
const pairs: [Opportunity, Opportunity][] = [
  [
    card('o98', {
      title: '让低代码榜单补上 NocoBase',
      signalIds: [
        'ai-cited:low code',
        'ai-cited:no code',
        'ai-cited:ai no code',
      ],
    }),
    card('o114', {
      title: '联系低代码榜单收录 NocoBase',
      signalIds: [
        'ai-cited:ai no code',
        'ai-cited:low code',
        'ai-cited:no code',
      ],
    }),
  ],
  [
    card('o99', {
      title: '写在线表单构建器选型指南',
      signalIds: ['competitor-gap:budibase.com/blog/open-source-form-builder'],
    }),
    card('o117', {
      title: '写开源表单搭建指南',
      signalIds: ['competitor-gap:budibase.com/blog/open-source-form-builder'],
    }),
  ],
  [
    card('o89', { title: '写 IT 资产管理选型指南', signalIds: ['itam'] }),
    card('o112', {
      title: '写 IT 资产管理指南',
      signalIds: ['itam', 'skill:sk-1:demand-gap:a'],
    }),
  ],
  [
    card('o104', {
      title: '41 个网站链接了至少 2 个竞品，没有链接我们',
      signalIds: ['link-gap'],
    }),
    card('o105', {
      title: '外联 41 个只链竞品的网站',
      signalIds: ['link-gap'],
    }),
  ],
  [
    card('o110', {
      title: '重写工作流工具页并补审批页',
      target: 'https://www.nocobase.com/blog/workflow-automation-tools',
      signalIds: ['gsc-near-first:/blog/workflow-automation-tools'],
    }),
    card('o113', {
      title: '重写工作流自动化页找回 880 次点击',
      target: 'https://www.nocobase.com/blog/workflow-automation-tools/',
      signalIds: ['gsc-near-first:/blog/workflow-automation-tools'],
    }),
  ],
];
it('an earlier card raised again in other words reads as replaced (O-98, O-99, O-89, O-104, O-110)', () => {
  for (const [earlier, later] of pairs)
    expect(sameWork(later, earlier)).toBe(true);
  // O-110 and O-113 name one page, whatever its trailing slash.
  expect(sameOpportunity(pairs[4][1], pairs[4][0])).toBe(true);
  const s = state(pairs.map(([, later]) => later));
  s.insights!.generatedAt = '2026-11-26';
  s.insightHistory = [
    at('2026-11-21', [pairs[4][0]]),
    at(
      '2026-11-20',
      pairs.slice(0, 4).map(([earlier]) => earlier),
    ),
  ];
  const states = Object.fromEntries(
    rowsFor(s).map((r) => [r.card.id, opportunityState(r, s)]),
  );
  for (const [earlier, later] of pairs) {
    expect(states[earlier.id]).toEqual({
      state: 'archived',
      reason: 'replaced',
    });
    expect(states[later.id]).toEqual({ state: 'pending' });
  }
});

it('one broad change backing different work, or two cards of one analysis, stay apart', () => {
  // O-81 and O-63 rest on one competitor's pages, O-21 and O-1 on one community digest: nothing in common but generic
  // words ("comparison").
  const o63 = card('o63', {
      title: '写表列行权限策略对比文章',
      signalIds: ['competitor-pages:dad1793a'],
    }),
    o81 = card('o81', {
      title: '给 Lovable 替代补一页对比',
      signalIds: ['competitor-pages:dad1793a'],
    }),
    o1 = card('o1', {
      title: '把插件分享主题做成文档专栏',
      target: '社区插件分享类主题',
      signalIds: ['community-digest'],
    }),
    o21 = card('o21', {
      title: '为 AI Portal 建发布进度说明页',
      target: 'AI Portal 主题（新页面）',
      signalIds: ['community-digest'],
    }),
    o8 = card('o8', {
      title: '把插件分享主题做成文档专题页',
      target: '插件主题',
      signalIds: ['community-digest'],
    });
  expect(sameWork(o81, o63)).toBe(false);
  expect(sameWork(o21, o1)).toBe(false);
  // Without the same changes the server computes, titles alone decide nothing.
  expect(
    sameWork(
      card('a', { title: 'RBAC guide' }),
      card('b', { title: 'RBAC guide' }),
    ),
  ).toBe(false);
  // Two cards one analysis raised with the same changes and a shared term are two opportunities (O-8 and O-21 on 10-11
  // shared the community digest): a later copy of one never replaces the other.
  const sameDay = card('o80', {
    title: '给工作流自动化页补对比与内链',
    signalIds: ['gsc-near-first:/blog/workflow'],
  });
  const other = card('o66', {
    title: '给工作流自动化页改标题摘要',
    signalIds: ['gsc-near-first:/blog/workflow'],
  });
  expect(sameWork(sameDay, other)).toBe(true);
  const s = state([o81, sameDay, o21]);
  s.insights!.generatedAt = '2026-11-26';
  s.insightHistory = [
    at('2026-11-20', [o63, sameDay, other]),
    at('2026-10-11', [o8, o21]),
    at('2026-10-09', [o1]),
  ];
  const states = Object.fromEntries(
    rowsFor(s).map((r) => [r.card.id, opportunityState(r, s)]),
  );
  expect(states.o63.state).toBe('pending');
  expect(states.o66.state).toBe('pending');
  // O-1 is replaced by O-8, the same work in other words, never by O-21.
  expect(states.o1).toEqual({ state: 'archived', reason: 'replaced' });
  expect(sameWork(o8, o1)).toBe(true);
});
