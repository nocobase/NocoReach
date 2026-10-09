// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/online-ai.test.cjs) with node:test replaced by vitest.
// NocoBase 3 (step 3): services and keys come from config.yml, so the dialog chooses among enabled models instead of
// taking a provider and a key; these tests follow that.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { OnlineAI } from '../../server/nocoreach/online-ai.js';
const test=__vitest_test;
// A stand-in for the AI Employee plugin as the legacy layer presents it: providers, configured services and the atlas
// employee (synthetic data only).
function harness({testOk=true,services=[],modelSettings=null}={}){
 const rows=new Map(services.map(s=>[s.name,{...s}])),emp={username:'atlas',enabled:true,modelSettings},calls=[];
 const row=o=>o&&{get:k=>o[k]};
 class Provider{constructor(a){this.a=a;calls.push(['new',a.serviceOptions,a.modelOptions?.model]);}async testFlight(){calls.push(['test',this.a.modelOptions?.model]);return testOk?{status:'success'}:{status:'error',message:'401 raw'};}}
 const providers=new Map([['deepseek',{title:'DeepSeek',provider:Provider,supportedModel:['LLM']}],['openai-embed',{title:'Embed',provider:Provider,supportedModel:['EMBEDDING']}]]);
 const enabled=()=>[...rows.values()].filter(s=>s.enabled!==false).map(s=>({llmService:s.name,llmServiceTitle:s.title,provider:s.provider,providerTitle:providers.get(s.provider)?.title,enabledModels:s.enabledModels.models.map(m=>({label:m.label||m.value,value:m.value}))}));
 const aiManager={llmProviders:providers,listLLMProviders(){return [...providers].map(([name,v])=>({name,title:v.title,supportedModel:v.supportedModel}));},
  async listAllEnabledModels(){return enabled();},
  async getLLMService({llmService,model}){const s=rows.get(llmService);return {provider:new Provider({serviceOptions:s.options,modelOptions:{llmService,model}}),model,service:s};}};
 const resolve=async e=>{const m=e.get('modelSettings');if(m?.enabled&&m.models?.[0])return m.models[0];const first=enabled()[0];if(!first)throw Object.assign(new Error('还没有接入在线 AI'),{status:409});return {llmService:first.llmService,model:first.enabledModels[0].value};};
 const repos={llmServices:{findOne:async({filter})=>row(rows.get(filter.name))},
  aiEmployees:{findOne:async()=>row(emp),update:async({values})=>{Object.assign(emp,values);}}};
 const runs=[{at:new Date().toISOString(),ok:false,trigger:'workflow',error:'Connection error.'}];
 const plugin={app:{pm:{get:()=>({aiManager,aiEmployeesManager:{resolveModel:resolve}})}},db:{getRepository:n=>repos[n]},analysis:{state:async()=>({runs})}};
 return {ai:new OnlineAI(plugin),rows,emp,calls};}
const DEEPSEEK={name:'deepseek',title:'DeepSeek',provider:'deepseek',options:{apiKey:'sk-secret'},enabledModels:{models:[{value:'deepseek-chat'},{value:'deepseek-reasoner'}]},enabled:true};
test('shows the model in use, its service, the enabled choices and today\'s daily analysis; never the key',async()=>{
 const h=harness({services:[DEEPSEEK]});
 const st=await h.ai.status('1');assert.equal(st.connected,true);assert.equal(st.model,'deepseek-chat');assert.deepEqual(st.service,{name:'deepseek',title:'DeepSeek',provider:'deepseek',providerTitle:'DeepSeek',enabled:true});
 assert.equal(st.analysis.today.ok,false);assert.deepEqual(st.choices,[{llmService:'deepseek',title:'DeepSeek',providerTitle:'DeepSeek',models:[{value:'deepseek-chat',title:'deepseek-chat'},{value:'deepseek-reasoner',title:'deepseek-reasoner'}]}]);
 assert.ok(!JSON.stringify(st).includes('sk-secret'));
 const none=await harness().ai.status();assert.equal(none.connected,false);assert.equal(none.error,'还没有接入在线 AI');assert.deepEqual(none.choices,[]);
});
test('choosing a model tests it first and saves only a working, enabled one as atlas\'s model',async()=>{
 const bad=harness({testOk:false,services:[DEEPSEEK]});await assert.rejects(bad.ai.save({llmService:'deepseek',model:'deepseek-reasoner'}),e=>e.status===422&&/没有保存/.test(e.message));assert.equal(bad.emp.modelSettings,null);
 const h=harness({services:[DEEPSEEK]});
 await assert.rejects(h.ai.save({llmService:'deepseek',model:'gpt-x'}),e=>e.status===409&&/没有启用/.test(e.message),'only a model enabled in the configuration');
 await assert.rejects(h.ai.save({llmService:'deepseek'}),/请选择模型/);
 const st=await h.ai.save({llmService:'deepseek',model:'deepseek-reasoner',apiKey:'sk-ignored'});
 assert.deepEqual(h.emp.modelSettings,{enabled:true,models:[{llmService:'deepseek',model:'deepseek-reasoner'}]});assert.equal(st.model,'deepseek-reasoner');assert.equal(st.connected,true);
 assert.deepEqual(h.rows.get('deepseek').options,{apiKey:'sk-secret'},'the service and its key stay as configured');assert.ok(!JSON.stringify(st).includes('sk-'));
});
test('lists the enabled models, tests a choice, and checks the model in use with its stored settings',async()=>{
 const h=harness({services:[DEEPSEEK,{name:'off',title:'Off',provider:'deepseek',options:{apiKey:'k'},enabledModels:{models:[{value:'x'}]},enabled:false}]});
 assert.deepEqual((await h.ai.models()).map(s=>s.llmService),['deepseek'],'a disabled service is not offered');
 assert.deepEqual(await h.ai.test({llmService:'deepseek',model:'deepseek-chat'}),{ok:true});
 assert.deepEqual(await h.ai.check(),{ok:true});assert.deepEqual(h.calls.at(-2),['new',{apiKey:'sk-secret'},'deepseek-chat']);
 assert.deepEqual(await harness({testOk:false,services:[DEEPSEEK]}).ai.check(),{ok:false,message:'连接没有成功，请检查 API Key 和模型'});
 await assert.rejects(harness().ai.check(),e=>e.status===409&&e.message==='还没有接入在线 AI');
});
