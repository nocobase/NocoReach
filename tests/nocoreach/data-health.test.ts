// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/data-health.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { due, nextAt, record } from '../../server/nocoreach/sync-policy.js';
import { DataHealth, assess } from '../../server/nocoreach/data-health.js';
import * as __site_content from '../../server/nocoreach/site-content.js';
import * as __sync_policy from '../../server/nocoreach/sync-policy.js';
import * as __data_health from '../../server/nocoreach/data-health.js';
import * as __policy from '../../server/nocoreach/policy.js';
const test=__vitest_test;
const H=3600000,now=Date.parse('2026-10-02T10:00:00Z');
test('schedule: one success per day; retries after 15 min, then 1h/3h/6h',()=>{
 assert.equal(due(null,now),true);
 assert.equal(due({at:'2026-10-02T01:00:00Z',ok:true},now),false);assert.equal(due({at:'2026-10-01T23:00:00Z',ok:true},now),true);
 assert.equal(due({at:new Date(now-10*60000).toISOString(),ok:false,attempts:1},now),false);assert.equal(due({at:new Date(now-16*60000).toISOString(),ok:false,attempts:1},now),true);
 assert.equal(due({at:new Date(now-30*60000).toISOString(),ok:false,attempts:2},now),false);assert.equal(due({at:new Date(now-61*60000).toISOString(),ok:false,attempts:2},now),true);
 assert.equal(due({at:new Date(now-2*H).toISOString(),ok:false,attempts:3},now),false);assert.equal(due({at:new Date(now-7*H).toISOString(),ok:false,attempts:9},now),true);
 assert.equal(nextAt({at:'2026-10-02T01:00:00Z',ok:true},now),'2026-10-03T00:00:00.000Z');assert.equal(nextAt({at:'2026-10-02T01:00:00Z',ok:false,attempts:1},now),'2026-10-02T01:15:00.000Z');
});
test('network failures are said plainly; other errors are kept as they are',async()=>{
 const f=record(null,{at:'t',ok:false,errors:['分类：queryA ETIMEOUT forum.example.com','主题：queryA ETIMEOUT forum.example.com','仓库：fetch failed','Traffic：需要 push 权限']});
 assert.deepEqual(f.errors,['分类：网络不可用，稍后会自动重试','主题：网络不可用，稍后会自动重试','仓库：网络不可用，稍后会自动重试','Traffic：需要 push 权限']);
 const {SiteContent}=__site_content;
 const offline=new SiteContent({},async()=>{throw Object.assign(new Error('getaddrinfo ENOTFOUND www.example.com'),{code:'ENOTFOUND'});});
 await assert.rejects(offline.discover('https://www.example.com'),e=>/连不上网站：网络不可用/.test(e.message)&&!/sitemap/.test(e.message));
 const missing=new SiteContent({},async()=>{throw Object.assign(new Error('HTTP 404'),{status:404});});
 await assert.rejects(missing.discover('https://www.example.com'),e=>/没有找到 sitemap/.test(e.message));
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

test('records from before lastSuccessAt existed still show their last successful sync',async()=>{
 const {lastSuccess}=__sync_policy;
 assert.equal(lastSuccess({at:'2026-09-30T16:33:51Z',ok:true,errors:[]}),'2026-09-30T16:33:51Z');assert.equal(lastSuccess({at:'t',ok:false}),null);assert.equal(lastSuccess(null),null);
 assert.equal(record({at:'2026-09-30T16:00:00Z',ok:true},{at:'t2',ok:false,errors:['x']}).lastSuccessAt,'2026-09-30T16:00:00Z');
 const legacy={at:new Date(Date.now()-3600000).toISOString(),ok:true,errors:[]};
 const plugin={env:()=>'',link:async()=>null,github:{state:async()=>({repo:'org/repo',status:'active',daily:{},lastSync:legacy})},community:{syncing:null,state:async()=>({origin:'https://f.ex.com',status:'active',topics:{},lastSync:legacy})}};
 const r=await new DataHealth(plugin).list('1');for(const i of r.items){assert.equal(i.lastSuccessAt,legacy.at,i.id);assert.equal(i.state,'healthy',i.id);}
});

test('menu: which sources are connected, each from its saved state; unreadable or stopped ones count as not connected',async()=>{
 const {DataHealth}=__data_health;const {secretKey}=__policy;
 const p={link:async()=>({get:k=>({ga4PropertyId:'p1',gscSiteUrl:'',status:'active'})[k]}),env:k=>k===secretKey('1')?'refresh':'',
  siteContent:{state:async()=>({sites:[{origin:'https://x'}]})},github:{state:async()=>({repo:'o/r',status:'disconnected'})},packages:{state:async()=>{throw new Error('down');}},
  community:{state:async()=>({origin:'https://f',status:'active'})},hackernews:{state:async()=>null},reddit:{state:async()=>({terms:['x'],status:'active'})},
  xSource:{state:async()=>({terms:['x'],status:'disconnected'})},chat:{state:async()=>({discord:{status:'active'},slack:{status:'disconnected'}})},trends:{state:async()=>({terms:['a']})},aiSearch:{d4s:{config:()=>({verifiedAt:'t'})}}};
 assert.deepEqual(await new DataHealth(p).connected('1'),{ga4:true,gsc:false,site:true,github:false,packages:false,discourse:true,hackernews:false,reddit:true,x:false,discord:true,slack:false,trends:true,dataforseo:true});
 const none=await new DataHealth({link:async()=>null,env:()=>''}).connected('1');assert.ok(Object.values(none).every(v=>v===false));
});
