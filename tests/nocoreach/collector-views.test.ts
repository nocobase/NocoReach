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

it('lists only the newest records up to the limit while counting the whole period', () => {
  vi.useFakeTimers({ now: new Date('2026-10-17T12:00:00Z') });
  const r = report({ range: 'all', limit: 2 });
  expect(r.matched).toBe(5);
  expect(r.items.map((v) => v.id)).toEqual(['undated', 'recent']);
  expect(r.kpis[0]).toMatchObject({ value: 5 });
  expect(report({ range: 'all', limit: 'many' }).items).toHaveLength(5);
  expect(report({ range: 'all', limit: 0 }).items).toHaveLength(1);
});

it('sorts the period by a metric or by date, keeping unknown counts last', () => {
  vi.useFakeTimers({ now: new Date('2026-10-17T12:00:00Z') });
  const ids = (values: Record<string, unknown>) =>
    report({ range: 'all', ...values }).items.map((v) => v.id);
  expect(ids({ sort: 'views' })).toEqual([
    'old',
    'recent',
    'undated',
    'previous',
    'unknown-count',
  ]);
  expect(ids({ sort: 'views', order: 'asc' })).toEqual([
    'previous',
    'undated',
    'recent',
    'old',
    'unknown-count',
  ]);
  expect(ids({ order: 'asc' })).toEqual([
    'old',
    'unknown-count',
    'previous',
    'recent',
    'undated',
  ]);
  // Anything else falls back to newest publication first.
  expect(ids({ sort: 'title', order: 'sideways' })).toEqual(ids({}));
  expect(report({ range: 'all', sort: 'views', limit: 1 }).matched).toBe(5);
});

it('counts publications per bucket of the window and records per origin', () => {
  vi.useFakeTimers({ now: new Date('2026-10-17T12:00:00Z') });
  const week = report({ range: '7' });
  expect(week.trend.unit).toBe('day');
  expect(week.trend.points).toHaveLength(7);
  expect(week.trend.points.find((p) => p.date === '2026-10-12')).toEqual({
    date: '2026-10-12',
    published: 1,
  });
  expect(week.trend.points.reduce((n, p) => n + p.published, 0)).toBe(1);
  // All time here spans 290 days: weeks start on Monday, the first one at the window's start.
  const all = report({ range: 'all' });
  expect(all.trend.unit).toBe('week');
  expect(all.trend.points[0]).toEqual({ date: '2026-01-01', published: 1 });
  expect(all.trend.points[1].date).toBe('2026-01-05');
  expect(all.trend.points.reduce((n, p) => n + p.published, 0)).toBe(5);

  const grouped = collectorPeriod(
    {},
    '1',
    'bilibili',
    { range: 'all' },
    windowFor,
    items,
    (v) => ({ published: v.publishedAt, seen: v.firstSeenAt }),
    [],
    (v) =>
      v.id === 'old'
        ? [
            { kind: 'video', name: 'BV1' },
            { kind: 'term', name: 'NocoBase' },
          ]
        : [
            { kind: 'term', name: 'NocoBase' },
            { kind: 'term', name: 'NocoBase' },
            { kind: 'term', name: '' },
          ],
  );
  expect(grouped.groups).toEqual([
    { kind: 'term', name: 'NocoBase', count: 5 },
    { kind: 'video', name: 'BV1', count: 1 },
  ]);
  expect(report({ range: 'all' }).groups).toEqual([]);
});
