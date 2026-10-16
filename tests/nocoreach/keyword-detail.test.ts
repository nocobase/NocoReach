// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { KeywordDetail, kinds } from '../../server/nocoreach/keyword-detail.js';

const row = (keyword, extra = {}) => ({
  keyword,
  keyword_info: {
    search_volume: 1600,
    cpc: 29.88,
    competition: 0.32,
    competition_level: 'LOW',
    search_volume_trend: { monthly: 0, quarterly: 26, yearly: 50 },
    monthly_searches: [
      { year: 2026, month: 8, search_volume: 2400 },
      { year: 2025, month: 9, search_volume: 1600 },
    ],
  },
  keyword_properties: { keyword_difficulty: 55, core_keyword: 'crm' },
  search_intent_info: { main_intent: 'commercial' },
  serp_info: {
    serp_item_types: ['organic', 'ai_overview', 'people_also_ask', 'paid'],
    se_results_count: 141000,
  },
  avg_backlinks_info: { referring_main_domains: 120.4, backlinks: 5000 },
  ...extra,
});
const reply = (items) => ({
  status_code: 20000,
  cost: 0.01,
  tasks: [{ status_code: 20000, result: [{ items }] }],
});

function setup({ connected = true, tracked = false, runs = {} } = {}) {
  const lookups = [],
    stored = [];
  const p = {
    db: {
      getRepository: () => ({
        findOne: async ({ filter }) =>
          filter.id === 'run-7'
            ? {
                get: () => ({
                  items: Array.from({ length: 12 }, (_, i) => ({
                    position: i + 1,
                    domain: i === 6 ? 'www.nocobase.com' : `site${i}.com`,
                    url: `https://site${i}.com/p`,
                    title: `T${i}`,
                  })),
                }),
              }
            : null,
      }),
    },
    project: async () => ({ id: 1, domains: ['nocobase.com'] }),
    rankTracking: {
      state: async () =>
        tracked
          ? {
              keywords: [
                {
                  id: 'k1',
                  keyword: 'Open Source CRM',
                  locationCode: 2840,
                  language: 'en',
                  addedAt: '2026-10-10T00:00:00Z',
                },
              ],
              checks: {
                k1: [
                  {
                    at: '2026-10-15T00:00:00Z',
                    position: 7,
                    url: 'https://www.nocobase.com/en/blog/crm',
                    runId: 'run-7',
                  },
                ],
              },
            }
          : null,
    },
    keywordService: {
      saved: async () => ({
        tags: [],
        items: [
          {
            id: 's1',
            keyword: 'open source crm',
            source: 'ai',
            market: { locationCode: 2840, language: 'en' },
            metrics: null,
            tagIds: ['t1'],
            savedAt: '2026-10-14T00:00:00Z',
          },
        ],
      }),
      store: async (id, entries) => {
        stored.push(...entries);
        return { saved: entries.length, skipped: 0 };
      },
    },
    dataViews: {
      pairRows: async () => ({
        connected: true,
        cutoff: '2026-10-12',
        window: { start: '2026-09-15', end: '2026-10-12' },
        rows: [
          {
            keyword: 'open source crm',
            page: 'https://www.nocobase.com/en/blog/crm',
            clicks: 1,
            impressions: 1600,
            position: 13,
          },
          {
            keyword: 'Open Source CRM',
            page: 'https://www.nocobase.com/en/blog/crm',
            clicks: 0,
            impressions: 400,
            position: 18,
          },
          {
            keyword: 'best open source crm 2026',
            page: 'https://www.nocobase.com/en/blog/top',
            clicks: 3,
            impressions: 90,
            position: 9,
          },
          {
            keyword: 'crm',
            page: 'https://www.nocobase.com/',
            clicks: 9,
            impressions: 900,
            position: 30,
          },
        ],
      }),
    },
    siteContent: {
      state: async () => ({
        pages: [
          {
            url: 'https://www.nocobase.com/en/blog/crm',
            title: 'Open source CRM picks',
          },
          {
            url: 'https://www.nocobase.com/en/solutions/open-source-crm',
            title: 'Build a CRM',
          },
          { url: 'https://www.nocobase.com/en/pricing', title: 'Pricing' },
        ],
      }),
    },
  };
  const d = new KeywordDetail(p);
  d.d4s.config = () => (connected ? { verifiedAt: 't', budget: 5 } : null);
  d.d4s.run = async (id, kind, v) => {
    lookups.push({ kind, ...v });
    const r = runs[kind];
    if (r instanceof Error) throw r;
    return (
      r ?? {
        status: 'completed',
        completedAt: '2026-10-15T01:00:00Z',
        result: kinds[kind].result(
          reply(
            kind === 'kw-related'
              ? [{ keyword_data: row('crm open source') }]
              : kind === 'kw-serp'
                ? []
                : [row(v.keyword)],
          ),
        ).result,
      }
    );
  };
  d.d4s.preview = async () => ({
    existing: {
      id: 'ov-1',
      completedAt: '2026-10-15T01:00:00Z',
      result: {
        item: kinds['kw-overview'].result(reply([row('open source crm')]))
          .result.item,
      },
    },
  });
  return { d, lookups, stored };
}
const asked = {
  keyword: 'open source crm',
  locationCode: 2840,
  language: 'en',
};

describe('keyword detail lookups', () => {
  it('keeps the overview the page shows: growth, parent topic, features besides organic and ads, referring domains', () => {
    const { result } = kinds['kw-overview'].result(
      reply([row('open source crm')]),
    );
    expect(result.item).toMatchObject({
      keyword: 'open source crm',
      volume: 1600,
      difficulty: 55,
      competitionLevel: 'LOW',
      intent: 'commercial',
      coreKeyword: 'crm',
      trend: { yearly: 50, quarterly: 26 },
      serpFeatures: ['ai_overview', 'people_also_ask'],
      resultsCount: 141000,
      referringDomains: 120.4,
    });
    expect(result.item.monthlySearches).toEqual([
      { year: 2025, month: 9, volume: 1600 },
      { year: 2026, month: 8, volume: 2400 },
    ]);
    expect(kinds['kw-overview'].result(reply([])).result.item).toBeNull();
    expect(
      kinds['kw-overview'].result({ status_code: 40000, tasks: [] }).status,
    ).toBe('failed');
  });
  it('reads the top 10 organic results with the questions people also ask and the related searches', () => {
    const items = [
      { type: 'ai_overview' },
      ...Array.from({ length: 12 }, (_, i) => ({
        type: 'organic',
        rank_group: i + 1,
        title: `T${i}`,
        url: `https://s${i}.com/`,
        domain: `s${i}.com`,
      })),
      {
        type: 'people_also_ask',
        items: [{ title: 'What is the best open source CRM?' }],
      },
      { type: 'related_searches', items: ['open source crm github'] },
    ];
    const { result } = kinds['kw-serp'].result(reply(items));
    expect(result.items).toHaveLength(10);
    expect(result.questions).toEqual(['What is the best open source CRM?']);
    expect(result.related).toEqual(['open source crm github']);
    expect(result.features).toEqual([
      'ai_overview',
      'people_also_ask',
      'related_searches',
    ]);
  });
  it('validates the keyword and the market before any lookup', () => {
    expect(() =>
      kinds['kw-overview'].specification({
        keyword: 'x',
        locationCode: 2840,
        language: 'en',
      }),
    ).toThrow();
    expect(() =>
      kinds['kw-overview'].specification({
        keyword: 'site:x.com',
        locationCode: 2840,
        language: 'en',
      }),
    ).toThrow();
    expect(() =>
      kinds['kw-overview'].specification({
        keyword: 'open source crm',
        locationCode: 1,
        language: 'en',
      }),
    ).toThrow();
    expect(kinds['kw-related'].specification(asked).request).toMatchObject({
      keyword: 'open source crm',
      depth: 2,
      limit: 50,
      location_code: 2840,
      language_code: 'en',
    });
  });
});

describe('keyword detail', () => {
  it('market: overview, related and phrases in one answer, the keyword itself and repeats left out, questions picked out', async () => {
    const { d, lookups } = setup({
      runs: {
        'kw-suggestions': {
          status: 'completed',
          completedAt: 't',
          result: kinds['kw-suggestions'].result(
            reply([
              row('open source crm'),
              row('crm open source'),
              row('what is an open source crm'),
              row('open source crm free'),
            ]),
          ).result,
        },
      },
    });
    const m = await d.market(1, asked);
    expect(lookups.map((l) => l.kind).sort()).toEqual([
      'kw-overview',
      'kw-related',
      'kw-suggestions',
    ]);
    expect(m.overview.item.volume).toBe(1600);
    expect(m.related.related.map((i) => i.keyword)).toEqual([
      'crm open source',
    ]);
    expect(m.related.matching.map((i) => i.keyword)).toEqual([
      'what is an open source crm',
      'open source crm free',
    ]);
    expect(m.related.questions.map((i) => i.keyword)).toEqual([
      'what is an open source crm',
    ]);
  });
  it('market: not connected asks nothing; a refused or failed lookup is said in its part only', async () => {
    const off = setup({ connected: false });
    expect(await off.d.market(1, asked)).toEqual({ connected: false });
    expect(off.lookups).toHaveLength(0);
    const { VisibilityError } =
      await import('../../server/nocoreach/research-helpers.js');
    const refused = setup({
      runs: {
        'kw-overview': new VisibilityError('本月 DataForSEO 预算已用完', 409),
        'kw-related': { status: 'unknown', errorCode: '结果不确定' },
      },
    });
    const m = await refused.d.market(1, asked);
    expect(m.overview).toEqual({
      status: 'error',
      message: '本月 DataForSEO 预算已用完',
    });
    expect(m.related.status).toBe('ready');
    expect(m.related.message).toBe('结果不确定');
    expect(m.related.matching).toEqual([]);
  });
  it('serp: a tracked keyword shows its latest weekly check for free, the site marked', async () => {
    const { d, lookups } = setup({ tracked: true });
    const s = await d.serp(1, { ...asked, keyword: 'open source CRM' });
    expect(s.source).toBe('tracking');
    expect(s.items).toHaveLength(10);
    expect(s.items.filter((i) => i.own).map((i) => i.position)).toEqual([7]);
    expect(lookups).toHaveLength(0);
    const looked = setup();
    expect((await looked.d.serp(1, asked)).source).toBe('lookup');
    expect(looked.lookups.map((l) => l.kind)).toEqual(['kw-serp']);
    expect(await setup({ connected: false }).d.serp(1, asked)).toEqual({
      connected: false,
    });
  });
  it('site: saved and tracked, the pages Google showed for the keyword, nearby queries, pages mentioning it without being shown', async () => {
    const { d } = setup({ tracked: true });
    const s = await d.site(1, asked);
    expect(s.saved).toMatchObject({ id: 's1', tagIds: ['t1'] });
    expect(s.tracking.history).toEqual([
      {
        at: '2026-10-15T00:00:00Z',
        position: 7,
        url: 'https://www.nocobase.com/en/blog/crm',
      },
    ]);
    expect(s.gsc.pages).toEqual([
      {
        url: 'https://www.nocobase.com/en/blog/crm',
        clicks: 1,
        impressions: 2000,
        position: 14,
      },
    ]);
    expect(s.gsc.queries.map((q) => q.query)).toEqual([
      'best open source crm 2026',
    ]);
    expect(s.mentions.map((m) => m.url)).toEqual([
      'https://www.nocobase.com/en/solutions/open-source-crm',
    ]);
  });
  it('save: the keyword in this market with the overview already read, no new lookup', async () => {
    const { d, stored, lookups } = setup();
    await d.save(1, asked);
    expect(lookups).toHaveLength(0);
    expect(stored[0]).toMatchObject({
      keyword: 'open source crm',
      runId: 'ov-1',
      payload: {
        spec: { locationCode: 2840, language: 'en' },
        source: 'DataForSEO',
        item: { volume: 1600, difficulty: 55 },
      },
    });
    expect(stored[0].payload.item.monthlySearches[0]).toEqual({
      year: 2025,
      month: 9,
      volume: 1600,
    });
  });
});
