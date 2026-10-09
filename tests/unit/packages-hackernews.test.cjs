const test=require('node:test'),assert=require('node:assert/strict');
const pk=require('../../apps/nocoreach/server/providers/reach/domain/packages-source.cjs');
const hn=require('../../apps/nocoreach/server/providers/reach/domain/hackernews-source.cjs');
const {packagesCard,hackernewsCard,windowFor}=require('../../apps/nocoreach/server/providers/reach/domain/data-views.cjs');
const {packagesSignals,hackernewsSignals}=require('../../apps/nocoreach/server/providers/reach/domain/signals.cjs');
const DAY=86400000,iso=t=>new Date(t).toISOString().slice(0,10),ago=n=>iso(Date.now()-n*DAY);
// In-memory nrSnapshots with the advisory-lock transaction the sources use.
function plugin(){const rows=[];let id=0;const repo={findOne:async o=>{const r=rows.find(x=>x.key===o.filter.key);return r&&{id:r.id,get:k=>r[k]};},create:async o=>{rows.push({id:++id,...o.values});},update:async o=>{Object.assign(rows.find(r=>r.id===o.filterByTk),o.values);}};
 return {rows,store:{repository:()=>repo,transaction:fn=>fn({}),query:async()=>{}}};}
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
 await s.add('1',{registry:'npm',name:'@x/core'});await s.syncing;await s.add('1',{registry:'pypi',name:'x_core'});await s.syncing;await s.add('1',{registry:'docker',name:'x/core'});await s.syncing;
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
 const p=plugin(),s=new hn.HackerNewsSource(p,read);await s.connect('1',{terms:'nocobase'});await s.syncing;
 const st=await s.state('1');assert.equal(Object.keys(st.mentions).length,7);assert.equal(st.retainedFrom,ago(365));assert.ok(st.backfilledAt);assert.ok(calls[0].includes(encodeURIComponent('"nocobase"')));
 const rows=hn.dailyRows(st);assert.equal(rows[0].date,ago(365));assert.equal(rows.at(-1).date,ago(1));assert.equal(rows.find(r=>r.date===ago(10)).mentions,0);
 const card=hackernewsCard(st,windowFor(ago(1),'28'));assert.equal(card.id,'mentions');assert.equal(card.metrics[0].value,6);assert.equal(card.metrics[0].previous,1);assert.ok(card.notes[0].includes('Post 1'));
 const sig=hackernewsSignals({hn:st,now});assert.ok(sig.some(x=>x.key.startsWith('hn-spike')));assert.ok(sig.some(x=>x.key==='hn-story:1'&&x.title.includes('120 分')));
 const status=await s.status('1');assert.equal(status.last30,6);assert.equal(status.top[0].points,120);
});
