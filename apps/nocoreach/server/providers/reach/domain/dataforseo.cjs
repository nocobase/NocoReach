'use strict';
// DataForSEO paid queries shared by the 数据分析 pages (SPEC "OpenSEO 数据页面"): one connection and monthly budget per
// project; a query runs only when the person asks for it (no per-query cost prompt since 2026-10-02 — spending is shown
// in 数据接入) and stops once the month's budget is used; the same query within 30 days returns the saved result; a run
// whose outcome is uncertain (timeout, cut connection, unreadable reply) may already be billed, so it is recorded as
// unknown and never retried automatically. Each page registers a kind: specification(v)
// returns {kind,path,request,estimatedUsd,reservationUsd,...} (or {kind,requests:[{path,body}],...}) and result(raw,spec)
// the parsed run values (raw is the list of replies for `requests`).
const {hash,VisibilityError}=require('./research-helpers.cjs');
const key=id=>'NOREACH_DATAFORSEO_'+id;
const REUSE_MS=30*86400000;
const error=(message,status=409)=>{throw new VisibilityError(message,status);};
// What a run counts against the budget: its billed cost, or the reservation while the cost is unknown.
const spent=r=>Number(r.get('costUsd')||0)+Number(r.get('reservedUsd')||0);
class DataForSeo{
 constructor(p,kinds){this.p=p;this.kinds=kinds;}
 kind(name){const k=this.kinds[name];if(!k)error('不支持的查询类型',400);return k;}
 repo(){return this.p.store.repository('nrKeywordRuns');}
 config(id){try{return JSON.parse(this.p.env(key(id))||'null');}catch{return null;}}
 async disconnect(id){await this.p.variable(key(id),null);return {disconnected:true};}
 // timeoutMs: slow endpoints (Lighthouse runs a browser, 30–60 s) wait longer, so a run is not cut off after it is billed.
 async request(c,path,body,timeoutMs=45000){
  try{const r=await fetch('https://api.dataforseo.com/v3/'+path,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Basic '+Buffer.from(c.login+':'+c.password).toString('base64'),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeoutMs)});
   if(!r.ok){const payload=await r.json().catch(()=>null);throw Object.assign(new VisibilityError('第三方请求失败，请检查凭据、余额与网络',502),{safeCode:'http_'+r.status,providerCode:Number.isInteger(payload?.status_code)?payload.status_code:undefined});}return await r.json();
  }catch(e){const safeCode=e.safeCode||(['TimeoutError','AbortError'].includes(e.name)?'timeout':'transport_or_response');this.p.logger.warn('NocoReach provider transport diagnostic',{safeCode,providerCode:e.providerCode,errorName:e.name,networkCode:e.cause?.code,path});throw Object.assign(new VisibilityError('第三方请求未完成；不要重复发起付费请求，请先检查记录',502),{safeCode});}
 }
 async status(id){const c=this.config(id);return {configured:Boolean(c?.login&&c?.password),verifiedAt:c?.verifiedAt||null,monthlyBudgetUsd:c?.budget||5};}
 async configure(id,header,budget){
  let c;try{c=JSON.parse(Buffer.from(String(header||''),'base64').toString('utf8'));}catch{error('请填写 API Login 和 API Password',400);}
  if(typeof c.login!=='string'||!c.login.trim()||c.login.length>254||c.login.includes(':')||typeof c.password!=='string'||!c.password||c.password.length>512)error('API 凭据格式不正确',400);
  if(!Number.isFinite(Number(budget))||Number(budget)<0.05||Number(budget)>100)error('月度预算需为 0.05–100 美元',400);
  await this.p.variable(key(id),JSON.stringify({login:c.login.trim(),password:c.password,budget:Number(budget),verifiedAt:null}),true);return this.status(id);
 }
 async check(id){const c=this.config(id);if(!c)error('请先保存 API 凭据');const raw=await this.request(c,'appendix/user_data');if(raw.status_code!==20000||raw.tasks?.[0]?.status_code!==20000)error('凭据验证未通过，请检查 API Login 和 API Password');
  // Do not overwrite a concurrently changed configuration.
  if(hash(c)!==hash(this.config(id)))error('配置已变化，请重新验证');
  await this.p.variable(key(id),JSON.stringify({...c,verifiedAt:new Date().toISOString()}),true);return this.status(id);
 }
 async preview(id,kind,v){const spec=this.kind(kind).specification(v),c=this.config(id);if(spec.kind!==kind)error('查询类型不一致',400);const queryHash=hash([id,c?hash(c.login+':'+c.password):'',spec]);const old=await this.repo().findOne({filter:{projectId:id,queryHash,status:'completed'},sort:'-createdAt'});return {spec,queryHash,configured:Boolean(c?.verifiedAt),existing:old&&Date.now()-Date.parse(old.get('createdAt'))<(this.kind(kind).reuseMs??REUSE_MS)?old.toJSON():null};}
 async run(id,kind,v){
  const c=this.config(id);if(!c?.verifiedAt)error('请先在数据接入中保存并验证 DataForSEO');
  const preview=await this.preview(id,kind,v),spec=preview.spec;
  // A preview's hash is optional; when sent it must still match (conditions or connection unchanged).
  if(v.queryHash!==undefined&&v.queryHash!==preview.queryHash)error('查询条件或连接已变化，请重新查询');
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(v.requestKey||''))error('缺少请求标识',400);
  const requestKey=hash([id,v.requestKey]);let owns=false;
  const row=await this.p.store.transaction(async transaction=>{
   void transaction;
   const repeated=await this.repo().findOne({filter:{requestKey},transaction});
   if(repeated){if(repeated.get('queryHash')!==preview.queryHash)error('请求标识与条件不一致');return repeated;}
   // An uncertain run of the same query blocks it for the kind's reuse time (no automatic retry that could bill twice);
   // after that the regular schedule asks again, and the user can retry at once on purpose (retryUncertain).
   const uncertain=v.retryUncertain===true?null:await this.repo().findOne({filter:{projectId:id,queryHash:preview.queryHash,status:{$in:['running','unknown']},createdAt:{$gte:new Date(Date.now()-(this.kind(kind).reuseMs??REUSE_MS)).toISOString()}},transaction});if(uncertain)return uncertain;
   const completed=await this.repo().findOne({filter:{projectId:id,queryHash:preview.queryHash,status:'completed'},sort:'-createdAt',transaction});
   // A kind may reuse for a shorter time (rank checks: under a week, so the weekly check always reads anew).
   if(completed&&Date.now()-Date.parse(completed.get('createdAt'))<(this.kind(kind).reuseMs??REUSE_MS)&&v.forceRefresh!==true)return completed;
   const month=new Date().toISOString().slice(0,7)+'-01';
   const previous=await this.repo().find({filter:{projectId:id,createdAt:{$gte:month}},limit:10001,transaction});
   const used=previous.reduce((sum,r)=>sum+spent(r),0);
   if(previous.length>10000||used+spec.reservationUsd>c.budget)error(`本月 DataForSEO 预算已用完（$${used.toFixed(2)} / $${c.budget}），到“数据接入”调整预算后再查`);
   owns=true;return this.repo().create({values:{projectId:id,requestKey,queryHash:preview.queryHash,status:'running',spec,reservedUsd:spec.reservationUsd,costUsd:null},transaction});
  });
  if(!owns)return row.toJSON();
  let stage='request';
  // A spec with `requests` (AI 搜索's brand lookup) sends them one after another and parses the replies together; any
  // failure after the first request leaves the whole run uncertain, as the earlier ones may be billed.
  try{let raw;if(spec.requests){raw=[];for(const q of spec.requests)raw.push(await this.request(c,q.path,[q.body],spec.timeoutMs));}else raw=await this.request(c,spec.path,[spec.request],spec.timeoutMs);stage='parse';const parsed=this.kind(kind).result(raw,spec);stage='save';await this.repo().update({filterByTk:row.id,values:{...parsed,reservedUsd:parsed.costUsd===null?spec.reservationUsd:0,completedAt:new Date().toISOString()}});}
  catch(e){this.p.logger.warn('NocoReach DataForSEO result uncertain',{runId:String(row.id),stage,errorName:e.name,safeCode:e.safeCode,databaseCode:e.parent?.code});await this.repo().update({filterByTk:row.id,values:{status:'unknown',errorCode:`${stage==='request'&&e.safeCode==='timeout'?'DataForSEO 太久没有回音，':''}结果不确定：可能已计费，所以没有自动重查。请在 DataForSEO 后台核对。`,completedAt:new Date().toISOString()}});}
  return (await this.repo().findOne({filterByTk:row.id})).toJSON();
 }
 // Spending for 数据接入: this month and in total, with the runs whose cost is still a reservation.
 async spend(id){const c=this.config(id),month=new Date().toISOString().slice(0,7)+'-01',rows=await this.repo().find({filter:{projectId:id},fields:['costUsd','reservedUsd','status','createdAt'],limit:20000});
  const sum=list=>Number(list.reduce((n,r)=>n+spent(r),0).toFixed(4));const thisMonth=rows.filter(r=>new Date(r.get('createdAt')).toISOString()>=month);
  return {monthUsd:sum(thisMonth),totalUsd:sum(rows),budgetUsd:c?.budget||5,monthRuns:thisMonth.length,totalRuns:rows.length,uncertain:rows.filter(r=>r.get('status')==='unknown').length};}
 async inspectRun(id,v){
  const row=await this.repo().findOne({filter:{id:String(v.runId),projectId:id}});if(!row)error('研究记录不存在',404);
  const spec=row.get('spec'),c=this.config(id);if(!c?.verifiedAt)error('请先验证连接');
  if(spec.view==='serp')error('当前只支持 Labs 研究记录核对');
  if(hash([id,hash(c.login+':'+c.password),spec])!==row.get('queryHash'))error('当前凭据与原查询不同，不能核对');
  const time=new Date(row.get('createdAt')).getTime(),format=n=>new Date(n).toISOString().replace('T',' ').slice(0,19)+' +00:00';
  // Official id_list is free; never call the original live endpoint here.
  const raw=await this.request(c,'dataforseo_labs/id_list',[{datetime_from:format(time-120000),datetime_to:format(Math.min(time+120000,Date.now())),limit:1000,include_metadata:true}]);
  const task=raw.tasks?.[0];if(raw.status_code!==20000||task?.status_code!==20000)error('供应商记录核对失败，请稍后再核对');
  const matches=(task.result||[]).filter(r=>r.url==='v3/'+spec.path).map(r=>({taskId:r.id,status:r.status,costUsd:r.cost,postedAt:r.datetime_posted,metadata:r.metadata}));
  return {runId:String(row.id),localStatus:row.get('status'),matches,complete:(task.result||[]).length<1000};
 }
}
module.exports={DataForSeo,REUSE_MS,key};
