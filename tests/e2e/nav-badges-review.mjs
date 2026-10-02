import {createRequire} from 'node:module';import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));const {chromium,expect}=require('@playwright/test');
// The menu counts on the production build (apps/portal/dist, run `npm run build && npm run build:html` first), served
// locally under /x/main/ with every /api/ request mocked: no host, account or network.
const dist=new URL('../../apps/portal/dist/',import.meta.url).pathname;
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const srv=http.createServer((q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/x\/main\//,'/');let f=path.join(dist,p);if(!f.startsWith(dist)||!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(dist,'index.html');r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${srv.address().port}/x/main/`;
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let counts={tasks:3,opportunities:2},asked=0;
 await page.addInitScript(()=>localStorage.setItem('NOCOBASE_TOKEN','fixture'));
 await page.route('**/api/**',r=>{const a=new URL(r.request().url()).pathname.split('/api/')[1],j=d=>r.fulfill({json:{data:d}});
  if(a.startsWith('auth:check'))return j({id:1,nickname:'Esther',roles:[{name:'root'}]});
  if(a.startsWith('roles:check'))return j({role:'root',roles:['root'],allowAll:true,snippets:['*'],actions:{},resources:[],availableActions:[]});
  if(a.startsWith('nrSnapshots'))return j([{id:1,key:'project',payload:{id:1,name:'Demo',domains:['example.com']}}]);
  if(a.startsWith('nrStrategy:badges')){asked++;return j(counts);}
  if(a.startsWith('nrSkills:list'))return j({revision:1,skills:[]});
  if(a.startsWith('nrKeywords:saved'))return j({tags:[],items:[]});
  if(a.startsWith('nrDataViews:search'))return j({connected:true,cutoff:'2026-09-27',window:{start:'2026-08-31',end:'2026-09-27',days:28,previousStart:'2026-08-03',previousEnd:'2026-08-30'},filtered:false,complete:true,previousComplete:true,totals:{clicks:1234,impressions:56789,ctr:0.0217,position:9.8},previous:{clicks:1000,impressions:50000,ctr:0.02,position:10.2},trend:[{date:'2026-09-26',clicks:40,impressions:2000,previousDate:'2026-08-29',previousClicks:35,previousImpressions:1800},{date:'2026-09-27',clicks:44,impressions:2100,previousDate:'2026-08-30',previousClicks:36,previousImpressions:1900}],striking:[{query:'open crm',page:'https://example.com/crm',clicks:3,impressions:900,position:8.2}],queries:{rows:[],total:0},pages:{rows:[],total:0},pairDays:28});
  if(a.startsWith('nrDataViews:overview'))return j({cards:[{id:'gsc',cutoff:'2026-09-27',from:'2025-06-01',window:{start:'2026-08-31',end:'2026-09-27',days:28},metrics:[{key:'clicks',label:'点击',value:1234,previous:1000,complete:true,change:0.234}],series:[]}]});
  return j([]);});
 await page.goto(base+'actions');const badge=name=>page.locator('a,button').filter({hasText:name}).locator('[data-slot=nav-badge]');
 await expect(badge('任务')).toHaveText('3');await expect(badge('任务')).toHaveAttribute('aria-label','3 个任务等你确认');
 await expect(badge('机会')).toHaveText('2');await expect(badge('机会')).toHaveAttribute('aria-label','2 个新机会');await expect(badge('洞察')).toHaveCount(0);
 // A change elsewhere shows on the next navigation; zero shows nothing.
 counts={tasks:0,opportunities:120};const before=asked;await page.locator('a').filter({hasText:'洞察'}).first().click();await expect.poll(()=>asked).toBeGreaterThan(before);
 await expect(badge('任务')).toHaveCount(0);await expect(badge('机会')).toHaveText('99+');
 // AI 团队: Agent · 做法 · Skills · 项目知识, and the Skills page loads from the production build.
 const ai=await page.evaluate(()=>[...document.querySelectorAll('a[href]')].map(a=>a.textContent.trim()).filter(t=>['Agent','做法','Skills','项目知识'].includes(t)));assert.deepEqual(ai,['Agent','做法','Skills','项目知识']);
 await page.locator('a').filter({hasText:/^Skills$/}).first().click();await expect(page.getByRole('heading',{name:'Skills',exact:true})).toBeVisible();await expect(page.locator('body')).toContainText('还没有 Skill');
 // 数据分析 pages from OpenSEO load from the production build with their styles (Tailwind classes of the ported table).
 await page.locator('a').filter({hasText:/^搜索表现$/}).first().click();await expect(page.getByRole('heading',{name:'搜索表现'})).toBeVisible();
 await expect(page.locator('[data-metric="点击"]')).toContainText('1,234');await expect(page.locator('tbody tr').first()).toContainText('open crm');
 assert.equal(await page.locator('tbody td').first().evaluate(e=>getComputedStyle(e).paddingLeft!=='0px'&&e.getBoundingClientRect().width<80),true,'ported table styled');
 await page.locator('a').filter({hasText:/^数据总览$/}).first().click();await expect(page.locator('[data-source-id="gsc"]')).toContainText('1,234');
 // Wide screens: pages fill the width beside the menu like NocoProject (no 1600px cap, padding only from the page).
 await page.setViewportSize({width:2560,height:1440});await page.locator('a').filter({hasText:/^搜索表现$/}).first().click();await expect(page.getByRole('heading',{name:'搜索表现'})).toBeVisible();
 const fill=await page.evaluate(()=>{const m=document.querySelector('main'),h=document.querySelector('h1').closest('section');return {main:m.getBoundingClientRect().width,right:innerWidth-m.getBoundingClientRect().right,pad:parseFloat(getComputedStyle(h).paddingLeft),section:h.getBoundingClientRect().width};});
 assert.ok(fill.main>2200&&fill.right<2&&fill.section===fill.main,`wide layout ${JSON.stringify(fill)}`);await page.setViewportSize({width:1440,height:900});
 // 关键词 and 关键词研究 are in the 数据分析 menu.
 const analysis=await page.evaluate(()=>[...document.querySelectorAll('a[href]')].map(a=>a.textContent.trim()).filter(t=>['数据总览','网站表现','搜索表现','关键词','内容','GitHub','社区','关键词研究'].includes(t)));
 assert.deepEqual(analysis,['数据总览','网站表现','搜索表现','关键词','内容','GitHub','社区','关键词研究']);
 assert.deepEqual(errors,[]);
 console.log('PASS menu: AI 团队 lists Agent · 做法 · Skills · 项目知识 and Skills opens; counts: 任务 shows tasks waiting for you, 机会 the new opportunities (orange, labelled), nothing at zero, 99+ above 99, refreshed on navigation; 搜索表现 and 数据总览 (OpenSEO layout) load styled; 数据分析 menu order with 关键词 and 关键词研究; full width on a 2560px screen. Production build, mocked API.');
}finally{await browser.close();srv.close();}
