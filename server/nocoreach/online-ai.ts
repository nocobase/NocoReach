// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
// 在线 AI (SPEC §10): the online AI that writes the daily analysis and 方案类 documents is NocoBase's AI plugin — a model
// service and the "atlas" AI employee. This resource lets the Agent page show which model it is and choose one in a
// single dialog.
// NocoBase 3 (docs/PORT-PLAN.md, step 3): model services and their keys are declared in config.yml (ai.llmServices) —
// the AI Employee plugin deletes any service the configuration does not list — so the dialog no longer takes a provider
// and a key. It offers the models enabled there and points atlas at the one chosen; no key passes through NocoReach.
const EMPLOYEE='atlas';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const today=(now=new Date())=>now.toISOString().slice(0,10);
class OnlineAI{
 constructor(plugin){this.p=plugin;}
 ai(){const ai=this.p.app.pm.get('@nocobase/plugin-ai')||this.p.app.pm.get('ai');if(!ai?.aiManager)fail('NocoBase AI 插件没有启用',409);return ai;}
 services(){return this.p.db.getRepository('llmServices');}
 employee(){return this.p.db.getRepository('aiEmployees').findOne({filter:{username:EMPLOYEE}});}
 // Language-model providers the plugin offers (embedding-only ones are left out).
 providers(){return this.ai().aiManager.listLLMProviders().filter(p=>(p.supportedModel||[]).includes('LLM')).map(p=>({value:p.name,title:p.title}));}
 // The models the dialog offers: every enabled model of every enabled service, by service.
 async choices(){return (await this.ai().aiManager.listAllEnabledModels()).map(s=>({llmService:s.llmService,title:s.llmServiceTitle||s.llmService,providerTitle:s.providerTitle||s.provider,models:(s.enabledModels||[]).map(m=>({value:m.value,title:m.label||m.value}))}));}
 async chosen(v){const llmService=str(v.llmService,200),model=str(v.model,200);if(!llmService||!model)fail('请选择模型');
  if(!(await this.choices()).some(s=>s.llmService===llmService&&s.models.some(m=>m.value===model)))fail('这个模型现在没有启用，请重新选择',409);return {llmService,model};}
 async flight(model){const {provider}=await this.ai().aiManager.getLLMService(model);const r=await provider.testFlight();return r.status==='success'?{ok:true}:{ok:false,message:'连接没有成功，请检查 API Key 和模型'};}
 async models(){return this.choices();}
 async test(v){return this.flight(await this.chosen(v));}
 // The model in use now, tested with its stored settings.
 async check(){const e=await this.employee();if(!e)fail('没有找到在线 AI 员工（atlas）',409);let model;try{model=await this.ai().aiEmployeesManager.resolveModel(e);}catch(x){fail(x.status===409?x.message:'还没有接入在线 AI',409);}return this.flight(model);}
 // Test first; only a working model is saved, as atlas's only model. Services and their order stay as configured.
 async save(v){const model=await this.chosen(v);const t=await this.flight(model);if(!t.ok)fail('连接没有成功，请检查 API Key 和模型，没有保存',422);
  const e=await this.employee();if(!e)fail('没有找到在线 AI 员工（atlas）',409);
  await this.p.db.getRepository('aiEmployees').update({filter:{username:EMPLOYEE},values:{enabled:true,modelSettings:{...(e.get('modelSettings')||{}),enabled:true,models:[model]}}});
  return this.status();}
 // What the Agent page shows: the model the online AI uses now, where it was set up, and how the daily analysis went.
 async status(projectIdValue){
  let model=null,error='';try{const e=await this.employee();if(!e||e.get('enabled')===false)error='在线 AI 员工没有启用';else model=await this.ai().aiEmployeesManager.resolveModel(e);}catch(x){error=x.status===409?x.message:'还没有接入在线 AI';}
  let service=null;if(model){const s=await this.services().findOne({filter:{name:model.llmService}});if(s)service={name:s.get('name'),title:s.get('title')||s.get('name'),provider:s.get('provider'),providerTitle:this.providers().find(p=>p.value===s.get('provider'))?.title||s.get('provider'),enabled:s.get('enabled')!==false};}
  let analysis=null;if(projectIdValue&&this.p.analysis){const st=await this.p.analysis.state(projectIdValue);const runs=st.runs||[],todays=runs.filter(r=>String(r.at).slice(0,10)===today());analysis={today:todays[0]?{at:todays[0].at,ok:todays[0].ok,trigger:todays[0].trigger,error:todays[0].error||''}:null,last:runs[0]?{at:runs[0].at,ok:runs[0].ok,trigger:runs[0].trigger}:null};}
  return {connected:Boolean(model&&service?.enabled),model:model?.model||null,service,error,analysis,choices:await this.choices().catch(()=>[])};}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=v.projectId?projectId(v.projectId):null;ctx.body=await fn(v,id);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'在线 AI 请求没有完成，请稍后重试。');}};
  this.p.app.resourceManager.define({name:'nrOnlineAI',actions:{status:wrap((v,id)=>this.status(id)),models:wrap(v=>this.models(v)),test:wrap(v=>this.test(v)),check:wrap(()=>this.check()),save:wrap(v=>this.save(v))}});
  this.p.app.acl.allow('nrOnlineAI',['status','models','test','check','save'],'loggedIn');}
}
export { OnlineAI, EMPLOYEE };