// @ts-nocheck
// 访问 (GA4) read live: website-report.ts against canned GA4 Data API and Realtime API responses.
import { test, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { WebsiteReport, TABLES } from '../../server/nocoreach/website-report.js';
import { websiteView, windowFor } from '../../server/nocoreach/data-views.js';

afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
// A GA4 report from plain rows: dimension and metric names in order, the date range last when the request named several.
const report=(dims,metrics,rows)=>({dimensionHeaders:dims.map(name=>({name})),metricHeaders:metrics.map(name=>({name})),rows:rows.map(r=>({dimensionValues:r[0].map(value=>({value})),metricValues:r[1].map(v=>({value:String(v)}))}))});
const fake=answer=>{const calls=[],warnings=[];const g=new WebsiteReport({token:async()=>'t',app:{logger:{warn:(m,x)=>warnings.push([m,x])}}});g.timeZone=async()=>'UTC';g.post=async(id,property,method,body)=>{calls.push({method,body});return answer(method,body);};return {g,calls,warnings};};
const dimsOf=r=>r.dimensions.map(d=>d.name).join(',');

test('period: deduplicated totals for both periods, the daily line, every table; pages merged by path; AI sources marked',async()=>{
 const w=windowFor('2026-10-10','7');
 const answer=(dims,r)=>{const m=r.metrics.map(x=>x.name);
  if(!dims)return report(['dateRange'],m,[[['current'],[100,60,150,90,9000,400,900,12,0.08]],[['previous'],[80,50,120,60,6000,300,700,6,0.05]]]);
  if(dims==='date')return report(['date','dateRange'],m,[[['20261005','current'],[10,6,15,9,900,40,90,1,0.06]],[['20261004','current'],[12,6,15,9,900,40,90,1,0.06]],[['20260928','previous'],[8,5,12,6,600,30,70,1,0.05]]]);
  if(dims==='pagePath,pageTitle')return report(['pagePath','pageTitle'],m,[[['/docs','Docs'],[300,50,4000,600,3]],[['/docs','Docs (old)'],[20,5,100,30,0]],[['/','Home'],[100,40,2000,200,1]]]);
  if(dims==='sessionSource,sessionMedium')return report(['sessionSource','sessionMedium'],m,[[['google','organic'],[50,30,80,50,4000,200,500,6,0.07]],[['chatgpt.com','referral'],[9,8,11,9,1500,30,60,2,0.18]],[['perplexity.ai','referral'],[3,3,4,3,300,8,20,0,0]]]);
  return report(r.dimensions.map(d=>d.name),m,[]);};
 const {g,calls}=fake((method,body)=>method==='batchRunReports'?{reports:body.requests.map(r=>answer(dimsOf(r),r))}:null);
 const v=await g.period('1','123',w);
 assert.equal(calls.length,3,'15 reports in three batches');
 assert.deepEqual(calls[0].body.requests[0].dateRanges,[{startDate:w.start,endDate:w.end,name:'current'},{startDate:w.previousStart,endDate:w.previousEnd,name:'previous'}]);
 assert.equal(calls[0].body.requests[1].dateRanges[0].endDate,'yesterday','the line runs on past the cutoff');
 assert.equal(v.totals.current.users,100);assert.equal(v.totals.previous.sessions,120);assert.equal(v.totals.current.keyEventRate,0.08);
 assert.deepEqual(v.daily.map(r=>r.date),['2026-10-04','2026-10-05']);assert.deepEqual(v.previousDaily.map(r=>r.date),['2026-09-28']);
 assert.deepEqual(Object.keys(v.tables).sort(),Object.keys(TABLES).sort());assert.deepEqual(v.missing,[]);
 assert.deepEqual(v.tables.page.map(p=>[p.key,p.title,p.views,p.users]),[['/docs','Docs',320,55],['/','Home',100,40]],'one row per path, titled by its most viewed title');
 assert.deepEqual(v.tables.sourceMedium.map(r=>r.ai||null),[null,'ChatGPT','Perplexity']);assert.deepEqual(v.ai,{sessions:15,sources:2});
});

test('period: a report GA4 refuses is left out on its own and named; other failures fail the page',async()=>{
 const w=windowFor('2026-10-10','7');
 const {g,warnings}=fake((method,body)=>{if(method==='batchRunReports')throw Object.assign(new Error('Field combination invalid'),{status:400,code:'google_api_error'});
  if(dimsOf(body)==='eventName')throw Object.assign(new Error('Incompatible'),{status:400,code:'google_api_error'});return report(body.dimensions.map(d=>d.name),body.metrics.map(m=>m.name),[]);});
 const v=await g.period('1','123',w);assert.deepEqual(v.missing,['event']);assert.equal(v.tables.event,undefined);assert.ok(warnings.some(([m])=>m==='NocoReach GA4 report left out'));
 const expired=fake(()=>{throw Object.assign(new Error('expired'),{status:400,code:'invalid_grant'});}).g;
 await assert.rejects(expired.period('1','123',w),e=>e.status===409&&/重新授权/.test(e.message));
 const denied=fake(()=>{throw Object.assign(new Error('forbidden'),{status:403,code:'google_api_error'});}).g;
 await assert.rejects(denied.period('1','123',w),e=>e.status===409&&/没有读取 GA4/.test(e.message));
 const down=fake(()=>{throw Object.assign(new Error('unreachable'),{code:'network_unreachable'});}).g;
 await assert.rejects(down.period('1','123',w),e=>e.status===502&&/没能从 GA4 读取数据/.test(e.message));
});

test('every request goes through the project Google connection, never the global fetch',async()=>{
 const global=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('real network forbidden'));
 const seen=[];const host={token:async()=>'access',googleFetch:id=>async(url,init)=>{seen.push([id,String(url),init.headers.Authorization]);const body=JSON.parse(init.body);
  return new Response(JSON.stringify(String(url).endsWith(':runRealtimeReport')?report(body.dimensions.map(d=>d.name),body.metrics.map(m=>m.name),[]):{timeZone:'UTC'}),{status:200,headers:{'content-type':'application/json'}});}};
 const r=await new WebsiteReport(host).realtime('7','123');
 assert.equal(r.users,0);assert.equal(global.mock.calls.length,0);
 assert.equal(seen.length,7);assert.ok(seen.every(([id,url,auth])=>id==='7'&&url==='https://analyticsdata.googleapis.com/v1beta/properties/123:runRealtimeReport'&&auth==='Bearer access'));
});

test('today: compared with yesterday and last week up to the hour GA4 has reached, users deduplicated over those hours',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T10:30:00Z'));
 const {g,calls}=fake((method,body)=>{const r=body.requests[0];
  if(dimsOf(r)==='hour'){const rows=[];for(let h=0;h<24;h++){if(h<9)rows.push([[String(h).padStart(2,'0'),'today'],[10,4,0]]);rows.push([[String(h).padStart(2,'0'),'yesterday'],[12,5,1]],[[String(h).padStart(2,'0'),'lastWeek'],[8,3,0]]);}
   return {reports:[report(['hour','dateRange'],['screenPageViews','sessions','keyEvents'],rows),report(['sessionSource','sessionMedium'],['sessions','activeUsers'],[[['google','organic'],[20,18]],[['chatgpt.com','referral'],[4,4]]])]};}
  return {reports:[report(['dateRange'],['activeUsers','screenPageViews','sessions','keyEvents'],[[['today'],[30,90,36,0]],[['yesterday'],[33,108,45,9]],[['lastWeek'],[25,72,27,0]]])]};});
 const t=await g.today('1','123');
 assert.equal(t.date,'2026-10-14');assert.equal(t.lastWeekDate,'2026-10-07');assert.equal(t.time,'10:30');
 assert.equal(t.through,9,'hours 0–8 have data; the comparison stops there, not at the clock hour');
 assert.deepEqual(calls[1].body.requests[0].dimensionFilter.filter.inListFilter.values.filter(x=>x.length===2),['00','01','02','03','04','05','06','07','08']);
 assert.equal(t.totals.today.users,30);assert.equal(t.totals.yesterday.views,108);assert.equal(t.fullDay.yesterday,288);
 assert.equal(t.hours[8].today,10);assert.equal(t.hours[9].today,null);assert.equal(t.sources[1].ai,'ChatGPT');
 assert.equal((await g.today('1','123')),t,'kept ten minutes');
});

test('realtime: the last 30 minutes oldest first; pages, places, devices and events',async()=>{
 const {g}=fake((method,body)=>{assert.equal(method,'runRealtimeReport');const d=body.dimensions.map(x=>x.name).join(','),m=body.metrics.map(x=>x.name);
  if(!d)return report([],m,[[[],[37,120,400,2]]]);if(d==='minutesAgo')return report(['minutesAgo'],m,[[['00'],[5]],[['29'],[1]]]);
  if(d==='unifiedScreenName')return report(['unifiedScreenName'],m,[[['Docs'],[9,14]]]);if(d==='countryId,country')return report(['countryId','country'],m,[[['US','United States'],[20]]]);return report(body.dimensions.map(x=>x.name),m,[]);});
 const r=await g.realtime('1','123');
 assert.equal(r.users,37);assert.equal(r.perMinute.length,30);assert.equal(r.perMinute[29],5);assert.equal(r.perMinute[0],1);
 assert.deepEqual(r.pages,[{title:'Docs',users:9,views:14}]);assert.deepEqual(r.countries,[{id:'US',name:'United States',users:20}]);
});

test('realtime: a query GA4 refuses is left out with its reason; a failed total or lost access fails with Google\'s reason',async()=>{
 const refuse=msg=>{throw Object.assign(new Error(msg),{status:400,code:'google_api_error'});};
 const answer=bad=>(method,body)=>{const d=body.dimensions.map(x=>x.name).join(','),m=body.metrics.map(x=>x.name);if(d===bad)refuse(`Field ${bad} is not valid`);
  if(!d)return report([],m,[[[],[37,120,400,2]]]);return report(body.dimensions.map(x=>x.name),m,[]);};
 const {g,warnings}=fake(answer('city,countryId'));const r=await g.realtime('1','123');
 assert.equal(r.users,37);assert.deepEqual(r.cities,[]);assert.deepEqual(r.missing,[{part:'cities',reason:'HTTP 400 · Field city,countryId is not valid'}]);
 assert.ok(warnings.some(([m,x])=>m==='NocoReach GA4 realtime part left out'&&x.part==='cities'));
 const fine=await fake(answer('none')).g.realtime('1','123');assert.equal(fine.missing,undefined);
 await assert.rejects(fake(answer('')).g.realtime('1','123'),e=>e.status===502&&e.message.includes('HTTP 400 · Field  is not valid'));
 const quota=fake(()=>{throw Object.assign(new Error('Exhausted concurrent requests quota.'),{status:429,code:'google_api_error'});}).g;
 await assert.rejects(quota.realtime('1','123'),e=>e.status===502&&/没能从 GA4 读取数据：HTTP 429 · Exhausted concurrent requests quota\./.test(e.message));
 const denied=fake((method,body)=>body.dimensions.length?(()=>{throw Object.assign(new Error('forbidden'),{status:403,code:'google_api_error'});})():report([],body.metrics.map(m=>m.name),[[[],[1,1,1,0]]])).g;
 await assert.rejects(denied.realtime('1','123'),e=>e.status===409&&/没有读取 GA4/.test(e.message));
});

test('row: one row filtered exactly, unknown tables refused',async()=>{
 const w=windowFor('2026-10-10','7');
 const {g,calls}=fake((method,body)=>({reports:body.requests.map(r=>report(r.dimensions.map(d=>d.name).concat('dateRange'),r.metrics.map(m=>m.name),[]))}));
 await g.row('1','123',w,{table:'page',dims:{pagePath:'/docs',pageTitle:'ignored'}});
 assert.deepEqual(calls[0].body.requests[0].dimensionFilter,{andGroup:{expressions:[{filter:{fieldName:'pagePath',stringFilter:{matchType:'EXACT',value:'/docs',caseSensitive:true}}}]}});
 await assert.rejects(g.row('1','123',w,{table:'nope',dims:{}}),e=>e.status===400);
 await assert.rejects(g.row('1','123',w,{table:'channel',dims:{}}),e=>e.status===400);
});

test('访问 view: window at the cutoff, Search Console queries on their page rows, refused reports named',async()=>{
 const end='2026-09-27',snaps=[{key:'project',payload:{end}},{key:'history-web',payload:[{date:'2026-09-20'},{date:end}]},{key:'queries-7',payload:[{keyword:'install nocobase',page:'https://x.com/docs/install/',clicks:9,impressions:300,position:4},{keyword:'docker',page:'https://x.com/docs/install',clicks:2,impressions:900,position:9}]}];
 let asked;const v=await websiteView(snaps,'7',async w=>{asked=w;return {totals:{current:{},previous:{}},daily:[],previousDaily:[],tables:{page:[{key:'/docs/install',views:5}]},missing:['city'],ai:{sessions:0,sources:0}};});
 assert.deepEqual(asked,windowFor(end,'7'));assert.equal(v.cutoff,end);
 assert.deepEqual(v.tables.page[0].queries.map(q=>q.keyword),['docker','install nocobase'],'most seen first, trailing slash ignored');
 assert.deepEqual(v.missing,['city']);
 assert.equal((await websiteView([{key:'history-web',payload:[]}],'28',()=>{throw new Error('not asked');})).cutoff,null);
});
