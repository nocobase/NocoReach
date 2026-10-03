const test=require('node:test'),assert=require('node:assert/strict');
const {DomainService,specification,result,host}=require('../../plugins/connections/server/domain-service');
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
