// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { GoogleDailySync, calendarDateInTimeZone } from './google-sync.js';
import { GOOGLE_ENDPOINTS, jsonRequest, googleJson } from './google-client.js';
import { secretKey } from './policy.js';
import { shift, compact, buildSnapshots } from './sync-data.js';
const FRESH_MS=3*3600000;
const active=['queued','running','retrying'];
// Cached results are shared between requests; freezing makes any accidental mutation fail loudly instead of corrupting later responses.
const deepFreeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))deepFreeze(x);}return v;};
const safeError=e=>['network_timeout','network_unreachable','response_too_large','invalid_grant','invalid_client','google_api_error'].includes(e?.code)?e.code:'sync_failed';
class StagedSync extends GoogleDailySync{
 constructor(options){super(options);this.batches=[];}
 async createRun(){return 0;}async finishRun(){}async replaceWindow(){}
 async writeRows(resource,rows){this.batches.push(...rows);return rows.length;}
}
class SyncService{
 constructor(plugin){this.p=plugin;this.busy=false;this.cache=new Map();this.building=new Map();this.transactionCaches=new WeakMap();this.collector=o=>new StagedSync(o);}
 repo(name){return this.p.db.getRepository(name);}
 async link(id){const link=await this.p.link(id);if(!link||!this.p.env(secretKey(id))||!link.get('ga4PropertyId')||!link.get('gscSiteUrl')||link.get('status')==='disconnected')throw Object.assign(new Error('请先授权并确认 GA4 与 Search Console 资源'),{status:409});const p=await this.p.project(id);if(String(p.analyticsPropertyId)!==link.get('ga4PropertyId')||p.searchConsoleProperty!==link.get('gscSiteUrl'))throw Object.assign(new Error('连接资源与项目不一致，已阻止同步'),{status:409});return link;}
 async lock(transaction){const [rows]=await this.p.db.sequelize.query("SELECT pg_try_advisory_xact_lock(hashtext('nocoreach-google-sync')) AS locked",{transaction});return rows[0].locked;}
 async enqueue(id,days=7,trigger='manual'){
  if(![7,28,56].includes(days))throw Object.assign(new Error('同步范围仅支持 7、28 或 56 天'),{status:400});const link=await this.link(id);
  return this.p.db.sequelize.transaction(async transaction=>{if(!await this.lock(transaction))throw Object.assign(new Error('同步正在处理，请稍后重试'),{status:409});const existing=await this.repo('nrSyncJobs').find({filter:{projectId:id,status:{$in:[...active,'paused']}},transaction});if(existing.length)return {alreadyQueued:true,jobs:existing.map(r=>r.toJSON())};
   // Three days of reporting lag, explicit rather than treating pending Google data as zero.
   const end=shift(calendarDateInTimeZone('America/Los_Angeles'),-3),start=shift(end,-days+1),jobs=[];
   for(const source of ['ga4','gsc'])jobs.push((await this.repo('nrSyncJobs').create({values:{projectId:id,source,resource:link.get(source==='ga4'?'ga4PropertyId':'gscSiteUrl'),status:'queued',startDate:start,endDate:end,cursor:start,attempts:0,recordCount:0,trigger},transaction})).toJSON());
   await this.p.db.getRepository('nrGoogleLinks').update({filterByTk:link.id,values:{nextSyncAt:new Date(Date.now()+86400000).toISOString()},transaction});return {jobs};
  });
 }
 async status(id){const jobs=await this.repo('nrSyncJobs').find({filter:{projectId:id},sort:'-createdAt',limit:20});const link=await this.p.link(id);const latest=(await Promise.all(['ga4','gsc'].map(source=>this.repo('nrSyncPartitions').find({filter:{projectId:id,source,grain:'overview'},sort:'-date',limit:100})))).flat();return {jobs:jobs.map(r=>r.toJSON()),scheduleEnabled:Boolean(link?.get('scheduleEnabled')),nextSyncAt:link?.get('nextSyncAt')||null,lastSyncAt:link?.get('lastSyncAt')||null,coverage:['ga4','gsc'].map(source=>({source,availableThrough:latest.filter(r=>r.get('source')===source&&r.get('payload')?.length).map(r=>r.get('date')).sort().at(-1)||null}))};}
 async control(id,command){await this.link(id);if(command==='enable'||command==='disable'){await this.p.metadata(id,{scheduleEnabled:command==='enable',...(command==='enable'?{nextSyncAt:new Date().toISOString()}: {})});return;}
  const status=command==='pause'?'paused':'queued';const from=command==='pause'?active:command==='retry'?['failed']:['paused'];if(!['pause','resume','retry'].includes(command))throw Object.assign(new Error('无效操作'),{status:400});
  await this.p.db.sequelize.transaction(async transaction=>{
   await this.p.db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('nocoreach-google-sync'))",{transaction});
   await this.repo('nrSyncJobs').update({filter:{projectId:id,status:{$in:from}},values:{status,attempts:0,retryAt:null,errorCode:null},transaction});
   // Remember the pause even if resume arrives before the old Google request finishes.
   if(command==='pause'&&String(this.inFlight?.job.get('projectId'))===String(id))this.inFlight.controller.abort();
  });
 }
 async currentJob(flight,transaction){
  if(flight.controller.signal.aborted)return null;
  const fresh=await this.repo('nrSyncJobs').findOne({filterByTk:flight.job.id,transaction,lock:true});
  return fresh&&fresh.get('status')==='running'&&fresh.get('cursor')===flight.job.get('cursor')&&fresh.get('resource')===flight.job.get('resource')?fresh:null;
 }
 async step(){
  if(this.busy)return false;this.busy=true;let flight;
  try{
   // The instance's busy flag owns the external work. Only claim and commit hold a DB transaction;
   // SQLite has one connection, so awaiting Google inside it would block every page and control action.
   const claimed=await this.p.db.sequelize.transaction(async transaction=>{
    if(!await this.lock(transaction))return false;
    const jobs=await this.repo('nrSyncJobs').find({filter:{status:{$in:active}},sort:'createdAt',transaction});
    const job=jobs.find(j=>!j.get('retryAt')||Date.parse(j.get('retryAt'))<=Date.now());if(!job)return false;
    flight={job,controller:new AbortController()};this.inFlight=flight;
    await this.repo('nrSyncJobs').update({filterByTk:job.id,values:{status:'running'},transaction});return true;
   });
   if(!claimed)return false;
   const {job}=flight,id=job.get('projectId'),source=job.get('source'),link=await this.link(id);
   if(job.get('resource')!==link.get(source==='ga4'?'ga4PropertyId':'gscSiteUrl'))throw new Error('resource_changed');
   // Bound the whole block (including token refresh and pagination), not just each HTTP request.
   const signal=AbortSignal.any([flight.controller.signal,AbortSignal.timeout(120000)]);
   signal.throwIfAborted();
   const cursor=job.get('cursor'),end=[shift(cursor,6),job.get('endDate')].sort()[0];
   const token=await this.p.token(id,signal);
   let propertyTimeZone='UTC';if(source==='ga4'){const property=await (this.p.googleJson?this.p.googleJson.bind(this.p,id):googleJson)(`${GOOGLE_ENDPOINTS.analyticsAdmin}/properties/${job.get('resource')}`,{...jsonRequest(token),signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});propertyTimeZone=property.timeZone||'UTC';}
   const fetcher=this.p.googleFetch?.(id)||fetch;
   const collector=this.collector({db:{sequelize:{transaction:fn=>fn(null)}},getAccessToken:async()=>token,fetcher:(url,init={})=>fetcher(url,{...init,signal:AbortSignal.any([signal,...(init.signal?[init.signal]:[])])}),propertyId:link.get('ga4PropertyId'),siteUrl:link.get('gscSiteUrl'),propertyTimeZone,reportTypes:source==='ga4'?['overview','source','page']:['overview','query_page'],searchTypes:['web'],dataState:'final'});
   await collector[source==='ga4'?'syncGa4':'syncGsc']({startDate:cursor,endDate:end});
   signal.throwIfAborted();
   const partitions=[];
   for(let date=cursor;date<=end;date=shift(date,1))for(const grain of source==='ga4'?['overview','source','page']:['overview','query_page']){
    const payload=compact(collector.batches.filter(r=>r.periodDate===date&&r.grainType===grain),grain);
    partitions.push({partitionKey:JSON.stringify([id,source,job.get('resource'),date,grain]),projectId:id,source,resource:job.get('resource'),date,grain,payload});
   }
   return await this.p.db.sequelize.transaction(async transaction=>{
    if(!await this.lock(transaction)||!await this.currentJob(flight,transaction))return false;
    const currentLink=await this.link(id);
    if(currentLink.get('ga4PropertyId')!==link.get('ga4PropertyId')||currentLink.get('gscSiteUrl')!==link.get('gscSiteUrl'))throw new Error('resource_changed');
    for(const values of partitions){const r=this.repo('nrSyncPartitions'),old=await r.findOne({filter:{partitionKey:values.partitionKey},transaction});if(old)await r.update({filterByTk:old.id,values,transaction});else await r.create({values,transaction});}
    const finished=end===job.get('endDate');await this.repo('nrSyncJobs').update({filterByTk:job.id,values:{cursor:shift(end,1),status:finished?'succeeded':'running',recordCount:Number(job.get('recordCount')||0)+collector.batches.length,attempts:0,errorCode:null,retryAt:null,...(finished?{finishedAt:new Date().toISOString()}: {})},transaction});
    if(finished)await this.p.db.getRepository('nrGoogleLinks').update({filterByTk:currentLink.id,values:{lastSyncAt:new Date().toISOString()},transaction});return true;
   });
  }catch(e){
   if(flight?.controller.signal.aborted)return false;
   const code=['TimeoutError','AbortError'].includes(e?.name)?'network_timeout':safeError(e);
   if(flight)await this.p.db.sequelize.transaction(async transaction=>{
    if(!await this.lock(transaction))return;
    const job=await this.currentJob(flight,transaction);if(!job)return;
    const attempts=Number(job.get('attempts')||0)+1,retry=attempts<3&&['network_timeout','network_unreachable','google_api_error'].includes(code);
    await this.repo('nrSyncJobs').update({filterByTk:job.id,values:{status:retry?'retrying':'failed',attempts,errorCode:code,retryAt:retry?new Date(Date.now()+60000*attempts).toISOString():null},transaction});
   });
   this.p.app.logger.warn('NocoReach synchronization failed',{code});return false;
  }finally{this.inFlight=undefined;this.busy=false;}
 }
 // 初步数据: Google's last days before they are final, as daily totals only — Search Console's fresh data (dataState
 // all) and GA4 up to yesterday, from the day after the final cutoff (three days back, the same as the sync). Kept apart
 // from the synced partitions, so totals, comparisons, signals, the daily analysis and effect observation use final data
 // only; the pages draw these days after the cutoff, marked 初步. Read again every three hours.
 async refreshFresh(id){const link=await this.link(id),token=await this.p.token(id),la=calendarDateInTimeZone('America/Los_Angeles'),start=shift(la,-2);
  let tz='UTC';try{tz=(await (this.p.googleJson?this.p.googleJson.bind(this.p,id):googleJson)(`${GOOGLE_ENDPOINTS.analyticsAdmin}/properties/${link.get('ga4PropertyId')}`,jsonRequest(token))).timeZone||'UTC';}catch{tz='UTC';}
  const out={fetchedAt:new Date().toISOString(),ga4Resource:link.get('ga4PropertyId'),gscResource:link.get('gscSiteUrl'),gsc:[],ga4:[]};
  for(const source of ['gsc','ga4']){const end=shift(calendarDateInTimeZone(source==='ga4'?tz:'America/Los_Angeles'),-1);if(end<start)continue;
   const c=this.collector({db:{sequelize:{transaction:fn=>fn(null)}},getAccessToken:async()=>token,fetcher:this.p.googleFetch?.(id),propertyId:link.get('ga4PropertyId'),siteUrl:link.get('gscSiteUrl'),propertyTimeZone:tz,reportTypes:['overview'],searchTypes:['web'],dataState:'all'});
   await c[source==='ga4'?'syncGa4':'syncGsc']({startDate:start,endDate:end});
   out[source]=compact(c.batches.filter(r=>r.grainType==='overview'&&r.periodDate>=start&&r.periodDate<=end),'overview').map(r=>source==='ga4'?{date:r.date,views:r.views,uv:r.uv,sessions:r.sessions,engaged:r.engaged,conversions:r.conversions}:{date:r.date,clicks:r.clicks,impressions:r.impressions,position:r.position}).sort((a,b)=>a.date.localeCompare(b.date));}
  const r=this.repo('nrSnapshots'),key=`google-fresh:${id}`,old=await r.findOne({filter:{key}});if(old)await r.update({filterByTk:old.id,values:{payload:out}});else await r.create({values:{key,payload:out}});return out;}
 // The 初步 days after `cutoff` for one source, or none when the store is for other resources.
 async fresh(id,source,cutoff){if(!cutoff)return [];const s=(await this.repo('nrSnapshots').findOne({filter:{key:`google-fresh:${id}`}}))?.get('payload');const link=await this.p.link(id).catch(()=>null);
  if(!s||!link||s.ga4Resource!==link.get('ga4PropertyId')||s.gscResource!==link.get('gscSiteUrl'))return [];return (s[source]||[]).filter(r=>r.date>cutoff);}
 async tick(){if(this.busy)return;const links=await this.repo('nrGoogleLinks').find({filter:{scheduleEnabled:true}});for(const link of links){if(link.get('nextSyncAt')&&Date.parse(link.get('nextSyncAt'))>Date.now())continue;try{await this.enqueue(link.get('projectId'),7,'scheduled');}catch(e){this.p.app.logger.warn('NocoReach scheduled enqueue skipped',{code:safeError(e)});}}
  const deadline=Date.now()+25000;while(Date.now()<deadline&&await this.step()){}
  // Rebuild here after new data lands (and once after a restart) so page requests find it ready.
  // …and the default 搜索表现 and 访问 views (28 days), saved, so opening the page after new data or a restart is immediate.
  for(const id of new Set(links.map(l=>String(l.get('projectId'))))){await this.snapshots(id).catch(()=>{});await this.p.dataViews?.search(id,{range:'28'}).catch(()=>{});await this.p.dataViews?.website(id,{range:'28'}).catch(()=>{});}
  for(const id of new Set(links.map(l=>String(l.get('projectId'))))){if(Date.now()>=deadline+20000)break;const at=Math.max(this.freshTried?.get(id)||0,Date.parse((await this.repo('nrSnapshots').findOne({filter:{key:`google-fresh:${id}`}}))?.get('payload')?.fetchedAt||'')||0);if(Date.now()-at<FRESH_MS)continue;
   // A failed read (often the network) is tried again after 15 minutes rather than three hours.
   (this.freshTried=this.freshTried||new Map()).set(id,Date.now());try{await this.refreshFresh(id);}catch(e){this.freshTried.set(id,Date.now()-FRESH_MS+15*60000);this.p.app.logger.warn('NocoReach preliminary Google data skipped',{code:safeError(e)});}}
 }
 // Rebuilding from every stored day takes seconds and grows daily, while partitions only change when a sync writes them.
 // Reuse the result until the partition count, latest write, linked resources or project change; concurrent callers share one build.
 // What the built snapshots depend on; cheap, so views can key their own saved results by it without building.
 async snapshotKey(id,link,project){id=String(id);link=link||await this.link(id);project=project||await this.p.project(id);const r=this.repo('nrSyncPartitions');
  const [count,latest]=await Promise.all([r.count({filter:{projectId:id}}),r.findOne({filter:{projectId:id},sort:['-updatedAt'],fields:['updatedAt']})]);
  return {count,key:JSON.stringify([link.get('ga4PropertyId'),link.get('gscSiteUrl'),count,latest?.get('updatedAt')??null,project])};}
 async snapshots(id){id=String(id);const link=await this.link(id),project=await this.p.project(id),{count,key}=await this.snapshotKey(id,link,project);
  // A build outside this transaction may be waiting for its connection. Sharing that promise
  // would deadlock; sharing results from inside it would also expose data that can roll back.
  const transaction=this.p.db.transactionContext?.();
  let caches=this;
  if(transaction){caches=this.transactionCaches.get(transaction);if(!caches){caches={cache:new Map(),building:new Map()};this.transactionCaches.set(transaction,caches);}}
  const {cache,building}=caches;
  if(cache.get(id)?.key===key)return cache.get(id).value;
  const running=building.get(id);if(running?.key===key)return running.promise;
  const started=Date.now(),promise=this.build(id,link,project).then(value=>{cache.set(id,{key,value:deepFreeze(value)});this.p.app?.logger?.info('NocoReach snapshots rebuilt',{projectId:id,partitions:count,ms:Date.now()-started});return value;}).finally(()=>{if(building.get(id)?.promise===promise)building.delete(id);});
  building.set(id,{key,promise});return promise;}
 async build(id,link,project){const rows=[];for(let offset=0;;offset+=200){const page=await this.repo('nrSyncPartitions').find({filter:{projectId:id},sort:['id'],offset,limit:200});rows.push(...page.map(r=>r.toJSON()).filter(r=>r.resource===(r.source==='ga4'?link.get('ga4PropertyId'):link.get('gscSiteUrl'))));if(page.length<200)break;if(rows.length>12000)throw Object.assign(new Error('同步数据范围过大，需要服务端分页汇总'),{status:409});}return buildSnapshots(rows,project);}
}
export { SyncService, StagedSync };
