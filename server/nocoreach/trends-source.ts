// @ts-nocheck
import type { Connections } from './plugin.js';
import { ProjectRuns } from './project-runs.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { businessNow } from './business-clock.js';
import { createHash } from 'node:crypto';
import { projectId, requireAccess } from './policy.js';
import { DataForSeo } from './dataforseo.js';
// 趋势 (SPEC §11 市场需求, Google Trends; 2026-10-04 user choice: weekly, automatic). Google's own Trends API is an alpha
// open by application only, so the data comes through the shared DataForSEO layer (Google Trends Explore, live): once a
// week one run of two requests — interest over the past 12 months for up to five terms (the product and competitors) and
// the searches related to the first term (top and rising). About $0.011 a request, inside the monthly budget; a run is
// reused for 6 days and an uncertain one is never retried. Values are Google's relative interest, 0–100 within one run.
// 关注的关键词 (2026-10-04 user choice): up to ten keywords added on the 趋势 page, each queried on its own (its own
// 12-month line, 100 = its own busiest week, so keywords are not compared with each other) with its related searches,
// one request of about $0.011 a keyword a week; queried right after being added, then weekly with the rest.
// 产品与竞品 (2026-10-05 user choice): the product name is set here, the competitors come from 竞品 (its list, kept in
// one place); with more than four, the user picks which four. A change in the list queries the comparison again.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
// Google Trends live can take well over the default 45 s with five words (2026-10-05: a run cut off at 45 s was left
// uncertain), so it waits up to two minutes; the checks run in the background and the page polls.
const DAY=86400000,WEEK=7*DAY,PATH='keywords_data/google_trends/explore/live',MAX_KEYWORDS=10,MAX_RIVALS=4,TIMEOUT=120000;
const LOCATIONS=[[0,systemMessageText('common.worldwide')],[2840,systemMessageText('aiQuestions.unitedStates')],[2826,systemMessageText('competitorResearch.unitedKingdom')],[2276,systemMessageText('competitorResearch.germany')],[2250,systemMessageText('competitorResearch.france')],[2392,systemMessageText('competitorResearch.japan')],[2156,systemMessageText('competitorResearch.china')],[2356,systemMessageText('competitorResearch.india')],[2076,systemMessageText('competitorResearch.brazil')]];
const placeName=code=>(LOCATIONS.find(([c])=>c===Number(code||0))||LOCATIONS[0])[1];
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
// Up to five terms, each a phrase of 2–60 characters, the first being the product.
function termsOf(input){const list=(Array.isArray(input)?input:String(input||'').split(/[,，、\n]/)).map(t=>String(t).trim().replace(/\s+/g,' ')).filter(Boolean),seen=new Set(),out=[];
 for(const t of list){if(t.length<2||t.length>60||/["\\]/.test(t))fail(systemMessageText('messages.invalidSearchTerm', { 0: t.slice(0,20) }));if(!seen.has(t.toLowerCase())){seen.add(t.toLowerCase());out.push(t);}}
 if(!out.length)fail(systemMessageText('trendsSource.enterLeastOneTermLike'));if(out.length>5)fail(systemMessageText('trendsSource.compareUp5Terms'));return out;}
function specification(v){const terms=termsOf(v.terms),location=Number(v.locationCode||0);if(!LOCATIONS.some(([c])=>c===location))fail(systemMessageText('trendsSource.regionNotSupported'));
 const base={time_range:'past_12_months',language_code:'en',...(location?{location_code:location}:{})};
 return {kind:'trends',terms,locationCode:location||null,requests:[{path:PATH,body:{keywords:terms,...base,item_types:['google_trends_graph']}},{path:PATH,body:{keywords:[terms[0]],...base,item_types:['google_trends_queries_list']}}],
  estimatedUsd:0.022,reservationUsd:0.05,timeoutMs:TIMEOUT,priceVersion:'official-list-2026-07'};}
// Weekly points with one value per term (null where Google has none) and the related searches of the first term.
function result(raws,spec){const tasks=raws.map(r=>(Array.isArray(r?.tasks)?r.tasks[0]:null)||{}),costs=raws.map((r,i)=>num(r?.cost)??num(tasks[i].cost));
 const costUsd=costs.every(c=>c!==null&&c>=0)?Number(costs.reduce((a,b)=>a+b,0).toFixed(6)):null;
 if(raws.some((r,i)=>r?.status_code!==20000||tasks[i].status_code!==20000))return {status:'failed',errorCode:systemMessageText('trendsSource.googleTrendsCheckFailed'),result:null,costUsd};
 const items=i=>tasks[i].result?.[0]?.items||[],graph=items(0).find(x=>x?.type==='google_trends_graph'),lists=items(1).find(x=>x?.type==='google_trends_queries_list')?.data||{};
 const points=(graph?.data||[]).filter(d=>d?.date_from).map(d=>({date:String(d.date_from).slice(0,10),values:spec.terms.map((_,i)=>d.missing_data?null:num(d.values?.[i]))}));
 const list=a=>(Array.isArray(a)?a:[]).map(x=>({query:String(x?.query||'').trim().slice(0,120),value:num(x?.value)||0})).filter(x=>x.query).slice(0,25);
 return {status:'completed',errorCode:null,result:{terms:spec.terms,points,top:list(lists.top),rising:list(lists.rising),checkUrl:String(tasks[0].result?.[0]?.check_url||'')||null},costUsd};}
// One watched keyword: interest over 12 months and its related searches in one request.
function keywordSpecification(v){const [keyword]=termsOf([v.keyword]),location=Number(v.locationCode||0);if(!LOCATIONS.some(([c])=>c===location))fail(systemMessageText('trendsSource.regionNotSupported'));
 return {kind:'trends-keyword',keyword,locationCode:location||null,path:PATH,request:{keywords:[keyword],time_range:'past_12_months',language_code:'en',...(location?{location_code:location}:{}),item_types:['google_trends_graph','google_trends_queries_list']},
  estimatedUsd:0.011,reservationUsd:0.025,timeoutMs:TIMEOUT,priceVersion:'official-list-2026-07'};}
function keywordResult(raw){const task=(Array.isArray(raw?.tasks)?raw.tasks[0]:null)||{},costUsd=num(raw?.cost)??num(task.cost);
 if(raw?.status_code!==20000||task.status_code!==20000)return {status:'failed',errorCode:systemMessageText('trendsSource.googleTrendsCheckFailed'),result:null,costUsd};
 const items=task.result?.[0]?.items||[],graph=items.find(x=>x?.type==='google_trends_graph'),lists=items.find(x=>x?.type==='google_trends_queries_list')?.data||{};
 const list=a=>(Array.isArray(a)?a:[]).map(x=>({query:String(x?.query||'').trim().slice(0,120),value:num(x?.value)||0})).filter(x=>x.query).slice(0,25);
 return {status:'completed',errorCode:null,result:{points:(graph?.data||[]).filter(d=>d?.date_from).map(d=>({date:String(d.date_from).slice(0,10),value:d.missing_data?null:num(d.values?.[0])})),top:list(lists.top),rising:list(lists.rising),checkUrl:String(task.result?.[0]?.check_url||'')||null},costUsd};}
const keywordId=k=>createHash('sha1').update(k.toLowerCase()).digest('hex').slice(0,10);
const KEYWORD_NOTES=[systemMessageText('trendsSource.followedKeywordCheckedSeparately100')];
const avg=list=>{const v=list.filter(x=>x!==null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
// Per term: the 12-month average and the last four weeks against the four before them.
function summary(latest){const p=latest?.points||[];return (latest?.terms||[]).map((term,i)=>{const vals=p.map(x=>x.values[i]),now=avg(vals.slice(-4)),before=avg(vals.slice(-8,-4));
 return {term,average:avg(vals)===null?null:Math.round(avg(vals)),recent:now===null?null:Math.round(now),change:now!==null&&before?Number(((now-before)/before).toFixed(3)):null};});}
// A watched keyword's numbers: the last four weeks, their change against the four before, the 12-month average.
function keywordSummary(k){const vals=(k.latest?.points||[]).map(x=>x.value),now=avg(vals.slice(-4)),before=avg(vals.slice(-8,-4)),all=avg(vals);
 return {recent:now===null?null:Math.round(now),change:now!==null&&before?Number(((now-before)/before).toFixed(3)):null,average:all===null?null:Math.round(all)};}
const newSince=(seen,q,since)=>Boolean(seen?.[q.query.toLowerCase()])&&Date.parse(seen[q.query.toLowerCase()])>=since;
class TrendsSource{
 readonly runs: ProjectRuns;
 constructor(p){this.p=p;this.runs=new ProjectRuns();(this.p as Connections).network?.bind(this,['connect', 'check', 'checkKeyword', 'checkAll']);this.d4s=new DataForSeo(p,{trends:{specification,result,reuseMs:6*DAY},'trends-keyword':{specification:keywordSpecification,result:keywordResult,reuseMs:6*DAY}});this.keywordChecks=new Set();this.runs.bindRequest(this.d4s,'run');}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `trends:${id}`;}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async mutate(id,fn){this.runs.assertActive();return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});this.runs.assertActive();const state=await fn(row?.get('payload')||null);this.runs.assertActive();if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else if(state)await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 async connect(id,v){return this.runs.run(id,async()=>{if(!this.d4s.config(id)?.verifiedAt)fail(systemMessageText('trendsSource.trendsUsesDataforseoCheckGoogle'),409);
  const [product]=termsOf([String(v.product??(Array.isArray(v.terms)?v.terms[0]:String(v.terms||'').split(/[,，、\n]/)[0])??'')]),cur=await this.state(id),{terms}=await this.rivals(id,{...cur,product}),spec=specification({terms,locationCode:v.locationCode});
  await this.mutate(id,old=>{const same=old&&JSON.stringify([old.terms,old.locationCode])===JSON.stringify([spec.terms,spec.locationCode]);return {...(same?old:{latest:null,risingSeen:{},lastRun:null,keywords:old?.keywords||[],pick:old?.pick}),product,terms:spec.terms,locationCode:spec.locationCode,status:'active',connectedAt:same?old.connectedAt:new Date().toISOString()};});
  this.start(id);return this.status(id);},`connect:${JSON.stringify(v)}`);}
 // The comparison's words: the product, then the competitors in 竞品 (the picked four when there are more).
 async rivals(id,s){const product=s?.product||s?.terms?.[0]||'',list=((await this.p.competitors?.state(id).catch(()=>null))?.list||[]).filter(c=>{const n=String(c.name||'').trim();return n.length>=2&&n.length<=60&&!/["\\]/.test(n)&&n.toLowerCase()!==product.toLowerCase();});
  const picked=(s?.pick||[]).filter(pid=>list.some(c=>c.id===pid)).slice(0,MAX_RIVALS),chosen=list.length>MAX_RIVALS?[...picked,...list.map(c=>c.id).filter(cid=>!picked.includes(cid))].slice(0,MAX_RIVALS):list.map(c=>c.id);
  return {terms:[product,...list.filter(c=>chosen.includes(c.id)).map(c=>c.name.trim())].filter(Boolean),competitors:list.map(c=>({id:c.id,name:c.name.trim(),included:chosen.includes(c.id)}))};}
 // Keeps the comparison in step with 竞品: a different set of words is queried again (about $0.022).
 async sync(id){const s=await this.state(id);if(!s?.terms?.length||s.status==='disconnected')return false;const {terms}=await this.rivals(id,s);if(!terms.length||JSON.stringify(terms)===JSON.stringify(s.terms))return false;
  await this.mutate(id,cur=>cur?{...cur,product:cur.product||cur.terms[0],terms,latest:null,risingSeen:{},lastRun:null}:cur);this.start(id);return true;}
 async pick(id,v){const ids=(Array.isArray(v.competitorIds)?v.competitorIds:[]).map(String).slice(0,MAX_RIVALS);await this.mutate(id,cur=>cur?{...cur,pick:ids}:cur);await this.sync(id);return this.view(id);}
 start(id,force=true){this.runs.start(id,()=>this.check(id,{force}),'brand');}
 async disconnect(id){await this.runs.cancel(id,()=>this.mutate(id,cur=>cur?{...cur,status:'disconnected'}:cur));return this.status(id);}
 check(id,options={}){return this.runs.run(id,()=>this.collect(id,options),'brand');}
 async collect(id,{force=false,retry=false}={}){const s=await this.state(id);if(!s?.terms?.length||s.status==='disconnected')fail(systemMessageText('trendsSource.connectTrendsFirst'),409);
  if(!force&&s.lastRun&&Date.now()-Date.parse(s.lastRun.at)<WEEK-6*3600000)return {skipped:true};
  const now=new Date(businessNow(this.p,id)).toISOString(),at=new Date().toISOString();let run,error='';
  this.runs.assertActive();try{run=await this.d4s.run(id,'trends',{terms:s.terms,locationCode:s.locationCode||0,requestKey:`trends-${id}-${Date.now()}`,retryUncertain:retry});if(run.status!=='completed')error=run.errorCode||systemMessageText('common.notComplete');}catch(e){error=e.message;}
  await this.mutate(id,cur=>{if(!cur||JSON.stringify(cur.terms)!==JSON.stringify(s.terms))return cur;if(error)return {...cur,lastRun:{at,ok:false,errors:[error]}};
   const r=run.result,seen={...(cur.risingSeen||{})},first=!cur.latest;for(const q of r.rising){const k=q.query.toLowerCase();if(!(k in seen))seen[k]=first?'':now;}
   return {...cur,latest:{at:now,...r},risingSeen:Object.fromEntries(Object.entries(seen).slice(-500)),lastRun:{at,ok:true,errors:[]}};});
  return {ok:!error,error};}
 // 关注的关键词: add (queried at once in the background), remove, and the weekly check of each.
 async addKeyword(id,v){if(!this.d4s.config(id)?.verifiedAt)fail(systemMessageText('trendsSource.keywordTrendsUseDataforseoCheck'),409);const [keyword]=termsOf([v.keyword]),kid=keywordId(keyword);
  await this.mutate(id,cur=>{const list=cur?.keywords||[];if(list.some(k=>k.id===kid))fail(systemMessageText('messages.alreadyFollowing', { 0: keyword }));if(list.length>=MAX_KEYWORDS)fail(systemMessageText('messages.followUpKeywords', { 0: MAX_KEYWORDS }));
   return {...(cur||{terms:[],status:'disconnected',latest:null,risingSeen:{},lastRun:null}),keywords:[...list,{id:kid,keyword,addedAt:new Date().toISOString(),latest:null,risingSeen:{},lastRun:null}]};});
  this.startKeyword(id,kid);return this.view(id);}
 async removeKeyword(id,v){const kid=String(v.keywordId||'');await this.mutate(id,cur=>cur?{...cur,keywords:(cur.keywords||[]).filter(k=>k.id!==kid)}:cur);return this.view(id);}
 startKeyword(id,kid,{retry=false}={}){const key=`${id}:${kid}`;if(this.keywordChecks.has(key))return;this.keywordChecks.add(key);this.keywordRun=this.checkKeyword(id,kid,{force:true,retry}).catch(()=>undefined).finally(()=>this.keywordChecks.delete(key));}
 checkKeyword(id,kid,options={}){return this.runs.run(id,()=>this.collectKeyword(id,kid,options),`keyword:${kid}`);}
 async collectKeyword(id,kid,{force=false,retry=false}={}){const s=await this.state(id),k=(s?.keywords||[]).find(x=>x.id===kid);if(!k)return {skipped:true};
  if(!force&&k.lastRun&&Date.now()-Date.parse(k.lastRun.at)<WEEK-6*3600000)return {skipped:true};
  const now=new Date(businessNow(this.p,id)).toISOString(),at=new Date().toISOString();let run,error='';
  this.runs.assertActive();try{run=await this.d4s.run(id,'trends-keyword',{keyword:k.keyword,locationCode:s.locationCode||0,requestKey:`trends-kw-${id}-${kid}-${Date.now()}`,retryUncertain:retry});if(run.status!=='completed')error=run.errorCode||systemMessageText('common.notComplete');}catch(e){error=e.message;}
  await this.mutate(id,cur=>{if(!cur)return cur;return {...cur,keywords:(cur.keywords||[]).map(x=>{if(x.id!==kid)return x;if(error)return {...x,lastRun:{at,ok:false,errors:[error]}};
   const r=run.result,seen={...(x.risingSeen||{})},first=!x.latest;for(const q of r.rising){const key=q.query.toLowerCase();if(!(key in seen))seen[key]=first?'':now;}
   return {...x,latest:{at:now,...r},risingSeen:Object.fromEntries(Object.entries(seen).slice(-300)),lastRun:{at,ok:true,errors:[]}};})};});
  return {ok:!error,error};}
 async checkKeywords(id,{force=false}={}){const errors=[];for(const k of (await this.state(id))?.keywords||[]){const key=`${id}:${k.id}`;if(this.keywordChecks.has(key))continue;this.keywordChecks.add(key);
  try{const r=await this.checkKeyword(id,k.id,{force});if(r.error)errors.push(`${k.keyword}：${r.error}`);}finally{this.keywordChecks.delete(key);}}return errors;}
 // 立即查询 and the weekly tick: the product comparison when it is on, then every watched keyword.
 checkAll(id,options={}){return this.runs.run(id,()=>this.collectAll(id,options),'all');}
 async collectAll(id,{force=false}={}){const s=await this.state(id),brand=Boolean(s?.terms?.length&&s.status!=='disconnected');if(!brand&&!(s?.keywords||[]).length)fail(systemMessageText('trendsSource.connectTrendsAddKeywordsFirst'),409);
  const errors=[];if(brand){const r=await this.check(id,{force});if(r.error)errors.push(r.error);}errors.push(...await this.checkKeywords(id,{force}));return {ok:!errors.length,error:errors[0]||''};}
 // 立即查询 and 重新查询 start in the background; the page polls `checking`.
 runAll(id,run:()=>Promise<unknown>,key='all'){return this.runs.run(id,run,key).catch(()=>undefined);}
 async status(id){const s=await this.state(id),dataforseo=Boolean(this.d4s.config(id)?.verifiedAt);if(!s?.terms?.length)return {connected:false,checking:this.runs.has(id),dataforseo,competitors:(await this.rivals(id,s)).competitors,maxRivals:MAX_RIVALS,locations:LOCATIONS.map(([code,name])=>({code,name}))};
  const {competitors}=await this.rivals(id,s);
  return {connected:s.status!=='disconnected',checking:this.runs.has(id),dataforseo,product:s.product||s.terms[0],competitors,maxRivals:MAX_RIVALS,terms:s.terms,locationCode:s.locationCode||0,place:placeName(s.locationCode),locations:LOCATIONS.map(([code,name])=>({code,name})),lastRun:s.lastRun||null,checkedAt:s.latest?.at||null,
   nextCheckAt:s.lastRun?new Date(Date.parse(s.lastRun.at)+WEEK).toISOString():null,summary:summary(s.latest)};}
 // The 趋势 page: the 12-month lines, each term's recent change, related searches (rising ones first seen this week marked).
 async view(id){await this.sync(id).catch(()=>false);const s=await this.state(id),week=businessNow(this.p,id)-8*DAY,dataforseo=Boolean(this.d4s.config(id)?.verifiedAt);
  const keywords=(s?.keywords||[]).map(k=>({id:k.id,keyword:k.keyword,addedAt:k.addedAt,checking:this.keywordChecks.has(`${id}:${k.id}`),lastRun:k.lastRun||null,checkedAt:k.latest?.at||null,checkUrl:k.latest?.checkUrl||null,
   points:k.latest?.points||[],...keywordSummary(k),top:k.latest?.top||[],rising:(k.latest?.rising||[]).map(q=>({...q,isNew:newSince(k.risingSeen,q,week)}))}));
  const shared={dataforseo,checking:this.runs.has(id),keywords,maxKeywords:MAX_KEYWORDS,keywordPlace:placeName(s?.locationCode)};
  if(!s?.terms?.length||s.status==='disconnected')return {connected:false,...shared,notes:keywords.length?KEYWORD_NOTES:undefined};const l=s.latest,seen=s.risingSeen||{};
  const {competitors}=await this.rivals(id,s);
  return {connected:true,...shared,product:s.product||s.terms[0],competitors,maxRivals:MAX_RIVALS,terms:s.terms,place:placeName(s.locationCode),checking:this.runs.has(id),lastRun:s.lastRun||null,checkedAt:l?.at||null,checkUrl:l?.checkUrl||null,
   points:l?.points||[],summary:summary(l),top:l?.top||[],rising:(l?.rising||[]).map(q=>({...q,isNew:Boolean(seen[q.query.toLowerCase()])&&Date.parse(seen[q.query.toLowerCase()])>=week})),
   notes:[systemMessageText('trendsSource.valuesGoogleTrendsRelativeInterest'),systemMessageText('trendsSource.relatedSearchesUseFirstTerm'),...(keywords.length?KEYWORD_NOTES:[])]};}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{const s=await this.state(String(id));if((!s?.terms?.length||s.status==='disconnected')&&!(s?.keywords||[]).length||this.runs.has(String(id)))continue;await this.sync(String(id));if(!this.runs.has(String(id)))await this.checkAll(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach trends check failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 async close(){await this.runs.close();}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);ctx.set('Cache-Control','no-store');try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('trendsSource.notLoadTrendsTryAgain'));}};
  const actions={status:wrap(id=>this.status(id)),connect:wrap((id,v)=>this.connect(id,v)),check:wrap(async id=>{const s=await this.state(id);if(!(s?.terms?.length&&s.status!=='disconnected')&&!(s?.keywords||[]).length)fail(systemMessageText('trendsSource.connectTrendsAddKeywordsFirst'),409);void this.runAll(id,()=>this.checkAll(id,{force:true}));return this.status(id);}),
   // 重新查询 after an uncertain run: the user's own click, so the block on the same query is lifted once.
   retry:wrap(async(id,v)=>{if(v.keywordId)this.startKeyword(id,String(v.keywordId),{retry:true});else void this.runAll(id,()=>this.check(id,{force:true,retry:true}),'brand');return this.view(id);}),disconnect:wrap(id=>this.disconnect(id)),view:wrap(id=>this.view(id)),
   addKeyword:wrap((id,v)=>this.addKeyword(id,v)),removeKeyword:wrap((id,v)=>this.removeKeyword(id,v)),pick:wrap((id,v)=>this.pick(id,v))};
  this.p.app.resourceManager.define({name:'nrTrends',actions});this.p.app.acl.allow('nrTrends',Object.keys(actions),'loggedIn');}
}
export { TrendsSource, termsOf, specification, result, summary, keywordSpecification, keywordResult, LOCATIONS };