import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// Isolated playbook task fixture (apps/portal/tests/s1/task-detail.html): mocked API responses, no auth, persistence or model calls.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const expected={start:['开始前',['开始']],ai:['在线 AI 正在撰写',[]],review:['看完后通过',['直接编辑','要求修改','接受，交给本机 Agent“新建文档页”']],plan:['这一步由本机 Agent 完成',['我自己完成','交给本机 Agent']],'plan-review':['看完后通过',['通过，交给本机 Agent','要求修改','展开阅读']],'agent-queued':['等本机 Agent 领取',['查看电脑','停止']],'agent-running':['本机 Agent 正在修改并开 PR',['停止']],'agent-failed':['上次运行',['重试','我自己完成']],pr:['改好了并开了 PR',['通过，去发布','要求修改']],publish:['合并并上线后在这里确认',['确认已发布']],done:['已完成',[]]};
 for(const [width,height] of [[1440,900],[390,844]])for(const dark of [false,true]){await page.setViewportSize({width,height});
  for(const [state,[text,buttons]] of Object.entries(expected)){await page.goto(`${base}/tests/s1/task-detail.html?state=${state}${dark?'&dark=1':''}`);
   await expect(page.getByText(text).first()).toBeVisible();for(const b of buttons)await expect(page.getByRole('button',{name:b,exact:true})).toBeVisible();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no overflow: ${state} ${width}px`);}}
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/task-detail.html?state=review`);
 const accept=page.getByRole('button',{name:/^接受/});await expect(accept).toBeDisabled();await page.getByLabel('引用的数据与事实准确').check();await page.getByLabel('接着做').selectOption('blog-post');await accept.click();
 await page.getByLabel('给执行者的话').fill('加一节截图说明');await page.getByRole('button',{name:'发送并要求修改'}).click();
 const calls=await page.evaluate(()=>window.__calls.map(c=>[c.command,c.stageKey,c.next||c.comment||'']));
 assert.deepEqual(calls,[['approveStage','accept','blog-post'],['requestStageChanges','accept','加一节截图说明']]);
 await page.goto(`${base}/tests/s1/task-detail.html?state=plan-review`);await page.evaluate(()=>{window.__calls=[];});
 await page.getByRole('button',{name:'展开阅读'}).click();const reader=page.getByRole('dialog');await expect(reader.locator('table')).toBeVisible();await expect(reader.getByRole('heading',{name:'三、验证'})).toBeVisible();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'要求修改',exact:true}).click();await expect(page.getByLabel('给执行者的话')).toBeFocused();
 await page.getByLabel('负责人').selectOption('2');await expect(page.getByLabel('负责人')).toHaveValue('2');
 await page.getByRole('button',{name:'添加',exact:true}).click();await page.getByRole('menuitemcheckbox',{name:'Chen'}).click();await page.keyboard.press('Escape');await expect(page.getByLabel('任务属性')).toContainText('Chen');
 await page.getByLabel('搜索页面').fill('商业');await page.getByRole('button',{name:/商业服务/}).click();await expect(page.getByLabel('任务属性').getByRole('link',{name:/商业服务/})).toBeVisible();
 await expect(page.getByText('关联了页面“商业服务”')).toBeVisible();
 assert.deepEqual(await page.evaluate(()=>window.__calls.map(c=>[c.command,c.userId||(c.userIds||[]).join(',')||c.url||''])),[['setOwner','2'],['setCollaborators','3'],['linkPage','https://www.nocobase.com/cn/commercial']]);
 await page.goto(`${base}/tests/s1/task-detail.html?state=start`);await page.getByRole('button',{name:'开始',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.__calls.map(c=>[c.command,c.playbookId])),[['startTask','new-doc']]);
 await page.goto(`${base}/tests/s1/task-detail.html?page=agents`);const list=page.getByRole('region',{name:'电脑'});await expect(list.locator('.nr-computer')).toHaveCount(2);await expect(list.locator('.nr-computer').first()).toContainText('在线');await expect(list.locator('.nr-computer').first()).toContainText('Claude Code');
 await expect(list.locator('.nr-computer').nth(1)).toContainText('尚未连上');await expect(list.locator('.nr-computer').nth(1).getByRole('button',{name:'删除'})).toBeVisible();await expect(page.getByText('允许修改的目录')).toHaveCount(0);
 await page.getByRole('button',{name:'添加电脑'}).first().click();const dlg=page.getByRole('dialog');await dlg.getByRole('button',{name:'生成连接命令'}).click();await expect(dlg.getByLabel('连接命令')).toContainText('cli.js login');await expect(dlg).toContainText('等待连接');
 await expect(dlg).toContainText('已连上',{timeout:10000});await dlg.getByRole('button',{name:'完成'}).click();await expect(list.locator('.nr-computer')).toHaveCount(3);
 await page.goto(`${base}/tests/s1/task-detail.html?page=agents&empty=1`);await expect(page.getByText('还没有添加电脑')).toBeVisible();
 await page.goto(`${base}/tests/s1/task-detail.html?page=insights`);await expect(page.getByText('等你处理 2')).toBeVisible();
 assert.deepEqual(errors,[]);
 console.log('PASS: playbook task states (start, AI running, review with hand-over, Agent plan, plan review with reading window, queued, running, failed, PR review, publish, done), owner/collaborators/page link, 要求修改 focuses the composer, Agent page (computers with tools, never-connected, add-computer three steps, empty), request payloads, 洞察 waiting list, 1440/390 light/dark');
}finally{await browser.close();}
