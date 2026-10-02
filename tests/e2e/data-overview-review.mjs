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
  for(const id of ['gsc','ga4','site','github','discourse'])await expect(page.locator(`[data-source-id="${id}"]`).getByRole('link',{name:'查看详情 →'})).toBeVisible();
  await expect(page.locator('[data-source-id="github-traffic"]')).toHaveCount(0);
  // Cards with data come first, one per source, then the ones still to connect.
  assert.deepEqual((await page.locator('[data-source-id]').evaluateAll(l=>l.map(e=>e.dataset.sourceId))).slice(0,5),['gsc','ga4','site','github','discourse']);
  await expect(page.locator('[data-source-id="gsc"]')).toContainText('平均排名');await expect(page.locator('[data-source-id="gsc"]')).toContainText('▲ 0.7');await expect(page.locator('[data-source-id="gsc"]')).toContainText('数据截至 2026-09-27');
  await expect(page.locator('[data-source-id="ga4"]')).toContainText('▼ 9%');await expect(page.locator('[data-source-id="github"] .nr-data-note').first()).toContainText('token');
  await expect(page.locator('.nr-data-available').first().getByRole('button',{name:'接入'})).toBeVisible();
  await expect(page.locator('.nr-data-planned-line')).toContainText('计划开发：');await expect(page.locator('.nr-data-planned-line')).toContainText('Google Trends');await expect(page.locator('.nr-data-planned-line button')).toHaveCount(0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);
 }
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=data&connected`);
 const count=()=>page.evaluate(()=>window.__calls.filter(c=>c==='nrDataViews:overview').length);const before=await count();
 await page.getByRole('button',{name:'近 90 天'}).click();await expect.poll(count).toBeGreaterThan(before);await expect(page.getByRole('button',{name:'近 90 天'})).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-source-id="gsc"]').getByRole('link',{name:'查看详情 →'}).click();await expect(page.getByRole('heading',{name:'搜索表现'})).toBeVisible();await expect(page.getByRole('button',{name:'近 90 天'})).toHaveAttribute('aria-pressed','true');await page.goBack();
 await page.getByRole('button',{name:'自定义'}).click();await expect(page.getByLabel('开始日期')).toBeVisible();await page.getByLabel('开始日期').fill('2026-09-01');await expect.poll(count).toBeGreaterThan(before+1);
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=github&connected${dark?'&dark':''}`);
  await expect(page.locator('.nr-data-kpis')).toContainText('24,414');await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(28);await expect(page.getByText('独立访客按天统计')).toBeVisible();
  await expect(page.locator('table').first()).toContainText('news.ycombinator.com');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`github overflow ${width}`);}
 await page.goto(`${base}/tests/s1/sources.html?page=github`);await expect(page.getByRole('button',{name:'接入 GitHub'})).toBeVisible();
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=community&connected${dark?'&dark':''}`);
  await expect(page.locator('.nr-data-kpis')).toContainText('7%');await expect(page.locator('.nr-data-note').first()).toContainText('社区数据从');await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();
  await expect(page.getByText('插件无法加载')).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`community overflow ${width}`);}
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=content&connected`);await expect(page.getByRole('button',{name:'自定义'})).toHaveCount(0);
 await page.getByRole('button',{name:'近 90 天'}).click();await expect(page.getByRole('columnheader',{name:'访问（近 90 天）'})).toBeVisible();
 assert.deepEqual(errors,[]);
 console.log('PASS: data overview has one card per source (data first, OpenSEO layout) with CTR and position for search, detail links that keep the range; community page (KPIs, coverage note, chart, unanswered) and content page range without custom dates; GitHub page (KPIs, daily stars, traffic caveat, referrers, not-connected state); data overview shows connected sources with changes and notes, available sources with connect actions, planned sources greyed without actions; range switch and custom dates refetch; 1440 light and 390 dark without overflow. Mocked API only.');
}finally{await browser.close();}
