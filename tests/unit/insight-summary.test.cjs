const test=require('node:test'),assert=require('node:assert/strict');
const {InsightSummary}=require('../../plugins/connections/server/insight-summary');
const {redditCard,windowFor}=require('../../plugins/connections/server/data-views');
const DAY=86400000,at=n=>new Date(Date.now()-n*DAY).toISOString(),d=n=>at(n).slice(0,10);

test('洞察 · 各方面一览: numbers per area from each connected source, nothing for sources not connected',async()=>{
 const p={
  rankTracking:{status:async()=>({keywords:[{keyword:'a',latest:{position:4},previous:{position:9}},{keyword:'b',latest:{position:30},previous:{position:12}},{keyword:'c',latest:{position:8},previous:{position:8}}]})},
  db:{getRepository:()=>({count:async()=>7})},
  aiSearch:{state:async()=>({brands:[{spec:{platform:'chat_gpt'},at:at(3),result:{mentions:1240,share:[{key:'NocoBase',mentions:20,own:true},{key:'x',mentions:80,own:false}],questions:[{ownCited:true},{ownCited:false}]}}],answers:[{models:{chat_gpt:{mentioned:true},claude:{mentioned:false}}},{models:{chat_gpt:{mentioned:true}}}]}),d4s:{config:()=>({verifiedAt:'t'})}},
  audit:{report:async()=>({connected:true,read:10,counts:{critical:2,warning:5,notice:1}})},
  siteContent:{state:async()=>({pages:[{lastmod:at(400)},{lastmod:at(10)},{}]})},
  github:{state:async()=>({repo:'o/r',status:'active',daily:{[d(8)]:{stars:100},[d(1)]:{stars:130}}})},
  community:{state:async()=>({origin:'https://f',status:'active',topics:{1:{createdAt:at(2),replies:0},2:{createdAt:at(3),replies:0},3:{createdAt:at(4),replies:2},4:{createdAt:at(30),replies:0}}})},
  hackernews:{state:async()=>({terms:['x'],status:'active',mentions:{1:{type:'story',title:'Show HN',points:50,createdAt:at(1)},2:{type:'comment',createdAt:at(2)},3:{type:'story',title:'Old',points:900,createdAt:at(20)}}})},
  reddit:{state:async()=>({terms:['x'],status:'active',retainedFrom:d(30),posts:{a:{subreddit:'selfhosted',firstSeenAt:at(1)},b:{subreddit:'selfhosted',firstSeenAt:at(2)},c:{subreddit:'nocode',firstSeenAt:at(20)}}})},
 };
 const s=new InsightSummary(p);s.views={search:async()=>({connected:true,cutoff:d(3),striking:[{},{},{}],totals:{ctr:0.0123,clicks:1200,impressions:97000}})};
 const r=await s.summary('1'),area=id=>Object.fromEntries(r.areas.find(a=>a.id===id).items.map(i=>[i.key,i]));
 assert.deepEqual(r.areas.map(a=>a.id),['search','ai','site','community']);
 const se=area('search');assert.equal(se.striking.value,'3');assert.equal(se.ctr.value,'1.2%');assert.equal(se.rank.value,'1');assert.equal(se.rank.note,'下降 1');assert.equal(se.rank.label,'本周排名上升');assert.match(se.rank.detail,/跟踪 3 个词，2 个在前 10 名/);assert.equal(se.saved.value,'7');
 const ai=area('ai');assert.equal(ai['brand-chat_gpt'].value,'1,240');assert.match(ai['brand-chat_gpt'].detail,/提及份额 20%，2 个回答里 1 个引用本站/);assert.equal(ai['brand-chat_gpt'].tone,'amber');assert.equal(ai.answers.value,'1');assert.equal(ai.answers.note,'共 2 个');
 const si=area('site');assert.equal(si.audit.value,'2');assert.equal(si.audit.label,'审计严重问题');assert.equal(si.audit.tone,'red');assert.equal(si.stale.value,'1');assert.equal(si.stars,undefined,'new stars are on the metric cards, not repeated here');
 const co=area('community');assert.equal(co.hn,undefined);assert.equal(co.reddit,undefined);assert.equal(co.forum.value,'2');assert.match(co.forum.detail,/近 14 天 3 个新主题/);
 // nothing connected: no areas, except AI search when DataForSEO is verified (an invitation to look)
 const empty=new InsightSummary({db:{getRepository:()=>({count:async()=>0})},aiSearch:{state:async()=>({brands:[],answers:[]}),d4s:{config:()=>({verifiedAt:'t'})}}});empty.views={search:async()=>({connected:false})};
 assert.deepEqual((await empty.summary('1')).areas.map(a=>[a.id,a.items.map(i=>i.key)]),[['ai',['none']]]);
});

test('Reddit tile for 洞察: threads first seen per day, counted like the Reddit page, compared with the previous period',()=>{
 const posts={a:{firstSeenAt:at(2)},b:{firstSeenAt:at(3)},c:{firstSeenAt:at(10)},first:{firstSeenAt:at(60)}};
 const card=redditCard({terms:['x'],status:'active',retainedFrom:d(60),posts},windowFor(d(1),'7'));
 assert.equal(card.metrics[0].label,'Reddit 新帖');assert.equal(card.metrics[0].value,2);assert.equal(card.metrics[0].previous,1);
 assert.equal(redditCard({terms:['x'],status:'active',retainedFrom:null,posts},windowFor(d(1),'7')),null);
 // Just connected: the threads of the first search count, as on the Reddit page; no change until the range is covered.
 const fresh=redditCard({terms:['x'],status:'active',retainedFrom:d(3),posts:{p1:{firstSeenAt:at(3)},p2:{firstSeenAt:at(3)},p3:{firstSeenAt:at(3)}}},windowFor(d(1),'7'));
 assert.equal(fresh.metrics[0].value,3);assert.equal(fresh.metrics[0].complete,false);assert.equal(fresh.metrics[0].change,null);
});
