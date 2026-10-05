const test=require('node:test'),assert=require('node:assert/strict');
const {AiQuestions,questions,mentions}=require('../../plugins/connections/server/ai-questions');
test('DataForSEO LLM mentions: questions containing the topic, per platform (ChatGPT in US English), answer, brands and sources parsed',()=>{
 const g=questions.specification({topic:'  Internal Tool Builder ',platform:'google',locationCode:2276,language:'de'});assert.deepEqual(g.request.target,[{keyword:'internal tool builder',search_filter:'include',search_scope:['question'],match_type:'word_match'}]);assert.equal(g.request.location_code,2276);assert.equal(g.request.limit,100);
 assert.equal(questions.specification({topic:'crm',platform:'chat_gpt',locationCode:2276,language:'de'}).request.location_code,2840,'ChatGPT data is US English only');assert.throws(()=>questions.specification({topic:'a',platform:'google'}),/至少 2 个字/);
 const r=questions.result({status_code:20000,cost:0.21,tasks:[{status_code:20000,result:[{items:[{question:'best open source alternative to retool',ai_search_volume:1900,answer:'You can try Appsmith or ToolJet...',sources:[{url:'https://www.reddit.com/r/x',title:'Reddit',domain:'www.reddit.com'}],brand_entities:[{title:'Appsmith'},{title:'ToolJet'}]},{question:''}]}]}]});
 assert.equal(r.costUsd,0.21);assert.deepEqual(r.result.items[0].sources,[{url:'https://www.reddit.com/r/x',title:'Reddit',domain:'reddit.com'}]);assert.deepEqual(r.result.items[0].brands,['Appsmith','ToolJet']);assert.equal(r.result.items.length,1);
 assert.equal(mentions('Try NocoBase today',[],'NocoBase'),true);assert.equal(mentions('nocobaser is not it',[],'nocobase'),false);assert.equal(mentions('',['Appsmith Inc'],'Appsmith'),true);
});
test('问题: topics suggested by the online AI, confirmed before paying; each question marked ours / gap / open with cited sites; monthly after',async()=>{
 const rows=[],runs=[];const repo={findOne:async({filter})=>{const x=rows.find(y=>y.key===filter.key);return x&&{id:x.id,get:()=>x.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 const p={db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}},env:()=>JSON.stringify({verifiedAt:'t',login:'l',password:'p',budget:5}),projectIds:async()=>['1'],
  projects:{get:async()=>({id:1,name:'NocoBase',domains:['www.nocobase.com'],memory:{brand:'开源无代码'}})},siteContent:{state:async()=>({pages:[{title:'Build internal tools'}]})},keywordService:{saved:async()=>({items:[{keyword:'open source crm'}]})},
  competitors:{state:async()=>({list:[{name:'Appsmith',site:'https://www.appsmith.com'},{name:'Retool',site:'https://retool.com'}]})},
  taskExecution:{provider:{complete:async()=>'```json\n'+JSON.stringify({topics:[{topic:'Internal Tool Builder',reason:'品类词'},{topic:'NocoBase"x',reason:'bad'},{topic:'open source crm',reason:'用途'}]})+'\n```'}}};
 const s=new AiQuestions(p);
 s.d4s.run=async(id,kind,v)=>{runs.push([v.topic,v.platform]);const items=v.platform==='google'?[{question:'best open source alternative to retool',volume:1900,answer:'Try Appsmith or ToolJet.',sources:[{url:'https://www.reddit.com/r/x',domain:'reddit.com'},{url:'https://www.appsmith.com/a',domain:'appsmith.com'}],brands:['Appsmith','ToolJet']},{question:'self hosted no code database',volume:590,answer:'NocoBase is a good pick.',sources:[{url:'https://www.nocobase.com/en',domain:'nocobase.com'}],brands:['NocoBase']},{question:'what is an internal tool',volume:300,answer:'An internal tool is software used by employees.',sources:[{url:'https://en.wikipedia.org/x',domain:'en.wikipedia.org'}],brands:[]}]:[{question:'best open source alternative to retool',volume:2400,answer:'Budibase is popular.',sources:[],brands:['Budibase']}];return {status:'completed',result:{items}};};
 let v=await s.view('1');assert.deepEqual(v.topics,[]);assert.equal(v.suggested,null);
 const topics=await s.suggest('1');assert.deepEqual(topics.map(t=>t.topic),['internal tool builder','open source crm'],'quotes refused');assert.equal(runs.length,0,'suggesting costs nothing');
 v=await s.setTopics('1',{topics:['internal tool builder']});await s.running.get('1');assert.deepEqual(runs,[['internal tool builder','chat_gpt'],['internal tool builder','google']]);
 v=await s.view('1');assert.deepEqual(v.counts,{all:4,ours:1,gap:2,open:1});
 const gap=v.questions.find(q=>q.platform==='google'&&q.question.startsWith('best'));assert.equal(gap.status,'gap');assert.deepEqual(gap.rivals,['Appsmith']);assert.deepEqual(gap.brands,['ToolJet']);assert.equal(gap.sources.find(x=>x.domain==='appsmith.com').rival,'Appsmith');
 const ours=v.questions.find(q=>q.status==='ours');assert.equal(ours.weNamed,true);assert.equal(ours.weCited,true);
 assert.deepEqual(v.citedDomains.map(d=>[d.domain,d.count]).slice(0,2),[['reddit.com',1],['appsmith.com',1]],'sites cited in answers we are missing from');
 assert.equal(v.questions[0].volume,2400,'most asked first');
 await s.refresh('1');assert.equal(runs.length,2,'within a month nothing is asked again');
 // adding a topic asks only for it; removing one forgets its questions
 await s.setTopics('1',{topics:['internal tool builder','open source crm']});await s.running.get('1');assert.deepEqual(runs.slice(2).map(r=>r[0]),['open source crm','open source crm']);
 await s.setTopics('1',{topics:['open source crm']});v=await s.view('1');assert.deepEqual(v.topics.map(t=>t.keyword),['open source crm']);
 await assert.rejects(s.setTopics('1',{topics:[]}),/至少留一个/);await assert.rejects(new AiQuestions({...p,env:()=>''}).setTopics('1',{topics:['crm']}),/请先接入并验证 DataForSEO/);
});
