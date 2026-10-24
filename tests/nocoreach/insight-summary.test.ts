// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/insight-summary.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { InsightSummary } from '../../server/nocoreach/insight-summary.js';
import { redditCard, windowFor } from '../../server/nocoreach/data-views.js';
const test=__vitest_test;
const DAY=86400000,at=n=>new Date(Date.now()-n*DAY).toISOString(),d=n=>at(n).slice(0,10);

test('洞察 · 需要留意: one sentence per connected source with its numbers, nothing for sources not connected',async()=>{
 const p={
  rankTracking:{status:async()=>({keywords:[{keyword:'a',latest:{position:4},previous:{position:9}},{keyword:'b',latest:{position:30},previous:{position:12}},{keyword:'c',latest:{position:8},previous:{position:8}}]})},
  db:{getRepository:()=>({count:async()=>7})},
  aiSearch:{state:async()=>({brands:[{spec:{platform:'chat_gpt'},at:at(3),result:{mentions:1240,share:[{key:'NocoBase',mentions:20,own:true},{key:'x',mentions:80,own:false}],questions:[{ownCited:true},{ownCited:false}]}}],answers:[{models:{chat_gpt:{mentioned:true},claude:{mentioned:false}}},{models:{chat_gpt:{mentioned:true}}}]}),d4s:{config:()=>({verifiedAt:'t'})}},
  audit:{report:async()=>({connected:true,read:10,counts:{critical:2,warning:5,notice:1},issues:[{type:'broken',severity:'critical',title:'页面打不开',count:2,pages:[{url:'https://e.com/a'},{url:'https://e.com/b'}]},{type:'noDescription',severity:'warning',title:'缺少描述',count:5,pages:[]}]})},
  siteContent:{state:async()=>({pages:[{lastmod:at(400)},{lastmod:at(10)},{}]})},
  github:{state:async()=>({repo:'o/r',status:'active',daily:{[d(8)]:{stars:100},[d(1)]:{stars:130}}})},
  community:{state:async()=>({origin:'https://f',status:'active',topics:{1:{createdAt:at(2),replies:0},2:{createdAt:at(3),replies:0},3:{createdAt:at(4),replies:2},4:{createdAt:at(30),replies:0}}})},
  hackernews:{state:async()=>({terms:['x'],status:'active',retainedFrom:d(30),mentions:{1:{type:'story',title:'Show HN',points:50,createdAt:at(1)},2:{type:'comment',createdAt:at(2)},3:{type:'story',title:'Old',points:900,createdAt:at(20)}}})},
  reddit:{state:async()=>({terms:['x'],status:'active',retainedFrom:d(30),posts:{a:{subreddit:'selfhosted',firstSeenAt:at(1)},b:{subreddit:'selfhosted',firstSeenAt:at(2)},c:{subreddit:'nocode',firstSeenAt:at(20)}}})},
 };
 const s=new InsightSummary(p);s.views={search:async()=>({connected:true,cutoff:d(3),striking:[{},{},{}],totals:{ctr:0.0123,clicks:1200,impressions:97000}})};
 const r=await s.summary('1'),area=id=>Object.fromEntries(r.areas.find(a=>a.id===id).items.map(i=>[i.key,i]));
 // What is behind each line (2026-10-08): its rows, or this period against the last, and how to hand it off.
 {const se=area('search'),ai=area('ai'),si=area('site'),co=area('community');
  assert.deepEqual(se.rank.rows.map(x=>[x.title,x.meta,x.tag.text]),[['b','第 12 位 → 第 30 位','下降'],['a','第 9 位 → 第 4 位','上升']]);assert.equal(se.rank.handOff.playbookId,'optimize-page');
  assert.equal(se.striking.total,3);
  assert.deepEqual(si.audit.rows.map(x=>[x.title,x.meta]),[['页面打不开','2 页 · 例如 https://e.com/a；https://e.com/b']]);assert.equal(si.audit.handOff.playbookId,'tech-fix');assert.match(si.audit.handOff.title,/\{0\}/);
  assert.equal(co.forum.total,2);assert.equal(co.forum.handOff.playbookId,'community-reply','posts nobody answered: draft replies (2026-10-08)');
  assert.deepEqual(ai.answers.rows.map(x=>x.meta),['没提到：Claude']);assert.equal(ai['brand-chat_gpt'].rows[0].title,'x');assert.equal(ai['brand-chat_gpt'].rows[1].tag.text,'你');assert.equal(ai['brand-chat_gpt'].handOff.playbookId,'competitor-compare');}
 assert.deepEqual(r.areas.map(a=>a.id),['search','ai','site','community']);
 const se=area('search');assert.deepEqual([se.striking.text,se.striking.values,se.striking.source],['{0} 个查询接近首页',['3'],'搜索表现']);assert.equal(se.ctr,undefined,'average CTR has no comparison to judge it by (2026-10-24)');assert.equal(se.rank.text,'本周排名 {0} 个上升、{1} 个下降');assert.deepEqual(se.rank.values,['1','1']);assert.equal(se.rank.source,'排名跟踪');assert.match(se.rank.detail,/跟踪 3 个词，2 个在前 10 名/);assert.equal(se.saved,undefined,'saved keywords are an inventory, not something to watch');
 const ai=area('ai');assert.equal(ai['brand-chat_gpt'].text,'ChatGPT 提到你 {0} 次');assert.deepEqual(ai['brand-chat_gpt'].values,['1,240']);assert.match(ai['brand-chat_gpt'].detail,/提及份额 20%，2 个回答里 1 个引用本站/);assert.equal(ai['brand-chat_gpt'].tone,'amber');assert.equal(ai.answers.text,'{0} 个问题里 AI 没提到你');assert.deepEqual(ai.answers.values,['1']);assert.match(ai.answers.detail,/近 30 天共问了 2 个/);
 const si=area('site');assert.deepEqual([si.audit.text,si.audit.values,si.audit.source,si.audit.tone],['{0} 个审计严重问题',['2'],'网站审计','red']);assert.equal(si.stale,undefined,'pages not updated come from the site-stale rule, which counts only pages with traffic');assert.equal(si.stars,undefined,'new stars are on the metric cards, not repeated here');
 const co=area('community');
 // Volumes the metric cards have no room for: Hacker News mentions and new Reddit posts in the last 7 days.
 assert.deepEqual(co.hackernews.values,['2']);assert.deepEqual(co.reddit.values,['2']);assert.equal(co.forum.text,'{0} 个论坛主题没人回复');assert.deepEqual(co.forum.values,['2']);assert.match(co.forum.detail,/近 14 天 3 个新主题/);
 // Each line's group orders the list and colours its number: getting worse, to handle, an opportunity, share of voice.
 assert.deepEqual([se.striking.group,se.rank.group,ai.answers.group,ai['brand-chat_gpt'].group,si.audit.group,co.forum.group,co.hackernews.group,co.reddit.group],['chance','worse','handle','voice','handle','handle','voice','voice']);
 // nothing connected: no areas, except AI search when DataForSEO is verified (an invitation to look)
 const empty=new InsightSummary({db:{getRepository:()=>({count:async()=>0})},aiSearch:{state:async()=>({brands:[],answers:[]}),d4s:{config:()=>({verifiedAt:'t'})}}});empty.views={search:async()=>({connected:false})};
 assert.deepEqual((await empty.summary('1')).areas.map(a=>[a.id,a.items.map(i=>i.key)]),[['ai',['none']]]);
});


test('Current situation adds what the listed analysis rules find, counting what a rule item stands for',async()=>{
 const now=Date.now(),post=(id,likes)=>({id,createdAt:at(1),text:`post ${id}`,url:`https://x.com/${id}`,metrics:{likes,reposts:0}});
 const inputs={now,xs:{terms:['x'],status:'active',counts:{},posts:{1:post('1',500),2:post('2',400),3:post('3',300)}},
  gh:{repo:'o/r',status:'active',daily:{},releases:[{tag:'v2.0.0',publishedAt:at(2),url:'https://github.com/o/r/releases/v2.0.0'},{tag:'v2.1.0-beta.1',publishedAt:at(1),url:'https://github.com/o/r/releases/v2.1.0-beta.1'}]}};
 const s=new InsightSummary({signals:{inputs:async()=>({inputs,coverage:{}})}});s.views={search:async()=>({connected:false})};
 const r=await s.summary('1'),items=Object.fromEntries(r.areas.flatMap(a=>a.items.map(i=>[i.key,{...i,area:a.id}])));
 // One X item stands for every post over the engagement threshold; one release item for the week's releases.
 assert.deepEqual([items['rule-x-hot'].values,items['rule-x-hot'].group,items['rule-x-hot'].area,items['rule-x-hot'].to],[['3'],'chance','community','/data/x']);
 assert.deepEqual([items['rule-github-release'].values,items['rule-github-release'].group,items['rule-github-release'].area],[['2'],'chance','site']);
 // Clicking a line lists what the rule found, with the rule's name and description.
 assert.equal(items['rule-x-hot'].rows[0].url,'https://x.com/1');assert.equal(items['rule-x-hot'].text,'X 上互动多的帖子');assert.equal(items['rule-x-hot'].source,'X');
 // Every line that lists items can hand the ticked ones to the Agent, with the playbook that fits the rule.
 assert.deepEqual(items['rule-x-hot'].handOff,{playbookId:'community-reply',title:'X 上互动多的帖子：{0}'});assert.equal(items['rule-github-release'].handOff.playbookId,'release-notes');
 // A rule that is switched off adds no line.
 const off=new InsightSummary({signals:{inputs:async()=>({inputs,coverage:{}})},analysisRules:{config:async()=>({rules:{'x-hot':{enabled:false}}})}});off.views={search:async()=>({connected:false})};
 const keys=(await off.summary('1')).areas.flatMap(a=>a.items.map(i=>i.key));assert.equal(keys.includes('rule-x-hot'),false);assert.equal(keys.includes('rule-github-release'),true,'the other rules still add their lines');
});
test('Reddit tile for 洞察: threads first seen per day, counted like the Reddit page, compared with the previous period',()=>{
 const posts={a:{firstSeenAt:at(2)},b:{firstSeenAt:at(3)},c:{firstSeenAt:at(10)},first:{firstSeenAt:at(60)}};
 const card=redditCard({terms:['x'],status:'active',retainedFrom:d(60),dataThrough:d(1),posts},windowFor(d(1),'7'));
 assert.equal(card.metrics[0].label,'Reddit 新帖');assert.equal(card.metrics[0].value,2);assert.equal(card.metrics[0].previous,1);
 assert.equal(redditCard({terms:['x'],status:'active',retainedFrom:null,posts},windowFor(d(1),'7')),null);
 // Just connected: the threads of the first search count, as on the Reddit page; no change until the range is covered.
 const fresh=redditCard({terms:['x'],status:'active',retainedFrom:d(3),posts:{p1:{firstSeenAt:at(3)},p2:{firstSeenAt:at(3)},p3:{firstSeenAt:at(3)}}},windowFor(d(1),'7'));
 assert.equal(fresh.metrics[0].value,3);assert.equal(fresh.metrics[0].complete,false);assert.equal(fresh.metrics[0].change,null);
});

test('Reddit tile preserves known counts while comparisons require successful coverage',()=>{
 const now=Date.parse('2026-10-15T12:00:00Z'),w=windowFor('2026-10-14','7');
 const state={terms:['x'],status:'active',retainedFrom:'2026-09-01',posts:{a:{firstSeenAt:'2026-10-12T12:00:00Z'},b:{firstSeenAt:'2026-10-13T12:00:00Z'},old:{firstSeenAt:'2026-10-03T12:00:00Z'}}};
 const metric=extra=>redditCard({...state,...extra},w,now).metrics[0];
 // A legacy snapshot without a known successful cutoff still has useful post counts.
 assert.deepEqual(metric({}),{key:'posts',label:'Reddit 新帖',value:2,previous:null,complete:false,change:null});
 // Partial success may add posts but cannot establish coverage of either full period.
 assert.deepEqual(metric({dataThrough:'2026-10-01',lastRun:{ok:false}}),metric({}));
 // A failed refresh retains the earlier complete period, without claiming current coverage.
 assert.deepEqual(metric({dataThrough:'2026-10-07',lastRun:{ok:false}}),{key:'posts',label:'Reddit 新帖',value:2,previous:1,complete:false,change:null});
 assert.deepEqual(metric({dataThrough:'2026-10-14',lastRun:{ok:true}}),{key:'posts',label:'Reddit 新帖',value:2,previous:1,complete:true,change:1});
});
