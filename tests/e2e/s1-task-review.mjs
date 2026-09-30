import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// Isolated work detail fixture (apps/portal/tests/s1/task.html): mocked API responses, no auth, persistence or model calls.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const expected={scope:['1确认范围',['开始修改']],change:['2修改',[]],failed:['2修改',['重试']],review:['3审核',['通过','要求修改']],publish:['4发布',['记录已发布','导出内容']],observe:['5观察',['保存观察记录']]};
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]])for(const [step,[current,buttons]] of Object.entries(expected)){
  await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/task.html?step=${step}${dark?'&dark':''}`);
  await expect(page.locator('[aria-current=step]')).toHaveText(current,{timeout:15000});
  assert.deepEqual(await page.locator('.nr-step-panel button').allTextContents(),buttons,`${step} actions`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no overflow ${step} ${width}px`);
 }
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/task.html?step=scope`);
 await page.getByRole('button',{name:'开始修改'}).click();await expect(page.locator('[aria-current=step]')).toHaveText('2修改');
 assert.deepEqual(await page.evaluate(()=>window.__calls),['startSimple','startRun']);
 await page.getByRole('button',{name:'和 AI 讨论'}).click();await expect(page.locator('[data-slot=sheet-content]')).toBeVisible();
 assert.deepEqual(errors,[]);
 console.log('PASS: work detail shows one step with its own actions for scope/change/failed/review/publish/observe at 1440 light and 390 dark; start chains scope confirmation and run; discussion opens in a side panel. Mocked API only.');
}finally{await browser.close();}
