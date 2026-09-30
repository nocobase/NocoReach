const test=require('node:test'),assert=require('node:assert/strict');
const Module=require('node:module');
// Stand-in for the host's workflow plugin package, only for the instruction registration test.
const origLoad=Module._load;Module._load=function(req,...rest){if(req==='@nocobase/plugin-workflow')return {Instruction:class{constructor(w){this.workflow=w;}},JOB_STATUS:{RESOLVED:1,FAILED:-1}};return origLoad.call(this,req,...rest);};
const {DailyAnalysis,parseOutput,validInsight,buildInput,NODE_TYPE,WORKFLOW_TITLE}=require('../../plugins/connections/server/daily-analysis');
const good={title:'改写快速开始标题',observation:'o',meaning:'m',evidenceText:'e',limitation:'l',suggestion:'s',objective:'g',signalIds:['k']};
test('output parsing accepts fenced or leading JSON and rejects incomplete JSON',()=>{
 assert.deepEqual(parseOutput('说明\n```json\n{"observations":["a"],"insights":[]}\n```').observations,['a']);
 assert.deepEqual(parseOutput('{"insights":[],"observations":["b"]} 以上').observations,['b']);
 assert.equal(parseOutput('{"insights":['),null);assert.equal(parseOutput('没有 JSON'),null);
 assert.equal(validInsight(good),true);assert.equal(validInsight({...good,title:''}),false);assert.equal(validInsight({...good,evidenceText:'x'.repeat(3001)}),false);
});
test('model input drops bulky page text and stays bounded',()=>{
 const big={project:{name:'p'},evidence:{publicSources:[{id:'s',kind:'website',url:'u',title:'t',capturedAt:'c',items:[{text:'x'.repeat(100000)}]}],searchQueries:Array(3000).fill({keyword:'k'.repeat(30)}),signals:{items:[]}}};
 const input=buildInput(big,{proposals:[]});assert.ok(!input.includes('x'.repeat(1000)));assert.ok(input.length<=90000);
});
function harness({reply,saveErrors=[]}){const rows={};const repo={findOne:async({filter})=>rows[filter.key]?{id:filter.key,get:()=>rows[filter.key]}:null,update:async({filterByTk,values})=>{rows[filterByTk]=values.payload;},create:async({values})=>{rows[values.key]=values.payload;}};
 const saved=[];let revision=3;const workflows=[],nodes=[];
 const strategy={context:async()=>({project:{name:'p'},evidence:{signals:{items:[{key:'k'}]},publicSources:[]}}),state:async()=>({revision,proposals:[]}),saveInsights:async(id,v)=>{const e=saveErrors.shift();if(e){revision++;throw e;}saved.push(v);return {insights:{items:v.insights,observations:v.observations}};}};
 const wfRepo={findOne:async()=>workflows[0]?{get:k=>workflows[0][k]}:null,create:async({values})=>{workflows.push({id:1,...values});return {get:k=>({id:1,...values})[k]};}};
 const plugin={strategy,db:{getRepository:n=>n==='nrSnapshots'?repo:n==='workflows'?wfRepo:{create:async({values})=>{nodes.push(values);}}},app:{on:()=>{},logger:{warn:()=>{}}}};
 rows.project={id:1};
 return {a:new DailyAnalysis(plugin,async()=>({text:reply,model:'m'})),rows,saved,workflows,nodes,plugin};}
test('run saves valid suggestions and observations, drops invalid ones, records the run',async()=>{
 const h=harness({reply:'```json\n'+JSON.stringify({observations:['曝光上升 18%'],insights:[good,{title:'缺字段'}],sourceReviews:[]})+'\n```'});
 const r=await h.a.run('1','manual');assert.equal(r.ok,true);assert.equal(r.items,1);assert.equal(r.dropped,1);assert.equal(h.saved[0].periodDays,28);assert.equal(h.saved[0].revision,3);
 const st=await h.a.status('1');assert.equal(st.last.ok,true);assert.equal(st.runs[0].trigger,'manual');assert.ok(st.last.lastSuccessAt);
});
test('a concurrent edit (409) is retried once with the fresh revision; unparseable output is a recorded failure',async()=>{
 const h=harness({reply:'{"observations":["a"],"insights":[]}',saveErrors:[Object.assign(new Error('conflict'),{status:409})]});
 const r=await h.a.run('1','workflow');assert.equal(r.ok,true);assert.equal(h.saved[0].revision,4);
 const bad=harness({reply:'抱歉，我无法完成'});const f=await bad.a.run('1','workflow');assert.equal(f.ok,false);assert.match(f.error,/可解析/);assert.equal((await bad.a.status('1')).last.attempts,1);
});
test('only one run at a time; start returns immediately',async()=>{
 let release;const gate=new Promise(r=>{release=r;});const h=harness({reply:'{"observations":["a"],"insights":[]}'});h.a.model=async()=>{await gate;return {text:'{"observations":["a"],"insights":[]}',model:'m'};};
 const s1=await h.a.start('1','manual');assert.equal(s1.running,true);const s2=await h.a.start('1','manual');assert.equal(s2.running,true);release();await h.a.running;assert.equal(h.saved.length,1);assert.equal((await h.a.status('1')).running,false);
});
test('default workflow is created once with the analysis node; a user deletion is respected',async()=>{
 const h=harness({reply:''});await h.a.ensureWorkflow();assert.equal(h.workflows.length,1);assert.equal(h.workflows[0].title,WORKFLOW_TITLE);assert.equal(h.workflows[0].config.repeat,'0 9 * * *');assert.equal(h.nodes[0].type,NODE_TYPE);
 h.workflows.length=0;await h.a.ensureWorkflow();assert.equal(h.workflows.length,0);
});
test('workflow node runs the analysis and reports the job status',async()=>{
 const h=harness({reply:'{"observations":["a"],"insights":[]}'});let registered;h.plugin.app.pm={get:n=>n==='workflow'?{registerInstruction:(t,C)=>{registered={t,C};}}:null};
 assert.equal(h.a.registerInstruction(),true);assert.equal(registered.t,NODE_TYPE);const job=await new registered.C({}).run();assert.equal(job.status,1);assert.equal(job.result.ok,true);
});
