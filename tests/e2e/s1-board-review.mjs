import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1440,390])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1000});await page.goto(`http://127.0.0.1:14320/tests/s1/?${dark?'dark':''}`);
  const todo=page.getByRole('region',{name:'待处理',exact:true}),doing=page.getByRole('region',{name:'进行中',exact:true});
  const menu=async item=>{await page.getByRole('button',{name:'补充博客中的实际案例 更多操作',exact:true}).click();await page.getByRole('menuitem',{name:item,exact:true}).click();};
  await expect(page.locator('[data-task-id="1"] .nr-work-type')).toHaveText('优化页面');await expect(page.locator('[data-task-id="1"] p')).toHaveCount(0);
  await expect(todo.locator('[data-task-id]')).toHaveCount(2);
  if(width===1440){await todo.locator('[data-task-id="1"]').dragTo(doing);await expect(doing.locator('[data-task-id="1"]')).toBeVisible();}
  else{await menu('移到进行中');await expect(doing.locator('[data-task-id="1"]')).toHaveCount(1);}
  await menu('移到待处理');
  await menu('上移');
  assert.equal(await todo.locator('[data-task-id]').first().getAttribute('data-task-id'),'1');
  await page.getByLabel('模拟调用方拒绝保存').check();await menu('移到进行中');
  await expect(todo.locator('[data-task-id="1"]')).toHaveCount(1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`/tmp/nr-s1-board-${width}-${dark?'dark':'light'}.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('PASS: four-column drag/menu movement, reorder callback, rejected-save preservation and 1440/390px light/dark presentation. Synthetic component data; no persistence claim.');
}finally{await browser.close();}
