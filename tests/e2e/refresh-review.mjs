import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));const {chromium,expect}=require('@playwright/test');
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try {
const p=await browser.newPage({viewport:{width:1920,height:1080}});await p.addInitScript(t=>{localStorage.setItem('NOCOBASE_TOKEN',t);localStorage.setItem('NOCOBASE_LOCALE','zh-CN');},process.env.NR_API_TOKEN);
const url=process.env.NR_PORTAL_URL+'/home';
await p.goto(url);await expect(p.locator('.nr-opportunity-card').first()).toBeVisible({timeout:30000});
for(let i=0;i<3;i++){await p.reload();await expect(p.locator('.nr-opportunity-card').first()).toBeVisible({timeout:30000});assert.ok((await p.locator('.nr-discovery').boundingBox()).width>1500);}
console.log('PASS three real refreshes');
await p.route('**/nrStrategy:state',async route=>{await new Promise(r=>setTimeout(r,17000));await route.abort().catch(()=>{});});
await p.reload();await expect(p.locator('.nr-page-skeleton')).toBeVisible();const box=await p.locator('.nr-page-skeleton').boundingBox();assert.ok(box.width>1500);assert.ok(box.y<180);
await expect(p.getByRole('alert')).toContainText('超时',{timeout:20000});await p.unroute('**/nrStrategy:state');await p.getByRole('button',{name:'重新加载',exact:true}).click();await expect(p.locator('.nr-opportunity-card').first()).toBeVisible({timeout:30000});
console.log('PASS slow-request layout, timeout and retry recovery');
await p.route('**/nrStrategy:state',r=>r.fulfill({status:503,contentType:'application/json',body:'{"errors":[{"message":"unavailable"}]}'}));await p.reload();await expect(p.getByRole('alert')).toBeVisible({timeout:30000});await p.unroute('**/nrStrategy:state');await p.getByRole('button',{name:'重新加载',exact:true}).click();await expect(p.locator('.nr-opportunity-card').first()).toBeVisible({timeout:30000});console.log('PASS failed-request recovery');
}finally{await browser.close();}
