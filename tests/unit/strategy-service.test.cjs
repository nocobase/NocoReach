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
