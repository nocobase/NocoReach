import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// Isolated playbook task fixture (apps/portal/tests/s1/task-detail.html): mocked API responses, no auth, persistence or model calls.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const expected={start:['开始前',['开始']],ai:['在线 AI 正在撰写',[]],review:['等你处理：审核',['直接编辑','接受，交给本机 Agent“新建文档页”']],plan:['等你处理：出方案',['记录并继续']],pr:['等你处理：审核 PR',['通过，去发布']],publish:['等你处理：确认发布',['确认已发布']],done:['已完成',[]]};
 for(const [width,height] of [[1440,900],[390,844]])for(const dark of [false,true]){await page.setViewportSize({width,height});
  for(const [state,[text,buttons]] of Object.entries(expected)){await page.goto(`${base}/tests/s1/task-detail.html?state=${state}${dark?'&dark=1':''}`);
   await expect(page.getByText(text).first()).toBeVisible();for(const b of buttons)await expect(page.getByRole('button',{name:b,exact:true})).toBeVisible();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no overflow: ${state} ${width}px`);}}
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/task-detail.html?state=review`);
 const accept=page.getByRole('button',{name:/^接受/});await expect(accept).toBeDisabled();await page.getByLabel('引用的数据与事实准确').check();await page.getByLabel('接着做').selectOption('blog-post');await accept.click();
 await page.getByLabel('给执行者的话').fill('加一节截图说明');await page.getByRole('button',{name:'发送并要求修改'}).click();
 const calls=await page.evaluate(()=>window.__calls.map(c=>[c.command,c.stageKey,c.next||c.comment||'']));
 assert.deepEqual(calls,[['approveStage','accept','blog-post'],['requestStageChanges','accept','加一节截图说明']]);
 await page.goto(`${base}/tests/s1/task-detail.html?state=start`);await page.getByRole('button',{name:'开始',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.__calls.map(c=>[c.command,c.playbookId])),[['startTask','new-doc']]);
 await page.goto(`${base}/tests/s1/task-detail.html?page=insights`);await expect(page.getByText('等你处理 2')).toBeVisible();
 assert.deepEqual(errors,[]);
 console.log('PASS: playbook task states (start, AI running, review with hand-over, Agent plan, PR review, publish, done), request payloads, 洞察 waiting list, 1440/390 light/dark');
}finally{await browser.close();}
