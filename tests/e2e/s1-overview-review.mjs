import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// Isolated overview fixture (apps/portal/tests/s1/overview.html): synthetic data, no auth, API or model calls.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){
  await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/overview.html${dark?'?dark':''}`);
  const tiles=page.getByRole('region',{name:'网站表现摘要'}).locator('.nr-metric');await expect(tiles).toHaveCount(4);
  await expect(tiles.nth(0)).toContainText('+12.2% 较前 28 天');await expect(tiles.nth(1)).toContainText('前期数据不完整，不计算变化');await expect(tiles.nth(3)).toContainText('暂无数据');
  await expect(page.getByRole('heading',{name:'今天值得做的 3 件事'})).toBeVisible();await expect(page.locator('.nr-suggestion')).toHaveCount(3);
  await expect(page.locator('[data-opportunity-id="c"]')).toHaveCount(0);await expect(page.getByRole('button',{name:'开始优化'})).toHaveCount(3);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no page overflow at ${width}px`);
 }
 const row=page.locator('[data-opportunity-id="a"]');const status=page.getByRole('status');
 await row.getByRole('button',{name:'开始优化'}).click();await expect(status).toHaveText('convert a');
 const menu=async()=>row.getByRole('button',{name:/更多操作$/}).click();
 await menu();await page.getByRole('menuitem',{name:'查看依据'}).click();await expect(row.locator('.nr-suggestion-evidence')).toContainText('GSC 28 天');
 await menu();await page.getByRole('menuitem',{name:'稍后再看'}).click();await expect(status).toHaveText('review a {"status":"snoozed"}');
 await menu();await page.getByRole('menuitem',{name:'忽略'}).click();await expect(status).toHaveText('review a {"status":"ignored"}');
 assert.deepEqual(errors,[]);
 console.log('PASS: overview summary tiles, at most five supported suggestions, start/evidence/snooze/ignore actions, 1440 light and 390 dark without overflow. Synthetic data only.');
}finally{await browser.close();}
