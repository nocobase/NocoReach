// What the pages are sent of the task list and the strategy state (server/nocoreach/page-views.ts).
import { describe, expect, it } from 'vitest';

import {
  strategyPageState,
  taskListRow,
  wantsPageView,
} from '../../server/nocoreach/page-views.js';
import { taskState } from '../../shared/task-pending.js';
import { inPlaceLocales } from '../../shared/article-publishing.js';

const signal = (key: string) => ({
  key,
  source: 'gsc',
  url: `https://example.com/${key}`,
  detail: 'x'.repeat(500),
});

describe('task list rows', () => {
  const task = {
    id: 7,
    title: 'Fix the docs page',
    status: 'pending',
    brief: 'Brief',
    createdAt: '2026-11-01T00:00:00.000Z',
    evidence: {
      no: 12,
      insight: { id: 'o-1', no: 3 },
      context: {
        capturedAt: '2026-10-31T00:00:00.000Z',
        signals: { items: [signal('a'), signal('b')] },
      },
      work: {
        stage: 'work',
        step: 1,
        flow: { stages: [{ kind: 'agent', key: 'draft', name: 'Draft' }] },
        history: [{ at: '2026-11-01T01:00:00.000Z', action: 'start' }],
        results: [
          { content: 'long'.repeat(100) },
          { content: 'more', rejectedAt: '2026-11-02T00:00:00.000Z' },
        ],
        delivery: {
          kind: 'article',
          articleId: 'art-1',
          locales: ['en', 'zh'],
          translateFrom: { published: false, body: 'text' },
          targets: [{ id: 't' }],
        },
        article: { locales: ['en', 'zh'] },
      },
    },
  };

  it('leaves out the analysis copy and the results but keeps what the pages read', () => {
    const row = taskListRow(task) as typeof task;
    expect(row.evidence.context).toEqual({
      capturedAt: '2026-10-31T00:00:00.000Z',
    });
    expect(row.evidence.work.results).toEqual([
      {},
      { rejectedAt: '2026-11-02T00:00:00.000Z' },
    ]);
    expect(row.evidence.work.delivery).toEqual({
      articleId: 'art-1',
      locales: ['en', 'zh'],
      translateFrom: { published: false },
    });
    expect(row.evidence.work.flow).toBe(task.evidence.work.flow);
    expect(row.evidence.work.history).toBe(task.evidence.work.history);
    expect(row.evidence.insight).toBe(task.evidence.insight);
    expect(row.brief).toBe('Brief');
    // Where the task stands and what its step is called read the same.
    expect(taskState(row.evidence.work as never)).toBe(
      taskState(task.evidence.work as never),
    );
    expect(inPlaceLocales(row.evidence.work.delivery, ['en', 'zh'])).toEqual(
      inPlaceLocales(task.evidence.work.delivery, ['en', 'zh']),
    );
    // The stored row is not changed.
    expect(task.evidence.context.signals.items).toHaveLength(2);
  });

  it('keeps a task without evidence as it is', () => {
    const plain = { id: 1, title: 'x' };
    expect(taskListRow(plain)).toBe(plain);
  });
});

describe('strategy state for the pages', () => {
  const batch = (day: string, cited: string[]) => ({
    generatedAt: `${day}T08:00:00.000Z`,
    items: [{ id: `card-${day}`, signalIds: cited }],
    signalReviews: { a: { verdict: 'watch', reason: 'r' } },
    sourceReviews: [{ sourceId: 'gsc', reason: 'x' }],
    observations: [{ text: 'o' }],
    evidence: {
      periodDays: 28,
      analysisVersion: 3,
      summary: { web: { days: 28, sessions: 9 }, search: { days: 28 } },
      industryCandidates: [{ k: 1 }, { k: 2 }],
      publicSources: [{ id: 'gh', kind: 'github', title: 'Repo', body: 'x' }],
      searchQueries: [{ q: 'long' }],
      signals: {
        items: [signal('a'), signal('b'), signal('c')],
        analysisSnapshot: { big: true },
      },
    },
  });
  const state = {
    revision: 4,
    insights: batch('2026-11-05', ['a']),
    insightHistory: [batch('2026-11-04', ['b', 'c'])],
    proposals: [
      {
        id: 'p-1',
        title: 'Plan',
        status: 'approved',
        taskId: 7,
        taskNo: 12,
        insight: { id: 'card-2026-11-04', title: 'Card', why: 'w' },
        evidence: batch('2026-11-04', ['b']).evidence,
      },
    ],
    watch: { a: { since: '2026-11-01' } },
  };

  it('keeps the current analysis whole and cuts earlier ones down to their cards', () => {
    const out = strategyPageState(state) as typeof state;
    expect(out.insights).toBe(state.insights);
    expect(out.watch).toBe(state.watch);
    expect(out.revision).toBe(4);
    const [earlier] = out.insightHistory;
    expect(earlier.items).toBe(state.insightHistory[0].items);
    expect(earlier.signalReviews).toBe(state.insightHistory[0].signalReviews);
    expect(earlier.evidence.signals.items.map((s) => s.key)).toEqual([
      'b',
      'c',
    ]);
    expect(earlier.evidence).toEqual({
      periodDays: 28,
      analysisVersion: 3,
      summary: { web: { days: 28 }, search: { days: 28 } },
      industryCandidates: [{ k: 1 }],
      publicSources: [{ id: 'gh', kind: 'github', title: 'Repo' }],
      signals: { items: [signal('b'), signal('c')] },
    });
    expect('sourceReviews' in earlier).toBe(false);
  });

  it('sends a plan without its evidence', () => {
    const [plan] = (strategyPageState(state) as typeof state).proposals;
    expect(plan).toEqual({
      id: 'p-1',
      title: 'Plan',
      status: 'approved',
      taskId: 7,
      taskNo: 12,
      insight: { id: 'card-2026-11-04' },
    });
  });

  it('leaves answers that are not a state alone', () => {
    const badges = { insights: 2 };
    expect(strategyPageState(badges)).toEqual(badges);
    expect(strategyPageState(null)).toBe(null);
  });

  it('is asked for with view: page only', () => {
    expect(wantsPageView({ view: 'page' })).toBe(true);
    expect(wantsPageView({})).toBe(false);
    expect(wantsPageView(undefined)).toBe(false);
  });
});
