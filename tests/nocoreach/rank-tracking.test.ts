// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/rank-tracking.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { RankTracking, specification, result, sitePosition } from '../../server/nocoreach/rank-tracking.js';
import { rankSignals } from '../../server/nocoreach/signals.js';
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
 const t=new RankTracking(p);t.d4s={run:async(_id,kind,v)=>{runs.push(v);const pos=fetchPos(v.target);if(pos==='budget')throw new Error('本月 DataForSEO 预算已用完');return {id:++id,status:'completed',completedAt:new Date().toISOString(),result:{items:pos?[{position:pos,domain:'example.com',url:'https://example.com/'+v.target}]:[]}};}};return {t,rows,runs};}
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
test('rank signals: drop of 5+, lost from the top 20, entered the top 10',()=>{
 const c=(at,position)=>({at,position,url:'https://x/'+position});const rt={keywords:[{id:'a',keyword:'a'},{id:'b',keyword:'b'},{id:'c',keyword:'c'},{id:'d',keyword:'d'}],checks:{a:[c('2026-09-20',4),c('2026-09-27',11)],b:[c('2026-09-20',15),c('2026-09-27',null)],c:[c('2026-09-20',14),c('2026-09-27',6)],d:[c('2026-09-20',5),c('2026-09-27',6)]}};
 assert.deepEqual(rankSignals({rt}).map(s=>s.key.split(':')[0]+':'+s.key.split(':')[1]),['rank-drop:a','rank-lost:b','rank-top10:c']);
});
