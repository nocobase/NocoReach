// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/sync-service.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { SyncService } from '../../server/nocoreach/sync-service.js';
import * as __signals from '../../server/nocoreach/signals.js';
import * as __data_views from '../../server/nocoreach/data-views.js';
import * as __site_content from '../../server/nocoreach/site-content.js';
import * as __google_sync from '../../server/nocoreach/google-sync.js';
import * as __report_cache from '../../server/nocoreach/google-report-cache.js';
const test=__vitest_test;

function setup(){
 const parts=[],calls={find:0};const base={id:1,name:'Demo',analyticsPropertyId:'123',searchConsoleProperty:'sc-domain:example.com'};let project={...base,domains:['example.com']};
 const add=(source,grain,date,payload,updatedAt='2026-09-30T00:00:00Z')=>parts.push({id:parts.length+1,projectId:1,source,grain,date,resource:source==='ga4'?'123':'sc-domain:example.com',payload,updatedAt});
 for(const date of ['2026-09-25','2026-09-26','2026-09-27']){add('ga4','overview',date,[{date,views:10,sessions:5,conversions:1}]);add('gsc','overview',date,[{date,clicks:3,impressions:90}]);}
 const links={ga4PropertyId:'123',gscSiteUrl:'sc-domain:example.com',status:'active'};
 const repo={
  // A build lists the project's ids once, counted in calls.find, then reads the linked days by key.
  find:async({filter={},fields})=>{const keys=filter.id?.$in;if(!keys&&filter.grain!=='overview')calls.find++;await new Promise(r=>setTimeout(r,5));return parts.filter(p=>!keys||keys.includes(p.id)).map(p=>({toJSON:()=>fields?Object.fromEntries(fields.map(k=>[k,p[k]])):{...p,payload:p.payload.map(r=>({...r}))}}));},
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

test('a project over the size limit is refused before any stored day is read',async()=>{
 const {sync,parts,add}=setup(),repo=sync.p.db.getRepository('nrSyncPartitions'),find=repo.find,reads=[];
 repo.find=async o=>{reads.push(o);return find(o);};
 while(parts.length<12201)add('gsc','query_page','2026-09-01',[]);
 await assert.rejects(sync.snapshots('1'),e=>e.status===409);
 // The key's overview dates, then the listing: no stored day is read by key.
 assert.deepEqual(reads.map(o=>o.fields),[['source','resource','grain','date'],['id','source','resource','grain','date']]);
});

function tickFixture(opened={lately:false}){
 const {sync}=setup();sync.step=async()=>false;sync.snapshots=async()=>[];sync.refreshFresh=async()=>{};
 sync.repo=()=>({find:async()=>[{get:k=>k==='projectId'?'1':k==='nextSyncAt'?'2999-01-01T00:00:00Z':null}],findOne:async()=>null});
 const website=vi.fn(async()=>({complete:true,missing:[]})),warm=vi.fn(async()=>({partial:false})),scopes=[];
 // How the tick read Traffic: ahead (a held report answers whatever its age) or waiting for a new one.
 // Opened in the last three days; in the last one only when `opened.lately`.
 const recentlyRead=vi.fn(async(_id,_at,within)=>within?opened.lately:true);
 sync.p.dataViews={search:async()=>({}),website:(...a)=>{scopes.push(__report_cache.readsAhead()?'ahead':__report_cache.readsFresh()?'fresh':'saved');return website(...a);},warm,recentlyRead};
 return {sync,website,warm,scopes};
}
const HOURS=3600000;
test('tick: a breakdown Google refuses in part is read ahead again after six hours, not every 15 minutes',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const {sync,warm}=tickFixture();warm.mockResolvedValue({partial:true});
  await sync.tick();assert.equal(warm.mock.calls.length,1);
  vi.setSystemTime(Date.now()+6*HOURS-1);await sync.tick();assert.equal(warm.mock.calls.length,1,'not through the 15-minute check');
  vi.setSystemTime(Date.now()+1);await sync.tick();assert.equal(warm.mock.calls.length,2);
  warm.mockResolvedValue({partial:false});
  vi.setSystemTime(Date.now()+6*HOURS);await sync.tick();assert.equal(warm.mock.calls.length,3);
  vi.setSystemTime(Date.now()+15*60000);await sync.tick();assert.equal(warm.mock.calls.length,4,'a whole report goes back to every 15 minutes');
 }finally{vi.useRealTimers();}
});
test('tick: a Traffic report GA4 refuses in part waits six hours, a whole one is asked for each tick, a failure waits 15 minutes',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const {sync,website,scopes}=tickFixture();
  await sync.tick();await sync.tick();assert.equal(website.mock.calls.length,2,'a whole report answers from memory, and a moved window is noticed at once');
  website.mockResolvedValue({complete:false,missing:['city']});
  await sync.tick();await sync.tick();assert.equal(website.mock.calls.length,3);
  vi.setSystemTime(Date.now()+6*HOURS-1);await sync.tick();assert.equal(website.mock.calls.length,3,'not each time its five minutes end');
  vi.setSystemTime(Date.now()+1);website.mockResolvedValue({complete:true,missing:['city']});await sync.tick();assert.equal(website.mock.calls.length,4,'a table left out counts too');
  await sync.tick();assert.equal(website.mock.calls.length,4);
  vi.setSystemTime(Date.now()+6*HOURS);website.mockRejectedValue(new Error('quota'));await sync.tick();assert.equal(website.mock.calls.length,5);
  vi.setSystemTime(Date.now()+15*60000-1);await sync.tick();assert.equal(website.mock.calls.length,5);
  vi.setSystemTime(Date.now()+1);await sync.tick();assert.equal(website.mock.calls.length,6);
  // The retry of a part refused failed: 15 minutes later it is read again, not taken back as the refused report.
  website.mockResolvedValue({complete:true,missing:[]});vi.setSystemTime(Date.now()+15*60000);await sync.tick();assert.equal(website.mock.calls.length,7);
  await sync.tick();assert.equal(website.mock.calls.length,8);
  // A whole report's read that fails waits 15 minutes and is read ahead again.
  website.mockRejectedValue(new Error('quota'));await sync.tick();vi.setSystemTime(Date.now()+15*60000);await sync.tick();assert.equal(website.mock.calls.length,10);
  // A whole report is read ahead, so a held one answers however old; a part refused is read again after six hours.
  assert.deepEqual(scopes,['ahead','ahead','ahead','fresh','fresh','fresh','fresh','ahead','ahead','ahead']);
 }finally{vi.useRealTimers();}
});
test('tick: Traffic of a project opened in the last day waits for a new report, so the night\'s one is read again in the morning',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const opened={lately:true},{sync,website,scopes}=tickFixture(opened);
  await sync.tick();opened.lately=false;await sync.tick();
  assert.equal(website.mock.calls.length,2);assert.deepEqual(scopes,['fresh','ahead'],'opened in the last day, then only in the last three');
 }finally{vi.useRealTimers();}
});
test('tick: Traffic\'s other tables are read for a project opened in the last day, not in the night, waiting like the figures after a refusal or a failure',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const opened={lately:true},{sync,website}=tickFixture(opened);
  let day=false;const tables=vi.fn(async()=>({complete:true,missing:[]})),scopes=[];
  Object.assign(sync.p.dataViews,{websiteDayRead:vi.fn(async()=>{if(day==='fails')throw new Error('link');return day;}),websiteTables:(...a)=>{scopes.push(__report_cache.readsFresh()?'fresh':'other');return tables(...a);}});
  await sync.tick();assert.equal(website.mock.calls.length,1);assert.equal(tables.mock.calls.length,0,'a read in the night would be read again in the morning');
  day='fails';await sync.tick();assert.equal(tables.mock.calls.length,0,'nor when the hour cannot be told');
  day=true;await sync.tick();await sync.tick();assert.equal(tables.mock.calls.length,2,'the report held answers, and a moved window is noticed at once');
  assert.deepEqual(tables.mock.calls[0],['1',{range:'28'}]);
  tables.mockResolvedValue({complete:true,missing:['city']});await sync.tick();await sync.tick();assert.equal(tables.mock.calls.length,3);
  vi.setSystemTime(Date.now()+6*HOURS-1);await sync.tick();assert.equal(tables.mock.calls.length,3,'a table left out waits six hours');
  vi.setSystemTime(Date.now()+1);tables.mockRejectedValue(new Error('quota'));await sync.tick();assert.equal(tables.mock.calls.length,4);
  vi.setSystemTime(Date.now()+15*60000-1);await sync.tick();assert.equal(tables.mock.calls.length,4,'a failure waits 15 minutes');
  vi.setSystemTime(Date.now()+1);tables.mockResolvedValue({complete:true,missing:[]});await sync.tick();assert.equal(tables.mock.calls.length,5);
  // While the figures' last read failed, the tables wait with it rather than meet the same failure.
  website.mockRejectedValueOnce(new Error('quota'));await sync.tick();assert.equal(tables.mock.calls.length,5,'not after the figures failed');
  vi.setSystemTime(Date.now()+15*60000-1);await sync.tick();assert.equal(tables.mock.calls.length,5,'nor while the figures wait');
  vi.setSystemTime(Date.now()+1);await sync.tick();assert.equal(tables.mock.calls.length,6,'read once the figures are again');
  assert.ok(scopes.every(s=>s==='fresh'),'it waits for a new report rather than taking a copy');
  assert.ok(sync.p.dataViews.websiteDayRead.mock.calls.every(c=>c.length===2),'with the property of the link the tick holds');
  opened.lately=false;await sync.tick();assert.equal(tables.mock.calls.length,6,'only for a project opened in the last day');
  // Every tick but the one inside the figures' 15-minute wait after their failure.
  assert.equal(website.mock.calls.length,13,'the figures are read as before');
 }finally{vi.useRealTimers();}
});
test('tick: readies Search performance at most every 15 minutes even after a failure, and waits for new reports',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const {sync}=setup();sync.step=async()=>false;sync.snapshots=async()=>[];sync.refreshFresh=async()=>{};
  sync.repo=()=>({find:async()=>[{get:k=>k==='projectId'?'1':k==='nextSyncAt'?'2999-01-01T00:00:00Z':null}],findOne:async()=>null});
  const waited=[],warm=vi.fn(async()=>{waited.push(await __report_cache.waitForFresh(async()=>'scope'));throw new Error('quota');});
  sync.p.dataViews={search:async()=>({}),website:async()=>({}),warm};
  await sync.tick();await sync.tick();assert.equal(warm.mock.calls.length,1,'a failure does not repeat every 15 seconds');assert.deepEqual(waited,['scope']);
  vi.setSystemTime(Date.now()+15*60000);await sync.tick();assert.equal(warm.mock.calls.length,2);
 }finally{vi.useRealTimers();}
});

test('tick: a project nobody opened lately has only Traffic read ahead, every six days and a few a tick, without counting as opened',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const {sync}=setup();sync.step=async()=>false;sync.snapshots=async()=>[];sync.refreshFresh=async()=>{};
  const ids=['1','2','3','4','5'];
  sync.repo=()=>({find:async()=>ids.map(id=>({get:k=>k==='projectId'?id:k==='nextSyncAt'?'2999-01-01T00:00:00Z':k==='authorizedAt'?'2026-01-01T00:00:00Z':null})),findOne:async()=>null});
  const opened=new Set(),search=vi.fn(async()=>({})),website=vi.fn(async()=>({complete:true,missing:[]})),warm=vi.fn(async()=>({partial:false})),noteRead=vi.fn(),recentlyRead=vi.fn(async id=>opened.has(id));
  sync.p.dataViews={search,website,warm,recentlyRead,noteRead};
  const readFor=id=>website.mock.calls.filter(c=>c[0]===id).length;
  await sync.tick();
  assert.equal(search.mock.calls.length,5,'every summary, from the synced days');assert.equal(website.mock.calls.length,3,'three idle projects a tick');assert.equal(warm.mock.calls.length,0);
  assert.deepEqual(recentlyRead.mock.calls[0],['1','2026-01-01T00:00:00Z']);
  await sync.tick();assert.equal(website.mock.calls.length,5);
  await sync.tick();assert.equal(website.mock.calls.length,5,'not again within six days');
  assert.equal(noteRead.mock.calls.length,0,'reading ahead does not count as opening');
  // Someone opens project 2: it is read ahead as an opened project at once.
  opened.add('2');await sync.tick();assert.equal(readFor('2'),2);assert.equal(warm.mock.calls.length,1);
  vi.setSystemTime(Date.now()+6*86400000-1);await sync.tick();assert.equal(readFor('1'),1);
  vi.setSystemTime(Date.now()+1);await sync.tick();assert.equal(readFor('1'),2,'six days, inside the seven a copy may be shown');
 }finally{vi.useRealTimers();}
});

// Partitions and nrSnapshots kept apart, rows stored as JSON as a database would, so services built over the same
// store behave like the process before and after a restart.
function durableSetup(){
 const parts=[],calls={find:0,writes:0},saved=new Map();let transaction=null;
 const add=(source,grain,date,payload,updatedAt='2026-09-30T00:00:00Z')=>parts.push({id:parts.length+1,projectId:1,source,grain,date,resource:source==='ga4'?'123':'sc-domain:example.com',payload,updatedAt});
 for(const date of ['2026-09-25','2026-09-26','2026-09-27']){add('ga4','overview',date,[{date,views:10,sessions:5,conversions:1}]);add('gsc','overview',date,[{date,clicks:3,impressions:90}]);}
 const links={ga4PropertyId:'123',gscSiteUrl:'sc-domain:example.com',status:'active'};
 const partitions={
  find:async({filter={},fields})=>{const keys=filter.id?.$in;if(!keys&&filter.grain!=='overview')calls.find++;return parts.filter(p=>!keys||keys.includes(p.id)).map(p=>({toJSON:()=>JSON.parse(JSON.stringify(fields?Object.fromEntries(fields.map(k=>[k,p[k]])):p))}));},
  count:async()=>parts.length,
  findOne:async()=>{const p=[...parts].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];return p&&{get:k=>p[k]};}
 };
 const snapshots={
  findOne:async({filter})=>saved.has(filter.key)?{get:k=>k==='payload'?JSON.parse(saved.get(filter.key)):undefined}:null,
  create:async({values})=>{calls.writes++;saved.set(values.key,JSON.stringify(values.payload));},
  update:async({filter,values})=>{calls.writes++;saved.set(filter.key,JSON.stringify(values.payload));},
  destroy:async({filter})=>{calls.writes++;saved.delete(filter.key);}
 };
 const plugin={link:async()=>({id:1,get:k=>links[k]}),env:()=>'secret',project:async()=>({id:1,name:'Demo',analyticsPropertyId:'123',searchConsoleProperty:'sc-domain:example.com',domains:['example.com']}),db:{getRepository:n=>n==='nrSnapshots'?snapshots:partitions,transactionContext:()=>transaction}};
 const kept=async s=>{await Promise.all([...(s.keeping?.values()||[])]);};
 return {service:()=>new SyncService(plugin),parts,calls,add,saved,kept,inTransaction:v=>{transaction=v;}};
}

test('a restarted service restores the snapshots its previous build kept instead of rebuilding them',async()=>{
 const {service,calls,saved,kept}=durableSetup();
 const before=service(),first=await before.snapshots('1');await kept(before);
 assert.equal(calls.find,1);assert.ok(saved.has('sync-snapshots:1'));
 const after=service(),restored=await after.snapshots('1');
 assert.equal(calls.find,1);assert.deepEqual(restored,first);
 assert.throws(()=>restored.find(s=>s.key==='history-web').payload.push({}),TypeError);
 assert.equal(await after.snapshots('1'),restored);assert.equal(calls.find,1);
});

test('a kept copy of other stored data is not restored: the snapshots are rebuilt and kept again',async()=>{
 const {service,calls,add,saved,kept}=durableSetup();
 const before=service();await before.snapshots('1');await kept(before);
 add('ga4','overview','2026-09-28',[{date:'2026-09-28',views:12,sessions:6,conversions:0}],'2026-10-01T00:00:00Z');add('gsc','overview','2026-09-28',[{date:'2026-09-28',clicks:4,impressions:95}],'2026-10-01T00:00:00Z');
 const after=service(),next=await after.snapshots('1');await kept(after);
 assert.equal(calls.find,2);assert.equal(next.find(s=>s.key==='project').payload.end,'2026-09-28');
 assert.equal(JSON.parse(saved.get('sync-snapshots:1')).value.find(s=>s.key==='project').payload.end,'2026-09-28');
});

test('a build inside a transaction is never kept, while a committed copy may be restored there',async()=>{
 const {service,calls,saved,kept,inTransaction}=durableSetup();
 inTransaction({id:'tx'});
 const inside=service();await inside.snapshots('1');await kept(inside);
 assert.equal(calls.find,1);assert.equal(calls.writes,0);assert.equal(saved.size,0);
 inTransaction(null);
 const outside=service(),built=await outside.snapshots('1');await kept(outside);assert.equal(calls.writes,1);
 inTransaction({id:'tx2'});
 assert.deepEqual(await service().snapshots('1'),built);assert.equal(calls.find,2);assert.equal(calls.writes,1);
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
 const {searchSignals,webSignals}=__signals;
 searchSignals({queries:get('queries-28'),history:get('history-search'),end:'2026-09-27'});
 webSignals({pages:get('pages-28'),history:get('history-web'),referral:get('history-github-referral'),end:'2026-09-27'});
 const {DataViews}=__data_views;
 const view=await new DataViews({sync}).overview(1,{range:'7'});assert.ok(view.cards.length>=2);
 const {SiteContent}=__site_content;
 const payload={sites:[{origin:'https://example.com',confirmedAt:'t'}],pages:[{url:'https://example.com/docs/a',type:'docs',origin:'https://example.com'}]};
 const list=await new SiteContent({db:{getRepository:()=>({findOne:async()=>({get:()=>payload})})},sync}).list('1','28');
 assert.equal(list.pages[0].views,900);
});

test('初步数据: Google\'s last days are read as daily totals with fresh data, kept apart and only shown after the cutoff',async()=>{
 const {calendarDateInTimeZone}=__google_sync;const shift=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
 const la=calendarDateInTimeZone('America/Los_Angeles'),store=[],links={ga4PropertyId:'123',gscSiteUrl:'sc-domain:example.com',status:'active'},seen=[];
 const snaps={findOne:async({filter})=>{const r=store.find(x=>x.key===filter.key);return r&&{id:r.id,get:k=>r[k]};},create:async({values})=>{store.push({id:store.length+1,...values});},update:async({filterByTk,values})=>{Object.assign(store.find(x=>x.id===filterByTk),values);}};
 const plugin={link:async()=>({id:1,get:k=>links[k]}),env:()=>'secret',project:async()=>({id:1,analyticsPropertyId:'123',searchConsoleProperty:'sc-domain:example.com'}),token:async()=>'t',db:{getRepository:()=>snaps,sequelize:{transaction:fn=>fn({}),query:async()=>[[{}]]}}};
 const sync=new SyncService(plugin);const fetch=global.fetch;global.fetch=async()=>{throw Object.assign(Error('offline'),{code:'network_unreachable'});};
 sync.collector=o=>({batches:[],async syncGsc(r){seen.push(['gsc',o.dataState,o.reportTypes.join(),r.startDate,r.endDate]);this.batches.push({grainType:'overview',periodDate:r.endDate,clicks:7,impressions:70,avgPosition:4},{grainType:'overview',periodDate:r.endDate,clicks:1,impressions:30,avgPosition:8});},async syncGa4(r){seen.push(['ga4',o.dataState,o.reportTypes.join(),r.startDate,r.endDate]);this.batches.push({grainType:'overview',periodDate:r.startDate,views:20,totalUsers:9,sessions:12,engagedSessions:6,keyEvents:1});}});
 try{
  const out=await sync.refreshFresh('1');
  assert.deepEqual(seen[0],['gsc','all','overview',shift(la,-2),shift(la,-1)],'fresh data, from the day after the final cutoff to yesterday');assert.equal(seen[1][0],'ga4');assert.equal(seen[1][3],shift(la,-2));
  assert.deepEqual(out.gsc,[{date:shift(la,-1),clicks:8,impressions:100,position:5.2}]);assert.deepEqual(out.ga4,[{date:shift(la,-2),views:20,uv:9,sessions:12,engaged:6,conversions:1}]);
  assert.equal(store[0].key,'google-fresh:1');
  assert.deepEqual((await sync.fresh('1','gsc',shift(la,-3))).map(r=>r.date),[shift(la,-1)]);assert.deepEqual(await sync.fresh('1','gsc',shift(la,-1)),[],'nothing after a cutoff that already covers it');
  links.gscSiteUrl='sc-domain:other.com';assert.deepEqual(await sync.fresh('1','gsc',shift(la,-3)),[],'another property: not shown');
 }finally{global.fetch=fetch;}
 const {withFresh}=__data_views;
 const card=withFresh({id:'gsc'},[{date:'2026-10-01',clicks:5,impressions:50},{date:'2026-10-02',clicks:3,impressions:40}],['clicks','impressions']);
 assert.deepEqual(card.preliminary,{from:'2026-10-01',through:'2026-10-02',days:2,totals:{clicks:8,impressions:90}});assert.equal(withFresh({id:'gsc'},[],['clicks']).preliminary,undefined);
});

test('the preliminary read keeps the GA4 property time zone on the project',async()=>{
 const store=[],links={ga4PropertyId:'123',gscSiteUrl:'sc-domain:example.com',status:'active'};let project={id:1,analyticsPropertyId:'123',searchConsoleProperty:'sc-domain:example.com'};
 const snaps={findOne:async({filter})=>{const r=store.find(x=>x.key===filter.key);return r&&{id:r.id,get:k=>r[k]};},create:async({values})=>{store.push({id:store.length+1,...values});},update:async({filterByTk,values})=>{Object.assign(store.find(x=>x.id===filterByTk),values);}};
 const asked=[];const plugin={link:async()=>({id:1,get:k=>links[k]}),env:()=>'secret',project:async()=>project,projects:{update:async(id,fn)=>{project=await fn(project);}},token:async()=>'t',googleJson:async(id,url)=>{asked.push(String(url));return {timeZone:'Asia/Shanghai',displayName:'site'};},db:{getRepository:()=>snaps,sequelize:{transaction:fn=>fn({}),query:async()=>[[{}]]}}};
 const sync=new SyncService(plugin);sync.collector=()=>({batches:[],async syncGsc(){},async syncGa4(){}});
 await sync.refreshFresh('1');
 assert.ok(asked.some(u=>u.endsWith('/properties/123')));assert.equal(project.analyticsPropertyTimeZone,'Asia/Shanghai');assert.equal(project.analyticsPropertyName,'site');
});

function switchSetup(){
 const links={ga4PropertyId:'123',gscSiteUrl:'sc-domain:example.com',status:'active',lastSyncAt:'2026-09-30T00:00:00Z',scheduleEnabled:true};let project={id:1,analyticsPropertyId:'123',searchConsoleProperty:'sc-domain:example.com'};
 const rec=v=>({id:v.id,get:k=>v[k],toJSON:()=>({...v})});
 const jobs=[{id:1,projectId:'1',source:'ga4',resource:'123',status:'queued'},{id:2,projectId:'1',source:'gsc',resource:'sc-domain:example.com',status:'paused'},{id:3,projectId:'1',source:'ga4',resource:'123',status:'succeeded'}];
 const parts=[{projectId:'1',source:'ga4',grain:'overview',resource:'123',date:'2026-09-27',payload:[{}]},{projectId:'1',source:'ga4',grain:'overview',resource:'456',date:'2026-09-20',payload:[{}]},{projectId:'1',source:'gsc',grain:'overview',resource:'sc-domain:example.com',date:'2026-09-26',payload:[{}]}];
 const match=(row,filter)=>Object.entries(filter).every(([k,v])=>v&&typeof v==='object'?(v.$in?v.$in.includes(row[k]):true):row[k]===v);
 const repos={
  nrSyncJobs:{find:async({filter})=>jobs.filter(j=>match(j,filter)).map(rec),destroy:async({filter})=>{for(const id of filter.id.$in)jobs.splice(jobs.findIndex(j=>j.id===id),1);}},
  nrSyncPartitions:{find:async({filter})=>parts.filter(p=>match(p,filter)).map(rec)},
 };
 const after=[];
 const plugin={link:async()=>rec(links),metadata:async(id,v)=>Object.assign(links,v),project:async()=>project,projects:{update:async(id,fn)=>{project=fn(project);}},
  db:{getRepository:n=>repos[n],sequelize:{query:async()=>[[{locked:true}]],transaction:async fn=>{const r=await fn({afterCommit:cb=>after.push(cb)});after.splice(0).forEach(cb=>cb());return r;}}}};
 return {sync:new SyncService(plugin),links,jobs,project:()=>project};
}

test('changing resources keeps their data apart: unfinished jobs of the old ones are dropped and status follows the new ones',async()=>{
 const {sync,links,jobs,project}=switchSetup();
 assert.deepEqual(await sync.select('1','123','sc-domain:example.com'),{changed:false});
 assert.equal(jobs.length,3);assert.equal(links.lastSyncAt,'2026-09-30T00:00:00Z');
 assert.deepEqual(await sync.select('1','456','sc-domain:example.com'),{changed:true});
 assert.deepEqual(jobs.map(j=>j.id),[2,3]);
 assert.deepEqual([links.ga4PropertyId,links.gscSiteUrl,links.status,links.lastSyncAt,links.scheduleEnabled],['456','sc-domain:example.com','ready_for_sync',null,true]);
 assert.deepEqual([project().analyticsPropertyId,project().searchConsoleProperty],['456','sc-domain:example.com']);
 const status=await sync.status('1');
 assert.deepEqual(status.jobs.map(j=>j.id),[2]);
 assert.deepEqual(status.coverage,[{source:'ga4',availableThrough:'2026-09-20'},{source:'gsc',availableThrough:'2026-09-26'}]);
});

test('the GA4 property name and time zone are kept on the project, filled in by a sync for earlier projects',async()=>{
 const {sync,project}=switchSetup();
 await sync.rememberProperty('1','999',{displayName:'Other',timeZone:'Europe/Paris'});assert.equal(project().analyticsPropertyName,undefined);assert.equal(project().analyticsPropertyTimeZone,undefined);
 await sync.rememberProperty('1','123',{displayName:'website',timeZone:'Asia/Shanghai'});assert.equal(project().analyticsPropertyName,'website');assert.equal(project().analyticsPropertyTimeZone,'Asia/Shanghai');
 await sync.rememberProperty('1','123',{});assert.equal(project().analyticsPropertyTimeZone,'Asia/Shanghai','details without them change nothing');
 await sync.select('1','123','sc-domain:example.com');assert.equal(project().analyticsPropertyName,'website');assert.equal(project().analyticsPropertyTimeZone,'Asia/Shanghai');
 await sync.select('1','456','sc-domain:example.com','Docs');assert.equal(project().analyticsPropertyName,'Docs');assert.equal(project().analyticsPropertyTimeZone,'','another property drops the old zone');
 await sync.select('1','789','sc-domain:example.com');assert.equal(project().analyticsPropertyName,'');
});
test('tick: the other ranges chosen lately are read ahead too, Traffic\'s in the day and once a window, and the stored sums once a minute',async()=>{
 vi.useFakeTimers({toFake:['Date']});
 try{
  const opened={lately:true},{sync,website,warm,scopes}=tickFixture(opened);
  const chosen={website:['all','90'],search:['90'],pages:['28','90'],ranks:['28']},tables=vi.fn(async()=>({complete:true,missing:[]})),pairRows=vi.fn(async()=>({})),pageFigures=vi.fn(async()=>null);
  let day=false;
  Object.assign(sync.p.dataViews,{recentViews:async(_id,kind)=>chosen[kind]||[],websiteDayRead:async()=>day,websiteTables:tables,pairRows,pageFigures});
  await sync.tick();
  assert.deepEqual(warm.mock.calls.map(c=>c[1]),[undefined,'90'],'the default and the range chosen');
  assert.deepEqual(website.mock.calls.map(c=>c[1].range),['28'],'not in the night');
  assert.equal(pairRows.mock.calls.length,1);assert.deepEqual(pageFigures.mock.calls.map(c=>c[1]),['28','90']);
  day=true;scopes.length=0;await sync.tick();
  assert.deepEqual(website.mock.calls.slice(1).map(c=>c[1].range),['28','all','90']);assert.deepEqual(scopes,['fresh','ahead','ahead'],'a chosen range once a window');
  assert.deepEqual(tables.mock.calls.map(c=>c[1].range),['28','all','90']);
  assert.equal(pairRows.mock.calls.length,1,'the sums are checked once a minute');
  await sync.tick();assert.equal(website.mock.calls.length,5,'a chosen range is checked every 15 minutes');assert.equal(warm.mock.calls.length,2);assert.equal(tables.mock.calls.length,4);
  vi.setSystemTime(Date.now()+15*60000);await sync.tick();assert.equal(website.mock.calls.length,8);assert.equal(warm.mock.calls.length,4);assert.equal(pairRows.mock.calls.length,2);
  opened.lately=false;chosen.website=[];vi.setSystemTime(Date.now()+15*60000);await sync.tick();assert.equal(tables.mock.calls.length,7,'the other tables only for a project opened in the last day');
 }finally{vi.useRealTimers();}
});
