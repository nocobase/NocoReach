import { fakeAgents, selectAgent, claim, finish } from './agents-fixture';
// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/task-execution.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { TaskService } from '../../server/nocoreach/execution/service.js';
import { projectWork } from '../../server/nocoreach/execution/model.js';
const test=__vitest_test;
function fixture(provider={prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>({content:'AI draft'})}){
 const state={nrTasks:[{id:1,projectId:'1',title:'Synthetic task',brief:'Supplied evidence only',status:'待处理',evidence:{reason:'original'}}],nrSnapshots:[],users:[{id:1,username:'tester',roles:[{name:'admin'}]}]};let sequence=100;
 const match=(r,filter={})=>Object.entries(filter).every(([k,v])=>v&&typeof v==='object'?v.$startsWith!==undefined&&String(r[k]).startsWith(v.$startsWith):String(r[k])===String(v));
 const row=r=>r?{...r,get:k=>structuredClone(r[k]),toJSON:()=>structuredClone(r)}:null;
 const repo=name=>({findOne:async({filter,filterByTk})=>row(state[name].find(r=>filterByTk!==undefined?String(r.id)===String(filterByTk):match(r,filter))),find:async({filter,offset=0,limit=100})=>state[name].filter(r=>match(r,filter)).slice(offset,offset+limit).map(row),create:async({values})=>{const r={id:sequence++,...structuredClone(values)};state[name].push(r);return row(r);},update:async({filterByTk,values})=>{Object.assign(state[name].find(r=>String(r.id)===String(filterByTk)),structuredClone(values));}});
 let tail=Promise.resolve();const routes={};
 const p={agents:fakeAgents(),project:async id=>{if(id!=='1')throw Object.assign(Error('project'),{status:404});return {name:'Synthetic'};},db:{getRepository:repo,sequelize:{query:async()=>{},transaction:fn=>{const result=tail.then(async()=>{const old=structuredClone(state);try{const after=[];const value=await fn({connection:{},afterCommit:cb=>after.push(cb)});for(const cb of after)await cb();return value;}catch(e){Object.assign(state,old);throw e;}});tail=result.catch(()=>{});return result;}}},app:{resourceManager:{define:r=>routes[r.name]=r.actions},acl:{allow:()=>{}}}};
 const s=new TaskService(p,provider);
 const command=async(command,body={})=>s.update('1',{taskId:'1',revision:(await s.get('1','1')).work.revision,requestId:randomUUID(),command,...body},'1','Tester');
 return {s,state,command,routes};
}
const plan={deliverable:'Text',verification:'Human observes results later',steps:[{title:'Draft',owner:'human',instruction:'Write only supplied facts',acceptance:'Cite source'}]};
async function ready(f){await f.command('takeOwnership');await f.command('savePlan',{plan});return f.command('approvePlan');}
async function start(f){const d=await f.s.get('1','1');return f.command('startRun',{planVersion:d.work.planVersion,stepId:d.work.plan.steps[0].id,executorId:'atlas'});}
test('legacy read does not write or invent owner; completed task stays completed',async()=>{const f=fixture();f.state.nrTasks[0].status='已完成';const d=await f.s.get('1','1');assert.equal(d.work.stage,'done');assert.equal(d.work.humanOwnerId,undefined);assert.equal(f.state.nrSnapshots.length,0);assert.equal(f.state.nrTasks[0].evidence.work,undefined);});
test('legacy migration preserves evidence and exact snapshot, does not invent runs',async()=>{const f=fixture();const old={revision:2,stage:'work',step:0,plan,results:[{content:'Old',savedAt:'2020-01-01'}],history:[],operations:[]};f.state.nrTasks[0].evidence.work=old;await f.command('takeOwnership');assert.deepEqual(f.state.nrSnapshots.find(r=>r.key.startsWith('nr-task-legacy:')).payload.work,old);const d=await f.s.get('1','1');assert.equal(d.runs.length,0);assert.equal(d.artifacts[0].legacy,true);assert.equal(d.task.evidence.reason,'original');});
test('cannot approve a plan without explicitly claimed human owner',async()=>{const f=fixture();await f.command('savePlan',{plan});await assert.rejects(f.command('approvePlan'),e=>e.status===409);await f.command('takeOwnership');await f.command('approvePlan');});
test('request idempotency binds actor and payload, revision guards concurrency',async()=>{const f=fixture();const v={taskId:'1',revision:0,requestId:randomUUID(),command:'takeOwnership'};await f.s.update('1',v,'1','Tester');await f.s.update('1',v,'1','Tester');assert.equal((await f.s.get('1','1')).work.revision,1);await assert.rejects(f.s.update('1',{...v,command:'savePlan',plan},'1','Tester'),e=>e.status===409);await assert.rejects(f.s.update('1',{...v,requestId:randomUUID()},'1','Tester'),e=>e.status===409);});
test('cross-project and unauthenticated/non-admin routes fail before data access',async()=>{const f=fixture();await assert.rejects(f.s.get('2','1'),e=>e.status===404);f.s.register();const ctx=(user,roles,projectId='1')=>({auth:{user},state:{currentRoles:roles},action:{params:{values:{projectId,taskId:'1'}}},throw:(status,message)=>{throw Object.assign(Error(message),{status});}});await assert.rejects(f.routes.nrTaskWork.get(ctx(null,[]),async()=>{}),e=>e.status===401);await assert.rejects(f.routes.nrTaskWork.get(ctx({id:1},['member']),async()=>{}),e=>e.status===403);await assert.rejects(f.routes.nrTaskWork.get(ctx({id:1},['admin'],'2'),async()=>{}),e=>e.status===404);});


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


test('removed startRun command cannot dispatch an online task', async () => {
 const f = fixture();
 await ready(f);
 await assert.rejects(start(f));
 assert.equal((await f.s.get('1','1')).runs.length, 0);
 f.s.register();
 assert.equal(f.routes.nrTaskRuns.start, undefined);
});
