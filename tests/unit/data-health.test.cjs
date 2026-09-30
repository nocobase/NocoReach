const test=require('node:test'),assert=require('node:assert/strict');
const {due,nextAt,record}=require('../../plugins/connections/server/sync-policy');
const {DataHealth,assess}=require('../../plugins/connections/server/data-health');
const H=3600000,now=Date.parse('2026-10-02T10:00:00Z');
test('schedule: one success per day, backoff 1h/3h/6h after failures',()=>{
 assert.equal(due(null,now),true);
 assert.equal(due({at:'2026-10-02T01:00:00Z',ok:true},now),false);assert.equal(due({at:'2026-10-01T23:00:00Z',ok:true},now),true);
 assert.equal(due({at:new Date(now-30*60000).toISOString(),ok:false,attempts:1},now),false);assert.equal(due({at:new Date(now-61*60000).toISOString(),ok:false,attempts:1},now),true);
 assert.equal(due({at:new Date(now-2*H).toISOString(),ok:false,attempts:2},now),false);assert.equal(due({at:new Date(now-7*H).toISOString(),ok:false,attempts:9},now),true);
 assert.equal(nextAt({at:'2026-10-02T01:00:00Z',ok:true},now),'2026-10-03T00:00:00.000Z');
});
test('record keeps the last good time across failures and counts attempts',()=>{
 const ok=record(null,{at:'t1',ok:true,errors:[]});assert.deepEqual([ok.attempts,ok.lastSuccessAt],[0,'t1']);
 const f1=record(ok,{at:'t2',ok:false,errors:['x']}),f2=record(f1,{at:'t3',ok:false,errors:['y']});assert.deepEqual([f1.attempts,f2.attempts,f2.lastSuccessAt],[1,2,'t1']);
});
test('assess: pending, healthy, partial warning, recent failure warning, failing after a day, stale success',()=>{
 assert.equal(assess({attempt:null,now}).state,'pending');
 assert.equal(assess({lastSuccessAt:new Date(now-H).toISOString(),attempt:{at:new Date(now-H).toISOString(),ok:true},now}).state,'healthy');
 assert.match(assess({lastSuccessAt:new Date(now-H).toISOString(),attempt:{at:'t',ok:true,errors:['Traffic：token 无效']},now}).message,/部分数据未更新/);
 assert.equal(assess({lastSuccessAt:new Date(now-5*H).toISOString(),attempt:{at:'t',ok:false,errors:['429']},now}).state,'warning');
 const f=assess({lastSuccessAt:new Date(now-30*H).toISOString(),attempt:{at:'t',ok:false,errors:['GitHub 返回 500']},now});assert.equal(f.state,'failing');assert.match(f.message,/超过 1 天.*500/);
 assert.equal(assess({lastSuccessAt:null,attempt:{at:'t',ok:false,errors:[]},now}).state,'failing');
 assert.equal(assess({lastSuccessAt:new Date(now-50*H).toISOString(),attempt:{at:new Date(now-50*H).toISOString(),ok:true},now}).state,'warning');
});
test('list collects connected sources, sorts failures first, and offers the right retry action',async()=>{
 const t=new Date(Date.now()-H).toISOString(),old=new Date(Date.now()-30*H).toISOString();
 const plugin={env:()=>'',link:async()=>null,
  siteContent:{state:async()=>({sites:[{origin:'https://ex.com',confirmedAt:t}],pages:[{url:'a',fetchedAt:t},{url:'b'}]})},
  github:{state:async()=>({repo:'org/repo',status:'active',daily:{'2026-10-01':{stars:1}},lastSync:{at:t,ok:true,errors:[],lastSuccessAt:t},token:{error:'token 无效或已过期'}})},
  community:{syncing:null,state:async()=>({origin:'https://forum.ex.com',title:'Forum',status:'active',topics:{},lastSync:{at:t,ok:false,attempts:3,errors:['主题：429'],lastSuccessAt:old}})}};
 const r=await new DataHealth(plugin).list('1');
 assert.deepEqual(r.items.map(i=>i.id),['github-traffic','discourse','site','github']);
 assert.equal(r.items[0].state,'failing');assert.equal(r.items[1].state,'failing');assert.deepEqual(r.items[1].retry,{resource:'nrCommunity',action:'sync',body:{}});
 assert.equal(r.items.find(i=>i.id==='site').note,'2 个页面，已读取详情 1 个');
});
