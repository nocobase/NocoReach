// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { randomUUID } from 'node:crypto';
import { VisibilityError } from './research-helpers.js';
import { markets, languages } from './keyword-policy.js';
import { projectId, requireAccess } from './policy.js';
import { DataForSeo } from './dataforseo.js';
import { organicLink, ownDomain, pageFor, savedResult, unresolvedCount, UNRESOLVED_SHARE } from './serp-links.js';
// 排名跟踪 (OpenSEO Rank Tracking, batch 4): keywords you choose are checked on Google once a week (user choice;
// desktop, top 100) through the shared DataForSEO layer, and the site's best position and page are kept per check.
// The weekly checks are the one paid query that runs on its own, because you switched tracking on; they stop at the
// monthly budget. 立即检查 keeps a check from the last 6 days, so it never pays twice in a week.
// Since 2026-11-11 every check goes to DataForSEO's Standard queue, the only mode that waits for Google's hidden result
// links (serp-links.ts); a check is posted, kept in `pending` and recorded when DataForSEO has done it (minutes later,
// read every 10 minutes). A result whose link stayed hidden is credited to the site its breadcrumb shows. A check that
// finds no site while more than UNRESOLVED_SHARE of the results are hidden is `uncertain`, not "not in the top 100": the
// history shows it as such, and moves and signals skip it.
const fail=(message,status=400)=>{throw new VisibilityError(message,status);};
const HOUR=3600000,DAY=86400000,WEEK=7*DAY,REUSE_MS=6*DAY,MAX_TRACKED=100,KEEP_CHECKS=60;
// Checks before this day could not have met hidden links (Google throttled them from late October 2026).
const HIDDEN_SINCE='2026-10-01';
const bare=d=>String(d||'').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/[/?#].*$/,'');
// Price (2026-11-11, dataforseo.com/pricing/serp/google-organic-serp-api): the Standard queue costs $0.0006 a result
// page of 10, and depth 100 is billed as 10 pages since Google stopped returning 100 results at once (Live: $0.02).
function specification(v){const keyword=String(v.target||'').trim().replace(/\s+/g,' ');if(keyword.length<2||keyword.length>100||/[:%\p{C}]/u.test(keyword))fail(systemMessageText('keywordPolicy.keywords2100CharactersWithout'));
 if(!markets.includes(Number(v.locationCode))||!languages.includes(v.language))fail(systemMessageText('aiSearch.pickSupportedRegionLanguage'));
 return {kind:'rank',view:'serp',target:keyword,locationCode:Number(v.locationCode),language:v.language,device:'desktop',queue:'serp/google/organic',path:'serp/google/organic/task_post',request:{keyword,location_code:Number(v.locationCode),language_code:v.language,device:'desktop',depth:100},estimatedUsd:0.006,reservationUsd:0.01,priceVersion:'official-list-2026-11-11'};}
// Keeps the organic results only (position, site, page, title); a hidden link keeps its breadcrumb and site name.
function result(raw,spec){const task=raw?.tasks?.[0],costUsd=Number.isFinite(raw?.cost)?raw.cost:null;
 // No Search Results is a complete answer: the site is not in the top 100.
 if(raw?.status_code===20000&&task?.status_code===40102)return {status:'completed',errorCode:null,result:{items:[],checkedFor:spec.target},costUsd};
 if(raw?.status_code!==20000||task?.status_code!==20000)return {status:'failed',errorCode:systemMessageText('rankTracking.searchResultsLookupFailed'),result:null,costUsd};
 const items=(task.result?.[0]?.items||[]).filter(i=>i.type==='organic').map(i=>{const {url,domain,resolved,shown,site}=organicLink(i);return {position:Number(i.rank_group)||null,domain,url,title:String(i.title||'').slice(0,200),...(resolved?{}:{resolved,...(shown?{shown}:{}),...(site?{site}:{})})};}).slice(0,100);
 return {status:'completed',errorCode:null,result:{items,checkedFor:spec.target},costUsd};}
// The site's best position among the results: its domains and their subdomains count, a hidden link by the site its
// breadcrumb shows, its page then found by the result's title among the site's known pages (`pages`, Website content).
// Not found while more than UNRESOLVED_SHARE of the results are hidden, the position is unknown: `uncertain`.
function sitePosition(items,domains,pages=[]){const own=domains.map(bare).filter(Boolean),list=(items||[]).map(savedResult),
 mine=list.filter(i=>ownDomain(i.resolved===false?i.domain:i.domain||i.url,own)).sort((a,b)=>(a.position||999)-(b.position||999))[0];
 if(mine)return {position:mine.position,url:mine.resolved===false?pageFor(mine,pages):mine.url};
 return {position:null,url:null,...(list.length&&unresolvedCount(list)/list.length>UNRESOLVED_SHARE?{uncertain:true}:{})};}
// The checks a move is measured on: an uncertain one says nothing about the position.
const certain=list=>(list||[]).filter(c=>!c.uncertain);
const trackKey=(k,l,g)=>`${String(k).toLowerCase()}|${l}|${g}`;
class RankTracking{
 constructor(p){this.p=p;this.d4s=new DataForSeo(p,{rank:{specification,result,reuseMs:REUSE_MS}});}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `rank-tracking:${id}`;}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 // The latest results of each keyword that fell since its check before, by keyword id: the sites now above the project.
 async serps(id,s){const fell=(s?.keywords||[]).map(k=>[k.id,certain(s.checks?.[k.id])]).filter(([,l])=>l.length>1&&l.at(-1).runId&&(l.at(-1).position?l.at(-2).position&&l.at(-1).position>l.at(-2).position:l.at(-2).position)).map(([k,l])=>[k,String(l.at(-1).runId)]);if(!fell.length)return {};
  const runs=await this.p.db.getRepository('nrKeywordRuns').find({filter:{id:{$in:fell.map(([,r])=>r)},projectId:id}}),items=new Map(runs.map(r=>[String(r.get('id')),(r.get('result')?.items||[]).map(savedResult)]));return Object.fromEntries(fell.map(([k,r])=>[k,items.get(r)||[]]));}
 async mutate(id,fn){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});const state=await fn(row?.get('payload')||{keywords:[],checks:{}});if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 async add(id,v){const list=(Array.isArray(v.keywords)?v.keywords:[]).slice(0,MAX_TRACKED).map(k=>({keyword:String(k.keyword||'').trim().replace(/\s+/g,' '),locationCode:Number(k.locationCode),language:String(k.language||'')}));
  for(const k of list)specification({target:k.keyword,locationCode:k.locationCode,language:k.language});if(!list.length)fail(systemMessageText('rankTracking.pickKeywordsTrack'));
  return this.mutate(id,cur=>{const have=new Set(cur.keywords.map(k=>trackKey(k.keyword,k.locationCode,k.language))),next=[...cur.keywords];let added=0;
   for(const k of list){const tk=trackKey(k.keyword,k.locationCode,k.language);if(have.has(tk))continue;if(next.length>=MAX_TRACKED)fail(systemMessageText('messages.trackUpKeywords', { 0: MAX_TRACKED }),409);have.add(tk);next.push({id:randomUUID().slice(0,12),...k,addedAt:new Date().toISOString()});added++;}
   return {...cur,keywords:next,lastAdded:added};});}
 async remove(id,v){const ids=new Set((Array.isArray(v.ids)?v.ids:[]).map(String));return this.mutate(id,cur=>{const checks={...cur.checks},pending={...cur.pending};for(const k of ids){delete checks[k];delete pending[k];}return {...cur,keywords:cur.keywords.filter(k=>!ids.has(k.id)),checks,pending};});}
 // The site's known pages, to find the page of a result whose link stayed hidden.
 async pages(id){try{return (await this.p.siteContent?.state(id))?.pages||[];}catch{return [];}}
 // Records a check's run: a queued one stays pending, a done one becomes the keyword's check; anything else ends it.
 async record(id,k,run,{domains,pages}){if(run.status==='queued'){await this.mutate(id,cur=>({...cur,pending:{...cur.pending,[k.id]:{runId:String(run.id),at:cur.pending?.[k.id]?.at||new Date().toISOString()}}}));return 'queued';}
  const done=run.status==='completed',pos=done?sitePosition(run.result?.items,domains,pages):null,at=run.completedAt||new Date().toISOString();
  await this.mutate(id,cur=>{const pending={...cur.pending};delete pending[k.id];if(!done||!cur.keywords.some(x=>x.id===k.id))return {...cur,pending};const list=(cur.checks?.[k.id]||[]).filter(c=>String(c.runId)!==String(run.id));
   return {...cur,pending,checks:{...cur.checks,[k.id]:[...list,{at,position:pos.position,url:pos.url,runId:String(run.id),...(pos.uncertain?{uncertain:true}:{})}].slice(-KEEP_CHECKS)}};});
  return done?'checked':'ended';}
 // Reads the checks posted earlier, then posts the keywords due (none in the last week), or all when asked (Update now:
 // those without a known position from the last 6 days); stops at the first budget refusal. `post: false` only reads.
 async check(id,{all=false,retryUncertain=false,post=true}={}){const s=await this.state(id);if(!s?.keywords?.length)return {checked:0,errors:[]};const project=await this.p.project(id),domains=project.domains||[],now=Date.now(),errors=[];let checked=0,reused=0,queued=0,read=0,uncertain=false;
  const pages=await this.pages(id),ctx={domains,pages},failed=(k,run)=>{if(run.status==='unknown')uncertain=true;errors.push(`${k.keyword}：${run.errorCode||systemMessageText('common.notComplete')}`);};
  for(const [kid,p] of Object.entries(s.pending||{})){const k=s.keywords.find(x=>x.id===kid);let run;
   try{run=k?await this.d4s.collect(id,p.runId):{status:'gone'};}catch(e){run=e.status===404?{status:'gone'}:null;}if(!run)continue;
   if(!k||run.status==='gone'){await this.mutate(id,cur=>{const pending={...cur.pending};delete pending[kid];return {...cur,pending};});continue;}
   const r=await this.record(id,k,run,ctx);if(r==='queued'){queued++;continue;}read++;if(r==='checked')checked++;else failed(k,run);}
  if(post)for(const k of s.keywords){if(s.pending?.[k.id])continue;const last=(s.checks?.[k.id]||[]).at(-1);if(!all&&last&&now-Date.parse(last.at)<WEEK-6*HOUR)continue;
   // A known position from the last 6 days is kept and counted, so the page can say how many were not asked anew.
   if(all&&last&&!last.uncertain&&now-Date.parse(last.at)<REUSE_MS){checked++;reused++;continue;}
   let run;try{run=await this.d4s.run(id,'rank',{target:k.keyword,locationCode:k.locationCode,language:k.language,requestKey:`rank-${k.id}-${now}`,retryUncertain,...(all?{forceRefresh:true}:{})});}catch(e){errors.push(`${k.keyword}：${e.message}`);if(/预算/.test(e.message))break;continue;}
   const r=await this.record(id,k,run,ctx);if(r==='queued'){queued++;continue;}if(r!=='checked'){failed(k,run);continue;}checked++;if(run.reused)reused++;}
  if(post||read)await this.mutate(id,cur=>({...cur,lastRun:{at:new Date().toISOString(),ok:!errors.length,errors:errors.slice(0,5),checked,...(queued?{queued}:{}),...(uncertain?{uncertain:true}:{})}}));
  return {checked,reused,queued,errors};}
 async status(id){const s=await this.state(id);if(!s)return {keywords:[],lastRun:null};return {lastRun:s.lastRun||null,keywords:s.keywords.map(k=>{const list=s.checks?.[k.id]||[],last=list.at(-1),prev=certain(list.slice(0,-1)).at(-1);return {...k,latest:last||null,previous:prev||null,history:list.slice(-12),nextCheckAt:last?new Date(Date.parse(last.at)+WEEK).toISOString():null,checking:s.pending?.[k.id]?.at||null};})};}
 // Checks made while DataForSEO's Live answers hid result links (late October to 2026-11-11) found no site and were saved
 // as "not in the top 100". Once per project (`linksReviewed`), those where more than UNRESOLVED_SHARE of the saved results
 // are hidden Google links are marked uncertain, so they never read as a drop.
 async reviewHiddenLinks(){let marked=0;for(const id of await this.p.projectIds()){const s=await this.state(id);if(!s?.keywords?.length||s.linksReviewed)continue;
   const ids=[...new Set(Object.values(s.checks||{}).flat().filter(c=>c.position==null&&!c.uncertain&&c.runId&&String(c.at)>=HIDDEN_SINCE).map(c=>String(c.runId)))];
   const runs=ids.length?await this.p.db.getRepository('nrKeywordRuns').find({filter:{id:{$in:ids},projectId:id}}):[];
   const hidden=new Set(runs.filter(r=>{const items=(r.get('result')?.items||[]).map(savedResult);return items.length&&unresolvedCount(items)/items.length>UNRESOLVED_SHARE;}).map(r=>String(r.get('id'))));
   await this.mutate(id,cur=>({...cur,linksReviewed:true,checks:Object.fromEntries(Object.entries(cur.checks||{}).map(([k,l])=>[k,l.map(c=>c.position==null&&!c.uncertain&&hidden.has(String(c.runId))?(marked++,{...c,uncertain:true}):c)]))}));}
  return marked;}
 // Every 10 minutes: reads the checks DataForSEO has done; posts the due ones once an hour.
 async tick(){if(this.busy)return;this.busy=true;const post=Date.now()-(this.postedAt||0)>=HOUR-60000;if(post)this.postedAt=Date.now();
  try{for(const id of await this.p.projectIds()){try{const s=await this.state(id);if(s?.keywords?.length&&(post||Object.keys(s.pending||{}).length))await this.check(id,{post});}catch(e){this.p.app?.logger?.warn?.('NocoReach rank tracking failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);ctx.set('Cache-Control','no-store');try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('rankTracking.rankTrackingNotCompleteTry'));}};
  const actions={status:wrap(id=>this.status(id)),add:wrap(async(id,v)=>{const s=await this.add(id,v);this.check(id).catch(()=>undefined);return {added:s.lastAdded,...await this.status(id)};}),remove:wrap(async(id,v)=>{await this.remove(id,v);return this.status(id);}),check:wrap(async (id,v)=>{if(this.busy)fail(systemMessageText('rankTracking.checkingRefreshMoment'),409);this.busy=true;try{const r=await this.check(id,{all:true,retryUncertain:v.retryUncertain===true});return {...r,...await this.status(id)};}finally{this.busy=false;}})};
  this.p.app.resourceManager.define({name:'nrRankTracking',actions});this.p.app.acl.allow('nrRankTracking',Object.keys(actions),'loggedIn');}
}
export { RankTracking, specification, result, sitePosition, certain };