const test=require('node:test'),assert=require('node:assert/strict');
const sp=require('../../apps/nocoreach/server/providers/reach/domain/search-performance.cjs');
const {DataViews}=require('../../apps/nocoreach/server/providers/reach/domain/data-views.cjs');
const DAY=86400000,iso=t=>new Date(t).toISOString().slice(0,10),add=(d,n)=>iso(Date.parse(d+'T00:00:00Z')+n*DAY);
test('totals: CTR from sums, position weighted by impressions, zero impressions give zeros',()=>{
 assert.deepEqual(sp.totals([{clicks:10,impressions:100,position:4},{clicks:0,impressions:300,position:12}]),{clicks:10,impressions:400,ctr:0.025,position:10});
 assert.deepEqual(sp.totals([]),{clicks:0,impressions:0,ctr:0,position:0});
});
test('striking distance keeps a query only when its best page ranks 5–20, sorted by impressions',()=>{
 const rows=sp.pairs([[
  {keyword:'a',page:'/1',clicks:1,impressions:100,position:3},{keyword:'a',page:'/2',clicks:0,impressions:900,position:9},
  {keyword:'b',page:'/1',clicks:2,impressions:50,position:12},{keyword:'b',page:'/3',clicks:1,impressions:80,position:12},
  {keyword:'c',page:'/4',clicks:0,impressions:999,position:25},{keyword:'d',page:'/5',clicks:3,impressions:400,position:5}]]);
 assert.deepEqual(sp.striking(rows).map(r=>[r.query,r.page]),[['d','/5'],['b','/3']]);
});
test('pairs sum the days of a window and filters match like Search Console',()=>{
 const days=[[{keyword:'Open CRM',page:'https://x/a',clicks:1,impressions:10,position:10}],[{keyword:'Open CRM',page:'https://x/a',clicks:3,impressions:30,position:6},{keyword:'other',page:'https://x/b',clicks:5,impressions:5,position:1}]];
 const all=sp.pairs(days);assert.equal(all.length,2);assert.deepEqual(all.find(r=>r.keyword==='Open CRM'),{keyword:'Open CRM',page:'https://x/a',clicks:4,impressions:40,position:7});
 assert.equal(sp.pairs(days,{queryFilter:{operator:'contains',expression:'crm'}}).length,1);
 assert.equal(sp.pairs(days,{queryFilter:{operator:'equals',expression:'open crm'}}).length,0);
 assert.equal(sp.pairs(days,{pageFilter:{operator:'contains',expression:'/b'}})[0].keyword,'other');
 assert.equal(sp.readFilter({operator:'x',expression:'  '}),null);assert.deepEqual(sp.readFilter({operator:'x',expression:' a '}),{operator:'contains',expression:'a'});
});
test('dimension rows group by query or page, sorted by clicks',()=>{
 const rows=[{keyword:'a',page:'/1',clicks:1,impressions:10,position:2},{keyword:'b',page:'/1',clicks:5,impressions:10,position:4}];
 assert.deepEqual(sp.dimension(rows,'page'),{rows:[{key:'/1',clicks:6,impressions:20,ctr:0.3,position:3}],total:1});
 assert.deepEqual(sp.dimension(rows,'query').rows.map(r=>r.key),['b','a']);
});
// One project with 60 synced days ending at `end`; query × page partitions only for the last 14.
function views({filtered=false}={}){
 const end='2026-09-27',daily=[];for(let i=59;i>=0;i--)daily.push({date:add(end,-i),clicks:10,impressions:100,position:8});
 const parts=[];for(let i=13;i>=0;i--)parts.push({date:add(end,-i),payload:[{keyword:'crm',page:'https://x/a',clicks:2,impressions:20,position:9},{keyword:'erp',page:'https://x/b',clicks:1,impressions:30,position:3}]});
 const calls=[],saved=[];const snaps=[{key:'history-search',payload:daily}];let built=0;const state={snap:'s1'};
 const repo={find:async o=>{calls.push(o.filter);return parts.filter(r=>o.filter.date.$in.includes(r.date)).map(r=>({get:k=>r[k]}));},
  findOne:async o=>{const r=saved.find(x=>x.key===o.filter.key);return r&&{id:r.id,get:k=>r[k]};},create:async o=>{saved.push({id:saved.length+1,...o.values});},update:async o=>{saved.find(x=>x.id===o.filterByTk).payload=o.values.payload;}};
 const p={sync:{snapshots:async()=>{built++;return snaps;},snapshotKey:async()=>({key:state.snap}),link:async()=>({get:()=> 'sc-domain:x'})},store:{repository:()=>repo}};
 return {dv:new DataViews(p),p,calls,end,filtered,saved,state,built:()=>built};
}
test('search report: unfiltered totals from the date rows, tables from the window partitions, cached per synced data',async()=>{
 const {dv,calls,end}=views();const r=await dv.search('1',{range:'28'});
 assert.equal(r.cutoff,end);assert.equal(r.window.start,add(end,-27));assert.equal(r.complete,true);assert.equal(r.previousComplete,true);
 assert.equal(r.totals.clicks,280);assert.equal(r.previous.clicks,280);assert.equal(r.trend.length,28);assert.equal(r.trend[0].previousDate,add(end,-55));
 assert.equal(r.pairDays,14);assert.deepEqual(r.striking.map(s=>s.query),['crm']);assert.equal(r.queries.rows[0].key,'crm');assert.equal(r.queries.rows[0].clicks,28);
 assert.equal(calls[0].date.$in[0],add(end,-27));assert.equal(calls[0].resource,'sc-domain:x');
 await dv.search('1',{range:'28'});assert.equal(calls.length,1);
});
test('search report: saved under the synced data, so a restart reads it back without building; new data builds again',async()=>{
 const {p,saved,state,built}=views();const first=await new DataViews(p).search('1',{range:'28'});assert.equal(built(),1);assert.equal(saved[0].key,'search-view:1');
 const again=await new DataViews(p).search('1',{range:'28'});assert.equal(built(),1,'a fresh instance (a restart) reads the saved report');assert.deepEqual(again.totals,first.totals);
 await new DataViews(p).search('1',{range:'7'});assert.equal(saved[0].payload.entries.length,2);
 state.snap='s2';await new DataViews(p).search('1',{range:'28'});assert.equal(built(),3,'new synced data is built again');assert.equal(saved[0].payload.entries.length,1,'reports of older data are dropped');
});
test('search report: a filter switches totals to the query × page rows and needs both windows covered to compare',async()=>{
 const {dv}=views();const r=await dv.search('1',{range:'7',queryFilter:{operator:'contains',expression:'crm'}});
 assert.equal(r.filtered,true);assert.equal(r.totals.clicks,14);assert.equal(r.totals.impressions,140);assert.equal(r.complete,true);assert.equal(r.previous.clicks,14);
 const wide=await dv.search('1',{range:'28',queryFilter:{operator:'contains',expression:'crm'}});assert.equal(wide.complete,false);assert.equal(wide.previous,null);assert.equal(wide.trend[0].clicks,null);
});
test('search report: not connected is a plain state, not an error',async()=>{
 const dv=new DataViews({sync:{snapshots:async()=>{throw new Error('请先授权');},snapshotKey:async()=>{throw new Error('请先授权');},link:async()=>{throw new Error('请先授权');}}});
 assert.deepEqual(await dv.search('1',{}),{connected:false});
});
test('GSC overview card adds CTR and position; position improves when it falls',()=>{
 const {gscCard,windowFor}=require('../../apps/nocoreach/server/providers/reach/domain/data-views.cjs');const end='2026-09-27',rows=[];
 for(let i=13;i>=0;i--)rows.push({date:add(end,-i),clicks:i<7?20:10,impressions:100,position:i<7?6:8});
 const c=gscCard(rows,end,windowFor(end,'7'));const ctr=c.metrics.find(m=>m.key==='ctr'),pos=c.metrics.find(m=>m.key==='position');
 assert.equal(ctr.value,0.2);assert.equal(ctr.previous,0.1);assert.equal(ctr.change,1);assert.equal(pos.value,6);assert.equal(pos.lowerIsBetter,true);assert.equal(pos.change,-0.25);
});
test('本站排名: queries match case-insensitively, position weighted over pages, best page kept',()=>{
 const rows=[{keyword:'open crm',page:'/a',clicks:2,impressions:100,position:12},{keyword:'open crm',page:'/b',clicks:1,impressions:300,position:8},{keyword:'other',page:'/c',clicks:9,impressions:9,position:1}];
 assert.deepEqual(sp.ranks(rows,['Open CRM','missing']),{'open crm':{clicks:3,impressions:400,position:9,page:'/b'}});
});
test('ranks view reads the last 28 synced days once per synced data',async()=>{
 const {dv,calls,end}=views();const r=await dv.ranks('1',{keywords:['CRM','none']});
 assert.equal(r.cutoff,end);assert.equal(r.ranks.crm.clicks,28);assert.equal(r.ranks.crm.position,9);assert.equal(r.ranks.none,undefined);
 await dv.ranks('1',{keywords:['erp']});assert.equal(calls.length,1);
});
test('page view: daily clicks, impressions and views of one page; www and trailing slash ignored; days without a partition stay empty',async()=>{
 const end='2026-09-27',daily=[{date:end,clicks:1,impressions:1}],parts={gsc:[{date:end,payload:[{page:'https://www.x.dev/docs/a/',clicks:3,impressions:40},{page:'https://x.dev/docs/b',clicks:9,impressions:9}]}],ga4:[{date:end,payload:[{page:'/docs/a',views:12},{page:'/docs/a?ref=1',views:3},{page:'/',views:99}]}]};
 const p={sync:{snapshots:async()=>[{key:'history-search',payload:daily},{key:'history-web',payload:daily}],link:async()=>({get:k=>k})},store:{repository:()=>({find:async o=>parts[o.filter.source].map(r=>({get:k=>r[k]}))})}};
 const r=await new DataViews(p).page('1',{url:'https://x.dev/docs/a',range:'7'});
 assert.deepEqual(r.daily.at(-1),{date:end,clicks:3,impressions:40,views:15});assert.deepEqual(r.daily[0],{date:'2026-09-21'});
 await assert.rejects(new DataViews(p).page('1',{url:'nope'}),/网址/);
});
test('search report by country: asks Search Console with the country (and text) filter, same window, coverage from synced days',async()=>{
 const {dv,end}=views();const asked=[];
 dv.gscQuery=async(_id,site,body)=>{asked.push({site,...body});if(body.dimensions[0]==='country')return [{keys:['usa'],clicks:50,impressions:900},{keys:['chn'],clicks:80,impressions:700}];
  if(body.dimensions[0]==='date')return [{keys:[end],clicks:7,impressions:70,position:6}];return [{keys:['crm','https://x/a'],clicks:7,impressions:70,position:9}];};
 const r=await dv.search('1',{range:'7',country:'usa',queryFilter:{operator:'contains',expression:'crm'}});
 assert.equal(r.country,'usa');assert.equal(r.totals.clicks,7);assert.equal(r.complete,true);assert.equal(r.trend.at(-1).clicks,7);assert.equal(r.trend[0].clicks,0);
 assert.deepEqual(r.striking.map(s=>s.query),['crm']);const pairAsk=asked.find(a=>a.dimensions.join()==='query,page');
 assert.deepEqual(pairAsk.dimensionFilterGroups[0].filters,[{dimension:'country',operator:'equals',expression:'usa'},{dimension:'query',operator:'contains',expression:'crm'}]);assert.equal(pairAsk.startDate,r.window.start);
 const plain=await dv.search('1',{range:'7'});assert.equal(plain.country,null);assert.equal(plain.countries,undefined,'the report does not wait for countries');
 const n=asked.length,c=await dv.searchCountries('1',{start:plain.window.start,end:plain.window.end});assert.deepEqual(c.countries.map(x=>x.key),['chn','usa']);await dv.searchCountries('1',{start:plain.window.start,end:plain.window.end});assert.equal(asked.length,n+1,'countries kept for the window');
 await assert.rejects(dv.searchCountries('1',{start:'x',end:'y'}),/日期不对/);
 dv.searchCache.clear();dv.gscQuery=async()=>{throw Object.assign(new Error('x'),{code:'invalid_grant'});};await assert.rejects(dv.search('1',{range:'7',country:'deu'}),/重新授权/);assert.deepEqual((await dv.searchCountries('1',{start:'2026-09-01',end:'2026-09-27'})).countries,[]);
});
