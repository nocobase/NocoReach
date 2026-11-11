// @ts-nocheck
import type { Connections } from './plugin.js';
import { ProjectRuns } from './project-runs.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import { businessNow } from './business-clock.js';
import { lastSuccess } from './sync-policy.js';
import { terms } from './hackernews-source.js';
import { DataForSeo, liveTask } from './dataforseo.js';
import { createHash, randomUUID } from 'node:crypto';
import { TOPIC_PRICES, cleanTopic, topicKey } from '../../shared/followed-topics.js';
import { redditSchedule, termNextAt, canRecheckConfiguration } from './reddit-schedule.js';
import { organicLink, subredditOf } from './serp-links.js';
// Reddit 讨论 (SPEC §11 外部讨论, P1; 2026-10-03 user choice): Reddit's own API needs an approved app and, for brand
// monitoring, a paid commercial agreement, so threads are found through Google instead: once a week a search for
// site:reddit.com "<term>" on the shared DataForSEO layer (monthly budget, a check reused for 6 days, uncertain results not
// retried). The first check reads the most relevant threads, later ones the past month. Only threads Google has indexed
// are seen, and no votes or comment counts; titles, subreddits, snippets and links are kept, never authors.
// Followed topics (Project knowledge › Memory, 2026-11-10): besides the product name, one search a week for each topic,
// the past week's threads, two pages (kind reddit-topic, TOPIC_PRICES.redditUsd). They are kept apart (topicPosts),
// so what is said about the product and what the market discusses stay two lists.
// Since 2026-11-11 the searches go to DataForSEO's Standard queue, which waits for the result links Google hides
// (serp-links.ts) and costs less than Live: a search is posted, stays `queued` in the plan and is read at a later tick.
// A result whose link stayed hidden has no thread id; it counts only when its title and subreddit match a thread already
// known, otherwise it is skipped and counted (`lastRun.unresolved`).
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const DAY=86400000,MAX_POSTS=3000;
const iso=t=>new Date(t).toISOString().slice(0,10);
// The Monday of a business day's week: a topic is searched once in it.
const weekOf=t=>{const d=new Date(t);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return iso(d);};
const nextMonth=()=>{const d=new Date();return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)).toISOString();};
// A Reddit thread from a result address: www.reddit.com/r/<sub>/comments/<id>/<slug>, any reddit host; others are not threads.
function thread(url){let u;try{u=new URL(String(url||''));}catch{return null;}if(!/(^|\.)reddit\.com$/i.test(u.hostname))return null;
 const m=u.pathname.match(/^\/r\/([A-Za-z0-9_]{2,40})\/comments\/([a-z0-9]{3,12})(?:\/([^/]*))?/i);if(!m)return null;
 return {id:m[2].toLowerCase(),subreddit:m[1],url:`https://www.reddit.com/r/${m[1]}/comments/${m[2].toLowerCase()}/${m[3]?encodeURIComponent(decodeURIComponent(m[3])).slice(0,200)+'/':''}`};}
// Google's date for a result, as DataForSEO's advanced results give it ("2024-10-04 12:30:00 +00:00").
const day=v=>{const m=String(v||'').match(/^(\d{4}-\d{2}-\d{2})/);if(m)return m[1];const t=Date.parse(String(v||''));return Number.isFinite(t)?iso(t):null;};
function specification(v){const term=String(v.term||'').trim();if(term.length<3||term.length>60||/["\\]/.test(term))fail(systemMessageText('redditSource.enterProductName360'),400);
 // The advanced results (2026-10-09 user feedback: the page showed only when a thread was found, not when it was posted)
 // carry the date Google shows for a result and the “discussions and forums” box; same price as the regular ones. Price
 // (2026-11-11): $0.0006 a page of 10 results on the Standard queue, 10 pages, ×5 for the site: operator.
 return {kind:'reddit',view:'serp',target:term,queue:'serp/google/organic',path:'serp/google/organic/task_post',request:{keyword:`site:reddit.com "${term}"`,location_code:2840,language_code:'en',device:'desktop',depth:100,...(v.recent?{search_param:'&tbs=qdr:m'}:{})},recent:Boolean(v.recent),estimatedUsd:0.03,reservationUsd:0.05,priceVersion:'official-list-2026-11-11'};}
function topicSpecification(v){const topic=cleanTopic(v.term);if(!topic)fail(systemMessageText('memory.invalidTopic',{0:String(v.term||'')}),400);
 return {kind:'reddit-topic',view:'serp',target:topic,queue:'serp/google/organic',path:'serp/google/organic/task_post',request:{keyword:`site:reddit.com "${topic}"`,location_code:2840,language_code:'en',device:'desktop',depth:20,search_param:'&tbs=qdr:w'},recent:true,estimatedUsd:TOPIC_PRICES.redditUsd,reservationUsd:0.01,priceVersion:'official-list-2026-11-11'};}
// Threads among the results: organic links and Google's "discussions and forums" box. A result whose link Google hid
// goes to `hidden` with its subreddit (from the site name, breadcrumb or title) for matching, and is counted in the
// diagnostic (`unresolved`).
const titleOf=i=>String(i.title||'').replace(/\s*:\s*r\/\w+\s*$/i,'').slice(0,300);
function result(raw,spec){const {valid,empty,page,taskId,cost,status,reason,diagnostic}=liveTask(raw);
 if(!valid)return {status,taskId,errorCode:systemMessageText(`redditDiagnostic.${reason}`),result:{diagnostic},costUsd:cost};
 const items=(empty?[]:page.items||[]).flatMap(i=>i?.type==='discussions_and_forums'?(i.items||[]):[i]).filter(i=>['organic','discussions_and_forums_element'].includes(i?.type));
 const seen=new Set(),posts=[],hidden=[];for(const i of items){const link=organicLink(i);
  if(!link.resolved){hidden.push({title:titleOf(i),subreddit:subredditOf(i.website_name,i.breadcrumb,i.title),snippet:String(i.description||'').slice(0,400),postedAt:day(i.timestamp)});continue;}
  const t=thread(link.url);if(!t||seen.has(t.id))continue;seen.add(t.id);posts.push({...t,title:titleOf(i),snippet:String(i.description||'').slice(0,400),postedAt:day(i.timestamp)});}
 return {status:'completed',taskId,errorCode:null,result:{posts:posts.slice(0,100),hidden:hidden.slice(0,100),diagnostic:{...diagnostic,...(hidden.length?{unresolved:hidden.length}:{})}},costUsd:cost};}
// Hidden results that are threads already known (same subreddit and title, Google's cut-off "…" allowed), as those
// threads; the others are skipped.
const sameTitle=t=>String(t||'').normalize('NFKC').toLowerCase().replace(/(?:…|\.\.\.)\s*$/,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function matchHidden(hidden,known){const index=new Map();for(const p of known)if(p?.subreddit&&p.title){const k=`${p.subreddit.toLowerCase()}|${sameTitle(p.title)}`;if(!index.has(k))index.set(k,p);}
 const matched=[];let skipped=0;for(const h of hidden||[]){const sub=h.subreddit?.toLowerCase(),title=sameTitle(h.title),cut=/(?:…|\.\.\.)\s*$/.test(h.title||'');
  let p=sub&&title?index.get(`${sub}|${title}`):null;if(!p&&sub&&cut&&title.length>=15)p=known.find(x=>x?.subreddit?.toLowerCase()===sub&&sameTitle(x.title).startsWith(title))||null;
  const {title:_t,subreddit:_s,snippet,postedAt,...extra}=h;
  if(p)matched.push({...extra,id:p.id,subreddit:p.subreddit,url:p.url,title:p.title,snippet:snippet||p.snippet||'',postedAt:postedAt||p.postedAt||null});else skipped++;}
 return {matched,skipped};}
class RedditSource{
 readonly runs: ProjectRuns;
 constructor(p){this.p=p;this.runs=new ProjectRuns();(this.p as Connections).network?.bind(this,['connect', 'check'], 'dataforseo');this.d4s=new DataForSeo(p,{reddit:{specification,result,reuseMs:6*DAY,timeoutMs:120000},'reddit-topic':{specification:topicSpecification,result,reuseMs:6*DAY,timeoutMs:120000}});this.runs.bindRequest(this.d4s,'run');}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `reddit:${id}`;}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async mutate(id,fn){this.runs.assertActive();return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});this.runs.assertActive();const state=await fn(row?.get('payload')||null);this.runs.assertActive();if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else if(state)await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 async connect(id,v){return this.runs.run(id,async()=>{if(!this.d4s.config(id)?.verifiedAt)fail(systemMessageText('redditSource.redditDiscussionsSearchedThroughDataforseo'),409);const list=terms(v.terms);
  await this.mutate(id,old=>{const same=old&&JSON.stringify(old.terms)===JSON.stringify(list);return {...(same?old:{posts:{},lastRun:null,retainedFrom:null}),terms:list,status:'active',connectedAt:same?old.connectedAt:new Date().toISOString()};});
  this.runs.start(id,async()=>{await this.check(id);await this.collectTopics(id);});return this.status(id);},`connect:${JSON.stringify(v)}`);}
 async disconnect(id){await this.runs.cancel(id,()=>this.mutate(id,cur=>cur?{...cur,status:'disconnected'}:cur));return this.status(id);}
 // One search per term; new threads are added with the day they were first seen. Stops at the first budget refusal.
 check(id,options={}){return this.runs.run(id,()=>this.collect(id,options));}
 async collect(id,{force=false}={}){const s=await this.state(id);if(!s?.terms?.length||s.status==='disconnected')fail(systemMessageText('redditSource.connectRedditDiscussionsFirst'),409);
  const schedule=redditSchedule(s),unfinished=s.plan&&!s.plan.entries.every(e=>e.status==='completed');
  // Manual checks obey failure cooldowns, exhaustion and uncertain billing just like the scanner.
  // Reading a queued search again is free, so Update now reads it at once.
  const resume=e=>force&&(e.status==='budget'||e.status==='attention'||e.status==='queued'||canRecheckConfiguration(e));
  if(!schedule.due&&!s.plan?.entries.some(resume)&&(unfinished||schedule.kind==='attention'||!force))return {found:0,added:0,errors:s.lastRun?.ok?[]:s.lastRun?.errors?.length?s.lastRun.errors:[systemMessageText('redditDiagnostic.uncertain')]};
  const clock=businessNow(this.p,id,'dataforseo'),now=new Date(clock).toISOString(),at=new Date().toISOString();
  const backfill=!s.datesReadAt&&Object.values(s.posts||{}).some(p=>!p.postedAt);
  const plan=unfinished?structuredClone(s.plan):{recent:Boolean(s.retainedFrom)&&!backfill,cutoff:now,entries:s.terms.map(term=>({term,status:'pending',attempt:0,at}))};
  const due=plan.entries.filter(e=>{const next=termNextAt(e);return resume(e)||(next&&Date.parse(next)<=Date.now());});
  const fresh=e=>e.status!=='queued'&&(e.status!=='pending'||!e.requestKey);
  const prepare=!unfinished||due.some(fresh);
  for(const e of due)if(fresh(e)){if(!['budget','attention'].includes(e.status)){e.requestKey=`reddit-${randomUUID()}`;e.attempt++;}e.status='pending';e.at=at;}
  // Persist stable request keys before any paid I/O. Restarting an interrupted batch returns the same runs.
  if(prepare)await this.mutate(id,cur=>({...cur,plan}));
  const found=[],hidden=[];let reused=0;
  for(const entry of due){this.runs.assertActive();let run;try{run=entry.status==='queued'&&entry.runId?await this.d4s.collect(id,entry.runId):await this.d4s.run(id,'reddit',{term:entry.term,recent:plan.recent,requestKey:entry.requestKey});}
   catch(e){this.runs.assertActive();entry.status=e.safeCode==='budget_exceeded'?'budget':'attention';entry.diagnostic={reason:entry.status==='budget'?'budget':'configuration',retryable:false};
    if(entry.status==='budget'){const date=new Date();entry.at=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)).toISOString();for(const waiting of due.slice(due.indexOf(entry)+1)){waiting.status='budget';waiting.at=entry.at;waiting.diagnostic=entry.diagnostic;}break;}continue;}
   entry.status=run.status==='running'?'unknown':run.status;entry.runId=String(run.id||'');entry.diagnostic=run.status==='queued'?{reason:'queued',retryable:false}:run.result?.diagnostic||{reason:'uncertain',retryable:false};entry.at=run.status==='queued'?at:run.completedAt||at;
   if(run.status!=='completed')continue;
   if(run.reused)reused++;
   entry.queriedAt=run.createdAt||at;
   // A cache hit is historical evidence. Translate its age to the project's business clock without advancing coverage.
   entry.through=iso(Date.parse(plan.cutoff)-Math.max(0,Date.parse(at)-Date.parse(entry.queriedAt)));
   found.push(...(run.result?.posts||[]).map(p=>({...p,term:entry.term,runId:entry.runId})));hidden.push(...(run.result?.hidden||[]).map(h=>({...h,term:entry.term,runId:entry.runId})));}
  const errors=plan.entries.filter(e=>e.status!=='completed'&&e.status!=='queued').map(e=>`「${e.term}」：${systemMessageText(`redditDiagnostic.${e.diagnostic?.reason||'uncertain'}`)}`);
  const queued=plan.entries.filter(e=>e.status==='queued').length,known=matchHidden(hidden,[...found,...Object.values(s.posts||{})]);
  const ids=new Set(found.map(p=>p.id));found.push(...known.matched.filter(p=>!ids.has(p.id)&&ids.add(p.id)));
  const complete=plan.entries.every(e=>e.status==='completed'),through=complete?plan.entries.map(e=>e.through).sort()[0]:null;
  const successAt=complete?plan.entries.map(e=>e.queriedAt).sort()[0]:null;
  let added=0;
  await this.mutate(id,cur=>{if(!cur||JSON.stringify(cur.terms)!==JSON.stringify(s.terms))return cur;const posts={...(cur.posts||{})};
   for(const p of found){const old=posts[p.id];if(!old)added++;posts[p.id]={...p,firstSeenAt:old?.firstSeenAt||now,lastSeenAt:now,postedAt:p.postedAt||old?.postedAt||null};}
   const kept=Object.values(posts).sort((a,b)=>b.firstSeenAt.localeCompare(a.firstSeenAt)).slice(0,MAX_POSTS);
   return {...cur,plan,posts:Object.fromEntries(kept.map(p=>[p.id,p])),retainedFrom:cur.retainedFrom||(complete?through:null),lastRun:{at,ok:!errors.length,errors:errors.slice(0,5),found:found.length,added,...(queued?{queued}:{}),...(known.skipped?{unresolved:known.skipped}:{}),lastSuccessAt:successAt||lastSuccess(cur.lastRun)},dataThrough:through||cur.dataThrough||null,datesReadAt:cur.datesReadAt||(complete?plan.cutoff:null)};});
  // searched and reused let Update now say when every term came back from the 6-day reuse instead of a new search;
  // queued says how many searches DataForSEO is still running, unresolved how many results were skipped.
  return {found:found.length,added,errors,searched:due.length,reused,...(queued?{queued}:{}),...(known.skipped?{unresolved:known.skipped}:{})};}
 // The followed topics due this week, one search each under a key of the topic and the week, so a restart reads the same
 // run and an uncertain one is not paid for twice. The month's budget stops the round until the next month.
 checkTopics(id){return this.runs.run(id,()=>this.collectTopics(id),'topics');}
 async collectTopics(id){const s=await this.state(id),topics=(await this.p.followedTopics?.of(String(id)))||[];
  if(!s?.terms?.length||s.status==='disconnected'||!topics.length||!this.d4s.config(id)?.verifiedAt)return {searched:0,added:0};
  if(s.topicRun?.budgetUntil&&Date.parse(s.topicRun.budgetUntil)>Date.now())return {searched:0,added:0,budget:true};
  const clock=businessNow(this.p,id,'dataforseo'),now=new Date(clock).toISOString(),at=new Date().toISOString(),week=weekOf(clock);
  // A search still queued at DataForSEO is read again with its own request key (no new charge).
  const checks={...(s.topicChecks||{})},due=topics.filter(t=>{const c=checks[topicKey(t)];return c?.week!==week||c.status==='queued';});if(!due.length)return {searched:0,added:0};
  const found=[],hidden=[];let searched=0,budgetUntil=null;
  for(const topic of due){this.runs.assertActive();const k=topicKey(topic),requestKey=`reddit-topic-${createHash('sha1').update(`${id}:${k}:${week}`).digest('hex').slice(0,32)}`;let run;
   try{run=await this.d4s.run(id,'reddit-topic',{term:topic,requestKey});}
   catch(e){this.runs.assertActive();if(e.safeCode==='budget_exceeded'){budgetUntil=nextMonth();break;}checks[k]={topic,week,at,status:'attention'};continue;}
   searched++;checks[k]={topic,week,at:run.completedAt||at,status:run.status==='running'?'unknown':run.status,runId:String(run.id||'')};
   if(run.status==='completed'){found.push(...(run.result?.posts||[]).map(p=>({...p,topic})));hidden.push(...(run.result?.hidden||[]).map(h=>({...h,topic})));}}
  const known=matchHidden(hidden,[...found,...Object.values(s.topicPosts||{}),...Object.values(s.posts||{})]),ids=new Set(found.map(p=>p.id));found.push(...known.matched.filter(p=>!ids.has(p.id)&&ids.add(p.id)));
  let added=0;const keep=new Set(topics.map(topicKey));
  await this.mutate(id,cur=>{if(!cur)return cur;const posts={...(cur.topicPosts||{})};
   for(const {topic,...p} of found){const old=posts[p.id];if(!old)added++;posts[p.id]={...p,topics:[...new Set([...(old?.topics||[]),topic])],firstSeenAt:old?.firstSeenAt||now,lastSeenAt:now,postedAt:p.postedAt||old?.postedAt||null};}
   const kept=Object.values(posts).sort((a,b)=>b.firstSeenAt.localeCompare(a.firstSeenAt)).slice(0,MAX_POSTS);
   return {...cur,topicChecks:Object.fromEntries(Object.entries(checks).filter(([k])=>keep.has(k))),topicPosts:Object.fromEntries(kept.map(p=>[p.id,p])),topicRun:{at,week,searched,found:found.length,added,budgetUntil,...(known.skipped?{unresolved:known.skipped}:{})}};});
  return {searched,added,budget:Boolean(budgetUntil),...(known.skipped?{unresolved:known.skipped}:{})};}
 async status(id){const s=await this.state(id);if(!s?.terms?.length)return {connected:false,dataforseo:Boolean(this.d4s.config(id)?.verifiedAt)};const list=Object.values(s.posts||{});
  return {connected:s.status!=='disconnected',checking:this.runs.has(id),dataforseo:Boolean(this.d4s.config(id)?.verifiedAt),terms:s.terms,topicCount:((await this.p.followedTopics?.of(String(id)))||[]).length,lastRun:s.lastRun||null,retainedFrom:s.retainedFrom||null,total:list.length,
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
   posts:[...cur].sort((a,b)=>(b.postedAt||b.firstSeenAt).localeCompare(a.postedAt||a.firstSeenAt)).slice(0,50).map(p=>({id:p.id,title:p.title,url:p.url,subreddit:p.subreddit,snippet:p.snippet,postedAt:p.postedAt,firstSeenAt:p.firstSeenAt,term:p.term})),
   topic:await this.topicView(id,s,w,seenDay)};}
 // Threads on the followed topics in the range, newest first, each with the topics it came up under, and their subreddits.
 async topicView(id,s,w,seenDay){const topics=(await this.p.followedTopics?.of(String(id)))||[],keys=new Set(topics.map(topicKey));
  const list=Object.values(s.topicPosts||{}).map(p=>({...p,topics:(p.topics||[]).filter(t=>keys.has(topicKey(t)))})).filter(p=>p.topics.length&&seenDay(p)>=w.start&&seenDay(p)<=w.end);
  const subs=new Map();for(const p of list)subs.set(p.subreddit,(subs.get(p.subreddit)||0)+1);
  return {topics,lastRun:s.topicRun||null,count:list.length,subreddits:[...subs].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,12),
   posts:list.sort((a,b)=>(b.postedAt||b.firstSeenAt).localeCompare(a.postedAt||a.firstSeenAt)).slice(0,50).map(p=>({id:p.id,title:p.title,url:p.url,subreddit:p.subreddit,snippet:p.snippet,postedAt:p.postedAt,firstSeenAt:p.firstSeenAt,topics:p.topics}))};}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{const s=await this.state(String(id));if(!s?.terms?.length||s.status==='disconnected'||this.runs.has(String(id)))continue;await this.check(String(id)).catch(e=>this.p.app?.logger?.warn?.('NocoReach Reddit check failed',{projectId:id,message:e.message}));await this.checkTopics(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach Reddit topics check failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 async close(){await this.runs.close();}
 register(windowFor){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);ctx.set('Cache-Control','no-store');try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('redditSource.notLoadRedditDiscussionsTry'));}};
  const actions={status:wrap(id=>this.status(id)),connect:wrap((id,v)=>this.connect(id,v)),check:wrap(async id=>{const r=await this.check(id,{force:true});await this.checkTopics(id).catch(()=>undefined);return {...r,...await this.status(id)};}),disconnect:wrap(id=>this.disconnect(id)),view:wrap((id,v)=>this.view(id,v,windowFor))};
  this.p.app.resourceManager.define({name:'nrReddit',actions});this.p.app.acl.allow('nrReddit',Object.keys(actions),'loggedIn');}
}
export { RedditSource, thread, specification, topicSpecification, result };
