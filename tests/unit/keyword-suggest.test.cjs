const test=require('node:test'),assert=require('node:assert/strict');
const {KeywordSuggest,specification,result}=require('../../apps/nocoreach/server/providers/reach/domain/keyword-suggest.cjs');
const reply='```json\n'+JSON.stringify({groups:[
 {name:'产品与功能词',keywords:[{keyword:'Open Source No-Code Platform',intent:'commercial',reason:'官网首屏的说法',page:'https://x.com/'},{keyword:'open source no-code platform',intent:'commercial'},{keyword:'self-hosted internal tool builder',intent:'commercial',reason:'受众是 IT 团队',page:'https://evil.com/'}]},
 {name:'对比与替代词',keywords:[{keyword:'retool alternative open source',intent:'comparison',reason:'竞品替代'}]},
 {name:'奇怪的组',keywords:[{keyword:'how to build a crm without code',intent:'weird',reason:'论坛常问'}]}]})+'\n```';
function setup({ai=reply,verified=true,site=true,overview}={}){const rows=[],stored=[],prompts=[],runs=[];
 const repo={findOne:async({filter})=>{const r=rows.find(x=>x.key===filter.key);return r&&{id:r.id,get:()=>r.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 const p={store:{repository:()=>repo},env:()=>verified?JSON.stringify({verifiedAt:'t',login:'l',password:'p',budget:5}):'',
  projects:{get:async()=>({id:1,name:'NocoBase',domains:['x.com'],memory:{brand:'开源无代码平台',competitors:'Retool'}})},
  siteContent:{state:async()=>site?{pages:[{url:'https://x.com/',title:'NocoBase',type:'page'},{url:'https://x.com/docs/install',title:'Install',type:'docs'}]}:null},
  sync:{snapshots:async()=>[{key:'queries-28',payload:[{keyword:'open source no-code platform',clicks:120,impressions:5000,position:9.2,page:'https://x.com/'}]}]},
  competitors:{state:async()=>({list:[{name:'Retool'}]})},keywordService:{store:async(id,entries)=>{stored.push(...entries);return {saved:entries.length,skipped:0};}},
  taskExecution:ai===null?undefined:{provider:{complete:async(system,user)=>{prompts.push(JSON.parse(user));return ai;}}}};
 const s=new KeywordSuggest(p,async()=>({text:'<p>home</p>'}));
 s.d4s.run=async(id,kind,v)=>{runs.push({kind,...v});return overview||{status:'completed',completedAt:'2026-10-04T10:00:00Z',result:{items:[{keyword:'retool alternative open source',volume:1900,difficulty:34,cpc:2.1,competition:0.4,intent:'commercial',monthlySearches:[]}]}};};
 return {s,rows,stored,prompts,runs};}

test('DataForSEO keyword overview: one request for all suggestions, parsed per keyword',()=>{
 const spec=specification({keywords:['A b','a b','c'],locationCode:2840,language:'en'});assert.deepEqual(spec.request,{keywords:['a b','c'],location_code:2840,language_code:'en'});assert.equal(spec.path,'dataforseo_labs/google/keyword_overview/live');assert.equal(spec.estimatedUsd,0.0102);
 const r=result({status_code:20000,cost:0.0102,tasks:[{status_code:20000,result:[{items:[{keyword:'A B',keyword_info:{search_volume:880,cpc:1.2,competition:0.3,monthly_searches:[{year:2026,month:9,search_volume:900}]},keyword_properties:{keyword_difficulty:27},search_intent_info:{main_intent:'informational'}}]}]}]});
 assert.deepEqual(r.result.items[0],{keyword:'a b',volume:880,cpc:1.2,competition:0.3,difficulty:27,intent:'informational',monthlySearches:[{year:2026,month:9,volume:900}]});
 assert.equal(result({status_code:40000,tasks:[]}).status,'failed');
});

test('AI 建议: from the website, 记忆, Search Console and competitors; grouped, cleaned, the site\'s own rank alongside, volume looked up once',async()=>{
 const {s,prompts,runs}=setup();const v=await s.suggest('1');
 const u=prompts[0];assert.equal(u.pages.length,2);assert.equal(u.searchConsole[0].keyword,'open source no-code platform');assert.deepEqual(u.competitors,['Retool']);assert.equal(u.memory['项目'],'NocoBase');assert.equal(u.market.language,'英语');
 assert.deepEqual(v.items.map(i=>[i.keyword,i.group,i.intent]),[['Open Source No-Code Platform','产品与功能词','commercial'],['self-hosted internal tool builder','产品与功能词','commercial'],['retool alternative open source','对比与替代词','comparison'],['how to build a crm without code','品类与行业词',null]],'duplicates dropped, unknown groups and intents tidied');
 assert.equal(v.items[0].page,'https://x.com/');assert.equal(v.items[1].page,null,'pages outside the site are dropped');assert.deepEqual(v.items[0].site,{position:9.2,clicks:120,impressions:5000,page:'https://x.com/'});
 assert.equal(runs.length,1);assert.equal(runs[0].keywords.length,4);assert.equal(v.items[2].metrics.volume,1900);assert.equal(v.items[0].metrics,null);
 // opened again: kept, nothing asked or paid; 重新建议 asks again
 await s.suggest('1');assert.equal(prompts.length,1);assert.equal(runs.length,1);await s.suggest('1',{force:true});assert.equal(prompts.length,2);
 // another market: suggested again in that language
 await s.suggest('1',{market:{locationCode:2276,language:'de'}});assert.equal(prompts.length,3);assert.equal(prompts[2].market.language,'德语');
});

test('AI 建议: without an online AI or the website it says what to do; a refused lookup is shown, not retried; saving keeps the source',async()=>{
 await assert.rejects(setup({ai:null}).s.suggest('1'),/还没有接入在线 AI/);
 const noSite=setup({site:false});noSite.s.read=async()=>{throw new Error('down');};await assert.rejects(noSite.s.suggest('1'),/还没读到官网内容/);
 const off=setup({verified:false});const v0=await off.s.suggest('1');assert.equal(off.runs.length,0,'no DataForSEO, no lookup');assert.equal(v0.dataforseo,false);
 const refused=setup({overview:{status:'failed',errorCode:'本月 DataForSEO 预算已用完'}});const v1=await refused.s.suggest('1');assert.equal(v1.metricsError,'本月 DataForSEO 预算已用完');
 const {s,stored}=setup();const v=await s.suggest('1');await s.keep('1',{ids:[v.items[2].id,v.items[0].id]});
 assert.deepEqual(stored.map(e=>[e.keyword,e.payload.source,e.payload.item?.volume??null,e.payload.spec?.locationCode??null]),[['Open Source No-Code Platform','AI 建议',null,null],['retool alternative open source','AI 建议',1900,2840]]);
 await assert.rejects(s.keep('1',{ids:[]}),/请选择/);
});
