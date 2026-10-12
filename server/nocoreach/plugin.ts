// @ts-nocheck
import { createHash, randomBytes } from 'node:crypto';
import * as g from './google-client.js';
import { ProxyProfiles } from './proxy-profiles.js';
import { OutboundNetwork } from './outbound-network.js';
import { SyncService } from './sync-service.js';
import { callbackReason } from './oauth-errors.js';
import { AiQuestions } from './ai-questions.js';
import { AiSearch } from './ai-search.js';
import { AnalysisRules } from './analysis-rules.js';
import { SiteAudit } from './audit.js';
import { ChatSource } from './chat-source.js';
import { CommunitySource } from './community-source.js';
import { CompetitorResearch } from './competitor-research.js';
import { CompetitorWatch } from './competitor-watch.js';
import { DailyAnalysis } from './daily-analysis.js';
import { DataHealth } from './data-health.js';
import { DataViews, windowFor } from './data-views.js';
import { DomainService } from './domain-service.js';
import { GitHubSource } from './github-source.js';
import { HackerNewsSource } from './hackernews-source.js';
import { InsightSummary } from './insight-summary.js';
import { KeywordService } from './keyword-service.js';
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
const fail=code=>{throw Object.assign(new Error(code),{code});};
import { projectId, secretKey, requireAccess, callbackUri, CALLBACK_PATH } from './policy.js';

const CONFIG='NOREACH_GOOGLE_';
// The classic plugin's entry point (plugins/connections/server/index.js), run on the legacy layer: the same services in
// the same order, the same Google actions, the same timers, now named so the NocoBase 3 scheduler can keep them.
// Changed: settings live in nrVariables (legacy/variables.ts) instead of NocoBase environment variables; the tables come
// from a migration; NocoBase 3 has no generic table API to guard; redirects go to the app's own base path.
export class Connections{
 youtube: YouTubeSource;
 youtubeCron?: ReturnType<LegacyApp['cronJobManager']['addJob']>;
 agents: import('@nocobase/app-plugin-agents/server/tokens').Agents;
 members: Members;
 projects: Projects;
 network: OutboundNetwork;
 proxyProfiles: ProxyProfiles;
 bilibili?: BilibiliSource;
 xiaohongshu?: XiaohongshuSource;
 constructor(app,variables,{basePath,browserCollectors=[]}: {basePath:string;browserCollectors?:unknown}){this.browserCollectors=browserCollectors;this.basePath=basePath;this.app=app;this.db=app.db;this.variables=variables;this.proxyProfiles=new ProxyProfiles(variables);this.network=new OutboundNetwork(this.proxyProfiles);this.RETURN=`${basePath}/connections`;}
 env(key){return this.app.environment.getVariables()[key]||'';}
 async variable(name,value,secret=false){await this.variables.set(name,value,secret);}
 config(){const clientId=this.env(CONFIG+'CLIENT_ID'),clientSecret=this.env(CONFIG+'CLIENT_SECRET'),base=this.env(CONFIG+'BASE_URL');if(!clientId||!clientSecret||!base)throw Object.assign(new Error('请先由系统管理员配置 Google OAuth 应用'),{status:409});return {clientId,clientSecret,redirectUri:callbackUri(base)};}
 // Projects: project 1 in the original record, later ones in project:<id> (see projects.js).
 async project(id){return this.projects.get(String(id));}
 async projectIds(){return this.projects.ids();}
 async link(id){return this.db.getRepository('nrGoogleLinks').findOne({filter:{projectId:id}});}
 async metadata(id,values){const r=this.db.getRepository('nrGoogleLinks'),existing=await this.link(id);return existing?await r.update({filterByTk:existing.id,values}):await r.create({values:{projectId:id,...values}});}
 async token(id,signal){const refresh=this.env(secretKey(id));if(!refresh)throw Object.assign(new Error('请先授权 Google 账号'),{status:409});const c=this.config();const tokens=await this.googleJson(id,g.GOOGLE_ENDPOINTS.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:refresh,grant_type:'refresh_token'}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});if(!tokens.access_token)throw new Error('No access token');return tokens.access_token;}
 async resources(id){const token=await this.token(id),analytics=[];let pageToken='';do{const url=new URL(g.GOOGLE_ENDPOINTS.analyticsAdmin+'/accountSummaries');url.searchParams.set('pageSize','200');if(pageToken)url.searchParams.set('pageToken',pageToken);const result=await this.googleJson(id,url,{...g.jsonRequest(token),signal:AbortSignal.timeout(20000)});for(const account of result.accountSummaries||[])for(const property of account.propertySummaries||[])analytics.push({id:property.property.replace('properties/',''),name:property.displayName});pageToken=result.nextPageToken||'';if(analytics.length>10000)throw new Error('Resource limit');}while(pageToken);const sites=await this.googleJson(id,g.GOOGLE_ENDPOINTS.searchConsole+'/sites',{...g.jsonRequest(token),signal:AbortSignal.timeout(20000)});return {analytics,searchConsole:(sites.siteEntry||[]).filter(s=>s.permissionLevel!=='siteUnverifiedUser').map(s=>({id:s.siteUrl,name:s.siteUrl}))};}
 googleFetch(id){return (url,init)=>this.network.fetch('google',url,init,String(id));}
 googleJson(id,url,init){return g.googleJson(url,init,this.googleFetch(id));}
 async load(){
  this.proxyProfiles.register(this);
  this.projects=new Projects(this);this.projects.register();
  this.members=new Members(this);this.members.register();
  this.notifications=new Notifications(this);
  this.taskData=new TaskData(this);
  
  this.keywordService=new KeywordService(this);this.keywordService.register();
  this.keywordSuggest=new KeywordSuggest(this);this.keywordSuggest.register();
  new DomainService(this).register();
  this.rankTracking=new RankTracking(this);this.rankTracking.register();
  this.aiSearch=new AiSearch(this);this.aiSearch.register();
  this.sync=new SyncService(this);
  this.sources=new PublicSources(this);this.sources.register();
  this.siteContent=new SiteContent(this);this.siteContent.register();
  this.audit=new SiteAudit(this);this.audit.register();
  new Lighthouse(this).register();
  this.github=new GitHubSource(this);this.github.register();
  this.community=new CommunitySource(this);this.community.register();
  this.packages=new PackagesSource(this);this.packages.register();
  this.youtube=new YouTubeSource(this);this.youtube.register();
  this.hackernews=new HackerNewsSource(this);this.hackernews.register();
  this.bilibili=new BilibiliSource(this,this.browserCollectors);this.bilibili.register();
  this.xiaohongshu=new XiaohongshuSource(this,this.browserCollectors);this.xiaohongshu.register();
  this.network.bind(this.xiaohongshu,['test','search']);
  this.reddit=new RedditSource(this);this.reddit.register(windowFor);
  this.trends=new TrendsSource(this);this.trends.register();
  this.competitors=new CompetitorWatch(this);this.competitors.register();
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
  new OnlineAI(this).register();
  this.knowledge=new Knowledge(this);this.knowledge.register();
  this.skills=new Skills(this);this.skills.register();
  new KnowledgeSuggest(this).register();
  this.memoryUpdates=new MemoryUpdate(this);this.memoryUpdates.register();
  this.dataViews=new DataViews(this);this.dataViews.register();
  this.taskExecution=new (TaskService)(this);this.taskExecution.register();
  this.taskCron=this.app.cronJobManager.addJob({name:'taskCron',cronTime:'*/2 * * * * *',onTick:()=>this.taskExecution.tick().catch(e=>this.app.logger.warn('NocoReach task tick failed',{message:e?.message}))});
  this.strategy=new StrategyService(this);this.strategy.register();
  const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const values=ctx.action.params.values||{},id=projectId(values.projectId||ctx.action.params.projectId||ctx.request.query.projectId);await this.project(id);ctx.body=await fn.call(this,ctx,id,values);await next();}catch(e){if(e.status&&e.status<500)ctx.throw(e.status,e.message);ctx.throw(502,'连接请求未完成，请检查 Google 配置、账号权限或网络后重试。');}};
  this.app.resourceManager.define({name:'nrGoogle',actions:{
   status:wrap(async function(ctx,id){const link=await this.link(id);const base=this.env(CONFIG+'BASE_URL');return {configured:Boolean(this.env(CONFIG+'CLIENT_ID')&&this.env(CONFIG+'CLIENT_SECRET')&&base),redirectUri:base?callbackUri(base):null,authorized:Boolean(this.env(secretKey(id))),connection:link?.toJSON()||null,syncEnabled:Boolean(link?.get('scheduleEnabled'))};}),
   configure:wrap(async function(ctx,id,v){const clientId=String(v.clientId||'').trim(),secret=ctx.request.headers['x-noreach-google-secret'];const redirectUri=callbackUri(String(v.baseUrl||''));if(!clientId.endsWith('.apps.googleusercontent.com')||!secret)ctx.throw(400,'请提供有效客户端 ID 和客户端密钥');if(this.env(CONFIG+'CLIENT_ID')&&this.env(CONFIG+'CLIENT_ID')!==clientId)ctx.throw(409,'更换 OAuth 应用前须完成已有连接的迁移评审');await this.variable(CONFIG+'CLIENT_ID',clientId);await this.variable(CONFIG+'CLIENT_SECRET',String(secret),true);await this.variable(CONFIG+'BASE_URL',new URL(redirectUri).origin);return {configured:true,redirectUri};}),
   authorize:wrap(async function(ctx,id){const c=this.config();const state=g.createOAuthState(),nonce=randomBytes(32).toString('hex');await ctx.cache.set(g.stateCacheKey(state),{id,userId:String(ctx.auth.user.id),nonceHash:createHash('sha256').update(nonce).digest('hex')},600000);ctx.cookies.set('nr_google_oauth',nonce,{httpOnly:true,sameSite:'lax',secure:c.redirectUri.startsWith('https:'),maxAge:600000,path:CALLBACK_PATH(),signed:false});return {authorizationUrl:g.buildAuthorizationUrl({...c,state})};}),
   callback:async(ctx,next)=>{ctx.set('Cache-Control','no-store');ctx.set('Referrer-Policy','no-referrer');let stage='state';try{const state=String(ctx.request.query.state||'');if(!state)fail('state_expired');const key=g.stateCacheKey(state),saved=await ctx.cache.get(key);const nonce=ctx.cookies.get('nr_google_oauth',{signed:false});if(!saved||!nonce||createHash('sha256').update(nonce).digest('hex')!==saved.nonceHash)fail('state_expired');await ctx.cache.del(key);ctx.cookies.set('nr_google_oauth',null,{path:CALLBACK_PATH(),signed:false});await this.project(saved.id);if(ctx.request.query.error)fail('authorization_denied');stage='exchange';const c=this.config();const tokens=await this.googleJson(saved.id,g.GOOGLE_ENDPOINTS.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:c.redirectUri,code:String(ctx.request.query.code||''),grant_type:'authorization_code'}),signal:AbortSignal.timeout(20000)});if(!tokens.refresh_token||!tokens.access_token)fail('missing_token');const required=g.GOOGLE_SCOPES.filter(s=>s.startsWith('https:'));if(required.some(s=>!String(tokens.scope||'').split(' ').includes(s)))fail('missing_permissions');stage='identity';const identity=await this.googleJson(saved.id,g.GOOGLE_ENDPOINTS.userInfo,{...g.jsonRequest(tokens.access_token),signal:AbortSignal.timeout(20000)});stage='save';await this.variable(secretKey(saved.id),tokens.refresh_token,true);await this.metadata(saved.id,{accountEmail:identity.email||'',authorizedAt:new Date().toISOString(),status:'awaiting_selection'});ctx.redirect(this.RETURN+'?google=authorized');}catch(e){const reason=callbackReason(e,stage);ctx.logger.warn('NocoReach Google callback failed',{stage,reason});ctx.redirect(this.RETURN+'?google=error&reason='+reason);}await next();},
   syncStatus:wrap(async function(ctx,id){return this.sync.status(id);}),
   syncNow:wrap(async function(ctx,id,v){return this.sync.enqueue(id,Number(v.days||56));}),
   syncControl:wrap(async function(ctx,id,v){await this.sync.control(id,v.command);return this.sync.status(id);}),
   resources:wrap(async function(ctx,id){return await this.resources(id);}),
   select:wrap(async function(ctx,id,v){const r=await this.resources(id);const ga4=String(v.ga4||''),gsc=String(v.gsc||'');if(!r.analytics.some(x=>x.id===ga4)||!r.searchConsole.some(x=>x.id===gsc))ctx.throw(400,'请从授权账号可访问的资源中选择');const p=await this.project(id);if(!p.analyticsPropertyId&&!p.searchConsoleProperty)await this.projects.update(id,cur=>({...cur,analyticsPropertyId:ga4,searchConsoleProperty:gsc}));else if(ga4!==String(p.analyticsPropertyId)||gsc!==p.searchConsoleProperty)ctx.throw(409,'所选资源与当前历史数据不一致。为防止串站，需新建项目后接入。');await this.metadata(id,{ga4PropertyId:ga4,gscSiteUrl:gsc,status:'ready_for_sync'});return {selected:true,syncEnabled:false};}),
   disconnect:wrap(async function(ctx,id){await this.sync.control(id,'pause');await this.variable(secretKey(id),null);await this.metadata(id,{scheduleEnabled:false,status:'disconnected',accountEmail:'',authorizedAt:null});return {disconnected:true,historyRetained:true};})
  }});
  this.app.acl.allow('nrGoogle','callback','public');
  this.app.acl.allow('nrGoogle',['status','configure','authorize','resources','select','disconnect','syncStatus','syncNow','syncControl'],'loggedIn');
  this.syncCron=this.app.cronJobManager.addJob({name:'syncCron',cronTime:'*/15 * * * * *',onTick:()=>this.sync.tick().catch(e=>this.app.logger.warn('NocoReach sync tick failed',{message:e?.message}))});
  this.siteCron=this.app.cronJobManager.addJob({name:'siteCron',cronTime:'0 * * * * *',onTick:()=>this.siteContent.tick().catch(e=>this.app.logger.warn('NocoReach site content tick failed',{message:e?.message}))});
  this.githubCron=this.app.cronJobManager.addJob({name:'githubCron',cronTime:'0 */10 * * * *',onTick:()=>this.github.tick().catch(e=>this.app.logger.warn('NocoReach GitHub tick failed',{message:e?.message}))});
  this.communityCron=this.app.cronJobManager.addJob({name:'communityCron',cronTime:'30 */10 * * * *',onTick:()=>this.community.tick().catch(e=>this.app.logger.warn('NocoReach community tick failed',{message:e?.message}))});
  this.packagesCron=this.app.cronJobManager.addJob({name:'packagesCron',cronTime:'45 */10 * * * *',onTick:()=>this.packages.tick().catch(e=>this.app.logger.warn('NocoReach packages tick failed',{message:e?.message}))});
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
 async afterDisable(){if(this.youtube)await this.youtube.stop();if(this.youtubeCron)(this.app as LegacyApp).cronJobManager.removeJob(this.youtubeCron);this.bilibili?.stop();this.xiaohongshu?.stop();if(this.taskExecution)this.taskExecution.stop();if(this.taskCron)this.app.cronJobManager.removeJob(this.taskCron);if(this.syncCron)this.app.cronJobManager.removeJob(this.syncCron);if(this.siteCron)this.app.cronJobManager.removeJob(this.siteCron);if(this.githubCron)this.app.cronJobManager.removeJob(this.githubCron);if(this.communityCron)this.app.cronJobManager.removeJob(this.communityCron);if(this.packagesCron)this.app.cronJobManager.removeJob(this.packagesCron);if(this.hackernewsCron)this.app.cronJobManager.removeJob(this.hackernewsCron);if(this.redditCron)this.app.cronJobManager.removeJob(this.redditCron);if(this.memoryCron)this.app.cronJobManager.removeJob(this.memoryCron);if(this.trendsCron)this.app.cronJobManager.removeJob(this.trendsCron);if(this.competitorCron)this.app.cronJobManager.removeJob(this.competitorCron);if(this.competitorResearchCron)this.app.cronJobManager.removeJob(this.competitorResearchCron);if(this.aiQuestionsCron)this.app.cronJobManager.removeJob(this.aiQuestionsCron);if(this.xCron)this.app.cronJobManager.removeJob(this.xCron);if(this.chatCron)this.app.cronJobManager.removeJob(this.chatCron);if(this.rankCron)this.app.cronJobManager.removeJob(this.rankCron);}
}
