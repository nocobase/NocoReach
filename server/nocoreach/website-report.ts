// @ts-nocheck
// 访问 (GA4), rebuilt 2026-10-14 after GA4's own reports (user request: everything GA4 shows, not just views, sources
// and pages). Read live from the GA4 Data API instead of the synced days: users counted over a period are deduplicated
// by GA4, while adding up synced days counts a person once per day. Three parts, each cached:
// - period: the totals, the daily line and the tables the page shows before a tab is opened (FIRST_TABLES), for a window
//   that ends yesterday in the property's time zone; kept until midnight there, when yesterday moves on, except that a
//   report read in the night is read again in the morning, once GA4 has most of yesterday (MORNING_READ_HOUR). The sync
//   tick reads it ahead. `periodTables`, the other report tables (Landing pages, Pages, Geography, Tech…), follows the same rules but is
//   read when the page is opened, and by the tick only once a day for a project opened in the last day: they are most
//   of the rows, and most visits never open their tabs.
// - today: today so far against yesterday and the same weekday last week up to the same hour, per hour, and today's
//   sources (GA4's standard data, which lags; the realtime API has no source dimension). Ten minutes.
// - realtime: the last 30 minutes from the Realtime API — users, per minute, pages, countries, cities, devices, events.
//   One minute.
// A detail drawer reads one row's days on demand. Nothing here is written to the synced partitions. Every request goes
// through the project's Google connection (`googleFetch`), so proxy profiles and simulated data apply as for the sync.
import { AsyncLocalStorage } from 'node:async_hooks';
import { systemMessageText } from '../../shared/i18n/messages.js';
import { businessNow } from './business-clock.js';
import { GOOGLE_ENDPOINTS, googleJson, jsonRequest } from './google-client.js';
import { aiProviders, calendarDateInTimeZone, resolveGa4SyncRange } from './google-sync.js';
import { Ga4Requests } from './ga4-requests.js';
import { Ga4ReportCache } from './ga4-report-cache.js';
import { GA4_HISTORY_CACHE_MS, GA4_PARTIAL_CACHE_MS, GA4_TODAY_CACHE_MS, GA4_REALTIME_CACHE_MS } from '../../shared/ga4-cache.js';
import { GOOGLE_SAVED_REPORT_MS } from '../../shared/google-cache.js';
import type { LegacyDatabase } from './legacy/database.js';

const DATA=GOOGLE_ENDPOINTS.analyticsData,MIN=60000,HOUR=3600000;
// GA4 answers 429 when the property's ten concurrent requests or its hourly tokens are used up, by this app's nine and
// by anything else using the property. A request is asked again three times, after these waits, before it fails. It
// waits outside the queue, so other reads of the property go on meanwhile.
const RETRY_429_MS=[10000,30000,60000];
// A reader that must answer within a time sets a deadline the waits may not pass: the online agent's reply stops after
// 90 seconds without output. GA4's hourly token quota does not come back within these waits, so that 429 fails at once.
const retryDeadline=new AsyncLocalStorage<number>();
const withGa4RetryDeadline=<T,>(deadline:number,read:()=>Promise<T>):Promise<T>=>retryDeadline.run(deadline,read);
// GA4's standard reports fill in an hour over the next couple of hours: the last two hours it has data for are still
// partial (on Studio, 63 and 10 views against 119 and 188 the day before), so 今天 compares only the hours before them.
const SETTLING_HOURS=2;
// Traffic's window ends yesterday, which GA4 is still filling in just after midnight. A period report read before this
// hour in the property's zone lives until it, so the next visit reads yesterday again nearly whole; a later one lasts until
// midnight. A read in the hour before it already has most of yesterday and lasts until midnight too, rather than minutes.
// The sync tick reads it again at this hour only for a project opened in the last day (sync-service.ts), so the
// morning's first visit sees yesterday whole: twice a day for a project in use, once for one nobody opens.
const MORNING_READ_HOUR=6;
const fail=(message,status)=>{throw Object.assign(new Error(message),{status});};
// Google's own words for a failed request (its status and message), short enough to show on the page.
const googleReason=e=>e?.code==='google_api_error'&&e.message?`${e.status?`HTTP ${e.status} · `:''}${String(e.message)}`.slice(0,300):'';
// Session metrics for the totals and the session-scoped tables (GA4 Traffic acquisition, Landing page, User attributes, Tech).
const SESSION=['activeUsers','newUsers','sessions','engagedSessions','userEngagementDuration','screenPageViews','eventCount','keyEvents','sessionKeyEventRate'];
// GA4 Pages and screens; Events.
const PAGE=['screenPageViews','activeUsers','userEngagementDuration','eventCount','keyEvents'];
const EVENT=['eventCount','activeUsers','keyEvents'];
// The report tables: GA4 dimensions, metrics, the metric they are sorted by and how many rows are kept.
const TABLES={
 channel:{dims:['sessionDefaultChannelGroup'],limit:50},
 sourceMedium:{dims:['sessionSource','sessionMedium'],limit:500},
 campaign:{dims:['sessionCampaignName'],limit:200},
 landing:{dims:['landingPagePlusQueryString'],limit:500},
 page:{dims:['pagePath','pageTitle'],metrics:PAGE,order:'screenPageViews',limit:1000},
 event:{dims:['eventName'],metrics:EVENT,order:'eventCount',limit:200},
 newVsReturning:{dims:['newVsReturning'],limit:10},
 device:{dims:['deviceCategory'],limit:10},
 country:{dims:['countryId','country'],limit:250},
 city:{dims:['city','countryId'],limit:250},
 language:{dims:['languageCode','language'],limit:100},
 browser:{dims:['browser'],limit:50},
 os:{dims:['operatingSystem'],limit:50},
};
// Which dimensions identify a row for its detail (a page row is a path; its titles are merged).
const ROW_KEYS={page:['pagePath']};
const KEEP={sourceMedium:300,landing:300,page:300,city:200};
// The change sentence: channels, pages and landing pages read for both periods, so the page can say where a figure's
// change came from (views and key events by page; sessions and new users by landing page, where a session starts). TABLES
// read the current period only, but a table of a change's own dimension is read with it (PAIRED).
const CHANGES={
 channel:{dim:'sessionDefaultChannelGroup',metrics:['screenPageViews','sessions','keyEvents','newUsers','activeUsers'],order:'sessions',limit:200},
 page:{dim:'pagePath',metrics:['screenPageViews','keyEvents'],order:'screenPageViews',limit:2000},
 landing:{dim:'landingPagePlusQueryString',metrics:['sessions','newUsers'],order:'sessions',limit:2000},
};
const CHANGE_KEEP=500;
// The page's figures, Channels, New / returning, Devices, the change sentence's channels and the quality notes (events,
// source / medium) come from these; the other tables and the pages behind a change are read with `periodTables`.
const FIRST_TABLES=['channel','newVsReturning','device','event','sourceMedium'];
const REST_TABLES=Object.keys(TABLES).filter(n=>!FIRST_TABLES.includes(n));
// Tables read as one report over both periods with the change of the same dimension: Channel in the first part, and
// Landing pages in the other, which makes that part nine reports, one round of the nine reads at once (Ga4Requests).
// Pages are not paired: their table is by path and title. The changes left are read on their own (LONE_CHANGES).
const PAIRED=Object.keys(CHANGES).filter(n=>TABLES[n]?.dims.join()===CHANGES[n].dim);
const LONE_CHANGES=Object.keys(CHANGES).filter(n=>!PAIRED.includes(n));
// A paired report keeps the current period's rows for its table. GA4 answers each period for every value seen in either,
// at zero where it had none, so a value seen only in the period before is dropped, as a report of the current period alone
// leaves it out. Its row limit is the change's and covers both periods; the table keeps the current period's first rows
// (KEEP), which only a period before with far more values ahead of them would push past it.
const currentOf=report=>{const i=(report?.dimensionHeaders||[]).findIndex(h=>h.name==='dateRange');return i<0?report:{...report,rows:(report.rows||[]).filter(r=>r.dimensionValues?.[i]?.value==='current'&&(r.metricValues||[]).some(m=>Number(m?.value)))};};
// One row per value with its current and previous figures; the largest in either period first. A page is its path:
// GA4 counts /cn and /cn/ (and a landing page with each query string) apart, which would split one page's change.
const pathKey=v=>{const p=String(v).split(/[?#]/)[0].replace(/\/+$/,'');return p||(String(v).startsWith('/')?'/':String(v));};
function changeRows(name,report){const c=CHANGES[name],by=new Map();
 for(const r of rowsOf(report)){const k=name==='channel'?r[c.dim]:pathKey(r[c.dim]);if(!by.has(k))by.set(k,{key:k,current:{},previous:{}});const o=by.get(k)[r.dateRange==='previous'?'previous':'current'];for(const [f,v] of Object.entries(values(Object.fromEntries(c.metrics.filter(m=>m in r).map(m=>[m,r[m]])))))o[f]=(o[f]||0)+v;}
 const size=r=>Math.max(...Object.values(r.current),...Object.values(r.previous),0);
 return [...by.values()].sort((a,b)=>size(b)-size(a)).slice(0,CHANGE_KEEP);}
// A day (YYYY-MM-DD) within a range.
const inWindow=(date:string,from:string,to:string)=>date>=from&&date<=to;
// Whether `zone` names a time zone Intl knows.
const knownZone=(zone:unknown):zone is string=>{if(typeof zone!=='string'||!zone)return false;try{new Intl.DateTimeFormat('en-US',{timeZone:zone});return true;}catch{return false;}};
// Milliseconds from `now` to the next midnight in `zone` (UTC when the zone is unknown to Intl).
function untilMidnight(zone:string,now:number){let clock;try{clock=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));}catch{return 24*HOUR-now%(24*HOUR);}
 return 24*HOUR-((Number(clock.hour)*60+Number(clock.minute))*60+Number(clock.second))*1000-now%1000;}
const range=(startDate,endDate,name)=>({startDate,endDate,...(name?{name}:{})});
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
function rowsOf(report){const dims=(report?.dimensionHeaders||[]).map(h=>h.name),mets=(report?.metricHeaders||[]).map(h=>h.name);
 return (report?.rows||[]).map(r=>{const o={};dims.forEach((d,i)=>{o[d]=r.dimensionValues?.[i]?.value??'';});mets.forEach((m,i)=>{o[m]=num(r.metricValues?.[i]?.value);});return o;});}
// GA4 names → the page's names. Users of a row are GA4's own count for that row; rows of one table do not add up to the total.
function values(r){const o={};for(const [to,from] of [['users','activeUsers'],['newUsers','newUsers'],['sessions','sessions'],['engaged','engagedSessions'],['duration','userEngagementDuration'],['views','screenPageViews'],['events','eventCount'],['keyEvents','keyEvents'],['keyEventRate','sessionKeyEventRate']])if(from in r)o[to]=r[from];return o;}
const aiOf=text=>aiProviders.find(([,p])=>p.test(text))?.[0]||null;
const request=(dims,metrics,dateRanges,order,limit,filter)=>({dateRanges,dimensions:dims.map(name=>({name})),metrics:metrics.map(name=>({name})),...(order?{orderBys:[{metric:{metricName:order},desc:true}]}:{}),...(limit?{limit:String(limit)}:{}),...(filter?{dimensionFilter:filter}:{}),keepEmptyRows:false});
const exact=pairs=>({andGroup:{expressions:pairs.map(([fieldName,value])=>({filter:{fieldName,stringFilter:{matchType:'EXACT',value,caseSensitive:true}}}))}});
// A row's identity: its key dimensions joined, so the page can ask for that row's days.
function tableRows(name,report){const t=TABLES[name];const rows=rowsOf(report);
 if(name==='page'){const by=new Map();for(const r of rows){const k=r.pagePath;const o=by.get(k);if(!o){by.set(k,{key:k,dims:{pagePath:k},title:r.pageTitle,top:r.screenPageViews,...values(r)});continue;}
   for(const [f,v] of Object.entries(values(r)))o[f]=(o[f]||0)+v;if(r.screenPageViews>o.top){o.top=r.screenPageViews;o.title=r.pageTitle;}}
  return [...by.values()].map(({top,...o})=>o).sort((a,b)=>b.views-a.views).slice(0,KEEP.page);}
 return rows.map(r=>{const dims=Object.fromEntries(t.dims.map(d=>[d,r[d]]));const o={key:t.dims.map(d=>r[d]).join('\u0001'),dims,...values(r)};
  if(name==='sourceMedium'){const ai=aiOf(`${r.sessionSource} ${r.sessionMedium}`);if(ai)o.ai=ai;}return o;}).slice(0,KEEP[name]||t.limit);}

class WebsiteReport{
 requests=new Ga4Requests();
 tokenPending=new Map<string|number,Promise<string>>();
 zonePending=new Map<string,Promise<string>>();
 tokens=new Map<string|number,{at:number;token:string}>();
 history:Ga4ReportCache;
 constructor(plugin){this.p=plugin;this.history=new Ga4ReportCache((plugin as {db?:LegacyDatabase}).db,'ga4-reports',(plugin as {app?:{logger?:{warn(message:string,meta?:Record<string,unknown>):void}}}).app?.logger);this.zones=new Map();this.todayCache=new Map();this.liveCache=new Map();}
 // The project's Google connection (proxy profile or simulated upstream), the same one the sync uses.
 json(id,url,init){return googleJson(url,init,this.p.googleFetch?.(id));}
 // Access tokens last an hour; keep one for 45 minutes so the per-minute realtime view does not refresh it every time.
 async token(id:string|number):Promise<string>{const hit=this.tokens.get(id);if(hit&&Date.now()-hit.at<45*MIN)return hit.token;
  if(this.tokenPending.has(id))return this.tokenPending.get(id);
  const plugin=this.p as {token:(id:string|number)=>Promise<string>};
  const pending=Promise.resolve().then(()=>plugin.token(id)).then(token=>{this.tokens.set(id,{at:Date.now(),token});return token;},e=>this.explain(e)).finally(()=>this.tokenPending.delete(id));this.tokenPending.set(id,pending);return pending;}
 // Google's errors become a reason people can act on; NocoReach's own (such as 请先授权 Google 账号) pass through.
 explain(e){if(e?.code==='invalid_grant')fail(systemMessageText('google.authorizationExpired'),409);
  if(e?.code==='invalid_client')fail(systemMessageText('google.googleRejectedClientAskAdmin'),409);
  if(e?.code==='google_api_error'&&(e?.status===401||e?.status===403))fail(systemMessageText('dataViews.ga4PropertyAccessDenied'),409);
  if(!e?.code&&e?.status&&e.status<500)throw e;
  this.p.app?.logger?.warn('NocoReach GA4 report failed',{message:e?.message,code:e?.code,status:e?.status});const reason=googleReason(e);
  fail(reason?systemMessageText('dataViews.ga4ReadFailedReason',{0:reason}):systemMessageText('dataViews.ga4ReadFailed'),502);}
 scope(id:string|number,property:string){const plugin=this.p as {network?:{mockCacheKey?:(connection:'google',projectId:string)=>string|undefined}};return [String(id),property,plugin.network?.mockCacheKey?.('google',String(id))];}
 async post(id,property,method,body){for(let attempt=0;;attempt++){try{return await this.requests.run(this.scope(id,property),property,method,body,async()=>{const token=await this.token(id);
  try{return await this.json(id,`${DATA}/properties/${property}:${method}`,{...jsonRequest(token,body),signal:AbortSignal.timeout(30000)});}
  catch(e){if(e?.code==='invalid_grant'||e?.status===401)this.tokens.delete(id);throw e;}});}
  catch(e){const deadline=retryDeadline.getStore();if(e?.status!==429||/tokens/i.test(String(e?.message||''))||attempt>=RETRY_429_MS.length||(deadline!==undefined&&Date.now()+RETRY_429_MS[attempt]>deadline))throw e;
   this.p.app?.logger?.warn('NocoReach GA4 rate limited, asking again',{property,method,attempt:attempt+1,message:e?.message});await new Promise(resolve=>{const timer=setTimeout(resolve,RETRY_429_MS[attempt]);timer.unref?.();});}}}
 // Up to five reports per call. A report GA4 refuses (an incompatible combination) is left out on its own, logged,
 // instead of failing the page.
 async batch(id,property,requests){// GA4 takes five reports a request and the lane runs nine at once, so reports go nine at a time, as five and four.
  const parts=[];for(let i=0;i<requests.length;i+=9){const chunk=requests.slice(i,i+9);parts.push(chunk.slice(0,5));if(chunk.length>5)parts.push(chunk.slice(5));}
  const refused=e=>e?.status===400&&e?.code==='google_api_error';
  const one=async r=>{try{return await this.post(id,property,'runReport',r);}catch(x){if(!refused(x))this.explain(x);this.p.app?.logger?.warn('NocoReach GA4 report left out',{message:x?.message,dimensions:r.dimensions?.map(d=>d.name)});return null;}};
  const done=await Promise.all(parts.map(async part=>{try{const reports=(await this.post(id,property,'batchRunReports',{requests:part})).reports||[];return part.map((_,i)=>reports[i]||null);}
   catch(e){if(!refused(e))this.explain(e);const out=[];for(const r of part)out.push(await one(r));return out;}}));
  return done.flat();}
 // The property's time zone, kept a day. A failed lookup keeps the last known zone (or UTC, unconfirmed) for five minutes
 // only, so one timeout does not leave the Today card on the wrong hours for a day. Callers at the same time share one lookup, so a
 // late failure cannot overwrite a zone another lookup has just confirmed. With none known yet (after a restart), the zone
 // the GA4 sync kept on the project answers at once: a page with a saved report does not wait on the Admin API, and an
 // Admin API failing then cannot end Traffic's windows in UTC-12 and replace that report with a day-short one.
 timeZone(id,property){const hit=this.zones.get(property);if(hit&&Date.now()-hit.at<hit.ttl)return Promise.resolve(hit.zone);
  if(!this.zonePending.has(property))this.zonePending.set(property,(hit?this.lookupZone(id,property):this.savedZone(id,property).then(zone=>zone||this.lookupZone(id,property))).finally(()=>this.zonePending.delete(property)));return this.zonePending.get(property);}
 // The zone kept on the project for this property (sync-service.ts, `rememberProperty`), trusted for a day like a lookup.
 async savedZone(id,property){let project;try{project=await this.p.project?.(id);}catch{return '';}
  const zone=String(project?.analyticsPropertyId)===String(property)?project?.analyticsPropertyTimeZone:'';if(!knownZone(zone))return '';
  this.zones.set(property,{at:Date.now(),zone,confirmed:true,ttl:24*HOUR});return zone;}
 async lookupZone(id,property){let zone='UTC',confirmed=true,ok=true;
  try{zone=(await this.json(id,`${GOOGLE_ENDPOINTS.analyticsAdmin}/properties/${property}`,{...jsonRequest(await this.token(id)),signal:AbortSignal.timeout(20000)})).timeZone||'UTC';}
  catch(e){ok=false;const known=this.zones.get(property);zone=known?.zone||'UTC';confirmed=Boolean(known?.confirmed);this.p.app?.logger?.warn('NocoReach GA4 time zone lookup failed',{message:e?.message,code:e?.code,status:e?.status});}
  this.zones.set(property,{at:Date.now(),zone,confirmed,ttl:ok?24*HOUR:5*MIN});return zone;}

 // The zone Traffic's windows end in: the property's own unless the lookup failed with none confirmed, then UTC-12,
 // the last zone to finish a day, so the window may end a day early but never on a day still under way.
 endZone(property:string,zone=this.zones.get(property)?.zone){return this.zones.get(property)?.confirmed===false?'Etc/GMT+12':zone||'UTC';}
 // Yesterday in that zone: the last full day GA4 can report, and the end of every Traffic window. A zone already
 // looked up is used even past its time while a new lookup runs, so the page waits on the Admin API only the first time.
 async yesterday(id:string|number,property:string){const hit=this.zones.get(property);if(hit&&Date.now()-hit.at>=hit.ttl)void this.timeZone(id,property).catch(()=>{});
  const zone=this.endZone(property,hit?hit.zone:await this.timeZone(id,property)),now=new Date(businessNow(this.p,id,'google'));
  try{return resolveGa4SyncRange({},zone,now).targetEnd;}catch{return resolveGa4SyncRange({},'Etc/GMT+12',now).targetEnd;}}
 // The totals, the daily line and the tables all cover the window `w`, which ends yesterday: GA4 is still processing its
 // last two days, so a report read in the night is read again at MORNING_READ_HOUR, and any lasts at most until midnight
 // where it ends, when yesterday moves on and the same range names other days. The browser keys the page by range, not by window, so the expiry it gets
 // is cut to this instance's own midnight (a stored copy may come from another zone), and to five minutes while the zone
 // is unconfirmed: it then asks again and moves to the property's own yesterday once the lookup succeeds. A new day's
 // window is answered from the view's previous one while it is read, so the report keeps the window it holds, and the
 // `settledThrough` of the day it was read: its days after that were still being processed when GA4 gave them.
 // Whether a period report read at `now` is a night read, which lives only until MORNING_READ_HOUR: one read before the
 // hour before it. The sync tick reads `periodTables` ahead only when it is not, so once a day, with yesterday whole.
 nightRead(property:string,now:number){return 24*HOUR-untilMidnight(this.endZone(property),now)<(MORNING_READ_HOUR-1)*HOUR;}
 // Whether a period report read now lasts until midnight. With no zone held yet it is looked up first, as `yesterday` does,
 // so the hour is the property's rather than UTC's; one held past its time is used while it is refreshed. A project with
 // no GA4 property has nothing to read ahead, and no zone to look up.
 async dayRead(id:string|number,property:string){if(!property)return false;if(!this.zones.has(property))await this.timeZone(id,property);return !this.nightRead(property,businessNow(this.p,id,'google'));}
 period(id:string|number,property:string,w:unknown,options:{cutoff?:string;settledThrough?:string;view?:unknown[]}={}){return this.periodPart('period',id,property,w,options,()=>this.readPeriod(id,property,w));}
 // The other report tables of the same window, with the same lifetime; their own family, so neither part's copy retires
 // the other's.
 periodTables(id:string|number,property:string,w:unknown,options:{cutoff?:string;settledThrough?:string;view?:unknown[]}={}){return this.periodPart('period-tables',id,property,w,options,()=>this.readTables(id,property,w));}
 periodPart(part:string,id:string|number,property:string,w:unknown,{cutoff,settledThrough,view}:{cutoff?:string;settledThrough?:string;view?:unknown[]},read:()=>Promise<unknown>){const now=businessNow(this.p,id,'google'),guessed=this.zones.get(property)?.confirmed===false;
  return this.history.load(String(id),[part,...this.scope(id,property),w],async()=>({...await read(),window:w,...(cutoff?{cutoff}:{}),...(settledThrough?{settledThrough}:{})}),value=>{const left=untilMidnight(this.endZone(property),now),since=24*HOUR-left;return value.complete===false||value.missing.length?Math.min(GA4_PARTIAL_CACHE_MS,left):this.nightRead(property,now)?MORNING_READ_HOUR*HOUR-since:left;},
   (value,cacheExpiresAt,saved)=>({...value,cacheExpiresAt:Math.min(cacheExpiresAt,Date.now()+(guessed?GA4_PARTIAL_CACHE_MS:untilMidnight(this.endZone(property),now))),...saved}),view?{family:[part,...this.scope(id,property),...view]}:{});}
 async readPeriod(id,property,w){const both=[range(w.start,w.end,'current'),range(w.previousStart,w.previousEnd,'previous')];
  const reports=await this.batch(id,property,[
   request([],SESSION,both),
   request(['date'],SESSION,both,null,Math.max(1000,(w.days||Math.ceil((Date.parse(w.end)-Date.parse(w.start))/86400000)+1)*2)),
   ...this.tableRequests(w,FIRST_TABLES,[]),
  ]);
  const [totalsReport,dailyReport,...rest]=reports;if(!totalsReport)fail(systemMessageText('dataViews.ga4ReadFailed'),502);
  const totals=Object.fromEntries(rowsOf(totalsReport).map(r=>[r.dateRange,values(r)]));
  const daily=rowsOf(dailyReport).map(r=>({period:r.dateRange,date:`${r.date.slice(0,4)}-${r.date.slice(4,6)}-${r.date.slice(6,8)}`,...values(r)}));
  // With two date ranges and the date dimension GA4 answers every day of both ranges for each range, zeros outside
  // it: keep each range's own days, or the line runs over the other period's days at zero (UI review 2026-10-21).
  const out={totals:{current:totals.current||null,previous:totals.previous||null},daily:daily.filter(r=>r.period==='current'&&inWindow(r.date,w.start,w.end)).map(({period,...r})=>r).sort((a,b)=>a.date.localeCompare(b.date)),
   previousDaily:daily.filter(r=>r.period==='previous'&&inWindow(r.date,w.previousStart,w.previousEnd)).map(({period,...r})=>r).sort((a,b)=>a.date.localeCompare(b.date)),
   ...this.tablesOf(w,FIRST_TABLES,[],rest),complete:reports.every(Boolean)};
  if(w.all){out.totals.previous=null;out.previousDaily=[];}
  return out;}
 async readTables(id,property,w){const reports=await this.batch(id,property,this.tableRequests(w,REST_TABLES,LONE_CHANGES));
  return {...this.tablesOf(w,REST_TABLES,LONE_CHANGES,reports),complete:reports.every(Boolean)};}
 // A table's report, over both periods with the order and limit of its change when PAIRED, then the changes read alone.
 tableRequests(w,names,changeNames){const both=[range(w.start,w.end,'current'),range(w.previousStart,w.previousEnd,'previous')],current=[range(w.start,w.end)];
  return [...names.map(n=>{const t=TABLES[n],c=CHANGES[n];return PAIRED.includes(n)?request(t.dims,t.metrics||SESSION,both,c.order,c.limit):request(t.dims,t.metrics||SESSION,current,t.order||'sessions',t.limit);}),
   ...changeNames.map(n=>{const c=CHANGES[n];return request([c.dim],c.metrics,both,c.order,c.limit);})];}
 // `missing` names the tables GA4 refused, a paired one with its change; a change report read alone that it refuses only
 // leaves that part out of the explanation.
 tablesOf(w,names,changeNames,reports){const out={tables:{},missing:[],changes:{}};
  names.forEach((n,i)=>{const r=reports[i];if(!r){out.missing.push(n);return;}const paired=PAIRED.includes(n);out.tables[n]=tableRows(n,paired?currentOf(r):r);if(paired&&!w.all)out.changes[n]=changeRows(n,r);});
  if(!w.all)changeNames.forEach((n,i)=>{const r=reports[names.length+i];if(r)out.changes[n]=changeRows(n,r);});
  return out;}

 // One row of a table over the window: its days against the period before, and its totals for both (deduplicated users).
 // Like the period report, it keeps the `settledThrough` of the day it was read.
 async row(id,property,w,v){const table=String(v.table||''),t=TABLES[table];if(!t)fail(systemMessageText('dataViews.unknownGa4Report'),400);const dims=v.dims||{};
  const pairs=(ROW_KEYS[table]||t.dims).map(k=>{const x=dims[k];if(typeof x!=='string'||x.length>2000)fail(systemMessageText('dataViews.ga4RowMissing'),400);return [k,x];});
  const dates=[w.start,w.end,w.previousStart,w.previousEnd,Boolean(w.all)];// A new window answers from the same row's previous one while it is read, so the row keeps the window it holds,
  // and the `settledThrough` of the day it was read.
  return this.history.load(String(id),['row',...this.scope(id,property),dates,table,pairs],async()=>({...await this.readRow(id,property,w,{table,pairs}),window:w,...(v.settledThrough?{settledThrough:v.settledThrough}:{})}),()=>v.settled===true?GOOGLE_SAVED_REPORT_MS:GA4_HISTORY_CACHE_MS,(value,cacheExpiresAt,saved)=>({...value,cacheExpiresAt,...saved}),Array.isArray(v.view)?{family:['row',...this.scope(id,property),table,pairs,...v.view,Math.round((Date.parse(w.end)-Date.parse(w.start))/86400000)+1,Boolean(w.all)]}:{});}
 async readRow(id,property,w,{table,pairs}){const t=TABLES[table];
  const metrics=t.metrics||SESSION,both=[range(w.start,w.end,'current'),range(w.previousStart,w.previousEnd,'previous')],filter=exact(pairs);
  const [daysReport,totalsReport]=await this.batch(id,property,[request(['date'],metrics,both,null,Math.max(1000,(w.days||Math.ceil((Date.parse(w.end)-Date.parse(w.start))/86400000)+1)*2),filter),request([],metrics,both,null,null,filter)]);
  if(!daysReport||!totalsReport)fail(systemMessageText('dataViews.ga4ReadFailed'),502);
  const day=d=>`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`,days=rowsOf(daysReport),totals=Object.fromEntries(rowsOf(totalsReport).map(r=>[r.dateRange,values(r)]));
  const value={daily:days.filter(r=>r.dateRange==='current'&&inWindow(day(r.date),w.start,w.end)).map(r=>({date:day(r.date),...values(r)})).sort((a,b)=>a.date.localeCompare(b.date)),
   previousDaily:days.filter(r=>r.dateRange==='previous'&&inWindow(day(r.date),w.previousStart,w.previousEnd)).map(r=>({date:day(r.date),...values(r)})).sort((a,b)=>a.date.localeCompare(b.date)),
   totals:{current:totals.current||null,previous:totals.previous||null}};
  if(w.all){value.totals.previous=null;value.previousDaily=[];}
  return value;}

 // 今天: today so far against yesterday and the same weekday last week, up to the same hour in the property's time
 // zone. GA4 has data up to `reached` (never past the clock hour, unless the zone is unconfirmed and the clock would
 // be guessed); the last SETTLING_HOURS of those are still filling in, so the totals, the comparison and the sources
 // all stop at `through`, before them. The hourly line still draws the partial hours, marked from `through`.
 today(id:string|number,property:string){return this.requests.share<unknown>(['today',...this.scope(id,property)],()=>this.readToday(id,property));}
 async readToday(id,property){const key=JSON.stringify(this.scope(id,property)),hit=this.todayCache.get(key);if(hit&&Date.now()<hit.cacheExpiresAt)return hit;
  const zone=await this.timeZone(id,property),now=new Date(businessNow(this.p,id,'google')),date=calendarDateInTimeZone(zone,now);
  const clock=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const hourNow=Number(clock.hour),days=[range('today','today','today'),range('yesterday','yesterday','yesterday'),range('7daysAgo','7daysAgo','lastWeek')];
  const confirmed=this.zones.get(property)?.confirmed!==false;
  const [hourly]=await this.batch(id,property,[request(['hour'],['screenPageViews','sessions','keyEvents'],days,null,100)]);
  const hours=Array.from({length:24},(_,h)=>({hour:h,today:null,yesterday:0,lastWeek:0}));let last=-1;
  for(const r of rowsOf(hourly)){const h=parseInt(r.hour,10);if(!(h>=0&&h<24))continue;const slot=hours[h];
   if(r.dateRange==='today'){slot.today=r.screenPageViews;if(r.screenPageViews||r.sessions)last=Math.max(last,h);}else slot[r.dateRange]=r.screenPageViews;}
  for(const s of hours)if(s.today===null&&s.hour<=last)s.today=0;
  const reached=confirmed?Math.min(hourNow,last+1):last+1,through=Math.max(0,reached-SETTLING_HOURS),sum=(name,upTo)=>hours.filter(s=>s.hour<upTo).reduce((n,s)=>n+(s[name]||0),0);
  // Users up to that hour, deduplicated by GA4 (adding up hours would count a returning visitor again), and today's
  // sources over the same hours, so they add up to no more than the sessions beside them.
  let totals={today:null,yesterday:null,lastWeek:null},sources=[];
  if(through>0){const hoursIn=[...new Set(Array.from({length:through},(_,h)=>[String(h),String(h).padStart(2,'0')]).flat())],upToHour={filter:{fieldName:'hour',inListFilter:{values:hoursIn}}};
   const [upTo,bySource]=await this.batch(id,property,[request([],['activeUsers','screenPageViews','sessions','keyEvents'],days,null,null,upToHour),
    request(['sessionSource','sessionMedium'],['sessions','activeUsers'],[range('today','today')],'sessions',10,upToHour)]);
   for(const r of rowsOf(upTo))totals[r.dateRange]={users:r.activeUsers,views:r.screenPageViews,sessions:r.sessions,keyEvents:r.keyEvents};sources=rowsOf(bySource);}
  const lastWeekDate=new Date(Date.parse(date+'T00:00:00Z')-7*86400000).toISOString().slice(0,10);
  const value={timeZone:zone,timeZoneConfirmed:confirmed,date,lastWeekDate,time:`${clock.hour}:${clock.minute}`,through,reached,hours,totals,
   fullDay:{yesterday:sum('yesterday',24),lastWeek:sum('lastWeek',24)},
   sources:sources.map(r=>({source:r.sessionSource||'(direct)',medium:r.sessionMedium||'',sessions:r.sessions,users:r.activeUsers,ai:aiOf(`${r.sessionSource} ${r.sessionMedium}`)})),fetchedAt:now.toISOString()};
  value.cacheExpiresAt=Date.now()+GA4_TODAY_CACHE_MS;this.todayCache.set(key,value);return value;}

 // 实时: GA4's last 30 minutes. The Realtime API has no source dimension, so where these visitors came from is not here.
 // Events are counted only: the Realtime API refuses eventName with activeUsers ("Selected dimensions and metrics cannot be
 // queried together").
 // Each query stands alone: one GA4 refuses is left out and named in `missing` with Google's reason. Only a failed totals
 // query or an authorization problem fails the view, and then with Google's reason.
 realtime(id:string|number,property:string){return this.requests.share<unknown>(['realtime',...this.scope(id,property)],()=>this.readRealtime(id,property));}
 async readRealtime(id,property){const key=JSON.stringify(this.scope(id,property)),hit=this.liveCache.get(key);if(hit&&Date.now()<hit.cacheExpiresAt)return hit;
  const ask=(dims,metrics,order,limit)=>this.post(id,property,'runRealtimeReport',{dimensions:dims.map(name=>({name})),metrics:metrics.map(name=>({name})),...(order?{orderBys:[{metric:{metricName:order},desc:true}]}:{}),...(limit?{limit:String(limit)}:{})});
  const queries=[['totals',[],['activeUsers','screenPageViews','eventCount','keyEvents']],['minutes',['minutesAgo'],['activeUsers'],null,30],['pages',['unifiedScreenName'],['activeUsers','screenPageViews'],'activeUsers',20],
   ['countries',['countryId','country'],['activeUsers'],'activeUsers',20],['cities',['city','countryId'],['activeUsers'],'activeUsers',20],['devices',['deviceCategory'],['activeUsers'],'activeUsers',10],['events',['eventName'],['eventCount'],'eventCount',20]];
  const settled=await Promise.allSettled(queries.map(([,...q])=>ask(...q))),errors=settled.map(r=>r.status==='rejected'?r.reason:null);
  const denied=errors.find(e=>e&&(e.code==='invalid_grant'||e.code==='invalid_client'||e.status===401||e.status===403));if(denied)this.explain(denied);
  if(errors[0])this.explain(errors[0]);
  const missing=queries.flatMap(([part],i)=>errors[i]?[{part,reason:googleReason(errors[i])||systemMessageText('dataViews.ga4ReadFailed')}]:[]);
  for(const [i,e] of errors.entries())if(e)this.p.app?.logger?.warn('NocoReach GA4 realtime part left out',{part:queries[i][0],message:e.message,code:e.code,status:e.status});
  const [totals,minutes,pages,countries,cities,devices,events]=settled.map(r=>r.status==='fulfilled'?rowsOf(r.value):[]),t=totals[0]||{};
  const perMinute=Array(30).fill(0);for(const r of minutes){const m=parseInt(r.minutesAgo,10);if(m>=0&&m<30)perMinute[29-m]=r.activeUsers;}
  const value={fetchedAt:new Date(businessNow(this.p,id,'google')).toISOString(),users:t.activeUsers||0,views:t.screenPageViews||0,eventCount:t.eventCount||0,keyEvents:t.keyEvents||0,perMinute,
   pages:pages.map(r=>({title:r.unifiedScreenName,users:r.activeUsers,views:r.screenPageViews})),
   countries:countries.map(r=>({id:r.countryId,name:r.country,users:r.activeUsers})),cities:cities.map(r=>({name:r.city,countryId:r.countryId,users:r.activeUsers})),
   devices:devices.map(r=>({name:r.deviceCategory,users:r.activeUsers})),events:events.map(r=>({name:r.eventName,count:r.eventCount})),...(missing.length?{missing}:{})};
  value.cacheExpiresAt=Date.now()+GA4_REALTIME_CACHE_MS;this.liveCache.set(key,value);return value;}
}
export { WebsiteReport, TABLES, CHANGES, FIRST_TABLES, REST_TABLES, tableRows, changeRows, rowsOf, values, RETRY_429_MS, withGa4RetryDeadline };
