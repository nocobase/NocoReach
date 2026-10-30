import { $t } from '#i18n';
import {connectSource,connectionState,type SourceState,type StatusInput} from '../../shared/connect-sources.js';
export type {SourceState,StatusInput};
// Data source catalog (SPEC §11). Planned sources are listed for transparency but cannot be connected.
export type Availability='available'|'soon'|'planned';
export type CatalogSource={id:string;category:SourceCategory;name:string;detects:string;priority:'P0'|'P1'|'P2';availability:Availability;guide?:{intro:string;needs:string[]}};
// Same groups as the data menu (2026-10-04): each source sits where its data is viewed (GitHub Discussions on the GitHub
// page, Search Console on Search performance). The first group holds what the Agent writes to rather than reads from:
// the website repository it opens PRs against and the blog CMS it publishes approved articles to. It comes first
// (2026-10-22): every change the Agent makes lands in one of them.
// Stable IDs are shared by the catalog and filters; only the visible labels are translated.
export type SourceCategory = 'site' | 'search' | 'community' | 'agent';
export const categories: { id: SourceCategory; label: string }[] = [
 { id: 'agent', label: 'dataSources.categories.agent' },
 { id: 'site', label: 'dataSources.categories.website' },
 { id: 'search', label: 'dataSources.categories.search' },
 { id: 'community', label: 'dataSources.categories.community' },
];
// What to prepare comes from the shared table, so the page and `connect list` say the same.
const needsOf=(id:string)=>(connectSource(id)?.needs??[]).map(key=>$t(key));
export const getCatalog = (): CatalogSource[] => ([
 {id:'ga4',category:'site',name:'GA4',detects:$t('dataSources.whereTrafficComesWhichPages'),priority:'P0',availability:'available',guide:{intro:$t('dataSources.ga4SearchConsoleShare'),needs:needsOf('ga4')}},
 {id:'site',category:'site',name:$t('common.websiteContent'),detects:$t('dataSources.fullPageListTypesStale'),priority:'P0',availability:'available',guide:{intro:$t('dataSources.websiteSetupHelp'),needs:needsOf('site')}},
 {id:'github',category:'site',name:$t('dataSources.githubRepository'),detects:$t('dataSources.dailyStarForkGrowthNew'),priority:'P0',availability:'available',guide:{intro:$t('dataSources.githubSetupHelp'),needs:needsOf('github')}},
 {id:'github-traffic',category:'site',name:'GitHub Traffic',detects:$t('dataSources.repositoryViewsClonesSitesRefer'),priority:'P0',availability:'available',guide:{intro:$t('dataSources.githubTrafficSetupHelp'),needs:needsOf('github-traffic')}},
 {id:'github-discussions',category:'site',name:'GitHub Discussions',detects:$t('dataSources.frequentQuestionsTopicsRepositoryDiscussions'),priority:'P1',availability:'available',guide:{intro:$t('dataSources.githubDiscussionsHelp'),needs:needsOf('github-discussions')}},
 {id:'packages',category:'site',name:$t('dataSources.npmPypiDockerHubDownloads'),detects:$t('dataSources.realAdoptionTrendCloserActual'),priority:'P1',availability:'available',guide:{intro:$t('dataSources.packagesSetupHelp'),needs:needsOf('packages')}},
 {id:'repo',category:'agent',name:$t('dataSources.websiteSourceGitRepository'),detects:$t('dataSources.agentChangesSiteInRepositories'),priority:'P0',availability:'available',guide:{intro:$t('dataSources.repositoriesSetupHelp'),needs:needsOf('repo')}},
 {id:'articles',category:'agent',name:$t('dataSources.articlePublishing'),detects:$t('dataSources.articlePublishingDetects'),priority:'P0',availability:'available',guide:{intro:$t('dataSources.articlePublishingIntro'),needs:needsOf('articles')}},
 {id:'gsc',category:'search',name:'Google Search Console',detects:$t('dataSources.pagesLowCtrRankingsClose'),priority:'P0',availability:'available',guide:{intro:$t('dataSources.iLlWalkThroughGoogle'),needs:needsOf('gsc')}},
 {id:'keywords',category:'search',name:$t('dataSources.dataforseoKeywordsCompetitorsAiSearch'),detects:$t('dataSources.searchVolumeDifficultyResultsKeyword'),priority:'P1',availability:'available',guide:{intro:$t('dataSources.dataforseoSetupHelp'),needs:needsOf('keywords')}},
 {id:'trends',category:'search',name:'Google Trends',detects:$t('dataSources.googleInterestProductCompetitorsKeywords'),priority:'P2',availability:'available',guide:{intro:$t('dataSources.trendsSetupHelp'),needs:needsOf('trends')}},
 {id:'competitors',category:'search',name:$t('common.competitorActivity'),detects:$t('dataSources.newPagesCompetitorWebsitesNew'),priority:'P2',availability:'available',guide:{intro:$t('dataSources.competitorWatchSetupHelp'),needs:needsOf('competitors')}},
 {id:'ai-visibility',category:'search',name:$t('dataSources.aiSearchVisibility'),detects:$t('dataSources.whetherAiAnswersLikeChatgpt'),priority:'P2',availability:'available',guide:{intro:$t('dataSources.aiSearchSetupHelp'),needs:needsOf('ai-visibility')}},
 {id:'discourse',category:'community',name:$t('common.discourseForum'),detects:$t('dataSources.recurringQuestionsChangesDiscussionVolume'),priority:'P0',availability:'available',guide:{intro:$t('dataSources.forumSetupHelp'),needs:needsOf('discourse')}},
 {id:'mentions',category:'community',name:$t('common.hackerNewsMentions'),detects:$t('dataSources.whereProductDiscussedHowMuch'),priority:'P1',availability:'available',guide:{intro:$t('dataSources.hackerNewsSetupHelp'),needs:needsOf('mentions')}},
 {id:'reddit',category:'community',name:$t('dataSources.redditDiscussions'),detects:$t('dataSources.whichRedditPostsTalkAbout'),priority:'P1',availability:'available',guide:{intro:$t('dataSources.redditSetupHelp'),needs:needsOf('reddit')}},
 {id:'social',category:'community',name:'X',detects:$t('dataSources.postsXMentioningProductDaily'),priority:'P2',availability:'available',guide:{intro:$t('dataSources.xSetupHelp'),needs:needsOf('social')}},
 {id:'bilibili',category:'community',name:'Bilibili',detects:$t('dataSources.publicVideoSearchSummariesSelected'),priority:'P2',availability:'available'},
 {id:'xiaohongshu',category:'community',name:$t('dataSources.xiaohongshuBrowserCollection'),detects:$t('dataSources.productNotesFoundAuthorizedBrowser'),priority:'P2',availability:'available'},
 {id:'youtube',category:'community',name:'YouTube',detects:$t('youtube.contentDescription'),priority:'P1',availability:'available'},
 {id:'discord',category:'community',name:'Discord',detects:$t('dataSources.discordDescription'),priority:'P2',availability:'available',guide:{intro:$t('dataSources.discordSetupHelp'),needs:needsOf('discord')}},
 {id:'slack',category:'community',name:'Slack',detects:$t('dataSources.slackDescription'),priority:'P2',availability:'available',guide:{intro:$t('dataSources.slackSetupHelp'),needs:needsOf('slack')}},
]);
// Status shown on each catalog card; derived only from saved connection state, never assumed (shared with `connect list`).
export function sourceState(source:CatalogSource,input:StatusInput):SourceState{
 if(source.id!=='bilibili'&&source.availability!=='available')return source.availability;
 return connectionState(source.id,input);
}
export const getStateLabels = (): Record<SourceState,string> => ({connected:$t('common.connected'),partial:$t('dataSources.partlyDone'),ready:$t('dataSources.available'),'needs-admin':$t('dataSources.needsAdminSetup'),soon:$t('dataSources.comingSoon'),planned:$t('dataSources.planned'),unconfigured:$t('dataSources.notConfigured'),pending:$t('common.notVerified'),attention:$t('dataHealth.needsAttention'),done:$t('dataSources.collected')});
