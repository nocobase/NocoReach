const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const {TaskService}=require('../../apps/nocoreach/server/providers/reach/domain/execution/service.ts');
const {projectWork}=require('../../apps/nocoreach/server/providers/reach/domain/execution/model.ts');
function fixture(provider={prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>({content:'AI draft'})}){
 const state={nrTasks:[{id:1,projectId:'1',title:'Synthetic task',brief:'Supplied evidence only',status:'待处理',evidence:{reason:'original'}}],nrSnapshots:[],users:[{id:1,username:'tester',roles:[{name:'admin'}]}]};let sequence=100;
 const match=(r,filter={})=>Object.entries(filter).every(([k,v])=>v&&typeof v==='object'?v.$startsWith!==undefined&&String(r[k]).startsWith(v.$startsWith):String(r[k])===String(v));
 const row=r=>r?{...r,get:k=>structuredClone(r[k]),toJSON:()=>structuredClone(r)}:null;
 const repo=name=>({findOne:async({filter,filterByTk})=>row(state[name].find(r=>filterByTk!==undefined?String(r.id)===String(filterByTk):match(r,filter))),find:async({filter,offset=0,limit=100})=>state[name].filter(r=>match(r,filter)).slice(offset,offset+limit).map(row),create:async({values})=>{const r={id:sequence++,...structuredClone(values)};state[name].push(r);return row(r);},update:async({filterByTk,values})=>{Object.assign(state[name].find(r=>String(r.id)===String(filterByTk)),structuredClone(values));}});
 let tail=Promise.resolve();const routes={};
 const p={project:async id=>{if(id!=='1')throw Object.assign(Error('project'),{status:404});return {name:'Synthetic'};},store:{roleOf:async id=>{const u=state.users.find(u=>String(u.id)===String(id));return u?.roles?.some(r=>r.name==='admin')?'admin':state.nrSnapshots.find(r=>r.key==='nr-members')?.payload?.users?.[String(id)]||null;},repository:repo,query:async()=>{},transaction:fn=>{const result=tail.then(async()=>{const old=structuredClone(state);try{return await fn({});}catch(e){Object.assign(state,old);throw e;}});tail=result.catch(()=>{});return result;}},routes:{define:r=>routes[r.name]=r.actions,allow:()=>{}}};
 const s=new TaskService(p,provider);
 const command=async(command,body={})=>s.update('1',{taskId:'1',revision:(await s.get('1','1')).work.revision,requestId:randomUUID(),command,...body},'1','Tester');
 return {s,state,command,routes};
}
const plan={deliverable:'Text',verification:'Human observes results later',steps:[{title:'Draft',owner:'ai',instruction:'Write only supplied facts',acceptance:'Cite source'}]};
async function ready(f){await f.command('takeOwnership');await f.command('savePlan',{plan});return f.command('approvePlan');}
async function start(f){const d=await f.s.get('1','1');return f.command('startRun',{planVersion:d.work.planVersion,stepId:d.work.plan.steps[0].id,executorId:'atlas'});}
test('legacy read does not write or invent owner; completed task stays completed',async()=>{const f=fixture();f.state.nrTasks[0].status='已完成';const d=await f.s.get('1','1');assert.equal(d.work.stage,'done');assert.equal(d.work.humanOwnerId,undefined);assert.equal(f.state.nrSnapshots.length,0);assert.equal(f.state.nrTasks[0].evidence.work,undefined);});
test('cannot approve a plan without explicitly claimed human owner',async()=>{const f=fixture();await f.command('savePlan',{plan});await assert.rejects(f.command('approvePlan'),e=>e.status===409);await f.command('takeOwnership');await f.command('approvePlan');});
test('request idempotency binds actor and payload, revision guards concurrency',async()=>{const f=fixture();const v={taskId:'1',revision:0,requestId:randomUUID(),command:'takeOwnership'};await f.s.update('1',v,'1','Tester');await f.s.update('1',v,'1','Tester');assert.equal((await f.s.get('1','1')).work.revision,1);await assert.rejects(f.s.update('1',{...v,command:'savePlan',plan},'1','Tester'),e=>e.status===409);await assert.rejects(f.s.update('1',{...v,requestId:randomUUID()},'1','Tester'),e=>e.status===409);});
test('online run persists candidate, edits create new version and stale review cannot advance',async()=>{const f=fixture();await ready(f);await start(f);await f.s.tick();let d=await f.s.get('1','1');assert.equal(d.runs[0].status,'succeeded');assert.equal(d.work.stage,'work');const first=d.work.results[0];await f.command('saveResult',{content:'Human edit'});await assert.rejects(f.command('approveResult',{artifactId:first.id}),e=>e.status===409);d=await f.s.get('1','1');assert.equal(d.artifacts.length,2);assert.equal(d.artifacts[0].content,'AI draft');await f.command('approveResult',{artifactId:d.work.results[0].id});assert.equal((await f.s.get('1','1')).work.stage,'execution');});
test('rejection requires a new version, regeneration includes feedback',async()=>{let input;const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async r=>{input=r.input;return {content:'revised'};}});await ready(f);await f.command('saveResult',{content:'first'});const id=(await f.s.get('1','1')).work.results[0].id;await f.command('requestChanges',{artifactId:id,comment:'Use concrete details'});await assert.rejects(f.command('approveResult',{artifactId:id}),e=>e.status===409);await start(f);await f.s.tick();assert.match(input,/Use concrete details/);const d=await f.s.get('1','1');assert.equal(d.artifacts.length,2);assert.notEqual(d.work.results[0].id,id);assert.equal(d.work.results[0].rejectedAt,undefined);});
test('late model result never overwrites human edit',async()=>{let release,entered;const begun=new Promise(r=>entered=r),pending=new Promise(r=>release=r);const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>{entered();return pending;}});await ready(f);await start(f);const tick=f.s.tick();await begun;await f.command('saveResult',{content:'Do not overwrite'});release({content:'Late AI'});await tick;const d=await f.s.get('1','1');assert.equal(d.work.results[0].content,'Do not overwrite');assert.equal(d.artifacts.length,2);assert.equal(d.runs[0].error,'candidate_only_context_changed');});
test('persistent queued run resumes in another worker; duplicate starts do not call twice',async()=>{let calls=0;const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>{calls++;return {content:'result'};}});await ready(f);await start(f);await assert.rejects(start(f),e=>e.status===409);const replacement=new TaskService(f.s.p,f.s.provider);await replacement.tick();await replacement.tick();assert.equal(calls,1);});
test('unknown interrupted run is failed, never automatically retried',async()=>{const f=fixture();await ready(f);await start(f);const row=f.state.nrSnapshots.find(r=>r.key.startsWith('nr-task-run:'));row.payload.status='running';row.payload.expiresAt='2000-01-01';await f.s.tick();const d=await f.s.get('1','1');assert.equal(d.runs[0].status,'failed');assert.equal(d.runs[0].error,'interrupted_or_unknown');assert.equal(d.artifacts.length,0);});
test('provider failure preserves saved artifact',async()=>{const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>{throw Error('private provider failure');}});await ready(f);await f.command('saveResult',{content:'saved'});await start(f);await f.s.tick();const d=await f.s.get('1','1');assert.equal(d.work.results[0].content,'saved');assert.equal(d.runs[0].status,'failed');assert.doesNotMatch(JSON.stringify(d),/private provider failure/);});
test('cross-project and unauthenticated/non-admin routes fail before data access',async()=>{const f=fixture();await assert.rejects(f.s.get('2','1'),e=>e.status===404);f.s.register();const ctx=(user,roles,projectId='1')=>({store:{roleOf:async()=>roles.includes('admin')?'admin':null},auth:{user},state:{currentRoles:roles},action:{params:{values:{projectId,taskId:'1'}}},throw:(status,message)=>{throw Object.assign(Error(message),{status});}});await assert.rejects(f.routes.nrTaskWork.get(ctx(null,[]),async()=>{}),e=>e.status===401);await assert.rejects(f.routes.nrTaskWork.get(ctx({id:1},['member']),async()=>{}),e=>e.status===403);await assert.rejects(f.routes.nrTaskWork.get(ctx({id:1},['admin'],'2'),async()=>{}),e=>e.status===404);});

test('revoked actor role stops a queued model call',async()=>{let calls=0;const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>{calls++;return {content:'must not run'};}});await ready(f);await start(f);f.state.users[0].roles=[];await f.s.tick();assert.equal(calls,0);assert.equal((await f.s.get('1','1')).runs[0].status,'failed');});
test('replanning before worker claim does not execute the old plan',async()=>{let calls=0;const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>{calls++;return {content:'wrong'};}});await ready(f);await start(f);await f.command('replan');await f.s.tick();const d=await f.s.get('1','1');assert.equal(calls,0);assert.equal(d.runs[0].error,'context_changed');assert.equal(d.work.stage,'plan');});
test('same start request replay creates one durable run',async()=>{const f=fixture();await ready(f);const d=await f.s.get('1','1'),v={taskId:'1',revision:d.work.revision,requestId:randomUUID(),command:'startRun',planVersion:d.work.planVersion,stepId:d.work.plan.steps[0].id,executorId:'atlas'};await f.s.update('1',v,'1','Tester');await f.s.update('1',v,'1','Tester');assert.equal((await f.s.get('1','1')).runs.length,1);});

test('four-column movement persists order without running AI or changing legacy evidence',async()=>{
 const f=fixture();f.state.nrTasks.push({id:2,projectId:'1',title:'Second',status:'待处理',evidence:{}});
 await f.command('moveWork',{state:'doing'});
 let d=await f.s.get('1','1');assert.equal(d.work.stage,'plan');assert.equal(d.work.boardState,'doing');assert.equal(d.runs.length,0);assert.equal(d.task.evidence.reason,'original');
 await f.command('moveWork',{state:'todo',beforeId:'2'});d=await f.s.get('1','1');assert.ok(d.work.sortOrder<2048);
 await assert.rejects(f.command('moveWork',{state:'review'}),e=>e.status===409);
 await assert.rejects(f.command('moveWork',{state:'done',confirm:true}),e=>e.status===409);
 await assert.rejects(f.command('moveWork',{state:'todo',beforeId:'999'}),e=>e.status===409);
});
test('simple scope supports report completion without a fake publishing receipt',async()=>{
 const f=fixture();await f.command('startSimple',{scope:'Compare supplied evidence',kind:'research'});
 let d=await f.s.get('1','1');assert.equal(d.work.plan.steps.length,1);assert.equal(d.work.humanOwnerId,'1');assert.equal(d.work.stage,'work');assert.equal(d.runs.length,0);
 await f.command('saveResult',{content:'Report'});d=await f.s.get('1','1');assert.equal(d.task.status,'待确认');
 await assert.rejects(f.command('moveWork',{state:'done',confirm:true}),e=>e.status===409);
 await f.command('approveResult',{artifactId:d.work.results[0].id});await f.command('moveWork',{state:'done',confirm:true});
 d=await f.s.get('1','1');assert.equal(d.task.status,'已完成');assert.equal(d.work.receipt,null);assert.equal(d.work.verification,null);
});
test('content work cannot complete on approved draft; execution completes work while observation stays open',async()=>{
 const f=fixture();await f.command('startSimple',{scope:'Update supplied paragraph',kind:'content'});await f.command('saveResult',{content:'Revised'});
 await f.command('approveResult',{artifactId:(await f.s.get('1','1')).work.results[0].id});
 await assert.rejects(f.command('moveWork',{state:'done',confirm:true}),e=>e.status===409);
 await f.command('recordExecution',{note:'Human records publication',url:'https://example.com/page'});
 let d=await f.s.get('1','1');assert.equal(d.task.status,'已完成');assert.equal(d.work.stage,'verification');
 await f.command('verify',{outcome:'inconclusive',note:'Not enough full days'});d=await f.s.get('1','1');assert.equal(d.task.status,'已完成');assert.equal(d.work.stage,'verification');
});
test('running work cannot be moved or marked done',async()=>{const f=fixture();await ready(f);await start(f);await assert.rejects(f.command('moveWork',{state:'todo'}),e=>e.status===409);await f.s.tick();await f.command('moveWork',{state:'review'});});
test('content index validates website and repository paths, isolates projects and preserves concurrent edit',async()=>{
 const f=fixture();f.s.p.project=async id=>{if(id!=='1')throw Object.assign(Error('project'),{status:404});return {domains:['example.com']};};
 const input={title:'Blog',url:'https://example.com/blog#intro',repository:'owner/site',paths:['content/blog.md'],revision:0};
 const saved=await f.s.contentSave('1',input,'1');assert.equal(saved.url,'https://example.com/blog');
 await assert.rejects(f.s.contentSave('1',input,'1'),e=>e.status===409);
 await assert.rejects(f.s.contentSave('1',{...input,url:'https://other.test/blog'},'1'));
 await assert.rejects(f.s.contentSave('1',{...input,paths:['../secret']},'1'));
 await assert.rejects(f.s.contentSave('1',{...input,url:'https://user:secret@example.com/blog'},'1'));
 const v={contentId:saved.id,requestId:randomUUID()};const task=await f.s.createContentWork('1',v,'1'),again=await f.s.createContentWork('1',v,'1');assert.equal(task.id,again.id);assert.equal(task.evidence.work.contentId,saved.id);
 await assert.rejects(f.s.createContentWork('2',v,'1'),e=>e.status===404);
 await f.command('linkContent',{contentId:saved.id});await f.command('startSimple',{scope:'Inspect blog',kind:'content'});await assert.rejects(f.command('linkContent',{contentId:saved.id}),e=>e.status===409);
});
