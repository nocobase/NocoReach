const test=require('node:test'),assert=require('node:assert/strict');
const {summarize,periodDays,starEvidence}=require('../../plugins/connections/server/evidence-period');
const {shift,buildSnapshots}=require('../../plugins/connections/server/sync-data');
const {starHistory}=require('../../plugins/connections/server/public-sources');
test('calendar comparisons require complete equal windows and distinguish zero denominator',()=>{
 const rows=Array.from({length:14},(_,i)=>({date:shift('2026-09-01',i),views:i<7?0:2}));
 const s=summarize(rows,['views'],'2026-09-14',7);assert.equal(s.previousStart,'2026-09-01');assert.equal(s.metrics.views.change,14);assert.equal(s.metrics.views.percent,null);assert.equal(s.metrics.views.comparable,true);
 const missing=summarize(rows.slice(1),['views'],'2026-09-14',7);assert.equal(missing.metrics.views.change,null);assert.equal(missing.previousDays,6);
 const old=summarize([{date:'2025-01-01',views:500}],['views'],'2026-09-14',7);assert.equal(old.views,null);assert.equal(old.days,0);assert.throws(()=>periodDays(30));
 const long=summarize([],['views'],'2026-09-28',90);assert.equal(long.start,'2026-07-01');assert.equal(long.previousEnd,'2026-06-30');
});
test('GitHub referral is derived only from successful daily source partitions',()=>{
 const partitions=[{source:'ga4',grain:'overview',payload:[{date:'2026-09-20',views:40}]},{source:'ga4',grain:'source',date:'2026-09-20',payload:[{source:'github.com',sessions:3,views:5,conversions:1},{source:'notgithub.com',sessions:90,views:100,conversions:10}]},{source:'ga4',grain:'source',date:'2026-09-19',payload:[]}];
 const rows=buildSnapshots(partitions,{}).find(s=>s.key==='history-github-referral').payload;assert.equal(rows.length,2);assert.equal(rows[0].sessions,3);assert.equal(rows[1].sessions,0);
});
test('Star history preserves actual samples and never fabricates unobserved baselines',()=>{
 const old={kind:'github',capturedAt:'2026-09-01T10:00:00Z',items:[{type:'repository',stars:100}]};const next={capturedAt:'2026-09-08T10:00:00Z',items:[{type:'repository',stars:105}]};const source={...next,starHistory:starHistory(old,next)};
 assert.equal(starEvidence(source,'2026-09-08',7).netChange,5);assert.equal(starEvidence(source,'2026-09-08',28).netChange,null);
 const again={...next,items:[{type:'repository',stars:104}]};assert.equal(starHistory({...source,kind:'github'},again).length,2);
});
test('saved analysis keeps original evidence even if sources change while model is working',async()=>{
 const {StrategyService}=require('../../plugins/connections/server/strategy-service');const service=new StrategyService({});const state={};service.mutate=async(_id,_v,fn)=>{await fn(state);return state;};service.context=()=>{throw Error('must not reread');};const context={evidence:{periodDays:7,availableThrough:'2026-09-20'}};
 await service.saveInsights(1,{insights:[],evidenceToken:'saved'}, {auth:{user:{id:1}},cache:{get:async()=>context}});assert.equal(state.insights.evidence.periodDays,7);
 await assert.rejects(service.saveInsights(1,{insights:[],evidenceToken:'expired'},{auth:{user:{id:1}},cache:{get:async()=>null}}),e=>e.status===409);
});
test('cross-period existing identity preserves history but cannot merge a different objective',()=>{
 const {mergeCards}=require('../../plugins/connections/server/opportunity-board');const old={id:'same',title:'old wording',objective:'help onboarding',target:'/docs',audience:'developers',suggestion:'improve guide'};const state={insights:{items:[old]}};
 const next={...old,title:'new 7-day evidence',existingId:'same'};assert.equal(mergeCards(state,[next],'2026-09-28T00:00:00Z',()=> 'new')[0].id,'same');assert.equal(mergeCards(state,[{...next,objective:'different'}],'2026-09-28T00:00:00Z',()=> 'new')[0].id,'new');
});
