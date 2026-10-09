const test=require('node:test'),assert=require('node:assert/strict');
const {CompetitorWatch,siteOf,repoOf,memoryNames}=require('../../apps/nocoreach/server/providers/reach/domain/competitor-watch.cjs');
const {competitorSignals}=require('../../apps/nocoreach/server/providers/reach/domain/signals.cjs');
const DAY=86400000;
function setup(){const rows=[];const repo={findOne:async({filter})=>{const r=rows.find(x=>x.key===filter.key);return r&&{id:r.id,get:()=>r.payload};},update:async({filterByTk,values})=>{rows.find(x=>x.id===filterByTk).payload=values.payload;},create:async({values})=>{rows.push({id:rows.length+1,...values});}};
 const site={pages:[{url:'https://retool.com/'},{url:'https://retool.com/pricing'}],warnings:[]},gh={stars:1000,releases:[{name:'v1.0',tag_name:'v1.0',html_url:'https://github.com/tooljet/tooljet/releases/v1.0',published_at:'2026-09-01T00:00:00Z'}]},calls=[];
 const p={store:{repository:()=>repo,transaction:fn=>fn({}),query:async()=>{}},projectIds:async()=>['1'],
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

test('AI 识别: candidates from the online AI with websites opened and repositories looked up; own site and dead sites dropped; kept a week',async()=>{
 const {w,rows}=setup();let asked=0,prompt;
 w.p.taskExecution={provider:{complete:async(system,user)=>{asked++;prompt=JSON.parse(user);return '```json\n'+JSON.stringify({competitors:[
  {name:'Appsmith',site:'https://www.appsmith.com',repo:'',reason:'开源低代码'},{name:'ToolJet',site:'tooljet.com',repo:'tooljet/tooljet',reason:'可自托管'},{name:'NocoBase Cloud',site:'https://cloud.nocobase.com',reason:'x'},
  {name:'Ghost',site:'https://dead.example',repo:'',reason:'打不开'},{name:'appsmith',site:'https://appsmith.com'}]})+'\n```';}}};
 w.p.knowledge={list:async()=>({items:[{id:'k1',title:'竞品对比',category:'competitor'},{id:'k2',title:'客户',category:'customer'}]}),get:async()=>({text:'Retool 按人收费'})};
 w.read=async url=>{if(url.includes('dead'))throw new Error('down');if(url.includes('appsmith'))return {text:'<a href="https://github.com/appsmithorg/appsmith">GitHub</a>'};return {text:'<title>Home</title>'};};
 w.p.github.gh=async path=>{if(path==='/repos/appsmithorg/appsmith')return {full_name:'appsmithorg/appsmith'};if(path==='/repos/tooljet/tooljet')return {full_name:'ToolJet/ToolJet'};throw new Error('404');};
 await w.add('1',{name:'ToolJet',repo:'ToolJet/ToolJet'});await w.checking;
 const r=await w.suggest('1');assert.equal(asked,1);assert.equal(prompt.material.length,1,'only competitor material');assert.deepEqual(prompt.already,['ToolJet']);assert.equal(prompt.memory['项目'],'NocoBase');
 assert.deepEqual(r.candidates.map(c=>[c.name,c.site,c.repo,c.exists]),[['Appsmith','https://www.appsmith.com','appsmithorg/appsmith',false],['ToolJet','https://tooljet.com','ToolJet/ToolJet',true]],'repository found on the home page; own and dead sites and duplicates dropped');
 await w.suggest('1');assert.equal(asked,1,'kept for a week');await w.suggest('1',{force:true});assert.equal(asked,2);
 // ticked candidates are added together and looked at once
 const st=await w.add('1',{items:[{name:'Appsmith',site:'https://www.appsmith.com',repo:'appsmithorg/appsmith'},{name:'Budibase',site:'budibase.com'}]});await w.checking;assert.deepEqual(st.list.map(c=>c.name),['ToolJet','Appsmith','Budibase']);
 assert.ok(rows[0].payload.track[st.list[2].id].checkedAt,'the new ones are looked at right away');
 assert.equal((await w.suggest('1')).candidates.find(c=>c.name==='Appsmith').exists,true);
 await assert.rejects(w.add('1',{items:[{name:'A2',repo:'a/a2'},{name:'Budibase',site:'budibase.com'}]}),/Budibase 已经在列表里了/);assert.equal((await w.status('1')).list.length,3,'nothing added when one fails');
 delete w.p.taskExecution;rows[0].payload.suggested=null;await assert.rejects(w.suggest('1'),/还没有接入在线 AI/);
});

test('编辑: name, website and repository can be corrected; a new website starts afresh; a repository-only competitor gets the website GitHub lists',async()=>{
 const {w,rows,calls,gh}=setup();
 await w.add('1',{name:'ToolJet',repo:'ToolJet/ToolJet'});await w.checking;let c=(await w.status('1')).list[0];assert.equal(c.site,'');
 await assert.rejects(w.edit('1',{competitorId:c.id,name:'ToolJet',site:'',repo:''}),/至少填一个/);await assert.rejects(w.edit('1',{competitorId:c.id,name:'ToolJet',site:'nocobase.com'}),/本项目自己的网站/);await assert.rejects(w.edit('1',{competitorId:'nope',name:'X',site:'x.com'}),/不在列表里/);
 await w.add('1',{name:'Retool',site:'https://retool.com'});await w.checking;await assert.rejects(w.edit('1',{competitorId:c.id,name:'retool',repo:'ToolJet/ToolJet'}),/重复/);
 calls.length=0;let st=await w.edit('1',{competitorId:c.id,name:'ToolJet',site:'tooljet.com/pricing',repo:'https://github.com/ToolJet/ToolJet'});await w.checking;
 c=st.list.find(x=>x.id===c.id);assert.equal(c.site,'https://tooljet.com');assert.ok(calls.some(([k,v])=>k==='site'&&v==='https://tooljet.com'),'the new website is looked at at once');
 const s=rows[0].payload;assert.ok(!s.events.some(e=>e.competitorId===c.id&&e.type==='site'),'the first look at a new website records, it does not report every page as new');
 // repository only: the website GitHub lists fills in once
 const w2=setup();w2.w.p.github.gh=async path=>path.endsWith('/releases?per_page=5')?[]:{stargazers_count:5,homepage:'https://directus.io/'};
 await w2.w.add('1',{name:'Directus',repo:'directus/directus'});await w2.w.checking;assert.equal(await w2.w.fillSites('1'),1);assert.equal((await w2.w.status('1')).list[0].site,'https://directus.io');assert.equal(await w2.w.fillSites('1'),0,'tried once');
});
