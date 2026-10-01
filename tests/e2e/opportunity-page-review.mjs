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
 await expect(page.getByRole('button',{name:'待处理 3'})).toBeVisible();await expect(page.getByRole('button',{name:'已转为任务 1'})).toBeVisible();await expect(page.getByRole('button',{name:'已归档 2'})).toBeVisible();
 // List: action title, one-line reason, the coloured fact and the source tags.
 await expect(list).toHaveCount(3);const first=list.first();
 await expect(first).toContainText('给 docker compose 文档补命令示例');await expect(first).toContainText('曝光 5,848，正文只有 92 字');
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
 await expect(page.getByRole('button',{name:'待处理 2'})).toBeVisible();await expect(page.getByRole('button',{name:'已转为任务 2'})).toBeVisible();
 await page.getByRole('button',{name:'查看任务'}).click();await expect(page.locator('#where')).toHaveText('/actions/21');
 // Ignore, archive and restore.
 await open();await list.nth(2).click();await detail.getByRole('button',{name:'忽略'}).click();await expect.poll(async()=>(await calls()).at(-1)?.status).toBe('ignored');
 await page.getByRole('button',{name:'已归档 2'}).click();await expect(list.filter({hasText:'已过期'})).toHaveCount(1);await expect(list.filter({hasText:'已忽略'})).toHaveCount(1);
 await list.filter({hasText:'已过期'}).click();await expect(detail).toContainText('已过期');await detail.getByRole('button',{name:'恢复到待处理'}).click();await expect.poll(async()=>(await calls()).at(-1)?.status).toBe('pending');
 await page.getByRole('button',{name:'已转为任务 1'}).click();await expect(detail.getByRole('button',{name:'打开任务'})).toBeVisible();
 // A start that does not go through leaves an unstarted task and says so.
 await open('?startFail=1');await detail.getByRole('button',{name:'交给 Agent'}).click();await expect(page.getByRole('status').filter({hasText:'任务已建好，但没能开始'})).toBeVisible();await expect(page.getByRole('button',{name:'查看任务'})).toBeVisible();
 // 390 dark: no page overflow.
 await page.setViewportSize({width:390,height:844});await open('?dark=1');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow at 390');
 if(shots)await page.screenshot({path:`${shots}/opp-390-dark.png`,fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS 机会: tabs and counts; list rows with action title, reason, coloured fact and source tags (no search); detail with 数据变化/建议做法/交给谁做 and the 做法 steps, label by executor; 交给 Agent creates, reads and starts the task with the chosen 做法 and stays with a link; failed start says so; ignore, archive tags, restore, open task; 1440 light and 390 dark without overflow. Mocked API only.');
}finally{await browser.close();}
