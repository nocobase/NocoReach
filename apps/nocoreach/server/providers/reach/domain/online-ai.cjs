'use strict';
// 在线 AI (SPEC §10): the online AI that writes the daily analysis and 方案类 documents is NocoBase's AI plugin — a model
// service and the "atlas" AI employee. This resource lets the Agent page show which model it is and connect one in a
// single dialog. Keys go to the plugin's model service on the server and are never sent back to the browser.
const {projectId,requireAccess}=require('./policy.cjs');
const SERVICE='nocoreach-online-ai',EMPLOYEE='atlas';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const today=(now=new Date())=>now.toISOString().slice(0,10);
class OnlineAI{
 constructor(plugin){this.p=plugin;}
 ai(){return {aiManager:this.p.ai.llmProviderManager};}
 async selection(){return (await this.p.store.repository('nrSnapshots').findOne({filter:{key:'online-ai-selection'}}))?.get('payload')||null;}
 // Language-model providers the plugin offers (embedding-only ones are left out).
 providers(){return this.ai().aiManager.listLLMProviders().filter(p=>(p.supportedModel||[]).includes('LLM')).map(p=>({value:p.name,title:p.title}));}
 client(provider,options,model){const meta=this.ai().aiManager.llmProviders.get(provider);if(!meta)fail('不支持这个服务商');return new meta.provider({serviceOptions:options,...(model?{modelOptions:{model,responseFormat:'text'}}:{})});}
 // The key typed in the dialog, or — left empty — the one already saved for the same provider in NocoReach's service.
 async options(provider,apiKey){const key=str(apiKey,500);if(key)return {apiKey:key};const saved=await this.p.ai.llmServiceManager.getLLMService(SERVICE);if(saved&&saved.provider===provider&&saved.options?.apiKey)return saved.options;fail('请填写 API Key');}
 async models(v){const provider=str(v.provider,80),res=await this.client(provider,await this.options(provider,v.apiKey)).listModels();if(res.errMsg)fail('没有取到模型列表，请检查 API Key 是否正确',422);return (res.models||[]).map(m=>({value:m.id,title:m.id})).slice(0,200);}
 async test(v){const provider=str(v.provider,80),model=str(v.model,200);if(!model)fail('请选择模型');const r=await this.client(provider,await this.options(provider,v.apiKey),model).testFlight();return r.status==='success'?{ok:true}:{ok:false,message:'连接没有成功，请检查 API Key 和模型'};}
 // The model in use now, tested with its stored settings (it may have been set up in the NocoBase backend).
 async check(){const model=await this.selection();if(!model)fail('还没有接入在线 AI',409);const {provider}=await this.p.ai.llmProviderManager.getLLMService(model);const r=await provider.testFlight();return r.status==='success'?{ok:true}:{ok:false,message:'连接没有成功，请检查 API Key 和模型'};}
 async save(v){const provider=str(v.provider,80),model=str(v.model,200);if(!provider||!model)fail('请选择服务商和模型');const options=await this.options(provider,v.apiKey),t=await this.client(provider,options,model).testFlight();if(t.status!=='success')fail('连接没有成功，请检查 API Key 和模型，没有保存',422);
  await this.p.configureAI(SERVICE,{title:'在线 AI',provider,options,enabledModels:[{label:model,value:model}],enabled:true});
  const repo=this.p.store.repository('nrSnapshots'),row=await repo.findOne({filter:{key:'online-ai-selection'}}),payload={llmService:SERVICE,model};if(row)await repo.update({filterByTk:row.id,values:{payload}});else await repo.create({values:{key:'online-ai-selection',payload}});return this.status();}
 // What the Agent page shows: the model the online AI uses now, where it was set up, and how the daily analysis went.
 async status(projectIdValue){
  const model=await this.selection();let error=model?'':'还没有接入在线 AI',service=null;
  if(model){const s=await this.p.ai.llmServiceManager.getLLMService(model.llmService);if(s)service={title:s.title||s.name,provider:s.provider,providerTitle:this.providers().find(p=>p.value===s.provider)?.title||s.provider,managed:s.name===SERVICE,enabled:s.enabled!==false};}
  let analysis=null;if(projectIdValue&&this.p.analysis){const st=await this.p.analysis.state(projectIdValue);const runs=st.runs||[],todays=runs.filter(r=>String(r.at).slice(0,10)===today());analysis={today:todays[0]?{at:todays[0].at,ok:todays[0].ok,trigger:todays[0].trigger,error:todays[0].error||''}:null,last:runs[0]?{at:runs[0].at,ok:runs[0].ok,trigger:runs[0].trigger}:null};}
  return {connected:Boolean(model&&service?.enabled),model:model?.model||null,service,error,analysis,providers:this.providers()};}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=v.projectId?projectId(v.projectId):null;ctx.body=await fn(v,id);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'在线 AI 请求没有完成，请稍后重试。');}};
  this.p.routes.define({name:'nrOnlineAI',actions:{status:wrap((v,id)=>this.status(id)),models:wrap(v=>this.models(v)),test:wrap(v=>this.test(v)),check:wrap(()=>this.check()),save:wrap(v=>this.save(v))}});
  this.p.routes.allow('nrOnlineAI',['status','models','test','check','save'],'loggedIn');}
}
module.exports={OnlineAI,SERVICE,EMPLOYEE};
