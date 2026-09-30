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
  await expect(todo.locator('[data-task-id]')).toHaveCount(2);
  if(width===1440){await todo.locator('[data-task-id="1"]').dragTo(doing);await expect(doing.locator('[data-task-id="1"]')).toBeVisible();}
  else{await page.getByLabel('移动 补充博客中的实际案例',{exact:true}).selectOption('doing');await expect(doing.locator('[data-task-id="1"]')).toHaveCount(1);}
  await page.getByLabel('移动 补充博客中的实际案例',{exact:true}).selectOption('todo');
  await page.getByRole('button',{name:'上移 补充博客中的实际案例',exact:true}).click();
  assert.equal(await todo.locator('[data-task-id]').first().getAttribute('data-task-id'),'1');
  await page.getByLabel('模拟调用方拒绝保存').check();await page.getByLabel('移动 补充博客中的实际案例',{exact:true}).selectOption('doing');
  await expect(todo.locator('[data-task-id="1"]')).toHaveCount(1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`/tmp/nr-s1-board-${width}-${dark?'dark':'light'}.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('PASS: four-column drag/menu movement, reorder callback, rejected-save preservation and 1440/390px light/dark presentation. Synthetic component data; no persistence claim.');
}finally{await browser.close();}
