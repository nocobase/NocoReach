// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/data-views.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { windowFor, metric, netChange, githubCard, communityCard, contentCard, gscCard } from '../../server/nocoreach/data-views.js';
import * as __data_views from '../../server/nocoreach/data-views.js';
const test=__vitest_test;
const iso=t=>new Date(t).toISOString().slice(0,10),DAY=86400000;
test('community view: days before retained data are null not zero; comparison only when both periods are covered',async()=>{
 const {DataViews}=__data_views;const d=n=>iso(Date.now()-n*DAY);
 const topics={1:{id:1,slug:'a',title:'A',createdAt:d(2)+'T01:00:00Z',replies:0,views:5,categoryId:1},2:{id:2,slug:'b',title:'B',createdAt:d(3)+'T01:00:00Z',replies:4,views:50,solved:true,categoryId:2},3:{id:3,slug:'c',title:'C',createdAt:d(10)+'T01:00:00Z',replies:1,views:9,categoryId:1}};
 const view=cm=>new DataViews({community:{state:async()=>cm}}).community('1',{range:'7'});
 const full=await view({origin:'https://f',status:'active',retainedFrom:d(400),topics,categories:{1:'Q',2:'Bugs'}});
 assert.equal(full.kpis[0].value,2);assert.equal(full.kpis[0].previous,1);assert.equal(full.kpis[0].change,1);assert.equal(full.kpis.find(k=>k.key==='solved').value,50);
 assert.equal(full.top[0].title,'B');assert.equal(full.unanswered[0].url,'https://f/t/a/1');assert.deepEqual(full.categories.map(c=>[c.name,c.count,c.previous]),[['Q',1,1],['Bugs',1,0]]);
 const partial=await view({origin:'https://f',status:'active',retainedFrom:d(4),topics,categories:{}});
 assert.equal(partial.daily[0].topics,null);assert.equal(partial.kpis[0].previous,null);assert.equal(partial.kpis[0].change,null);assert.ok(partial.notes[0].includes('社区数据从'));
});
// The GitHub page's view is tested in tests/nocoreach/github-view.test.ts since 2026-10-14.
test('windows: N days, calendar months and custom ranges, each with an equal previous period',()=>{
 assert.deepEqual(windowFor('2026-09-27','7'),{start:'2026-09-21',end:'2026-09-27',days:7,previousStart:'2026-09-14',previousEnd:'2026-09-20'});
 assert.equal(windowFor('2026-09-27','3m').start,'2026-06-28');
 const c=windowFor('2026-09-27','custom','2026-09-01','2026-09-10');assert.deepEqual([c.start,c.end,c.days,c.previousStart],['2026-09-01','2026-09-10',10,'2026-08-22']);
 assert.throws(()=>windowFor('2026-09-27','custom','2026-09-10','2026-09-01'),e=>e.status===400);assert.throws(()=>windowFor('2026-09-27','5'),e=>e.status===400);
});
test('metrics compare only when both periods are complete; missing days are not zeros',()=>{
 const rows=[];for(let i=0;i<14;i++)rows.push({date:iso(Date.parse('2026-09-14')+i*DAY),clicks:10});
 const w=windowFor('2026-09-27','7');assert.deepEqual(metric(rows,'clicks',w),{value:70,previous:70,complete:true,change:0});
 const gap=rows.filter(r=>r.date!=='2026-09-25');const m=metric(gap,'clicks',w);assert.equal(m.complete,false);assert.equal(m.change,null);assert.equal(m.value,60);
 assert.equal(metric(rows.slice(7),'clicks',w).previous,null);
 assert.equal(gscCard([],'2026-09-27',w),null);
 const card=gscCard(rows.map(r=>({...r,impressions:(r.clicks||0)*10})),'2026-09-27',w);assert.equal(card.seriesBy.clicks.length,7);assert.equal(card.seriesBy.impressions.length,7,'each metric has its own daily series');assert.equal(card.seriesBy.impressions[0].value,card.seriesBy.clicks[0].value*10);
});
test('GitHub: net new stars need the sample on the day before the window; notes explain gaps',()=>{
 const daily={'2026-09-20':{stars:100,forks:5},'2026-09-27':{stars:130,forks:6}};const w=windowFor('2026-09-27','7');
 assert.equal(netChange(daily,'stars',w.start,w.end),30);assert.equal(netChange({'2026-09-25':{stars:1}},'stars',w.start,w.end),null);
 const card=githubCard({repo:'o/r',daily:{'2026-09-30':{stars:1,forks:1}},token:null,traffic:{}},w);assert.equal(card.metrics[0].value,null);assert.ok(card.notes.some(n=>n.includes('token')));assert.ok(card.notes.some(n=>n.includes('Traffic')));
});
test('community counts topics per day from retained data and says where coverage starts',()=>{
 const today=iso(Date.now()),y=iso(Date.now()-DAY);const cm={origin:'https://f',status:'active',retainedFrom:iso(Date.now()-10*DAY),topics:{1:{createdAt:y+'T01:00:00Z',replies:0},2:{createdAt:y+'T02:00:00Z',replies:3}}};
 const card=communityCard(cm,windowFor(y,'28'));const topics=card.metrics.find(m=>m.key==='topics');assert.equal(topics.value,2);assert.equal(topics.complete,false);assert.ok(card.notes[0].includes('社区数据从'));assert.equal(card.metrics.find(m=>m.key==='unanswered').value,1);void today;
});
test('content card counts pages updated in the window and stale pages',()=>{
 const w=windowFor('2026-09-27','28');const c=contentCard({sites:[{}],pages:[{lastmod:'2026-09-10'},{lastmod:'2024-01-01'},{}]},w,Date.parse('2026-09-28'));
 assert.deepEqual(c.metrics.map(m=>m.value),[3,1,1]);assert.match(c.notes[0],/1 个页面没有提供更新时间/);
});
test('下载量 view: downloads per package in range with the previous period, Docker pulls from daily samples; Hacker News view lists stories and comments in range',async()=>{
 const {DataViews}=__data_views;const d=n=>iso(Date.now()-n*DAY);
 const daily={},samples={};for(let i=1;i<=14;i++){daily[d(i)]=100;samples[d(i)]=10000-i*50;}samples[d(15)]=10000-15*50;
 const st={status:'active',packages:[{id:'npm:x',registry:'npm',name:'x',title:'x'},{id:'docker:o/x',registry:'docker',name:'o/x'}],daily:{'npm:x':daily},samples:{'docker:o/x':samples}};
 const r=await new DataViews({packages:{state:async()=>st}}).downloads('1',{range:'7'});
 assert.equal(r.connected,true);const npm=r.packages.find(p=>p.registry==='npm'),docker=r.packages.find(p=>p.registry==='docker');
 assert.deepEqual([npm.value,npm.previous,npm.change,npm.url],[700,700,0,'https://www.npmjs.com/package/x']);
 assert.deepEqual([docker.value,docker.previous,docker.total],[350,350,9950]);assert.equal(r.kpis.find(k=>k.key==='downloads').value,700);
 assert.deepEqual(await new DataViews({packages:{state:async()=>null}}).downloads('1',{}),{connected:false});
 const at=n=>new Date(Date.now()-n*DAY).toISOString();
 const hn={terms:['nocobase'],status:'active',retainedFrom:d(30),mentions:{1:{id:'1',type:'story',title:'Show HN: NocoBase',url:'https://x.io',hnUrl:'https://news.ycombinator.com/item?id=1',points:120,comments:40,createdAt:at(2),term:'nocobase'},2:{id:'2',type:'story',title:'Old',hnUrl:'h2',points:500,comments:1,createdAt:at(20),term:'nocobase'},3:{id:'3',type:'comment',title:'Ask HN: tools',hnUrl:'h3',excerpt:'We use NocoBase',createdAt:at(1),term:'nocobase'}}};
 const h=await new DataViews({hackernews:{state:async()=>hn}}).hackernews('1',{range:'7'});
 assert.deepEqual(h.stories.map(s=>[s.title,s.points]),[['Show HN: NocoBase',120]],'only stories in range');assert.equal(h.comments[0].excerpt,'We use NocoBase');assert.equal(h.kpis.find(k=>k.key==='mentions').value,2);
 assert.deepEqual(await new DataViews({hackernews:{state:async()=>({terms:[],status:'active'})}}).hackernews('1',{}),{connected:false});
});

// 访问 is read live from GA4 since 2026-10-14: tests/nocoreach/website-report.test.ts.
