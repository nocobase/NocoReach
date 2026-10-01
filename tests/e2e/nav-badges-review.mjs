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
  return j([]);});
 await page.goto(base+'actions');const badge=name=>page.locator('a,button').filter({hasText:name}).locator('[data-slot=nav-badge]');
 await expect(badge('任务')).toHaveText('3');await expect(badge('任务')).toHaveAttribute('aria-label','3 个任务等你确认');
 await expect(badge('机会')).toHaveText('2');await expect(badge('机会')).toHaveAttribute('aria-label','2 个新机会');await expect(badge('洞察')).toHaveCount(0);
 // A change elsewhere shows on the next navigation; zero shows nothing.
 counts={tasks:0,opportunities:120};const before=asked;await page.locator('a').filter({hasText:'洞察'}).first().click();await expect.poll(()=>asked).toBeGreaterThan(before);
 await expect(badge('任务')).toHaveCount(0);await expect(badge('机会')).toHaveText('99+');
 assert.deepEqual(errors,[]);
 console.log('PASS menu counts: 任务 shows tasks waiting for you, 机会 the new opportunities (orange, labelled), nothing at zero, 99+ above 99, refreshed on navigation. Production build, mocked API.');
}finally{await browser.close();srv.close();}
