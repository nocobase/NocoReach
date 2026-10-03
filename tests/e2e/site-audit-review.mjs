import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// Isolated 网站审计 (apps/portal/tests/s1/sources.html?page=audit): mocked API.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){
  await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=audit&connected${dark?'&dark&density=default':''}`);
  await expect(page.locator('[data-metric="已检查"]')).toContainText('1380 / 1399');await expect(page.locator('[data-metric="严重"]')).toContainText('3');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);
 }
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=audit&connected`);
 await expect(page.locator('[data-issue]')).toHaveCount(4);const ids=await page.locator('[data-issue]').evaluateAll(l=>l.map(e=>e.dataset.issue));assert.deepEqual(ids,['broken','noindex','noDescription','imagesNoAlt']);
 await page.locator('[data-issue="broken"]').getByRole('button',{name:/页面打不开/}).click();await expect(page.getByRole('dialog')).toContainText('/docs/old · 404');await page.getByRole('button',{name:'关闭详情'}).click();
 await page.locator('[data-issue="broken"]').getByRole('button',{name:'交给 Agent'}).click();await expect(page.getByRole('combobox',{name:'做法'})).toContainText('…');
 await page.getByRole('button',{name:'取消'}).click();
 await page.getByRole('button',{name:'重新读取全部页面'}).click();await expect(page.getByText('会在接下来几小时里重新读取全部页面')).toBeVisible();assert.equal(await page.evaluate(()=>window.__audit.rechecked),1);
 await page.goto(`${base}/tests/s1/sources.html?page=audit`);await expect(page.getByRole('button',{name:'接入网站内容'})).toBeVisible();
 assert.deepEqual(errors,[]);
 console.log('PASS: 网站审计 (counts, issues by severity, affected pages with detail, 交给 Agent dialog, re-read all, not-connected state; 1440 light and 390 dark without overflow). Mocked API only.');
}finally{await browser.close();}
