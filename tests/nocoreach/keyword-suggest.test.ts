// @ts-nocheck
// Keywords › AI suggestions, demand first: seeds → DataForSEO's real keywords → at least MIN_VOLUME → the AI's pick.
import { test, vi, afterEach } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { KeywordSuggest, specification, result, seedSpec, ideasSpec, labsResult, score, runUsd, MIN_VOLUME } from '../../server/nocoreach/keyword-suggest.js';
import { keywordDigTool } from '../../server/nocoreach/online-agent/keyword-tool.js';
const realFetch=global.fetch;
afterEach(()=>{global.fetch=realFetch;});
// In-memory nrKeywordRuns and nrSnapshots, with the filters the services use.
function memory(){const rows=[];let id=0;const match=(r,f={})=>Object.entries(f).every(([k,v])=>v&&typeof v==='object'?('$in' in v?v.$in.includes(r[k]):'$gte' in v?r[k]>=v.$gte:false):r[k]===v);
 const wrap=r=>r&&{...r,get:k=>r[k],toJSON:()=>({...r})};
 return {rows,repo:{findOne:async o=>wrap(o.filterByTk!==undefined?rows.find(r=>r.id===o.filterByTk):rows.filter(r=>match(r,o.filter)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]),find:async o=>rows.filter(r=>match(r,o.filter)).map(wrap),
  create:async o=>{const r={id:++id,createdAt:new Date().toISOString(),...o.values};rows.push(r);return wrap(r);},update:async o=>Object.assign(rows.find(r=>r.id===o.filterByTk),o.values)}};}
const kw=(keyword,volume,difficulty=30,intent='commercial')=>({keyword,keyword_info:{search_volume:volume,cpc:1.5,competition:0.4,monthly_searches:[{year:2026,month:9,search_volume:volume}]},keyword_properties:{keyword_difficulty:difficulty},search_intent_info:{main_intent:intent}});
// What DataForSEO answers for each seed, keyword ideas and the Search Console overview; the volume filter is ours to apply.
const SUGGEST={
 'internal tool builder':[kw('internal tool builder',2400,38),kw('internal tool builder open source',320,22),kw('internal tool builder nocobase',10)],
 'approval workflow':[kw('approval workflow software',1300,41),kw('approval workflow example',210,18,'informational')],
 'retool alternative':[kw('retool alternative',1600,35),kw('retool alternative open source',390,24)],
};
const IDEAS=[kw('no code database',2900,47),kw('open source low code platform',3600,52),kw('crm for startups',8100,70)];
function fetchFor({timeout=new Set()}={}){const calls=[];
 global.fetch=async(url,init)=>{const path=String(url).replace('https://api.dataforseo.com/v3/',''),body=JSON.parse(init.body)[0];calls.push({path,body});
  const seed=body.keyword;if(timeout.has(seed))throw Object.assign(new Error('timeout'),{name:'TimeoutError'});
  const items=path.includes('keyword_suggestions')?SUGGEST[seed]||[]:path.includes('keyword_ideas')?(body.keywords.some(k=>SUGGEST[k])?IDEAS:[]):path.includes('keyword_overview')?body.keywords.map(k=>kw(k,k==='open source low code platform'?3600:20)):[];
  const n=items.length;return {ok:true,json:async()=>({status_code:20000,cost:Number((0.01+n*0.0001).toFixed(4)),tasks:[{status_code:20000,result:[{seed_keyword:seed,items}]}]})};};
 return calls;}
const SEEDS=['internal tool builder','approval workflow','retool alternative'];
const curated=extra=>'```json\n'+JSON.stringify({keywords:[
 {keyword:'open source low code platform',group:4,relevance:3,reason:'正对产品品类，已排第 14',page:'https://x.com/'},
 {keyword:'retool alternative',group:3,relevance:3,reason:'竞品用户在找替代',page:'https://evil.com/'},
 {keyword:'approval workflow software',group:2,relevance:2,reason:'审批流是高频需求',page:'https://x.com/workflow'},
 {keyword:'internal tool builder nocobase',group:1,relevance:3,reason:'搜索量不到 50'},
 {keyword:'build your own crm without code',group:1,relevance:3,reason:'AI 自己想的词'},
 {keyword:'crm for startups',group:'品类与行业词',relevance:1,reason:'沾边'},
 ...(extra||[])]})+'\n```';
function setup({budget=5,seeds=SEEDS,curate=curated(),verified=true,ai=true}={}){const runs=memory(),snaps=memory(),prompts=[],stored=[];
 const env={NOREACH_DATAFORSEO_1:verified?JSON.stringify({login:'l',password:'p',budget,verifiedAt:'t'}):''};
 const p={env:k=>env[k],app:{logger:{warn(){}}},db:{getRepository:n=>n==='nrKeywordRuns'?runs.repo:snaps.repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}},
  projects:{get:async()=>({id:1,name:'NocoBase',domains:['x.com'],memory:{brand:'开源无代码平台',competitors:'Retool'}})},
  siteContent:{state:async()=>({pages:[{url:'https://x.com/',title:'NocoBase',type:'page'},{url:'https://x.com/workflow',title:'Workflow',type:'page'}]})},
  sync:{snapshots:async()=>[{key:'queries-28',payload:[{keyword:'open source low code platform',clicks:120,impressions:5000,position:14.2,page:'https://x.com/'},{keyword:'nocobase login',clicks:300,impressions:900,position:1,page:'https://x.com/'}]}]},
  competitors:{state:async()=>({list:[{name:'Retool'}]})},keywordService:{store:async(id,entries)=>{stored.push(...entries);return {saved:entries.length,skipped:0};}},
  taskExecution:ai?{provider:{complete:async(system,user,tag)=>{prompts.push({tag,system,input:JSON.parse(user)});return tag==='keyword-seeds'?'```json\n'+JSON.stringify({seeds:typeof seeds==='function'?seeds(JSON.parse(user)):seeds})+'\n```':typeof curate==='function'?curate(JSON.parse(user)):curate;}}}:undefined};
 return {s:new KeywordSuggest(p,async()=>({text:'<p>home</p>'})),runs,snaps,prompts,stored};}
const finish=async(s,v)=>(await s.start('1',v)).promise;

test('DataForSEO requests: suggestions per seed and ideas for all seeds ask only for keywords with enough searches; replies are filtered again',()=>{
 const one=seedSpec({seed:'  Approval  Workflow ',locationCode:2840,language:'en'});
 assert.equal(one.path,'dataforseo_labs/google/keyword_suggestions/live');
 assert.deepEqual(one.request,{keyword:'approval workflow',location_code:2840,language_code:'en',include_seed_keyword:true,ignore_synonyms:true,filters:['keyword_info.search_volume','>=',MIN_VOLUME],order_by:['keyword_info.search_volume,desc'],limit:30});
 assert.equal(one.estimatedUsd,0.013);
 const all=ideasSpec({seeds:['retool alternative','Approval workflow','retool alternative'],locationCode:2392,language:'ja'});
 assert.deepEqual(all.request.keywords,['approval workflow','retool alternative'],'deduplicated and sorted, so the same seeds are the same query');
 assert.equal(all.request.limit,200);assert.equal(all.estimatedUsd,0.03);assert.equal(all.locationCode,2392);
 assert.equal(seedSpec({seed:'crm',locationCode:1,language:'xx'}).locationCode,2840,'an unsupported market falls back to the United States');
 const parsed=labsResult({status_code:20000,cost:0.0105,tasks:[{status_code:20000,result:[{seed_keyword:'crm',seed_keyword_data:{keyword_info:{search_volume:90500},keyword_properties:{keyword_difficulty:80},search_intent_info:{main_intent:'commercial'}},items:[kw('crm software',40500),kw('crm nocobase',10),kw('',300)]}]}]},one);
 assert.deepEqual(parsed.result.items.map(i=>[i.keyword,i.volume]),[['crm',90500],['crm software',40500]],'the seed itself counts, below 50 searches and blank keywords never do');
 assert.equal(parsed.costUsd,0.0105);
 assert.deepEqual(labsResult({status_code:20000,tasks:[{status_code:40102}]}).result.items,[],'no search results is an empty answer');
 assert.equal(labsResult({status_code:40000,tasks:[]}).status,'failed');
 // The Search Console overview keeps its earlier shape.
 assert.deepEqual(specification({keywords:['A b','a b','c'],locationCode:2840,language:'en'}).request,{keywords:['a b','c'],location_code:2840,language_code:'en'});
 assert.equal(result({status_code:20000,cost:0.01,tasks:[{status_code:20000,result:[{items:[kw('A B',880,27,'informational')]}]}]}).result.items[0].volume,880);
 assert.equal(runUsd(15,60),0.241,'the most a first run can cost');
});

test('AI suggestions: AI seeds, real keywords for them, only ≥50 searches, the AI picks from those alone, ranked by opportunity',async()=>{
 const calls=fetchFor();const {s,prompts}=setup();const built=await finish(s,{});
 const seedAsk=prompts.find(x=>x.tag==='keyword-seeds').input;
 assert.equal(seedAsk.market.language,'英语');assert.equal(seedAsk.market.place,'United States');assert.equal(seedAsk.memory['项目'],'NocoBase');assert.equal(seedAsk.searchConsole[0].keyword,'open source low code platform');assert.deepEqual(seedAsk.competitors,['Retool']);
 assert.deepEqual(calls.map(c=>c.path.split('/')[2]),['keyword_suggestions','keyword_suggestions','keyword_suggestions','keyword_ideas','keyword_overview'],'one request a seed, one for ideas, one for the Search Console queries');
 assert.deepEqual(calls.find(c=>c.path.includes('keyword_overview')).body.keywords,['open source low code platform','nocobase login']);
 const pick=prompts.find(x=>x.tag==='keyword-curate').input;
 assert.ok(pick.candidates.length>0&&pick.candidates.every(c=>c.volume>=MIN_VOLUME),'the AI only sees keywords with real searches');
 assert.ok(!pick.candidates.some(c=>c.keyword==='internal tool builder nocobase'||c.keyword==='nocobase login'));
 assert.equal(pick.candidates.find(c=>c.keyword==='open source low code platform').position,14.2);
 const v=await s.view('1'),items=v.items;
 assert.deepEqual(items.map(i=>i.keyword).sort(),['approval workflow software','crm for startups','open source low code platform','retool alternative'],'invented and low-volume words are dropped');
 assert.ok(items.every(i=>i.metrics.volume>=MIN_VOLUME),'no keyword without volume');
 assert.deepEqual(items.map(i=>i.keyword),[...items].sort((a,b)=>score(b)-score(a)).map(i=>i.keyword),'ranked by opportunity');
 assert.equal(items[0].keyword,'open source low code platform','high volume, on topic and at 14: the best opportunity');
 const byKey=Object.fromEntries(items.map(i=>[i.keyword,i]));
 assert.equal(byKey['open source low code platform'].group,'品类与行业词');assert.equal(byKey['retool alternative'].group,'对比与替代词');assert.equal(byKey['crm for startups'].group,'品类与行业词','a group name is accepted too');
 assert.equal(byKey['retool alternative'].page,null,'pages outside the site are dropped');assert.equal(byKey['approval workflow software'].page,'https://x.com/workflow');
 assert.deepEqual(byKey['open source low code platform'].site,{position:14.2,clicks:120,impressions:5000,page:'https://x.com/'});
 assert.deepEqual(byKey['retool alternative'].seeds,['retool alternative']);
 assert.deepEqual(v.seeds,SEEDS);assert.equal(v.seedsBy,'ai');assert.deepEqual(v.stats,{found:9,picked:4,minVolume:50});
 assert.equal(v.costUsd,Number((0.0103+0.0102+0.0102+0.0103+0.0102).toFixed(4)),'what DataForSEO billed for this run');
 assert.equal(built.items.length,4);assert.equal(v.running,null);
});

test('budget and 30-day reuse: the cost is known before a run, reused seeds are free, a low budget stops it before any request',async()=>{
 const calls=fetchFor();const {s}=setup();await finish(s,{});const n=calls.length;
 const est=await s.estimate('1',{seeds:[...SEEDS,'workflow automation']});
 assert.equal(est.reused,3);assert.equal(est.maxUsd,Number((0.013+0.03+0.016).toFixed(4)),'only the new seed, the ideas for the new set and the Search Console lookup');
 assert.equal((await s.estimate('1',{})).maxUsd,0.241,'seeds still to be chosen: the most a run can cost');
 await finish(s,{seeds:SEEDS});
 assert.equal(calls.length,n,'the same seeds and Search Console queries within 30 days are read back, not asked again');
 const v=await s.view('1');assert.equal(v.seedsBy,'person');assert.equal(v.costUsd,0,'and cost nothing');assert.equal(v.items.length,4);
 const poor=setup({budget:0.1});fetchFor();
 await assert.rejects(poor.s.start('1',{}),/预算还剩 \$0\.10，这次查询最多要 \$0\.25/);
 assert.equal(poor.runs.rows.length,0,'nothing was asked');
 await assert.rejects(setup({verified:false}).s.start('1',{}),/验证 DataForSEO/);
 await assert.rejects(setup({ai:false}).s.start('1',{}),/还没有接入在线 AI/);
});

test('an uncertain lookup is never retried automatically, a run at a time, and a failure keeps the list and says why',async()=>{
 const calls=fetchFor({timeout:new Set(['approval workflow'])});const {s}=setup();
 const job=await s.start('1',{});assert.equal(s.running('1').mode,'list');
 await assert.rejects(s.start('1',{}),/正在找关键词/);
 await job.promise;const v=await s.view('1');
 assert.deepEqual(v.missedSeeds,['approval workflow']);assert.equal(v.uncertain,1);
 assert.ok(!v.items.some(i=>i.keyword==='approval workflow software'));
 const asked=()=>calls.filter(c=>c.body.keyword==='approval workflow').length;assert.equal(asked(),1);
 await finish(s,{seeds:SEEDS});assert.equal(asked(),1,'the uncertain seed is not asked again');
 // Nothing with enough searches: the previous list stays and the reason is kept for the page.
 const before=(await s.view('1')).items.length;
 await assert.rejects(finish(s,{mode:'dig',direction:'nobody',seeds:['nobody searches this']}),/没有找到月搜索量 50 以上/);
 const after=await s.view('1');assert.equal(after.items.length,before);assert.match(after.lastError.message,/月搜索量 50/);
});

test('a dig adds a group named after its direction, without the keywords the list has; saving carries the real numbers',async()=>{
 fetchFor();const extra=[{keyword:'approval workflow example',group:2,relevance:2,reason:'流程模板'}];
 const {s,prompts,stored}=setup({seeds:input=>input.direction?['approval workflow']:SEEDS,curate:input=>curated(input.direction?extra:[])});
 await finish(s,{});
 await assert.rejects(s.start('1',{mode:'dig'}),/往哪个方向/);
 const built=await finish(s,{mode:'dig',direction:'approval workflow'});
 const seedAsk=prompts.filter(x=>x.tag==='keyword-seeds')[1].input;assert.equal(seedAsk.direction,'approval workflow');assert.deepEqual(seedAsk.used,SEEDS);
 const pick=prompts.filter(x=>x.tag==='keyword-curate')[1].input;assert.equal(pick.pick,20);assert.ok(!pick.candidates.some(c=>c.keyword==='approval workflow software'),'keywords already in the list are not offered again');
 const v=await s.view('1');assert.equal(v.digs.length,1);const dig=v.digs[0];
 assert.equal(dig.direction,'approval workflow');assert.deepEqual(dig.items.map(i=>i.keyword),['approval workflow example']);assert.equal(dig.items[0].dig,dig.id);assert.equal(built.group.id,dig.id);
 assert.equal(v.items.length,4,'the list itself is unchanged');
 await s.keep('1',{ids:[dig.items[0].id,v.items[0].id]});
 assert.deepEqual(stored.map(e=>[e.keyword,e.payload.source,e.payload.item.volume,e.payload.spec.locationCode,e.payload.retrievedAt===dig.at||e.payload.retrievedAt===v.at]),[['open source low code platform','AI 建议',3600,2840,true],['approval workflow example','AI 建议',210,2840,true]]);
 // Rebuilt in the same market the group stays; in another market it goes.
 await finish(s,{seeds:SEEDS});assert.equal((await s.view('1')).digs.length,1);
 await finish(s,{seeds:SEEDS,market:{locationCode:2392,language:'ja'}});const ja=await s.view('1');assert.equal(ja.digs.length,0);assert.deepEqual(ja.market,{locationCode:2392,language:'ja'});
});

test('the online agent: keyword_dig estimates without spending, runs only with confirm, adds a group and links to it',async()=>{
 const calls=fetchFor();const extra=[{keyword:'approval workflow example',group:2,relevance:2,reason:'流程模板'}];
 const {s}=setup({seeds:input=>input.direction?['approval workflow']:SEEDS,curate:input=>curated(input.direction?extra:[])});await finish(s,{});const n=calls.length;
 let may=true;const authorize=vi.fn(async()=>{});
 const tool=keywordDigTool(s,'1',authorize,async(resource,action)=>may&&resource==='nrKeywordSuggest'&&action==='suggest',path=>`/app${path}`);
 const plan=await tool.execute({direction:'approval workflow',seeds:['approval workflow','workflow automation']});
 assert.equal(plan.confirmed,false);assert.equal(plan.spent,0);assert.equal(plan.seedsReusedFree,1);assert.equal(plan.maxCostUsd,0.043);assert.equal(calls.length,n,'nothing was looked up');
 const done=await tool.execute({direction:'approval workflow',confirm:true});
 assert.equal(done.confirmed,true);assert.equal(done.group.name,'approval workflow');assert.equal(done.group.keywords,1);
 const dig=(await s.view('1')).digs[0];assert.equal(done.group.url,`/app/keywords?tab=suggest&group=${dig.id}`);
 assert.deepEqual(done.keywords,[{keyword:'approval workflow example',volume:210,difficulty:18,reason:'流程模板'}]);
 assert.match((await tool.execute({mode:'list',market:{locationCode:2276,language:'de'}})).seeds,/chosen/);
 assert.match((await tool.execute({mode:'group',confirm:true})).error,/往哪个方向/,'refusals come back in words');
 may=false;assert.deepEqual(await tool.execute({direction:'crm',confirm:true}),{accessDenied:true});
 assert.ok(authorize.mock.calls.length>=4);
});
