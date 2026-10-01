import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// Isolated 机会 page (apps/portal/tests/s1/opportunities.html): mocked API, no auth or network.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320',shots=process.env.NR_SHOTS;
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls=()=>page.evaluate(()=>window.__calls),open=async(q='')=>{await page.goto(`${base}/tests/s1/opportunities.html${q}`);await expect(page.getByRole('heading',{name:'机会',exact:true})).toBeVisible();};
 const list=page.locator('.grid > div').first().locator(':scope > button'),detail=page.getByRole('region',{name:'机会详情'});
 await open();
 await expect(page.getByRole('button',{name:'待处理 3'})).toBeVisible();await expect(page.getByRole('button',{name:'全部 6'})).toBeVisible();await expect(page.getByRole('button',{name:/^已转为任务|^已归档/})).toHaveCount(0);
 // List: action title, one-line reason, the coloured fact and the source tags.
 await expect(list).toHaveCount(3);const first=list.first();
 await expect(first).toContainText('O-5 给 docker compose 文档补命令示例');await expect(detail.getByRole('heading',{level:2})).toContainText('O-5');await expect(first).toContainText('曝光 5,848，正文只有 92 字');
 await expect(first.locator('[data-slot=tag][data-tone=amber]')).toHaveText('正文 92 字');await expect(first.locator('[data-slot=tag][data-tone=grey]')).toHaveText('网站内容');
 const third=list.nth(2);await expect(third).toContainText('近 28 天曝光 956,147');await expect(third.locator('[data-slot=tag][data-tone=green]')).toHaveText('↑ 18%');
 assert.equal(await page.getByRole('searchbox').count()+await page.getByPlaceholder('搜索机会').count(),0,'no search box');
 // Detail: what changed, what to do, who does it; no paragraphs of reasoning.
 for(const t of ['数据变化','建议做法','交给谁做'])await expect(detail.getByRole('heading',{name:t})).toBeVisible();
 await expect(detail).not.toContainText('为什么值得做');await expect(detail).not.toContainText('转为任务后');await expect(detail).not.toContainText('上升 +18');
 await expect(detail.getByLabel('做法')).toHaveValue('optimize-page');
 const steps=detail.getByRole('list',{name:'步骤'});await expect(steps).toContainText('本机 Agent 出方案');await expect(steps.locator('[data-tone=violet]').first()).toHaveText('你看方案');await expect(steps).toContainText('你看效果并发布');
 await expect(detail.getByRole('button',{name:'交给 Agent'})).toBeVisible();await expect(detail).toContainText('Agent 先改好，你看过效果才会发布');await expect(detail).toContainText('限制：');
 await list.nth(1).click();await expect(detail.getByLabel('做法')).toHaveValue('content-outline');await expect(detail.getByRole('button',{name:'交给 AI'})).toBeVisible();await expect(steps).toContainText('在线 AI 撰写');await expect(detail).toContainText('AI 写好后由你审核');
 if(shots)await page.screenshot({path:`${shots}/opp-1440-light.png`});
 // 交给 Agent: create the task, read it, start it with the chosen 做法; the page stays with a link to the task.
 await detail.getByLabel('做法').selectOption('optimize-page');await expect(detail.getByRole('button',{name:'交给 Agent'})).toBeVisible();
 await detail.getByRole('button',{name:'交给 Agent'}).click();
 await expect(page.getByRole('status').filter({hasText:'已交给 Agent：写 Block 显隐的使用文档'})).toBeVisible();
 const c=await calls();assert.deepEqual(c.map(x=>x.url),['nrStrategy:confirmDirection','nrTaskWork:get','nrTaskWork:advance']);
 assert.equal(c[0].insightId,'block');assert.equal(c[1].taskId,'21');assert.equal(c[2].command,'startTask');assert.equal(c[2].playbookId,'optimize-page');assert.equal(c[2].revision,7);
 await expect(page.getByRole('button',{name:'待处理 2'})).toBeVisible();await expect(page.getByRole('button',{name:'全部 6'})).toBeVisible();
 await page.getByRole('button',{name:'查看任务'}).click();await expect(page.locator('#where')).toHaveText('/actions/21');
 // Ignore, archive and restore.
 await open();await list.nth(2).click();await detail.getByRole('button',{name:'忽略'}).click();await expect.poll(async()=>(await calls()).at(-1)?.status).toBe('ignored');
 // 全部: every opportunity as one full-width table, newest number first, with where each went; no side panel.
 await open();await page.getByRole('button',{name:'全部 6'}).click();const all=page.getByRole('table',{name:'全部机会'}),trs=all.locator('tbody tr');
 await expect(trs).toHaveCount(6);assert.deepEqual(await trs.locator('td:first-child').allTextContents(),['O-6','O-5','O-4','O-3','O-2','O-1']);await expect(detail).toHaveCount(0);
 await expect(trs.filter({hasText:'O-3'}).locator('[data-slot=tag][data-tone=blue]')).toHaveText('已交给 Agent · T-12');await expect(trs.filter({hasText:'O-2'})).toContainText('已忽略');await expect(trs.filter({hasText:'O-1'})).toContainText('已过期');await expect(trs.filter({hasText:'O-5'}).locator('[data-slot=tag][data-tone=amber]')).toHaveText('待处理');
 await page.getByLabel('搜索机会').fill('o-4');await expect(trs).toHaveCount(1);await expect(trs).toContainText('写 Block 显隐的使用文档');await page.getByLabel('搜索机会').fill('');
 await page.getByLabel('按去向筛选').selectOption('ignored');await expect(trs).toHaveCount(1);await page.getByLabel('按去向筛选').selectOption('');
 // A row goes where the opportunity is: 待处理 opens there, a handed-off one its task, an archived one slides in its detail.
 await trs.filter({hasText:'O-4'}).click();await expect(page.getByRole('button',{name:'待处理 3'})).toHaveAttribute('aria-pressed','true');await expect(list.nth(1)).toHaveAttribute('aria-current','true');await expect(detail.getByRole('heading',{level:2})).toContainText('写 Block 显隐的使用文档');
 await page.getByRole('button',{name:'全部 6'}).click();await trs.filter({hasText:'O-1'}).click();const sheet=page.getByRole('dialog');await expect(sheet.getByRole('region',{name:'机会详情'})).toContainText('已过期');
 await sheet.getByRole('button',{name:'恢复到待处理'}).click();await expect.poll(async()=>(await calls()).at(-1)?.status).toBe('pending');await expect(sheet).toHaveCount(0);
 await trs.filter({hasText:'O-2'}).getByRole('button',{name:'恢复'}).click();await expect.poll(async()=>(await calls()).at(-1)?.insightId).toBe('old2');
 await trs.filter({hasText:'O-3'}).click();await expect(page.locator('#where')).toHaveText('/actions/12');
 // A link to a handed-off opportunity (as from the task page's “来自 O-3”) shows its detail with the way to the task.
 await open('?q=item%3Ddone1');await expect(page.getByRole('dialog').getByRole('button',{name:'打开任务 T-12'})).toBeVisible();
 // A start that does not go through leaves an unstarted task and says so.
 await open('?startFail=1');await detail.getByRole('button',{name:'交给 Agent'}).click();await expect(page.getByRole('status').filter({hasText:'任务已建好，但没能开始'})).toBeVisible();await expect(page.getByRole('button',{name:'查看任务'})).toBeVisible();
 // 390 dark: no page overflow.
 await page.setViewportSize({width:390,height:844});await open('?dark=1');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow at 390');
 if(shots)await page.screenshot({path:`${shots}/opp-390-dark.png`,fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS 机会: tabs and counts; list rows with action title, reason, coloured fact and source tags (no search); detail with 数据变化/建议做法/交给谁做 and the 做法 steps, label by executor; 交给 Agent creates, reads and starts the task with the chosen 做法 and stays with a link; failed start says so; ignore; 全部 as a full-width table with numbers and where each went, search by number, filter, rows open 待处理 / the task / a detail drawer, restore from the drawer or the row, a linked handed-off opportunity in the drawer; 1440 light and 390 dark without overflow. Mocked API only.');
}finally{await browser.close();}
