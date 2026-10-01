'use strict';
const {hash,VisibilityError}=require('./research-helpers');
const {specification,result}=require('./keyword-policy');
const {projectId,requireAdmin}=require('./policy');
const key=id=>'NOREACH_DATAFORSEO_'+id;
const error=(message,status=409)=>{throw new VisibilityError(message,status);};
class KeywordService{
 constructor(p){this.p=p;}
 repo(){return this.p.db.getRepository('nrKeywordRuns');}
 config(id){try{return JSON.parse(this.p.env(key(id))||'null');}catch{return null;}}
 async request(c,path,body){
  try{const r=await fetch('https://api.dataforseo.com/v3/'+path,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Basic '+Buffer.from(c.login+':'+c.password).toString('base64'),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
   if(!r.ok){const payload=await r.json().catch(()=>null);throw Object.assign(new VisibilityError('第三方请求失败，请检查凭据、余额与网络',502),{safeCode:'http_'+r.status,providerCode:Number.isInteger(payload?.status_code)?payload.status_code:undefined});}return await r.json();
  }catch(e){const safeCode=e.safeCode||(['TimeoutError','AbortError'].includes(e.name)?'timeout':'transport_or_response');this.p.app.logger.warn('NocoReach provider transport diagnostic',{safeCode,providerCode:e.providerCode,errorName:e.name,networkCode:e.cause?.code,path});throw Object.assign(new VisibilityError('第三方请求未完成；不要重复发起付费请求，请先检查记录',502),{safeCode});}
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
 async list(id){return (await this.repo().find({filter:{projectId:id},sort:'-createdAt',limit:30})).map(r=>r.toJSON());}
 async preview(id,v){const spec=specification(v),c=this.config(id);const queryHash=hash([id,c?hash(c.login+':'+c.password):'',spec]);const old=await this.repo().findOne({filter:{projectId:id,queryHash,status:'completed'},sort:'-createdAt'});return {spec,queryHash,configured:Boolean(c?.verifiedAt),existing:old&&Date.now()-Date.parse(old.get('createdAt'))<86400000?old.toJSON():null};}
 async run(id,v){
  const c=this.config(id);if(!c?.verifiedAt)error('请先在数据接入中保存并验证 DataForSEO');
  const preview=await this.preview(id,v),spec=preview.spec;
  if(v.queryHash!==preview.queryHash)error('查询条件或连接已变化，请重新预览');
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(v.requestKey||''))error('缺少请求标识',400);
  const requestKey=hash([id,v.requestKey]);let owns=false;
  const row=await this.p.db.sequelize.transaction(async transaction=>{
   await this.p.db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('nocoreach-keyword-requests'))",{transaction});
   const repeated=await this.repo().findOne({filter:{requestKey},transaction});
   if(repeated){if(repeated.get('queryHash')!==preview.queryHash)error('请求标识与条件不一致');return repeated;}
   const uncertain=await this.repo().findOne({filter:{projectId:id,queryHash:preview.queryHash,status:{$in:['running','unknown']}},transaction});if(uncertain)return uncertain;
   const completed=await this.repo().findOne({filter:{projectId:id,queryHash:preview.queryHash,status:'completed'},sort:'-createdAt',transaction});
   if(completed&&Date.now()-Date.parse(completed.get('createdAt'))<86400000&&v.forceRefresh!==true)return completed;
   if(v.confirmCost!==true||!Number.isFinite(Number(v.maxCostUsd))||Number(v.maxCostUsd)<spec.reservationUsd)error('请确认第三方费用后再查询',400);
   const month=new Date().toISOString().slice(0,7)+'-01';
   const previous=await this.repo().find({filter:{projectId:id,createdAt:{$gte:month}},limit:10001,transaction});
   if(previous.length>10000||previous.reduce((sum,r)=>sum+Number(r.get('costUsd')||0)+Number(r.get('reservedUsd')||0),0)+spec.reservationUsd>c.budget)error('本项目月度研究预算不足，请检查历史费用或调整预算');
   owns=true;return this.repo().create({values:{projectId:id,requestKey,queryHash:preview.queryHash,status:'running',spec,reservedUsd:spec.reservationUsd,costUsd:null},transaction});
  });
  if(!owns)return row.toJSON();
  let stage='request';
  try{const raw=await this.request(c,spec.path,[spec.request]);stage='parse';const parsed=result(raw,spec);stage='save';await this.repo().update({filterByTk:row.id,values:{...parsed,reservedUsd:parsed.costUsd===null?spec.reservationUsd:0,completedAt:new Date().toISOString()}});}
  catch(e){this.p.app.logger.warn('NocoReach keyword result uncertain',{runId:String(row.id),stage,errorName:e.name,safeCode:e.safeCode,databaseCode:e.parent?.code});await this.repo().update({filterByTk:row.id,values:{status:'unknown',errorCode:'结果不确定：可能已计费，已阻止重复查询。请在 DataForSEO 后台核对。',completedAt:new Date().toISOString()}});}
  return (await this.repo().findOne({filterByTk:row.id})).toJSON();
 }
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
 async save(id,v){
  const run=await this.repo().findOne({filter:{id:String(v.runId),projectId:id,status:'completed'}});if(!run)error('研究记录不存在',404);
  const item=run.get('result')?.items?.find(i=>i.id===String(v.itemId));if(!item?.keyword)error('该结果不能保存为关键词候选',400);
  const spec=run.get('spec'),candidateKey=hash([id,item.keyword,spec.locationCode,spec.language]);
  return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('nocoreach-keyword-candidates'))",{transaction});const repo=this.p.db.getRepository('nrKeywordCandidates'),old=await repo.findOne({filter:{candidateKey},transaction});if(old)return old.toJSON();return (await repo.create({values:{candidateKey,projectId:id,keyword:item.keyword,runId:String(run.id),payload:{item,spec,retrievedAt:run.get('completedAt'),source:'DataForSEO'}},transaction})).toJSON();});
 }
 register(){const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);ctx.set('Cache-Control','no-store');try{if(ctx.method!=='POST')error('请使用 POST',405);const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){if(!(e instanceof VisibilityError))ctx.logger.warn('NocoReach keyword local failure',{errorName:e.name,databaseCode:e.parent?.code,column:e.parent?.column,table:e.parent?.table});ctx.throw(e instanceof VisibilityError?e.status:502,e instanceof VisibilityError?e.message:'关键词研究请求失败，请稍后重试');}};
  const actions={inspectRun:wrap((id,v)=>this.inspectRun(id,v)),status:wrap(id=>this.status(id)),configure:wrap((id,v,ctx)=>this.configure(id,ctx.get('x-noreach-research-credentials'),v.monthlyBudgetUsd)),check:wrap(id=>this.check(id)),disconnect:wrap(async id=>{await this.p.variable(key(id),null);return {disconnected:true};}),preview:wrap((id,v)=>this.preview(id,v)),run:wrap((id,v)=>this.run(id,v)),list:wrap(id=>this.list(id)),save:wrap((id,v)=>this.save(id,v)),candidates:wrap(async id=>(await this.p.db.getRepository('nrKeywordCandidates').find({filter:{projectId:id},sort:'-createdAt',limit:200})).map(r=>r.toJSON()))};
  this.p.app.resourceManager.define({name:'nrKeywords',actions});this.p.app.acl.allow('nrKeywords',Object.keys(actions),'loggedIn');
 }
}
module.exports={KeywordService};
