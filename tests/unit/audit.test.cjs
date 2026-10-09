const test=require('node:test'),assert=require('node:assert/strict');
const {audit}=require('../../apps/nocoreach/server/providers/reach/domain/audit.cjs');
const {auditSignals}=require('../../apps/nocoreach/server/providers/reach/domain/signals.cjs');
const page=(path,extra={})=>({url:`https://x.dev${path}`,type:'docs',fetchedAt:'2026-10-01T00:00:00Z',title:`Page ${path}`,description:'A description long enough to say what the page is about for search.',words:400,h1:1,imagesNoAlt:0,noindex:false,canonical:null,links:['x.dev/a','x.dev/b','x.dev/c'],...extra});
test('audit finds broken, noindex, offsite, missing and duplicate titles, length, H1, alt, thin, canonical and orphan pages',()=>{
 const site={pages:[page('/'),page('/a',{fetchError:'来源返回 404'}),page('/b',{noindex:true,title:'Same'}),page('/c',{title:'Same',description:''}),page('/d',{title:'',h1:0,imagesNoAlt:3,words:80}),page('/e',{fetchError:'网页跳转至其他域名，请直接提供最终网址'}),page('/f',{canonical:'https://x.dev/'}),page('/g',{h1:2,title:'一个非常非常长的中文标题会在搜索结果里被截断掉的那种标题啊啊啊啊'}),{url:'https://x.dev/new',type:'docs'}]};
 const r=audit(site),by=Object.fromEntries(r.issues.map(i=>[i.type,i]));
 assert.equal(r.total,9);assert.equal(r.read,8);assert.equal(r.pending,1);
 assert.equal(by.broken.pages[0].detail,'404');assert.equal(by.noindex.count,1);assert.equal(by.offsite.count,1);assert.equal(by.noTitle.count,1);assert.equal(by.dupTitle.count,2);assert.equal(by.noDescription.count,1);
 assert.equal(by.noH1.count,1);assert.equal(by.multiH1.count,1);assert.equal(by.imagesNoAlt.pages[0].detail,'3 张');assert.equal(by.thin.count,1);assert.equal(by.canonical.count,1);assert.equal(by.longTitle.count,1);
 assert.deepEqual(by.orphan.pages.map(p=>p.url).sort(),['https://x.dev/d','https://x.dev/f','https://x.dev/g']);
 assert.deepEqual(r.issues.slice(0,2).map(i=>i.severity),['critical','critical']);assert.equal(r.counts.critical,2);
 const sig=auditSignals({site});assert.ok(sig.some(s=>s.key==='audit-broken'&&s.action==='technical'));assert.ok(sig.some(s=>s.key==='audit-noindex'));
});
test('no orphan judgement until most pages have link data',()=>{
 const r=audit({pages:[page('/'),page('/x',{links:undefined}),page('/y',{links:undefined}),page('/z',{links:undefined})]});assert.ok(!r.issues.some(i=>i.type==='orphan'));
});
