const test=require('node:test'),assert=require('node:assert/strict');
const {SiteContent,parseSitemap,robotsSitemaps,classify,pageMeta,joinMetrics,sameSite}=require('../../plugins/connections/server/site-content');
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
test('page metadata counts words and internal links only',()=>{
 const m=pageMeta('<title>Install &amp; run</title><meta name="description" content="Fast start"><body><p>安装 NocoBase in 5 minutes</p><a href="/docs/a">a</a><a href="https://ex.com/b">b</a><a href="https://other.com/c">c</a><a href="#top">t</a></body>','https://ex.com/docs/install');
 assert.equal(m.title,'Install & run');assert.equal(m.description,'Fast start');assert.equal(m.internalLinks,2);assert.ok(m.words>=5);
});
test('metrics join by path and leave pages outside the samples empty rather than zero',()=>{
 const pages=[{url:'https://ex.com/docs/a/',type:'docs'},{url:'https://ex.com/blog/b',type:'blog'}];
 const out=joinMetrics(pages,[{page:'/docs/a',views:40,sessions:30}],[{page:'https://ex.com/docs/a',clicks:3,impressions:100},{page:'https://ex.com/docs/a',clicks:2,impressions:50}]);
 assert.deepEqual([out[0].views,out[0].clicks,out[0].impressions],[40,5,150]);assert.deepEqual([out[1].views,out[1].clicks],[null,null]);
});
test('a proxy fake-ip answer is refused with an actionable message',async()=>{
 const {download}=require('../../plugins/connections/server/public-sources');const dns=require('node:dns').promises;const orig=dns.lookup;dns.lookup=async()=>[{address:'198.18.1.62',family:4}];
 try{await assert.rejects(download('https://example.com/sitemap.xml'),e=>e.status===503&&/NOREACH_PUBLIC_DNS/.test(e.message));}finally{dns.lookup=orig;}
});
