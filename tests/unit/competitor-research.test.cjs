const test=require('node:test'),assert=require('node:assert/strict');
const {CompetitorResearch,history,gap,pages,keepGap}=require('../../plugins/connections/server/competitor-research');
const ok=(items,cost=0.012)=>({status_code:20000,cost,tasks:[{status_code:20000,result:[{items}]}]});

test('DataForSEO Labs: a year of traffic, the keyword gap (we do not rank) and top pages, parsed; brand words left out of the gap',()=>{
 const h=history.specification({target:'https://www.Retool.com/pricing',locationCode:2840,language:'en'});assert.equal(h.request.target,'retool.com');assert.equal(h.path,'dataforseo_labs/google/historical_rank_overview/live');assert.match(h.request.date_from,/^\d{4}-\d{2}-01$/);
 const months=history.result(ok([{year:2026,month:9,metrics:{organic:{etv:1200.4,count:900,pos_1:10,pos_2_3:20,pos_4_10:70}}},{year:2026,month:8,metrics:{organic:{etv:1000,count:850,pos_1:8,pos_2_3:20,pos_4_10:60}}}])).result.months;
 assert.deepEqual(months,[{date:'2026-08',etv:1000,count:850,top3:28,top10:88},{date:'2026-09',etv:1200,count:900,top3:30,top10:100}]);
 const g=gap.specification({target:'appsmith.com',ours:'www.nocobase.com',locationCode:2840,language:'en'});assert.deepEqual([g.request.target1,g.request.target2,g.request.intersections,g.request.limit],['appsmith.com','nocobase.com',false,200]);assert.throws(()=>gap.specification({target:'a.com'}),/本站域名/);
 const items=gap.result(ok([{keyword_data:{keyword:'Internal Tool Builder',keyword_info:{search_volume:2900},keyword_properties:{keyword_difficulty:41},search_intent_info:{main_intent:'commercial'}},first_domain_serp_element:{rank_group:3,url:'https://www.appsmith.com/use-cases',etv:310.7}}])).result.items;
 assert.deepEqual(items[0],{keyword:'internal tool builder',volume:2900,difficulty:41,intent:'commercial',position:3,url:'https://www.appsmith.com/use-cases',traffic:311});
 assert.deepEqual(keepGap([{keyword:'appsmith login',position:1},{keyword:'internal tool builder',position:3},{keyword:'low code app',position:45}],'Appsmith','appsmith.com').map(x=>x.keyword),['internal tool builder'],'brand words and ranks past 20 are left out');
 assert.deepEqual(pages.result(ok([{page_address:'https://appsmith.com/blog/x',metrics:{organic:{etv:50.2,count:30}}},{page_address:'javascript:1'}])).result.items,[{url:'https://appsmith.com/blog/x',traffic:50,keywords:30}]);
 assert.equal(history.result({status_code:40000,tasks:[]}).status,'failed');
});

function setup({verified=true}={}){const rows=[],runs=[];const repo={findOne:async({filter})=>{const x=rows.find(y=>y.key===filter.key);return x&&{id:x.id,get:()=>x.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 const list=[{id:'a',name:'Appsmith',site:'https://www.appsmith.com',repo:'appsmithorg/appsmith'},{id:'b',name:'Retool',site:'https://retool.com'},{id:'c',name:'Lowdefy',site:'',repo:'lowdefy/lowdefy'}];
 const now=new Date().toISOString();
 const p={db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}},env:()=>verified?JSON.stringify({verifiedAt:'t',login:'l',password:'p',budget:5}):'',projectIds:async()=>['1'],
  projects:{get:async()=>({name:'NocoBase',domains:['www.nocobase.com']})},
  competitors:{state:async()=>({list,events:[{competitorId:'a',type:'page',title:'New page',url:'https://appsmith.com/new',at:now},{competitorId:'a',type:'release',title:'发布 v1.62',url:'u',at:now}]}),status:async()=>({list:[{id:'a',stars:35100,week:120,latestRelease:{name:'v1.62'}},{id:'b',stars:null,week:null,latestRelease:null},{id:'c',stars:900,week:3,latestRelease:null}]})},
  trends:{status:async()=>({product:'NocoBase',summary:[{term:'NocoBase',recent:68,change:0.31},{term:'Appsmith',recent:36,change:0.02}]})},
  github:{status:async()=>({latest:{stars:24414},starDelta7:150,releases:[{name:'v2.2'}]})},
  siteContent:{state:async()=>({pages:[{url:'https://nocobase.com/a',firstSeenAt:now},{url:'https://nocobase.com/b',firstSeenAt:'2025-01-01T00:00:00Z'}]})},
  aiSearch:{state:async()=>({brands:[{result:{share:[{key:'NocoBase',mentions:18},{key:'Appsmith',mentions:22},{key:'Retool',mentions:60}]}}]})}};
 const s=new CompetitorResearch(p);
 s.d4s.run=async(id,kind,v)=>{runs.push([kind,v.target,v.locationCode]);if(kind==='competitor-history')return {status:'completed',result:{months:[{date:'2026-06',etv:900,count:800},{date:'2026-07',etv:950,count:820},{date:'2026-08',etv:1000,count:850},{date:'2026-09',etv:1080,count:900,top10:100}]}};
  if(kind==='competitor-gap')return {status:'completed',result:{items:[{keyword:'appsmith pricing',position:2},{keyword:'internal tool builder',position:3,volume:2900}]}};return {status:'completed',result:{items:[{url:'https://appsmith.com/blog/x',traffic:50,keywords:30}]}};};
 return {s,rows,runs};}

test('总览: our site first, competitors with a website looked up once (history, gap, pages), the rest from data already there; monthly after',async()=>{
 const {s,runs}=setup();let v=await s.view('1');assert.equal(v.refreshing,true,'opening the page with nothing yet starts the lookups');await s.running.get('1');
 assert.deepEqual(runs.map(r=>r.slice(0,2)),[['competitor-history','nocobase.com'],['competitor-history','appsmith.com'],['competitor-gap','appsmith.com'],['competitor-pages','appsmith.com'],['competitor-history','retool.com'],['competitor-gap','retool.com'],['competitor-pages','retool.com']],'no lookups for a competitor without a website');
 v=await s.view('1');const [own,app,ret,low]=v.rows;
 assert.equal(own.own,true);assert.deepEqual([own.traffic,own.trafficChange,own.keywords,own.interest,own.stars,own.starsWeek,own.pages30,own.release],[1080,0.2,900,68,24414,150,1,'v2.2']);assert.equal(own.aiShare,0.18);
 assert.deepEqual([app.interest,app.stars,app.aiShare,app.pages30,app.release],[36,35100,0.22,1,'v1.62']);assert.deepEqual(app.gap.map(x=>x.keyword),['internal tool builder']);assert.equal(app.topPages.length,1);assert.equal(app.events.length,2);
 assert.equal(ret.aiShare,0.6);assert.equal(low.searched,false);assert.equal(low.traffic,null);assert.equal(low.stars,900);
 const n=runs.length;await s.refresh('1');assert.equal(runs.length,n,'within 30 days nothing is asked again');
 // another market: everything is looked up again in that market
 await s.setMarket('1',{locationCode:2276,language:'de'});await s.running.get('1');assert.equal(runs.length,n+7);assert.equal(runs.at(-1)[2],2276);
 v=await s.view('1');assert.equal(v.marketLabel,'德国 · 德语');
 // DataForSEO not verified: free columns only, nothing asked
 const none=setup({verified:false});v=await none.s.view('1');assert.equal(v.dataforseo,false);assert.equal(none.runs.length,0);assert.equal(v.rows[1].stars,35100);
});
