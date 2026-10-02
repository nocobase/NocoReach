const test=require('node:test'),assert=require('node:assert/strict');
const {SourceDiscovery,extract,checklist}=require('../../plugins/connections/server/source-discovery');
const home=`<html><head><title>Acme &amp; Co</title><meta name="description" content="Open-source tool"><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body>
<a href="https://docs.acme.dev/start">Docs</a><a href="/pricing">Pricing</a><a href="https://demo.acme.dev">Demo</a>
<a href="https://github.com/acme/acme">GitHub</a><a href="https://github.com/acme/acme/issues">Issues</a><a href="https://github.com/acme/awesome-acme">Awesome</a><a href="https://github.com/sponsors/acme">Sponsor</a>
<a href="https://forum.acme.dev/c/general">Forum</a><a href="https://discord.gg/abc">Discord</a><a href="https://x.com/acme">X</a><a href="https://twitter.com/intent/tweet">share</a>
<a href="https://www.npmjs.com/package/@acme/cli">npm</a><pre>pip install acme-sdk</pre><script>gtag('config','G-ABC1234XYZ')</script></body></html>`;
test('extraction finds sites, repos, forums, chats, social, packages, feeds and GA4 with evidence rules',()=>{
 const f=extract(home,'https://www.acme.dev');
 assert.deepEqual(f.websites,['https://www.acme.dev','https://docs.acme.dev','https://demo.acme.dev']);
 assert.deepEqual(f.repos,['acme/acme','acme/awesome-acme']);assert.deepEqual(f.forums,['https://forum.acme.dev']);
 assert.deepEqual(f.chats,['Discord']);assert.deepEqual(f.social,['X @acme']);assert.deepEqual(f.packages.sort(),['PyPI acme-sdk','npm @acme/cli']);
 assert.deepEqual(f.feeds,['/feed.xml']);assert.deepEqual(f.ga4,['G-ABC1234XYZ']);assert.equal(f.title,'Acme & Co');
});
test('checklist: only main and docs-like sites and the main repo are direct; auth and unsupported are explicit',()=>{
 const items=checklist(extract(home,'https://www.acme.dev'),['https://forum.acme.dev']);const by=l=>items.find(i=>i.label===l);
 assert.equal(by('https://www.acme.dev').status,'direct');assert.equal(by('https://docs.acme.dev').status,'direct');assert.equal(by('https://demo.acme.dev').status,'optional');
 assert.equal(by('acme/acme').status,'direct');assert.equal(by('acme/awesome-acme').status,'optional');assert.equal(by('https://forum.acme.dev').source,'discourse');
 assert.equal(items.find(i=>i.source==='github-traffic').status,'auth');assert.equal(items.find(i=>i.source==='ga4').label,'GA4（页面中检测到 G-ABC1234XYZ）');
 assert.ok(items.filter(i=>i.status==='unsupported').some(i=>i.label==='Discord'));
 assert.equal(checklist(extract(home,'https://www.acme.dev'),[]).find(i=>i.label==='https://forum.acme.dev').status,'unsupported');
});
test('discover checks Discourse by its about.json and refuses non-HTML homepages',async()=>{
 const files={'https://www.acme.dev':{text:home,type:'text/html'},'https://forum.acme.dev/about.json':{text:'{"about":{"title":"Acme"}}',type:'application/json'}};
 const read=async u=>{if(!files[u])throw new Error('404');return {...files[u],url:u};};
 const d=await new SourceDiscovery({},read).discover('https://www.acme.dev');assert.equal(d.items.find(i=>i.source==='discourse').status,'direct');
 await assert.rejects(new SourceDiscovery({},async u=>({text:'{}',type:'application/json',url:u})).discover('https://www.acme.dev'),e=>e.status===422);
});
test('checklist: packages on the page can be connected (first checked); Hacker News uses the site name and domain, unchecked',()=>{
 const f={...extract('<a href="https://www.npmjs.com/package/@acme/cli">cli</a><p>pip install acme-sdk</p>','https://www.acme.dev'),origin:'https://www.acme.dev'};
 const items=checklist(f,[]),pk=items.filter(i=>i.source==='packages');
 assert.deepEqual(pk.map(i=>[i.registry,i.name,i.status]),[['npm','@acme/cli','direct'],['pypi','acme-sdk','optional']]);
 const hn=items.find(i=>i.source==='mentions');assert.deepEqual(hn.terms,['acme','acme.dev']);assert.equal(hn.status,'optional');
 assert.ok(!items.some(i=>i.source==='packages'&&i.status==='unsupported'));
});
