// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/daily-analysis.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { DailyAnalysis, parseOutput, validInsight, buildInput, styleIssues, width } from '../../server/nocoreach/daily-analysis.js';
import { scheduledToday, retryable } from '../../server/nocoreach/daily-analysis.js';
import * as __daily_analysis from '../../server/nocoreach/daily-analysis.js';
const test=__vitest_test;
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
 const saved=[];let revision=3;
 const strategy={context:async()=>({project:{name:'p'},evidence:{signals:{items:[{key:'k'}]},publicSources:[]}}),state:async()=>({revision,proposals:[]}),saveInsights:async(id,v)=>{const e=saveErrors.shift();if(e){revision++;throw e;}saved.push(v);return {insights:{items:v.insights,observations:v.observations}};}};
 const plugin={strategy,db:{getRepository:()=>repo},app:{on:()=>{},logger:{warn:()=>{}}}};
 rows.project={id:1};
 const calls=[],replies=Array.isArray(reply)?reply.slice():null;
 return {a:new DailyAnalysis(plugin,async(system,user)=>{calls.push({system,user});const r=replies?replies.shift():reply;if(r instanceof Error)throw r;return {text:r,model:'m'};}),rows,saved,plugin,calls};}
test('run saves valid suggestions and observations and returns the validated outcome',async()=>{
 const h=harness({reply:'```json\n'+JSON.stringify({observations:['曝光上升 18%'],insights:[good,{title:'缺字段'}],sourceReviews:[]})+'\n```'});
 const r=await h.a.run('1','manual');assert.equal(r.ok,true);assert.equal(r.items,1);assert.equal(r.dropped,1);assert.equal(h.saved[0].periodDays,28);assert.equal(h.saved[0].revision,3);
 assert.equal(r.trigger,'manual');assert.ok(r.at);assert.deepEqual(Object.keys(h.rows),['project'],'the algorithm leaves execution state to the lifecycle');
});
test('a concurrent edit (409) is retried once with the fresh revision; unparseable output is a recorded failure',async()=>{
 const h=harness({reply:'{"observations":["a"],"insights":[]}',saveErrors:[Object.assign(new Error('conflict'),{status:409})]});
 const r=await h.a.run('1','workflow');assert.equal(r.ok,true);assert.equal(h.saved[0].revision,4);
 const bad=harness({reply:'抱歉，我无法完成'});const f=await bad.a.run('1','workflow');assert.equal(f.ok,false);assert.match(f.error,/可解析/);assert.equal(f.retryable,false);
});
test('start and status delegate to the durable runtime with the requesting actor',async()=>{
 const h=harness({reply:''});const calls=[];const state={running:true,runs:[]};
 h.plugin.analysisRuntime={enqueue:async(...args)=>{calls.push(args);},status:async()=>state,state:async()=>state};
 assert.equal(await h.a.start('1','manual','member-1'),state);assert.deepEqual(calls,[['1','manual','member-1']]);
 assert.equal(await h.a.state('1'),state);
});
test('execution fences every model request and prevents writes after cancellation',async()=>{
 const h=harness({reply:'{"observations":["a"],"insights":[]}'});const controller=new AbortController();let markers=0,writes=0;
 const result=await h.a.run('1','schedule',{signal:controller.signal,beforeModel:async()=>{markers++;controller.abort();},commit:async(fn)=>{writes++;return fn();}});
 assert.equal(result.ok,false);assert.equal(markers,1);assert.equal(writes,0);assert.equal(h.saved.length,0);
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
 h.plugin.taskData={recent:async()=>[{no:'T-2',title:'改安装页标题',state:'已上线，正在观察效果',effects:['第 7 天：上升，搜索点击 40 → 52（+30%）']}]};
 await h.a.run('1','manual');const input=h.calls[0].user;
 assert.match(input,/"recentTasks":\[\{"no":"T-2","title":"改安装页标题","state":"已上线，正在观察效果"/);assert.match(h.calls[0].system,/recentTasks[\s\S]*不要再推荐/);
 assert.match(input,/"quietSources":\[\{"source":"github","name":"GitHub","facts":\["新增 Star 120/);assert.match(input,/"knowledge":\[\{"title":"竞品对比","summary":"和 Retool 的功能差异"/);assert.ok(!input.includes('全文不给'));
 assert.match(h.calls[0].system,/quietSources[\s\S]*不能单独作为 insight 的依据/);assert.match(h.calls[0].system,/参考知识库《标题》/);
});
