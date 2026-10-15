// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import { businessNow } from './business-clock.js';
import * as sp from './search-performance.js';
import * as pkgs from './packages-source.js';
import * as hnSource from './hackernews-source.js';
import * as __google_client from './google-client.js';
import { WebsiteReport } from './website-report.js';
import { githubView } from './github-view.js';
import { downloadsView } from './downloads-view.js';
// Data views (SPEC §5 数据分析): one time range across all connected sources; each source keeps its own cutoff.
const DAY=86400000;
const iso=t=>new Date(t).toISOString().slice(0,10);
const add=(d,n)=>iso(Date.parse(d+'T00:00:00Z')+n*DAY);
const days=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/DAY)+1;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
// Same page identity as task effects: host without www, path without a trailing slash.
const pageKey=u=>{try{const x=new URL(u);return `${x.host.toLowerCase().replace(/^www\./,'')}${x.pathname.replace(/\/+$/,'')||'/'}`;}catch{return '';}};
const RANGES=['7','28','90','3m','6m','12m','16m'],WEB_RANGES=['7','28','90','3m','12m'];
const calendarDate=(d:unknown):d is string=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&iso(Date.parse(d+'T00:00:00Z'))===d;
const googleDisconnected=(e:unknown)=>Boolean(e&&typeof e==='object'&&'code' in e&&e.code==='NOCOREACH_GOOGLE_NOT_CONNECTED');
// Partitions store ISO calendar dates as strings. The current Repository supports string $in,
// not numeric/date comparison operators; include at most the selected and previous 490-day windows.
function partitionDates(start:unknown,end:unknown){if(!calendarDate(start)||!calendarDate(end))fail(systemMessageText('dataViews.pickValidStartEndDates'));if(days(start,end)>980)fail(systemMessageText('dataViews.customRangesUp16Months'));const dates:string[]=[];for(let d=start;d<=end;d=add(d,1))dates.push(d);return {$in:dates};}
// Same window rules as the Portal period helper: N days ending at the cutoff, or calendar months back from it.
function windowFor(end,range,from,to){if(range==='custom'){if(!calendarDate(from)||!calendarDate(to)||from>to)fail(systemMessageText('dataViews.pickValidStartEndDates'));const n=days(from,to);if(n>490)fail(systemMessageText('dataViews.customRangesUp16Months'));const e=to<end?to:end;return {start:from,end:e,days:n,previousStart:add(from,-n),previousEnd:add(from,-1)};}
 if(!RANGES.includes(String(range)))fail(systemMessageText('dataViews.unsupportedDateRange'));let start;if(range.endsWith('m')){const s=new Date(Date.parse(end+'T00:00:00Z')+DAY);const d=s.getUTCDate();s.setUTCDate(1);s.setUTCMonth(s.getUTCMonth()-parseInt(range));s.setUTCDate(Math.min(d,new Date(Date.UTC(s.getUTCFullYear(),s.getUTCMonth()+1,0)).getUTCDate()));start=iso(s);}else start=add(end,1-Number(range));const n=days(start,end);return {start,end,days:n,previousStart:add(start,-n),previousEnd:add(start,-1)};}
// Sums need every day of the window present; otherwise the value is shown with its coverage, never as a comparison.
function metric(rows,field,w){const inWin=(a,b)=>rows.filter(r=>r.date>=a&&r.date<=b&&Number.isFinite(r[field]));const cur=inWin(w.start,w.end),prev=inWin(w.previousStart,w.previousEnd);const sum=l=>l.reduce((s,r)=>s+r[field],0);const complete=cur.length===days(w.start,w.end),prevComplete=prev.length===days(w.previousStart,w.previousEnd);const value=cur.length?sum(cur):null,previous=prevComplete?sum(prev):null;return {value,previous,complete,change:complete&&previous?(value-previous)/previous:null};}
function series(rows,field,w){const by=new Map(rows.map(r=>[r.date,r[field]]));const out=[];for(let d=w.start;d<=w.end;d=add(d,1))out.push({date:d,value:by.has(d)&&Number.isFinite(by.get(d))?by.get(d):null});return out;}
// 访问 (GA4): the window ends at the project cutoff, like the other data pages; the numbers come live from GA4
// (website-report.ts, `period`), and each page row carries the Search Console queries that landed on it in the range.
// The page explains the numbers itself; `missing` names the reports GA4 did not return.
async function websiteView(snaps,range,period){const get=k=>snaps.find(s=>s.key===k)?.payload,web=get('history-web')||[],end=get('project')?.end||web.map(r=>r.date).sort().at(-1);if(!end||!web.length)return {connected:true,cutoff:null};
 const w=windowFor(end,range),report=await period(w);
 const pathOf=u=>{try{return new URL(u).pathname.replace(/\/+$/,'')||'/';}catch{return String(u||'').split('?')[0].replace(/\/+$/,'')||'/';}};
 const queries=new Map();for(const q of get(`queries-${range}`)||[]){const k=pathOf(q.page);if(!queries.has(k))queries.set(k,[]);queries.get(k).push({keyword:q.keyword,clicks:q.clicks,impressions:q.impressions,position:q.position});}
 if(report.tables.page)report.tables.page=report.tables.page.map(p=>({...p,queries:(queries.get(pathOf(p.key))||[]).sort((a,b)=>b.impressions-a.impressions).slice(0,8)}));
 return {connected:true,cutoff:end,from:firstDate(web),window:w,...report};}
function firstDate(rows){return rows.map(r=>r.date).sort()[0]||null;}
// Search Console's search types; Discover and Google News report pages only (no queries, no positions).
const SEARCH_TYPES=['web','image','video','news','discover','googleNews'],NO_QUERY=new Set(['discover','googleNews']);
const searchType=t=>(SEARCH_TYPES.includes(String(t))?String(t):'web');
// Search Console filters for a country and the query and page filters (Discover and Google News have no queries).
function liveGroups(type,country,filters){const list=[...(country?[{dimension:'country',operator:'equals',expression:country}]:[]),...[['query',filters.queryFilter],['page',filters.pageFilter]].filter(([dimension,f])=>f&&(dimension==='page'||!NO_QUERY.has(type))).map(([dimension,f])=>({dimension,operator:f.operator,expression:f.expression}))];return list.length?[{filters:list}]:[];}
// The window a page asks about (the report's own), checked like a custom range.
function liveWindow(v){const w={start:String(v.start||''),end:String(v.end||''),previousStart:String(v.previousStart||''),previousEnd:String(v.previousEnd||'')};
 if(![w.start,w.end,w.previousStart,w.previousEnd].every(calendarDate)||w.start>w.end||w.previousStart>w.previousEnd||days(w.start,w.end)>490||days(w.previousStart,w.previousEnd)>490)fail(systemMessageText('dataViews.invalidDate'));return w;}
// One point a day of the window with the same day of the period before: clicks, impressions, CTR and position.
function trendOf(w,at){const out=[];for(let d=w.start,i=0;d<=w.end;d=add(d,1),i++){const pd=add(w.previousStart,i),now=at(d),before=at(pd),f=(r,k)=>(r?k==='ctr'?(r.impressions?r.clicks/r.impressions:0):k==='position'?(r.impressions?Number(r.position)||0:null):r[k]:null);
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
class DataViews{
 constructor(plugin){this.p=plugin;this.ga4=new WebsiteReport(plugin);}
 async fresh(id,source,cutoff){try{return await this.p.sync.fresh(id,source,cutoff);}catch{return [];}}
 async overview(id,v){const now=businessNow(this.p,id),yesterday=iso(now-DAY);let snaps=[];try{snaps=await this.p.sync.snapshots(id);}catch(e){if(!googleDisconnected(e))throw e;snaps=[];}const get=k=>snaps.find(s=>s.key===k)?.payload;const lastDate=rows=>(rows||[]).map(r=>r.date).sort().at(-1)||null;const range=String(v.range||'28');
  const w=end=>windowFor(end,range,v.from,v.to);const cards=[];
  // Each Google source uses its own cutoff (SPEC §5), the same one 搜索表现 shows.
  const gscEnd=lastDate(get('history-search')),ga4End=lastDate(get('history-web'));if(gscEnd){const g=gscCard(get('history-search'),gscEnd,w(gscEnd));if(g)cards.push(withFresh(g,await this.fresh(id,'gsc',gscEnd),['clicks','impressions']));}if(ga4End){const a=ga4Card(get('history-web'),ga4End,w(ga4End));if(a)cards.push(withFresh(a,await this.fresh(id,'ga4',ga4End),['sessions','views']));}
  const site=await this.p.siteContent?.state(id).catch(()=>null);const c=contentCard(site,w(yesterday),now);if(c)cards.push(c);
  const gh=await this.p.github?.state(id).catch(()=>null);const g=githubCard(gh,w(yesterday));if(g)cards.push(g);
  const cm=await this.p.community?.state(id).catch(()=>null);const d=communityCard(cm,w(yesterday),now);if(d)cards.push(d);
  const pk=await this.p.packages?.state(id).catch(()=>null);const pc=packagesCard(pk,w(yesterday),now);if(pc)cards.push(pc);
  const hn=await this.p.hackernews?.state(id).catch(()=>null);const hc=hackernewsCard(hn,w(yesterday),now);if(hc)cards.push(hc);
  const rd=await this.p.reddit?.state(id).catch(()=>null);const rc=redditCard(rd,w(yesterday),now);if(rc)cards.push(rc);
  return {range,from:v.from||null,to:v.to||null,generatedAt:new Date().toISOString(),cards};}
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
  const w=windowFor(iso(businessNow(this.p,id,'hackernews')-DAY),String(v.range||'28'),v.from,v.to),card=hackernewsCard(st,w,businessNow(this.p,id,'hackernews')),inRange=m=>{const d=m.createdAt.slice(0,10);return d>=w.start&&d<=w.end;};
  const list=Object.values(st.mentions||{}).filter(inRange);
  return {connected:true,terms:st.terms,window:w,retainedFrom:st.retainedFrom||null,kpis:card?.metrics||[],notes:card?.notes||[],series:card?.series||[],
   stories:list.filter(m=>m.type==='story').sort((a,b)=>b.points-a.points).slice(0,20).map(m=>({title:m.title,url:m.url,hnUrl:m.hnUrl,points:m.points,comments:m.comments,date:m.createdAt.slice(0,10),term:m.term})),
   comments:list.filter(m=>m.type==='comment').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,20).map(m=>({title:m.title,hnUrl:m.hnUrl,excerpt:m.excerpt,date:m.createdAt.slice(0,10),term:m.term}))};}
 async community(id,v){const cm=await this.p.community?.state(id).catch(()=>null);if(!cm?.origin||cm.status==='disconnected')return {connected:false};const w=windowFor(iso(businessNow(this.p,id,'community')-DAY),String(v.range||'28'),v.from,v.to);
  const retainedFrom=cm.retainedFrom||add(iso(businessNow(this.p,id,'community')),-90),topics=Object.values(cm.topics||{}).map(t=>({...t,date:String(t.createdAt).slice(0,10),category:cm.categories?.[t.categoryId]||systemMessageText('communitySource.uncategorized')}));const inRange=(t,a,b)=>t.date>=a&&t.date<=b;
  const cur=topics.filter(t=>inRange(t,w.start,w.end)),prev=topics.filter(t=>inRange(t,w.previousStart,w.previousEnd)),prevCovered=retainedFrom<=w.previousStart,covered=retainedFrom<=w.start;
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
 async gscQuery(id,site,body){const g=__google_client;const token=await this.p.token(id);const rows=[];
  let startRow=0,rowLimit=body.rowLimit||25000;
  for(;;){let r;try{r=await g.googleJson(`${g.GOOGLE_ENDPOINTS.searchConsole}/sites/${encodeURIComponent(site)}/searchAnalytics/query`,g.jsonRequest(token,{type:'web',dataState:'final',aggregationType:'auto',...body,rowLimit,startRow}),this.p.googleFetch?.(id));}
   catch(e){if(e.code!=='response_too_large'||rowLimit<=1)throw e;rowLimit=Math.max(1,Math.floor(rowLimit/2));continue;}
   const page=Array.isArray(r.rows)?r.rows:[];rows.push(...page);startRow+=page.length;if(page.length<rowLimit||rows.length>=100000)break;}
  return rows;}
 // Countries with search clicks in the window, for the 搜索表现 country menu (alpha-3, as Search Console reports them).
 async countries(id,site,w){try{return (await this.gscQuery(id,site,{startDate:w.start,endDate:w.end,dimensions:['country'],rowLimit:250})).map(r=>({key:String(r.keys?.[0]||''),clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0})).filter(c=>c.key).sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions).slice(0,60);}catch{return [];}}
 // A report read directly from Search Console: a country (the synced rows keep none) or a search type other than web
 // (the sync reads web search only). Discover and Google News have no queries and no positions.
 async searchLive(id,site,w,{type,country,filters},base){const groups=liveGroups(type,country,filters);
  const dims=NO_QUERY.has(type)?['page']:['query','page'],ask=body=>this.gscQuery(id,site,{type,...body,...(groups.length?{dimensionFilterGroups:groups}:{})});
  const [byDate,byPair,byPrevious]=await Promise.all([ask({startDate:w.previousStart,endDate:w.end,dimensions:['date']}),ask({startDate:w.start,endDate:w.end,dimensions:dims}),ask({startDate:w.previousStart,endDate:w.previousEnd,dimensions:dims})]);
  const dayRows=byDate.map(r=>({date:r.keys[0],clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,position:Number(r.position)||0}));
  const pairsOf=list=>list.map(r=>dims.length===2?{keyword:r.keys[0],page:r.keys[1],clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,position:Number(r.position)||0}:{keyword:'',page:r.keys[0],clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,position:Number(r.position)||0});
  const rows=pairsOf(byPair),previousRows=pairsOf(byPrevious);
  // Search Console leaves out days with no data at all, so coverage is judged from the synced days, not from these rows.
  const by=new Map(dayRows.map(r=>[r.date,r])),fill=(a,b)=>{const out=[];for(let d=a;d<=b;d=add(d,1))if(base.has(d))out.push(by.get(d)||{date:d,clicks:0,impressions:0,position:0});return out;};
  const cur=fill(w.start,w.end),prev=fill(w.previousStart,w.previousEnd),complete=cur.length===days(w.start,w.end),previousComplete=prev.length===days(w.previousStart,w.previousEnd);
  const trend=trendOf(w,d=>base.has(d)?by.get(d)||{clicks:0,impressions:0,position:0}:null);
  return {complete,previousComplete,totals:sp.totals(cur),previous:previousComplete?sp.totals(prev):null,trend,striking:NO_QUERY.has(type)?[]:sp.striking(rows),queries:NO_QUERY.has(type)?null:sp.dimension(rows,'query'),pages:sp.dimension(rows,'page'),
   movers:previousComplete?{query:NO_QUERY.has(type)?null:sp.movers(rows,previousRows,'query'),page:sp.movers(rows,previousRows,'page')}:null,pairDays:cur.length,live:true};}
 // 搜索表现 page: totals, daily trend and the three tables for one window, read from the synced partitions.
 // Rebuilt only when the snapshot (i.e. synced data) or the request changes; the last few results are kept.
 // 搜索表现. Building it reads every synced day and takes seconds, so a built report is kept in memory and saved in
 // nrSnapshots (search-view:<id>) under the key of the synced data: after a restart or in a new browser it is read back
 // at once until new data lands (the sync tick then builds the 28-day view right away). 初步 days are read each time.
 async search(id,v){let link,snapKey;try{[link,{key:snapKey}]=await Promise.all([this.p.sync.link(id),this.p.sync.snapshotKey(id)]);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  const filters={queryFilter:sp.readFilter(v.queryFilter),pageFilter:sp.readFilter(v.pageFilter)},country=/^[a-z]{3}$/.test(String(v.country||''))?String(v.country):null,type=searchType(v.type);
  // The last element is the report's shape: bump it when the report gains a part (2: search types, 涨跌, ctr and position per day).
  const key=JSON.stringify([snapKey,String(v.range||'28'),String(v.from||''),String(v.to||''),filters,country,type,2]);this.searchCache=this.searchCache||new Map();
  let value=this.searchCache.get(key)||await this.savedView(id,'search',key);
  if(!value){value=await this.buildSearch(id,v,link,filters,country,type);if(value.connected===false)return value;this.remember(key,value);await this.saveView(id,'search',key,value);}else this.remember(key,value);
  const preliminary=value.cutoff&&!value.filtered&&!value.country&&!value.live&&value.window?.end===value.cutoff?await this.fresh(id,'gsc',value.cutoff):[];
  return {...value,preliminary};}
 remember(key,value){this.searchCache.delete(key);this.searchCache.set(key,value);if(this.searchCache.size>12)this.searchCache.delete(this.searchCache.keys().next().value);}
 async savedView(id,kind,key){try{const row=await this.p.db.getRepository('nrSnapshots').findOne({filter:{key:`${kind}-view:${id}`}});return (row?.get('payload')?.entries||[]).find(e=>e.key===key)?.value||null;}catch{return null;}}
 // At most six reports per project and page, all for the current synced data.
 async saveView(id,kind,key,value){try{const r=this.p.db.getRepository('nrSnapshots'),row=await r.findOne({filter:{key:`${kind}-view:${id}`}}),snap=JSON.parse(key)[0];
  const entries=[{key,value},...(row?.get('payload')?.entries||[]).filter(e=>e.key!==key&&JSON.parse(e.key)[0]===snap)].slice(0,6);
  if(row)await r.update({filterByTk:row.id,values:{payload:{entries}}});else await r.create({values:{key:`${kind}-view:${id}`,payload:{entries}}});}catch{/* the report still shows */}}
 async buildSearch(id,v,link,filters,country,type='web'){let snaps;try{snaps=await this.p.sync.snapshots(id);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  const daily=snaps.find(s=>s.key==='history-search')?.payload||[],cutoff=daily.map(r=>r.date).sort().at(-1);if(!cutoff)return {connected:true,cutoff:null};
  const w=windowFor(cutoff,String(v.range||'28'),v.from,v.to),filtered=Boolean(filters.queryFilter||filters.pageFilter),site=link.get('gscSiteUrl');
  if(country||type!=='web'){let live;try{live=await this.searchLive(id,site,w,{type,country,filters},new Set(daily.map(r=>r.date)));}catch(e){fail(e.code==='invalid_grant'?systemMessageText('dataViews.googleAuthorizationExpiredAuthorizeAgain'):systemMessageText('dataViews.notReadSearchConsoleData'),502);}
   return {connected:true,cutoff,from:firstDate(daily),window:w,filtered,filters,country,type,noQueries:NO_QUERY.has(type),noPosition:NO_QUERY.has(type),...live};}
  const parts=await this.p.db.getRepository('nrSyncPartitions').find({filter:{projectId:id,source:'gsc',grain:'query_page',resource:site,date:partitionDates(w.previousStart,w.end)},fields:['date','payload']});
  const byDate=new Map(parts.map(r=>[r.get('date'),r.get('payload')||[]]));
  // Filtered views sum the query × page rows per day; unfiltered ones use the date-only rows, which include anonymised queries.
  const dayRows=filtered?[...byDate].map(([date,rows])=>({date,...sp.totals(sp.pairs([rows],filters))})):daily;
  const inWin=(a,b)=>dayRows.filter(r=>r.date>=a&&r.date<=b),cur=inWin(w.start,w.end),prev=inWin(w.previousStart,w.previousEnd);
  const complete=cur.length===days(w.start,w.end),previousComplete=prev.length===days(w.previousStart,w.previousEnd);
  const by=new Map(dayRows.map(r=>[r.date,r])),trend=trendOf(w,d=>by.get(d)||null);
  const span=(a,b)=>[...byDate].filter(([d])=>d>=a&&d<=b),rows=sp.pairs(span(w.start,w.end).map(([,r])=>r),filters),before=span(w.previousStart,w.previousEnd);
  // 涨跌 compares the query × page rows of both periods, so only when the period before is fully synced.
  const movers=before.length===days(w.previousStart,w.previousEnd)?(()=>{const previousRows=sp.pairs(before.map(([,r])=>r),filters);return {query:sp.movers(rows,previousRows,'query'),page:sp.movers(rows,previousRows,'page')};})():null;
  return {connected:true,cutoff,from:firstDate(daily),window:w,filtered,filters,country:null,type,complete,previousComplete,totals:sp.totals(cur),previous:previousComplete?sp.totals(prev):null,trend,striking:sp.striking(rows),queries:sp.dimension(rows,'query'),pages:sp.dimension(rows,'page'),movers,pairDays:span(w.start,w.end).length};}
 // 访问 (GA4): saved like 搜索表现, under the synced data and the business day (the line runs on to yesterday), so GA4
 // is asked once a day per range; the sync tick builds the 28-day one.
 async website(id,v){let link,snapKey;try{[link,{key:snapKey}]=await Promise.all([this.p.sync.link(id),this.p.sync.snapshotKey(id)]);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  // The last element is the view's shape: bump it when the period report gains a part, so a view saved earlier today is
  // not served without it (v2: `changes`, for where a figure's change came from; v3: pages in `changes` merged by path).
  const range=WEB_RANGES.includes(String(v.range))?String(v.range):'28',key=JSON.stringify([snapKey,range,iso(businessNow(this.p,id,'google')),3]);this.webCache=this.webCache||new Map();
  let value=this.webCache.get(key)||await this.savedView(id,'website',key);
  if(!value){let snaps;try{snaps=await this.p.sync.snapshots(id);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}value=await websiteView(snaps,range,w=>this.ga4.period(id,link.get('ga4PropertyId'),w));if(value.cutoff&&!value.missing?.length)await this.saveView(id,'website',key,value);}
  this.webCache.set(key,value);if(this.webCache.size>8)this.webCache.delete(this.webCache.keys().next().value);
  return value;}
 // 访问 · one row's days (its detail), 今天 and 实时: read from GA4 when asked (website-report.ts keeps each a while).
 async websiteRow(id,v){let link,snaps;try{[link,snaps]=await Promise.all([this.p.sync.link(id),this.p.sync.snapshots(id)]);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  const get=k=>snaps.find(s=>s.key===k)?.payload,end=get('project')?.end||(get('history-web')||[]).map(r=>r.date).sort().at(-1);if(!end)return {connected:true,cutoff:null};
  const range=WEB_RANGES.includes(String(v.range))?String(v.range):'28',w=windowFor(end,range);
  return {connected:true,cutoff:end,window:w,...await this.ga4.row(id,link.get('ga4PropertyId'),w,{table:String(v.table||''),dims:v.dims&&typeof v.dims==='object'?v.dims:{}})};}
 async websiteToday(id){let link;try{link=await this.p.sync.link(id);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}return {connected:true,...await this.ga4.today(id,link.get('ga4PropertyId'))};}
 async websiteRealtime(id){let link;try{link=await this.p.sync.link(id);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}return {connected:true,...await this.ga4.realtime(id,link.get('ga4PropertyId'))};}
 // Countries for the country filter: a live Search Console query, asked for on its own (the page does not wait for it)
 // and kept six hours per window.
 async searchCountries(id,v){const date=/^\d{4}-\d{2}-\d{2}$/;if(!date.test(String(v.start||''))||!date.test(String(v.end||'')))fail(systemMessageText('dataViews.invalidDate'));let site;try{site=(await this.p.sync.link(id)).get('gscSiteUrl');}catch(e){if(googleDisconnected(e))return {countries:[]};throw e;}
  const key=JSON.stringify([id,site,v.start,v.end]);this.countryCache=this.countryCache||new Map();const hit=this.countryCache.get(key);if(hit&&Date.now()-hit.at<6*3600000)return {countries:hit.value};
  const value=await this.countries(id,site,{start:v.start,end:v.end});if(value.length)this.countryCache.set(key,{at:Date.now(),value});return {countries:value};}
 // 搜索表现 · 细分: countries, devices and search appearances of the report's window and the period before, read from
 // Search Console when the page asks (the synced rows keep none) and kept six hours.
 async searchBreakdown(id,v){const w=liveWindow(v);let site;try{site=(await this.p.sync.link(id)).get('gscSiteUrl');}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  const type=searchType(v.type),filters={queryFilter:sp.readFilter(v.queryFilter),pageFilter:sp.readFilter(v.pageFilter)},country=/^[a-z]{3}$/.test(String(v.country||''))?String(v.country):null;
  const key=JSON.stringify(['breakdown',id,site,w,type,filters,country]);this.liveCache=this.liveCache||new Map();const hit=this.liveCache.get(key);if(hit&&Date.now()-hit.at<6*3600000)return hit.value;
  const groups=liveGroups(type,country,filters);let failure=null;
  const read=async(dimension,a,b)=>{try{return (await this.gscQuery(id,site,{type,startDate:a,endDate:b,dimensions:[dimension],rowLimit:1000,...(groups.length?{dimensionFilterGroups:groups}:{})})).map(r=>({key:String(r.keys?.[0]||''),clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,position:Number(r.position)||0})).filter(r=>r.key);}catch(e){failure=failure||e;return null;}};
  const part=async dimension=>{const [cur,prev]=await Promise.all([read(dimension,w.start,w.end),read(dimension,w.previousStart,w.previousEnd)]);if(!cur)return null;const before=new Map((prev||[]).map(r=>[r.key,r]));
   return cur.map(r=>({...r,ctr:r.impressions?r.clicks/r.impressions:0,previousClicks:prev?before.get(r.key)?.clicks??0:null,previousImpressions:prev?before.get(r.key)?.impressions??0:null})).sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions);};
  const [countries,devices,appearances]=await Promise.all(['country','device','searchAppearance'].map(part));
  if(!countries&&!devices&&!appearances)fail(failure?.code==='invalid_grant'?systemMessageText('dataViews.googleAuthorizationExpiredAuthorizeAgain'):systemMessageText('dataViews.notReadSearchConsoleData'),502);
  const value={connected:true,type,countries,devices,appearances};this.liveCache.set(key,{at:Date.now(),value});if(this.liveCache.size>40)this.liveCache.delete(this.liveCache.keys().next().value);
  return value;}
 // 搜索表现 · one query or page: its days against the period before, and the pages it shows with (or the queries a page
 // shows for), read from Search Console when its row is opened and kept six hours.
 async searchRow(id,v){const w=liveWindow(v),dimension=v.dimension==='page'?'page':'query',k=String(v.key||'').slice(0,4096),type=searchType(v.type),country=/^[a-z]{3}$/.test(String(v.country||''))?String(v.country):null;
  if(!k||(dimension==='query'&&NO_QUERY.has(type)))fail(systemMessageText('dataViews.notReadSearchConsoleData'),400);
  let site;try{site=(await this.p.sync.link(id)).get('gscSiteUrl');}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  const key=JSON.stringify(['row',id,site,w,type,dimension,k,country]);this.liveCache=this.liveCache||new Map();const hit=this.liveCache.get(key);if(hit&&Date.now()-hit.at<6*3600000)return hit.value;
  const groups=[{filters:[{dimension,operator:'equals',expression:k},...(country?[{dimension:'country',operator:'equals',expression:country}]:[])]}],other=dimension==='query'?'page':'query',ask=body=>this.gscQuery(id,site,{type,...body,dimensionFilterGroups:groups});
  let byDate,related;try{[byDate,related]=await Promise.all([ask({startDate:w.previousStart,endDate:w.end,dimensions:['date']}),other==='query'&&NO_QUERY.has(type)?Promise.resolve([]):ask({startDate:w.start,endDate:w.end,dimensions:[other],rowLimit:1000})]);}
  catch(e){fail(e.code==='invalid_grant'?systemMessageText('dataViews.googleAuthorizationExpiredAuthorizeAgain'):systemMessageText('dataViews.notReadSearchConsoleData'),502);}
  // Search Console leaves out days without impressions.
  const by=new Map(byDate.map(r=>[r.keys[0],{clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,position:Number(r.position)||0}]));
  const value={connected:true,type,dimension,key:k,trend:trendOf(w,d=>by.get(d)||{clicks:0,impressions:0,position:0}),
   related:related.map(r=>({key:String(r.keys?.[0]||''),clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,ctr:r.impressions?(Number(r.clicks)||0)/Number(r.impressions):0,position:Number(r.position)||0})).filter(r=>r.key).sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions).slice(0,100)};
  this.liveCache.set(key,{at:Date.now(),value});if(this.liveCache.size>40)this.liveCache.delete(this.liveCache.keys().next().value);
  return value;}
 // 本站排名 for up to 1000 keywords over the last 28 synced days of Search Console query × page rows.
 async ranks(id,v){let snaps,link;try{[snaps,link]=await Promise.all([this.p.sync.snapshots(id),this.p.sync.link(id)]);}catch(e){if(googleDisconnected(e))return {connected:false,ranks:{}};throw e;}
  const daily=snaps.find(s=>s.key==='history-search')?.payload||[],cutoff=daily.map(r=>r.date).sort().at(-1);if(!cutoff)return {connected:true,cutoff:null,ranks:{}};
  const w=windowFor(cutoff,'28'),site=link.get('gscSiteUrl'),keywords=(Array.isArray(v.keywords)?v.keywords:[]).map(String).slice(0,1000);
  const key=JSON.stringify([id,site,w.start]);this.rankCache=this.rankCache||new Map();let hit=this.rankCache.get(key);
  if(!hit||hit.snaps!==snaps){const parts=await this.p.db.getRepository('nrSyncPartitions').find({filter:{projectId:id,source:'gsc',grain:'query_page',resource:site,date:partitionDates(w.start,w.end)},fields:['date','payload']});hit={snaps,rows:sp.pairs(parts.map(r=>r.get('payload')||[]))};this.rankCache.clear();this.rankCache.set(key,hit);}
  return {connected:true,cutoff,window:{start:w.start,end:w.end},ranks:sp.ranks(hit.rows,keywords)};}
 // One page of 内容 (SPEC §5 内容 详情): its daily search clicks and impressions (Search Console query × page rows) and
 // views (GA4 page rows) over the range; pages match by host and path, ignoring www and a trailing slash.
 // 页面: every page's visits (GA4 page partitions) and search clicks and impressions (Search Console query × page
 // partitions) for the period and the one before it, summed from every synced day rather than the snapshots' top-page
 // samples. Pages are host and path; GA4 rows synced before hosts were kept have host ''. Search Console counts leave out
 // anonymised queries. Built once per synced data and range, and saved like 搜索表现.
 async pageFigures(id,range){let link,snapKey;try{[link,{key:snapKey}]=await Promise.all([this.p.sync.link(id),this.p.sync.snapshotKey(id)]);}catch(e){if(googleDisconnected(e))return null;throw e;}
  const key=JSON.stringify([snapKey,String(range),1]);this.figureCache=this.figureCache||new Map();
  let value=this.figureCache.get(key)||await this.savedView(id,'page-figures',key);
  if(!value){value=await this.buildPageFigures(id,String(range),link);if(!value)return null;await this.saveView(id,'page-figures',key,value);}
  this.figureCache.delete(key);this.figureCache.set(key,value);if(this.figureCache.size>6)this.figureCache.delete(this.figureCache.keys().next().value);
  return value;}
 async buildPageFigures(id,range,link){const snaps=await this.p.sync.snapshots(id),end=snaps.find(s=>s.key==='project')?.payload?.end;if(!end)return null;
  const w=windowFor(end,range),repo=this.p.db.getRepository('nrSyncPartitions'),dates=partitionDates(w.previousStart,w.end);
  const read=(source,grain,resource)=>resource?repo.find({filter:{projectId:id,source,grain,resource,date:dates},fields:['date','payload']}):Promise.resolve([]);
  const [gscParts,ga4Parts]=await Promise.all([read('gsc','query_page',link.get('gscSiteUrl')),read('ga4','page',link.get('ga4PropertyId'))]);
  const dayOf=v=>v instanceof Date?v.toISOString().slice(0,10):String(v||'').slice(0,10);
  const period=d=>d>=w.start&&d<=w.end?'current':d>=w.previousStart&&d<=w.previousEnd?'previous':null;
  const pathOf=v=>String(v||'').split(/[?#]/)[0].replace(/\/+$/,'')||'/',hostOf=v=>String(v||'').toLowerCase().replace(/^www\./,'');
  const days={gsc:{current:0,previous:0},ga4:{current:0,previous:0}},search=new Map(),web=new Map();
  const entry=(m,host,path,zero)=>{const k=`${host}|${path}`;let o=m.get(k);if(!o){o={host,path,current:{...zero},previous:{...zero}};m.set(k,o);}return o;};
  for(const r of gscParts){const p=period(dayOf(r.get('date')));if(!p)continue;days.gsc[p]++;
   for(const x of r.get('payload')||[]){let u;try{u=new URL(x.page);}catch{continue;}const o=entry(search,hostOf(u.hostname),pathOf(u.pathname),{clicks:0,impressions:0})[p];o.clicks+=Number(x.clicks)||0;o.impressions+=Number(x.impressions)||0;}}
  for(const r of ga4Parts){const p=period(dayOf(r.get('date')));if(!p)continue;days.ga4[p]++;
   for(const x of r.get('payload')||[]){if(!String(x.page||'').startsWith('/'))continue;entry(web,hostOf(x.host),pathOf(x.page),{views:0})[p].views+=Number(x.views)||0;}}
  return {window:w,days,search:[...search.values()],web:[...web.values()]};}
 async page(id,v){const key=pageKey(v.url);if(!key)fail(systemMessageText('dataViews.providePageUrl'));let snaps,link;try{[snaps,link]=await Promise.all([this.p.sync.snapshots(id),this.p.sync.link(id)]);}catch(e){if(googleDisconnected(e))return {connected:false};throw e;}
  const get=k=>snaps.find(s=>s.key===k)?.payload||[],last=rows=>rows.map(r=>r.date).sort().at(-1)||null,gscEnd=last(get('history-search')),ga4End=last(get('history-web')),end=[gscEnd,ga4End].filter(Boolean).sort().at(-1);if(!end)return {connected:true,window:null};
  const w=windowFor(end,String(v.range||'90'),v.from,v.to),path=key.slice(key.indexOf('/')),repo=this.p.db.getRepository('nrSyncPartitions');
  const read=(source,grain,resource)=>repo.find({filter:{projectId:id,source,grain,resource,date:partitionDates(w.start,w.end)},fields:['date','payload']});
  const [gscParts,ga4Parts]=await Promise.all([gscEnd?read('gsc','query_page',link.get('gscSiteUrl')):[],ga4End?read('ga4','page',link.get('ga4PropertyId')):[]]);
  const byDay=new Map();const day=d=>{let o=byDay.get(d);if(!o){o={date:d};byDay.set(d,o);}return o;};
  for(const r of gscParts){const o=day(r.get('date'));o.clicks=0;o.impressions=0;for(const x of r.get('payload')||[])if(pageKey(x.page)===key){o.clicks+=Number(x.clicks)||0;o.impressions+=Number(x.impressions)||0;}}
  const norm=p=>String(p||'').split('?')[0].replace(/\/+$/,'')||'/';
  for(const r of ga4Parts){const o=day(r.get('date'));o.views=0;for(const x of r.get('payload')||[])if(norm(x.page)===norm(path))o.views+=Number(x.views)||0;}
  const daily=[];for(let d=w.start;d<=w.end;d=add(d,1))daily.push(byDay.get(d)||{date:d});
  return {connected:true,window:w,gscCutoff:gscEnd,ga4Cutoff:ga4End,daily};}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('dataViews.notLoadDataTryAgain'));}};
  this.p.app.resourceManager.define({name:'nrDataViews',actions:{overview:wrap((id,v)=>this.overview(id,v)),search:wrap((id,v)=>this.search(id,v)),website:wrap((id,v)=>this.website(id,v)),websiteRow:wrap((id,v)=>this.websiteRow(id,v)),websiteToday:wrap(id=>this.websiteToday(id)),websiteRealtime:wrap(id=>this.websiteRealtime(id)),searchCountries:wrap((id,v)=>this.searchCountries(id,v)),searchBreakdown:wrap((id,v)=>this.searchBreakdown(id,v)),searchRow:wrap((id,v)=>this.searchRow(id,v)),ranks:wrap((id,v)=>this.ranks(id,v)),page:wrap((id,v)=>this.page(id,v)),github:wrap((id,v)=>this.github(id,v)),community:wrap((id,v)=>this.community(id,v)),downloads:wrap((id,v)=>this.downloads(id,v)),hackernews:wrap((id,v)=>this.hackernews(id,v))}});this.p.app.acl.allow('nrDataViews',['overview','search','website','websiteRow','websiteToday','websiteRealtime','searchCountries','searchBreakdown','searchRow','ranks','page','github','community','downloads','hackernews'],'loggedIn');}
}
export { websiteView, withFresh, redditCard, DataViews, packagesCard, hackernewsCard, windowFor, metric, series, netChange, starRows, githubCard, communityCard, contentCard, gscCard };
