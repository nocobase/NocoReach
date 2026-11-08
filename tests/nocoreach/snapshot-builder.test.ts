// @vitest-environment node
import { expect, it } from 'vitest';
import {
  buildSnapshots,
  periodWindow,
  snapshotBuilder,
} from '../../server/nocoreach/sync-data.js';

type Row = Record<string, unknown>;
type Partition = {
  source: string;
  grain: string;
  date: string;
  payload: Row[];
};

// The queries and pages snapshots as buildSnapshots summed them before snapshotBuilder: every row of every day held at
// once, a map of sums for each range.
function reference(partitions: Partition[], end: string) {
  const out: { key: string; payload: unknown }[] = [];
  for (const key of ['7', '28', '90', '3m', '6m', '12m', '16m']) {
    const w = periodWindow(end, key);
    const pages = new Map<
      string,
      Row & { views: number; sessions: number; conversions: number }
    >();
    for (const p of partitions.filter(
      (p) =>
        p.source === 'ga4' &&
        p.grain === 'page' &&
        p.date >= w.start &&
        p.date <= end,
    ))
      for (const r of p.payload) {
        const k = JSON.stringify([r.host || '', r.page]);
        const o = pages.get(k) || {
          ...r,
          views: 0,
          sessions: 0,
          conversions: 0,
        };
        o.views += r.views as number;
        o.sessions += (r.sessions as number) || 0;
        o.conversions += r.conversions as number;
        pages.set(k, o);
      }
    out.push({
      key: `pages-${key}`,
      payload: [...pages.values()]
        .sort((a, b) => b.views - a.views)
        .slice(0, 60),
    });
    const sums = new Map<string, Record<string, number | string>>();
    for (const p of partitions.filter(
      (p) =>
        p.source === 'gsc' &&
        p.grain === 'query_page' &&
        p.date >= w.previousStart &&
        p.date <= end,
    ))
      for (const r of p.payload) {
        const k = JSON.stringify([r.keyword, r.page]);
        const o = (sums.get(k) || {
          keyword: r.keyword,
          page: r.page,
          clicks: 0,
          impressions: 0,
          previous: 0,
          previousImpressions: 0,
          weight: 0,
        }) as Record<string, number>;
        if (p.date >= w.start) {
          o.clicks += r.clicks as number;
          o.impressions += r.impressions as number;
          o.weight += (r.position as number) * (r.impressions as number);
        } else {
          o.previous += r.clicks as number;
          o.previousImpressions += r.impressions as number;
        }
        sums.set(k, o);
      }
    const keywords = new Map<unknown, number>();
    for (const r of sums.values())
      keywords.set(
        r.keyword,
        (keywords.get(r.keyword) || 0) + (r.impressions as number),
      );
    const top = new Set(
      [...keywords]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([k]) => k),
    );
    out.push({
      key: `queries-${key}`,
      payload: [...sums.values()]
        .filter(
          (r) =>
            top.has(r.keyword) &&
            ((r.impressions as number) > 20 || (r.previous as number) > 5),
        )
        .sort((a, b) => (b.impressions as number) - (a.impressions as number))
        .slice(0, 250)
        .map(({ weight, ...r }) => ({
          ...r,
          position: r.impressions
            ? (weight as number) / (r.impressions as number)
            : 0,
        })),
    });
  }
  return out;
}

it('sums page days one at a time into the same snapshots as every row at once, ties in the same order', () => {
  // A fixed pseudo-random sequence, so figures repeat often and ties decide the order.
  let seed = 7;
  const next = (n: number) => (
    (seed = (seed * 1103515245 + 12345) % 2147483648),
    seed % n
  );
  const end = '2026-11-04';
  const day = (n: number) =>
    new Date(Date.parse(`${end}T00:00:00Z`) - n * 86400000)
      .toISOString()
      .slice(0, 10);
  const partitions: Partition[] = [
    {
      source: 'ga4',
      grain: 'overview',
      date: end,
      payload: [{ date: end, views: 1 }],
    },
    {
      source: 'gsc',
      grain: 'overview',
      date: end,
      payload: [{ date: end, clicks: 1, impressions: 1 }],
    },
  ];
  // Days in a shuffled order, as ids do not follow the date.
  const days = Array.from({ length: 400 }, (_, i) => i).sort(() => next(3) - 1);
  for (const n of days) {
    partitions.push({
      source: 'gsc',
      grain: 'query_page',
      date: day(n),
      payload: Array.from({ length: 1 + next(40) }, () => ({
        keyword: `k${next(150)}`,
        page: `https://example.test/${next(30)}`,
        clicks: next(4),
        impressions: next(30),
        position: 1 + next(20),
      })),
    });
    partitions.push({
      source: 'ga4',
      grain: 'page',
      date: day(n),
      payload: Array.from({ length: 1 + next(10) }, () => ({
        host: 'example.test',
        page: `/${next(80)}`,
        views: next(5),
        conversions: next(2),
      })),
    });
  }
  const built = buildSnapshots(partitions, { id: '1' });
  const pick = (s: { key: string; payload: unknown }[]) =>
    s.filter((s) => /^(pages|queries)-/.test(s.key));
  expect(pick(built)).toEqual(reference(partitions, end));
  // Page days handed to the builder after the other days give the same snapshots.
  const builder = snapshotBuilder(partitions.slice(0, 2), { id: '1' });
  for (const p of partitions.slice(2)) builder.add(p);
  expect(pick(builder.finish())).toEqual(pick(built));
});
