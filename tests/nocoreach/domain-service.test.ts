// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/domain-service.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { DomainService, specification, result, host } from '../../server/nocoreach/domain-service.js';
const test=__vitest_test;
test('domain queries: bare domain from an address, keywords or pages only, approved markets',()=>{
 assert.equal(host('https://www.Example.com/docs/'),'example.com');assert.equal(host('example.co.uk'),'example.co.uk');assert.throws(()=>host('not a domain'),/域名/);
 const s=specification({view:'keywords',target:'example.com',locationCode:2840,language:'en'});assert.equal(s.kind,'domain');assert.equal(s.path,'dataforseo_labs/google/ranked_keywords/live');assert.equal(s.request.limit,100);
 assert.equal(specification({view:'pages',target:'example.com',locationCode:2840,language:'en'}).path,'dataforseo_labs/google/relevant_pages/live');
 assert.throws(()=>specification({view:'gap',target:'example.com',locationCode:2840,language:'en'}),/地区/);assert.throws(()=>specification({view:'keywords',target:'example.com',locationCode:1,language:'en'}),/地区/);
});
test('the keywords reply also gives traffic and position counts; raw provider fields are dropped',()=>{
 const s=specification({view:'keywords',target:'example.com',locationCode:2840,language:'en'});
 const r=result({status_code:20000,cost:0.021,tasks:[{status_code:20000,result:[{total_count:1290,metrics:{organic:{etv:4820.5,count:1290,pos_1:10,pos_2_3:30,pos_4_10:200}},items:[{keyword_data:{keyword:'crm',keyword_info:{search_volume:900}},ranked_serp_element:{serp_item:{url:'https://example.com/a',rank_group:4,etv:120}}}]}]}]},s);
 assert.deepEqual(r.result.summary,{traffic:4820.5,keywords:1290,top3:40,top10:240});assert.equal(r.result.items[0].position,4);assert.equal(r.result.items[0].raw,undefined);assert.equal(r.costUsd,0.021);
});
test('recent domain queries list only domain runs; reading a keyword run as a domain run is refused',async()=>{
 const rows=[{id:1,projectId:'1',status:'completed',spec:{kind:'domain',view:'keywords',target:'a.com'},result:{items:[1,2],summary:{traffic:5}},createdAt:'2026-10-02'},{id:2,projectId:'1',status:'completed',spec:{kind:'keywords',view:'related'},createdAt:'2026-10-01'}];
 const wrap=r=>r&&{...r,get:k=>r[k],toJSON:()=>r};const repo={find:async()=>rows.map(wrap),findOne:async o=>wrap(rows.find(r=>String(r.id)===o.filter.id))};
 const d=new DomainService({env:()=>null,db:{getRepository:()=>repo}});const list=await d.list('1');assert.deepEqual(list.map(r=>r.id),['1']);assert.deepEqual(list[0].summary,{traffic:5});
 await assert.rejects(d.getRun('1',{runId:2}),/不存在/);assert.equal((await d.getRun('1',{runId:1})).id,1);
});
// The first page in the default sort is the lookup every earlier version sent: same spec (key order included, as the
// query hash reads it) and request, so it costs the same and lookups saved before still open without a new charge.
const FIRST_PAGE={kind:'domain',view:'keywords',target:'nocobase.com',competitor:'',scope:'subdomains',locationCode:2840,language:'en',limit:100,offset:0,path:'dataforseo_labs/google/ranked_keywords/live',request:{location_code:2840,language_code:'en',limit:100,offset:0,target:'nocobase.com',item_types:['organic'],order_by:['ranked_serp_element.serp_item.etv,desc']},estimatedUsd:0.021,reservationUsd:0.05,priceVersion:'official-list-2026-09-23',schemaVersion:'research-2026-09-08'};
test('keyword pages: the default first page is unchanged; later pages and other sorts are lookups of their own',()=>{
 const base={view:'keywords',target:'nocobase.com',locationCode:2840,language:'en'};
 for(const v of [base,{...base,offset:0},{...base,sort:'traffic:desc'},{...base,offset:0,sort:''}])assert.equal(JSON.stringify(specification(v)),JSON.stringify(FIRST_PAGE));
 const p=specification({...base,offset:1300});assert.equal(p.offset,1300);assert.equal(p.request.offset,1300);assert.equal(p.request.limit,100);assert.equal(p.sort,undefined);assert.deepEqual(p.request.order_by,FIRST_PAGE.request.order_by);
 const s=specification({...base,sort:'volume:asc',offset:200});assert.equal(s.sort,'volume:asc');assert.deepEqual(s.request.order_by,['keyword_data.keyword_info.search_volume,asc']);
 assert.deepEqual(specification({...base,sort:'position:asc'}).request.order_by,['ranked_serp_element.serp_item.rank_group,asc']);
 assert.deepEqual(specification({...base,sort:'difficulty:desc'}).request.order_by,['keyword_data.keyword_properties.keyword_difficulty,desc']);
 for(const offset of [50,-100,10100,'x',1.5])assert.throws(()=>specification({...base,offset}),/页/);
 for(const sort of ['constructor:asc','toString:desc','keyword:asc','traffic','traffic:up','traffic:desc:x','ranked_serp_element.serp_item.etv:asc'])assert.throws(()=>specification({...base,sort}),/排序/);
 assert.throws(()=>specification({...base,view:'pages',offset:100}),/页/);
});
// A store standing in for nrKeywordRuns: find/findOne/create with the filters the DataForSEO layer and the service use.
function store(){
 const rows=[];let next=1;
 const match=(r,f={})=>Object.entries(f).every(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)?(v.$in?v.$in.map(String).includes(String(r[k])):v.$gte?String(r[k])>=v.$gte:true):String(r[k])===String(v));
 const wrap=r=>r&&{...r,get:k=>r[k],toJSON:()=>({...r})};
 const order=list=>[...list].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||b.id-a.id);
 const repo={rows,find:async(o={})=>order(rows.filter(r=>match(r,o.filter))).slice(0,o.limit??Infinity).map(wrap),findOne:async(o={})=>wrap(order(rows.filter(r=>match(r,o.filterByTk?{id:o.filterByTk}:o.filter)))[0]),
  create:async({values})=>{const r={id:next++,createdAt:new Date().toISOString(),...values};rows.push(r);return wrap(r);},
  update:async({filterByTk,values})=>{Object.assign(rows.find(r=>r.id===filterByTk),values);}};
 return repo;
}
function service(repo,calls){
 const env=()=>JSON.stringify({login:'l',password:'p',budget:5,verifiedAt:'2026-11-01'});
 const db={getRepository:()=>repo,sequelize:{transaction:async fn=>fn({}),query:async()=>undefined}};
 const d=new DomainService({env,db,app:{logger:{warn(){}}}});
 d.d4s.request=async(c,path,body)=>{calls.push(body[0]);const offset=body[0].offset;
  return {status_code:20000,cost:0.024,tasks:[{status_code:20000,result:[{total_count:1312,metrics:{organic:{etv:9,count:1312}},items:Array.from({length:Math.min(100,1312-offset)},(_,i)=>({keyword_data:{keyword:`k${offset+i}`,keyword_info:{search_volume:10}},ranked_serp_element:{serp_item:{url:'https://nocobase.com/',rank_group:1,etv:1}}}))}]}]};};
 return d;
}
const key=()=>Math.random().toString(36).slice(2,12);
test('keyword pages: every page of 1,312 can be read; a page read again within 30 days is not charged again',async()=>{
 const repo=store(),calls=[],d=service(repo,calls),base={projectId:'1',view:'keywords',target:'nocobase.com',locationCode:2840,language:'en'};
 const first=await d.run('1',{...base,requestKey:key()});assert.equal(first.status,'completed');assert.deepEqual(first.pages,[]);assert.deepEqual(calls[0],FIRST_PAGE.request);
 for(let offset=100;offset<1312;offset+=100){const r=await d.run('1',{...base,offset,requestKey:key()});assert.equal(r.status,'completed');assert.equal(r.result.items[0].keyword,`k${offset}`);}
 assert.equal(calls.length,14);assert.equal(repo.rows.at(-1).result.items.length,12);
 const again=await d.run('1',{...base,offset:500,requestKey:key()});assert.equal(again.reused,true);assert.equal(calls.length,14);assert.equal(repo.rows.length,14);
 // Reopening the lookup brings its later pages; Recent lookups lists the first page only.
 const open=await d.getRun('1',{runId:first.id});assert.deepEqual(open.pages.map(p=>p.spec.offset),Array.from({length:13},(_,i)=>(i+1)*100));
 assert.deepEqual((await d.list('1')).map(r=>r.id),[String(first.id)]);
 // Another sort is read anew from its first page; pages older than 30 days are not counted as read.
 const byVolume=await d.run('1',{...base,sort:'volume:desc',requestKey:key()});assert.equal(byVolume.reused,undefined);assert.equal(calls.length,15);assert.deepEqual(byVolume.pages,[]);assert.deepEqual(calls.at(-1).order_by,['keyword_data.keyword_info.search_volume,desc']);
 repo.rows.find(r=>r.spec.offset===200&&!r.spec.sort).createdAt='2026-01-01T00:00:00.000Z';
 assert.equal((await d.getRun('1',{runId:first.id})).pages.some(p=>p.spec.offset===200),false);
 assert.deepEqual((await d.list('1')).map(r=>r.id),[String(first.id)]);
});
