const test=require('node:test'),assert=require('node:assert/strict');
const {KeywordService}=require('../../plugins/connections/server/keyword-service');
// In-memory repositories with the filters the service uses (equality and $in).
function repo(){const rows=[];let id=100;const match=(r,f={})=>Object.entries(f).every(([k,v])=>v&&typeof v==='object'&&'$in' in v?v.$in.map(String).includes(String(r[k])):String(r[k])===String(v));
 const wrap=r=>r&&{...r,get:k=>r[k],toJSON:()=>({...r})};
 return {rows,findOne:async o=>wrap(o.filterByTk!==undefined?rows.find(r=>r.id===o.filterByTk):rows.find(r=>match(r,o.filter))),find:async o=>rows.filter(r=>match(r,o.filter)).map(wrap),count:async o=>rows.filter(r=>match(r,o.filter)).length,
  create:async o=>{const r={id:++id,createdAt:new Date().toISOString(),...o.values};rows.push(r);return wrap(r);},update:async o=>Object.assign(rows.find(r=>r.id===o.filterByTk),o.values),
  destroy:async o=>{const gone=rows.filter(r=>match(r,o.filter));for(const g of gone)rows.splice(rows.indexOf(g),1);return gone.length;}};}
function service(){const repos={nrKeywordRuns:repo(),nrKeywordCandidates:repo(),nrSnapshots:repo()};
 repos.nrKeywordRuns.rows.push({id:7,projectId:'1',status:'completed',spec:{kind:'keywords',view:'related',locationCode:2840,language:'en'},completedAt:'2026-10-01T00:00:00Z',createdAt:'2026-10-01T00:00:00Z',result:{items:[{id:'a',keyword:'open source crm',volume:8100,difficulty:42},{id:'b',keyword:'best crm',volume:900},{id:'c',keyword:'',volume:1}]}});
 const p={env:()=>null,db:{getRepository:n=>repos[n],sequelize:{transaction:fn=>fn({}),query:async()=>{}}}};return {s:new KeywordService(p),repos};}
test('saving research rows keeps market data once per keyword and market',async()=>{
 const {s}=service();assert.deepEqual(await s.saveFromRun('1',{runId:7,itemIds:['a','b','c']}),{saved:2,skipped:0});
 assert.deepEqual(await s.saveFromRun('1',{runId:7,itemIds:['a']}),{saved:0,skipped:1});
 const {items}=await s.saved('1');const crm=items.find(i=>i.keyword==='open source crm');
 assert.equal(crm.source,'dataforseo');assert.deepEqual(crm.market,{locationCode:2840,language:'en'});assert.equal(crm.metrics.volume,8100);assert.equal(crm.metrics.cpc,null);
 await assert.rejects(s.saveFromRun('1',{runId:7,itemIds:['zzz']}),/没有可以保存/);
});
test('queries saved from 搜索表现 have no market; saving the keyword from research later fills it in and keeps tags',async()=>{
 const {s,repos}=service();assert.deepEqual(await s.saveQueries('1',{keywords:['Open Source CRM','  ','open source crm']}),{saved:1,skipped:0});
 let {items}=await s.saved('1');assert.equal(items[0].source,'gsc');assert.equal(items[0].market,null);assert.equal(items[0].metrics,null);
 await s.tagSaved('1',{ids:[items[0].id],add:['选题']});
 await s.saveFromRun('1',{runId:7,itemIds:['a']});({items}=await s.saved('1'));
 assert.equal(items.length,1);assert.equal(items[0].source,'dataforseo');assert.equal(items[0].metrics.volume,8100);assert.equal(items[0].tagIds.length,1);assert.equal(repos.nrKeywordCandidates.rows.length,1);
});
test('tags: add by name (created once, case-insensitive), remove, rename, recolor and delete everywhere',async()=>{
 const {s}=service();await s.saveFromRun('1',{runId:7,itemIds:['a','b']});let {items}=await s.saved('1');const ids=items.map(i=>i.id);
 let r=await s.tagSaved('1',{ids,add:['选题','对比']});assert.equal(r.tags.length,2);
 r=await s.tagSaved('1',{ids:[ids[0]],add:['选题']});assert.equal(r.tags.length,2);
 const pick=r.tags.find(t=>t.name==='对比');await s.tagSaved('1',{ids:[ids[0]],remove:[pick.id]});
 ({items}=await s.saved('1'));assert.equal(items.find(i=>i.id===ids[0]).tagIds.length,1);assert.equal(items.find(i=>i.id===ids[1]).tagIds.length,2);
 await assert.rejects(s.updateTag('1',{tagId:pick.id,name:'选题'}),/同名/);
 r=await s.updateTag('1',{tagId:pick.id,name:'竞品对比',color:'red'});assert.deepEqual(r.tags.find(t=>t.id===pick.id),{id:pick.id,name:'竞品对比',color:'red'});
 await assert.rejects(s.updateTag('1',{tagId:pick.id,color:'pink'}),/颜色/);
 await s.deleteTag('1',{tagId:pick.id});({items}=await s.saved('1'));assert.ok(items.every(i=>!i.tagIds.includes(pick.id)));
});
test('removing saved keywords only touches this project',async()=>{
 const {s,repos}=service();await s.saveFromRun('1',{runId:7,itemIds:['a','b']});repos.nrKeywordCandidates.rows.push({id:1,projectId:'2',keyword:'x',payload:{}});
 const ids=repos.nrKeywordCandidates.rows.map(r=>String(r.id));assert.deepEqual(await s.removeSaved('1',{ids}),{removed:2});assert.equal(repos.nrKeywordCandidates.rows.length,1);
});
test('recent research lists runs without their results',async()=>{
 const {s}=service();const [r]=await s.list('1');assert.equal(r.count,3);assert.equal(r.result,undefined);assert.equal((await s.getRun('1',{runId:7})).result.items.length,3);
});
