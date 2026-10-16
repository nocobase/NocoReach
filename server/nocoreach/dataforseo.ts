// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { hash, VisibilityError } from './research-helpers.js';
// DataForSEO paid queries shared by the 数据分析 pages (SPEC "OpenSEO 数据页面"): one connection and monthly budget per
// project; a query runs only when the person asks for it (no per-query cost prompt since 2026-10-02 — spending is shown
// in 数据接入) and stops once the month's budget is used; the same query within 30 days returns the saved result; a run
// whose outcome is uncertain (timeout, cut connection, unreadable reply) may already be billed, so it is recorded as
// unknown and never retried automatically. Each page registers a kind: specification(v)
// returns {kind,path,request,estimatedUsd,reservationUsd,...} (or {kind,requests:[{path,body}],...}) and result(raw,spec)
// the parsed run values (raw is the list of replies for `requests`).
const key=id=>'NOREACH_DATAFORSEO_'+id;
const REUSE_MS=30*86400000;
const error=(message,status=409)=>{throw new VisibilityError(message,status);};
// What a run counts against the budget: its billed cost, or the reservation while the cost is unknown.
const spent=r=>Number(r.get('costUsd')||0)+Number(r.get('reservedUsd')||0);
class DataForSeo{
 constructor(p,kinds){this.p=p;this.p.network?.bind(this,['check', 'run', 'inspectRun'], 'dataforseo');this.kinds=kinds;}
 kind(name){const k=this.kinds[name];if(!k)error(systemMessageText('aiSearch.unsupportedQueryType'),400);return k;}
 repo(){return this.p.db.getRepository('nrKeywordRuns');}
 config(id){try{return JSON.parse(this.p.env(key(id))||'null');}catch{return null;}}
 async disconnect(id){await this.p.variable(key(id),null);return {disconnected:true};}
 // timeoutMs: slow endpoints (Lighthouse runs a browser, 30–60 s) wait longer, so a run is not cut off after it is billed.
 async request(c,path,body,timeoutMs=45000){
  try{const r=await (this.p.network?this.p.network.fetch.bind(this.p.network,'dataforseo'):fetch)('https://api.dataforseo.com/v3/'+path,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Basic '+Buffer.from(c.login+':'+c.password).toString('base64'),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeoutMs)});
   if(!r.ok){const payload=await r.json().catch(()=>null);throw Object.assign(new VisibilityError(systemMessageText('dataforseo.thirdPartyRequestFailedCheck'),502),{safeCode:'http_'+r.status,providerCode:Number.isInteger(payload?.status_code)?payload.status_code:undefined});}return await r.json();
  }catch(e){const safeCode=e.safeCode||(['TimeoutError','AbortError'].includes(e.name)?'timeout':'transport_or_response');this.p.app.logger.warn('NocoReach provider transport diagnostic',{safeCode,providerCode:e.providerCode,errorName:e.name,networkCode:e.cause?.code,path});throw Object.assign(new VisibilityError(systemMessageText('dataforseo.thirdPartyRequestNotComplete'),502),{safeCode});}
 }
 async status(id){const c=this.config(id);return {configured:Boolean(c?.login&&c?.password),verifiedAt:c?.verifiedAt||null,monthlyBudgetUsd:c?.budget||5};}
 async configure(id,header,budget){
  let c;try{c=JSON.parse(Buffer.from(String(header||''),'base64').toString('utf8'));}catch{error(systemMessageText('dataforseo.enterApiLoginApiPassword'),400);}
  if(typeof c.login!=='string'||!c.login.trim()||c.login.length>254||c.login.includes(':')||typeof c.password!=='string'||!c.password||c.password.length>512)error(systemMessageText('dataforseo.invalidApiCredentialFormat'),400);
  if(!Number.isFinite(Number(budget))||Number(budget)<0.05||Number(budget)>100)error(systemMessageText('dataforseo.monthlyBudget005100'),400);
  await this.p.variable(key(id),JSON.stringify({login:c.login.trim(),password:c.password,budget:Number(budget),verifiedAt:null}),true);return this.status(id);
 }
 // The monthly budget on its own, keeping the saved credentials and their verification.
 async setBudget(id,budget){const c=this.config(id);if(!c)error(systemMessageText('dataforseo.saveApiCredentialsFirst'));
  if(!Number.isFinite(Number(budget))||Number(budget)<0.05||Number(budget)>100)error(systemMessageText('dataforseo.monthlyBudget005100'),400);
  await this.p.variable(key(id),JSON.stringify({...c,budget:Number(budget)}),true);return this.status(id);
 }
 async check(id){const c=this.config(id);if(!c)error(systemMessageText('dataforseo.saveApiCredentialsFirst'));const raw=await this.request(c,'appendix/user_data');if(raw.status_code!==20000||raw.tasks?.[0]?.status_code!==20000)error(systemMessageText('dataforseo.credentialVerificationFailedCheckApi'));
  // Do not overwrite a concurrently changed configuration.
  if(hash(c)!==hash(this.config(id)))error(systemMessageText('dataforseo.settingsChangedVerifyAgain'));
  await this.p.variable(key(id),JSON.stringify({...c,verifiedAt:new Date().toISOString()}),true);return this.status(id);
 }
 queryHash(id,c,spec){const identity=[id,c?hash(c.login+':'+c.password):'',spec],mockKey=this.p.network?.mockCacheKey('dataforseo',String(id));return hash(mockKey?[...identity,mockKey]:identity);}
 async preview(id,kind,v){const spec=this.kind(kind).specification(v),c=this.config(id);if(spec.kind!==kind)error(systemMessageText('dataforseo.queryTypeNotMatch'),400);const queryHash=this.queryHash(id,c,spec);const old=await this.repo().findOne({filter:{projectId:id,queryHash,status:'completed'},sort:'-createdAt'});return {spec,queryHash,configured:Boolean(c?.verifiedAt),existing:old&&Date.now()-Date.parse(old.get('createdAt'))<(this.kind(kind).reuseMs??REUSE_MS)?old.toJSON():null};}
 async run(id,kind,v){
  const c=this.config(id);if(!c?.verifiedAt)error(systemMessageText('aiSearch.saveVerifyDataforseoDataSources'));
  const preview=await this.preview(id,kind,v),spec=preview.spec;
  // A preview's hash is optional; when sent it must still match (conditions or connection unchanged).
  if(v.queryHash!==undefined&&v.queryHash!==preview.queryHash)error(systemMessageText('dataforseo.queryCriteriaConnectionChangedRun'));
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(v.requestKey||''))error(systemMessageText('dataforseo.missingRequestId'),400);
  const requestKey=hash([id,v.requestKey]);let owns=false;
  const row=await this.p.db.sequelize.transaction(async transaction=>{
   await this.p.db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('nocoreach-keyword-requests'))",{transaction});
   const repeated=await this.repo().findOne({filter:{requestKey},transaction});
   if(repeated){if(repeated.get('queryHash')!==preview.queryHash)error(systemMessageText('dataforseo.requestIdNotMatchCriteria'));return repeated;}
   // An uncertain run of the same query blocks it for the kind's reuse time (no automatic retry that could bill twice);
   // after that the regular schedule asks again, and the user can retry at once on purpose (retryUncertain).
   const uncertain=v.retryUncertain===true?null:await this.repo().findOne({filter:{projectId:id,queryHash:preview.queryHash,status:{$in:['running','unknown']},createdAt:{$gte:new Date(Date.now()-(this.kind(kind).reuseMs??REUSE_MS)).toISOString()}},transaction});if(uncertain)return uncertain;
   const completed=await this.repo().findOne({filter:{projectId:id,queryHash:preview.queryHash,status:'completed'},sort:'-createdAt',transaction});
   // A kind may reuse for a shorter time (rank checks: under a week, so the weekly check always reads anew).
   if(completed&&Date.now()-Date.parse(completed.get('createdAt'))<(this.kind(kind).reuseMs??REUSE_MS)&&v.forceRefresh!==true)return completed;
   const month=new Date().toISOString().slice(0,7)+'-01';
   const previous=await this.repo().find({filter:{projectId:id,createdAt:{$gte:month}},limit:10001,transaction});
   const used=previous.reduce((sum,r)=>sum+spent(r),0);
   if(previous.length>10000||used+spec.reservationUsd>c.budget)error(systemMessageText('messages.monthDataforseoBudgetUsedUp', { 0: used.toFixed(2), 1: c.budget }));
   owns=true;return this.repo().create({values:{projectId:id,requestKey,queryHash:preview.queryHash,status:'running',spec,reservedUsd:spec.reservationUsd,costUsd:null},transaction});
  });
  if(!owns)return row.toJSON();
  let stage='request';
  // A spec with `requests` (AI 搜索's brand lookup) sends them one after another and parses the replies together; any
  // failure after the first request leaves the whole run uncertain, as the earlier ones may be billed.
  try{let raw;if(spec.requests){raw=[];for(const q of spec.requests)raw.push(await this.request(c,q.path,[q.body],spec.timeoutMs));}else raw=await this.request(c,spec.path,[spec.request],spec.timeoutMs);stage='parse';const parsed=this.kind(kind).result(raw,spec);stage='save';await this.repo().update({filterByTk:row.id,values:{...parsed,reservedUsd:parsed.costUsd===null?spec.reservationUsd:0,completedAt:new Date().toISOString()}});}
  catch(e){this.p.app.logger.warn('NocoReach DataForSEO result uncertain',{runId:String(row.id),stage,errorName:e.name,safeCode:e.safeCode,databaseCode:e.parent?.code});await this.repo().update({filterByTk:row.id,values:{status:'unknown',errorCode:systemMessageText('messages.resultUncertainMayChargedNot', { 0: stage==='request'&&e.safeCode==='timeout'?'DataForSEO 太久没有回音，':'' }),completedAt:new Date().toISOString()}});}
  return (await this.repo().findOne({filterByTk:row.id})).toJSON();
 }
 // Spending for 数据接入: this month and in total, with the runs whose cost is still a reservation.
 async spend(id){const c=this.config(id),month=new Date().toISOString().slice(0,7)+'-01',rows=await this.repo().find({filter:{projectId:id},fields:['costUsd','reservedUsd','status','createdAt'],limit:20000});
  const sum=list=>Number(list.reduce((n,r)=>n+spent(r),0).toFixed(4));const thisMonth=rows.filter(r=>new Date(r.get('createdAt')).toISOString()>=month);
  return {monthUsd:sum(thisMonth),totalUsd:sum(rows),budgetUsd:c?.budget||5,monthRuns:thisMonth.length,totalRuns:rows.length,uncertain:rows.filter(r=>r.get('status')==='unknown').length};}
 async inspectRun(id,v){
  const row=await this.repo().findOne({filter:{id:String(v.runId),projectId:id}});if(!row)error(systemMessageText('dataforseo.researchRecordNotFound'),404);
  const spec=row.get('spec'),c=this.config(id);if(!c?.verifiedAt)error(systemMessageText('dataforseo.verifyConnectionFirst'));
  if(spec.view==='serp')error(systemMessageText('dataforseo.labsResearchRecordsCheckedNow'));
  if(this.queryHash(id,c,spec)!==row.get('queryHash'))error(systemMessageText('dataforseo.currentCredentialsDifferOriginalQuery'));
  const time=new Date(row.get('createdAt')).getTime(),format=n=>new Date(n).toISOString().replace('T',' ').slice(0,19)+' +00:00';
  // Official id_list is free; never call the original live endpoint here.
  const raw=await this.request(c,'dataforseo_labs/id_list',[{datetime_from:format(time-120000),datetime_to:format(Math.min(time+120000,Date.now())),limit:1000,include_metadata:true}]);
  const task=raw.tasks?.[0];if(raw.status_code!==20000||task?.status_code!==20000)error(systemMessageText('dataforseo.notCheckProviderRecordsTry'));
  const matches=(task.result||[]).filter(r=>r.url==='v3/'+spec.path).map(r=>({taskId:r.id,status:r.status,costUsd:r.cost,postedAt:r.datetime_posted,metadata:r.metadata}));
  return {runId:String(row.id),localStatus:row.get('status'),matches,complete:(task.result||[]).length<1000};
 }
}
export { DataForSeo, REUSE_MS, key };