// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import { activityDays } from './github-source.js';
// GitHub page (网站与产品), rebuilt 2026-10-14 after the first NocoReach's GitHub page (user request): the figures with full
// history (stars, forks, contributors, commits, issues, pull requests, releases) per day for any range back to the
// repository's first day, kept apart from what GitHub gives for 14 days only (views, clones, referring sites and popular
// content), which NocoReach saves every day; then what the repository is made of and how the community works.
const DAY=86400000;
const iso=t=>new Date(t).toISOString().slice(0,10);
const add=(d,n)=>iso(Date.parse(d+'T00:00:00Z')+n*DAY);
const dayCount=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/DAY)+1;
const sum=(rows,k)=>rows.reduce((n,r)=>n+(Number.isFinite(r?.[k])?r[k]:0),0);
const known=(rows,k)=>rows.some(r=>Number.isFinite(r?.[k]));
const ratio=(a,b)=>b?a/b:null;
const median=list=>{const l=list.filter(Number.isFinite).sort((a,b)=>a-b);if(!l.length)return null;const m=Math.floor(l.length/2);return l.length%2?l[m]:(l[m-1]+l[m])/2;};
const AI=/chatgpt|openai|perplexity|claude|anthropic|gemini|copilot|deepseek|kimi|moonshot|doubao|grok|poe\.com|you\.com|phind/i;
const SEARCH=/google|bing|baidu|duckduckgo|yandex|sogou|so\.com|naver|ecosia|brave/i;
const COMMUNITY=/reddit|news\.ycombinator|v2ex|zhihu|twitter|x\.com|t\.co$|linkedin|discord|slack|stackoverflow|stackexchange|weibo|facebook|youtube|bilibili|telegram/i;
const CONTENT=/medium|dev\.to|substack|hashnode|juejin|csdn|infoq|cnblogs|segmentfault|oschina|sspai|producthunt/i;
// Where a referring site belongs: our own sites, an AI assistant, a search engine, a community, a content site, or other.
function referrerKind(name,own){const n=String(name||'').toLowerCase();if(own.some(d=>d&&(n===d||n.endsWith('.'+d)||d.endsWith('.'+n))))return 'own';if(AI.test(n))return 'ai';if(SEARCH.test(n))return 'search';if(COMMUNITY.test(n))return 'community';if(CONTENT.test(n))return 'content';if(n==='github.com')return 'github';return 'other';}
// Which part of the repository a popular path is.
function pathArea(path){const p=String(path||'').replace(/^\/[^/]+\/[^/]+/,'')||'/';if(p==='/'||p==='')return 'home';const m=p.match(/^\/(releases|issues|pulls|tags|wiki|discussions|blob|tree|actions|commits|graphs|stargazers|network|security|projects)/);return m?({blob:'code',tree:'code',commits:'code',graphs:'insights',stargazers:'insights',network:'insights'}[m[1]]||m[1]):'other';}
// The window: N days, calendar months, a custom range, or all days with any record.
function windowOf(windowFor,end,v,first){if(String(v.range)==='all'){const start=first&&first<end?first:add(end,-27);return {start,end,days:dayCount(start,end),previousStart:add(start,-dayCount(start,end)),previousEnd:add(start,-1),all:true};}return {...windowFor(end,String(v.range||'28'),v.from,v.to),all:false};}
// One row a day for [a, b]: the history figures where they are known, null before records start.
function communityDays(gh,act,days,a,b){
 const daily=gh.daily||{},sampled=Object.keys(daily).sort(),activityFrom=act?.complete?Object.keys(days).sort()[0]||null:null;
 const prev=d=>{const k=sampled.filter(x=>x<d).at(-1);return k?daily[k]:null;};
 const out=[];let before=prev(a);for(let d=a;d<=b;d=add(d,1)){const s=daily[d],row={date:d};
  if(s){row.starsTotal=s.stars??null;row.forksTotal=s.forks??null;if(before){row.starsAdded=Number.isFinite(s.stars)&&Number.isFinite(before.stars)?s.stars-before.stars:null;row.forksAdded=Number.isFinite(s.forks)&&Number.isFinite(before.forks)?s.forks-before.forks:null;}before=s;}
  if(activityFrom&&d>=activityFrom){const x=days[d]||{};for(const k of ['issuesOpened','issuesClosed','prsOpened','prsMerged','prsClosed','externalPrsOpened','externalPrsMerged','externalPrsClosed','commits','externalCommits','activeContributors','newContributors','releases'])row[k]=x[k]||0;}
  out.push(row);}
 return out;}
function trafficDays(gh,a,b){const v=gh.traffic?.views||{},c=gh.traffic?.clones||{},out=[];for(let d=a;d<=b;d=add(d,1)){const row={date:d};if(v[d]){row.views=v[d].count;row.uniques=v[d].uniques;}if(c[d]){row.clones=c[d].count;row.cloners=c[d].uniques;}out.push(row);}return out;}
// Each saved snapshot is GitHub's top ten for the 14 days before it: a line per item over the snapshot days (the eight
// largest in the latest snapshot, the rest of the ten together), and the latest snapshot as a table.
// A snapshot read on day D covers the 14 days up to D-1, so it belongs to a window by D-1.
function snapshots(store,w,keyOf,decorate){const dates=Object.keys(store||{}).filter(d=>add(d,-1)>=w.start&&add(d,-1)<=w.end).sort();if(!dates.length)return null;
 const last=dates.at(-1),latest=(store[last]||[]).slice().sort((x,y)=>y.count-x.count),top=latest.slice(0,8).map(keyOf),total=latest.reduce((n,x)=>n+(x.count||0),0);
 const series=top.map(k=>({key:k,values:dates.map(d=>{const x=(store[d]||[]).find(i=>keyOf(i)===k);return x?x.count:null;})}));
 if(dates.some(d=>(store[d]||[]).some(i=>!top.includes(keyOf(i)))))series.push({key:'*others',values:dates.map(d=>(store[d]||[]).filter(i=>!top.includes(keyOf(i))).reduce((n,i)=>n+(i.count||0),0))});
 return {dates,series,latest:{date:last,items:latest.map(x=>({...x,...decorate(x),share:total?x.count/total:null}))}};}
function figures(rows,traffic,act,w){const m=k=>known(rows,k)?sum(rows,k):null;
 const items=Object.values(act?.items||{}),inWin=d=>d&&d>=w.start&&d<=w.end;
 return {starsAdded:m('starsAdded'),forksAdded:m('forksAdded'),views:known(traffic,'views')?sum(traffic,'views'):null,uniques:known(traffic,'uniques')?sum(traffic,'uniques'):null,clones:known(traffic,'clones')?sum(traffic,'clones'):null,cloners:known(traffic,'cloners')?sum(traffic,'cloners'):null,trafficDays:traffic.filter(r=>Number.isFinite(r.views)).length,cloneDays:traffic.filter(r=>Number.isFinite(r.clones)).length,
  newContributors:m('newContributors'),commits:m('commits'),externalCommits:m('externalCommits'),prsOpened:m('prsOpened'),prsMerged:m('prsMerged'),prsClosed:m('prsClosed'),externalPrsOpened:m('externalPrsOpened'),externalPrsMerged:m('externalPrsMerged'),externalPrsClosed:m('externalPrsClosed'),issuesOpened:m('issuesOpened'),issuesClosed:m('issuesClosed'),
  prMergeHours:act?.complete?median(items.filter(([,,merged,pr])=>pr&&inWin(merged)).map(x=>x[5])):null,issueCloseHours:act?.complete?median(items.filter(([,closed,,pr])=>!pr&&inWin(closed)).map(x=>x[5])):null};}
function githubView(gh,act,v,{windowFor,end,own=[],running=false,token=false}){
 const activity=act&&act.repo===gh.repo?act:null,days=activity?.complete?activityDays(activity):{};
 const first=[Object.keys(gh.daily||{}).sort()[0],Object.keys(days).sort()[0],Object.keys(gh.traffic?.views||{}).sort()[0]].filter(Boolean).sort()[0];
 const w=windowOf(windowFor,end,v,first),rows=communityDays(gh,activity,days,w.start,w.end),prevRows=w.all?[]:communityDays(gh,activity,days,w.previousStart,w.previousEnd);
 const traffic=trafficDays(gh,w.start,w.end),prevTraffic=w.all?[]:trafficDays(gh,w.previousStart,w.previousEnd),now=figures(rows,traffic,activity,w),before=w.all?null:figures(prevRows,prevTraffic,activity,{start:w.previousStart,end:w.previousEnd});
 const team=new Set([...(activity?.members||[]),...(activity?.team||[])]),sampled=Object.keys(gh.daily||{}).filter(d=>d<=w.end).sort(),latest=sampled.length?gh.daily[sampled.at(-1)]:null;
 const referrers=snapshots(gh.traffic?.referrers,w,x=>String(x.referrer||'').toLowerCase(),x=>({kind:referrerKind(x.referrer,own)}));
 const paths=snapshots(gh.traffic?.paths,w,x=>x.path,x=>({area:pathArea(x.path)}));
 const aiNow=referrers?referrers.latest.items.filter(x=>x.kind==='ai').reduce((n,x)=>n+x.count,0):null;
 const releases=(activity?.releases||gh.releases?.map(r=>({tag:r.tag,name:r.name,date:String(r.publishedAt||'').slice(0,10),url:r.url,downloads:null,assets:[]}))||[]);
 const contributorsTotal=activity?.complete?new Set(Object.values(activity.commits||{}).flatMap(o=>Object.keys(o)).filter(x=>!/\[bot\]$|-bot$/i.test(x))).size:(gh.profile?.contributors?.length??null);
 const open=activity?.complete?Object.values(activity.items).reduce((o,[,closed,,pr])=>{if(!closed)o[pr?'prs':'issues']++;return o;},{issues:0,prs:0}):null;
 const langTotal=Object.values(gh.profile?.languages||{}).reduce((n,b)=>n+b,0);
 const notes=[];
 if(!token)notes.push(systemMessageText('githubView.historyNeedsToken'));else if(running&&!activity?.complete)notes.push(systemMessageText('githubView.historyRunning'));else if(activity&&!activity.complete&&activity.error)notes.push(systemMessageText('githubView.historyFailed',{0:activity.error}));else if(!activity?.complete)notes.push(systemMessageText('githubView.historyPending'));
 if(activity?.capped)notes.push(systemMessageText('githubView.historyCapped'));
 const savedSince=Object.keys(gh.traffic?.views||{}).sort()[0]||null;
 if(token)notes.push(savedSince?systemMessageText('githubView.trafficSavedSince',{0:savedSince}):systemMessageText('githubView.trafficNotYet'));
 if(activity?.complete)notes.push(systemMessageText('githubView.externalEstimate'));
 if(gh.starHistory?.note&&gh.starHistory.complete)notes.push(gh.starHistory.note);
 return {connected:true,repo:gh.repo,url:gh.url||`https://github.com/${gh.repo}`,description:gh.description||'',window:w,cutoff:sampled.at(-1)||null,notes,
  history:{token:Boolean(token),running:Boolean(running),activity:activity?.complete?'complete':activity?.error?'failed':'pending',from:Object.keys(days).sort()[0]||null,stars:Boolean(gh.starHistory?.complete),savedSince},
  totals:{stars:latest?.stars??null,forks:latest?.forks??null,watchers:latest?.watchers??null,contributors:contributorsTotal,releases:releases.length||null,releaseDownloads:latest?.releaseDownloads??(activity?releases.reduce((n,r)=>n+(r.downloads||0),0):null),openIssues:open?.issues??null,openPrs:open?.prs??null,aiReferrals:aiNow,aiReferralsDate:referrers?.latest.date||null},
  figures:now,previous:before,community:rows,previousCommunity:prevRows,traffic,previousTraffic:prevTraffic,referrers,paths,
  composition:{languages:Object.entries(gh.profile?.languages||{}).sort((a,b)=>b[1]-a[1]).map(([name,bytes])=>({name,bytes,share:langTotal?bytes/langTotal:null})),topics:gh.profile?.topics||[],
   contributors:(gh.profile?.contributors||[]).map(c=>({...c,external:activity?.complete&&!/\[bot\]$/i.test(c.login)?!team.has(c.login):null})),labels:Object.entries(gh.issues?.labels||{}).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([name,count])=>({name,count})),
   releases:releases.slice(0,30).map(({assets,...r})=>r),assets:releases.flatMap(r=>(r.assets||[]).map(a=>({...a,release:r.tag}))).sort((a,b)=>b.downloads-a.downloads).slice(0,20)},
  issues:gh.issues?{total:gh.issues.total,top:gh.issues.top.slice(0,10),labels:gh.issues.labels}:null,discussions:gh.discussions?.enabled?{total:gh.discussions.total,answered:gh.discussions.answered,categories:gh.discussions.categories,top:gh.discussions.top.slice(0,10)}:gh.discussions?{enabled:false}:null};}
export { githubView, referrerKind, pathArea, communityDays, median };
