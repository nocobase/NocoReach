const test=require('node:test'),assert=require('node:assert/strict');
const Module=require('node:module');
// Stand-in for the host's workflow plugin package, only for the instruction registration test.
const origLoad=Module._load;Module._load=function(req,...rest){if(req==='@nocobase/plugin-workflow')return {Instruction:class{constructor(w){this.workflow=w;}},JOB_STATUS:{RESOLVED:1,FAILED:-1}};return origLoad.call(this,req,...rest);};
const {DailyAnalysis,parseOutput,validInsight,buildInput,styleIssues,width,NODE_TYPE,WORKFLOW_TITLE}=require('../../plugins/connections/server/daily-analysis');
const good={title:'改写快速开始标题',reason:'曝光 5,848，点击率只有 0.4%',observation:'o',meaning:'m',evidenceText:'e',limitation:'l',suggestion:'s',objective:'g',signalIds:['k']};
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
 const calls=[],replies=Array.isArray(reply)?reply.slice():null;
 return {a:new DailyAnalysis(plugin,async(system,user)=>{calls.push({system,user});const r=replies?replies.shift():reply;if(r instanceof Error)throw r;return {text:r,model:'m'};}),rows,saved,workflows,nodes,plugin,calls};}
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
 const h=harness({reply:'{"observations":["a"],"insights":[]}'});h.plugin.projectIds=async()=>['1'];let registered;h.plugin.app.pm={get:n=>n==='workflow'?{registerInstruction:(t,C)=>{registered={t,C};}}:null};
 assert.equal(h.a.registerInstruction(),true);assert.equal(registered.t,NODE_TYPE);const job=await new registered.C({}).run();assert.equal(job.status,1);assert.equal(job.result['1'].ok,true);
});
test('writing rules: short action title without vague verbs, one-line reason with a number, at most two sentences',()=>{
 assert.equal(width('给 docker compose 文档补命令示例'),16);assert.deepEqual(styleIssues(good),[]);
 assert.deepEqual(styleIssues({...good,title:'优化非英语 AI Agent 文档页的点击与排名表现'}),['title 超过 18 字','title 用了“优化”']);
 assert.deepEqual(styleIssues({...good,reason:''}),['缺少 reason']);
 assert.deepEqual(styleIssues({...good,reason:'页面内容很短，搜索意图没有被满足，所以虽然出现在搜索结果里但几乎没有人点进来看'}),['reason 超过 30 字','reason 没有数字']);
 assert.deepEqual(styleIssues({...good,suggestion:'补命令。补场景。补报错。'}),['suggestion 超过两句']);
});
test('items that break the rules get one rewrite; a rewrite is kept only when it breaks fewer rules',async()=>{
 const long={...good,title:'优化 docker compose 命令文档页面的内容完整度',reason:'',signalIds:['k']},other={...good,title:'提升商业页的转化效果',reason:''};
 const h=harness({reply:['```json\n'+JSON.stringify({observations:['a'],insights:[long,other,good]})+'\n```','```json\n'+JSON.stringify({rewrites:[{i:0,title:'给 docker compose 文档补命令示例',reason:'曝光 5,848，正文只有 92 字',suggestion:'补上常用命令。'},{i:1,title:'提升商业页的转化效果和用户体验',reason:'没有数字的理由'},{i:2,title:'不该改的条目'}]})+'\n```']});
 const r=await h.a.run('1','manual');assert.equal(r.ok,true);assert.equal(r.rewritten,1);assert.equal(r.styleIssues,1);assert.equal(h.calls.length,2);
 const [a,b,c]=h.saved[0].insights;assert.equal(a.title,'给 docker compose 文档补命令示例');assert.equal(a.reason,'曝光 5,848，正文只有 92 字');assert.equal(a.observation,'o');
 assert.equal(b.title,'提升商业页的转化效果');assert.equal(c.title,good.title);
 assert.match(h.calls[1].user,/缺少 reason/);assert.ok(!h.calls[1].user.includes('改写快速开始标题'),'items that pass are not sent');
});
test('a failed rewrite keeps the originals and is not retried; items that pass need no second call',async()=>{
 const h=harness({reply:['{"observations":["a"],"insights":['+JSON.stringify({...good,reason:''})+']}',new Error('timeout')]});
 const r=await h.a.run('1','manual');assert.equal(r.ok,true);assert.equal(r.rewritten,0);assert.equal(r.styleIssues,1);assert.equal(h.calls.length,2);assert.equal(h.saved[0].insights[0].title,good.title);
 const ok=harness({reply:'{"observations":["a"],"insights":['+JSON.stringify(good)+']}'});await ok.a.run('1','manual');assert.equal(ok.calls.length,1);
});
