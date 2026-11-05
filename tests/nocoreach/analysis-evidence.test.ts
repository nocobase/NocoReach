// Cutting analysis evidence down to what each copy's readers use (server/nocoreach/analysis-evidence.ts).
import { describe, expect, it } from 'vitest';

import {
  citedKeys,
  isSlim,
  slimBatch,
  taskContext,
  withArchived,
  withoutCatalog,
} from '../../server/nocoreach/analysis-evidence.js';
import { pageUrlsOf } from '../../shared/task-start.js';

const signal = (key: string, url = `https://example.com/${key}`) => ({
  key,
  source: 'gsc',
  title: key,
  facts: [key],
  url,
  action: 'improve',
});
const evidence = {
  capturedAt: '2026-11-01T00:00:00.000Z',
  availableThrough: '2026-10-31',
  periodDays: 28,
  analysisVersion: 3,
  searchQueries: [{ keyword: 'crm' }],
  signals: {
    analysisRunId: 'run',
    analysisSnapshot: { config: { watchDays: 7 }, catalog: [{ id: 'r' }] },
    items: [signal('a'), signal('b'), signal('c')],
  },
};

describe('task context', () => {
  it('keeps the signals of its opportunity, its place and its change, whole', () => {
    const cite = {
      insight: { signalIds: ['a'] },
      part: { signalIds: ['b'] },
      signalKey: 'c',
    };
    expect([...citedKeys(cite)]).toEqual(['a', 'b', 'c']);
    const context = taskContext(evidence, {
      insight: { signalIds: ['a'] },
      part: { signalIds: ['b'] },
    }) as typeof evidence;
    expect(context.signals.items).toEqual([signal('a'), signal('b')]);
    expect(context.capturedAt).toBe(evidence.capturedAt);
    expect(context).not.toHaveProperty('searchQueries');
    expect(isSlim(context)).toBe(true);
    // Cut once: a second pass with fewer citations keeps it.
    expect(taskContext(context, {})).toBe(context);
  });

  it('keeps evidence without signals, and anything that is not evidence, as it is', () => {
    const result = { capturedAt: 'x', limitations: ['result only'] };
    expect(taskContext(result, {})).toBe(result);
    expect(taskContext(null, {})).toBeNull();
    expect(taskContext(undefined, {})).toBeUndefined();
  });

  it('gives a task its pages as before', () => {
    const task = {
      evidence: {
        insight: { id: 'o', signalIds: ['a', 'b'] },
        context: evidence,
      },
    };
    const slim = {
      evidence: {
        ...task.evidence,
        context: taskContext(evidence, task.evidence),
      },
    };
    const urls = (t: typeof task) =>
      pageUrlsOf({ task: t, work: {}, pageIdentity: null } as never);
    expect(urls(slim as never)).toEqual(urls(task));
  });
});

describe('current and earlier analyses', () => {
  it('drops only the rule catalog from the current analysis', () => {
    const out = withoutCatalog(evidence) as typeof evidence;
    expect(out.signals.analysisSnapshot).toEqual({ config: { watchDays: 7 } });
    expect(out.signals.items).toBe(evidence.signals.items);
    expect(withoutCatalog(out)).toBe(out);
  });

  it('keeps what an earlier analysis shows and archives nothing itself', () => {
    const batch = {
      generatedAt: '2026-11-01T08:00:00.000Z',
      items: [{ id: 'o', signalIds: ['b'] }],
      signalReviews: { a: { verdict: 'skip' } },
      observations: ['note'],
      evidence: {
        ...evidence,
        summary: { web: { days: 28, views: 3 }, search: { days: 28 } },
        industryCandidates: [{ k: 1 }, { k: 2 }],
        publicSources: [{ id: 's', kind: 'github', title: 'Repo', items: [1] }],
      },
    };
    const slim = slimBatch(batch) as typeof batch;
    expect(slim.items).toBe(batch.items);
    expect(slim.signalReviews).toBe(batch.signalReviews);
    expect(slim.observations).toBe(batch.observations);
    expect(slim.evidence.signals.items).toEqual([signal('b')]);
    expect(slim.evidence.summary).toEqual({
      web: { days: 28 },
      search: { days: 28 },
    });
    expect(slim.evidence.industryCandidates).toEqual([{ k: 1 }]);
    expect(slim.evidence.publicSources).toEqual([
      { id: 's', kind: 'github', title: 'Repo' },
    ]);
    expect(slimBatch(slim)).toBe(slim);
    // The whole evidence goes back only on a cut-down batch.
    expect(withArchived(slim, batch.evidence)).toEqual({
      ...slim,
      evidence: batch.evidence,
    });
    expect(withArchived(batch, { other: true })).toBe(batch);
  });
});
