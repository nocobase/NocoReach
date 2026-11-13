// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
  articleOrder,
  articleReasons,
  clickPeriods,
  hotDiscussions,
  hotHeadline,
  hotRows,
  isHot,
  recommendation,
  seriesOf,
} from '../../shared/workshop-recommend.js';
import { rowsFor } from '../../shared/strategy-pending.js';
import { GROWTH_KINDS } from '../../shared/growth.js';

// Content workshop recommendations v4 (2026-11-13, ui-references/content-workshop-2026-11-12/brief-v4.md): Site
// articles by why they are worth adapting now, with cooldowns after an adaptation; Trending now from Opportunities'
// live Trending now opportunities.

const DAY = 86400000;
const END = '2026-11-12';
const NOW = Date.parse('2026-11-13T12:00:00Z');
const TODAY = '2026-11-13';
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

/** Weekly and monthly series from clicks per day back from END (day 0 is END). */
function figures(perDay: (d: number) => number, extra = {}) {
  const periods = clickPeriods(END);
  const byPeriod = periods.map((p) => {
    const from = Math.round((Date.parse(END) - Date.parse(p.end)) / DAY),
      to = Math.round((Date.parse(END) - Date.parse(p.start)) / DAY);
    let n = 0;
    for (let d = from; d <= to; d++) n += perDay(d);
    return n;
  });
  return { ...seriesOf(byPeriod, periods), cited: 0, ...extra };
}

describe('click periods', () => {
  it('cut the 365 days at every week and month start, with no gap or overlap', () => {
    const periods = clickPeriods(END);
    expect(periods[0]).toMatchObject({ end: END, week: 0, month: 0 });
    for (let i = 1; i < periods.length; i++)
      expect(
        Date.parse(periods[i - 1].start) - Date.parse(periods[i].end),
      ).toBe(DAY);
    expect(periods.at(-1).start).toBe('2025-11-13');
    const s = figures(() => 1);
    expect(s.weeks).toEqual(Array(8).fill(7));
    expect(s.months.reduce((a, b) => a + b, 0)).toBe(365);
  });
});

describe('Site articles: reasons', () => {
  const reasons = (f, published?: string, searched = true) =>
    articleReasons({ ...f, published }, { today: TODAY, searched });

  it('marks clicks rising at 30% on the week before with 20 clicks or more', () => {
    expect(reasons(figures((d) => (d < 7 ? 4 : 3)))).toEqual([
      'rising',
      'steady',
    ]);
    // Up 43%, but 14 clicks in the week are too few.
    expect(reasons(figures((d) => (d < 7 ? 2 : d < 14 ? 1.4 : 0)))).toEqual([]);
    expect(reasons(figures((d) => (d < 7 ? 3 : 2.5)))).toEqual(['steady']);
    // A page published inside the week before has no full week to compare with.
    expect(
      reasons(
        { ...figures((d) => (d < 9 ? 5 : 0)), partial: true },
        '2026-11-04',
      ),
    ).toEqual(['new']);
  });

  it('marks new for 30 days, and steady only with clicks in 9 of the 12 months', () => {
    expect(
      reasons(
        figures(() => 0),
        '2026-10-15',
      ),
    ).toEqual(['new']);
    expect(
      reasons(
        figures(() => 0),
        '2026-10-14',
      ),
    ).toEqual([]);
    // Lots of clicks in two months only.
    expect(reasons(figures((d) => (d > 300 ? 50 : 0)))).toEqual([]);
    // Steady: a few clicks a day all year, 365 in all.
    expect(reasons(figures(() => 1))).toEqual(['steady']);
    // Too few clicks over the year.
    expect(reasons(figures((d) => (d % 5 ? 0 : 1)))).toEqual([]);
    // Without Search Console only New is known.
    expect(
      reasons(
        figures(() => 1),
        '2026-11-01',
        false,
      ),
    ).toEqual(['new']);
  });

  it('orders rising by clicks, then new by date, then steady by the year', () => {
    const a = (title, reasons, f) => ({ ...f, title, reasons });
    const list = [
      a(
        'steady-small',
        ['steady'],
        figures(() => 1),
      ),
      a('new-old', ['new'], { ...figures(() => 0), published: '2026-10-20' }),
      a(
        'rising-small',
        ['rising'],
        figures((d) => (d < 7 ? 4 : 3)),
      ),
      a(
        'steady-big',
        ['steady'],
        figures(() => 5),
      ),
      a('new-fresh', ['new'], { ...figures(() => 0), published: '2026-11-10' }),
      a(
        'rising-big',
        ['rising'],
        figures((d) => (d < 7 ? 40 : 3)),
      ),
    ].sort(articleOrder);
    expect(list.map((x) => x.title)).toEqual([
      'rising-big',
      'rising-small',
      'new-fresh',
      'new-old',
      'steady-big',
      'steady-small',
    ]);
  });
});

describe('Site articles: after an adaptation', () => {
  const rising = figures((d) => (d < 7 ? 10 : 3));
  const at = (days, extra = {}) => ({ at: daysAgo(days), ...extra });
  const show = (f, reasons, last) =>
    recommendation(f, reasons, last, { now: NOW, end: END });

  it('recommends one never adapted, and none adapted in the last 14 days', () => {
    expect(show(rising, ['rising'], undefined)).toEqual({
      show: true,
      since: null,
    });
    expect(
      show(rising, ['rising'], at(13, { clicks7: 5, cited: 0 })).show,
    ).toBe(false);
    expect(
      show(
        figures(() => 1),
        ['steady'],
        at(2),
      ).show,
    ).toBe(false);
    expect(show(rising, [], undefined).show).toBe(false);
  });

  it('brings a rising or new article back after 14 days only when clicks rose since or an AI started citing it', () => {
    // Kept with the task: 35 clicks in the 7 days before it was adapted; 70 now.
    expect(show(rising, ['rising'], at(16, { clicks7: 35, cited: 0 }))).toEqual(
      { show: true, since: 1 },
    );
    expect(
      show(rising, ['rising'], at(16, { clicks7: 80, cited: 0 })).show,
    ).toBe(false);
    expect(
      show(
        { ...rising, cited: 2 },
        ['rising'],
        at(16, { clicks7: 80, cited: 1 }),
      ).show,
    ).toBe(true);
    // An older task without the figures kept: the clicks of the week it was adapted in (week 2, 21 clicks).
    expect(show(rising, ['rising'], at(16))).toEqual({
      show: true,
      since: 70 / 21 - 1,
    });
    // A new article whose clicks fell since.
    const fading = {
      ...figures((d) => (d < 7 ? 2 : d < 21 ? 6 : 0)),
      published: '2026-10-20',
    };
    expect(show(fading, ['new'], at(15, { clicks7: 42, cited: 0 })).show).toBe(
      false,
    );
  });

  it('brings a steady article back 90 days after its adaptation', () => {
    const steady = figures(() => 1);
    expect(
      show(steady, ['steady'], at(60, { clicks7: 1, cited: 0 })).show,
    ).toBe(false);
    expect(
      show(steady, ['steady'], at(91, { clicks7: 100, cited: 0 })),
    ).toEqual({ show: true, since: null });
  });
});

// --- Trending now ---------------------------------------------------------------------------------------------------

const growth = (kind, figures, extra = {}) => ({
  kind,
  category: GROWTH_KINDS[kind],
  figures: figures.map(([label, value]) => ({
    label: { key: `growth.figure.${label}` },
    value,
  })),
  ...extra,
});
const card = (id, g, extra = {}) => ({
  id,
  no: Number(id.slice(1)),
  title: `Action title ${id}`,
  priority: 'high',
  growth: g,
  signalIds: [],
  ...extra,
});
const batch = (generatedAt, items, signals = []) => ({
  generatedAt,
  items,
  evidence: { signals: { items: signals } },
});
const RISING = growth(
  'rising',
  [
    ['monthlySearches', 2750],
    ['threeMonthChange', 1.26],
  ],
  { subject: 'ai project management' },
);

function state() {
  const today = '2026-11-13T06:00:00Z';
  return {
    insights: batch(today, [
      card('o1', RISING),
      card(
        'o2',
        growth('new-repo', [['starsWeek', 1240]], {
          subject: 'acme/openboard',
        }),
        { priority: 'medium' },
      ),
      card('o3', growth('near-first', [['position', 4]])),
      card(
        'o4',
        growth(
          'topic-heat',
          [
            ['newRepositoriesWeek', 64],
            ['newRepositoriesBefore', 23],
          ],
          { subject: 'kanban' },
        ),
      ),
      card('o5', growth('rising', [['monthlySearches', 90]]), {
        priority: 'low',
      }),
      card('o9', RISING, { resultSource: { capturedAt: today } }),
    ]),
    insightHistory: [
      batch('2026-11-02T06:00:00Z', [
        card(
          'o6',
          growth('topic-heat', [
            ['newRepositoriesWeek', 9],
            ['newRepositoriesBefore', 3],
          ]),
        ),
      ]),
      batch('2026-10-28T06:00:00Z', [
        card('o7', growth('new-repo', [['starsWeek', 400]])),
      ]),
    ],
    proposals: [
      { id: 'p1', insight: { id: 'o4' }, taskId: 41, taskNo: 41 },
      { id: 'p2', insight: { id: 'o5' }, taskId: 51, taskNo: 51 },
      { id: 'p3', insight: { id: 'o5' }, taskId: 52, taskNo: 52 },
    ],
    opportunityMeta: { o2: { status: 'pending' }, o6: { status: 'ignored' } },
  };
}

describe('Trending now', () => {
  const standing = { 41: 'doing', 51: 'closed', 52: 'closed' };
  const of = (id) => standing[id];

  it('lists live Trending now opportunities by category, in Opportunities’ order', () => {
    const s = state();
    // o3 is not trending; o5's tasks are all closed; o6 was ignored; o7 was last found 16 days before the latest
    // analysis; o9 was made on Results. o4 was handed off and stays: short posts sit beside its blog post.
    expect(hotRows(s, of).map((r) => r.card.id)).toEqual(['o1', 'o4', 'o2']);
    const o4 = rowsFor(s).find((r) => r.card.id === 'o4');
    expect(isHot(o4, s, of)).toBe(true);
    expect(isHot(o4, s, () => 'closed')).toBe(false);
  });

  it('keeps one refreshed within 14 days', () => {
    const s = state();
    s.insightHistory[1].generatedAt = '2026-10-31T06:00:00Z';
    expect(hotRows(s, of).map((r) => r.card.id)).toContain('o7');
  });

  it('says what is hot from the growth, and falls back to the title without a subject', () => {
    const s = state();
    const headline = (id) =>
      hotHeadline(rowsFor(s).find((r) => r.card.id === id).card, []);
    expect(headline('o1')).toEqual({
      key: 'workshop.hot.searchRise',
      params: { 0: 'ai project management', 1: '126%' },
    });
    expect(headline('o2')).toEqual({
      key: 'workshop.hot.repoStars',
      params: { 0: 'openboard', 1: '1,240' },
    });
    expect(headline('o4')).toEqual({
      key: 'workshop.hot.topicRepos',
      params: { 0: 'kanban', 1: '64', 2: '2.8' },
    });
    // No subject on the growth, none in the signal keys: the card shows the opportunity's title.
    expect(headline('o5')).toBeNull();
    // The subject from a cited signal's key, as growths computed before subjects were kept.
    const row = rowsFor(s).find((r) => r.card.id === 'o6');
    expect(
      hotHeadline(row.card, [{ key: 'github-topic:kanban' }]),
    ).toMatchObject({
      key: 'workshop.hot.topicRepos',
      params: { 0: 'kanban' },
    });
  });

  it('reads the discussions of a discussion growth, with no heat for Reddit', () => {
    const g = growth('rising', [['monthlySearches', 1]], {
      evidence: {
        columns: [
          { key: 'discussion' },
          { key: 'source' },
          { key: 'heat' },
          { key: 'date' },
        ],
        rows: [
          {
            discussion: 'Who writes weekly updates?',
            source: 'Reddit · r/projectmanagement',
            heat: { key: 'h', params: { 0: 9 } },
            date: '2026-11-10',
            url: 'https://reddit.com/r/projectmanagement/1',
          },
          {
            discussion: 'Show HN: a board digest',
            source: 'Hacker News',
            heat: { key: 'growth.heat.points', params: { 0: 312 } },
            date: '2026-11-07',
          },
          { discussion: '', source: 'Reddit · r/agile' },
        ],
        total: 3,
        unit: 'discussions',
        link: '/data/reddit',
      },
    });
    expect(hotDiscussions(g)).toEqual([
      {
        title: 'Who writes weekly updates?',
        url: 'https://reddit.com/r/projectmanagement/1',
        logo: 'reddit',
        place: 'r/projectmanagement',
        subreddit: 'projectmanagement',
        date: '2026-11-10',
      },
      {
        title: 'Show HN: a board digest',
        logo: 'hackernews',
        place: 'Hacker News',
        heat: { key: 'growth.heat.points', params: { 0: 312 } },
        date: '2026-11-07',
      },
    ]);
  });
});
