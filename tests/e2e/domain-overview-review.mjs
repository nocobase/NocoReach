import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// Isolated 域名概览 (apps/portal/tests/s1/sources.html?page=domain): mocked API, no paid query.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const dom=()=>page.evaluate(()=>window.__dom);
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){
  await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=domain&connected${dark?'&dark&density=default':''}`);
  await expect(page.getByText('还没有查过网站')).toBeVisible();await expect(page.getByLabel('域名')).toHaveValue('example.com');
  await page.getByRole('button',{name:'查询'}).click();await expect(page.locator('[data-metric="估算自然流量 / 月"]')).toContainText('48,200');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);
 }
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=domain&connected`);
 await page.getByLabel('域名').fill('https://www.competitor.io/');await page.getByRole('button',{name:'查询'}).click();
 await expect(page.locator('[data-metric="前 10 名"]')).toContainText('2,105');await expect(page.getByText('共 1,290 个，这里列出估算流量最多的 80 个')).toBeVisible();
 let d=await dom();assert.equal(d.calls.length,1);assert.equal(d.calls[0].view,'keywords');assert.equal(d.calls[0].confirmCost,undefined);
 await expect(page.getByRole('columnheader',{name:'本站点击'})).toHaveCount(0);
 await page.locator('tbody tr').nth(0).getByRole('checkbox').click();await page.getByRole('button',{name:'保存为关键词'}).click();await expect(page.getByText(/已保存 \d+ 个关键词/)).toBeVisible();
 await page.getByRole('tab',{name:/页面/}).click();await expect(page.getByRole('button',{name:'查询热门页面'})).toBeVisible();assert.equal((await dom()).calls.length,1,'pages not queried until asked');
 await page.getByRole('button',{name:'查询热门页面'}).click();await expect(page.locator('tbody')).toContainText('/blog/open-source-crm');await expect(page.locator('a[href^="javascript"]')).toHaveCount(0);
 d=await dom();assert.equal(d.calls.at(-1).view,'pages');assert.equal(d.calls.at(-1).target,'competitor.io');
 // Own site: 本站点击 next to the estimate.
 await page.getByLabel('域名').fill('example.com');await page.getByRole('button',{name:'查询'}).click();await expect(page.getByRole('columnheader',{name:'本站点击'})).toBeVisible();await expect(page.getByText('这是本站')).toBeVisible();
 await page.getByRole('button',{name:'最近查过的'}).click();await expect(page.getByRole('heading',{name:'最近查过的'})).toBeVisible();await page.getByRole('button',{name:/competitor\.io/}).first().click();await expect(page.locator('[data-metric="排名关键词"]')).toContainText('12,930');
 assert.deepEqual(errors,[]);
 console.log('PASS: 域名概览 (own domain prefilled, one keywords query with metrics, addresses reduced to the domain, save to 关键词, pages only on request, unsafe links not rendered, 本站点击 for your own site, recent queries reopen; 1440 light and 390 dark without overflow). Mocked API only.');
}finally{await browser.close();}
