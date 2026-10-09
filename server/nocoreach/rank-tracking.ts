// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { randomUUID } from 'node:crypto';
import { VisibilityError } from './research-helpers.js';
import { markets, languages } from './keyword-policy.js';
import { projectId, requireAccess } from './policy.js';
import { DataForSeo } from './dataforseo.js';
// 排名跟踪 (OpenSEO Rank Tracking, batch 4): keywords you choose are checked on Google once a week (user choice;
// desktop, top 100) through the shared DataForSEO layer, and the site's best position and page are kept per check.
// The weekly checks are the one paid query that runs on its own, because you switched tracking on; they stop at the
// monthly budget. 立即检查 reuses a check from the last 6 days, so it never pays twice in a week.
const fail=(message,status=400)=>{throw new VisibilityError(message,status);};
const DAY=86400000,WEEK=7*DAY,MAX_TRACKED=100,KEEP_CHECKS=60;
const bare=d=>String(d||'').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/[/?#].*$/,'');
function specification(v){const keyword=String(v.target||'').trim().replace(/\s+/g,' ');if(keyword.length<2||keyword.length>100||/[:%\p{C}]/u.test(keyword))fail('关键词需为 2–100 字符，不支持冒号、百分号或控制字符');
 if(!markets.includes(Number(v.locationCode))||!languages.includes(v.language))fail('请选择支持的地区和语言');
 return {kind:'rank',view:'serp',target:keyword,locationCode:Number(v.locationCode),language:v.language,device:'desktop',path:'serp/google/organic/live/regular',request:{keyword,location_code:Number(v.locationCode),language_code:v.language,device:'desktop',depth:100},estimatedUsd:0.002,reservationUsd:0.01,priceVersion:'official-list-2026-09-23'};}
// Keeps the organic results only (position, domain, page, title).
function result(raw,spec){const task=raw?.tasks?.[0];if(raw?.status_code!==20000||task?.status_code!==20000)return {status:'failed',errorCode:'搜索结果查询失败',result:null,costUsd:Number.isFinite(raw?.cost)?raw.cost:null};
 const items=(task.result?.[0]?.items||[]).filter(i=>i.type==='organic').map(i=>({position:Number(i.rank_group)||null,domain:String(i.domain||''),url:String(i.url||''),title:String(i.title||'').slice(0,200)})).slice(0,100);
 return {status:'completed',errorCode:null,result:{items,checkedFor:spec.target},costUsd:Number.isFinite(raw.cost)?raw.cost:null};}
// The site's best position among the results: its domains and their subdomains count.
function sitePosition(items,domains){const own=domains.map(bare).filter(Boolean),mine=(items||[]).filter(i=>{const d=bare(i.domain||i.url);return own.some(o=>d===o||d.endsWith('.'+o));}).sort((a,b)=>(a.position||999)-(b.position||999))[0];return mine?{position:mine.position,url:mine.url}:{position:null,url:null};}
const trackKey=(k,l,g)=>`${String(k).toLowerCase()}|${l}|${g}`;
class RankTracking{
 constructor(p){this.p=p;this.d4s=new DataForSeo(p,{rank:{specification,result,reuseMs:6*DAY}});}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `rank-tracking:${id}`;}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async mutate(id,fn){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});const state=await fn(row?.get('payload')||{keywords:[],checks:{}});if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 async add(id,v){const list=(Array.isArray(v.keywords)?v.keywords:[]).slice(0,MAX_TRACKED).map(k=>({keyword:String(k.keyword||'').trim().replace(/\s+/g,' '),locationCode:Number(k.locationCode),language:String(k.language||'')}));
  for(const k of list)specification({target:k.keyword,locationCode:k.locationCode,language:k.language});if(!list.length)fail('请选择要跟踪的关键词');
  return this.mutate(id,cur=>{const have=new Set(cur.keywords.map(k=>trackKey(k.keyword,k.locationCode,k.language))),next=[...cur.keywords];let added=0;
   for(const k of list){const tk=trackKey(k.keyword,k.locationCode,k.language);if(have.has(tk))continue;if(next.length>=MAX_TRACKED)fail(`最多跟踪 ${MAX_TRACKED} 个关键词`,409);have.add(tk);next.push({id:randomUUID().slice(0,12),...k,addedAt:new Date().toISOString()});added++;}
   return {...cur,keywords:next,lastAdded:added};});}
 async remove(id,v){const ids=new Set((Array.isArray(v.ids)?v.ids:[]).map(String));return this.mutate(id,cur=>{const checks={...cur.checks};for(const k of ids)delete checks[k];return {...cur,keywords:cur.keywords.filter(k=>!ids.has(k.id)),checks};});}
 // Checks the keywords due (none in the last week), or all when asked; stops at the first budget refusal.
 async check(id,{all=false}={}){const s=await this.state(id);if(!s?.keywords?.length)return {checked:0,errors:[]};const project=await this.p.project(id),domains=project.domains||[],now=Date.now(),errors=[];let checked=0;
  for(const k of s.keywords){const last=(s.checks?.[k.id]||[]).at(-1);if(!all&&last&&now-Date.parse(last.at)<WEEK-6*3600000)continue;
   let run;try{run=await this.d4s.run(id,'rank',{target:k.keyword,locationCode:k.locationCode,language:k.language,requestKey:`rank-${k.id}-${now}`});}catch(e){errors.push(`${k.keyword}：${e.message}`);if(/预算/.test(e.message))break;continue;}
   if(run.status!=='completed'){errors.push(`${k.keyword}：${run.errorCode||'没有完成'}`);continue;}
   const pos=sitePosition(run.result?.items,domains),at=run.completedAt||new Date().toISOString();checked++;
   await this.mutate(id,cur=>{if(!cur.keywords.some(x=>x.id===k.id))return cur;const list=(cur.checks?.[k.id]||[]).filter(c=>String(c.runId)!==String(run.id));return {...cur,checks:{...cur.checks,[k.id]:[...list,{at,position:pos.position,url:pos.url,runId:String(run.id)}].slice(-KEEP_CHECKS)}};});}
  await this.mutate(id,cur=>({...cur,lastRun:{at:new Date().toISOString(),ok:!errors.length,errors:errors.slice(0,5),checked}}));
  return {checked,errors};}
 async status(id){const s=await this.state(id);if(!s)return {keywords:[],lastRun:null};return {lastRun:s.lastRun||null,keywords:s.keywords.map(k=>{const list=s.checks?.[k.id]||[],last=list.at(-1),prev=list.at(-2);return {...k,latest:last||null,previous:prev||null,history:list.slice(-12),nextCheckAt:last?new Date(Date.parse(last.at)+WEEK).toISOString():null};})};}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{const s=await this.state(id);if(s?.keywords?.length)await this.check(id);}catch(e){this.p.app?.logger?.warn?.('NocoReach rank tracking failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);ctx.set('Cache-Control','no-store');try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'排名跟踪没有完成，请稍后重试');}};
  const actions={status:wrap(id=>this.status(id)),add:wrap(async(id,v)=>{const s=await this.add(id,v);this.check(id).catch(()=>undefined);return {added:s.lastAdded,...await this.status(id)};}),remove:wrap(async(id,v)=>{await this.remove(id,v);return this.status(id);}),check:wrap(async id=>{if(this.busy)fail('正在检查，请稍后刷新',409);this.busy=true;try{const r=await this.check(id,{all:true});return {...r,...await this.status(id)};}finally{this.busy=false;}})};
  this.p.app.resourceManager.define({name:'nrRankTracking',actions});this.p.app.acl.allow('nrRankTracking',Object.keys(actions),'loggedIn');}
}
export { RankTracking, specification, result, sitePosition };