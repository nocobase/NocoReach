// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { DataViews } from '../../server/nocoreach/data-views.js';

afterEach(() => vi.useRealTimers());

const day = (from: string, offset: number) =>
  new Date(Date.parse(`${from}T00:00:00Z`) + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const daysThrough = (end: string, count: number) =>
  Array.from({ length: count }, (_, i) => day(end, i - count + 1));

// Search Console and GA4 complete a few days late; GitHub is read through yesterday. Today is 2026-10-29.
function views({ gscEnd, ga4End }: { gscEnd: string; ga4End: string }) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-10-29T12:00:00Z');
  const search = daysThrough(gscEnd, 40).map((date) => ({
    date,
    clicks: 10,
    impressions: 100,
    position: 5,
  }));
  const web = daysThrough(ga4End, 40).map((date) => ({
    date,
    sessions: 20,
    views: 40,
    conversions: 1,
  }));
  // One star a day, counted as the running total.
  const daily = Object.fromEntries(
    daysThrough('2026-10-28', 40).map((date, i) => [date, { stars: 100 + i }]),
  );
  return new DataViews({
    sync: {
      snapshots: async () => [
        { key: 'history-search', payload: search },
        { key: 'history-web', payload: web },
      ],
      fresh: async () => [],
    },
    github: { state: async () => ({ repo: 'acme/app', daily }) },
  } as never);
}
const windowOf = (
  view: { cards: { id: string; window: unknown }[] },
  id: string,
) => view.cards.find((c) => c.id === id)?.window;

it('with sameWindow every card covers the latest 7 days all its sources have complete, against the 7 before', async () => {
  const view = await views({
    gscEnd: '2026-10-25',
    ga4End: '2026-10-25',
  }).overview('1', { range: '7', sameWindow: true });
  const shared = {
    start: '2026-10-19',
    end: '2026-10-25',
    days: 7,
    previousStart: '2026-10-12',
    previousEnd: '2026-10-18',
  };
  expect(view.window).toEqual(shared);
  // GitHub would end yesterday on its own; here it ends with Google.
  for (const id of ['gsc', 'ga4', 'github'])
    expect(windowOf(view, id)).toEqual(shared);
  const stars = view.cards
    .find((c: { id: string }) => c.id === 'github')
    .metrics.find((m: { key: string }) => m.key === 'stars');
  expect(stars).toMatchObject({ value: 7, previous: 7 });
});

it('the shared window ends at the earliest cutoff when the sources differ', async () => {
  const view = await views({
    gscEnd: '2026-10-26',
    ga4End: '2026-10-24',
  }).overview('1', { range: '7', sameWindow: true });
  expect(view.window).toMatchObject({ start: '2026-10-18', end: '2026-10-24' });
  expect(windowOf(view, 'gsc')).toMatchObject({ end: '2026-10-24' });
  expect(windowOf(view, 'github')).toMatchObject({ end: '2026-10-24' });
});

it('without sameWindow each source keeps its own cutoff, as the data pages and the chat read it', async () => {
  const view = await views({
    gscEnd: '2026-10-25',
    ga4End: '2026-10-25',
  }).overview('1', { range: '7' });
  expect(view.window).toBeUndefined();
  expect(windowOf(view, 'gsc')).toMatchObject({ end: '2026-10-25' });
  expect(windowOf(view, 'github')).toMatchObject({ end: '2026-10-28' });
});
