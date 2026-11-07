// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import { searchConsoleRows, type GscQuery, type GscRow } from './gsc-response.js';
import type { LegacyDatabase, LegacyRecord } from './legacy/database.js';
import type { Connections } from './plugin.js';
import type { SyncService } from './sync-service.js';
import { historyBounds, historyCoverage, validOverview } from './search-history.js';
import { businessNow } from './business-clock.js';
import * as sp from './search-performance.js';
import * as pkgs from './packages-source.js';
import * as hnSource from './hackernews-source.js';
import * as __google_client from './google-client.js';
import { WebsiteReport } from './website-report.js';
import { GoogleReportCache, waitForFresh } from './google-report-cache.js';
import { GOOGLE_HISTORY_CACHE_MS, GOOGLE_PARTIAL_CACHE_MS, GOOGLE_SAVED_REPORT_MS, reportView } from '../../shared/google-cache.js';
import { githubView } from './github-view.js';
import { downloadsView } from './downloads-view.js';
import { canonicalUrl, pageIdentity, pageKey } from '../../shared/page-identity.js';
// Data views (SPEC §5 数据分析): one time range across all connected sources; each source keeps its own cutoff.
const DAY=86400000;
const iso=t=>new Date(t).toISOString().slice(0,10);
const add=(d,n)=>iso(Date.parse(d+'T00:00:00Z')+n*DAY);
const days=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/DAY)+1;
const dayOf=v=>v instanceof Date?v.toISOString().slice(0,10):String(v||'').slice(0,10);
// The page drawer's matching: a GA4 row is the page whose path its address has under the page identity, whatever its
// host; rows synced before hosts were kept have none and match by their own path.
const normPath=p=>String(p||'').split('?')[0].replace(/\/+$/,'')||'/';
const rowPath=(x,identity)=>{if(!x.host)return normPath(x.page);try{return normPath(new URL(canonicalUrl(`https://${x.host}${String(x.page||'')}`,identity)).pathname);}catch{return normPath(x.page);}};
// The held days of every page (DataViews.pageDays) grouped by the page they are under the page identity: Search Console
// days by page key, GA4 days by path. Grouped once per identity and kept with the days, so each drawer opened is a
// lookup; matching every address on each read took 150 to 900 ms at 23,895 addresses (2026-11-07).
function pagesBy(held,identity){const at=JSON.stringify(identity);if(held.groups?.at===at)return held.groups;
 const search=new Map(),web=new Map(),put=(m,k,e)=>{const list=m.get(k);if(list)list.push(e);else m.set(k,[e]);};
 for(const e of held.search.values()){const k=pageKey(`https://${e.at}`,identity);if(k)put(search,k,e);}
 for(const e of held.web.values())put(web,rowPath(e,identity),e);
 return held.groups={at,search,web};}
// What makes a new day's window the same view as yesterday's. Breakdowns and rows receive dates alone, so the page names
// its view (`reportView`: the range, or a custom range's dates): without it a custom week would answer for the rolling one
// and evict it. The window's length and whether it is all of history guard a view sent with the wrong dates. A request
// naming no view, such as the online agent's, has no family and never gets another window's copy.
const viewFamily=(kind,parts,v,w)=>typeof v.view==='string'&&v.view?[kind,...parts,v.view.slice(0,200),days(w.start,w.end),w.all===true]:undefined;
// The longest stretch of synced query × page days read for a report: both 90-day periods. Longer ones ask Search Console.
const MAX_STORED_PAIR_DAYS=200;
// GA4 goes on processing a day for about two days after it ends; a report over later days is not kept as settled, and
// Traffic marks those days as still changing. The page notes and the chart tip say "two days" in every locale
// (dataWebsite.latestDaysPreliminary).
const GA4_PROCESSING_DAYS=2;
// The most query × page rows a report holds per period, read from Search Console or summed from the synced days: a long
// tail that differs by day would otherwise grow the sums well past a gigabyte.
const MAX_PAIR_ROWS=100000;
// Search Console query × page days read per query by `pairRows`, and the projects whose summed rows stay in memory.
const PAIR_READ_DAYS=4,PAIR_HOLD_PROJECTS=6,MAX_HELD_PAIRS=300000,FIGURE_READ_DAYS=8;
// The page drawer's days of every page, held for a few windows: at most PAGE_DAY_HOLDS of them and MAX_HELD_PAGE_DAYS
// page-days in all.
const PAGE_DAY_HOLDS=4,MAX_HELD_PAGE_DAYS=1000000;
// How far a report's window may run ahead of the synced days and still have its tables built from them: the daily sync
// runs every 24 hours from when it last ran, so it lands up to a day after the final cutoff moves.
const PENDING_SYNC_DAYS=2;
// The daily sync reads the cutoff and the six days before it again, as Google can publish them late.
const SYNC_REREAD_DAYS=6;
// A project nobody opened for this long is not read ahead of time; its saved reports still answer when someone returns.
const WARM_READ_WINDOW_MS=3*DAY;
// Ranges other than the default a page's person chose (`noteView`), read ahead by the tick while chosen within this, a
// day inside the age a saved copy may be shown, at most VIEWS_READ_AHEAD a page and project: each Traffic range costs up to
// 16 GA4 reports a day and each Search performance range up to three Search Console queries and six for its breakdown.
// Each page's own ranges, as its action reads them (Traffic: WEB_RANGES; Search performance: RANGES and all time; Pages: its
// list's), without the default the tick reads anyway. Pages' default and Keywords' site ranks are kept too, as nothing
// else reads them ahead.
const VIEW_RANGES={website:['7','90','3m','12m','all'],search:['7','90','3m','6m','12m','16m','all'],pages:['7','28','90','3m','6m','12m','16m','all'],ranks:['28']};
const VIEW_KINDS=Object.keys(VIEW_RANGES),VIEW_KEY=new RegExp(`^(${VIEW_KINDS.map(k=>`${k}:(${VIEW_RANGES[k].join('|')})`).join('|')})$`);
const VIEW_READ_WINDOW_MS=6*DAY,VIEWS_READ_AHEAD=2;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
// Same page identity as task effects: host without www, path without a trailing slash.
const RANGES=['7','28','90','3m','6m','12m','16m'],WEB_RANGES=['7','28','90','3m','12m','all','custom'];
const calendarDate=(d:unknown):d is string=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&iso(Date.parse(d+'T00:00:00Z'))===d;
const googleDisconnected=(e:unknown)=>Boolean(e&&typeof e==='object'&&'code' in e&&e.code==='NOCOREACH_GOOGLE_NOT_CONNECTED');
// Partitions store ISO calendar dates as strings. The current Repository supports string $in,
// not numeric/date comparison operators; include at most the selected and previous 490-day windows.
// Page figures are kept packed: each page a row of numbers after an index into one list of hosts. As objects a site
// with some 6,000 addresses outside its sitemap passed the cache's 2 MB an entry over 28 days, so Pages read every
// synced day again on each visit (2.3 s on 2026-11-06).
type FigureRow={host:string;path:string;current:Record<string,number>;previous:Record<string,number>};
type PageFigures={window:unknown;days:unknown;search:FigureRow[];web:FigureRow[]};
type PackedFigures={window:unknown;days:unknown;hosts:string[];search:(string|number)[][];web:(string|number)[][]};
const SEARCH_FIELDS=['clicks','impressions'],WEB_FIELDS=['views'];
function packFigures(f:PageFigures|null):PackedFigures|null{if(!f)return null;const hosts:string[]=[],at=new Map<string,number>();
 const host=(h:string)=>{let i=at.get(h);if(i===undefined){i=hosts.length;hosts.push(h);at.set(h,i);}return i;};
 const pack=(rows:FigureRow[],fields:string[])=>rows.map(r=>[host(r.host),r.path,...fields.map(n=>r.current[n]||0),...fields.map(n=>r.previous[n]||0)]);
 return {window:f.window,days:f.days,hosts,search:pack(f.search,SEARCH_FIELDS),web:pack(f.web,WEB_FIELDS)};}
function unpackFigures(f:PackedFigures|null):PageFigures|null{if(!f)return null;
 const unpack=(rows:(string|number)[][],fields:string[])=>rows.map(([h,path,...n])=>({host:f.hosts[Number(h)],path:String(path),current:Object.fromEntries(fields.map((k,i)=>[k,Number(n[i])])),previous:Object.fromEntries(fields.map((k,i)=>[k,Number(n[fields.length+i])]))}));
 return {window:f.window,days:f.days,search:unpack(f.search,SEARCH_FIELDS),web:unpack(f.web,WEB_FIELDS)};}
// Stored days read `size` at a time, each row handed to `each` as it is read, giving way to other requests between reads:
// a large site's days are megabytes each, and summing them as they come keeps only the sums.
async function eachPartitionDays(repo,filter,dates,size,fields,each){for(let i=0;i<dates.length;i+=size){if(i)await new Promise(r=>setImmediate(r));
 for(const r of await repo.find({filter:{...filter,date:{$in:dates.slice(i,i+size)}},fields}))each(r);}}
function partitionDates(start:unknown,end:unknown,all=false){if(!calendarDate(start)||!calendarDate(end))fail(systemMessageText('dataViews.pickValidStartEndDates'));if(days(start,end)>(all?36600:980))fail(systemMessageText('dataViews.customRangesUp16Months'));const dates:string[]=[];for(let d=start;d<=end;d=add(d,1))dates.push(d);return {$in:dates};}
// Same window rules as the Portal period helper: N days ending at the cutoff, or calendar months back from it.
function windowFor(end,range,from,to,first){if(range==='all'){const start=calendarDate(first)&&first<=end?first:end;return {start,end,days:days(start,end),previousStart:add(start,-1),previousEnd:add(start,-1),all:true};}if(range==='custom'){if(!calendarDate(from)||!calendarDate(to)||from>to)fail(systemMessageText('dataViews.pickValidStartEndDates'));const n=days(from,to);if(from>end)fail(systemMessageText('dataViews.pickValidStartEndDates'));if(n>490)fail(systemMessageText('dataViews.customRangesUp16Months'));const e=to<end?to:end;const count=days(from,e);return {start:from,end:e,days:count,previousStart:add(from,-count),previousEnd:add(from,-1)};}
 if(!RANGES.includes(String(range)))fail(systemMessageText('dataViews.unsupportedDateRange'));let start;if(range.endsWith('m')){const s=new Date(Date.parse(end+'T00:00:00Z')+DAY);const d=s.getUTCDate();s.setUTCDate(1);s.setUTCMonth(s.getUTCMonth()-parseInt(range));s.setUTCDate(Math.min(d,new Date(Date.UTC(s.getUTCFullYear(),s.getUTCMonth()+1,0)).getUTCDate()));start=iso(s);}else start=add(end,1-Number(range));const n=days(start,end);return {start,end,days:n,previousStart:add(start,-n),previousEnd:add(start,-1)};}
// Sums need every day of the window present; otherwise the value is shown with its coverage, never as a comparison.
function metric(rows,field,w){const inWin=(a,b)=>rows.filter(r=>r.date>=a&&r.date<=b&&Number.isFinite(r[field]));const cur=inWin(w.start,w.end),prev=inWin(w.previousStart,w.previousEnd);const sum=l=>l.reduce((s,r)=>s+r[field],0);const complete=cur.length===days(w.start,w.end),prevComplete=!w.all&&prev.length===days(w.previousStart,w.previousEnd);const value=cur.length?sum(cur):null,previous=prevComplete?sum(prev):null;return {value,previous,complete,change:complete&&previous?(value-previous)/previous:null};}
function series(rows,field,w){const by=new Map(rows.map(r=>[r.date,r[field]]));const out=[];for(let d=w.start;d<=w.end;d=add(d,1))out.push({date:d,value:by.has(d)&&Number.isFinite(by.get(d))?by.get(d):null});return out;}
// Traffic reads GA4 live, so its window ends yesterday instead of waiting for the synced cutoff.
const trafficEnd=(synced,yesterday)=>calendarDate(yesterday)&&yesterday>synced?yesterday:synced;
// Traffic (GA4): the window ends yesterday in the property's time zone; the numbers come live from GA4
// (website-report.ts, `period`, or `periodTables` for the tables the page reads once shown), and each page row carries the
// Search Console queries that landed on it in the range.
// Those queries are synced, finalized data for the same range ending at the synced cutoff; `queriesWindow` names it.
// The days after `settledThrough` are still being processed by GA4; a saved report answered meanwhile brings the one of
// the day it was read. `yesterdayOf` is asked only once there is data, since it may wait on the GA4 Admin API. The page
// explains the numbers itself; `missing` names the reports GA4 did not return.
async function websiteView(snaps,range,period,from,to,yesterdayOf){const get=k=>snaps.find(s=>s.key===k)?.payload,web=get('history-web')||[],synced=get('project')?.end||web.map(r=>r.date).sort().at(-1);if(!synced||!web.length)return {connected:true,cutoff:null};
 const yesterday=await yesterdayOf?.(),end=trafficEnd(synced,yesterday),settled=calendarDate(yesterday)?add(yesterday,-GA4_PROCESSING_DAYS):end;
 const w=windowFor(end,range,from,to,firstDate(web)),report=await period(w,end,settled);
 const pathOf=u=>{try{return new URL(u).pathname.replace(/\/+$/,'')||'/';}catch{return String(u||'').split('?')[0].replace(/\/+$/,'')||'/';}};
 const searched=get(`queries-${range}`)||[],queries=new Map();for(const q of searched){const k=pathOf(q.page);if(!queries.has(k))queries.set(k,[]);queries.get(k).push({keyword:q.keyword,clicks:q.clicks,impressions:q.impressions,position:q.position});}
 if(report.tables.page)report.tables.page=report.tables.page.map(p=>({...p,queries:(queries.get(pathOf(p.key))||[]).sort((a,b)=>b.impressions-a.impressions).slice(0,8)}));
 return {connected:true,cutoff:end,settledThrough:settled,queriesWindow:searched.length?{start:windowFor(synced,range).start,end:synced}:null,from:firstDate(web),window:w,...report};}
function firstDate(rows){return rows.map(r=>r.date).sort()[0]||null;}
// Search Console filters for a country and the query and page filters. Search performance reads web search only
// (2026-10-22: the other search types were dropped from the page; the sync reads web search only too).
function liveGroups(country,filters){const list=[...(country?[{dimension:'country',operator:'equals',expression:country}]:[]),...[['query',filters.queryFilter],['page',filters.pageFilter]].filter(([,f])=>f).map(([dimension,f])=>({dimension,operator:f.operator,expression:f.expression}))];return list.length?[{filters:list}]:[];}
// The window a page asks about (the report's own), checked like a custom range.
function liveWindow(v){const w={all:v.all===true,start:String(v.start||''),end:String(v.end||''),previousStart:String(v.previousStart||''),previousEnd:String(v.previousEnd||'')};
 if(![w.start,w.end,w.previousStart,w.previousEnd].every(calendarDate)||w.start>w.end||w.previousStart>w.previousEnd||days(w.start,w.end)>(w.all?36600:490)||days(w.previousStart,w.previousEnd)>490)fail(systemMessageText('dataViews.invalidDate'));return w;}
// One point a day of the window with the same day of the period before: clicks, impressions, CTR and position.
function trendOf(w,at){const out=[];for(let d=w.start,i=0;d<=w.end;d=add(d,1),i++){const pd=add(w.previousStart,i),now=at(d),before=w.all?null:at(pd),f=(r,k)=>(r?k==='ctr'?(r.impressions?r.clicks/r.impressions:0):k==='position'?(r.impressions?Number(r.position)||0:null):r[k]:null);
  out.push({date:d,clicks:f(now,'clicks'),impressions:f(now,'impressions'),ctr:f(now,'ctr'),position:f(now,'position'),previousDate:pd,previousClicks:f(before,'clicks'),previousImpressions:f(before,'impressions'),previousCtr:f(before,'ctr'),previousPosition:f(before,'position')});}
 return out;}
// Stars are cumulative samples: net change between the last sample on or before each end; missing ends give null.
function sampleAt(daily,date){const d=Object.keys(daily||{}).filter(x=>x<=date).sort().at(-1);return d?{date:d,...daily[d]}:null;}
// Backfilled days have no fork count; a difference is only taken between two real numbers.
const diff=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?a-b:null;
function starRows(daily){const dates=Object.keys(daily||{}).sort();return dates.slice(1).map((d,i)=>({date:d,stars:diff(daily[d].stars,daily[dates[i]].stars),forks:diff(daily[d].forks,daily[dates[i]].forks)}));}
function netChange(daily,field,a,b){const end=sampleAt(daily,b),base=sampleAt(daily,add(a,-1));if(!end||!base||base.date!==add(a,-1))return null;return diff(end[field],base[field]);}
// CTR and position are ratios of the window sums (position weighted by impressions); compared only when both windows are complete.
function ratios(rows,w){const sum=(a,b)=>{const l=rows.filter(r=>r.date>=a&&r.date<=b&&Number.isFinite(r.impressions));return {n:l.length,...sp.totals(l)};};const c=sum(w.start,w.end),p=sum(w.previousStart,w.previousEnd),complete=c.n===days(w.start,w.end),prevComplete=p.n===days(w.previousStart,w.previousEnd);
 const m=(key,label,f,extra)=>{const value=c.impressions?f(c):null,previous=prevComplete&&p.impressions?f(p):null;return {key,label,value,previous,complete,change:complete&&value!==null&&previous?(value-previous)/previous:null,...extra};};
 return [m('ctr',systemMessageText('common.ctr'),x=>x.ctr,{format:'percent'}),m('position',systemMessageText('common.averagePosition'),x=>x.position,{format:'decimal',lowerIsBetter:true})];}
// 初步数据 after a Google card's cutoff: the days and their sums, shown under the card and never added to its numbers.
function withFresh(card,rows,keys){if(!rows.length)return card;return {...card,preliminary:{from:rows[0].date,through:rows.at(-1).date,days:rows.length,totals:Object.fromEntries(keys.map(k=>[k,rows.reduce((n,r)=>n+(Number(r[k])||0),0)]))}};}
function gscCard(rows,end,w){if(!rows.length)return null;const clicks=metric(rows,'clicks',w),imp=metric(rows,'impressions',w);return {id:'gsc',cutoff:end,from:firstDate(rows),window:w,metrics:[{key:'clicks',label:systemMessageText('common.clicks'),...clicks},{key:'impressions',label:systemMessageText('common.impressions'),...imp},...ratios(rows,w)],series:series(rows,'clicks',w),seriesBy:{clicks:series(rows,'clicks',w),impressions:series(rows,'impressions',w)}};}
function ga4Card(rows,end,w){if(!rows.length)return null;return {id:'ga4',cutoff:end,from:firstDate(rows),window:w,metrics:[{key:'sessions',label:systemMessageText('dataWebsite.traffic'),...metric(rows,'sessions',w)},{key:'views',label:systemMessageText('common.views'),...metric(rows,'views',w)},{key:'conversions',label:systemMessageText('common.keyEvents'),...metric(rows,'conversions',w)}],series:series(rows,'sessions',w),seriesBy:{sessions:series(rows,'sessions',w),views:series(rows,'views',w),conversions:series(rows,'conversions',w)}};}
function githubCard(gh,w){if(!gh?.repo||gh.status==='disconnected')return null;const dates=Object.keys(gh.daily||{}).sort();const net=netChange(gh.daily,'stars',w.start,w.end),prevNet=netChange(gh.daily,'stars',w.previousStart,w.previousEnd);const views=Object.entries(gh.traffic?.views||{}).map(([date,v])=>({date,views:v.count,uniques:v.uniques}));const v=views.length?metric(views,'views',w):null;
 const notes=[];if(!dates.length||dates[0]>add(w.start,-1))notes.push(systemMessageText('messages.starRecordsStart', { 0: dates[0]||'今天', 1: gh.starHistory?.complete?'':'；接入 token 后可补全历史' }));if(!gh.token)notes.push(systemMessageText('dataViews.trafficConnection'));else if(gh.traffic?.since&&gh.traffic.since>w.start)notes.push(systemMessageText('messages.repositoryViewsArchivedSince', { 0: gh.traffic.since }));
 return {id:'github',cutoff:dates.at(-1)||null,from:dates[0]||null,window:w,title:gh.repo,metrics:[{key:'stars',label:systemMessageText('common.newStars'),value:net,previous:prevNet,complete:net!==null,change:net!==null&&prevNet?(net-prevNet)/prevNet:null},{key:'total',label:systemMessageText('glossary.totalStars'),value:sampleAt(gh.daily,w.end)?.stars??null,previous:null,complete:true,change:null},...(v?[{key:'views',label:systemMessageText('analysisRules.repositoryViews'),...v}]:[])],series:series(starRows(gh.daily),'stars',w),notes};}
function communityCard(cm,w,now=Date.now()){if(!cm?.origin||cm.status==='disconnected')return null;const by=new Map();for(const t of Object.values(cm.topics||{})){const d=String(t.createdAt).slice(0,10);const o=by.get(d)||{date:d,topics:0,replies:0,unanswered:0};o.topics++;o.replies+=t.replies||0;if(!t.replies)o.unanswered++;by.set(d,o);}
 const retainedFrom=cm.retainedFrom||add(iso(now),-90);const rows=[];for(let d=retainedFrom;d<=add(iso(now),-1);d=add(d,1))rows.push(by.get(d)||{date:d,topics:0,replies:0,unanswered:0});
 const notes=retainedFrom>w.start?[systemMessageText('messages.communityDataStarts', { 0: retainedFrom })]:[];return {id:'discourse',cutoff:add(iso(now),-1),from:retainedFrom,window:w,title:cm.title,metrics:[{key:'topics',label:systemMessageText('dataCommunity.newTopics'),...metric(rows,'topics',w)},{key:'replies',label:systemMessageText('analysisRules.replies'),...metric(rows,'replies',w)},{key:'unanswered',label:systemMessageText('dataCommunity.unanswered'),...metric(rows,'unanswered',w),change:null}],series:series(rows,'topics',w),notes};}
function contentCard(site,w,now){if(!site?.pages?.length)return null;const lm=p=>p.lastmod?String(p.lastmod).slice(0,10):null;const updated=site.pages.filter(p=>lm(p)&&lm(p)>=w.start&&lm(p)<=w.end).length,stale=site.pages.filter(p=>lm(p)&&Date.parse(lm(p))<now-365*DAY).length,unknown=site.pages.filter(p=>!lm(p)).length;
 return {id:'site',cutoff:null,from:null,window:w,title:systemMessageText('messages.urls', { 0: site.sites?.length||1 }),metrics:[{key:'pages',label:systemMessageText('dataViews.totalPages'),value:site.pages.length,previous:null,complete:true,change:null},{key:'updated',label:systemMessageText('dataViews.updatedPeriod'),value:updated,previous:null,complete:true,change:null},{key:'stale',label:systemMessageText('dataViews.notUpdatedOverYear'),value:stale,previous:null,complete:true,change:null}],series:[],notes:unknown?[systemMessageText('messages.pagesNotProvideUpdateTime', { 0: unknown })]:[]};}
// 下载量: npm + PyPI downloads per day (complete days only) and the Docker Hub pulls gained between daily samples.
function packagesCard(state,w,now=Date.now()){if(!state?.packages?.length)return null;const rows=pkgs.downloadRows(state),samples=pkgs.pullSamples(state),metrics=[],notes=[];
 if(rows.length)metrics.push({key:'downloads',label:systemMessageText('common.downloads'),...metric(rows,'downloads',w)});else if(state.packages.some(p=>p.registry!=='docker'))notes.push(systemMessageText('dataViews.downloadsStillFirstSync'));
 if(state.packages.some(p=>p.registry==='docker')){const net=netChange(samples,'pulls',w.start,w.end),prev=netChange(samples,'pulls',w.previousStart,w.previousEnd);metrics.push({key:'pulls',label:systemMessageText('glossary.dockerPulls'),value:net,previous:prev,complete:net!==null,change:net!==null&&prev?(net-prev)/prev:null});const first=Object.keys(samples).sort()[0];if(!first||first>add(w.start,-1))notes.push(systemMessageText('messages.dockerPullsRecordedDailyEarlier', { 0: first||'今天' }));}
 const pypi=state.packages.filter(p=>p.registry==='pypi');if(pypi.length&&w.previousStart<add(iso(now),-180))notes.push(systemMessageText('dataViews.pypiProvidesDownloadsLast180'));
 return {id:'packages',cutoff:rows.at(-1)?.date||null,from:rows[0]?.date||null,window:w,title:state.packages.map(p=>p.title||p.name).slice(0,3).join('、')+(state.packages.length>3?systemMessageText('common.moreSuffixValue', { 0: state.packages.length }):''),metrics,series:series(rows,'downloads',w),notes};}
// Hacker News 提及 (catalog id mentions): stories and comments per day from the day coverage starts; points are the stories' latest counts.
function hackernewsCard(state,w,now=Date.now()){if(!state?.terms?.length||state.status==='disconnected')return null;const rows=hnSource.dailyRows(state,iso(now-DAY)),notes=[];if(!state.retainedFrom)notes.push(systemMessageText('chatSource.readingFirstTime'));else if(state.retainedFrom>w.start)notes.push(systemMessageText('messages.mentionsRecordedSince', { 0: state.retainedFrom }));
 const top=Object.values(state.mentions||{}).filter(m=>m.type==='story'&&m.createdAt.slice(0,10)>=w.start&&m.createdAt.slice(0,10)<=w.end).sort((a,b)=>b.points-a.points)[0];if(top)notes.push(systemMessageText('messages.topPoints', { 0: top.title, 1: top.points }));
 return {id:'mentions',cutoff:rows.at(-1)?.date||null,from:state.retainedFrom||null,window:w,title:state.terms.join('、'),metrics:[{key:'mentions',label:systemMessageText('dataHackernews.mentions'),...metric(rows,'mentions',w)},{key:'stories',label:systemMessageText('common.posts'),...metric(rows,'stories',w)}],series:series(rows,'mentions',w),notes};}
// Reddit 讨论: threads first seen per day from the day finding started (found weekly through Google). Counted the same way
// as the Reddit page (2026-10-08, the card read 0 while the page listed posts): every thread first seen in the range,
// including those of the first search; the change shows only once the range is fully covered.
function redditCard(state,w,now=Date.now()){if(!state?.terms?.length||state.status==='disconnected'||!state.retainedFrom)return null;const by={};for(const p of Object.values(state.posts||{})){const d=(p.postedAt||p.firstSeenAt).slice(0,10);by[d]=(by[d]||0)+1;}
 // Already-known posts before collection started still count, but do not prove complete historic coverage.
 const cutoff=iso(now-DAY),rows=Object.entries(by).filter(([d])=>d<state.retainedFrom&&d<=cutoff).map(([date,posts])=>({date,posts}));for(let d=state.retainedFrom;d<=cutoff;d=add(d,1))rows.push({date:d,posts:by[d]||0});rows.sort((a,b)=>a.date.localeCompare(b.date));
 const m=metric(rows,'posts',w) as {complete: boolean; previous: number | null; value: number | null},retainedFrom=(state as {retainedFrom: string}).retainedFrom,window=w as {start: string; end: string; previousStart: string; previousEnd: string},complete=m.complete&&retainedFrom<=window.start&&Boolean(state.dataThrough&&state.dataThrough>=window.end),previous=retainedFrom<=window.previousStart&&state.dataThrough>=window.previousEnd?m.previous:null;
 return {id:'reddit',cutoff:rows.at(-1)?.date||null,from:(state as {retainedFrom: string}).retainedFrom,window:w,title:state.terms.join('、'),metrics:[{key:'posts',label:systemMessageText('strategy.newRedditPosts'),...m,complete,previous,change:complete&&previous?(m.value-previous)/previous:null}],series:series(rows,'posts',w),notes:[]};}
interface SearchRequest { range?: string; from?: string; to?: string; country?: string; key?: string; dimension?: string; details?: boolean; compare?: boolean; queryFilter?: unknown; pageFilter?: unknown; }
interface SearchWindow { start: string; end: string; previousStart: string; previousEnd: string; days: number; all?: boolean; }
interface SearchFilters { queryFilter?: {operator: string;expression: string} | null; pageFilter?: {operator: string;expression: string} | null; }
const GOOGLE_TOKEN_KEEP_MS=45*60*1000;
class DataViews{
 p: Connections & {db: LegacyDatabase;sync: SyncService};
 reports: GoogleReportCache;
 localReports: GoogleReportCache;
 constructor(plugin){this.p=plugin;this.ga4=new WebsiteReport(plugin);this.reports=new GoogleReportCache(plugin.db,'gsc-reports',plugin.app?.logger);this.localReports=new GoogleReportCache(plugin.db,'google-local-reports',plugin.app?.logger);this.tokenPending=new Map();this.tokens=new Map();this.readAt=new Map();this.viewReads=new Map();this.pairHold=new Map();this.pageDayHold=new Map();}
 scope(id,link: LegacyRecord): unknown[]{return [link.get('gscSiteUrl'),link.get('authorizedAt'),this.p.network?.mockCacheKey?.('google',String(id))];}
 // Search Console's final days do not change, but Google can publish them days after the cutoff, and nothing in a report
 // tells a late day from one without data (breakdowns have no dates, filtered tables often miss days). So a report stays
 // good for as long as it is kept only once its days are older than the sync reads again; until then it is read again
 // after a day. A rolling range has a new window by then, so this costs it no read; a fixed range reads at most once a
 // day when it is opened, answering from its copy meanwhile.
 lifetime(id,w){if(!w)return GOOGLE_HISTORY_CACHE_MS;const {cutoff}=historyBounds(this.p,id);return w.end<add(cutoff,-SYNC_REREAD_DAYS)?GOOGLE_SAVED_REPORT_MS:w.end<=cutoff?DAY:GOOGLE_HISTORY_CACHE_MS;}
 // `family` names the view whatever its dates, so a new window answers from the previous one while it is read; the report
 // then carries the `window` it holds.
 report(id,identity,read,w,family){return this.reports.load(String(id),identity,read,value=>value.connected===false||value.cutoff===null?0:value.partial?GOOGLE_PARTIAL_CACHE_MS:this.lifetime(id,w),(value,cacheExpiresAt,saved)=>({...value,cacheExpiresAt,...saved}),family?{family}:{});}
 // An access token lasts an hour; keep it for 45 minutes, as WebsiteReport does, so each Search Console report a cache
 // misses does not first refresh it with Google (2026-11-05). Kept per project, site, authorization and mock scope, so a
 // new authorization or another upstream reads a new one; never inside a transaction.
 token(id,scope){if(!scope||this.p.db?.transactionContext?.())return this.p.token(id);const key=JSON.stringify([String(id),...scope]),hit=this.tokens.get(key);if(hit&&Date.now()-hit.at<GOOGLE_TOKEN_KEEP_MS)return Promise.resolve(hit.token);let pending=this.tokenPending.get(key);if(!pending){pending=Promise.resolve().then(()=>this.p.token(id)).then(token=>{this.tokens.set(key,{at:Date.now(),token});return token;}).finally(()=>this.tokenPending.delete(key));this.tokenPending.set(key,pending);}return pending;}
 async fresh(id,source,cutoff){try{return await this.p.sync.fresh(id,source,cutoff);}catch{return [];}}
 async overview(id,v){const now=businessNow(this.p,id),yesterday=iso(now-DAY);let snaps=[];try{snaps=await this.p.sync.snapshots(id);}catch(e){if(!googleDisconnected(e))throw e;snaps=[];}const get=k=>snaps.find(s=>s.key===k)?.payload;const lastDate=rows=>(rows||[]).map(r=>r.date).sort().at(-1)||null;const range=String(v.range||'28');
  const gscEnd=lastDate(get('history-search')),ga4End=lastDate(get('history-web'));
  // `sameWindow` (Insights' metric cards, 2026-10-29 user request): every card covers one window, the latest `range`
  // days that every source has complete (Google's data lands two or three days late), against the same days before, so
  // the one dated line above the cards is true of all of them. Without it each source keeps its own cutoff.
  const common=v.sameWindow&&['7','28','90'].includes(range)?[gscEnd,ga4End,yesterday].filter(Boolean).sort()[0]:null;
  const w=end=>windowFor(common||end,range,v.from,v.to);const cards=[];
  // Each Google source uses its own cutoff (SPEC §5), the same one 搜索表现 shows.
  if(gscEnd){const g=gscCard(get('history-search'),gscEnd,w(gscEnd));if(g)cards.push(withFresh(g,await this.fresh(id,'gsc',gscEnd),['clicks','impressions']));}if(ga4End){const a=ga4Card(get('history-web'),ga4End,w(ga4End));if(a)cards.push(withFresh(a,await this.fresh(id,'ga4',ga4End),['sessions','views']));}
  const site=await this.p.siteContent?.state(id).catch(()=>null);const c=contentCard(site,w(yesterday),now);if(c)cards.push(c);
  const gh=await this.p.github?.state(id).catch(()=>null);const g=githubCard(gh,w(yesterday));if(g)cards.push(g);
  const cm=await this.p.community?.state(id).catch(()=>null);const d=communityCard(cm,w(yesterday),now);if(d)cards.push(d);
  const pk=await this.p.packages?.state(id).catch(()=>null);const pc=packagesCard(pk,w(yesterday),now);if(pc)cards.push(pc);
  const hn=await this.p.hackernews?.state(id).catch(()=>null);const hc=hackernewsCard(hn,w(yesterday),now);if(hc)cards.push(hc);
  const rd=await this.p.reddit?.state(id).catch(()=>null);const rc=redditCard(rd,w(yesterday),now);if(rc)cards.push(rc);
  return {range,from:v.from||null,to:v.to||null,...(common?{window:w(common)}:{}),generatedAt:new Date().toISOString(),cards};}
 // GitHub page: stars/forks per day, Traffic per day (uniques are daily only, never summed), releases in range,
 // the latest 14-day referrer and path snapshot, and the 90-day issue summary.
 // GitHub page: github-view.ts (2026-10-14) — history figures for any range back to the repository's first day, the
 // 14-day Traffic NocoReach saves, referring sites and popular content over their snapshots, composition and community.
 async github(id,v){const gh=await this.p.github?.state(id).catch(()=>null);if(!gh?.repo||gh.status==='disconnected')return {connected:false};
  const [act,project]=await Promise.all([Promise.resolve().then(()=>this.p.github.activity?.(id)).catch(()=>null),Promise.resolve().then(()=>this.p.project?.(id)).catch(()=>null)]);
  const own=(project?.domains||[]).map(d=>String(d).toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/^www\./,'')).concat(['github.com/'+gh.repo.split('/')[0]]);
  return githubView(gh,act,v,{windowFor,end:iso(businessNow(this.p,id,'github')-DAY),own,running:this.p.github.backfilling===String(id),token:Boolean(this.p.github.token?.(id))});}
 // Community page: topics by creation day in range; replies and views are counts as last read, not per day.
 // 下载量 page (downloads-view.ts): a figure per package and for the GitHub release files, releases, versions and platforms.
 async downloads(id,v){const st=await this.p.packages?.state(id).catch(()=>null);if(!st?.packages?.length)return {connected:false};
  const [gh,act]=await Promise.all([Promise.resolve().then(()=>this.p.github?.state(id)).catch(()=>null),Promise.resolve().then(()=>this.p.github?.activity?.(id)).catch(()=>null)]);
  return downloadsView(st,gh&&gh.status!=='disconnected'?gh:null,act,v,{windowFor,netChange,end:iso(businessNow(this.p,id,'packages')-DAY)});}
 // Hacker News tab of 讨论: mentions per day, the stories that drew most points and the latest comments in range.
 async hackernews(id,v){const st=await this.p.hackernews?.state(id).catch(()=>null);if(!st?.terms?.length||st.status==='disconnected')return {connected:false};
  const w=windowFor(iso(businessNow(this.p,id,'hackernews')-DAY),String(v.range||'28'),v.from,v.to,st.retainedFrom||Object.values(st.mentions||{}).map(m=>m.createdAt?.slice(0,10)).filter(Boolean).sort()[0]),card=hackernewsCard(st,w,businessNow(this.p,id,'hackernews')),inRange=m=>{const d=m.createdAt.slice(0,10);return d>=w.start&&d<=w.end;};
  const list=Object.values(st.mentions||{}).filter(inRange);
  return {connected:true,terms:st.terms,window:w,retainedFrom:st.retainedFrom||null,kpis:card?.metrics||[],notes:card?.notes||[],series:card?.series||[],
   stories:list.filter(m=>m.type==='story').sort((a,b)=>b.points-a.points).slice(0,20).map(m=>({title:m.title,url:m.url,hnUrl:m.hnUrl,points:m.points,comments:m.comments,date:m.createdAt.slice(0,10),term:m.term})),
   comments:list.filter(m=>m.type==='comment').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,20).map(m=>({title:m.title,hnUrl:m.hnUrl,excerpt:m.excerpt,date:m.createdAt.slice(0,10),term:m.term}))};}
 async community(id,v){const cm=await this.p.community?.state(id).catch(()=>null);if(!cm?.origin||cm.status==='disconnected')return {connected:false};const w=windowFor(iso(businessNow(this.p,id,'community')-DAY),String(v.range||'28'),v.from,v.to,cm.retainedFrom||Object.values(cm.topics||{}).map(t=>t.createdAt?.slice(0,10)).filter(Boolean).sort()[0]);
  const retainedFrom=cm.retainedFrom||add(iso(businessNow(this.p,id,'community')),-90),topics=Object.values(cm.topics||{}).map(t=>({...t,date:String(t.createdAt).slice(0,10),category:cm.categories?.[t.categoryId]||systemMessageText('communitySource.uncategorized')}));const inRange=(t,a,b)=>t.date>=a&&t.date<=b;
  const cur=topics.filter(t=>inRange(t,w.start,w.end)),prev=topics.filter(t=>inRange(t,w.previousStart,w.previousEnd)),prevCovered=!w.all&&retainedFrom<=w.previousStart,covered=retainedFrom<=w.start;
  const daily=[];for(let d=w.start;d<=w.end;d=add(d,1)){const l=cur.filter(t=>t.date===d);daily.push({date:d,topics:d<retainedFrom?null:l.length,replies:d<retainedFrom?null:l.reduce((s,t)=>s+t.replies,0)});}
  const kpi=(key,label,value,previous)=>({key,label,value,previous:prevCovered?previous:null,complete:covered,change:covered&&prevCovered&&previous?(value-previous)/previous:null});
  const cats=new Map();for(const [list,slot] of [[cur,0],[prev,1]])for(const t of list){const c=cats.get(t.category)||[0,0];c[slot]++;cats.set(t.category,c);}
  const url=t=>`${cm.origin}/t/${t.slug}/${t.id}`;
  return {connected:true,origin:cm.origin,title:cm.title,window:w,retainedFrom,notes:[...(covered?[]:[systemMessageText('messages.communityDataStartsEarlyPart', { 0: retainedFrom })]),systemMessageText('dataViews.replyViewCountsLatestRead')],
   kpis:[kpi('topics',systemMessageText('dataCommunity.newTopics'),cur.length,prev.length),kpi('replies',systemMessageText('analysisRules.replies'),cur.reduce((s,t)=>s+t.replies,0),prev.reduce((s,t)=>s+t.replies,0)),{...kpi('unanswered',systemMessageText('dataCommunity.unanswered'),cur.filter(t=>!t.replies).length,null),change:null},{key:'solved',label:systemMessageText('dataViews.markedSolved'),value:cur.length?Math.round(cur.filter(t=>t.solved).length/cur.length*100):null,previous:null,complete:covered,change:null,unit:'%'}],
   daily,categories:[...cats].map(([name,[count,previous]])=>({name,count,previous:prevCovered?previous:null})).sort((a,b)=>b.count-a.count).slice(0,12),
   top:[...cur].sort((a,b)=>(b.views+b.replies*20)-(a.views+a.replies*20)).slice(0,10).map(t=>({title:t.title,url:url(t),views:t.views,replies:t.replies,solved:t.solved,category:t.category,date:t.date})),
   unanswered:cur.filter(t=>!t.replies).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10).map(t=>({title:t.title,url:url(t),category:t.category,date:t.date}))};}
 // The synced rows have no country, so a country view asks Search Console directly (final data, the same window as
 // the synced view, web search) — full history without a re-sync.
 async gscQuery(id: string | number,site: string,body: GscQuery,scope){const g=__google_client;const token=await this.token(id,scope);const rows: GscRow[]=[];
  let startRow=0,rowLimit=body.rowLimit||25000;
  for(;;){let r: unknown;try{r=await g.googleJson(`${g.GOOGLE_ENDPOINTS.searchConsole}/sites/${encodeURIComponent(site)}/searchAnalytics/query`,g.jsonRequest(token,{type:'web',dataState:'final',aggregationType:'auto',...body,rowLimit,startRow}),this.p.googleFetch?.(id));}
   catch(e){if(e.code!=='response_too_large'||rowLimit<=1)throw e;rowLimit=Math.max(1,Math.floor(rowLimit/2));continue;}
   const page=searchConsoleRows(r,body.dimensions);rows.push(...page);startRow+=page.length;if(page.length<rowLimit||rows.length>=MAX_PAIR_ROWS)break;}
  return rows;}
 // A report read directly from Search Console: a country (the synced rows keep none), filters or the details.
 async searchLive(id: string | number,site: string,w: SearchWindow,{country,filters,details=false}: {country?: string | null;filters: SearchFilters;details?: boolean},base,scope: unknown[]){const groups=liveGroups(country,filters);
  const {earliest}=historyBounds(this.p,id),dims=['query','page'],ask=(body: GscQuery)=>body.endDate<earliest?Promise.resolve([]):this.gscQuery(id,site,{...body,startDate:body.startDate>earliest?body.startDate:earliest,...(groups.length?{dimensionFilterGroups:groups}:{})},scope);
  const {byDate,dimensions,cacheExpiresAt,refreshing,savedAt,reason}=await this.reports.load(String(id),['live',...scope,w,country,filters,details,5],async()=>{const [byDate,byPair,byPrevious]=await Promise.all([ask({startDate:w.all?w.start:w.previousStart,endDate:w.end,dimensions:['date']}),details?ask({startDate:w.start,endDate:w.end,dimensions:dims}):Promise.resolve([]),w.all||!details||w.previousStart<earliest?Promise.resolve([]):ask({startDate:w.previousStart,endDate:w.previousEnd,dimensions:dims})]);const pairsOf=(list: GscRow[])=>list.map(r=>({keyword:r.keys[0],page:r.keys[1],clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,position:Number(r.position)||0}));const rows=pairsOf(byPair),previousRows=pairsOf(byPrevious);return {byDate,dimensions:{striking:sp.striking(rows),queries:sp.dimension(rows,'query'),pages:sp.dimension(rows,'page'),movers:w.all?null:{query:sp.movers(rows,previousRows,'query'),page:sp.movers(rows,previousRows,'page')}}};},()=>this.lifetime(id,w),(value,cacheExpiresAt,saved)=>({...value,cacheExpiresAt,...saved}));
  const dayRows=byDate.map(r=>({date:r.keys[0],clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,position:Number(r.position)||0}));
  // Coverage belongs to this actual upstream query, independent of local web history.
  const by=new Map(dayRows.map(r=>[r.date,r]));
  const cur=dayRows.filter(r=>r.date>=w.start&&r.date<=w.end),prev=dayRows.filter(r=>r.date>=w.previousStart&&r.date<=w.previousEnd);
  const complete=cur.length===days(w.start,w.end),previousComplete=!w.all&&prev.length===days(w.previousStart,w.previousEnd),comparable=complete&&previousComplete;
  const queried=[];for(let date=[w.all?w.start:w.previousStart,earliest].sort().at(-1);date<=w.end;date=add(date,1))queried.push({date,payload:by.has(date)?[by.get(date)]:[]});
  const trend=trendOf(w,d=>by.get(d)||null).map(p=>comparable?p:{...p,previousClicks:null,previousImpressions:null,previousCtr:null,previousPosition:null});
  return {complete,previousComplete,coverage:{current:historyCoverage(queried,String(w.start),String(w.end)),previous:w.all?null:historyCoverage(queried,String(w.previousStart),String(w.previousEnd))},totals:sp.totals(cur),previous:comparable?sp.totals(prev):null,trend,...(details?dimensions:{}),movers:details&&comparable?dimensions.movers:null,pairDays:cur.length,live:true,cacheExpiresAt,...(savedAt?{refreshing,savedAt,reason}:{})};}
 // 搜索表现 page: totals, daily trend and the three tables for one window, read from the synced partitions.
 // Synced versions invalidate local aggregation; live Google requests retain their own query-scoped cache.
 async search(id: string | number,v: SearchRequest){let link,snapKey;try{[link,{key:snapKey}]=await Promise.all([this.p.sync.link(id),this.p.sync.snapshotKey(id)]);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  const filters={queryFilter:sp.readFilter(v.queryFilter),pageFilter:sp.readFilter(v.pageFilter)},country=/^[a-z]{3}$/.test(String(v.country||''))?String(v.country):null;
  const identity=['search',...this.scope(id,link),snapKey,String(v.range||'28'),String(v.from||''),String(v.to||''),filters,country,v.details===true,v.exactWindow===true,historyBounds(this.p,id).cutoff,5];
  // Reports that may have to ask Search Console answer a new day's window from the previous one while it is read; the
  // default summary is built from the synced days and never waits for Google.
  const upstream=Boolean(country||filters.queryFilter||filters.pageFilter||v.details===true);
  const value=await this.localReports.load(String(id),identity,()=>this.buildSearch(id,v,link,filters,country),value=>value.connected===false||value.cutoff===null||value.refreshing?0:Math.min(GOOGLE_HISTORY_CACHE_MS,(value.cacheExpiresAt??Infinity)-Date.now()),(value,cacheExpiresAt,saved)=>({...value,cacheExpiresAt,...saved}),upstream?{family:['search',...this.scope(id,link),String(v.range||'28'),String(v.from||''),String(v.to||''),filters,country,v.details===true,v.exactWindow===true]}:{});
  const preliminary=value.cutoff&&!value.filtered&&!value.country&&!value.live&&value.window?.end===value.cutoff?await this.fresh(id,'gsc',value.cutoff):[];
  const progress=!value.live&&value.window&&this.p.sync.historyJobs?await this.p.sync.historyJobs(id,String(link.get('gscSiteUrl')),String(value.window.all?value.window.start:value.window.previousStart),String(value.window.end)):[];
  return {...value,preliminary,history:{jobs:progress.map(j=>({id:j.id,status:String(j.get('status')),startDate:String(j.get('cursor')||j.get('startDate')),endDate:String(j.get('endDate')),errorCode:j.get('errorCode') as unknown})),scheduleEnabled:Boolean(link.get('scheduleEnabled'))}};}

 async buildSearch(id: string | number,v: SearchRequest,link: LegacyRecord,filters: SearchFilters,country: string | null){let snaps: {key:string;payload?: {date:string}[]}[];try{snaps=await this.p.sync.snapshots(id);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  const daily=snaps.find(s=>s.key==='history-search')?.payload||[],{cutoff,earliest}=historyBounds(this.p,id);
  let w=windowFor(cutoff,String(v.range||'28'),v.from,v.to,[firstDate(daily),earliest].filter(Boolean).sort()[0]);const filtered=Boolean(filters.queryFilter||filters.pageFilter),site=String(link.get('gscSiteUrl'));
  let stored=v.details===true&&!country&&!filtered?await this.storedPairs(id,site,w):null;
  // The final cutoff moved and the daily sync has not landed yet: the tables end at the last synced day until it does,
  // rather than asking Search Console for what the sync is about to store. The report says which window it holds. A hole
  // further back, with the last day held, is not a pending sync and reads Search Console.
  if(!stored&&v.details===true&&!country&&!filtered&&v.exactWindow!==true&&!w.all&&String(v.range||'28')!=='custom'){const last=await this.lastPairDay(id,site,cutoff);
   if(last&&last<cutoff){const synced=windowFor(last,String(v.range||'28'),v.from,v.to,[firstDate(daily),earliest].filter(Boolean).sort()[0]);stored=await this.storedPairs(id,site,synced);if(stored)w=synced;}}
  if(!stored&&(country||filtered||v.details===true)){let live;try{live=await this.searchLive(id,site,w,{country,filters,details:v.details===true},null,this.scope(id,link));}catch(e){fail(e.code==='invalid_grant'?systemMessageText('dataViews.googleAuthorizationExpiredAuthorizeAgain'):systemMessageText('dataViews.notReadSearchConsoleData'),502);}
   return {connected:true,cutoff,from:null,window:w,filtered,filters,country,...live};}
  const parts=await this.p.db.getRepository('nrSyncPartitions').find({filter:{projectId:id,source:'gsc',grain:'overview',resource:site,date:partitionDates(w.all?w.start:w.previousStart,w.end,Boolean(w.all))},fields:['date','payload','updatedAt']});
  const valid=parts.map(p=>({date:String(p.get('date')),payload:p.get('payload') as unknown,updatedAt:p.get('updatedAt') as string | undefined})).filter((p): p is typeof p & {payload: {date:string;clicks:number;impressions:number;position:number}[]}=>validOverview(p.payload,p.date));
  const dayRows=valid.flatMap(p=>p.payload),inWin=(a,b)=>dayRows.filter(r=>r.date>=a&&r.date<=b),cur=inWin(w.start,w.end),prev=inWin(w.previousStart,w.previousEnd);
  const complete=cur.length===days(w.start,w.end),previousComplete=!w.all&&prev.length===days(w.previousStart,w.previousEnd),comparable=complete&&previousComplete;
  const by=new Map(dayRows.map(r=>[r.date,r])),trend=trendOf(w,d=>by.get(d)||null).map(p=>comparable?p:{...p,previousClicks:null,previousImpressions:null,previousCtr:null,previousPosition:null});
  return {connected:true,cutoff,from:firstDate(dayRows),window:w,filtered,filters,country:null,complete,previousComplete,totals:sp.totals(cur),previous:comparable?sp.totals(prev):null,trend,
   coverage:{earliest,current:historyCoverage(valid,String(w.start),String(w.end)),previous:w.all?null:historyCoverage(valid,String(w.previousStart),String(w.previousEnd))},movers:null,
   ...(stored?{striking:sp.striking(stored.current),queries:sp.dimension(stored.current,'query'),pages:sp.dimension(stored.current,'page'),movers:comparable?{query:sp.movers(stored.current,stored.previous,'query'),page:sp.movers(stored.current,stored.previous,'page')}:null,pairDays:w.days}:{})};}
 // The query × page rows of both periods from the synced days, summed a day at a time and giving way between days, as
 // those days are large. Only when the sync holds every day of both: a history fill stores overview rows alone, so a
 // recent project or a long range holds part of them and is read from Search Console, or its tables would come up short.
 async lastPairDay(id: string | number,site: string,cutoff: string){const dates=[];for(let i=PENDING_SYNC_DAYS;i>=0;i--)dates.push(add(cutoff,-i));
  const [held,published]=await Promise.all([this.p.db.getRepository('nrSyncPartitions').find({filter:{projectId:id,source:'gsc',grain:'query_page',resource:site,date:{$in:dates}},fields:['date']}),this.publishedDays(id,site,dates)]);return held.map(p=>dayOf(p.get('date'))).filter(d=>published.has(d)).sort().at(-1)||null;}
 // The sync stores a day Google has not published yet as an empty partition, so while the sync still reads a day again,
 // a table ending on it needs totals on it. A quiet day further back in the window, or older than that, is a real one.
 async publishedDays(id: string | number,site: string,dates: string[]){const parts=await this.p.db.getRepository('nrSyncPartitions').find({filter:{projectId:id,source:'gsc',grain:'overview',resource:site,date:{$in:dates}},fields:['date','payload']});
  return new Set(parts.filter(p=>{const payload=p.get('payload');return Array.isArray(payload)&&payload.length>0;}).map(p=>dayOf(p.get('date'))));}
 async storedPairs(id: string | number,site: string,w: SearchWindow){if(w.all||days(w.previousStart,w.end)>MAX_STORED_PAIR_DAYS)return null;
  const repo=this.p.db.getRepository('nrSyncPartitions'),scope={projectId:id,source:'gsc',grain:'query_page',resource:site},wanted=partitionDates(w.previousStart,w.end).$in;
  const held=new Set((await repo.find({filter:{...scope,date:{$in:wanted}},fields:['date']})).map(p=>dayOf(p.get('date'))));if(wanted.some(d=>!held.has(d)))return null;
  if(String(w.end)>=add(historyBounds(this.p,id).cutoff,-SYNC_REREAD_DAYS)&&!(await this.publishedDays(id,site,[String(w.end)])).has(String(w.end)))return null;
  const current=sp.pairSum(),previous=sp.pairSum();
  for(const date of wanted){await new Promise(resolve=>setImmediate(resolve));const [part]=await repo.find({filter:{...scope,date:{$in:[date]}},fields:['date','payload']}),sum=date>=w.start?current:previous;sum.add(part?.get('payload'));
   // Too many for one report: Search Console answers it with its own limit, as it did before these tables were summed.
   if(sum.size()>MAX_PAIR_ROWS)return null;}
  return {current:current.rows(),previous:previous.rows()};}
 // GA4 history is cached by the actual query in WebsiteReport. Synced partition writes only refresh the local
 // Search Console enrichment, without invalidating an unchanged GA4 window or repeating its upstream reports.
 async website(id,v){return this.websitePart(id,v,'period');}
 // The rest of Traffic's tables, which the page asks for once it shows the rest (website-report.ts, `periodTables`).
 async websiteTables(id,v){return this.websitePart(id,v,'periodTables');}
 // Whether Traffic read now lasts until midnight rather than until the morning re-read (website-report.ts, `dayRead`):
 // the sync tick reads the other tables ahead only then. It passes the property of the link it holds, null for none.
 async websiteDayRead(id,property?){return this.ga4.dayRead(id,property===undefined?(await this.p.sync.link(id)).get('ga4PropertyId'):property);}
 async websitePart(id,v,part:'period'|'periodTables'){let link,snaps;try{[link,snaps]=await Promise.all([this.p.sync.link(id),this.p.sync.snapshots(id)]);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  const range=WEB_RANGES.includes(String(v.range))?String(v.range):'28';const property=link.get('ga4PropertyId');return websiteView(snaps,range,(w,cutoff,settledThrough)=>this.ga4[part](id,property,w,{cutoff,settledThrough,view:[range,String(v.from||''),String(v.to||'')]}),v.from,v.to,()=>this.ga4.yesterday(id,property));}
 // 访问 · one row's days (its detail), 今天 and 实时: read from GA4 when asked (website-report.ts keeps each a while).
 async websiteRow(id,v){let link,snaps;try{[link,snaps]=await Promise.all([this.p.sync.link(id),this.p.sync.snapshots(id)]);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  const get=k=>snaps.find(s=>s.key===k)?.payload,synced=get('project')?.end||(get('history-web')||[]).map(r=>r.date).sort().at(-1);if(!synced)return {connected:true,cutoff:null};
  // The cutoff is the one on the user's report. It is checked against the latest day that is yesterday anywhere (UTC+14),
  // not a new zone lookup, which another instance or a failed lookup may resolve a day earlier.
  const property=link.get('ga4PropertyId'),yesterday=await this.ga4.yesterday(id,property);
  const latest=add(iso(businessNow(this.p,id,'google')+14*3600000),-1),cutoff=v.cutoff===undefined?trafficEnd(synced,yesterday):v.cutoff,first=firstDate(get('history-web')||[]);if(!calendarDate(cutoff)||cutoff>trafficEnd(synced,latest)||(first&&cutoff<first))fail(systemMessageText('dataViews.invalidDate'));
  const range=WEB_RANGES.includes(String(v.range))?String(v.range):'28',w=windowFor(cutoff,range,v.from,v.to,first);
  // A row is kept as long as a report over final days only while GA4 has finished every day of its window. Its chart
  // dots the days after `settledThrough`, which a saved row keeps from the day it was read.
  const settledThrough=calendarDate(yesterday)?add(yesterday,-GA4_PROCESSING_DAYS):null,settled=Boolean(settledThrough)&&w.end<=settledThrough;
  return {connected:true,cutoff,window:w,settledThrough,...await this.ga4.row(id,property,w,{table:String(v.table||''),dims:v.dims&&typeof v.dims==='object'?v.dims:{},settled,...(settledThrough?{settledThrough}:{}),view:[range,String(v.from||''),String(v.to||'')]})};}
 async websiteToday(id){let link;try{link=await this.p.sync.link(id);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}return {connected:true,...await this.ga4.today(id,link.get('ga4PropertyId'))};}
 async websiteRealtime(id,v={}){let link;try{link=await this.p.sync.link(id);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}return {connected:true,...await this.ga4.realtime(id,link.get('ga4PropertyId'),v.summary===true)};}
 // Countries for the country filter: a live Search Console query, asked for on its own (the page does not wait for it)
 // and saved per window.
 async searchCountries(id,v){if(!calendarDate(v.start)||!calendarDate(v.end)||v.start>v.end)fail(systemMessageText('dataViews.invalidDate'));let link;try{link=await this.p.sync.link(id);}catch(e){if(googleDisconnected(e))return {countries:[]};throw e;}
  const scope=this.scope(id,link);return this.report(id,['countries',...scope,v.start,v.end],async()=>{try{const rows=await this.gscQuery(id,link.get('gscSiteUrl'),{startDate:v.start,endDate:v.end,dimensions:['country'],rowLimit:250},scope);return {countries:rows.map(r=>({key:String(r.keys?.[0]||''),clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0})).filter(c=>c.key).sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions).slice(0,60)};}catch{return {countries:[],partial:true};}});}
 // 搜索表现 · 细分: countries, devices and search appearances of the report's window and the period before, read from
 // Search Console when the page asks (the synced rows keep none) and saved: see `lifetime`.
 async searchBreakdown(id: string | number,v: SearchRequest){const w=liveWindow(v);let link;try{link=await this.p.sync.link(id);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  const filters={queryFilter:sp.readFilter(v.queryFilter),pageFilter:sp.readFilter(v.pageFilter)},country=/^[a-z]{3}$/.test(String(v.country||''))?String(v.country):null;
  const site=link.get('gscSiteUrl'),scope=this.scope(id,link);const value=await this.report(id,['breakdown',...scope,w,filters,country,6],async()=>{
  const groups=liveGroups(country,filters),{earliest}=historyBounds(this.p,id);let failure=null;
  const read=async(dimension: string,a: string,b: string)=>{if(b<earliest)return [];a=a>earliest?a:earliest;try{return (await this.gscQuery(id,site,{startDate:a,endDate:b,dimensions:[dimension],rowLimit:1000,...(groups.length?{dimensionFilterGroups:groups}:{})},scope)).map(r=>({key:String(r.keys?.[0]||''),clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,position:Number(r.position)||0})).filter(r=>r.key);}catch(e){failure=failure||e;return null;}};
  const part=async(dimension: string)=>{const [cur,prev]=await Promise.all([read(dimension,w.start,w.end),w.all||w.previousStart<earliest?Promise.resolve(null):read(dimension,w.previousStart,w.previousEnd)]);if(!cur)return null;const before=new Map((prev||[]).map(r=>[r.key,r]));
   return cur.map(r=>({...r,ctr:r.impressions?r.clicks/r.impressions:0,previousClicks:prev?before.get(r.key)?.clicks??0:null,previousImpressions:prev?before.get(r.key)?.impressions??0:null})).sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions);};
  const [countries,devices,appearances]=await Promise.all(['country','device','searchAppearance'].map(part));
  if(!countries&&!devices&&!appearances)fail(failure?.code==='invalid_grant'?systemMessageText('dataViews.googleAuthorizationExpiredAuthorizeAgain'):systemMessageText('dataViews.notReadSearchConsoleData'),502);
  return {connected:true,countries,devices,appearances,partial:Boolean(failure),window:w};},w,viewFamily('breakdown',[...scope,filters,country],v,w));
  // The period before is always read: a page that may not compare yet (the sync has not landed) and one that can then
  // share one report instead of reading the same window twice a day.
  if(v.compare!==false)return value;const plain=rows=>rows&&rows.map(r=>({...r,previousClicks:null,previousImpressions:null}));return {...value,countries:plain(value.countries),devices:plain(value.devices),appearances:plain(value.appearances)};}
 // 搜索表现 · one query or page: its days against the period before, and the pages it shows with (or the queries a page
 // shows for), read from Search Console when its row is opened and saved: see `lifetime`.
 async searchRow(id: string | number,v: SearchRequest){const w=liveWindow(v),dimension=v.dimension==='page'?'page':'query',k=String(v.key||'').slice(0,4096),country=/^[a-z]{3}$/.test(String(v.country||''))?String(v.country):null;
  if(!k)fail(systemMessageText('dataViews.notReadSearchConsoleData'),400);
  let link;try{link=await this.p.sync.link(id);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  const filters={queryFilter:sp.readFilter(v.queryFilter),pageFilter:sp.readFilter(v.pageFilter)},site=link.get('gscSiteUrl'),scope=this.scope(id,link);return this.report(id,['row',...scope,w,dimension,k,country,filters,v.compare!==false,5],async()=>{
  const groups=[{filters:[{dimension,operator:'equals',expression:k},...liveGroups(country,filters).flatMap(g=>g.filters)]}],other=dimension==='query'?'page':'query',{earliest}=historyBounds(this.p,id),ask=(body: GscQuery)=>body.endDate<earliest?Promise.resolve([]):this.gscQuery(id,site,{...body,startDate:body.startDate>earliest?body.startDate:earliest,dimensionFilterGroups:groups},scope);
  let byDate,related;try{[byDate,related]=await Promise.all([ask({startDate:w.all?w.start:w.previousStart,endDate:w.end,dimensions:['date']}),ask({startDate:w.start,endDate:w.end,dimensions:[other],rowLimit:1000})]);}
  catch(e){fail(e.code==='invalid_grant'?systemMessageText('dataViews.googleAuthorizationExpiredAuthorizeAgain'):systemMessageText('dataViews.notReadSearchConsoleData'),502);}
  // Search Console leaves out days without impressions.
  const by=new Map(byDate.map(r=>[r.keys[0],{clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,position:Number(r.position)||0}]));
  const value={connected:true,dimension,key:k,window:w,trend:trendOf(w,d=>by.get(d)||null).map(p=>v.compare===false||w.previousStart<earliest?{...p,previousClicks:null,previousImpressions:null,previousCtr:null,previousPosition:null}:p),
   related:related.map(r=>({key:String(r.keys?.[0]||''),clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,ctr:r.impressions?(Number(r.clicks)||0)/Number(r.impressions):0,position:Number(r.position)||0})).filter(r=>r.key).sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions).slice(0,100)};
  return value;},w,viewFamily('row',[...scope,dimension,k,country,filters,v.compare!==false],v,w));}
 // What Search performance reads when it opens on its default range, ready before anyone asks (the sync's tick calls this).
 async warm(id,range='28'){const report=await this.search(id,{range});if(!report?.connected||!report.cutoff||!report.window)return;
  await this.search(id,{range,details:true});
  return {partial:Boolean((await this.searchBreakdown(id,{...report.window,view:reportView({range})}))?.partial)};}
 // D: who has opened this project's reports lately decides whether they are read ahead of time. Kept in memory and saved
 // at most hourly, as a restart must not forget it; a demo's refused write leaves the memory copy working.
 noteRead(id){const key=String(id),now=Date.now(),last=this.readAt.get(key)||0;this.readAt.set(key,now);if(now-last<3600000||this.p.db?.transactionContext?.())return;void this.readsOf(key).then(()=>this.saveRead(key));}
 // The ranges saved before are read first (`readsOf`), so writing the read time never drops them.
 async saveRead(id){const saving=this.saving=this.saving||new Map(),write=(saving.get(id)||Promise.resolve()).then(()=>this.writeRead(id));
  saving.set(id,write);try{await write;}finally{if(saving.get(id)===write)saving.delete(id);}}
 // One write at a time a project (`saveRead`), so the read time and a range saved together never create two rows.
 async writeRead(id){try{const repo=this.p.db.getRepository('nrSnapshots'),key=`report-reads:${id}`,row=await repo.findOne({filter:{key}}),at=this.readAt.get(id),views=this.viewReads.get(id);
  const payload={...(at?{at:new Date(at).toISOString()}:{}),...(views&&Object.keys(views).length?{views:Object.fromEntries(Object.entries(views).map(([k,t])=>[k,new Date(t).toISOString()]))}:{})};
  if(row)await repo.update({filter:{key},values:{payload}});else await repo.create({values:{key,payload}});}catch{/* the memory copy still works */}}
 async readsOf(id){const key=String(id);if(!this.readAt.has(key)||!this.viewReads.has(key)){let saved;try{saved=(await this.p.db.getRepository('nrSnapshots').findOne({filter:{key:`report-reads:${key}`}}))?.get('payload');}catch{saved=null;}
   if(!this.readAt.has(key))this.readAt.set(key,Date.parse(saved?.at||'')||0);
   if(!this.viewReads.has(key))this.viewReads.set(key,Object.fromEntries(Object.entries(saved?.views||{}).map(([k,t])=>[k,Date.parse(String(t))||0]).filter(([k,t])=>t&&VIEW_KEY.test(k))));}
  return {at:this.readAt.get(key)||0,views:this.viewReads.get(key)};}
 async recentlyRead(id,authorizedAt,within=WARM_READ_WINDOW_MS){const {at}=await this.readsOf(id);return Date.now()-Math.max(at,Date.parse(authorizedAt||'')||0)<within;}
 // The ranges a person chose on a page other than its default, so the tick reads them ahead too (sync-service.ts):
 // Traffic's, Search performance's and Pages' (`kind`), each when it was last chosen, and Keywords' site ranks (`ranks`). Saved with the read time, at once
 // for a range not chosen before and at most hourly after, so a restart keeps them. Custom ranges are not kept.
 noteView(id,kind,range='28'){const key=String(id),r=String(range||'28');if(!VIEW_RANGES[kind]?.includes(r))return;void this.readsOf(key).then(({views})=>{
  const k=`${kind}:${r}`,now=Date.now(),last=views[k]||0;views[k]=now;if(now-last<3600000||this.p.db?.transactionContext?.())return;return this.saveRead(key);}).catch(()=>{});}
 // The ranges of `kind` chosen in the last VIEW_READ_WINDOW_MS, most recent first, at most VIEWS_READ_AHEAD.
 async recentViews(id,kind){const {views}=await this.readsOf(id),now=Date.now();
  return Object.entries(views).filter(([k,t])=>k.startsWith(kind+':')&&now-t<VIEW_READ_WINDOW_MS).sort((a,b)=>b[1]-a[1]).slice(0,VIEWS_READ_AHEAD).map(([k])=>k.slice(kind.length+1));}
 // The last 28 synced days of Search Console query × page rows, one row per pair; Keywords' site ranks and keyword detail
 // read them. A large site's pairs pass the report cache's 2 MB entry limit, so they were summed again from the stored
 // days on every read (one to five seconds on 2026-11-06, the whole process waiting). They are held here in memory for
 // the last few projects read, under what they depend on: the window's own partitions, so a history fill writing older
 // days keeps them. Days are read a few at a time, giving way to other requests between reads.
 async pairRows(id){let snaps,link;try{[snaps,link]=await Promise.all([this.p.sync.snapshots(id),this.p.sync.link(id)]);}catch(e){if(googleDisconnected(e))return {connected:false,cutoff:null,window:null,rows:[]};throw e;}
  const daily=snaps.find(s=>s.key==='history-search')?.payload||[],cutoff=daily.map(r=>r.date).sort().at(-1);if(!cutoff)return {connected:true,cutoff:null,window:null,rows:[]};
  const w=windowFor(cutoff,'28'),held=await this.heldPairs(id,link,w);
  return {connected:true,cutoff,window:{start:w.start,end:w.end},rows:held.rows,index:held.index};}
 async heldPairs(id,link,w){const repo=this.p.db.getRepository('nrSyncPartitions'),site=link.get('gscSiteUrl'),filter={projectId:id,source:'gsc',grain:'query_page',resource:site,date:partitionDates(w.start,w.end)};
  const read=async()=>{const sum=sp.pairSum();await eachPartitionDays(repo,{...filter,date:undefined},filter.date.$in,PAIR_READ_DAYS,['payload'],r=>sum.add(r.get('payload')||[]));
   const rows=sum.rows();return {rows,index:sp.queryIndex(rows)};};
  // Inside a transaction the rows read may still roll back, so they are neither shared nor kept.
  if(this.p.db?.transactionContext?.())return read();
  const key=JSON.stringify([...this.scope(id,link),w.start,w.end,...await this.storedDays(id,'gsc','query_page',site,filter.date)]),pid=String(id),hit=this.pairHold.get(pid);
  if(hit?.key===key){this.pairHold.delete(pid);this.pairHold.set(pid,hit);return hit.value;}
  const started=Date.now(),value=read().then(v=>{this.p.app?.logger?.info?.('NocoReach search pairs read',{projectId:pid,days:filter.date.$in.length,pairs:v.rows.length,ms:Date.now()-started});return v;});
  const entry={key,value,pairs:0};this.pairHold.delete(pid);this.pairHold.set(pid,entry);
  // At most PAIR_HOLD_PROJECTS projects and MAX_HELD_PAIRS pairs in all, the least recently read let go first; the one
  // just read stays whatever its size.
  void value.then(v=>{entry.pairs=v.rows.length;let total=0;for(const e of this.pairHold.values())total+=e.pairs;
   for(const [k,e] of this.pairHold){if(this.pairHold.size<=PAIR_HOLD_PROJECTS&&total<=MAX_HELD_PAIRS)break;if(e===entry)continue;this.pairHold.delete(k);total-=e.pairs;}},()=>{});
  value.catch(()=>{if(this.pairHold.get(pid)?.value===value)this.pairHold.delete(pid);});
  return value;}
 // 本站排名 for up to 1000 keywords over the last 28 synced days of Search Console query × page rows.
 async ranks(id,v){const r=await this.pairRows(id);if(!r.connected)return {connected:false,ranks:{}};if(!r.cutoff)return {connected:true,cutoff:null,ranks:{}};
  const keywords=(Array.isArray(v.keywords)?v.keywords:[]).map(String).slice(0,1000);
  return {connected:true,cutoff:r.cutoff,window:r.window,ranks:sp.indexedRanks(r.index,keywords)};}
 // One page of 内容 (SPEC §5 内容 详情): its daily search clicks and impressions (Search Console query × page rows) and
 // views (GA4 page rows) over the range; pages match by host and path, ignoring www and a trailing slash.
 // 页面: every page's visits (GA4 page partitions) and search clicks and impressions (Search Console query × page
 // partitions) for the period and the one before it, summed from every synced day rather than the snapshots' top-page
 // samples. Pages are host and path; GA4 rows synced before hosts were kept have host ''. Search Console counts leave out
 // anonymised queries. Built once per synced data and range, and saved like 搜索表现.
 // Pages' figures are kept under the stored days they sum, not every synced day, so a history fill writing older days or
 // the other source's days do not make the next range change sum them again; the days are read a few at a time, giving
 // way to other requests between reads.
 async pageFigures(id,range,from,to){let link,snaps;try{[link,snaps]=await Promise.all([this.p.sync.link(id),this.p.sync.snapshots(id)]);}catch(e){if(googleDisconnected(e))return null;throw e;}
  const end=snaps.find(s=>s.key==='project')?.payload?.end;if(!end)return null;
  const first=snaps.filter(s=>['history-web','history-search'].includes(s.key)).flatMap(s=>s.payload||[]).map(r=>r.date).sort()[0];const w=windowFor(end,String(range),from,to,first),dates=partitionDates(w.previousStart,w.end,Boolean(w.all));
  const sources=[['gsc','query_page',link.get('gscSiteUrl')],['ga4','page',link.get('ga4PropertyId')]],stored=await Promise.all(sources.map(([source,grain,resource])=>resource?this.storedDays(id,source,grain,resource,dates):null));
  return this.localReports.load(String(id),['page-figures',...this.scope(id,link),link.get('ga4PropertyId'),w.start,w.end,w.previousStart,Boolean(w.all),stored,5],async()=>packFigures(await this.buildPageFigures(id,w,link,dates)),value=>value?GOOGLE_HISTORY_CACHE_MS:0,unpackFigures);}
 // What a source's stored days of a window are, cheaply: how many and the last write, so a kept sum knows it is current.
 async storedDays(id,source,grain,resource,dates){const repo=this.p.db.getRepository('nrSyncPartitions'),filter={projectId:id,source,grain,resource,date:dates};
  const [count,latest]=await Promise.all([repo.count({filter}),repo.findOne({filter,sort:['-updatedAt'],fields:['updatedAt']})]);
  const at=latest?.get('updatedAt');return [count,at instanceof Date?at.toISOString():at??null];}
 async buildPageFigures(id,w,link,dates){const repo=this.p.db.getRepository('nrSyncPartitions');
  const period=d=>d>=w.start&&d<=w.end?'current':d>=w.previousStart&&d<=w.previousEnd?'previous':null;
  const pathOf=v=>String(v||'').split(/[?#]/)[0].replace(/\/+$/,'')||'/',hostOf=v=>String(v||'').toLowerCase().replace(/^www\./,'');
  const days={gsc:{current:0,previous:0},ga4:{current:0,previous:0}},search=new Map(),web=new Map();
  // Each address is parsed once, not once a day: a page reached by many queries repeats it in every row of every day.
  const places=new Map(),place=page=>{let at=places.get(page);if(at===undefined){try{const u=new URL(page);at=[hostOf(u.hostname),pathOf(u.pathname)];}catch{at=null;}places.set(page,at);}return at;};
  const entry=(m,host,path,zero)=>{const k=`${host}|${path}`;let o=m.get(k);if(!o){o={host,path,current:{...zero},previous:{...zero}};m.set(k,o);}return o;};
  const site=link.get('gscSiteUrl'),property=link.get('ga4PropertyId');
  if(site)await eachPartitionDays(repo,{projectId:id,source:'gsc',grain:'query_page',resource:site},dates.$in,FIGURE_READ_DAYS,['date','payload'],r=>{const p=period(dayOf(r.get('date')));if(!p)return;days.gsc[p]++;
   for(const x of r.get('payload')||[]){const at=place(x.page);if(!at)continue;const o=entry(search,at[0],at[1],{clicks:0,impressions:0})[p];o.clicks+=Number(x.clicks)||0;o.impressions+=Number(x.impressions)||0;}});
  if(property)await eachPartitionDays(repo,{projectId:id,source:'ga4',grain:'page',resource:property},dates.$in,FIGURE_READ_DAYS,['date','payload'],r=>{const p=period(dayOf(r.get('date')));if(!p)return;days.ga4[p]++;
   for(const x of r.get('payload')||[]){if(!String(x.page||'').startsWith('/'))continue;entry(web,hostOf(x.host),pathOf(x.page),{views:0})[p].views+=Number(x.views)||0;}});
  return {window:w,days,search:[...search.values()],web:[...web.values()]};}
 // A page's own figures (Website content's page drawer), counting every address the project's page identity gives it.
 // The window's days are summed for every page at once (pageDays) and the page is looked up in them: reading the
 // window's partitions for each page opened took about three seconds a page at 8,000 query × page rows a day, the whole
 // process waiting (2026-11-07). The answer is not saved: the days are held, and saving each page's answer rewrote the
 // project's saved reports (up to 8 MB, about 300 ms a page on 252) and pushed Pages' and Search's copies out of them.
 async page(id,v){if(!pageKey(v.url))fail(systemMessageText('dataViews.providePageUrl'));const identity=pageIdentity(await this.p.siteContent?.state?.(id).catch(()=>null)),key=pageKey(v.url,identity);let snaps,link;try{[snaps,link]=await Promise.all([this.p.sync.snapshots(id),this.p.sync.link(id)]);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  const get=k=>snaps.find(s=>s.key===k)?.payload||[],last=rows=>rows.map(r=>r.date).sort().at(-1)||null,gscEnd=last(get('history-search')),ga4End=last(get('history-web')),end=(['custom','all'].includes(v.range)?get('project')?.end:null)||[gscEnd,ga4End].filter(Boolean).sort().at(-1);if(!end)return {connected:true,window:null};
  const w=windowFor(end,String(v.range||'90'),v.from,v.to,[...get('history-search'),...get('history-web')].map(r=>r.date).sort()[0]),path=key.slice(key.indexOf('/'));
  const held=await this.pageDays(id,link,w,{gsc:Boolean(gscEnd),ga4:Boolean(ga4End)});
  const byDay=new Map();const day=d=>{let o=byDay.get(d);if(!o){o={date:d};byDay.set(d,o);}return o;},{search,web}=pagesBy(held,identity);
  for(const d of held.gscDays){const o=day(d);o.clicks=0;o.impressions=0;}
  for(const e of search.get(key)||[])for(let i=0;i<e.dates.length;i++){const o=day(e.dates[i]);o.clicks+=e.clicks[i];o.impressions+=e.impressions[i];}
  for(const d of held.ga4Days){const o=day(d);o.views=0;}
  for(const e of web.get(normPath(path))||[])for(let i=0;i<e.dates.length;i++)day(e.dates[i]).views+=e.views[i];
  const daily=[];for(let d=w.start;d<=w.end;d=add(d,1))daily.push(byDay.get(d)||{date:d});
  return {connected:true,window:w,gscCutoff:gscEnd,ga4Cutoff:ga4End,daily};}
 // Every page's daily search clicks and impressions (Search Console query × page rows, under the address without the
 // page identity: scheme, `www.`, trailing slash and query aside) and views (GA4 page rows, under their host and page as
 // stored) over a window, with the days each source has stored. The page identity is applied when a page is looked up,
 // so a newly read canonical does not sum the days again. Kept under the window's own stored days like Pages' figures;
 // the days are read a few at a time, giving way to other requests between reads.
 async pageDays(id,link,w,sources){const repo=this.p.db.getRepository('nrSyncPartitions'),dates=partitionDates(w.start,w.end,Boolean(w.all)),site=link.get('gscSiteUrl'),property=link.get('ga4PropertyId');
  const read=async()=>{const held={gscDays:[],ga4Days:[],search:new Map(),web:new Map(),size:0};
   // Each address is keyed once, not once a row: a page reached by many queries repeats it in every row of every day.
   const keys=new Map(),keyOf=page=>{let k=keys.get(page);if(k===undefined){k=pageKey(page);keys.set(page,k);}return k;};
   if(sources.gsc&&site)await eachPartitionDays(repo,{projectId:id,source:'gsc',grain:'query_page',resource:site},dates.$in,PAIR_READ_DAYS,['date','payload'],r=>{const date=dayOf(r.get('date')),sums=new Map();held.gscDays.push(date);
    for(const x of r.get('payload')||[]){const k=keyOf(x.page);if(!k)continue;let s=sums.get(k);if(!s)sums.set(k,s=[0,0]);s[0]+=Number(x.clicks)||0;s[1]+=Number(x.impressions)||0;}
    for(const [k,[clicks,impressions]] of sums){let e=held.search.get(k);if(!e)held.search.set(k,e={at:k,dates:[],clicks:[],impressions:[]});e.dates.push(date);e.clicks.push(clicks);e.impressions.push(impressions);held.size++;}});
   if(sources.ga4&&property)await eachPartitionDays(repo,{projectId:id,source:'ga4',grain:'page',resource:property},dates.$in,PAIR_READ_DAYS,['date','payload'],r=>{const date=dayOf(r.get('date')),sums=new Map();held.ga4Days.push(date);
    for(const x of r.get('payload')||[]){const k=`${x.host||''} ${x.page??''}`;let s=sums.get(k);if(!s)sums.set(k,s={host:x.host,page:x.page,views:0});s.views+=Number(x.views)||0;}
    for(const [k,s] of sums){let e=held.web.get(k);if(!e)held.web.set(k,e={host:s.host,page:s.page,dates:[],views:[]});e.dates.push(date);e.views.push(s.views);held.size++;}});
   return held;};
  // Inside a transaction the rows read may still roll back, so they are neither shared nor kept.
  if(this.p.db?.transactionContext?.())return read();
  const stored=await Promise.all([sources.gsc&&site?this.storedDays(id,'gsc','query_page',site,dates):null,sources.ga4&&property?this.storedDays(id,'ga4','page',property,dates):null]);
  const key=JSON.stringify([id,...this.scope(id,link),property,w.start,w.end,Boolean(w.all),stored]),hit=this.pageDayHold.get(key);
  if(hit){this.pageDayHold.delete(key);this.pageDayHold.set(key,hit);return hit.value;}
  const started=Date.now(),value=read().then(v=>{this.p.app?.logger?.info?.('NocoReach page days read',{projectId:String(id),days:dates.$in.length,pages:v.search.size+v.web.size,pageDays:v.size,ms:Date.now()-started});return v;});
  const entry={value,size:0};this.pageDayHold.set(key,entry);
  // The least recently read let go first; the one just read stays whatever its size.
  void value.then(v=>{entry.size=v.size;let total=0;for(const e of this.pageDayHold.values())total+=e.size;
   for(const [k,e] of this.pageDayHold){if(this.pageDayHold.size<=PAGE_DAY_HOLDS&&total<=MAX_HELD_PAGE_DAYS)break;if(e===entry)continue;this.pageDayHold.delete(k);total-=e.size;}},()=>{});
  value.catch(()=>{if(this.pageDayHold.get(key)===entry)this.pageDayHold.delete(key);});
  return value;}
 register(){
  // Only a page that says it shows a saved copy (`acceptSaved`) gets one while a new report is read. API keys, scripts and
  // the command line wait for the new report and see its failure, as they did before saved copies.
  const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);const read=()=>fn(id,v,ctx);ctx.body=v.acceptSaved===true?await read():await waitForFresh(read);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('dataViews.notLoadDataTryAgain'));}};
  this.p.app.resourceManager.define({name:'nrDataViews',actions:{overview:wrap((id,v)=>this.overview(id,v)),search:wrap((id,v)=>{this.noteRead(id);this.noteView(id,'search',v.range);return this.search(id,v);}),website:wrap((id,v)=>{this.noteRead(id);this.noteView(id,'website',v.range);return this.website(id,v);}),websiteTables:wrap((id,v)=>this.websiteTables(id,v)),websiteRow:wrap((id,v)=>this.websiteRow(id,v)),websiteToday:wrap(id=>this.websiteToday(id)),websiteRealtime:wrap((id,v)=>this.websiteRealtime(id,v)),searchCountries:wrap((id,v)=>this.searchCountries(id,v)),searchBreakdown:wrap((id,v)=>this.searchBreakdown(id,v)),searchRow:wrap((id,v)=>this.searchRow(id,v)),ranks:wrap((id,v)=>{this.noteView(id,'ranks');return this.ranks(id,v);}),page:wrap((id,v)=>this.page(id,v)),github:wrap((id,v)=>this.github(id,v)),community:wrap((id,v)=>this.community(id,v)),downloads:wrap((id,v)=>this.downloads(id,v)),hackernews:wrap((id,v)=>this.hackernews(id,v))}});this.p.app.acl.allow('nrDataViews',['overview','search','website','websiteTables','websiteRow','websiteToday','websiteRealtime','searchCountries','searchBreakdown','searchRow','ranks','page','github','community','downloads','hackernews'],'loggedIn');}
}
export { websiteView, withFresh, redditCard, DataViews, packagesCard, hackernewsCard, windowFor, metric, series, netChange, starRows, githubCard, communityCard, contentCard, gscCard };
