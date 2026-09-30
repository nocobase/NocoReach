import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// Isolated catalog and content fixture (apps/portal/tests/s1/sources.html): mocked API, no auth, network or model calls.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){
  await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?connected${dark?'&dark':''}`);
  await expect(page.locator('[data-source-id]')).toHaveCount(12);
  for(const [id,label] of [['gsc','已接入'],['site','已接入'],['github','已接入'],['github-traffic','已接入'],['keywords','可接入'],['trends','规划中']])await expect(page.locator(`[data-source-id="${id}"] .nr-pill`)).toHaveText(label);
  await expect(page.locator('[data-source-id="trends"] button')).toHaveCount(0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`catalog overflow ${width}`);
  await page.goto(`${base}/tests/s1/sources.html?page=content&connected${dark?'&dark':''}`);await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByRole('button',{name:/^博客/}).click();await expect(page.locator('tbody tr')).toHaveCount(1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`content overflow ${width}`);
 }
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=content`);await page.getByRole('button',{name:'接入网站内容'}).waitFor();
 await page.goto(`${base}/tests/s1/sources.html?source=site`);const sheet=page.locator('[data-slot=sheet-content]');await expect(sheet.locator('.nr-guide-message')).toContainText('把官网地址发给我');
 await sheet.getByLabel('官网地址').fill('https://example.com');await sheet.getByRole('button',{name:'读取网站'}).click();await expect(sheet.locator('.nr-guide-preview')).toContainText('66 个页面');
 await sheet.getByRole('checkbox').nth(2).uncheck();await sheet.getByRole('button',{name:'确认接入'}).click();await expect(sheet.locator('.nr-guide-connected')).toContainText('60 个页面');
 await page.goto(`${base}/tests/s1/sources.html?connected&source=github-traffic`);const traffic=page.locator('[data-slot=sheet-content]');await expect(traffic).toContainText('已验证');await expect(traffic).toContainText('news.ycombinator.com');await expect(traffic.getByLabel('GitHub token')).toHaveCount(0);
 await page.goto(`${base}/tests/s1/sources.html?source=github`);const gh=page.locator('[data-slot=sheet-content]');await gh.getByLabel('仓库链接').fill('https://github.com/org/repo');await gh.getByRole('button',{name:'读取仓库'}).click();await gh.getByRole('button',{name:'确认接入'}).click();
 await expect(gh).toContainText('★ 1,240');await expect(gh.getByLabel('GitHub token')).toHaveAttribute('type','password');await expect(gh.locator('.nr-guide-steps li')).toHaveCount(5);
 assert.deepEqual(errors,[]);
 console.log('PASS: GitHub repo connect and Traffic token guide (password field, 5 steps), verified Traffic state; data source catalog states (connected, soon, planned without actions), guided site content connection with type selection, content page listing and filter; 1440 light and 390 dark without overflow. Mocked API only.');
}finally{await browser.close();}
