// @ts-nocheck
// Keywords › AI suggestions, demand first: seeds → DataForSEO's real keywords → at least MIN_VOLUME → the AI's pick.
import { test, vi, afterEach } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { KeywordSuggest, specification, result, seedSpec, ideasSpec, labsResult, score, runUsd, MIN_VOLUME } from '../../server/nocoreach/keyword-suggest.js';
import { keywordRunTool, keywordsPageContext } from '../../server/nocoreach/online-agent/keyword-tool.js';
import { isKeywordRunProposal } from '../../shared/keyword-run.js';
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
 {keyword:'crm for startups',group:'品类与行业词',relevance:2,reason:'创业团队要的 CRM'},
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
 assert.equal(runUsd(15,60),0.291,'the most a first run can cost, on the $0.012 + $0.00012 list price with each seed\'s own row');
 assert.equal(one.estimatedUsd,0.013,'the spec keeps the price it was stored with: it is part of the 30-day reuse key');
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
 assert.equal(est.reused,3);assert.equal(est.maxUsd,Number((0.01572+0.036+0.0192).toFixed(4)),'only the new seed, the ideas for the new set and the Search Console lookup');
 assert.equal((await s.estimate('1',{})).maxUsd,0.291,'seeds still to be chosen: the most a run can cost');
 await finish(s,{seeds:SEEDS});
 assert.equal(calls.length,n,'the same seeds and Search Console queries within 30 days are read back, not asked again');
 const v=await s.view('1');assert.equal(v.seedsBy,'person');assert.equal(v.costUsd,0,'and cost nothing');assert.equal(v.items.length,4);
 const poor=setup({budget:0.1});fetchFor();
 await assert.rejects(poor.s.start('1',{}),/预算还剩 \$0\.10，这次查询最多要 \$0\.30/);
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
 await assert.rejects(finish(s,{mode:'dig',direction:'nobody',seeds:['nobody searches this']}),/没有找到列表里还没有的、月搜索量 50 以上/);
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
 assert.equal(dig.found,2,'a group counts what it brought that the list did not have: picked + not picked');assert.equal(dig.picked,1);assert.equal(dig.notPicked,undefined,'the records stay on the server');
 await s.keep('1',{ids:[dig.items[0].id,v.items[0].id]});
 assert.deepEqual(stored.map(e=>[e.keyword,e.payload.source,e.payload.item.volume,e.payload.spec.locationCode,e.payload.retrievedAt===dig.at||e.payload.retrievedAt===v.at]),[['open source low code platform','AI 建议',3600,2840,true],['approval workflow example','AI 建议',210,2840,true]]);
 // Rebuilt in the same market the group stays; in another market it goes.
 await finish(s,{seeds:SEEDS});assert.equal((await s.view('1')).digs.length,1);
 await finish(s,{seeds:SEEDS,market:{locationCode:2392,language:'ja'}});const ja=await s.view('1');assert.equal(ja.digs.length,0);assert.deepEqual(ja.market,{locationCode:2392,language:'ja'});
});

test('seed words carry why the AI chose them and what each found; a kept seed keeps its note, an added one says the person added it',async()=>{
 fetchFor();const why={'internal tool builder':{from:['memory'],why:'记忆里写了内部工具'},'approval workflow':{from:['searchConsole','nope'],why:'本站已有审批流查询'},'retool alternative':{from:['competitors'],why:'竞品 Retool'}};
 const {s,prompts}=setup({seeds:()=>SEEDS.map(seed=>({seed,...why[seed]}))});await finish(s,{});
 assert.match(prompts.find(x=>x.tag==='keyword-seeds').system,/from（它来自哪些输入/);
 const v=await s.view('1');
 assert.deepEqual(v.seedNotes,[{seed:'internal tool builder',from:['memory'],why:'记忆里写了内部工具'},{seed:'approval workflow',from:['searchConsole'],why:'本站已有审批流查询'},{seed:'retool alternative',from:['competitors'],why:'竞品 Retool'}],'unknown inputs are dropped');
 assert.deepEqual(v.seedStats,[{seed:'internal tool builder',found:2,picked:0},{seed:'approval workflow',found:2,picked:1},{seed:'retool alternative',found:2,picked:1}]);
 await finish(s,{seeds:['retool alternative','workflow automation'],by:'person'});
 const w=await s.view('1');assert.equal(w.seedsBy,'person');
 assert.deepEqual(w.seedNotes,[{seed:'retool alternative',from:['competitors'],why:'竞品 Retool'},{seed:'workflow automation',from:['person'],why:''}]);
 // Confirmed from the chat with the AI's own picks: the notes it proposed come along.
 await finish(s,{seeds:['approval workflow'],by:'ai',notes:[{seed:'approval workflow',from:['direction'],why:'这次往审批流挖'},{seed:'other',from:['memory'],why:'x'}]});
 const x=await s.view('1');assert.equal(x.seedsBy,'ai');assert.deepEqual(x.seedNotes,[{seed:'approval workflow',from:['direction'],why:'这次往审批流挖'}]);
});

test('a proposal shows the seeds before and after, whether nothing changed, and the most it may cost, looking nothing up and saving nothing',async()=>{
 const calls=fetchFor();const {s,snaps,prompts}=setup({seeds:input=>input.direction?[{seed:'approval workflow software',from:['direction'],why:'方向'},{seed:'approval workflow',from:['direction'],why:'方向'}]:SEEDS});await finish(s,{});
 const n=calls.length,saved=JSON.stringify(snaps.rows);
 const same=await s.propose('1',{});
 assert.equal(same.kind,'list');assert.deepEqual(same.before,SEEDS);assert.deepEqual(same.after,SEEDS);assert.equal(same.same,true,'the AI chose the same seeds again');
 assert.equal(same.maxUsd,0.0192,'only the Search Console overview could be new: every seed and the ideas request are reused');assert.equal(same.reused,3);assert.equal(same.by,'ai');
 const edit=await s.propose('1',{seeds:['internal tool builder','retool alternative','Workflow Automation']});
 assert.deepEqual([edit.added,edit.removed,edit.same,edit.by],[['workflow automation'],['approval workflow'],false,'person']);
 assert.equal(edit.maxUsd,Number((0.01572+0.036+0.0192).toFixed(4)));assert.equal(edit.withinBudget,true);assert.equal(edit.monthUsd,0.0512);assert.equal(edit.budgetUsd,5);
 const lean=await s.propose('1',{direction:'approval workflow'});
 assert.deepEqual(lean.after,['approval workflow software','approval workflow']);assert.deepEqual(lean.notes.map(x=>x.why),['方向','方向']);assert.equal(prompts.at(-1).input.direction,'approval workflow');
 const japan=await s.propose('1',{seeds:SEEDS,market:{locationCode:2392,language:'ja'}});
 assert.equal(japan.marketChanged,true);assert.equal(japan.same,false,'the same seeds in another market are a new lookup');assert.equal(japan.reused,0);
 const dig=await s.propose('1',{mode:'dig',direction:'approval workflow'});
 assert.equal(dig.kind,'dig');assert.deepEqual(dig.before,[]);assert.equal(dig.direction,'approval workflow');
 assert.ok(isKeywordRunProposal({proposal:dig}));
 assert.equal(calls.length,n,'nothing was looked up');assert.equal(JSON.stringify(snaps.rows),saved,'nothing was saved');
 await assert.rejects(s.propose('1',{mode:'dig'}),/往哪个方向/);
 await assert.rejects(setup().s.propose('1',{mode:'dig',direction:'crm'}),/还没有建议/);
});

test('the online agent: propose_keyword_run returns a proposal in plain market names, refuses without permission, and says refusals in words',async()=>{
 fetchFor();const {s}=setup();await finish(s,{});
 let may=true;const authorize=vi.fn(async()=>{});
 const tool=keywordRunTool(s,'1',authorize,async(resource,action)=>may&&resource==='nrKeywordSuggest'&&action==='suggest');
 const r=await tool.execute({seeds:['internal tool builder','retool alternative']});
 assert.equal(r.proposal.kind,'list');assert.deepEqual(r.proposal.removed,['approval workflow']);assert.equal(r.market,'United States · English');assert.match(r.note,/Do not say the lookup ran/);
 const same=await tool.execute({seeds:SEEDS});assert.match(same.note,/same as now/);
 const japan=await tool.execute({mode:'list',market:{locationCode:2392,language:'ja'},seeds:['ノーコード']});assert.equal(japan.market,'Japan · Japanese');
 const group=await tool.execute({mode:'group',direction:'approval workflow',seeds:['approval workflow']});assert.equal(group.proposal.kind,'dig');
 assert.match((await tool.execute({mode:'group'})).error,/往哪个方向/,'refusals come back in words');
 may=false;assert.deepEqual(await tool.execute({seeds:['crm']}),{accessDenied:true});
 assert.ok(authorize.mock.calls.length>=6);
 // What the chat knows when opened on the seed words or on one seed.
 const allowed=async()=>true;
 assert.match(await keywordsPageContext(s,'1','seeds:',allowed),/to adjust the seed words.*"seedNotes"/s);
 assert.match(await keywordsPageContext(s,'1','seeds:retool alternative',allowed),/on the seed word "retool alternative"/);
 assert.match(await keywordsPageContext(s,'1','retool alternative',allowed),/on the keyword "retool alternative"/);
 assert.match(await keywordsPageContext(s,'1',undefined,async()=>false),/may not see the suggestions/);
});

test('editing the list: rename a dug group, delete it in Edit groups (saved keywords stay), remove keywords, which stay out of later lookups until restored',async()=>{
 fetchFor();const extra=[{keyword:'approval workflow example',group:2,relevance:2,reason:'流程模板'}];
 const {s,stored}=setup({seeds:input=>input.direction?['approval workflow']:SEEDS,curate:input=>curated(input.direction?extra:[])});
 await finish(s,{});await finish(s,{mode:'dig',direction:'approval workflow',name:'审批流'});
 let v=await s.view('1');const dig=v.digs[0];assert.equal(dig.name,'审批流');
 // Saved before the group goes: deleting the group does not touch saved keywords.
 await s.keep('1',{ids:[dig.items[0].id]});assert.equal(stored.length,1);
 assert.equal((await s.editGroups('1',{groups:[{id:dig.id,name:'审批流程'}]})).digs[0].name,'审批流程');
 await assert.rejects(s.editGroups('1',{groups:[{id:dig.id,name:'   '}]}),/组名需要 1–24 个字/);
 await assert.rejects(s.editGroups('1',{groups:[{id:'nope',name:'x'}]}),/这组已经不在了/);
 v=await s.editGroups('1',{groups:[{id:dig.id,deleted:true}]});assert.equal(v.digs.length,0);assert.deepEqual(v.removed,['approval workflow example']);assert.equal(stored.length,1,'saved keywords stay saved');
 // Removing rows: gone from the list and from later lookups, even when the AI picks them again.
 const retool=v.items.find(i=>i.keyword==='retool alternative');
 v=await s.removeItems('1',{ids:[retool.id]});assert.ok(!v.items.some(i=>i.keyword==='retool alternative'));assert.deepEqual(v.removed,['approval workflow example','retool alternative']);
 await finish(s,{seeds:SEEDS});v=await s.view('1');assert.ok(!v.items.some(i=>i.keyword==='retool alternative'),'a removed keyword does not come back in a re-find');
 // The deleted group's keyword stays out of a new dig in its direction too: nothing new is left there.
 await assert.rejects(finish(s,{mode:'dig',direction:'approval workflow'}),/没有找到列表里还没有的/);
 // Asked for back in the chat: restore lets it in again.
 const p=await s.propose('1',{seeds:SEEDS,restore:['retool alternative','never removed']});assert.deepEqual(p.restore,['retool alternative']);
 await finish(s,{seeds:SEEDS,restore:p.restore});v=await s.view('1');assert.ok(v.items.some(i=>i.keyword==='retool alternative'));assert.ok(!v.removed.includes('retool alternative'));
 await assert.rejects(s.removeItems('1',{ids:[]}),/请选择要移除的关键词/);
 // No edits while a run is going: its save would overwrite them.
 const job=await s.start('1',{seeds:SEEDS});await assert.rejects(s.removeItems('1',{ids:[v.items[0].id]}),/正在找关键词/);await job.promise;
});

test('a dig in a direction already dug adds to that group; repeated groups saved before are shown as one; a dig with nothing new says so',async()=>{
 fetchFor();const extraA=[{keyword:'approval workflow example',group:2,relevance:2,reason:'a'}],extraB=[{keyword:'no code database',group:1,relevance:2,reason:'b'}];
 let round=0;const {s,snaps}=setup({seeds:input=>input.direction?['approval workflow']:SEEDS,curate:input=>curated(input.direction?(round++?extraB:extraA):[])});
 await finish(s,{});await finish(s,{mode:'dig',direction:'approval workflow',name:'审批流'});
 const p=await s.propose('1',{mode:'dig',direction:'Approval workflow!',seeds:['approval workflow','approval process']});
 assert.equal(p.mergesInto.name,'审批流');assert.equal(p.name,'审批流');
 await finish(s,{mode:'dig',direction:'Approval workflow!',seeds:['approval workflow','approval process']});
 let v=await s.view('1');assert.equal(v.digs.length,1);assert.deepEqual(v.digs[0].items.map(i=>i.keyword),['approval workflow example','no code database']);
 assert.deepEqual(v.digs[0].seeds,['approval workflow','approval process']);assert.ok(v.digs[0].items.every(i=>i.dig===v.digs[0].id));
 // Two groups with one direction from before: one tab.
 const row=snaps.rows[0];row.payload={...row.payload,digs:[...row.payload.digs,{id:'old',direction:'approval  workflow',seeds:['x'],at:'2026-10-01',items:[{id:'k1',keyword:'approval app',metrics:{volume:90},dig:'old'},{id:'k2',keyword:'no code database',metrics:{volume:2900},dig:'old'}]}]};
 v=await s.view('1');assert.equal(v.digs.length,1);assert.deepEqual(v.digs[0].items.map(i=>i.keyword),['approval workflow example','no code database','approval app']);
 // Everything found is already listed: said as such, and not as a failure of the list.
 await assert.rejects(finish(s,{mode:'dig',direction:'approval workflow',seeds:['approval workflow']}),/没有找到列表里还没有的/);
 const after=await s.view('1');assert.equal(after.lastError.mode,'dig');
});

test('Edit groups: a renamed built-in group keeps its name and the AI curates into it; a deleted one is not used again and its keywords stay out',async()=>{
 fetchFor();const {s,prompts}=setup();await finish(s,{});
 let v=await s.editGroups('1',{groups:[{id:'对比与替代词',name:'竞品对比'},{id:'品类与行业词',deleted:true}]});
 assert.deepEqual(v.groupNames,{'对比与替代词':'竞品对比'});assert.deepEqual(v.deletedGroups,['品类与行业词']);
 assert.ok(!v.items.some(i=>i.group==='品类与行业词'),'the deleted group\'s keywords leave the list');
 assert.deepEqual(v.removed.sort(),['crm for startups','open source low code platform']);
 await finish(s,{seeds:SEEDS});
 const prompt=prompts.filter(x=>x.tag==='keyword-curate').at(-1).system;
 assert.match(prompt,/1=产品与功能词、2=使用场景与问题词、3=竞品对比/);assert.doesNotMatch(prompt,/品类与行业词/);
 v=await s.view('1');
 assert.equal(v.items.find(i=>i.keyword==='retool alternative').group,'对比与替代词','group 3 now is the renamed comparison group, kept by its identity');
 assert.ok(!v.items.some(i=>['crm for startups','open source low code platform'].includes(i.keyword)),'deleted keywords stay out of the re-find');
 assert.deepEqual(v.groupNames,{'对比与替代词':'竞品对比'});assert.deepEqual(v.deletedGroups,['品类与行业词']);
});

test('Edit seed words › Save only keeps the seeds for the next re-find; the list stays as it was found until then',async()=>{
 const calls=fetchFor();const {s}=setup();await finish(s,{});const n=calls.length;
 let v=await s.saveSeeds('1',{seeds:['internal tool builder','Workflow Automation']});
 assert.deepEqual(v.pendingSeeds,['internal tool builder','workflow automation']);assert.deepEqual(v.seeds,SEEDS);assert.equal(calls.length,n,'nothing looked up');
 v=await s.saveSeeds('1',{seeds:SEEDS});assert.equal(v.pendingSeeds,null,'the same seeds as the list are nothing pending');
 await s.saveSeeds('1',{seeds:['retool alternative']});await finish(s,{seeds:['retool alternative']});
 v=await s.view('1');assert.equal(v.pendingSeeds,null);assert.deepEqual(v.seeds,['retool alternative']);
 await assert.rejects(s.saveSeeds('1',{seeds:[]}),/没有关键词/);
});

test('dug groups get a short name in the reader\'s language: new digs when the chat gave none, and groups from before once, in the background',async()=>{
 fetchFor();const extra=[{keyword:'approval workflow example',group:2,relevance:2,reason:'a'}];
 const names=[];const {s,snaps}=setup({seeds:input=>input.direction?['approval workflow']:SEEDS,curate:input=>curated(input.direction?extra:[])});
 const complete=s.p.taskExecution.provider.complete;
 s.p.taskExecution.provider.complete=async(system,user,tag)=>{if(tag!=='keyword-names')return complete(system,user,tag);const input=JSON.parse(user);names.push(input);
  return '```json\n'+JSON.stringify({names:input.groups.map((g,i)=>({id:g.id,name:i===1?'这个名字实在是太长了已经超过了二十四个字的上限所以不能用':'审批流'}))})+'\n```';};
 await finish(s,{});await finish(s,{mode:'dig',direction:'Approval workflows inside the rules (governance, permissions)',locale:'zh-CN'});
 let v=await s.view('1');assert.equal(v.digs[0].name,'审批流');assert.equal(names[0].language,'简体中文');
 assert.deepEqual(names[0].groups[0].keywords,['approval workflow example']);
 // Two groups from before names existed: named once from the first view, in that reader's language.
 const row=snaps.rows[0];row.payload={...row.payload,digs:[...row.payload.digs,{id:'old1',direction:'The system belongs to the company (self-hosted, open source)',seeds:['self hosted'],at:'2026-10-01',items:[{id:'k1',keyword:'self hosted erp',metrics:{volume:90},dig:'old1'}]},{id:'old2',direction:'From 1 to 2 (maintenance and modernization)',seeds:['legacy'],at:'2026-10-01',items:[{id:'k2',keyword:'legacy modernization',metrics:{volume:90},dig:'old2'}]}]};
 v=await s.view('1','en-US');assert.equal(v.naming,true,'the page reads itself again while groups are named');
 await s.naming.get('1');
 v=await s.view('1','en-US');assert.equal(v.naming,false);assert.equal(names.at(-1).language,'English');
 assert.equal(v.digs.find(d=>d.id==='old1').name,'审批流');
 const two=v.digs.find(d=>d.id==='old2');assert.equal(two.name,undefined,'a name too long is not used, never cut');assert.ok(two.nameTriedAt);
 const asked=names.length;v=await s.view('1','en-US');assert.equal(v.naming,false);assert.equal(names.length,asked,'not tried again within the hour');
});

test('Selection rules: every keyword found but not picked is kept with why; the page gets the counts, the list comes on its own, and one can be added back',async()=>{
 fetchFor();
 const curate=input=>{const n=k=>input.candidates.find(c=>c.keyword===k)?.i;
  return '```json\n'+JSON.stringify({keywords:[
   {keyword:'open source low code platform',group:4,relevance:3,reason:'正对产品品类'},
   {keyword:'retool alternative',group:3,relevance:3,reason:'竞品用户在找替代'},
   {keyword:'crm for startups',group:4,relevance:1,reason:'沾边'}],
   skipped:{unrelated:[n('no code database')],duplicate:[[n('retool alternative open source'),n('retool alternative')]],brand:[999]}})+'\n```';};
 const {s,prompts}=setup({curate});await finish(s,{});
 const ask=prompts.find(x=>x.tag==='keyword-curate');
 assert.ok(ask.input.candidates.every((c,i)=>c.i===i+1),'candidates are numbered, so reasons cost a number each');
 assert.match(ask.system,/skipped\.duplicate/);assert.match(ask.system,/不要复述搜索量和难度/);
 const v=await s.view('1');
 assert.equal(v.notPicked,undefined,'the records stay on the server');
 assert.deepEqual(v.items.map(i=>i.keyword).sort(),['open source low code platform','retool alternative'],'one marked as merely close is not picked');
 assert.deepEqual({...v.selection,reasons:undefined},{seeds:3,directions:0,found:9,picked:2,notPicked:7,recorded:true,reasons:undefined,pick:40,digPick:20});
 assert.deepEqual(Object.fromEntries(v.selection.reasons.map(r=>[r.reason,r.count])),{weaker:5,unrelated:1,duplicate:1},'shown to the AI without a reason: weaker than those picked; an unknown number is ignored');
 assert.deepEqual(v.selection.reasons.find(r=>r.reason==='weaker').examples,['crm for startups','internal tool builder'],'two examples, the most searched');
 const list=await s.notPicked('1');assert.equal(list.recorded,true);assert.equal(list.items.length,7);assert.equal(list.items[0].keyword,'crm for startups','the most searched first');
 assert.deepEqual(list.items.find(c=>c.keyword==='retool alternative open source'),{keyword:'retool alternative open source',volume:390,difficulty:24,intent:'commercial',reason:'duplicate',duplicateOf:'retool alternative',run:'list'});
 // Add to suggestions: into the group the person picks, as theirs, and the numbers still add up.
 await s.addItems('1',{keyword:'no code database',group:'产品与功能词'});const v2=await s.view('1');
 const added=v2.items.find(i=>i.keyword==='no code database');
 assert.equal(added.group,'产品与功能词');assert.equal(added.by,'person');assert.equal(added.reason,'');assert.equal(added.metrics.volume,2900);
 assert.deepEqual([v2.selection.found,v2.selection.picked,v2.selection.notPicked],[9,3,6]);
 assert.ok(!(await s.notPicked('1')).items.some(c=>c.keyword==='no code database'));
 await assert.rejects(s.addItems('1',{keyword:'no code database',group:'产品与功能词'}),/不在没选的列表里/);
 await assert.rejects(s.addItems('1',{keyword:'approval workflow example',group:'nope'}),/这组已经不在了/);
 // A keyword the person removed is found again but not offered to the AI: removed by you.
 await s.removeItems('1',{ids:[v2.items.find(i=>i.keyword==='retool alternative').id]});await finish(s,{seeds:SEEDS});
 assert.equal((await s.notPicked('1')).items.find(c=>c.keyword==='retool alternative').reason,'removed');
});

test('Selection rules for a list found before reasons were kept: the totals it has, no reasons and no list',async()=>{
 const {s,snaps}=setup({ai:false});
 snaps.rows.push({id:99,key:'keyword-suggest:1',payload:{version:2,at:'2026-10-20T00:00:00.000Z',market:{locationCode:2840,language:'en'},seeds:['a','b'],stats:{found:120,picked:30,minVolume:50},
  items:[{id:'x',keyword:'x',group:'产品与功能词',metrics:{volume:100,difficulty:20}}],digs:[{id:'d1',direction:'crm',name:'CRM',seeds:['crm'],at:'2026-10-21T00:00:00.000Z',found:40,items:[{id:'y',keyword:'y',metrics:{volume:90}}]}]}});
 const v=await s.view('1');
 assert.deepEqual(v.selection,{seeds:2,directions:1,found:160,picked:31,notPicked:129,recorded:false,reasons:[],pick:40,digPick:20});
 assert.deepEqual(await s.notPicked('1'),{recorded:false,items:[]});
});
