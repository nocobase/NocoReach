import { formatDate } from '#lib/format';
import { getCurrentLocale, $t } from "#i18n";
// 交给 Agent from the search pages (2026-10-03): what the person selected becomes one task whose brief carries the data
// behind it (where it ranks, how many people see and click it, which page), with the 做法 that fits by default.
import type { TaskDraft } from "./keyword-hand-off";
import { countOf, subjectOf } from './task-subject';

const n = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString(getCurrentLocale()));
const pos = (v: number | null | undefined) => (v == null || !v ? "—" : v.toFixed(1));
const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };
const clip = (s: string, max: number) => s.slice(0, max);
export type Period = { start: string; end: string } | undefined;
const since = (w: Period) => (w ? $t('common.range',{0:w.start,1:w.end}) : $t('seoHandOff.recent'));
// The page most of the rows point to (by impressions), linked to the task when it is in 网站内容.
export function mainPage(rows: { page?: string | null; impressions?: number }[]) {
  const by = new Map<string, number>();
  for (const r of rows) if (r.page) by.set(r.page, (by.get(r.page) || 0) + (r.impressions || 0));
  return [...by].sort((a, b) => b[1] - a[1])[0]?.[0];
}

// 搜索表现 · 接近首页 / 查询: queries the site already shows up for, to move up on the page that ranks.
export type QueryRow = { query: string; page?: string | null; clicks: number; impressions: number; position: number; ctr?: number };
export function queryDraft(rows: QueryRow[], w: Period): TaskDraft {
  const head = rows[0].query, page = mainPage(rows);
  const lines = rows.slice(0, 40).map((r) => $t('seoHandOff.averagePositionImpressionsClicks',{0:r.query,1:pos(r.position),2:n(r.impressions),3:n(r.clicks),4:r.ctr != null ? $t('seoHandOff.ctr',{0:pct(r.ctr)}) : "",5:r.page ? $t('seoHandOff.rankingPage',{0:r.page}) : ""}));
  return {
    title: clip(rows.length === 1 ? $t('seoHandOff.pushTopResults',{0:head}) : $t('seoHandOff.pushMoreQueriesTopResults',{0:head,1:rows.length}), 200),
    subject: clip(subjectOf(head, rows.length, 'queries'), 160),
    objective: clip($t('seoHandOff.queriesRankGoogleTop5',{0:rows.map((r) => r.query).join("、")}), 1000),
    brief: clip([$t('seoHandOff.queriesSearchConsoleWhereSite',{0:since(w)}), ...lines, ...(rows.length > 40 ? [$t('seoHandOff.moreSearchPerformance',{0:rows.length - 40})] : []), "", page ? $t('seoHandOff.mainLandingPage',{0:page}) : $t('seoHandOff.rankingPagesRowAbove'), $t('seoHandOff.queryOptimizationAdvice')].join("\n"), 20000),
  };
}

// 搜索表现 · 页面: pages to improve in search.
export type PageRow = { page: string; clicks: number; impressions: number; ctr: number; position: number };
export function pageDraft(rows: PageRow[], w: Period): TaskDraft {
  const head = pathOf(rows[0].page);
  const lines = rows.slice(0, 30).map((r) => $t('seoHandOff.clicksImpressionsCtrAveragePosition',{0:r.page,1:n(r.clicks),2:n(r.impressions),3:pct(r.ctr),4:pos(r.position)}));
  return {
    title: clip(rows.length === 1 ? $t('seoHandOff.improveSearchPerformance',{0:head}) : $t('seoHandOff.improveSearchPerformanceMorePages',{0:head,1:rows.length}), 200),
    subject: clip(subjectOf(head, rows.length, 'pages'), 160),
    objective: clip($t('seoHandOff.pagesGetMoreClicksGoogle',{0:rows.map((r) => pathOf(r.page)).join("、")}), 1000),
    brief: clip([$t('seoHandOff.pageDataSearchConsole',{0:since(w)}), ...lines, "", $t('seoHandOff.searchPerformanceAdvice')].join("\n"), 20000),
  };
}

// 搜索表现 · 索引: pages with what URL Inspection says about them (not indexed and why, canonical, rich-result issues).
export type IndexPage = { url: string; status: string; reason: string | null; lastCrawl: string | null; canonicalMismatch: boolean; rich: string[] };
export function indexDraft(rows: IndexPage[]): TaskDraft {
  const head = pathOf(rows[0].url);
  const lines = rows.slice(0, 40).map((r) => $t('seoHandOff.indexPageLine',{0:r.url,1:r.status,2:r.reason ?? "—",3:r.lastCrawl ?? "—",4:r.canonicalMismatch ? $t('seoHandOff.indexCanonicalMismatch') : "",5:r.rich.length ? $t('seoHandOff.indexRich',{0:r.rich.join(" · ")}) : ""}));
  return {
    title: clip(rows.length === 1 ? $t('seoHandOff.fixIndexing',{0:head}) : $t('seoHandOff.fixIndexingMorePages',{0:head,1:rows.length}), 200),
    subject: clip(subjectOf(head, rows.length, 'pages'), 160),
    objective: clip($t('seoHandOff.pagesIndexedProperly',{0:rows.map((r) => pathOf(r.url)).join("、")}), 1000),
    brief: clip([$t('seoHandOff.indexDataSearchConsole'), ...lines, ...(rows.length > 40 ? [$t('seoHandOff.moreIndexPages',{0:rows.length - 40})] : []), "", $t('seoHandOff.indexAdvice')].join("\n"), 20000),
  };
}

// 竞品 · 关键词: words a competitor ranks for, to write or improve content for.
export type CompetitorKeyword = { keyword: string; position: number | null; volume: number | null; traffic?: number | null; url?: string | null; difficulty?: number | null; intent?: string | null; ownClicks?: number | null };
export function competitorKeywordsDraft(domain: string, market: string, rows: CompetitorKeyword[]): TaskDraft {
  const head = rows[0].keyword;
  const lines = rows.slice(0, 40).map((r) => $t('seoHandOff.rankMonthlyVolume',{0:r.keyword,1:domain,2:r.position ?? "—",3:r.url ? `（${r.url}）` : "",4:n(r.volume),5:r.traffic != null ? $t('seoHandOff.estimatedTraffic',{0:n(r.traffic)}) : "",6:r.difficulty != null ? $t('seoHandOff.difficulty',{0:n(r.difficulty)}) : "",7:r.ownClicks != null ? $t('seoHandOff.clicksLast28Days',{0:n(r.ownClicks)}) : ""}));
  return {
    title: clip(rows.length === 1 ? $t('seoHandOff.catchUp',{0:head,1:domain}) : $t('seoHandOff.catchUpMoreKeywords',{0:head,1:rows.length,2:domain}), 200),
    subject: clip(subjectOf(head, rows.length, 'keywords'), 160),
    objective: clip($t('seoHandOff.siteReachesTopResultsKeywords',{0:domain,1:rows.map((r) => r.keyword).join("、")}), 1000),
    brief: clip([$t('seoHandOff.keywordsCompetitorRanksGoogle',{0:domain,1:market}), ...lines, "", $t('seoHandOff.evidenceRankingsSearchVolumeTraffic'), $t('seoHandOff.suggestionFirstLookWhatCompetitor')].join("\n"), 20000),
  };
}

// 竞品 · 页面: a competitor's pages that draw the most traffic, to compare against ours.
export type CompetitorPage = { url: string; traffic: number | null; keywords: number | null };
export function competitorPagesDraft(domain: string, market: string, rows: CompetitorPage[]): TaskDraft {
  const lines = rows.slice(0, 20).map((r) => $t('seoHandOff.estimatedTrafficRankingKeywords',{0:r.url,1:n(r.traffic),2:n(r.keywords)}));
  return {
    title: clip(rows.length === 1 ? $t('seoHandOff.compare',{0:domain,1:pathOf(rows[0].url)}) : $t('seoHandOff.comparePagesMostTraffic',{0:domain,1:rows.length}), 200),
    subject: clip(rows.length === 1 ? `${domain}${pathOf(rows[0].url)}` : countOf(domain, rows.length, 'pages'), 160),
    objective: clip($t('seoHandOff.understandWhyCompetitorPagesBring'), 1000),
    brief: clip([$t('seoHandOff.pagesCompetitorMoreTrafficGoogle',{0:domain,1:market}), ...lines, "", $t('seoHandOff.evidenceTrafficKeywordCountsDataforseo'), $t('seoHandOff.competitorContentAdvice')].join("\n"), 20000),
  };
}

// 页面: one page of 网站内容 with its recent numbers.
export type ContentPage = { url: string; title?: string; views?: number | null; clicks?: number | null; impressions?: number | null; position?: number | null; words?: number | null };
export function contentPageDraft(p: ContentPage, rangeLabel: string): TaskDraft {
  const name = p.title || pathOf(p.url);
  return {
    title: clip($t('seoHandOff.optimizeQuotedTarget',{0:name}), 200),
    subject: clip(name, 160),
    objective: clip($t('seoHandOff.getMoreTrafficSearchClicks',{0:p.url}), 1000),
    brief: clip([$t('seoHandOff.page',{0:p.url}), $t('seoHandOff.visitsSearchClicksImpressionsAverage',{0:rangeLabel,1:n(p.views),2:n(p.clicks),3:n(p.impressions),4:pos(p.position),5:p.words != null ? $t('seoHandOff.aboutCharactersBodyText',{0:n(p.words)}) : ""}), "", $t('seoHandOff.pageOptimizationAdvice')].join("\n"), 20000),
  };
}

// 关键词 · 排名跟踪: tracked words with their last two Google checks and Search Console numbers.
export type TrackedRow = { keyword: string; market: string; latest: { at: string; position: number | null; url: string | null } | null; previous: { at: string; position: number | null } | null; gsc?: { position: number; clicks: number; page: string } };
export function trackedDraft(rows: TrackedRow[]): TaskDraft {
  const head = rows[0].keyword, ranked = rows.some((r) => r.latest?.position || r.gsc);
  const lines = rows.slice(0, 40).map((r) => `- ${r.keyword}（${r.market}）：${r.latest ? $t('seoHandOff.googleRank',{0:formatDate(r.latest.at),1:r.latest.position ?? $t('common.beyond100'),2:r.latest.position ? $t('seoHandOff.personMeasure') : "",3:r.latest.url ? `（${r.latest.url}）` : ""}) : $t('seoHandOff.notCheckedYet')}${r.previous ? $t('seoHandOff.lastTimeRank',{0:r.previous.position ?? $t('common.beyond100'),1:r.previous.position ? $t('seoHandOff.personMeasure') : ""}) : ""}${r.gsc ? $t('seoHandOff.searchConsoleAveragePositionOver',{0:r.gsc.position.toFixed(1),1:n(r.gsc.clicks)}) : ""}`);
  return {
    title: clip(rows.length === 1 ? $t('seoHandOff.improveRanking',{0:head}) : $t('seoHandOff.improveRankingMoreKeywords',{0:head,1:rows.length}), 200),
    subject: clip(subjectOf(head, rows.length, 'keywords'), 160),
    objective: clip($t('seoHandOff.trackedKeywordsReachTopResults',{0:rows.map((r) => r.keyword).join("、")}), 1000),
    brief: clip([$t('seoHandOff.rankTrackingResultsGoogleDesktop'), ...lines, "", ranked ? $t('seoHandOff.suggestionImprovePageAlreadyRanks') : $t('seoHandOff.suggestionSiteNotRankYet')].join("\n"), 20000),
  };
}
export const trackedPage = (rows: TrackedRow[]) => mainPage(rows.map((r) => ({ page: r.latest?.url || r.gsc?.page || null, impressions: r.latest?.position ? 101 - r.latest.position : 1 })));

// 竞品 run on your own domain · 页面: your pages by estimated traffic, to improve.
export function ownPagesDraft(domain: string, market: string, rows: CompetitorPage[]): TaskDraft {
  const lines = rows.slice(0, 20).map((r) => $t('seoHandOff.estimatedTrafficRankingKeywords',{0:r.url,1:n(r.traffic),2:n(r.keywords)}));
  return {
    title: clip(rows.length === 1 ? $t('seoHandOff.improve',{0:pathOf(rows[0].url)}) : $t('seoHandOff.improvePages',{0:domain,1:rows.length}), 200),
    subject: clip(rows.length === 1 ? pathOf(rows[0].url) : countOf(domain, rows.length, 'pages'), 160),
    objective: clip($t('seoHandOff.pagesRankBetterGoogleBring'), 1000),
    brief: clip([$t('seoHandOff.pagesMoreTrafficGoogleDataforseo',{0:market}), ...lines, "", $t('seoHandOff.suggestionLookPagesQueriesCtr')].join("\n"), 20000),
  };
}

// 社区 and GitHub lists: discussions to sort into questions and answer with docs or product fixes (社区问题汇总).
export type DiscussionItem = { title: string; url: string; meta?: string; excerpt?: string };
// 起草社区回复 (2026-10-08): posts nobody answered, for the Agent to draft one reply each (you post them yourself).
export function replyDraft(where: string, noun: string, items: DiscussionItem[]): TaskDraft {
  const lines = items.slice(0, 40).map((i) => `- ${i.title}${i.meta ? `（${i.meta}）` : ""}：${i.url}${i.excerpt ? `\n  ${i.excerpt}` : ""}`);
  return {
    title: clip($t('seoHandOff.draftReplies',{0:where,1:items.length,2:noun}), 200),
    subject: clip(countOf(where, items.length, noun), 160),
    objective: clip($t('seoHandOff.draftReplyUnansweredCopyThem',{0:where,1:noun}), 1000),
    brief: clip([$t('seoHandOff.sourceAttribution',{0:where,1:noun}), ...lines, "", $t('seoHandOff.suggestionReadPostFindAnswer')].join("\n"), 20000),
  };
}
export function discussionsDraft(where: string, noun: string, items: DiscussionItem[]): TaskDraft {
  const lines = items.slice(0, 40).map((i) => `- ${i.title}${i.meta ? `（${i.meta}）` : ""}：${i.url}${i.excerpt ? `\n  ${i.excerpt}` : ""}`);
  return {
    title: clip($t('seoHandOff.summarize',{0:where,1:items.length,2:noun}), 200),
    subject: clip(countOf(where, items.length, noun), 160),
    objective: clip($t('seoHandOff.understandWhatPeopleAskSay',{0:where}), 1000),
    brief: clip([$t('seoHandOff.sourceAttribution',{0:where,1:noun}), ...lines, "", $t('seoHandOff.communitySummaryAdvice')].join("\n"), 20000),
  };
}

// 访问 · 页面详情: a page's GA4 numbers and the search queries that reach it.
export function visitPageDraft(page: string, period: string, views: number, conversions: number, share: string, queries: { keyword: string; clicks?: number | null; impressions?: number | null }[]): TaskDraft {
  return {
    title: clip($t('seoHandOff.optimizeTarget',{0:pathOf(page)}), 200),
    subject: clip(pathOf(page), 160),
    objective: clip($t('seoHandOff.getMoreKeyActionsSignValue',{0:page}), 1000),
    brief: clip([$t('seoHandOff.page',{0:page}), $t('seoHandOff.viewsSiteKeyEvents',{0:period,1:n(views),2:share,3:n(conversions)}), ...(queries.length ? [$t('seoHandOff.searchQueries'), ...queries.slice(0, 10).map((q) => $t('seoHandOff.clicksImpressions',{0:q.keyword,1:n(q.clicks),2:n(q.impressions)}))] : []), "", $t('seoHandOff.suggestionFirstLookWhereVisitors')].join("\n"), 20000),
  };
}

// 趋势: related searches picked on the 趋势 page, to see whether a page should answer them (内容选题与大纲).
export type TrendQuery = { query: string; value: number; kind: "rising" | "top" };
export function trendsDraft(term: string, place: string, rows: TrendQuery[]): TaskDraft {
  const lines = rows.slice(0, 40).map((r) => `- ${r.query}：${r.kind === "rising" ? $t('seoHandOff.rising',{0:n(r.value)}) : $t('seoHandOff.interest',{0:n(r.value)})}`);
  return {
    title: clip(rows.length === 1 ? $t('seoHandOff.contentTopic',{0:rows[0].query}) : $t('seoHandOff.contentTopicRelatedSearches',{0:rows.length,1:term}), 200),
    subject: clip(rows.length === 1 ? rows[0].query : $t('taskSubject.relatedSearches', { 0: rows.length, 1: term }), 160),
    objective: clip($t('seoHandOff.understandWhatPeopleWantKnow'), 1000),
    brief: clip([$t('seoHandOff.relatedSearchesGoogleTrendsPast',{0:term,1:place}), ...lines, "", $t('seoHandOff.contentGapAdvice')].join("\n"), 20000),
  };
}

// 竞品 › 动态: picked competitor updates (new pages, releases) to compare with what we have (竞品对比).
export type CompetitorEvent = { competitor: string; type: "page" | "release" | "site"; title: string; url: string; detail: string; at: string };
export function competitorEventsDraft(rows: CompetitorEvent[]): TaskDraft {
  const names = [...new Set(rows.map((r) => r.competitor))];
  const label = { page: $t('common.newPages'), release: $t('common.newRelease'), site: $t('common.websiteChanges') } as const;
  const lines = rows.slice(0, 40).map((r) => $t('seoHandOff.found',{0:r.competitor,1:label[r.type],2:r.title,3:formatDate(r.at),4:r.url,5:r.detail ? `\n  ${r.detail}` : ""}));
  return {
    title: clip($t('seoHandOff.competitorComparisonNewActivities',{0:names.join("、"),1:rows.length}), 200),
    subject: clip(countOf(names.join('、'), rows.length, 'activities'), 160),
    objective: clip($t('seoHandOff.seeWhatCompetitorsRecentlyWhether'), 1000),
    brief: clip([$t('seoHandOff.recentCompetitorActivitySeenWeekly'), ...lines, "", $t('seoHandOff.competitorChangesAdvice')].join("\n"), 20000),
  };
}

// 访问 · 页面 (ticked): pages with their views, share and key events; one page links the task.
export function visitPagesDraft(rows: { page: string; views: number; conversions: number; share: string; queries: number }[], period: string): TaskDraft {
  const lines = rows.slice(0, 40).map((r) => $t('seoHandOff.viewsSiteKeyEventsSearch',{0:r.page,1:n(r.views),2:r.share,3:n(r.conversions),4:r.queries}));
  return {
    title: clip(rows.length === 1 ? $t('seoHandOff.optimizeTarget',{0:pathOf(rows[0].page)}) : $t('seoHandOff.improvePagesTotal',{0:pathOf(rows[0].page),1:rows.length}), 200),
    subject: clip(subjectOf(pathOf(rows[0].page), rows.length, 'pages'), 160),
    objective: clip($t('seoHandOff.getMoreKeyActionsSign'), 1000),
    brief: clip([$t('seoHandOff.pagesTickedTrafficGa4',{0:period}), ...lines, "", $t('seoHandOff.suggestionFirstLookWhereVisitors')].join("\n"), 20000),
  };
}
// 访问 · 来源 (ticked): where visits come from, to learn what those visitors look for and serve them better.
export function visitSourcesDraft(rows: { source: string; medium: string; views: number; sessions: number; conversions: number; share: string }[], period: string): TaskDraft {
  const lines = rows.slice(0, 40).map((r) => $t('seoHandOff.viewsSiteSessionsKeyEvents',{0:r.source,1:r.medium || "—",2:n(r.views),3:r.share,4:n(r.sessions),5:n(r.conversions)}));
  return {
    title: clip(rows.length === 1 ? $t('seoHandOff.understandVisits',{0:rows[0].source}) : $t('seoHandOff.understandVisitsSourcesTotal',{0:rows[0].source,1:rows.length}), 200),
    subject: clip(subjectOf(rows[0].source, rows.length, 'sources'), 160),
    objective: clip($t('seoHandOff.findOutWhatVisitorsSources'), 1000),
    brief: clip([$t('seoHandOff.sourcesTickedTrafficGa4',{0:period}), ...lines, "", $t('seoHandOff.suggestionCheckPagesContextPosts')].join("\n"), 20000),
  };
}
// GitHub · 来源网站 / 热门页面 (ticked): the repository's traffic from GitHub's last 14 days.
export function githubTrafficDraft(repo: string, kind: "referrers" | "paths", rows: { name: string; count: number; uniques: number }[]): TaskDraft {
  const lines = rows.slice(0, 40).map((r) => $t('seoHandOff.viewsVisitors',{0:r.name,1:n(r.count),2:n(r.uniques)}));
  return kind === "referrers" ? {
    title: clip($t('seoHandOff.understandTrafficSourcesRepository',{0:repo,1:rows.length}), 200),
    subject: clip(countOf(repo, rows.length, 'sources'), 160),
    objective: clip($t('seoHandOff.findOutWhySitesSend'), 1000),
    brief: clip([$t('seoHandOff.referringSitesGithubTrafficLast',{0:repo}), ...lines, "", $t('seoHandOff.suggestionSeeWhereHowSites')].join("\n"), 20000),
  } : {
    title: clip($t('seoHandOff.findDocsAddPopularPages',{0:repo,1:rows.length}), 200),
    subject: clip(countOf(repo, rows.length, 'popularPages'), 160),
    objective: clip($t('seoHandOff.seeWhatVisitorsReadRepository'), 1000),
    brief: clip([$t('seoHandOff.popularPagesGithubTrafficLast',{0:repo}), ...lines, "", $t('seoHandOff.suggestionCompareWebsiteDocsInformation')].join("\n"), 20000),
  };
}
// 下载量 · 每个包 (ticked): downloads in the period against the one before, to find what moved them.
export function packagesDraft(rows: { title: string; registry: string; value: number | null; previous: number | null; change: number | null }[], period: string): TaskDraft {
  const lines = rows.slice(0, 40).map((r) => $t('seoHandOff.previousPeriod',{0:r.title,1:r.registry,2:n(r.value),3:n(r.previous),4:r.change == null ? "" : $t('seoHandOff.change',{0:`${r.change >= 0 ? "+" : ""}${Math.round(r.change * 100)}%`})}));
  return {
    title: clip(rows.length === 1 ? $t('seoHandOff.findOutWhyDownloadsChanged',{0:rows[0].title}) : $t('seoHandOff.findOutWhyDownloadsPackages',{0:rows[0].title,1:rows.length}), 200),
    subject: clip(subjectOf(rows[0].title, rows.length, 'packages'), 160),
    objective: clip($t('seoHandOff.findOutWhyDownloadsRose'), 1000),
    brief: clip([$t('seoHandOff.packagesTickedDownloads',{0:period}), ...lines, "", $t('seoHandOff.suggestionCompareReleasesDocsChanges')].join("\n"), 20000),
  };
}
