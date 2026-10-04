import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// Isolated 搜索表现 (apps/portal/tests/s1/sources.html?page=search): mocked API, no auth or network.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage({acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));const note=async(text,label='数据说明')=>{await page.getByRole('button',{name:label}).first().click();await expect(page.locator('[data-info-content]')).toContainText(text);await page.keyboard.press('Escape');await expect(page.locator('[data-info-content]')).toHaveCount(0);};
 for(const [width,height,dark,density] of [[1440,900,false,''],[390,844,true,'&density=default']]){
  await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=search&connected${dark?'&dark':''}${density}`);
  for(const [label,value] of [['点击','12,480'],['曝光','956,147'],['点击率','1.3%'],['平均排名','12.4']])await expect(page.locator(`[data-metric="${label}"]`)).toContainText(value);
  await expect(page.locator('[data-metric="平均排名"]')).toContainText('▲ 0.7');await expect(page.locator('[data-metric="点击率"] .nr-down')).toBeVisible();
  await expect(page.locator('.recharts-area').first()).toBeVisible();await expect(page.getByRole('tab',{name:'接近首页 (60)'})).toBeVisible();
  await expect(page.getByText('第 1–25 行，共 60 行')).toBeVisible();
  await note('09-28 至 09-29 是初步数据','图怎么看');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);
 }
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=search&connected`);
 await page.getByRole('button',{name:'下一页'}).click();await expect(page.getByText('第 26–50 行，共 60 行')).toBeVisible();await page.getByRole('button',{name:'上一页'}).click();
 const rows=page.locator('tbody tr');await rows.nth(0).getByRole('checkbox').click();await rows.nth(1).getByRole('checkbox').click();
 await expect(page.getByRole('toolbar',{name:'批量操作'})).toContainText('2');await expect(page.getByRole('button',{name:'复制关键词'})).toBeVisible();
 await page.getByRole('button',{name:'取消选择'}).click();await expect(page.getByRole('toolbar',{name:'批量操作'})).toHaveCount(0);
 // Export: whole tab, formula-looking queries neutralised.
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'导出 CSV'}).click()]);
 const csv=await readFile(await download.path(),'utf8');assert.ok(download.suggestedFilename().startsWith('搜索表现-接近首页-'));assert.equal(csv.split('\n').length,61);assert.ok(csv.includes(`"'=cmd|calc"`),'formula escaped');
 await page.getByRole('button',{name:'曝光',exact:true}).click();await expect(page.getByRole('heading',{name:'每日曝光'})).toBeVisible();
 // Filters apply to the totals and the tables.
 await page.getByRole('button',{name:'筛选'}).click();await page.getByLabel('查询筛选').fill('keyword 1');await page.getByRole('button',{name:'应用筛选'}).click();
 await expect(page.locator('[data-metric="点击"]')).toContainText('1,248');await expect(page.getByRole('tab',{name:'接近首页 (11)'})).toBeVisible();await note('不含 Google 匿名处理的查询');
 await page.getByRole('button',{name:'全部清除'}).click();await expect(page.getByRole('tab',{name:'接近首页 (60)'})).toBeVisible();
 await page.getByRole('tab',{name:'查询'}).click();await expect(page.getByText('共 140 个查询，这里列出点击最多的 100 个')).toBeVisible();await expect(page.getByRole('columnheader',{name:'点击率'})).toBeVisible();
 await page.getByRole('tab',{name:'页面'}).click();await expect(page.locator('tbody a')).toHaveCount(1);await expect(page.locator('a[href^="javascript"]')).toHaveCount(0);
 await page.getByRole('button',{name:'近 90 天'}).click();await note('查询和页面明细只有所选时间里的 60 天');
 // Country: names in Chinese with clicks; choosing one reads that country (live) and says so.
 await page.getByRole('combobox',{name:'国家'}).click();await expect(page.getByRole('option',{name:/美国/})).toContainText('5,000 次点击');await expect(page.getByRole('option',{name:/未知地区/})).toBeVisible();
 await page.getByRole('option',{name:/中国/}).click();await expect(page.locator('[data-metric="点击"]')).toContainText('6,240');await note('只看中国：直接从 Search Console 读取');
 await page.getByRole('combobox',{name:'国家'}).click();await page.getByRole('option',{name:'全部国家'}).click();await expect(page.locator('[data-metric="点击"]')).toContainText('12,480');
 await page.goto(`${base}/tests/s1/sources.html?page=search`);await expect(page.getByRole('button',{name:'接入 Search Console'})).toBeVisible();
 assert.deepEqual(errors,[]);
 // Opened again after a reload: the last report shows at once (kept in this tab) while a slow server answers.
 await page.goto(`${base}/tests/s1/sources.html?page=search&connected&slow`);await expect(page.locator('[data-metric="点击"]')).toContainText('12,480',{timeout:8000});
 await page.reload();await expect(page.locator('[data-metric="点击"]')).toContainText('12,480',{timeout:1200});
 console.log('PASS: 搜索表现 (shown at once after a reload) shows four totals with changes (position inverted), trend with metric switch, striking-distance table with paging, selection bar and CSV export (formula-safe); filters change totals and tables and can be cleared; queries tab notes truncation; unsafe page URLs are not links; range switch notes partial detail coverage; country menu (Chinese names, clicks) switches to that country and back; not-connected state; 1440 light compact and 390 dark comfortable without overflow. Mocked API only.');
}finally{await browser.close();}
