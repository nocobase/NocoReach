// @ts-nocheck
import type { Connections } from './plugin.js';
import { ProjectRuns } from './project-runs.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import { businessNow } from './business-clock.js';
import { lastSuccess } from './sync-policy.js';
import { terms } from './hackernews-source.js';
import { DataForSeo } from './dataforseo.js';
// Reddit 讨论 (SPEC §11 外部讨论, P1; 2026-10-03 user choice): Reddit's own API needs an approved app and, for brand
// monitoring, a paid commercial agreement, so threads are found through Google instead: once a week a search for
// site:reddit.com "<term>" on the shared DataForSEO layer (monthly budget, a check reused for 6 days, uncertain results not
// retried). The first check reads the most relevant threads, later ones the past month. Only threads Google has indexed
// are seen, and no votes or comment counts; titles, subreddits, snippets and links are kept, never authors.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const DAY=86400000,WEEK=7*DAY,MAX_POSTS=3000;
const iso=t=>new Date(t).toISOString().slice(0,10);
// A Reddit thread from a result address: www.reddit.com/r/<sub>/comments/<id>/<slug>, any reddit host; others are not threads.
function thread(url){let u;try{u=new URL(String(url||''));}catch{return null;}if(!/(^|\.)reddit\.com$/i.test(u.hostname))return null;
 const m=u.pathname.match(/^\/r\/([A-Za-z0-9_]{2,40})\/comments\/([a-z0-9]{3,12})(?:\/([^/]*))?/i);if(!m)return null;
 return {id:m[2].toLowerCase(),subreddit:m[1],url:`https://www.reddit.com/r/${m[1]}/comments/${m[2].toLowerCase()}/${m[3]?encodeURIComponent(decodeURIComponent(m[3])).slice(0,200)+'/':''}`};}
// Google's date for a result, as DataForSEO's advanced results give it ("2024-10-04 12:30:00 +00:00").
const day=v=>{const m=String(v||'').match(/^(\d{4}-\d{2}-\d{2})/);if(m)return m[1];const t=Date.parse(String(v||''));return Number.isFinite(t)?iso(t):null;};
function specification(v){const term=String(v.term||'').trim();if(term.length<3||term.length>60||/["\\]/.test(term))fail(systemMessageText('redditSource.enterProductName360'),400);
 // The advanced results (2026-10-09 user feedback: the page showed only when a thread was found, not when it was posted)
 // carry the date Google shows for a result and the “discussions and forums” box; same price as the regular ones. Price:
 // $0.002 a page of 10 results, 10 pages, ×5 for the site: operator.
 return {kind:'reddit',view:'serp',target:term,path:'serp/google/organic/live/advanced',request:{keyword:`site:reddit.com "${term}"`,location_code:2840,language_code:'en',device:'desktop',depth:100,...(v.recent?{search_param:'&tbs=qdr:m'}:{})},recent:Boolean(v.recent),estimatedUsd:0.1,reservationUsd:0.15,priceVersion:'official-list-2026-10-09'};}
// Threads among the results: organic links and Google's "discussions and forums" box.
function result(raw,spec){const task=raw?.tasks?.[0],cost=Number.isFinite(raw?.cost)?raw.cost:null;if(raw?.status_code!==20000||task?.status_code!==20000)return {status:'failed',errorCode:systemMessageText('rankTracking.searchResultsLookupFailed'),result:null,costUsd:cost};
 const items=(task.result?.[0]?.items||[]).flatMap(i=>i?.type==='discussions_and_forums'?(i.items||[]):[i]).filter(i=>['organic','discussions_and_forums_element'].includes(i?.type));
 const seen=new Set(),posts=[];for(const i of items){const t=thread(i.url);if(!t||seen.has(t.id))continue;seen.add(t.id);posts.push({...t,title:String(i.title||'').replace(/\s*:\s*r\/\w+\s*$/i,'').slice(0,300),snippet:String(i.description||'').slice(0,400),postedAt:day(i.timestamp)});}
 return {status:'completed',errorCode:null,result:{posts:posts.slice(0,100)},costUsd:cost};}
class RedditSource{
 readonly runs: ProjectRuns;
 constructor(p){this.p=p;this.runs=new ProjectRuns();(this.p as Connections).network?.bind(this,['connect', 'check']);this.d4s=new DataForSeo(p,{reddit:{specification,result,reuseMs:6*DAY}});this.runs.bindRequest(this.d4s,'run');}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `reddit:${id}`;}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async mutate(id,fn){this.runs.assertActive();return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});this.runs.assertActive();const state=await fn(row?.get('payload')||null);this.runs.assertActive();if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else if(state)await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 async connect(id,v){return this.runs.run(id,async()=>{if(!this.d4s.config(id)?.verifiedAt)fail(systemMessageText('redditSource.redditDiscussionsSearchedThroughDataforseo'),409);const list=terms(v.terms);
  await this.mutate(id,old=>{const same=old&&JSON.stringify(old.terms)===JSON.stringify(list);return {...(same?old:{posts:{},lastRun:null,retainedFrom:null}),terms:list,status:'active',connectedAt:same?old.connectedAt:new Date().toISOString()};});
  this.runs.start(id,()=>this.check(id));return this.status(id);},`connect:${JSON.stringify(v)}`);}
 async disconnect(id){await this.runs.cancel(id,()=>this.mutate(id,cur=>cur?{...cur,status:'disconnected'}:cur));return this.status(id);}
 // One search per term; new threads are added with the day they were first seen. Stops at the first budget refusal.
 check(id,options={}){return this.runs.run(id,()=>this.collect(id,options));}
 async collect(id,{force=false}={}){const s=await this.state(id);if(!s?.terms?.length||s.status==='disconnected')fail(systemMessageText('redditSource.connectRedditDiscussionsFirst'),409);
  if(!force&&s.lastRun&&Date.now()-Date.parse(s.lastRun.at)<WEEK-6*3600000)return {found:0,added:0,errors:[]};
  // Threads found before dates were read (2026-10-09) get theirs from one search without the past-month limit (same price).
  const backfill=!s.datesReadAt&&Object.values(s.posts||{}).some(p=>!p.postedAt),recent=Boolean(s.retainedFrom)&&!backfill,found=[],errors=[],clock=businessNow(this.p,id),now=new Date(clock).toISOString(),at=new Date().toISOString();
  // A new request key per check; paying twice in a week is prevented by the 6-day reuse of the same search.
  for(const term of s.terms){this.runs.assertActive();let run;try{run=await this.d4s.run(id,'reddit',{term,recent,requestKey:`reddit-${id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}-${Buffer.from(term).toString('hex').slice(0,30)}`});}catch(e){errors.push(`「${term}」：${e.message}`);if(/预算/.test(e.message))break;continue;}
   if(run.status!=='completed'){errors.push(`「${term}」：${run.errorCode||systemMessageText('common.notComplete')}`);continue;}
   found.push(...(run.result?.posts||[]).map(p=>({...p,term})));}
  let added=0;
  await this.mutate(id,cur=>{if(!cur||JSON.stringify(cur.terms)!==JSON.stringify(s.terms))return cur;const posts={...(cur.posts||{})};
   for(const p of found){const old=posts[p.id];if(!old)added++;posts[p.id]={...p,firstSeenAt:old?.firstSeenAt||now,lastSeenAt:now,postedAt:p.postedAt||old?.postedAt||null};}
   const kept=Object.values(posts).sort((a,b)=>b.firstSeenAt.localeCompare(a.firstSeenAt)).slice(0,MAX_POSTS);
   return {...cur,posts:Object.fromEntries(kept.map(p=>[p.id,p])),retainedFrom:cur.retainedFrom||(found.length||!errors.length?iso(clock):null),lastRun:{at,ok:!errors.length,errors:errors.slice(0,5),found:found.length,added,lastSuccessAt:errors.length?lastSuccess(cur.lastRun):at},dataThrough:errors.length?(cur.dataThrough||null):iso(clock),datesReadAt:cur.datesReadAt||(errors.length?null:now)};});
  return {found:found.length,added,errors};}
 async status(id){const s=await this.state(id);if(!s?.terms?.length)return {connected:false,dataforseo:Boolean(this.d4s.config(id)?.verifiedAt)};const list=Object.values(s.posts||{});
  return {connected:s.status!=='disconnected',checking:this.runs.has(id),dataforseo:Boolean(this.d4s.config(id)?.verifiedAt),terms:s.terms,lastRun:s.lastRun||null,retainedFrom:s.retainedFrom||null,total:list.length,
   nextCheckAt:s.lastRun?new Date(Date.parse(s.lastRun.at)+WEEK).toISOString():null,recent:list.sort((a,b)=>b.firstSeenAt.localeCompare(a.firstSeenAt)).slice(0,3).map(p=>({title:p.title,subreddit:p.subreddit,url:p.url}))};}
 // The Reddit page: threads first seen in the range (and before it for comparison), subreddits, and the newest threads.
 async view(id,v,windowFor){const s=await this.state(id);if(!s?.terms?.length||s.status==='disconnected')return {connected:false};
  const w=windowFor(iso(businessNow(this.p,id)-DAY),String(v.range||'28'),v.from,v.to),list=Object.values(s.posts||{}),seenDay=p=>(p.postedAt||p.firstSeenAt).slice(0,10);
  const inRange=(p,a,b)=>seenDay(p)>=a&&seenDay(p)<=b,cur=list.filter(p=>inRange(p,w.start,w.end)),prev=list.filter(p=>inRange(p,w.previousStart,w.previousEnd));
  const covered=Boolean(s.retainedFrom)&&s.retainedFrom<=w.start,prevCovered=Boolean(s.retainedFrom)&&s.retainedFrom<=w.previousStart;
  const subs=new Map();for(const p of cur)subs.set(p.subreddit,(subs.get(p.subreddit)||0)+1);
  // Visits from Reddit in the same range (GA4 source reddit.com or the Reddit app), when Google is connected.
  let visits=null;try{const rows=(await this.p.sync.snapshots(id)).find(x=>x.key==='history-reddit-referral')?.payload||[],sum=(a,b,k)=>rows.filter(r=>r.date>=a&&r.date<=b).reduce((n,r)=>n+(Number(r[k])||0),0);
   if(rows.length)visits={sessions:sum(w.start,w.end,'sessions'),views:sum(w.start,w.end,'views'),conversions:sum(w.start,w.end,'conversions'),previous:sum(w.previousStart,w.previousEnd,'sessions')};}catch{visits=null;}
  return {connected:true,terms:s.terms,window:w,retainedFrom:s.retainedFrom||null,lastRun:s.lastRun||null,total:list.length,
   visits,
   kpis:[{key:'posts',label:systemMessageText('analysisRules.newPosts'),value:cur.length,previous:prevCovered?prev.length:null,complete:covered,change:covered&&prevCovered&&prev.length?(cur.length-prev.length)/prev.length:null},{key:'subreddits',label:systemMessageText('redditSource.subreddits'),value:subs.size,previous:null,complete:covered,change:null},{key:'total',label:systemMessageText('redditSource.totalRecorded'),value:list.length,previous:null,complete:true,change:null}],
   notes:[...(s.retainedFrom?(covered?[]:[systemMessageText('messages.recordingSinceEarlyPartSelected', { 0: s.retainedFrom })]):[systemMessageText('dataHealth.firstSearchRunning')]),systemMessageText('redditSource.countsPostsGoogleIndexedDay')],
   subreddits:[...subs].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,12),
   posts:[...cur].sort((a,b)=>(b.postedAt||b.firstSeenAt).localeCompare(a.postedAt||a.firstSeenAt)).slice(0,50).map(p=>({id:p.id,title:p.title,url:p.url,subreddit:p.subreddit,snippet:p.snippet,postedAt:p.postedAt,firstSeenAt:p.firstSeenAt,term:p.term}))};}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{const s=await this.state(String(id));if(!s?.terms?.length||s.status==='disconnected'||this.runs.has(String(id)))continue;await this.check(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach Reddit check failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 async close(){await this.runs.close();}
 register(windowFor){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);ctx.set('Cache-Control','no-store');try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('redditSource.notLoadRedditDiscussionsTry'));}};
  const actions={status:wrap(id=>this.status(id)),connect:wrap((id,v)=>this.connect(id,v)),check:wrap(async id=>{const r=await this.check(id,{force:true});return {...r,...await this.status(id)};}),disconnect:wrap(id=>this.disconnect(id)),view:wrap((id,v)=>this.view(id,v,windowFor))};
  this.p.app.resourceManager.define({name:'nrReddit',actions});this.p.app.acl.allow('nrReddit',Object.keys(actions),'loggedIn');}
}
export { RedditSource, thread, specification, result };