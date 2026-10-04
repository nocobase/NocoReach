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
 let counts={tasks:3,opportunities:2},asked=0;const projects=[{id:1,name:'Demo',domains:['example.com']},{id:2,name:'Acme',domains:['acme.dev']}],created=[];const projectIds=[];
 await page.addInitScript(()=>localStorage.setItem('NOCOBASE_TOKEN','fixture'));
 await page.route('**/api/**',r=>{const a=new URL(r.request().url()).pathname.split('/api/')[1],j=d=>r.fulfill({json:{data:d}});
  if(a.startsWith('auth:check'))return j({id:1,nickname:'Esther',roles:[{name:'root'}]});
  if(a.startsWith('roles:check'))return j({role:'root',roles:['root'],allowAll:true,snippets:['*'],actions:{},resources:[],availableActions:[]});
  if(a.startsWith('nrSnapshots'))return j([{id:1,key:'project',payload:{id:1,name:'Demo',domains:['example.com']}}]);
  if(a.startsWith('nrProjects:list'))return j(projects);
  if(a.startsWith('nrProjects:create')){const b=r.request().postDataJSON();if(b.domain==='example.com')return r.fulfill({status:409,json:{errors:[{message:'已有项目用这个官网地址'}]}});const p={id:projects.length+1,name:b.name,domains:[b.domain.replace(/^https?:\/\//,'')]};projects.push(p);created.push(b);return j(p);}
  if(a.startsWith('nrStrategy:badges')){asked++;projectIds.push(r.request().postDataJSON()?.projectId);return j(counts);}
  if(a.startsWith('nrSkills:list'))return j({revision:1,skills:[]});
  if(a.startsWith('nrKeywords:saved'))return j({tags:[],items:[]});
  if(a.startsWith('nrDataViews:search'))return j({connected:true,cutoff:'2026-09-27',window:{start:'2026-08-31',end:'2026-09-27',days:28,previousStart:'2026-08-03',previousEnd:'2026-08-30'},filtered:false,complete:true,previousComplete:true,totals:{clicks:1234,impressions:56789,ctr:0.0217,position:9.8},previous:{clicks:1000,impressions:50000,ctr:0.02,position:10.2},trend:[{date:'2026-09-26',clicks:40,impressions:2000,previousDate:'2026-08-29',previousClicks:35,previousImpressions:1800},{date:'2026-09-27',clicks:44,impressions:2100,previousDate:'2026-08-30',previousClicks:36,previousImpressions:1900}],striking:[{query:'open crm',page:'https://example.com/crm',clicks:3,impressions:900,position:8.2}],queries:{rows:[],total:0},pages:{rows:[],total:0},pairDays:28});
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
 await page.locator('a').filter({hasText:/^下载量$/}).first().click();await expect(page.getByRole('heading',{name:'下载量',exact:true})).toBeVisible();
 // Wide screens: pages fill the width beside the menu like NocoProject (no 1600px cap, padding only from the page).
 await page.setViewportSize({width:2560,height:1440});await page.locator('a').filter({hasText:/^搜索表现$/}).first().click();await expect(page.getByRole('heading',{name:'搜索表现'})).toBeVisible();
 const fill=await page.evaluate(()=>{const m=document.querySelector('main'),h=document.querySelector('h1').closest('section');return {main:m.getBoundingClientRect().width,right:innerWidth-m.getBoundingClientRect().right,pad:parseFloat(getComputedStyle(h).paddingLeft),section:h.getBoundingClientRect().width};});
 assert.ok(fill.main>2200&&fill.right<2&&fill.section===fill.main,`wide layout ${JSON.stringify(fill)}`);await page.setViewportSize({width:1440,height:900});
 // Data menu (2026-10-03): three groups by what they show, no 数据总览; short names under each group title.
 const labels=['数据总览','网站表现','内容','网站审计','社区','访问','页面','审计','下载量','搜索表现','关键词','竞品','AI 搜索','GitHub','讨论','论坛','Hacker News','Reddit','关键词研究','域名概览','趋势','X'];
 const analysis=await page.evaluate(l=>[...document.querySelectorAll('a[href]')].map(a=>a.textContent.trim()).filter(t=>l.includes(t)),labels);
 assert.deepEqual(analysis,['访问','页面','审计','GitHub','下载量','搜索表现','关键词','趋势','竞品','AI 搜索','论坛','Hacker News','Reddit','X']);
 const groups=await page.evaluate(()=>[...document.querySelectorAll('span')].map(s=>s.textContent.trim()).filter(t=>['网站与产品','搜索','社区','AI 团队','设置','数据分析'].includes(t)));
 assert.deepEqual(groups,['网站与产品','搜索','社区','AI 团队','设置']);
 // Projects: the header lists them and switches; 添加新项目 creates one and opens its 数据接入.
 await page.getByRole('button',{name:'切换项目'}).click();await expect(page.getByRole('menuitem',{name:/Acme/})).toBeVisible();
 await page.getByRole('menuitem',{name:/Acme/}).click();await page.waitForURL(/\/x\/main\/home/);await expect(page.getByRole('button',{name:'切换项目'})).toContainText('Acme');
 assert.equal(await page.evaluate(()=>localStorage.getItem('nocoreach:project')),'2');await expect.poll(()=>projectIds.at(-1)).toBe('2');
 await page.getByRole('button',{name:'切换项目'}).click();await page.getByRole('menuitem',{name:'添加新项目'}).click();
 await page.getByLabel('项目名称').fill('Dup');await page.getByLabel('官网地址').fill('example.com');await page.getByRole('button',{name:'创建并去接入数据'}).click();await expect(page.getByRole('alert')).toContainText('已有项目');
 await page.getByLabel('项目名称').fill('Third');await page.getByLabel('官网地址').fill('https://third.io');await page.getByRole('button',{name:'创建并去接入数据'}).click();
 await page.waitForURL(/\/x\/main\/connections/);await expect(page.getByRole('button',{name:'切换项目'})).toContainText('Third');assert.deepEqual(created,[{name:'Third',domain:'https://third.io'}]);
 await page.evaluate(()=>localStorage.removeItem('nocoreach:project'));
 assert.deepEqual(errors,[]);
 console.log('PASS projects: header switcher lists projects and switches (requests use the chosen project), 添加新项目 refuses a duplicate site and opens 数据接入 of the new one; menu: AI 团队 lists Agent · 做法 · Skills · 项目知识 and Skills opens; counts: 任务 shows tasks waiting for you, 机会 the new opportunities (orange, labelled), nothing at zero, 99+ above 99, refreshed on navigation; 搜索表现 and 数据总览 (OpenSEO layout) load styled; 数据分析 menu order with 关键词 and 关键词研究; full width on a 2560px screen. Production build, mocked API.');
}finally{await browser.close();srv.close();}
