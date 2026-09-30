'use strict';
// Data views (SPEC §5 数据分析): one time range across all connected sources; each source keeps its own cutoff.
const {projectId,requireAdmin}=require('./policy');
const DAY=86400000;
const iso=t=>new Date(t).toISOString().slice(0,10);
const add=(d,n)=>iso(Date.parse(d+'T00:00:00Z')+n*DAY);
const days=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/DAY)+1;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const RANGES=['7','28','90','3m','6m','12m','16m'];
// Same window rules as the Portal period helper: N days ending at the cutoff, or calendar months back from it.
function windowFor(end,range,from,to){if(range==='custom'){if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||from>to)fail('请选择有效的起止日期');const n=days(from,to);if(n>490)fail('自定义范围最长 16 个月');const e=to<end?to:end;return {start:from,end:e,days:n,previousStart:add(from,-n),previousEnd:add(from,-1)};}
 if(!RANGES.includes(String(range)))fail('不支持的时间范围');let start;if(range.endsWith('m')){const s=new Date(Date.parse(end+'T00:00:00Z')+DAY);const d=s.getUTCDate();s.setUTCDate(1);s.setUTCMonth(s.getUTCMonth()-parseInt(range));s.setUTCDate(Math.min(d,new Date(Date.UTC(s.getUTCFullYear(),s.getUTCMonth()+1,0)).getUTCDate()));start=iso(s);}else start=add(end,1-Number(range));const n=days(start,end);return {start,end,days:n,previousStart:add(start,-n),previousEnd:add(start,-1)};}
// Sums need every day of the window present; otherwise the value is shown with its coverage, never as a comparison.
function metric(rows,field,w){const inWin=(a,b)=>rows.filter(r=>r.date>=a&&r.date<=b&&Number.isFinite(r[field]));const cur=inWin(w.start,w.end),prev=inWin(w.previousStart,w.previousEnd);const sum=l=>l.reduce((s,r)=>s+r[field],0);const complete=cur.length===days(w.start,w.end),prevComplete=prev.length===days(w.previousStart,w.previousEnd);const value=cur.length?sum(cur):null,previous=prevComplete?sum(prev):null;return {value,previous,complete,change:complete&&previous?(value-previous)/previous:null};}
function series(rows,field,w){const by=new Map(rows.map(r=>[r.date,r[field]]));const out=[];for(let d=w.start;d<=w.end;d=add(d,1))out.push({date:d,value:by.has(d)&&Number.isFinite(by.get(d))?by.get(d):null});return out;}
function firstDate(rows){return rows.map(r=>r.date).sort()[0]||null;}
// Stars are cumulative samples: net change between the last sample on or before each end; missing ends give null.
function sampleAt(daily,date){const d=Object.keys(daily||{}).filter(x=>x<=date).sort().at(-1);return d?{date:d,...daily[d]}:null;}
// Backfilled days have no fork count; a difference is only taken between two real numbers.
const diff=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?a-b:null;
function starRows(daily){const dates=Object.keys(daily||{}).sort();return dates.slice(1).map((d,i)=>({date:d,stars:diff(daily[d].stars,daily[dates[i]].stars),forks:diff(daily[d].forks,daily[dates[i]].forks)}));}
function netChange(daily,field,a,b){const end=sampleAt(daily,b),base=sampleAt(daily,add(a,-1));if(!end||!base||base.date!==add(a,-1))return null;return diff(end[field],base[field]);}
function gscCard(rows,end,w){if(!rows.length)return null;const clicks=metric(rows,'clicks',w),imp=metric(rows,'impressions',w);return {id:'gsc',cutoff:end,from:firstDate(rows),window:w,metrics:[{key:'clicks',label:'点击',...clicks},{key:'impressions',label:'曝光',...imp}],series:series(rows,'clicks',w)};}
function ga4Card(rows,end,w){if(!rows.length)return null;return {id:'ga4',cutoff:end,from:firstDate(rows),window:w,metrics:[{key:'sessions',label:'访问',...metric(rows,'sessions',w)},{key:'views',label:'浏览',...metric(rows,'views',w)},{key:'conversions',label:'关键事件',...metric(rows,'conversions',w)}],series:series(rows,'sessions',w)};}
function githubCard(gh,w){if(!gh?.repo||gh.status==='disconnected')return null;const dates=Object.keys(gh.daily||{}).sort();const net=netChange(gh.daily,'stars',w.start,w.end),prevNet=netChange(gh.daily,'stars',w.previousStart,w.previousEnd);const views=Object.entries(gh.traffic?.views||{}).map(([date,v])=>({date,views:v.count,uniques:v.uniques}));const v=views.length?metric(views,'views',w):null;
 const notes=[];if(!dates.length||dates[0]>add(w.start,-1))notes.push(`Star 记录从 ${dates[0]||'今天'} 开始${gh.starHistory?.complete?'':'；接入 token 后可补全历史'}`);if(!gh.token)notes.push('接入 Traffic 后可看到仓库浏览与来源网站');else if(gh.traffic?.since&&gh.traffic.since>w.start)notes.push(`仓库浏览从 ${gh.traffic.since} 开始归档`);
 return {id:'github',cutoff:dates.at(-1)||null,from:dates[0]||null,window:w,title:gh.repo,metrics:[{key:'stars',label:'新增 Star',value:net,previous:prevNet,complete:net!==null,change:net!==null&&prevNet?(net-prevNet)/prevNet:null},{key:'total',label:'Star 总数',value:sampleAt(gh.daily,w.end)?.stars??null,previous:null,complete:true,change:null},...(v?[{key:'views',label:'仓库浏览',...v}]:[])],series:series(starRows(gh.daily),'stars',w),notes};}
function communityCard(cm,w){if(!cm?.origin||cm.status==='disconnected')return null;const by=new Map();for(const t of Object.values(cm.topics||{})){const d=String(t.createdAt).slice(0,10);const o=by.get(d)||{date:d,topics:0,replies:0,unanswered:0};o.topics++;o.replies+=t.replies||0;if(!t.replies)o.unanswered++;by.set(d,o);}
 const retainedFrom=cm.retainedFrom||add(iso(Date.now()),-90);const rows=[];for(let d=retainedFrom;d<=add(iso(Date.now()),-1);d=add(d,1))rows.push(by.get(d)||{date:d,topics:0,replies:0,unanswered:0});
 const notes=retainedFrom>w.start?[`社区数据从 ${retainedFrom} 开始`]:[];return {id:'discourse',cutoff:add(iso(Date.now()),-1),from:retainedFrom,window:w,title:cm.title,metrics:[{key:'topics',label:'新主题',...metric(rows,'topics',w)},{key:'replies',label:'回复',...metric(rows,'replies',w)},{key:'unanswered',label:'无人回复',...metric(rows,'unanswered',w),change:null}],series:series(rows,'topics',w),notes};}
function contentCard(site,w,now){if(!site?.pages?.length)return null;const lm=p=>p.lastmod?String(p.lastmod).slice(0,10):null;const updated=site.pages.filter(p=>lm(p)&&lm(p)>=w.start&&lm(p)<=w.end).length,stale=site.pages.filter(p=>lm(p)&&Date.parse(lm(p))<now-365*DAY).length,unknown=site.pages.filter(p=>!lm(p)).length;
 return {id:'site',cutoff:null,from:null,window:w,title:`${site.sites?.length||1} 个网址`,metrics:[{key:'pages',label:'页面总数',value:site.pages.length,previous:null,complete:true,change:null},{key:'updated',label:'本期更新',value:updated,previous:null,complete:true,change:null},{key:'stale',label:'超过一年未更新',value:stale,previous:null,complete:true,change:null}],series:[],notes:unknown?[`${unknown} 个页面没有提供更新时间`]:[]};}
class DataViews{
 constructor(plugin){this.p=plugin;}
 async overview(id,v){const now=Date.now(),yesterday=iso(now-DAY);let snaps=[];try{snaps=await this.p.sync.snapshots(id);}catch{snaps=[];}const get=k=>snaps.find(s=>s.key===k)?.payload;const googleEnd=get('project')?.end||null;const range=String(v.range||'28');
  const w=end=>windowFor(end,range,v.from,v.to);const cards=[];
  if(googleEnd){const g=gscCard(get('history-search')||[],googleEnd,w(googleEnd));if(g)cards.push(g);const a=ga4Card(get('history-web')||[],googleEnd,w(googleEnd));if(a)cards.push(a);}
  const site=await this.p.siteContent?.state(id).catch(()=>null);const c=contentCard(site,w(yesterday),now);if(c)cards.push(c);
  const gh=await this.p.github?.state(id).catch(()=>null);const g=githubCard(gh,w(yesterday));if(g)cards.push(g);
  const cm=await this.p.community?.state(id).catch(()=>null);const d=communityCard(cm,w(yesterday));if(d)cards.push(d);
  return {range,from:v.from||null,to:v.to||null,generatedAt:new Date(now).toISOString(),cards};}
 // GitHub page: stars/forks per day, Traffic per day (uniques are daily only, never summed), releases in range,
 // the latest 14-day referrer and path snapshot, and the 90-day issue summary.
 async github(id,v){const gh=await this.p.github?.state(id).catch(()=>null);if(!gh?.repo||gh.status==='disconnected')return {connected:false};const w=windowFor(iso(Date.now()-DAY),String(v.range||'28'),v.from,v.to);
  const rows=starRows(gh.daily),traffic=Object.entries(gh.traffic?.views||{}).map(([date,x])=>({date,views:x.count,uniques:x.uniques})),clones=Object.entries(gh.traffic?.clones||{}).map(([date,x])=>({date,clones:x.count,cloners:x.uniques}));
  const stars=netChange(gh.daily,'stars',w.start,w.end),prevStars=netChange(gh.daily,'stars',w.previousStart,w.previousEnd),forks=netChange(gh.daily,'forks',w.start,w.end);
  const byDate=new Map();const put=(d,k,val)=>{const o=byDate.get(d)||{date:d};o[k]=val;byDate.set(d,o);};for(const r of rows)if(r.date>=w.start&&r.date<=w.end){put(r.date,'stars',r.stars);put(r.date,'forks',r.forks);}for(const r of traffic)if(r.date>=w.start&&r.date<=w.end){put(r.date,'views',r.views);put(r.date,'uniques',r.uniques);}for(const r of clones)if(r.date>=w.start&&r.date<=w.end)put(r.date,'clones',r.clones);
  const daily=[];for(let d=w.start;d<=w.end;d=add(d,1))daily.push(byDate.get(d)||{date:d});
  const latest=o=>{const k=Object.keys(o||{}).sort().at(-1);return k?{date:k,items:o[k]}:null;};const dates=Object.keys(gh.daily||{}).sort();
  const notes=[];if(!dates.length||dates[0]>add(w.start,-1))notes.push(`Star 记录从 ${dates[0]||'今天'} 开始${gh.token?'，正在或将要补全历史':'；接入 token 后可补全历史'}`);if(gh.starHistory?.note&&dates[0]<=w.start)notes.push(gh.starHistory.note);if(!gh.token)notes.push('接入 Traffic 后可看到仓库浏览、克隆与来源网站');else if(gh.traffic?.since&&gh.traffic.since>w.start)notes.push(`Traffic 从 ${gh.traffic.since} 开始归档，GitHub 只保留 14 天`);
  const views=traffic.length?metric(traffic,'views',w):null,clonesM=clones.length?metric(clones,'clones',w):null;
  return {connected:true,repo:gh.repo,url:gh.url||`https://github.com/${gh.repo}`,window:w,cutoff:dates.at(-1)||null,notes,
   kpis:[{key:'stars',label:'新增 Star',value:stars,previous:prevStars,complete:stars!==null,change:stars!==null&&prevStars?(stars-prevStars)/prevStars:null},{key:'total',label:'Star 总数',value:sampleAt(gh.daily,w.end)?.stars??null,previous:null,complete:true,change:null},{key:'forks',label:'新增 Fork',value:forks,previous:null,complete:forks!==null,change:null},...(views?[{key:'views',label:'仓库浏览',...views}]:[]),...(clonesM?[{key:'clones',label:'克隆',...clonesM}]:[])],
   daily,releases:(gh.releases||[]).filter(r=>String(r.publishedAt).slice(0,10)>=w.start&&String(r.publishedAt).slice(0,10)<=w.end),referrers:latest(gh.traffic?.referrers),paths:latest(gh.traffic?.paths),issues:gh.issues?{total:gh.issues.total,top:gh.issues.top.slice(0,10),labels:gh.issues.labels}:null,starHistory:gh.starHistory||null};}
 register(){const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'读取数据失败，请稍后重试。');}};
  this.p.app.resourceManager.define({name:'nrDataViews',actions:{overview:wrap((id,v)=>this.overview(id,v)),github:wrap((id,v)=>this.github(id,v))}});this.p.app.acl.allow('nrDataViews',['overview','github'],'loggedIn');}
}
module.exports={DataViews,windowFor,metric,series,netChange,starRows,githubCard,communityCard,contentCard,gscCard};
