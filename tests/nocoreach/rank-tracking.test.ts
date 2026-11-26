// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/rank-tracking.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { RankTracking, specification, result, sitePosition } from '../../server/nocoreach/rank-tracking.js';
import { rankSignals } from '../../server/nocoreach/signals.js';
import fixture from '../fixtures/dataforseo/goto-serp.json' with { type: 'json' };
const test=__vitest_test;
const DAY=86400000;
test('rank checks: desktop top 100, organic results only, the site and its subdomains count',()=>{
 const s=specification({target:' open  crm ',locationCode:2840,language:'en'});assert.equal(s.kind,'rank');assert.equal(s.request.depth,100);assert.equal(s.request.keyword,'open crm');assert.throws(()=>specification({target:'site:x.com',locationCode:2840,language:'en'}),/冒号/);
 const r=result({status_code:20000,cost:0.002,tasks:[{status_code:20000,result:[{items:[{type:'paid',domain:'x.com',rank_group:1},{type:'organic',domain:'other.com',url:'https://other.com',rank_group:1},{type:'organic',domain:'docs.example.com',url:'https://docs.example.com/a',rank_group:7},{type:'organic',domain:'www.example.com',url:'https://www.example.com/b',rank_group:12}]}]}]},s);
 assert.equal(r.result.items.length,3);assert.deepEqual(sitePosition(r.result.items,['example.com']),{position:7,url:'https://docs.example.com/a'});assert.deepEqual(sitePosition(r.result.items,['nothere.com']),{position:null,url:null});
 assert.equal(result({status_code:20000,tasks:[{status_code:40501}]},s).status,'failed');
});
function harness(fetchPos){const rows={},runs=[];let id=0;const snap={findOne:async({filter})=>rows[filter.key]&&{id:filter.key,get:()=>structuredClone(rows[filter.key])},create:async({values})=>{rows[values.key]=structuredClone(values.payload);},update:async({filterByTk,values})=>{rows[filterByTk]=structuredClone(values.payload);}};
 const p={project:async()=>({id:1,domains:['example.com']}),projectIds:async()=>['1'],db:{getRepository:n=>n==='nrSnapshots'?snap:null,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}};
 const t=new RankTracking(p);t._snap=snap;t.d4s={run:async(_id,kind,v)=>{runs.push(v);const pos=fetchPos(v.target);if(pos==='budget')throw new Error('本月 DataForSEO 预算已用完');return {id:++id,status:'completed',completedAt:new Date().toISOString(),result:{items:pos?[{position:pos,domain:'example.com',url:'https://example.com/'+v.target}]:[]}};}};return {t,rows,runs};}
test('tracking: add once per keyword and market, weekly checks only when due, all on request, stop at the budget',async()=>{
 const {t,rows,runs}=harness(k=>k==='crm'?8:k==='erp'?null:'budget');
 await t.add('1',{keywords:[{keyword:'crm',locationCode:2840,language:'en'},{keyword:'CRM',locationCode:2840,language:'en'},{keyword:'erp',locationCode:2840,language:'en'}]});
 let s=await t.status('1');assert.deepEqual(s.keywords.map(k=>k.keyword),['crm','erp']);
 let r=await t.check('1');assert.equal(r.checked,2);s=await t.status('1');assert.equal(s.keywords[0].latest.position,8);assert.equal(s.keywords[1].latest.position,null);
 r=await t.check('1');assert.equal(r.checked,0,'not due within a week');
 const k0=rows['rank-tracking:1'].keywords[0].id;rows['rank-tracking:1'].checks[k0][0].at=new Date(Date.now()-8*DAY).toISOString();r=await t.check('1');assert.equal(r.checked,1);
 await t.add('1',{keywords:[{keyword:'pricey',locationCode:2840,language:'en'},{keyword:'after',locationCode:2840,language:'en'}]});r=await t.check('1',{all:true});assert.ok(r.errors.some(e=>e.includes('预算')));assert.ok(!runs.some(v=>v.target==='after'),'stops at the budget');
 await t.remove('1',{ids:[k0]});s=await t.status('1');assert.ok(!s.keywords.some(k=>k.id===k0));assert.equal(rows['rank-tracking:1'].checks[k0],undefined);
});
test('Update now keeps known positions from the last 6 days and says how many, instead of counting them as checked',async()=>{
 const {t,rows,runs}=harness(()=>3);
 await t.add('1',{keywords:[{keyword:'crm',locationCode:2840,language:'en'},{keyword:'erp',locationCode:2840,language:'en'}]});
 assert.deepEqual(await t.check('1',{all:true}),{checked:2,reused:0,queued:0,errors:[]});
 assert.deepEqual(await t.check('1',{all:true}),{checked:2,reused:2,queued:0,errors:[]});assert.equal(runs.length,2,'no new query');
 // An uncertain check is asked again on purpose (forceRefresh: the layer would otherwise return that same run).
 const k0=rows['rank-tracking:1'].keywords[0].id;rows['rank-tracking:1'].checks[k0].at(-1).uncertain=true;
 assert.deepEqual(await t.check('1',{all:true}),{checked:2,reused:1,queued:0,errors:[]});assert.equal(runs.length,3);assert.equal(runs.at(-1).forceRefresh,true);
});
test('a check queued at DataForSEO stays pending, is never posted twice and is recorded when a later tick reads it',async()=>{
 const {t,rows,runs}=harness(()=>5);let ready=false;t.d4s.run=async(_id,_kind,v)=>{runs.push(v);return {id:41,status:'queued'};};
 t.d4s.collect=async(_id,runId)=>ready?{id:runId,status:'completed',completedAt:'2026-11-11T08:00:00.000Z',result:{items:[{position:5,domain:'www.example.com',url:'https://www.example.com/crm'}]}}:{id:runId,status:'queued'};
 await t.add('1',{keywords:[{keyword:'crm',locationCode:2840,language:'en'}]});
 assert.deepEqual(await t.check('1'),{checked:0,reused:0,queued:1,errors:[]});let s=await t.status('1');assert.equal(s.keywords[0].latest,null);assert.ok(s.keywords[0].checking);
 assert.deepEqual(await t.check('1',{all:true}),{checked:0,reused:0,queued:1,errors:[]});assert.equal(runs.length,1,'a pending keyword is not posted again');
 ready=true;assert.deepEqual(await t.check('1',{post:false}),{checked:1,reused:0,queued:0,errors:[]});
 s=await t.status('1');assert.equal(s.keywords[0].latest.position,5);assert.equal(s.keywords[0].checking,null);assert.deepEqual(rows['rank-tracking:1'].pending,{});
});
// The weekly check reads DataForSEO's Standard queue (2026-11-11), which waits for the links Google hides.
test('rank checks: the Standard queue, depth 100 priced as 10 pages of 10',()=>{
 const s=specification({target:'open crm',locationCode:2840,language:'en'});
 assert.equal(s.queue,'serp/google/organic');assert.equal(s.path,'serp/google/organic/task_post');assert.equal(s.request.depth,100);assert.equal(s.estimatedUsd,0.006);
 assert.equal(result({status_code:20000,cost:0,tasks:[{status_code:40102,result:null}]},s).status,'completed','no results is an answer');
});
test('hidden result links: the site found by its breadcrumb, its page by title; more than 30% hidden without the site is uncertain',()=>{
 const spec=specification({target:'open source crm',locationCode:2840,language:'en'}),pages=[{url:'https://www.nocobase.com/en/blog/top-open-source-crm',title:'Top 10 Open Source CRM Systems in 2026'}];
 const r=result(fixture.rank,spec);assert.equal(r.status,'completed');assert.equal(r.result.items.length,11);
 assert.ok(!r.result.items.some(i=>/google\.com$/.test(i.domain)),'no result is credited to Google');
 assert.deepEqual(r.result.items[2],{position:3,domain:'www.nocobase.com',url:'https://www.google.com/goto?url=CAESFAKE0003x',title:'Top 10 Open Source CRM Systems in 2026 - NocoBase',resolved:false,shown:'https://www.nocobase.com › blog › top-open-source-crm',site:'NocoBase'});
 assert.deepEqual(sitePosition(r.result.items,['nocobase.com'],pages),{position:3,url:'https://www.nocobase.com/en/blog/top-open-source-crm'});
 assert.deepEqual(sitePosition(r.result.items,['nocobase.com']),{position:3,url:null},'the page unknown without Website content');
 // Not in the results while 9 of 10 links are hidden: unknown, not "not in the top 100".
 const hidden=result(fixture.rankHidden,spec).result.items;assert.deepEqual(sitePosition(hidden,['nocobase.com']),{position:null,url:null,uncertain:true});
 assert.deepEqual(sitePosition(hidden,['site2.example']),{position:2,url:null});
 assert.deepEqual(sitePosition([{position:1,domain:'a.com',url:'https://a.com/'}],['nocobase.com']),{position:null,url:null},'all resolved: a known miss');
});
test('an uncertain check is shown as such, never counted as a drop, and the move is measured on the checks around it',async()=>{
 const c=(at,position,more={})=>({at,position,url:position?'https://x/'+position:null,...more});
 const rt={keywords:[{id:'a',keyword:'a'},{id:'b',keyword:'b'}],checks:{a:[c('2026-10-27',4),c('2026-11-10',null,{uncertain:true})],b:[c('2026-10-20',4),c('2026-10-27',null,{uncertain:true}),c('2026-11-03',11)]}};
 assert.deepEqual(rankSignals({rt}).map(s=>s.key.split(':').slice(0,2).join(':')),['rank-drop:b','rank-page:/11']);
 const {t,rows}=harness(()=>3);await t.add('1',{keywords:[{keyword:'crm',locationCode:2840,language:'en'}]});const k=rows['rank-tracking:1'].keywords[0].id;
 rows['rank-tracking:1'].checks={[k]:[c('2026-10-20',4,{runId:'1'}),c('2026-10-27',6,{runId:'2'}),c('2026-11-10',null,{runId:'3',uncertain:true})]};
 const s=(await t.status('1')).keywords[0];assert.equal(s.latest.uncertain,true);assert.equal(s.previous.position,6,'the last known position');assert.equal(s.history.length,3);
});
test('checks saved with more than 30% of the links hidden are marked uncertain once at start, others left alone',async()=>{
 const {t,rows}=harness(()=>3);await t.add('1',{keywords:[{keyword:'crm',locationCode:2840,language:'en'}]});const k=rows['rank-tracking:1'].keywords[0].id;
 const legacy=Array.from({length:10},(_,i)=>({position:i+1,domain:'google.com',url:`https://google.com/goto?url=CAES${i}`,title:'T'+i})),plain=[{position:1,domain:'a.com',url:'https://a.com/'}];
 const runs={r1:plain,r2:legacy,r3:plain};t.p.db.getRepository=n=>n==='nrSnapshots'?t._snap:{find:async({filter})=>filter.id.$in.filter(id=>runs[id]).map(id=>({get:f=>f==='id'?id:{items:runs[id]}}))};
 rows['rank-tracking:1'].checks={[k]:[{at:'2026-09-20T00:00:00Z',position:null,url:null,runId:'r1'},{at:'2026-11-10T00:00:00Z',position:null,url:null,runId:'r2'},{at:'2026-11-03T00:00:00Z',position:null,url:null,runId:'r3'}]};
 assert.equal(await t.reviewHiddenLinks(),1);assert.deepEqual(rows['rank-tracking:1'].checks[k].map(c=>Boolean(c.uncertain)),[false,true,false]);
 assert.equal(await t.reviewHiddenLinks(),0,'once per project');
});
test('rank signals: drop of 5+, lost from the top 20, entered the top 10',()=>{
 const c=(at,position)=>({at,position,url:'https://x/'+position});const rt={keywords:[{id:'a',keyword:'a'},{id:'b',keyword:'b'},{id:'c',keyword:'c'},{id:'d',keyword:'d'}],checks:{a:[c('2026-09-20',4),c('2026-09-27',11)],b:[c('2026-09-20',15),c('2026-09-27',null)],c:[c('2026-09-20',14),c('2026-09-27',6)],d:[c('2026-09-20',5),c('2026-09-27',6)]}};
 assert.deepEqual(rankSignals({rt}).map(s=>s.key.split(':')[0]+':'+s.key.split(':')[1]),['rank-drop:a','rank-lost:b','rank-top10:c','rank-page:/11','rank-page:/15']);
 // Each page that fell is one opportunity (2026-11-10); without Search Console figures or searches it has no clicks to win back.
 assert.ok(rankSignals({rt}).filter(s=>s.key.startsWith('rank-page:')).every(s=>s.growth?.kind==='rank-drop'&&s.actionable===false));
});
test('an uncertain result is flagged for Data health and retried on purpose only when asked',async()=>{
 const {t,rows,runs}=harness(()=>8);
 await t.add('1',{keywords:[{keyword:'crm',locationCode:2840,language:'en'}]});
 t.d4s.run=async(_id,_kind,v)=>{runs.push(v);return {id:1,status:'unknown',errorCode:'结果不确定：可能已计费'};};
 await t.check('1',{all:true});
 assert.equal(rows['rank-tracking:1'].lastRun.uncertain,true);assert.equal(runs.at(-1).retryUncertain,false);
 await t.check('1',{all:true,retryUncertain:true});assert.equal(runs.at(-1).retryUncertain,true);
});
