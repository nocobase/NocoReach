const test=require('node:test'),assert=require('node:assert/strict');
const {OnlineAI,SERVICE}=require('../../plugins/connections/server/online-ai');
// A stand-in for NocoBase's AI plugin: providers, model services and the atlas employee (synthetic data only).
function harness({testOk=true,services=[],modelSettings=null}={}){
 const rows=new Map(services.map(s=>[s.name,{...s}])),emp={username:'atlas',enabled:true,modelSettings},calls=[];
 const row=o=>o&&{get:k=>o[k]};
 class Provider{constructor(a){this.a=a;calls.push(['new',a.serviceOptions,a.modelOptions?.model]);}async listModels(){return this.a.serviceOptions.apiKey==='bad'?{errMsg:'401'}:{models:[{id:'m-1'},{id:'m-2'}]};}async testFlight(){calls.push(['test',this.a.modelOptions?.model]);return testOk?{status:'success'}:{status:'error',message:'401 raw'};}}
 const aiManager={llmProviders:new Map([['deepseek',{title:'DeepSeek',provider:Provider,supportedModel:['LLM']}],['openai-embed',{title:'Embed',provider:Provider,supportedModel:['EMBEDDING']}]]),listLLMProviders(){return [...this.llmProviders].map(([name,v])=>({name,title:v.title,supportedModel:v.supportedModel}));}};
 const resolve=async e=>{const m=e.get('modelSettings');if(m?.enabled&&m.models?.[0])return m.models[0];const first=[...rows.values()].find(s=>s.enabled!==false);if(!first)throw new Error('LLM service not configured');return {llmService:first.name,model:first.enabledModels.models[0].value};};
 const repos={llmServices:{findOne:async({filter})=>row(rows.get(filter.name)),create:async({values})=>{rows.set(values.name,values);},update:async({filter,values})=>{rows.set(filter.name,{...rows.get(filter.name),...values});}},
  aiEmployees:{findOne:async()=>row(emp),update:async({values})=>{Object.assign(emp,values);}}};
 const runs=[{at:new Date().toISOString(),ok:false,trigger:'workflow',error:'Connection error.'}];
 const plugin={app:{pm:{get:()=>({aiManager,aiEmployeesManager:{resolveModel:resolve}})}},db:{getRepository:n=>repos[n]},analysis:{state:async()=>({runs})}};
 return {ai:new OnlineAI(plugin),rows,emp,calls};}
test('shows the model in use, where it was set up, and today\'s daily analysis; never the key',async()=>{
 const h=harness({services:[{name:'v_1',title:'DeepSeek',provider:'deepseek',options:{apiKey:'sk-secret'},enabledModels:{models:[{value:'deepseek-chat'}]},enabled:true}]});
 const st=await h.ai.status('1');assert.equal(st.connected,true);assert.equal(st.model,'deepseek-chat');assert.deepEqual(st.service,{title:'DeepSeek',provider:'deepseek',providerTitle:'DeepSeek',managed:false,enabled:true});
 assert.equal(st.analysis.today.ok,false);assert.deepEqual(st.providers,[{value:'deepseek',title:'DeepSeek'}],'embedding-only providers are left out');assert.ok(!JSON.stringify(st).includes('sk-secret'));
 const none=harness();assert.equal((await none.ai.status()).connected,false);
});
test('connecting tests first and saves only a working model; the key stays on the server',async()=>{
 const bad=harness({testOk:false});await assert.rejects(bad.ai.save({provider:'deepseek',apiKey:'sk-new',model:'m-1'}),e=>e.status===422&&/没有保存/.test(e.message));assert.equal(bad.rows.size,0);
 const h=harness();const st=await h.ai.save({provider:'deepseek',apiKey:' sk-new ',model:'m-1'});
 assert.deepEqual(h.rows.get(SERVICE).options,{apiKey:'sk-new'});assert.equal(h.rows.get(SERVICE).sort,undefined,'NocoBase\'s own default model is left alone');assert.deepEqual(h.emp.modelSettings,{enabled:true,models:[{llmService:SERVICE,model:'m-1'}]});
 assert.equal(st.connected,true);assert.equal(st.service.managed,true);assert.ok(!JSON.stringify(st).includes('sk-new'));
 // Changing the model with the key left empty keeps the saved key of the same provider.
 await h.ai.save({provider:'deepseek',apiKey:'',model:'m-2'});assert.deepEqual(h.rows.get(SERVICE).options,{apiKey:'sk-new'});assert.equal(h.emp.modelSettings.models[0].model,'m-2');
 await assert.rejects(harness().ai.save({provider:'deepseek',apiKey:'',model:'m-1'}),/请填写 API Key/);
});
test('lists models from a key, tests a choice, and checks the model in use with its stored settings',async()=>{
 const h=harness({services:[{name:'v_1',title:'DeepSeek',provider:'deepseek',options:{apiKey:'sk-old'},enabledModels:{models:[{value:'deepseek-chat'}]},enabled:true}]});
 assert.deepEqual(await h.ai.models({provider:'deepseek',apiKey:'sk-x'}),[{value:'m-1',title:'m-1'},{value:'m-2',title:'m-2'}]);
 await assert.rejects(h.ai.models({provider:'deepseek',apiKey:'bad'}),/API Key/);
 assert.deepEqual(await h.ai.test({provider:'deepseek',apiKey:'sk-x',model:'m-1'}),{ok:true});
 assert.deepEqual(await h.ai.check(),{ok:true});assert.deepEqual(h.calls.at(-2),['new',{apiKey:'sk-old'},'deepseek-chat']);
 assert.deepEqual(await harness({testOk:false,services:[{name:'v_1',provider:'deepseek',options:{apiKey:'k'},enabledModels:{models:[{value:'x'}]}}]}).ai.check(),{ok:false,message:'连接没有成功，请检查 API Key 和模型'});
});
