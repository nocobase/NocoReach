// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/packages-hackernews.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import * as pk from '../../server/nocoreach/packages-source.js';
import * as hn from '../../server/nocoreach/hackernews-source.js';
import { packagesCard, hackernewsCard, windowFor, DataViews } from '../../server/nocoreach/data-views.js';
import { packagesSignals, hackernewsSignals } from '../../server/nocoreach/signals.js';
const test=__vitest_test;
const DAY=86400000,iso=t=>new Date(t).toISOString().slice(0,10),ago=n=>iso(Date.now()-n*DAY);
// In-memory nrSnapshots with the advisory-lock transaction the sources use.
function plugin(){const rows=[];let id=0;const repo={findOne:async o=>{const r=rows.find(x=>x.key===o.filter.key);return r&&{id:r.id,get:k=>r[k]};},create:async o=>{rows.push({id:++id,...o.values});},update:async o=>{Object.assign(rows.find(r=>r.id===o.filterByTk),o.values);}};
 return {rows,db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}};}
test('package names: names and registry pages, npm scopes, PyPI normalisation, Docker library images',()=>{
 assert.deepEqual(pk.parse('npm','@NocoBase/Client'),{registry:'npm',name:'@nocobase/client',id:'npm:@nocobase/client'});
 assert.equal(pk.parse('npm','https://www.npmjs.com/package/@nocobase/client').name,'@nocobase/client');
 assert.equal(pk.parse('npm','https://www.npmjs.com/package/react').name,'react');
 assert.deepEqual(pk.parse('npm','https://pypi.org/project/Django_Rest/'),{registry:'pypi',name:'django-rest',id:'pypi:django-rest'});
 assert.equal(pk.parse('docker','nginx').name,'library/nginx');assert.equal(pk.parse('npm','https://hub.docker.com/r/nocobase/nocobase').id,'docker:nocobase/nocobase');assert.equal(pk.parse('npm','https://hub.docker.com/_/redis').name,'library/redis');
 assert.throws(()=>pk.parse('npm','https://example.com/x'),/包名/);assert.throws(()=>pk.parse('npm','bad name'),/格式/);assert.throws(()=>pk.parse('cargo','x'),/npm/);
});
test('packages: preview, add, daily sync merges npm and PyPI days and samples Docker pulls; remove drops the data',async()=>{
 const urls=[];const read=async url=>{urls.push(url);const j=v=>({text:JSON.stringify(v)});
  if(url.startsWith('https://registry.npmjs.org/'))return j({name:'@x/core',description:'<b>Core</b>',version:'1.2.3'});
  if(url.startsWith('https://api.npmjs.org/downloads/range/'))return j({downloads:[{day:ago(3),downloads:10},{day:ago(2),downloads:20},{day:ago(1),downloads:30}]});
  if(url.startsWith('https://pypi.org/pypi/'))return j({info:{name:'x-core',summary:'Py'}});
  if(url.startsWith('https://pypistats.org/'))return j({data:[{category:'with_mirrors',date:ago(2),downloads:999},{category:'without_mirrors',date:ago(2),downloads:5},{category:'without_mirrors',date:ago(1),downloads:6}]});
  if(url.startsWith('https://hub.docker.com/'))return j({pull_count:12345,description:'img'});
  throw new Error('来源返回 404');};
 const p=plugin(),s=new pk.PackagesSource(p,read);
 const pv=await s.preview({registry:'npm',name:'@x/core'});assert.equal(pv.version,'1.2.3');assert.equal(pv.description,'Core');assert.ok(urls[0].endsWith('/@x/core/latest'));assert.equal(pv.recent7,60);assert.equal(pv.url,'https://www.npmjs.com/package/@x/core');
 await s.add('1',{registry:'npm',name:'@x/core'});await s.runs.wait('1');await s.add('1',{registry:'pypi',name:'x_core'});await s.runs.wait('1');await s.add('1',{registry:'docker',name:'x/core'});await s.runs.wait('1');
 const st=await s.state('1');assert.equal(st.packages.length,3);assert.deepEqual(st.daily['pypi:x-core'],{[ago(2)]:5,[ago(1)]:6});assert.equal(st.samples['docker:x/core'][iso(Date.now())],12345);assert.equal(st.lastSync.ok,true);
 assert.deepEqual(pk.downloadRows(st),[{date:ago(2),downloads:25},{date:ago(1),downloads:36}]);
 assert.ok(urls.some(u=>u.includes(`/downloads/range/${ago(540)}:`)),'first npm read goes back 540 days');
 const status=await s.status('1');assert.equal(status.packages.find(x=>x.registry==='docker').pulls,12345);
 await s.remove('1',{id:'pypi:x-core'});const after=await s.state('1');assert.equal(after.packages.length,2);assert.equal(after.daily['pypi:x-core'],undefined);
 await assert.rejects(new pk.PackagesSource(p,async()=>{throw new Error('来源返回 404');}).preview({registry:'npm',name:'missing-pkg-zzz'}),/在 npm 上没有找到 missing-pkg-zzz/);
});
test('packages card: downloads compare only with complete windows; Docker pulls by sample difference',()=>{
 const daily={},samples={};for(let i=60;i>=1;i--){daily[ago(i)]=i>28?100:150;}for(let i=60;i>=0;i--)samples[ago(i)]={};
 const docker={};for(let i=60;i>=0;i--)docker[ago(i)]=10000+(60-i)*10;
 const st={packages:[{id:'npm:a',registry:'npm',name:'a',title:'a'},{id:'docker:x/a',registry:'docker',name:'x/a',title:'x/a'}],daily:{'npm:a':daily},samples:{'docker:x/a':docker}};
 const c=packagesCard(st,windowFor(ago(1),'28'));const dl=c.metrics.find(m=>m.key==='downloads'),pulls=c.metrics.find(m=>m.key==='pulls');
 assert.equal(dl.value,4200);assert.equal(dl.previous,2800);assert.equal(dl.change,0.5);assert.equal(pulls.value,280);assert.equal(c.series.length,28);
 const s=packagesSignals({pk:st,now:Date.now()});assert.equal(s[0].key,'packages-downloads');assert.match(s[0].title,/下载量上升 50%/);
});
test('Hacker News terms and mentions: phrases checked, authors dropped, comments carry their story title',()=>{
 assert.deepEqual(hn.terms('NocoBase, nocobase.com，nocobase'),['NocoBase','nocobase.com']);assert.throws(()=>hn.terms('ab'),/3–60/);assert.throws(()=>hn.terms('a"b c'),/引号/);assert.throws(()=>hn.terms(''),/产品名/);
 const m=hn.mention({objectID:'9',_tags:['comment'],author:'someone',story_title:'Show HN: X',story_url:'https://x.dev',comment_text:'<p>I use <b>X</b> daily</p>',created_at_i:1790000000,story_id:5},'X');
 assert.equal(m.author,undefined);assert.equal(m.title,'Show HN: X');assert.equal(m.excerpt,'I use X daily');assert.equal(m.hnUrl,'https://news.ycombinator.com/item?id=9');assert.equal(m.type,'comment');
});
test('Hacker News: first sync reads a year, coverage starts where results end; daily rows count zero days; spike and hot story signals',async()=>{
 const now=Date.now(),hit=(id,daysAgo,story=true,points=0)=>({objectID:String(id),_tags:[story?'story':'comment'],title:`Post ${id}`,points,num_comments:3,created_at_i:Math.floor((now-daysAgo*DAY)/1000)});
 const calls=[];const read=async url=>{calls.push(url);const u=new URL(url);const page=Number(u.searchParams.get('page'));return {text:JSON.stringify({nbPages:2,hits:page===0?[hit(1,1,true,120),hit(2,2,false),hit(3,3),hit(4,4),hit(5,5),hit(6,6)]:[hit(7,40)]})};};
 const p=plugin(),s=new hn.HackerNewsSource(p,read);await s.connect('1',{terms:'nocobase'});await s.runs.wait('1');
 const st=await s.state('1');assert.equal(Object.keys(st.mentions).length,7);assert.equal(st.retainedFrom,ago(365));assert.ok(st.backfilledAt);assert.ok(calls[0].includes(encodeURIComponent('"nocobase"')));
 const rows=hn.dailyRows(st);assert.equal(rows[0].date,ago(365));assert.equal(rows.at(-1).date,ago(1));assert.equal(rows.find(r=>r.date===ago(10)).mentions,0);
 const card=hackernewsCard(st,windowFor(ago(1),'28'));assert.equal(card.id,'mentions');assert.equal(card.metrics[0].value,6);assert.equal(card.metrics[0].previous,1);assert.ok(card.notes[0].includes('Post 1'));
 const sig=hackernewsSignals({hn:st,now});assert.ok(sig.some(x=>x.key.startsWith('hn-spike')));assert.ok(sig.some(x=>x.key==='hn-story:1'&&x.title.includes('120 分')));
 const status=await s.status('1');assert.equal(status.last30,6);assert.equal(status.top[0].points,120);
});

test('Hacker News followed topics: each sync reads the last week’s stories on each topic with the most points and comments, kept apart from the mentions',async()=>{
 const now=Date.now(),story=(id,daysAgo,points,comments)=>({objectID:String(id),_tags:['story'],title:`Story ${id}`,points,num_comments:comments,created_at_i:Math.floor((now-daysAgo*DAY)/1000)});
 const calls=[];const read=async url=>{calls.push(url);const u=new URL(url);
  if(u.pathname==='/api/v1/search'){const q=u.searchParams.get('query');
   const hits=q==='"team collaboration"'?Array.from({length:14},(_,i)=>story(100+i,2,i*10,i)):q==='"task management"'?[story(105,2,50,5),story(200,3,300,40)]:[];
   return {text:JSON.stringify({nbPages:1,hits})};}
  return {text:JSON.stringify({nbPages:1,hits:[]})};};
 let topics=['team collaboration','task management'];
 const p={...plugin(),followedTopics:{of:async()=>topics}},s=new hn.HackerNewsSource(p,read);await s.connect('1',{terms:'acme'});await s.runs.wait('1');
 const asked=calls.filter(u=>new URL(u).pathname==='/api/v1/search'&&new URL(u).searchParams.get('hitsPerPage')!=='0');
 assert.equal(asked.length,2);const u=new URL(asked[0]);
 assert.deepEqual([u.searchParams.get('tags'),u.searchParams.get('hitsPerPage')],['story','50']);
 assert.ok(Math.abs(Number(u.searchParams.get('numericFilters').split('>')[1])-Math.floor((now-7*DAY)/1000))<5,'the last seven days');
 const st=await s.state('1');
 assert.deepEqual(Object.keys(st.mentions||{}),[],'no mention of the product');
 assert.equal(Object.keys(st.topicStories).length,11,'the ten with most points and comments of a topic, and the other topic’s');
 assert.deepEqual(st.topicStories['105'].topics,['team collaboration','task management']);
 assert.equal(st.topicStories['100'],undefined,'the lowest are left out');
 assert.deepEqual([st.topicSync.ok,st.topicSync.found],[true,12]);
 assert.equal((await s.status('1')).topicCount,2);
 const view=await new DataViews({...p,hackernews:s}).hackernews('1',{range:'7'});
 assert.deepEqual(view.topic.stories.slice(0,2).map(x=>[x.title,x.topics]),[['Story 200',['task management']],['Story 113',['team collaboration']]]);
 topics=['task management'];const after=await new DataViews({...p,hackernews:s}).hackernews('1',{range:'7'});
 assert.deepEqual(after.topic.stories.map(x=>x.title),['Story 200','Story 105'],'a removed topic’s stories leave the view');
 assert.deepEqual(after.topic.stories[1].topics,['task management']);
});
test('Hacker News topic weeks: each topic is counted per whole week, twelve weeks once and the latest two again; the busiest stories’ comments are read for the product and competitors',async()=>{
 const now=Date.now(),calls=[];
 const story={objectID:'900',_tags:['story'],title:'Show HN: an AI project assistant',points:240,num_comments:3,created_at_i:Math.floor((now-2*DAY)/1000)};
 const read=async url=>{calls.push(url);const u=new URL(url);
  if(u.pathname==='/api/v1/search'){if(u.searchParams.get('hitsPerPage')==='0'){const from=Number(u.searchParams.get('numericFilters').match(/>=(\d+)/)[1]);return {text:JSON.stringify({nbHits:from%3+1,hits:[]})};}
   return {text:JSON.stringify({nbPages:1,hits:u.searchParams.get('query')==='"ai project assistant"'?[story]:[]})};}
  if(u.pathname==='/api/v1/items/900')return {text:JSON.stringify({id:900,children:[{type:'comment',text:'We moved from Asana to Acme last year.',children:[{type:'comment',text:'Acme <i>works</i>, Asana too',children:[]}]},{type:'comment',text:'Nothing to add',children:[]}]})};
  return {text:JSON.stringify({nbPages:1,hits:[]})};};
 const p={...plugin(),followedTopics:{of:async()=>['ai project assistant']},projects:{get:async()=>({name:'Acme'})},competitors:{state:async()=>({list:[{name:'Asana'},{name:'Monday'}]})}};
 const s=new hn.HackerNewsSource(p,read);await s.connect('1',{terms:'acme'});await s.runs.wait('1');
 const counts=()=>calls.filter(u=>new URL(u).searchParams.get('hitsPerPage')==='0');
 assert.equal(counts().length,12,'twelve whole weeks the first time');
 const st=await s.state('1'),weeks=Object.keys(st.topicWeeks['ai project assistant']);
 assert.equal(weeks.length,12);assert.ok(weeks.every(w=>new Date(w+'T00:00:00Z').getUTCDay()===1),'Mondays');
 assert.ok(Date.parse(weeks.at(-1)+'T00:00:00Z')+7*DAY<=now,'only whole weeks');
 const f=new URL(counts()[0]).searchParams.get('numericFilters');assert.match(f,/^created_at_i>=\d+,created_at_i<\d+$/);
 const story900=st.topicStories['900'];
 assert.deepEqual(story900.named.map(x=>[x.name,x.own,x.mentions]),[['Acme',true,2],['Asana',false,2],['Monday',false,0]]);
 assert.equal(story900.commentsRead,3);assert.equal(story900.excerpts.length,2);assert.deepEqual(story900.excerpts[0].names,['Acme','Asana']);
 calls.length=0;await s.sync('1');
 assert.equal(counts().length,2,'later, the latest two weeks again');
 assert.equal(calls.filter(u=>new URL(u).pathname.startsWith('/api/v1/items/')).length,0,'comments are read again only after a day');
});
test('Hacker News topic weeks: a count that fails is kept as failed, not as weeks with no stories',async()=>{
 let failing=true;
 const read=async url=>{const u=new URL(url);
  if(u.pathname==='/api/v1/search'&&u.searchParams.get('hitsPerPage')==='0'){if(failing)throw new Error('Algolia unreachable');return {text:JSON.stringify({nbHits:2,hits:[]})};}
  return {text:JSON.stringify({nbPages:1,hits:[]})};};
 const p={...plugin(),followedTopics:{of:async()=>['ai project assistant']},projects:{get:async()=>({name:'Acme'})},competitors:{state:async()=>({list:[]})}};
 const s=new hn.HackerNewsSource(p,read);await s.connect('1',{terms:'acme'});await s.runs.wait('1');
 let st=await s.state('1');
 assert.deepEqual(st.topicWeeks['ai project assistant'],{});
 assert.ok(st.topicCountFailed['ai project assistant']);
 failing=false;await s.sync('1');st=await s.state('1');
 assert.equal(Object.keys(st.topicWeeks['ai project assistant']).length,12);
 assert.deepEqual(st.topicCountFailed,{});
});
test('Hacker News named products: whole words for Latin names, anywhere for CJK names',()=>{
 assert.equal(hn.occurrences('Acme, acme! Acmeville','Acme'),2);
 assert.equal(hn.occurrences('我们用了飞书和飞书文档','飞书'),2);
 assert.equal(hn.occurrences('anything','A'),0);
});
