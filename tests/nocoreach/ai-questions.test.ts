// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/ai-questions.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { AiQuestions, questions, mentions } from '../../server/nocoreach/ai-questions.js';
const test=__vitest_test;
test('DataForSEO LLM mentions: questions containing the topic, per platform (ChatGPT in US English), answer, brands and sources parsed',()=>{
 const g=questions.specification({topic:'  Internal Tool Builder ',platform:'google',locationCode:2276,language:'de'});assert.deepEqual(g.request.target,[{keyword:'internal tool builder',search_filter:'include',search_scope:['question'],match_type:'word_match'}]);assert.equal(g.request.location_code,2276);assert.equal(g.request.limit,100);
 assert.equal(questions.specification({topic:'crm',platform:'chat_gpt',locationCode:2276,language:'de'}).request.location_code,2840,'ChatGPT data is US English only');assert.throws(()=>questions.specification({topic:'a',platform:'google'}),/至少 2 个字/);
 const r=questions.result({status_code:20000,cost:0.21,tasks:[{status_code:20000,result:[{items:[{question:'best open source alternative to retool',ai_search_volume:1900,answer:'You can try Appsmith or ToolJet...',sources:[{url:'https://www.reddit.com/r/x',title:'Reddit',domain:'www.reddit.com'}],brand_entities:[{title:'Appsmith'},{title:'ToolJet'}]},{question:''}]}]}]});
 assert.equal(r.costUsd,0.21);assert.deepEqual(r.result.items[0].sources,[{url:'https://www.reddit.com/r/x',title:'Reddit',domain:'reddit.com'}]);assert.deepEqual(r.result.items[0].brands,['Appsmith','ToolJet']);assert.equal(r.result.items.length,1);
 assert.equal(mentions('Try NocoBase today',[],'NocoBase'),true);assert.equal(mentions('nocobaser is not it',[],'nocobase'),false);assert.equal(mentions('',['Appsmith Inc'],'Appsmith'),true);
});
test('Questions: the followed topics in Memory, looked up once DataForSEO is verified; each question marked ours / gap / open with cited sites; monthly after',async()=>{
 const rows=[],runs=[];let followed=null;const repo={findOne:async({filter})=>{const x=rows.find(y=>y.key===filter.key);return x&&{id:x.id,get:()=>x.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 const p={db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}},env:()=>JSON.stringify({verifiedAt:'t',login:'l',password:'p',budget:5}),projectIds:async()=>['1'],
  projects:{get:async()=>({id:1,name:'NocoBase',domains:['www.nocobase.com'],memory:{brand:'Open source no-code'}})},followedTopics:{of:async()=>followed},
  competitors:{state:async()=>({list:[{name:'Appsmith',site:'https://www.appsmith.com'},{name:'Retool',site:'https://retool.com'}]})}};
 const s=new AiQuestions(p);
 s.d4s.run=async(id,kind,v)=>{runs.push([v.topic,v.platform]);const items=v.platform==='google'?[{question:'best open source alternative to retool',volume:1900,answer:'Try Appsmith or ToolJet.',sources:[{url:'https://www.reddit.com/r/x',domain:'reddit.com'},{url:'https://www.appsmith.com/a',domain:'appsmith.com'}],brands:['Appsmith','ToolJet']},{question:'self hosted no code database',volume:590,answer:'NocoBase is a good pick.',sources:[{url:'https://www.nocobase.com/en',domain:'nocobase.com'}],brands:['NocoBase']},{question:'what is an internal tool',volume:300,answer:'An internal tool is software used by employees.',sources:[{url:'https://en.wikipedia.org/x',domain:'en.wikipedia.org'}],brands:[]}]:[{question:'best open source alternative to retool',volume:2400,answer:'Budibase is popular.',sources:[],brands:['Budibase']}];return {status:'completed',result:{items}};};
 // Before the project's list moved into Memory nothing is set up or asked.
 let v=await s.view('1');assert.deepEqual(v.topics,[]);await s.refresh('1');assert.equal(runs.length,0);
 followed=['Internal Tool Builder','x'];await s.topicsChanged('1');await s.running.get('1');
 assert.deepEqual(runs,[['internal tool builder','chat_gpt'],['internal tool builder','google']],'lower-cased; a topic too short to ask about is skipped');
 v=await s.view('1');assert.deepEqual(v.counts,{all:4,ours:1,gap:2,open:1});
 const gap=v.questions.find(q=>q.platform==='google'&&q.question.startsWith('best'));assert.equal(gap.status,'gap');assert.deepEqual(gap.rivals,['Appsmith']);assert.deepEqual(gap.brands,['ToolJet']);assert.equal(gap.sources.find(x=>x.domain==='appsmith.com').rival,'Appsmith');
 const ours=v.questions.find(q=>q.status==='ours');assert.equal(ours.weNamed,true);assert.equal(ours.weCited,true);
 assert.deepEqual(v.citedDomains.map(d=>[d.domain,d.count]).slice(0,2),[['reddit.com',1],['appsmith.com',1]],'sites cited in answers we are missing from');
 assert.equal(v.questions[0].volume,2400,'most asked first');
 await s.refresh('1');assert.equal(runs.length,2,'within a month nothing is asked again');
 // Adding a topic in Memory asks only for it; removing one forgets its questions; the same list changes nothing.
 followed=['internal tool builder','Open Source CRM'];await s.topicsChanged('1');await s.running.get('1');assert.deepEqual(runs.slice(2).map(r=>r[0]),['open source crm','open source crm']);
 followed=['open source crm'];await s.topicsChanged('1');await s.running.get('1');v=await s.view('1');assert.deepEqual(v.topics.map(t=>t.keyword),['open source crm']);assert.ok(v.questions.every(q=>q.topics.join()==='open source crm'));
 await s.topicsChanged('1');assert.equal(s.running.has('1'),false);assert.equal(runs.length,4);
 // Only the first ten are asked about, as on the Memory page.
 followed=Array.from({length:12},(_,i)=>`topic ${i+1}`);await s.syncTopics('1');assert.deepEqual((await s.view('1')).topics.map(t=>t.keyword).slice(-1),['topic 10']);
 // Without DataForSEO the list follows Memory but nothing is paid for.
 const off=new AiQuestions({...p,env:()=>''});off.d4s.run=async()=>{throw new Error('not asked');};await off.refresh('1');
});
