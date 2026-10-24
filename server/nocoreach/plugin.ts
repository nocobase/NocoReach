// @ts-nocheck
import { CollectorConnections } from './collector-connections.js';
import { ArticleTargets } from './articles/targets.js';
import { ArticleDelivery } from './articles/delivery.js';
import { assertPristineMockDataset } from './mock-isolation.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
import { createHash, randomBytes } from 'node:crypto';
import * as g from './google-client.js';
import { ProxyProfiles } from './proxy-profiles.js';
import { OutboundNetwork, unreachableOf } from './outbound-network.js';
import type { MockHost } from '../../app-plugins/nocoreach-mock/server/types.js';
import type { LegacyDatabase } from './legacy/database.js';
import type { MockEngine } from '../../app-plugins/nocoreach-mock/server/engine.js';
import { createMockXiaohongshuAdapter, createMockBilibiliAdapter, createMockYouTubeProvider } from './mock-collectors.js';
import { mockBrowserCollectors } from '../../app-plugins/nocoreach-mock/server/collectors.js';
import { SyncService } from './sync-service.js';
import { googleOAuthCallback } from './google-oauth-callback.js';
import type { LegacyContext } from './legacy/context.js';
import { AiQuestions } from './ai-questions.js';
import { AiSearch } from './ai-search.js';
import { OnlineProvider } from './execution/provider.js';
import { AutomaticSources } from './automatic-sources.js';
import { AnalysisRules } from './analysis-rules.js';
import { SiteAudit } from './audit.js';
import { ChatSource } from './chat-source.js';
import { CommunitySource } from './community-source.js';
import { CompetitorResearch } from './competitor-research.js';
import { CompetitorWatch } from './competitor-watch.js';
import { GitHubTrends } from './github-trends.js';
import { SearchIndex } from './search-index.js';
import type { DemoProjects } from './demo-data/upstream.js';
import type { DemoDataService, DemoModels } from '@nocobase/app-plugin-demo-mode/server/tokens';
import { DailyAnalysis } from './daily-analysis.js';
import { DataHealth } from './data-health.js';
import { DataViews, windowFor } from './data-views.js';
import { DomainService } from './domain-service.js';
import { GitHubSource } from './github-source.js';
import { HackerNewsSource } from './hackernews-source.js';
import { InsightSummary } from './insight-summary.js';
import { KeywordService } from './keyword-service.js';
import { KeywordDetail } from './keyword-detail.js';
import { KeywordSuggest } from './keyword-suggest.js';
import { Knowledge } from './knowledge.js';
import { KnowledgeSuggest } from './knowledge-suggest.js';
import { Lighthouse } from './lighthouse.js';
import { Members } from './members.js';
import { MemoryUpdate } from './memory-update.js';
import { Notifications } from './notifications.js';
import { OnlineAI } from './online-ai.js';
import { PackagesSource } from './packages-source.js';
import { ProjectIcon } from './project-icon.js';
import { Projects } from './projects.js';
import { BilibiliSource } from './bilibili-source.js';
import { PublicSources } from './public-sources.js';
import { RankTracking } from './rank-tracking.js';
import { XiaohongshuSource } from './xiaohongshu-source.js';
import { RedditSource } from './reddit-source.js';
import { SignalEngine } from './signals.js';
import { SiteContent } from './site-content.js';
import { Skills } from './skills.js';
import { SourceDiscovery } from './source-discovery.js';
import { StrategyService } from './strategy-service.js';
import { TaskData } from './task-data.js';
import { TrendsSource } from './trends-source.js';
import type { LegacyApp } from './legacy/app.js';
import { YouTubeSource } from './youtube-source.js';
import { XSource } from './x-source.js';
import { TaskService } from './execution/service.js';
import { projectId, secretKey, requireAccess, callbackUri, CALLBACK_PATH } from './policy.js';

const CONFIG='NOREACH_GOOGLE_';
// The classic plugin's entry point (plugins/connections/server/index.js), run on the legacy layer: the same services in
// the same order, the same Google actions, the same timers, now named so the NocoBase 3 scheduler can keep them.
// Changed: settings live in nrVariables (legacy/variables.ts) instead of NocoBase environment variables; the tables come
// from a migration; NocoBase 3 has no generic table API to guard; redirects go to the app's own base path.
export class Connections{
 sync: SyncService;
 analysis: DailyAnalysis;
 youtube: YouTubeSource;
 youtubeCron?: ReturnType<LegacyApp['cronJobManager']['addJob']>;
 agents: import('@nocobase/app-plugin-agents/server/tokens').Agents;
 taskExecution: TaskService;
 knowledge: Knowledge;
 skills: Skills;
 taskData: TaskData;
 strategy: StrategyService;
 dataViews: DataViews;
 siteContent: SiteContent;
 members: Members;
 projects: Projects;
 network: OutboundNetwork;
 proxyProfiles: ProxyProfiles;
 collectors: CollectorConnections;
 articleTargets: ArticleTargets;
 articles: ArticleDelivery;
 bilibili?: BilibiliSource;
 xiaohongshu?: XiaohongshuSource;
 /** When this application instance started; see execution/restarts.ts. */
 startedAt?: string;
 constructor(app,variables,{basePath,publicOrigin,browserCollectors=[],mock,startedAt}: {basePath:string;publicOrigin?:string;browserCollectors?:unknown;mock?:MockEngine;startedAt?:string}){this.startedAt=startedAt;this.publicOrigin=publicOrigin;this.mock=mock;this.browserCollectors=mock?.enabled?mockBrowserCollectors:browserCollectors;this.basePath=basePath;this.app=app;this.db=app.db;this.variables=variables;this.proxyProfiles=new ProxyProfiles(variables);this.network=new OutboundNetwork(this.proxyProfiles,mock);this.RETURN=`${basePath}/connections`;}
 mock?: MockEngine;
 // The demo data's projects, answered in process, and its simulated model (demo-data/).
 demoProjects?: DemoProjects;
 demoModels?: DemoModels;
 demoAgent?: import('@nocobase/app-plugin-demo-mode/server/tokens').DemoAgentProxy<import('./demo-data/demo-agent.js').DemoAgentInput, import('./demo-data/demo-agent.js').DemoAgentResult>;
 demoConfiguration?: import('@nocobase/app-plugin-demo-mode/server/tokens').DemoConfigurationService;
 demoData?: DemoDataService;
 env(key){return this.app.environment.getVariables()[key]||'';}
 async variable(name,value,secret=false){await this.variables.set(name,value,secret);}
 config(id?){if(this.mock?.enabled||(id!==undefined&&this.demoProjects?.has(String(id))))return {clientId:'nocoreach-simulated.apps.googleusercontent.com',clientSecret:'mock-only-no-credential',redirectUri:(this.publicOrigin||'http://127.0.0.1')+CALLBACK_PATH()};const clientId=this.env(CONFIG+'CLIENT_ID'),clientSecret=this.env(CONFIG+'CLIENT_SECRET'),base=this.env(CONFIG+'BASE_URL');if(!clientId||!clientSecret||!base)throw Object.assign(new Error(systemMessageText('application.systemAdminNeedsSetUp')),{status:409});return {clientId,clientSecret,redirectUri:callbackUri(base)};}
 // Projects: project 1 in the original record, later ones in project:<id> (see projects.js).
 async project(id){return this.projects.get(String(id));}
 async projectIds(){return this.projects.ids();}
 async link(id){return this.db.getRepository('nrGoogleLinks').findOne({filter:{projectId:id}});}
 async metadata(id,values){const r=this.db.getRepository('nrGoogleLinks'),existing=await this.link(id);return existing?await r.update({filterByTk:existing.id,values}):await r.create({values:{projectId:id,...values}});}
 async token(id,signal){const refresh=this.env(secretKey(id));if(!refresh)throw Object.assign(new Error(systemMessageText('application.authorizeGoogleAccountFirst')),{status:409});const c=this.config(id);const tokens=await this.googleJson(id,g.GOOGLE_ENDPOINTS.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:refresh,grant_type:'refresh_token'}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});if(!tokens.access_token)throw new Error('No access token');return tokens.access_token;}
 async resources(id){const token=await this.token(id),analytics=[];let pageToken='';do{const url=new URL(g.GOOGLE_ENDPOINTS.analyticsAdmin+'/accountSummaries');url.searchParams.set('pageSize','200');if(pageToken)url.searchParams.set('pageToken',pageToken);const result=await this.googleJson(id,url,{...g.jsonRequest(token),signal:AbortSignal.timeout(20000)});for(const account of result.accountSummaries||[])for(const property of account.propertySummaries||[])analytics.push({id:property.property.replace('properties/',''),name:property.displayName});pageToken=result.nextPageToken||'';if(analytics.length>10000)throw new Error('Resource limit');}while(pageToken);const sites=await this.googleJson(id,g.GOOGLE_ENDPOINTS.searchConsole+'/sites',{...g.jsonRequest(token),signal:AbortSignal.timeout(20000)});return {analytics,searchConsole:(sites.siteEntry||[]).filter(s=>s.permissionLevel!=='siteUnverifiedUser').map(s=>({id:s.siteUrl,name:s.siteUrl}))};}
 googleFetch(id){return (url,init)=>this.network.fetch('google',url,init,String(id));}
 googleJson(id,url,init){return g.googleJson(url,init,this.googleFetch(id));}
 async load(){
  this.proxyProfiles.register(this);
  this.projects=new Projects(this);this.projects.register();
  this.members=new Members(this);this.members.register();
  await this.mock?.attach({variables:this.variables as MockHost['variables'],app:this.app as MockHost['app'],project:(id)=>this.project(id),fixtureProject:async(id)=>{const project=await this.project(id);return {name:project.name,domain:project.domains[0]};},requireAccess,assertPristine:()=>assertPristineMockDataset(this.db as LegacyDatabase),projectSettings:(id,legacy)=>this.proxyProfiles.mockStatus(id,legacy)});
  await this.proxyProfiles.migrateMockSettings();
  // A broken proxy configuration must not stop the application; requests report it, and the move retries next start.
  await this.proxyProfiles.migrateDefaultProxy(()=>this.projectIds()).then(moved=>{if(moved.length)this.app.logger.warn('NocoReach moved connections from other proxies to the default proxy',{moved});},e=>this.app.logger.warn('NocoReach default proxy migration skipped',{message:e?.message}));
  this.notifications=new Notifications(this);
  this.taskData=new TaskData(this);
  
  this.keywordService=new KeywordService(this);this.keywordService.register();
  this.keywordSuggest=new KeywordSuggest(this);this.keywordSuggest.register();
  new DomainService(this).register();
  this.rankTracking=new RankTracking(this);this.rankTracking.register();
  this.aiSearch=new AiSearch(this);this.aiSearch.register();
  this.sync=new SyncService(this);
  this.automaticSources=new AutomaticSources(this,(system,prompt)=>new OnlineProvider(this).complete(system,prompt,'content-source-map',AbortSignal.timeout(30000)));this.automaticSources.register();
  this.sources=new PublicSources(this);this.sources.register();
  this.siteContent=new SiteContent(this);this.siteContent.register();
  this.audit=new SiteAudit(this);this.audit.register();
  new Lighthouse(this).register();
  this.github=new GitHubSource(this);this.github.register();
  this.community=new CommunitySource(this);this.community.register();
  this.packages=new PackagesSource(this);this.packages.register();
  this.collectors=new CollectorConnections(this.variables,this.db,this.browserCollectors,this.mock?.enabled??false);this.collectors.register(this);
  this.youtube=new YouTubeSource(this,this.mock?.enabled?createMockYouTubeProvider(()=>this.network.mockContext('youtube')):undefined);this.youtube.register(windowFor);
  this.hackernews=new HackerNewsSource(this);this.hackernews.register();
  this.bilibili=new BilibiliSource(this,this.mock?.enabled?createMockBilibiliAdapter(id=>this.network.mockContext('bilibili',id)):undefined);this.bilibili.register(windowFor);
  this.xiaohongshu=new XiaohongshuSource(this,this.mock?.enabled?createMockXiaohongshuAdapter(id=>this.network.mockContext('xiaohongshu',id)):undefined);this.xiaohongshu.register(windowFor);
  this.network.bind(this.xiaohongshu,['test','search'],'xiaohongshu');
  this.collectors.attach('xiaohongshu',this.xiaohongshu,['connect','test','search','disconnect']);
  this.collectors.attach('bilibili',this.bilibili,['connect','test','sync','disconnect']);
  this.collectors.attach('youtube',this.youtube,['connect','sync','disconnect','clear']);
  this.reddit=new RedditSource(this);this.reddit.register(windowFor);
  this.trends=new TrendsSource(this);this.trends.register();
  this.competitors=new CompetitorWatch(this);this.competitors.register();
  this.githubTrends=new GitHubTrends(this);this.githubTrends.register();
  this.competitorResearch=new CompetitorResearch(this);this.competitorResearch.register();
  this.aiQuestions=new AiQuestions(this);this.aiQuestions.register();
  this.xSource=new XSource(this);this.xSource.register(windowFor);
  this.chat=new ChatSource(this);this.chat.register(windowFor);
  this.insightSummary=new InsightSummary(this);this.insightSummary.register();
  new SourceDiscovery(this).register();
  new ProjectIcon(this).register();
  this.health=new DataHealth(this);this.health.register();
  this.analysisRules=new AnalysisRules(this);this.analysisRules.register();
  this.signals=new SignalEngine(this);this.signals.register();
  this.analysis=new DailyAnalysis(this);this.analysis.register();
  this.network.bind(this.analysis,['run','judge','judgeMissing']);
  new OnlineAI(this).register();
  this.knowledge=new Knowledge(this);this.knowledge.register();
  this.skills=new Skills(this);this.skills.register();
  new KnowledgeSuggest(this).register();
  this.memoryUpdates=new MemoryUpdate(this);this.memoryUpdates.register();
  this.dataViews=new DataViews(this);this.dataViews.register();
  new KeywordDetail(this).register();
  this.searchIndex=new SearchIndex(this);this.searchIndex.register();
  // Article publishing targets (articles/): CMS and API calls use the project's website egress, repository calls GitHub's.
  this.articleTargets=new ArticleTargets(this.variables,(id,connection)=>(url,init)=>this.network.fetch(connection,url,init,String(id)));this.articleTargets.register(this);
  this.articles=new ArticleDelivery(this.articleTargets);
  this.taskExecution=new (TaskService)(this);this.taskExecution.register();
  this.taskCron=this.app.cronJobManager.addJob({name:'taskCron',cronTime:'*/2 * * * * *',onTick:()=>this.taskExecution.tick().catch(e=>this.app.logger.warn('NocoReach task tick failed',{message:e?.message}))});
  this.strategy=new StrategyService(this);this.strategy.register();
  const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const values=ctx.action.params.values||{},id=projectId(values.projectId||ctx.action.params.projectId||ctx.request.query.projectId);await this.project(id);ctx.body=await fn.call(this,ctx,id,values);await next();}catch(e){if(e.status&&e.status<500)ctx.throw(e.status,e.message);ctx.throw(502,unreachableOf(e)?.message||systemMessageText('application.connectionRequestNotCompleteCheck'));}};
  this.app.resourceManager.define({name:'nrGoogle',actions:{
   status:wrap(async function(this: Connections,ctx,id){const link=await this.link(id);const base=this.env(CONFIG+'BASE_URL');return {configured:Boolean(this.mock?.enabled||(this.env(CONFIG+'CLIENT_ID')&&this.env(CONFIG+'CLIENT_SECRET')&&base)),redirectUri:this.mock?.enabled?CALLBACK_PATH():base?callbackUri(base):null,simulated:Boolean(this.mock?.enabled),authorized:Boolean(this.env(secretKey(id))),connection:link?.toJSON()||null,ga4PropertyName:(await this.project(id)).analyticsPropertyName||null,syncEnabled:Boolean(link?.get('scheduleEnabled'))};}),
   configure:wrap(async function(ctx,id,v){const clientId=String(v.clientId||'').trim(),secret=ctx.request.headers['x-noreach-google-secret'];const redirectUri=callbackUri(String(v.baseUrl||''));if(!clientId.endsWith('.apps.googleusercontent.com')||!secret)ctx.throw(400,systemMessageText('application.provideValidClientIdClient'));if(this.env(CONFIG+'CLIENT_ID')&&this.env(CONFIG+'CLIENT_ID')!==clientId)ctx.throw(409,systemMessageText('application.migratingExistingConnectionsReviewedBefore'));await this.variable(CONFIG+'CLIENT_ID',clientId);await this.variable(CONFIG+'CLIENT_SECRET',String(secret),true);await this.variable(CONFIG+'BASE_URL',new URL(redirectUri).origin);return {configured:true,redirectUri};}),
   authorize:wrap(async function(this: Connections,ctx,id){if(this.mock?.enabled)this.network.mockContext('google',String(id));const c=this.config();const state=g.createOAuthState(),nonce=randomBytes(32).toString('hex');await ctx.cache.set(g.stateCacheKey(state),{id,userId:String(ctx.auth.user.id),nonceHash:createHash('sha256').update(nonce).digest('hex')},600000);ctx.cookies.set('nr_google_oauth',nonce,{httpOnly:true,sameSite:'lax',secure:c.redirectUri.startsWith('https:'),maxAge:600000,path:CALLBACK_PATH(),signed:false});return {authorizationUrl:this.mock?.enabled?`${CALLBACK_PATH()}?${new URLSearchParams({state,code:'simulated-local-consent'}).toString()}`:g.buildAuthorizationUrl({...c,state}),simulated:Boolean(this.mock?.enabled)};}),
   callback:(ctx: LegacyContext,next: () => Promise<unknown>)=>googleOAuthCallback(this,ctx,next),
   syncStatus:wrap(async function(ctx,id){return this.sync.status(id);}),
   syncNow:wrap(async function(this: Connections,ctx: LegacyContext,id: string | number,v: Record<string,unknown>){return v.scope?this.sync.enqueueHistory(id,v):this.sync.enqueue(id,Number(v.days||56));}),
   syncControl:wrap(async function(ctx,id,v){await this.sync.control(id,v.command);return this.sync.status(id);}),
   resources:wrap(async function(ctx,id){return await this.resources(id);}),
   select:wrap(async function(ctx,id,v){const r=await this.resources(id);const ga4=String(v.ga4||''),gsc=String(v.gsc||'');if(!r.analytics.some(x=>x.id===ga4)||!r.searchConsole.some(x=>x.id===gsc))ctx.throw(400,systemMessageText('application.pickResourcesAuthorizedAccountAccess'));const {changed}=await this.sync.select(id,ga4,gsc,r.analytics.find(x=>x.id===ga4)?.name||'');return {selected:true,changed,syncEnabled:false};}),
   disconnect:wrap(async function(ctx,id){await this.sync.disconnect(id);return {disconnected:true,historyRetained:true};})
  }});
  this.app.acl.allow('nrGoogle','callback','public');
  this.app.acl.allow('nrGoogle',['status','configure','authorize','resources','select','disconnect','syncStatus','syncNow','syncControl'],'loggedIn');
  this.syncCron=this.app.cronJobManager.addJob({name:'syncCron',cronTime:'*/15 * * * * *',onTick:()=>this.sync.tick().catch(e=>this.app.logger.warn('NocoReach sync tick failed',{message:e?.message}))});
  this.siteCron=this.app.cronJobManager.addJob({name:'siteCron',cronTime:'0 * * * * *',onTick:()=>this.siteContent.tick().catch(e=>this.app.logger.warn('NocoReach site content tick failed',{message:e?.message}))});
  this.githubCron=this.app.cronJobManager.addJob({name:'githubCron',cronTime:'0 */10 * * * *',onTick:()=>this.github.tick().catch(e=>this.app.logger.warn('NocoReach GitHub tick failed',{message:e?.message}))});
  // GitHub 热点 once a day per project (github-trends.ts); the tick skips projects already read today.
  this.githubTrendsCron=this.app.cronJobManager.addJob({name:'githubTrendsCron',cronTime:'0 7,37 * * * *',onTick:()=>this.githubTrends.tick().catch(e=>this.app.logger.warn('NocoReach GitHub trends tick failed',{message:e?.message}))});
  this.communityCron=this.app.cronJobManager.addJob({name:'communityCron',cronTime:'30 */10 * * * *',onTick:()=>this.community.tick().catch(e=>this.app.logger.warn('NocoReach community tick failed',{message:e?.message}))});
  this.packagesCron=this.app.cronJobManager.addJob({name:'packagesCron',cronTime:'45 */10 * * * *',onTick:()=>this.packages.tick().catch(e=>this.app.logger.warn('NocoReach packages tick failed',{message:e?.message}))});
  // 搜索表现 · 索引: up to 25 pages every ten minutes, 500 a day per project (search-index.ts).
  this.searchIndexCron=this.app.cronJobManager.addJob({name:'searchIndexCron',cronTime:'40 */10 * * * *',onTick:()=>this.searchIndex.tick().catch(e=>this.app.logger.warn('NocoReach search index tick failed',{message:e?.message}))});
  this.rankCron=this.app.cronJobManager.addJob({name:'rankCron',cronTime:'0 5 * * * *',onTick:()=>this.rankTracking.tick().catch(e=>this.app.logger.warn('NocoReach rank tick failed',{message:e?.message}))});
  const youtubeApp=this.app as LegacyApp;
  this.youtubeCron=youtubeApp.cronJobManager.addJob({name:'youtubeCron',cronTime:'20 */10 * * * *',onTick:()=>this.youtube.tick().catch(()=>youtubeApp.logger.warn('NocoReach YouTube tick failed'))});
  this.hackernewsCron=this.app.cronJobManager.addJob({name:'hackernewsCron',cronTime:'15 */10 * * * *',onTick:()=>this.hackernews.tick().catch(e=>this.app.logger.warn('NocoReach Hacker News tick failed',{message:e?.message}))});
  this.trendsCron=this.app.cronJobManager.addJob({name:'trendsCron',cronTime:'0 35 * * * *',onTick:()=>this.trends.tick().catch(e=>this.app.logger.warn('NocoReach trends tick failed',{message:e?.message}))});
  this.competitorCron=this.app.cronJobManager.addJob({name:'competitorCron',cronTime:'0 50 * * * *',onTick:()=>this.competitors.tick().catch(e=>this.app.logger.warn('NocoReach competitor tick failed',{message:e?.message}))});
  this.competitorResearchCron=this.app.cronJobManager.addJob({name:'competitorResearchCron',cronTime:'0 20 4 * * *',onTick:()=>this.competitorResearch.tick().catch(e=>this.app.logger.warn('NocoReach competitor research tick failed',{message:e?.message}))});
  this.aiQuestionsCron=this.app.cronJobManager.addJob({name:'aiQuestionsCron',cronTime:'0 40 4 * * *',onTick:()=>this.aiQuestions.tick().catch(e=>this.app.logger.warn('NocoReach AI questions tick failed',{message:e?.message}))});
  this.xCron=this.app.cronJobManager.addJob({name:'xCron',cronTime:'0 55 * * * *',onTick:()=>this.xSource.tick().catch(e=>this.app.logger.warn('NocoReach X tick failed',{message:e?.message}))});
  this.chatCron=this.app.cronJobManager.addJob({name:'chatCron',cronTime:'0 15 * * * *',onTick:()=>this.chat.tick().catch(e=>this.app.logger.warn('NocoReach chat tick failed',{message:e?.message}))});
  this.memoryCron=this.app.cronJobManager.addJob({name:'memoryCron',cronTime:'0 40 * * * *',onTick:()=>this.memoryUpdates.tick().catch(e=>this.app.logger.warn('NocoReach memory tick failed',{message:e?.message}))});
  // Retries and the missed run of the daily analysis (see daily-analysis.js), checked every minute.
  this.analysisCron=this.app.cronJobManager.addJob({name:'analysisCron',cronTime:'10 * * * * *',onTick:()=>this.analysis.tick().catch(e=>this.app.logger.warn('NocoReach analysis tick failed',{message:e?.message}))});
  this.redditCron=this.app.cronJobManager.addJob({name:'redditCron',cronTime:'0 25 * * * *',onTick:()=>this.reddit.tick().catch(e=>this.app.logger.warn('NocoReach Reddit tick failed',{message:e?.message}))});
 }
 async afterDisable(){await Promise.all([this.trends,this.community,this.reddit,this.hackernews,this.packages,this.xSource,this.chat].map(async(source:{close():Promise<void>}|undefined)=>{if(source)await source.close();}));if(this.youtube)await this.youtube.stop();if(this.youtubeCron)(this.app as LegacyApp).cronJobManager.removeJob(this.youtubeCron);this.bilibili?.stop();this.xiaohongshu?.stop();if(this.taskExecution)this.taskExecution.stop();if(this.taskCron)this.app.cronJobManager.removeJob(this.taskCron);if(this.syncCron)this.app.cronJobManager.removeJob(this.syncCron);if(this.siteCron)this.app.cronJobManager.removeJob(this.siteCron);if(this.githubCron)this.app.cronJobManager.removeJob(this.githubCron);if(this.githubTrendsCron)this.app.cronJobManager.removeJob(this.githubTrendsCron);if(this.communityCron)this.app.cronJobManager.removeJob(this.communityCron);if(this.packagesCron)this.app.cronJobManager.removeJob(this.packagesCron);if(this.hackernewsCron)this.app.cronJobManager.removeJob(this.hackernewsCron);if(this.redditCron)this.app.cronJobManager.removeJob(this.redditCron);if(this.memoryCron)this.app.cronJobManager.removeJob(this.memoryCron);if(this.trendsCron)this.app.cronJobManager.removeJob(this.trendsCron);if(this.competitorCron)this.app.cronJobManager.removeJob(this.competitorCron);if(this.competitorResearchCron)this.app.cronJobManager.removeJob(this.competitorResearchCron);if(this.aiQuestionsCron)this.app.cronJobManager.removeJob(this.aiQuestionsCron);if(this.xCron)this.app.cronJobManager.removeJob(this.xCron);if(this.chatCron)this.app.cronJobManager.removeJob(this.chatCron);if(this.rankCron)this.app.cronJobManager.removeJob(this.rankCron);}
}
