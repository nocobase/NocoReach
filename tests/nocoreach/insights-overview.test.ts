// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { StrategyService } from '../../server/nocoreach/strategy-service.js';
import { insightsState } from '../../shared/insights-overview.js';
import type {
  Evidence,
  Opportunity,
  Signal,
  StrategyState,
} from '../../shared/strategy-model.js';
import {
  signalDisposition,
  todaySuggestions,
} from '../../shared/strategy-pending.js';

const signal = (key: string): Signal => ({
  key,
  type: 'change',
  source: 'gsc',
  title: key,
  facts: ['Known evidence'],
  strength: 1,
  actionable: true,
  action: 'content',
});
const evidence = (version: number): Evidence => ({
  analysisVersion: version,
  capturedAt: '2026-10-19',
  availableThrough: '2026-10-18',
  periodDays: 28,
  searchQueries: [],
  pages: [],
  industryCandidates: [],
  limitations: [],
  signals: {
    computedAt: '2026-10-19',
    coverage: {},
    missing: [],
    items: [signal('current'), signal('historical'), signal('unused')],
  },
});
const card = (id: string, key: string): Opportunity => ({
  id,
  title: id,
  signalIds: [key],
  observation: 'A fact',
  meaning: 'A hypothesis',
  evidenceText: 'Original evidence',
  limitation: 'Limited sample',
  suggestion: 'Improve content',
  objective: 'Improve onboarding',
  source: 'search',
  confidence: 'supported',
  priority: 'high',
});
function state(version: number): StrategyState {
  return {
    revision: 7,
    goal: null,
    insights: {
      generatedAt: '2026-10-19',
      evidence: evidence(version),
      items: [card('current-card', 'current')],
    },
    insightHistory: [
      {
        generatedAt: '2026-10-18',
        evidence: evidence(version),
        items: [card('old-card', 'historical')],
      },
    ],
    proposals: [
      {
        id: 'proposal',
        title: 'Task',
        brief: 'Complete brief',
        status: 'approved',
        goalVersion: null,
        insight: card('old-card', 'historical'),
        taskId: 42,
        taskNo: 3,
        signalKey: 'historical',
        evidence: evidence(version),
      },
    ],
    opportunityMeta: { 'old-card': { restoredAt: '2026-10-19' } },
    signalMeta: { unused: { status: 'ignored' } },
  };
}
describe('Insights display snapshot', () => {
  it.each([2, 3])(
    'preserves v%s suggestions, historical task links and dispositions',
    (version) => {
      const original = state(version);
      const before = structuredClone(original);
      const compact = insightsState(original);
      const rows = (s: StrategyState) =>
        todaySuggestions(s, 50).map(({ card, status, taskId, priority }) => ({
          card,
          status,
          taskId,
          priority,
        }));
      expect(rows(compact)).toEqual(rows(original));
      const tasks = [{ id: 42, status: 'todo' }];
      for (const key of ['current', 'historical', 'unused']) {
        const disposition = (s: StrategyState) => {
          const { row, ...rest } = signalDisposition({ key }, s, tasks);
          return { ...rest, cardId: row?.card.id };
        };
        expect(disposition(compact)).toEqual(disposition(original));
      }
      expect(compact.insights?.evidence.signals).toEqual(
        original.insights?.evidence.signals,
      );
      expect(
        compact.insightHistory?.[0].evidence.signals?.items.map((s) => s.key),
      ).toEqual(['historical']);
      expect(compact.proposals[0].evidence.signals).toBeUndefined();
      expect(compact.proposals[0].brief).toBe('Complete brief');
      expect(original).toEqual(before);
      expect(insightsState(compact)).toEqual(compact);
    },
  );
  it('omits unused public-source bodies and internal operation history', () => {
    const original = state(3);
    const source = {
      id: 'public',
      title: 'Docs',
      url: 'https://example.test',
      kind: 'website',
      capturedAt: '2026-10-19',
      warnings: [],
      items: [{ text: 'long source body'.repeat(1000) }],
    };
    original.insights!.evidence.publicSources = [source];
    const compact = insightsState({
      ...original,
      operations: ['internal request id'],
    } as StrategyState);
    expect(compact.insights!.evidence.publicSources?.[0]).not.toHaveProperty(
      'items',
    );
    expect(compact).not.toHaveProperty('operations');
    expect(source.items[0].text.length).toBeGreaterThan(10000);
  });
});

it('loads only stored state and snapshot metadata, without generating an analysis context', async () => {
  const snapshots = vi
    .fn()
    .mockResolvedValue([{ key: 'project', payload: { end: '2026-10-18' } }]);
  const service = new StrategyService({ sync: { snapshots } });
  const original = state(3);
  vi.spyOn(service, 'state').mockResolvedValue(original);
  const context = vi
    .spyOn(service, 'context')
    .mockRejectedValue(new Error('Must not generate context'));
  expect(await service.overview('12')).toEqual({
    state: insightsState(original),
    periodDays: 28,
    availableThrough: '2026-10-18',
  });
  expect(snapshots).toHaveBeenCalledWith('12');
  expect(context).not.toHaveBeenCalled();
  snapshots.mockRejectedValueOnce(new Error('No Google connection'));
  expect((await service.overview('12')).availableThrough).toBeNull();
});
