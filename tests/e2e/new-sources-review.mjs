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
 // Reddit 讨论: needs DataForSEO first; then the product name starts the first Google search of reddit.com.
 await page.goto(`${base}/tests/s1/sources.html?connected&nokeys&source=reddit`);await expect(page.getByText('请先接入 DataForSEO')).toBeVisible();
 await page.goto(`${base}/tests/s1/sources.html?connected&source=reddit`);await expect(page.getByText('约 $0.002，算进 DataForSEO 的月度预算')).toBeVisible();await page.getByLabel('产品名').fill('NocoBase');await page.getByRole('button',{name:'接入并开始查找'}).click();await expect(page.getByText('正在第一次查找')).toBeVisible();
 // 趋势: needs DataForSEO; the product (prefilled) and competitors, a region, then the first query starts.
 await page.goto(`${base}/tests/s1/sources.html?connected&nokeys&source=trends`);await expect(page.getByText('请先接入 DataForSEO')).toBeVisible();
 await page.goto(`${base}/tests/s1/sources.html?connected&source=trends`);await expect(page.getByLabel('比较的词')).toHaveValue('Demo');await expect(page.getByText('每次约 $0.022，算进 DataForSEO 的月度预算')).toBeVisible();
 await page.getByLabel('比较的词').fill('NocoBase, Retool');await page.getByLabel('地区').selectOption('2840');await page.getByRole('button',{name:'接入并开始查询'}).click();await expect(page.getByText('正在第一次查询')).toBeVisible();await expect(page.getByRole('heading',{name:'比较：NocoBase、Retool · 美国'})).toBeVisible();
 // 竞品动态: the list with what was read, and adding one more from the panel.
 await page.goto(`${base}/tests/s1/sources.html?connected&source=competitors`);await expect(page.locator('[data-competitor="Appsmith"]')).toContainText('最新版本 v1.62');
 const addc=page.locator('[data-add-competitor]');await addc.getByLabel('竞品名称').fill('Budibase');await addc.getByLabel('竞品官网').fill('budibase.com');await addc.getByRole('button',{name:'添加'}).click();await expect(page.locator('[data-competitor="Budibase"]')).toContainText('budibase.com');
 await addc.getByLabel('竞品名称').fill('retool');await addc.getByLabel('竞品官网').fill('retool.io');await addc.getByRole('button',{name:'添加'}).click();await expect(addc.getByRole('alert')).toHaveText('这个竞品已经在列表里了');
 // AI 搜索可见度: no connection of its own — ready once DataForSEO is, with the way to the AI 搜索 page.
 await page.goto(`${base}/tests/s1/sources.html?connected&source=ai-visibility`);await expect(page.getByText('可以用了')).toBeVisible();await expect(page.getByRole('button',{name:'去 AI 搜索'})).toBeVisible();
 await page.goto(`${base}/tests/s1/sources.html?connected&nokeys&source=ai-visibility`);await expect(page.getByRole('heading',{name:'先接入 DataForSEO'})).toBeVisible();
 // Their pages: 下载量 under 网站与产品, Hacker News under 社区 (was a card on 数据总览).
 await page.goto(`${base}/tests/s1/sources.html?page=downloads&connected`);await expect(page.locator('[data-metric="下载量"]')).toContainText('15,200');await expect(page.getByText('Docker 拉取从')).toBeVisible();
 await page.goto(`${base}/tests/s1/sources.html?page=hackernews&connected`);await expect(page.locator('[data-story]')).toContainText('Show HN: NocoBase');
 assert.deepEqual(errors,[]);
 console.log('PASS: 下载量 panel (not found, npm read and connect, Docker pulls, remove) and Hacker News 提及 panel (30-day search, no authors, background backfill); Reddit 讨论 panel (needs DataForSEO, connect starts the first search); 趋势 panel (needs DataForSEO, terms prefilled, region, first query); 竞品动态 panel (list, add, duplicate refused); AI 搜索可见度 ready with DataForSEO; 下载量 and Hacker News pages show their data; 1440 light and 390 dark without overflow. Mocked API only.');
}finally{await browser.close();}
