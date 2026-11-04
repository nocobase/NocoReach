// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/daily-analysis.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { DailyAnalysis, parseOutput, validInsight, buildInput, styleIssues, width, NODE_TYPE, WORKFLOW_TITLE } from '../../server/nocoreach/daily-analysis.js';
import { scheduledToday, retryable } from '../../server/nocoreach/daily-analysis.js';
import * as __daily_analysis from '../../server/nocoreach/daily-analysis.js';
import { ModelPreparationError } from '../../server/nocoreach/execution/provider.js';
const test=__vitest_test;
// Stand-in for the host's workflow plugin package, only for the instruction registration test.
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

test.each([
 ['Asia/Shanghai','0 0 * * *','2026-10-15T16:14:59Z','2026-10-15T16:15:00Z'],
 ['UTC','0 9 * * *','2026-10-16T09:14:59Z','2026-10-16T09:15:00Z'],
 ['America/New_York','30 2 * * *','2026-03-08T07:44:59Z','2026-03-08T07:45:00Z'],
 ['America/New_York','30 1 * * *','2026-11-01T05:44:59Z','2026-11-01T06:15:00Z'],
])('catch-up uses the real analysis path and task day in %s (%s)',async(timezone,repeat,before,after)=>{
 vi.useFakeTimers({toFake:['Date']});
 try{const h=harness({reply:'{"observations":["a"],"insights":[]}'});h.plugin.projectIds=async()=>['1'];h.workflows.push({enabled:true,config:{repeat,timezone}});
  vi.setSystemTime(new Date(before));assert.equal(await h.a.tick(),null);assert.equal(h.calls.length,0);
  vi.setSystemTime(new Date(after));assert.deepEqual(await h.a.tick(),{id:'1',trigger:'catchup'});await h.a.running;
  assert.equal(h.calls.length,1);assert.equal((await h.a.state('1')).runs[0].ok,true);
  assert.equal(await h.a.tick(),null);assert.equal(h.calls.length,1);
 }finally{vi.useRealTimers();}
});

test('normal execution shares one timezone lookup and skips successes by task-local day across UTC midnight',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{vi.setSystemTime(new Date('2026-10-16T01:30:00Z'));const h=harness({reply:'{"observations":["a"],"insights":[]}'});h.plugin.projectIds=async()=>['1','2'];
  h.workflows.push({enabled:true,config:{repeat:'0 9 * * *',timezone:'Asia/Shanghai'}});
  await h.a.save('1',s=>({...s,runs:[{ok:true,at:'2026-10-15T16:30:00Z'}]}));
  await h.a.save('2',s=>({...s,runs:[{ok:true,at:'2026-10-15T15:30:00Z'}]}));
  const lookup=vi.spyOn(h.a,'workflow');let Instruction;h.plugin.app.pm={get:()=>({registerInstruction:(_type,C)=>{Instruction=C;}})};h.a.registerInstruction();
  const result=await new Instruction({}).run();assert.equal(result.result['1'].skipped,'今天已经分析成功');assert.equal(result.result['2'].ok,true);assert.equal(h.calls.length,1);assert.equal(lookup.mock.calls.length,1);
 }finally{vi.useRealTimers();}
});

test('recovery can trigger twice in the repeated hour, but successful analysis is skipped on the second trigger',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{const h=harness({reply:'{"observations":["a"],"insights":[]}'});h.plugin.projectIds=async()=>['1'];h.workflows.push({enabled:true,config:{repeat:'30 1 * * *',timezone:'America/New_York'}});
  let Instruction;h.plugin.app.pm={get:()=>({registerInstruction:(_type,C)=>{Instruction=C;}})};h.a.registerInstruction();
  vi.setSystemTime(new Date('2026-11-01T06:00:00Z'));assert.equal((await new Instruction({}).run()).result['1'].ok,true);
  vi.setSystemTime(new Date('2026-11-01T06:30:00Z'));assert.equal((await new Instruction({}).run()).result['1'].skipped,'今天已经分析成功');assert.equal(h.calls.length,1);
 }finally{vi.useRealTimers();}
});

test('changing timezone does not catch up an earlier time, including across the new local midnight',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{const h=harness({reply:'{"observations":["a"],"insights":[]}'});h.plugin.projectIds=async()=>['1'];h.workflows.push({enabled:true,config:{repeat:'0 9 * * *',timezone:'Asia/Shanghai'}});
  h.rows['daily-analysis:schedule-settings']={changedAt:'2026-10-16T15:00:00Z'};
  vi.setSystemTime(new Date('2026-10-16T15:00:00Z'));assert.equal(await h.a.tick(),null);
  vi.setSystemTime(new Date('2026-10-16T17:00:00Z'));assert.equal(await h.a.tick(),null);assert.equal(h.calls.length,0);
  vi.setSystemTime(new Date('2026-10-17T01:15:00Z'));assert.deepEqual(await h.a.tick(),{id:'1',trigger:'catchup'});await h.a.running;assert.equal(h.calls.length,1);
 }finally{vi.useRealTimers();}
});
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

test('每条变化的结论: the run asks for one per change and saves them; 让 AI 现在判断 judges one change of the latest analysis',async()=>{
 const {SYSTEM}=__daily_analysis;assert.match(SYSTEM,/signalReviews 对 evidence\.signals\.items 里的每一条信号都要给结论/);
 const out='```json\n'+JSON.stringify({observations:['o'],insights:[],sourceReviews:[],signalReviews:[{key:'k',verdict:'watch',reason:'先看'}]})+'\n```';
 const {a,saved}=harness({reply:out});await a.run('1','manual');assert.deepEqual(saved[0].signalReviews,[{key:'k',verdict:'watch',reason:'先看'}]);
 const h=harness({reply:'```json\n{"verdict":"skip","reason":"是好消息"}\n```'});let reviewed;
 h.plugin.strategy.state=async()=>({revision:1,insights:{items:[{title:'Fix titles'}],evidence:{signals:{items:[{key:'gh',source:'github',title:'Star 增加',facts:['f'],actionable:false}]}},signalReviews:reviewed?{gh:reviewed}:{}}});
 h.plugin.strategy.reviewSignal=async(id,v)=>{reviewed={verdict:v.verdict,reason:v.reason};assert.equal(v.signalKey,'gh');assert.match(v.requestId,/^[-a-f0-9]{36}$/);};
 assert.deepEqual(await h.a.judge('1',{signalKey:'gh'}),{verdict:'skip',reason:'是好消息'});assert.match(h.calls[0].user,/Fix titles/,'the proposed opportunities are given');
 await assert.rejects(h.a.judge('1',{signalKey:'nope'}),/不在最近一次分析/);
});

test('changes left without a verdict are judged in one extra call; nothing to do when every change has one',async()=>{
 const h=harness({reply:'```json\n{"reviews":[{"key":"b","verdict":"skip","reason":"影响很小"}]}\n```'});let got;
 h.plugin.strategy.state=async()=>({revision:1,insights:{items:[{title:'T',signalIds:['a']}],signalReviews:{c:{verdict:'watch',reason:''}},evidence:{signals:{items:[{key:'a',title:'cited'},{key:'b',title:'missing',facts:[],actionable:true},{key:'c',title:'judged'}]}}}});
 h.plugin.strategy.reviewSignals=async(id,v)=>{got=v.reviews;};
 assert.deepEqual(await h.a.judgeMissing('1'),{judged:1});assert.deepEqual(JSON.parse(h.calls[0].user).signals.map(s=>s.key),['b'],'only the change nobody judged');assert.deepEqual(got,[{key:'b',verdict:'skip',reason:'影响很小'}]);
 h.plugin.strategy.state=async()=>({revision:1,insights:{items:[],signalReviews:{b:{verdict:'do',reason:''}},evidence:{signals:{items:[{key:'b'}]}}}});const before=h.calls.length;assert.deepEqual(await h.a.judgeMissing('1'),{judged:0});assert.equal(h.calls.length,before,'no call when nothing is missing');
});

// Insights' judging of the changes left without a verdict: one model call per project at a time, and a hold on the
// exact set (project, analysis, missing keys) so a set the model will not judge is not paid for on every visit.
const signalOf=key=>({key,source:'github',title:key,facts:[],actionable:true});
function judging({keys=['a','b'],judge=signals=>signals.map(s=>s.key)}={}){
 const h=harness({reply:''}),warned=[];h.plugin.app.logger={warn:(message,fields)=>warned.push({message,fields})};h.warned=warned;
 h.st={revision:1,proposals:[],insights:{generatedAt:'2026-11-04T01:00:00.000Z',items:[],signalReviews:{},evidence:{signals:{items:keys.map(signalOf)}}}};
 h.reads=0;h.plugin.strategy.state=async()=>{h.reads++;return h.st;};
 h.plugin.strategy.reviewSignals=async(id,v)=>{const got=Object.fromEntries(v.reviews.map(r=>[r.key,{verdict:r.verdict,reason:r.reason}]));h.st={...h.st,insights:{...h.st.insights,signalReviews:{...got,...h.st.insights.signalReviews}}};};
 // The system's default chat model and its service's connection, which an administrator changes to fix a failure.
 h.setup={chat:{modelService:'svc',model:'m1'},apiKey:'k1'};
 h.plugin.agents={models:{services:{defaults:async()=>({effectiveChat:h.setup.chat}),connectionFor:async()=>({provider:'openai',baseUrl:null,apiKey:h.setup.apiKey})}}};
 h.asked=[];h.fail=null;h.gate=null;
 h.a.model=async(system,user,operation)=>{if(operation!=='daily-judge-many')return {text:'{"observations":["a"],"insights":[]}',model:'m'};
  const signals=JSON.parse(user).signals;h.asked.push(signals.map(s=>s.key));if(h.gate)await h.gate;if(h.fail)throw h.fail;
  return {text:JSON.stringify({reviews:judge(signals).map(key=>({key,verdict:'skip',reason:'r'}))}),model:'m'};};
 let actions;h.plugin.app.resourceManager={define:d=>{actions=d.actions;}};h.plugin.app.acl={allow:()=>{}};h.plugin.app.pm={get:()=>undefined};h.plugin.project=async()=>({id:1});h.a.register();
 // nrAnalysis:judgeMissing as the route calls it, for a NocoBase root user unless another caller is given.
 h.page=async({user={id:'root'},locale='en-US',projectId='1'}={})=>{const ctx={auth:user?{user}:{},state:{currentRoles:['root']},action:{resourceName:'nrAnalysis',actionName:'judgeMissing',params:{values:{projectId}}},db:h.plugin.db,getCurrentLocale:()=>locale,throw:(status,message)=>{throw Object.assign(new Error(message),{status});}};await actions.judgeMissing(ctx,async()=>{});return ctx.body;};
 return h;}
const at=iso=>vi.setSystemTime(new Date(iso));
const refused=(status,text)=>e=>e.status===status&&text.test(e.message);

test('judging calls for the same changes share one model call; one for another set waits for it',async()=>{
 const h=judging();let open;h.gate=new Promise(r=>{open=r;});
 const calls=[h.page(),h.page({locale:'zh-CN'}),h.a.judgeMissing('1')];
 await vi.waitFor(()=>{assert.equal(h.reads,3);assert.equal(h.asked.length,1);});await new Promise(r=>setTimeout(r,0));
 open();assert.deepEqual(await Promise.all(calls),[{judged:2},{judged:2},{judged:2}]);assert.deepEqual(h.asked,[['a','b']],'one model call for all three');
 assert.deepEqual(await h.page(),{judged:0});assert.equal(h.asked.length,1,'nothing left to judge');
 // A new analysis while the page's call for the old one is out: the call after the analysis waits, then asks about its own set.
 const g=judging();g.gate=new Promise(r=>{open=r;});const page=g.page();await vi.waitFor(()=>assert.equal(g.asked.length,1));
 g.st={...g.st,insights:{...g.st.insights,generatedAt:'2026-11-04T02:00:00.000Z',evidence:{signals:{items:['c','d'].map(signalOf)}}}};
 const afterRun=g.a.judgeMissing('1');await new Promise(r=>setTimeout(r,0));assert.equal(g.asked.length,1,'waits for the call in flight');
 open();assert.deepEqual(await page,{judged:2});assert.deepEqual(await afterRun,{judged:2});assert.deepEqual(g.asked,[['a','b'],['c','d']]);
});

test('a set the model leaves unjudged is held for 30 minutes; a new change, a new analysis or the call after an analysis asks at once',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{at('2026-11-04T02:00:00Z');const h=judging({judge:signals=>signals.filter(s=>s.key!=='b').map(s=>s.key)});
  assert.deepEqual(await h.page(),{judged:1});assert.deepEqual(h.asked,[['a','b']]);
  at('2026-11-04T02:29:00Z');assert.deepEqual(await h.page(),{judged:0},'b was asked about and skipped');assert.equal(h.asked.length,1);
  assert.deepEqual(await h.a.judgeMissing('1'),{judged:0});assert.deepEqual(h.asked.at(-1),['b'],'the call after an analysis is never held');
  h.st.insights.evidence.signals.items.push(signalOf('c'));
  assert.deepEqual(await h.page(),{judged:1});assert.deepEqual(h.asked.at(-1),['b','c'],'a new change is asked about at once');
  assert.deepEqual(await h.page(),{judged:0});assert.equal(h.asked.length,3);
  h.st={...h.st,insights:{...h.st.insights,generatedAt:'2026-11-04T02:30:00.000Z'}};
  assert.deepEqual(await h.page(),{judged:0});assert.equal(h.asked.length,4,'a new analysis is asked about at once');
  at('2026-11-04T02:58:59Z');await h.page();assert.equal(h.asked.length,4);
  at('2026-11-04T02:59:00Z');await h.page();assert.equal(h.asked.length,5,'asked again 30 minutes after the last call');
  assert.equal(h.warned.length,0,'skipping is not a failure');
 }finally{vi.useRealTimers();}
});

test('a transient failure is answered with its status and held for 2 minutes, then asked again',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{at('2026-11-04T02:00:00Z');const h=judging();h.fail=Object.assign(new Error('connect ECONNREFUSED'),{code:'ECONNREFUSED'});
  await assert.rejects(h.page(),refused(503,/Try again in 2 min\./));assert.equal(h.asked.length,1);
  assert.equal(h.warned.length,1);assert.equal(h.warned[0].message,'NocoReach judging changes failed');assert.equal(h.warned[0].fields.retryable,true);assert.equal(h.warned[0].fields.retryInMinutes,2);
  assert.ok(!JSON.stringify(h.warned).includes('signals'),'the prompt is not logged');
  at('2026-11-04T02:01:01Z');await assert.rejects(h.page({locale:'zh-CN'}),refused(503,/1 分钟后可以再试/));
  assert.equal(h.asked.length,1);assert.equal(h.warned.length,1,'a held failure is not logged again');
  h.fail=null;at('2026-11-04T02:02:00Z');assert.deepEqual(await h.page(),{judged:2});assert.equal(h.asked.length,2);
 }finally{vi.useRealTimers();}
});

test('a failure that trying again soon would not cure is held for 30 minutes, until the model setup changes',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{at('2026-11-04T02:00:00Z');const h=judging();h.fail=new ModelPreparationError('model_configuration');
  await assert.rejects(h.page(),refused(409,/Try again in 30 min\./));assert.equal(h.warned[0].fields.retryable,false);
  at('2026-11-04T02:10:00Z');await assert.rejects(h.page(),refused(409,/Try again in 20 min\./));assert.equal(h.asked.length,1);assert.equal(h.warned.length,1);
  h.fail=null;h.setup.chat={modelService:'svc',model:'m2'};assert.deepEqual(await h.page(),{judged:2});assert.equal(h.asked.length,2,'a new default model is asked at once');
  // A call the model rejected (it may have been billed): held until its service's connection changes, or for 30 minutes.
  const g=judging();g.fail=Object.assign(new Error('rejected'),{name:'ModelError',code:'provider'});
  await assert.rejects(g.page(),refused(502,/30 min/));at('2026-11-04T02:20:00Z');await assert.rejects(g.page(),refused(502,/20 min/));assert.equal(g.asked.length,1);
  g.setup.apiKey='k2';await assert.rejects(g.page(),refused(502,/30 min/));assert.equal(g.asked.length,2,'a new key is tried at once');
  at('2026-11-04T02:50:00Z');await g.page().catch(()=>undefined);assert.equal(g.asked.length,3,'and again after 30 minutes');
  assert.equal(g.warned.length,3,'each real failure is logged once');
 }finally{vi.useRealTimers();}
});

test('the caller and the project are checked before a hold or a call in flight is looked at',async()=>{
 const h=judging();h.fail=new ModelPreparationError('model_configuration');
 await assert.rejects(h.page(),refused(409,/30 min/));const reads=h.reads;
 await assert.rejects(h.page({user:null}),e=>e.status===401);
 await assert.rejects(h.page({projectId:'x'}),e=>e.status===400);
 h.plugin.project=async()=>{throw Object.assign(new Error('no such project'),{status:404});};
 await assert.rejects(h.page(),e=>e.status===404);
 assert.equal(h.reads,reads,'refused before the state is read or a hold consulted');assert.equal(h.asked.length,1);
});

test('the analysis still judges what it left, whatever is held for Insights',async()=>{
 const h=judging();h.fail=new ModelPreparationError('model_configuration');await assert.rejects(h.page(),refused(409,/30 min/));
 h.fail=null;await assert.rejects(h.page(),refused(409,/30 min/),'held for Insights');
 const entry=await h.a.run('1','manual');assert.equal(entry.ok,true);assert.deepEqual(h.asked,[['a','b'],['a','b']],'the call after the analysis asks');
 assert.deepEqual(await h.page(),{judged:0});assert.equal(h.asked.length,2);
 for(let i=0;i<250;i++)h.a.holdJudgement(String(i+2),{key:'k',until:0});assert.equal(h.a.judgeHolds.size,200,'holds stay bounded');
});

// 每日分析的失败处理 (2026-10-08, ROADMAP ④).
test('failure handling: what can be tried again — before the model, unreachable, rate-limited; never a timeout or an unreadable answer',()=>{
 assert.equal(retryable(new Error('信号计算暂不可用'),'prepare'),true);
 assert.equal(retryable(Object.assign(new Error('connect'),{cause:{code:'ECONNREFUSED'}}),'model'),true);
 assert.equal(retryable(Object.assign(new Error('rate'),{status:429}),'model'),true);
 assert.equal(retryable(Object.assign(new Error('t'),{name:'TimeoutError'}),'model'),false);
 assert.equal(retryable(Object.assign(new Error('reset'),{code:'ECONNRESET'}),'model'),false);
 assert.equal(retryable(Object.assign(new Error('server'),{status:500}),'model'),false);
 assert.equal(retryable(new Error('模型没有返回可解析的结果'),'after'),false);
 const at=new Date(2026,9,8,10,0);assert.equal(scheduledToday('0 9 * * *',at).getHours(),9);assert.equal(scheduledToday('0 0 9 * * *',at).getMinutes(),0);assert.equal(scheduledToday('0 9 * * 1',at),null);
});
test('failure handling: a sure-free failure of the schedule is tried after 5, 15 and 60 minutes, then admins are told; a costly one is not retried',async()=>{
 const free=()=>Object.assign(new Error('连不上在线 AI'),{cause:{code:'ECONNREFUSED'}});
 const h=harness({reply:[free(),free(),free(),free()]});const told=[];h.plugin.notifications={analysisFailed:async(id,err)=>{told.push([id,err]);}};
 await h.a.run('1','workflow');let st=await h.a.status('1');assert.equal(st.retry.attempt,1);assert.equal(Date.parse(st.retry.nextAt)-Date.parse(st.runs[0].at),5*60000);
 await h.a.run('1','retry');st=await h.a.status('1');assert.equal(st.retry.attempt,2);assert.equal(Date.parse(st.retry.nextAt)-Date.parse(st.runs[0].at),15*60000);
 await h.a.run('1','retry');st=await h.a.status('1');assert.equal(st.retry.attempt,3);assert.equal(Date.parse(st.retry.nextAt)-Date.parse(st.runs[0].at),60*60000);assert.equal(told.length,0);
 await h.a.run('1','retry');st=await h.a.status('1');assert.equal(st.retry,null);assert.deepEqual(told,[['1','连不上在线 AI']]);
 const costly=harness({reply:'抱歉，我无法完成'});const told2=[];costly.plugin.notifications={analysisFailed:async(id)=>{told2.push(id);}};
 await costly.a.run('1','workflow');assert.equal((await costly.a.status('1')).retry,null);assert.deepEqual(told2,['1']);
 // a run by hand is never retried and leaves a planned retry alone
 const m=harness({reply:[free(),free()]});await m.a.run('1','workflow');const planned=(await m.a.status('1')).retry;await m.a.run('1','manual');assert.deepEqual((await m.a.status('1')).retry,planned);
});
test('failure handling: the tick runs a due retry, the missed run of today once, and nothing after a success or with the schedule off',async()=>{
 const ok='{"observations":["a"],"insights":[]}';
 const make=(reply,enabled=true)=>{const h=harness({reply});h.plugin.projectIds=async()=>['1'];h.workflows.push({id:1,title:WORKFLOW_TITLE,enabled,config:{repeat:'0 9 * * *'}});return h;};
 const now=new Date();const at=(h,m)=>{const d=new Date(now);d.setHours(h,m,0,0);return d;};
 let h=make([ok,ok]);assert.equal(await h.a.tick(at(9,5)),null,'within 15 minutes of 9:00 the schedule may still be running');
 assert.deepEqual(await h.a.tick(at(10,0)),{id:'1',trigger:'catchup'});await h.a.running;assert.equal((await h.a.status('1')).runs[0].trigger,'catchup');
 assert.equal(await h.a.tick(at(11,0)),null,'once a day; today already succeeded');
 h=make([ok],false);assert.equal(await h.a.tick(at(10,0)),null,'schedule switched off');
 h=make([Object.assign(new Error('x'),{status:429}),ok]);await h.a.run('1','workflow');const retry=(await h.a.status('1')).retry;
 assert.equal(await h.a.tick(new Date(Date.parse(retry.nextAt)-1000)),null);assert.deepEqual(await h.a.tick(new Date(Date.parse(retry.nextAt)+1000)),{id:'1',trigger:'retry'});await h.a.running;
 const st=await h.a.status('1');assert.equal(st.runs[0].trigger,'retry');assert.equal(st.runs[0].ok,true);assert.equal(st.retry,null);
 // the scheduled run skips a project that already succeeded today
 let registered;h.plugin.app.pm={get:n=>n==='workflow'?{registerInstruction:(t,C)=>{registered={t,C};}}:null};h.a.registerInstruction();const job=await new registered.C({}).run();assert.equal(job.result['1'].skipped,'今天已经分析成功');
});

// What the AI gets besides the changes (2026-10-08): quiet sources as background numbers, the knowledge base as a catalogue.
test('background: a line of numbers for each connected source without a change passed on; the knowledge base as titles',async()=>{
 const {quietSources}=__daily_analysis;
 const connected={gsc:true,ga4:true,github:true,discourse:true,x:true,reddit:false};
 const cards=[{id:'github',metrics:[{label:'新增 Star',value:120,previous:100,change:0.2},{label:'Star 总数',value:23456,previous:null}]},{id:'gsc',metrics:[{label:'点击',value:3214,previous:3100,change:0.036}]}];
 const areas=[{id:'community',items:[{text:'{0} 个论坛主题没人回复',values:['7'],to:'/data/community'},{text:'X 近 7 天提到 {0} 次',values:['12'],to:'/data/x'}]}];
 const q=quietSources(connected,[{source:'gsc'},{source:'ai-search'},{source:'github-traffic'}],cards,areas);
 assert.deepEqual(q.map(x=>x.source),['ga4','discourse','x'],'gsc and github have changes passed on; reddit is not connected');
 assert.deepEqual(q.find(x=>x.source==='discourse').facts,['7 个论坛主题没人回复']);assert.deepEqual(q.find(x=>x.source==='ga4').facts,['已接入，近 28 天规则没有找出变化']);
 assert.deepEqual(quietSources({github:true},[],cards,[])[0].facts,['新增 Star 120（前一期 100，+20%）','Star 总数 23,456']);
 const h=harness({reply:'{"observations":["a"],"insights":[]}'});
 h.plugin.health={connected:async()=>({github:true})};h.plugin.dataViews={overview:async()=>({cards})};h.plugin.insightSummary={summary:async()=>({areas:[]})};
 h.plugin.knowledge={list:async()=>({items:[{title:'竞品对比',summary:'和 Retool 的功能差异',category:'competitor',text:'全文不给'}]})};
 h.plugin.taskData={recent:async()=>[{no:'T-2',title:'改安装页标题',state:'已上线，正在观察效果',effects:['第 7 天：上升 · 搜索点击 40 → 52 · ↑ 30%']}]};
 await h.a.run('1','manual');const input=h.calls[0].user;
 assert.match(input,/"recentTasks":\[\{"no":"T-2","title":"改安装页标题","state":"已上线，正在观察效果"/);assert.match(h.calls[0].system,/recentTasks[\s\S]*不要再推荐/);
 assert.match(input,/"quietSources":\[\{"source":"github","name":"GitHub","facts":\["新增 Star 120/);assert.match(input,/"knowledge":\[\{"title":"竞品对比","summary":"和 Retool 的功能差异"/);assert.ok(!input.includes('全文不给'));
 assert.match(h.calls[0].system,/quietSources[\s\S]*不能单独作为 insight 的依据/);assert.match(h.calls[0].system,/参考知识库《标题》/);
});

test('analysis uses the starting scheme snapshot through model and save even if active settings change',async()=>{
 const h=harness({reply:JSON.stringify({observations:[],insights:[good]})});
 const context={project:{name:'p'},evidence:{signals:{analysisRunId:'fixed-run',analysisSnapshot:{schemeId:'first',schemeVersion:2,config:{watchDays:21,focus:'固定方案重点'}},items:[{key:'k'}]},publicSources:[]}};
 h.plugin.strategy.context=async()=>context;
 h.plugin.analysisRules={config:async()=>({watchDays:7,focus:'后来切换的方案'})};
 const save=vi.fn(async()=>({insights:{items:[good]}}));h.plugin.strategy.saveInsights=save;
 assert.equal((await h.a.run('1','manual')).ok,true);
 assert.ok(h.calls[0].system.includes('固定方案重点'));
 assert.ok(!h.calls[0].system.includes('后来切换的方案'));
 assert.equal(save.mock.calls[0][3],context);
});

test('editing to a past time does not immediately catch up; the next day can catch up',async()=>{
 const h=harness({reply:''});
 const today=new Date();today.setHours(15,0,0,0);
 h.a.workflow=async()=>({get:key=>key==='enabled'?true:{repeat:'0 9 * * *'}});
 h.plugin.projectIds=async()=>['1'];
 h.rows['daily-analysis:schedule-settings']={changedAt:today.toISOString()};
 const calls=[];h.a.start=async(id,trigger)=>{calls.push({id,trigger});};
 assert.equal(await h.a.tick(today),null);assert.equal(calls.length,0);
 const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);
 assert.deepEqual(await h.a.tick(tomorrow),{id:'1',trigger:'catchup'});
});

test('the instruction shares the project manual-run gate',async()=>{
 const h=harness({reply:''});let Instruction;
 h.plugin.app.pm={get:()=>({registerInstruction:(_type,C)=>{Instruction=C;}})};
 h.a.registerInstruction();h.a.running=Promise.resolve();
 let called=false;h.plugin.projectIds=async()=>{called=true;return ['1'];};
 const result=await new Instruction({}).run();assert.equal(result.status,1);
 assert.equal(called,false);assert.ok(result.result.all.skipped);
});


test('manual analysis reserves its gate while preparing the persisted run',async()=>{
 const h=harness({reply:'{"observations":["a"],"insights":[]}'});let Instruction;
 h.plugin.app.pm={get:()=>({registerInstruction:(_type,C)=>{Instruction=C;}})};
 h.a.registerInstruction();h.plugin.projectIds=async()=>['1'];
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const save=h.a.save.bind(h.a);h.a.save=async(...args)=>{await gate;return save(...args);};
 const manual=h.a.start('1','manual');
 const result=await new Instruction({}).run();
 assert.ok(result.result.all.skipped);assert.equal(h.calls.length,0);
 release();await manual;await h.a.running;assert.equal(h.calls.length,1);
});
