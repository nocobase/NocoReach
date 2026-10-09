const test=require('node:test'),assert=require('node:assert/strict');
const {AiSearch,brandSpec,brandResult,brandInput,answerResult,pickModel,target}=require('../../apps/nocoreach/server/providers/reach/domain/ai-search.cjs');
const {aiSearchSignals}=require('../../apps/nocoreach/server/providers/reach/domain/signals.cjs');
// In-memory nrKeywordRuns, as in dataforseo.test.cjs.
function memory(){const rows=[];let id=0;const match=(r,f={})=>Object.entries(f).every(([k,v])=>v&&typeof v==='object'?('$in' in v?v.$in.includes(r[k]):'$gte' in v?r[k]>=v.$gte:false):r[k]===v);
 const wrap=r=>r&&{...r,get:k=>r[k],toJSON:()=>({...r})};
 return {rows,repo:{findOne:async o=>wrap(o.filterByTk!==undefined?rows.find(r=>r.id===o.filterByTk):rows.filter(r=>match(r,o.filter)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]),find:async o=>rows.filter(r=>match(r,o.filter)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id-a.id).map(wrap),
  create:async o=>{const r={id:++id,createdAt:new Date().toISOString(),...o.values};rows.push(r);return wrap(r);},update:async o=>Object.assign(rows.find(r=>r.id===o.filterByTk),o.values)}};}
function service(reply){const m=memory(),calls=[];const env={NOREACH_DATAFORSEO_1:JSON.stringify({login:'a',password:'b',budget:5,verifiedAt:'t'})};
 const p={env:k=>env[k],variable:async()=>{},project:async()=>({id:1,name:'NocoBase',domains:['www.nocobase.com']}),app:{logger:{warn(){}}},store:{repository:()=>m.repo,transaction:fn=>fn({}),query:async()=>{}}};
 global.fetch=async(url,init)=>{const path=String(url).replace('https://api.dataforseo.com/v3/','');const body=init.body?JSON.parse(init.body)[0]:null;calls.push({path,body,method:init.method});return {ok:true,json:async()=>reply(path,body)};};
 return {s:new AiSearch(p),m,calls};}
const ok=(result,cost=0.1)=>({status_code:20000,cost,tasks:[{status_code:20000,cost,result:[result]}]});
const mentions={items:[
 {question:'best open source low-code platform',ai_search_volume:900,answer:'Popular picks are Appsmith and NocoBase, which is plugin based.',sources:[{url:'https://www.nocobase.com/en/blog/x',domain:'www.nocobase.com',title:'NocoBase blog'},{url:'https://g2.com/low-code',domain:'g2.com'}],brand_entities:[{title:'NocoBase'},{title:'Appsmith'}]},
 {question:'retool alternatives self hosted',ai_search_volume:2400,answer:'Consider nocobase or Budibase.',sources:[{url:'https://g2.com/low-code',domain:'g2.com'},{url:'javascript:alert(1)',domain:'evil.com'}]},
 {question:'',ai_search_volume:5}]};
const brandReply=(path)=>path.includes('aggregated_metrics')&&!path.includes('cross')?ok({total:{platform:[{key:'chat_gpt',mentions:1240,ai_search_volume:86000},{key:'google',mentions:3}]}},0.101)
 :path.includes('cross')?ok({items:[{key:'NocoBase',platform:[{key:'chat_gpt',mentions:320}]},{key:'appsmith.com',platform:[{key:'chat_gpt',mentions:410}]}]},0.101):ok(mentions,0.2);

test('brand lookup: one query per platform with totals, the question sample and, with competitors, the share of mentions',async()=>{
 const input=brandInput({target:'NocoBase',platform:'chat_gpt',locationCode:2276,language:'de',competitors:['appsmith.com','nocobase',' ']},{domains:['www.nocobase.com']});
 assert.deepEqual([input.locationCode,input.language],[2840,'en'],'ChatGPT mention data is US English only');assert.deepEqual(input.competitors,['appsmith.com']);assert.deepEqual(input.own,['nocobase.com']);
 const spec=brandSpec(input);assert.deepEqual(spec.requests.map(r=>r.path.split('/')[2]),['aggregated_metrics','search','cross_aggregated_metrics']);
 assert.deepEqual(spec.requests[0].body.target,[{keyword:'NocoBase',search_filter:'include',search_scope:['any','brand_entities'],match_type:'word_match'}]);
 assert.deepEqual(spec.requests[2].body.targets.map(t=>t.aggregation_key),['NocoBase','appsmith.com']);assert.equal(spec.requests[2].body.targets[1].target[0].domain,'appsmith.com');
 assert.equal(spec.estimatedUsd,0.402);assert.equal(brandSpec({...input,competitors:[]}).requests.length,2);
 assert.deepEqual(target('https://www.Example.com/docs'),{domain:'example.com',include_subdomains:true,search_filter:'include',search_scope:['any']});
 assert.throws(()=>brandInput({target:'x',platform:'google',locationCode:2840,language:'en'},{}),/品牌/);assert.throws(()=>brandInput({target:'NocoBase',platform:'google',locationCode:1,language:'en'},{}),/地区/);
 const {s,calls}=service(brandReply);
 const run=await s.brand('1',{target:'NocoBase',platform:'chat_gpt',competitors:['appsmith.com'],requestKey:'brand-abcdefgh'});
 assert.equal(run.status,'completed');assert.equal(run.costUsd,0.402);assert.equal(calls.length,3,'three requests, one after another');
 const r=run.result;assert.equal(r.mentions,1240);assert.equal(r.aiSearchVolume,86000);
 assert.deepEqual(r.questions.map(q=>[q.question,q.ownCited]),[['retool alternatives self hosted',false],['best open source low-code platform',true]],'by AI search volume; empty questions dropped');
 assert.match(r.questions[1].excerpt,/NocoBase, which is plugin based/);assert.equal(r.questions[0].sources.find(x=>x.domain==='evil.com').url,'','unsafe links are not kept');
 assert.deepEqual(r.pages.slice(0,2).map(p=>[p.domain,p.count,p.own]),[['g2.com',2,false],['nocobase.com',1,true]]);
 assert.deepEqual(r.share,[{key:'NocoBase',mentions:320,own:true},{key:'appsmith.com',mentions:410,own:false}]);
 // the same lookup within 30 days is the saved run
 assert.equal((await s.brand('1',{target:'NocoBase',platform:'chat_gpt',competitors:['appsmith.com'],requestKey:'brand-ijklmnop'})).id,run.id);assert.equal(calls.length,3);
});

test('brand lookup: a refused request fails the run with the provider code; costs add up only when all are known',()=>{
 const spec=brandSpec(brandInput({target:'nocobase.com',platform:'google',locationCode:2840,language:'en'},{domains:[]}));
 const failed=brandResult([ok({total:{}},0.101),{status_code:20000,cost:0,tasks:[{status_code:40501,cost:0}]}],spec);assert.equal(failed.status,'failed');assert.equal(failed.errorCode,'provider_status_40501');assert.equal(failed.costUsd,0.101);
 assert.equal(brandResult([{status_code:20000,tasks:[{status_code:20000,result:[{}]}]},ok({items:[]})],spec).costUsd,null);
});

test('问 AI: the model name comes from the free catalog; an unreadable catalog skips the model without a paid call',async()=>{
 assert.equal(pickModel('chat_gpt',['gpt-5.5','gpt-5.6-luna','gpt-5.5-2026-04-23']),'gpt-5.6-luna');assert.equal(pickModel('claude',['claude-sonnet-4-5','claude-sonnet-5','claude-opus-5']),'claude-sonnet-5');
 assert.equal(pickModel('gemini',['gemini-2.5-flash']),null);
 const answer={model_name:'claude-sonnet-5',web_search:true,fan_out_queries:['open source no-code'],items:[{type:'message',sections:[{type:'text',text:'Top picks: **NocoBase** and Budibase.',annotations:[{type:'url_citation',url:'https://docs.nocobase.com/x',title:'Docs'},{url:'https://budibase.com',title:'Budibase'},{url:'https://budibase.com'}]}]}]};
 const {s,calls}=service(path=>path.endsWith('/models')?{status_code:20000,tasks:[{status_code:20000,result:[{model_name:'claude-sonnet-4-6'},{model_name:'claude-sonnet-5'}]}]}:ok(answer,0.14));
 const run=await s.ask('1',{question:'What is the best open source no-code platform?',model:'claude',requestKey:'ask-abcdefgh'});
 assert.equal(calls[0].method,'GET');assert.equal(calls[1].path,'ai_optimization/claude/llm_responses/live');
 assert.deepEqual(calls[1].body,{user_prompt:'What is the best open source no-code platform?',model_name:'claude-sonnet-5',web_search:true,force_web_search:true,max_output_tokens:2048});
 assert.equal(run.status,'completed');assert.equal(run.result.mentioned,true);assert.equal(run.result.ownCited,1);assert.deepEqual(run.result.citations.map(c=>c.domain),['docs.nocobase.com','budibase.com']);
 await s.ask('1',{question:'Another question here',model:'claude',requestKey:'ask-ijklmnop'});assert.equal(calls.filter(c=>c.method==='GET').length,1,'the catalog is read once an hour');
 const broken=service(path=>path.endsWith('/models')?{status_code:20000,tasks:[{status_code:20000,result:[]}]}:ok(answer));
 await assert.rejects(broken.s.ask('1',{question:'What is the best CRM?',model:'gemini',requestKey:'ask-qrstuvwx'}),/模型目录/);assert.equal(broken.calls.filter(c=>c.method==='POST').length,0,'no paid call');
 await assert.rejects(s.ask('1',{question:'hi',model:'claude',requestKey:'ask-yzabcdef'}),/问题/);await assert.rejects(s.ask('1',{question:'What is best?',model:'grok',requestKey:'ask-yzabcdef'}),/模型/);
 const none=answerResult(ok({items:[{sections:[{text:'Try Budibase.'}]}]}),{model:'chat_gpt',own:['nocobase.com'],brand:'NocoBase'});assert.equal(none.result.mentioned,false);
 // only the answer itself: the model's reasoning is left out (and does not count as a mention); Gemini's redirect links name the real site
 const gem=answerResult(ok({items:[{type:'reasoning',sections:[{type:'summary_text',text:'Thinking about NocoBase and others'}]},{type:'message',sections:[{type:'text',text:'Try Budibase.',annotations:[{url:'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc',title:'nocobase.com'},{url:'https://vertexaisearch.cloud.google.com/grounding-api-redirect/def',title:'Budibase docs'}]}]}]}),{model:'gemini',own:['nocobase.com'],brand:'NocoBase'});
 assert.equal(gem.result.text,'Try Budibase.');assert.equal(gem.result.mentioned,false);assert.deepEqual(gem.result.citations.map(c=>[c.domain,c.own]),[['nocobase.com',true],['vertexaisearch.cloud.google.com',false]]);
});

test('recent lookups and questions group the latest run per platform or model; the daily analysis gets AI search signals',async()=>{
 const {s,m}=service(()=>({}));const at=n=>new Date(Date.now()-n*60000).toISOString();
 const brand=(platform,share,questions,n)=>({id:m.rows.length+1,projectId:'1',status:'completed',createdAt:at(n),spec:{kind:'ai-brand',platform,target:'NocoBase',competitors:['appsmith.com'],group:'g1',locationCode:2840,language:'en'},result:{share,questions}});
 m.rows.push(brand('chat_gpt',[{key:'NocoBase',mentions:100,own:true},{key:'appsmith.com',mentions:200,own:false}],Array.from({length:6},(_,i)=>({question:'q'+i,ownCited:false})),1),brand('google',null,[],2),brand('chat_gpt',null,[],3));
 m.rows.push({id:9,projectId:'1',status:'completed',createdAt:at(4),spec:{kind:'ai-answer',model:'claude',question:'Best no-code tool?',group:'best no-code tool?'},result:{mentioned:false,citations:[{domain:'budibase.com',own:false}]}},{id:10,projectId:'1',status:'completed',createdAt:at(5),spec:{kind:'ai-answer',model:'chat_gpt',question:'Best no-code tool?',group:'best no-code tool?'},result:{mentioned:true,citations:[]}},{id:11,projectId:'1',status:'completed',createdAt:at(6),spec:{kind:'keywords'}});
 const list=await s.list('1');assert.deepEqual(list.map(e=>[e.kind,e.label,Object.keys(e.runs).sort().join()]),[['brand','NocoBase','chat_gpt,google'],['answer','Best no-code tool?','chat_gpt,claude']]);
 assert.equal(list[0].runs.chat_gpt.id,'1','the latest run per platform');
 assert.deepEqual((await s.open('1',{kind:'answer',group:'best no-code tool?'})).runs.map(r=>r.spec.model),['claude','chat_gpt']);
 const sig=aiSearchSignals({ai:await s.state('1')});
 assert.deepEqual(sig.map(x=>x.key.split(':')[0]),['ai-share','ai-uncited','ai-answer']);assert.ok(sig.every(x=>x.actionable&&x.source==='ai-search'));
 assert.match(sig[0].title,/appsmith.com 被提到的次数比你多/);assert.match(sig[2].title,/Claude 没有提到你/);assert.match(sig[2].facts[1],/budibase.com/);
});

// 提到竞品、没提到你 (2026-10-09): one competitor per request (the paid test showed several competitors must all be
// mentioned), your brand excluded, and the answers that still name you left out here.
test('competitor gap: one competitor, your brand excluded, 50 questions; answers naming you are removed and counted',()=>{
 const {gapSpec,gapResult}=require('../../apps/nocoreach/server/providers/reach/domain/ai-search.cjs');
 const spec=gapSpec({value:'NocoBase',competitor:'Retool',platform:'google',locationCode:2840,language:'en',own:['nocobase.com']});
 assert.equal(spec.requests.length,1);assert.equal(spec.estimatedUsd,0.15);const body=spec.requests[0].body;assert.equal(body.limit,50);
 assert.deepEqual(body.target.map(t=>[t.keyword||t.domain,t.search_filter]),[['Retool','include'],['NocoBase','exclude']]);
 const items=[{question:'internal tooling',ai_search_volume:90,answer:'Retool and NocoBase are both options',sources:[]},{question:'best internal tool builder',ai_search_volume:4400,answer:'Many teams pick Retool for admin panels.',sources:[{url:'https://retool.com/x',title:'Retool',domain:'retool.com'}],brand_entities:[{title:'Retool'}]},{question:'admin panel builder',ai_search_volume:70,answer:'See https://docs.nocobase.com',sources:[]}];
 const r=gapResult([ok({total_count:121,items})],spec).result;
 assert.equal(r.removed,2,'the two answers naming you (in text or a link) are left out');assert.equal(r.totalCount,121);
 assert.deepEqual(r.questions.map(q=>[q.question,q.volume]),[['best internal tool builder',4400]]);assert.match(r.questions[0].excerpt,/pick Retool for admin panels/);assert.equal(r.questions[0].sources[0].domain,'retool.com');
 assert.equal(gapResult([{status_code:40200,tasks:[{status_code:40200}]}],spec).status,'failed');
});
