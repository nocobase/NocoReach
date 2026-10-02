const test=require('node:test'),assert=require('node:assert/strict');
const {goalInput,proposalInput,evidenceFrom}=require('../../plugins/connections/server/strategy-service');
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
 const {StrategyService}=require('../../plugins/connections/server/strategy-service');
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
test('opportunity validation rejects missing evidence and strips generated identity',()=>{
 const {insightInput}=require('../../plugins/connections/server/strategy-service');
 assert.throws(()=>insightInput({title:'Unsupported claim'}));
 const card=insightInput({id:'forged',title:'t',observation:'o',meaning:'m',evidenceText:'e',limitation:'l',suggestion:'s',objective:'g',source:'script'});
 assert.equal(card.source,'mixed');assert.ok(!('id' in card));
 assert.ok(!('reason' in card));assert.equal(insightInput({title:'t',reason:' 曝光 5,848 '+'x'.repeat(400),observation:'o',meaning:'m',evidenceText:'e',limitation:'l',suggestion:'s',objective:'g'}).reason.length,300);
});
test('updating insights archives complete prior batches without changing their ids or evidence',async()=>{
 const {StrategyService}=require('../../plugins/connections/server/strategy-service');const service=new StrategyService({});
 const prior={generatedAt:'old',items:[{id:'old-id',title:'Old'}],evidence:{availableThrough:'2026-09-01'}};const state={insights:prior};
 service.context=async()=>({evidence:{availableThrough:'2026-09-24'}});service.mutate=async(_id,_v,fn)=>{await fn(state);return state;};
 const card={title:'New',observation:'Fact',meaning:'Hypothesis',evidenceText:'GSC',limitation:'Sample',suggestion:'Investigate',objective:'Improve',source:'search'};
 await service.saveInsights(1,{insights:[card]});assert.deepEqual(state.insightHistory,[prior]);const second=state.insights;
 await service.saveInsights(1,{insights:[card]});assert.deepEqual(state.insightHistory,[second,prior]);assert.equal(state.insightHistory[1].items[0].id,'old-id');
});
test('historical opportunities use original evidence when confirmed into a task',async()=>{
 const {StrategyService}=require('../../plugins/connections/server/strategy-service');let saved;const service=new StrategyService({db:{getRepository:()=>({create:async({values})=>{saved=values;return {id:7};}})}});
 const state={proposals:[],insights:{items:[],evidence:{availableThrough:'new'}},insightHistory:[{items:[{id:'old'}],evidence:{availableThrough:'old'}}]};service.context=async()=>({evidence:{availableThrough:'new'}});service.mutate=async(_id,_v,fn)=>{await fn(state,{});return state;};
 await service.confirmDirection(1,{title:'Action',brief:'Details',objective:'Goal',insightId:'old'});assert.equal(saved.evidence.context.availableThrough,'old');assert.equal(saved.evidence.insight.id,'old');
});
test('stable opportunity identity preserves discussion and manual decisions when evidence updates',async()=>{
 const {StrategyService}=require('../../plugins/connections/server/strategy-service');const service=new StrategyService({});const card={id:'stable',title:'Guide',observation:'Old fact',meaning:'m',evidenceText:'Old evidence',limitation:'l',suggestion:'Write onboarding',objective:'Help users',source:'website',target:'/docs',audience:'developers'};const state={proposals:[],insights:{generatedAt:'old',items:[card]},opportunityMeta:{stable:{priority:'low',status:'pending'}}};service.context=async()=>({evidence:{}});service.mutate=async(_id,_v,fn)=>{await fn(state);return state;};await service.saveInsights(1,{insights:[{...card,observation:'New fact',evidenceText:'New evidence',priority:'high'}]});assert.equal(state.insights.items[0].id,'stable');assert.equal(state.insights.items[0].change,'evidence');assert.equal(state.opportunityMeta.stable.priority,'low');assert.equal(state.opportunityMeta.stable.status,'pending');assert.equal(state.insightHistory[0].items[0].evidenceText,'Old evidence');
 await service.saveInsights(1,{insights:[]});assert.equal(state.insights.items.length,0);assert.equal(state.insightHistory.length,2);
});
test('different audience or action never merges and review rejects unknown opportunities',async()=>{const {mergeCards}=require('../../plugins/connections/server/opportunity-board');const old={id:'old',title:'t',objective:'g',suggestion:'s',audience:'a'};assert.notEqual(mergeCards({insights:{items:[old]}},[{...old,audience:'b'}],'now',()=> 'new')[0].id,'old');const {StrategyService}=require('../../plugins/connections/server/strategy-service');const service=new StrategyService({});service.mutate=async(_id,_v,fn)=>fn({insights:{items:[old]}});await assert.rejects(service.reviewOpportunity(1,{insightId:'missing',status:'ignored'}));await assert.rejects(service.reviewOpportunity(1,{insightId:'old',priority:'fake'}));});

test('project memory passes only known text fields to the AI and bounds their length',()=>{
 const {projectMemory,memoryFields}=require('../../plugins/connections/server/strategy-service');
 const memory=projectMemory({name:'Noco',positioning:'x'.repeat(5000),doNotChange:'Pricing',analyticsPropertyId:'properties/1',competitors:42});
 assert.deepEqual(Object.keys(memory),memoryFields);
 assert.equal(memory.positioning.length,4000);
 assert.equal(memory.doNotChange,'Pricing');
 assert.equal(memory.competitors,'');
 assert.equal('analyticsPropertyId' in memory,false);
 assert.equal(projectMemory(undefined).name,'');
});

test('signal-based analysis keeps only suggestions that cite a current signal and stores observations',async()=>{
 const {StrategyService}=require('../../plugins/connections/server/strategy-service');const service=new StrategyService({});const state={proposals:[]};
 service.context=async()=>({evidence:{analysisVersion:3,summary:{web:{days:28},search:{days:28}},publicSources:[],signals:{items:[{key:'gsc-near-first:/docs/a',source:'gsc'}]}}});service.mutate=async(_id,_v,fn)=>{await fn(state);return state;};
 const base={title:'T',observation:'o',meaning:'m',evidenceText:'e',limitation:'l',suggestion:'s',objective:'g',source:'search',sources:['gsc']};
 await service.saveInsights(1,{insights:[{...base,signalIds:['gsc-near-first:/docs/a','invented']},{...base,title:'Made up',objective:'other',signalIds:['invented']}],observations:['搜索曝光上升 18%',' ','x'.repeat(400),'a','b','c']});
 assert.equal(state.insights.items.length,1);assert.deepEqual(state.insights.items[0].signalIds,['gsc-near-first:/docs/a']);
 assert.equal(state.insights.observations.length,4);assert.equal(state.insights.observations[1].length,300);
});
test('opportunity decisions: ignore or restore only; ignored ones are not brought back by later analyses',async()=>{
 const {StrategyService}=require('../../plugins/connections/server/strategy-service');const {withoutIgnored}=require('../../plugins/connections/server/opportunity-board');
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
test('menu counts: tasks waiting for you and new undecided opportunities',async()=>{
 const {StrategyService}=require('../../plugins/connections/server/strategy-service');const {newPending}=require('../../plugins/connections/server/opportunity-board');
 const stages=[{key:'build',name:'修改',kind:'agent'},{key:'review',name:'看效果并发布',kind:'review'}],work=(i,extra={})=>({schemaVersion:2,revision:1,stage:'flow',plan:null,planVersion:0,step:0,results:[],history:[],flow:{stages},stageIndex:i,...extra});
 const tasks=[{id:1,evidence:{work:work(1)}},{id:2,evidence:{work:work(0)}},{id:3,evidence:{work:work(1,{archivedAt:'x'})}},{id:4,evidence:{work:work(1,{cancelledAt:'x'})}},{id:5,status:'待处理',evidence:{}}];
 const state={revision:1,proposals:[{taskId:9,insight:{id:'b'}}],opportunityMeta:{c:{status:'ignored'}},insights:{items:[{id:'a',change:'new'},{id:'b',change:'new'},{id:'c',change:'new'},{id:'d',change:'unchanged'}]},insightHistory:[{items:[{id:'e',change:'new'}]}]};
 assert.equal(newPending(state),1,'only a: b is handed off, c ignored, d not new, e from an older analysis');assert.equal(newPending({}),0);
 const filters=[];const s=new StrategyService({db:{getRepository:n=>n==='nrTasks'?{find:async({filter})=>{filters.push(filter);return tasks;}}:{findOne:async()=>({get:()=>state})}}});
 assert.deepEqual(await s.badges('1'),{tasks:1,opportunities:1});assert.deepEqual(filters[0],{projectId:'1'});
});
test('opportunity numbers: given once by first appearance, shared by every copy, kept when re-raised',()=>{
 const {number}=require('../../plugins/connections/server/opportunity-board');
 const state={insights:{generatedAt:'2026-10-02',items:[{id:'b',firstSeenAt:'2026-09-28'},{id:'c'}]},insightHistory:[{generatedAt:'2026-09-28',items:[{id:'b'},{id:'a',firstSeenAt:'2026-09-20'}]}]};
 assert.equal(number(state),true);const no=id=>[state.insights,...state.insightHistory].flatMap(b=>b.items).filter(c=>c.id===id).map(c=>c.no);
 assert.deepEqual(no('a'),[1]);assert.deepEqual(no('b'),[2,2]);assert.deepEqual(no('c'),[3]);assert.equal(state.nextOpportunityNo,4);
 assert.equal(number(state),false,'nothing new: unchanged');
 state.insightHistory.unshift(state.insights);state.insights={generatedAt:'2026-10-03',items:[{id:'c'},{id:'d'}]};
 number(state);assert.equal(state.insights.items[0].no,3,'re-raised keeps its number');assert.equal(state.insights.items[1].no,4);assert.equal(state.nextOpportunityNo,5);
 assert.equal(number({}),false);
});
test('the backfill numbers tasks by creation order, saved opportunities once, and links the two numbers both ways',async()=>{
 const {StrategyService}=require('../../plugins/connections/server/strategy-service');
 const state={revision:3,proposals:[{taskId:'389749305311232',insight:{id:'x'}}],insights:{generatedAt:'2026-10-02',items:[{id:'x',firstSeenAt:'2026-10-01'}]},insightHistory:[]};
 const tasks=[{id:'389749305311232',createdAt:'2026-10-02',evidence:{insight:{id:'x'},work:{revision:2}}},{id:'388199492354048',createdAt:'2026-09-20',evidence:{}}],updates=[],created=[];
 const snap={findOne:async({filter})=>filter.key==='project'?{get:()=>({id:1})}:filter.key==='task-numbers:1'?null:{id:'row',get:()=>state},create:async({values})=>{created.push(values);},update:async({values})=>{updates.push(['strategy',values.payload.insights.items[0].no,values.payload.proposals[0].taskNo]);}};
 const taskRepo={find:async()=>tasks.map(t=>({get:k=>t[k]})),update:async({filterByTk,values})=>{updates.push(['task',filterByTk,values.evidence.no,values.evidence.insight?.no,values.evidence.work?.revision]);}};
 const s=new StrategyService({db:{getRepository:n=>n==='nrTasks'?taskRepo:snap,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}});
 await s.numberAll();
 assert.deepEqual(created,[{key:'task-numbers:1',payload:{next:3}}]);
 assert.deepEqual(updates,[['strategy',1,2],['task','389749305311232',2,1,2],['task','388199492354048',1,undefined,undefined]],'oldest task is T-1; the proposal and the task copy get each other\'s numbers');
 assert.equal(state.revision,3,'numbering alone does not bump the revision');
});
test('each new task gets the next short number of its project, whoever creates it',async()=>{
 const {StrategyService}=require('../../plugins/connections/server/strategy-service');
 let counter=null;const writes=[];
 const snap={findOne:async()=>counter&&{id:'c',get:()=>counter},create:async({values})=>{counter=values.payload;writes.push(values.payload.next);},update:async({values})=>{counter=values.payload;writes.push(values.payload.next);}};
 const s=new StrategyService({db:{getRepository:n=>n==='nrTasks'?{find:async()=>[{get:()=>({no:24})}]}:snap,sequelize:{query:async()=>{}}}});
 const model=(evidence)=>{const v={projectId:'1',evidence};return {get:k=>v[k],set:(k,x)=>{v[k]=x;},v};};
 const a=model({source:'x'});await s.numberTask(a,{transaction:{}});assert.equal(a.v.evidence.no,25,'continues after the highest existing number');assert.equal(a.v.evidence.source,'x');
 const b=model(undefined);await s.numberTask(b,{});assert.equal(b.v.evidence.no,26);
 const c=model({no:3});await s.numberTask(c,{});assert.equal(c.v.evidence.no,3,'a given number is kept');assert.deepEqual(writes,[26,27]);
});
