// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/strategy-service.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { goalInput, proposalInput, evidenceFrom } from '../../server/nocoreach/strategy-service.js';
import * as __strategy_service from '../../server/nocoreach/strategy-service.js';
import * as __opportunity_board from '../../server/nocoreach/opportunity-board.js';
import * as __memory from '../../server/nocoreach/execution/memory.js';
const test=__vitest_test;
test('goal requires meaningful audience and progress, ignores approval metadata',()=>{
 assert.throws(()=>goalInput({intent:'goal',audience:' ',focus:'x',progress:'x'}));
 assert.deepEqual(goalInput({intent:'goal',audience:'a',focus:'f',progress:'p',confirmedBy:'forged'}),{intent:'goal',audience:'a',focus:'f',progress:'p'});
 assert.throws(()=>proposalInput({title:'a',brief:'a'.repeat(20001)}));
});
test('evidence excludes sensitive fields, unsafe comparisons and preserves zero versus missing',()=>{
 const e=evidenceFrom([{key:'project',payload:{end:'2026-09-20',secret:'no'}},{key:'queries-28',payload:Array.from({length:25},()=>({keyword:'k',clicks:0,impressions:10,previous:400,secret:'no'}))}],[], 'now');
 assert.equal(e.searchQueries.length,20);assert.equal(e.searchQueries[0].clicks,0);assert.ok(!('previous' in e.searchQueries[0]));assert.ok(!JSON.stringify(e).includes('secret'));assert.equal(e.industryCandidates.length,0);
});
test('overview totals use overview records, not truncated page samples',()=>{
 const e=evidenceFrom([{key:'project',payload:{end:'2026-09-20'}},{key:'history-web',payload:[{date:'2026-09-19',views:100,sessions:80},{date:'2026-09-20',views:0,sessions:0}]},{key:'pages-28',payload:[{page:'/',views:5}]}],[],'now');
 assert.equal(e.summary.web.views,100);assert.equal(e.summary.web.days,2);assert.equal(e.summary.search.clicks,null);assert.equal(e.summary.web.from,'2026-09-19');
});
test('independent action does not require a project goal and preserves its objective',async()=>{
 const {StrategyService}=__strategy_service;
 const writes=[],transaction={testTransaction:true};
 const service=new StrategyService({db:{getRepository:name=>({create:async options=>{writes.push({name,...options});return {id:42};}})}});
 const state={goal:null,proposals:[],insights:{items:[{id:'opportunity-1',title:'Existing signal'}],evidence:{availableThrough:'2026-09-20'}}};
 service.context=async()=>({evidence:{availableThrough:'2026-09-20'}});
 service.mutate=async(_id,_v,fn)=>{await fn(state,transaction);return state;};
 await assert.rejects(service.confirmDirection(1,{title:'Guide',brief:'Audience and sources',objective:'Improve onboarding',insightId:'missing'}),e=>e.status===409);
 assert.equal(writes.length,0);
 await service.confirmDirection(1,{title:'Guide',brief:'Audience and sources',objective:'Improve onboarding',insightId:'opportunity-1'});
 assert.equal(writes.length,1);assert.equal(writes[0].transaction,transaction);
 assert.equal(writes[0].values.evidence.objective,'Improve onboarding');assert.equal(writes[0].values.evidence.insight.id,'opportunity-1');
 assert.equal(state.proposals[0].taskId,42);assert.equal(state.proposals[0].goal,null);
});
test('a change handed off on its own keeps its change and page on the task',async()=>{
 // T-33 on Studio (2026-10-21): handed off from Insights › Today's changes, it kept neither, so its article could not be found.
 const {StrategyService}=__strategy_service;
 const writes=[];const service=new StrategyService({db:{getRepository:name=>({create:async options=>{writes.push({name,...options});return {id:43};}})}});
 const state={goal:null,proposals:[],insights:{items:[],evidence:{}}};
 service.context=async()=>({evidence:{signals:{items:[{key:'gsc-near-first:/en/blog/x',url:'https://www.nocobase.com/en/blog/x'}]}}});
 service.mutate=async(_id,_v,fn)=>{await fn(state,{});return state;};
 await service.confirmDirection(1,{title:'/en/blog/x ranks 19.8',brief:'b',objective:'o',signalKey:'gsc-near-first:/en/blog/x',page:'https://www.nocobase.com/en/blog/x'});
 assert.equal(writes[0].values.evidence.signalKey,'gsc-near-first:/en/blog/x');
 assert.equal(writes[0].values.evidence.page,'https://www.nocobase.com/en/blog/x');
 assert.equal(writes[0].values.evidence.insight,null);
 // Not an address: nothing is kept.
 await service.confirmDirection(1,{title:'t',brief:'b',objective:'o',page:'javascript:alert(1)'});
 assert.equal('page' in writes[1].values.evidence,false);
});
test('a data page hand-off records who found it and from which page',async()=>{
 // Found by <name> on the task (2026-10-22): the creator and the page they handed it off from.
 const {StrategyService}=__strategy_service;
 const writes=[];const service=new StrategyService({db:{getRepository:name=>({create:async options=>{writes.push({name,...options});return {id:44};}})}});
 const state={goal:null,proposals:[],insights:{items:[],evidence:{}}};
 service.context=async()=>({evidence:{}});
 service.mutate=async(_id,_v,fn)=>{await fn(state,{});return state;};
 const ctx={auth:{user:{id:2,nickname:'王磊'}}};
 await service.confirmDirection(1,{title:'t',brief:'b',objective:'o',entry:'/main/data/github'},ctx);
 assert.deepEqual(writes[0].values.evidence.createdBy,{id:'2',name:'王磊'});
 assert.equal(writes[0].values.evidence.entry,'/main/data/github');
 // Anything but a plain path is left out, without failing the hand-off.
 await service.confirmDirection(1,{title:'t',brief:'b',objective:'o',entry:'https://evil.example/x'},ctx);
 assert.equal('entry' in writes[1].values.evidence,false);
});
test('a hand-off keeps its short why, else the opportunity reason, as evidence.why',async()=>{
 // The task page's Why card shows it first (2026-10-23): plain text, at most 300 characters, never required.
 const {StrategyService}=__strategy_service;
 const writes=[];const service=new StrategyService({db:{getRepository:name=>({create:async options=>{writes.push({name,...options});return {id:45};}})}});
 const state={goal:null,proposals:[],insights:{items:[{id:'opportunity-2',title:'Clicks fell',reason:'/ja clicks fell 34% in 28 days'}],evidence:{}}};
 service.context=async()=>({evidence:{}});
 service.mutate=async(_id,_v,fn)=>{await fn(state,{});return state;};
 await service.confirmDirection(1,{title:'t',brief:'b',objective:'o',why:'**3 repos** gained\n 1,200 stars this week.'});
 assert.equal(writes[0].values.evidence.why,'3 repos gained 1,200 stars this week.');
 await service.confirmDirection(1,{title:'t',brief:'b',objective:'o',insightId:'opportunity-2'});
 assert.equal(writes[1].values.evidence.why,'/ja clicks fell 34% in 28 days');
 await service.confirmDirection(1,{title:'t',brief:'b',objective:'o',why:'x'.repeat(301)});
 assert.equal('why' in writes[2].values.evidence,false);
});
test('opportunity validation rejects missing evidence and strips generated identity',()=>{
 const {insightInput}=__strategy_service;
 assert.throws(()=>insightInput({title:'Unsupported claim'}));
 const card=insightInput({id:'forged',title:'t',observation:'o',meaning:'m',evidenceText:'e',limitation:'l',suggestion:'s',objective:'g',source:'script'});
 assert.equal(card.source,'mixed');assert.ok(!('id' in card));
 assert.ok(!('reason' in card));assert.equal(insightInput({title:'t',reason:' 曝光 5,848 '+'x'.repeat(400),observation:'o',meaning:'m',evidenceText:'e',limitation:'l',suggestion:'s',objective:'g'}).reason.length,300);
});
test('updating insights archives complete prior batches without changing their ids or evidence',async()=>{
 const {StrategyService}=__strategy_service;const service=new StrategyService({});
 const prior={generatedAt:'old',items:[{id:'old-id',title:'Old'}],evidence:{availableThrough:'2026-09-01'}};const state={insights:prior};
 service.context=async()=>({evidence:{availableThrough:'2026-09-24'}});service.mutate=async(_id,_v,fn)=>{await fn(state);return state;};
 const card={title:'New',observation:'Fact',meaning:'Hypothesis',evidenceText:'GSC',limitation:'Sample',suggestion:'Investigate',objective:'Improve',source:'search'};
 await service.saveInsights(1,{insights:[card]});assert.deepEqual(state.insightHistory,[prior]);const second=state.insights;
 await service.saveInsights(1,{insights:[card]});assert.deepEqual(state.insightHistory,[second,prior]);assert.equal(state.insightHistory[1].items[0].id,'old-id');
});
test('historical opportunities use original evidence when confirmed into a task',async()=>{
 const {StrategyService}=__strategy_service;let saved;const service=new StrategyService({db:{getRepository:()=>({create:async({values})=>{saved=values;return {id:7};}})}});
 const state={proposals:[],insights:{items:[],evidence:{availableThrough:'new'}},insightHistory:[{items:[{id:'old'}],evidence:{availableThrough:'old'}}]};service.context=async()=>({evidence:{availableThrough:'new'}});service.mutate=async(_id,_v,fn)=>{await fn(state,{});return state;};
 await service.confirmDirection(1,{title:'Action',brief:'Details',objective:'Goal',insightId:'old'});assert.equal(saved.evidence.context.availableThrough,'old');assert.equal(saved.evidence.insight.id,'old');
});
test('stable opportunity identity preserves discussion and manual decisions when evidence updates',async()=>{
 const {StrategyService}=__strategy_service;const service=new StrategyService({});const card={id:'stable',title:'Guide',observation:'Old fact',meaning:'m',evidenceText:'Old evidence',limitation:'l',suggestion:'Write onboarding',objective:'Help users',source:'website',target:'/docs',audience:'developers'};const state={proposals:[],insights:{generatedAt:'old',items:[card]},opportunityMeta:{stable:{priority:'low',status:'pending'}}};service.context=async()=>({evidence:{}});service.mutate=async(_id,_v,fn)=>{await fn(state);return state;};await service.saveInsights(1,{insights:[{...card,observation:'New fact',evidenceText:'New evidence',priority:'high'}]});assert.equal(state.insights.items[0].id,'stable');assert.equal(state.insights.items[0].change,'evidence');assert.equal(state.opportunityMeta.stable.priority,'low');assert.equal(state.opportunityMeta.stable.status,'pending');assert.equal(state.insightHistory[0].items[0].evidenceText,'Old evidence');
 await service.saveInsights(1,{insights:[]});assert.equal(state.insights.items.length,0);assert.equal(state.insightHistory.length,2);
});
test('different audience or action never merges and review rejects unknown opportunities',async()=>{const {mergeCards}=__opportunity_board;const old={id:'old',title:'t',objective:'g',suggestion:'s',audience:'a'};assert.notEqual(mergeCards({insights:{items:[old]}},[{...old,audience:'b'}],'now',()=> 'new')[0].id,'old');const {StrategyService}=__strategy_service;const service=new StrategyService({});service.mutate=async(_id,_v,fn)=>fn({insights:{items:[old]}});await assert.rejects(service.reviewOpportunity(1,{insightId:'missing',status:'ignored'}));await assert.rejects(service.reviewOpportunity(1,{insightId:'old',priority:'fake'}));});

test('memory: the AI reads the handbook sections by title; older projects are read from their fields; limits hold',()=>{
 const {projectMemory}=__strategy_service;const {memoryOf,memoryInput}=__memory;
 const old=projectMemory({name:'Noco',description:'Open source no-code',positioning:'x'.repeat(5000),doNotChange:'Pricing',analyticsPropertyId:'properties/1',competitors:42,keyPages:'/pricing'});
 assert.equal(old['项目'],'Noco');assert.equal(old['规矩与禁区'],'Pricing');assert.ok(old['品牌基础'].startsWith('Open source no-code\n定位：'));assert.equal(old['品牌基础'].length,4000);assert.equal(old['产品'],'关键页面：\n/pricing');
 assert.equal('竞品' in old,false,'non-text and empty sections are left out');assert.ok(!JSON.stringify(old).includes('properties/1'));
 const now=projectMemory({name:'Noco',description:'stale',memory:{brand:'NocoBase：开源无代码平台',voice:'不用感叹号'}});assert.deepEqual(Object.keys(now),['项目','品牌基础','语气与风格'],'saved sections replace the older fields');
 assert.equal(memoryOf(undefined).brand,'');assert.equal(projectMemory(undefined)['项目'],'');
 assert.deepEqual(memoryInput({brand:' a ',unknown:'x'}).brand,'a');assert.throws(()=>memoryInput({brand:'x'.repeat(4001)}),/品牌基础.*太长/);
 assert.throws(()=>memoryInput(Object.fromEntries(['brand','product','audience'].map(k=>[k,'x'.repeat(3000)]))),/一共 9000 字/);assert.throws(()=>memoryInput({voice:42}),/格式不对/);
});

test('signal-based analysis keeps only suggestions that cite a current signal and stores observations',async()=>{
 const {StrategyService}=__strategy_service;const service=new StrategyService({});const state={proposals:[]};
 service.context=async()=>({evidence:{analysisVersion:3,summary:{web:{days:28},search:{days:28}},publicSources:[],signals:{items:[{key:'gsc-near-first:/docs/a',source:'gsc'}]}}});service.mutate=async(_id,_v,fn)=>{await fn(state);return state;};
 const base={title:'T',observation:'o',meaning:'m',evidenceText:'e',limitation:'l',suggestion:'s',objective:'g',source:'search',sources:['gsc']};
 await service.saveInsights(1,{insights:[{...base,signalIds:['gsc-near-first:/docs/a','invented']},{...base,title:'Made up',objective:'other',signalIds:['invented']}],observations:['搜索曝光上升 18%',' ','x'.repeat(400),'a','b','c']});
 assert.equal(state.insights.items.length,1);assert.deepEqual(state.insights.items[0].signalIds,['gsc-near-first:/docs/a']);
 assert.equal(state.insights.observations.length,4);assert.equal(state.insights.observations[1].length,300);
});
test('opportunity decisions: ignore or restore only; ignored ones are not brought back by later analyses',async()=>{
 const {StrategyService}=__strategy_service;const {withoutIgnored}=__opportunity_board;
 const old={id:'old',title:'t',objective:'g',suggestion:'s',signalIds:['b','a']};let state={insights:{items:[old]}};
 const service=new StrategyService({});service.mutate=async(_id,_v,fn)=>{await fn(state);return state;};
 await assert.rejects(service.reviewOpportunity(1,{insightId:'old',status:'snoozed'}),/处理状态无效/);
 await assert.rejects(service.reviewOpportunity(1,{insightId:'old',status:'discussing'}),/处理状态无效/);
 await service.reviewOpportunity(1,{insightId:'old',status:'ignored'});assert.equal(state.opportunityMeta.old.status,'ignored');assert.ok(state.opportunityMeta.old.ignoredAt);
 const next=[{id:'old',title:'t2',signalIds:['x']},{id:'n1',title:'reworded',signalIds:['a','b']},{id:'n2',title:'other',signalIds:['a']},{id:'n3',title:'no signals'}];
 assert.deepEqual(withoutIgnored(state,next).map(c=>c.id),['n2','n3']);
 await service.reviewOpportunity(1,{insightId:'old',status:'pending'});assert.equal(state.opportunityMeta.old.status,'pending');assert.ok(state.opportunityMeta.old.restoredAt);
 assert.equal(withoutIgnored(state,next).length,4);
});
test('the same thing raised again in other words keeps its card; one change backing another action does not',()=>{
 const {mergeCards}=__opportunity_board;let n=0;const uuid=()=>'new-'+(++n);
 const old={id:'o2',no:2,title:'给 field 接口页补 JS 字段与联动示例',objective:'减少提问',suggestion:'补示例',target:'https://docs.nocobase.com/api/i-field',audience:'开发者',signalIds:['community-covered:field'],firstSeenAt:'2026-10-09',evidenceText:'e',observation:'o'};
 const digest={id:'o1',title:'把插件分享主题做成文档专栏',objective:'g',suggestion:'s',target:'社区插件分享类主题',signalIds:['community-digest'],firstSeenAt:'2026-10-09'};
 const replies={id:'o27',title:'回复 3 个无人回应的论坛主题',objective:'g',suggestion:'s',target:'近 14 天 3 个无人回复主题',signalIds:['community-unanswered'],firstSeenAt:'2026-10-15'};
 const state={proposals:[],insights:{generatedAt:'2026-10-11',items:[]},insightHistory:[{generatedAt:'2026-10-09',items:[old,digest,replies]}]};
 const reworded={...old,id:undefined,objective:'让开发者少走弯路',audience:'低代码开发者',signalIds:['community-covered:field']};
 const [a]=mergeCards(state,[reworded],'2026-10-11T09:00:00Z',uuid);
 assert.equal(a.id,'o2','same changes and same page: the same opportunity');assert.equal(a.firstSeenAt,'2026-10-09');assert.notEqual(a.change,'new','a re-raise, not a new opportunity');
 const [b]=mergeCards(state,[{...replies,id:undefined,title:'回复 4 个无人回应的论坛主题',target:'近 14 天无人回复的论坛主题'}],'now',uuid);
 assert.equal(b.id,'o27','the page worded differently, the same title apart from its numbers');
 const [c]=mergeCards(state,[{...digest,id:undefined,title:'为 AI Portal 建发布进度说明页',target:'AI Portal 主题（新页面）'}],'now',uuid);
 assert.match(c.id,/^new-/,'a community digest backs several actions: another page and title is another opportunity');
 const [d]=mergeCards(state,[{...reworded,signalIds:['community-covered:field','community-gap:bug']}],'now',uuid);
 assert.match(d.id,/^new-/,'other changes cited: another opportunity');
 const [e,f]=mergeCards(state,[reworded,{...reworded,suggestion:'另写一篇排错页'}],'now',uuid);
 assert.equal(e.id,'o2');assert.match(f.id,/^new-/,'a second card for the same thing gets its own id instead of being dropped');
 // Its latest card handed off: a new card, never an older undecided copy of the same thing.
 const handedOff={...old,id:'o9',no:9};
 const later={proposals:[{taskId:5,insight:{id:'o9'}}],insights:{generatedAt:'2026-10-12',items:[handedOff]},insightHistory:state.insightHistory};
 assert.match(mergeCards(later,[reworded],'now',uuid)[0].id,/^new-/);
});

test('menu counts: personal waiting tasks and all pending opportunities',async()=>{
 const {StrategyService}=__strategy_service;const {newPending}=__opportunity_board;
 const stages=[{key:'build',name:'修改',kind:'agent'},{key:'review',name:'看效果并发布',kind:'review'}],work=(i,extra={})=>({schemaVersion:2,revision:1,stage:'flow',plan:null,planVersion:0,step:0,results:[],history:[],flow:{stages},stageIndex:i,...extra});
 const tasks=[{id:1,evidence:{work:work(1)}},{id:2,evidence:{work:work(0)}},{id:3,evidence:{work:work(1,{archivedAt:'x'})}},{id:4,evidence:{work:work(1,{cancelledAt:'x'})}},{id:5,status:'待处理',evidence:{}}];
 const state={revision:1,proposals:[{taskId:9,insight:{id:'b'}}],opportunityMeta:{c:{status:'ignored'}},insights:{generatedAt:'2026-10-13',evidence:{analysisVersion:3},items:[{id:'a',change:'new'},{id:'b',change:'new'},{id:'c',change:'new'},{id:'d',change:'unchanged'}]},insightHistory:[{generatedAt:'2026-09-28',evidence:{},items:[{id:'e',change:'new'}]}]};
 // e was last raised 15 days before the latest analysis: expired, so it is not counted (14 days, 2026-10-19).
 assert.equal(newPending(state),1,'only a: b is handed off, c ignored, d not new, e from an older analysis');assert.equal(newPending({}),0);
 const filters=[];const s=new StrategyService({db:{getRepository:n=>n==='nrTasks'?{find:async({filter})=>{filters.push(filter);return tasks;}}:{findOne:async()=>({get:()=>state})}}});
 s.p.taskExecution={tasks:async id=>s.p.db.getRepository('nrTasks').find({filter:{projectId:id}})};
 // 1 waits at a review step and 5 was handed off but not started (counted since 2026-10-08); 2 is running, 3 and 4 are closed.
 assert.deepEqual(await s.badges('1',{auth:{user:{id:1}},state:{nrRole:'admin'}}),{tasks:2,opportunities:2,insights:2});assert.deepEqual(filters[0],{projectId:'1'});
 // Only your own tasks (2026-10-08): 1 is Lin's; 5 has no owner and counts for 管理员 only; 6 is yours and waiting.
 tasks[0].evidence.work.humanOwnerId='2';tasks.push({id:6,status:'待处理',evidence:{createdBy:{id:'7',name:'Mia'}}});
 const as=(id,nrRole)=>({auth:{user:{id}},state:{nrRole}});
 assert.equal((await s.badges('1',as(7,'member'))).tasks,1);assert.equal((await s.badges('1',as(2,'member'))).tasks,1);assert.equal((await s.badges('1',as(1,'admin'))).tasks,1);
 // A snoozed task waits for no one until its day (Snooze, 2026-10-28).
 tasks.push({id:7,evidence:{work:work(1,{humanOwnerId:'2',snooze:{until:'2099-01-01T01:00:00Z',day:'2099-01-01',at:'x',by:'2'}})}});
 assert.equal((await s.badges('1',as(2,'member'))).tasks,1);
});
test('opportunity numbers: given once by first appearance, shared by every copy, kept when re-raised',()=>{
 const {number}=__opportunity_board;
 const state={insights:{generatedAt:'2026-10-02',items:[{id:'b',firstSeenAt:'2026-09-28'},{id:'c'}]},insightHistory:[{generatedAt:'2026-09-28',items:[{id:'b'},{id:'a',firstSeenAt:'2026-09-20'}]}]};
 assert.equal(number(state),true);const no=id=>[state.insights,...state.insightHistory].flatMap(b=>b.items).filter(c=>c.id===id).map(c=>c.no);
 assert.deepEqual(no('a'),[1]);assert.deepEqual(no('b'),[2,2]);assert.deepEqual(no('c'),[3]);assert.equal(state.nextOpportunityNo,4);
 assert.equal(number(state),false,'nothing new: unchanged');
 state.insightHistory.unshift(state.insights);state.insights={generatedAt:'2026-10-03',items:[{id:'c'},{id:'d'}]};
 number(state);assert.equal(state.insights.items[0].no,3,'re-raised keeps its number');assert.equal(state.insights.items[1].no,4);assert.equal(state.nextOpportunityNo,5);
 assert.equal(number({}),false);
});
test('the backfill numbers tasks by creation order, saved opportunities once, and links the two numbers both ways',async()=>{
 const {StrategyService}=__strategy_service;
 const state={revision:3,proposals:[{taskId:'389749305311232',insight:{id:'x'}}],insights:{generatedAt:'2026-10-02',items:[{id:'x',firstSeenAt:'2026-10-01'}]},insightHistory:[]};
 const tasks=[{id:'389749305311232',createdAt:'2026-10-02',evidence:{insight:{id:'x'},work:{revision:2}}},{id:'388199492354048',createdAt:'2026-09-20',evidence:{}}],updates=[],created=[];
 const snap={findOne:async({filter})=>filter.key==='project'?{get:()=>({id:1})}:filter.key==='task-numbers:1'?null:{id:'row',get:()=>state},create:async({values})=>{created.push(values);},update:async({values})=>{updates.push(['strategy',values.payload.insights.items[0].no,values.payload.proposals[0].taskNo]);}};
 const taskRepo={find:async()=>tasks.map(t=>({get:k=>t[k]})),update:async({filterByTk,values})=>{updates.push(['task',filterByTk,values.evidence.no,values.evidence.insight?.no,values.evidence.work?.revision]);}};
 const s=new StrategyService({projectIds:async()=>['1'],db:{getRepository:n=>n==='nrTasks'?taskRepo:snap,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}});
 await s.numberAll();
 assert.deepEqual(created,[{key:'task-numbers:1',payload:{next:3}}]);
 assert.deepEqual(updates,[['strategy',1,2],['task','389749305311232',2,1,2],['task','388199492354048',1,undefined,undefined]],'oldest task is T-1; the proposal and the task copy get each other\'s numbers');
 assert.equal(state.revision,3,'numbering alone does not bump the revision');
});
test('each new task gets the next short number of its project, whoever creates it',async()=>{
 const {StrategyService}=__strategy_service;
 let counter=null;const writes=[];
 const snap={findOne:async()=>counter&&{id:'c',get:()=>counter},create:async({values})=>{counter=values.payload;writes.push(values.payload.next);},update:async({values})=>{counter=values.payload;writes.push(values.payload.next);}};
 const s=new StrategyService({db:{getRepository:n=>n==='nrTasks'?{find:async()=>[{get:()=>({no:24})}]}:snap,sequelize:{query:async()=>{}}}});
 const model=(evidence)=>{const v={projectId:'1',evidence};return {get:k=>v[k],set:(k,x)=>{v[k]=x;},v};};
 const a=model({source:'x'});await s.numberTask(a,{transaction:{}});assert.equal(a.v.evidence.no,25,'continues after the highest existing number');assert.equal(a.v.evidence.source,'x');
 const b=model(undefined);await s.numberTask(b,{});assert.equal(b.v.evidence.no,26);
 const c=model({no:3});await s.numberTask(c,{});assert.equal(c.v.evidence.no,3,'a given number is kept');assert.deepEqual(writes,[26,27]);
});

test('每条变化的结论: do / watch / skip with a reason; a change an opportunity cites is do; information cannot be do; judged later one by one',async()=>{
 const {StrategyService}=__strategy_service;const service=new StrategyService({});const state={};
 const signals=[{key:'audit-dupTitle',source:'site',actionable:true},{key:'gsc-up',source:'gsc',actionable:true},{key:'gh-stars',source:'github',actionable:false},{key:'later',source:'gsc',actionable:true}];
 service.context=async()=>({evidence:{signals:{items:signals}}});service.mutate=async(_id,_v,fn)=>{await fn(state);return state;};
 const card={title:'Fix titles',observation:'o',meaning:'m',evidenceText:'e',limitation:'l',suggestion:'s',objective:'g',source:'website',sources:['site'],signalIds:['audit-dupTitle']};
 await service.saveInsights(1,{insights:[card],signalReviews:[{key:'audit-dupTitle',verdict:'skip',reason:'x'},{key:'gsc-up',verdict:'watch',reason:'刚出现，先看两周'},{key:'gh-stars',verdict:'do',reason:'好消息'},{key:'nope',verdict:'do'},{key:'later',verdict:'maybe'}]});
 assert.deepEqual(state.insights.signalReviews,{'audit-dupTitle':{verdict:'do',reason:''},'gsc-up':{verdict:'watch',reason:'刚出现，先看两周'},'gh-stars':{verdict:'watch',reason:'好消息'}});
 await service.reviewSignal(1,{signalKey:'later',verdict:'skip',reason:'影响很小'});assert.deepEqual(state.insights.signalReviews.later,{verdict:'skip',reason:'影响很小'});
 await assert.rejects(service.reviewSignal(1,{signalKey:'gone',verdict:'do'}),/不在最近一次分析/);
});

test('a change judged worth doing gets an opportunity, or is skipped when a task already covers it',async()=>{
 const {StrategyService}=__strategy_service;const service=new StrategyService({});const state={proposals:[{id:'p',signalKey:'handed',taskId:7,taskNo:7}]};
 const signals=[{key:'fresh',source:'gsc',title:'/en/blog/x ranks 19.8',facts:['5,790 impressions, 0 clicks'],url:'https://www.example.com/en/blog/x',actionable:true},{key:'handed',source:'gsc',title:'h',facts:[],actionable:true}];
 service.context=async()=>({evidence:{signals:{items:signals}}});service.mutate=async(_id,_v,fn)=>{await fn(state);return state;};
 await service.saveInsights(1,{insights:[],locale:'en-US',signalReviews:[{key:'fresh',verdict:'do',reason:'Rewrite the title'},{key:'handed',verdict:'do',reason:'r'}]});
 assert.deepEqual(state.insights.items.map(c=>[c.title,c.signalIds,c.suggestion]),[['/en/blog/x ranks 19.8',['fresh'],'Rewrite the title']]);
 assert.deepEqual(state.insights.signalReviews.fresh,{verdict:'do',reason:'Rewrite the title'});
 assert.deepEqual(state.insights.signalReviews.handed,{verdict:'skip',reason:'Task T-7 is already on it'});
});
test('verdicts filled in afterwards keep the ones already there',async()=>{
 const {StrategyService}=__strategy_service;const service=new StrategyService({});
 const state={insights:{evidence:{signals:{items:[{key:'a',actionable:true},{key:'b',actionable:false}]}},signalReviews:{a:{verdict:'do',reason:'原来的'}}}};service.mutate=async(_id,_v,fn)=>{await fn(state);return state;};
 await service.reviewSignals(1,{reviews:[{signalKey:'a',verdict:'skip',reason:'新的'},{key:'b',verdict:'do',reason:'信息'},{key:'x',verdict:'do'}]});
 assert.deepEqual(state.insights.signalReviews,{a:{verdict:'do',reason:'原来的'},b:{verdict:'watch',reason:'信息'}});
});
test('忽略 a change without its own opportunity: kept by key, keeps it from coming back as an opportunity, 恢复 undoes it',async()=>{
 const {StrategyService}=__strategy_service;const board=__opportunity_board;
 const service=new StrategyService({db:{}});const state={proposals:[],insights:{items:[],evidence:{signals:{items:[{key:'ai-answer:claude'},{key:'gsc-site'}]}}}};
 service.mutate=async(_id,_v,fn)=>{await fn(state);return state;};
 await assert.rejects(service.decideSignal(1,{signalKey:'gone',status:'ignored'}),e=>e.status===404);
 await assert.rejects(service.decideSignal(1,{signalKey:'gsc-site',status:'later'}),/处理状态无效/);
 await service.decideSignal(1,{signalKey:'ai-answer:claude',status:'ignored'});assert.equal(state.signalMeta['ai-answer:claude'].status,'ignored');
 const cards=[{id:'a',signalIds:['ai-answer:claude']},{id:'b',signalIds:['ai-answer:claude','gsc-site']},{id:'c'}];
 assert.deepEqual(board.withoutIgnored(state,cards).map(c=>c.id),['b','c'],'only an opportunity resting on ignored changes alone is dropped');
 await service.decideSignal(1,{signalKey:'ai-answer:claude',status:'pending'});assert.equal(state.signalMeta['ai-answer:claude'],undefined);
 assert.deepEqual(board.withoutIgnored(state,cards).map(c=>c.id),['a','b','c']);
});
