// @ts-nocheck
// Ported from the classic NocoReach unit tests (tests/unit/project-icon.test.cjs) with node:test replaced by vitest.
import { test as __vitest_test, vi } from 'vitest';
vi.setConfig({ testTimeout: 60000 });
import assert from 'node:assert/strict';
import { ProjectIcon, iconLinks } from '../../server/nocoreach/project-icon.js';
const test=__vitest_test;
test('icon links: apple-touch and SVG first, larger sizes before smaller, https only, favicon.ico last',()=>{
 const html='<link rel="icon" href="/a-16.png" sizes="16x16"><link rel="icon" href="/a-32.png" sizes="32x32"><link rel="apple-touch-icon" href="https://cdn.x.dev/touch.png"><link rel="icon" href="http://x.dev/insecure.png"><link rel="icon" href="data:image/png;base64,AA"><link rel="stylesheet" href="/s.css">';
 assert.deepEqual(iconLinks(html,'https://x.dev/'),['https://cdn.x.dev/touch.png','https://x.dev/a-32.png','https://x.dev/a-16.png','https://x.dev/favicon.ico']);
});
test('icon: tries www when the bare domain fails, keeps images only, caches a week, letter fallback when none',async()=>{
 const rows={};const p={project:async()=>({id:1,domains:['https://x.dev/']}),db:{getRepository:()=>({findOne:async o=>rows[o.filter.key]&&{id:1,get:()=>rows[o.filter.key]},create:async o=>{rows[o.values.key]=o.values.payload;},update:async o=>{rows[Object.keys(rows)[0]]=o.values.payload;}})}};
 const seen=[];const read=async url=>{seen.push(url);if(url==='https://x.dev/')throw new Error('网页跳转至其他域名');if(url==='https://www.x.dev/')return {text:'<link rel="icon" href="/i.html"><link rel="icon" href="/i.png">',url};if(url.endsWith('/i.html'))return {type:'text/html',body:Buffer.from('<html>')};if(url.endsWith('/i.png'))return {type:'image/png',body:Buffer.from([1,2,3])};throw new Error('来源返回 404');};
 const r=await new ProjectIcon(p,read).get('1');assert.equal(r.dataUrl,'data:image/png;base64,AQID');assert.equal(r.source,'https://www.x.dev/i.png');
 const n=seen.length;await new ProjectIcon(p,read).get('1');assert.equal(seen.length,n,'cached');
 const none=await new ProjectIcon({...p,project:async()=>({id:1,domains:['y.dev']})},async()=>{throw new Error('x');}).get('1');assert.equal(none.dataUrl,null);
});
test('demo icon reads never fetch or write a cache while browsing',async()=>{
 const forbidden=()=>{throw new Error('Unexpected demo side effect');};
 const p={demoConfiguration:{enabled:true},project:async()=>({domains:['x.dev']}),db:{getRepository:()=>({findOne:async()=>null,create:forbidden,update:forbidden})}};
 assert.deepEqual(await new ProjectIcon(p,forbidden).get('1'),{dataUrl:null,source:null});
});
