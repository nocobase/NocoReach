// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  dayOf,
  conversationDayOf,
  conversationDaysByLocalDay,
  feedOf,
} from '../../client/pages/strategy/feed';
import { rowsFor } from '../../client/pages/strategy/board';
import type {
  StrategyState,
  InsightBatch,
  Opportunity,
} from '../../shared/strategy-model';

const batch = (generatedAt: string, items: Opportunity[] = []) =>
  ({
    generatedAt,
    items,
    evidence: { signals: { items: [] } },
  }) as InsightBatch;
const state = (latest: string): StrategyState =>
  ({
    insights: batch(latest),
    proposals: [],
    watch: {},
  }) as unknown as StrategyState;
const card = (id: string, at: string) =>
  ({ id, title: id, firstSeenAt: at }) as Opportunity;
afterEach(() => vi.unstubAllEnvs());

it.each([
  [
    'Asia/Shanghai',
    '2026-10-21T00:30:00Z',
    '2026-10-20T23:30:00Z',
    '2026-10-21',
  ],
  [
    'America/New_York',
    '2026-10-21T03:30:00Z',
    '2026-10-20T23:30:00Z',
    '2026-10-20',
  ],
])(
  'groups raised, ignored and handed-off items by the same local day in %s',
  (zone, latest, earlier, expectedDay) => {
    vi.stubEnv('TZ', zone);
    const s = state(latest);
    s.insights!.items = [
      card('raised', earlier),
      card('ignored', '2026-10-18T12:00:00Z'),
      card('handed', '2026-10-18T12:00:00Z'),
    ];
    s.opportunityMeta = {
      raised: { status: 'ignored' },
      ignored: { status: 'ignored', ignoredAt: earlier },
    };
    s.proposals = [
      {
        id: 'handed',
        taskId: 1,
        insight: s.insights!.items[2],
      } as StrategyState['proposals'][number],
    ];
    const feed = feedOf(
      s,
      rowsFor(s),
      new Map([['1', { createdAt: earlier }]]),
    );
    expect(dayOf(latest)).toBe(expectedDay);
    expect(dayOf(earlier)).toBe(expectedDay);
    expect(feed.decided.map((i) => i.row.card.id).sort()).toEqual([
      'handed',
      'ignored',
      'raised',
    ]);
    expect(feed.days).toEqual([]);
  },
);
it('merges different UTC dates into one historical local day and preserves conversation subjects', () => {
  vi.stubEnv('TZ', 'Asia/Shanghai');
  const s = state('2026-10-23T00:30:00Z');
  s.insightHistory = [
    batch('2026-10-21T00:30:00Z', [
      card('first', '2026-10-20T23:30:00Z'),
      card('second', '2026-10-21T00:10:00Z'),
    ]),
    batch('2026-10-20T23:30:00Z'),
  ];
  s.opportunityMeta = {
    first: { status: 'ignored' },
    second: { status: 'ignored' },
  };
  const feed = feedOf(s, rowsFor(s));
  expect(feed.days.map((d) => d.day)).toEqual(['2026-10-21']);
  expect(feed.days[0].items).toHaveLength(2);
  expect(conversationDayOf('2026-10-20T23:30:00Z')).toBe('2026-10-20');
  expect(conversationDaysByLocalDay(s, ['2026-10-20', '2026-10-21'])).toEqual(
    new Map([['2026-10-21', ['2026-10-20', '2026-10-21']]]),
  );
});
it('assigns an existing conversation once when analyses on one UTC day span two local days', () => {
  vi.stubEnv('TZ', 'Asia/Shanghai');
  const s = state('2026-10-21T23:30:00Z');
  s.insightHistory = [batch('2026-10-21T00:30:00Z')];
  expect(conversationDaysByLocalDay(s, ['2026-10-21', '2026-10-21'])).toEqual(
    new Map([['2026-10-22', ['2026-10-21']]]),
  );
});
