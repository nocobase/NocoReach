'use strict';
const {createHash,randomBytes}=require('node:crypto');
const g=require('./google-client.cjs');
const {SyncService}=require('./sync-service.cjs');
const {callbackReason}=require('./oauth-errors.cjs');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const {projectId,secretKey,requireAccess,callbackUri}=require('./policy.cjs');
const RETURN='/connections';
const CONFIG='NOREACH_GOOGLE_';
class ReachDomain{
 constructor(dependencies){Object.assign(this,dependencies);this.starts=[];}
 on(event,fn){if(event==='afterStart')this.starts.push(fn);}
 env(key){return this.settings.get(key)||'';}
 async variable(name,value,secret=false){await this.saveSetting(name,value,secret);}
 config(){const clientId=this.env(CONFIG+'CLIENT_ID'),clientSecret=this.env(CONFIG+'CLIENT_SECRET'),base=this.env(CONFIG+'BASE_URL');if(!clientId||!clientSecret||!base)throw Object.assign(new Error('请先由系统管理员配置 Google OAuth 应用'),{status:409});return {clientId,clientSecret,redirectUri:callbackUri(base)};}
 // Projects: project 1 in the original record, later ones in project:<id> (see projects.js).
 async project(id){return this.projects.get(String(id));}
 async projectIds(){return this.projects.ids();}
 async link(id){return this.store.repository('nrGoogleLinks').findOne({filter:{projectId:id}});}
 async metadata(id,values){const r=this.store.repository('nrGoogleLinks'),existing=await this.link(id);return existing?await r.update({filterByTk:existing.id,values}):await r.create({values:{projectId:id,...values}});}
 async token(id){const refresh=this.env(secretKey(id));if(!refresh)throw Object.assign(new Error('请先授权 Google 账号'),{status:409});const c=this.config();const tokens=await g.googleJson(g.GOOGLE_ENDPOINTS.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:refresh,grant_type:'refresh_token'}),signal:AbortSignal.timeout(20000)});if(!tokens.access_token)throw new Error('No access token');return tokens.access_token;}
 async resources(id){const token=await this.token(id),analytics=[];let pageToken='';do{const url=new URL(g.GOOGLE_ENDPOINTS.analyticsAdmin+'/accountSummaries');url.searchParams.set('pageSize','200');if(pageToken)url.searchParams.set('pageToken',pageToken);const result=await g.googleJson(url,{...g.jsonRequest(token),signal:AbortSignal.timeout(20000)});for(const account of result.accountSummaries||[])for(const property of account.propertySummaries||[])analytics.push({id:property.property.replace('properties/',''),name:property.displayName});pageToken=result.nextPageToken||'';if(analytics.length>10000)throw new Error('Resource limit');}while(pageToken);const sites=await g.googleJson(g.GOOGLE_ENDPOINTS.searchConsole+'/sites',{...g.jsonRequest(token),signal:AbortSignal.timeout(20000)});return {analytics,searchConsole:(sites.siteEntry||[]).filter(s=>s.permissionLevel!=='siteUnverifiedUser').map(s=>({id:s.siteUrl,name:s.siteUrl}))};}
 async load(){
  this.projects=new (require('./projects.cjs').Projects)(this);this.projects.register();
  this.members=new (require('./members.cjs').Members)(this);this.members.register();
  this.notifications=new (require('./notifications.cjs').Notifications)(this);
  this.taskData=new (require('./task-data.cjs').TaskData)(this);
  const {KeywordService}=require('./keyword-service.cjs');
  this.keywordService=new KeywordService(this);this.keywordService.register();
  this.keywordSuggest=new (require('./keyword-suggest.cjs').KeywordSuggest)(this);this.keywordSuggest.register();
  new (require('./domain-service.cjs').DomainService)(this).register();
  this.rankTracking=new (require('./rank-tracking.cjs').RankTracking)(this);this.rankTracking.register();
  this.aiSearch=new (require('./ai-search.cjs').AiSearch)(this);this.aiSearch.register();
  this.sync=new SyncService(this);
  this.sources=new (require('./public-sources.cjs').PublicSources)(this);this.sources.register();
  this.siteContent=new (require('./site-content.cjs').SiteContent)(this);this.siteContent.register();
  this.audit=new (require('./audit.cjs').SiteAudit)(this);this.audit.register();
  new (require('./lighthouse.cjs').Lighthouse)(this).register();
  this.github=new (require('./github-source.cjs').GitHubSource)(this);this.github.register();
  this.community=new (require('./community-source.cjs').CommunitySource)(this);this.community.register();
  this.packages=new (require('./packages-source.cjs').PackagesSource)(this);this.packages.register();
  this.hackernews=new (require('./hackernews-source.cjs').HackerNewsSource)(this);this.hackernews.register();
  this.reddit=new (require('./reddit-source.cjs').RedditSource)(this);this.reddit.register(require('./data-views.cjs').windowFor);
  this.trends=new (require('./trends-source.cjs').TrendsSource)(this);this.trends.register();
  this.competitors=new (require('./competitor-watch.cjs').CompetitorWatch)(this);this.competitors.register();
  this.competitorResearch=new (require('./competitor-research.cjs').CompetitorResearch)(this);this.competitorResearch.register();
  this.aiQuestions=new (require('./ai-questions.cjs').AiQuestions)(this);this.aiQuestions.register();
  this.xSource=new (require('./x-source.cjs').XSource)(this);this.xSource.register(require('./data-views.cjs').windowFor);
  this.chat=new (require('./chat-source.cjs').ChatSource)(this);this.chat.register(require('./data-views.cjs').windowFor);
  this.insightSummary=new (require('./insight-summary.cjs').InsightSummary)(this);this.insightSummary.register();
  new (require('./source-discovery.cjs').SourceDiscovery)(this).register();
  new (require('./project-icon.cjs').ProjectIcon)(this).register();
  this.health=new (require('./data-health.cjs').DataHealth)(this);this.health.register();
  this.analysisRules=new (require('./analysis-rules.cjs').AnalysisRules)(this);this.analysisRules.register();
  this.signals=new (require('./signals.cjs').SignalEngine)(this);this.signals.register();
  this.analysis=new (require('./daily-analysis.cjs').DailyAnalysis)(this);this.analysis.register();
  this.onlineAI=new (require('./online-ai.cjs').OnlineAI)(this);this.onlineAI.register();
  this.knowledge=new (require('./knowledge.cjs').Knowledge)(this);this.knowledge.register();
  this.skills=new (require('./skills.cjs').Skills)(this);this.skills.register();
  new (require('./knowledge-suggest.cjs').KnowledgeSuggest)(this).register();
  this.memoryUpdates=new (require('./memory-update.cjs').MemoryUpdate)(this);this.memoryUpdates.register();
  this.dataViews=new (require('./data-views.cjs').DataViews)(this);this.dataViews.register();
  this.taskExecution=new (require('./execution/service.js').TaskService)(this);this.taskExecution.register();
  this.strategy=new (require('./strategy-service.cjs').StrategyService)(this);this.strategy.register();
  const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const values=ctx.action.params.values||{},id=projectId(values.projectId||ctx.action.params.projectId||ctx.request.query.projectId);await this.project(id);ctx.body=await fn.call(this,ctx,id,values);await next();}catch(e){if(e.status&&e.status<500)ctx.throw(e.status,e.message);ctx.throw(502,'连接请求未完成，请检查 Google 配置、账号权限或网络后重试。');}};
  this.routes.define({name:'nrGoogle',actions:{
   status:wrap(async function(ctx,id){const link=await this.link(id);const base=this.env(CONFIG+'BASE_URL');return {configured:Boolean(this.env(CONFIG+'CLIENT_ID')&&this.env(CONFIG+'CLIENT_SECRET')&&base),redirectUri:base?callbackUri(base):null,authorized:Boolean(this.env(secretKey(id))),connection:link?.toJSON()||null,syncEnabled:Boolean(link?.get('scheduleEnabled'))};}),
   configure:wrap(async function(ctx,id,v){const clientId=String(v.clientId||'').trim(),secret=ctx.request.headers['x-noreach-google-secret'];const redirectUri=callbackUri(String(v.baseUrl||''));if(!clientId.endsWith('.apps.googleusercontent.com')||!secret)ctx.throw(400,'请提供有效客户端 ID 和客户端密钥');if(this.env(CONFIG+'CLIENT_ID')&&this.env(CONFIG+'CLIENT_ID')!==clientId)ctx.throw(409,'更换 OAuth 应用前须完成已有连接的迁移评审');await this.variable(CONFIG+'CLIENT_ID',clientId);await this.variable(CONFIG+'CLIENT_SECRET',String(secret),true);await this.variable(CONFIG+'BASE_URL',new URL(redirectUri).origin+new URL(redirectUri).pathname.replace(/api\/reach\/nrGoogle\/callback$/,''));return {configured:true,redirectUri};}),
   authorize:wrap(async function(ctx,id){const c=this.config();const state=g.createOAuthState(),nonce=randomBytes(32).toString('hex');await ctx.cache.set(g.stateCacheKey(state),{id,userId:String(ctx.auth.user.id),nonceHash:createHash('sha256').update(nonce).digest('hex')},600000);ctx.cookies.set('nr_google_oauth',nonce,{httpOnly:true,sameSite:'lax',secure:c.redirectUri.startsWith('https:'),maxAge:600000,path:new URL(this.config().redirectUri).pathname,signed:false});return {authorizationUrl:g.buildAuthorizationUrl({...c,state})};}),
   callback:async(ctx,next)=>{ctx.set('Cache-Control','no-store');ctx.set('Referrer-Policy','no-referrer');let stage='state';try{const state=String(ctx.request.query.state||'');if(!state)fail('state_expired');const key=g.stateCacheKey(state),saved=await ctx.cache.get(key);const nonce=ctx.cookies.get('nr_google_oauth',{signed:false});if(!saved||!nonce||createHash('sha256').update(nonce).digest('hex')!==saved.nonceHash)fail('state_expired');await ctx.cache.del(key);ctx.cookies.set('nr_google_oauth',null,{path:new URL(this.config().redirectUri).pathname,signed:false});await this.project(saved.id);if(ctx.request.query.error)fail('authorization_denied');stage='exchange';const c=this.config();const tokens=await g.googleJson(g.GOOGLE_ENDPOINTS.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:c.redirectUri,code:String(ctx.request.query.code||''),grant_type:'authorization_code'}),signal:AbortSignal.timeout(20000)});if(!tokens.refresh_token||!tokens.access_token)fail('missing_token');const required=g.GOOGLE_SCOPES.filter(s=>s.startsWith('https:'));if(required.some(s=>!String(tokens.scope||'').split(' ').includes(s)))fail('missing_permissions');stage='identity';const identity=await g.googleJson(g.GOOGLE_ENDPOINTS.userInfo,{...g.jsonRequest(tokens.access_token),signal:AbortSignal.timeout(20000)});stage='save';await this.variable(secretKey(saved.id),tokens.refresh_token,true);await this.metadata(saved.id,{accountEmail:identity.email||'',authorizedAt:new Date().toISOString(),status:'awaiting_selection'});ctx.redirect(RETURN+'?google=authorized');}catch(e){const reason=callbackReason(e,stage);ctx.logger.warn('NocoReach Google callback failed',{stage,reason});ctx.redirect(RETURN+'?google=error&reason='+reason);}await next();},
   syncStatus:wrap(async function(ctx,id){return this.sync.status(id);}),
   syncNow:wrap(async function(ctx,id,v){return this.sync.enqueue(id,Number(v.days||56));}),
   syncControl:wrap(async function(ctx,id,v){await this.sync.control(id,v.command);return this.sync.status(id);}),
   resources:wrap(async function(ctx,id){return await this.resources(id);}),
   select:wrap(async function(ctx,id,v){const r=await this.resources(id);const ga4=String(v.ga4||''),gsc=String(v.gsc||'');if(!r.analytics.some(x=>x.id===ga4)||!r.searchConsole.some(x=>x.id===gsc))ctx.throw(400,'请从授权账号可访问的资源中选择');const p=await this.project(id);if(!p.analyticsPropertyId&&!p.searchConsoleProperty)await this.projects.update(id,cur=>({...cur,analyticsPropertyId:ga4,searchConsoleProperty:gsc}));else if(ga4!==String(p.analyticsPropertyId)||gsc!==p.searchConsoleProperty)ctx.throw(409,'所选资源与当前历史数据不一致。为防止串站，需新建项目后接入。');await this.metadata(id,{ga4PropertyId:ga4,gscSiteUrl:gsc,status:'ready_for_sync'});return {selected:true,syncEnabled:false};}),
   disconnect:wrap(async function(ctx,id){await this.sync.control(id,'pause');await this.variable(secretKey(id),null);await this.metadata(id,{scheduleEnabled:false,status:'disconnected',accountEmail:'',authorizedAt:null});return {disconnected:true,historyRetained:true};})
  }});
  this.routes.allow('nrGoogle','callback','public');
  this.routes.allow('nrGoogle',['status','configure','authorize','resources','select','disconnect','syncStatus','syncNow','syncControl'],'loggedIn');
  // Retries and the missed run of the daily analysis (see daily-analysis.js), checked every minute.
 }
}
module.exports={ReachDomain};
