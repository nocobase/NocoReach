const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
execFileSync(process.execPath,[path.resolve(__dirname,'../../plugins/connections/scripts/build-server.cjs')]);
const {TaskService}=require('../../plugins/connections/dist/execution/service');
const {validateFlow,defaultFlowId,SYSTEM_FLOWS,flowRunInput}=require('../../plugins/connections/dist/execution/flow');

const signals=[{key:'gsc-low-ctr:/a',action:'optimize'},{key:'gsc-site-impressions',action:null},{key:'community-category:q',action:null}];
function fixture(provider={prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>({content:'AI draft'})},evidence={reason:'original'}){
 const state={nrTasks:[{id:1,projectId:'1',title:'Synthetic task',brief:'Supplied evidence only',status:'待处理',evidence}],nrSnapshots:[],users:[{id:1,username:'tester',roles:[{name:'admin'}]}]};let sequence=100;
 const match=(r,filter={})=>Object.entries(filter).every(([k,v])=>v&&typeof v==='object'?v.$startsWith!==undefined&&String(r[k]).startsWith(v.$startsWith):String(r[k])===String(v));
 const row=r=>r?{...r,get:k=>structuredClone(r[k]),toJSON:()=>structuredClone(r)}:null;
 const repo=name=>({findOne:async({filter,filterByTk})=>row(state[name].find(r=>filterByTk!==undefined?String(r.id)===String(filterByTk):match(r,filter))),find:async({filter,offset=0,limit=100})=>state[name].filter(r=>match(r,filter)).slice(offset,offset+limit).map(row),create:async({values})=>{const r={id:sequence++,...structuredClone(values)};state[name].push(r);return row(r);},update:async({filterByTk,values})=>{Object.assign(state[name].find(r=>String(r.id)===String(filterByTk)),structuredClone(values));}});
 let tail=Promise.resolve();const routes={};
 const p={project:async id=>{if(id!=='1')throw Object.assign(Error('project'),{status:404});return {name:'Synthetic',writingStyle:'Plain'};},db:{getRepository:repo,sequelize:{query:async()=>{},transaction:fn=>{const result=tail.then(async()=>{const old=structuredClone(state);try{return await fn({});}catch(e){Object.assign(state,old);throw e;}});tail=result.catch(()=>{});return result;}}},app:{resourceManager:{define:r=>routes[r.name]=r.actions},acl:{allow:()=>{}}}};
 const s=new TaskService(p,provider);
 const command=async(command,body={})=>s.update('1',{taskId:'1',revision:(await s.get('1','1')).work.revision,requestId:randomUUID(),command,...body},'1','Tester');
 const view=()=>s.get('1','1');
 const stage=async()=>{const d=await view();return d.work.flow.stages[d.work.stageIndex];};
 return {s,state,command,view,stage,routes};
}
const output=d=>d.work.results[d.work.stageIndex-1];

test('built-in flows are valid; rules no custom flow can break are enforced',()=>{
 for(const f of SYSTEM_FLOWS)assert.equal(validateFlow(f).stages.length,f.stages.length);
 const ai={name:'写',kind:'ai',instruction:'x'},agent={name:'改',kind:'agent',instruction:'x'},review={name:'审',kind:'review'},publish={name:'发',kind:'publish'},observe={name:'看',kind:'observe'};
 const bad=(stages,re)=>assert.throws(()=>validateFlow({name:'n',stages}),e=>re.test(e.message));
 bad([review,ai,review],/第一个阶段/);
 bad([ai,review,review],/要放在在线 AI 或本机 Agent 阶段之后/);
 bad([ai,review,ai],/之后需要有人审核/);
 bad([ai,review,agent,review],/必须以“发布”“观察”/);
 bad([ai,review,agent,review,observe,publish],/必须以“发布”“观察”/);
 bad([ai,agent,publish,observe],/之后需要有人审核/);
 bad([ai,review,publish,observe],/只用于包含本机 Agent/);
 bad([ai,{...review,checklist:Array.from({length:11},(_,i)=>({label:'c'+i}))}],/最多 10 项/);
 bad([{name:'x',kind:'robot'},review],/执行方式无效/);
 const ok=validateFlow({name:'多语言',stages:[ai,review,agent,{...agent,name:'翻译'},review,publish,observe]});
 assert.equal(new Set(ok.stages.map(s=>s.key)).size,7);assert.equal(ok.stages[4].checklist.length,0);
});

test('default flow follows the signals behind the opportunity',()=>{
 const task=ids=>({evidence:{insight:{signalIds:ids},context:{signals:{items:signals}}}});
 assert.equal(defaultFlowId(task(['gsc-low-ctr:/a','gsc-site-impressions'])),'site-change');
 assert.equal(defaultFlowId(task(['gsc-site-impressions','community-category:q'])),'research');
 assert.equal(defaultFlowId({evidence:{reason:'manual'}}),'site-change');
});

test('online AI stages read memory, cited signals only, earlier output and feedback',()=>{
 const task={title:'T',brief:'B',evidence:{insight:{id:'i',signalIds:['gsc-low-ctr:/a']},context:{signals:{items:signals},big:'x'.repeat(10)}}};
 const flow=SYSTEM_FLOWS[0];
 const w={flow,results:[{content:'plan text',approvedAt:'t'},null,{content:'old',rejectedAt:'t'}],note:'keep tone'};
 const input=flowRunInput({name:'P',writingStyle:'Plain',secret:'no'},task,w,2,null,[{kind:'stage',stageKey:'repo',decision:'requestChanges',comment:'shorter'}]);
 assert.equal(input.project.writingStyle,'Plain');assert.equal(input.project.secret,undefined);
 assert.deepEqual(input.evidence.signals.map(s=>s.key),['gsc-low-ctr:/a']);assert.equal(input.evidence.context,undefined);
 assert.deepEqual(input.previousStages,[{stage:'写方案',output:'plan text'}]);
 assert.equal(input.rejectedDraft,'old');assert.deepEqual(input.feedback,['shorter']);assert.equal(input.note,'keep tone');
});

test('research flow: AI report, request changes reruns with feedback, approval completes the task',async()=>{
 const inputs=[];const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async r=>{inputs.push(JSON.parse(r.input));return {content:`report ${inputs.length}`};}});
 let d=await f.command('startFlow',{flowId:'research',note:'focus on docs'});
 assert.equal(d.work.stage,'flow');assert.equal(d.task.status,'进行中');assert.equal(d.runs[0].status,'queued');assert.equal(d.work.humanOwnerId,'1');
 await f.s.tick();d=await f.view();
 assert.equal(d.work.stageIndex,1);assert.equal(d.task.status,'待确认');assert.equal(output(d).content,'report 1');assert.equal(inputs[0].note,'focus on docs');
 await assert.rejects(f.command('approveStage',{stageKey:'review',artifactId:'stale'}),e=>e.status===409);
 d=await f.command('requestStageChanges',{stageKey:'review',artifactId:output(d).id,comment:'add sources'});
 assert.equal(d.work.stageIndex,0);assert.equal(d.runs.filter(r=>r.status==='queued').length,1);
 await f.s.tick();d=await f.view();
 assert.deepEqual(inputs[1].feedback,['add sources']);assert.equal(inputs[1].rejectedDraft,'report 1');assert.equal(output(d).content,'report 2');
 d=await f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:[]});
 assert.equal(d.work.stage,'done');assert.equal(d.task.status,'已完成');assert.ok(d.work.results[0].approvedAt);
 assert.equal(d.reviews.filter(r=>r.kind==='stage').length,2);
});

test('site change flow: checklist gates approval, Agent stage waits, manual record, publish completes',async()=>{
 const f=fixture(undefined,{insight:{signalIds:['gsc-low-ctr:/a']},context:{signals:{items:signals}}});
 let d=await f.view();assert.equal(d.flowDefault,'site-change');
 await f.command('startFlow');await f.s.tick();d=await f.view();
 assert.equal((await f.stage()).key,'approve-plan');
 await assert.rejects(f.command('approveStage',{stageKey:'approve-plan',artifactId:output(d).id,checked:['scope']}),e=>e.status===409&&/数据与事实准确/.test(e.message));
 d=await f.command('editStageOutput',{stageKey:'approve-plan',artifactId:output(d).id,content:'edited plan'});
 assert.equal(output(d).content,'edited plan');assert.equal(output(d).version,2);
 d=await f.command('approveStage',{stageKey:'approve-plan',artifactId:output(d).id,checked:['scope','facts']});
 assert.equal((await f.stage()).kind,'agent');assert.equal(d.task.status,'进行中');
 assert.equal(d.runs.filter(r=>r.status==='queued').length,0,'a local Agent stage never starts by itself');
 await assert.rejects(f.command('retryStage',{stageKey:'repo'}),e=>e.status===409);
 d=await f.command('recordManual',{stageKey:'repo',content:'PR https://github.com/o/r/pull/1'});
 assert.equal((await f.stage()).key,'review');assert.equal(output(d).manual,true);
 d=await f.command('requestStageChanges',{stageKey:'review',artifactId:output(d).id,comment:'also update the title'});
 assert.equal((await f.stage()).key,'repo');assert.equal(d.runs.filter(r=>r.status==='queued').length,0);
 d=await f.command('recordManual',{stageKey:'repo',content:'PR updated'});
 d=await f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:['diff']});
 assert.equal((await f.stage()).kind,'publish');assert.equal(d.task.status,'待确认');
 await assert.rejects(f.command('moveWork',{state:'done',confirm:true}),e=>e.status===409&&/发布/.test(e.message));
 await assert.rejects(f.command('confirmPublish',{stageKey:'publish',note:'live',url:'javascript:alert(1)'}),e=>e.status===400);
 d=await f.command('confirmPublish',{stageKey:'publish',note:'Merged and deployed',url:'https://example.com/a'});
 assert.equal(d.work.stage,'done');assert.equal(d.task.status,'已完成');assert.ok(d.work.observeFrom);assert.equal(d.work.flow.stages[d.work.stageIndex].kind,'observe');
});

test('flow choice is fixed once started; old step commands do not apply to flow tasks',async()=>{
 const f=fixture();
 await assert.rejects(f.command('selectFlow',{flowId:'missing'}),e=>e.status===404);
 let d=await f.command('selectFlow',{flowId:'research'});assert.equal(d.work.flowId,'research');
 d=await f.command('startFlow');assert.equal(d.work.flow.id,'research');
 await assert.rejects(f.command('selectFlow',{flowId:'site-change'}),e=>e.status===409);
 await assert.rejects(f.command('startFlow'),e=>e.status===409);
 await assert.rejects(f.command('startSimple',{scope:'x',kind:'content'}),e=>e.status===409);
 await assert.rejects(f.command('replan'),e=>e.status===400||e.status===409);
});

test('custom flows: copy, edit, validation, revision guard; started tasks keep their snapshot',async()=>{
 const f=fixture();
 let list=await f.s.flows.list('1');assert.deepEqual(list.flows.map(x=>x.id),['site-change','research']);
 await assert.rejects(f.s.flows.save('1',{flowId:'research',revision:0,name:'x',stages:SYSTEM_FLOWS[1].stages}),e=>e.status===409);
 const copied=await f.s.flows.copy('1',{flowId:'research',revision:0});const id=copied.flow.id;
 assert.match(id,/^custom-/);assert.equal(copied.flow.name,'调研报告（副本）');
 await assert.rejects(f.s.flows.copy('1',{flowId:'research',revision:0}),e=>e.status===409);
 await assert.rejects(f.s.flows.save('1',{flowId:id,revision:1,name:'坏',stages:[{name:'审',kind:'review'}]}),e=>e.status===400);
 let d=await f.command('startFlow',{flowId:id});assert.equal(d.work.flow.stages.length,2);
 const twoAi=[{name:'草稿',kind:'ai',instruction:'draft'},{name:'润色',kind:'ai',instruction:'polish'},{name:'审核',kind:'review'}];
 const saved=await f.s.flows.save('1',{flowId:id,revision:1,name:'两步调研',stages:twoAi});
 assert.equal(saved.flow.version,2);assert.equal(saved.flow.stages.length,3);
 d=await f.view();assert.equal(d.work.flow.stages.length,2,'running task keeps the flow it started with');
 await assert.rejects(f.s.flows.remove('1',{flowId:'site-change',revision:2}),e=>e.status===409);
 const removed=await f.s.flows.remove('1',{flowId:id,revision:2});assert.equal(removed.flows.length,2);
});

test('consecutive online AI stages run one after another; a failed stage waits for retry',async()=>{
 let calls=0,broken=false;const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async r=>{calls++;if(broken)throw Error('provider down');return {content:'step '+calls};}});
 const saved=await f.s.flows.save('1',{revision:0,name:'两步',stages:[{name:'草稿',kind:'ai',instruction:'draft'},{name:'润色',kind:'ai',instruction:'polish'},{name:'审核',kind:'review'}]});
 await f.command('startFlow',{flowId:saved.flow.id});await f.s.tick();
 let d=await f.view();assert.equal(d.work.stageIndex,1);assert.equal(d.runs.filter(r=>r.status==='queued').length,1);
 broken=true;await f.s.tick();d=await f.view();
 assert.equal(d.work.stageIndex,1);assert.equal(d.runs.find(r=>r.status==='failed').error,'provider_failed_or_unknown');assert.equal(d.task.status,'进行中');
 broken=false;await f.command('retryStage',{stageKey:d.work.flow.stages[1].key});await f.s.tick();
 d=await f.view();assert.equal(d.work.stageIndex,2);assert.equal(output(d).content,'step 3');assert.equal(d.work.results[0].content,'step 1');
});
