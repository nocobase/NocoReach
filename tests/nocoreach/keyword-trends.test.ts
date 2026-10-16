// @ts-nocheck
// Keywords › AI suggestions › Market trends (server/nocoreach/keyword-trends.ts): category terms, DataForSEO lookups
// of the fastest-growing searches, free Google Trends and GitHub signals, AI topics that may only pick looked-up
// keywords, and every number filled in from the data.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { KeywordTrends, kinds, seedsOf, growthOf } from '../../server/nocoreach/keyword-trends.js';
const test=__vitest_test;
const months=(from,to)=>Array.from({length:12},(_,i)=>({year:2026,month:i+1,volume:i===0?from:i===11?to:Math.round((from+to)/2)}));
const kw=(keyword,volume,from,difficulty=30)=>({keyword,volume,cpc:1,competition:0.3,difficulty,intent:'commercial',monthlySearches:months(from,volume),trend:{monthly:5,quarterly:40,yearly:60}});
const LOOKUPS={
 'kt-suggestions:ai agent':[kw('no-code ai agent builder',33100,390,42),kw('ai agent builder',12000,9000),kw('ai agent tiny',60,5)],
 'kt-related:ai agent':[kw('agentic workflow',5400,1200),kw('no-code ai agent builder',33100,390)],
 'kt-suggestions:no code':[kw('no code app builder',8100,8400)],
 'kt-related:no code':[kw('ai internal tool',2900,690,24)],
};
const reply=topics=>'```json\n'+JSON.stringify({topics})+'\n```';
const TOPICS=[
 {name:'AI agent 搭建',why:'无代码做 agent 的搜索一年涨了几十倍',github:'AI-Agents',keywords:[
  {keyword:'No-Code AI Agent Builder',reason:'对比型搜索多',page:'https://x.com/'},{keyword:'no-code ai agent builder',reason:'重复'},
  {keyword:'invented keyword',reason:'不在候选里'},{keyword:'mcp server',reason:'Trends 上升',page:'https://evil.com/'},{keyword:'agentic workflow',reason:'工作流'}]},
 {name:'内部工具 + AI',why:'',github:'unknown',keywords:[{keyword:'ai internal tool',reason:'和产品最近'},{keyword:'no code app builder',reason:'在跌，不在候选'}]},
 {name:'空话题',keywords:[{keyword:'nothing here'}]},
];
function setup({topics=TOPICS,seeds=['AI Agent','no code','"bad"'],verified=true,ai=true,lookups=LOOKUPS,fail}={}){const rows=[],stored=[],prompts=[],runs=[];
 const repo={findOne:async({filter})=>{const r=rows.find(x=>x.key===filter.key);return r&&{id:r.id,get:()=>r.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 const p={db:{getRepository:()=>repo},env:()=>verified?JSON.stringify({verifiedAt:'t',login:'l',password:'p',budget:20}):'',
  projects:{get:async()=>({id:1,name:'NocoBase',domains:['x.com'],memory:{brand:'开源无代码平台'}})},
  siteContent:{state:async()=>({pages:[{url:'https://x.com/',title:'NocoBase'},{url:'https://x.com/blog/agentic-workflow-guide',title:'Guide'}]})},
  sync:{snapshots:async()=>[{key:'queries-28',payload:[{keyword:'ai internal tool',clicks:4,impressions:900,position:12.34,page:'https://x.com/solutions/internal'}]}]},
  competitors:{state:async()=>({list:[{name:'Retool'}]})},
  trends:{state:async()=>({terms:['NocoBase'],latest:{rising:[{query:'MCP Server',value:350},{query:'nocobase ai',value:120}]},keywords:[{keyword:'ai agent',latest:{rising:[{query:'mcp server',value:900}]}}]})},
  githubTrends:{view:async()=>({topics:[{name:'ai-agents',lastWeek:1240,priorAverage:590.4,total:9000},{name:'low-code',lastWeek:100,priorAverage:120,total:5000}]})},
  keywordService:{store:async(id,entries)=>{stored.push(...entries);return {saved:entries.length,skipped:0};}},
  taskExecution:ai?{provider:{complete:async(system,user,operation)=>{prompts.push({operation,system,input:JSON.parse(user)});return operation==='keyword-trend-seeds'?'```json\n'+JSON.stringify({seeds})+'\n```':reply(topics);}}}:undefined};
 const s=new KeywordTrends(p);
 s.d4s.run=async(id,kind,v)=>{runs.push({kind,...v});if(fail)return fail;
  if(kind==='kt-overview')return {status:'completed',completedAt:'t',result:{items:v.keywords.map(k=>kw(k,18100,2000,55))}};
  return {status:'completed',completedAt:'t',result:{items:lookups[`${kind}:${v.keyword}`]||[]}};};
 return {s,rows,stored,prompts,runs};}

test('Lookups: growing searches for one seed, filtered and ordered by the yearly change, related ones under keyword_data',()=>{
 const sug=kinds['kt-suggestions'].specification({keyword:'AI Agent',locationCode:2840,language:'en'});
 assert.equal(sug.path,'dataforseo_labs/google/keyword_suggestions/live');
 assert.deepEqual(sug.request,{keyword:'ai agent',location_code:2840,language_code:'en',limit:50,filters:[['keyword_info.search_volume','>=',100],'and',['keyword_info.search_volume_trend.yearly','>',0]],order_by:['keyword_info.search_volume_trend.yearly,desc','keyword_info.search_volume,desc']});
 const rel=kinds['kt-related'].specification({keyword:'no code',locationCode:2826,language:'en'});
 assert.equal(rel.request.depth,2);assert.deepEqual(rel.request.order_by[0],'keyword_data.keyword_info.search_volume_trend.yearly,desc');assert.equal(rel.request.filters[2][0],'keyword_data.keyword_info.search_volume_trend.yearly');
 assert.equal(sug.estimatedUsd,0.015);
 const parsed=kinds['kt-related'].result({status_code:20000,cost:0.015,tasks:[{status_code:20000,result:[{items:[{keyword_data:{keyword:'agentic workflow',keyword_info:{search_volume:5400,monthly_searches:[{year:2025,month:11,search_volume:1200},{year:2026,month:10,search_volume:5400}],search_volume_trend:{monthly:3,quarterly:20,yearly:350}},keyword_properties:{keyword_difficulty:31}}}]}]}]});
 assert.equal(parsed.result.items[0].keyword,'agentic workflow');assert.deepEqual(parsed.result.items[0].trend,{monthly:3,quarterly:20,yearly:350});
 assert.equal(kinds['kt-suggestions'].result({status_code:40000,tasks:[]}).status,'failed');
 assert.throws(()=>kinds['kt-suggestions'].specification({keyword:'ai agent',locationCode:1,language:'en'}));
});

test('Seeds and growth: typed seeds are checked, the AI\'s only filtered; growth from the twelve months, else DataForSEO\'s own',()=>{
 assert.deepEqual(seedsOf('No Code, ai agent，ai agent'),['no code','ai agent']);
 assert.deepEqual(seedsOf(['ok term','"quoted"','x','a'.repeat(41),'b','c','d','e']),['ok term']);
 assert.throws(()=>seedsOf('a, b, c, d, e',true),/keywordTrends.seedsInvalid|品类词/);assert.throws(()=>seedsOf('',true));assert.throws(()=>seedsOf('50%',true));
 assert.deepEqual(growthOf(kw('x',33100,390)),{pct:8387,from:390,to:33100,months:12});
 assert.deepEqual(growthOf({monthlySearches:[],trend:{yearly:null,quarterly:40}}),{pct:40,from:null,to:null,months:3});
 assert.equal(growthOf({monthlySearches:[]}),null);
});

test('Find: seeds from the AI, lookups per seed, topics only from the lookups and rising searches, numbers from the data',async()=>{
 const {s,prompts,runs,rows}=setup();const v=await s.find('1');
 assert.deepEqual(prompts.map(x=>x.operation),['keyword-trend-seeds','keyword-trends']);
 const seedInput=prompts[0].input;assert.deepEqual(seedInput.trendsRising,[{query:'MCP Server',rise:350},{query:'nocobase ai',rise:120}]);assert.deepEqual(seedInput.github,[{topic:'ai-agents',lastWeek:1240,priorAverage:590,total:9000}],'only topics outpacing their last weeks');assert.equal(seedInput.market.language,'英语');
 assert.deepEqual(v.seeds,['ai agent','no code']);assert.equal(v.seedsBy,'ai');
 assert.deepEqual(runs.filter(r=>r.kind!=='kt-overview').map(r=>`${r.kind}:${r.keyword}`).sort(),['kt-related:ai agent','kt-related:no code','kt-suggestions:ai agent','kt-suggestions:no code']);
 const cands=prompts[1].input.candidates;
 assert.deepEqual(cands.map(c=>c.keyword),['no-code ai agent builder','agentic workflow','ai internal tool','ai agent builder'],'growing ones of 100+ a month, fastest first, each once');
 assert.deepEqual(cands[0],{keyword:'no-code ai agent builder',seed:'ai agent',growth:8387,from:390,to:33100,volume:33100,difficulty:42,intent:'commercial'});
 assert.deepEqual(v.topics.map(t=>[t.name,t.count]),[['AI agent 搭建',3],['内部工具 + AI',1]],'empty topics dropped');
 assert.deepEqual(v.items.map(i=>i.keyword),['no-code ai agent builder','MCP Server','agentic workflow','ai internal tool'],'duplicates and invented or falling keywords dropped');
 const [top,mcp,flow,tool]=v.items;
 assert.deepEqual(top.growth,{pct:8387,from:390,to:33100,months:12});assert.equal(top.metrics.volume,33100);assert.equal(top.page,'https://x.com/');assert.equal(top.trends,null);
 assert.deepEqual(mcp.trends,{rise:350,term:'NocoBase'});assert.equal(mcp.page,null,'pages outside the site are dropped');
 assert.deepEqual(runs.find(r=>r.kind==='kt-overview').keywords,['MCP Server'],'a rising search picked without numbers is looked up once');
 assert.equal(mcp.metrics.volume,18100);assert.deepEqual(mcp.growth,{pct:805,from:2000,to:18100,months:12});
 assert.equal(flow.page,'https://x.com/blog/agentic-workflow-guide','a site page with its words');assert.equal(flow.site,null);
 assert.deepEqual(tool.site,{position:12.3,clicks:4,impressions:900,page:'https://x.com/solutions/internal'});
 const t0=v.topics[0];assert.deepEqual(t0.github,{topic:'ai-agents',lastWeek:1240,priorAverage:590,total:9000});assert.equal(t0.fastest,8387);assert.equal(t0.volume,33100+18100+5400);assert.equal(t0.rise,350);
 assert.equal(v.topics[1].github,null);assert.equal(v.partial,null);assert.deepEqual(v.basis,{candidates:4,rising:2,github:1});
 assert.equal(rows[0].key,'keyword-trends:1');
});

test('Find again: opening keeps what was found; finding again keeps the seeds; typed seeds stay through a change of language',async()=>{
 const {s,prompts,runs}=setup();await s.find('1');
 await s.find('1');assert.equal(prompts.length,2,'opened again: nothing asked or looked up');assert.equal(runs.length,5);
 await s.find('1',{force:true});assert.deepEqual(prompts.slice(2).map(x=>x.operation),['keyword-trends'],'the seeds are kept, so the month\'s lookups are reused');
 await s.find('1',{market:{locationCode:2826,language:'en'}});assert.equal(prompts.at(-1).operation,'keyword-trends','same language, same seeds');
 await s.find('1',{market:{locationCode:2276,language:'de'}});assert.deepEqual(prompts.slice(-2).map(x=>x.operation),['keyword-trend-seeds','keyword-trends'],'another language: seeds picked again');
 const v=await s.find('1',{seeds:'ai agent, Internal Tool'});assert.deepEqual([v.seeds,v.seedsBy],[['ai agent','internal tool'],'user']);
 const n=prompts.length;const w=await s.find('1',{market:{locationCode:2840,language:'en'}});assert.equal(prompts.length,n+1);assert.deepEqual([w.seeds,w.seedsBy],[['ai agent','internal tool'],'user']);
 await assert.rejects(s.find('1',{seeds:'a,b,c,d,e'}),e=>e.status===400);
});

test('Find: says what is missing, shows a refused lookup and keeps partial results',async()=>{
 await assert.rejects(setup({verified:false}).s.find('1'),e=>e.status===409&&e.message==='keywordTrends.connectDataforseo');
 await assert.rejects(setup({ai:false}).s.find('1'),e=>e.status===409&&/在线 AI/.test(e.message));
 await assert.rejects(setup({fail:{status:'failed',errorCode:'本月 DataForSEO 预算已用完'}}).s.find('1'),e=>e.status===409&&e.message==='本月 DataForSEO 预算已用完');
 await assert.rejects(setup({lookups:{}}).s.find('1'),e=>e.message==='keywordTrends.noGrowingKeywords');
 await assert.rejects(setup({seeds:['"x"']}).s.find('1'),e=>e.message==='keywordTrends.noSeeds');
 await assert.rejects(setup({topics:[{name:'x',keywords:[{keyword:'invented'}]}]}).s.find('1'),e=>e.message==='keywordTrends.noUsableTopics');
 const partial=setup();const run=partial.s.d4s.run;partial.s.d4s.run=async(id,kind,v)=>kind==='kt-related'&&v.keyword==='no code'?{status:'failed',errorCode:'关键词数据没有查到'}:run(id,kind,v);
 const v=await partial.s.find('1');assert.equal(v.partial,'关键词数据没有查到');assert.ok(!v.items.some(i=>i.keyword==='ai internal tool'));
 const off=setup({verified:false});assert.deepEqual(await off.s.view('1'),{items:[],topics:[],seeds:[],market:{locationCode:2840,language:'en'},dataforseo:false});
});

test('Save: the picked keywords with the market estimate, from AI suggestions',async()=>{
 const {s,stored}=setup();const v=await s.find('1');await s.keep('1',{ids:[v.items[3].id,v.items[0].id]});
 assert.deepEqual(stored.map(e=>[e.keyword,e.payload.source,e.payload.item?.volume,e.payload.spec]),[['no-code ai agent builder','AI 建议',33100,{locationCode:2840,language:'en'}],['ai internal tool','AI 建议',2900,{locationCode:2840,language:'en'}]]);
 assert.equal(stored[0].payload.item.monthlySearches.length,12);
 await assert.rejects(s.keep('1',{ids:[]}),/请选择/);
 await assert.rejects(setup().s.keep('1',{ids:['x']}),e=>e.status===409);
});
