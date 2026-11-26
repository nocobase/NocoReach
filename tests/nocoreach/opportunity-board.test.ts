import { expect, it } from 'vitest';
import {
  mergeCards,
  withoutIgnored,
} from '../../server/nocoreach/opportunity-board';

// Real shapes from nocoreach.nocobase.ai, project 1 (read 2026-11-24). The changes the server computes kept their keys
// every day; a Skill's finding is keyed by the keywords it cited and so changed key daily (skill-analysis.ts).
const builtIn = [
  'keyword-demand:dig-0280f607de7b',
  'people-also-ask:dig-0280f607de7b',
  'keyword-demand:产品与功能词',
  'people-also-ask:产品与功能词',
];
const skill = (digest: string) => `skill:sk-a0aebe3f:demand-gap:${digest}`;
type Card = {
  id?: string;
  no?: number;
  title: string;
  objective: string;
  suggestion: string;
  target?: string;
  audience?: string;
  signalIds?: string[];
  firstSeenAt?: string;
  existingId?: string;
};
const card = (extra: Partial<Card> = {}): Card => ({
  title: '写 RBAC 与 ABAC 权限指南',
  objective: '承接权限相关搜索',
  suggestion: '写一篇指南',
  target: '',
  audience: '开发者',
  ...extra,
});
const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};
const history = (batches: [string, Card[]][]) => ({
  proposals: [],
  insights: { generatedAt: batches[0][0], items: batches[0][1] },
  insightHistory: batches
    .slice(1)
    .map(([generatedAt, items]) => ({ generatedAt, items })),
});

it('O-93 keeps its number when its Skill cites other keywords and the model gives no existingId', () => {
  const o93 = (digest: string, suggestion = '写一篇指南') =>
    card({
      id: 'o93',
      no: 93,
      firstSeenAt: '2026-11-14T02:00:00Z',
      suggestion,
      signalIds: [...builtIn, skill(digest)],
    });
  const state = history([
    ['2026-11-20', [o93('5580f8b95de7')]],
    ['2026-11-19', [o93('595f0d703fde')]],
  ]);
  // 2026-11-21: the same card in other words, under the day's key, no existingId.
  const [raised] = mergeCards(
    state,
    [
      card({
        suggestion: '按角色和属性两种模型写权限指南',
        signalIds: [skill('6239428b3385'), ...builtIn],
      }),
    ],
    '2026-11-21T02:00:00Z',
    ids(),
  );
  expect(raised.id).toBe('o93');
  expect(raised.firstSeenAt).toBe('2026-11-14T02:00:00Z');
  expect(raised.change).not.toBe('new');
});

it("the AI's existingId holds when the objective differs only in its numbers (O-113 and O-116)", () => {
  const o113 = card({
    id: 'o113',
    no: 113,
    title: '找回工作流工具页每月 900 次点击',
    objective: '把 7,534 次曝光转成点击，提升点击率',
    target: 'https://www.nocobase.com/blog/workflow-automation-tools/',
    audience: '在选工作流工具的团队',
    signalIds: ['gsc-ctr:/blog/workflow-automation-tools/', 'rank:workflow'],
  });
  const state = history([['2026-11-23', [o113]]]);
  const next = {
    ...o113,
    id: undefined,
    no: undefined,
    existingId: 'o113',
    title: '找回工作流工具页每月 890 次点击',
    objective: '把 7,470 次曝光转成点击，提升点击率',
    // One more change cited (O-113 cited two, O-116 three): the hint alone keeps the card, not the cited changes.
    signalIds: [
      'gsc-ctr:/blog/workflow-automation-tools/',
      'rank:workflow',
      'gsc-click-drop:/blog/workflow-automation-tools/',
    ],
  };
  expect(mergeCards(state, [next], 'now', ids())[0].id).toBe('o113');
  // Another objective, page or audience is still another opportunity, whatever the hint says.
  for (const other of [
    { objective: '把 7,470 次曝光转成注册' },
    { target: 'https://www.nocobase.com/blog/kanban/' },
    { audience: '开发者' },
  ])
    expect(mergeCards(state, [{ ...next, ...other }], 'now', ids())[0].id).toBe(
      'new-1',
    );
});

it('two different cards resting on findings of the same Skill and kind stay apart', () => {
  const gantt = card({
    id: 'gantt',
    title: '补 Gantt 对比页',
    target: '/compare/gantt',
    signalIds: [skill('aaaaaaaaaaaa')],
  });
  const state = history([['2026-11-23', [gantt]]]);
  const kanban = card({
    title: '写看板教程',
    target: '/tutorials/kanban',
    signalIds: [skill('bbbbbbbbbbbb')],
  });
  const [a] = mergeCards(state, [kanban], 'now', ids());
  expect(a.id).toBe('new-1');
  // The Gantt one comes back under the day's key: the same opportunity.
  const [b, c] = mergeCards(
    state,
    [{ ...gantt, id: undefined, signalIds: [skill('cccccccccccc')] }, kanban],
    'now',
    ids(),
  );
  expect([b.id, c.id]).toEqual(['gantt', 'new-1']);
});

it('an ignored opportunity does not come back under another number when its Skill finding changes key', () => {
  const ignored = card({
    id: 'o93',
    signalIds: [...builtIn, skill('5580f8b95de7')],
  });
  const skillOnly = card({
    id: 'o120',
    title: '补 Gantt 对比页',
    target: '/compare/gantt',
    signalIds: [skill('aaaaaaaaaaaa')],
  });
  const state = {
    ...history([['2026-11-20', [ignored, skillOnly]]]),
    opportunityMeta: {
      o93: { status: 'ignored' },
      o120: { status: 'ignored' },
    },
  };
  const next = [
    // The same built-in changes, the day's Skill key, other words: dropped.
    card({
      id: 'n1',
      title: '权限模型选型指南',
      signalIds: [skill('6239428b3385'), ...builtIn],
    }),
    // Some of those changes only: another opportunity, as before.
    card({ id: 'n2', signalIds: builtIn.slice(0, 2) }),
    // Skill findings alone: the same finding about the same page, dropped; another page and title, kept.
    card({
      id: 'n3',
      title: 'Gantt 对比页',
      target: '/compare/gantt',
      signalIds: [skill('dddddddddddd')],
    }),
    card({
      id: 'n4',
      title: '写看板教程',
      target: '/tutorials/kanban',
      signalIds: [skill('eeeeeeeeeeee')],
    }),
    // The very same key as an ignored card, whatever its words: dropped, as before.
    card({
      id: 'n5',
      title: 'other',
      target: '/other',
      signalIds: [skill('aaaaaaaaaaaa')],
    }),
  ];
  expect(withoutIgnored(state, next).map((c: Card) => c.id)).toEqual([
    'n2',
    'n4',
  ]);
});

// 2026-11-22 to 11-25 on nocoreach.nocobase.ai, project 1: cards the model no longer saw came back reworded, citing the
// same changes, and were given new numbers.
const aiCited = [
  'ai-cited:low code',
  'ai-cited:no code',
  'ai-cited:ai no code',
];
it('a reworded card citing the same changes keeps the earlier number (O-98 and O-114, O-99 and O-117)', () => {
  const o98 = card({
    id: 'o98',
    no: 98,
    title: '让低代码榜单补上 NocoBase',
    firstSeenAt: '2026-11-16T00:02:00Z',
    signalIds: aiCited,
  });
  const o99 = card({
    id: 'o99',
    no: 99,
    title: '写在线表单构建器选型指南',
    firstSeenAt: '2026-11-17T00:02:00Z',
    signalIds: ['competitor-gap:budibase.com/blog/open-source-form-builder'],
  });
  const state = history([
    ['2026-11-21', []],
    ['2026-11-20', [o98, o99]],
  ]);
  const [a, b] = mergeCards(
    state,
    [
      card({
        title: '联系低代码榜单收录 NocoBase',
        signalIds: [...aiCited].reverse(),
      }),
      card({ title: '写开源表单搭建指南', signalIds: o99.signalIds }),
    ],
    '2026-11-22T00:02:00Z',
    ids(),
  );
  expect([a.id, b.id]).toEqual(['o98', 'o99']);
  expect(a.firstSeenAt).toBe('2026-11-16T00:02:00Z');
  // Other changes, or a title about something else, are another opportunity.
  for (const other of [
    card({ title: '联系低代码榜单收录 NocoBase', signalIds: aiCited.slice(1) }),
    card({ title: '回应 AI 搜索里的竞品答案', signalIds: aiCited }),
  ])
    expect(mergeCards(state, [other], 'now', ids())[0].id).toBe('new-1');
});

it('a broad change backing other work, or an ignored card, never lends its number to a reworded card', () => {
  // O-81 and O-63 both rest on one competitor's pages; their titles share nothing but generic words.
  const o63 = card({
    id: 'o63',
    title: '写表列行权限策略对比文章',
    signalIds: ['competitor-pages:dad1793a'],
  });
  const state = history([['2026-11-10', [o63]]]);
  const o81 = card({
    title: '给 Lovable 替代补一页对比',
    signalIds: ['competitor-pages:dad1793a'],
  });
  expect(mergeCards(state, [o81], 'now', ids())[0].id).toBe('new-1');
  // The looser rule never makes a new card an ignored one; withoutIgnored keeps deciding that alone.
  const ignored = {
    ...history([
      [
        '2026-11-20',
        [
          card({
            id: 'o98',
            title: '让低代码榜单补上 NocoBase',
            signalIds: aiCited,
          }),
        ],
      ],
    ]),
    opportunityMeta: { o98: { status: 'ignored' } },
  };
  expect(
    mergeCards(
      ignored,
      [card({ title: '联系低代码榜单收录 NocoBase', signalIds: aiCited })],
      'now',
      ids(),
    )[0].id,
  ).toBe('new-1');
});

it('a page target compares whatever its scheme, www. or trailing slash (O-110 and O-113)', () => {
  const o110 = card({
    id: 'o110',
    title: '重写工作流工具页并补审批页',
    objective: '把 880 次曝光转成点击',
    target: 'https://www.nocobase.com/blog/workflow-automation-tools',
    audience: '在选工作流工具的团队',
    signalIds: ['gsc-near-first:/blog/workflow-automation-tools'],
  });
  const state = history([['2026-11-21', [o110]]]);
  const again = {
    ...o110,
    id: undefined,
    target: 'http://nocobase.com/blog/workflow-automation-tools/?utm=x#top',
  };
  // Identity: the same card in every word, its page written otherwise.
  expect(mergeCards(state, [again], 'now', ids())[0].id).toBe('o110');
  // The AI's existingId, with other changes cited.
  expect(
    mergeCards(
      state,
      [
        {
          ...again,
          title: 'other',
          existingId: 'o110',
          signalIds: ['rank:workflow'],
        },
      ],
      'now',
      ids(),
    )[0].id,
  ).toBe('o110');
  // The same changes and page in other words.
  expect(
    mergeCards(
      state,
      [{ ...again, title: '改写落地页标题', objective: 'other' }],
      'now',
      ids(),
    )[0].id,
  ).toBe('o110');
});

it('a card raised again as it was keeps its number even when another card of the analysis is the same work', () => {
  const o98 = card({
    id: 'o98',
    title: '让低代码榜单补上 NocoBase',
    signalIds: aiCited,
  });
  const state = history([['2026-11-20', [o98]]]);
  // The reworded one comes first; the analysis raising both makes them two.
  const [reworded, same] = mergeCards(
    state,
    [
      card({ title: '联系低代码榜单收录 NocoBase', signalIds: aiCited }),
      { ...o98, id: undefined },
    ],
    'now',
    ids(),
  );
  expect([reworded.id, same.id]).toEqual(['new-1', 'o98']);
});
