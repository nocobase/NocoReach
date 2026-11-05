// @ts-nocheck
import type { Connections } from './plugin.js';
import type { LegacyDatabase, LegacyRecord, LegacyRepository, LegacyTransaction } from './legacy/database.js';
interface SyncFlight { job: LegacyRecord; controller: AbortController; mockSnapshot: unknown; }
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { GoogleDailySync, calendarDateInTimeZone } from './google-sync.js';
import { GOOGLE_ENDPOINTS, jsonRequest, googleJson } from './google-client.js';
import { datesBetween, historyBounds, intervals, validDate, validOverview } from './search-history.js';
import { secretKey } from './policy.js';
import { shift, compact, buildSnapshots } from './sync-data.js';
import { readAhead, waitForFresh } from './google-report-cache.js';
import { GOOGLE_SAVED_COPY_MAX_AGE_MS } from '../../shared/google-cache.js';
const FRESH_MS=3*3600000;
// As long as a whole report lived before saved copies; a person opening the page still retries sooner.
const PARTIAL_RETRY_MS=6*60*60*1000;
// Traffic's default view of a project nobody opens is read this often, a day inside the age a saved copy may be shown,
// so whoever opens it next sees it at once; a few such projects a tick, as after a deploy every project is one.
const IDLE_READ_MS=GOOGLE_SAVED_COPY_MAX_AGE_MS-86400000,IDLE_READS_PER_TICK=3;
// A project opened within this has Traffic read again by the tick once GA4 has most of yesterday (website-report.ts,
// MORNING_READ_HOUR), so the morning's first visit sees it whole instead of the night's report being replaced.
const MORNING_REREAD_WITHIN_MS=86400000;
// Built snapshots are kept in nrSnapshots under this namespace (`sync-snapshots:<project>`), up to this size, so a
// restart restores them instead of rebuilding from every stored day.
const SAVED_SNAPSHOTS='sync-snapshots',MAX_SAVED_SNAPSHOT_BYTES=4*1024*1024;
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
 p: Connections & {db: LegacyDatabase};
 inFlight?: SyncFlight;
 freshFlights=new Map<string,Set<AbortController>>();
 mockSnapshots(){return (this.p as {db: LegacyDatabase}).db.getRepository('nrSnapshots');}
 constructor(plugin){this.p=plugin;this.busy=false;this.cache=new Map();this.building=new Map();this.transactionCaches=new WeakMap();this.collector=o=>new StagedSync(o);(this.p as Connections).network?.bind(this,['enqueue','enqueueHistory','refreshFresh'], 'google');}
 repo(name: string): LegacyRepository{return (this.p as {db: LegacyDatabase}).db.getRepository(name);}
 // Replace the maps so an earlier build cannot repopulate the cache after a demo reset.
 resetCache(): void {this.cache=new Map();this.building=new Map();this.transactionCaches=new WeakMap();}
 async link(id): Promise<LegacyRecord>{const link=await this.p.link(id);if(!link||!this.p.env(secretKey(id))||!link.get('ga4PropertyId')||!link.get('gscSiteUrl')||link.get('status')==='disconnected')throw Object.assign(new Error(systemMessageText('sync.authorizeConfirmGa4Search')),{status:409,code:'NOCOREACH_GOOGLE_NOT_CONNECTED'});const p=await this.p.project(id);if(String(p.analyticsPropertyId)!==link.get('ga4PropertyId')||p.searchConsoleProperty!==link.get('gscSiteUrl'))throw Object.assign(new Error(systemMessageText('sync.connectedResourceNotMatchProject')),{status:409});return link;}
 async lock(transaction): Promise<boolean>{const [rows]=await this.p.db.sequelize.query("SELECT pg_try_advisory_xact_lock(hashtext('nocoreach-google-sync')) AS locked",{transaction});return rows[0].locked;}
 async enqueue(id,days=7,trigger='manual'){
  if(![7,28,56].includes(days))throw Object.assign(new Error(systemMessageText('sync.syncRanges72856')),{status:400});const mockSnapshot=(this.p as Connections).mock?.enabled?(this.p as Connections).mock.capture(String(id)):null;
  return this.p.db.sequelize.transaction(async (transaction: LegacyTransaction)=>{if(!await this.lock(transaction))throw Object.assign(new Error(systemMessageText('sync.syncProgressTryAgainLater')),{status:409});const link=await this.link(id);if(trigger==='scheduled'&&!link.get('scheduleEnabled'))return {jobs:[]};const existing=await this.repo('nrSyncJobs').find({filter:{projectId:id,status:{$in:[...active,'paused']}},transaction});if(existing.length)return {alreadyQueued:true,jobs:existing.map(r=>r.toJSON())};
   // Three days of reporting lag, explicit rather than treating pending Google data as zero.
   const end=shift(calendarDateInTimeZone('America/Los_Angeles',mockSnapshot?new Date(mockSnapshot.clock):new Date()),-3),start=shift(end,-days+1),jobs=[];
   for(const source of ['ga4','gsc'])jobs.push((await this.repo('nrSyncJobs').create({values:{projectId:id,source,resource:link.get(source==='ga4'?'ga4PropertyId':'gscSiteUrl'),status:'queued',startDate:start,endDate:end,cursor:start,attempts:0,recordCount:0,trigger},transaction})).toJSON());
   if(mockSnapshot)for(const job of jobs)await this.mockSnapshots().create({values:{key:`mock-google-run:${(job as {id: string}).id}`,payload:mockSnapshot},transaction});
   await this.p.db.getRepository('nrGoogleLinks').update({filterByTk:link.id,values:{nextSyncAt:new Date(Date.now()+86400000).toISOString()},transaction});return {jobs};
  });
 }
 // Only unfiltered final web overview rows belong in the durable date partitions.
 async overviewParts(id: string | number,resource: string,startDate: string,endDate: string,transaction?: LegacyTransaction){return this.repo('nrSyncPartitions').find({filter:{projectId:id,source:'gsc',resource,grain:'overview',date:{$in:datesBetween(startDate,endDate)}},fields:['date','payload','updatedAt'],transaction});}
 async historyJobs(id: string | number,resource: string,startDate: string,endDate: string,transaction?: LegacyTransaction){return (await this.repo('nrSyncJobs').find({filter:{projectId:id,source:'gsc',resource,status:{$in:[...active,'paused','failed']}},sort:['createdAt','id'],transaction})).filter(j=>String(j.get('cursor')||j.get('startDate'))<=endDate&&String(j.get('endDate'))>=startDate);}
 async enqueueHistory(id: string | number,v: Record<string,unknown>){
  if(v.scope!=='gscOverview'||(v.mode!=='missing'&&v.mode!=='refresh')||!validDate(v.startDate)||!validDate(v.endDate)||v.startDate>v.endDate||v.type&&v.type!=='web'||v.country||v.queryFilter||v.pageFilter)throw Object.assign(new Error(systemMessageText('dataViews.invalidDate')),{status:400});
  const {earliest,cutoff}=historyBounds(this.p,id),startDate=v.startDate>earliest?v.startDate:earliest,endDate=v.endDate<cutoff?v.endDate:cutoff;
  if(startDate>endDate)return {jobs:[],earliest,cutoff};
  const plugin=this.p as {db: LegacyDatabase;mock?: Connections['mock']};
  const link=await this.link(id),resource=String(link.get('gscSiteUrl'));
  const gaps=async(transaction?: LegacyTransaction)=>{
   const parts=v.mode==='missing'?await this.overviewParts(id,resource,startDate,endDate,transaction):[],covered=new Set(parts.filter(p=>validOverview(p.get('payload'),String(p.get('date')))).map(p=>String(p.get('date'))));
   const jobs=await this.historyJobs(id,resource,startDate,endDate,transaction);
   return {jobs,ranges:intervals(datesBetween(startDate,endDate).filter(d=>!covered.has(d)&&!jobs.some(j=>(v.mode==='missing'||j.get('status')!=='failed')&&String(j.get('cursor')||j.get('startDate'))<=d&&String(j.get('endDate'))>=d)))};
  };
  const initial=await gaps();if(!initial.ranges.length)return {jobs:initial.jobs.map(j=>j.toJSON()),earliest,cutoff};
  const mockSnapshot=plugin.mock?.enabled?plugin.mock.capture(String(id)):null;
  return plugin.db.sequelize.transaction(async transaction=>{
   if(!await this.lock(transaction))throw Object.assign(new Error(systemMessageText('sync.syncProgressTryAgainLater')),{status:409});
   const current=await this.link(id);if(current.get('gscSiteUrl')!==resource)throw Object.assign(new Error('resource_changed'),{status:409});
   const {jobs,ranges}=await gaps(transaction);
   for(const range of ranges){const job=await this.repo('nrSyncJobs').create({values:{projectId:id,source:'gsc',resource,status:'queued',startDate:range.start,endDate:range.end,cursor:range.start,attempts:0,recordCount:0,trigger:v.mode==='missing'?'history-fill':'history-refresh'},transaction});jobs.push(job);
    if(mockSnapshot)await this.mockSnapshots().create({values:{key:`mock-google-run:${String(job.id)}`,payload:mockSnapshot},transaction});
   }
   return {jobs:jobs.map(j=>j.toJSON()),earliest,cutoff};
  });
 }
 // Jobs and coverage follow the resources selected now; those of earlier resources stay stored but out of view.
 async status(id){const link=await this.p.link(id),current={ga4:link?.get('ga4PropertyId'),gsc:link?.get('gscSiteUrl')},mine=r=>!current[r.get('source')]||r.get('resource')===current[r.get('source')];
  const jobs=(await this.repo('nrSyncJobs').find({filter:{projectId:id},sort:'-createdAt',limit:100})).filter(mine).slice(0,20);const latest=(await Promise.all(['ga4','gsc'].map(source=>this.repo('nrSyncPartitions').find({filter:{projectId:id,source,grain:'overview',...(current[source]?{resource:current[source]}:{})},sort:'-date',limit:100})))).flat();return {jobs:jobs.map(r=>r.toJSON()),scheduleEnabled:Boolean(link?.get('scheduleEnabled')),nextSyncAt:link?.get('nextSyncAt')||null,lastSyncAt:link?.get('lastSyncAt')||null,coverage:['ga4','gsc'].map(source=>({source,availableThrough:latest.filter(r=>r.get('source')===source&&r.get('payload')?.length).map(r=>r.get('date')).sort().at(-1)||null}))};}
 async disconnect(id: string | number){
  const plugin=this.p as Pick<Connections,'metadata'|'variable'> & {db: LegacyDatabase};
  await plugin.db.sequelize.transaction(async (transaction: LegacyTransaction)=>{
   await plugin.db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('nocoreach-google-sync'))",{transaction});
   await this.control(id,'pause');
   await plugin.metadata(id,{scheduleEnabled:false,nextSyncAt:null,status:'disconnected',accountEmail:'',authorizedAt:null,authFailedAt:null});
   await plugin.variable(secretKey(id),null);
  });
 }
 // Select or change the project's GA4 property and Search Console site. Synced partitions are read by resource, so an
 // earlier resource's days stay stored but out of view, and return if it is selected again. Unfinished jobs for a
 // replaced resource are dropped (an in-flight one is aborted) and the last sync time starts over.
 async select(id: string | number,ga4: string,gsc: string,ga4Name=''){
  const plugin=this.p as Pick<Connections,'link'|'metadata'|'projects'> & {db: LegacyDatabase};id=String(id);
  const link=await plugin.link(id),wanted={ga4,gsc},changed=!link||link.get('ga4PropertyId')!==ga4||link.get('gscSiteUrl')!==gsc;
  if(changed)await plugin.db.sequelize.transaction(async (transaction: LegacyTransaction)=>{
   await plugin.db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('nocoreach-google-sync'))",{transaction});
   const stale=(await this.repo('nrSyncJobs').find({filter:{projectId:id,status:{$in:[...active,'paused']}},transaction})).filter(j=>j.get('resource')!==wanted[j.get('source')]).map(j=>j.id);
   if(stale.length)await this.repo('nrSyncJobs').destroy({filter:{id:{$in:stale}},transaction});
   transaction.afterCommit(()=>{
    const job=this.inFlight?.job;if(job&&String(job.get('projectId'))===id&&job.get('resource')!==wanted[job.get('source')])this.inFlight.controller.abort();
    for(const controller of this.freshFlights.get(id)||[])controller.abort();
   });
  });
  await plugin.projects.update(id,cur=>({...cur,analyticsPropertyId:ga4,analyticsPropertyName:ga4Name||(cur.analyticsPropertyId===ga4?cur.analyticsPropertyName||'':''),analyticsPropertyTimeZone:cur.analyticsPropertyId===ga4?cur.analyticsPropertyTimeZone||'':'',searchConsoleProperty:gsc}));
  await plugin.metadata(id,{ga4PropertyId:ga4,gscSiteUrl:gsc,status:'ready_for_sync',...(changed&&link?{lastSyncAt:null}:{})});
  return {changed:Boolean(link)&&changed};
 }
 // The GA4 property's display name, kept on the project for the Google panel, and its time zone, which Traffic uses after
 // a restart instead of waiting on the Admin API (website-report.ts, `timeZone`). Both come from the property details each
 // GA4 sync and preliminary read already fetch, so projects that chose their property earlier get them too. Written only
 // when they change; never fails the sync.
 async rememberProperty(id,propertyId,property){const next={...(property?.displayName?{analyticsPropertyName:String(property.displayName)}:{}),...(property?.timeZone?{analyticsPropertyTimeZone:String(property.timeZone)}:{})};if(!Object.keys(next).length)return;
  try{const p=await this.p.project(id);if(String(p.analyticsPropertyId)===String(propertyId)&&Object.entries(next).some(([k,v])=>p[k]!==v))await this.p.projects.update(id,cur=>String(cur.analyticsPropertyId)===String(propertyId)?{...cur,...next}:cur);}catch{/* the name is cosmetic and the zone a shortcut */}}
 async control(id: string | number,command: string){
  const plugin=this.p as Pick<Connections,'metadata'> & {db: LegacyDatabase};
  if(!['enable','disable','pause','resume','retry'].includes(command))throw Object.assign(new Error(systemMessageText('sync.invalidAction')),{status:400});
  await plugin.db.sequelize.transaction(async (transaction: LegacyTransaction)=>{
   await plugin.db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('nocoreach-google-sync'))",{transaction});
   // Stopping work must also succeed for incomplete or expired connections.
   if(command!=='pause'&&command!=='disable')await this.link(id);
   if(command==='enable'||command==='disable'){await plugin.metadata(id,{scheduleEnabled:command==='enable',nextSyncAt:command==='enable'?new Date().toISOString():null});return;}
   const status=command==='pause'?'paused':'queued',from=command==='pause'?active:command==='retry'?['failed']:['paused'];
   await plugin.db.getRepository('nrSyncJobs').update({filter:{projectId:id,status:{$in:from}},values:{status,attempts:0,retryAt:null,errorCode:null},transaction});
   // Remember the pause even if resume or reconnect arrives before an old request finishes.
   if(command==='pause')transaction.afterCommit(()=>{
    if(String(this.inFlight?.job.get('projectId'))===String(id))this.inFlight.controller.abort();
    for(const controller of this.freshFlights.get(String(id))||[])controller.abort();
   });
  });
 }
 // The jobs Google's refusal of the authorization failed (invalid_grant), queued again once the same account has
 // authorized again (google-oauth-callback.ts), so Data health recovers without waiting for the next daily sync or
 // Retry failed jobs. Jobs that failed for another reason, or for resources no longer selected, are left as they are.
 async retryRefused(id: string | number): Promise<number>{
  const plugin=this.p as {db: LegacyDatabase};
  return plugin.db.sequelize.transaction(async (transaction: LegacyTransaction)=>{
   await plugin.db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('nocoreach-google-sync'))",{transaction});
   const link=await this.link(id),current={ga4:link.get('ga4PropertyId'),gsc:link.get('gscSiteUrl')};
   const refused=(await this.repo('nrSyncJobs').find({filter:{projectId:String(id),status:'failed',errorCode:'invalid_grant'},transaction})).filter(j=>j.get('resource')===current[j.get('source')]).map(j=>j.id);
   if(refused.length)await this.repo('nrSyncJobs').update({filter:{id:{$in:refused}},values:{status:'queued',attempts:0,retryAt:null,errorCode:null},transaction});
   return refused.length;
  });
 }
 async currentJob(flight,transaction){
  if(flight.controller.signal.aborted)return null;
  const fresh=await this.repo('nrSyncJobs').findOne({filterByTk:flight.job.id,transaction,lock:true});
  return fresh&&fresh.get('status')==='running'&&fresh.get('cursor')===flight.job.get('cursor')&&fresh.get('resource')===flight.job.get('resource')?fresh:null;
 }
 // Shutdown: a Google read in flight takes its cancellation path, so its job stays `running` and the next start resumes
 // it without spending an attempt (closing the network under it would count as a failed attempt); nothing new starts.
 stop(){this.stopped=true;this.inFlight?.controller.abort();for(const flights of this.freshFlights.values())for(const controller of flights)controller.abort();}
 async step(projectId?: string){
  if(this.busy||this.stopped)return false;this.busy=true;let flight: SyncFlight | undefined;
  try{
   // The instance's busy flag owns the external work. Only claim and commit hold a DB transaction;
   // SQLite has one connection, so awaiting Google inside it would block every page and control action.
   const claimed=await this.p.db.sequelize.transaction(async (transaction: LegacyTransaction)=>{
    if(!await this.lock(transaction))return false;
    const jobs=await this.repo('nrSyncJobs').find({filter:{status:{$in:active},...(projectId?{projectId}:{})},sort:['createdAt','id'],transaction});
    const job=jobs.find(j=>!j.get('retryAt')||Date.parse(j.get('retryAt'))<=Date.now());if(!job)return false;
    flight={job,controller:new AbortController(),mockSnapshot:(this.p as Connections).mock?.enabled?(await this.mockSnapshots().findOne({filter:{key:`mock-google-run:${(job as {id: string}).id}`},transaction}))?.get('payload') as unknown:null};this.inFlight=flight;
    await this.repo('nrSyncJobs').update({filterByTk:job.id,values:{status:'running'},transaction});return true;
   });
   if(!claimed)return false;
   const {job}=flight as SyncFlight,id=String(job.get('projectId'));
   const execute=async(): Promise<boolean>=>{
   const source=job.get('source'),link=await this.link(id);
   if(job.get('resource')!==link.get(source==='ga4'?'ga4PropertyId':'gscSiteUrl'))throw new Error('resource_changed');
   // Bound the whole block (including token refresh and pagination), not just each HTTP request.
   const signal=AbortSignal.any([flight.controller.signal,AbortSignal.timeout(120000)]);
   signal.throwIfAborted();
   const overviewOnly=['history-fill','history-refresh'].includes(job.get('trigger'));
   const cursor=String(job.get('cursor')),end=String([shift(cursor,6),String(job.get('endDate'))].sort()[0]);
   // A normal sync may have filled these dates while this task was waiting. Do not request or overwrite them.
   const stored=job.get('trigger')==='history-fill'?await this.overviewParts(id,String(job.get('resource')),cursor,end):[];
   const covered=new Set(stored.filter(p=>validOverview(p.get('payload'),String(p.get('date')))).map(p=>String(p.get('date'))));
   const missing=intervals(datesBetween(cursor,end).filter(d=>!covered.has(d)));
   const token=missing.length?await this.p.token(id,signal):null;
   let propertyTimeZone='UTC';if(source==='ga4'){const property=await (this.p.googleJson?this.p.googleJson.bind(this.p,id):googleJson)(`${GOOGLE_ENDPOINTS.analyticsAdmin}/properties/${job.get('resource')}`,{...jsonRequest(token),signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});propertyTimeZone=property.timeZone||'UTC';await this.rememberProperty(id,job.get('resource'),property);}
   const fetcher=this.p.googleFetch?.(id)||fetch;
   const collector=this.collector({db:{sequelize:{transaction:fn=>fn(null)}},getAccessToken:async()=>token,fetcher:(url,init={})=>fetcher(url,{...init,signal:AbortSignal.any([signal,...(init.signal?[init.signal]:[])])}),propertyId:link.get('ga4PropertyId'),siteUrl:link.get('gscSiteUrl'),propertyTimeZone,reportTypes:source==='ga4'?['overview','source','page']:overviewOnly?['overview']:['overview','query_page'],searchTypes:['web'],dataState:'final'});
   for(const range of missing)await collector[source==='ga4'?'syncGa4':'syncGsc']({startDate:range.start,endDate:range.end});
   signal.throwIfAborted();
   const partitions=[];
   for(let date=cursor;date<=end;date=shift(date,1))for(const grain of source==='ga4'?['overview','source','page']:overviewOnly?['overview']:['overview','query_page']){
    if(covered.has(date))continue;
    const payload=compact(collector.batches.filter(r=>r.periodDate===date&&r.grainType===grain),grain);
    partitions.push({partitionKey:JSON.stringify([id,source,job.get('resource'),date,grain]),projectId:id,source,resource:job.get('resource'),date,grain,payload});
   }
   return await this.p.db.sequelize.transaction(async (transaction: LegacyTransaction)=>{
    if(!await this.lock(transaction)||!await this.currentJob(flight,transaction))return false;
    const currentLink=await this.link(id);
    if(currentLink.get('ga4PropertyId')!==link.get('ga4PropertyId')||currentLink.get('gscSiteUrl')!==link.get('gscSiteUrl'))throw new Error('resource_changed');
    for(const values of partitions){const r=this.repo('nrSyncPartitions'),old=await r.findOne({filter:{partitionKey:values.partitionKey},transaction});if(old)await r.update({filterByTk:old.id,values,transaction});else await r.create({values,transaction});}
    const finished=end===job.get('endDate');await this.repo('nrSyncJobs').update({filterByTk:job.id,values:{cursor:shift(end,1),status:finished?'succeeded':'running',recordCount:Number(job.get('recordCount')||0)+collector.batches.length,attempts:0,errorCode:null,retryAt:null,...(finished?{finishedAt:new Date().toISOString()}: {})},transaction});
    if(finished&&!overviewOnly)await this.p.db.getRepository('nrGoogleLinks').update({filterByTk:currentLink.id,values:{lastSyncAt:new Date().toISOString()},transaction});return true;
   });
   };
   if((this.p as Connections).mock?.enabled){if(!flight.mockSnapshot||typeof flight.mockSnapshot!=='object'||!('projectId' in flight.mockSnapshot)||flight.mockSnapshot.projectId!==String(id))throw Object.assign(new Error('NR_MOCK_RUN_SNAPSHOT_REQUIRED'),{code:'NR_MOCK_RUN_SNAPSHOT_REQUIRED'});return await (this.p as Connections).mock.runSnapshot(flight.mockSnapshot,()=>(this.p as Connections).network.run(String(id),execute));}
   return await execute();
  }catch(e){
   if(flight?.controller.signal.aborted)return false;
   const code=['TimeoutError','AbortError'].includes(e?.name)?'network_timeout':safeError(e);
   if(flight)await this.p.db.sequelize.transaction(async (transaction: LegacyTransaction)=>{
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
 async refreshFresh(id){
  const controller=new AbortController(),key=String(id),flights=this.freshFlights.get(key)||new Set();flights.add(controller);this.freshFlights.set(key,flights);
  try{return await this.collectFresh(id,controller.signal);}finally{flights.delete(controller);if(!flights.size)this.freshFlights.delete(key);}
 }
 async collectFresh(id,signal: AbortSignal){signal.throwIfAborted();const clock=(this.p as Connections).mock?.enabled?new Date((this.p as Connections).mock.context(String(id)).clock):new Date(),link=await this.link(id),token=await this.p.token(id,signal),la=calendarDateInTimeZone('America/Los_Angeles',clock),start=shift(la,-2);
  let tz='UTC';try{const property=await (this.p.googleJson?this.p.googleJson.bind(this.p,id):googleJson)(`${GOOGLE_ENDPOINTS.analyticsAdmin}/properties/${link.get('ga4PropertyId')}`,{...jsonRequest(token),signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});tz=property.timeZone||'UTC';await this.rememberProperty(id,link.get('ga4PropertyId'),property);}catch{tz='UTC';}
  signal.throwIfAborted();
  const out={fetchedAt:new Date().toISOString(),ga4Resource:link.get('ga4PropertyId'),gscResource:link.get('gscSiteUrl'),gsc:[],ga4:[]};
  for(const source of ['gsc','ga4']){const end=shift(calendarDateInTimeZone(source==='ga4'?tz:'America/Los_Angeles',clock),-1);if(end<start)continue;
   const c=this.collector({db:{sequelize:{transaction:fn=>fn(null)}},getAccessToken:async()=>token,fetcher:(url: string | URL,init: RequestInit={})=>((this.p as Connections).googleFetch?.(id)||fetch)(url,{...init,signal:AbortSignal.any([signal,...(init.signal?[init.signal]:[])])}),propertyId:link.get('ga4PropertyId'),siteUrl:link.get('gscSiteUrl'),propertyTimeZone:tz,reportTypes:['overview'],searchTypes:['web'],dataState:'all'});
   await c[source==='ga4'?'syncGa4':'syncGsc']({startDate:start,endDate:end});
   signal.throwIfAborted();
   out[source]=compact(c.batches.filter(r=>r.grainType==='overview'&&r.periodDate>=start&&r.periodDate<=end),'overview').map(r=>source==='ga4'?{date:r.date,views:r.views,uv:r.uv,sessions:r.sessions,engaged:r.engaged,conversions:r.conversions}:{date:r.date,clicks:r.clicks,impressions:r.impressions,position:r.position}).sort((a,b)=>a.date.localeCompare(b.date));}
  const db=(this.p as {db: LegacyDatabase}).db;
  return db.sequelize.transaction(async (transaction: LegacyTransaction)=>{
   await db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('nocoreach-google-sync'))",{transaction});
   signal.throwIfAborted();const current=await this.link(id);if(current.get('ga4PropertyId')!==link.get('ga4PropertyId')||current.get('gscSiteUrl')!==link.get('gscSiteUrl'))throw new Error('resource_changed');
  const r=this.repo('nrSnapshots'),key=`google-fresh:${id}`,old=await r.findOne({filter:{key}});if(old)await r.update({filterByTk:old.id,values:{payload:out}});else await r.create({values:{key,payload:out}});return out;});}
 // The 初步 days after `cutoff` for one source, or none when the store is for other resources.
 async fresh(id,source,cutoff){if(!cutoff)return [];const s=(await this.repo('nrSnapshots').findOne({filter:{key:`google-fresh:${id}`}}))?.get('payload');const link=await this.p.link(id).catch(()=>null);
  if(!s||!link||s.ga4Resource!==link.get('ga4PropertyId')||s.gscResource!==link.get('gscSiteUrl'))return [];return (s[source]||[]).filter(r=>r.date>cutoff);}
 async tick(){if(this.busy||this.stopped)return;const links=await this.repo('nrGoogleLinks').find({filter:{scheduleEnabled:true}});for(const link of links){if(link.get('nextSyncAt')&&Date.parse(link.get('nextSyncAt'))>Date.now())continue;try{await this.enqueue(link.get('projectId'),7,'scheduled');}catch(e){this.p.app.logger.warn('NocoReach scheduled enqueue skipped',{code:safeError(e)});}}
  const deadline=Date.now()+25000;while(Date.now()<deadline&&await this.step()){}
  // Rebuild here after new data lands (and once after a restart) so page requests find it ready.
  // …and the default 搜索表现 and 访问 views (28 days), saved, so opening the page after new data or a restart is immediate.
  // 访问 asks GA4 live, so a failed build waits 15 minutes before the tick tries again.
  // A project nobody has opened lately is not read ahead: its summary comes from the synced days, but Traffic and the
  // breakdowns ask Google. These wait for the new report instead of taking its saved copy, as the tick is what has to read it.
  // Search performance's tables and breakdowns join them at most every 15 minutes, as they change once a day. A report Google
  // refuses in part keeps a short lifetime so that a person opening it soon gets another try, but the tick would read it
  // again each time that ends, all day, if Google goes on refusing the same part: it waits PARTIAL_RETRY_MS instead.
  let idleReads=0;
  for(const id of new Set(links.map(l=>String(l.get('projectId'))))){if(this.stopped)return;await this.snapshots(id).catch(()=>{});await waitForFresh(()=>this.p.dataViews?.search(id,{range:'28'})).catch(()=>{});
   const link=links.find(l=>String(l.get('projectId'))===id),authorizedAt=link?.get('authorizedAt'),active=!this.p.dataViews?.recentlyRead||await this.p.dataViews.recentlyRead(id,authorizedAt);
   const lately=active&&(!this.p.dataViews?.recentlyRead||await this.p.dataViews.recentlyRead(id,authorizedAt,MORNING_REREAD_WITHIN_MS));
   // An idle project's next read waits IDLE_READ_MS, unless someone opens it meanwhile. Traffic is read ahead once per
   // window (`readAhead`): a report held for today's window answers whatever its age. A project opened in the last day is
   // read with `waitForFresh` instead, so the report read in the night is read again when it ends in the morning
   // (website-report.ts, MORNING_READ_HOUR); a report read in the day lasts until midnight either way. A report refused
   // in part is retried with `waitForFresh` too, since `readAhead` would take it back as it is; a retry that fails keeps
   // that mark for the next one 15 minutes later.
   const webNext=this.webNext=this.webNext||new Map(),next=webNext.get(id);
   if((!next||Date.now()>=next.at||(active&&next.idle))&&(active||idleReads<IDLE_READS_PER_TICK)){if(!active)idleReads++;
    await (next?.partial||lately?waitForFresh:readAhead)(()=>this.p.dataViews?.website(id,{range:'28'})).then(r=>{if(r?.complete===false||r?.missing?.length)webNext.set(id,{at:Date.now()+PARTIAL_RETRY_MS,partial:true});else if(active)webNext.delete(id);else webNext.set(id,{at:Date.now()+IDLE_READ_MS,idle:true});},()=>webNext.set(id,{at:Date.now()+15*60000,failed:true,...(next?.partial?{partial:true}:{})}));}
   // A project opened in the last day also has Traffic's other tables read (website-report.ts, `periodTables`), so its tabs
   // and the online agent's Pages answer at once, but once a day: not in the night (`websiteDayRead`), when the read would
   // hold yesterday low and be read again in the morning. Within the day the report held answers; one refused in part
   // waits PARTIAL_RETRY_MS and a failure 15 minutes, as for the figures. While the figures' last read failed they wait
   // with it: the same GA4 or sign-in failure would only be met twice, and the page asks for them only once its figures show.
   if(lately&&!webNext.get(id)?.failed){const tablesNext=this.tablesNext=this.tablesNext||new Map();
    if(Date.now()>=(tablesNext.get(id)||0)&&await this.p.dataViews?.websiteDayRead?.(id,link?.get('ga4PropertyId'))?.catch(()=>false))
     await waitForFresh(()=>this.p.dataViews.websiteTables(id,{range:'28'})).then(r=>{if(r?.complete===false||r?.missing?.length)tablesNext.set(id,Date.now()+PARTIAL_RETRY_MS);else tablesNext.delete(id);},()=>tablesNext.set(id,Date.now()+15*60000));}
   if(!active)continue;
   const searchNext=this.searchNext=this.searchNext||new Map();if(Date.now()>=(searchNext.get(id)||0)){searchNext.set(id,Date.now()+15*60000);await waitForFresh(()=>this.p.dataViews?.warm?.(id)).then(r=>{if(r?.partial)searchNext.set(id,Date.now()+PARTIAL_RETRY_MS);},()=>{});}}
  for(const id of new Set(links.map(l=>String(l.get('projectId'))))){if(Date.now()>=deadline+20000||this.stopped)break;const at=Math.max(this.freshTried?.get(id)||0,Date.parse((await this.repo('nrSnapshots').findOne({filter:{key:`google-fresh:${id}`}}))?.get('payload')?.fetchedAt||'')||0);if(Date.now()-at<FRESH_MS)continue;
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
  const started=Date.now(),promise=(async()=>{
   const saved=await this.restore(id,key);
   if(saved){cache.set(id,{key,value:deepFreeze(saved)});this.p.app?.logger?.info('NocoReach snapshots restored',{projectId:id,partitions:count,ms:Date.now()-started});return saved;}
   const value=await this.build(id,link,project);cache.set(id,{key,value:deepFreeze(value)});this.p.app?.logger?.info('NocoReach snapshots rebuilt',{projectId:id,partitions:count,ms:Date.now()-started});
   // Only a build outside a transaction is committed data; one inside may still roll back.
   if(!transaction)void this.keep(id,key,value);
   return value;})().finally(()=>{if(building.get(id)?.promise===promise)building.delete(id);});
  building.set(id,{key,promise});return promise;}
 // A rebuild after a restart read every stored day while the whole process waited (6 to 18 seconds for a production
 // project), so each build is kept with its key and a later one for the same key restores it. A read inside a
 // transaction sees only committed rows, so it may restore too.
 async restore(id,key){try{const saved=(await this.repo('nrSnapshots').findOne({filter:{key:`${SAVED_SNAPSHOTS}:${id}`}}))?.get('payload');return saved?.key===key&&Array.isArray(saved.value)?saved.value:null;}catch{return null;}}
 // Writes for a project run one after another, so an older build never replaces a newer one's copy; a copy over the
 // size limit is dropped rather than kept for a key it no longer matches.
 async keep(id,key,value){const keeping=this.keeping=this.keeping||new Map();
  const write=(keeping.get(id)||Promise.resolve()).then(async()=>{try{const repo=this.repo('nrSnapshots'),snapshot=`${SAVED_SNAPSHOTS}:${id}`,payload={key,value},row=await repo.findOne({filter:{key:snapshot}});
   if(JSON.stringify(payload).length>MAX_SAVED_SNAPSHOT_BYTES){if(row)await repo.destroy({filter:{key:snapshot}});return;}
   if(row)await repo.update({filter:{key:snapshot},values:{payload}});else await repo.create({values:{key:snapshot,payload}});}
   catch(e){this.p.app?.logger?.warn?.('NocoReach snapshots not saved',{projectId:id,message:e?.message});}});
  keeping.set(id,write);try{await write;}finally{if(keeping.get(id)===write)keeping.delete(id);}}
 // Pages of 200 with an offset made the database read every stored day, payloads included, and sort them again for each
 // page (the id order is a nulls-last `case` no index serves), while the whole process waited. The ids are read once,
 // then the linked days by key, 200 at a time in id order, giving way to other requests between reads (SQLite answers
 // synchronously). Project and resource are checked again on the rows read: filtering on the project as well would make
 // the database search the project's index instead of looking up the keys.
 async build(id,link,project){const r=this.repo('nrSyncPartitions'),linked=p=>p.resource===(p.source==='ga4'?link.get('ga4PropertyId'):link.get('gscSiteUrl')),wanted=[],rows=[];
  const listed=(await r.find({filter:{projectId:id},fields:['id','source','resource'],sort:['id']})).map(p=>p.toJSON());
  // The same limit, counted page by page as before, now reached before any stored day is read.
  for(let offset=0;;offset+=200){const page=listed.slice(offset,offset+200);wanted.push(...page.filter(linked).map(p=>p.id));if(page.length<200)break;if(wanted.length>12000)throw Object.assign(new Error(systemMessageText('sync.syncDataRangeTooLarge')),{status:409});}
  for(let i=0;i<wanted.length;i+=200){await new Promise(resolve=>setImmediate(resolve));for(const p of (await r.find({filter:{id:{$in:wanted.slice(i,i+200)}},sort:['id']})).map(p=>p.toJSON()))if(String(p.projectId)===String(id)&&linked(p))rows.push(p);}
  return buildSnapshots(rows,project);}
}
export { SyncService, StagedSync };
