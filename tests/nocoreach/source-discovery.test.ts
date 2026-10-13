// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/source-discovery.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { SourceDiscovery, extract, checklist } from '../../server/nocoreach/source-discovery.js';
const test=__vitest_test;
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
 assert.ok(items.some(i=>i.label==='Discord'&&i.source==='discord'&&i.status==='auth'),'Discord can be connected now (2026-10-04), with a bot');
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

const savedPlugin = (states = {}) =>
  Object.fromEntries(
    Object.entries(states).map(([key, value]) => [
      key,
      {
        state: vi.fn(async (id) => {
          assert.equal(id, '42');
          if (value instanceof Error) throw value;
          return value;
        }),
      },
    ]),
  );
test('package identity reuses the existing registry name normalization and chat checks each saved platform', async () => {
  const discovery = new SourceDiscovery(savedPlugin({
    packages: {packages: [{registry:'pypi',name:'acme-sdk'},{registry:'npm',name:'@acme/cli'}]},
    chat: {slack:{status:'active'},discord:{status:'disconnected'}},
  }));
  const items = await discovery.connections('42', [
    {source:'packages',registry:'pypi',name:'Acme_SDK'},
    {source:'packages',registry:'npm',name:'@ACME/CLI'},
    {source:'slack'}, {source:'discord'},
  ]);
  assert.deepEqual(items.map(f=>f.connection.status), ['connected','connected','connected','new']);
});
const discoverSaved = async (plugin) => {
  const read = vi.fn(async (url) => ({
    type: url.endsWith('/about.json') ? 'application/json' : 'text/html',
    text: url.endsWith('/about.json') ? '{"about":{}}' : home,
  }));
  const result = await new SourceDiscovery(plugin, read).discover(
    'https://www.acme.dev',
    '42',
  );
  assert.deepEqual(
    read.mock.calls.map(([url]) => url),
    ['https://www.acme.dev', 'https://forum.acme.dev/about.json'],
  );
  return result.items;
};
test('saved matching sources are connected, with origins, case-insensitive repos and unordered HN term sets', async () => {
  const items = await discoverSaved(
    savedPlugin({
      siteContent: {
        sites: [{ origin: 'https://www.acme.dev/path', types: ['docs'] }],
      },
      github: {
        repo: 'ACME/Acme',
        status: 'active',
        token: { verifiedAt: '2026-10-01' },
      },
      community: { origin: 'https://forum.acme.dev/path' },
      packages: { packages: [{ registry: 'npm', name: '@acme/cli' }] },
      hackernews: { terms: ['ACME.DEV', 'acme', 'Acme'] },
      chat: { discord: { status: 'active' } },
    }),
  );
  for (const source of [
    'site',
    'github',
    'discourse',
    'packages',
    'mentions',
    'github-traffic',
    'discord',
  ])
    assert.equal(
      items.find((f) => f.source === source).connection.status,
      'connected',
      source,
    );
  assert.equal(
    items.find((f) => f.label === 'https://docs.acme.dev').connection.status,
    'new',
  );
  assert.equal(
    items.find((f) => f.registry === 'pypi').connection.status,
    'new',
  );
});
test('different singleton sources identify the current connection to replace', async () => {
  const items = await discoverSaved(
    savedPlugin({
      github: { repo: 'other/repo' },
      community: { origin: 'https://forum.other.dev' },
      hackernews: { terms: ['other.dev', 'other'] },
    }),
  );
  for (const [source, current] of [
    ['github', 'other/repo'],
    ['discourse', 'https://forum.other.dev'],
    ['mentions', 'other.dev, other'],
  ])
    assert.deepEqual(items.find((f) => f.source === source).connection, {
      status: 'replaces',
      current,
    });
  assert.equal(
    items.find((f) => f.source === 'github-traffic').connection.status,
    'new',
  );
});
test('missing and disconnected sources are new; packages match both registry and name', async () => {
  const empty = await discoverSaved({});
  assert.ok(empty.every((f) => f.connection.status === 'new'));
  const items = await discoverSaved(
    savedPlugin({
      github: { repo: 'acme/acme', status: 'disconnected' },
      community: { origin: 'https://forum.acme.dev', status: 'disconnected' },
      hackernews: { terms: ['acme', 'acme.dev'], status: 'disconnected' },
      packages: { packages: [{ registry: 'pypi', name: '@acme/cli' }] },
      chat: { discord: { status: 'disconnected' } },
    }),
  );
  assert.ok(items.every((f) => f.connection.status === 'new'));
});
test('each saved source read fails independently without blocking discovery or changing other connections', async () => {
  const states = {
    siteContent: { sites: [{ origin: 'https://www.acme.dev' }] },
    github: { repo: 'acme/acme' },
    community: { origin: 'https://forum.acme.dev' },
    packages: { packages: [{ registry: 'npm', name: '@acme/cli' }] },
    hackernews: { terms: ['acme', 'acme.dev'] },
    chat: { discord: { status: 'active' } },
  };
  for (const [key, source] of [
    ['siteContent', 'site'],
    ['github', 'github'],
    ['community', 'discourse'],
    ['packages', 'packages'],
    ['hackernews', 'mentions'],
    ['chat', 'discord'],
  ]) {
    const items = await discoverSaved(
      savedPlugin({ ...states, [key]: new Error('saved state unavailable') }),
    );
    assert.equal(
      items.find((f) => f.source === source).connection.status,
      'new',
    );
    for (const other of [
      'site',
      'github',
      'discourse',
      'packages',
      'mentions',
      'discord',
    ].filter((s) => s !== source))
      assert.equal(
        items.find((f) => f.source === other).connection.status,
        'connected',
      );
  }
});
test('Google sources use only saved authorization and selected resources; failures and disconnected links are new', async () => {
  for (const [status, authorized, ga4, gsc, expected] of [
    ['active', true, '123', 'https://acme.dev', 'connected'],
    ['active', false, '123', 'https://acme.dev', 'new'],
    ['disconnected', true, '123', 'https://acme.dev', 'new'],
    ['active', true, null, null, 'new'],
  ]) {
    const plugin = {
      link: vi.fn(async (id) => {
        assert.equal(id, '42');
        return {
          get: (key) => ({ status, ga4PropertyId: ga4, gscSiteUrl: gsc })[key],
        };
      }),
      env: vi.fn(() => authorized),
    };
    const items = await discoverSaved(plugin);
    for (const source of ['ga4', 'gsc'])
      assert.equal(
        items.find((f) => f.source === source).connection.status,
        expected,
      );
  }
  const items = await discoverSaved({
    ...savedPlugin({ github: { repo: 'acme/acme' } }),
    link: async () => {
      throw new Error('unavailable');
    },
  });
  assert.equal(items.find((f) => f.source === 'ga4').connection.status, 'new');
  assert.equal(
    items.find((f) => f.source === 'github').connection.status,
    'connected',
  );
});
