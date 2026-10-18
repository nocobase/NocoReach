import { afterEach, expect, it, vi } from 'vitest';
import { collectorPeriod } from '../../server/nocoreach/collector-views';
// @ts-expect-error The server modules are plain JavaScript under ts-nocheck.
import { windowFor } from '../../server/nocoreach/data-views.js';

type Item = {
  id: string;
  publishedAt: string | null;
  firstSeenAt: string;
  views: number | null;
};
const item = (
  id: string,
  publishedAt: string | null,
  firstSeenAt: string,
  views: number | null = null,
): Item => ({ id, publishedAt, firstSeenAt, views });
const items = [
  item('recent', '2026-10-10T08:00:00Z', '2026-10-15T00:00:00Z', 100),
  item('undated', null, '2026-10-12T00:00:00Z', 5),
  item('unknown-count', '2026-10-01', '2026-10-15T00:00:00Z'),
  item('previous', '2026-10-02', '2026-10-15T00:00:00Z', 1),
  item('old', '2026-01-01', '2026-10-15T00:00:00Z', 1000),
];
const report = (values: Record<string, unknown>) =>
  collectorPeriod(
    {},
    '1',
    'bilibili',
    values,
    windowFor,
    items,
    (v) => ({ published: v.publishedAt, seen: v.firstSeenAt }),
    [{ key: 'views', value: (v) => v.views }],
  );

afterEach(() => vi.useRealTimers());

it('counts saved records by publication date, falling back to when they were first collected', () => {
  vi.useFakeTimers({ now: new Date('2026-10-17T12:00:00Z') });
  const r = report({ range: '7' });
  expect(r.window).toMatchObject({ start: '2026-10-11', end: '2026-10-17' });
  expect(r.items.map((v) => v.id)).toEqual(['undated']);
  const custom = report({
    range: 'custom',
    from: '2026-10-03',
    to: '2026-10-16',
  });
  // Newest publication first; the previous period of the same length only compares publications.
  expect(custom.items.map((v) => v.id)).toEqual(['undated', 'recent']);
  expect(custom.kpis).toEqual([
    expect.objectContaining({
      key: 'published',
      value: 2,
      previous: 2,
      change: 0,
    }),
    expect.objectContaining({ key: 'views', value: 105, previous: null }),
    expect.objectContaining({ key: 'total', value: 5 }),
  ]);
});

it('starts all time at the earliest saved record and sums only known counts', () => {
  vi.useFakeTimers({ now: new Date('2026-10-17T12:00:00Z') });
  const r = report({ range: 'all' });
  expect(r.window).toMatchObject({
    start: '2026-01-01',
    end: '2026-10-17',
    all: true,
  });
  expect(r.items).toHaveLength(5);
  expect(r.kpis[0]).toMatchObject({ value: 5, previous: null, change: null });
  expect(r.kpis[1]).toMatchObject({ value: 1106 });
});
