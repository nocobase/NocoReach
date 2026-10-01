'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SyncService}=require('../../plugins/connections/server/sync-service');

function setup(){
 const parts=[],calls={find:0};const base={id:1,name:'Demo',analyticsPropertyId:'123',searchConsoleProperty:'sc-domain:example.com'};let project={...base,domains:['example.com']};
 const add=(source,grain,date,payload,updatedAt='2026-09-30T00:00:00Z')=>parts.push({id:parts.length+1,projectId:1,source,grain,date,resource:source==='ga4'?'123':'sc-domain:example.com',payload,updatedAt});
 for(const date of ['2026-09-25','2026-09-26','2026-09-27']){add('ga4','overview',date,[{date,views:10,sessions:5,conversions:1}]);add('gsc','overview',date,[{date,clicks:3,impressions:90}]);}
 const links={ga4PropertyId:'123',gscSiteUrl:'sc-domain:example.com',status:'active'};
 const repo={
  find:async({offset=0,limit=200})=>{calls.find++;await new Promise(r=>setTimeout(r,5));return parts.slice(offset,offset+limit).map(p=>({toJSON:()=>({...p,payload:p.payload.map(r=>({...r}))})}));},
  count:async()=>parts.length,
  findOne:async()=>{const p=[...parts].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];return p&&{get:k=>p[k]};}
 };
 const plugin={link:async()=>({id:1,get:k=>links[k]}),env:()=>'secret',project:async()=>project,db:{getRepository:()=>repo}};
 return {sync:new SyncService(plugin),parts,calls,add,base,setProject:p=>{project=p;}};
}

test('snapshots are reused until stored data changes',async()=>{
 const {sync,calls,add}=setup();
 const first=await sync.snapshots('1');assert.equal(calls.find,1);
 assert.equal(first.find(s=>s.key==='project').payload.end,'2026-09-27');
 assert.equal(await sync.snapshots('1'),first);assert.equal(calls.find,1);
 add('ga4','overview','2026-09-28',[{date:'2026-09-28',views:12,sessions:6,conversions:0}],'2026-10-01T00:00:00Z');add('gsc','overview','2026-09-28',[{date:'2026-09-28',clicks:4,impressions:95}],'2026-10-01T00:00:00Z');
 const next=await sync.snapshots('1');assert.equal(calls.find,2);assert.notEqual(next,first);
 assert.equal(next.find(s=>s.key==='project').payload.end,'2026-09-28');
});

test('concurrent requests share one build',async()=>{
 const {sync,calls}=setup();
 const [a,b,c]=await Promise.all([sync.snapshots('1'),sync.snapshots('1'),sync.snapshots('1')]);
 assert.equal(calls.find,1);assert.equal(a,b);assert.equal(b,c);
});

test('project changes rebuild and cached results cannot be mutated',async()=>{
 const {sync,calls,base,setProject}=setup();
 const first=await sync.snapshots('1');
 assert.throws(()=>first.find(s=>s.key==='history-web').payload.push({}),TypeError);
 assert.throws(()=>{first.find(s=>s.key==='project').payload.end='x';},TypeError);
 setProject({...base,domains:['example.com','docs.example.com']});
 const next=await sync.snapshots('1');assert.equal(calls.find,2);
 assert.deepEqual(next.find(s=>s.key==='project').payload.domains,['example.com','docs.example.com']);
});

test('page callers only read the shared cached snapshots',async()=>{
 const {sync,add}=setup();
 for(const date of ['2026-09-25','2026-09-26','2026-09-27']){
  add('ga4','source',date,[{source:'github.com',medium:'referral',views:40,sessions:20,conversions:2}]);
  add('ga4','page',date,[{page:'/docs/a',views:300,conversions:1},{page:'/pricing',views:900,conversions:0}]);
  add('gsc','query_page',date,[{keyword:'demo',page:'https://example.com/docs/a',clicks:2,impressions:900,position:12}]);
 }
 const snaps=await sync.snapshots('1');const get=k=>snaps.find(s=>s.key===k)?.payload;
 assert.ok(Object.isFrozen(get('queries-28')[0]));
 const {searchSignals,webSignals}=require('../../plugins/connections/server/signals');
 searchSignals({queries:get('queries-28'),history:get('history-search'),end:'2026-09-27'});
 webSignals({pages:get('pages-28'),history:get('history-web'),referral:get('history-github-referral'),end:'2026-09-27'});
 const {DataViews}=require('../../plugins/connections/server/data-views');
 const view=await new DataViews({sync}).overview(1,{range:'7'});assert.ok(view.cards.length>=2);
 const {SiteContent}=require('../../plugins/connections/server/site-content');
 const payload={sites:[{origin:'https://example.com',confirmedAt:'t'}],pages:[{url:'https://example.com/docs/a',type:'docs',origin:'https://example.com'}]};
 const list=await new SiteContent({db:{getRepository:()=>({findOne:async()=>({get:()=>payload})})},sync}).list('1','28');
 assert.equal(list.pages[0].views,900);
});
