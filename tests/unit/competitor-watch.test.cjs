const test=require('node:test'),assert=require('node:assert/strict');
const {CompetitorWatch,siteOf,repoOf,memoryNames}=require('../../plugins/connections/server/competitor-watch');
const {competitorSignals}=require('../../plugins/connections/server/signals');
const DAY=86400000;
function setup(){const rows=[];const repo={findOne:async({filter})=>{const r=rows.find(x=>x.key===filter.key);return r&&{id:r.id,get:()=>r.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 const site={pages:[{url:'https://retool.com/'},{url:'https://retool.com/pricing'}],warnings:[]},gh={stars:1000,releases:[{name:'v1.0',tag_name:'v1.0',html_url:'https://github.com/tooljet/tooljet/releases/v1.0',published_at:'2026-09-01T00:00:00Z'}]},calls=[];
 const p={db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}},projectIds:async()=>['1'],
  projects:{get:async()=>({id:1,name:'NocoBase',domains:['nocobase.com'],memory:{competitors:'- Retool（按人收费）\n- Appsmith：开源\nToolJet、Budibase'}})},
  siteContent:{discover:async origin=>{calls.push(['site',origin]);return site;}},
  github:{token:()=>'',gh:async path=>{calls.push(['gh',path]);if(path.endsWith('/releases?per_page=5'))return gh.releases;return {stargazers_count:gh.stars,forks_count:10,description:'Low-code'};}}};
 const w=new CompetitorWatch(p,async url=>({text:`<html><head><title>${url.split('/').pop()} page</title><meta name="description" content="about it"></head></html>`,type:'text/html'}));
 return {w,rows,site,gh,calls};}

test('competitor list: website and/or GitHub, not your own site, at most five; names from 记忆 offered',async()=>{
 assert.equal(siteOf('retool.com/pricing'),'https://retool.com');assert.equal(repoOf('https://github.com/ToolJet/ToolJet'),'ToolJet/ToolJet');assert.equal(repoOf('appsmithorg/appsmith'),'appsmithorg/appsmith');assert.throws(()=>repoOf('https://gitlab.com/a'),/GitHub 仓库/);
 assert.deepEqual(memoryNames({memory:{competitors:'- Retool（按人收费）\n- Appsmith：开源\nToolJet、Budibase'}},[{name:'appsmith'}]),['Retool','ToolJet','Budibase']);
 const {w}=setup();await assert.rejects(w.add('1',{name:'X'}),/至少填一个/);await assert.rejects(w.add('1',{name:'Own',site:'docs.nocobase.com'}),/本项目自己的网站/);
 const st=await w.add('1',{name:'Retool',site:'https://retool.com'});await w.checking;assert.deepEqual(st.list.map(c=>c.name),['Retool']);assert.deepEqual(st.suggestions,['Appsmith','ToolJet','Budibase']);
 await assert.rejects(w.add('1',{name:'retool',site:'retool.io'}),/已经在列表里/);
 for(const n of ['A1','B1','C1','D1'])await w.add('1',{name:n,repo:`org/${n}`}).then(()=>w.checking);await assert.rejects(w.add('1',{name:'F1',repo:'org/f'}),/最多关注 5 个/);
});

test('weekly look: the first one records, later ones list new pages (titles read) and new releases; stars over the week',async()=>{
 const {w,rows,site,gh,calls}=setup();
 await w.add('1',{name:'Retool',site:'retool.com'});await w.checking;await w.add('1',{name:'ToolJet',repo:'tooljet/tooljet'});await w.checking;
 let v=await w.view('1');assert.equal(v.events.length,0,'the first look records only');assert.equal(v.list[0].pages,2);assert.equal(v.list[1].stars,1000);assert.equal(v.list[1].latestRelease.name,'v1.0');
 assert.deepEqual((await w.check('1')),{events:0,errors:[]},'not again within the week');
 site.pages.push({url:'https://retool.com/blog/agents'});gh.releases.unshift({name:'v1.1',tag_name:'v1.1',html_url:'https://github.com/tooljet/tooljet/releases/v1.1',published_at:'2026-10-03T00:00:00Z'});gh.stars=1300;
 const t=rows[0].payload.track;for(const id of Object.keys(t)){t[id].checkedAt=new Date(Date.now()-8*DAY).toISOString();if(t[id].stars)t[id].stars={[new Date(Date.now()-7*DAY).toISOString().slice(0,10)]:1000};}
 const r=await w.check('1');assert.equal(r.events,2);
 v=await w.view('1');assert.deepEqual(v.events.map(e=>[e.competitor,e.type,e.title]),[['ToolJet','release','发布 v1.1'],['Retool','page','agents page']]);assert.equal(v.events[1].detail,'about it');
 assert.equal(v.list[1].week,300);assert.ok(v.lastRun.ok);
 // a site that suddenly lists many new addresses is one event
 site.pages.push(...Array.from({length:50},(_,i)=>({url:`https://retool.com/templates/${i}`})));rows[0].payload.track[v.list[0].id].checkedAt=new Date(Date.now()-8*DAY).toISOString();
 await w.check('1');v=await w.view('1');assert.equal(v.events[0].title,'网站新增了 50 个网址');
 // signals: several new pages or a release in the week
 const sig=competitorSignals({cw:rows[0].payload,now:Date.now()});assert.deepEqual(sig.map(s=>s.title),['ToolJet 发布 v1.1']);
 rows[0].payload.events.unshift(...['a','b','c'].map(x=>({id:x,competitorId:v.list[0].id,type:'page',title:x,url:'https://retool.com/'+x,at:new Date().toISOString()})));
 assert.match(competitorSignals({cw:rows[0].payload,now:Date.now()})[0].title,/Retool 近 7 天在官网新增 4 个页面/);
 // failures are recorded per competitor, the rest still looked at
 w.p.siteContent.discover=async()=>{throw new Error('没有找到 sitemap');};for(const c of v.list)rows[0].payload.track[c.id].checkedAt=new Date(Date.now()-8*DAY).toISOString();
 const bad=await w.check('1');assert.deepEqual(bad.errors,['Retool 官网：没有找到 sitemap']);assert.deepEqual((await w.status('1')).list[0].errors,['没有找到 sitemap']);
 await w.remove('1',{competitorId:v.list[0].id});v=await w.view('1');assert.deepEqual(v.list.map(c=>c.name),['ToolJet']);assert.ok(v.events.every(e=>e.competitor==='ToolJet'));
 assert.ok(calls.some(c=>c[0]==='gh'&&c[1]==='/repos/tooljet/tooljet'));
});
