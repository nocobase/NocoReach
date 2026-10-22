// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/public-sources.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import * as __strict from 'node:assert/strict';
import * as __public_sources from '../../server/nocoreach/public-sources.js';
const test=__vitest_test,assert=__strict;const {normalize,publicAddress,plain,collect}=__public_sources;
test('public source inputs reject credentials, internal IPs and unsupported protocols',()=>{for(const u of ['http://example.com','https://localhost','https://127.0.0.1','https://user:pass@example.com','https://example.com:8080','https://example.com/?token=secret'])assert.throws(()=>normalize('website',u));assert.equal(normalize('github','https://github.com/org/repo.git'),'https://github.com/org/repo');assert.throws(()=>normalize('github','https://example.com/org/repo'));});
test('DNS policy rejects private, loopback, metadata and IPv6',()=>{for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.31.1.1','192.168.1.1','100.64.0.1','::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false);assert.equal(publicAddress('8.8.8.8'),true);});
test('web collection strips script and bounds evidence',async()=>{const r=await collect('website','https://example.com',async()=>({type:'text/html',url:'https://example.com',text:'<title>Docs</title><script>secret script</script><main>'+ 'content '.repeat(4000)+'</main>'}));assert.equal(r.items[0].text.length,16000);assert.ok(!r.items[0].text.includes('secret script'));assert.equal(r.items.length,1);});
test('github excludes PRs and preserves partial source failures',async()=>{const r=await collect('github','https://github.com/org/repo',async u=>{if(u.includes('/releases'))throw Error();return {text:JSON.stringify(u.includes('/issues')?[{title:'Issue',html_url:'https://github.com/org/repo/issues/1',body:'Question'},{title:'PR',pull_request:{}}]:{full_name:'org/repo',html_url:'https://github.com/org/repo',stargazers_count:0,forks_count:0})};});assert.equal(r.items.length,2);assert.equal(r.items[0].stars,0);assert.ok(r.warnings.some(w=>w.includes('读取失败')));});

const invalidReferences = [
  ['out-of-range hexadecimal', '&#x110000;'],
  ['out-of-range decimal', '&#99999999;'],
  ['unsafe integer', '&#9007199254740993;'],
  ['non-finite value', `&#${'9'.repeat(400)};`],
];
test.each(invalidReferences)(
  'web collection keeps %s references literal',
  async (_, reference) => {
    const suffix = 'evidence '.repeat(20).trim();
    const text = `${reference} &apos; &#39; &#x27; &#x1F600; &#128512; &amp;#39; ${suffix}`;
    const result = await collect(
      'website',
      'https://example.com',
      async () => ({
        type: 'text/plain',
        url: 'https://example.com',
        text,
      }),
    );
    assert.equal(
      result.items[0].text,
      `${reference} ' ' ' 😀 😀 &#39; ${suffix}`,
    );
  },
);
test('plain text retains valid Unicode boundary references', () => {
  assert.equal(plain('&#0;|&#x10ffff;|&#1114111;'), '\0|\u{10ffff}|\u{10ffff}');
});
