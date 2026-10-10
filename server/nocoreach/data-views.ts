// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import * as sp from './search-performance.js';
import * as pkgs from './packages-source.js';
import * as hnSource from './hackernews-source.js';
import * as __google_client from './google-client.js';
// Data views (SPEC §5 数据分析): one time range across all connected sources; each source keeps its own cutoff.
const DAY=86400000;
const iso=t=>new Date(t).toISOString().slice(0,10);
const add=(d,n)=>iso(Date.parse(d+'T00:00:00Z')+n*DAY);
const days=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/DAY)+1;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
// Same page identity as task effects: host without www, path without a trailing slash.
const pageKey=u=>{try{const x=new URL(u);return `${x.host.toLowerCase().replace(/^www\./,'')}${x.pathname.replace(/\/+$/,'')||'/'}`;}catch{return '';}};
const RANGES=['7','28','90','3m','6m','12m','16m'],WEB_RANGES=['7','28','90','3m','12m'];
// Same window rules as the Portal period helper: N days ending at the cutoff, or calendar months back from it.
function windowFor(end,range,from,to){if(range==='custom'){if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||from>to)fail('请选择有效的起止日期');const n=days(from,to);if(n>490)fail('自定义范围最长 16 个月');const e=to<end?to:end;return {start:from,end:e,days:n,previousStart:add(from,-n),previousEnd:add(from,-1)};}
 if(!RANGES.includes(String(range)))fail('不支持的时间范围');let start;if(range.endsWith('m')){const s=new Date(Date.parse(end+'T00:00:00Z')+DAY);const d=s.getUTCDate();s.setUTCDate(1);s.setUTCMonth(s.getUTCMonth()-parseInt(range));s.setUTCDate(Math.min(d,new Date(Date.UTC(s.getUTCFullYear(),s.getUTCMonth()+1,0)).getUTCDate()));start=iso(s);}else start=add(end,1-Number(range));const n=days(start,end);return {start,end,days:n,previousStart:add(start,-n),previousEnd:add(start,-1)};}
// Sums need every day of the window present; otherwise the value is shown with its coverage, never as a comparison.
function metric(rows,field,w){const inWin=(a,b)=>rows.filter(r=>r.date>=a&&r.date<=b&&Number.isFinite(r[field]));const cur=inWin(w.start,w.end),prev=inWin(w.previousStart,w.previousEnd);const sum=l=>l.reduce((s,r)=>s+r[field],0);const complete=cur.length===days(w.start,w.end),prevComplete=prev.length===days(w.previousStart,w.previousEnd);const value=cur.length?sum(cur):null,previous=prevComplete?sum(prev):null;return {value,previous,complete,change:complete&&previous?(value-previous)/previous:null};}
function series(rows,field,w){const by=new Map(rows.map(r=>[r.date,r[field]]));const out=[];for(let d=w.start;d<=w.end;d=add(d,1))out.push({date:d,value:by.has(d)&&Number.isFinite(by.get(d))?by.get(d):null});return out;}
// 访问 from the built snapshots: the window ends at the project cutoff, like the pre-summed sources and pages.
function websiteView(snaps,range){const get=k=>snaps.find(s=>s.key===k)?.payload,web=get('history-web')||[],end=get('project')?.end||web.map(r=>r.date).sort().at(-1);if(!end||!web.length)return {connected:true,cutoff:null};
 const w=windowFor(end,range),inWin=(a,b)=>web.filter(r=>r.date>=a&&r.date<=b),cur=inWin(w.start,w.end),prev=inWin(w.previousStart,w.previousEnd);
 const avg=(l,k)=>{const x=l.filter(r=>Number.isFinite(r[k]));return x.length?Math.round(x.reduce((n,r)=>n+r[k],0)/x.length):null;},complete=cur.length===w.days,prevComplete=prev.length===w.days;
 const uv={key:'uv',label:'日均访客',value:avg(cur,'uv'),previous:prevComplete?avg(prev,'uv'):null,complete,change:null};if(complete&&uv.value!==null&&uv.previous)uv.change=(uv.value-uv.previous)/uv.previous;
 const kpis=[{key:'views',label:'浏览量',...metric(web,'views',w)},{key:'sessions',label:'会话',...metric(web,'sessions',w)},uv,{key:'conversions',label:'关键事件',...metric(web,'conversions',w)}];
 const by=new Map(web.map(r=>[r.date,r])),trend=[];for(let d=w.start,i=0;d<=w.end;d=add(d,1),i++){const now=by.get(d),before=by.get(add(w.previousStart,i));trend.push({date:d,views:now?.views??null,uv:now?.uv??null,previousDate:add(w.previousStart,i),previousViews:before?.views??null});}
 const total=cur.reduce((n,r)=>n+(r.views||0),0),share=x=>total?x/total:null;
 const pathOf=u=>{try{return new URL(u).pathname.replace(/\/+$/,'')||'/';}catch{return String(u||'').split('?')[0].replace(/\/+$/,'')||'/';}};
 const queries=new Map();for(const q of get(`queries-${range}`)||[]){const k=pathOf(q.page);if(!queries.has(k))queries.set(k,[]);queries.get(k).push({keyword:q.keyword,clicks:q.clicks,impressions:q.impressions,position:q.position});}
 const sources=(get(`sources-${range}`)||[]).map(s=>({source:s.source||'(direct)',medium:s.medium||'',views:s.views,sessions:s.sessions||0,conversions:s.conversions||0,share:share(s.views)}));
 const pages=(get(`pages-${range}`)||[]).map(p=>({page:p.page||'',views:p.views,conversions:p.conversions||0,share:share(p.views),queries:(queries.get(pathOf(p.page))||[]).sort((a,b)=>b.impressions-a.impressions).slice(0,8)}));
 const reddit=get('history-reddit-referral')||[],rsum=(a,b,k)=>reddit.filter(r=>r.date>=a&&r.date<=b).reduce((n,r)=>n+(r[k]||0),0),redditOn=reddit.some(r=>r.sessions||r.views);
 return {connected:true,cutoff:end,from:firstDate(web),window:w,complete,kpis,trend,sources,pages,
  reddit:redditOn?{sessions:rsum(w.start,w.end,'sessions'),views:rsum(w.start,w.end,'views'),conversions:rsum(w.start,w.end,'conversions'),previous:prevComplete?rsum(w.previousStart,w.previousEnd,'sessions'):null}:null,
  notes:[...(complete?[]:['所选时间有几天没有同步到数据，数字只算已记录的日子，不把缺的当作零']),'来源前 40 个、页面前 60 个，按浏览量排序；明细合计不等于全站总量','关键事件沿用 GA4 里的定义，不等于成交']};}
function firstDate(rows){return rows.map(r=>r.date).sort()[0]||null;}
// Stars are cumulative samples: net change between the last sample on or before each end; missing ends give null.
function sampleAt(daily,date){const d=Object.keys(daily||{}).filter(x=>x<=date).sort().at(-1);return d?{date:d,...daily[d]}:null;}
// Backfilled days have no fork count; a difference is only taken between two real numbers.
const diff=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?a-b:null;
function starRows(daily){const dates=Object.keys(daily||{}).sort();return dates.slice(1).map((d,i)=>({date:d,stars:diff(daily[d].stars,daily[dates[i]].stars),forks:diff(daily[d].forks,daily[dates[i]].forks)}));}
function netChange(daily,field,a,b){const end=sampleAt(daily,b),base=sampleAt(daily,add(a,-1));if(!end||!base||base.date!==add(a,-1))return null;return diff(end[field],base[field]);}
// CTR and position are ratios of the window sums (position weighted by impressions); compared only when both windows are complete.
function ratios(rows,w){const sum=(a,b)=>{const l=rows.filter(r=>r.date>=a&&r.date<=b&&Number.isFinite(r.impressions));return {n:l.length,...sp.totals(l)};};const c=sum(w.start,w.end),p=sum(w.previousStart,w.previousEnd),complete=c.n===days(w.start,w.end),prevComplete=p.n===days(w.previousStart,w.previousEnd);
 const m=(key,label,f,extra)=>{const value=c.impressions?f(c):null,previous=prevComplete&&p.impressions?f(p):null;return {key,label,value,previous,complete,change:complete&&value!==null&&previous?(value-previous)/previous:null,...extra};};
 return [m('ctr','点击率',x=>x.ctr,{format:'percent'}),m('position','平均排名',x=>x.position,{format:'decimal',lowerIsBetter:true})];}
// 初步数据 after a Google card's cutoff: the days and their sums, shown under the card and never added to its numbers.
function withFresh(card,rows,keys){if(!rows.length)return card;return {...card,preliminary:{from:rows[0].date,through:rows.at(-1).date,days:rows.length,totals:Object.fromEntries(keys.map(k=>[k,rows.reduce((n,r)=>n+(Number(r[k])||0),0)]))}};}
function gscCard(rows,end,w){if(!rows.length)return null;const clicks=metric(rows,'clicks',w),imp=metric(rows,'impressions',w);return {id:'gsc',cutoff:end,from:firstDate(rows),window:w,metrics:[{key:'clicks',label:'点击',...clicks},{key:'impressions',label:'曝光',...imp},...ratios(rows,w)],series:series(rows,'clicks',w),seriesBy:{clicks:series(rows,'clicks',w),impressions:series(rows,'impressions',w)}};}
function ga4Card(rows,end,w){if(!rows.length)return null;return {id:'ga4',cutoff:end,from:firstDate(rows),window:w,metrics:[{key:'sessions',label:'访问',...metric(rows,'sessions',w)},{key:'views',label:'浏览',...metric(rows,'views',w)},{key:'conversions',label:'关键事件',...metric(rows,'conversions',w)}],series:series(rows,'sessions',w),seriesBy:{sessions:series(rows,'sessions',w),views:series(rows,'views',w),conversions:series(rows,'conversions',w)}};}
function githubCard(gh,w){if(!gh?.repo||gh.status==='disconnected')return null;const dates=Object.keys(gh.daily||{}).sort();const net=netChange(gh.daily,'stars',w.start,w.end),prevNet=netChange(gh.daily,'stars',w.previousStart,w.previousEnd);const views=Object.entries(gh.traffic?.views||{}).map(([date,v])=>({date,views:v.count,uniques:v.uniques}));const v=views.length?metric(views,'views',w):null;
 const notes=[];if(!dates.length||dates[0]>add(w.start,-1))notes.push(`Star 记录从 ${dates[0]||'今天'} 开始${gh.starHistory?.complete?'':'；接入 token 后可补全历史'}`);if(!gh.token)notes.push('接入 Traffic 后可看到仓库浏览与来源网站');else if(gh.traffic?.since&&gh.traffic.since>w.start)notes.push(`仓库浏览从 ${gh.traffic.since} 开始归档`);
 return {id:'github',cutoff:dates.at(-1)||null,from:dates[0]||null,window:w,title:gh.repo,metrics:[{key:'stars',label:'新增 Star',value:net,previous:prevNet,complete:net!==null,change:net!==null&&prevNet?(net-prevNet)/prevNet:null},{key:'total',label:'Star 总数',value:sampleAt(gh.daily,w.end)?.stars??null,previous:null,complete:true,change:null},...(v?[{key:'views',label:'仓库浏览',...v}]:[])],series:series(starRows(gh.daily),'stars',w),notes};}
function communityCard(cm,w){if(!cm?.origin||cm.status==='disconnected')return null;const by=new Map();for(const t of Object.values(cm.topics||{})){const d=String(t.createdAt).slice(0,10);const o=by.get(d)||{date:d,topics:0,replies:0,unanswered:0};o.topics++;o.replies+=t.replies||0;if(!t.replies)o.unanswered++;by.set(d,o);}
 const retainedFrom=cm.retainedFrom||add(iso(Date.now()),-90);const rows=[];for(let d=retainedFrom;d<=add(iso(Date.now()),-1);d=add(d,1))rows.push(by.get(d)||{date:d,topics:0,replies:0,unanswered:0});
 const notes=retainedFrom>w.start?[`社区数据从 ${retainedFrom} 开始`]:[];return {id:'discourse',cutoff:add(iso(Date.now()),-1),from:retainedFrom,window:w,title:cm.title,metrics:[{key:'topics',label:'新主题',...metric(rows,'topics',w)},{key:'replies',label:'回复',...metric(rows,'replies',w)},{key:'unanswered',label:'无人回复',...metric(rows,'unanswered',w),change:null}],series:series(rows,'topics',w),notes};}
function contentCard(site,w,now){if(!site?.pages?.length)return null;const lm=p=>p.lastmod?String(p.lastmod).slice(0,10):null;const updated=site.pages.filter(p=>lm(p)&&lm(p)>=w.start&&lm(p)<=w.end).length,stale=site.pages.filter(p=>lm(p)&&Date.parse(lm(p))<now-365*DAY).length,unknown=site.pages.filter(p=>!lm(p)).length;
 return {id:'site',cutoff:null,from:null,window:w,title:`${site.sites?.length||1} 个网址`,metrics:[{key:'pages',label:'页面总数',value:site.pages.length,previous:null,complete:true,change:null},{key:'updated',label:'本期更新',value:updated,previous:null,complete:true,change:null},{key:'stale',label:'超过一年未更新',value:stale,previous:null,complete:true,change:null}],series:[],notes:unknown?[`${unknown} 个页面没有提供更新时间`]:[]};}
// 下载量: npm + PyPI downloads per day (complete days only) and the Docker Hub pulls gained between daily samples.
function packagesCard(state,w){if(!state?.packages?.length)return null;const rows=pkgs.downloadRows(state),samples=pkgs.pullSamples(state),metrics=[],notes=[];
 if(rows.length)metrics.push({key:'downloads',label:'下载量',...metric(rows,'downloads',w)});else if(state.packages.some(p=>p.registry!=='docker'))notes.push('下载量还在第一次同步');
 if(state.packages.some(p=>p.registry==='docker')){const net=netChange(samples,'pulls',w.start,w.end),prev=netChange(samples,'pulls',w.previousStart,w.previousEnd);metrics.push({key:'pulls',label:'Docker 拉取',value:net,previous:prev,complete:net!==null,change:net!==null&&prev?(net-prev)/prev:null});const first=Object.keys(samples).sort()[0];if(!first||first>add(w.start,-1))notes.push(`Docker 拉取从 ${first||'今天'} 开始每天记录，之前的增长看不到`);}
 const pypi=state.packages.filter(p=>p.registry==='pypi');if(pypi.length&&w.previousStart<add(iso(Date.now()),-180))notes.push('PyPI 只提供最近 180 天的下载量');
 return {id:'packages',cutoff:rows.at(-1)?.date||null,from:rows[0]?.date||null,window:w,title:state.packages.map(p=>p.title||p.name).slice(0,3).join('、')+(state.packages.length>3?` 等 ${state.packages.length} 个`:''),metrics,series:series(rows,'downloads',w),notes};}
// Hacker News 提及 (catalog id mentions): stories and comments per day from the day coverage starts; points are the stories' latest counts.
function hackernewsCard(state,w){if(!state?.terms?.length||state.status==='disconnected')return null;const rows=hnSource.dailyRows(state),notes=[];if(!state.retainedFrom)notes.push('正在第一次读取');else if(state.retainedFrom>w.start)notes.push(`提及从 ${state.retainedFrom} 开始记录`);
 const top=Object.values(state.mentions||{}).filter(m=>m.type==='story'&&m.createdAt.slice(0,10)>=w.start&&m.createdAt.slice(0,10)<=w.end).sort((a,b)=>b.points-a.points)[0];if(top)notes.push(`最热：${top.title}（${top.points} 分）`);
 return {id:'mentions',cutoff:rows.at(-1)?.date||null,from:state.retainedFrom||null,window:w,title:state.terms.join('、'),metrics:[{key:'mentions',label:'提及',...metric(rows,'mentions',w)},{key:'stories',label:'帖子',...metric(rows,'stories',w)}],series:series(rows,'mentions',w),notes};}
// Reddit 讨论: threads first seen per day from the day finding started (found weekly through Google). Counted the same way
// as the Reddit page (2026-10-08, the card read 0 while the page listed posts): every thread first seen in the range,
// including those of the first search; the change shows only once the range is fully covered.
function redditCard(state,w){if(!state?.terms?.length||state.status==='disconnected'||!state.retainedFrom)return null;const by={};for(const p of Object.values(state.posts||{})){const d=(p.postedAt||p.firstSeenAt).slice(0,10);if(d>=state.retainedFrom)by[d]=(by[d]||0)+1;}
 const rows=[];for(let d=state.retainedFrom;d<=iso(Date.now()-DAY);d=add(d,1))rows.push({date:d,posts:by[d]||0});
 return {id:'reddit',cutoff:rows.at(-1)?.date||null,from:state.retainedFrom,window:w,title:state.terms.join('、'),metrics:[{key:'posts',label:'Reddit 新帖',...metric(rows,'posts',w)}],series:series(rows,'posts',w),notes:[]};}
class DataViews{
 constructor(plugin){this.p=plugin;}
 async fresh(id,source,cutoff){try{return await this.p.sync.fresh(id,source,cutoff);}catch{return [];}}
 async overview(id,v){const now=Date.now(),yesterday=iso(now-DAY);let snaps=[];try{snaps=await this.p.sync.snapshots(id);}catch{snaps=[];}const get=k=>snaps.find(s=>s.key===k)?.payload;const lastDate=rows=>(rows||[]).map(r=>r.date).sort().at(-1)||null;const range=String(v.range||'28');
  const w=end=>windowFor(end,range,v.from,v.to);const cards=[];
  // Each Google source uses its own cutoff (SPEC §5), the same one 搜索表现 shows.
  const gscEnd=lastDate(get('history-search')),ga4End=lastDate(get('history-web'));if(gscEnd){const g=gscCard(get('history-search'),gscEnd,w(gscEnd));if(g)cards.push(withFresh(g,await this.fresh(id,'gsc',gscEnd),['clicks','impressions']));}if(ga4End){const a=ga4Card(get('history-web'),ga4End,w(ga4End));if(a)cards.push(withFresh(a,await this.fresh(id,'ga4',ga4End),['sessions','views']));}
  const site=await this.p.siteContent?.state(id).catch(()=>null);const c=contentCard(site,w(yesterday),now);if(c)cards.push(c);
  const gh=await this.p.github?.state(id).catch(()=>null);const g=githubCard(gh,w(yesterday));if(g)cards.push(g);
  const cm=await this.p.community?.state(id).catch(()=>null);const d=communityCard(cm,w(yesterday));if(d)cards.push(d);
  const pk=await this.p.packages?.state(id).catch(()=>null);const pc=packagesCard(pk,w(yesterday));if(pc)cards.push(pc);
  const hn=await this.p.hackernews?.state(id).catch(()=>null);const hc=hackernewsCard(hn,w(yesterday));if(hc)cards.push(hc);
  const rd=await this.p.reddit?.state(id).catch(()=>null);const rc=redditCard(rd,w(yesterday));if(rc)cards.push(rc);
  return {range,from:v.from||null,to:v.to||null,generatedAt:new Date(now).toISOString(),cards};}
 // GitHub page: stars/forks per day, Traffic per day (uniques are daily only, never summed), releases in range,
 // the latest 14-day referrer and path snapshot, and the 90-day issue summary.
 async github(id,v){const gh=await this.p.github?.state(id).catch(()=>null);if(!gh?.repo||gh.status==='disconnected')return {connected:false};const w=windowFor(iso(Date.now()-DAY),String(v.range||'28'),v.from,v.to);
  const rows=starRows(gh.daily),traffic=Object.entries(gh.traffic?.views||{}).map(([date,x])=>({date,views:x.count,uniques:x.uniques})),clones=Object.entries(gh.traffic?.clones||{}).map(([date,x])=>({date,clones:x.count,cloners:x.uniques}));
  const stars=netChange(gh.daily,'stars',w.start,w.end),prevStars=netChange(gh.daily,'stars',w.previousStart,w.previousEnd),forks=netChange(gh.daily,'forks',w.start,w.end);
  const byDate=new Map();const put=(d,k,val)=>{const o=byDate.get(d)||{date:d};o[k]=val;byDate.set(d,o);};for(const r of rows)if(r.date>=w.start&&r.date<=w.end){put(r.date,'stars',r.stars);put(r.date,'forks',r.forks);}for(const r of traffic)if(r.date>=w.start&&r.date<=w.end){put(r.date,'views',r.views);put(r.date,'uniques',r.uniques);}for(const r of clones)if(r.date>=w.start&&r.date<=w.end)put(r.date,'clones',r.clones);
  const daily=[];for(let d=w.start;d<=w.end;d=add(d,1))daily.push(byDate.get(d)||{date:d});
  const latest=o=>{const k=Object.keys(o||{}).sort().at(-1);return k?{date:k,items:o[k]}:null;};const dates=Object.keys(gh.daily||{}).sort();
  const notes=[],failed=[['Star',gh.starHistory],['Fork',gh.forkHistory]].filter(([,h])=>h?.error&&!h.complete);if(!dates.length||dates[0]>add(w.start,-1))notes.push(`Star 记录从 ${dates[0]||'今天'} 开始${!gh.token?'；接入 token 后可补全历史':failed.length?'':'，正在或将要补全历史'}`);for(const [k,h] of failed)notes.push(`${k} 历史没有补全：${h.error}（数据接入 → GitHub 里可以重新补全）`);if(gh.starHistory?.note&&gh.starHistory.complete&&dates[0]<=w.start)notes.push(gh.starHistory.note);if(!gh.token)notes.push('接入 Traffic 后可看到仓库浏览、克隆与来源网站');else if(gh.traffic?.since&&gh.traffic.since>w.start)notes.push(`Traffic 从 ${gh.traffic.since} 开始归档，GitHub 只保留 14 天`);
  const views=traffic.length?metric(traffic,'views',w):null,clonesM=clones.length?metric(clones,'clones',w):null;
  return {connected:true,repo:gh.repo,url:gh.url||`https://github.com/${gh.repo}`,window:w,cutoff:dates.at(-1)||null,notes,
   kpis:[{key:'stars',label:'新增 Star',value:stars,previous:prevStars,complete:stars!==null,change:stars!==null&&prevStars?(stars-prevStars)/prevStars:null},{key:'total',label:'Star 总数',value:sampleAt(gh.daily,w.end)?.stars??null,previous:null,complete:true,change:null},{key:'forks',label:'新增 Fork',value:forks,previous:null,complete:forks!==null,change:null},...(views?[{key:'views',label:'仓库浏览',...views}]:[]),...(clonesM?[{key:'clones',label:'克隆',...clonesM}]:[])],
   daily,releases:(gh.releases||[]).filter(r=>String(r.publishedAt).slice(0,10)>=w.start&&String(r.publishedAt).slice(0,10)<=w.end),referrers:latest(gh.traffic?.referrers),paths:latest(gh.traffic?.paths),issues:gh.issues?{total:gh.issues.total,top:gh.issues.top.slice(0,10),labels:gh.issues.labels}:null,discussions:gh.discussions?.enabled?{total:gh.discussions.total,answered:gh.discussions.answered,categories:gh.discussions.categories,top:gh.discussions.top.slice(0,10)}:gh.discussions?{enabled:false}:null,starHistory:gh.starHistory||null};}
 // Community page: topics by creation day in range; replies and views are counts as last read, not per day.
 // 下载量 page: npm and PyPI downloads per day and per package, Docker Hub pulls gained between daily samples.
 async downloads(id,v){const st=await this.p.packages?.state(id).catch(()=>null);if(!st?.packages?.length)return {connected:false};
  const w=windowFor(iso(Date.now()-DAY),String(v.range||'28'),v.from,v.to),card=packagesCard(st,w);
  const sum=(daily,a,b)=>{const days=Object.keys(daily||{}).filter(d=>d>=a&&d<=b);return days.length?days.reduce((n,d)=>n+(Number(daily[d])||0),0):null;};
  const packages=st.packages.map(p=>{const base={id:p.id,registry:p.registry,name:p.name,title:p.title||p.name,url:p.url||pkgs.pageUrl(p)};
   if(p.registry==='docker'){const samples=Object.fromEntries(Object.entries(st.samples?.[p.id]||{}).map(([d,x])=>[d,{pulls:x}]));const cur=netChange(samples,'pulls',w.start,w.end),prev=netChange(samples,'pulls',w.previousStart,w.previousEnd),last=Object.keys(samples).sort().at(-1);
    return {...base,value:cur,previous:prev,change:cur!==null&&prev?(cur-prev)/prev:null,total:last?samples[last].pulls:null};}
   const cur=sum(st.daily?.[p.id],w.start,w.end),prev=sum(st.daily?.[p.id],w.previousStart,w.previousEnd);return {...base,value:cur,previous:prev,change:cur!==null&&prev?(cur-prev)/prev:null,total:null};});
  return {connected:true,window:w,cutoff:card?.cutoff||null,kpis:card?.metrics||[],notes:card?.notes||[],series:card?.series||[],packages};}
 // Hacker News tab of 讨论: mentions per day, the stories that drew most points and the latest comments in range.
 async hackernews(id,v){const st=await this.p.hackernews?.state(id).catch(()=>null);if(!st?.terms?.length||st.status==='disconnected')return {connected:false};
  const w=windowFor(iso(Date.now()-DAY),String(v.range||'28'),v.from,v.to),card=hackernewsCard(st,w),inRange=m=>{const d=m.createdAt.slice(0,10);return d>=w.start&&d<=w.end;};
  const list=Object.values(st.mentions||{}).filter(inRange);
  return {connected:true,terms:st.terms,window:w,retainedFrom:st.retainedFrom||null,kpis:card?.metrics||[],notes:card?.notes||[],series:card?.series||[],
   stories:list.filter(m=>m.type==='story').sort((a,b)=>b.points-a.points).slice(0,20).map(m=>({title:m.title,url:m.url,hnUrl:m.hnUrl,points:m.points,comments:m.comments,date:m.createdAt.slice(0,10),term:m.term})),
   comments:list.filter(m=>m.type==='comment').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,20).map(m=>({title:m.title,hnUrl:m.hnUrl,excerpt:m.excerpt,date:m.createdAt.slice(0,10),term:m.term}))};}
 async community(id,v){const cm=await this.p.community?.state(id).catch(()=>null);if(!cm?.origin||cm.status==='disconnected')return {connected:false};const w=windowFor(iso(Date.now()-DAY),String(v.range||'28'),v.from,v.to);
  const retainedFrom=cm.retainedFrom||add(iso(Date.now()),-90),topics=Object.values(cm.topics||{}).map(t=>({...t,date:String(t.createdAt).slice(0,10),category:cm.categories?.[t.categoryId]||'未分类'}));const inRange=(t,a,b)=>t.date>=a&&t.date<=b;
  const cur=topics.filter(t=>inRange(t,w.start,w.end)),prev=topics.filter(t=>inRange(t,w.previousStart,w.previousEnd)),prevCovered=retainedFrom<=w.previousStart,covered=retainedFrom<=w.start;
  const daily=[];for(let d=w.start;d<=w.end;d=add(d,1)){const l=cur.filter(t=>t.date===d);daily.push({date:d,topics:d<retainedFrom?null:l.length,replies:d<retainedFrom?null:l.reduce((s,t)=>s+t.replies,0)});}
  const kpi=(key,label,value,previous)=>({key,label,value,previous:prevCovered?previous:null,complete:covered,change:covered&&prevCovered&&previous?(value-previous)/previous:null});
  const cats=new Map();for(const [list,slot] of [[cur,0],[prev,1]])for(const t of list){const c=cats.get(t.category)||[0,0];c[slot]++;cats.set(t.category,c);}
  const url=t=>`${cm.origin}/t/${t.slug}/${t.id}`;
  return {connected:true,origin:cm.origin,title:cm.title,window:w,retainedFrom,notes:[...(covered?[]:[`社区数据从 ${retainedFrom} 开始，所选时间的前段没有记录`]),'回复数、浏览数为最近一次读取时的数字'],
   kpis:[kpi('topics','新主题',cur.length,prev.length),kpi('replies','回复',cur.reduce((s,t)=>s+t.replies,0),prev.reduce((s,t)=>s+t.replies,0)),{...kpi('unanswered','无人回复',cur.filter(t=>!t.replies).length,null),change:null},{key:'solved',label:'已标记解决',value:cur.length?Math.round(cur.filter(t=>t.solved).length/cur.length*100):null,previous:null,complete:covered,change:null,unit:'%'}],
   daily,categories:[...cats].map(([name,[count,previous]])=>({name,count,previous:prevCovered?previous:null})).sort((a,b)=>b.count-a.count).slice(0,12),
   top:[...cur].sort((a,b)=>(b.views+b.replies*20)-(a.views+a.replies*20)).slice(0,10).map(t=>({title:t.title,url:url(t),views:t.views,replies:t.replies,solved:t.solved,category:t.category,date:t.date})),
   unanswered:cur.filter(t=>!t.replies).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10).map(t=>({title:t.title,url:url(t),category:t.category,date:t.date}))};}
 // The synced rows have no country, so a country view asks Search Console directly (final data, the same window as
 // the synced view, web search) — full history without a re-sync.
 async gscQuery(id,site,body){const g=__google_client;const token=await this.p.token(id);const rows=[];
  for(let startRow=0;;startRow+=25000){const r=await g.googleJson(`${g.GOOGLE_ENDPOINTS.searchConsole}/sites/${encodeURIComponent(site)}/searchAnalytics/query`,g.jsonRequest(token,{type:'web',dataState:'final',aggregationType:'auto',rowLimit:25000,startRow,...body}),this.p.googleFetch?.(id));const page=Array.isArray(r.rows)?r.rows:[];rows.push(...page);if(page.length<25000||rows.length>=100000)break;}
  return rows;}
 // Countries with search clicks in the window, for the 搜索表现 country menu (alpha-3, as Search Console reports them).
 async countries(id,site,w){try{return (await this.gscQuery(id,site,{startDate:w.start,endDate:w.end,dimensions:['country'],rowLimit:250})).map(r=>({key:String(r.keys?.[0]||''),clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0})).filter(c=>c.key).sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions).slice(0,60);}catch{return [];}}
 async searchByCountry(id,site,w,country,filters,base){const groups=[{filters:[{dimension:'country',operator:'equals',expression:country},...[['query',filters.queryFilter],['page',filters.pageFilter]].filter(([,f])=>f).map(([dimension,f])=>({dimension,operator:f.operator,expression:f.expression}))]}];
  const [byDate,byPair]=await Promise.all([this.gscQuery(id,site,{startDate:w.previousStart,endDate:w.end,dimensions:['date'],dimensionFilterGroups:groups}),this.gscQuery(id,site,{startDate:w.start,endDate:w.end,dimensions:['query','page'],dimensionFilterGroups:groups})]);
  const dayRows=byDate.map(r=>({date:r.keys[0],clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,position:Number(r.position)||0}));
  const rows=byPair.map(r=>({keyword:r.keys[0],page:r.keys[1],clicks:Number(r.clicks)||0,impressions:Number(r.impressions)||0,position:Number(r.position)||0}));
  // Search Console leaves out days with no data at all, so coverage is judged from the synced days, not from these rows.
  const by=new Map(dayRows.map(r=>[r.date,r])),fill=(a,b)=>{const out=[];for(let d=a;d<=b;d=add(d,1))if(base.has(d))out.push(by.get(d)||{date:d,clicks:0,impressions:0,position:0});return out;};
  const cur=fill(w.start,w.end),prev=fill(w.previousStart,w.previousEnd),complete=cur.length===days(w.start,w.end),previousComplete=prev.length===days(w.previousStart,w.previousEnd);
  const trend=[];for(let d=w.start,i=0;d<=w.end;d=add(d,1),i++){const pd=add(w.previousStart,i),now=base.has(d)?by.get(d)||{clicks:0,impressions:0}:null,before=base.has(pd)?by.get(pd)||{clicks:0,impressions:0}:null;trend.push({date:d,clicks:now?now.clicks:null,impressions:now?now.impressions:null,previousDate:pd,previousClicks:before?before.clicks:null,previousImpressions:before?before.impressions:null});}
  return {complete,previousComplete,totals:sp.totals(cur),previous:previousComplete?sp.totals(prev):null,trend,striking:sp.striking(rows),queries:sp.dimension(rows,'query'),pages:sp.dimension(rows,'page'),pairDays:cur.length,live:true};}
 // 搜索表现 page: totals, daily trend and the three tables for one window, read from the synced partitions.
 // Rebuilt only when the snapshot (i.e. synced data) or the request changes; the last few results are kept.
 // 搜索表现. Building it reads every synced day and takes seconds, so a built report is kept in memory and saved in
 // nrSnapshots (search-view:<id>) under the key of the synced data: after a restart or in a new browser it is read back
 // at once until new data lands (the sync tick then builds the 28-day view right away). 初步 days are read each time.
 async search(id,v){let link,snapKey;try{[link,{key:snapKey}]=await Promise.all([this.p.sync.link(id),this.p.sync.snapshotKey(id)]);}catch{return {connected:false};}
  const filters={queryFilter:sp.readFilter(v.queryFilter),pageFilter:sp.readFilter(v.pageFilter)},country=/^[a-z]{3}$/.test(String(v.country||''))?String(v.country):null;
  const key=JSON.stringify([snapKey,String(v.range||'28'),String(v.from||''),String(v.to||''),filters,country]);this.searchCache=this.searchCache||new Map();
  let value=this.searchCache.get(key)||await this.savedView(id,'search',key);
  if(!value){value=await this.buildSearch(id,v,link,filters,country);if(value.connected===false)return value;this.remember(key,value);await this.saveView(id,'search',key,value);}else this.remember(key,value);
  const preliminary=value.cutoff&&!value.filtered&&!value.country&&value.window?.end===value.cutoff?await this.fresh(id,'gsc',value.cutoff):[];
  return {...value,preliminary};}
 remember(key,value){this.searchCache.delete(key);this.searchCache.set(key,value);if(this.searchCache.size>12)this.searchCache.delete(this.searchCache.keys().next().value);}
 async savedView(id,kind,key){try{const row=await this.p.db.getRepository('nrSnapshots').findOne({filter:{key:`${kind}-view:${id}`}});return (row?.get('payload')?.entries||[]).find(e=>e.key===key)?.value||null;}catch{return null;}}
 // At most six reports per project and page, all for the current synced data.
 async saveView(id,kind,key,value){try{const r=this.p.db.getRepository('nrSnapshots'),row=await r.findOne({filter:{key:`${kind}-view:${id}`}}),snap=JSON.parse(key)[0];
  const entries=[{key,value},...(row?.get('payload')?.entries||[]).filter(e=>e.key!==key&&JSON.parse(e.key)[0]===snap)].slice(0,6);
  if(row)await r.update({filterByTk:row.id,values:{payload:{entries}}});else await r.create({values:{key:`${kind}-view:${id}`,payload:{entries}}});}catch{/* the report still shows */}}
 async buildSearch(id,v,link,filters,country){let snaps;try{snaps=await this.p.sync.snapshots(id);}catch{return {connected:false};}
  const daily=snaps.find(s=>s.key==='history-search')?.payload||[],cutoff=daily.map(r=>r.date).sort().at(-1);if(!cutoff)return {connected:true,cutoff:null};
  const w=windowFor(cutoff,String(v.range||'28'),v.from,v.to),filtered=Boolean(filters.queryFilter||filters.pageFilter),site=link.get('gscSiteUrl');
  if(country){let live;try{live=await this.searchByCountry(id,site,w,country,filters,new Set(daily.map(r=>r.date)));}catch(e){fail(e.code==='invalid_grant'?'Google 授权已失效，请到数据接入重新授权后再按国家查看':'没能从 Search Console 读取这个国家的数据，请稍后再试',502);}
   return {connected:true,cutoff,from:firstDate(daily),window:w,filtered:true,filters,country,...live};}
  const parts=await this.p.db.getRepository('nrSyncPartitions').find({filter:{projectId:id,source:'gsc',grain:'query_page',resource:site,date:{$gte:filtered?w.previousStart:w.start,$lte:w.end}},fields:['date','payload']});
  const byDate=new Map(parts.map(r=>[r.get('date'),r.get('payload')||[]]));
  // Filtered views sum the query × page rows per day; unfiltered ones use the date-only rows, which include anonymised queries.
  const dayRows=filtered?[...byDate].map(([date,rows])=>({date,...sp.totals(sp.pairs([rows],filters))})):daily;
  const inWin=(a,b)=>dayRows.filter(r=>r.date>=a&&r.date<=b),cur=inWin(w.start,w.end),prev=inWin(w.previousStart,w.previousEnd);
  const complete=cur.length===days(w.start,w.end),previousComplete=prev.length===days(w.previousStart,w.previousEnd);
  const by=new Map(dayRows.map(r=>[r.date,r])),trend=[];for(let d=w.start,i=0;d<=w.end;d=add(d,1),i++){const now=by.get(d),before=by.get(add(w.previousStart,i));trend.push({date:d,clicks:now?now.clicks:null,impressions:now?now.impressions:null,previousDate:add(w.previousStart,i),previousClicks:before?before.clicks:null,previousImpressions:before?before.impressions:null});}
  const rows=sp.pairs([...byDate].filter(([d])=>d>=w.start).map(([,r])=>r),filters);
  return {connected:true,cutoff,from:firstDate(daily),window:w,filtered,filters,country:null,complete,previousComplete,totals:sp.totals(cur),previous:previousComplete?sp.totals(prev):null,trend,striking:sp.striking(rows),queries:sp.dimension(rows,'query'),pages:sp.dimension(rows,'page'),pairDays:[...byDate.keys()].filter(d=>d>=w.start).length};}
 // 访问 (GA4): the totals, the daily line against the period before, sources and pages (pre-summed per period when the
 // data is synced) and visits from Reddit. Saved like 搜索表现; 初步 days are read each time.
 async website(id,v){let snapKey;try{({key:snapKey}=await this.p.sync.snapshotKey(id));}catch{return {connected:false};}
  const range=WEB_RANGES.includes(String(v.range))?String(v.range):'28',key=JSON.stringify([snapKey,range]);this.webCache=this.webCache||new Map();
  let value=this.webCache.get(key)||await this.savedView(id,'website',key);
  if(!value){let snaps;try{snaps=await this.p.sync.snapshots(id);}catch{return {connected:false};}value=websiteView(snaps,range);await this.saveView(id,'website',key,value);}
  this.webCache.set(key,value);if(this.webCache.size>8)this.webCache.delete(this.webCache.keys().next().value);
  return {...value,preliminary:value.cutoff?await this.fresh(id,'ga4',value.cutoff):[]};}
 // Countries for the country filter: a live Search Console query, asked for on its own (the page does not wait for it)
 // and kept six hours per window.
 async searchCountries(id,v){const date=/^\d{4}-\d{2}-\d{2}$/;if(!date.test(String(v.start||''))||!date.test(String(v.end||'')))fail('日期不对');let site;try{site=(await this.p.sync.link(id)).get('gscSiteUrl');}catch{return {countries:[]};}
  const key=JSON.stringify([id,site,v.start,v.end]);this.countryCache=this.countryCache||new Map();const hit=this.countryCache.get(key);if(hit&&Date.now()-hit.at<6*3600000)return {countries:hit.value};
  const value=await this.countries(id,site,{start:v.start,end:v.end});if(value.length)this.countryCache.set(key,{at:Date.now(),value});return {countries:value};}
 // 本站排名 for up to 1000 keywords over the last 28 synced days of Search Console query × page rows.
 async ranks(id,v){let snaps,link;try{[snaps,link]=await Promise.all([this.p.sync.snapshots(id),this.p.sync.link(id)]);}catch{return {connected:false,ranks:{}};}
  const daily=snaps.find(s=>s.key==='history-search')?.payload||[],cutoff=daily.map(r=>r.date).sort().at(-1);if(!cutoff)return {connected:true,cutoff:null,ranks:{}};
  const w=windowFor(cutoff,'28'),site=link.get('gscSiteUrl'),keywords=(Array.isArray(v.keywords)?v.keywords:[]).map(String).slice(0,1000);
  const key=JSON.stringify([id,site,w.start]);this.rankCache=this.rankCache||new Map();let hit=this.rankCache.get(key);
  if(!hit||hit.snaps!==snaps){const parts=await this.p.db.getRepository('nrSyncPartitions').find({filter:{projectId:id,source:'gsc',grain:'query_page',resource:site,date:{$gte:w.start,$lte:w.end}},fields:['date','payload']});hit={snaps,rows:sp.pairs(parts.map(r=>r.get('payload')||[]))};this.rankCache.clear();this.rankCache.set(key,hit);}
  return {connected:true,cutoff,window:{start:w.start,end:w.end},ranks:sp.ranks(hit.rows,keywords)};}
 // One page of 内容 (SPEC §5 内容 详情): its daily search clicks and impressions (Search Console query × page rows) and
 // views (GA4 page rows) over the range; pages match by host and path, ignoring www and a trailing slash.
 async page(id,v){const key=pageKey(v.url);if(!key)fail('请提供页面网址');let snaps,link;try{[snaps,link]=await Promise.all([this.p.sync.snapshots(id),this.p.sync.link(id)]);}catch{return {connected:false};}
  const get=k=>snaps.find(s=>s.key===k)?.payload||[],last=rows=>rows.map(r=>r.date).sort().at(-1)||null,gscEnd=last(get('history-search')),ga4End=last(get('history-web')),end=[gscEnd,ga4End].filter(Boolean).sort().at(-1);if(!end)return {connected:true,window:null};
  const w=windowFor(end,String(v.range||'90'),v.from,v.to),path=key.slice(key.indexOf('/')),repo=this.p.db.getRepository('nrSyncPartitions');
  const read=(source,grain,resource)=>repo.find({filter:{projectId:id,source,grain,resource,date:{$gte:w.start,$lte:w.end}},fields:['date','payload']});
  const [gscParts,ga4Parts]=await Promise.all([gscEnd?read('gsc','query_page',link.get('gscSiteUrl')):[],ga4End?read('ga4','page',link.get('ga4PropertyId')):[]]);
  const byDay=new Map();const day=d=>{let o=byDay.get(d);if(!o){o={date:d};byDay.set(d,o);}return o;};
  for(const r of gscParts){const o=day(r.get('date'));o.clicks=0;o.impressions=0;for(const x of r.get('payload')||[])if(pageKey(x.page)===key){o.clicks+=Number(x.clicks)||0;o.impressions+=Number(x.impressions)||0;}}
  const norm=p=>String(p||'').split('?')[0].replace(/\/+$/,'')||'/';
  for(const r of ga4Parts){const o=day(r.get('date'));o.views=0;for(const x of r.get('payload')||[])if(norm(x.page)===norm(path))o.views+=Number(x.views)||0;}
  const daily=[];for(let d=w.start;d<=w.end;d=add(d,1))daily.push(byDay.get(d)||{date:d});
  return {connected:true,window:w,gscCutoff:gscEnd,ga4Cutoff:ga4End,daily};}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'读取数据失败，请稍后重试。');}};
  this.p.app.resourceManager.define({name:'nrDataViews',actions:{overview:wrap((id,v)=>this.overview(id,v)),search:wrap((id,v)=>this.search(id,v)),website:wrap((id,v)=>this.website(id,v)),searchCountries:wrap((id,v)=>this.searchCountries(id,v)),ranks:wrap((id,v)=>this.ranks(id,v)),page:wrap((id,v)=>this.page(id,v)),github:wrap((id,v)=>this.github(id,v)),community:wrap((id,v)=>this.community(id,v)),downloads:wrap((id,v)=>this.downloads(id,v)),hackernews:wrap((id,v)=>this.hackernews(id,v))}});this.p.app.acl.allow('nrDataViews',['overview','search','website','searchCountries','ranks','page','github','community','downloads','hackernews'],'loggedIn');}
}
export { websiteView, withFresh, redditCard, DataViews, packagesCard, hackernewsCard, windowFor, metric, series, netChange, starRows, githubCard, communityCard, contentCard, gscCard };