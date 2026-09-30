import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// Isolated data overview (apps/portal/tests/s1/sources.html?page=data): mocked API, no auth or network.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){
  await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=data&connected${dark?'&dark':''}`);
  for(const id of ['gsc','ga4','site','github','discourse'])await expect(page.locator(`.nr-data-card[data-source-id="${id}"]`)).toBeVisible();
  await expect(page.locator('.nr-data-card[data-source-id="github-traffic"]')).toHaveCount(0);
  await expect(page.locator('[data-source-id="ga4"]')).toContainText('-9%');await expect(page.locator('[data-source-id="github"] .nr-data-note').first()).toContainText('token');
  await expect(page.locator('.nr-data-planned')).toHaveCount(8);await expect(page.locator('.nr-data-planned button')).toHaveCount(0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);
 }
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=data&connected`);
 const count=()=>page.evaluate(()=>window.__calls.filter(c=>c==='nrDataViews:overview').length);const before=await count();
 await page.getByRole('button',{name:'近 90 天'}).click();await expect.poll(count).toBeGreaterThan(before);await expect(page.getByRole('button',{name:'近 90 天'})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'自定义'}).click();await expect(page.getByLabel('开始日期')).toBeVisible();await page.getByLabel('开始日期').fill('2026-09-01');await expect.poll(count).toBeGreaterThan(before+1);
 assert.deepEqual(errors,[]);
 console.log('PASS: data overview shows connected sources with changes and notes, available sources with connect actions, planned sources greyed without actions; range switch and custom dates refetch; 1440 light and 390 dark without overflow. Mocked API only.');
}finally{await browser.close();}
