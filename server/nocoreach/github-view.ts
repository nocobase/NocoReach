// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import { activityDays } from './github-source.js';
// GitHub page (网站与产品), the 我们的仓库 tab. Rebuilt 2026-10-14 in the same shape as 访问 (user request: keep
// NocoReach's own style and show more): eight figures with the period before, each one picking the daily line; three
// overview cards (community health, where visits come from, what the repository is made of); and one table with tabs
// (referring sites, popular content, contributors, issues and pull requests opened in the period, releases,
// discussions). Stars, forks, contributors, commits, issues, pull requests and releases have full history (GitHub keeps
// their dates); views, clones, referring sites and popular content only from the day NocoReach started saving them,
// since GitHub keeps 14 days.
const DAY=86400000;
const iso=t=>new Date(t).toISOString().slice(0,10);
const add=(d,n)=>iso(Date.parse(d+'T00:00:00Z')+n*DAY);
const dayCount=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/DAY)+1;
const sum=(rows,k)=>rows.reduce((n,r)=>n+(Number.isFinite(r?.[k])?r[k]:0),0);
const known=(rows,k)=>rows.some(r=>Number.isFinite(r?.[k]));
const ratio=(a,b)=>a!=null&&b?a/b:null;
const bot=x=>/\[bot\]$|-bot$/i.test(String(x||''));
const median=list=>{const l=list.filter(Number.isFinite).sort((a,b)=>a-b);if(!l.length)return null;const m=Math.floor(l.length/2);return l.length%2?l[m]:(l[m-1]+l[m])/2;};
const AI=/chatgpt|openai|perplexity|claude|anthropic|gemini|copilot|deepseek|kimi|moonshot|doubao|grok|poe\.com|you\.com|phind/i;
const SEARCH=/google|bing|baidu|duckduckgo|yandex|sogou|so\.com|naver|ecosia|brave/i;
const COMMUNITY=/reddit|news\.ycombinator|v2ex|zhihu|twitter|x\.com|t\.co$|linkedin|discord|slack|stackoverflow|stackexchange|weibo|facebook|youtube|bilibili|telegram/i;
const CONTENT=/medium|dev\.to|substack|hashnode|juejin|csdn|infoq|cnblogs|segmentfault|oschina|sspai|producthunt/i;
// Where a referring site belongs: our own sites, an AI assistant, a search engine, a community, a content site, GitHub, or other.
function referrerKind(name,own){const n=String(name||'').toLowerCase();if(own.some(d=>d&&(n===d||n.endsWith('.'+d)||d.endsWith('.'+n))))return 'own';if(AI.test(n))return 'ai';if(SEARCH.test(n))return 'search';if(COMMUNITY.test(n))return 'community';if(CONTENT.test(n))return 'content';if(n==='github.com')return 'github';return 'other';}
// Which part of the repository a popular path is.
function pathArea(path){const p=String(path||'').replace(/^\/[^/]+\/[^/]+/,'')||'/';if(p==='/'||p==='')return 'home';const m=p.match(/^\/(releases|issues|pulls|tags|wiki|discussions|blob|tree|actions|commits|graphs|stargazers|network|security|projects)/);return m?({blob:'code',tree:'code',commits:'code',graphs:'insights',stargazers:'insights',network:'insights'}[m[1]]||m[1]):'other';}
function windowOf(windowFor,end,v,first){if(String(v.range)==='all'){const start=first&&first<end?first:add(end,-27);return {start,end,days:dayCount(start,end),previousStart:add(start,-dayCount(start,end)),previousEnd:add(start,-1),all:true};}return {...windowFor(end,String(v.range||'28'),v.from,v.to),all:false};}
// One row a day for [a, b]: new stars and forks (only what was added: a deleted fork or a withdrawn star is not a
// negative addition), views and clones where saved, and the history figures where the full history is read.
function dailyRows(gh,activity,days,a,b){
 const daily=gh.daily||{},sampled=Object.keys(daily).sort(),from=activity?Object.keys(days).sort()[0]||null:null,v=gh.traffic?.views||{},c=gh.traffic?.clones||{};
 let before=(()=>{const k=sampled.filter(x=>x<a).at(-1);return k?daily[k]:null;})();const out=[];
 for(let d=a;d<=b;d=add(d,1)){const s=daily[d],row={date:d};
  if(s){if(before){if(Number.isFinite(s.stars)&&Number.isFinite(before.stars))row.starsAdded=Math.max(0,s.stars-before.stars);if(Number.isFinite(s.forks)&&Number.isFinite(before.forks))row.forksAdded=Math.max(0,s.forks-before.forks);}before=s;}
  if(v[d]){row.views=v[d].count;row.uniques=v[d].uniques;}if(c[d]){row.clones=c[d].count;row.cloners=c[d].uniques;}
  if(from&&d>=from){const x=days[d]||{};for(const k of ['issuesOpened','issuesClosed','prsOpened','prsMerged','prsClosed','externalPrsOpened','externalPrsMerged','externalPrsClosed','commits','externalCommits','activeContributors','newContributors','releases'])row[k]=x[k]||0;}
  out.push(row);}
 return out;}
// The authors of commits in [a, b], without bots.
function authors(activity,a,b){const set=new Set();for(const [d,o] of Object.entries(activity?.commits||{}))if(d>=a&&d<=b)for(const who of Object.keys(o))if(!bot(who))set.add(who);return set;}
function figures(rows,activity,a,b){const m=k=>known(rows,k)?sum(rows,k):null,items=Object.values(activity?.items||{}),inWin=d=>d&&d>=a&&d<=b;
 return {starsAdded:m('starsAdded'),forksAdded:m('forksAdded'),views:m('views'),uniques:m('uniques'),clones:m('clones'),cloners:m('cloners'),trafficDays:rows.filter(r=>Number.isFinite(r.views)).length,cloneDays:rows.filter(r=>Number.isFinite(r.clones)).length,
  commits:m('commits'),externalCommits:m('externalCommits'),newContributors:m('newContributors'),activeContributors:activity?authors(activity,a,b).size:null,
  issuesOpened:m('issuesOpened'),issuesClosed:m('issuesClosed'),prsOpened:m('prsOpened'),prsMerged:m('prsMerged'),prsClosed:m('prsClosed'),externalPrsOpened:m('externalPrsOpened'),externalPrsMerged:m('externalPrsMerged'),externalPrsClosed:m('externalPrsClosed'),
  prMergeHours:activity?median(items.filter(([,,merged,pr])=>pr&&inWin(merged)).map(x=>x[5])):null,issueCloseHours:activity?median(items.filter(([,closed,,pr])=>!pr&&inWin(closed)).map(x=>x[5])):null};}
// The latest snapshot of a top-ten list in the window, each item with the count of the snapshot about a week before;
// and every snapshot of the window by item, for an item's line in its detail. A snapshot read on day D covers the 14
// days up to D-1, so it belongs to a window by D-1.
function snapshots(store,w,keyOf,decorate){const all=Object.keys(store||{}).sort(),dates=all.filter(d=>add(d,-1)>=w.start&&add(d,-1)<=w.end);if(!dates.length)return null;
 const last=dates.at(-1),week=all.filter(d=>d<=add(last,-7)).at(-1)||null,before=new Map((week?store[week]:[]).map(x=>[keyOf(x),x.count])),latest=(store[last]||[]).slice().sort((x,y)=>y.count-x.count),total=latest.reduce((n,x)=>n+(x.count||0),0);
 const series=Object.fromEntries(latest.map(x=>[keyOf(x),dates.map(d=>(store[d]||[]).find(i=>keyOf(i)===keyOf(x))?.count??null)]));
 return {date:last,comparedWith:week,dates,series,items:latest.map(x=>({...x,...decorate(x),key:keyOf(x),share:total?x.count/total:null,previous:week?(before.get(keyOf(x))??0):null}))};}
function githubView(gh,act,v,{windowFor,end,own=[],running=false,token=false}){
 // A history read in full once (it has a read time) stays shown while reading it again fails.
 const activity=act&&act.repo===gh.repo&&(act.complete||act.at)?act:null,days=activity?activityDays(activity):{};
 const first=[Object.keys(gh.daily||{}).sort()[0],Object.keys(days).sort()[0],Object.keys(gh.traffic?.views||{}).sort()[0]].filter(Boolean).sort()[0];
 const w=windowOf(windowFor,end,v,first),rows=dailyRows(gh,activity,days,w.start,w.end),prevRows=w.all?[]:dailyRows(gh,activity,days,w.previousStart,w.previousEnd);
 const now=figures(rows,activity,w.start,w.end),before=w.all?null:figures(prevRows,activity,w.previousStart,w.previousEnd);
 const team=new Set([...(activity?.members||[]),...(activity?.team||[])]),sampled=Object.keys(gh.daily||{}).filter(d=>d<=w.end).sort(),latest=sampled.length?gh.daily[sampled.at(-1)]:null;
 const referrers=snapshots(gh.traffic?.referrers,w,x=>String(x.referrer||'').toLowerCase(),x=>({kind:referrerKind(x.referrer,own)}));
 const paths=snapshots(gh.traffic?.paths,w,x=>x.path,x=>({area:pathArea(x.path)}));
 const kinds={};for(const x of referrers?.items||[])kinds[x.kind]=(kinds[x.kind]||0)+x.count;const kindTotal=Object.values(kinds).reduce((a,b)=>a+b,0);
 const releases=(activity?.releases||(gh.releases||[]).map(r=>({tag:r.tag,name:r.name,date:String(r.publishedAt||'').slice(0,10),url:r.url,downloads:null,assets:[]})));
 const open=activity?Object.values(activity.items).reduce((o,[,closed,,pr])=>{if(!closed)o[pr?'prs':'issues']++;return o;},{issues:0,prs:0}):null;
 // Contributors: commits in the period and the one before, the day of the first commit, outside or team (estimated).
 const firstCommit=new Map(),inPeriod=new Map(),inBefore=new Map();for(const d of Object.keys(activity?.commits||{}).sort())for(const [who,n] of Object.entries(activity.commits[d])){if(bot(who))continue;if(!firstCommit.has(who))firstCommit.set(who,d);if(d>=w.start&&d<=w.end)inPeriod.set(who,(inPeriod.get(who)||0)+n);if(!w.all&&d>=w.previousStart&&d<=w.previousEnd)inBefore.set(who,(inBefore.get(who)||0)+n);}
 const profile=new Map((gh.profile?.contributors||[]).map(c=>[c.login,c]));
 const contributors=[...new Set([...inPeriod.keys(),...profile.keys()])].filter(x=>!bot(x)).map(login=>({login,anonymous:login.startsWith('~'),url:login.startsWith('~')?null:profile.get(login)?.url||`https://github.com/${login}`,commits:inPeriod.get(login)||0,previous:w.all?null:inBefore.get(login)||0,total:profile.get(login)?.contributions??null,firstCommit:firstCommit.get(login)||null,external:activity&&!login.startsWith('~')?!team.has(login):null})).sort((a,b)=>b.commits-a.commits||(b.total||0)-(a.total||0)).slice(0,100);
 // Issues and pull requests opened in the period (the last 400 days keep their titles).
 const opened=pr=>Object.entries(activity?.items||{}).filter(([,x])=>x[3]===pr&&x[0]>=w.start&&x[0]<=w.end).map(([n,[created,closed,merged,,ext,hours]])=>{const d=activity.details?.[n];return {number:Number(n),title:d?.title||`#${n}`,url:d?.url||`https://github.com/${gh.repo}/${pr?'pull':'issues'}/${n}`,comments:d?.comments??null,author:d?.author||null,external:Boolean(ext),created,closed,merged,state:pr?(merged?'merged':closed?'closed':'open'):(closed?'closed':'open'),hours};}).sort((a,b)=>b.created.localeCompare(a.created)||b.number-a.number).slice(0,300);
 const langTotal=Object.values(gh.profile?.languages||{}).reduce((n,b)=>n+b,0),savedSince=Object.keys(gh.traffic?.views||{}).sort()[0]||null;
 const history=!token?'token':activity?'complete':running?'running':act&&act.repo===gh.repo&&act.error&&!act.complete?'failed':'pending';
 const notes=[];if(history==='token')notes.push(systemMessageText('githubView.historyNeedsToken'));else if(history==='running')notes.push(systemMessageText('githubView.historyRunning'));else if(history==='failed')notes.push(systemMessageText('githubView.historyFailed',{0:act.error}));else if(history==='pending')notes.push(systemMessageText('githubView.historyPending'));
 if(activity&&act.error)notes.push(systemMessageText('githubView.historyRefreshFailed',{0:act.error,1:String(act.at||'').slice(0,10)}));
 if(activity?.capped)notes.push(systemMessageText('githubView.historyCapped'));
 if(token)notes.push(savedSince?systemMessageText('githubView.trafficSavedSince',{0:savedSince}):systemMessageText('githubView.trafficNotYet'));
 if(activity)notes.push(systemMessageText('githubView.externalEstimate'));
 if(gh.starHistory?.note&&gh.starHistory.complete)notes.push(gh.starHistory.note);
 return {connected:true,repo:gh.repo,url:gh.url||`https://github.com/${gh.repo}`,window:w,cutoff:sampled.at(-1)||null,notes,
  history:{state:history,error:history==='failed'?act.error:null,from:Object.keys(days).sort()[0]||null,savedSince},
  totals:{stars:latest?.stars??null,forks:latest?.forks??null,watchers:latest?.watchers??null,contributors:activity?firstCommit.size:(gh.profile?.contributors?.length??null),releases:releases.length||null,releaseDownloads:latest?.releaseDownloads??(activity?releases.reduce((n,r)=>n+(r.downloads||0),0):null),openIssues:open?.issues??latest?.openIssues??null,openPrs:open?.prs??null},
  figures:now,previous:before,daily:rows,previousDaily:prevRows,
  sources:referrers?{date:referrers.date,total:kindTotal,kinds:Object.entries(kinds).sort((a,b)=>b[1]-a[1]).map(([kind,count])=>({kind,count,share:kindTotal?count/kindTotal:null})),ai:kinds.ai||0}:null,
  composition:{languages:Object.entries(gh.profile?.languages||{}).sort((a,b)=>b[1]-a[1]).map(([name,bytes])=>({name,bytes,share:langTotal?bytes/langTotal:null})),topics:gh.profile?.topics||[]},
  tables:{referrers,paths,contributors,issues:opened(0),pulls:opened(1),releases:releases.slice(0,100).map(({assets,...r})=>({...r,files:(assets||[]).length})),
   discussions:gh.discussions?.enabled?gh.discussions.top:null,discussionsEnabled:gh.discussions?gh.discussions.enabled!==false:null,topIssues:gh.issues?.top||[]}};}
export { githubView, referrerKind, pathArea, dailyRows, median };
