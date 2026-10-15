import { describe, it, expect } from 'vitest';
import {
  contentRuleCatalog,
  contentSignals,
  type ContentSourceDefinition,
} from '../../server/nocoreach/content-rules';
import { computeAll } from '../../server/nocoreach/signals';
import { contentInputs } from '../../server/nocoreach/content-source-inputs';
const now = Date.parse('2026-10-15T00:00:00Z');
const at = '2026-10-14T00:00:00Z';
const item = {
  id: 'one',
  title: 'Example',
  url: 'https://example.com/one',
  firstSeenAt: at,
  collectedAt: at,
  metrics: { views: { value: 20000, at }, likes: { value: 200, at } },
};
describe('capability-based content rules', () => {
  it('adapts an unfamiliar channel without platform-specific rule logic', () => {
    const sources: ContentSourceDefinition[] = [
      {
        id: 'user-channel',
        capabilities: { discovery: true, metrics: ['likes'] },
      },
    ];
    const rules = contentRuleCatalog(sources);
    const settings = {
      on: () => true,
      value: (id: string, key: string) =>
        rules.find((r) => r.id === id)!.params.find((p) => p.key === key)!
          .default,
    };
    expect(
      contentSignals(
        [{ source: 'user-channel', items: [item] }],
        settings,
        now,
        sources,
      ).map((s) => s.key),
    ).toEqual(['user-channel-new:one', 'user-channel-likes:one']);
    expect(rules.some((r) => r.id.includes('views'))).toBe(false);
  });
  it('runs the three adapters through the daily signal engine and honors overrides', () => {
    const input = {
      now,
      contentSources: ['youtube', 'bilibili', 'xiaohongshu'].map((source) => ({
        source,
        items: [item],
      })),
    };
    expect(computeAll(input).ranked).toHaveLength(8);
    expect(
      computeAll(input, {
        rules: {
          'youtube-new': { enabled: false },
          'youtube-views': { values: { minCount: 30000 } },
        },
      }).ranked,
    ).toHaveLength(6);
    expect(Object.keys(computeAll(input).found)).toHaveLength(8);
  });
  it('rejects stale/future samples and missing or stale metrics without mistaking discovery for publication', () => {
    const input = (sample: typeof item) => ({
      now,
      contentSources: [{ source: 'youtube', items: [sample] }],
    });
    expect(
      computeAll(input({ ...item, collectedAt: '2025-01-01' })).ranked,
    ).toHaveLength(0);
    expect(
      computeAll(input({ ...item, collectedAt: '2027-01-01' })).ranked,
    ).toHaveLength(0);
    const invalid = {
      ...item,
      firstSeenAt: '2025-01-01',
      metrics: {
        views: { value: 20000, at: '2025-01-01' },
        likes: { value: NaN, at },
      },
    };
    expect(computeAll(input(invalid)).ranked).toHaveLength(0);
    expect(computeAll(input(item)).ranked[0].facts.join(' ')).toContain(
      '不代表发布时间',
    );
  });
  it('isolates failed channels and excludes disconnected or previous-configuration records', async () => {
    const result = await contentInputs(
      {
        youtube: {
          analysisData: async () => {
            throw new Error('unavailable');
          },
        },
        bilibili: {
          state: async () => ({
            connected: true,
            revision: 'new',
            videos: { old: { configRevision: 'old' } },
          }),
        },
        xiaohongshu: {
          state: async () => ({ connected: false, notes: [item] }),
        },
      } as never,
      'project-a',
    );
    expect(result.every((r) => r.items.length === 0)).toBe(true);
  });
});
