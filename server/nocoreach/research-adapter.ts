// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import * as import_analysis from './research-helpers.js';
import * as import_provider from './research-helpers.js';
const RESEARCH_VERSION = 'research-2026-09-08';



function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function domain(value) {
  const input = (0, import_analysis.str)(value).trim().toLowerCase();
  if (!input || input.length > 253 || /[\s/?#@:]/.test(input) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(input))
    throw new import_provider.VisibilityError('research_domain_required');
  return input;
}
const TREND_RANGES = [
  'past_hour',
  'past_4_hours',
  'past_day',
  'past_7_days',
  'past_30_days',
  'past_90_days',
  'past_12_months',
  'past_5_years'
];
function buildTrendsSpec(values) {
  const source = (0, import_analysis.str)(values.source) || 'google_trends_browser';
  if (!['google_trends_browser', 'dataforseo'].includes(source))
    throw new import_provider.VisibilityError('research_trends_source_invalid');
  const keywords = Array.isArray(values.keywords) ? values.keywords.map((value) => (0, import_analysis.str)(value).trim().replace(/\s+/g, ' ')) : [];
  if (keywords.length < 2 || keywords.length > 5 || keywords.some((word) => word.length < 2 || word.length > 100) || new Set(keywords.map((word) => word.toLowerCase())).size !== keywords.length)
    throw new import_provider.VisibilityError('research_trends_keywords_invalid');
  if (keywords.some((word) => /[,<>|"+=~!:*()[\]{}]/.test(word)))
    throw new import_provider.VisibilityError('research_trends_operators_unsupported');
  const locationCode = Number(values.locationCode ?? 0), language = (0, import_analysis.str)(values.language) || 'en';
  if (!Number.isInteger(locationCode) || locationCode < 0 || !/^[a-z]{2}(-[A-Z]{2})?$/.test(language))
    throw new import_provider.VisibilityError('research_market_invalid');
  const searchType = (0, import_analysis.str)(values.searchType) || 'web', timeRange = (0, import_analysis.str)(values.timeRange) || 'past_12_months';
  if (!['web', 'news', 'youtube', 'images', 'froogle'].includes(searchType))
    throw new import_provider.VisibilityError('research_trends_type_invalid');
  if (![...TREND_RANGES, searchType === 'web' ? '2004_present' : '2008_present'].includes(timeRange) || values.dateFrom || values.dateTo)
    throw new import_provider.VisibilityError('research_trends_range_invalid');
  if (Number(values.categoryCode ?? 0) !== 0) throw new import_provider.VisibilityError('research_trends_category_invalid');
  const request = {
    keywords,
    language_code: language,
    type: searchType,
    time_range: timeRange,
    category_code: 0,
    item_types: ['google_trends_graph', 'google_trends_map']
  };
  if (locationCode !== 0) request.location_code = locationCode;
  return {
    kind: 'keywords',
    view: 'trends',
    target: keywords.join(' \xB7 '),
    competitor: '',
    scope: 'subdomains',
    keywords,
    source,
    locationCode,
    language,
    searchType,
    timeRange,
    categoryCode: 0,
    limit: 0,
    offset: 0,
    path: source === 'dataforseo' ? 'keywords_data/google_trends/explore/live' : 'google_trends_browser',
    request,
    estimatedUsd: source === 'dataforseo' ? 0.011 : 0,
    reservationUsd: source === 'dataforseo' ? 0.02 : 0,
    cacheTtlHours: 24,
    priceVersion: source === 'dataforseo' ? 'google-trends-live-2026-09-09' : 'browser-no-api-fee-2026-09-09',
    schemaVersion: RESEARCH_VERSION
  };
}
function parseTrends(result, spec) {
  const items = (0, import_analysis.objects)(result.items), keywords = spec.keywords;
  const sameGroup = (item) => Array.isArray(item.keywords) && item.keywords.length === keywords.length && keywords.every((word) => item.keywords.includes(word));
  const graph = items.find((item) => item.type === 'google_trends_graph' && sameGroup(item));
  const map = items.find((item) => item.type === 'google_trends_map' && sameGroup(item));
  const align = (value, item) => {
    const source = Array.isArray(value) ? value : [];
    const names = Array.isArray(item == null ? void 0 : item.keywords) ? item.keywords : Array.isArray(result.keywords) ? result.keywords : [];
    return keywords.map((keyword) => {
      const index = names.indexOf(keyword), entry = index < 0 ? null : number(source[index]);
      return entry !== null && entry >= 0 && entry <= 100 ? entry : null;
    });
  };
  return {
    keywords,
    timeline: (0, import_analysis.objects)(graph == null ? void 0 : graph.data).map((point) => ({
      dateFrom: (0, import_analysis.str)(point.date_from),
      dateTo: (0, import_analysis.str)(point.date_to),
      timestamp: number(point.timestamp),
      missingData: point.missing_data === true,
      isPartial: point.is_partial === true,
      sourceLabel: (0, import_analysis.str)(point.source_label),
      values: align(point.values, graph)
    })),
    averages: align(graph == null ? void 0 : graph.averages, graph),
    regions: (0, import_analysis.objects)(map == null ? void 0 : map.data).map((region) => {
      const values = align(region.values, map);
      const max = values.reduce(
        (highest, value) => value === null ? highest : highest === null ? value : Math.max(highest, value),
        null
      );
      return {
        geoId: (0, import_analysis.str)(region.geo_id),
        geoName: (0, import_analysis.str)(region.geo_name),
        values,
        maxValueIndex: max === null ? null : values.indexOf(max)
      };
    }),
    checkUrl: (0, import_analysis.str)(result.check_url),
    graphAvailable: Boolean(graph),
    mapAvailable: Boolean(map),
    items: [],
    totalCount: null,
    returnedCount: 0,
    offset: 0,
    limit: 0,
    truncated: false,
    providerTime: (0, import_analysis.str)(result.datetime) || null,
    metricBasis: 'google_trends_relative_interest'
  };
}
function buildGlobalKeywordSpec(values) {
  const keywords = (Array.isArray(values.keywords) ? values.keywords : [values.target]).map(
    (word) => (0, import_analysis.str)(word).trim().replace(/\s+/g, ' ').toLowerCase()
  );
  if (!keywords.length || keywords.length > 20 || keywords.some((word) => !word || word.length > 80 || /[<>|"+=~!:*()[\]{}\p{C}\p{S}]/u.test(word)) || new Set(keywords).size !== keywords.length)
    throw new import_provider.VisibilityError('research_global_keywords_invalid');
  const locationCode = Number(values.locationCode ?? 0), language = (0, import_analysis.str)(values.language) || 'en';
  if (locationCode !== 0 || !/^[a-z]{2}(-[A-Z]{2})?$/.test(language))
    throw new import_provider.VisibilityError('research_market_invalid');
  if (values.searchPartners === true || values.dateFrom || values.dateTo)
    throw new import_provider.VisibilityError('research_global_options_unsupported');
  const request = {
    keywords,
    language_code: language,
    search_partners: false,
    sort_by: 'relevance',
    include_adult_keywords: false
  };
  return {
    kind: 'keywords',
    view: 'global',
    target: keywords[0],
    keywords,
    competitor: '',
    scope: 'subdomains',
    locationCode,
    language,
    limit: 2e4,
    offset: 0,
    path: 'keywords_data/google_ads/keywords_for_keywords/live',
    request,
    estimatedUsd: 0.09,
    reservationUsd: 0.1,
    priceVersion: 'google-ads-live-2026-09-09',
    schemaVersion: RESEARCH_VERSION,
    source: 'dataforseo',
    dataset: 'google_ads_keyword_ideas',
    global: true
  };
}
function parseGlobalKeywords(task) {
  if (!Array.isArray(task.result) && !(task.result === null && task.result_count === 0)) return null;
  const rows = (0, import_analysis.objects)(task.result);
  if (rows.some((row) => !(0, import_analysis.str)(row.keyword))) return null;
  const items = rows.map((row, index) => ({
    id: String(index),
    keyword: (0, import_analysis.str)(row.keyword),
    volume: number(row.search_volume),
    cpc: number(row.cpc),
    adCompetition: ['LOW', 'MEDIUM', 'HIGH'].includes((0, import_analysis.str)(row.competition)) ? row.competition : null,
    adCompetitionIndex: number(row.competition_index),
    lowBid: number(row.low_top_of_page_bid),
    highBid: number(row.high_top_of_page_bid),
    difficulty: null,
    intent: null,
    competition: null,
    position: null,
    traffic: null,
    url: '',
    domain: '',
    monthlySearches: (0, import_analysis.objects)(row.monthly_searches),
    serpInfo: null,
    annotations: (0, import_analysis.object)(row.keyword_annotations),
    raw: row
  }));
  return {
    items,
    totalCount: items.length,
    returnedCount: items.length,
    limit: 2e4,
    offset: 0,
    truncated: false,
    clientPagination: true,
    providerLimitReached: items.length >= 2e4,
    providerLimit: 2e4,
    summary: null,
    providerTime: null,
    global: true,
    dataset: 'google_ads_keyword_ideas',
    provider: 'dataforseo',
    metricBasis: 'google_ads_worldwide_estimates',
    unavailableMetrics: ['difficulty', 'intent', 'serp', 'position'],
    currency: 'USD'
  };
}
function buildResearchSpec(values) {
  let _a, _b;
  const kind = (0, import_analysis.str)(values.kind);
  const views = {
    keywords: ['related', 'suggestions', 'ideas', 'serp', 'trends', 'global'],
    domain: ['overview', 'keywords', 'pages', 'gap'],
    backlinks: ['overview', 'links', 'domains', 'pages', 'gap', 'history']
  };
  const view = (0, import_analysis.str)(values.view) || ((_a = views[kind]) == null ? void 0 : _a[0]);
  if (!((_b = views[kind]) == null ? void 0 : _b.includes(view))) throw new import_provider.VisibilityError('research_view_invalid');
  if (kind === 'keywords' && view === 'trends') return buildTrendsSpec(values);
  if (kind === 'keywords' && view === 'global') return buildGlobalKeywordSpec(values);
  const scope = (0, import_analysis.str)(values.scope) || 'subdomains';
  if (!['domain', 'subdomains'].includes(scope)) throw new import_provider.VisibilityError('research_scope_invalid');
  const target = kind === 'keywords' ? (0, import_analysis.str)(values.target).trim().replace(/\s+/g, ' ') : domain(values.target);
  if (!target || target.length > 250) throw new import_provider.VisibilityError('research_target_required');
  const competitor = view === 'gap' ? domain(values.competitor) : '';
  if (competitor === target) throw new import_provider.VisibilityError('research_competitor_different');
  const limit = Number(values.limit ?? 50), offset = Number(values.offset ?? 0);
  const locationCode = Number(values.locationCode ?? 2840), language = (0, import_analysis.str)(values.language) || 'en';
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1e4)
    throw new import_provider.VisibilityError('research_pagination_invalid');
  if (!Number.isInteger(locationCode) || locationCode < 1 || !/^[a-z]{2}(-[A-Z]{2})?$/.test(language))
    throw new import_provider.VisibilityError('research_market_invalid');
  if (kind === 'domain' && scope === 'domain' && ['overview', 'gap'].includes(view))
    throw new import_provider.VisibilityError('research_scope_unavailable');
  let path;
  let request = { location_code: locationCode, language_code: language, limit, offset };
  if (kind === 'keywords') {
    const operation = { related: 'related_keywords', suggestions: 'keyword_suggestions', ideas: 'keyword_ideas' }[view];
    if (view === 'serp') {
      if (offset !== 0) throw new import_provider.VisibilityError('research_pagination_invalid');
      path = 'serp/google/organic/live/advanced';
      request = { keyword: target, location_code: locationCode, language_code: language, device: 'desktop', depth: 10 };
    } else {
      path = `dataforseo_labs/google/${operation}/live`;
      request = {
        ...request,
        ...view === 'ideas' ? { keywords: [target] } : { keyword: target },
        include_serp_info: true,
        include_clickstream_data: false
      };
      if (view === 'related') request.depth = 3;
    }
  } else if (kind === 'domain') {
    const operation = {
      overview: 'domain_rank_overview',
      keywords: 'ranked_keywords',
      pages: 'relevant_pages',
      gap: 'domain_intersection'
    }[view];
    path = `dataforseo_labs/google/${operation}/live`;
    request.target = target;
    if (view === 'overview') {
      request.limit = 1;
      delete request.offset;
    }
    if (view === 'gap') {
      delete request.target;
      request.target1 = competitor;
      request.target2 = target;
      request.intersections = false;
    }
    if (view === 'keywords') {
      request.item_types = ['organic'];
      request.order_by = ['ranked_serp_element.serp_item.etv,desc'];
      if (scope === 'domain') request.filters = ['ranked_serp_element.serp_item.domain', '=', target];
    }
    if (view === 'pages' && scope === 'domain') request.filters = ['page_address', 'like', `%://${target}/%`];
  } else {
    const operation = {
      overview: 'summary',
      links: 'backlinks',
      domains: 'referring_domains',
      pages: 'domain_pages_summary',
      gap: 'domain_intersection',
      history: 'history'
    }[view];
    path = `backlinks/${operation}/live`;
    request = { target, include_subdomains: scope === 'subdomains', limit, offset, rank_scale: 'one_hundred' };
    if (view === 'overview') {
      delete request.limit;
      delete request.offset;
    }
    if (view === 'links') request.mode = 'one_per_domain';
    if (view === 'gap') {
      delete request.target;
      request.targets = { '1': competitor };
      request.exclude_targets = [target];
    }
    if (view === 'history') {
      if (scope !== 'subdomains') throw new import_provider.VisibilityError('research_scope_unavailable');
      request = { target, rank_scale: 'one_hundred' };
    }
  }
  const estimatedUsd = kind === 'backlinks' ? 0.024 + 36e-6 * (['overview', 'history'].includes(view) ? 1 : limit) : view === 'serp' ? 2e-3 : 0.01 + 1e-4 * (view === 'overview' ? 1 : limit);
  return {
    kind,
    view,
    target,
    competitor,
    scope,
    locationCode,
    language,
    limit,
    offset,
    path,
    request,
    estimatedUsd: Number(estimatedUsd.toFixed(6)),
    reservationUsd: 0.05,
    priceVersion: 'public-list-2026-09-08',
    schemaVersion: RESEARCH_VERSION
  };
}
function parseResearch(raw, spec) {
  let _a;
  const task = (0, import_analysis.objects)(raw.tasks)[0] || {};
  const result = (0, import_analysis.objects)(task.result)[0];
  const observedCost = number(raw.cost) ?? number(task.cost);
  const costUsd = observedCost !== null && observedCost >= 0 ? observedCost : null;
  const base = { taskId: (0, import_analysis.str)(task.id), costUsd };
  if (raw.status_code !== 2e4 || task.status_code !== 2e4)
    return {
      ...base,
      status: 'failed',
      errorCode: `provider_status_${task.status_code || raw.status_code || 'unknown'}`,
      result: null
    };
  if (spec.kind === 'keywords' && spec.view === 'global') {
    const result2 = parseGlobalKeywords(task);
    return result2 ? { ...base, status: 'completed', errorCode: null, result: result2 } : { ...base, status: 'failed', errorCode: 'research_schema_invalid', result: null };
  }
  if (!result) return { ...base, status: 'failed', errorCode: 'research_schema_invalid', result: null };
  if (!['overview'].includes(spec.view) && !Array.isArray(result.items))
    return { ...base, status: 'failed', errorCode: 'research_schema_invalid', result: null };
  if (spec.view === 'trends')
    return {
      ...base,
      status: 'completed',
      errorCode: null,
      result: {
        ...parseTrends(result, spec),
        provenance: (0, import_analysis.object)(raw.provenance),
        partialErrors: (0, import_analysis.objects)((0, import_analysis.object)(raw.provenance).partialErrors || raw.partialErrors)
      }
    };
  const source = (0, import_analysis.objects)(result.items);
  const items = (spec.view === 'overview' ? [] : source).map((entry, index) => {
    const link = spec.kind === 'backlinks' && spec.view === 'gap' ? (0, import_analysis.object)((0, import_analysis.object)(entry.domain_intersection)['1']) : entry;
    const keyword = (0, import_analysis.object)(entry.keyword_data || entry);
    const info = (0, import_analysis.object)(keyword.keyword_info), properties = (0, import_analysis.object)(keyword.keyword_properties);
    const serp = (0, import_analysis.object)((0, import_analysis.object)(entry.ranked_serp_element).serp_item);
    const organic = (0, import_analysis.object)((0, import_analysis.object)(entry.metrics).organic);
    const intersection = (0, import_analysis.object)(entry.first_domain_serp_element);
    return {
      id: String(index),
      keyword: (0, import_analysis.str)(keyword.keyword),
      title: (0, import_analysis.str)(entry.title || entry.date),
      date: (0, import_analysis.str)(entry.date),
      newBacklinks: number(entry.new_backlinks),
      lostBacklinks: number(entry.lost_backlinks),
      url: (0, import_analysis.str)(
        serp.url || (0, import_analysis.object)(entry.first_domain_serp_element).url || entry.url || entry.page_address || entry.url_from
      ),
      targetUrl: (0, import_analysis.str)(entry.url_to),
      domain: (0, import_analysis.str)(link.domain || link.domain_from || link.target),
      volume: number(info.search_volume),
      cpc: number(info.cpc),
      competition: number(info.competition),
      difficulty: number(properties.keyword_difficulty),
      intent: (0, import_analysis.str)((0, import_analysis.object)(keyword.search_intent_info).main_intent),
      position: number(serp.rank_group ?? intersection.rank_group ?? entry.rank_group),
      traffic: number(serp.etv ?? intersection.etv ?? organic.etv),
      keywords: number(organic.count),
      backlinks: number(link.backlinks),
      referringDomains: number(link.referring_domains),
      rank: number(link.rank),
      spam: number(link.backlink_spam_score ?? link.backlinks_spam_score),
      anchor: (0, import_analysis.str)(entry.anchor),
      dofollow: typeof entry.dofollow === 'boolean' ? entry.dofollow : null,
      firstSeen: (0, import_analysis.str)(link.first_seen),
      lastSeen: (0, import_analysis.str)(entry.last_seen),
      isLost: typeof entry.is_lost === 'boolean' ? entry.is_lost : null,
      monthlySearches: (0, import_analysis.objects)(info.monthly_searches),
      serpInfo: (0, import_analysis.object)(keyword.serp_info),
      raw: entry
    };
  });
  const overview = spec.kind === 'domain' ? (0, import_analysis.object)((0, import_analysis.object)((_a = source[0]) == null ? void 0 : _a.metrics).organic) : result;
  const totalCount = number(result.total_count);
  return {
    ...base,
    status: 'completed',
    errorCode: null,
    result: {
      items,
      summary: spec.view === 'overview' ? overview : null,
      totalCount,
      returnedCount: items.length,
      offset: spec.offset,
      limit: spec.limit,
      truncated: !['overview', 'history', 'serp'].includes(spec.view) && (totalCount === null ? items.length >= spec.limit : spec.offset + items.length < totalCount),
      providerTime: (0, import_analysis.str)(result.datetime || result.last_updated_time) || null,
      metricBasis: spec.kind === 'backlinks' ? 'provider_link_index' : 'provider_estimates_not_analytics'
    }
  };
}
export { RESEARCH_VERSION, buildResearchSpec, parseResearch };
