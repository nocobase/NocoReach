const test=require('node:test'),assert=require('node:assert/strict');
const {windowFor,metric,netChange,githubCard,communityCard,contentCard,gscCard}=require('../../plugins/connections/server/data-views');
const iso=t=>new Date(t).toISOString().slice(0,10),DAY=86400000;
test('community view: days before retained data are null not zero; comparison only when both periods are covered',async()=>{
 const {DataViews}=require('../../plugins/connections/server/data-views');const d=n=>iso(Date.now()-n*DAY);
 const topics={1:{id:1,slug:'a',title:'A',createdAt:d(2)+'T01:00:00Z',replies:0,views:5,categoryId:1},2:{id:2,slug:'b',title:'B',createdAt:d(3)+'T01:00:00Z',replies:4,views:50,solved:true,categoryId:2},3:{id:3,slug:'c',title:'C',createdAt:d(10)+'T01:00:00Z',replies:1,views:9,categoryId:1}};
 const view=cm=>new DataViews({community:{state:async()=>cm}}).community('1',{range:'7'});
 const full=await view({origin:'https://f',status:'active',retainedFrom:d(400),topics,categories:{1:'Q',2:'Bugs'}});
 assert.equal(full.kpis[0].value,2);assert.equal(full.kpis[0].previous,1);assert.equal(full.kpis[0].change,1);assert.equal(full.kpis.find(k=>k.key==='solved').value,50);
 assert.equal(full.top[0].title,'B');assert.equal(full.unanswered[0].url,'https://f/t/a/1');assert.deepEqual(full.categories.map(c=>[c.name,c.count,c.previous]),[['Q',1,1],['Bugs',1,0]]);
 const partial=await view({origin:'https://f',status:'active',retainedFrom:d(4),topics,categories:{}});
 assert.equal(partial.daily[0].topics,null);assert.equal(partial.kpis[0].previous,null);assert.equal(partial.kpis[0].change,null);assert.ok(partial.notes[0].includes('社区数据从'));
});
test('GitHub view: per-day rows in range, releases filtered by range, uniques never summed into a period total',async()=>{
 const {DataViews}=require('../../plugins/connections/server/data-views');const y=iso(Date.now()-DAY),d=n=>iso(Date.now()-n*DAY);
 const daily={};for(let i=10;i>=1;i--)daily[d(i)]={stars:100+(10-i)*3,forks:10};const gh={repo:'o/r',status:'active',daily,token:{verifiedAt:'t'},traffic:{since:d(9),views:{[d(2)]:{count:50,uniques:20},[d(1)]:{count:60,uniques:25}},clones:{},referrers:{[d(1)]:[{referrer:'news.ycombinator.com',count:40,uniques:30}]},paths:{}},releases:[{tag:'v2',publishedAt:d(3)+'T00:00:00Z'},{tag:'v1',publishedAt:d(40)+'T00:00:00Z'}],issues:{total:5,top:[],labels:{}}};
 const r=await new DataViews({github:{state:async()=>gh}}).github('1',{range:'7'});
 assert.equal(r.connected,true);assert.equal(r.daily.length,7);assert.equal(r.daily.at(-1).date,y);assert.equal(r.daily.at(-1).views,60);
 assert.deepEqual(r.releases.map(x=>x.tag),['v2']);assert.equal(r.kpis.find(k=>k.key==='stars').value,21);assert.ok(!r.kpis.some(k=>k.key==='uniques'));assert.equal(r.referrers.items[0].referrer,'news.ycombinator.com');
 assert.deepEqual(await new DataViews({github:{state:async()=>null}}).github('1',{}),{connected:false});
});
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
