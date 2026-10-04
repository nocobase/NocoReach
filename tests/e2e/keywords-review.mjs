import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// Isolated 关键词研究 and 关键词 (apps/portal/tests/s1/sources.html?page=research|keywords): mocked API, no auth, network or paid query.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage({acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const kw=()=>page.evaluate(()=>window.__kw);
 await page.setViewportSize({width:1440,height:900});
 await page.goto(`${base}/tests/s1/sources.html?page=research&connected&nokeys`);await expect(page.getByRole('button',{name:'去数据接入'})).toBeVisible();
 // 找新词 (the research tab of 关键词): search, no cost text, 本站排名, filters, save, export, details with search results.
 await page.goto(`${base}/tests/s1/sources.html?page=research&connected`);await expect(page.getByRole('heading',{name:'关键词',exact:true})).toBeVisible();await expect(page.getByRole('tab',{name:'找新词'})).toHaveAttribute('aria-selected','true');await expect(page.getByText('还没有研究过关键词')).toBeVisible();
 await page.getByLabel('关键词',{exact:true}).fill('open source crm');await page.getByRole('button',{name:'查询'}).click();
 await expect(page.getByText('共 120 个关键词')).toBeVisible();await expect(page.locator('[data-overview="open source crm"]')).toContainText('12.4');
 assert.equal(await page.getByText(/约 \$|预计|费用/).count(),0,'no per-query cost on the page');
 const call=(await kw()).calls[0];assert.equal(call.view,'suggestions');assert.equal(call.locationCode,2840);assert.equal(call.confirmCost,undefined);
 await expect(page.locator('tbody tr').nth(1)).toContainText('8.6');
 await page.getByRole('button',{name:'筛选'}).click();await page.getByLabel('包含',{exact:true}).fill('pricing');await expect(page.getByText('显示 24 个，共 120 个')).toBeVisible();
 await page.getByRole('button',{name:'全部清除'}).click();await expect(page.getByText('共 120 个关键词')).toBeVisible();
 await page.locator('tbody tr').nth(1).getByRole('checkbox').click();await page.locator('tbody tr').nth(2).getByRole('checkbox').click();
 await page.getByRole('button',{name:'保存为关键词'}).click();await expect(page.getByText('已保存 2 个关键词')).toBeVisible();assert.equal((await kw()).saved.length,2);
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'导出 CSV'}).click()]);assert.equal((await readFile(await download.path(),'utf8')).split('\n').length,121);
 await page.locator('tbody tr').nth(1).locator('td').nth(1).click();await expect(page.getByRole('heading',{name:'本站排名'})).toBeVisible();await expect(page.getByText('近 28 天平均排第 8.6 位')).toBeVisible();
 await page.getByRole('button',{name:'看前 10 个搜索结果'}).click();await expect(page.getByText('Best open source CRM 2026')).toBeVisible();await expect(page.locator('a[href^="javascript"]')).toHaveCount(0);
 assert.equal((await kw()).calls.at(-1).view,'serp');await page.getByRole('button',{name:'关闭详情'}).click();
 // The same conditions within 30 days open the saved result.
 await page.evaluate(()=>{const k=window.__kw;k.runs.find(r=>r.spec.view==='suggestions').createdAt='2026-09-20T08:00:00.000Z';});
 await page.getByRole('button',{name:'查询'}).click();await expect(page.getByText('的结果，没有再收费')).toBeVisible();const before=(await kw()).runs.length;
 await page.getByRole('button',{name:'重新查询'}).click();await expect.poll(async()=>(await kw()).runs.length).toBe(before+1);
 await page.getByLabel('关键词',{exact:true}).fill('budget test');await page.getByRole('button',{name:'查询'}).click();await expect(page.getByRole('alert')).toContainText('预算已用完');
 await page.getByRole('button',{name:'最近的研究'}).click();await expect(page.getByRole('heading',{name:'最近的研究'})).toBeVisible();await page.getByRole('button',{name:/open source crm/}).first().click();await expect(page.getByText('共 120 个关键词')).toBeVisible();
 // 关键词: 本站排名, tags, 交给 Agent, delete.
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){
  await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=keywords&connected&saved${dark?'&dark&density=default':''}`);
  await expect(page.getByText('共 3 个关键词')).toBeVisible();await expect(page.locator('tbody tr').filter({hasText:'crm for teams'})).toContainText('搜索表现');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);
 }
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=keywords&connected&saved`);
 await expect(page.locator('tbody tr').filter({hasText:'open source crm'})).toContainText('12.4');await expect(page.locator('tbody tr').filter({hasText:'crm for teams'})).toContainText('8.6');
 await page.getByRole('group',{name:'按标签筛选'}).getByRole('button',{name:'选题'}).click();await expect(page.getByText('显示 1 个，共 3 个')).toBeVisible();await page.getByRole('group',{name:'按标签筛选'}).getByRole('button',{name:'选题'}).click();
 const row=t=>page.locator('tbody tr').filter({hasText:t});
 await row('crm for nonprofits').getByRole('checkbox').click();await page.getByRole('button',{name:'交给 Agent'}).click();
 await expect(page.getByRole('combobox',{name:'做法'})).toContainText('内容选题与大纲');await page.getByRole('button',{name:'取消'}).click();
 await row('open source crm').getByRole('checkbox').click();await page.getByRole('button',{name:'交给 Agent'}).click();
 await expect(page.getByRole('combobox',{name:'做法'})).toContainText('优化现有页面');await expect(page.getByText('关联页面：https://example.com/blog/open-source-crm')).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'交给 Agent'}).click();await expect(page.locator('#where')).toHaveText(/^\/actions\/9\d\d$/,{useInnerText:false});
 let k=await kw();assert.equal(k.handoffs.length,1);assert.ok(k.handoffs[0].title.includes('等 2 个关键词'));assert.ok(k.handoffs[0].brief.includes('crm for nonprofits'));assert.deepEqual(k.advances,['linkPage','startTask']);
 await page.goto(`${base}/tests/s1/sources.html?page=keywords&connected&saved`);
 await row('crm for nonprofits').getByRole('checkbox').click();await page.getByRole('button',{name:'标签',exact:true}).click();
 await page.getByLabel('搜索或新建标签').fill('对比');await page.getByLabel('搜索或新建标签').press('Enter');await page.getByRole('dialog').getByRole('button',{name:'保存'}).click();
 await expect(row('crm for nonprofits')).toContainText('对比');
 await page.getByRole('button',{name:'管理标签'}).click();await page.getByLabel('标签 选题 的名字').fill('选题A');await page.locator('[data-tag="选题"]').getByRole('button',{name:'保存'}).click();
 await expect(page.locator('[data-tag="选题A"]')).toBeVisible();
 await page.getByRole('button',{name:'删除标签 对比'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'删除'}).click();await expect(page.locator('[data-tag="对比"]')).toHaveCount(0);await page.getByRole('button',{name:'完成'}).click();
 await expect(page.getByRole('group',{name:'按标签筛选'})).toContainText('选题A');await expect(page.getByRole('group',{name:'按标签筛选'})).not.toContainText('对比');await expect(row('crm for nonprofits')).not.toContainText('对比');
 // 排名跟踪: start from 已保存 (market asked only for keywords without one), weekly table, check now, stop.
 await row('crm for teams').getByRole('checkbox').click();await row('open source crm').getByRole('checkbox').click();await page.getByRole('button',{name:'开始跟踪'}).click();
 await expect(page.getByRole('dialog')).toContainText('每周查一次');await expect(page.getByRole('combobox',{name:'跟踪市场'})).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'开始跟踪'}).click();
 await expect(page.getByRole('tab',{name:'排名跟踪'})).toHaveAttribute('aria-selected','true');const tracked=page.locator('tbody tr').filter({hasText:'open source crm'});
 await expect(tracked).toContainText('9');await expect(tracked).toContainText('▲ 5');await expect(page.locator('tbody tr').filter({hasText:'crm for teams'})).toContainText('100 名外');
 await page.getByRole('button',{name:'立即检查'}).click();await expect(page.getByText('已检查 2 个关键词')).toBeVisible();
 await tracked.locator('td').nth(1).click();await expect(page.getByRole('dialog')).toContainText('每周检查');await page.getByRole('button',{name:'关闭详情'}).click();
 await page.locator('tbody tr').filter({hasText:'crm for teams'}).getByRole('checkbox').click();await page.getByRole('button',{name:'停止跟踪'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'停止跟踪'}).click();await expect(page.locator('tbody tr').filter({hasText:'crm for teams'})).toHaveCount(0);
 await page.getByRole('tab',{name:/已保存/}).click();
 await row('crm for teams').getByRole('checkbox').click();await page.getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'删除'}).click();await expect(page.getByText('共 2 个关键词')).toBeVisible();
 // Nothing saved: AI 建议 opens first and suggests by itself — groups, why, the site's rank, the page, volume when looked up.
 await page.goto(`${base}/tests/s1/sources.html?page=keywords&connected`);await expect(page.getByRole('tab',{name:'AI 建议'})).toHaveAttribute('aria-selected','true');
 await expect(page.getByText('AI 正在读官网')).toBeVisible();await expect(page.locator('tbody tr')).toHaveCount(4);await expect(page.locator('[data-suggest-basis]')).toContainText('根据官网 86 个页面、项目记忆、Search Console 的 60 个查询、3 个竞品生成');
 const k1=page.locator('tbody tr').filter({hasText:'open source no-code platform'});await expect(k1).toContainText('官网首屏就是这个说法');await expect(k1).toContainText('9.2');await expect(k1).toContainText('2,400');
 await expect(page.locator('tbody tr').filter({hasText:'retool alternative'})).toContainText('需要新页面');await expect(page.locator('tbody tr').filter({hasText:'retool alternative'})).toContainText('商业');
 await page.getByRole('tab',{name:/^对比与替代词/}).click();await expect(page.locator('tbody tr')).toHaveCount(1);await page.getByRole('tab',{name:/^全部/}).click();
 if(process.env.NR_SHOTS){await page.waitForTimeout(300);await page.screenshot({path:`${process.env.NR_SHOTS}/keywords-suggest.png`,fullPage:true});}
 await k1.getByRole('checkbox').click();await page.locator('tbody tr').filter({hasText:'how to build a crm'}).getByRole('checkbox').click();await page.getByRole('button',{name:'保存'}).click();await expect(page.getByText('已保存 2 个')).toBeVisible();
 await expect(page.getByRole('tab',{name:'已保存 (2)'})).toBeVisible();await page.getByRole('tab',{name:'已保存 (2)'}).click();await expect(page.locator('tbody tr').filter({hasText:'how to build a crm'})).toContainText('AI 建议');
 await page.getByRole('tab',{name:'AI 建议'}).click();await expect(page.locator('tbody tr')).toHaveCount(4);await page.getByRole('button',{name:'重新建议'}).click();await expect(page.locator('tbody tr')).toHaveCount(4);
 await page.getByLabel('目标市场').selectOption('2276|de');await expect.poll(()=>page.evaluate(()=>window.__ksCalls.filter(c=>c.action==='suggest').map(c=>[c.force||false,c.market?.language||''])),{timeout:5000}).toEqual([[false,''],[true,''],[false,'de']]);
 // without an online AI: said, with the way to type keywords
 await page.goto(`${base}/tests/s1/sources.html?page=keywords&connected&noai`);await expect(page.getByText('还没有接入在线 AI')).toBeVisible();
 await page.goto(`${base}/tests/s1/sources.html?page=keywords&connected&tab=saved`);await expect(page.getByText('还没有保存关键词')).toBeVisible();await page.getByRole('button',{name:'看 AI 建议'}).click();await expect(page.getByRole('tab',{name:'AI 建议'})).toHaveAttribute('aria-selected','true');
 // 搜索表现 → 关键词; 数据接入 shows spending instead of per-query prices.
 await page.goto(`${base}/tests/s1/sources.html?page=search&connected`);await page.locator('tbody tr').nth(1).getByRole('checkbox').click();await page.getByRole('button',{name:'保存为关键词'}).click();await expect(page.getByText('已保存 1 个关键词')).toBeVisible();
 await page.goto(`${base}/tests/s1/sources.html?connected&source=keywords`);await expect(page.locator('[data-spend]')).toContainText('$0.31');await expect(page.locator('[data-spend]')).toContainText('$1.24');await expect(page.locator('[data-spend]')).toContainText('结果不确定 1 次');
 assert.deepEqual(errors,[]);
 console.log('PASS: AI 建议 (opens first with nothing saved, suggests by itself, groups, site rank and page, volume, save to 已保存, 重新建议, another market, no online AI); 找新词 tab of 关键词 (not connected state, search without per-query cost, 本站排名, filters, save, CSV, details with search results, 30-day reuse and re-query, budget stop, recent research); 关键词 (本站排名 and page, Search Console saves without market, tag filter, add/rename/delete tags, 排名跟踪 (start from 已保存, weekly table with change and pages, check now, details, stop), 交给 Agent as one task with 做法 by ranking and linked page, delete, empty state, 1440 light and 390 dark without overflow); 搜索表现 saves to 关键词; 数据接入 shows DataForSEO spending. Mocked API only.');
}finally{await browser.close();}
