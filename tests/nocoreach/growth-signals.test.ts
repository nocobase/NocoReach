// @ts-nocheck
import { expect, test } from 'vitest';
import * as growth from '../../server/nocoreach/growth-signals.js';
import { markQuestions } from '../../server/nocoreach/ai-questions.js';
import { searchSignals } from '../../server/nocoreach/signals.js';
import {
  EVIDENCE_ROWS,
  growthOf,
  newPageOf,
  roundEstimate,
} from '../../shared/growth.js';

// Growth points (2026-11-10): Opportunities lists only growth, each with its size and the rows behind it, computed here.

const DEFAULTS = {
  'gsc-new-query': { minImpressions: 50, risePct: 200, minQueries: 2 },
  'keyword-demand': { minKeywords: 3, minVolume: 500, risingPct: 50 },
  'keyword-rising': { changePct: 50, minVolume: 300 },
  'competitor-gap': { minKeywords: 3, minVolume: 300 },
  'ai-missing': { minQuestions: 2 },
  'ai-cited': { minCitations: 2 },
  'github-new-repo': { minStars: 200 },
};
const V = (rule, key) => DEFAULTS[rule][key];
const keys = (g) =>
  g.figures.map((f) => f.label.key.replace('growth.figure.', ''));

test('the click-through curve is the cited one, and estimates are impressions × (target CTR − CTR now)', () => {
  expect(growth.CTR_BY_POSITION).toHaveLength(10);
  expect(growth.expectedCtr(1)).toBe(0.276);
  expect(growth.expectedCtr(10)).toBe(0.024);
  expect(growth.expectedCtr(12)).toBe(0);
  expect(growth.expectedCtr(2.5)).toBeCloseTo((0.158 + 0.11) / 2);
  // 2,000 impressions at 1% CTR; position 3 usually gets 11%: 200 more clicks in 28 days, 217 in a month.
  expect(growth.extraClicks(2000, 3, 0.01)).toBe(
    Math.round(2000 * 0.1 * (30.4 / 28)),
  );
  expect(growth.extraClicks(2000, 3, 0.2)).toBe(0);
  expect(growth.extraVisits(1000, 3, null)).toBe(110);
  expect(growth.extraVisits(1000, 3, 8)).toBe(
    Math.round(1000 * (0.11 - 0.033)),
  );
});

test('near page one, low CTR and a click drop carry their growth', () => {
  const rows = [
    {
      page: 'https://ex.com/a',
      keyword: 'a1',
      clicks: 2,
      impressions: 2000,
      previous: 3,
      position: 15,
    },
    {
      page: 'https://ex.com/b',
      keyword: 'b1',
      clicks: 60,
      impressions: 1000,
      previous: 50,
      position: 4,
    },
    {
      page: 'https://ex.com/c',
      keyword: 'c1',
      clicks: 50,
      impressions: 900,
      previous: 40,
      position: 3,
    },
    {
      page: 'https://ex.com/d',
      keyword: 'd1',
      clicks: 5,
      impressions: 400,
      previous: 40,
      position: 9,
    },
  ];
  const s = searchSignals({ queries: rows, history: [], end: '2026-09-27' });
  // A page that lost clicks can win them back (2026-11-10): Content optimization, what it lost a month.
  const drop = s.find((x) => x.key === 'gsc-click-drop:/d');
  expect(drop.actionable).toBe(true);
  expect(drop.growth).toMatchObject({
    kind: 'click-drop',
    category: 'optimize',
  });
  expect(keys(drop.growth)).toEqual([
    'clicks28',
    'impressions28',
    'averagePosition',
    'recoverClicks',
  ]);
  expect(drop.growth.figures[3]).toMatchObject({
    value: roundEstimate(35 * (30.4 / 28)),
    estimate: true,
  });
  expect(drop.growth.evidence.rows[0]).toMatchObject({
    query: 'd1',
    clicks: 5,
    previousClicks: 40,
    clickChange: -35,
  });
  const near = s.find((x) => x.key === 'gsc-near-first:/d');
  expect(near.growth.kind).toBe('near-first');
  expect(keys(near.growth)).toEqual([
    'impressions28',
    'averagePosition',
    'clicks28',
    'topExtraClicks',
  ]);
  const gain = growth.extraClicks(400, 3, 5 / 400);
  expect(near.growth.figures[3]).toMatchObject({
    value: gain,
    estimate: true,
    label: { params: { 0: 3 } },
  });
  expect(near.actionable).toBe(gain >= 20);
  expect(near.growth.evidence).toMatchObject({
    total: 1,
    unit: 'growth.unit.queries',
    link: '/seo-opportunities',
  });
  expect(near.growth.evidence.rows[0]).toMatchObject({
    query: 'd1',
    impressions: 400,
    clicks: 5,
  });
  // Page /a at position 15 is past page one: reaching the top 3 is worth its impressions at 11%.
  const far = s.find((x) => x.key === 'gsc-near-first:/a');
  expect(far.actionable).toBe(true);
  // Shown to two significant figures: an estimate is not that precise (237 reads 240).
  expect(far.growth.figures[3].value).toBe(
    roundEstimate(growth.extraClicks(2000, 3, 0.001)),
  );
  expect(far.growth.figures[3].value).toBe(240);
  expect(far.facts.at(-1)).toContain('240');
  const low = s.find((x) => x.key === 'gsc-low-ctr:/a');
  expect(low.growth.kind).toBe('low-ctr');
  expect(keys(low.growth)).toEqual([
    'impressions28',
    'ctr',
    'usualCtr',
    'snippetExtraClicks',
  ]);
});

test('new searches: queries a page started to show for, with their earlier impressions', () => {
  const q = (
    keyword,
    impressions,
    previousImpressions,
    position = 7,
    clicks = 1,
  ) => ({
    page: 'https://ex.com/docs/x',
    keyword,
    impressions,
    previousImpressions,
    position,
    clicks,
  });
  const s = growth.newQuerySignals({
    queries: [
      q('fresh one', 300, 0),
      q('tripled', 240, 60),
      q('steady', 500, 450),
      q('too few', 20, 0),
    ],
    identity: null,
    canonical: (u) => u,
    V,
  });
  expect(s.map((x) => x.key)).toEqual(['gsc-new-query:/docs/x']);
  const g = s[0].growth;
  expect(g.kind).toBe('new-query');
  expect(g.figures[0]).toMatchObject({
    value: 2,
    detail: { key: 'growth.detail.newSince', params: { 0: 1 } },
  });
  expect(g.evidence.rows.map((r) => [r.query, r.previousImpressions])).toEqual([
    ['fresh one', 0],
    ['tripled', 60],
  ]);
  expect(g.evidence.columns.map((c) => c.key)).toEqual([
    'query',
    'impressions',
    'previousImpressions',
    'position',
    'clicks',
  ]);
});

const ks = {
  version: 2,
  items: [
    ...Array.from({ length: 12 }, (_, i) => ({
      keyword: `Gantt ${i}`,
      group: 'Use cases',
      metrics: { volume: 1000 - i * 50, difficulty: 20 + i },
      site: i === 0 ? { position: 45 } : null,
    })),
    {
      keyword: 'ranked',
      group: 'Use cases',
      metrics: { volume: 5000, difficulty: 10 },
      site: { position: 6 },
    },
    { keyword: 'small 1', group: 'Tiny', metrics: { volume: 100 } },
    { keyword: 'small 2', group: 'Tiny', metrics: { volume: 100 } },
    { keyword: 'small 3', group: 'Tiny', metrics: { volume: 100 } },
  ],
  digs: [
    {
      id: 7,
      name: 'Migration',
      items: [1, 2, 3].map((i) => ({
        keyword: `migrate ${i}`,
        metrics: { volume: 400 },
      })),
    },
  ],
};
const cr = {
  market: { locationCode: 2840, language: 'en' },
  domains: {
    'nimbus.example': {
      market: '2840|en',
      gap: [
        {
          keyword: 'gantt 0',
          volume: 950,
          difficulty: 30,
          position: 4,
          url: 'https://nimbus.example/gantt',
        },
        {
          keyword: 'client portal',
          volume: 900,
          difficulty: 30,
          position: 3,
          url: 'https://nimbus.example/portal',
        },
        {
          keyword: 'client access',
          volume: 400,
          difficulty: 25,
          position: 6,
          url: 'https://nimbus.example/portal/',
        },
        {
          keyword: 'share with clients',
          volume: 300,
          difficulty: 20,
          position: 12,
          url: 'https://nimbus.example/portal',
        },
        {
          keyword: 'nimbus login',
          volume: 9000,
          difficulty: 5,
          position: 1,
          url: 'https://nimbus.example/login',
        },
      ],
      pages: [{ url: 'https://nimbus.example/portal', traffic: 2400 }],
    },
  },
};
const cw = { list: [{ name: 'Nimbus', site: 'https://nimbus.example' }] };

test('demand without a page: one per AI suggestion group, with what the top 3 would bring and who ranks', () => {
  const gaps = growth.competitorGaps({ cr, cw });
  const s = growth.demandSignals({ ks, gaps, V });
  expect(s.map((x) => x.key).sort()).toEqual([
    'keyword-demand:Use cases',
    'keyword-demand:dig-7',
  ]);
  const g = s.find((x) => x.key === 'keyword-demand:Use cases').growth;
  expect(g.kind).toBe('demand-gap');
  expect(g.category).toBe('new-content');
  const volumes = Array.from({ length: 12 }, (_, i) => 1000 - i * 50);
  const volume = volumes.reduce((a, b) => a + b, 0);
  const gain = volumes.reduce((t, v) => t + growth.extraVisits(v, 3, null), 0);
  expect(g.figures.map((f) => f.value)).toEqual([volume, 0, 26, gain]);
  expect(g.figures[2].detail.key).toBe('growth.level.easy');
  expect(g.evidence.rows).toHaveLength(EVIDENCE_ROWS);
  expect(g.evidence.total).toBe(12);
  expect(g.evidence.rows[0]).toMatchObject({
    keyword: 'Gantt 0',
    ourPosition: 45,
    rivalsTop10: [{ name: 'Nimbus', rank: 4 }],
  });
  expect(
    s.find((x) => x.key === 'keyword-demand:dig-7').growth.evidence.link,
  ).toBe('/keywords?tab=suggest&group=7');
});

test('competitors have it, we do not: a competitor page with several keywords, its traffic, never brand words', () => {
  const gaps = growth.competitorGaps({ cr, cw });
  expect(gaps[0].gap.map((x) => x.keyword)).not.toContain('nimbus login');
  const s = growth.competitorGapSignals({ gaps, V });
  expect(s.map((x) => x.key)).toEqual(['competitor-gap:nimbus.example/portal']);
  const g = s[0].growth;
  expect(g.figures[0]).toMatchObject({
    value: 2400,
    estimate: true,
    label: { params: { 0: 'Nimbus' } },
  });
  expect(g.figures[1].value).toBe(1600);
  expect(g.evidence.rows.map((r) => r.rivalPosition)).toEqual([3, 6, 12]);
  // A competitor kept for another market is not compared.
  expect(
    growth.competitorGaps({
      cr: { ...cr, market: { locationCode: 2826, language: 'en' } },
      cw,
    }),
  ).toEqual([]);
});

test('not mentioned and cited sources come from the AI answers that name others and not us', () => {
  const item = (question, brands, sources, volume = 100, answer = '') => ({
    question,
    volume,
    answer,
    brands,
    sources: sources.map((d) => ({
      domain: d,
      url: `https://${d}/top-tools`,
      title: `Top tools on ${d}`,
    })),
  });
  const s = {
    topics: [{ id: 't1', keyword: 'team collaboration' }],
    results: {
      t1: {
        chat_gpt: {
          items: [
            item(
              'best tools?',
              ['Nimbus', 'Flowboard'],
              ['reviews.example', 'nimbus.example'],
            ),
            item(
              'for agencies?',
              ['Nimbus'],
              ['reviews.example', 'forum.example'],
              300,
            ),
            item('acme any good?', ['Acme'], ['acme.example']),
          ],
        },
        google: {
          items: [item('free tools?', ['Flowboard'], ['reviews.example'], 50)],
        },
      },
    },
  };
  const aq = markQuestions(s, {
    own: ['acme.example'],
    name: 'Acme',
    rivals: [{ name: 'Nimbus', site: 'nimbus.example' }],
  });
  const missing = growth.aiMissingSignals({ aq, name: 'Acme', V });
  expect(missing.map((x) => x.key)).toEqual(['ai-missing:team collaboration']);
  const g = missing[0].growth;
  expect(g.kind).toBe('not-mentioned');
  expect(g.figures.map((f) => f.value)).toEqual([
    4,
    3,
    1,
    'reviews.example · forum.example',
  ]);
  expect(g.figures[0].detail).toEqual({
    key: 'growth.detail.platformSplit',
    params: { 0: 3, 1: 1 },
  });
  expect(g.evidence.rows[0]).toMatchObject({
    question: 'for agencies?',
    platform: 'chat_gpt',
    named: ['Nimbus'],
  });
  // The evidence counts every related question, as View all on AI search lists them; ours come last.
  expect(g.evidence.total).toBe(4);
  expect(g.evidence.rows.at(-1).question).toBe('acme any good?');
  const cited = growth.aiCitedSignals({ aq, V });
  expect(cited.map((x) => x.key)).toEqual(['ai-cited:team collaboration']);
  // The competitor's own site is not a source to get into.
  expect(cited[0].growth.evidence.rows.map((r) => r.domain)).toEqual([
    'reviews.example',
  ]);
  expect(cited[0].growth.figures[1].value).toBe(3);
});

test('new popular projects: the most starred new repository of a followed topic, never our own', () => {
  const now = Date.parse('2026-11-10T00:00:00Z');
  const ght = {
    lastRun: { day: '2026-11-10' },
    topics: ['kanban'],
    topicNew: { kanban: ['new/board', 'acme/acme', 'old/board', 'tiny/board'] },
    repos: {
      'new/board': {
        createdAt: '2026-11-06T10:00:00Z',
        language: 'TypeScript',
        url: 'https://github.com/new/board',
      },
      'acme/acme': { createdAt: '2026-11-07T10:00:00Z' },
      'old/board': { createdAt: '2026-09-01T10:00:00Z' },
      'tiny/board': { createdAt: '2026-11-08T10:00:00Z' },
    },
    heat: { kanban: { '2026-11-10': { total: 18400 } } },
    stars: {
      'new/board': { '2026-11-10': 900 },
      'acme/acme': { '2026-11-10': 5000 },
      'old/board': { '2026-11-10': 4000 },
      'tiny/board': { '2026-11-10': 30 },
    },
  };
  const s = growth.newRepoSignals({ ght, gh: { repo: 'acme/acme' }, now, V });
  expect(s.map((x) => x.key)).toEqual(['github-new-repo:new/board']);
  // The size of the chance: stars, rank among the topic's new repositories, the topic and its size; when it was
  // created and its language stay in the evidence.
  expect(s[0].growth.figures.map((f) => f.value)).toEqual([
    900,
    1,
    'kanban',
    18400,
  ]);
  expect(s[0].growth.figures[1].detail).toEqual({
    key: 'growth.detail.ofNewRepositories',
    params: { 0: 2 },
  });
  expect(s[0].growth.evidence.rows[0]).toMatchObject({
    repository: 'new/board',
    stars: 900,
    created: '2026-11-06T10:00:00Z',
    language: 'TypeScript',
  });
});

test('a stored growth is trusted only with a known kind and figures; the model reads its figures as text', () => {
  expect(growthOf({ kind: 'demand-gap', figures: [] })).toBeUndefined();
  expect(
    growthOf({ kind: 'made-up', figures: [{ label: { key: 'x' }, value: 1 }] }),
  ).toBeUndefined();
  // An old stored growth has an area and no category: the category follows its kind.
  expect(
    growthOf({
      kind: 'uncited',
      area: 'keywords',
      figures: [{ label: { key: 'x' }, value: 1 }],
    }),
  ).toMatchObject({ kind: 'uncited', category: 'optimize' });
  expect(
    growthOf({
      kind: 'demand-gap',
      category: 'trending',
      figures: [{ label: { key: 'x' }, value: 1 }],
    })?.category,
  ).toBe('trending');
  expect(
    growthOf({
      kind: 'demand-gap',
      category: 'made-up',
      figures: [{ label: { key: 'x' }, value: 1 }],
    })?.category,
  ).toBe('new-content');
  const model = growth.growthForModel({
    kind: 'near-first',
    figures: [
      {
        label: { key: 'growth.figure.topExtraClicks', params: { 0: 3 } },
        value: 1100,
        detail: { key: 'growth.detail.clicks' },
        estimate: true,
      },
    ],
    evidence: { total: 14 },
  });
  expect(model).toEqual({
    kind: 'near-first',
    category: 'optimize',
    figures: ['进前 3 预计每月多 1,100 次点击'],
    evidenceRows: 14,
  });
});

test('every new growth point has an analysis rule with adjustable thresholds', async () => {
  const { RULES, ruleOf, resolver } =
    await import('../../server/nocoreach/analysis-rules.js');
  const rules = {
    'gsc-new-query:/docs/x': 'gsc-new-query',
    'keyword-demand:Use cases': 'keyword-demand',
    'keyword-rising:gantt chart': 'keyword-rising',
    'competitor-gap:nimbus.example/portal': 'competitor-gap',
    'ai-missing:team collaboration': 'ai-missing',
    'ai-cited:team collaboration': 'ai-cited',
    'github-new-repo:new/board': 'github-new-repo',
    'rank-page:/docs/permissions': 'rank',
    'ai-dropped:chat_gpt': 'ai-dropped',
  };
  for (const [key, id] of Object.entries(rules)) {
    expect(ruleOf(key)).toBe(id);
    const rule = RULES.find((r) => r.id === id);
    expect(rule.params.length).toBeGreaterThan(0);
    for (const p of rule.params)
      expect(p.default).toBeGreaterThanOrEqual(p.min);
  }
  // Below the least extra clicks set in Settings › Analysis rules, near page one is not a growth point.
  const near = RULES.find((r) => r.id === 'gsc-near-first');
  expect(near.params.map((p) => p.key)).toEqual(
    expect.arrayContaining(['targetPos', 'minGain']),
  );
  const set = resolver(
    { rules: { 'gsc-near-first': { values: { minGain: 500 } } } },
    RULES,
  );
  expect(set.value('gsc-near-first', 'minGain')).toBe(500);
  expect(resolver({}, RULES).value('gsc-near-first', 'minGain')).toBe(20);
  // The content optimization opportunities (2026-11-10) have their least gain or traffic, and Trending now its rise.
  for (const [id, key] of [
    ['gsc-click-drop', 'minGain'],
    ['rank', 'minGain'],
    ['site-stale', 'minViews'],
    ['site-thin', 'minViews'],
    ['audit', 'minClicks'],
    ['ai-dropped', 'minQuestions'],
    ['keyword-demand', 'risingPct'],
  ])
    expect(resolver({}, RULES).value(id, key)).toBeGreaterThan(0);
});

test('estimates read to two significant figures; counted numbers are left alone', () => {
  expect(
    [1073, 211, 279, 125, 342, 47, 8, 0, 18_450].map(roundEstimate),
  ).toEqual([1100, 210, 280, 130, 340, 47, 8, 0, 18_000]);
});

test('a new page keeps a section and up to three pages to link from, as paths', () => {
  expect(
    newPageOf({
      section: 'https://acme.example/blog/',
      linkFrom: [
        '/features/timeline',
        'https://acme.example/templates',
        '/features/timeline',
        'not a page',
        '/blog/',
        '/docs/a',
        '/docs/b',
      ],
    }),
  ).toEqual({
    section: '/blog/',
    linkFrom: ['/features/timeline', '/templates', '/docs/a'],
  });
  expect(newPageOf({ section: 'somewhere', linkFrom: ['/a'] })).toBeNull();
  expect(newPageOf('/blog/')).toBeNull();
});

test('a rising keyword counts as often as it is searched now, the last three months', () => {
  const months = [
    400, 420, 410, 430, 400, 420, 600, 700, 800, 1200, 1400, 1600,
  ].map((volume, i) => ({ year: 2026, month: i + 1, volume }));
  const s = growth.risingKeywordSignals({
    ks: {
      version: 2,
      items: [
        {
          keyword: 'ai planning',
          group: 'AI',
          metrics: { volume: 700, monthlySearches: months },
        },
      ],
    },
    gaps: [],
    V,
  });
  expect(s.map((x) => x.key)).toEqual(['keyword-rising:ai planning']);
  const g = s[0].growth;
  // Now 1,400 a month against 700 the three months before; the yearly average (700) would understate it.
  expect(g.figures[0].value).toBe(1400);
  expect(g.figures[3].value).toBe(
    roundEstimate(growth.extraVisits(1400, 3, null)),
  );
});

// --- Four categories and content optimization (2026-11-10) ---------------------------------------------------------

test('every kind has one of the four categories', async () => {
  const { GROWTH_KINDS, GROWTH_CATEGORIES } =
    await import('../../shared/growth.js');
  expect(GROWTH_CATEGORIES).toEqual([
    'trending',
    'new-content',
    'competitor-gaps',
    'optimize',
  ]);
  const by = (c) =>
    Object.entries(GROWTH_KINDS)
      .filter(([, x]) => x === c)
      .map(([k]) => k);
  expect(by('trending')).toEqual([
    'rising',
    'new-query',
    'topic-heat',
    'new-repo',
  ]);
  expect(by('new-content')).toEqual(['demand-gap']);
  expect(by('competitor-gaps')).toEqual([
    'competitor-gap',
    'not-mentioned',
    'cited-sources',
    'competitor-launch',
  ]);
  expect(by('optimize')).toEqual([
    'near-first',
    'low-ctr',
    'uncited',
    'rank-drop',
    'click-drop',
    'stale-page',
    'thin-page',
    'ai-dropped',
    'page-issue',
  ]);
});

test('searched and not written goes to Trending now when the last 3 months clearly rose, else New content', () => {
  const months = (before, last) =>
    Array.from({ length: 12 }, (_, i) => ({
      year: 2026,
      month: i + 1,
      volume: i >= 9 ? last : before,
    }));
  const group = (monthlySearches) => ({
    version: 2,
    items: [1, 2, 3].map((i) => ({
      keyword: `ai pm ${i}`,
      group: 'AI',
      metrics: { volume: 400, difficulty: 30, monthlySearches },
    })),
  });
  const gaps = growth.competitorGaps({ cr, cw });
  const [up] = growth.demandSignals({ ks: group(months(200, 400)), gaps, V });
  expect(up.growth).toMatchObject({ kind: 'demand-gap', category: 'trending' });
  expect(keys(up.growth)).toEqual([
    'monthlySearchesTotal',
    'ranking',
    'threeMonthChange',
    'topExtraVisits',
  ]);
  expect(up.growth.figures[2]).toMatchObject({ value: 1, format: 'change' });
  // A rise under the rule's threshold, or fewer than 12 months to tell by, stays New content.
  const [flat] = growth.demandSignals({ ks: group(months(300, 400)), gaps, V });
  expect(flat.growth.category).toBe('new-content');
  const [short] = growth.demandSignals({
    ks: group(months(200, 400).slice(-6)),
    gaps,
    V,
  });
  expect(short.growth.category).toBe('new-content');
});

test('a page that fell in tracked rankings: the clicks it can win back, each keyword and the sites now above it', () => {
  const page = 'https://ex.com/docs/permissions';
  const g = growth.rankDropGrowth({
    keywords: [
      { keyword: 'permissions', before: 2, now: 6, ahead: ['nimbus.example'] },
      { keyword: 'guest access', before: 1, now: null, ahead: ['a.example'] },
      { keyword: 'roles', before: 4, now: 11, ahead: [] },
    ],
    page: { clicks: 400, previous: 1000 },
    rows: [
      { keyword: 'permissions', page, clicks: 300, previous: 700 },
      { keyword: 'roles', page, clicks: 100, previous: 300 },
    ],
    path: '/docs/permissions',
    volumes: new Map([['permissions', 1300]]),
  });
  expect(g.gain).toBeCloseTo(600 * (30.4 / 28));
  expect(g.growth).toMatchObject({ kind: 'rank-drop', category: 'optimize' });
  expect(keys(g.growth)).toEqual([
    'clicks28',
    'averagePosition',
    'outOfTop3',
    'recoverClicks',
  ]);
  // Out of the top 100 reads as 100 in the average and "100+" in the table.
  expect(g.growth.figures[1].value).toBe(39);
  expect(g.growth.figures[2].value).toBe(2);
  expect(g.growth.figures[3].value).toBe(650);
  expect(g.growth.evidence.columns.map((c) => c.key)).toEqual([
    'keyword',
    'volume',
    'position',
    'clickChange',
    'ahead',
  ]);
  // The former position shows after the present one ("11 ← 4").
  expect(g.growth.evidence.columns[2]).toMatchObject({
    format: 'position',
    from: 'previousPosition',
  });
  expect(g.growth.evidence.rows[0]).toMatchObject({
    keyword: 'guest access',
    position: '100+',
    previousPosition: 1,
    clickChange: null,
  });
  expect(
    g.growth.evidence.rows.find((r) => r.keyword === 'permissions'),
  ).toMatchObject({
    volume: 1300,
    clickChange: -400,
    ahead: ['nimbus.example'],
  });
  // Without Search Console figures for the page, what the keywords' searches bring at the former positions.
  const byKeywords = growth.rankDropGrowth({
    keywords: [{ keyword: 'permissions', before: 2, now: 6, ahead: [] }],
    page: null,
    rows: [],
    path: '/docs/permissions',
    volumes: new Map([['permissions', 1300]]),
  });
  expect(byKeywords.gain).toBeCloseTo(
    1300 * (growth.expectedCtr(2) - growth.expectedCtr(6)),
  );
});

test('rank tracking: a page that fell for its keywords is one opportunity, and its click drop is not offered again', async () => {
  const { computeAll } = await import('../../server/nocoreach/signals.js');
  const url = 'https://ex.com/docs/permissions';
  const check = (position) => ({ at: '2026-11-01', position, url });
  const input = {
    now: Date.parse('2026-11-10'),
    queries: [
      {
        page: url,
        keyword: 'permissions',
        clicks: 300,
        impressions: 9000,
        previous: 900,
        position: 6,
      },
    ],
    rt: {
      keywords: [
        { id: 'k1', keyword: 'permissions' },
        { id: 'k2', keyword: 'roles' },
      ],
      checks: { k1: [check(2), check(8)], k2: [check(3), check(5)] },
      serps: {
        k1: [
          { position: 1, domain: 'www.nimbus.example' },
          { position: 4, domain: 'saas-review.example' },
          { position: 9, domain: 'late.example' },
        ],
      },
    },
  };
  const { ranked } = computeAll(input, {});
  const fell = ranked.find((s) => s.key === 'rank-page:/docs/permissions');
  expect(fell).toMatchObject({ actionable: true, action: 'optimize' });
  expect(fell.growth.kind).toBe('rank-drop');
  expect(fell.growth.evidence.rows.map((r) => r.keyword)).toEqual([
    'permissions',
    'roles',
  ]);
  expect(fell.growth.evidence.rows[0].ahead).toEqual([
    'nimbus.example',
    'saas-review.example',
  ]);
  const drop = ranked.find((s) => s.key === 'gsc-click-drop:/docs/permissions');
  expect(drop.actionable).toBe(false);
  expect(drop.growth).toBeUndefined();
});

test('outdated and thin pages are opportunities only with the visits the rule asks for', async () => {
  const { computeAll } = await import('../../server/nocoreach/signals.js');
  const page = (path, extra) => ({
    url: `https://ex.com${path}`,
    title: path,
    type: 'docs',
    fetchedAt: '2026-11-01',
    words: 900,
    ...extra,
  });
  const input = {
    now: Date.parse('2026-11-10'),
    site: {
      pages: [
        page('/docs/old', { lastmod: '2025-06-01' }),
        page('/docs/quiet', { lastmod: '2025-06-01' }),
        page('/docs/short', { lastmod: '2026-10-01', words: 80 }),
      ],
    },
    pages: [
      { page: 'https://ex.com/docs/old', sessions: 1660, views: 2000 },
      { page: 'https://ex.com/docs/quiet', sessions: 40, views: 60 },
      { page: 'https://ex.com/docs/short', sessions: 300, views: 320 },
    ],
    queries: [
      {
        page: 'https://ex.com/docs/old',
        keyword: 'old guide',
        clicks: 400,
        impressions: 6000,
        previous: 380,
        position: 4,
      },
    ],
  };
  const { ranked } = computeAll(input, {});
  const old = ranked.find((s) => s.key === 'site-stale:/docs/old');
  expect(old.actionable).toBe(true);
  expect(old.growth).toMatchObject({
    kind: 'stale-page',
    category: 'optimize',
  });
  expect(keys(old.growth)).toEqual([
    'monthlyVisits',
    'lastUpdated',
    'clicks28',
    'impressions28',
  ]);
  expect(old.growth.figures[0].value).toBe(roundEstimate(1660 * (30.4 / 28)));
  expect(old.growth.evidence.rows[0].query).toBe('old guide');
  const quiet = ranked.find((s) => s.key === 'site-stale:/docs/quiet');
  expect(quiet?.actionable ?? false).toBe(false);
  const short = ranked.find((s) => s.key === 'site-thin:/docs/short');
  expect(short.actionable).toBe(true);
  expect(keys(short.growth)).toEqual(['monthlyVisits', 'bodyWords']);
  expect(short.growth.figures[1].value).toBe(80);
});

test("AI answers that stopped naming us: the questions of the lookup before, past the sample's cut-off", () => {
  const q = (question, volume) => ({
    question,
    volume,
    sources: [{ domain: 'nimbus.example' }],
  });
  const before = [q('a', 900), q('b', 500), q('c', 300), q('d', 40)];
  // The newer lookup is as full: "d" is searched less than its least, so it may only have been pushed out.
  const now = [q('a', 900), q('e', 200), q('f', 100), q('g', 80)];
  expect(growth.aiDropped(before, now).map((x) => x.question)).toEqual([
    'b',
    'c',
  ]);
  const g = growth.aiDroppedGrowth({
    platform: 'chat_gpt',
    dropped: growth.aiDropped(before, now),
    before: 4,
    after: 4,
    at: '2026-10-09T08:00:00Z',
  });
  expect(g).toMatchObject({ kind: 'ai-dropped', category: 'optimize' });
  expect(keys(g)).toEqual([
    'droppedQuestions',
    'mentionedBefore',
    'mentionedNow',
    'aiSearches',
  ]);
  expect(g.figures[0].value).toBe(2);
  expect(g.figures[1].detail).toEqual({
    key: 'growth.detail.onDay',
    params: { 0: '10-09' },
  });
  expect(g.figures[3].value).toBe(800);
  expect(g.evidence.rows[0]).toMatchObject({
    question: 'b',
    platform: 'chat_gpt',
    aiVolume: 500,
    cited: ['nimbus.example'],
  });
});

test('a site audit issue counts the pages with search clicks, and what they get a month', () => {
  const { gain, growth: g } = growth.pageIssueGrowth({
    issue: 'Duplicate title',
    pages: [
      {
        path: '/t/a',
        url: 'https://ex.com/t/a',
        clicks: 620,
        impressions: 9800,
        position: 4.6,
      },
      {
        path: '/t/b',
        url: 'https://ex.com/t/b',
        clicks: 280,
        impressions: 5100,
        position: 7.94,
      },
    ],
    total: 7,
  });
  expect(gain).toBeCloseTo(900 * (30.4 / 28));
  expect(g).toMatchObject({ kind: 'page-issue', category: 'optimize' });
  expect(g.figures.map((f) => f.value)).toEqual([
    'Duplicate title',
    2,
    roundEstimate(900 * (30.4 / 28)),
    14900,
  ]);
  expect(g.figures[1].detail).toEqual({
    key: 'growth.detail.ofPages',
    params: { 0: 7 },
  });
  expect(g.evidence.rows.map((r) => [r.page, r.position])).toEqual([
    ['/t/a', 4.6],
    ['/t/b', 7.9],
  ]);
});
