// @ts-nocheck
// 访问 (GA4), rebuilt 2026-10-14 after GA4's own reports (user request: everything GA4 shows, not just views, sources
// and pages). Read live from the GA4 Data API instead of the synced days: users counted over a period are deduplicated
// by GA4, while adding up synced days counts a person once per day. Three parts, each cached:
// - period: the totals, the daily line and the report tables (流量获取, 着陆页, 页面, 事件, 地区, 技术) for a window that
//   ends at the synced cutoff, like the other data pages; built once a day per range (data-views.ts saves it).
// - today: today so far against yesterday and the same weekday last week up to the same hour, per hour, and today's
//   sources (GA4's standard data, which lags; the realtime API has no source dimension). Ten minutes.
// - realtime: the last 30 minutes from the Realtime API — users, per minute, pages, countries, cities, devices, events.
//   One minute.
// A detail drawer reads one row's days on demand. Nothing here is written to the synced partitions. Every request goes
// through the project's Google connection (`googleFetch`), so proxy profiles and simulated data apply as for the sync.
import { systemMessageText } from '../../shared/i18n/messages.js';
import { businessNow } from './business-clock.js';
import { GOOGLE_ENDPOINTS, googleJson, jsonRequest } from './google-client.js';
import { aiProviders, calendarDateInTimeZone } from './google-sync.js';

const DATA=GOOGLE_ENDPOINTS.analyticsData,MIN=60000,HOUR=3600000;
const fail=(message,status)=>{throw Object.assign(new Error(message),{status});};
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
 constructor(plugin){this.p=plugin;this.tokens=new Map();this.zones=new Map();this.todayCache=new Map();this.liveCache=new Map();this.rowCache=new Map();}
 // The project's Google connection (proxy profile or simulated upstream), the same one the sync uses.
 json(id,url,init){return googleJson(url,init,this.p.googleFetch?.(id));}
 // Access tokens last an hour; keep one for 45 minutes so the per-minute realtime view does not refresh it every time.
 async token(id){const hit=this.tokens.get(id);if(hit&&Date.now()-hit.at<45*MIN)return hit.token;
  let token;try{token=await this.p.token(id);}catch(e){this.explain(e);}this.tokens.set(id,{at:Date.now(),token});return token;}
 // Google's errors become a reason people can act on; NocoReach's own (such as 请先授权 Google 账号) pass through.
 explain(e){if(e?.code==='invalid_grant')fail(systemMessageText('google.authorizationExpired'),409);
  if(e?.code==='invalid_client')fail(systemMessageText('google.googleRejectedClientAskAdmin'),409);
  if(e?.code==='google_api_error'&&(e?.status===401||e?.status===403))fail(systemMessageText('dataViews.ga4PropertyAccessDenied'),409);
  if(!e?.code&&e?.status&&e.status<500)throw e;
  this.p.app?.logger?.warn('NocoReach GA4 report failed',{message:e?.message,code:e?.code});fail(systemMessageText('dataViews.ga4ReadFailed'),502);}
 async post(id,property,method,body){const token=await this.token(id);
  try{return await this.json(id,`${DATA}/properties/${property}:${method}`,{...jsonRequest(token,body),signal:AbortSignal.timeout(30000)});}
  catch(e){if(e?.code==='invalid_grant'||e?.status===401)this.tokens.delete(id);throw e;}}
 // Up to five reports per call. A report GA4 refuses (an incompatible combination) is left out on its own, logged,
 // instead of failing the page.
 async batch(id,property,requests){const parts=[];for(let i=0;i<requests.length;i+=5)parts.push(requests.slice(i,i+5));
  const refused=e=>e?.status===400&&e?.code==='google_api_error';
  const one=async r=>{try{return await this.post(id,property,'runReport',r);}catch(x){if(!refused(x))this.explain(x);this.p.app?.logger?.warn('NocoReach GA4 report left out',{message:x?.message,dimensions:r.dimensions?.map(d=>d.name)});return null;}};
  const done=await Promise.all(parts.map(async part=>{try{const reports=(await this.post(id,property,'batchRunReports',{requests:part})).reports||[];return part.map((_,i)=>reports[i]||null);}
   catch(e){if(!refused(e))this.explain(e);const out=[];for(const r of part)out.push(await one(r));return out;}}));
  return done.flat();}
 async timeZone(id,property){const hit=this.zones.get(property);if(hit&&Date.now()-hit.at<24*HOUR)return hit.zone;let zone='UTC';
  try{zone=(await this.json(id,`${GOOGLE_ENDPOINTS.analyticsAdmin}/properties/${property}`,{...jsonRequest(await this.token(id)),signal:AbortSignal.timeout(20000)})).timeZone||'UTC';}catch{zone=hit?.zone||'UTC';}
  this.zones.set(property,{at:Date.now(),zone});return zone;}

 // The window `w` ends at the synced cutoff; the daily line goes on to yesterday, the days after the cutoff marked 初步.
 async period(id,property,w){const both=[range(w.start,w.end,'current'),range(w.previousStart,w.previousEnd,'previous')],current=[range(w.start,w.end)];
  const names=Object.keys(TABLES);
  const reports=await this.batch(id,property,[
   request([],SESSION,both),
   request(['date'],SESSION,[range(w.start,'yesterday','current'),range(w.previousStart,w.previousEnd,'previous')],null,1000),
   ...names.map(n=>{const t=TABLES[n];return request(t.dims,t.metrics||SESSION,current,t.order||'sessions',t.limit);}),
  ]);
  const [totalsReport,dailyReport,...tables]=reports;if(!totalsReport)fail(systemMessageText('dataViews.ga4ReadFailed'),502);
  const totals=Object.fromEntries(rowsOf(totalsReport).map(r=>[r.dateRange,values(r)]));
  const daily=rowsOf(dailyReport).map(r=>({period:r.dateRange,date:`${r.date.slice(0,4)}-${r.date.slice(4,6)}-${r.date.slice(6,8)}`,...values(r)}));
  const out={totals:{current:totals.current||null,previous:totals.previous||null},daily:daily.filter(r=>r.period==='current').map(({period,...r})=>r).sort((a,b)=>a.date.localeCompare(b.date)),
   previousDaily:daily.filter(r=>r.period==='previous').map(({period,...r})=>r).sort((a,b)=>a.date.localeCompare(b.date)),tables:{},missing:[]};
  names.forEach((n,i)=>{if(tables[i])out.tables[n]=tableRows(n,tables[i]);else out.missing.push(n);});
  // AI 助手: sources whose name says so (ChatGPT, Perplexity…); GA4 counts them under Referral and other channels.
  const ai=(out.tables.sourceMedium||[]).filter(r=>r.ai);out.ai={sessions:ai.reduce((n,r)=>n+(r.sessions||0),0),sources:ai.length};
  return out;}

 // One row of a table over the window: its days against the period before, and its totals for both (deduplicated users).
 async row(id,property,w,v){const t=TABLES[v.table];if(!t)fail(systemMessageText('dataViews.unknownGa4Report'),400);const keys=ROW_KEYS[v.table]||t.dims,dims=v.dims||{};
  const pairs=keys.map(k=>{const x=dims[k];if(typeof x!=='string'||x.length>2000)fail(systemMessageText('dataViews.ga4RowMissing'),400);return [k,x];});
  const key=JSON.stringify([id,property,w.start,w.end,v.table,pairs]),hit=this.rowCache.get(key);if(hit&&Date.now()-hit.at<6*HOUR)return hit.value;
  const metrics=t.metrics||SESSION,both=[range(w.start,w.end,'current'),range(w.previousStart,w.previousEnd,'previous')],filter=exact(pairs);
  const [daysReport,totalsReport]=await this.batch(id,property,[request(['date'],metrics,both,null,1000,filter),request([],metrics,both,null,null,filter)]);
  const day=d=>`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`,days=rowsOf(daysReport),totals=Object.fromEntries(rowsOf(totalsReport).map(r=>[r.dateRange,values(r)]));
  const value={daily:days.filter(r=>r.dateRange==='current').map(r=>({date:day(r.date),...values(r)})).sort((a,b)=>a.date.localeCompare(b.date)),
   previousDaily:days.filter(r=>r.dateRange==='previous').map(r=>({date:day(r.date),...values(r)})).sort((a,b)=>a.date.localeCompare(b.date)),
   totals:{current:totals.current||null,previous:totals.previous||null}};
  this.rowCache.set(key,{at:Date.now(),value});if(this.rowCache.size>200)this.rowCache.delete(this.rowCache.keys().next().value);return value;}

 // 今天: today so far against yesterday and the same weekday last week, up to the same hour in the property's time
 // zone. The comparison stops at the hour GA4 has reached (`through`), never at a clock hour with no data yet.
 async today(id,property){const key=`${id}:${property}`,hit=this.todayCache.get(key);if(hit&&Date.now()-hit.at<10*MIN)return hit.value;
  const zone=await this.timeZone(id,property),now=new Date(businessNow(this.p,id,'google')),date=calendarDateInTimeZone(zone,now);
  const clock=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const hourNow=Number(clock.hour),days=[range('today','today','today'),range('yesterday','yesterday','yesterday'),range('7daysAgo','7daysAgo','lastWeek')];
  const [hourly,sources]=await this.batch(id,property,[
   request(['hour'],['screenPageViews','sessions','keyEvents'],days,null,100),
   request(['sessionSource','sessionMedium'],['sessions','activeUsers'],[range('today','today')],'sessions',10),
  ]);
  const hours=Array.from({length:24},(_,h)=>({hour:h,today:null,yesterday:0,lastWeek:0}));let last=-1;
  for(const r of rowsOf(hourly)){const h=parseInt(r.hour,10);if(!(h>=0&&h<24))continue;const slot=hours[h];
   if(r.dateRange==='today'){slot.today=r.screenPageViews;if(r.screenPageViews||r.sessions)last=Math.max(last,h);}else slot[r.dateRange]=r.screenPageViews;}
  for(const s of hours)if(s.today===null&&s.hour<=last)s.today=0;
  const through=Math.min(hourNow,last+1),sum=(name,upTo)=>hours.filter(s=>s.hour<upTo).reduce((n,s)=>n+(s[name]||0),0);
  // Users up to that hour, deduplicated by GA4 (adding up hours would count a returning visitor again).
  let totals={today:null,yesterday:null,lastWeek:null};
  if(through>0){const hoursIn=[...new Set(Array.from({length:through},(_,h)=>[String(h),String(h).padStart(2,'0')]).flat())];
   const [upTo]=await this.batch(id,property,[request([],['activeUsers','screenPageViews','sessions','keyEvents'],days,null,null,{filter:{fieldName:'hour',inListFilter:{values:hoursIn}}})]);
   for(const r of rowsOf(upTo))totals[r.dateRange]={users:r.activeUsers,views:r.screenPageViews,sessions:r.sessions,keyEvents:r.keyEvents};}
  const lastWeekDate=new Date(Date.parse(date+'T00:00:00Z')-7*86400000).toISOString().slice(0,10);
  const value={timeZone:zone,date,lastWeekDate,time:`${clock.hour}:${clock.minute}`,through,hours,totals,
   fullDay:{yesterday:sum('yesterday',24),lastWeek:sum('lastWeek',24)},
   sources:rowsOf(sources).map(r=>({source:r.sessionSource||'(direct)',medium:r.sessionMedium||'',sessions:r.sessions,users:r.activeUsers,ai:aiOf(`${r.sessionSource} ${r.sessionMedium}`)})),fetchedAt:now.toISOString()};
  this.todayCache.set(key,{at:Date.now(),value});return value;}

 // 实时: GA4's last 30 minutes. The Realtime API has no source dimension, so where these visitors came from is not here.
 async realtime(id,property){const key=`${id}:${property}`,hit=this.liveCache.get(key);if(hit&&Date.now()-hit.at<50000)return hit.value;
  const ask=(dims,metrics,order,limit)=>this.post(id,property,'runRealtimeReport',{dimensions:dims.map(name=>({name})),metrics:metrics.map(name=>({name})),...(order?{orderBys:[{metric:{metricName:order},desc:true}]}:{}),...(limit?{limit:String(limit)}:{})});
  let reports;try{reports=await Promise.all([ask([],['activeUsers','screenPageViews','eventCount','keyEvents']),ask(['minutesAgo'],['activeUsers'],null,30),ask(['unifiedScreenName'],['activeUsers','screenPageViews'],'activeUsers',20),
   ask(['countryId','country'],['activeUsers'],'activeUsers',20),ask(['city','countryId'],['activeUsers'],'activeUsers',20),ask(['deviceCategory'],['activeUsers'],'activeUsers',10),ask(['eventName'],['eventCount','activeUsers'],'eventCount',20)]);}
  catch(e){this.explain(e);}
  const [totals,minutes,pages,countries,cities,devices,events]=reports.map(rowsOf),t=totals[0]||{};
  const perMinute=Array(30).fill(0);for(const r of minutes){const m=parseInt(r.minutesAgo,10);if(m>=0&&m<30)perMinute[29-m]=r.activeUsers;}
  const value={fetchedAt:new Date(businessNow(this.p,id,'google')).toISOString(),users:t.activeUsers||0,views:t.screenPageViews||0,eventCount:t.eventCount||0,keyEvents:t.keyEvents||0,perMinute,
   pages:pages.map(r=>({title:r.unifiedScreenName,users:r.activeUsers,views:r.screenPageViews})),
   countries:countries.map(r=>({id:r.countryId,name:r.country,users:r.activeUsers})),cities:cities.map(r=>({name:r.city,countryId:r.countryId,users:r.activeUsers})),
   devices:devices.map(r=>({name:r.deviceCategory,users:r.activeUsers})),events:events.map(r=>({name:r.eventName,count:r.eventCount,users:r.activeUsers}))};
  this.liveCache.set(key,{at:Date.now(),value});return value;}
}
export { WebsiteReport, TABLES, tableRows, rowsOf, values };
