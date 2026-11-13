// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
  hotAway,
  hotDiscussions,
  hotHeadline,
  hotRows,
  isHot,
  libraryOrder,
} from '../../shared/workshop-recommend.js';
import { rowsFor } from '../../shared/strategy-pending.js';
import { GROWTH_KINDS } from '../../shared/growth.js';

// Content workshop homepage v5 (2026-11-13, ui-references/content-workshop-2026-11-12/brief-v5.md): Trending now from
// Opportunities' live Trending now opportunities, leaving once handled in the workshop; Library's order.

describe('Library', () => {
  it('lists the newest published first, then articles without a date by clicks', () => {
    const rows = [
      { title: 'b', clicks30: 300 },
      { title: 'old', published: '2025-06-10', clicks30: 700 },
      { title: 'new', published: '2026-11-04', clicks30: 5 },
      { title: 'a', clicks30: 300 },
      { title: 'c', clicks30: null },
      { title: 'mid', published: '2026-03-18', clicks30: null },
    ];
    expect([...rows].sort(libraryOrder).map((r) => r.title)).toEqual([
      'new',
      'mid',
      'old',
      'a',
      'b',
      'c',
    ]);
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

  it('leaves the workshop once adapted or skipped there, or after 7 days without being found', () => {
    const s = state();
    const row = (id) => rowsFor(s).find((r) => r.card.id === id);
    const none = { adapted: false, skipped: false };
    expect(hotAway(row('o1'), s, none)).toBeNull();
    expect(hotAway(row('o1'), s, { ...none, adapted: true })).toBe('adapted');
    expect(hotAway(row('o1'), s, { ...none, skipped: true })).toBe('skipped');
    // o7 was last found 16 days before the latest analysis (and is gone from Opportunities too); a batch 6 days before
    // keeps it listed, 7 days takes it off the workshop while Opportunities keeps it.
    s.insightHistory[1].generatedAt = '2026-11-07T06:00:00Z';
    expect(hotAway(row('o7'), s, none)).toBeNull();
    s.insightHistory[1].generatedAt = '2026-11-06T06:00:00Z';
    expect(hotAway(row('o7'), s, none)).toBe('stale');
    expect(isHot(row('o7'), s, of)).toBe(true);
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
