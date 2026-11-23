// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/trends-source.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { TrendsSource, termsOf, specification, result, summary, trendsUrl } from '../../server/nocoreach/trends-source.js';
import { trendsSignals } from '../../server/nocoreach/signals.js';
import * as __trends_source from '../../server/nocoreach/trends-source.js';
const test=__vitest_test;
const DAY=86400000;
const reply=(items,extra={})=>({status_code:20000,cost:0.011,tasks:[{status_code:20000,result:[{check_url:'https://trends.google.com/trends/explore?q=NocoBase',items,...extra}]}]});
const weeks=(n,f)=>Array.from({length:n},(_,i)=>({date_from:new Date(Date.UTC(2025,9,5)+i*7*DAY).toISOString().slice(0,10),date_to:'',timestamp:0,missing_data:false,values:f(i)}));

test('Google Trends query: up to five terms over 12 months, related searches of the first; replies parsed per term',()=>{
 assert.deepEqual(termsOf('NocoBase, Retool、 retool ,Appsmith'),['NocoBase','Retool','Appsmith']);
 assert.throws(()=>termsOf('a,b,c,d,e,f'.split(',').map(x=>x+x)),/最多比较 5 个词/);assert.throws(()=>termsOf(''),/至少填一个词/);assert.throws(()=>termsOf('x'),/2–60/);
 const spec=specification({terms:'NocoBase, Retool',locationCode:2840});
 assert.deepEqual(spec.requests.map(r=>[r.body.keywords,r.body.item_types[0],r.body.date_from+' '+r.body.date_to,r.body.location_code]),[[['NocoBase','Retool'],'google_trends_graph',`${spec.range.from} ${spec.range.to}`,2840],[['NocoBase'],'google_trends_queries_list',`${spec.range.from} ${spec.range.to}`,2840]]);
 assert.equal(specification({terms:'NocoBase'}).requests[0].body.location_code,undefined,'worldwide sends no location');assert.throws(()=>specification({terms:'NocoBase',locationCode:1}),/不支持这个地区/);
 const r=result([reply([{type:'google_trends_graph',keywords:['NocoBase','Retool'],data:[...weeks(2,i=>[40+i,70]),{date_from:'2025-10-19',missing_data:true,values:[0,0]}]}]),reply([{type:'google_trends_queries_list',data:{top:[{query:'nocobase docker',value:100}],rising:[{query:'nocobase ai',value:350},{query:'',value:5}]}}])],spec);
 assert.equal(r.status,'completed');assert.equal(r.costUsd,0.022);assert.deepEqual(r.result.points.map(p=>p.values),[[40,70],[41,70],[null,null]]);
 assert.deepEqual(r.result.rising,[{query:'nocobase ai',value:350}]);assert.equal('checkUrl' in r.result,false,'classic Explore check_url is not kept');
 assert.equal(result([reply([]),{status_code:40000,tasks:[{status_code:40000}]}],spec).status,'failed');
 const sum=summary({terms:['A','B'],points:weeks(8,i=>[i<4?20:30,50])});assert.deepEqual(sum.map(x=>[x.term,x.recent,x.change]),[['A',30,0.5],['B',50,0]]);
});

test('Open in Google Trends links the current Explore page with the same terms, region and weeks',()=>{
 const range={from:'2025-11-23',to:'2026-11-21'};
 assert.equal(trendsUrl(['NocoBase','Retool'],2840,range),'https://trends.google.com/explore?q=NocoBase%2CRetool&date=2025-11-23%202026-11-21&geo=US&hl=en');
 assert.equal(trendsUrl(['ai agent builder'],0,range),'https://trends.google.com/explore?q=ai%20agent%20builder&date=2025-11-23%202026-11-21&hl=en','worldwide sends no geo');
 assert.equal(trendsUrl(['NocoBase'],2826,null),null,'no dates known: no link, never a moving window');assert.equal(trendsUrl(['NocoBase'],null,range),null,'no region known: no link');
 // a comma inside a term would split it in Trends' q: it becomes a space, so the terms stay two, not three
 const q=t=>new URL(trendsUrl(t,0,range)).searchParams.get('q');
 assert.equal(q(['Acme, Inc.','NocoBase']),'Acme Inc.,NocoBase');assert.equal(q(['Acme， Inc.']),'Acme Inc.');assert.notEqual(q(['Acme, Inc.']),q(['Acme',' Inc.']));
 // the weeks a run covered: Google's own date_to, or the last week's start plus six days for a snapshot saved before
 // the past 12 months as two dates, as DataForSEO counts them; a request given dates sends them instead of a moving range
 const {pastYear,snapshotQuery,keywordSpecification}=__trends_source;assert.deepEqual(pastYear(Date.UTC(2026,10,21,15)),{from:'2025-11-21',to:'2026-11-21'});
 const fixed={from:'2025-01-01',to:'2026-01-01'},ks=keywordSpecification({keyword:'NocoBase',range:fixed});assert.deepEqual([ks.request.date_from,ks.request.date_to,'time_range' in ks.request,ks.range],['2025-01-01','2026-01-01',false,fixed]);
 assert.deepEqual(specification({terms:'NocoBase',range:fixed}).requests[1].body.date_from,'2025-01-01');
 // a snapshot saved before region and dates were kept: both read from the check_url DataForSEO returned with it
 assert.deepEqual(snapshotQuery({at:'2026-11-02T08:00:00Z',checkUrl:'https://trends.google.com/trends/explore?hl=en&geo=US&date=2025-11-02%202026-11-02&q=nocobase'}),{locationCode:2840,place:'美国',range:{from:'2025-11-02',to:'2026-11-02'}});
 assert.deepEqual(snapshotQuery({at:'2026-11-02T08:00:00Z',checkUrl:'https://trends.google.com/trends/explore?q=nocobase&date=today%2012-m'}),{locationCode:0,place:'全球',range:{from:'2025-11-02',to:'2026-11-02'}},'no geo is Worldwide; a moving date counts back from the day it was queried');
 assert.deepEqual(snapshotQuery({at:'2026-11-02T08:00:00Z',checkUrl:null}),{locationCode:null,place:null,range:{from:'2025-11-02',to:'2026-11-02'}},'nothing to tell the region: unknown');
 assert.deepEqual(snapshotQuery({at:'2026-11-02T08:00:00Z',checkUrl:'https://trends.google.com/trends/explore?q=x&geo=MX'}).place,null,'a region outside the list: unknown');
});

test('The conditions and links describe the saved lists: the region and dates they were queried for, after a region switch, a failed refresh and an upgrade',async()=>{
 const rows=[];const repo={findOne:async({filter})=>{const x=rows.find(y=>y.key===filter.key);return x&&{id:x.id,get:()=>x.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 const p={db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}},env:()=>JSON.stringify({verifiedAt:'t',login:'l',password:'p',budget:5}),projectIds:async()=>['1'],competitors:{state:async()=>({list:[]})},followedTopics:{of:async()=>['Acme, Inc.']}};
 const s=new TrendsSource(p),graph=weeks(52,()=>[50]).map(w=>({...w,date_to:new Date(Date.parse(w.date_from)+6*DAY).toISOString().slice(0,10)})),lists={type:'google_trends_queries_list',data:{top:[{query:'acme',value:100}],rising:[]}};
 const range=__trends_source.pastYear(Date.now()),sent=[];let fail=false;
 // the real parsers: the region and the dates come from the request the run fixed before asking
 s.d4s.run=async(id,kind,v)=>{if(fail)throw new Error('down');if(kind==='trends'){const spec=specification(v);sent.push(spec.requests[1].body);return {status:'completed',result:result([reply([{type:'google_trends_graph',data:graph}]),reply([lists])],spec).result};}
  const spec=__trends_source.keywordSpecification(v);sent.push(spec.request);return {status:'completed',result:__trends_source.keywordResult(reply([{type:'google_trends_graph',data:graph},lists]),spec).result};};
 await s.connect('1',{terms:'NocoBase',locationCode:2840});await s.runs.wait('1');await s.topicsChanged('1');await s.keywordRun;
 let v=await s.view('1'),k=v.keywords[0];
 assert.deepEqual([v.queryPlace,v.range,v.relatedUrl],['美国',range,trendsUrl(['NocoBase'],2840,range)]);
 assert.deepEqual([k.place,k.range,k.checkUrl],['美国',range,trendsUrl(['Acme, Inc.'],2840,range)]);assert.match(k.checkUrl,new RegExp(`q=Acme%20Inc\\.&date=${range.from}%20${range.to}&geo=US`));
 assert.deepEqual(sent.map(b=>[b.date_from,b.date_to,b.location_code]),[[range.from,range.to,2840],[range.from,range.to,2840]],'the request asked for exactly these dates and region');
 // switched to Japan, not queried again yet: the US topic list keeps its US conditions and link
 s.start=()=>{};await s.connect('1',{terms:'NocoBase',locationCode:2392});v=await s.view('1');k=v.keywords[0];
 assert.equal(v.place,'日本');assert.equal(v.checkUrl,null,'the comparison waits for its Japanese run');assert.deepEqual([k.place,k.checkUrl],['美国',trendsUrl(['Acme, Inc.'],2840,range)]);
 // a refresh that fails keeps the old lists with their own region and weeks
 fail=true;await s.checkKeyword('1',k.id,{force:true});v=await s.view('1');assert.equal(v.keywords[0].lastRun.ok,false);assert.equal(v.keywords[0].checkUrl,k.checkUrl);
 // switched from the US to Japan before upgrading: the older US snapshot keeps its region from its check_url, not Japan
 const kw=rows[0].payload.keywords[0];delete kw.latest.locationCode;delete kw.latest.range;kw.latest.at='2026-11-02T08:00:00.000Z';kw.latest.checkUrl='https://trends.google.com/trends/explore?q=Acme&geo=US&date=today%2012-m&hl=en';
 v=await s.view('1');k=v.keywords[0];assert.equal(v.place,'日本');assert.deepEqual([k.place,k.range,k.checkUrl],['美国',{from:'2025-11-02',to:'2026-11-02'},trendsUrl(['Acme, Inc.'],2840,{from:'2025-11-02',to:'2026-11-02'})]);
 // and one whose check_url cannot tell: the region is unknown and there is no link, never Japan's
 delete kw.latest.checkUrl;v=await s.view('1');k=v.keywords[0];assert.deepEqual([k.place,k.checkUrl],[null,null]);
 await s.connect('1',{terms:'NocoBase',locationCode:2826});
 // the next run in the new region moves the conditions with it
 fail=false;await s.checkKeyword('1',k.id,{force:true});assert.equal((await s.view('1')).keywords[0].place,'英国');
});

test('weekly check keeps the latest run; rising searches first seen after the first run are marked new and become a signal',async()=>{
 const rows=[];const repo={findOne:async({filter})=>{const r=rows.find(x=>x.key===filter.key);return r&&{id:r.id,get:()=>r.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 const p={db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}},env:()=>JSON.stringify({verifiedAt:'t',login:'l',password:'p',budget:5}),projectIds:async()=>['1'],competitors:{state:async()=>({list:[{id:'c1',name:'Retool'}]})}};
 const s=new TrendsSource(p);let runs=0;const rising=[[{query:'nocobase docker',value:200}],[{query:'nocobase docker',value:250},{query:'nocobase ai',value:400}]];
 s.d4s.run=async(id,kind,v)=>{assert.equal(kind,'trends');assert.match(v.requestKey,/^trends-1-/);return {status:'completed',result:{terms:v.terms,points:weeks(8,i=>[i<4?20:40,30]),top:[],rising:rising[runs++],checkUrl:null}};};
 await assert.rejects(s.connect('1',{terms:''}),/至少填一个词/);
 await s.connect('1',{terms:'NocoBase, Retool'});await s.runs.wait('1');
 let v=await s.view('1');assert.deepEqual(v.terms,['NocoBase','Retool']);const wk=__trends_source.pastYear(Date.now());assert.deepEqual(v.range,wk);assert.equal(v.checkUrl,trendsUrl(['NocoBase','Retool'],0,wk));assert.equal(v.relatedUrl,trendsUrl(['NocoBase'],0,wk));assert.equal(v.place,'全球');assert.deepEqual(v.rising.map(q=>q.isNew),[false],'the first run marks nothing new');
 assert.deepEqual((await s.check('1')),{skipped:true},'not again within the week');
 await s.check('1',{force:true});v=await s.view('1');assert.deepEqual(v.rising.map(q=>[q.query,q.isNew]),[['nocobase docker',false],['nocobase ai',true]]);
 const st=await s.status('1');assert.equal(st.summary[0].change,1);assert.ok(st.nextCheckAt);
 const sig=trendsSignals({tr:rows[0].payload,now:Date.now()});assert.deepEqual(sig.map(x=>x.source),['trends','trends']);assert.match(sig[0].title,/有 1 个这周开始上升/);assert.match(sig[1].title,/近 4 周上升 100%/);
 // a failed run is recorded and not retried until the next week
 s.d4s.run=async()=>{throw Object.assign(new Error('本月 DataForSEO 预算已用完'),{status:409});};const r=await s.check('1',{force:true});assert.equal(r.ok,false);
 assert.equal((await s.status('1')).lastRun.ok,false);assert.equal((await s.view('1')).rising.length,2,'the last good data stays');
 // DataForSEO not verified: connecting is refused
 const none=new TrendsSource({...p,env:()=>''});await assert.rejects(none.connect('1',{terms:'NocoBase'}),/请先接入并验证 DataForSEO/);
});

test('Update now, saving and adding a topic ask DataForSEO anew; the weekly check may reuse; a reused run keeps its date',async()=>{
 const rows=[];const repo={findOne:async({filter})=>{const r=rows.find(x=>x.key===filter.key);return r&&{id:r.id,get:()=>r.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 let topics=[];const p={db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}},env:()=>JSON.stringify({verifiedAt:'t',login:'l',password:'p',budget:5}),projectIds:async()=>['1'],competitors:{state:async()=>({list:[]})},followedTopics:{of:async()=>topics}};
 const s=new TrendsSource(p),asked=[];let reused=false;
 s.d4s.run=async(id,kind,v)=>{asked.push([kind,v.forceRefresh]);return {status:'completed',...(reused?{reused:true}:{}),result:{terms:v.terms||[v.keyword],points:weeks(8,()=>[20]),top:[],rising:[],checkUrl:null}};};
 await s.connect('1',{terms:'NocoBase'});await s.runs.wait('1');
 topics=['nocobase crm'];await s.topicsChanged('1');await s.keywordRun;
 rows[0].payload.lastRun.at=new Date(Date.now()-8*DAY).toISOString();rows[0].payload.keywords[0].lastRun.at=rows[0].payload.lastRun.at;await s.checkAll('1');
 assert.deepEqual(asked,[['trends',true],['trends-keyword',true],['trends',false],['trends-keyword',false]],'clicks force a new run, the weekly check does not');
 reused=true;rows[0].payload.latest.at='2026-01-01T00:00:00.000Z';await s.check('1',{force:true});
 assert.equal((await s.status('1')).checkedAt,'2026-01-01T00:00:00.000Z','a run returned within the 10-minute guard keeps its own date, not the click time');
});

test('Followed topics: one request each (own line and related searches), taken from Memory and queried at once, up to ten, weekly after',async()=>{
 const {keywordSpecification,keywordResult}=__trends_source;
 const spec=keywordSpecification({keyword:' ai  agent builder ',locationCode:2840});assert.equal(spec.kind,'trends-keyword');assert.deepEqual(spec.request.keywords,['ai agent builder']);assert.deepEqual(spec.request.item_types,['google_trends_graph','google_trends_queries_list']);assert.equal(spec.request.location_code,2840);assert.equal(spec.estimatedUsd,0.011);
 const r=keywordResult(reply([{type:'google_trends_graph',data:weeks(3,i=>[50+i])},{type:'google_trends_queries_list',data:{top:[{query:'ai agent',value:100}],rising:[{query:'n8n ai agent',value:250}]}}]),spec);
 assert.deepEqual(r.result.points.map(p=>p.value),[50,51,52]);assert.deepEqual(r.result.rising,[{query:'n8n ai agent',value:250}]);assert.equal(r.costUsd,0.011);assert.equal(keywordResult({status_code:40000,tasks:[]}).status,'failed');
 const rows=[];const repo={findOne:async({filter})=>{const x=rows.find(y=>y.key===filter.key);return x&&{id:x.id,get:()=>x.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 let topics=['AI agent builder'];const p={db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}},env:()=>JSON.stringify({verifiedAt:'t',login:'l',password:'p',budget:5}),projectIds:async()=>['1'],followedTopics:{of:async()=>topics}};
 const s=new TrendsSource(p),calls=[];let n=0;const rising=[[{query:'n8n ai agent',value:200}],[{query:'n8n ai agent',value:250},{query:'ai agent builder free',value:500}]];
 s.d4s.run=async(id,kind,v)=>{calls.push([kind,v.keyword||v.terms]);if(kind==='trends')return {status:'completed',result:{terms:v.terms,points:weeks(8,()=>[50]),top:[],rising:[],checkUrl:null}};return {status:'completed',result:{points:weeks(8,i=>i<4?40:60).map(w=>({date:w.date_from,value:w.values})),top:[{query:'ai agent',value:100}],rising:rising[Math.min(n++,1)],checkUrl:null}};};
 // without DataForSEO the topics are listed but nothing is asked
 const other=[],offline=new TrendsSource({...p,env:()=>'',db:{getRepository:()=>({findOne:async({filter})=>{const x=other.find(y=>y.key===filter.key);return x&&{id:x.id,get:()=>x.payload};},update:async({filterByTk,values})=>{other.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{other.push({id:other.length+1,...values});}}),sequelize:p.db.sequelize}});
 await offline.topicsChanged('1');assert.equal(calls.length,0);assert.equal(other[0].payload.keywords[0].keyword,'AI agent builder');
 // a project whose lists were not moved into Memory yet keeps its own
 assert.deepEqual(await new TrendsSource({...p,followedTopics:{of:async()=>null}}).syncTopics('1'),[]);
 await s.topicsChanged('1');let v=await s.view('1');assert.equal(v.connected,false,'no product comparison needed');assert.equal(v.keywords[0].keyword,'AI agent builder');await s.keywordRun;
 assert.deepEqual(await s.syncTopics('1'),[],'the same list changes nothing');
 v=await s.view('1');const k=v.keywords[0];assert.deepEqual([k.recent,k.change,k.average],[60,0.5,50]);assert.equal(k.checkUrl,trendsUrl(['AI agent builder'],0,__trends_source.pastYear(Date.now())));assert.deepEqual(k.rising.map(q=>q.isNew),[false],'the first run marks nothing new');assert.match(v.notes[0],/各自单独查/);
 assert.deepEqual(await s.checkAll('1'),{ok:true,error:''});assert.equal(calls.length,1,'not again within the week');
 await s.checkAll('1',{force:true});v=await s.view('1');assert.deepEqual(v.keywords[0].rising.map(q=>[q.query,q.isNew]),[['n8n ai agent',false],['ai agent builder free',true]]);
 const sig=trendsSignals({tr:rows[0].payload,now:Date.now()});assert.deepEqual(sig.map(x=>x.key.split(':')[0]),['trends-kw-rising','trends-kw-move']);assert.match(sig[1].title,/「AI agent builder」.*近 4 周上升 50%/);
 // the product comparison added later keeps the keywords; both are checked together
 await s.connect('1',{terms:'NocoBase'});await s.runs.wait('1');assert.equal((await s.view('1')).keywords.length,1);
 calls.length=0;await s.checkAll('1',{force:true});assert.deepEqual(calls.map(c=>c[0]),['trends','trends-keyword']);
 // the first ten topics are followed; a removed topic is forgotten with its data, the others keep theirs
 topics=[...topics,...Array.from({length:9},(_,i)=>`keyword ${i+1}`),'one more'];await s.topicsChanged('1');await s.keywordRun;v=await s.view('1');assert.equal(v.keywords.length,10);assert.ok(!v.keywords.some(x=>x.keyword==='one more'));assert.ok(v.keywords[0].checkedAt,'a kept topic keeps its line');
 topics=topics.filter(t=>t!=='AI agent builder');await s.topicsChanged('1');v=await s.view('1');assert.equal(v.keywords.length,10);assert.ok(!v.keywords.some(x=>x.id===k.id));
 topics=topics.slice(0,9);await s.topicsChanged('1');
 // stopping the comparison leaves the keywords running
 await s.disconnect('1');v=await s.view('1');assert.equal(v.connected,false);assert.equal(v.keywords.length,9);
});

test('产品与竞品: the product name is set once, the competitors come from 竞品; more than four are picked; a change queries again',async()=>{
 const rows=[];const repo={findOne:async({filter})=>{const x=rows.find(y=>y.key===filter.key);return x&&{id:x.id,get:()=>x.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 let list=[];const p={db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}},env:()=>JSON.stringify({verifiedAt:'t',login:'l',password:'p',budget:5}),projectIds:async()=>['1'],competitors:{state:async()=>({list})}};
 const s=new TrendsSource(p),asked=[];s.d4s.run=async(id,kind,v)=>{asked.push(v.terms);return {status:'completed',result:{terms:v.terms,points:weeks(8,()=>v.terms.map(()=>50)),top:[],rising:[],checkUrl:null}};};
 await s.connect('1',{product:'NocoBase',locationCode:2840});await s.runs.wait('1');assert.deepEqual(asked,[['NocoBase']],'no competitors yet: the product alone');
 let v=await s.view('1');assert.deepEqual(v.competitors,[]);assert.equal(v.product,'NocoBase');
 // competitors added in 竞品 join the comparison on the next look (and the weekly tick), queried again once
 list=[{id:'a',name:'Retool'},{id:'b',name:'Appsmith'},{id:'n',name:'nocobase'}];v=await s.view('1');await s.runs.wait('1');
 assert.deepEqual(v.terms,['NocoBase','Retool','Appsmith'],'the product itself is not a competitor');assert.deepEqual(asked.at(-1),['NocoBase','Retool','Appsmith']);
 const n=asked.length;await s.view('1');await s.runs.wait('1');assert.equal(asked.length,n,'unchanged: nothing asked');
 // five competitors: the first four, until the user picks
 list=[...list.slice(0,2),{id:'c',name:'ToolJet'},{id:'d',name:'Budibase'},{id:'e',name:'Airtable'}];v=await s.view('1');await s.runs.wait('1');
 assert.deepEqual(v.competitors.map(c=>[c.name,c.included]),[['Retool',true],['Appsmith',true],['ToolJet',true],['Budibase',true],['Airtable',false]]);assert.equal(v.terms.length,5);
 v=await s.pick('1',{competitorIds:['a','b','c','e']});await s.runs.wait('1');assert.deepEqual(v.terms,['NocoBase','Retool','Appsmith','ToolJet','Airtable']);assert.deepEqual(asked.at(-1),v.terms);
 // a picked competitor removed from 竞品: the next one fills in
 list=list.filter(c=>c.id!=='e');v=await s.view('1');assert.deepEqual(v.terms,['NocoBase','Retool','Appsmith','ToolJet','Budibase']);
 // renaming the product keeps the competitors
 await s.runs.wait('1');await s.connect('1',{product:'NocoBase CRM',locationCode:2840});assert.deepEqual((await s.status('1')).terms,['NocoBase CRM','Retool','Appsmith','ToolJet','Budibase']);
});

test('Trends dates do not make a run a new query: an uncertain run before UTC midnight still blocks, a double click is still reused',async()=>{
 const {identity}=__trends_source;
 // the identity is the spec as it was before dates were sent, so runs saved by the earlier version are still recognized
 const spec=specification({terms:'NocoBase, Retool',locationCode:2840,range:{from:'2025-11-22',to:'2026-11-22'}});
 assert.equal(JSON.stringify(identity(spec)),JSON.stringify({kind:'trends',terms:['NocoBase','Retool'],locationCode:2840,requests:['google_trends_graph','google_trends_queries_list'].map((t,i)=>({path:'keywords_data/google_trends/explore/live',body:{keywords:i?['NocoBase']:['NocoBase','Retool'],time_range:'past_12_months',language_code:'en',location_code:2840,item_types:[t]}})),estimatedUsd:0.022,reservationUsd:0.05,timeoutMs:120000,priceVersion:'official-list-2026-07'}));
 assert.deepEqual(identity(specification({terms:'NocoBase',range:{from:'2025-11-23',to:'2026-11-23'}})),identity(specification({terms:'NocoBase',range:{from:'2025-11-22',to:'2026-11-22'}})));
 const setup=()=>{const tables={nrSnapshots:[],nrKeywordRuns:[]};let n=0;const match=(r,f={})=>Object.entries(f).every(([k,v])=>v&&typeof v==='object'?('$in' in v?v.$in.includes(r[k]):'$gte' in v?r[k]>=v.$gte:false):k==='id'?String(r[k])===String(v):r[k]===v);
  const wrap=r=>r&&{...r,id:r.id,get:k=>r[k],toJSON:()=>({...r})};
  const repo=name=>({findOne:async o=>wrap(o.filterByTk!==undefined?tables[name].find(r=>r.id===o.filterByTk):tables[name].filter(r=>match(r,o.filter)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]),find:async o=>tables[name].filter(r=>match(r,o.filter)).map(wrap),
   create:async o=>{const r={id:++n,createdAt:new Date().toISOString(),...o.values};tables[name].push(r);return wrap(r);},update:async o=>Object.assign(tables[name].find(r=>r.id===o.filterByTk),o.values.payload&&name==='nrSnapshots'?{payload:o.values.payload}:o.values)});
  const p={db:{getRepository:repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}},app:{logger:{warn(){}}},env:()=>JSON.stringify({verifiedAt:'t',login:'l',password:'p',budget:5}),projectIds:async()=>['1'],followedTopics:{of:async()=>['NocoBase']}};
  const s=new TrendsSource(p),sent=[];return {s,tables,sent};};
 const graph={type:'google_trends_graph',data:weeks(8,()=>[50])},lists={type:'google_trends_queries_list',data:{top:[{query:'nocobase docker',value:100}],rising:[]}};
 vi.useFakeTimers({toFake:['Date']});
 try{
  // 23:59 UTC: the request times out, so it may be billed; 00:01: an ordinary Update now asks nothing
  let {s,tables,sent}=setup();s.d4s.request=async(c,path,body)=>{sent.push(body[0]);throw Object.assign(new Error('timeout'),{safeCode:'timeout'});};
  vi.setSystemTime(new Date('2026-11-22T23:59:00Z'));await s.syncTopics('1');const kid=(await s.state('1')).keywords[0].id;
  await s.checkKeyword('1',kid,{force:true});assert.equal(sent.length,1);assert.equal(tables.nrKeywordRuns[0].status,'unknown');assert.equal(sent[0].date_to,'2026-11-22');
  vi.setSystemTime(new Date('2026-11-23T00:01:00Z'));await s.checkAll('1',{force:true});assert.equal(sent.length,1,'the uncertain run of the evening before still blocks it');
  assert.equal(tables.nrKeywordRuns.length,1);
  // the person retries on purpose: asked again, with that day's dates
  s.d4s.request=async(c,path,body)=>{sent.push(body[0]);return {status_code:20000,cost:0.011,tasks:[{status_code:20000,result:[{items:[graph,lists]}]}]};};
  await s.checkKeyword('1',kid,{force:true,retry:true});assert.equal(sent.length,2);assert.equal(sent[1].date_to,'2026-11-23');
  // a success at 23:58 and a second click at 00:03: the same run is reused, and the snapshot keeps that run's own dates
  ({s,tables,sent}=setup());s.d4s.request=async(c,path,body)=>{sent.push(body[0]);return {status_code:20000,cost:0.011,tasks:[{status_code:20000,result:[{items:[graph,lists]}]}]};};
  vi.setSystemTime(new Date('2026-11-22T23:58:00Z'));await s.syncTopics('1');await s.checkKeyword('1',kid,{force:true});assert.equal(sent.length,1);
  vi.setSystemTime(new Date('2026-11-23T00:03:00Z'));await s.checkKeyword('1',kid,{force:true});assert.equal(sent.length,1,'within ten minutes the run is reused');
  const k=(await s.view('1')).keywords[0];assert.deepEqual(k.range,{from:'2025-11-22',to:'2026-11-22'});assert.equal(k.checkUrl,trendsUrl(['NocoBase'],0,{from:'2025-11-22',to:'2026-11-22'}));
  // the product comparison too: two requests once, none on the next click after midnight
  vi.setSystemTime(new Date('2026-11-23T23:59:30Z'));await s.connect('1',{terms:'NocoBase'});await s.runs.wait('1');assert.equal(sent.length,3);
  vi.setSystemTime(new Date('2026-11-24T00:02:00Z'));await s.check('1',{force:true});assert.equal(sent.length,3);assert.deepEqual((await s.view('1')).range,{from:'2025-11-23',to:'2026-11-23'});
 }finally{vi.useRealTimers();}
});
