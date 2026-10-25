// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/reddit-source.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { RedditSource, thread, specification, result } from '../../server/nocoreach/reddit-source.js';
import { DataHealth } from '../../server/nocoreach/data-health.js';
import { redditSignals } from '../../server/nocoreach/signals.js';
import { windowFor } from '../../server/nocoreach/data-views.js';
import { redditSchedule } from '../../server/nocoreach/reddit-schedule.js';
const test=__vitest_test;
const DAY=86400000;
// In-memory repositories by name (nrKeywordRuns for the DataForSEO runs, nrSnapshots for the Reddit state).
function memory(){const rows=[];let id=0;const match=(r,f={})=>Object.entries(f).every(([k,v])=>v&&typeof v==='object'?('$in' in v?v.$in.includes(r[k]):'$gte' in v?r[k]>=v.$gte:false):r[k]===v);
 const wrap=r=>r&&{...r,get:k=>r[k],toJSON:()=>({...r})};
 return {rows,findOne:async o=>wrap(o.filterByTk!==undefined?rows.find(r=>r.id===o.filterByTk):rows.filter(r=>match(r,o.filter)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]),find:async o=>rows.filter(r=>match(r,o.filter)).map(wrap),
  create:async o=>{const r={id:++id,createdAt:new Date().toISOString(),...o.values};rows.push(r);return wrap(r);},update:async o=>Object.assign(rows.find(r=>r.id===o.filterByTk),o.values)};}
function service({verified=true,reply}={}){const repos={};const env={NOREACH_DATAFORSEO_1:JSON.stringify({login:'a',password:'b',budget:5,verifiedAt:verified?'t':null})},calls=[];
 const p={env:k=>env[k],projectIds:async()=>['1'],app:{logger:{warn(){}}},sync:{snapshots:async()=>[{key:'history-reddit-referral',payload:[{date:new Date(Date.now()-2*DAY).toISOString().slice(0,10),sessions:30,views:50,conversions:2}]}]},db:{getRepository:n=>repos[n] ||= memory(),sequelize:{transaction:fn=>fn({}),query:async()=>{}}}};
 global.fetch=async(url,init)=>{const body=JSON.parse(init.body)[0];calls.push(body);return {ok:true,json:async()=>reply(body)};};
 return {s:new RedditSource(p),repos,calls};}
const serp=items=>({status_code:20000,cost:0.002,tasks:[{status_code:20000,result:[{items}]}]});

test('provider diagnostics distinguish terminal failures, empty success and malformed or uncertain replies without retaining free text',()=>{
 const spec=specification({term:'NocoBase'});
 for(const raw of [null,{}, {status_code:20000,cost:0,tasks:[]},serp(undefined),{...serp([]),tasks:[{status_code:20000,result:null}]}])assert.equal(result(raw,spec).status,'unknown');
 for(const raw of [serp([]),{status_code:20000,cost:0,tasks:[{status_code:40102,result:null}]}])assert.equal(result(raw,spec).status,'completed');
 for(const top of [true,false]){
  const raw={status_code:top?50401:20000,cost:0,status_message:'secret arbitrary content',tasks:[{id:'safe-task-123',status_code:50401,status_message:'secret arbitrary content'}]};
  const r=result(raw,spec);assert.equal(r.status,'failed');assert.equal(r.result.diagnostic.retryable,true);assert.equal(r.taskId,'safe-task-123');assert.equal(JSON.stringify(r).includes('secret arbitrary'),false);
  assert.equal(result({...raw,cost:undefined},spec).status,'unknown');
  assert.equal(result({...raw,cost:0.1},spec).result.diagnostic.retryable,false);
 }
 assert.equal(result({status_code:20000,cost:0,tasks:[{status_code:40501,id:'unsafe@task'}]},spec).taskId,null);
});

test('partial terms retry only the failed term after one and six hours, then stop across weeks and months',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
 try{
  const {s,calls}=service({reply:b=>b.keyword.includes('Alpha')?serp([{type:'organic',url:'https://reddit.com/r/nocode/comments/abc123/title/',title:'Body mentions Alpha'}]):{status_code:20000,cost:0,tasks:[{id:'task-failed',status_code:50401}]}});
  await s.mutate('1',()=>({status:'active',terms:['Alpha','Beta'],posts:{}}));
  await s.check('1');let state=await s.state('1');assert.equal(calls.length,2);assert.equal(state.retainedFrom,null);assert.equal(state.dataThrough,null);assert.equal(Object.keys(state.posts).length,1);
  assert.equal(redditSchedule(state).nextAt,'2026-10-15T01:00:00.000Z');
  const mutate=s.mutate.bind(s);let writes=0;s.mutate=(...args)=>{writes++;return mutate(...args);};
  await s.check('1',{force:true});await s.status('1');await s.view('1',{},windowFor);await s.tick();assert.equal(calls.length,2);assert.equal(writes,0,'polls and not-due scans never persist scheduling');
  vi.setSystemTime(new Date('2026-10-15T01:00:00Z'));await s.check('1');state=await s.state('1');assert.equal(calls.length,3);assert.equal(state.plan.recent,false);assert.equal(redditSchedule(state).nextAt,'2026-10-15T07:00:00.000Z');
  vi.setSystemTime(new Date('2026-10-15T07:00:00Z'));await s.check('1');state=await s.state('1');assert.equal(calls.length,4);assert.equal(state.plan.entries[1].attempt,3);assert.equal(redditSchedule(state).kind,'attention');
  vi.setSystemTime(new Date('2026-12-20T00:00:00Z'));await s.tick();await s.check('1',{force:true});assert.equal(calls.length,4);assert.equal(Object.keys((await s.state('1')).posts).length,1);
  const status=await s.status('1');const view=await s.view('1',{},windowFor);assert.deepEqual(status.schedule,view.schedule);
  assert.equal((await new DataHealth({link:async()=>null,reddit:s}).list('1')).items[0].nextSyncAt,status.schedule.nextAt);
 }finally{vi.useRealTimers();}
});

test('a successful retry completes fixed coverage; cached results retain their original query date',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
 try{
  let fail=true;const {s,calls}=service({reply:b=>fail&&b.keyword.includes('Beta')?{status_code:20000,cost:0,tasks:[{status_code:50303}]}:serp([])});
  await s.mutate('1',()=>({status:'active',terms:['Alpha','Beta'],posts:{}}));await s.check('1');
  fail=false;vi.setSystemTime(new Date('2026-10-15T01:00:00Z'));await s.check('1');
  let state=await s.state('1');assert.equal(calls.length,3);assert.equal(state.dataThrough,'2026-10-15');assert.equal(state.lastRun.lastSuccessAt,'2026-10-15T00:00:00.000Z');
  // Keep the recent query cached, then repeat it on another business day.
  await s.check('1',{force:true});const count=calls.length;
  vi.setSystemTime(new Date('2026-10-17T00:00:00Z'));await s.check('1',{force:true});state=await s.state('1');
  assert.equal(calls.length,count);assert.equal(state.dataThrough,'2026-10-15');assert.equal(state.lastRun.lastSuccessAt,'2026-10-15T01:00:00.000Z');
 }finally{vi.useRealTimers();}
});

test('configuration failures require a manual check after repair and obey the same retry cooldown and limit',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
 try{
  const {s,calls}=service({reply:()=>({status_code:20000,cost:0,tasks:[{status_code:40100}]})});
  await s.mutate('1',()=>({status:'active',terms:['Alpha'],posts:{}}));await s.check('1');
  await s.check('1',{force:true});assert.equal(calls.length,1);
  vi.setSystemTime(new Date('2026-10-15T01:00:00Z'));await s.tick();assert.equal(calls.length,1,'configuration errors never retry automatically');
  await s.check('1',{force:true});assert.equal(calls.length,2);
  vi.setSystemTime(new Date('2026-10-15T07:00:00Z'));await s.check('1',{force:true});assert.equal(calls.length,3);
  vi.setSystemTime(new Date('2026-12-20T00:00:00Z'));await s.check('1',{force:true});assert.equal(calls.length,3);
 }finally{vi.useRealTimers();}
});

test('unknown runs block beyond cache expiry and budget refusal leaves the other terms waiting without text matching',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
 try{
  const {s,calls}=service({reply:()=>{throw new Error('connection lost');}});
  await s.mutate('1',()=>({status:'active',terms:['Alpha'],posts:{}}));await s.check('1');
  vi.setSystemTime(new Date('2026-12-20T00:00:00Z'));await s.check('1',{force:true});assert.equal(calls.length,1);
  // Even a fresh key and explicit bypass flags cannot defeat Reddit's indefinite run guard.
  const blocked=await s.d4s.run('1','reddit',{term:'Alpha',requestKey:'different-request-key',retryUncertain:true,forceRefresh:true});assert.equal(blocked.status,'unknown');assert.equal(calls.length,1);
  const budget=service({reply:()=>serp([])});await budget.s.mutate('1',()=>({status:'active',terms:['Alpha','Beta'],posts:{}}));
  budget.s.d4s.run=async()=>{throw Object.assign(new Error('English localized budget message'),{safeCode:'budget_exceeded'});};
  await budget.s.check('1');const state=await budget.s.state('1');assert.equal(state.plan.entries.every(e=>e.status==='budget'),true);assert.equal(redditSchedule(state).nextAt,'2027-01-01T00:00:00.000Z');
  const keys=state.plan.entries.map(e=>e.requestKey);budget.s.d4s.run=async(_id,_kind,v)=>{assert.equal(v.requestKey,keys[v.term==='Alpha'?0:1]);return {status:'completed',result:{posts:[]}};};
  await budget.s.check('1',{force:true});assert.equal((await budget.s.state('1')).lastRun.ok,true,'corrected budget can recheck the original key manually');
 }finally{vi.useRealTimers();}
});

test('Reddit threads from Google results: thread links only, the discussions box too, titles without the subreddit suffix',()=>{
 assert.deepEqual(thread('https://old.reddit.com/r/selfhosted/comments/1AbC9/nocobase_vs_appsmith/?utm=x'),{id:'1abc9',subreddit:'selfhosted',url:'https://www.reddit.com/r/selfhosted/comments/1abc9/nocobase_vs_appsmith/'});
 assert.equal(thread('https://www.reddit.com/r/selfhosted/'),null);assert.equal(thread('https://notreddit.com/r/a/comments/abc/'),null);assert.equal(thread('javascript:alert(1)'),null);
 const spec=specification({term:'NocoBase'});assert.equal(spec.request.keyword,'site:reddit.com "NocoBase"');assert.equal(spec.request.search_param,undefined);
 assert.equal(specification({term:'NocoBase',recent:true}).request.search_param,'&tbs=qdr:m','later checks read the past month');assert.throws(()=>specification({term:'a"b'}),/产品名/);
 const r=result(serp([{type:'organic',url:'https://www.reddit.com/r/nocode/comments/abc123/best_tools/',title:'Best tools : r/nocode',description:'Try NocoBase',timestamp:'2026-09-20 00:00:00 +00:00'},{type:'organic',url:'https://www.reddit.com/r/nocode/',title:'r/nocode'},{type:'discussions_and_forums',items:[{type:'discussions_and_forums_element',url:'https://www.reddit.com/r/selfhosted/comments/zz9/x/',title:'Self hosted?'},{type:'discussions_and_forums_element',url:'https://www.reddit.com/r/nocode/comments/abc123/best_tools/',title:'dup'}]}]),spec);
 assert.deepEqual(r.result.posts.map(p=>[p.id,p.subreddit,p.title,p.postedAt]),[['abc123','nocode','Best tools','2026-09-20'],['zz9','selfhosted','Self hosted?',null]]);
 assert.equal(result({status_code:20000,cost:0,tasks:[{status_code:40501}]},spec).status,'failed');
});

test('connect needs DataForSEO; the first check reads the most relevant threads, later ones the past month; a check is reused within the week',async()=>{
 await assert.rejects(service({verified:false}).s.connect('1',{terms:['NocoBase']}),/DataForSEO/);
 let week=0;const {s,calls}=service({reply:b=>serp(b.search_param?[{type:'organic',url:`https://www.reddit.com/r/selfhosted/comments/new${week}/x/`,title:`New ${week}`}]:[{type:'organic',url:'https://www.reddit.com/r/nocode/comments/old1/x/',title:'Old one'},{type:'organic',url:'https://www.reddit.com/r/nocode/comments/old2/x/',title:'Old two'}])});
 await s.connect('1',{terms:['NocoBase']});await s.runs.wait('1');
 let st=await s.state('1');assert.equal(calls.length,1);assert.equal(calls[0].search_param,undefined);assert.deepEqual(Object.keys(st.posts).sort(),['old1','old2']);assert.equal(st.lastRun.added,2);assert.ok(st.retainedFrom);
 assert.deepEqual(await s.check('1'),{found:0,added:0,errors:[]},'not due within the week');assert.equal(calls.length,1);
 // a week later: past month only, new threads added with the day first seen, old ones kept
 st.lastRun.at=new Date(Date.now()-8*DAY).toISOString();week=1;const r=await s.check('1');
 assert.equal(calls.length,2);assert.equal(calls[1].search_param,'&tbs=qdr:m');assert.equal(r.added,1);st=await s.state('1');assert.equal(Object.keys(st.posts).length,3);
 // 立即检查 within six days reuses the paid run
 await s.check('1',{force:true});assert.equal(calls.length,2);
 const status=await s.status('1');assert.equal(status.connected,true);assert.equal(status.total,3);assert.equal(status.recent[0].title,'New 1');
});

test('Reddit page counts threads first seen in the range, subreddits and visits from Reddit; signals for a busy week',async()=>{
 const {s,repos}=service({reply:()=>serp([])});const now=Date.now(),at=n=>new Date(now-n*DAY).toISOString(),d=n=>at(n).slice(0,10);
 const posts={};for(const [id,sub,n] of [['a','selfhosted',1],['b','selfhosted',2],['c','nocode',3],['e','nocode',10],['f','nocode',40]])posts[id]={id,subreddit:sub,title:id.toUpperCase(),url:`https://www.reddit.com/r/${sub}/comments/${id}/`,snippet:'',postedAt:null,firstSeenAt:at(n),term:'NocoBase'};
 (repos.nrSnapshots ||= (await s.state('1'),repos.nrSnapshots));repos.nrSnapshots.rows.push({id:99,key:'reddit:1',payload:{terms:['NocoBase'],status:'active',retainedFrom:d(60),dataThrough:d(1),posts,lastRun:{at:at(1),ok:true}}});
 const v=await s.view('1',{range:'7'},windowFor);
 const all=await s.view('1',{range:'all'},windowFor);assert.equal(all.window.all,true);assert.ok(all.kpis.every(k=>k.previous===null&&k.change===null));
 assert.equal(v.kpis[0].value,3);assert.equal(v.kpis[0].previous,1);assert.deepEqual(v.subreddits,[{name:'selfhosted',count:2},{name:'nocode',count:1}]);assert.deepEqual(v.posts.map(p=>p.id),['a','b','c']);
 assert.deepEqual(v.visits,{sessions:30,views:50,conversions:2,previous:0});
 const sig=redditSignals({rd:{retainedFrom:d(60),posts},now});assert.equal(sig.length,1);assert.match(sig[0].title,/近 7 天 Reddit 新发现 3 个/);assert.match(sig[0].facts[0],/r\/selfhosted（2 个）/);
 assert.deepEqual(redditSignals({rd:{retainedFrom:d(0),posts},now}),[],'the first read is not news');
 assert.deepEqual(await service({reply:()=>serp([])}).s.view('1',{},windowFor),{connected:false});
});

// 发帖日期 (2026-10-09 user feedback: only “found on” was shown): advanced results carry Google's date; threads found
// before dates were read get them from one search without the past-month limit; the page counts by post date.
test('post dates: advanced results, one backfill search for threads found earlier, counted by the day posted',async()=>{
 const spec=specification({term:'NocoBase'});assert.equal(spec.path,'serp/google/organic/live/advanced');assert.equal(spec.estimatedUsd,0.1);
 const {s,calls}=service({reply:()=>serp([{type:'organic',url:'https://www.reddit.com/r/nocode/comments/old1/x/',title:'Old one',timestamp:'2023-05-02 10:00:00 +00:00'}])});
 const now=Date.now(),at=n=>new Date(now-n*DAY).toISOString();
 await s.mutate('1',()=>({terms:['NocoBase'],status:'active',retainedFrom:at(10).slice(0,10),lastRun:{at:at(8),ok:true},posts:{old1:{id:'old1',subreddit:'nocode',title:'Old one',url:'https://www.reddit.com/r/nocode/comments/old1/x/',firstSeenAt:at(10),lastSeenAt:at(10),postedAt:null}}}));
 await s.check('1');assert.equal(calls.length,1);assert.equal(calls[0].search_param,undefined,'the backfill reads without the past-month limit');
 const st=await s.state('1');assert.equal(st.posts.old1.postedAt,'2023-05-02');assert.ok(st.datesReadAt);
 await s.mutate('1',cur=>({...cur,lastRun:{...cur.lastRun,at:at(8)}}));await s.check('1');assert.equal(calls[1].search_param,'&tbs=qdr:m','afterwards, the past month again');
 const view=await s.view('1',{range:'28'},(end,_range)=>({start:new Date(now-28*DAY).toISOString().slice(0,10),end,previousStart:new Date(now-56*DAY).toISOString().slice(0,10),previousEnd:new Date(now-29*DAY).toISOString().slice(0,10)}));
 assert.equal(view.kpis[0].label,'新帖子');assert.equal(view.kpis[0].value,0,'a thread posted in 2023 is not new, though found 10 days ago');
});

test('a failed Reddit check retains successful operation time and fixed business cutoff',async()=>{
 const {s}=service();const clock='2026-09-20T00:00:00.000Z';s.p.mock={enabled:true,clock:()=>clock};
 await s.mutate('1',()=>({terms:['NocoBloom'],status:'active',posts:{}}));
 s.d4s.run=async()=>({status:'completed',result:{posts:[{id:'abc123',title:'Fixture',subreddit:'NocoBloom',url:'https://www.reddit.com/r/NocoBloom/comments/abc123/'}]}});
 await s.check('1',{force:true});const good=await s.state('1');
 assert.equal(good.dataThrough,'2026-09-20');assert.equal(good.lastRun.lastSuccessAt,good.lastRun.at);assert.equal(good.posts.abc123.firstSeenAt,clock);
 s.d4s.run=async()=>({status:'unknown',errorCode:'Result uncertain'});await s.check('1',{force:true});const failed=await s.state('1');
 assert.equal(failed.lastRun.ok,false);assert.equal(failed.lastRun.lastSuccessAt,good.lastRun.at);assert.equal(failed.dataThrough,good.dataThrough);assert.deepEqual(failed.posts,good.posts);
 s.d4s.run=async()=>{throw new Error('must not repeat an uncertain paid query');};await s.check('1',{force:true});assert.equal((await s.state('1')).lastRun.ok,false);
});


test('legacy Reddit cutoff stays unknown before and after a failed check',async()=>{
 const {s}=service(),successfulAt=new Date().toISOString();
 s.p.mock={enabled:true,clock:()=> '2026-09-20T00:00:00.000Z'};
 await s.mutate('1',()=>({terms:['NocoBloom legacy'],status:'active',posts:{},lastRun:{at:successfulAt,ok:true,errors:[]}}));
 const health=new DataHealth({link:async()=>null,reddit:s});
 const before=(await health.list('1')).items[0];
 assert.equal(before.lastSuccessAt,successfulAt);
 assert.equal(before.dataThrough,null,'legacy operation time does not establish a business cutoff');
 s.d4s.run=async()=>({status:'unknown',errorCode:'Result uncertain'});
 await s.check('1',{force:true});
 const state=await s.state('1'),after=(await health.list('1')).items[0];
 assert.equal(state.dataThrough,null);
 assert.equal(after.lastSuccessAt,successfulAt);
 assert.equal(after.dataThrough,null,'a failed run cannot establish the missing business cutoff');
});
