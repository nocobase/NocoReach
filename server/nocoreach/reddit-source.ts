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
import { randomUUID } from 'node:crypto';
import { redditSchedule, termNextAt, canRecheckConfiguration } from './reddit-schedule.js';
// Reddit 讨论 (SPEC §11 外部讨论, P1; 2026-10-03 user choice): Reddit's own API needs an approved app and, for brand
// monitoring, a paid commercial agreement, so threads are found through Google instead: once a week a search for
// site:reddit.com "<term>" on the shared DataForSEO layer (monthly budget, a check reused for 6 days, uncertain results not
// retried). The first check reads the most relevant threads, later ones the past month. Only threads Google has indexed
// are seen, and no votes or comment counts; titles, subreddits, snippets and links are kept, never authors.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const DAY=86400000,MAX_POSTS=3000;
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
function result(raw,spec){const task=raw?.tasks?.[0],cost=Number.isFinite(raw?.cost)&&raw.cost>=0?raw.cost:null;
 const providerCode=Number.isInteger(raw?.status_code)?raw.status_code:null,taskCode=Number.isInteger(task?.status_code)?task.status_code:null;
 const taskId=typeof task?.id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(task.id)?task.id:null;
 const code=providerCode===20000?taskCode:providerCode;
 // Official appendix/errors and live-endpoint guidance: retry only explicit terminal errors,
 // with an explicit zero total cost for our single-task request. Never infer billing from text.
 const retryable=[40103,50000,50303,50401,50402].includes(code)&&cost===0;
 let reason=retryable?'temporary':code===40100||code===40104?'credentials':[40200,40203,40210].includes(code)?'providerBudget':code>=40400&&code<40600?'parameters':'providerFailure';
 const empty=providerCode===20000&&taskCode===40102;
 const success=providerCode===20000&&taskCode===20000;
 const page=task?.result?.[0];
 const valid=Array.isArray(raw?.tasks)&&raw.tasks.length===1&&(empty||(success&&Array.isArray(task.result)&&task.result.length===1&&page&&
  (Array.isArray(page.items)||(page.items===null&&page.items_count===0))));
 const uncertain=!Number.isInteger(providerCode)||(providerCode===20000&&!Number.isInteger(taskCode))||[20100,40601,40602].includes(code)||(success&&!valid)||(!success&&!empty&&cost===null);
 if(uncertain)reason='uncertain';
 const diagnostic={providerCode,taskCode,taskId,reason:valid?'success':reason,retryable:!uncertain&&retryable,billing:cost===null?'unknown':'known'};
 if(!valid)return {status:uncertain?'unknown':'failed',taskId,errorCode:systemMessageText(`redditDiagnostic.${reason}`),result:{diagnostic},costUsd:cost};
 const items=(empty?[]:page.items||[]).flatMap(i=>i?.type==='discussions_and_forums'?(i.items||[]):[i]).filter(i=>['organic','discussions_and_forums_element'].includes(i?.type));
 const seen=new Set(),posts=[];for(const i of items){const t=thread(i.url);if(!t||seen.has(t.id))continue;seen.add(t.id);posts.push({...t,title:String(i.title||'').replace(/\s*:\s*r\/\w+\s*$/i,'').slice(0,300),snippet:String(i.description||'').slice(0,400),postedAt:day(i.timestamp)});}
 return {status:'completed',taskId,errorCode:null,result:{posts:posts.slice(0,100),diagnostic},costUsd:cost};}
class RedditSource{
 readonly runs: ProjectRuns;
 constructor(p){this.p=p;this.runs=new ProjectRuns();(this.p as Connections).network?.bind(this,['connect', 'check'], 'dataforseo');this.d4s=new DataForSeo(p,{reddit:{specification,result,reuseMs:6*DAY,timeoutMs:120000}});this.runs.bindRequest(this.d4s,'run');}
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
  const schedule=redditSchedule(s),unfinished=s.plan&&!s.plan.entries.every(e=>e.status==='completed');
  // Manual checks obey failure cooldowns, exhaustion and uncertain billing just like the scanner.
  const resume=e=>force&&(e.status==='budget'||e.status==='attention'||canRecheckConfiguration(e));
  if(!schedule.due&&!s.plan?.entries.some(resume)&&(unfinished||schedule.kind==='attention'||!force))return {found:0,added:0,errors:s.lastRun?.ok?[]:s.lastRun?.errors?.length?s.lastRun.errors:[systemMessageText('redditDiagnostic.uncertain')]};
  const clock=businessNow(this.p,id,'dataforseo'),now=new Date(clock).toISOString(),at=new Date().toISOString();
  const backfill=!s.datesReadAt&&Object.values(s.posts||{}).some(p=>!p.postedAt);
  const plan=unfinished?structuredClone(s.plan):{recent:Boolean(s.retainedFrom)&&!backfill,cutoff:now,entries:s.terms.map(term=>({term,status:'pending',attempt:0,at}))};
  const due=plan.entries.filter(e=>{const next=termNextAt(e);return resume(e)||(next&&Date.parse(next)<=Date.now());});
  const prepare=!unfinished||due.some(e=>e.status!=='pending'||!e.requestKey);
  for(const e of due)if(e.status!=='pending'||!e.requestKey){if(!['budget','attention'].includes(e.status)){e.requestKey=`reddit-${randomUUID()}`;e.attempt++;}e.status='pending';e.at=at;}
  // Persist stable request keys before any paid I/O. Restarting an interrupted batch returns the same runs.
  if(prepare)await this.mutate(id,cur=>({...cur,plan}));
  const found=[];
  for(const entry of due){this.runs.assertActive();let run;try{run=await this.d4s.run(id,'reddit',{term:entry.term,recent:plan.recent,requestKey:entry.requestKey});}
   catch(e){this.runs.assertActive();entry.status=e.safeCode==='budget_exceeded'?'budget':'attention';entry.diagnostic={reason:entry.status==='budget'?'budget':'configuration',retryable:false};
    if(entry.status==='budget'){const date=new Date();entry.at=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)).toISOString();for(const waiting of due.slice(due.indexOf(entry)+1)){waiting.status='budget';waiting.at=entry.at;waiting.diagnostic=entry.diagnostic;}break;}continue;}
   entry.status=run.status==='running'?'unknown':run.status;entry.runId=String(run.id||'');entry.diagnostic=run.result?.diagnostic||{reason:'uncertain',retryable:false};entry.at=run.completedAt||at;
   if(run.status!=='completed')continue;
   entry.queriedAt=run.createdAt||at;
   // A cache hit is historical evidence. Translate its age to the project's business clock without advancing coverage.
   entry.through=iso(Date.parse(plan.cutoff)-Math.max(0,Date.parse(at)-Date.parse(entry.queriedAt)));
   found.push(...(run.result?.posts||[]).map(p=>({...p,term:entry.term,runId:entry.runId})));}
  const errors=plan.entries.filter(e=>e.status!=='completed').map(e=>`「${e.term}」：${systemMessageText(`redditDiagnostic.${e.diagnostic?.reason||'uncertain'}`)}`);
  const complete=plan.entries.every(e=>e.status==='completed'),through=complete?plan.entries.map(e=>e.through).sort()[0]:null;
  const successAt=complete?plan.entries.map(e=>e.queriedAt).sort()[0]:null;
  let added=0;
  await this.mutate(id,cur=>{if(!cur||JSON.stringify(cur.terms)!==JSON.stringify(s.terms))return cur;const posts={...(cur.posts||{})};
   for(const p of found){const old=posts[p.id];if(!old)added++;posts[p.id]={...p,firstSeenAt:old?.firstSeenAt||now,lastSeenAt:now,postedAt:p.postedAt||old?.postedAt||null};}
   const kept=Object.values(posts).sort((a,b)=>b.firstSeenAt.localeCompare(a.firstSeenAt)).slice(0,MAX_POSTS);
   return {...cur,plan,posts:Object.fromEntries(kept.map(p=>[p.id,p])),retainedFrom:cur.retainedFrom||(complete?through:null),lastRun:{at,ok:complete,errors:errors.slice(0,5),found:found.length,added,lastSuccessAt:successAt||lastSuccess(cur.lastRun)},dataThrough:through||cur.dataThrough||null,datesReadAt:cur.datesReadAt||(complete?plan.cutoff:null)};});
  return {found:found.length,added,errors};}
 async status(id){const s=await this.state(id);if(!s?.terms?.length)return {connected:false,dataforseo:Boolean(this.d4s.config(id)?.verifiedAt)};const list=Object.values(s.posts||{});
  return {connected:s.status!=='disconnected',checking:this.runs.has(id),dataforseo:Boolean(this.d4s.config(id)?.verifiedAt),terms:s.terms,lastRun:s.lastRun||null,retainedFrom:s.retainedFrom||null,total:list.length,
   schedule:redditSchedule(s),diagnostics:s.plan?.entries.filter(e=>e.diagnostic).map(e=>({term:e.term,runId:e.runId,attempt:e.attempt,...e.diagnostic})),nextCheckAt:redditSchedule(s).nextAt,recent:list.sort((a,b)=>b.firstSeenAt.localeCompare(a.firstSeenAt)).slice(0,3).map(p=>({title:p.title,subreddit:p.subreddit,url:p.url}))};}
 // The Reddit page: threads first seen in the range (and before it for comparison), subreddits, and the newest threads.
 async view(id,v,windowFor){const s=await this.state(id);if(!s?.terms?.length||s.status==='disconnected')return {connected:false};
  const w=windowFor(iso(businessNow(this.p,id,'dataforseo')-DAY),String(v.range||'28'),v.from,v.to,[s.retainedFrom,...Object.values(s.posts||{}).map(p=>(p.postedAt||p.firstSeenAt)?.slice(0,10))].filter(Boolean).sort()[0]),list=Object.values(s.posts||{}),seenDay=p=>(p.postedAt||p.firstSeenAt).slice(0,10);
  const inRange=(p,a,b)=>seenDay(p)>=a&&seenDay(p)<=b,cur=list.filter(p=>inRange(p,w.start,w.end)),prev=list.filter(p=>inRange(p,w.previousStart,w.previousEnd));
  const covered=Boolean(s.retainedFrom)&&s.retainedFrom<=w.start&&Boolean(s.dataThrough&&s.dataThrough>=w.end),prevCovered=!w.all&&Boolean(s.retainedFrom)&&s.retainedFrom<=w.previousStart&&Boolean(s.dataThrough&&s.dataThrough>=w.previousEnd);
  const subs=new Map();for(const p of cur)subs.set(p.subreddit,(subs.get(p.subreddit)||0)+1);
  // Visits from Reddit in the same range (GA4 source reddit.com or the Reddit app), when Google is connected.
  let visits=null;try{const rows=(await this.p.sync.snapshots(id)).find(x=>x.key==='history-reddit-referral')?.payload||[],sum=(a,b,k)=>rows.filter(r=>r.date>=a&&r.date<=b).reduce((n,r)=>n+(Number(r[k])||0),0);
   if(rows.length)visits={sessions:sum(w.start,w.end,'sessions'),views:sum(w.start,w.end,'views'),conversions:sum(w.start,w.end,'conversions'),previous:w.all?null:sum(w.previousStart,w.previousEnd,'sessions')};}catch{visits=null;}
  return {connected:true,terms:s.terms,window:w,retainedFrom:s.retainedFrom||null,lastRun:s.lastRun||null,total:list.length,schedule:redditSchedule(s),diagnostics:s.plan?.entries.filter(e=>e.diagnostic).map(e=>({term:e.term,runId:e.runId,attempt:e.attempt,...e.diagnostic})),
   visits,
   kpis:[{key:'posts',label:systemMessageText('analysisRules.newPosts'),value:cur.length,previous:prevCovered?prev.length:null,complete:covered,change:covered&&prevCovered&&prev.length?(cur.length-prev.length)/prev.length:null},{key:'subreddits',label:systemMessageText('redditSource.subreddits'),value:subs.size,previous:null,complete:covered,change:null},{key:'total',label:systemMessageText('redditSource.totalRecorded'),value:list.length,previous:null,complete:true,change:null}],
   notes:[...(s.retainedFrom?(covered?[]:[systemMessageText('redditSource.partialHistoryCoverage', { 0: s.retainedFrom })]):[systemMessageText(s.lastRun?'redditTiming.coverageIncomplete':'dataHealth.firstSearchRunning')]),...(s.dataThrough?[systemMessageText('redditTiming.coverageThrough',{0:s.dataThrough})]:[]),systemMessageText('redditSource.countsPostsGoogleIndexedDay')],
   subreddits:[...subs].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,12),
   posts:[...cur].sort((a,b)=>(b.postedAt||b.firstSeenAt).localeCompare(a.postedAt||a.firstSeenAt)).slice(0,50).map(p=>({id:p.id,title:p.title,url:p.url,subreddit:p.subreddit,snippet:p.snippet,postedAt:p.postedAt,firstSeenAt:p.firstSeenAt,term:p.term}))};}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{const s=await this.state(String(id));if(!s?.terms?.length||s.status==='disconnected'||this.runs.has(String(id)))continue;await this.check(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach Reddit check failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 async close(){await this.runs.close();}
 register(windowFor){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);ctx.set('Cache-Control','no-store');try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('redditSource.notLoadRedditDiscussionsTry'));}};
  const actions={status:wrap(id=>this.status(id)),connect:wrap((id,v)=>this.connect(id,v)),check:wrap(async id=>{const r=await this.check(id,{force:true});return {...r,...await this.status(id)};}),disconnect:wrap(id=>this.disconnect(id)),view:wrap((id,v)=>this.view(id,v,windowFor))};
  this.p.app.resourceManager.define({name:'nrReddit',actions});this.p.app.acl.allow('nrReddit',Object.keys(actions),'loggedIn');}
}
export { RedditSource, thread, specification, result };
