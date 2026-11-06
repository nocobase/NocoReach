// @ts-nocheck
// 访问 (GA4) read live: website-report.ts against canned GA4 Data API and Realtime API responses.
import { test, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { WebsiteReport, TABLES, FIRST_TABLES, REST_TABLES } from '../../server/nocoreach/website-report.js';
import { DataViews, websiteView, windowFor } from '../../server/nocoreach/data-views.js';
import { GA4_PARTIAL_CACHE_MS } from '../../shared/ga4-cache.js';

afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
// A GA4 report from plain rows: dimension and metric names in order, the date range last when the request named several.
const report=(dims,metrics,rows)=>({dimensionHeaders:dims.map(name=>({name})),metricHeaders:metrics.map(name=>({name})),rows:rows.map(r=>({dimensionValues:r[0].map(value=>({value})),metricValues:r[1].map(v=>({value:String(v)}))}))});
const fake=answer=>{const calls=[],warnings=[];const g=new WebsiteReport({token:async()=>'t',app:{logger:{warn:(m,x)=>warnings.push([m,x])}}});g.timeZone=async()=>'UTC';g.post=async(id,property,method,body)=>{calls.push({method,body});return answer(method,body);};return {g,calls,warnings};};
const dimsOf=r=>r.dimensions.map(d=>d.name).join(',');

test('period: deduplicated totals for both periods, the daily line and the first tables; the other tables apart; pages merged by path; AI sources marked',async()=>{
 const w=windowFor('2026-10-10','7');
 const answer=(dims,r)=>{const m=r.metrics.map(x=>x.name);
  const by=o=>m.map(k=>o[k]??1);
  if(dims==='sessionDefaultChannelGroup'&&r.dateRanges.length===2)return report(['sessionDefaultChannelGroup','dateRange'],m,[[['Organic Search','current'],by({screenPageViews:60,sessions:50,keyEvents:3,newUsers:20,activeUsers:40})],[['Organic Search','previous'],by({screenPageViews:90,sessions:70,keyEvents:5,newUsers:30,activeUsers:55})],[['Referral','previous'],by({screenPageViews:10,sessions:8,keyEvents:0,newUsers:2,activeUsers:6})],[['Referral','current'],m.map(()=>0)]]);
  if(dims==='pagePath'&&r.dateRanges.length===2)return report(['pagePath','dateRange'],m,[[['/docs','current'],[300,2]],[['/docs/','current'],[10,0]],[['/docs','previous'],[200,1]]]);
  // A landing page seen only in the period before is answered for the current one too, at zero.
  if(dims==='landingPagePlusQueryString'&&r.dateRanges.length===2)return report(['landingPagePlusQueryString','dateRange'],m,[[['/','previous'],by({sessions:30,newUsers:6})],[['/','current'],by({sessions:20,newUsers:4})],[['/old','previous'],by({sessions:9,newUsers:3})],[['/?utm_source=x','current'],by({sessions:5,newUsers:1})],[['/old','current'],m.map(()=>0)]]);
  if(!dims)return report(['dateRange'],m,[[['current'],[100,60,150,90,9000,400,900,12,0.08]],[['previous'],[80,50,120,60,6000,300,700,6,0.05]]]);
  // GA4 also answers each range on the other range's days, at zero.
  if(dims==='date')return report(['date','dateRange'],m,[[['20261005','current'],[10,6,15,9,900,40,90,1,0.06]],[['20261004','current'],[12,6,15,9,900,40,90,1,0.06]],[['20260928','previous'],[8,5,12,6,600,30,70,1,0.05]],[['20260928','current'],[0,0,0,0,0,0,0,0,0]],[['20261004','previous'],[0,0,0,0,0,0,0,0,0]]]);
  if(dims==='pagePath,pageTitle')return report(['pagePath','pageTitle'],m,[[['/docs','Docs'],[300,50,4000,600,3]],[['/docs','Docs (old)'],[20,5,100,30,0]],[['/','Home'],[100,40,2000,200,1]]]);
  if(dims==='sessionSource,sessionMedium')return report(['sessionSource','sessionMedium'],m,[[['google','organic'],[50,30,80,50,4000,200,500,6,0.07]],[['chatgpt.com','referral'],[9,8,11,9,1500,30,60,2,0.18]],[['perplexity.ai','referral'],[3,3,4,3,300,8,20,0,0]]]);
  return report(r.dimensions.map(d=>d.name),m,[]);};
 const {g,calls}=fake((method,body)=>method==='batchRunReports'?{reports:body.requests.map(r=>answer(dimsOf(r),r))}:null);
 const v=await g.period('1','123',w);
 assert.equal(calls.length,2,'the first seven reports in one round of two batches');
 assert.deepEqual(calls.map(c=>c.body.requests.length),[5,2]);
 assert.deepEqual(calls[0].body.requests[0].dateRanges,[{startDate:w.start,endDate:w.end,name:'current'},{startDate:w.previousStart,endDate:w.previousEnd,name:'previous'}]);
 assert.equal(calls[0].body.requests[1].dateRanges[0].endDate,w.end,'the line covers the same days as the totals');
 assert.equal(v.totals.current.users,100);assert.equal(v.totals.previous.sessions,120);assert.equal(v.totals.current.keyEventRate,0.08);
 assert.deepEqual(v.daily.map(r=>r.date),['2026-10-04','2026-10-05']);assert.deepEqual(v.previousDaily.map(r=>r.date),['2026-09-28']);
 const changeRequests=c=>c.flatMap(c=>c.body.requests).filter(r=>r.dateRanges.length===2&&r.dimensions.length===1&&r.dimensions[0].name!=='date');
 assert.deepEqual(changeRequests(calls).map(dimsOf),['sessionDefaultChannelGroup'],'channels read once, for both periods, with the figures');
 assert.equal(calls.flatMap(c=>c.body.requests).filter(r=>dimsOf(r)==='sessionDefaultChannelGroup').length,1);
 assert.deepEqual(v.tables.channel.map(r=>[r.key,r.sessions,r.engaged]),[['Organic Search',50,1]],'the table holds the current period only, with every column, and not a channel seen only before it');
 assert.deepEqual(v.changes.channel,[{key:'Organic Search',current:{users:40,newUsers:20,sessions:50,views:60,keyEvents:3},previous:{users:55,newUsers:30,sessions:70,views:90,keyEvents:5}},{key:'Referral',current:{users:0,newUsers:0,sessions:0,views:0,keyEvents:0},previous:{users:6,newUsers:2,sessions:8,views:10,keyEvents:0}}]);
 assert.deepEqual(Object.keys(v.tables).sort(),[...FIRST_TABLES].sort());assert.deepEqual(v.missing,[]);assert.equal(v.complete,true);
 assert.deepEqual(v.tables.sourceMedium.map(r=>r.ai||null),[null,'ChatGPT','Perplexity']);assert.equal(v.ai,undefined,'the AI share is GA4\'s own AI Assistant channel');
 const t=await g.periodTables('1','123',w),later=calls.slice(2);
 assert.deepEqual(later.map(c=>c.body.requests.length),[5,4],'the other nine reports, read apart, in one round');
 assert.deepEqual(changeRequests(later).map(dimsOf),['landingPagePlusQueryString','pagePath'],'landing pages and pages read for both periods');
 assert.equal(later.flatMap(c=>c.body.requests).filter(r=>dimsOf(r)==='landingPagePlusQueryString').length,1,'landing pages read once, for their table and the change');
 // A table read with its change is sorted as that change, as the table keeps its first rows.
 for(const [name,dim] of [['channel','sessionDefaultChannelGroup'],['landing','landingPagePlusQueryString']])
  assert.equal(calls.flatMap(c=>c.body.requests).find(r=>dimsOf(r)===dim).orderBys[0].metric.metricName,TABLES[name].order||'sessions',`${name}'s table keeps its own order`);
 assert.deepEqual(t.changes.page,[{key:'/docs',current:{views:310,keyEvents:2},previous:{views:200,keyEvents:1}}],'/docs and /docs/ are one page');
 assert.deepEqual(t.changes.landing,[{key:'/',current:{sessions:25,newUsers:5},previous:{sessions:30,newUsers:6}},{key:'/old',current:{sessions:0,newUsers:0},previous:{sessions:9,newUsers:3}}],'a landing page with a query string is its path, and one seen only before stays behind the change');
 assert.deepEqual(t.tables.landing.map(r=>[r.key,r.sessions,r.engaged]),[['/',20,1],['/?utm_source=x',5,1]],'the table holds the current period only, with every column, and not a landing page seen only before it');
 assert.deepEqual(Object.keys(t.tables).sort(),[...REST_TABLES].sort());assert.deepEqual(t.missing,[]);assert.equal(t.complete,true);
 assert.deepEqual([...FIRST_TABLES,...REST_TABLES].sort(),Object.keys(TABLES).sort(),'every table is in one part');
 assert.equal(t.totals,undefined,'the figures come with the first part only');
 assert.deepEqual(t.tables.page.map(p=>[p.key,p.title,p.views,p.users]),[['/docs','Docs',320,55],['/','Home',100,40]],'one row per path, titled by its most viewed title');
});

test('period: a report GA4 refuses is left out on its own and named; other failures fail the page',async()=>{
 const w=windowFor('2026-10-10','7');
 const {g,warnings}=fake((method,body)=>{if(method==='batchRunReports')throw Object.assign(new Error('Field combination invalid'),{status:400,code:'google_api_error'});
  if(dimsOf(body)==='eventName')throw Object.assign(new Error('Incompatible'),{status:400,code:'google_api_error'});return report(body.dimensions.map(d=>d.name),body.metrics.map(m=>m.name),[]);});
 const v=await g.period('1','123',w);assert.deepEqual(v.missing,['event']);assert.equal(v.tables.event,undefined);assert.ok(warnings.some(([m])=>m==='NocoReach GA4 report left out'));
 // Channel's table and the channels behind a change are one report: refused, both are left out, and the rest stays.
 const channels=fake((method,body)=>{if(method==='batchRunReports')throw Object.assign(new Error('Field combination invalid'),{status:400,code:'google_api_error'});
  if(dimsOf(body)==='sessionDefaultChannelGroup')throw Object.assign(new Error('Incompatible'),{status:400,code:'google_api_error'});return report(body.dimensions.map(d=>d.name),body.metrics.map(m=>m.name),[]);}).g;
 const c=await channels.period('1','123',w);assert.deepEqual(c.missing,['channel']);assert.equal(c.tables.channel,undefined);assert.equal(c.changes.channel,undefined);assert.ok(c.tables.device);assert.equal(c.complete,false);
 // So are Landing pages' table and the landing pages behind a change, in the other part; the pages behind a change stay.
 const landing=fake((method,body)=>{if(method==='batchRunReports')throw Object.assign(new Error('Field combination invalid'),{status:400,code:'google_api_error'});
  if(dimsOf(body)==='landingPagePlusQueryString')throw Object.assign(new Error('Incompatible'),{status:400,code:'google_api_error'});return report(body.dimensions.map(d=>d.name),body.metrics.map(m=>m.name),[]);}).g;
 const l=await landing.periodTables('1','123',w);assert.deepEqual(l.missing,['landing']);assert.equal(l.tables.landing,undefined);assert.equal(l.changes.landing,undefined);assert.ok(l.changes.page);assert.ok(l.tables.page);assert.equal(l.complete,false);
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

test('today: compared with yesterday and last week up to the hours GA4 has settled, users and sources over those hours',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T10:30:00Z'));
 const {g,calls}=fake((method,body)=>{const r=body.requests[0];
  if(dimsOf(r)==='hour'){const rows=[];for(let h=0;h<24;h++){if(h<9)rows.push([[String(h).padStart(2,'0'),'today'],[10,4,0]]);rows.push([[String(h).padStart(2,'0'),'yesterday'],[12,5,1]],[[String(h).padStart(2,'0'),'lastWeek'],[8,3,0]]);}
   return {reports:[report(['hour','dateRange'],['screenPageViews','sessions','keyEvents'],rows)]};}
  return {reports:[report(['dateRange'],['activeUsers','screenPageViews','sessions','keyEvents'],[[['today'],[30,90,36,0]],[['yesterday'],[33,108,45,9]],[['lastWeek'],[25,72,27,0]]]),report(['sessionSource','sessionMedium'],['sessions','activeUsers'],[[['google','organic'],[20,18]],[['chatgpt.com','referral'],[4,4]]])]};});
 const t=await g.today('1','123');
 assert.equal(t.date,'2026-10-14');assert.equal(t.lastWeekDate,'2026-10-07');assert.equal(t.time,'10:30');
 assert.equal(t.reached,9,'hours 0–8 have data, not up to the clock hour');assert.equal(t.through,7,'the last two of them are still filling in');
 const upTo=['00','01','02','03','04','05','06'];
 assert.deepEqual(calls[1].body.requests[0].dimensionFilter.filter.inListFilter.values.filter(x=>x.length===2),upTo);
 assert.deepEqual(calls[1].body.requests[1].dimensions.map(d=>d.name),['sessionSource','sessionMedium']);
 assert.deepEqual(calls[1].body.requests[1].dimensionFilter.filter.inListFilter.values.filter(x=>x.length===2),upTo,'sources over the same hours');
 assert.equal(t.timeZoneConfirmed,true);
 assert.equal(t.totals.today.users,30);assert.equal(t.totals.yesterday.views,108);assert.equal(t.fullDay.yesterday,288);
 assert.equal(t.hours[8].today,10);assert.equal(t.hours[9].today,null);assert.equal(t.sources[1].ai,'ChatGPT');
 const asked=calls.length;assert.deepEqual(await g.today('1','123'),t,'kept ten minutes');assert.equal(calls.length,asked);
});

test('today: past ten minutes a page is answered at once with the last read of the day while GA4 is read again; another day never answers',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T10:30:00Z'));
 let views=10,release;const {g,calls}=fake((method,body)=>{const r=body.requests[0];
  if(dimsOf(r)==='hour')return {reports:[report(['hour','dateRange'],['screenPageViews','sessions','keyEvents'],[[['08','today'],[views,4,0]]])]};
  return {reports:[report(['dateRange'],['activeUsers','screenPageViews','sessions','keyEvents'],[[['today'],[1,views,1,0]]]),report(['sessionSource','sessionMedium'],['sessions','activeUsers'],[])]};});
 const first=await g.today('1','123');assert.equal(first.hours[8].today,10);assert.equal(first.refreshing,undefined);
 vi.setSystemTime(new Date('2026-10-14T10:41:00Z'));views=20;const asked=calls.length;
 const post=g.post;g.post=(...a)=>new Promise(r=>{release=()=>r(post(...a));});
 const copy=await g.today('1','123');
 assert.equal(copy.hours[8].today,10,'the earlier read answers');assert.equal(copy.refreshing,true);assert.equal(copy.savedAt,Date.parse('2026-10-14T10:30:00Z'));
 assert.ok(copy.cacheExpiresAt<=Date.now()+5000,'asked for again within seconds');
 await vi.waitFor(()=>assert.ok(release));g.post=post;release();await g.history.settled();
 assert.ok(calls.length>asked);const fresh=await g.today('1','123');assert.equal(fresh.hours[8].today,20);assert.equal(fresh.refreshing,undefined);
 vi.setSystemTime(new Date('2026-10-15T00:30:00Z'));views=30;
 const next=await g.today('1','123');assert.equal(next.date,'2026-10-15');assert.equal(next.hours[8].today,30,'a new day waits for its own read');assert.equal(next.refreshing,undefined);
});

test('today: a failed time zone lookup is retried after five minutes, and an unconfirmed zone does not cap the hours by the clock',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-14T06:30:00Z'));
 let lookups=0,down=true;const warnings=[];
 const g=new WebsiteReport({token:async()=>'t',app:{logger:{warn:(m,x)=>warnings.push([m,x])}}});
 g.json=async()=>{lookups++;if(down)throw Object.assign(new Error('timeout'),{code:'network_timeout'});return {timeZone:'Asia/Shanghai'};};
 g.post=async(id,property,method,body)=>{const r=body.requests[0];if(dimsOf(r)==='hour'){const rows=[];for(let h=0;h<15;h++)rows.push([[String(h).padStart(2,'0'),'today'],[10,4,0]]);return {reports:[report(['hour','dateRange'],['screenPageViews','sessions','keyEvents'],rows)]};}
  return {reports:[report(['dateRange'],['activeUsers','screenPageViews','sessions','keyEvents'],[[['today'],[1,1,1,0]]]),report(['sessionSource','sessionMedium'],['sessions','activeUsers'],[])]};};
 const t=await g.today('1','123');
 assert.equal(t.timeZone,'UTC');assert.equal(t.timeZoneConfirmed,false);
 assert.equal(t.reached,15,'GA4 has hours 0–14 in the property zone; the UTC clock (06:30) does not cut them at 6');assert.equal(t.through,13);
 assert.ok(warnings.some(([m])=>m==='NocoReach GA4 time zone lookup failed'));
 down=false;assert.equal(await g.timeZone('1','123'),'UTC');assert.equal(lookups,1,'the fallback is kept for a few minutes');
 vi.setSystemTime(new Date('2026-10-14T06:36:00Z'));assert.equal(await g.timeZone('1','123'),'Asia/Shanghai');assert.equal(lookups,2);
 vi.setSystemTime(new Date('2026-10-14T20:00:00Z'));assert.equal(await g.timeZone('1','123'),'Asia/Shanghai');assert.equal(lookups,2,'a confirmed zone is kept a day');
});

test('realtime: the last 30 minutes oldest first; pages, places, devices and events',async()=>{
 const {g}=fake((method,body)=>{assert.equal(method,'runRealtimeReport');const d=body.dimensions.map(x=>x.name).join(','),m=body.metrics.map(x=>x.name);
  if(!d)return report([],m,[[[],[37,120,400,2]]]);if(d==='minutesAgo')return report(['minutesAgo'],m,[[['00'],[5]],[['29'],[1]]]);
  if(d==='unifiedScreenName')return report(['unifiedScreenName'],m,[[['Docs'],[9,14]]]);if(d==='countryId,country')return report(['countryId','country'],m,[[['US','United States'],[20]]]);return report(body.dimensions.map(x=>x.name),m,[]);});
 const r=await g.realtime('1','123');
 assert.equal(r.users,37);assert.equal(r.perMinute.length,30);assert.equal(r.perMinute[29],5);assert.equal(r.perMinute[0],1);
 assert.deepEqual(r.pages,[{title:'Docs',users:9,views:14}]);assert.deepEqual(r.countries,[{id:'US',name:'United States',users:20}]);
});

test('realtime summary: the card\'s figures and minutes in two requests; a fresh full read answers it',async()=>{
 const asked=[];const {g}=fake((method,body)=>{const d=body.dimensions.map(x=>x.name).join(','),m=body.metrics.map(x=>x.name);asked.push(d);
  if(!d)return report([],m,[[[],[37,120,400,2]]]);if(d==='minutesAgo')return report(['minutesAgo'],m,[[['00'],[5]]]);return report(body.dimensions.map(x=>x.name),m,[]);});
 const s=await g.realtime('1','123',true);
 assert.deepEqual(asked,['','minutesAgo']);assert.equal(s.users,37);assert.equal(s.perMinute[29],5);assert.equal(s.summary,true);assert.deepEqual(s.pages,[]);
 assert.equal((await g.realtime('1','123',true)).users,37);assert.equal(asked.length,2,'kept for a minute');
 const full=await g.realtime('1','123');assert.equal(asked.length,9);assert.equal(full.summary,undefined);
 const other=fake((method,body)=>{const d=body.dimensions.map(x=>x.name).join(',');asked.push('other:'+d);return report(body.dimensions.map(x=>x.name),body.metrics.map(x=>x.name),d?[]:[[[],[1,1,1,1]]]);});
 await other.g.realtime('1','123');const n=asked.length;assert.equal((await other.g.realtime('1','123',true)).summary,undefined,'answered by the full read');assert.equal(asked.length,n);
});

test('realtime: a query GA4 refuses is left out with its reason; a failed total or lost access fails with Google\'s reason',async()=>{
 const refuse=msg=>{throw Object.assign(new Error(msg),{status:400,code:'google_api_error'});};
 const answer=bad=>(method,body)=>{const d=body.dimensions.map(x=>x.name).join(','),m=body.metrics.map(x=>x.name);if(d===bad)refuse(`Field ${bad} is not valid`);
  if(!d)return report([],m,[[[],[37,120,400,2]]]);return report(body.dimensions.map(x=>x.name),m,[]);};
 const {g,warnings}=fake(answer('city,countryId'));const r=await g.realtime('1','123');
 assert.equal(r.users,37);assert.deepEqual(r.cities,[]);assert.deepEqual(r.missing,[{part:'cities',reason:'HTTP 400 · Field city,countryId is not valid'}]);
 assert.ok(warnings.some(([m,x])=>m==='NocoReach GA4 realtime part left out'&&x.part==='cities'));
 const ok=fake(answer('none')),fine=await ok.g.realtime('1','123');assert.equal(fine.missing,undefined);
 assert.deepEqual(ok.calls.find(c=>dimsOf(c.body)==='eventName').body.metrics.map(m=>m.name),['eventCount'],'the Realtime API refuses eventName with activeUsers');
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
 const later=await websiteView(snaps,'7',async()=>({tables:{page:[]},missing:[]}),undefined,undefined,async()=>'2026-09-30');
 assert.deepEqual(later.queriesWindow,{start:windowFor(end,'7').start,end},'the queries keep the synced range while the traffic reaches yesterday');
 assert.equal((await websiteView(snaps,'custom',async()=>({tables:{},missing:[]}),'2026-09-25','2026-09-27')).queriesWindow,null,'no synced queries for a custom range');
 assert.equal((await websiteView([{key:'history-web',payload:[]}],'28',()=>{throw new Error('not asked');},undefined,undefined,()=>{throw new Error('no zone lookup without data');})).cutoff,null);
});

test('Traffic window ends yesterday, ahead of the synced cutoff, with the last two days unsettled',async()=>{
 const synced='2026-09-27',snaps=[{key:'project',payload:{end:synced}},{key:'history-web',payload:[{date:'2026-09-20'},{date:synced}]}];
 let asked,passed;const period=async(w,_cutoff,settled)=>{asked=w;passed=settled;return {tables:{},missing:[]};};
 const v=await websiteView(snaps,'7',period,undefined,undefined,async()=>'2026-09-30');
 assert.deepEqual(asked,windowFor('2026-09-30','7'));assert.equal(v.cutoff,'2026-09-30');assert.equal(v.settledThrough,'2026-09-28');assert.equal(passed,'2026-09-28','the report keeps it');
 const copy=await websiteView(snaps,'7',async()=>({tables:{},missing:[],window:windowFor('2026-09-29','7'),cutoff:'2026-09-29',settledThrough:'2026-09-27'}),undefined,undefined,async()=>'2026-09-30');
 assert.equal(copy.cutoff,'2026-09-29');assert.equal(copy.settledThrough,'2026-09-27','a saved report keeps the days it had unsettled when read');
 await websiteView(snaps,'custom',period,'2026-09-25','2026-09-30',async()=>'2026-09-30');
 assert.equal(asked.end,'2026-09-30','a custom range can reach yesterday');
 const behind=await websiteView(snaps,'7',period,undefined,undefined,async()=>'2026-09-27');
 assert.equal(behind.cutoff,synced);assert.equal(behind.settledThrough,'2026-09-25','only the days GA4 is still processing are unsettled');
 assert.equal((await websiteView(snaps,'7',period)).settledThrough,synced,'no yesterday: the synced days are all settled');
});

test('yesterday follows the property time zone, not UTC',async()=>{
 vi.useFakeTimers({now:new Date('2026-10-31T01:00:00Z')});
 const {g}=fake(()=>({}));
 g.timeZone=async()=>'America/Los_Angeles';assert.equal(await g.yesterday('1','123'),'2026-10-29');
 g.timeZone=async()=>'Asia/Shanghai';assert.equal(await g.yesterday('1','123'),'2026-10-30');
});

test('yesterday after a failed zone lookup ends on a day already over everywhere, and does not wait on a known zone',async()=>{
 vi.useFakeTimers({now:new Date('2026-10-31T02:00:00Z')});
 const {g}=fake(()=>({}));
 g.zones.set('123',{at:Date.now(),zone:'UTC',confirmed:false,ttl:300000});
 assert.equal(await g.yesterday('1','123'),'2026-10-29','UTC-12 is still on 10-30, the day under way in Los Angeles');
 let lookups=0;g.timeZone=async()=>{lookups++;return 'Asia/Shanghai';};
 g.zones.set('123',{at:Date.now()-86400001,zone:'America/Los_Angeles',confirmed:true,ttl:86400000});
 assert.equal(await g.yesterday('1','123'),'2026-10-29','the known zone is used while it is looked up again');assert.equal(lookups,1);
});

test('callers at the same time share one zone lookup, and a failure keeps the zone known by then',async()=>{
 const {g}=fake(()=>({}));g.timeZone=WebsiteReport.prototype.timeZone;g.token=async()=>'t';
 let answer;g.json=vi.fn(()=>new Promise(r=>{answer=r;}));
 const a=g.timeZone('1','123'),b=g.yesterday('1','123');await vi.waitFor(()=>assert.ok(answer));
 answer({timeZone:'Asia/Shanghai'});
 assert.equal(await a,'Asia/Shanghai');await b;assert.equal(g.json.mock.calls.length,1,'one Admin API call');
 g.zones.set('123',{...g.zones.get('123'),at:0});g.json=vi.fn(async()=>{throw Object.assign(new Error('quota'),{status:429});});
 assert.equal(await g.timeZone('1','123'),'Asia/Shanghai');assert.equal(g.zones.get('123').confirmed,true);assert.equal(g.zones.get('123').ttl,300000);
});

test('after a restart the zone the sync kept on the project answers without waiting on the Admin API',async()=>{
 vi.useFakeTimers({now:new Date('2026-10-31T01:00:00Z')});
 const report=project=>{const g=new WebsiteReport({token:async()=>'t',project:async()=>{if(project instanceof Error)throw project;return project;}});g.json=vi.fn(async()=>({timeZone:'America/Los_Angeles'}));return g;};
 const g=report({analyticsPropertyId:'123',analyticsPropertyTimeZone:'Asia/Shanghai'});
 assert.equal(await g.yesterday('1','123'),'2026-10-30','Shanghai is on 10-31');assert.equal(g.json.mock.calls.length,0);
 assert.equal(await g.timeZone('1','123'),'Asia/Shanghai');assert.equal(g.zones.get('123').confirmed,true);assert.equal(g.json.mock.calls.length,0,'kept a day like a lookup');
 vi.setSystemTime(new Date('2026-11-01T01:00:01Z'));await g.timeZone('1','123');assert.equal(g.json.mock.calls.length,1,'then looked up again');
 vi.setSystemTime(new Date('2026-10-31T01:00:00Z'));
 for(const project of [{analyticsPropertyId:'456',analyticsPropertyTimeZone:'Asia/Shanghai'},{analyticsPropertyId:'123',analyticsPropertyTimeZone:'Mars/Olympus'},{analyticsPropertyId:'123'},Object.assign(new Error('gone'),{status:404})]){
  const other=report(project);assert.equal(await other.yesterday('1','123'),'2026-10-29','no usable saved zone: Los Angeles, from the Admin API');assert.equal(other.json.mock.calls.length,1);}
});

test('a period ended on a guessed zone tells the browser to ask again soon, without reading GA4 again',async()=>{
 vi.useFakeTimers({now:new Date('2026-10-31T06:00:00Z')});
 const {g}=fake(()=>({}));const read=vi.fn(async()=>({tables:{},missing:[]}));g.readPeriod=read;
 g.zones.set('123',{at:Date.now(),zone:'UTC',confirmed:false,ttl:300000});
 const w=windowFor('2026-10-29','7');
 assert.equal((await g.period('1','123',w)).cacheExpiresAt,Date.now()+GA4_PARTIAL_CACHE_MS);
 vi.setSystemTime(Date.now()+GA4_PARTIAL_CACHE_MS+60000);
 assert.equal((await g.period('1','123',w)).cacheExpiresAt,Date.now()+GA4_PARTIAL_CACHE_MS);
 assert.equal(read.mock.calls.length,1,'the stored copy keeps its own lifetime');
});

test('a stored period from another zone expires for the browser at this zone\'s midnight',async()=>{
 vi.useFakeTimers({now:new Date('2026-10-31T06:00:00Z')});
 const {g}=fake(()=>({}));g.readPeriod=async()=>({tables:{},missing:[]});
 const w=windowFor('2026-10-30','7');await g.period('1','123',w);
 g.zones.set('123',{at:Date.now(),zone:'America/Los_Angeles',confirmed:true,ttl:86400000});
 assert.equal((await g.period('1','123',w)).cacheExpiresAt,Date.parse('2026-10-31T07:00:00Z'),'built under UTC, served in Los Angeles at 23:00');
});

test('a period is kept until midnight in the zone its window ends in',async()=>{
 vi.useFakeTimers({now:new Date('2026-10-31T06:00:00Z')});
 const {g}=fake(()=>({}));g.readPeriod=async()=>({tables:{},missing:[]});
 g.zones.set('123',{at:Date.now(),zone:'America/Los_Angeles',confirmed:true,ttl:86400000});
 const v=await g.period('1','123',windowFor('2026-10-30','7'));
 assert.equal(v.cacheExpiresAt,Date.parse('2026-10-31T07:00:00Z'),'23:00 in Los Angeles: an hour left, not six');
});

test('the tick reads the other tables only when a read lasts until midnight: from the hour before the morning in the property\'s zone',async()=>{
 const {g}=fake(()=>({}));g.zones.set('123',{at:Date.now(),zone:'America/Los_Angeles',confirmed:true,ttl:86400000});
 // Los Angeles is seven hours behind UTC on 2026-10-31.
 assert.equal(g.nightRead('123',Date.parse('2026-10-31T07:00:00Z')),true,'midnight');
 assert.equal(g.nightRead('123',Date.parse('2026-10-31T11:59:00Z')),true,'04:59: lives until the morning');
 assert.equal(g.nightRead('123',Date.parse('2026-10-31T12:00:00Z')),false,'05:00: has most of yesterday and lasts until midnight');
 assert.equal(g.nightRead('123',Date.parse('2026-10-31T06:00:00Z')),false,'23:00 the day before');
 const views=new DataViews({sync:{link:async()=>({get:k=>k==='ga4PropertyId'?'123':null})}});views.ga4=g;
 vi.useFakeTimers({now:new Date('2026-10-31T11:00:00Z')});
 try{assert.equal(await views.websiteDayRead('1'),false,'04:00 there');vi.setSystemTime(new Date('2026-10-31T13:00:00Z'));assert.equal(await views.websiteDayRead('1'),true,'06:00 there');
  // With no zone held yet it is looked up first, so the hour is the property's rather than UTC's; the tick passes the
  // property of the link it holds, so no link is read.
  const unheld=fake(()=>({})).g;unheld.timeZone=async(_id,property)=>{unheld.zones.set(property,{at:Date.now(),zone:'America/Los_Angeles',confirmed:true,ttl:86400000});return 'America/Los_Angeles';};
  const tick=new DataViews({sync:{link:async()=>{throw new Error('the link is not read');}}});tick.ga4=unheld;
  vi.setSystemTime(new Date('2026-10-31T11:00:00Z'));assert.equal(await tick.websiteDayRead('1','123'),false,'04:00 there, though 11:00 in UTC');
  // A project with Search Console only has no GA4 property: nothing to read ahead, and no zone looked up for it.
  unheld.timeZone=async()=>{throw new Error('no zone is looked up');};vi.setSystemTime(new Date('2026-10-31T20:00:00Z'));
  assert.equal(await tick.websiteDayRead('1',null),false);assert.equal(await views.websiteDayRead('1',undefined),true,'a missing property asks the link');}
 finally{vi.useRealTimers();}
});

test('all-time daily reports increase the row limit and omit previous data',async()=>{
 const {g,calls}=fake((method,body)=>({reports:body.requests.map(r=>report(r.dimensions.map(d=>d.name),r.metrics.map(m=>m.name),[]))}));
 const w=windowFor('2026-09-27','all',undefined,undefined,'2022-01-01');
 const all=await g.period('1','123',w);
 const daily=calls.flatMap(c=>c.body.requests||[]).find(r=>dimsOf(r)==='date');
 assert.ok(Number(daily.limit)>1000);assert.equal(daily.dateRanges[0].endDate,w.end);
 assert.equal(all.totals.previous,null);assert.deepEqual(all.previousDaily,[]);
 const detail=await g.row('1','123',w,{table:'page',dims:{pagePath:'/docs'}});
 const rowRequest=calls.at(-1).body.requests[0];
 assert.ok(Number(rowRequest.limit)>1000);
 assert.equal(detail.totals.previous,null);assert.deepEqual(detail.previousDaily,[]);
 const count=calls.length;
 await g.row('1','123',w,{table:'page',dims:{pagePath:'/docs'}});
 assert.equal(calls.length,count,'all-time row reuses the history cache');
});

test('a paired table is sorted by its own figures, whatever order GA4 gives a report over two periods',async()=>{
 const w=windowFor('2026-10-10','28');
 // GA4 answers ordered by the period before here: the current period's rows come out smallest first.
 const pages=Array.from({length:320},(_,i)=>i+1),channels=['Direct','Referral','Organic Search'];
 const {g}=fake((method,body)=>({reports:body.requests.map(r=>{const d=dimsOf(r),m=r.metrics.map(x=>x.name),at=n=>m.map(k=>k==='sessions'?n:1);
  if(d==='landingPagePlusQueryString'&&r.dateRanges.length===2)return report([d,'dateRange'],m,pages.flatMap(i=>[[[`/p${i}`,'previous'],at(1000-i)],[[`/p${i}`,'current'],at(i)]]));
  if(d==='sessionDefaultChannelGroup'&&r.dateRanges.length===2)return report([d,'dateRange'],m,channels.flatMap((c,i)=>[[[c,'previous'],at(100-i)],[[c,'current'],at(i+1)]]));
  return report(r.dimensions.map(x=>x.name),m,[]);})}));
 const t=await g.periodTables('1','123',w);
 assert.equal(t.tables.landing.length,300,'the table keeps its first 300 rows');
 assert.deepEqual([t.tables.landing[0].key,t.tables.landing[0].sessions,t.tables.landing.at(-1).key],['/p320',320,'/p21'],'the current period\'s most sessions first, and those kept');
 const v=await g.period('1','123',w);
 assert.deepEqual(v.tables.channel.map(r=>r.key),['Organic Search','Referral','Direct']);
});

test('the whole period reads no changes: paired tables for the current period alone, and no pages behind a change',async()=>{
 const w=windowFor('2026-09-27','all',undefined,undefined,'2022-01-01');
 const {g,calls}=fake((method,body)=>({reports:body.requests.map(r=>{const d=dimsOf(r),m=r.metrics.map(x=>x.name);
  return d==='landingPagePlusQueryString'||d==='sessionDefaultChannelGroup'?report([d],m,[[[d==='landingPagePlusQueryString'?'/':'Direct'],m.map(()=>3)]]):report(r.dimensions.map(x=>x.name),m,[]);})}));
 const v=await g.period('1','123',w),t=await g.periodTables('1','123',w),requests=calls.flatMap(c=>c.body.requests);
 assert.deepEqual(calls.map(c=>c.body.requests.length),[5,2,5,3],'seven reports, then eight');
 assert.deepEqual(requests.filter(r=>r.dateRanges.length===2).map(dimsOf),['','date'],'only the figures and the line are read over two ranges');
 assert.equal(requests.filter(r=>dimsOf(r)==='pagePath').length,0,'no pages behind a change');
 for(const [name,dim] of [['channel','sessionDefaultChannelGroup'],['landing','landingPagePlusQueryString']]){const r=requests.find(x=>dimsOf(x)===dim);
  assert.equal(r.limit,String(TABLES[name].limit),`${name} with its table's own limit`);assert.equal(r.orderBys[0].metric.metricName,'sessions');}
 assert.deepEqual([v.tables.channel.map(r=>r.key),t.tables.landing.map(r=>r.key)],[['Direct'],['/']]);
 assert.deepEqual([v.changes,t.changes,t.missing,t.complete],[{},{},[],true]);
});
