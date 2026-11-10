// @ts-nocheck
import { expect, test } from 'vitest';
import * as growth from '../../server/nocoreach/growth-signals.js';
import { markQuestions } from '../../server/nocoreach/ai-questions.js';
import { searchSignals } from '../../server/nocoreach/signals.js';
import { EVIDENCE_ROWS, growthOf } from '../../shared/growth.js';

// Growth points (2026-11-10): Opportunities lists only growth, each with its size and the rows behind it, computed here.

const DEFAULTS = {
  'gsc-new-query': { minImpressions: 50, risePct: 200, minQueries: 2 },
  'keyword-demand': { minKeywords: 3, minVolume: 500 },
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

test('near page one and low CTR carry their growth; a click drop is left to Insights', () => {
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
  const drop = s.find((x) => x.key === 'gsc-click-drop:/d');
  expect(drop.actionable).toBe(false);
  expect(drop.growth).toBeUndefined();
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
  expect(far.growth.figures[3].value).toBe(growth.extraClicks(2000, 3, 0.001));
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
  expect(g.area).toBe('keywords');
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
    stars: {
      'new/board': { '2026-11-10': 900 },
      'acme/acme': { '2026-11-10': 5000 },
      'old/board': { '2026-11-10': 4000 },
      'tiny/board': { '2026-11-10': 30 },
    },
  };
  const s = growth.newRepoSignals({ ght, gh: { repo: 'acme/acme' }, now, V });
  expect(s.map((x) => x.key)).toEqual(['github-new-repo:new/board']);
  expect(s[0].growth.figures.map((f) => f.value)).toEqual([
    900,
    1,
    '2026-11-06T10:00:00Z',
    'TypeScript',
  ]);
  expect(s[0].growth.evidence.rows[0]).toMatchObject({
    repository: 'new/board',
    stars: 900,
  });
});

test('a stored growth is trusted only with a known kind and figures; the model reads its figures as text', () => {
  expect(growthOf({ kind: 'demand-gap', figures: [] })).toBeUndefined();
  expect(
    growthOf({ kind: 'made-up', figures: [{ label: { key: 'x' }, value: 1 }] }),
  ).toBeUndefined();
  expect(
    growthOf({
      kind: 'uncited',
      area: 'keywords',
      figures: [{ label: { key: 'x' }, value: 1 }],
    })?.area,
  ).toBe('ai-search');
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
});
