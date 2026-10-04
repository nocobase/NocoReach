'use strict';
const {Plugin}=require('@nocobase/server');
const {createHash,randomBytes}=require('node:crypto');
const g=require('./google-client');
const {SyncService}=require('./sync-service');
const {callbackReason}=require('./oauth-errors');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const {projectId,secretKey,requireAdmin,callbackUri}=require('./policy');
const RETURN='/x/main/connections';
const CONFIG='NOREACH_GOOGLE_';
class Connections extends Plugin{
 env(key){return this.app.environment.getVariables()[key]||'';}
 async variable(name,value,secret=false){const r=this.db.getRepository('environmentVariables');const found=await r.findOne({filterByTk:name});if(value===null){if(found)await r.destroy({filterByTk:name});return;}const values={type:secret?'secret':'default',value};if(found)await r.update({filterByTk:name,values});else await r.create({values:{name,...values}});}
 config(){const clientId=this.env(CONFIG+'CLIENT_ID'),clientSecret=this.env(CONFIG+'CLIENT_SECRET'),base=this.env(CONFIG+'BASE_URL');if(!clientId||!clientSecret||!base)throw Object.assign(new Error('请先由系统管理员配置 Google OAuth 应用'),{status:409});return {clientId,clientSecret,redirectUri:callbackUri(base)};}
 // Projects: project 1 in the original record, later ones in project:<id> (see projects.js).
 async project(id){return this.projects.get(String(id));}
 async projectIds(){return this.projects.ids();}
 async link(id){return this.db.getRepository('nrGoogleLinks').findOne({filter:{projectId:id}});}
 async metadata(id,values){const r=this.db.getRepository('nrGoogleLinks'),existing=await this.link(id);return existing?await r.update({filterByTk:existing.id,values}):await r.create({values:{projectId:id,...values}});}
 async token(id){const refresh=this.env(secretKey(id));if(!refresh)throw Object.assign(new Error('请先授权 Google 账号'),{status:409});const c=this.config();const tokens=await g.googleJson(g.GOOGLE_ENDPOINTS.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:refresh,grant_type:'refresh_token'}),signal:AbortSignal.timeout(20000)});if(!tokens.access_token)throw new Error('No access token');return tokens.access_token;}
 async resources(id){const token=await this.token(id),analytics=[];let pageToken='';do{const url=new URL(g.GOOGLE_ENDPOINTS.analyticsAdmin+'/accountSummaries');url.searchParams.set('pageSize','200');if(pageToken)url.searchParams.set('pageToken',pageToken);const result=await g.googleJson(url,{...g.jsonRequest(token),signal:AbortSignal.timeout(20000)});for(const account of result.accountSummaries||[])for(const property of account.propertySummaries||[])analytics.push({id:property.property.replace('properties/',''),name:property.displayName});pageToken=result.nextPageToken||'';if(analytics.length>10000)throw new Error('Resource limit');}while(pageToken);const sites=await g.googleJson(g.GOOGLE_ENDPOINTS.searchConsole+'/sites',{...g.jsonRequest(token),signal:AbortSignal.timeout(20000)});return {analytics,searchConsole:(sites.siteEntry||[]).filter(s=>s.permissionLevel!=='siteUnverifiedUser').map(s=>({id:s.siteUrl,name:s.siteUrl}))};}
 async load(){
  this.projects=new (require('./projects').Projects)(this);this.projects.register();
  const {KeywordService}=require('./keyword-service');
  new KeywordService(this).register();
  new (require('./domain-service').DomainService)(this).register();
  this.rankTracking=new (require('./rank-tracking').RankTracking)(this);this.rankTracking.register();
  this.aiSearch=new (require('./ai-search').AiSearch)(this);this.aiSearch.register();
  this.sync=new SyncService(this);
  this.sources=new (require('./public-sources').PublicSources)(this);this.sources.register();
  this.siteContent=new (require('./site-content').SiteContent)(this);this.siteContent.register();
  this.audit=new (require('./audit').SiteAudit)(this);this.audit.register();
  new (require('./lighthouse').Lighthouse)(this).register();
  this.github=new (require('./github-source').GitHubSource)(this);this.github.register();
  this.community=new (require('./community-source').CommunitySource)(this);this.community.register();
  this.packages=new (require('./packages-source').PackagesSource)(this);this.packages.register();
  this.hackernews=new (require('./hackernews-source').HackerNewsSource)(this);this.hackernews.register();
  this.reddit=new (require('./reddit-source').RedditSource)(this);this.reddit.register(require('./data-views').windowFor);
  new (require('./insight-summary').InsightSummary)(this).register();
  new (require('./source-discovery').SourceDiscovery)(this).register();
  new (require('./project-icon').ProjectIcon)(this).register();
  new (require('./data-health').DataHealth)(this).register();
  this.signals=new (require('./signals').SignalEngine)(this);this.signals.register();
  this.analysis=new (require('./daily-analysis').DailyAnalysis)(this);this.analysis.register();
  new (require('./online-ai').OnlineAI)(this).register();
  this.knowledge=new (require('./knowledge').Knowledge)(this);this.knowledge.register();
  this.skills=new (require('./skills').Skills)(this);this.skills.register();
  new (require('./knowledge-suggest').KnowledgeSuggest)(this).register();
  this.memoryUpdates=new (require('./memory-update').MemoryUpdate)(this);this.memoryUpdates.register();
  new (require('./data-views').DataViews)(this).register();
  this.taskExecution=new (require('../dist/execution/service').TaskService)(this);this.taskExecution.register();
  this.taskCron=this.app.cronJobManager.addJob({cronTime:'*/2 * * * * *',onTick:()=>this.taskExecution.tick().catch(()=>this.app.logger.warn('NocoReach task tick failed'))});
  this.strategy=new (require('./strategy-service').StrategyService)(this);this.strategy.register();
  const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);try{const values=ctx.action.params.values||{},id=projectId(values.projectId||ctx.action.params.projectId||ctx.request.query.projectId);await this.project(id);ctx.body=await fn.call(this,ctx,id,values);await next();}catch(e){if(e.status&&e.status<500)ctx.throw(e.status,e.message);ctx.throw(502,'连接请求未完成，请检查 Google 配置、账号权限或网络后重试。');}};
  this.app.resourceManager.define({name:'nrGoogle',actions:{
   status:wrap(async function(ctx,id){const link=await this.link(id);const base=this.env(CONFIG+'BASE_URL');return {configured:Boolean(this.env(CONFIG+'CLIENT_ID')&&this.env(CONFIG+'CLIENT_SECRET')&&base),redirectUri:base?callbackUri(base):null,authorized:Boolean(this.env(secretKey(id))),connection:link?.toJSON()||null,syncEnabled:Boolean(link?.get('scheduleEnabled'))};}),
   configure:wrap(async function(ctx,id,v){const clientId=String(v.clientId||'').trim(),secret=ctx.request.headers['x-noreach-google-secret'];const redirectUri=callbackUri(String(v.baseUrl||''));if(!clientId.endsWith('.apps.googleusercontent.com')||!secret)ctx.throw(400,'请提供有效客户端 ID 和客户端密钥');if(this.env(CONFIG+'CLIENT_ID')&&this.env(CONFIG+'CLIENT_ID')!==clientId)ctx.throw(409,'更换 OAuth 应用前须完成已有连接的迁移评审');await this.variable(CONFIG+'CLIENT_ID',clientId);await this.variable(CONFIG+'CLIENT_SECRET',String(secret),true);await this.variable(CONFIG+'BASE_URL',new URL(redirectUri).origin);return {configured:true,redirectUri};}),
   authorize:wrap(async function(ctx,id){const c=this.config();const state=g.createOAuthState(),nonce=randomBytes(32).toString('hex');await ctx.cache.set(g.stateCacheKey(state),{id,userId:String(ctx.auth.user.id),nonceHash:createHash('sha256').update(nonce).digest('hex')},600000);ctx.cookies.set('nr_google_oauth',nonce,{httpOnly:true,sameSite:'lax',secure:c.redirectUri.startsWith('https:'),maxAge:600000,path:'/api/nrGoogle:callback',signed:false});return {authorizationUrl:g.buildAuthorizationUrl({...c,state})};}),
   callback:async(ctx,next)=>{ctx.set('Cache-Control','no-store');ctx.set('Referrer-Policy','no-referrer');let stage='state';try{const state=String(ctx.request.query.state||'');if(!state)fail('state_expired');const key=g.stateCacheKey(state),saved=await ctx.cache.get(key);const nonce=ctx.cookies.get('nr_google_oauth',{signed:false});if(!saved||!nonce||createHash('sha256').update(nonce).digest('hex')!==saved.nonceHash)fail('state_expired');await ctx.cache.del(key);ctx.cookies.set('nr_google_oauth',null,{path:'/api/nrGoogle:callback',signed:false});await this.project(saved.id);if(ctx.request.query.error)fail('authorization_denied');stage='exchange';const c=this.config();const tokens=await g.googleJson(g.GOOGLE_ENDPOINTS.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:c.redirectUri,code:String(ctx.request.query.code||''),grant_type:'authorization_code'}),signal:AbortSignal.timeout(20000)});if(!tokens.refresh_token||!tokens.access_token)fail('missing_token');const required=g.GOOGLE_SCOPES.filter(s=>s.startsWith('https:'));if(required.some(s=>!String(tokens.scope||'').split(' ').includes(s)))fail('missing_permissions');stage='identity';const identity=await g.googleJson(g.GOOGLE_ENDPOINTS.userInfo,{...g.jsonRequest(tokens.access_token),signal:AbortSignal.timeout(20000)});stage='save';await this.variable(secretKey(saved.id),tokens.refresh_token,true);await this.metadata(saved.id,{accountEmail:identity.email||'',authorizedAt:new Date().toISOString(),status:'awaiting_selection'});ctx.redirect(RETURN+'?google=authorized');}catch(e){const reason=callbackReason(e,stage);ctx.logger.warn('NocoReach Google callback failed',{stage,reason});ctx.redirect(RETURN+'?google=error&reason='+reason);}await next();},
   syncStatus:wrap(async function(ctx,id){return this.sync.status(id);}),
   syncNow:wrap(async function(ctx,id,v){return this.sync.enqueue(id,Number(v.days||56));}),
   syncControl:wrap(async function(ctx,id,v){await this.sync.control(id,v.command);return this.sync.status(id);}),
   // Plus the 初步 days after each cutoff (drawn on 网站表现's chart, never summed).
   liveSnapshots:wrap(async function(ctx,id){const snaps=await this.sync.snapshots(id),end=k=>(snaps.find(s=>s.key===k)?.payload||[]).map(r=>r.date).sort().at(-1);
    const [web,search]=await Promise.all([this.sync.fresh(id,'ga4',end('history-web')),this.sync.fresh(id,'gsc',end('history-search'))]).catch(()=>[[],[]]);return [...snaps,{key:'preliminary',payload:{web,search}}];}),
   resources:wrap(async function(ctx,id){return await this.resources(id);}),
   select:wrap(async function(ctx,id,v){const r=await this.resources(id);const ga4=String(v.ga4||''),gsc=String(v.gsc||'');if(!r.analytics.some(x=>x.id===ga4)||!r.searchConsole.some(x=>x.id===gsc))ctx.throw(400,'请从授权账号可访问的资源中选择');const p=await this.project(id);if(!p.analyticsPropertyId&&!p.searchConsoleProperty)await this.projects.update(id,cur=>({...cur,analyticsPropertyId:ga4,searchConsoleProperty:gsc}));else if(ga4!==String(p.analyticsPropertyId)||gsc!==p.searchConsoleProperty)ctx.throw(409,'所选资源与当前历史数据不一致。为防止串站，需新建项目后接入。');await this.metadata(id,{ga4PropertyId:ga4,gscSiteUrl:gsc,status:'ready_for_sync'});return {selected:true,syncEnabled:false};}),
   disconnect:wrap(async function(ctx,id){await this.sync.control(id,'pause');await this.variable(secretKey(id),null);await this.metadata(id,{scheduleEnabled:false,status:'disconnected',accountEmail:'',authorizedAt:null});return {disconnected:true,historyRetained:true};})
  }});
  this.app.acl.allow('nrGoogle','callback','public');
  this.app.acl.allow('nrGoogle',['status','configure','authorize','resources','select','disconnect','syncStatus','syncNow','syncControl','liveSnapshots'],'loggedIn');
  this.syncCron=this.app.cronJobManager.addJob({cronTime:'*/15 * * * * *',onTick:()=>this.sync.tick().catch(()=>this.app.logger.warn('NocoReach sync tick failed'))});
  this.siteCron=this.app.cronJobManager.addJob({cronTime:'0 * * * * *',onTick:()=>this.siteContent.tick().catch(()=>this.app.logger.warn('NocoReach site content tick failed'))});
  this.githubCron=this.app.cronJobManager.addJob({cronTime:'0 */10 * * * *',onTick:()=>this.github.tick().catch(()=>this.app.logger.warn('NocoReach GitHub tick failed'))});
  this.communityCron=this.app.cronJobManager.addJob({cronTime:'30 */10 * * * *',onTick:()=>this.community.tick().catch(()=>this.app.logger.warn('NocoReach community tick failed'))});
  this.packagesCron=this.app.cronJobManager.addJob({cronTime:'45 */10 * * * *',onTick:()=>this.packages.tick().catch(()=>this.app.logger.warn('NocoReach packages tick failed'))});
  this.rankCron=this.app.cronJobManager.addJob({cronTime:'0 5 * * * *',onTick:()=>this.rankTracking.tick().catch(()=>this.app.logger.warn('NocoReach rank tick failed'))});
  this.hackernewsCron=this.app.cronJobManager.addJob({cronTime:'15 */10 * * * *',onTick:()=>this.hackernews.tick().catch(()=>this.app.logger.warn('NocoReach Hacker News tick failed'))});
  this.memoryCron=this.app.cronJobManager.addJob({cronTime:'0 40 * * * *',onTick:()=>this.memoryUpdates.tick().catch(()=>this.app.logger.warn('NocoReach memory tick failed'))});
  this.redditCron=this.app.cronJobManager.addJob({cronTime:'0 25 * * * *',onTick:()=>this.reddit.tick().catch(()=>this.app.logger.warn('NocoReach Reddit tick failed'))});
 }
 async afterDisable(){if(this.taskExecution)this.taskExecution.stop();if(this.taskCron)this.app.cronJobManager.removeJob(this.taskCron);if(this.syncCron)this.app.cronJobManager.removeJob(this.syncCron);if(this.siteCron)this.app.cronJobManager.removeJob(this.siteCron);if(this.githubCron)this.app.cronJobManager.removeJob(this.githubCron);if(this.communityCron)this.app.cronJobManager.removeJob(this.communityCron);if(this.packagesCron)this.app.cronJobManager.removeJob(this.packagesCron);if(this.hackernewsCron)this.app.cronJobManager.removeJob(this.hackernewsCron);if(this.redditCron)this.app.cronJobManager.removeJob(this.redditCron);if(this.memoryCron)this.app.cronJobManager.removeJob(this.memoryCron);if(this.rankCron)this.app.cronJobManager.removeJob(this.rankCron);}
}
module.exports=Connections;
