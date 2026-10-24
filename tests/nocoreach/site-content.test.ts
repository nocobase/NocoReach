// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/site-content.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { SiteContent, parseSitemap, robotsSitemaps, classify, pageMeta, joinMetrics, joinFigures, figureRows, outsideSitemap, sameSite } from '../../server/nocoreach/site-content.js';
import * as __public_sources from '../../server/nocoreach/public-sources.js';
import * as __node_dns from 'node:dns';
const test=__vitest_test;
test('sitemap parsing handles index files, entities and lastmod',()=>{
 const idx=parseSitemap('<sitemapindex><sitemap><loc>https://ex.com/s1.xml</loc></sitemap></sitemapindex>');assert.deepEqual(idx.sitemaps,['https://ex.com/s1.xml']);assert.equal(idx.urls.length,0);
 const set=parseSitemap('<urlset><url><loc>https://ex.com/a?x=1&amp;y=2</loc><lastmod>2026-09-01</lastmod></url><url><loc> https://ex.com/b </loc></url></urlset>');
 assert.deepEqual(set.urls,[{loc:'https://ex.com/a?x=1&y=2',lastmod:'2026-09-01'},{loc:'https://ex.com/b',lastmod:null}]);
 assert.deepEqual(robotsSitemaps('User-agent: *\nSitemap: https://ex.com/sitemap.xml\nsitemap:https://ex.com/s2.xml'),['https://ex.com/sitemap.xml','https://ex.com/s2.xml']);
});
test('page type comes from the first meaningful path segment or subdomain',()=>{
 assert.equal(classify('https://ex.com/blog/launch'),'blog');assert.equal(classify('https://ex.com/zh-cn/docs/install'),'docs');assert.equal(classify('https://docs.ex.com/intro'),'docs');
 assert.equal(classify('https://ex.com/pricing'),'page');assert.equal(classify('https://ex.com/en'),'page');assert.equal(classify('not a url'),'page');
});
test('only the same site and its subdomains are collected',()=>{
 assert.equal(sameSite('https://docs.ex.com/a','https://www.ex.com'),true);assert.equal(sameSite('https://ex.com.evil.io/a','https://ex.com'),false);assert.equal(sameSite('https://other.com/a','https://ex.com'),false);
});
test('discover follows robots and sitemap index, drops foreign URLs, and fails clearly without a sitemap',async()=>{
 const files={'https://ex.com/robots.txt':'Sitemap: https://ex.com/index.xml','https://ex.com/index.xml':'<sitemapindex><sitemap><loc>https://ex.com/a.xml</loc></sitemap><sitemap><loc>https://evil.io/x.xml</loc></sitemap></sitemapindex>','https://ex.com/a.xml':'<urlset><url><loc>https://ex.com/blog/one</loc></url><url><loc>https://ex.com/docs/two</loc></url><url><loc>https://evil.io/three</loc></url></urlset>'};
 const read=async u=>{if(!(u in files))throw new Error('404');return {text:files[u],type:'application/xml',url:u};};
 const d=await new SiteContent({},read).discover('https://ex.com');
 assert.deepEqual(d.pages.map(p=>p.url),['https://ex.com/blog/one','https://ex.com/docs/two']);assert.deepEqual(d.types,{blog:1,docs:1});assert.deepEqual(d.sitemaps,['https://ex.com/index.xml','https://ex.com/a.xml']);
 await assert.rejects(new SiteContent({},async()=>{throw new Error('404');}).discover('https://ex.com'),e=>e.status===422&&/sitemap/.test(e.message));
 await assert.rejects(new SiteContent({},read).discover('http://ex.com'),e=>e.status===400);
});

test('discover tries the usual sitemap addresses only when nothing else was read',async()=>{
 const urlset='<urlset><url><loc>https://ex.com/blog/one</loc></url></urlset>';
 const run=async files=>{const asked=[];const d=await new SiteContent({},async u=>{asked.push(u);if(!(u in files))throw new Error('404');return {text:files[u],type:'application/xml',url:u};}).discover('https://ex.com').catch(e=>e);return {d,asked};};
 // robots.txt names a sitemap that no longer opens: the usual addresses follow, WordPress's among them.
 let {d,asked}=await run({'https://ex.com/robots.txt':'Sitemap: https://ex.com/old.xml','https://ex.com/wp-sitemap.xml':urlset});
 assert.deepEqual(d.sitemaps,['https://ex.com/wp-sitemap.xml']);assert.deepEqual(asked,['https://ex.com/robots.txt','https://ex.com/old.xml','https://ex.com/sitemap.xml','https://ex.com/sitemap_index.xml','https://ex.com/sitemap-index.xml','https://ex.com/wp-sitemap.xml']);
 // A site whose sitemap reads makes no extra requests.
 ({d,asked}=await run({'https://ex.com/sitemap.xml':urlset}));
 assert.deepEqual(asked,['https://ex.com/robots.txt','https://ex.com/sitemap.xml','https://ex.com/sitemap_index.xml']);
 // None of them: still the clear 422.
 ({d}=await run({}));assert.equal(d.status,422);
});
test('page metadata decodes numeric character references',()=>{
 const m=pageMeta('<title>It&#x27;s new</title><meta name="description" content="What&#x27;s on by default &#39;now&#39; &amp; later"><body></body>','https://ex.com/');
 assert.equal(m.title,"It's new");assert.equal(m.description,"What's on by default 'now' & later");
});
test('page metadata counts words and internal links only',()=>{
 const m=pageMeta('<title>Install &amp; run</title><meta name="description" content="Fast start"><body><p>安装 NocoBase in 5 minutes</p><a href="/docs/a">a</a><a href="https://ex.com/b">b</a><a href="https://other.com/c">c</a><a href="#top">t</a></body>','https://ex.com/docs/install');
 assert.equal(m.title,'Install & run');assert.equal(m.description,'Fast start');assert.equal(m.internalLinks,2);assert.ok(m.words>=5);
});
test('metrics join by path and leave pages outside the samples empty rather than zero',()=>{
 const pages=[{url:'https://ex.com/docs/a/',type:'docs'},{url:'https://ex.com/blog/b',type:'blog'}];
 const out=joinMetrics(pages,[{page:'/docs/a',views:40,sessions:30}],[{page:'https://ex.com/docs/a',clicks:3,impressions:100},{page:'https://ex.com/docs/a',clicks:2,impressions:50}]);
 assert.deepEqual([out[0].views,out[0].clicks,out[0].impressions],[40,5,150]);assert.deepEqual([out[1].views,out[1].clicks],[null,null]);
});
test('metrics keep sites that share a path apart, and host-less GA4 rows still match by path',()=>{
 const pages=[{url:'https://www.ex.com/',type:'page'},{url:'https://docs.ex.com/',type:'docs'},{url:'https://docs.ex.com/guide',type:'docs'}];
 const out=joinMetrics(pages,[{page:'/',host:'www.ex.com',views:900,sessions:0},{page:'/',host:'docs.ex.com',views:300,sessions:0},{page:'/guide',views:20}],[{page:'https://www.ex.com/',clicks:50,impressions:800},{page:'https://docs.ex.com/',clicks:7,impressions:90}]);
 assert.deepEqual(out.map(p=>[p.views,p.clicks,p.impressions]),[[900,50,800],[300,7,90],[20,null,null]]);
});
test('pages with visits or search data that the sitemap does not list are added, on their own site and kept types only',()=>{
 const state={sites:[{origin:'https://www.ex.com',types:['blog','page']},{origin:'https://docs.ex.com',types:['docs']}],
  pages:[{url:'https://www.ex.com/',type:'page'},{url:'https://www.ex.com/blog/a',type:'blog'},{url:'https://docs.ex.com/guide',type:'docs'}]};
 const ga4=[{page:'/',host:'www.ex.com',views:900},{page:'/cn/solutions/all-in-one',host:'www.ex.com',views:1006},{page:'/blog/timeline/',host:'www.ex.com',views:722},
  {page:'/docs/x',host:'www.ex.com',views:5},{page:'/other',host:'shop.ex.com',views:50},{page:'(not set)',host:'www.ex.com',views:3}];
 const gsc=[{page:'https://docs.ex.com/plugins/',clicks:5,impressions:2570},{page:'https://docs.ex.com/guide',clicks:1,impressions:10},{page:'https://www.ex.com/cn/solutions/all-in-one?x=1',clicks:2,impressions:30}];
 assert.deepEqual(outsideSitemap(state,ga4,gsc),[
  {url:'https://www.ex.com/cn/solutions/all-in-one',type:'page',origin:'https://www.ex.com',outsideSitemap:true},
  {url:'https://www.ex.com/blog/timeline',type:'blog',origin:'https://www.ex.com',outsideSitemap:true},
  {url:'https://docs.ex.com/plugins',type:'docs',origin:'https://docs.ex.com',outsideSitemap:true},
 ],'listed pages, another subdomain, a type the site does not keep and (not set) are left out; trailing slashes and queries are one page');
 const joined=joinMetrics([...state.pages,...outsideSitemap(state,ga4,gsc)],ga4,gsc);
 assert.deepEqual(joined.filter(p=>p.outsideSitemap).map(p=>[p.url,p.views,p.impressions]),[['https://www.ex.com/cn/solutions/all-in-one',1006,30],['https://www.ex.com/blog/timeline',722,null],['https://docs.ex.com/plugins',null,2570]]);
 assert.deepEqual(outsideSitemap(state,[{page:'/no-host',views:9}],[]),[],'a GA4 row without a host is not placed when several sites are connected');
 assert.deepEqual(outsideSitemap({sites:[state.sites[0]],pages:[]},[{page:'/no-host',views:9}],[]).map(p=>p.url),['https://www.ex.com/no-host']);
 assert.deepEqual(outsideSitemap(null,ga4,gsc),[]);
});
test('host-less GA4 rows from before hosts were kept go only to sites GA4 tracks',()=>{
 const pages=[{url:'https://www.ex.com/',type:'page'},{url:'https://docs.ex.com/',type:'docs'},{url:'https://docs.ex.com/cn',type:'docs'}];
 // GA4 tags only www: the rows that name a host name www alone, so the old rows' / and /cn are www's too.
 const ga4=[{page:'/',host:'www.ex.com',views:3200},{page:'/',views:10600},{page:'/cn',views:6500}];
 const out=joinMetrics(pages,ga4,[{page:'https://docs.ex.com/',clicks:12,impressions:2985}]);
 assert.deepEqual(out.map(p=>[p.url,p.views,p.clicks]),[['https://www.ex.com/',13800,null],['https://docs.ex.com/',null,12],['https://docs.ex.com/cn',null,null]]);
 assert.equal(joinMetrics([pages[1]],[{page:'/',views:10600}],[])[0].views,10600,'with no host named anywhere, old rows still match every site');
});
test('figures from every synced day: each page gets its own, 0 without a row, not tracked off GA4, and the period before',()=>{
 const f={window:{days:28},days:{ga4:{current:28,previous:28},gsc:{current:28,previous:20}},
  web:[{host:'ex.com',path:'/',current:{views:3000},previous:{views:4000}},{host:'',path:'/',current:{views:500},previous:{views:0}},{host:'ex.com',path:'/blog/new',current:{views:40},previous:{views:0}}],
  search:[{host:'ex.com',path:'/',current:{clicks:90,impressions:900},previous:{clicks:80,impressions:800}},{host:'docs.ex.com',path:'/',current:{clicks:13,impressions:2975},previous:{clicks:20,impressions:3000}}]};
 const pages=[{url:'https://www.ex.com/',type:'page'},{url:'https://www.ex.com/old',type:'page'},{url:'https://docs.ex.com/',type:'docs'}];
 assert.deepEqual(joinFigures(pages,f).map(p=>[p.url,p.views,p.previousViews,p.clicks,p.impressions,p.previousClicks,p.ga4Untracked??false]),[
  ['https://www.ex.com/',3500,4000,90,900,null,false],
  ['https://www.ex.com/old',0,0,0,0,null,false],
  ['https://docs.ex.com/',null,null,13,2975,null,true],
 ],'host-less rows go to www only; Search Console\'s period before is not fully synced (20 of 28 days)');
 const [ga4,gsc]=figureRows(f);
 assert.deepEqual(ga4,[{page:'/',host:'ex.com'},{page:'/',},{page:'/blog/new',host:'ex.com'}]);
 assert.deepEqual(gsc.map(r=>r.page),['https://ex.com/','https://docs.ex.com/']);
});
test('a proxy fake-ip answer is refused with an actionable message',async()=>{
 const {download}=__public_sources;const dns=__node_dns.promises;const orig=dns.lookup;dns.lookup=async()=>[{address:'198.18.1.62',family:4}];
 try{await assert.rejects(download('https://example.com/sitemap.xml'),e=>e.status===503&&/NOREACH_PUBLIC_DNS/.test(e.message));}finally{dns.lookup=orig;}
});
test('multiple sites: confirming one keeps the others, legacy single-site records upgrade, removal is scoped',async()=>{
 let payload={origin:'https://ex.com',sitemaps:['s'],types:['blog'],confirmedAt:'t',pages:[{url:'https://ex.com/blog/a',type:'blog',title:'A'}]};
 const repo={findOne:async()=>payload?{id:1,get:()=>payload}:null,update:async({values})=>{payload=values.payload;},create:async({values})=>{payload=values.payload;}};
 const plugin={db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}};
 const sc=new SiteContent(plugin,async()=>{throw new Error('offline');});
 let sum=await sc.summary('1');assert.equal(sum.sites.length,1);assert.equal(sum.sites[0].origin,'https://ex.com');
 await sc.confirm('1',{origin:'https://docs.ex.com',sitemaps:['d'],warnings:[],pages:[{url:'https://docs.ex.com/install',type:'docs'},{url:'https://docs.ex.com/x',type:'page'}]},['docs']);
 sum=await sc.summary('1');assert.deepEqual(sum.sites.map(s=>[s.origin,s.pages]),[['https://ex.com',1],['https://docs.ex.com',1]]);assert.equal(payload.pages.find(p=>p.url==='https://ex.com/blog/a').title,'A');
 await sc.remove('1','https://ex.com');sum=await sc.summary('1');assert.deepEqual(sum.sites.map(s=>s.origin),['https://docs.ex.com']);assert.equal(sum.pages,1);
 await assert.rejects(sc.remove('1','https://nope.com'),e=>e.status===404);
});
test('content list uses the live snapshots for the chosen period and falls back to 28 days',async()=>{
 const payload={sites:[{origin:'https://ex.com',confirmedAt:'t'}],pages:[{url:'https://ex.com/docs/a',type:'docs',origin:'https://ex.com'}]};
 const repo={findOne:async()=>({get:()=>payload})};
 const snaps=[{key:'project',payload:{end:'2026-09-27'}},{key:'pages-90',payload:[{page:'/docs/a',views:900}]},{key:'queries-90',payload:[]},{key:'pages-28',payload:[{page:'/docs/a',views:280}]},{key:'queries-28',payload:[]}];
 const sc=new SiteContent({db:{getRepository:()=>repo},sync:{snapshots:async()=>snaps}});
 const a=await sc.list('1','90');assert.equal(a.pages[0].views,900);assert.equal(a.range,'90');assert.equal(a.cutoff,'2026-09-27');assert.match(a.limitations[0],/近 90 天/);
 await assert.rejects(sc.list('1','custom'),e=>e.status===400);const b=await sc.list('1','unsupported');assert.equal(b.pages[0].views,280);assert.equal(b.range,'28');
});

test('daily refresh dates pages that appear after the first read (for the weekly 记忆 check)',async()=>{
 let payload={sites:[{origin:'https://ex.com',sitemaps:['s'],types:['page'],confirmedAt:'t'}],pages:[{origin:'https://ex.com',url:'https://ex.com/a',type:'page',title:'A'}]};
 const repo={findOne:async()=>({id:1,get:()=>payload}),update:async({values})=>{payload=values.payload;},create:async({values})=>{payload=values.payload;}};
 const sc=new SiteContent({db:{getRepository:()=>repo,sequelize:{transaction:fn=>fn({}),query:async()=>{}}}},async()=>{throw new Error('offline');});
 sc.discover=async()=>({pages:[{url:'https://ex.com/a',type:'page'},{url:'https://ex.com/new',type:'page'}]});
 await sc.refresh('1');const by=Object.fromEntries(payload.pages.map(p=>[p.url,p]));
 assert.equal(by['https://ex.com/a'].firstSeenAt,undefined);assert.equal(by['https://ex.com/a'].title,'A');assert.ok(by['https://ex.com/new'].firstSeenAt);
});

test.each([
  ['out-of-range hexadecimal', '&#x110000;'],
  ['out-of-range decimal', '&#99999999;'],
  ['unsafe integer', '&#9007199254740993;'],
  ['non-finite value', `&#${'9'.repeat(400)};`],
])('site metadata and sitemaps keep %s references literal', (_, reference) => {
  const value = `${reference} &apos; &#39; &#x27; &#x1F600; &#128512; &amp;#39;`;
  const expected = `${reference} ' ' ' 😀 😀 &#39;`;
  const meta = pageMeta(
    `<meta name="description" content="${value}">`,
    'https://ex.com/',
  );
  assert.equal(meta.description, expected);
  const sitemap = parseSitemap(
    `<urlset><url><loc>https://ex.com/${value}</loc><lastmod>${value}</lastmod></url></urlset>`,
  );
  assert.deepEqual(sitemap.urls, [
    { loc: `https://ex.com/${expected}`, lastmod: expected },
  ]);
});
