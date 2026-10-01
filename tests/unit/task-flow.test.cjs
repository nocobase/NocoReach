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
 assert.deepEqual(stagesFor(SYSTEM_PLAYBOOKS.find(p=>p.id==='optimize-page')).map(s=>s.key),['build','review','release','observe'],'page work goes straight to a change you look at');
 assert.deepEqual(stagesFor(SYSTEM_PLAYBOOKS.find(p=>p.id==='tech-fix')).map(s=>s.key),['plan','approve-plan','build','review','release','observe'],'technical fixes show a plan first');
 assert.ok(SYSTEM_PLAYBOOKS.filter(p=>p.kind==='build').every(p=>p.checklist.length===0),'no box to tick before publishing');
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

test('build task: Agent plan first, manual records until the Agent is connected, a change without a PR is confirmed live by you',async()=>{
 const f=fixture();
 let d=await f.command('startTask',{playbookId:'tech-fix'});
 assert.equal((await f.stage()).key,'plan');assert.equal(d.runs.length,0,'a local Agent stage never starts by itself');assert.equal(d.task.status,'进行中');
 d=await f.command('recordManual',{stageKey:'plan',content:'Change docs/en/a.md intro'});assert.equal((await f.stage()).key,'approve-plan');
 d=await f.command('approveStage',{stageKey:'approve-plan',artifactId:output(d).id,checked:[]});assert.equal((await f.stage()).key,'build');
 d=await f.command('recordManual',{stageKey:'build',content:'PR https://github.com/o/r/pull/1'});
 await assert.rejects(f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:[],next:'new-doc'}),e=>e.status===409);
 d=await f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:[],release:{note:'Fixed the broken links'}});assert.equal((await f.stage()).kind,'release');
 assert.equal(d.work.release.state,'not_seen');assert.equal(d.work.release.reason,'manual');assert.equal(d.runs.filter(r=>r.status==='queued').length,0,'nothing to merge');
 await assert.rejects(f.command('waitLonger',{stageKey:'release'}),e=>e.status===409);
 d=await f.command('confirmLive',{stageKey:'release'});assert.equal(d.work.stage,'done');assert.ok(d.work.observeFrom);assert.equal(d.work.receipt.note,'Fixed the broken links');
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
 let d=await f.command('startTask',{playbookId:'tech-fix'});
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
 await assert.rejects(f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:[]}),e=>e.status===409&&/超出允许范围/.test(e.message));
 d=await f.command('requestStageChanges',{stageKey:'review',artifactId:output(d).id,comment:'keep the original title'});
 c=await f.s.agentClaim('1',me);assert.equal(c.run.branch,'nocoreach/task-1');assert.deepEqual(c.run.input.feedback,['keep the original title']);assert.equal(c.run.input.rejectedDraft,'Opened PR');
});

test('stopping, manual takeover and interrupted Agent runs',async()=>{
 const f=fixture();const {key}=await f.s.agents.connect('1',{});const me=(await f.s.agents.authenticate('1',key)).computer.id;
 await f.s.agents.saveRepo('1',{repo:'estheryo/website',revision:1});
 let d=await f.command('startTask',{playbookId:'tech-fix'});const queued=d.runs[0];
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

test('people and page: owner changes between runs, collaborators and linked pages come from real users and 网站内容',async()=>{
 const f=fixture();f.state.users.push({id:2,nickname:'Lin'});
 f.state.nrSnapshots.push({id:9000,key:'site-content:1',payload:{pages:[{url:'https://example.com/docs/install',title:'安装指南',type:'docs'},{url:'https://example.com/blog/x',title:'X',type:'blog'}]}});
 assert.deepEqual((await f.s.members()).map(m=>m.name),['tester','Lin']);
 assert.deepEqual((await f.s.pages('1','安装')).map(p=>p.url),['https://example.com/docs/install']);assert.equal((await f.s.pages('1','')).length,2);
 await assert.rejects(f.command('linkPage',{url:'https://example.com/nope'}),e=>e.status===404);
 let d=await f.command('linkPage',{url:'https://example.com/docs/install'});assert.deepEqual(d.work.page,{url:'https://example.com/docs/install',title:'安装指南'});
 await assert.rejects(f.command('setCollaborators',{userIds:['2','404']}),e=>e.status===404);
 d=await f.command('setCollaborators',{userIds:['2','2']});assert.deepEqual(d.work.collaborators,[{id:'2',name:'Lin'}]);
 d=await f.command('startTask',{playbookId:'change-research'});const run=d.runs.find(r=>r.status==='queued');assert.ok(run,'online AI run queued');
 assert.equal(JSON.parse(f.state.nrSnapshots.find(r=>r.key.endsWith(run.id)).payload.input).content.url,'https://example.com/docs/install','the run reads the linked page');
 await assert.rejects(f.command('setOwner',{userId:'2'}),e=>e.status===409);
 await f.s.tick();d=await f.view();assert.ok(!d.runs.some(r=>r.status==='queued'||r.status==='running'));
 d=await f.command('setOwner',{userId:'2'});assert.equal(d.work.humanOwnerName,'Lin');
 d=await f.command('linkPage',{url:''});assert.equal(d.work.page,undefined);
});

test('publish: the Agent merges the reviewed commit, the system checks the live page, then observation starts',async()=>{
 const f=fixture();const {key}=await f.s.agents.connect('1',{});const me=(await f.s.agents.authenticate('1',key)).computer.id;
 await f.s.agents.saveRepo('1',{repo:'https://github.com/estheryo/website-test',revision:1});
 f.state.nrSnapshots.push({id:9100,key:'site-content:1',payload:{sites:[{origin:'https://www.example.com'}],pages:[{url:'https://www.example.com/cn/commercial',title:'商业服务',type:'page'}]}});
 let d=await f.command('startTask',{playbookId:'optimize-page'});assert.equal((await f.stage()).key,'build');
 let c=await f.s.agentClaim('1',me);assert.equal(c.run.mode,'build');
 const change={path:'src/pages/cn/commercial.astro',before:'<h2>方案对比</h2>',after:'<h2>方案对比</h2>\n<a>立即体验 Demo</a>'};
 await f.s.agentFinish('1',me,{taskId:'1',runId:c.run.id,ok:true,content:'Added the entry',pr:{url:'https://github.com/estheryo/website-test/pull/1',number:1,branch:'nocoreach/task-1',headSha:'abc1234',files:[{path:change.path,additions:1,deletions:0}],release:'在商业服务页新增体验入口',verifyText:'立即体验 Demo',pages:['/cn/commercial','javascript:alert(1)'],changes:[change,{path:'',before:'x',after:'y'}]}});
 d=await f.view();const out=output(d);assert.equal((await f.stage()).name,'看效果并发布');assert.equal(out.pr.release,'在商业服务页新增体验入口');assert.deepEqual(out.pr.changes,[change]);
 // preview links reported by the Agent program for PRs waiting for review
 const watch=await f.s.agentWatch('1');assert.deepEqual(watch.items,[{taskId:'1',artifactId:out.id,pr:1,headSha:'abc1234'}]);
 await assert.rejects(f.s.agentPreview('1',{taskId:'1',artifactId:out.id,url:'http://insecure.example'}),e=>e.status===400);
 await f.s.agentPreview('1',{taskId:'1',artifactId:out.id,url:'https://pr-1.example.pages.dev/cn/commercial'});d=await f.view();assert.equal(output(d).pr.previewUrl,'https://pr-1.example.pages.dev/cn/commercial');assert.deepEqual((await f.s.agentWatch('1')).items,[]);
 d=await f.command('approveStage',{stageKey:'review',artifactId:out.id,checked:[]});
 assert.equal((await f.stage()).kind,'release');assert.equal(d.work.release.state,'merging');assert.deepEqual(d.work.release.pages,['https://www.example.com/cn/commercial']);assert.equal(d.work.release.note,'在商业服务页新增体验入口');
 c=await f.s.agentClaim('1',me);assert.equal(c.run.mode,'merge');assert.deepEqual(c.run.input.pr,{number:1,url:'https://github.com/estheryo/website-test/pull/1',headSha:'abc1234'});
 await f.s.agentFinish('1',me,{taskId:'1',runId:c.run.id,ok:false,error:'head_changed',message:'PR 在你看过之后又有新的提交'});
 d=await f.view();assert.equal(d.work.release.state,'merge_failed');assert.match(d.work.release.error,/新的提交/);
 d=await f.command('retryMerge',{stageKey:'release'});c=await f.s.agentClaim('1',me);
 await f.s.agentFinish('1',me,{taskId:'1',runId:c.run.id,ok:true,merged:{sha:'def5678'}});
 d=await f.view();assert.equal(d.work.release.state,'verifying');assert.equal(d.work.release.mergeSha,'def5678');
 const pages=[];let html='<html><body><h2>方案对比</h2></body></html>';const read=async url=>{pages.push(url);return {text:html};};
 await f.s.verifyReleases(read);d=await f.view();assert.equal(d.work.release.state,'verifying');assert.equal(d.work.release.checks,1);assert.ok(Date.parse(d.work.release.nextCheckAt)>Date.now(),'next look in half an hour');
 await f.s.verifyReleases(read);assert.equal(pages.length,1,'not due yet');
 const task=f.state.nrTasks[0];task.evidence.work.release.nextCheckAt=new Date(Date.now()-1).toISOString();html='<a class="x">立即体验&nbsp;Demo</a>';
 await f.s.verifyReleases(read);d=await f.view();assert.equal(d.work.release.state,'live');assert.equal(d.work.stage,'done');assert.ok(d.work.observeFrom);assert.equal(d.work.receipt.url,'https://www.example.com/cn/commercial');
});

test('publish: not seen within a day asks you; you can wait longer, confirm it is live, or say you merged it yourself',async()=>{
 const f=fixture();const {key}=await f.s.agents.connect('1',{});const me=(await f.s.agents.authenticate('1',key)).computer.id;
 await f.s.agents.saveRepo('1',{repo:'estheryo/website-test',revision:1});
 let d=await f.command('startTask',{playbookId:'blog-post'});let c=await f.s.agentClaim('1',me);
 await f.s.agentFinish('1',me,{taskId:'1',runId:c.run.id,ok:true,content:'Wrote it',pr:{url:'https://github.com/estheryo/website-test/pull/2',number:2,branch:'nocoreach/task-1',headSha:'abc1234',files:[],verifyText:'新文章',pages:['https://www.example.com/blog/new']}});
 d=await f.view();d=await f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:[]});
 c=await f.s.agentClaim('1',me);await f.s.agentFinish('1',me,{taskId:'1',runId:c.run.id,ok:false,error:'merge_failed',message:'GitHub 没有完成合并：checks pending'});
 d=await f.command('markMerged',{stageKey:'release'});assert.equal(d.work.release.state,'verifying');assert.equal(d.task.status,'进行中');
 const w=f.state.nrTasks[0].evidence.work.release;w.deadline=new Date(Date.now()-1).toISOString();w.nextCheckAt=w.deadline;
 await f.s.verifyReleases(async()=>({text:'old page'}));d=await f.view();assert.equal(d.work.release.state,'not_seen');assert.equal(d.task.status,'待确认','it waits for you on the board');
 d=await f.command('waitLonger',{stageKey:'release'});assert.equal(d.work.release.state,'verifying');assert.ok(Date.parse(d.work.release.deadline)>Date.now()+23*3600000);
 d=await f.command('confirmLive',{stageKey:'release'});assert.equal(d.work.stage,'done');
});

test('effect observation: day 7 and day 28 compare the page with the days before it went live',()=>{
 const {compare,windows,pageKey,summary}=require('../../plugins/connections/dist/execution/effect');
 assert.deepEqual(windows('2026-09-10',7),{baseline:{start:'2026-09-03',end:'2026-09-09'},after:{start:'2026-09-11',end:'2026-09-17'}});
 assert.equal(pageKey('https://www.example.com/docs/install/?a=1#x'),pageKey('http://example.com/docs/install'));
 const days=(start,n)=>Array.from({length:n},(_,i)=>new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10));
 const parts=(clicks,views,dates=days('2026-09-03',15))=>dates.flatMap(d=>[{source:'gsc',grain:'query_page',date:d,payload:[{keyword:'install',page:'https://www.example.com/docs/install',clicks:d<'2026-09-10'?clicks[0]:clicks[1],impressions:100,position:d<'2026-09-10'?9:7},{keyword:'x',page:'https://www.example.com/other',clicks:99,impressions:999,position:1}]},{source:'ga4',grain:'page',date:d,payload:[{page:'/docs/install',views:d<'2026-09-10'?views[0]:views[1],conversions:1}]}]);
 const page=['https://www.example.com/docs/install'];
 let r=compare(7,'2026-09-10',page,parts([10,15],[50,50]),'t');
 assert.equal(r.primary,'clicks');assert.deepEqual(r.gsc.clicks,[70,105]);assert.deepEqual(r.gsc.position,[9,7]);assert.deepEqual(r.ga4.views,[350,350]);assert.equal(r.conclusion,'up');assert.equal(r.change,0.5);
 assert.equal(summary(r),'第 7 天：上升，搜索点击 70 → 105（+50%）');
 assert.equal(compare(7,'2026-09-10',page,parts([10,11],[50,50]),'t').conclusion,'flat','10% is no clear change');
 r=compare(7,'2026-09-10',page,parts([1,2],[50,70]),'t');assert.equal(r.primary,'views','few clicks: views decide');assert.equal(r.conclusion,'up');
 assert.equal(compare(7,'2026-09-10',page,parts([1,2],[2,3]),'t').conclusion,'insufficient','too little of both');
 r=compare(7,'2026-09-10',page,parts([10,15],[50,50],days('2026-09-03',9)),'t');assert.equal(r.conclusion,'insufficient');assert.ok(r.notes.some(n=>/缺/.test(n)),'missing days are named');
 r=compare(7,'2026-09-10',['https://www.example.com/no-data'],parts([10,15],[50,50]),'t');assert.equal(r.conclusion,'insufficient');
});

test('effect observation runs for finished tasks once the data covers the day, and names other changes to the page',async()=>{
 const f=fixture();f.state.nrSyncPartitions=[];
 f.state.nrSnapshots.push({id:9300,key:'site-content:1',payload:{pages:[{url:'https://www.example.com/docs/install',title:'安装',type:'docs'}]}});
 f.s.p.link=async()=>({get:k=>({gscSiteUrl:'sc-domain:example.com',ga4PropertyId:'p1'})[k]});
 let d=await f.command('linkPage',{url:'https://www.example.com/docs/install'});
 d=await f.command('startTask',{playbookId:'optimize-page'});d=await f.command('recordManual',{stageKey:'build',content:'Rewrote the intro'});
 d=await f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:[]});d=await f.command('confirmLive',{stageKey:'release'});assert.equal(d.work.stage,'done');
 f.state.nrTasks[0].evidence.work.observeFrom='2026-09-10T08:00:00Z';
 f.state.nrTasks.push({id:2,projectId:'1',title:'Another change',brief:'',status:'已完成',evidence:{work:{...structuredClone(f.state.nrTasks[0].evidence.work),observeFrom:'2026-09-14T08:00:00Z',observation:{results:[{day:7},{day:28}]}}}});
 let id=1;const add=(source,grain,resource,date,payload)=>f.state.nrSyncPartitions.push({id:id++,projectId:'1',source,grain,resource,date,payload});
 for(let i=0;i<14;i++){const date=new Date(Date.parse('2026-09-03')+i*86400000).toISOString().slice(0,10),before=date<'2026-09-10';
  add('gsc','query_page','sc-domain:example.com',date,[{keyword:'install',page:'https://www.example.com/docs/install',clicks:before?10:16,impressions:100,position:8}]);
  add('ga4','page','p1',date,[{page:'/docs/install',views:40,conversions:0}]);add('ga4','page','other-property',date,[{page:'/docs/install',views:9999,conversions:0}]);}
 await f.s.observeEffects();d=await f.view();assert.equal(d.work.observation,undefined,'day 7 needs data through 9/17; GSC ends 9/16');
 add('gsc','query_page','sc-domain:example.com','2026-09-17',[{keyword:'install',page:'https://www.example.com/docs/install',clicks:16,impressions:100,position:8}]);add('ga4','page','p1','2026-09-17',[{page:'/docs/install',views:40,conversions:0}]);
 await f.s.observeEffects();d=await f.view();
 assert.equal(d.work.observation.results.length,1);const r=d.work.observation.results[0];
 assert.equal(r.day,7);assert.deepEqual(r.gsc.clicks,[70,112]);assert.deepEqual(r.ga4.views,[280,280],'only the connected property counts');assert.equal(r.conclusion,'up');
 assert.ok(r.notes.some(n=>n.includes('Another change')),'another change to the same page in the window is named');
 await f.s.observeEffects();d=await f.view();assert.equal(d.work.observation.results.length,1,'computed once');
});

test('cancel and archive: a cancelled task stops, its PR is closed by the Agent, late results never apply; archive hides and restores',async()=>{
 const f=fixture();const {key}=await f.s.agents.connect('1',{});const me=(await f.s.agents.authenticate('1',key)).computer.id;
 await f.s.agents.saveRepo('1',{repo:'estheryo/website-test',revision:1});
 let d=await f.command('startTask',{playbookId:'optimize-page'});let c=await f.s.agentClaim('1',me);
 await f.s.agentFinish('1',me,{taskId:'1',runId:c.run.id,ok:true,content:'Changed',pr:{url:'https://github.com/estheryo/website-test/pull/4',number:4,branch:'nocoreach/task-1',headSha:'abc1234',files:[]}});
 await assert.rejects(f.command('archiveTask'),e=>e.status===409&&/先停止/.test(e.message));
 d=await f.command('cancelTask',{reason:'不做了'});assert.ok(d.work.cancelledAt);assert.equal(d.task.status,'已取消');assert.equal(d.work.prClose.state,'closing');
 const close=d.runs.find(r=>r.status==='queued');assert.equal(close.mode,'close');
 await assert.rejects(f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:[]}),e=>e.status===409&&/已取消/.test(e.message));
 c=await f.s.agentClaim('1',me);assert.equal(c.run.mode,'close');assert.deepEqual(c.run.input.pr,{number:4,url:'https://github.com/estheryo/website-test/pull/4'});
 await f.s.agentFinish('1',me,{taskId:'1',runId:c.run.id,ok:true});d=await f.view();assert.equal(d.work.prClose.state,'closed');
 d=await f.command('archiveTask');assert.ok(d.work.archivedAt);
 await assert.rejects(f.command('linkPage',{url:''}),e=>e.status===409&&/归档/.test(e.message));
 d=await f.command('unarchiveTask');assert.equal(d.work.archivedAt,undefined);assert.ok(d.work.cancelledAt,'restoring does not reopen a cancelled task');
});

test('cancelling stops a running Agent and its late result is kept only as a candidate; not-started tasks archive directly',async()=>{
 const f=fixture();const {key}=await f.s.agents.connect('1',{});const me=(await f.s.agents.authenticate('1',key)).computer.id;
 await f.s.agents.saveRepo('1',{repo:'estheryo/website-test',revision:1});
 let d=await f.command('startTask',{playbookId:'optimize-page'});const c=await f.s.agentClaim('1',me);
 d=await f.command('cancelTask');assert.equal(d.runs.find(r=>r.id===c.run.id).cancelRequested,true);assert.equal((await f.s.agentEvents('1',me,{taskId:'1',runId:c.run.id,events:[]})).stop,true);
 await f.s.agentFinish('1',me,{taskId:'1',runId:c.run.id,ok:true,content:'late',pr:{url:'https://github.com/estheryo/website-test/pull/5',number:5,branch:'nocoreach/task-1',headSha:'abc1234',files:[]}});
 d=await f.view();assert.equal(d.runs.find(r=>r.id===c.run.id).error,'candidate_only_context_changed');assert.equal(d.work.results[0],undefined);
 f.state.nrTasks.push({id:2,projectId:'1',title:'Not started',brief:'',status:'待处理',evidence:{}});
 d=await f.command('archiveTask',{},'2');assert.ok(d.work.archivedAt);
 // A change that is live and being observed counts as done: closing puts it away without stopping anything.
 const live={schemaVersion:2,revision:1,stage:'flow',plan:null,planVersion:0,step:0,results:[],history:[],operations:[],flow:{id:'optimize-page',name:'x',version:1,stages:stagesFor(SYSTEM_PLAYBOOKS.find(p=>p.id==='optimize-page'))},stageIndex:3,observeFrom:'2026-09-20T00:00:00Z'};
 f.state.nrTasks.push({id:5,projectId:'1',title:'Live',brief:'',status:'已完成',evidence:{work:live}});
 d=await f.command('archiveTask',{},'5');assert.ok(d.work.archivedAt);assert.equal(d.work.cancelledAt,undefined);
});

test('tasks of the earlier flows are archived once by the system',async()=>{
 const f=fixture();
 await f.command('startSimple',{kind:'content',scope:'Old simple task'});
 const flowTask={id:3,projectId:'1',title:'Early playbook task',brief:'',status:'待处理',evidence:{work:{schemaVersion:2,revision:1,stage:'flow',plan:null,planVersion:0,step:0,results:[],history:[],operations:[],flow:{id:'x',name:'x',version:1,stages:[{key:'build',name:'b',kind:'agent'},{key:'review',name:'r',kind:'review'},{key:'publish',name:'p',kind:'publish'},{key:'observe',name:'o',kind:'observe'}]},stageIndex:0}}};
 f.state.nrTasks.push(flowTask,{id:4,projectId:'1',title:'Not started',brief:'',status:'待处理',evidence:{}});
 assert.equal(await f.s.archiveLegacy(),2);
 assert.ok((await f.view('1')).work.archivedAt);assert.ok((await f.view('3')).work.archivedAt);assert.equal((await f.view('4')).work.archivedAt,undefined);
 assert.equal(await f.s.archiveLegacy(),0,'runs once');
});

test('after go-live the observing task counts as done for you; release problems wait for you',()=>{
 const {boardState}=require('../../plugins/connections/dist/execution/model');
 const stages=stagesFor(SYSTEM_PLAYBOOKS.find(p=>p.id==='optimize-page')),w=(i,extra={})=>({stage:'flow',flow:{stages},stageIndex:i,results:[],...extra});
 const at=k=>stages.findIndex(s=>s.kind===k);
 assert.equal(boardState(w(at('observe'))),'done');assert.equal(boardState(w(at('agent'))),'doing');assert.equal(boardState(w(at('review'))),'review');
 assert.equal(boardState(w(at('release'),{release:{state:'merging'}})),'doing');assert.equal(boardState(w(at('release'),{release:{state:'merge_failed'}})),'review');
});
