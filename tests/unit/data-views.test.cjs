const test=require('node:test'),assert=require('node:assert/strict');
const {windowFor,metric,netChange,githubCard,communityCard,contentCard,gscCard}=require('../../plugins/connections/server/data-views');
const iso=t=>new Date(t).toISOString().slice(0,10),DAY=86400000;
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
