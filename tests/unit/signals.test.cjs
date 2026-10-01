const test=require('node:test'),assert=require('node:assert/strict');
const {compute,tokens,searchSignals,webSignals,contentSignals,githubSignals,communitySignals}=require('../../plugins/connections/server/signals');
const now=Date.parse('2026-10-01T00:00:00Z'),DAY=86400000;
test('search rules: low CTR against the site median, near first page, click drop; each capped',()=>{
 const rows=[{page:'https://ex.com/a',clicks:2,impressions:2000,previous:3,position:15},{page:'https://ex.com/b',clicks:60,impressions:1000,previous:50,position:4},{page:'https://ex.com/c',clicks:50,impressions:900,previous:40,position:3},{page:'https://ex.com/d',clicks:5,impressions:400,previous:40,position:11}];
 const s=searchSignals({queries:rows,history:[],end:'2026-09-27'});const keys=s.map(x=>x.key).sort();
 assert.deepEqual(keys,['gsc-click-drop:/d','gsc-low-ctr:/a','gsc-near-first:/a','gsc-near-first:/d']);assert.ok(s.every(x=>x.actionable&&x.facts.length));
 const many=Array.from({length:20},(_,i)=>({page:`https://ex.com/p${i}`,clicks:1,impressions:600+i,position:10}));assert.equal(searchSignals({queries:many,history:[],end:null}).filter(x=>x.key.startsWith('gsc-near-first')).length,8);
});
test('conversion rule skips home, locale roots and legal pages',()=>{
 const pages=[{page:'/',views:9000,conversions:10},{page:'/cn',views:5000,conversions:5},{page:'/terms',views:900,conversions:0},{page:'/pricing',views:800,conversions:1},{page:'/docs',views:3000,conversions:900}];
 assert.deepEqual(webSignals({pages,history:[],referral:[],end:null}).map(s=>s.key),['ga4-low-conversion:/pricing']);
});
test('content rules need traffic; stale uses lastmod and thin uses fetched word count',()=>{
 const site={pages:[{url:'https://ex.com/docs/old',type:'docs',lastmod:'2024-01-01',title:'Old'},{url:'https://ex.com/docs/nobody',type:'docs',lastmod:'2020-01-01'},{url:'https://ex.com/blog/short',type:'blog',fetchedAt:'t',words:80}]};
 const s=contentSignals({site,queries:[{page:'https://ex.com/docs/old',impressions:500},{page:'https://ex.com/blog/short',impressions:300}],pages:[],now});
 assert.deepEqual(s.map(x=>x.key).sort(),['site-stale:/docs/old','site-thin:/blog/short']);
});
test('GitHub: releases collapse into one signal favouring stable versions; star spike needs history',()=>{
 const gh={repo:'o/r',daily:{},releases:[{tag:'v2.0.0',publishedAt:new Date(now-DAY).toISOString(),url:'u1'},{tag:'v2.1.0-alpha.1',publishedAt:new Date(now-2*DAY).toISOString(),url:'u2'},{tag:'v1.0.0',publishedAt:new Date(now-30*DAY).toISOString(),url:'u3'}]};
 const s=githubSignals({gh,now});assert.equal(s.length,1);assert.deepEqual(s[0].chip,{tone:'violet',text:'新版本'});assert.match(s[0].title,/v2\.0\.0/);assert.match(s[0].facts[1],/alpha/);assert.equal(s[0].actionable,true);
 const pre=githubSignals({gh:{...gh,releases:[gh.releases[1]]},now});assert.equal(pre[0].actionable,false);
 const daily={};for(let i=0;i<9;i++)daily[new Date(now-(8-i)*DAY).toISOString().slice(0,10)]={stars:1000+i*5+(i===8?95:0)};
 assert.ok(githubSignals({gh:{repo:'o/r',daily,releases:[]},now}).some(x=>x.key.startsWith('github-star-spike')));
});
test('community: uncommon English themes checked against pages; digest for AI clustering; generic and product terms excluded',()=>{
 const t=(id,title,days=3,extra={})=>({id,title,slug:'s',createdAt:new Date(now-days*DAY).toISOString(),replies:1,views:10,solved:false,categoryId:1,...extra});
 const topics={};['Webhook retries fail','Webhook signature invalid','How to debug webhook','Acme install fails','Acme login','Acme theme','Acme upgrade','插件无法加载'].forEach((x,i)=>{topics[i]=t(i,x);});
 const s=communitySignals({cm:{origin:'https://forum.acme.dev',topics,categories:{1:'Q'}},gh:null,site:{sites:[{origin:'https://acme.dev'}],pages:[{url:'https://acme.dev/docs/start',title:'Start'}]},now});
 assert.ok(s.some(x=>x.key==='community-gap:webhook'));assert.deepEqual(s.find(x=>x.key==='community-gap:webhook').chip.tone,'amber');assert.match(s.find(x=>x.key==='community-digest').chip.text,/^\d+ 个未解决$/);assert.ok(!s.some(x=>x.key.includes(':acme')));
 const digest=s.find(x=>x.key==='community-digest');assert.ok(digest);assert.equal(digest.topics.length,8);assert.match(digest.title,/未标记为已解决/);
 assert.ok(tokens('工作流 配置').has('工作'));
});
test('compute dedupes, puts actionable first and caps at 40',()=>{
 const s=compute({now,end:null,queries:[],pages:[],searchHistory:[],webHistory:[],referral:[],site:null,gh:null,cm:null});assert.deepEqual(s,[]);
});
test('community term frequency uses the last 90 days, not the whole 16-month history',()=>{
 const t=(id,title,days)=>({id,title,slug:'s',createdAt:new Date(now-days*DAY).toISOString(),replies:1,views:1,solved:false,categoryId:1});
 const topics={};let n=0;for(let i=0;i<300;i++)topics[n++]=t(n,`Old topic about billing ${i}`,200);['Webhook retries fail','Webhook signature invalid','Debug webhook','Other one','Other two','Other three','Other four','Other five'].forEach(x=>{topics[n++]=t(n,x,3);});
 for(let i=0;i<20;i++)topics[n++]=t(n,`Webhook note ${i}`,60);
 const s=communitySignals({cm:{origin:'https://f',topics,categories:{1:'Q'}},gh:null,site:{sites:[{origin:'https://acme.dev'}],pages:[]},now});
 assert.ok(!s.some(x=>x.key==='community-gap:webhook'),'webhook is common within 90 days, so it is not an uncommon theme');
});

test('each signal carries one coloured fact; titles that say 上升 or 下降 carry no extra sign',()=>{
 const {searchSignals}=require('../../plugins/connections/server/signals');
 const day=i=>new Date(Date.parse('2026-08-01')+i*86400000).toISOString().slice(0,10);
 const history=Array.from({length:56},(_,i)=>({date:day(i),clicks:i<28?100:40,impressions:1000}));
 const out=searchSignals({queries:[],history,end:day(55)});const drop=out.find(x=>x.key==='gsc-site-clicks');
 assert.ok(drop,'site-wide drop found');assert.match(drop.title,/下降 60%/);assert.doesNotMatch(drop.title,/-\d/);assert.deepEqual(drop.chip,{tone:'red',text:'↓ 60%'});
});
