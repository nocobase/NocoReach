import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// 数据接入: 下载量 (npm, PyPI, Docker Hub) and Hacker News 提及 panels, and their 数据总览 cards. Mocked API only.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){
  await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?connected&source=packages${dark?'&dark&density=default':''}`);
  await expect(page.getByLabel('平台')).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);
 }
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?connected&source=packages`);
 await page.getByLabel('包名或页面地址').fill('missing-pkg');await page.getByRole('button',{name:'读取'}).click();await expect(page.getByRole('alert')).toContainText('没有找到');
 await page.getByLabel('包名或页面地址').fill('@nocobase/client');await page.getByRole('button',{name:'读取'}).click();await expect(page.getByText('最近 7 天下载 3,611')).toBeVisible();
 await page.getByRole('button',{name:'确认接入'}).click();await expect(page.locator('[data-package="npm:@nocobase/client"]')).toContainText('近 28 天下载 15,200');
 await page.getByLabel('平台').selectOption('docker');await page.getByLabel('包名或页面地址').fill('nocobase/nocobase');await page.getByRole('button',{name:'读取'}).click();await expect(page.getByText('累计拉取 1,139,849')).toBeVisible();await page.getByRole('button',{name:'确认接入'}).click();
 await expect(page.locator('[data-package="docker:nocobase/nocobase"]')).toContainText('每天记录一次');
 page.once('dialog',d=>d.accept());await page.locator('[data-package="docker:nocobase/nocobase"]').getByRole('button',{name:'移除'}).click();await expect(page.locator('[data-package="docker:nocobase/nocobase"]')).toHaveCount(0);
 await page.goto(`${base}/tests/s1/sources.html?connected&source=mentions`);await page.getByLabel('产品名或域名').fill('nocobase, nocobase.com');await page.getByRole('button',{name:'搜索最近 30 天'}).click();
 await expect(page.getByText('近 30 天 6 条提及')).toBeVisible();await expect(page.getByText('只保存帖子和评论的内容、分数与评论数，不保存作者。')).toBeVisible();await page.getByRole('button',{name:'确认接入'}).click();await expect(page.getByText('正在补读近一年的提及')).toBeVisible();
 await page.goto(`${base}/tests/s1/sources.html?page=data&connected`);
 await expect(page.locator('[data-source-id="packages"]')).toContainText('15,200');await expect(page.locator('[data-source-id="packages"]')).toContainText('Docker 拉取从');await expect(page.locator('[data-source-id="packages"]').getByRole('link',{name:'查看详情 →'})).toHaveCount(0);
 await expect(page.locator('[data-source-id="mentions"]')).toContainText('Hacker News');await expect(page.locator('[data-source-id="mentions"]')).toContainText('Show HN: NocoBase');
 await expect(page.locator('.nr-data-planned-line')).not.toContainText('npm');await expect(page.locator('.nr-data-planned-line')).not.toContainText('Hacker News');
 assert.deepEqual(errors,[]);
 console.log('PASS: 下载量 panel (not found, npm read and connect, Docker pulls, remove) and Hacker News 提及 panel (30-day search, no authors, background backfill); 数据总览 shows both cards and no longer lists them as planned; 1440 light and 390 dark without overflow. Mocked API only.');
}finally{await browser.close();}
