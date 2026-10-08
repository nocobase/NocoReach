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
 // 交给 Agent (2026-10-08): no button on the rows or at the top; ticking an issue floats a bar at the bottom with the count
 // and 交给 Agent, and ticked issues go out as one task.
 const bar=page.getByRole('toolbar',{name:'批量操作'}),hand=page.getByRole('toolbar',{name:'批量操作'}).getByRole('button',{name:'交给 Agent'});await expect(page.locator('[data-issue] button',{hasText:'交给 Agent'})).toHaveCount(0);await expect(page.locator('header').getByRole('button',{name:/交给 Agent/})).toHaveCount(0);await expect(bar).toHaveCount(0);
 await page.locator('[data-issue="broken"] [data-row-check]').click();await expect(bar).toContainText('1项已选');await page.locator('[data-issue="noDescription"] [data-row-check]').click();await expect(bar).toContainText('2项已选');
 const box=await bar.boundingBox();assert.ok(box&&box.y>700,'the bar floats at the bottom of the window');
 // The hand-off only creates the task (技术修复 suggested) and opens it; it starts there (2026-10-08).
 await hand.click();await expect(page.locator('#where')).toHaveText(/^\/actions\/9\d\d$/,{useInnerText:false});{const k=await page.evaluate(()=>window.__kw),h=k.handoffs.at(-1);assert.ok(h.title.includes('修复网站审计的 2 个问题：页面打不开、缺少描述'),h.title);assert.equal(h.playbookId,'tech-fix');assert.ok(!k.advances.includes('startTask'),'not started by the hand-off');}
 await page.goto(`${base}/tests/s1/sources.html?page=audit&connected`);
 await page.locator('[data-all-check]').click();await expect(bar).toContainText('4项已选');await bar.getByRole('button',{name:'取消选择'}).click();await expect(bar).toHaveCount(0);
 await page.getByRole('button',{name:'重新读取全部页面'}).click();await expect(page.getByText('会在接下来几小时里重新读取全部页面')).toBeVisible();assert.equal(await page.evaluate(()=>window.__audit.rechecked),1);
 // 性能检查: the site's home page by default, mobile; scores, metrics, failing checks with Chinese names; 交给 Agent as 技术修复.
 await page.goto(`${base}/tests/s1/sources.html?page=audit&connected`);const lh=page.locator('[data-lighthouse]');await expect(lh.getByLabel('要检查的网址')).toHaveValue('https://www.example.com/');
 await expect(lh.getByRole('button',{name:'手机'})).toHaveAttribute('aria-pressed','true');await lh.getByRole('button',{name:'检查'}).click();
 await expect(lh.locator('[data-score="performance"]')).toContainText('42');await expect(lh.locator('[data-score="seo"]')).toContainText('92');await expect(lh).toContainText('LCP 6.2 s');
 await expect(lh.locator('[data-issue-key="render-blocking-resources"]')).toContainText('减少阻塞渲染的资源');await expect(lh.locator('[data-issue-key="some-new-check"]')).toContainText('A check without a Chinese name');
 assert.equal((await page.evaluate(()=>window.__lh)).find(x=>x.action==='nrLighthouse:run').strategy,'mobile');await expect(lh.getByText('检查过的页面')).toBeVisible();
 await expect(lh.getByRole('button',{name:'交给 Agent'})).toHaveCount(0);await lh.locator('[data-row-check]').click();await page.getByRole('toolbar',{name:'批量操作'}).getByRole('button',{name:'交给 Agent'}).click();await expect(page.locator('#where')).toHaveText(/^\/actions\/9\d\d$/,{useInnerText:false});{const k=await page.evaluate(()=>window.__kw),h=k.handoffs.at(-1);assert.ok(h.title.includes('提升 www.example.com 的页面性能（手机）'),h.title);assert.equal(h.playbookId,'tech-fix');assert.ok(!k.advances.includes('startTask'),'not started by the hand-off');}
 await page.goto(`${base}/tests/s1/sources.html?page=audit&connected&nokeys`);await expect(page.locator('[data-lighthouse]')).toContainText('请先');
 await page.goto(`${base}/tests/s1/sources.html?page=audit`);await expect(page.getByRole('button',{name:'接入网站内容'})).toBeVisible();
 assert.deepEqual(errors,[]);
 console.log('PASS: 网站审计 (counts, issues by severity, affected pages with detail, ticked issues handed off together from the bar that floats at the bottom (count, select all, clear), re-read all, not-connected state; 性能检查 (Lighthouse: home page by default, mobile, scores, metrics, failing checks with Chinese names, recent checks, the result ticked and handed off as 技术修复, DataForSEO not connected); 1440 light and 390 dark without overflow). Mocked API only.');
}finally{await browser.close();}
