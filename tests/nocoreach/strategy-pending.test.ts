import { expect, it } from 'vitest';
import {
  insightPending,
  opportunityState,
  rowsFor,
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
