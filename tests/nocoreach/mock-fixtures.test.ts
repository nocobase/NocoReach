// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  fixtureCatalog,
  fixtureResponse,
  FIXTURE_PRODUCT,
  FIXTURE_COVERAGE,
  MockUnsupportedOperationError,
} from '../../app-plugins/nocoreach-mock/server/fixtures.js';
import type { MockRunContext } from '../../app-plugins/nocoreach-mock/server/types.js';
import {
  buildResearchSpec,
  parseResearch,
} from '../../server/nocoreach/research-adapter.js';
import {
  specification as keywordSpec,
  result as keywordResult,
} from '../../server/nocoreach/keyword-policy.js';
import {
  specification as domainSpec,
  result as domainResult,
} from '../../server/nocoreach/domain-service.js';
import {
  specification as rankSpec,
  result as rankResult,
  sitePosition,
} from '../../server/nocoreach/rank-tracking.js';
import {
  specification as redditSpec,
  result as redditResult,
} from '../../server/nocoreach/reddit-source.js';
import {
  specification as lighthouseSpec,
  result as lighthouseResult,
} from '../../server/nocoreach/lighthouse.js';
import {
  brandSpec,
  brandResult,
  answerSpec,
  answerResult,
  gapSpec,
  gapResult,
  pickModel,
} from '../../server/nocoreach/ai-search.js';
import {
  specification as trendsSpec,
  result as trendsResult,
  keywordSpecification as trendKeywordSpec,
  keywordResult as trendKeywordResult,
} from '../../server/nocoreach/trends-source.js';
import {
  history,
  gap,
  pages as competitorPages,
} from '../../server/nocoreach/competitor-research.js';
import { readTopicMaterial } from '../../server/nocoreach/execution/community-materials.js';
import { pageMeta, parseSitemap } from '../../server/nocoreach/site-content.js';
import { plain } from '../../server/nocoreach/public-sources.js';
import { WebsiteReport } from '../../server/nocoreach/website-report.js';
import { windowFor } from '../../server/nocoreach/data-views.js';

const ctx: MockRunContext = {
  projectId: '41',
  seed: 'nocobloom-demo',
  clock: '2026-10-12T09:00:00.000Z',
  scenario: 'normal',
  revision: 1,
  runId: '00000000-0000-4000-8000-000000000041',
};
const request = async (url: string, input?: unknown, context = ctx) =>
  (
    await fixtureResponse(
      url,
      input === undefined
        ? {}
        : { method: 'POST', body: JSON.stringify(input) },
      context,
    )
  ).json();
const seo = (path: string, input: unknown, context = ctx) =>
  request(`https://api.dataforseo.com/v3/${path}`, [input], context);
const runSpec = async (
  spec: {
    path?: string;
    request?: unknown;
    requests?: { path: string; body: unknown }[];
  },
  context = ctx,
) =>
  spec.requests
    ? Promise.all(spec.requests.map((r) => seo(r.path, r.body, context)))
    : seo(spec.path!, spec.request, context);

describe('NocoBloom deterministic raw fixtures', () => {
  it('never calls the network and ignores run/revision for stable payload identities', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('real network forbidden'));
    try {
      const first = await request(
        'https://api.github.com/repos/nocobloom/nocobloom',
      );
      const replay = await request(
        'https://api.github.com/repos/nocobloom/nocobloom',
        undefined,
        { ...ctx, revision: 999, runId: 'other-run' },
      );
      expect(replay).toEqual(first);
      const other = await request(
        'https://api.github.com/repos/nocobloom/nocobloom',
        undefined,
        { ...ctx, projectId: '42' },
      );
      expect(other.id).not.toEqual(first.id);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it('exports an explicit coverage map and credential-free fictional defaults', () => {
    expect(Object.keys(FIXTURE_COVERAGE)).toEqual(
      expect.arrayContaining([
        'google',
        'dataforseo',
        'github',
        'x',
        'slack',
        'discord',
        'community',
        'public',
        'packages',
        'hackernews',
      ]),
    );
    expect(JSON.stringify(fixtureCatalog(ctx))).toContain('nocobloom.example');
    expect(JSON.stringify(fixtureCatalog(ctx))).not.toMatch(
      /access_token|password|secret/i,
    );
  });
  it.each([
    'https://real.example/',
    'https://api.github.com/repos/real/production',
    'https://api.github.com/repos/nocobloom/nocobloom/actions/runs',
    'https://api.dataforseo.com/v3/unimplemented/live',
    'https://nocobloom.example:8443/',
  ])('fails closed for unsupported URL %s', async (url) => {
    await expect(fixtureResponse(url, {}, ctx)).rejects.toBeInstanceOf(
      MockUnsupportedOperationError,
    );
  });
  it('rejects unsupported writes and GraphQL mutations', async () => {
    await expect(
      fixtureResponse(
        'https://api.github.com/repos/nocobloom/nocobloom/issues',
        { method: 'POST', body: '{}' },
        ctx,
      ),
    ).rejects.toMatchObject({ status: 501 });
    await expect(
      request('https://api.github.com/graphql', {
        query: 'mutation { createIssue { id } }',
      }),
    ).rejects.toMatchObject({ code: 'mock_unsupported_operation' });
  });
  it('does not expose query credentials in unsupported errors', async () => {
    await expect(
      fixtureResponse(
        'https://api.github.com/missing?token=secret-value',
        {},
        ctx,
      ),
    ).rejects.not.toThrow('secret-value');
  });
  it('returns the same content type and URL for a body-free HEAD', async () => {
    const response = await fixtureResponse(
      FIXTURE_PRODUCT.origin + '/',
      { method: 'HEAD' },
      ctx,
    );
    expect(response.url).toBe(FIXTURE_PRODUCT.origin + '/');
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe('');
  });
  it('adds stable fictional records in newdata while preserving old identities', async () => {
    const url =
      'https://api.github.com/repos/nocobloom/nocobloom/issues?per_page=100';
    const normal = await request(url),
      fresh = await request(url, undefined, { ...ctx, scenario: 'newdata' });
    expect(fresh.length).toBeGreaterThan(normal.length);
    expect(
      fresh.slice(0, normal.length).map((x: { id: number }) => x.id),
    ).toEqual(normal.map((x: { id: number }) => x.id));
  });
});

describe('Fixture bounds and repository files', () => {
  it('never invents future analytic rows beyond the captured clock', async () => {
    const report = await request(
      `https://analyticsdata.googleapis.com/v1beta/properties/${fixtureCatalog(ctx).ga4PropertyId}:runReport`,
      {
        dateRanges: [{ startDate: '2026-10-15', endDate: '2026-10-16' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }],
      },
    );
    expect(report.rowCount).toBe(0);
    expect(report.rows).toEqual([]);
  });
  it('connects the GitHub tree to raw Skill and README files', async () => {
    const tree = await request(
      'https://api.github.com/repos/nocobloom/nocobloom/git/trees/main?recursive=1',
    );
    expect(tree.truncated).toBe(false);
    expect(tree.tree.map((entry: { path: string }) => entry.path)).toContain(
      'SKILL.md',
    );
    for (const entry of tree.tree) {
      const response = await fixtureResponse(
        `https://raw.githubusercontent.com/nocobloom/nocobloom/main/${entry.path}`,
        {},
        ctx,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('NocoBloom');
    }
  });
  it('keeps competitor page results unique and resolves their public details', async () => {
    const raw = await seo(
      'dataforseo_labs/google/relevant_pages/live',
      { target: 'flowgrove.example', limit: 100 },
      { ...ctx, scenario: 'newdata' },
    );
    const rows = raw.tasks[0].result[0].items;
    expect(
      new Set(rows.map((row: { page_address: string }) => row.page_address))
        .size,
    ).toBe(rows.length);
    for (const row of rows)
      expect(
        (
          await fixtureResponse(
            row.page_address,
            {},
            { ...ctx, scenario: 'newdata' },
          )
        ).status,
      ).toBe(200);
  });
});

describe('Google fixtures', () => {
  it('links OAuth, resources and property metadata', async () => {
    const token = await request('https://oauth2.googleapis.com/token', {
      grant_type: 'authorization_code',
      code: 'mock-code',
    });
    expect(token.scope).toContain('webmasters.readonly');
    expect(token.refresh_token).toMatch(/^mock-/);
    const identity = await request(
      'https://openidconnect.googleapis.com/v1/userinfo',
    );
    expect(identity.email).toBe('demo@nocobloom.example');
    const accounts = await request(
      'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200',
    );
    const property = accounts.accountSummaries[0].propertySummaries[0].property;
    expect(property).toBe('properties/' + fixtureCatalog(ctx).ga4PropertyId);
    const detail = await request(
      'https://analyticsadmin.googleapis.com/v1beta/' + property,
    );
    expect(detail.timeZone).toBe('UTC');
    const sites = await request(
      'https://www.googleapis.com/webmasters/v3/sites',
    );
    expect(sites.siteEntry[0].siteUrl).toBe(fixtureCatalog(ctx).gscSiteUrl);
  });
  it('rejects unknown and cross-project Google resources instead of fabricating them', async () => {
    const other = fixtureCatalog({ ...ctx, projectId: '42' }).ga4PropertyId;
    for (const property of ['987654321', other]) {
      await expect(
        request(
          `https://analyticsadmin.googleapis.com/v1beta/properties/${property}`,
        ),
      ).rejects.toBeInstanceOf(MockUnsupportedOperationError);
      await expect(
        request(
          `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
          { dateRanges: [] },
        ),
      ).rejects.toBeInstanceOf(MockUnsupportedOperationError);
    }
    await expect(
      request(
        'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aunknown.example/searchAnalytics/query',
        { startDate: '2026-10-01', endDate: '2026-10-02' },
      ),
    ).rejects.toBeInstanceOf(MockUnsupportedOperationError);
  });
  it('inspects URLs of the fictional property and lists its sitemaps; other properties fail closed', async () => {
    const inspect = (
      inspectionUrl: string,
      siteUrl = 'sc-domain:nocobloom.example',
    ) =>
      fixtureResponse(
        'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
        {
          method: 'POST',
          body: JSON.stringify({ inspectionUrl, siteUrl }),
        },
        ctx,
      );
    const home = await (await inspect('https://nocobloom.example/')).json();
    expect(home.inspectionResult.indexStatusResult).toMatchObject({
      verdict: 'PASS',
      coverageState: 'Submitted and indexed',
      googleCanonical: 'https://nocobloom.example/',
      sitemap: ['https://nocobloom.example/sitemap-pages.xml'],
    });
    const duplicate = await (
      await inspect('https://nocobloom.example/templates/customer-success')
    ).json();
    expect(duplicate.inspectionResult.indexStatusResult.googleCanonical).toBe(
      'https://nocobloom.example/templates/issue-triage',
    );
    const pricing = await (
      await inspect('https://nocobloom.example/pricing')
    ).json();
    expect(pricing.inspectionResult.richResultsResult.verdict).toBe('FAIL');
    const outside = await inspect('https://elsewhere.example/');
    expect(outside.status).toBe(403);
    await expect(
      inspect('https://nocobloom.example/', 'sc-domain:unknown.example'),
    ).rejects.toBeInstanceOf(MockUnsupportedOperationError);
    const list = await request(
      'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Anocobloom.example/sitemaps',
    );
    expect(list.sitemap.map((s: { path: string }) => s.path)).toEqual([
      'https://nocobloom.example/sitemap-pages.xml',
      'https://nocobloom.example/sitemap-old.xml',
    ]);
    expect(list.sitemap[1].errors).toBe('1');
    const files = await request(
      'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Anocobloom.example/sitemaps?sitemapIndex=' +
        encodeURIComponent('https://nocobloom.example/sitemap.xml'),
    );
    expect(files.sitemap).toHaveLength(2);
    await expect(
      request(
        'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aunknown.example/sitemaps',
      ),
    ).rejects.toBeInstanceOf(MockUnsupportedOperationError);
  });
  it('honors GA4 date ranges, requested schema, offset and complete rowCount', async () => {
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${fixtureCatalog(ctx).ga4PropertyId}:runReport`;
    const input = {
      dateRanges: [{ startDate: '2026-09-01', endDate: '2026-09-03' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      limit: '2',
      offset: '0',
    };
    const first = await request(url, input),
      second = await request(url, { ...input, offset: '2' });
    expect(first.rowCount).toBe(3);
    expect(first.rows).toHaveLength(2);
    expect(second.rows).toHaveLength(1);
    expect(first.rows[0].dimensionValues).toEqual([{ value: '20260901' }]);
    expect(second.rows[0].dimensionValues).toEqual([{ value: '20260903' }]);
    expect(first.metricHeaders.map((m: { name: string }) => m.name)).toEqual([
      'sessions',
      'activeUsers',
    ]);
    expect(Number(first.rows[0].metricValues[0].value)).toBeGreaterThan(0);
    const blank = await request(url, input, { ...ctx, scenario: 'empty' });
    expect(blank.rowCount).toBe(0);
    expect(blank.rows).toEqual([]);
  });
  it('keeps GA4 aggregate totals coherent across report grains', async () => {
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${fixtureCatalog(ctx).ga4PropertyId}:runReport`,
      base = {
        dateRanges: [{ startDate: '2026-10-01', endDate: '2026-10-02' }],
        metrics: [{ name: 'screenPageViews' }],
      };
    const total = await request(url, {
        ...base,
        dimensions: [{ name: 'date' }],
      }),
      detail = await request(url, {
        ...base,
        dimensions: [{ name: 'date' }, { name: 'pagePath' }],
      });
    const sum = (data: { rows: { metricValues: { value: string }[] }[] }) =>
      data.rows.reduce((s, r) => s + Number(r.metricValues[0].value), 0);
    expect(sum(total)).toBe(sum(detail));
  });
  it('serves the traffic page reports: batches, named ranges, today up to the clock, filters and realtime', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('real network forbidden'));
    try {
      const report = new WebsiteReport({
        token: async () => 'mock-access',
        googleFetch: () => (url: string | URL, init?: RequestInit) =>
          fixtureResponse(url, init ?? {}, ctx),
        mock: { enabled: true, clock: () => ctx.clock },
      });
      const property = String(fixtureCatalog(ctx).ga4PropertyId),
        w = windowFor('2026-10-09', '7');
      const period = await report.period(ctx.projectId, property, w);
      expect(period.missing).toEqual([]);
      const sessions = (rows: { sessions?: number }[]) =>
        rows.reduce((n, r) => n + (r.sessions ?? 0), 0);
      expect(sessions(period.tables.channel)).toBe(
        period.totals.current.sessions,
      );
      expect(period.totals.previous.sessions).toBeGreaterThan(0);
      expect(period.daily.map((d: { date: string }) => d.date)).toEqual(
        Array.from({ length: 7 }, (_, i) => `2026-10-0${3 + i}`),
      );
      expect(period.previousDaily).toHaveLength(7);
      expect(
        period.tables.event.find(
          (e: { dims: { eventName: string } }) =>
            e.dims.eventName === 'sign_up',
        ).keyEvents,
      ).toBeGreaterThan(0);
      expect(
        period.tables.country
          .map((r: { dims: { countryId: string } }) => r.dims.countryId)
          .sort(),
      ).toEqual(['CA', 'US']);
      const pricing = period.tables.page.find(
        (r: { key: string }) => r.key === '/pricing',
      );
      const row = await report.row(ctx.projectId, property, w, {
        table: 'page',
        dims: { pagePath: '/pricing' },
      });
      expect(row.daily).toHaveLength(7);
      expect(row.totals.current.views).toBe(pricing.views);

      const today = await report.today(ctx.projectId, property);
      expect(today.date).toBe('2026-10-12');
      // GA4 has hours 0–8; the last two are still filling in, so the figures stop at 7.
      expect(today.reached).toBe(9);
      expect(today.through).toBe(7);
      expect(today.hours[9].today).toBeNull();
      expect(today.totals.today.views).toBe(
        today.hours
          .slice(0, 7)
          .reduce((n: number, h: { today: number }) => n + h.today, 0),
      );
      expect(today.sources).toHaveLength(2);

      const live = await report.realtime(ctx.projectId, property);
      expect(live.perMinute).toHaveLength(30);
      expect(live.users).toBe(
        live.perMinute.reduce((n: number, u: number) => n + u, 0),
      );
      expect(live.pages.length).toBeGreaterThan(0);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it('honors GSC pagination, dimension order and filters', async () => {
    const url =
      'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Anocobloom.example/searchAnalytics/query';
    const input = {
      startDate: '2026-10-01',
      endDate: '2026-10-02',
      dimensions: ['date', 'country', 'page'],
      rowLimit: 3,
      startRow: 0,
      dimensionFilterGroups: [
        {
          filters: [
            { dimension: 'country', operator: 'equals', expression: 'usa' },
          ],
        },
      ],
    };
    const first = await request(url, input),
      second = await request(url, { ...input, startRow: 3 });
    expect(first.rows).toHaveLength(3);
    expect(second.rows).toHaveLength(3);
    expect(
      first.rows.every((r: { keys: string[] }) => r.keys[1] === 'usa'),
    ).toBe(true);
    expect(first.rows[0].keys).not.toEqual(second.rows[0].keys);
    expect(first.rows[0].ctr).toBeCloseTo(
      first.rows[0].clicks / first.rows[0].impressions,
    );
    expect(first.rows[0].position).toBeGreaterThan(0);
  });
});

describe('DataForSEO actual business parsers', () => {
  it.each(['normal', 'newdata', 'pagination', 'empty'] as const)(
    'preserves all four domain summary metrics through the production parser in %s',
    async (scenario) => {
      const context = { ...ctx, scenario };
      const spec = domainSpec({
        view: 'keywords',
        target: 'flowgrove.example',
        locationCode: 2840,
        language: 'en',
      });
      const raw = await runSpec(spec, context);
      const parsed = domainResult(raw, spec);
      const organic = raw.tasks[0].result[0].metrics.organic;
      expect(parsed.status).toBe('completed');
      expect(parsed.result.summary).toEqual({
        traffic: organic.etv,
        keywords: organic.count,
        top3: organic.pos_1 + organic.pos_2_3,
        top10: organic.pos_1 + organic.pos_2_3 + organic.pos_4_10,
      });
      for (const value of Object.values(parsed.result.summary)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      if (scenario === 'empty') {
        expect(parsed.result.items).toEqual([]);
        expect(parsed.result.summary).toEqual({
          traffic: 0,
          keywords: 0,
          top3: 0,
          top10: 0,
        });
      } else {
        expect(parsed.result.items.length).toBeGreaterThan(0);
        const overview = await seo(
          'dataforseo_labs/google/domain_rank_overview/live',
          { target: spec.target },
          context,
        );
        expect(organic).toEqual(
          overview.tasks[0].result[0].items[0].metrics.organic,
        );
        const laterPage = await seo(
          spec.path,
          { ...spec.request, offset: 2, limit: 2 },
          context,
        );
        expect(laterPage.tasks[0].result[0].metrics.organic).toEqual(organic);
      }
    },
  );
  const views = [
    ['keywords', 'related'],
    ['keywords', 'suggestions'],
    ['keywords', 'ideas'],
    ['keywords', 'serp'],
    ['domain', 'overview'],
    ['domain', 'keywords'],
    ['domain', 'pages'],
    ['domain', 'gap'],
    ['backlinks', 'overview'],
    ['backlinks', 'links'],
    ['backlinks', 'domains'],
    ['backlinks', 'pages'],
    ['backlinks', 'gap'],
    ['backlinks', 'history'],
  ] as const;
  it.each(views)('provides complete %s/%s results', async (kind, view) => {
    const spec = buildResearchSpec({
      kind,
      view,
      target:
        kind === 'keywords' ? 'no code internal tools' : 'nocobloom.example',
      competitor: 'flowgrove.example',
      limit: 20,
      locationCode: 2840,
      language: 'en',
    });
    const parsed = parseResearch(await runSpec(spec), spec);
    expect(parsed.status).toBe('completed');
    expect(parsed.costUsd).toBe(0);
    if (view === 'overview') expect(parsed.result.summary).toBeTruthy();
    else expect(parsed.result.items.length).toBeGreaterThan(0);
  });
  it('parses keyword research, ranks and Reddit threads', async () => {
    const keyword = keywordSpec({
      view: 'related',
      target: 'internal tools',
      locationCode: 2840,
      language: 'en',
      limit: 20,
    });
    expect(
      keywordResult(await runSpec(keyword), keyword).result.items[0].keyword,
    ).toBeTruthy();
    const rank = rankSpec({
      target: 'internal tools',
      locationCode: 2840,
      language: 'en',
    });
    const parsed = rankResult(await runSpec(rank), rank);
    expect(
      sitePosition(parsed.result.items, ['nocobloom.example']).position,
    ).toBe(1);
    const reddit = redditSpec({ term: 'NocoBloom' }),
      posts = redditResult(await runSpec(reddit), reddit).result.posts;
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0].subreddit).toBe('NocoBloom');
    expect(posts[0].postedAt).toMatch(/^2026-/);
  });
  it('honors Labs limit and offset with total count', async () => {
    const input = { keyword: 'internal tools', limit: 3, offset: 0 };
    const a = await seo('dataforseo_labs/google/related_keywords/live', input),
      b = await seo('dataforseo_labs/google/related_keywords/live', {
        ...input,
        offset: 3,
      });
    expect(a.tasks[0].result[0].items).toHaveLength(3);
    expect(a.tasks[0].result[0].total_count).toBe(8);
    expect(a.tasks[0].result[0].items[0].keyword_data.keyword).not.toBe(
      b.tasks[0].result[0].items[0].keyword_data.keyword,
    );
  });
  it('returns the requested keyword overview rows and worldwide Ads schema', async () => {
    const raw = await seo('dataforseo_labs/google/keyword_overview/live', {
      keywords: ['reporting blocks', 'workflow reviews'],
    });
    expect(
      raw.tasks[0].result[0].items.map((x: { keyword: string }) => x.keyword),
    ).toEqual(['reporting blocks', 'workflow reviews']);
    const spec = buildResearchSpec({
        kind: 'keywords',
        view: 'global',
        keywords: ['internal tools'],
        locationCode: 0,
        language: 'en',
      }),
      parsed = parseResearch(await runSpec(spec), spec);
    expect(parsed.status).toBe('completed');
    expect(parsed.result.items[0].volume).toBeGreaterThan(0);
    expect(parsed.result.global).toBe(true);
  });
  it('parses AI brand shares, competitor gaps, answers and model catalogs', async () => {
    const input = {
      value: 'NocoBloom',
      competitors: ['FlowGrove'],
      platform: 'chat_gpt',
      locationCode: 2840,
      language: 'en',
      own: ['nocobloom.example'],
    };
    const brand = brandSpec(input),
      parsed = brandResult(await runSpec(brand), brand);
    expect(parsed.result.mentions).toBeGreaterThan(0);
    expect(parsed.result.questions[0].ownCited).toBe(true);
    expect(
      parsed.result.share.every((x: { mentions: number }) => x.mentions > 0),
    ).toBe(true);
    const gap = gapSpec({ ...input, competitor: 'FlowGrove' }),
      gapParsed = gapResult(await runSpec(gap), gap);
    expect(gapParsed.result.questions.length).toBeGreaterThan(0);
    expect(gapParsed.result.removed).toBe(0);
    for (const model of ['chat_gpt', 'claude', 'gemini', 'perplexity']) {
      const catalog = await request(
        `https://api.dataforseo.com/v3/ai_optimization/${model}/llm_responses/models`,
      );
      const modelName = pickModel(
        model,
        catalog.tasks[0].result.map(
          (m: { model_name: string }) => m.model_name,
        ),
      );
      expect(modelName).toBeTruthy();
      const spec = answerSpec({
          model,
          modelName,
          question: 'How can teams use internal tools?',
          own: ['nocobloom.example'],
          brand: 'NocoBloom',
        }),
        answer = answerResult(await runSpec(spec), spec);
      expect(answer.result.mentioned).toBe(true);
      expect(answer.result.ownCited).toBe(1);
      expect(answer.result.text).toContain('NocoBloom');
    }
  });
  it('parses trends comparison, per-keyword rising searches and Lighthouse scores', async () => {
    const spec = trendsSpec({
        terms: ['NocoBloom', 'FlowGrove'],
        locationCode: 0,
      }),
      parsed = trendsResult(await runSpec(spec), spec);
    expect(parsed.result.points).toHaveLength(52);
    expect(parsed.result.points[0].values).toHaveLength(2);
    expect(parsed.result.rising.length).toBeGreaterThan(0);
    const single = trendKeywordSpec({
      keyword: 'workflow automation',
      locationCode: 0,
    });
    expect(
      trendKeywordResult(await runSpec(single)).result.points,
    ).toHaveLength(52);
    const light = lighthouseSpec({
        url: FIXTURE_PRODUCT.origin + '/docs/reporting',
        strategy: 'mobile',
      }),
      report = lighthouseResult(await runSpec(light), light);
    expect(report.status).toBe('completed');
    expect(report.result.scores.performance).toBe(74);
    expect(report.result.issues.length).toBeGreaterThan(0);
    expect(report.result.metrics.length).toBe(7);
  });
  it('parses competitor traffic history, keyword gaps and popular pages', async () => {
    for (const kind of [history, gap, competitorPages]) {
      const spec = kind.specification({
          target: 'flowgrove.example',
          ours: 'nocobloom.example',
        }),
        parsed = kind.result(await runSpec(spec));
      expect(parsed.status).toBe('completed');
      expect(
        parsed.result.months?.length ?? parsed.result.items.length,
      ).toBeGreaterThan(0);
    }
  });
  it('keeps empty responses structurally valid for list parsers', async () => {
    const spec = keywordSpec({
        view: 'related',
        target: 'internal tools',
        locationCode: 2840,
        language: 'en',
        limit: 20,
      }),
      parsed = keywordResult(
        await runSpec(spec, { ...ctx, scenario: 'empty' }),
        spec,
      );
    expect(parsed.status).toBe('completed');
    expect(parsed.result.items).toEqual([]);
  });
});

describe('GitHub, social, community and public fixtures', () => {
  it('paginates GitHub without duplication and preserves list/detail IDs', async () => {
    const context = { ...ctx, scenario: 'pagination' } as const;
    const first = await request(
        'https://api.github.com/repos/nocobloom/nocobloom/issues?per_page=100&page=1',
        undefined,
        context,
      ),
      second = await request(
        'https://api.github.com/repos/nocobloom/nocobloom/issues?per_page=100&page=2',
        undefined,
        context,
      ),
      third = await request(
        'https://api.github.com/repos/nocobloom/nocobloom/issues?per_page=100&page=3',
        undefined,
        context,
      );
    expect([first.length, second.length, third.length]).toEqual([100, 100, 7]);
    expect(new Set([...first, ...second, ...third].map((x) => x.id)).size).toBe(
      207,
    );
    const detail = await request(
      first[0].html_url.replace(
        'https://github.com/',
        'https://api.github.com/repos/',
      ),
      undefined,
      context,
    );
    expect(detail).toEqual(first[0]);
    const releases = await request(
      'https://api.github.com/repos/nocobloom/nocobloom/releases',
    );
    expect(
      await request(
        `https://api.github.com/repos/nocobloom/nocobloom/releases/tags/${releases[0].tag_name}`,
      ),
    ).toEqual(releases[0]);
  });
  it('returns history and traffic dates based on the fixture clock', async () => {
    const traffic = await request(
      'https://api.github.com/repos/nocobloom/nocobloom/traffic/views',
    );
    expect(traffic.views).toHaveLength(14);
    expect(traffic.views.at(-1).timestamp).toBe('2026-10-11T00:00:00Z');
    const history = await request(
      'https://api.github.com/repos/nocobloom/nocobloom/stargazers/history?per_page=30&page=1',
    );
    expect(history[0].days).toHaveLength(7);
    const first = await request(
      'https://api.github.com/graphql',
      {
        query: 'query { repository { stargazers { edges { starredAt } } } }',
        variables: { owner: 'nocobloom', name: 'nocobloom' },
      },
      { ...ctx, scenario: 'pagination' },
    );
    const data = first.data.repository.stargazers;
    expect(data.edges).toHaveLength(100);
    expect(data.pageInfo.hasNextPage).toBe(true);
    const second = await request(
      'https://api.github.com/graphql',
      {
        query: 'query { repository { stargazers { edges { starredAt } } } }',
        variables: {
          owner: 'nocobloom',
          name: 'nocobloom',
          after: data.pageInfo.endCursor,
        },
      },
      { ...ctx, scenario: 'pagination' },
    );
    expect(second.data.repository.stargazers.edges).toHaveLength(100);
  });
  it('paginates X and retains detail identity and since_id filtering', async () => {
    const url = 'https://api.x.com/2/tweets/search/recent?max_results=3',
      first = await request(url),
      second = await request(url + '&next_token=' + first.meta.next_token);
    expect(first.data).toHaveLength(3);
    expect(second.data).toHaveLength(3);
    expect(first.data[0].id).not.toBe(second.data[0].id);
    expect(
      (await request('https://api.x.com/2/tweets/' + first.data[0].id)).data,
    ).toEqual(first.data[0]);
    expect(
      (await request(url + '&since_id=' + first.meta.newest_id)).data,
    ).toEqual([]);
  });
  it('paginates Slack and Discord with stable channel and message IDs', async () => {
    const channels = await request('https://slack.com/api/conversations.list'),
      id = channels.channels[0].id;
    const first = await request(
        `https://slack.com/api/conversations.history?channel=${id}&limit=3`,
      ),
      second = await request(
        `https://slack.com/api/conversations.history?channel=${id}&limit=3&cursor=${first.response_metadata.next_cursor}`,
      );
    expect(first.messages).toHaveLength(3);
    expect(second.messages).toHaveLength(3);
    expect(first.messages[0].ts).not.toBe(second.messages[0].ts);
    const guilds = await request(
        'https://discord.com/api/v10/users/@me/guilds',
      ),
      discordChannels = await request(
        `https://discord.com/api/v10/guilds/${guilds[0].id}/channels`,
      );
    const url = `https://discord.com/api/v10/channels/${discordChannels[0].id}/messages?limit=3`,
      a = await request(url),
      b = await request(url + '&after=' + a.at(-1).id);
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
    expect(BigInt(b[0].id)).toBeGreaterThan(BigInt(a.at(-1).id));
  });
  it('supplies a complete Discourse topic through the real task-material reader', async () => {
    const c = { ...ctx, scenario: 'pagination' } as const,
      latest = await request(
        FIXTURE_PRODUCT.community + '/latest.json',
        undefined,
        c,
      ),
      topic = latest.topic_list.topics[0];
    expect(latest.topic_list.topics).toHaveLength(30);
    const detail = await request(
      FIXTURE_PRODUCT.community + `/t/${topic.id}.json`,
      undefined,
      c,
    );
    expect(detail.title).toBe(topic.title);
    expect(detail.post_stream.posts).toHaveLength(1);
    const material = await readTopicMaterial(
      FIXTURE_PRODUCT.community,
      String(topic.id),
      (url) => request(url, undefined, c),
      plain,
    );
    expect(material.complete).toBe(true);
    expect(material.posts).toHaveLength(topic.posts_count);
    expect(material.posts[0].text).toContain('NocoBloom');
    const missing = await fixtureResponse(
      FIXTURE_PRODUCT.community + '/t/1.json',
      {},
      c,
    );
    expect(missing.status).toBe(404);
  });
  it('matches sitemap entries to realistic pages and source discovery links', async () => {
    const index = parseSitemap(
      await (
        await fixtureResponse(FIXTURE_PRODUCT.origin + '/sitemap.xml', {}, ctx)
      ).text(),
    );
    expect(index.sitemaps).toHaveLength(2);
    const urls = [];
    for (const sitemap of index.sitemaps)
      urls.push(
        ...parseSitemap(await (await fixtureResponse(sitemap, {}, ctx)).text())
          .urls,
      );
    expect(urls).toHaveLength(8);
    for (const row of urls) {
      const response = await fixtureResponse(row.loc, {}, ctx);
      expect(response.status).toBe(200);
      const meta = pageMeta(await response.text(), row.loc);
      expect(meta.title.length).toBeGreaterThan(12);
      expect(meta.words).toBeGreaterThan(80);
      expect(meta.canonical).toBe(row.loc);
    }
    const home = await (
      await fixtureResponse(FIXTURE_PRODUCT.origin + '/', {}, ctx)
    ).text();
    expect(home).toContain(FIXTURE_PRODUCT.community);
    expect(home).toContain(FIXTURE_PRODUCT.repository);
    const icon = await fixtureResponse(
      FIXTURE_PRODUCT.origin + '/favicon.svg',
      {},
      ctx,
    );
    expect(icon.headers.get('content-type')).toBe('image/svg+xml');
  });
  it('returns registry manifests and bounded requested daily download windows', async () => {
    const manifest = await request(
      'https://registry.npmjs.org/@nocobloom/core/latest',
    );
    expect(manifest.name).toBe('@nocobloom/core');
    const npm = await request(
      'https://api.npmjs.org/downloads/range/2026-10-01:2026-10-03/@nocobloom/core',
    );
    expect(npm.downloads.map((x: { day: string }) => x.day)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(npm.package).toBe('@nocobloom/core');
    expect(
      (await request('https://pypi.org/pypi/nocobloom/json')).info.name,
    ).toBe('nocobloom');
    expect(
      (
        await request(
          'https://pypistats.org/api/packages/nocobloom/overall?mirrors=false',
        )
      ).data,
    ).toHaveLength(180);
    expect(
      (
        await request(
          'https://hub.docker.com/v2/repositories/nocobloom/server/',
        )
      ).pull_count,
    ).toBeGreaterThan(0);
  });
  it('matches Hacker News search stories, comment parents and details', async () => {
    const search = await request(
      'https://hn.algolia.com/api/v1/search_by_date?query=%22NocoBloom%22&hitsPerPage=3&page=0',
    );
    expect(search.hits).toHaveLength(3);
    expect(search.nbPages).toBe(3);
    const story = search.hits.find((h: { _tags: string[] }) =>
        h._tags.includes('story'),
      ),
      detail = await request(
        `https://hn.algolia.com/api/v1/items/${story.objectID}`,
      );
    expect(detail.title).toBe(story.title);
    expect(detail.children[0].id).toBe(
      Number(
        search.hits.find(
          (h: { parent_id: number }) => h.parent_id === Number(story.objectID),
        ).objectID,
      ),
    );
    expect(
      (
        await request(
          'https://hn.algolia.com/api/v1/search_by_date?numericFilters=created_at_i%3E9999999999',
        )
      ).hits,
    ).toEqual([]);
  });
});
