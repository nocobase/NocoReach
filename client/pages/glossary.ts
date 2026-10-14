import { $t, getCurrentLocale, $legacyText } from "#i18n";
// What a metric or a concept means, shown in its ⓘ (user request 2026-10-04). One place, keyed by the name people see,
// so the same word reads the same everywhere.
export const getGlossary = (): Readonly<Record<string, string>> => ({
  // Search Console
  曝光: $t('glossary.timesPagesAppearedGoogleSearch'),
  点击: $t('glossary.clicksGoogleSearchResultsSite'),
  点击率: $t('glossary.clicksImpressionsAcrossSeveralQueries'),
  平均点击率: $t('glossary.clicksImpressionsAcrossSeveralQueries'),
  平均排名: $t('glossary.averagePositionGoogleSearchResults'),
  接近首页: $t('glossary.queriesWhoseBestPageRanks'),
  接近首页的查询: $t('glossary.queriesWhoseBestPageRanks'),
  本站排名: $t('glossary.averageGooglePositionOverLast'),
  "Search Console 排名": $t('glossary.averagePositionOverLast28'),
  本站点击: $t('glossary.actualClicksKeywordBroughtSite'),
  // GA4
  会话: $t('glossary.oneVisitCountsOneSession'),
  访问: $t('glossary.oneVisitCountsOneSession'),
  浏览: $t('glossary.timesPagesOpenedGa4'),
  浏览量: $t('glossary.timesPagesOpenedGa4'),
  关键事件: $t('glossary.actionsMarkedKeyEventsGa'),
  日均访客: $t('glossary.averageDailyActiveUsersGa'),
  // GA4 figures added with 访问's reports (2026-10-14) are keyed by their label key, which help() also resolves to the
  // label shown in either language.
  'dataWebsite.activeUsers': $t('glossary.activeUsersDeduplicated'),
  'dataWebsite.newUsers': $t('glossary.newUsersFirstVisit'),
  'dataWebsite.engagementRate': $t('glossary.engagedSessionsShare'),
  'dataWebsite.averageEngagementTime': $t('glossary.averageEngagementTimePerUser'),
  'dataWebsite.engagementTimePerSession': $t('glossary.engagementTimePerSession'),
  'dataWebsite.keyEventRate': $t('glossary.sessionKeyEventRate'),
  'dataWebsite.eventsPerSession': $t('glossary.eventsPerSession'),
  'dataWebsite.eventCount': $t('glossary.eventCount'),
  'dataWebsite.viewsPerUser': $t('glossary.viewsPerUser'),
  'dataWebsite.eventsPerUser': $t('glossary.eventsPerUser'),
  // DataForSEO
  月搜索量: $t('glossary.roughlyHowOftenKeywordSearched'),
  难度: $t('glossary.howHardReachOrganicTop'),
  CPC: $t('glossary.pricePerAdClickUsd'),
  竞争度: $t('glossary.competitionGoogleAds01'),
  意图: $t('glossary.whatPeopleSearchingWantInformational'),
  估算流量: $t('glossary.monthlyClicksEstimatedRankingsSearch'),
  自然搜索流量: $t('glossary.monthlyOrganicSearchClicksEstimated'),
  排名关键词: $t('glossary.keywordsWebsiteRanksGoogleTop'),
  "前 10": $t('glossary.rankingKeywordsTop10'),
  "Google 关注度": $t('glossary.relativeInterestGoogleTrendsOver'),
  "AI 提及份额": $t('glossary.latestAiSearchBrandCheck'),
  "近 30 天": $t('glossary.newPagesFoundLast30'),
  最新排名: $t('glossary.rankPageGoogleTop100'),
  // GitHub and packages
  "新增 Star": $t('glossary.starsAddedMinusStarsRemoved'),
  "Star 总数": $t('glossary.currentStarsRepository'),
  "新增 Fork": $t('glossary.newForksSelectedPeriod'),
  仓库浏览: $t('glossary.timesRepositoryPagesViewedGithub'),
  克隆: $t('glossary.timesRepositoryClonedGitClone'),
  下载量: $t('glossary.combinedDailyDownloadsNpmPypi'),
  "Docker 拉取": $t('glossary.dockerHubPublishesTotalPulls'),
  // Community
  新主题: $t('glossary.newForumTopicsSelectedPeriod'),
  回复: $t('glossary.repliesSelectedPeriodCountedLatest'),
  无人回复: $t('glossary.topicsNoReplyAfterMore'),
  已标记解决: $t('glossary.topicsMarkedSolved'),
  提问: $t('glossary.messagesDetectedQuestionsQuestionMarks'),
  可能没人回: $t('glossary.questionsNoReplyThreadPost'),
  提及: $t('glossary.timesSearchTermMentionedPosts'),
  // Trends and AI search
  相对热度: $t('glossary.googleTrendsRelativeValuePeak'),
  提及份额: $t('glossary.timesAiAnswersMentionShare'),
  "AI 搜索量": $t('glossary.dataforseoEstimateHowOftenQuestion'),
  // Lighthouse
  性能: $t('glossary.lighthouseScore010090'),
  无障碍: $t('glossary.lighthouseScore0100Whether'),
  最佳实践: $t('glossary.lighthouseScore0100Common'),
  SEO: $t('glossary.lighthouseScore0100Basic'),
  LCP: $t('glossary.timeUntilLargestContentAppears'),
  CLS: $t('glossary.howMuchLayoutJumpsWhile'),
  TBT: $t('glossary.totalTimeMainThreadBlocked'),
  FCP: $t('glossary.timeUntilFirstContentAppears'),
  "Speed Index": $t('glossary.howFastPageContentShows'),
  TTI: $t('glossary.timeUntilPageRespondsSmoothly'),
  服务器响应: $t('glossary.timeFirstByteServerUnder'),
  执行者: $t('glossary.whoPerformsStepAgentsUse'),
  // Concepts
  记忆: $t('glossary.longTermFactsAboutProject'),
  知识库: $t('glossary.materialLookedUpWhenNeeded'),
  做法: $t('glossary.stepsKindWorkWhoStep'),
  Skills: $t('glossary.instructionsTeachAgentHowSomething'),
  "Agent": $t('glossary.agentUsesRunnerResearchDocuments'),
  "在线 AI": $t('glossary.modelServerNocobaseAiPlugin'),
  数据健康: $t('glossary.whetherDataSourceLatestSync'),
  月度预算: $t('glossary.mostProjectDataforseoQueriesThrough'),
  结果不确定: $t('glossary.requestGotNoClearResult'),
});
// Looked up by the Chinese name (labels from the server) or by its English text (labels already translated).
let byShownName: Map<string, string> | undefined;
let glossaryLocale: string | undefined;
export const help = (name?: string | null): string | undefined => {
  if (!name) return undefined;
  const key = name.trim();
  if (glossaryLocale !== getCurrentLocale() || !byShownName) {
    glossaryLocale = getCurrentLocale();
    byShownName = new Map(Object.entries(getGlossary()).flatMap(([zh, text]) => [[zh, text], [$legacyText(zh), text]]));
  }
  return byShownName.get(key);
};
