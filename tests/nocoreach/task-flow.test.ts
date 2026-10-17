import { fakeAgents, selectAgent, claim, finish } from './agents-fixture';
// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/task-flow.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { TaskService } from '../../server/nocoreach/execution/service.js';
import { validateFlow, flowRunInput } from '../../server/nocoreach/execution/flow.js';
import { SYSTEM_PLAYBOOKS, stagesFor, validatePlaybook, defaultPlaybookId, normalize } from '../../server/nocoreach/execution/playbook.js';
import { repoInput, allowedPath } from '../../server/nocoreach/execution/agent.js';
import * as __playbook from '../../server/nocoreach/execution/playbook.js';
import * as __members from '../../server/nocoreach/members.js';
import * as __effect from '../../server/nocoreach/execution/effect.js';
import * as __model from '../../server/nocoreach/execution/model.js';
const test=__vitest_test;

const signals=[{key:'gsc-low-ctr:/a',action:'optimize'},{key:'community-gap:q',action:'create'},{key:'github-release',action:'distribute'},{key:'gsc-site-impressions',action:null}];
function fixture(provider={prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>({content:'AI draft'})},evidence={reason:'original'}){
 const state={nrTasks:[{id:1,projectId:'1',title:'Synthetic task',brief:'Supplied evidence only',status:'待处理',evidence}],nrSnapshots:[],users:[{id:1,username:'tester',roles:[{name:'admin'}]}]};let sequence=100;
 const match=(r,filter={})=>Object.entries(filter).every(([k,v])=>v&&typeof v==='object'?v.$startsWith!==undefined&&String(r[k]).startsWith(v.$startsWith):String(r[k])===String(v));
 const row=r=>r?{...r,get:k=>structuredClone(r[k]),toJSON:()=>structuredClone(r)}:null;
 const repo=name=>({findOne:async({filter,filterByTk})=>row(state[name].find(r=>filterByTk!==undefined?String(r.id)===String(filterByTk):match(r,filter))),find:async({filter,offset=0,limit=100})=>state[name].filter(r=>match(r,filter)).slice(offset,offset+limit).map(row),create:async({values})=>{const r={id:sequence++,...structuredClone(values)};state[name].push(r);return row(r);},update:async({filterByTk,values})=>{Object.assign(state[name].find(r=>String(r.id)===String(filterByTk)),structuredClone(values));}});
 let tail=Promise.resolve();const routes={};
 const p={agents:fakeAgents(),project:async id=>{if(id!=='1')throw Object.assign(Error('project'),{status:404});return {name:'Synthetic',writingStyle:'Plain'};},db:{getRepository:repo,sequelize:{query:async()=>{},transaction:fn=>{const result=tail.then(async()=>{const old=structuredClone(state);try{const after=[];const value=await fn({connection:{},afterCommit:cb=>after.push(cb)});for(const cb of after)await cb();return value;}catch(e){Object.assign(state,old);throw e;}});tail=result.catch(()=>{});return result;}}},app:{resourceManager:{define:r=>routes[r.name]=r.actions},acl:{allow:()=>{}}}};
 const s=new TaskService(p,provider);
 const command=async(command,body={},taskId='1')=>s.update('1',{taskId,revision:(await s.get('1',taskId)).work.revision,requestId:randomUUID(),command,...body},'1','Tester');
 const view=(taskId='1')=>s.get('1',taskId);
 const stage=async(taskId='1')=>{const d=await view(taskId);return d.work.flow.stages[d.work.stageIndex];};
 return {s,state,command,view,stage,routes};
}
const output=d=>d.work.results[d.work.stageIndex-1];


test('task agent overrides the project default, persists on runs and can be changed before a retry', async () => {
  const f = fixture();
  await selectAgent(f);
  const plugin = f.s.p.agents;
  plugin.definitions.set('other-agent', { ...plugin.agent, id: 'other-agent', name: 'Other Agent', online: false });
  let d = await f.command('setAgent', { agentId: 'other-agent' });
  assert.equal(d.work.agentId, 'other-agent');
  assert.equal(d.agent.agentId, 'other-agent');
  assert.equal(d.agent.defaultAgentId, 'shared-agent');
  assert.equal(d.agent.online, false, 'availability follows the chosen task agent');
  assert.equal((await f.s.agents.doc('1')).agentId, 'shared-agent');
  d = await f.command('startTask', { playbookId: 'change-research' });
  const first = d.runs[0];
  assert.equal(first.agentId, 'other-agent');
  assert.equal(first.agentName, 'Other Agent');
  assert.equal(plugin.records.get(first.pluginRunId).agentId, 'other-agent');
  await assert.rejects(f.command('setAgent', { agentId: 'shared-agent' }), /排队或执行/);
  await claim(f);
  await assert.rejects(f.command('setAgent', { agentId: null }), /排队或执行/);
  plugin.records.get(first.pluginRunId).status = 'failed';
  await f.s.runtime.sync((await f.view()).runs[0]);
  await f.command('setAgent', { agentId: null });
  d = await f.command('retryStage', { stageKey: 'analyze' });
  const retried = d.runs.find(r => r.id !== first.id);
  assert.equal(retried.agentId, 'shared-agent');
  assert.equal(plugin.records.get(retried.pluginRunId).agentId, 'shared-agent');
  assert.equal(d.runs.find(r => r.id === first.id).agentName, 'Other Agent');
});

test('a task can choose an agent without a project default or source repository', async () => {
  const f = fixture();
  const selected = await f.command('setAgent', { agentId: 'shared-agent' });
  assert.equal(selected.agent.defaultAgentId, null);
  assert.equal(selected.agent.repo, null);
  const started = await f.command('startTask', { playbookId: 'change-research' });
  assert.equal(started.runs[0].agentId, 'shared-agent');
});

test('task assignment rejects missing, pending and disabled agents and protects owner/revision', async () => {
  const f = fixture(undefined, { createdBy: { id: '1', name: 'Owner' } });
  const plugin = f.s.p.agents;
  plugin.definitions.set('pending', { ...plugin.agent, id: 'pending', status: 'pending' });
  plugin.definitions.set('disabled', { ...plugin.agent, id: 'disabled', status: 'disabled' });
  for (const agentId of ['missing', 'pending', 'disabled']) {
    await assert.rejects(f.command('setAgent', { agentId }), /已启用且可调用/);
  }
  for (const agentId of ['', undefined, 42]) {
    await assert.rejects(f.command('setAgent', { agentId }), /请选择/);
  }
  assert.deepEqual((await f.view()).agent.options.map(a => a.id), ['shared-agent']);
  const before = await f.view();
  f.state.users.push({ id: 2, username: 'reader', roles: [] });
  await assert.rejects(f.s.update('1', { taskId: '1', revision: before.work.revision, requestId: randomUUID(), command: 'setAgent', agentId: 'shared-agent' }, '2', 'Reader'), { status: 403 });
  const selected = await f.command('setAgent', { agentId: 'shared-agent' });
  await assert.rejects(f.s.update('1', { taskId: '1', revision: before.work.revision, requestId: randomUUID(), command: 'setAgent', agentId: null }, '1', 'Owner'), { status: 409 });
  assert.equal((await f.view()).work.revision, selected.work.revision);
  plugin.agent.status = 'disabled';
  await assert.rejects(f.command('startTask', { playbookId: 'change-research' }), /Agent 已失效/);
  assert.equal(plugin.records.size, 0);
});

test('manual takeover checks the official claim before the business timer catches up', async () => {
  const f = fixture();
  await selectAgent(f);
  const before = await f.command('startTask', { playbookId: 'change-research' });
  const run = before.runs[0];
  f.s.p.agents.records.get(run.pluginRunId).status = 'dispatched';
  await assert.rejects(f.command('recordManual', { stageKey: 'analyze', content: 'Manual report' }), /已领取/);
  const after = await f.view();
  assert.equal(after.work.revision, before.work.revision);
  assert.equal(after.artifacts.length, 0);
  assert.equal(after.runs[0].status, 'queued');
});

for (const unavailable of ['missing', 'database-error']) {
  test(`cancelling a task still succeeds when its PR cleanup Agent is ${unavailable}`, async () => {
    const f = fixture();
    await selectAgent(f);
    await f.s.agents.saveRepo('1', { repo: 'org/site', baseBranch: 'main', revision: 1 });
    await f.command('startTask', { playbookId: 'optimize-page' });
    const { run } = await claim(f);
    await finish(f, { taskId: '1', runId: run.id, ok: true, content: 'Changed', pr: {
      url: 'https://github.com/org/site/pull/1', number: 1, branch: 'nocoreach/task-1', headSha: 'abc1234', files: [],
    } });
    f.s.p.agents.agents.findWorkable = async () => {
      if (unavailable === 'database-error') throw new Error('Database unavailable');
      return null;
    };
    if (unavailable === 'database-error') {
      await assert.rejects(f.command('cancelTask'), /Database unavailable/);
      assert.equal((await f.view()).work.cancelledAt, undefined);
      return;
    }
    const cancelled = await f.command('cancelTask');
    assert.equal(cancelled.task.status, '已取消');
    assert.equal(cancelled.work.prClose.state, 'failed');
    assert.match(cancelled.work.prClose.error, /GitHub 手动关闭/);
    assert.equal(cancelled.runs.find(r => r.mode === 'close').error, 'agent_unavailable');
    await f.command('archiveTask');
  });
}

test('built-in playbooks: every step is the Agent or you, grouped by work; custom playbooks are checked before saving',()=>{
 assert.equal(SYSTEM_PLAYBOOKS.length,12);
 // 起草社区回复 (2026-10-08): drafts only, by the Agent without changing the repository, then you; can go on to a docs page.
 {const r=SYSTEM_PLAYBOOKS.find(p=>p.id==='community-reply');assert.equal(r.kind,'plan');assert.deepEqual(stagesFor(r).map(s=>[s.kind,s.mode]),[['agent','analyze'],['review',undefined]]);assert.deepEqual(r.next,['new-doc','optimize-page']);assert.match(r.steps[0].instruction,/### 回复/);assert.match(r.steps[0].instruction,/不发帖/);
  assert.equal(defaultPlaybookId({evidence:{insight:{signalIds:['community-unanswered']},context:{signals:{items:[{key:'community-unanswered',action:'reply'}]}}}}),'community-reply');}
 for(const p of SYSTEM_PLAYBOOKS){const st=stagesFor(p);validateFlow({name:p.name,stages:st});assert.ok(st.every(s=>s.kind!=='ai'),`${p.id} is run by the Agent`);assert.ok(['research','create','optimize','technical'].includes(p.category));
  assert.equal(st.some(s=>s.kind==='release'),p.kind==='build',`${p.id}: only repository changes are released`);}
 assert.deepEqual(SYSTEM_PLAYBOOKS.filter(p=>p.category==='research').map(p=>p.id),['change-research','competitor-compare','keyword-research','community-summary']);
 assert.deepEqual(stagesFor(SYSTEM_PLAYBOOKS.find(p=>p.id==='competitor-compare')).map(s=>[s.kind,s.mode]),[['agent','analyze'],['review',undefined]],'research is an analysis by the Agent');
 assert.deepEqual(stagesFor(SYSTEM_PLAYBOOKS.find(p=>p.id==='optimize-page')).map(s=>s.key),['build','review','release','observe'],'page work goes straight to a change you look at');
 assert.deepEqual(stagesFor(SYSTEM_PLAYBOOKS.find(p=>p.id==='tech-fix')).map(s=>s.key),['plan','approve-plan','build','review','release','observe'],'technical fixes show a plan first');
 const ids=SYSTEM_PLAYBOOKS.map(p=>p.id),a={kind:'analyze',instruction:'compare'},c={kind:'change',instruction:'add it'};
 assert.throws(()=>validatePlaybook({name:'x',steps:[a]},ids),/分类/);
 assert.throws(()=>validatePlaybook({name:'x',category:'research',steps:[{kind:'robot'}]},ids),/类型无效/);
 assert.throws(()=>validatePlaybook({name:'x',category:'research',steps:[{kind:'analyze',instruction:''}]},ids),/完整内容/);
 assert.throws(()=>validatePlaybook({name:'x',category:'research',steps:[a],next:['missing']},ids),/不存在/);
 assert.throws(()=>validatePlaybook({name:'x',category:'research',steps:[a,{kind:'review',checklist:Array.from({length:11},(_,i)=>({label:'c'+i}))}]},ids),/最多 10 项/);
 assert.throws(()=>validatePlaybook({name:'x',category:'research',steps:[{kind:'review'},a]},ids),/第一步要由 Agent/);assert.throws(()=>validatePlaybook({name:'x',category:'research',steps:[a,{kind:'review'},{kind:'review'}]},ids),/要放在 Agent 的步骤之后/);
 const mixed=validatePlaybook({name:'竞品对比后补内容',category:'optimize',steps:[a,{kind:'review',checklist:[{label:'确认要补哪些'}]},c],next:['new-doc']},ids);
 assert.deepEqual(mixed.steps.map(s=>[s.kind,s.name]),[['analyze','分析'],['review','审核'],['change','修改'],['review','看效果并发布']],'a review is added after the last change');
 assert.equal(mixed.kind,'build');assert.deepEqual(mixed.next,[],'a playbook that changes the repository is not handed on');
 assert.deepEqual(stagesFor(mixed).map(s=>s.kind),['agent','review','agent','review','release','observe']);
 assert.deepEqual(validatePlaybook({name:'只分析',category:'research',steps:[a]},ids).steps.map(s=>s.name),['分析','审核']);
 assert.deepEqual(normalize({id:'custom-1',name:'旧',kind:'plan',instructions:'outline',checklist:[],next:['new-doc'],version:2}).steps.map(s=>s.kind),['analyze','review'],'saved document playbooks become an analysis by the Agent');
 assert.deepEqual(normalize({id:'custom-2',name:'旧改',kind:'build',instructions:'edit',planFirst:true,checklist:[],next:[],version:1}).steps.map(s=>s.key),['plan','approve-plan','build','review']);
});

test('default playbook follows the signals behind the opportunity',()=>{
 const task=ids=>({evidence:{insight:{signalIds:ids},context:{signals:{items:signals}}}});
 assert.equal(defaultPlaybookId(task(['gsc-low-ctr:/a','community-gap:q'])),'optimize-page');
 assert.equal(defaultPlaybookId(task(['community-gap:q'])),'content-outline');
 assert.equal(defaultPlaybookId(task(['github-release'])),'release-notes');
 assert.equal(defaultPlaybookId(task(['gsc-site-impressions'])),'change-research');
 assert.equal(defaultPlaybookId({evidence:{reason:'manual'}}),'optimize-page');
});

test('Runner task input: memory, cited signals only, earlier output, feedback, notes and the handed-over document',()=>{
 const task={title:'T',brief:'B',evidence:{insight:{id:'i',signalIds:['gsc-low-ctr:/a']},context:{signals:{items:signals}},handoff:{content:'accepted outline'}}};
 const flow={id:'p',name:'P',version:1,stages:[{key:'draft',name:'撰写',kind:'agent',instruction:'x'},{key:'accept',name:'审核',kind:'review'},{key:'more',name:'补充',kind:'agent',instruction:'y'},{key:'r2',name:'再审',kind:'review'}]};
 const w={flow,playbook:{name:'关键词调研'},results:[{content:'first'},null,{content:'old',rejectedAt:'t'}],note:'keep tone',history:[{action:'comment',comment:'cite GSC'},{action:'runQueued'}]};
 const input=flowRunInput({name:'P',writingStyle:'Plain',secret:'no'},task,w,2,null,[{kind:'stage',stageKey:'more',decision:'requestChanges',comment:'shorter'}]);
 assert.equal(input.project['语气与风格'],'Plain');assert.equal(input.project['项目'],'P');assert.ok(!JSON.stringify(input.project).includes('no'),'only memory sections reach the executor');assert.equal(input.playbook,'关键词调研');
 assert.deepEqual(input.evidence.signals.map(s=>s.key),['gsc-low-ctr:/a']);assert.equal(input.evidence.context,undefined);
 assert.deepEqual(input.previousStages,[{stage:'撰写',output:'first'}]);assert.equal(input.rejectedDraft,'old');assert.deepEqual(input.feedback,['shorter']);
 assert.deepEqual(input.notes,['cite GSC']);assert.equal(input.handoff,'accepted outline');
});

// Saved ai stages keep their business input and execute only on an explicit retry.
const connectAgent=async f=>{const me=await selectAgent(f);await f.s.agents.saveRepo('1',{repo:'estheryo/website',baseBranch:'main',revision:1});return me;};
test('document task: the Agent analyzes without changing the repository, a change request reruns, acceptance hands over to a new build task',async()=>{
 let invoked=0;const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>{invoked++;return {content:'x'};}},{insight:{id:'op',signalIds:['community-gap:q']},context:{signals:{items:signals}}});const me=await connectAgent(f);
 let d=await f.view();assert.equal(d.playbookDefault,'content-outline');assert.equal(d.task.status,'待处理');
 d=await f.command('startTask',{note:'focus on blocks'});assert.equal(d.work.playbook.kind,'plan');assert.ok(d.runs[0].pluginRunId);assert.equal(d.task.status,'进行中');
 let c=await claim(f);assert.equal(c.run.mode,'plan','read-only for every Agent program version');assert.equal(c.run.input.step,'analyze');assert.equal(c.run.input.note,'focus on blocks');assert.deepEqual(c.run.capabilitySnapshot||['repo.read'],['repo.read']);
 await finish(f,{taskId:'1',runId:c.run.id,ok:true,content:'outline 1'});d=await f.view();assert.equal((await f.stage()).key,'accept');assert.equal(d.task.status,'待确认');
 d=await f.command('requestStageChanges',{stageKey:'accept',artifactId:output(d).id,comment:'add examples'});
 c=await claim(f);assert.deepEqual(c.run.input.feedback,['add examples']);await finish(f,{taskId:'1',runId:c.run.id,ok:true,content:'outline 2'});d=await f.view();assert.equal(output(d).content,'outline 2');
 await assert.rejects(f.command('approveStage',{stageKey:'accept',artifactId:output(d).id,checked:['facts'],next:'tech-fix'}),e=>e.status===409);
 await assert.rejects(f.command('approveStage',{stageKey:'accept',artifactId:output(d).id,checked:[]}),e=>e.status===409&&/引用的数据/.test(e.message));
 d=await f.command('approveStage',{stageKey:'accept',artifactId:output(d).id,checked:['facts'],next:'new-doc'});
 assert.equal(d.work.stage,'done');assert.equal(d.task.status,'已完成');assert.ok(d.work.nextTaskId);assert.deepEqual(d.related.map(r=>r.relation),['next']);assert.equal(invoked,0,'no online AI call');
 const child=f.state.nrTasks.find(t=>String(t.id)===d.work.nextTaskId);
 assert.match(child.title,/^新建文档页：/);assert.match(child.brief,/outline 2/);assert.equal(child.evidence.handoff.content,'outline 2');assert.equal(child.evidence.insight.id,'op');
 const ch=await f.view(String(child.id));assert.equal(ch.playbookDefault,'new-doc');assert.equal(ch.task.status,'待处理');assert.deepEqual(ch.related.map(r=>[r.relation,String(r.id)]),[['prev','1']]);
});
test('sharing (2026-10-08): an Agent run carries the page\'s data summary; an accepted document goes into the knowledge base',async()=>{
 const f=fixture(undefined,{insight:{id:'op',signalIds:['community-gap:q']},context:{signals:{items:signals}}});const me=await connectAgent(f);
 const asked=[],saved=[];f.s.p.taskData={forRun:async(project,v)=>{asked.push([project,v.url??null,v.taskId]);return '搜索（近 28 天）：点击 40';}};f.s.p.knowledge={forAgent:async()=>[],saveDelivery:async(project,v)=>{saved.push([project,v.taskId,v.title,v.text]);}};
 await f.command('startTask',{});let c=await claim(f);assert.equal(c.run.input.data,'搜索（近 28 天）：点击 40');assert.deepEqual(asked,[['1',null,'1']]);
 await finish(f,{taskId:'1',runId:c.run.id,ok:true,content:'outline 1'});let d=await f.view();assert.deepEqual(saved,[],'not before it is accepted');
 d=await f.command('approveStage',{stageKey:'accept',artifactId:output(d).id,checked:['facts']});assert.equal(d.work.stage,'done');
 assert.deepEqual(saved,[['1','1','Synthetic task','outline 1']]);
});
test('without a repository: a document task still goes to the Agent; a playbook that changes the repository waits for one',async()=>{
 const f=fixture();const me=await selectAgent(f);
 let d=await f.command('startTask',{playbookId:'competitor-compare'});assert.equal(d.runs[0].status,'queued');assert.ok(d.runs[0].pluginRunId);
 const c=await claim(f);assert.equal(c.run.mode,'plan');assert.equal(c.run.input.step,'analyze');assert.equal(c.run.input.repo,null,'the program analyses without a working copy');
 await finish(f,{taskId:'1',runId:c.run.id,ok:true,content:'report'});assert.equal((await f.stage()).key,'accept');
 const g=fixture();d=await g.command('startTask',{playbookId:'tech-fix'});assert.equal(d.runs.length,0,'its plan step belongs to a repository change');
 await assert.rejects(g.command('retryStage',{stageKey:'plan'}),e=>e.status===409&&/网站源码/.test(e.message));
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
 const f=fixture();const me=await connectAgent(f);
 await assert.rejects(f.command('selectPlaybook',{playbookId:'missing'}),e=>e.status===404);
 let d=await f.command('selectPlaybook',{playbookId:'keyword-research'});assert.equal(d.playbookDefault,'keyword-research');
 d=await f.command('comment',{comment:'use last 90 days'});
 d=await f.command('startTask');assert.equal(d.work.playbook.id,'keyword-research');
 const c=await claim(f);assert.deepEqual(c.run.input.notes,['use last 90 days']);
 await assert.rejects(f.command('selectPlaybook',{playbookId:'new-doc'}),e=>e.status===409);
 await assert.rejects(f.command('startTask'),e=>e.status===409);
 await assert.rejects(f.command('startFlow'),e=>e.status===400);
 await assert.rejects(f.command('startSimple',{scope:'x',kind:'content'}),e=>e.status===409);
 await finish(f,{taskId:'1',runId:c.run.id,ok:true,content:'report'});
 d=await f.view();d=await f.command('approveStage',{stageKey:'accept',artifactId:output(d).id,checked:['facts']});
 await assert.rejects(f.command('comment',{comment:'late'}),e=>e.status===409);
});

test('playbooks: built-in ones are edited in place and restored; copies and new ones; next-step references; started tasks keep their snapshot',async()=>{
 const f=fixture();await connectAgent(f);
 let list=await f.s.playbooks.list('1');assert.equal(list.playbooks.length,12);
 // A built-in playbook is edited where it is, marked as edited, and goes back to the original on restore.
 let r=await f.s.playbooks.save('1',{playbookId:'new-doc',revision:0,name:'新建文档页',category:'create',steps:[{kind:'change',instruction:'English only'}]});
 assert.equal(r.playbook.edited,true);assert.equal(r.playbook.system,true);assert.equal(r.playbook.version,4);assert.equal(r.playbooks.length,12);assert.equal(r.playbooks.find(p=>p.id==='new-doc').steps[0].instruction,'English only');
 await assert.rejects(f.s.playbooks.remove('1',{playbookId:'new-doc',revision:1}),e=>e.status===409&&/恢复默认/.test(e.message));
 r=await f.s.playbooks.restore('1',{playbookId:'new-doc',revision:1});assert.equal(r.playbooks.find(p=>p.id==='new-doc').edited,undefined);assert.match(r.playbooks.find(p=>p.id==='new-doc').steps[0].instruction,/新建页面/);
 await assert.rejects(f.s.playbooks.restore('1',{playbookId:'custom-x',revision:2}),e=>e.status===409);
 const copied=await f.s.playbooks.copy('1',{playbookId:'content-outline',revision:2});const id=copied.playbook.id;
 assert.equal(copied.playbook.name,'内容选题与大纲（副本）');assert.deepEqual(copied.playbook.next,['new-doc','blog-post']);assert.equal(copied.playbook.system,undefined);assert.equal(copied.playbook.category,'create');
 await assert.rejects(f.s.playbooks.copy('1',{playbookId:'content-outline',revision:2}),e=>e.status===409);
 let d=await f.command('startTask',{playbookId:id});assert.deepEqual(d.work.flow.stages.map(s=>s.kind),['agent','review']);
 const builder=await f.s.playbooks.save('1',{revision:3,name:'只改英文',category:'optimize',steps:[{kind:'change',instruction:'English only'}]});
 const saved=await f.s.playbooks.save('1',{playbookId:id,revision:4,name:'选题',category:'create',steps:[{kind:'analyze',instruction:'outline'}],next:[builder.playbook.id]});
 assert.equal(saved.playbook.version,2);assert.deepEqual(saved.playbook.next,[builder.playbook.id]);
 d=await f.view();assert.deepEqual(d.work.playbook.next,['new-doc','blog-post'],'running task keeps the playbook it started with');
 const removed=await f.s.playbooks.remove('1',{playbookId:builder.playbook.id,revision:5});
 assert.deepEqual(removed.playbooks.find(p=>p.id===id).next,[],'removing a playbook clears next-step references');
 // Playbooks saved before steps existed are read as steps.
 f.state.nrSnapshots.find(r=>r.key==='nr-playbooks:1').payload.playbooks.push({id:'custom-old',name:'旧做法',kind:'build',instructions:'edit',planFirst:false,checklist:[],next:[],version:1});
 assert.deepEqual((await f.s.playbooks.get('1','custom-old')).steps.map(s=>s.kind),['change','review']);
});
test('AI drafts a playbook from one sentence; the draft is checked and not saved; an unusable answer says so',async()=>{
 const {draftPlaybook}=__playbook;const list={playbooks:SYSTEM_PLAYBOOKS};let asked;
 const answer='```json\n'+JSON.stringify({name:'同步更新日志',category:'create',description:'新版本发布后同步中英文更新日志',steps:[{kind:'analyze',name:'整理',instruction:'读 Release 说明，按新增、改进、修复整理'},{kind:'review',checklist:[{label:'版本号正确'}]},{kind:'change',instruction:'写入中英文更新日志页面'}]})+'\n```';
 const r=await draftPlaybook({request:'每个新版本发布后同步更新日志'},list,{name:'Synthetic'},async(system,user)=>{asked={system,user};return answer;});
 assert.equal(r.draft.name,'同步更新日志');assert.deepEqual(r.draft.steps.map(s=>s.kind),['analyze','review','change','review']);assert.equal(r.draft.steps[3].name,'看效果并发布');
 assert.match(asked.system,/Agent/);assert.ok(JSON.parse(asked.user).existing.includes('优化现有页面'));
 await assert.rejects(draftPlaybook({request:'x'},list,{},async()=>'抱歉'),e=>e.status===422);
 await assert.rejects(draftPlaybook({request:'x'},list,{},async()=>'{"name":"x","category":"nope","steps":[]}'),e=>e.status===422&&/手动填写/.test(e.message));
 await assert.rejects(draftPlaybook({request:''},list,{},async()=>answer),/完整内容/);
});


test('repository settings use revision checks and task assignment rejects disabled agents',async()=>{
 const f=fixture();await selectAgent(f);
 await f.s.agents.saveRepo('1',{repo:'https://github.com/estheryo/website-test',baseBranch:'main',revision:1});
 await assert.rejects(f.s.agents.removeRepo('1',{revision:0}),e=>e.status===409);
 f.s.p.agents.agent.status='disabled';
 await assert.rejects(f.s.lock('1','1',tx=>f.s.agents.taskAgent('shared-agent','1',tx)),e=>e.status===409);
 assert.throws(()=>repoInput({repo:'o/r',baseBranch:'main',allowedPaths:['../x']}),/相对路径/);
 assert.equal(allowedPath({allowedPaths:['docs']},'docs/a.md'),true);
 assert.equal(allowedPath({allowedPaths:['docs']},'docs-other/a.md'),false);
});

test('build task with the local Agent: plan, approval, PR on the task branch only, change request on the same branch',async()=>{
 let invoked=0;const f=fixture({prepare:async()=>({llmService:'test',model:'echo'}),invoke:async()=>{invoked++;return {content:'x'};}});
 const me=await selectAgent(f);
 await f.s.agents.saveRepo('1',{repo:'estheryo/website',baseBranch:'main',allowedPaths:['content'],revision:1});
 let d=await f.command('startTask',{playbookId:'tech-fix'});
 assert.equal(d.runs[0].status,'queued');assert.ok(d.runs[0].pluginRunId);assert.equal(d.agent.repo.repo,'estheryo/website');
 await f.s.tick();assert.equal(invoked,0,'the server never runs local Agent work itself');
 let c=await claim(f);assert.equal(c.run.mode,'plan');assert.equal(c.run.input.repo.repo,'estheryo/website');assert.equal(c.run.branch,'nocoreach/task-1');assert.ok(c.run.input.stage.instruction.includes('先不要修改文件'));
 assert.deepEqual(await claim(f),{run:null});
 await finish(f,{taskId:'1',runId:c.run.id,ok:true,content:'Change content/articles/a/index.md intro'});
 d=await f.view();assert.equal((await f.stage()).key,'approve-plan');assert.equal(output(d).content,'Change content/articles/a/index.md intro');
 d=await f.command('approveStage',{stageKey:'approve-plan',artifactId:output(d).id,checked:[]});assert.equal(d.runs.filter(r=>r.status==='queued').length,1);
 c=await claim(f);assert.equal(c.run.mode,'build');assert.equal(c.run.input.previousStages[0].output,'Change content/articles/a/index.md intro');
 const pr=(url,extra={})=>({taskId:'1',runId:c.run.id,ok:true,content:'Opened PR',pr:{url,number:3,branch:'nocoreach/task-1',headSha:'abc1234',files:[{path:'content/articles/a/index.md',additions:12,deletions:2},{path:'src/pages/x.astro',additions:1,deletions:0}],checks:{ok:true,summary:'内容检查通过'},...extra}});
 await assert.rejects(finish(f,pr('https://github.com/nocobase/website/pull/3')),e=>e.status===400,'never accept a PR on the upstream repository');
 await assert.rejects(finish(f,pr('https://github.com/estheryo/website/pull/3',{branch:'main'})),e=>e.status===400);
 await assert.rejects(finish(f,pr('https://github.com/estheryo/website/pull/3',{number:4})),e=>e.status===400);
 await assert.rejects(finish(f,pr('https://github.com/estheryo/website/pull/3',{headSha:undefined})),e=>e.status===400);
 await finish(f,pr('https://github.com/estheryo/website/pull/3'));
 d=await f.view();assert.equal((await f.stage()).key,'review');assert.equal(output(d).pr.number,3);assert.deepEqual(output(d).pr.outOfScope,['src/pages/x.astro']);
 await assert.rejects(f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:[]}),e=>e.status===409&&/超出允许范围/.test(e.message));
 d=await f.command('requestStageChanges',{stageKey:'review',artifactId:output(d).id,comment:'keep the original title'});
 c=await claim(f);assert.equal(c.run.branch,'nocoreach/task-1');assert.deepEqual(c.run.input.feedback,['keep the original title']);assert.equal(c.run.input.rejectedDraft,'Opened PR');
});

test('stopping, manual takeover and interrupted Agent runs',async()=>{
 const f=fixture();const me=await selectAgent(f);
 await f.s.agents.saveRepo('1',{repo:'estheryo/website',baseBranch:'main',revision:1});
 let d=await f.command('startTask',{playbookId:'tech-fix'});const queued=d.runs[0];
 d=await f.command('recordManual',{stageKey:'plan',content:'I will do it myself'});assert.equal(d.runs.find(r=>r.id===queued.id).error,'replaced_by_manual');assert.equal((await f.stage()).key,'approve-plan');
 d=await f.command('approveStage',{stageKey:'approve-plan',artifactId:output(d).id,checked:[]});const build=d.runs.find(r=>r.status==='queued');
 const c=await claim(f);assert.equal(c.run.id,build.id);
 await assert.rejects(f.command('recordManual',{stageKey:'build',content:'x'}),e=>e.status===409);
 await f.command('cancelRun',{runId:build.id});await finish(f,{taskId:'1',runId:build.id,ok:false,error:'cancelled'});d=await f.view();assert.equal(d.runs.find(r=>r.id===build.id).error,'cancelled');assert.equal((await f.stage()).key,'build');
 d=await f.command('retryStage',{stageKey:'build'});const again=d.runs.find(r=>r.status==='queued');await claim(f);
 const row=f.state.nrSnapshots.find(r=>r.key.endsWith(again.id));f.s.p.agents.records.get(row.payload.pluginRunId).status='failed';
 await f.s.tick();d=await f.view();assert.equal(d.runs.find(r=>r.id===again.id).error,'agent_failed');assert.equal((await f.stage()).key,'build','an interrupted run is not retried by itself');
});

test('people and page: owner changes between runs, collaborators and linked pages come from real users and 网站内容',async()=>{
 const f=fixture();f.state.users.push({id:2,nickname:'Lin'},{id:3,nickname:'Mia'});
 // Lin has joined as 成员 in 设置 · 成员; Mia is a NocoBase user who has not joined, so she cannot own or join a task.
 f.state.nrSnapshots.push({id:8999,key:'nr-members',payload:{users:{'2':'member'}}});
 f.state.nrSnapshots.push({id:9000,key:'site-content:1',payload:{pages:[{url:'https://example.com/docs/install',title:'安装指南',type:'docs'},{url:'https://example.com/blog/x',title:'X',type:'blog'}]}});
 assert.deepEqual((await f.s.members()).map(m=>m.name),['tester','Lin','Mia'],'without the members list: every user');
 f.s.p.members=new (__members.Members)(f.s.p);
 assert.deepEqual((await f.s.members()).map(m=>m.name),['tester','Lin'],'only people who joined can own a task');
 assert.deepEqual((await f.s.pages('1','安装')).map(p=>p.url),['https://example.com/docs/install']);assert.equal((await f.s.pages('1','')).length,2);
 await assert.rejects(f.command('linkPage',{url:'https://example.com/nope'}),e=>e.status===404);
 let d=await f.command('linkPage',{url:'https://example.com/docs/install'});assert.deepEqual(d.work.page,{url:'https://example.com/docs/install',title:'安装指南'});
 await assert.rejects(f.command('setCollaborators',{userIds:['2','404']}),e=>e.status===404);
 await assert.rejects(f.command('setCollaborators',{userIds:['3']}),e=>e.status===409&&/还没有加入/.test(e.message));
 d=await f.command('setCollaborators',{userIds:['2','2']});assert.deepEqual(d.work.collaborators,[{id:'2',name:'Lin'}]);
 const me=await connectAgent(f);
 d=await f.command('startTask',{playbookId:'change-research'});const run=d.runs.find(r=>r.status==='queued');assert.ok(run,'Agent run queued');
 assert.equal(JSON.parse(f.state.nrSnapshots.find(r=>r.key.endsWith(run.id)).payload.input).content.url,'https://example.com/docs/install','the run reads the linked page');
 await assert.rejects(f.command('setOwner',{userId:'2'}),e=>e.status===409);
 const c=await claim(f);await finish(f,{taskId:'1',runId:c.run.id,ok:true,content:'report'});d=await f.view();assert.ok(!d.runs.some(r=>r.status==='queued'||r.status==='running'));
 d=await f.command('setOwner',{userId:'2'});assert.equal(d.work.humanOwnerName,'Lin');
 d=await f.command('linkPage',{url:''});assert.equal(d.work.page,undefined);
});

test('roles: on a task with an owner, other members can only leave a message; the owner and 管理员 do the steps',async()=>{
 const f=fixture();f.state.users.push({id:2,nickname:'Lin'},{id:3,nickname:'Mia'});
 f.state.nrSnapshots.push({id:8999,key:'nr-members',payload:{users:{'2':'member','3':'member'}}});
 let d=await f.command('setOwner',{userId:'2'});assert.equal(d.work.humanOwnerId,'2');
 const as=async(actor,command,body={})=>f.s.update('1',{taskId:'1',revision:(await f.view()).work.revision,requestId:randomUUID(),command,...body},actor,actor==='2'?'Lin':'Mia');
 await assert.rejects(as('3','startTask',{playbookId:'change-research'}),e=>e.status===403&&/由 Lin 把关/.test(e.message));
 await assert.rejects(as('3','setOwner',{userId:'3'}),e=>e.status===403);
 await assert.rejects(as('3','cancelTask'),e=>e.status===403);
 d=await as('3','comment',{comment:'看一下第二段'});assert.ok(d.work.history.some(h=>h.action==='comment'&&h.actor==='3'));
 d=await as('2','selectPlaybook',{playbookId:'change-research'});assert.equal(d.work.playbookId,'change-research');
 // 管理员 (user 1) can still act on Lin's task; someone with no role left cannot.
 d=await f.command('setOwner',{userId:'3'});assert.equal(d.work.humanOwnerName,'Mia');
 f.state.nrSnapshots.find(r=>r.key==='nr-members').payload.users={'2':'member'};
 await assert.rejects(f.s.authorized('3'),e=>e.status===403);await f.s.authorized('2');
});

test('notifications: the owner hears of a step waiting for them, becoming owner and others\' messages — not of their own doings',async()=>{
 const f=fixture();f.state.users.push({id:2,nickname:'Lin'},{id:3,nickname:'Mia'});f.state.nrSnapshots.push({id:8999,key:'nr-members',payload:{users:{'2':'member','3':'member'}}});
 const told=[];f.s.p.notifications={taskEvents:async(task,w,events)=>{told.push(...events.map(e=>[e.kind,w.humanOwnerId,e.by||'',e.step||e.comment||'']));}};
 const as=async(actor,command,body={})=>f.s.update('1',{taskId:'1',revision:(await f.view()).work.revision,requestId:randomUUID(),command,...body},actor,'x');
 await f.command('setOwner',{userId:'2'});
 await as('3','comment',{comment:'看一下第二段'});await as('2','comment',{comment:'好的'});
 assert.deepEqual(told,[['owner','2','1',''],['comment','2','3','看一下第二段']]);
 told.length=0;await as('2','takeOwnership');assert.deepEqual(told,[],'nothing about what the owner did');
});
test('notifications: when the Agent finishes and the task waits for its owner, the owner hears which step',async()=>{
 const f=fixture();const told=[];f.s.p.notifications={taskEvents:async(task,w,events)=>{told.push(...events.map(e=>[e.kind,e.step||'']));}};
 const me=await connectAgent(f);await f.command('startTask',{playbookId:'change-research'});assert.deepEqual(told,[]);
 const c=await claim(f);await finish(f,{taskId:'1',runId:c.run.id,ok:true,content:'report'});
 const d=await f.view();assert.equal(d.work.flow.stages[d.work.stageIndex].kind,'review');assert.deepEqual(told,[['waiting',d.work.flow.stages[d.work.stageIndex].name]]);
});

test('a new task belongs to whoever created it; older tasks keep no owner',async()=>{
 const f=fixture(undefined,{reason:'original',createdBy:{id:'2',name:'Lin'}});
 assert.equal((await f.view()).work.humanOwnerName,'Lin');
 const g=fixture();assert.equal((await g.view()).work.humanOwnerId,undefined);
});

test('publish: the Agent merges the reviewed commit, the system checks the live page, then observation starts',async()=>{
 const f=fixture();const me=await selectAgent(f);
 await f.s.agents.saveRepo('1',{repo:'https://github.com/estheryo/website-test',baseBranch:'main',revision:1});
 f.state.nrSnapshots.push({id:9100,key:'site-content:1',payload:{sites:[{origin:'https://www.example.com'}],pages:[{url:'https://www.example.com/cn/commercial',title:'商业服务',type:'page'}]}});
 let d=await f.command('startTask',{playbookId:'optimize-page'});assert.equal((await f.stage()).key,'build');
 let c=await claim(f);assert.equal(c.run.mode,'build');
 const change={path:'src/pages/cn/commercial.astro',before:'<h2>方案对比</h2>',after:'<h2>方案对比</h2>\n<a>立即体验 Demo</a>'};
 await finish(f,{taskId:'1',runId:c.run.id,ok:true,content:'Added the entry',pr:{url:'https://github.com/estheryo/website-test/pull/1',number:1,branch:'nocoreach/task-1',headSha:'abc1234',files:[{path:change.path,additions:1,deletions:0}],release:'在商业服务页新增体验入口',verifyText:'立即体验 Demo',pages:['/cn/commercial','javascript:alert(1)'],changes:[change,{path:'',before:'x',after:'y'}]}});
 d=await f.view();const out=output(d);assert.equal((await f.stage()).name,'看效果并发布');assert.equal(out.pr.release,'在商业服务页新增体验入口');assert.deepEqual(out.pr.changes,[change]);
 // preview links reported by the Agent program for PRs waiting for review
 d=await f.command('approveStage',{stageKey:'review',artifactId:out.id,checked:[]});
 assert.equal((await f.stage()).kind,'release');assert.equal(d.work.release.state,'merging');assert.deepEqual(d.work.release.pages,['https://www.example.com/cn/commercial']);assert.equal(d.work.release.note,'在商业服务页新增体验入口');
 c=await claim(f);assert.equal(c.run.mode,'merge');assert.deepEqual(c.run.input.pr,{number:1,url:'https://github.com/estheryo/website-test/pull/1',headSha:'abc1234'});
 await finish(f,{taskId:'1',runId:c.run.id,ok:false,error:'head_changed',message:'PR 在你看过之后又有新的提交'});
 d=await f.view();assert.equal(d.work.release.state,'merge_failed');assert.match(d.work.release.error,/新的提交/);
 d=await f.command('retryMerge',{stageKey:'release'});c=await claim(f);
 await finish(f,{taskId:'1',runId:c.run.id,ok:true,merged:{sha:'def5678'}});
 d=await f.view();assert.equal(d.work.release.state,'verifying');assert.equal(d.work.release.mergeSha,'def5678');
 const pages=[];let html='<html><body><h2>方案对比</h2></body></html>';const read=async url=>{pages.push(url);return {text:html};};
 await f.s.verifyReleases(read);d=await f.view();assert.equal(d.work.release.state,'verifying');assert.equal(d.work.release.checks,1);assert.ok(Date.parse(d.work.release.nextCheckAt)>Date.now(),'next look in half an hour');
 await f.s.verifyReleases(read);assert.equal(pages.length,1,'not due yet');
 const task=f.state.nrTasks[0];task.evidence.work.release.nextCheckAt=new Date(Date.now()-1).toISOString();html='<a class="x">立即体验&nbsp;Demo</a>';
 await f.s.verifyReleases(read);d=await f.view();assert.equal(d.work.release.state,'live');assert.equal(d.work.stage,'done');assert.ok(d.work.observeFrom);assert.equal(d.work.receipt.url,'https://www.example.com/cn/commercial');

 // 撤回: the Agent opens GitHub's revert of the merged PR; a PR on another repository is refused; a failure can be retried
 d=await f.command('revertRelease');assert.equal(d.work.revert.state,'opening');assert.equal(d.work.revert.of,1);
 await assert.rejects(f.command('revertRelease'),e=>e.status===409,'one revert at a time');
 c=await claim(f);assert.equal(c.run.mode,'revert');assert.deepEqual(c.run.input.pr,{number:1,url:'https://github.com/estheryo/website-test/pull/1'});assert.equal(c.run.input.repo.repo,'estheryo/website-test');
 await finish(f,{taskId:'1',runId:c.run.id,ok:false,error:'revert_failed',message:'GitHub 没有开出回退 PR'});d=await f.view();assert.equal(d.work.revert.state,'failed');assert.match(d.work.revert.error,/没有开出/);
 d=await f.command('revertRelease');c=await claim(f);
 await assert.rejects(finish(f,{taskId:'1',runId:c.run.id,ok:true,pr:{url:'https://github.com/nocobase/website/pull/9',number:9}}),e=>e.status===400);
 await finish(f,{taskId:'1',runId:c.run.id,ok:true,pr:{url:'https://github.com/estheryo/website-test/pull/2',number:2}});
 d=await f.view();assert.deepEqual([d.work.revert.state,d.work.revert.number,d.work.revert.url],['opened',2,'https://github.com/estheryo/website-test/pull/2']);assert.equal(d.work.stage,'done','the task stays done; observation continues');
 assert.ok(d.work.history.some(e=>e.action==='revertOpened'));
});

test('publish: not seen within a day asks you; you can wait longer, confirm it is live, or say you merged it yourself',async()=>{
 const f=fixture();const me=await selectAgent(f);
 await f.s.agents.saveRepo('1',{repo:'estheryo/website-test',baseBranch:'main',revision:1});
 let d=await f.command('startTask',{playbookId:'blog-post'});let c=await claim(f);
 await finish(f,{taskId:'1',runId:c.run.id,ok:true,content:'Wrote it',pr:{url:'https://github.com/estheryo/website-test/pull/2',number:2,branch:'nocoreach/task-1',headSha:'abc1234',files:[],verifyText:'新文章',pages:['https://www.example.com/blog/new']}});
 d=await f.view();d=await f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:[]});
 c=await claim(f);await finish(f,{taskId:'1',runId:c.run.id,ok:false,error:'merge_failed',message:'GitHub 没有完成合并：checks pending'});
 d=await f.command('markMerged',{stageKey:'release'});assert.equal(d.work.release.state,'verifying');assert.equal(d.task.status,'进行中');
 const w=f.state.nrTasks[0].evidence.work.release;w.deadline=new Date(Date.now()-1).toISOString();w.nextCheckAt=w.deadline;
 await f.s.verifyReleases(async()=>({text:'old page'}));d=await f.view();assert.equal(d.work.release.state,'not_seen');assert.equal(d.task.status,'待确认','it waits for you on the board');
 d=await f.command('waitLonger',{stageKey:'release'});assert.equal(d.work.release.state,'verifying');assert.ok(Date.parse(d.work.release.deadline)>Date.now()+23*3600000);
 d=await f.command('confirmLive',{stageKey:'release'});assert.equal(d.work.stage,'done');
});

test('effect observation: day 7 and day 28 compare the page with the days before it went live',()=>{
 const {compare,windows,pageKey,summary}=__effect;
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
 const f=fixture();const me=await selectAgent(f);
 await f.s.agents.saveRepo('1',{repo:'estheryo/website-test',baseBranch:'main',revision:1});
 let d=await f.command('startTask',{playbookId:'optimize-page'});let c=await claim(f);
 await finish(f,{taskId:'1',runId:c.run.id,ok:true,content:'Changed',pr:{url:'https://github.com/estheryo/website-test/pull/4',number:4,branch:'nocoreach/task-1',headSha:'abc1234',files:[]}});
 await assert.rejects(f.command('archiveTask'),e=>e.status===409&&/先停止/.test(e.message));
 d=await f.command('cancelTask',{reason:'不做了'});assert.ok(d.work.cancelledAt);assert.equal(d.task.status,'已取消');assert.equal(d.work.prClose.state,'closing');
 const close=d.runs.find(r=>r.status==='queued');assert.equal(close.mode,'close');
 await assert.rejects(f.command('approveStage',{stageKey:'review',artifactId:output(d).id,checked:[]}),e=>e.status===409&&/已取消/.test(e.message));
 c=await claim(f);assert.equal(c.run.mode,'close');assert.deepEqual(c.run.input.pr,{number:4,url:'https://github.com/estheryo/website-test/pull/4'});
 await finish(f,{taskId:'1',runId:c.run.id,ok:true});d=await f.view();assert.equal(d.work.prClose.state,'closed');
 d=await f.command('archiveTask');assert.ok(d.work.archivedAt);
 await assert.rejects(f.command('linkPage',{url:''}),e=>e.status===409&&/归档/.test(e.message));
 d=await f.command('unarchiveTask');assert.equal(d.work.archivedAt,undefined);assert.ok(d.work.cancelledAt,'restoring does not reopen a cancelled task');
});

test('cancelling stops a running Agent and its late result is kept only as a candidate; not-started tasks archive directly',async()=>{
 const f=fixture();const me=await selectAgent(f);
 await f.s.agents.saveRepo('1',{repo:'estheryo/website-test',baseBranch:'main',revision:1});
 let d=await f.command('startTask',{playbookId:'optimize-page'});const c=await claim(f);
 await f.command('cancelTask');await finish(f,{taskId:'1',runId:c.run.id,ok:true,content:'late',pr:{url:'https://github.com/estheryo/website-test/pull/5',number:5,branch:'nocoreach/task-1',headSha:'abc1234',files:[]}});
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
 const {boardState}=__model;
 const stages=stagesFor(SYSTEM_PLAYBOOKS.find(p=>p.id==='optimize-page')),w=(i,extra={})=>({stage:'flow',flow:{stages},stageIndex:i,results:[],...extra});
 const at=k=>stages.findIndex(s=>s.kind===k);
 assert.equal(boardState(w(at('observe'))),'done');assert.equal(boardState(w(at('agent'))),'doing');assert.equal(boardState(w(at('review'))),'review');
 assert.equal(boardState(w(at('release'),{release:{state:'merging'}})),'doing');assert.equal(boardState(w(at('release'),{release:{state:'merge_failed'}})),'review');
});
test('the project 知识库 comes with a claimed Agent run, included in the immutable input',async()=>{
 const f=fixture();const me=await connectAgent(f);let asked=0;f.s.p.knowledge={forAgent:async p=>{asked++;assert.equal(p,'1');return [{id:'k1',title:'Retool 对比',category:'competitor',text:'按人数收费'}];}};
 await f.command('startTask',{playbookId:'competitor-compare'});const c=await claim(f);
 assert.deepEqual(c.run.input.knowledge,[{id:'k1',title:'Retool 对比',category:'competitor',text:'按人数收费'}]);assert.equal(asked,1);
 const stored=f.state.nrSnapshots.find(r=>r.key.endsWith(c.run.id)).payload;assert.ok(JSON.stringify(stored).includes('按人数收费'),'the authorized input is reproducible');
});
test('Skills: a step names the Skills it uses; they and the ones turned on come with the claimed run, included in the input',async()=>{
 const ids=SYSTEM_PLAYBOOKS.map(p=>p.id);
 const p=validatePlaybook({name:'改标题',category:'optimize',steps:[{kind:'change',instruction:'改标题',skills:['seo-title-description','seo-title-description','sk-1a2b3c4d']}]},ids);
 assert.deepEqual(p.steps[0].skills,['seo-title-description','sk-1a2b3c4d'],'duplicates are dropped');assert.equal(p.steps[1].skills,undefined,'reviews have none');
 assert.deepEqual(stagesFor(p)[0].skills,['seo-title-description','sk-1a2b3c4d']);assert.equal(validatePlaybook({name:'x',category:'optimize',steps:[{kind:'change',instruction:'y',skills:[]}]},ids).steps[0].skills,undefined);
 assert.throws(()=>validatePlaybook({name:'x',category:'optimize',steps:[{kind:'change',instruction:'y',skills:['a','b','c','d','e','f']}]},ids),/最多指定 5 个 Skill/);
 assert.throws(()=>validatePlaybook({name:'x',category:'optimize',steps:[{kind:'change',instruction:'y',skills:['../x']}]},ids),/Skill/);
 assert.deepEqual(validateFlow({name:'x',stages:stagesFor(p)}).stages[0].skills,['seo-title-description','sk-1a2b3c4d']);
 const f=fixture();const me=await connectAgent(f);const asked=[];f.s.p.skills={forAgent:async(project,required)=>{asked.push([project,required]);return [{name:'seo-title-description',description:'改标题时用',required:true,body:'标题 30–60 字符',files:[]}];}};
 await f.s.playbooks.save('1',{playbookId:'optimize-page',revision:0,name:'优化现有页面',category:'optimize',steps:[{kind:'change',instruction:'优化',skills:['seo-title-description']}]});
 await f.command('startTask',{playbookId:'optimize-page'});const c=await claim(f);
 assert.deepEqual(c.run.input.stage.skills,['seo-title-description']);assert.deepEqual(asked,[['1',['seo-title-description']]]);assert.equal(c.run.input.skills[0].body,'标题 30–60 字符');
 const stored=f.state.nrSnapshots.find(r=>r.key.endsWith(c.run.id)).payload;assert.ok(JSON.stringify(stored).includes('标题 30–60 字符'),'the authorized input is reproducible');
});

test('discovered Runner agents deliver drafts through official runs without a repository', async () => {
  const f = fixture();
  const researcher = { ...f.s.p.agents.agent, id: 'researcher', name: 'Researcher' };
  f.s.p.agents.definitions.set(researcher.id, researcher);
  await f.command('setAgent', { agentId: researcher.id });
  const started = await f.command('startTask', { playbookId: 'community-reply' });
  const run = started.runs[0];
  assert.ok(run.pluginRunId);
  assert.ok(run.pluginRunId);
  const official = f.s.p.agents.records.get(run.pluginRunId);
  official.status = 'completed';
  official.summary = JSON.stringify({ ok: true, content: 'Draft with evidence', report: { kind: 'communityReply', sources: [{ title:'Topic',url:'https://forum.example.com/t/1' }], asOf:'2026-10-10', uncertainties:['Version is unknown'] } });
  await f.s.runtime.sync(f.state.nrSnapshots.find(row => row.payload.id === run.id).payload);
  const finished = await f.view();
  assert.equal(finished.runs[0].status, 'succeeded');
  assert.equal(finished.artifacts[0].report.kind, 'communityReply');
  assert.equal(finished.work.flow.stages[finished.work.stageIndex].kind, 'review');

});

test('startTask preserves playbook origin on both immutable snapshots', async () => {
  for (const variant of ['system', 'edited', 'copied', 'custom']) {
    const f = fixture();
    await selectAgent(f);
    const original = SYSTEM_PLAYBOOKS.find(p => p.id === 'change-research');
    let selected = original;
    if (variant === 'edited') {
      selected = (await f.s.playbooks.save('1', { ...original, playbookId: original.id, revision: 0, name: '分析。任务。 {0}' })).playbook;
    } else if (variant === 'copied') {
      selected = (await f.s.playbooks.copy('1', { playbookId: original.id, revision: 0 })).playbook;
    } else if (variant === 'custom') {
      selected = (await f.s.playbooks.save('1', { ...original, playbookId: undefined, revision: 0, name: '任务 {0}' })).playbook;
    }
    const started = await f.command('startTask', { playbookId: selected.id, system: true, edited: false });
    for (const snapshot of [started.work.flow, started.work.playbook]) {
      assert.equal(snapshot.system, variant === 'system' || variant === 'edited', variant);
      assert.equal(snapshot.edited, variant === 'edited', variant);
      assert.equal(snapshot.name, selected.name, 'stored names remain original');
    }
    assert.deepEqual(started.work.flow.stages, stagesFor(selected));
    const saved = structuredClone(started.work.flow);
    if (variant === 'edited') await f.s.playbooks.restore('1', { playbookId: original.id, revision: 1 });
    else if (variant === 'system') await f.s.playbooks.save('1', { ...original, playbookId: original.id, revision: 0, name: '后来改名' });
    assert.deepEqual((await f.view()).work.flow, saved, 'later edits/restoration do not rewrite a started snapshot');
  }
});

test('an imported older edited built-in can collide with the current canonical snapshot version', async () => {
  const f = fixture();
  await selectAgent(f);
  const original = SYSTEM_PLAYBOOKS.find(p => p.id === 'change-research');
  // nrImport preserves nrSnapshots payloads; merge/normalize preserve their version.
  f.state.nrSnapshots.push({ id: 90, key: 'nr-playbooks:1', payload: {
    revision: 0, playbooks: [{ ...structuredClone(original), edited: true, version: 2 }],
  } });
  const edited = (await f.s.playbooks.save('1', { ...original, playbookId: original.id, revision: 0 })).playbook;
  assert.equal(edited.version, original.version);
  assert.equal(edited.edited, true);
  assert.deepEqual(stagesFor(edited), stagesFor(original));
  const started = await f.command('startTask', { playbookId: original.id });
  assert.equal(started.work.flow.edited, true);
  const { system, edited: flag, ...legacyFlow } = started.work.flow;
  assert.equal(system, true);
  assert.equal(flag, true);
  assert.deepEqual(legacyFlow, { id: original.id, name: original.name, version: original.version, stages: stagesFor(original) });
});

test('demo runs the configured Agent and completes review without merging, publishing or verifying live pages',async()=>{
 const f=fixture();f.s.p.mock={enabled:true,guardExternal:()=>{throw Object.assign(new Error('blocked'),{code:'NR_MOCK_UNSUPPORTED_OPERATION'});}};await selectAgent(f);
 await f.s.agents.saveRepo('1',{repo:'https://github.com/estheryo/website-test',baseBranch:'main',revision:1});
 f.state.nrSnapshots.push({id:9100,key:'site-content:1',payload:{sites:[{origin:'https://www.example.com'}],pages:[{url:'https://www.example.com/cn/commercial',title:'商业服务',type:'page'}]}});
 await f.command('startTask',{playbookId:'optimize-page'});assert.equal((await f.stage()).key,'build');
 const c=await claim(f);assert.equal(c.run.mode,'build');
 const change={path:'src/pages/cn/commercial.astro',before:'<h2>方案对比</h2>',after:'<h2>方案对比</h2>\n<a>立即体验 Demo</a>'};
 await finish(f,{taskId:'1',runId:c.run.id,ok:true,content:'Added the entry',pr:{url:'https://github.com/estheryo/website-test/pull/1',number:1,branch:'nocoreach/task-1',headSha:'abc1234',files:[{path:change.path,additions:1,deletions:0}],release:'在商业服务页新增体验入口',verifyText:'立即体验 Demo',pages:['/cn/commercial','javascript:alert(1)'],changes:[change,{path:'',before:'x',after:'y'}]}});
 let d=await f.view();const out=output(d);assert.equal((await f.stage()).name,'看效果并发布');assert.equal(out.pr.release,'在商业服务页新增体验入口');assert.deepEqual(out.pr.changes,[change]);

 d=await f.command('approveStage',{stageKey:'review',artifactId:out.id,checked:[]});
 assert.equal(d.work.stage,'done');
 assert.equal(d.work.release.state,'simulated');
 assert.equal(d.work.release.pr.number,1);
 assert.equal(d.work.release.mergedAt,undefined);
 assert.equal(d.work.observeFrom,undefined);
 assert.equal(d.runs.length,1);
 assert.equal(f.s.p.agents.records.size,1);
 const read=vi.fn();await f.s.verifyReleases(read);assert.equal(read.mock.calls.length,0);
 await assert.rejects(f.command('revertRelease'),e=>e.status===409);
 await assert.rejects(f.s.runtime.enqueue({mode:'merge'},{}),e=>e.code==='NR_MOCK_UNSUPPORTED_OPERATION');
 await assert.rejects(f.s.runtime.enqueue({mode:'revert'},{}),e=>e.code==='NR_MOCK_UNSUPPORTED_OPERATION');
});

test('retired defaults remain explicit and cancelled queued work can be reassigned without rewriting history', async () => {
  const f = fixture();
  await selectAgent(f);
  const started = await f.command('startTask', {
    playbookId: 'change-research',
  });
  const oldRun = started.runs[0];
  const plugin = f.s.p.agents;
  plugin.records.get(oldRun.pluginRunId).status = 'cancelled';
  plugin.definitions.delete('shared-agent');
  await f.s.runtime.sync(oldRun);
  let view = await f.view();
  assert.equal(view.runs[0].status, 'failed');
  assert.equal(view.agent.defaultAgentId, 'shared-agent');
  assert.deepEqual(view.agent.options, []);
  await assert.rejects(
    f.command('retryStage', { stageKey: 'analyze' }),
    /Agent 已失效/,
  );
  plugin.definitions.set('replacement', {
    ...plugin.agent,
    id: 'replacement',
    name: 'Replacement',
  });
  await f.command('setAgent', { agentId: 'replacement' });
  view = await f.command('retryStage', { stageKey: 'analyze' });
  assert.equal(
    view.runs.find((run) => run.id === oldRun.id).agentId,
    'shared-agent',
  );
  assert.equal(
    view.runs.find((run) => run.id !== oldRun.id).agentId,
    'replacement',
  );
});

test('flow validation rejects online AI stages', () => {
 assert.throws(() => validateFlow({ name: 'Invalid online task', stages: [
  { key: 'draft', name: 'Draft', kind: 'ai', instruction: 'Write' },
  { key: 'review', name: 'Review', kind: 'review' },
 ] }));
});

test('recovery rejects stale and superseded runs, and never replays repository changes', async () => {
  for (const change of ['mode', 'active', 'owner', 'artifact', 'cancelled', 'superseded']) {
    const f = fixture();
    await selectAgent(f);
    await f.command('startTask', { playbookId: 'change-research' });
    const { run } = await claim(f);
    await f.s.finish(run, undefined, 'invalid_agent_result', 'Old format error');
    const official = f.s.p.agents.records.get(run.pluginRunId);
    official.status = 'completed';
    official.summary = JSON.stringify({ ok: true, content: 'Preserved draft', report: { kind: 'research', sources: [], asOf: '', uncertainties: [] } });
    const work = f.state.nrTasks[0].evidence.work;
    const stored = f.state.nrSnapshots.find(row => row.key === f.s.key('run', '1', '1', run.id)).payload;
    if (change === 'mode') stored.mode = 'build';
    if (change === 'active') stored.status = 'running';
    if (change === 'owner') work.humanOwnerId = 'other';
    if (change === 'artifact') work.results[0] = { id: 'new-artifact' };
    if (change === 'cancelled') work.cancelledAt = new Date().toISOString();
    if (change === 'superseded') work.latestRun = { id: 'new-run', status: 'failed' };
    await assert.rejects(f.command('recoverResult', { stageKey: 'analyze', runId: run.id }));
    assert.equal((await f.view()).artifacts.length, change === 'artifact' ? 1 : 0);
    assert.equal((await f.view()).work.stageIndex, 0);
  }
});

test('a submitted result cannot turn a failed or cancelled Runner into success', async () => {
  for (const status of ['failed', 'cancelled']) {
    const f = fixture();
    await selectAgent(f);
    await f.command('startTask', { playbookId: 'change-research' });
    const { run } = await claim(f);
    await f.s.lock('1', '1', tx => f.s.put(f.s.key('result', '1', '1', run.id), { value: { ok: true, content: 'Staged result', report: { kind: 'research', sources: [], asOf: '', uncertainties: [] } }, savedAt: new Date().toISOString() }, tx));
    f.s.p.agents.records.get(run.pluginRunId).status = status;
    await f.s.runtime.sync(await f.s.snapshot(f.s.key('run', '1', '1', run.id)));
    const view = await f.view();
    assert.equal(view.artifacts.length, 0);
    assert.equal(view.runs[0].status, 'failed');
    assert.equal(view.work.stageIndex, 0);
  }
});


test('project default can be saved and cleared without changing repositories or task overrides', async () => {
  const f = fixture();
  await f.s.agents.saveDefault('1', { revision: 0, agentId: 'shared-agent' }, '1');
  assert.equal((await f.view()).agent.defaultAgentId, 'shared-agent');
  await assert.rejects(f.s.agents.saveDefault('1', { revision: 0, agentId: null }, '1'), e => e.status === 409);
  await assert.rejects(f.s.agents.saveDefault('1', { revision: 1, agentId: 'missing' }, '1'), e => e.status === 409);
  await assert.rejects(f.s.agents.saveDefault('1', { revision: 1 }, '1'), e => e.status === 400);
  f.s.p.agents.definitions.set('disabled', { id: 'disabled', status: 'disabled' });
  await assert.rejects(f.s.agents.saveDefault('1', { revision: 1, agentId: 'disabled' }, '1'), e => e.status === 409);
  await f.s.agents.saveRepo('1', { revision: 1, repo: 'org/site', baseBranch: 'main' });
  await f.command('setAgent', { agentId: 'shared-agent' });
  await f.s.agents.saveDefault('1', { revision: 2, agentId: null }, '1');
  const view = await f.view();
  assert.equal(view.agent.defaultAgentId, null);
  assert.equal(view.agent.agentId, 'shared-agent');
  assert.equal(view.agent.repo.repo, 'org/site');
  assert.equal((await f.s.agents.doc('2')).agentId, null);
});
