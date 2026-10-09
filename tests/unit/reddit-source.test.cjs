const test=require('node:test'),assert=require('node:assert/strict');
const {RedditSource,thread,specification,result}=require('../../apps/nocoreach/server/providers/reach/domain/reddit-source.cjs');
const {redditSignals}=require('../../apps/nocoreach/server/providers/reach/domain/signals.cjs');
const {windowFor}=require('../../apps/nocoreach/server/providers/reach/domain/data-views.cjs');
const DAY=86400000;
// In-memory repositories by name (nrKeywordRuns for the DataForSEO runs, nrSnapshots for the Reddit state).
function memory(){const rows=[];let id=0;const match=(r,f={})=>Object.entries(f).every(([k,v])=>v&&typeof v==='object'?('$in' in v?v.$in.includes(r[k]):'$gte' in v?r[k]>=v.$gte:false):r[k]===v);
 const wrap=r=>r&&{...r,get:k=>r[k],toJSON:()=>({...r})};
 return {rows,findOne:async o=>wrap(o.filterByTk!==undefined?rows.find(r=>r.id===o.filterByTk):rows.filter(r=>match(r,o.filter)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]),find:async o=>rows.filter(r=>match(r,o.filter)).map(wrap),
  create:async o=>{const r={id:++id,createdAt:new Date().toISOString(),...o.values};rows.push(r);return wrap(r);},update:async o=>Object.assign(rows.find(r=>r.id===o.filterByTk),o.values)};}
function service({verified=true,reply}={}){const repos={};const env={NOREACH_DATAFORSEO_1:JSON.stringify({login:'a',password:'b',budget:5,verifiedAt:verified?'t':null})},calls=[];
 const p={env:k=>env[k],projectIds:async()=>['1'],app:{logger:{warn(){}}},sync:{snapshots:async()=>[{key:'history-reddit-referral',payload:[{date:new Date(Date.now()-2*DAY).toISOString().slice(0,10),sessions:30,views:50,conversions:2}]}]},store:{repository:n=>repos[n] ||= memory(),transaction:fn=>fn({}),query:async()=>{}}};
 global.fetch=async(url,init)=>{const body=JSON.parse(init.body)[0];calls.push(body);return {ok:true,json:async()=>reply(body)};};
 return {s:new RedditSource(p),repos,calls};}
const serp=items=>({status_code:20000,cost:0.002,tasks:[{status_code:20000,result:[{items}]}]});

test('Reddit threads from Google results: thread links only, the discussions box too, titles without the subreddit suffix',()=>{
 assert.deepEqual(thread('https://old.reddit.com/r/selfhosted/comments/1AbC9/nocobase_vs_appsmith/?utm=x'),{id:'1abc9',subreddit:'selfhosted',url:'https://www.reddit.com/r/selfhosted/comments/1abc9/nocobase_vs_appsmith/'});
 assert.equal(thread('https://www.reddit.com/r/selfhosted/'),null);assert.equal(thread('https://notreddit.com/r/a/comments/abc/'),null);assert.equal(thread('javascript:alert(1)'),null);
 const spec=specification({term:'NocoBase'});assert.equal(spec.request.keyword,'site:reddit.com "NocoBase"');assert.equal(spec.request.search_param,undefined);
 assert.equal(specification({term:'NocoBase',recent:true}).request.search_param,'&tbs=qdr:m','later checks read the past month');assert.throws(()=>specification({term:'a"b'}),/产品名/);
 const r=result(serp([{type:'organic',url:'https://www.reddit.com/r/nocode/comments/abc123/best_tools/',title:'Best tools : r/nocode',description:'Try NocoBase',timestamp:'2026-09-20 00:00:00 +00:00'},{type:'organic',url:'https://www.reddit.com/r/nocode/',title:'r/nocode'},{type:'discussions_and_forums',items:[{type:'discussions_and_forums_element',url:'https://www.reddit.com/r/selfhosted/comments/zz9/x/',title:'Self hosted?'},{type:'discussions_and_forums_element',url:'https://www.reddit.com/r/nocode/comments/abc123/best_tools/',title:'dup'}]}]),spec);
 assert.deepEqual(r.result.posts.map(p=>[p.id,p.subreddit,p.title,p.postedAt]),[['abc123','nocode','Best tools','2026-09-20'],['zz9','selfhosted','Self hosted?',null]]);
 assert.equal(result({status_code:20000,tasks:[{status_code:40501}]},spec).status,'failed');
});

test('connect needs DataForSEO; the first check reads the most relevant threads, later ones the past month; a check is reused within the week',async()=>{
 await assert.rejects(service({verified:false}).s.connect('1',{terms:['NocoBase']}),/DataForSEO/);
 let week=0;const {s,calls}=service({reply:b=>serp(b.search_param?[{type:'organic',url:`https://www.reddit.com/r/selfhosted/comments/new${week}/x/`,title:`New ${week}`}]:[{type:'organic',url:'https://www.reddit.com/r/nocode/comments/old1/x/',title:'Old one'},{type:'organic',url:'https://www.reddit.com/r/nocode/comments/old2/x/',title:'Old two'}])});
 await s.connect('1',{terms:['NocoBase']});await s.checking;
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
 (repos.nrSnapshots ||= (await s.state('1'),repos.nrSnapshots));repos.nrSnapshots.rows.push({id:99,key:'reddit:1',payload:{terms:['NocoBase'],status:'active',retainedFrom:d(60),posts,lastRun:{at:at(1),ok:true}}});
 const v=await s.view('1',{range:'7'},windowFor);
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
 const {s,calls,repos}=service({reply:()=>serp([{type:'organic',url:'https://www.reddit.com/r/nocode/comments/old1/x/',title:'Old one',timestamp:'2023-05-02 10:00:00 +00:00'}])});
 const now=Date.now(),at=n=>new Date(now-n*DAY).toISOString();
 await s.mutate('1',()=>({terms:['NocoBase'],status:'active',retainedFrom:at(10).slice(0,10),lastRun:{at:at(8)},posts:{old1:{id:'old1',subreddit:'nocode',title:'Old one',url:'https://www.reddit.com/r/nocode/comments/old1/x/',firstSeenAt:at(10),lastSeenAt:at(10),postedAt:null}}}));
 await s.check('1');assert.equal(calls.length,1);assert.equal(calls[0].search_param,undefined,'the backfill reads without the past-month limit');
 let st=await s.state('1');assert.equal(st.posts.old1.postedAt,'2023-05-02');assert.ok(st.datesReadAt);
 await s.mutate('1',cur=>({...cur,lastRun:{...cur.lastRun,at:at(8)}}));await s.check('1');assert.equal(calls[1].search_param,'&tbs=qdr:m','afterwards, the past month again');
 const view=await s.view('1',{range:'28'},(end,range)=>({start:new Date(now-28*DAY).toISOString().slice(0,10),end,previousStart:new Date(now-56*DAY).toISOString().slice(0,10),previousEnd:new Date(now-29*DAY).toISOString().slice(0,10)}));
 assert.equal(view.kpis[0].label,'新帖子');assert.equal(view.kpis[0].value,0,'a thread posted in 2023 is not new, though found 10 days ago');
});
