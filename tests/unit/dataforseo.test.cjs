const test=require('node:test'),assert=require('node:assert/strict');
const {DataForSeo,REUSE_MS}=require('../../plugins/connections/server/dataforseo');
const DAY=86400000;
// In-memory nrKeywordRuns with just the filters the service uses.
function memory(){const rows=[];let id=0;const match=(r,f={})=>Object.entries(f).every(([k,v])=>v&&typeof v==='object'?('$in' in v?v.$in.includes(r[k]):'$gte' in v?r[k]>=v.$gte:false):r[k]===v);
 const wrap=r=>r&&{...r,get:k=>r[k],toJSON:()=>({...r})};
 return {rows,repo:{findOne:async o=>wrap(o.filterByTk!==undefined?rows.find(r=>r.id===o.filterByTk):rows.filter(r=>match(r,o.filter)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]),find:async o=>rows.filter(r=>match(r,o.filter)).map(wrap),
  create:async o=>{const r={id:++id,createdAt:new Date().toISOString(),...o.values};rows.push(r);return wrap(r);},update:async o=>Object.assign(rows.find(r=>r.id===o.filterByTk),o.values)}};}
function service({budget=5,fetchImpl}={}){const m=memory();const env={NOREACH_DATAFORSEO_1:JSON.stringify({login:'a',password:'b',budget,verifiedAt:'t'})};
 const p={env:k=>env[k],variable:async(k,v)=>{env[k]=v;},app:{logger:{warn(){}}},db:{getRepository:()=>m.repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}};
 const kinds={demo:{specification:v=>({kind:'demo',path:'demo/live',request:{target:v.target},estimatedUsd:0.01,reservationUsd:0.05}),result:raw=>({status:'completed',result:{items:raw.tasks[0].result},costUsd:raw.cost})}};
 global.fetch=fetchImpl||(async()=>({ok:true,json:async()=>({status_code:20000,cost:0.012,tasks:[{status_code:20000,result:[1,2]}]})}));
 return {d:new DataForSeo(p,kinds),m};}
const ask=async(d,v={})=>{const pv=await d.preview('1','demo',{target:'crm'});return d.run('1','demo',{target:'crm',queryHash:pv.queryHash,requestKey:'request-'+Math.random().toString(36).slice(2),confirmCost:true,maxCostUsd:0.05,...v});};
test('a paid query runs when asked (no cost prompt), once per request key, and records the cost',async()=>{
 let calls=0;const {d}=service({fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({status_code:20000,cost:0.012,tasks:[{status_code:20000,result:[1]}]})};}});
 const r=await d.run('1','demo',{target:'crm',requestKey:'request-abcdefgh'});assert.equal(r.status,'completed');assert.equal(r.costUsd,0.012);assert.equal(calls,1);
 assert.equal((await d.run('1','demo',{target:'crm',requestKey:'request-abcdefgh',forceRefresh:true})).id,r.id);assert.equal(calls,1);
 await assert.rejects(d.run('1','demo',{target:'crm',requestKey:'request-x1234567',queryHash:'stale'}),/重新查询/);
});
test('spending: this month and in total, reservations count while the cost is unknown',async()=>{
 const {d,m}=service();const now=new Date().toISOString(),old='2020-01-05T00:00:00.000Z';
 m.rows.push({id:1,projectId:'1',status:'completed',costUsd:0.02,reservedUsd:0,createdAt:now},{id:2,projectId:'1',status:'unknown',costUsd:null,reservedUsd:0.05,createdAt:now},{id:3,projectId:'1',status:'completed',costUsd:1,reservedUsd:0,createdAt:old});
 assert.deepEqual(await d.spend('1'),{monthUsd:0.07,totalUsd:1.07,budgetUsd:5,monthRuns:2,totalRuns:3,uncertain:1});
});
test('the same query within 30 days reuses the saved result without a new charge; older ones are offered again',async()=>{
 let calls=0;const {d,m}=service({fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({status_code:20000,cost:0.01,tasks:[{status_code:20000,result:[1]}]})};}});
 const first=await ask(d);const again=await ask(d);assert.equal(again.id,first.id);assert.equal(calls,1);
 assert.equal((await d.preview('1','demo',{target:'crm'})).existing.id,first.id);
 m.rows[0].createdAt=new Date(Date.now()-REUSE_MS-DAY).toISOString();assert.equal((await d.preview('1','demo',{target:'crm'})).existing,null);
 await ask(d);assert.equal(calls,2);
});
test('an uncertain outcome is kept as unknown and blocks repeating the same paid query',async()=>{
 let calls=0;const {d}=service({fetchImpl:async()=>{calls++;throw Object.assign(new Error('timeout'),{name:'TimeoutError'});}});
 const r=await ask(d);assert.equal(r.status,'unknown');assert.match(r.errorCode,/不确定/);
 const again=await ask(d);assert.equal(again.id,r.id);assert.equal(calls,1);
});
test('the monthly budget covers recorded costs and open reservations',async()=>{
 const {d,m}=service({budget:0.06});m.rows.push({id:99,projectId:'1',queryHash:'x',status:'completed',costUsd:0.02,reservedUsd:0,createdAt:new Date().toISOString()});
 await assert.rejects(ask(d),/预算已用完（\$0\.02 \/ \$0\.06）/);
});
test('specifications must belong to the requested kind',async()=>{
 const {d}=service();await assert.rejects(d.preview('1','other',{}),/不支持/);
});
