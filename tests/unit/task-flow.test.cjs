const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
execFileSync(process.execPath,[path.resolve(__dirname,'../../plugins/connections/scripts/build-server.cjs')]);
const {TaskService}=require('../../plugins/connections/dist/execution/service');
const {validateFlow,flowRunInput}=require('../../plugins/connections/dist/execution/flow');
const {SYSTEM_PLAYBOOKS,stagesFor,validatePlaybook,defaultPlaybookId}=require('../../plugins/connections/dist/execution/playbook');

const signals=[{key:'gsc-low-ctr:/a',action:'optimize'},{key:'community-gap:q',action:'create'},{key:'github-release',action:'distribute'},{key:'gsc-site-impressions',action:null}];
function fixture(provider={prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>({content:'AI draft'})},evidence={reason:'original'}){
 const state={nrTasks:[{id:1,projectId:'1',title:'Synthetic task',brief:'Supplied evidence only',status:'待处理',evidence}],nrSnapshots:[],users:[{id:1,username:'tester',roles:[{name:'admin'}]}]};let sequence=100;
 const match=(r,filter={})=>Object.entries(filter).every(([k,v])=>v&&typeof v==='object'?v.$startsWith!==undefined&&String(r[k]).startsWith(v.$startsWith):String(r[k])===String(v));
 const row=r=>r?{...r,get:k=>structuredClone(r[k]),toJSON:()=>structuredClone(r)}:null;
 const repo=name=>({findOne:async({filter,filterByTk})=>row(state[name].find(r=>filterByTk!==undefined?String(r.id)===String(filterByTk):match(r,filter))),find:async({filter,offset=0,limit=100})=>state[name].filter(r=>match(r,filter)).slice(offset,offset+limit).map(row),create:async({values})=>{const r={id:sequence++,...structuredClone(values)};state[name].push(r);return row(r);},update:async({filterByTk,values})=>{Object.assign(state[name].find(r=>String(r.id)===String(filterByTk)),structuredClone(values));}});
 let tail=Promise.resolve();const routes={};
 const p={project:async id=>{if(id!=='1')throw Object.assign(Error('project'),{status:404});return {name:'Synthetic',writingStyle:'Plain'};},db:{getRepository:repo,sequelize:{query:async()=>{},transaction:fn=>{const result=tail.then(async()=>{const old=structuredClone(state);try{return await fn({});}catch(e){Object.assign(state,old);throw e;}});tail=result.catch(()=>{});return result;}}},app:{resourceManager:{define:r=>routes[r.name]=r.actions},acl:{allow:()=>{}}}};
 const s=new TaskService(p,provider);
 const command=async(command,body={},taskId='1')=>s.update('1',{taskId,revision:(await s.get('1',taskId)).work.revision,requestId:randomUUID(),command,...body},'1','Tester');
 const view=(taskId='1')=>s.get('1',taskId);
 const stage=async(taskId='1')=>{const d=await view(taskId);return d.work.flow.stages[d.work.stageIndex];};
 return {s,state,command,view,stage,routes};
}
const output=d=>d.work.results[d.work.stageIndex-1];

test('built-in playbooks compile to valid stages; custom playbooks are checked before saving',()=>{
 assert.equal(SYSTEM_PLAYBOOKS.length,11);
 for(const p of SYSTEM_PLAYBOOKS){const st=stagesFor(p);validateFlow({name:p.name,stages:st});assert.ok(st.every(s=>p.kind==='plan'?s.kind!=='agent':s.kind!=='ai'),`${p.id} has one executor`);}
 assert.deepEqual(stagesFor(SYSTEM_PLAYBOOKS.find(p=>p.id==='optimize-page')).map(s=>s.key),['plan','approve-plan','build','review','publish','observe']);
 assert.deepEqual(stagesFor({...SYSTEM_PLAYBOOKS.find(p=>p.id==='optimize-page'),planFirst:false}).map(s=>s.key),['build','review','publish','observe']);
 const ids=SYSTEM_PLAYBOOKS.map(p=>p.id);
 assert.throws(()=>validatePlaybook({name:'x',kind:'robot',instructions:'y'},ids),/做法类型/);
 assert.throws(()=>validatePlaybook({name:'x',kind:'plan',instructions:''},ids),/完整内容/);
 assert.throws(()=>validatePlaybook({name:'x',kind:'plan',instructions:'y',next:['missing']},ids),/不存在/);
 assert.throws(()=>validatePlaybook({name:'x',kind:'plan',instructions:'y',checklist:Array.from({length:11},(_,i)=>({label:'c'+i}))},ids),/最多 10 项/);
 const b=validatePlaybook({name:'改',kind:'build',instructions:'do',next:['new-doc'],planFirst:false},ids);assert.deepEqual(b.next,[]);assert.equal(b.planFirst,false);
});

test('default playbook follows the signals behind the opportunity',()=>{
 const task=ids=>({evidence:{insight:{signalIds:ids},context:{signals:{items:signals}}}});
 assert.equal(defaultPlaybookId(task(['gsc-low-ctr:/a','community-gap:q'])),'optimize-page');
 assert.equal(defaultPlaybookId(task(['community-gap:q'])),'content-outline');
 assert.equal(defaultPlaybookId(task(['github-release'])),'release-notes');
 assert.equal(defaultPlaybookId(task(['gsc-site-impressions'])),'change-research');
 assert.equal(defaultPlaybookId({evidence:{reason:'manual'}}),'optimize-page');
});

test('online AI input: memory, cited signals only, earlier output, feedback, notes and the handed-over document',()=>{
 const task={title:'T',brief:'B',evidence:{insight:{id:'i',signalIds:['gsc-low-ctr:/a']},context:{signals:{items:signals}},handoff:{content:'accepted outline'}}};
 const flow={id:'p',name:'P',version:1,stages:[{key:'draft',name:'撰写',kind:'ai',instruction:'x'},{key:'accept',name:'审核',kind:'review'},{key:'more',name:'补充',kind:'ai',instruction:'y'},{key:'r2',name:'再审',kind:'review'}]};
 const w={flow,playbook:{name:'关键词调研'},results:[{content:'first'},null,{content:'old',rejectedAt:'t'}],note:'keep tone',history:[{action:'comment',comment:'cite GSC'},{action:'runQueued'}]};
 const input=flowRunInput({name:'P',writingStyle:'Plain',secret:'no'},task,w,2,null,[{kind:'stage',stageKey:'more',decision:'requestChanges',comment:'shorter'}]);
 assert.equal(input.project.writingStyle,'Plain');assert.equal(input.project.secret,undefined);assert.equal(input.playbook,'关键词调研');
 assert.deepEqual(input.evidence.signals.map(s=>s.key),['gsc-low-ctr:/a']);assert.equal(input.evidence.context,undefined);
 assert.deepEqual(input.previousStages,[{stage:'撰写',output:'first'}]);assert.equal(input.rejectedDraft,'old');assert.deepEqual(input.feedback,['shorter']);
 assert.deepEqual(input.notes,['cite GSC']);assert.equal(input.handoff,'accepted outline');
});

test('plan task: online AI document, change request reruns, acceptance hands over to a new build task',async()=>{
 const inputs=[];const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async r=>{inputs.push(JSON.parse(r.input));return {content:`outline ${inputs.length}`};}},{insight:{id:'op',signalIds:['community-gap:q']},context:{signals:{items:signals}}});
 let d=await f.view();assert.equal(d.playbookDefault,'content-outline');assert.equal(d.task.status,'待处理');
 d=await f.command('startTask',{note:'focus on blocks'});assert.equal(d.work.playbook.kind,'plan');assert.equal(d.runs[0].status,'queued');assert.equal(d.task.status,'进行中');
 await f.s.tick();d=await f.view();assert.equal((await f.stage()).key,'accept');assert.equal(d.task.status,'待确认');assert.equal(inputs[0].note,'focus on blocks');
 d=await f.command('requestStageChanges',{stageKey:'accept',artifactId:output(d).id,comment:'add examples'});await f.s.tick();d=await f.view();
 assert.deepEqual(inputs[1].feedback,['add examples']);assert.equal(output(d).content,'outline 2');
 await assert.rejects(f.command('approveStage',{stageKey:'accept',artifactId:output(d).id,checked:['facts'],next:'tech-fix'}),e=>e.status===409);
 await assert.rejects(f.command('approveStage',{stageKey:'accept',artifactId:output(d).id,checked:[]}),e=>e.status===409&&/引用的数据/.test(e.message));
 d=await f.command('approveStage',{stageKey:'accept',artifactId:output(d).id,checked:['facts'],next:'new-doc'});
 assert.equal(d.work.stage,'done');assert.equal(d.task.status,'已完成');assert.ok(d.work.nextTaskId);assert.deepEqual(d.related.map(r=>r.relation),['next']);
 const child=f.state.nrTasks.find(t=>String(t.id)===d.work.nextTaskId);
 assert.match(child.title,/^新建文档页：/);assert.match(child.brief,/outline 2/);assert.equal(child.evidence.handoff.content,'outline 2');assert.equal(child.evidence.insight.id,'op');
 const c=await f.view(String(child.id));assert.equal(c.playbookDefault,'new-doc');assert.equal(c.task.status,'待处理');assert.deepEqual(c.related.map(r=>[r.relation,String(r.id)]),[['prev','1']]);
});

test('build task: Agent plan first, manual records until the Agent is connected, checklist on the PR, publish completes',async()=>{
 const f=fixture();
 let d=await f.command('startTask',{playbookId:'optimize-page'});
 assert.equal((await f.stage()).key,'plan');assert.equal(d.runs.length,0,'a local Agent stage never starts by itself');assert.equal(d.task.status,'进行中');
 d=await f.command('recordManual',{stageKey:'plan',content:'Change docs/en/a.md intro'});assert.equal((await f.stage()).key,'approve-plan');
 d=await f.command('approveStage',{stageKey:'approve-plan',artifactId:output(d).id,checked:[]});assert.equal((await f.stage()).key,'build');
 d=await f.command('recordManual',{stageKey:'build',content:'PR https://github.com/o/r/pull/1'});
 await assert.rejects(f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:[]}),e=>/改动范围/.test(e.message));
 await assert.rejects(f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:['scope'],next:'new-doc'}),e=>e.status===409);
 d=await f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:['scope']});assert.equal((await f.stage()).kind,'publish');
 d=await f.command('confirmPublish',{stageKey:'publish',note:'Merged and deployed'});assert.equal(d.work.stage,'done');assert.ok(d.work.observeFrom);
});

test('messages reach the next run; the playbook is fixed once started; removed commands do not apply',async()=>{
 const inputs=[];const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async r=>{inputs.push(JSON.parse(r.input));return {content:'report'};}});
 await assert.rejects(f.command('selectPlaybook',{playbookId:'missing'}),e=>e.status===404);
 let d=await f.command('selectPlaybook',{playbookId:'keyword-research'});assert.equal(d.playbookDefault,'keyword-research');
 d=await f.command('comment',{comment:'use last 90 days'});
 d=await f.command('startTask');assert.equal(d.work.playbook.id,'keyword-research');await f.s.tick();
 assert.deepEqual(inputs[0].notes,['use last 90 days']);
 await assert.rejects(f.command('selectPlaybook',{playbookId:'new-doc'}),e=>e.status===409);
 await assert.rejects(f.command('startTask'),e=>e.status===409);
 await assert.rejects(f.command('startFlow'),e=>e.status===400);
 await assert.rejects(f.command('startSimple',{scope:'x',kind:'content'}),e=>e.status===409);
 d=await f.view();d=await f.command('approveStage',{stageKey:'accept',artifactId:output(d).id,checked:['facts']});
 await assert.rejects(f.command('comment',{comment:'late'}),e=>e.status===409);
});

test('custom playbooks: copy, edit, next-step references, revision guard; started tasks keep their snapshot',async()=>{
 const f=fixture();
 let list=await f.s.playbooks.list('1');assert.equal(list.playbooks.length,11);
 await assert.rejects(f.s.playbooks.save('1',{playbookId:'new-doc',revision:0,name:'x',kind:'build',instructions:'y'}),e=>e.status===409);
 const copied=await f.s.playbooks.copy('1',{playbookId:'content-outline',revision:0});const id=copied.playbook.id;
 assert.equal(copied.playbook.name,'内容选题与大纲（副本）');assert.deepEqual(copied.playbook.next,['new-doc','blog-post']);assert.equal(copied.playbook.system,undefined);
 await assert.rejects(f.s.playbooks.copy('1',{playbookId:'content-outline',revision:0}),e=>e.status===409);
 let d=await f.command('startTask',{playbookId:id});assert.equal(d.work.flow.stages.length,2);
 const builder=await f.s.playbooks.save('1',{revision:1,name:'只改英文',kind:'build',instructions:'English only',planFirst:false});
 const saved=await f.s.playbooks.save('1',{playbookId:id,revision:2,name:'选题',kind:'plan',instructions:'outline',next:[builder.playbook.id]});
 assert.equal(saved.playbook.version,2);assert.deepEqual(saved.playbook.next,[builder.playbook.id]);
 d=await f.view();assert.deepEqual(d.work.playbook.next,['new-doc','blog-post'],'running task keeps the playbook it started with');
 const removed=await f.s.playbooks.remove('1',{playbookId:builder.playbook.id,revision:3});
 assert.deepEqual(removed.playbooks.find(p=>p.id===id).next,[],'removing a playbook clears next-step references');
 await assert.rejects(f.s.playbooks.remove('1',{playbookId:'new-doc',revision:4}),e=>e.status===409);
});

test('a failed online AI run waits for retry and never reruns by itself',async()=>{
 let calls=0,broken=true;const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>{calls++;if(broken)throw Error('provider down');return {content:'report '+calls};}});
 await f.command('startTask',{playbookId:'change-research'});await f.s.tick();
 let d=await f.view();assert.equal(d.runs[0].status,'failed');assert.equal((await f.stage()).key,'draft');assert.equal(d.task.status,'进行中');
 await f.s.tick();assert.equal(calls,1);
 broken=false;await f.command('retryStage',{stageKey:'draft'});await f.s.tick();d=await f.view();
 assert.equal((await f.stage()).key,'accept');assert.equal(output(d).content,'report 2');
});

const {repoInput,allowedPath}=require('../../plugins/connections/dist/execution/agent');
test('Agent connection: key shown once, hash never returned, revoke stops it; repository settings are checked',async()=>{
 const f=fixture();
 const {key,computerId}=await f.s.agents.connect('1',{name:'MacBook'});assert.match(key,/^nra_/);
 let st=await f.s.agents.status('1');assert.equal(st.computers[0].online,false);assert.equal(st.computers[0].keyHash,undefined);
 await assert.rejects(f.s.agents.authenticate('1','nra_wrong'),e=>e.status===401);
 const a=await f.s.agents.authenticate('1',key,{version:'0.1.0',tools:{claude:'2.1.285'}});assert.equal(a.computer.id,computerId);
 st=await f.s.agents.status('1');assert.equal(st.computers[0].online,true);assert.equal(st.computers[0].tools.claude,'2.1.285');
 await f.s.agents.revoke('1',{computerId});await assert.rejects(f.s.agents.authenticate('1',key),e=>e.status===401);
 const saved=await f.s.agents.saveRepo('1',{repo:'https://github.com/estheryo/website-test',revision:st.revision+1});assert.equal(saved.repo.repo,'estheryo/website-test');
 st=await f.s.agents.status('1');await assert.rejects(f.s.agents.removeRepo('1',{revision:st.revision-1}),e=>e.status===409);await f.s.agents.removeRepo('1',{revision:st.revision});assert.equal((await f.s.agents.status('1')).repo,null);
 assert.throws(()=>repoInput({repo:'not a repo'}),/GitHub 仓库链接/);assert.throws(()=>repoInput({repo:'o/r',allowedPaths:['../x']}),/相对路径/);
 const cfg=repoInput({repo:'estheryo/website',allowedPaths:['content/','docs']});assert.deepEqual(cfg.allowedPaths,['content','docs']);assert.equal(cfg.baseBranch,'');
 for(const link of ['https://github.com/estheryo/website-test','https://github.com/estheryo/website-test.git','github.com/estheryo/website-test/','https://github.com/estheryo/website-test?tab=readme'])assert.equal(repoInput({repo:link}).repo,'estheryo/website-test');
 assert.equal(repoInput({repo:'o/r',baseBranch:'release'}).baseBranch,'release');assert.throws(()=>repoInput({repo:'o/r',baseBranch:'-x'}),/分支/);
 assert.equal(allowedPath(cfg,'content/articles/a/index.md'),true);assert.equal(allowedPath(cfg,'contented/x.md'),false);assert.equal(allowedPath({allowedPaths:[]},'src/x.ts'),true);
});

test('build task with the local Agent: plan, approval, PR on the task branch only, change request on the same branch',async()=>{
 let invoked=0;const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>{invoked++;return {content:'x'};}});
 const {key}=await f.s.agents.connect('1',{name:'MacBook'});const me=(await f.s.agents.authenticate('1',key)).computer.id;
 await f.s.agents.saveRepo('1',{repo:'estheryo/website',baseBranch:'main',allowedPaths:['content'],revision:1});
 let d=await f.command('startTask',{playbookId:'optimize-page'});
 assert.equal(d.runs[0].status,'queued');assert.equal(d.runs[0].executorKind,'local');assert.equal(d.agent.repo.repo,'estheryo/website');
 await f.s.tick();assert.equal(invoked,0,'the server never runs local Agent work itself');
 let c=await f.s.agentClaim('1',me);assert.equal(c.run.mode,'plan');assert.equal(c.run.input.repo.repo,'estheryo/website');assert.equal(c.run.branch,'nocoreach/task-1');assert.ok(c.run.input.stage.instruction.includes('先不要修改文件'));
 assert.deepEqual(await f.s.agentClaim('1',me),{run:null});
 await assert.rejects(f.s.agentEvents('1','someone-else',{taskId:'1',runId:c.run.id,events:[]}),e=>e.status===404);
 const ev=await f.s.agentEvents('1',me,{taskId:'1',runId:c.run.id,events:[{type:'tool',text:'Read content/articles/a/index.md'}]});assert.equal(ev.stop,false);
 d=await f.view();assert.equal(d.agentEvents[0].text,'Read content/articles/a/index.md');
 await f.s.agentFinish('1',me,{taskId:'1',runId:c.run.id,ok:true,content:'Change content/articles/a/index.md intro'});
 d=await f.view();assert.equal((await f.stage()).key,'approve-plan');assert.equal(output(d).content,'Change content/articles/a/index.md intro');
 d=await f.command('approveStage',{stageKey:'approve-plan',artifactId:output(d).id,checked:[]});assert.equal(d.runs.filter(r=>r.status==='queued').length,1);
 c=await f.s.agentClaim('1',me);assert.equal(c.run.mode,'build');assert.equal(c.run.input.previousStages[0].output,'Change content/articles/a/index.md intro');
 const pr=(url,extra={})=>({taskId:'1',runId:c.run.id,ok:true,content:'Opened PR',pr:{url,number:3,branch:'nocoreach/task-1',headSha:'abc1234',files:[{path:'content/articles/a/index.md',additions:12,deletions:2},{path:'src/pages/x.astro',additions:1,deletions:0}],checks:{ok:true,summary:'内容检查通过'},...extra}});
 await assert.rejects(f.s.agentFinish('1',me,pr('https://github.com/nocobase/website/pull/3')),e=>e.status===400,'never accept a PR on the upstream repository');
 await assert.rejects(f.s.agentFinish('1',me,pr('https://github.com/estheryo/website/pull/3',{branch:'main'})),e=>e.status===400);
 await f.s.agentFinish('1',me,pr('https://github.com/estheryo/website/pull/3'));
 d=await f.view();assert.equal((await f.stage()).key,'review');assert.equal(output(d).pr.number,3);assert.deepEqual(output(d).pr.outOfScope,['src/pages/x.astro']);
 await assert.rejects(f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:['scope']}),e=>e.status===409&&/超出允许范围/.test(e.message));
 d=await f.command('requestStageChanges',{stageKey:'review',artifactId:output(d).id,comment:'keep the original title'});
 c=await f.s.agentClaim('1',me);assert.equal(c.run.branch,'nocoreach/task-1');assert.deepEqual(c.run.input.feedback,['keep the original title']);assert.equal(c.run.input.rejectedDraft,'Opened PR');
});

test('stopping, manual takeover and interrupted Agent runs',async()=>{
 const f=fixture();const {key}=await f.s.agents.connect('1',{});const me=(await f.s.agents.authenticate('1',key)).computer.id;
 await f.s.agents.saveRepo('1',{repo:'estheryo/website',revision:1});
 let d=await f.command('startTask',{playbookId:'optimize-page'});const queued=d.runs[0];
 d=await f.command('recordManual',{stageKey:'plan',content:'I will do it myself'});assert.equal(d.runs.find(r=>r.id===queued.id).error,'replaced_by_manual');assert.equal((await f.stage()).key,'approve-plan');
 d=await f.command('approveStage',{stageKey:'approve-plan',artifactId:output(d).id,checked:[]});const build=d.runs.find(r=>r.status==='queued');
 const c=await f.s.agentClaim('1',me);assert.equal(c.run.id,build.id);
 await assert.rejects(f.command('recordManual',{stageKey:'build',content:'x'}),e=>e.status===409);
 d=await f.command('cancelRun',{runId:build.id});assert.equal((await f.s.agentEvents('1',me,{taskId:'1',runId:build.id,events:[]})).stop,true);
 await f.s.agentFinish('1',me,{taskId:'1',runId:build.id,ok:false,error:'cancelled'});d=await f.view();assert.equal(d.runs.find(r=>r.id===build.id).error,'cancelled');assert.equal((await f.stage()).key,'build');
 d=await f.command('retryStage',{stageKey:'build'});const again=d.runs.find(r=>r.status==='queued');await f.s.agentClaim('1',me);
 const row=f.state.nrSnapshots.find(r=>r.key.endsWith(again.id));row.payload.expiresAt=new Date(Date.now()-1000).toISOString();
 await f.s.tick();d=await f.view();assert.equal(d.runs.find(r=>r.id===again.id).error,'interrupted_or_unknown');assert.equal((await f.stage()).key,'build','an interrupted run is not retried by itself');
});
