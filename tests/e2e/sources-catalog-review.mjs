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
  await expect(page.locator('[data-source-id]')).toHaveCount(17);await expect(page.getByRole('heading',{name:'数据接入',level:1})).toBeVisible();
  for(const [id,label] of [['discourse','已接入'],['github-discussions','已接入'],['gsc','已接入'],['site','已接入'],['github','已接入'],['github-traffic','已接入'],['keywords','可接入'],['trends','可接入'],['competitors','已接入'],['social','可接入'],['discord-slack','可接入'],['repo','已接入']])await expect(page.locator(`[data-source-id="${id}"] .nr-pill`)).toHaveText(label);
  await expect(page.locator('[data-source-id="cms"]')).toHaveCount(0);
  await expect(page.locator('[data-source-id="repo"] .nr-use-tags span')).toHaveText(['用于分析','可修改']);await expect(page.locator('[data-source-id="gsc"] .nr-use-tags span')).toHaveText(['用于分析']);
  const health=page.getByRole('region',{name:'数据健康'});await expect(health).toContainText('4 个数据源 · 2 个正常 · 2 个需要留意');await expect(health.locator('.nr-health-row')).toHaveCount(2);
  await expect(page.locator('[data-source-id="github"] .nr-health-line')).toContainText('上次同步');await expect(page.locator('[data-source-id="discourse"] .nr-health-failing')).toContainText('同步失败超过 1 天');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`catalog overflow ${width}`);
  await page.goto(`${base}/tests/s1/sources.html?page=content&connected${dark?'&dark':''}`);await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByRole('tab',{name:/^博客/}).click();await expect(page.locator('tbody tr')).toHaveCount(1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`content overflow ${width}`);
 }
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=content`);await page.getByRole('button',{name:'接入网站内容'}).waitFor();
 await page.goto(`${base}/tests/s1/sources.html?source=site`);const sheet=page.locator('[data-slot=sheet-content]');await expect(sheet.locator('.nr-guide-message')).toContainText('把官网地址发给我');
 await sheet.getByLabel('官网地址').fill('https://example.com');await sheet.getByRole('button',{name:'读取网站'}).click();await expect(sheet.locator('.nr-guide-preview')).toContainText('66 个页面');
 await sheet.getByRole('checkbox').nth(2).uncheck();await sheet.getByRole('button',{name:'确认接入'}).click();await expect(sheet.locator('.nr-guide-connected')).toContainText('60 个页面');
 await page.goto(`${base}/tests/s1/sources.html?connected&source=github-traffic`);const traffic=page.locator('[data-slot=sheet-content]');await expect(traffic).toContainText('已验证');await expect(traffic).toContainText('news.ycombinator.com');await expect(traffic.getByLabel('GitHub token')).toHaveCount(0);
 await page.goto(`${base}/tests/s1/sources.html?source=repo`);const repo=page.locator('[data-slot=sheet-content]');await expect(repo).toContainText('还没有添加电脑');await repo.getByLabel('仓库链接').fill('https://github.com/estheryo/website-test.git');await repo.getByRole('button',{name:'保存'}).click();
 await expect(repo.locator('.nr-guide-connected')).toContainText('estheryo/website-test');await expect(repo.locator('.nr-guide-connected')).toContainText('仓库的默认分支');await expect(page.locator('[data-source-id="repo"]')).toHaveAttribute('data-state','connected');
 // GitHub history: stars filled (fewer than now: withdrawn stars), forks with the reason they stopped, 重新补全 reads both again.
 await page.goto(`${base}/tests/s1/sources.html?connected&source=github`);const hist=page.locator('[data-history]');await expect(hist).toContainText('Star 历史：已补全：从 2020-10-24 起，1,210 个（比现在少 30 个');
 await expect(hist).toContainText('Fork 历史：没有补全：token 权限不足');await expect(hist).toContainText('GitHub 只保留最近 14 天，什么权限都补不回来');
 page.once('dialog',d=>d.accept());await hist.getByRole('button',{name:'重新补全'}).click();await expect(hist).toContainText('正在补全');await expect(hist).toContainText('Fork 历史：已补全：从 2020-11-02 起，86 个',{timeout:12000});
 await page.goto(`${base}/tests/s1/sources.html?source=github`);const gh=page.locator('[data-slot=sheet-content]');await gh.getByLabel('仓库链接').fill('https://github.com/org/repo');await gh.getByRole('button',{name:'读取仓库'}).click();await gh.getByRole('button',{name:'确认接入'}).click();
 await expect(gh).toContainText('★ 1,240');await expect(gh.getByLabel('GitHub token')).toHaveAttribute('type','password');await expect(gh.locator('.nr-guide-steps li')).toHaveCount(5);
 await page.goto(`${base}/tests/s1/sources.html`);await page.getByLabel('网站地址').fill('https://example.com');await page.getByRole('button',{name:'发现数据'}).click();
 await expect(page.getByLabel('接入 https://example.com')).toBeChecked();await expect(page.getByLabel('接入 https://demo.example.com')).not.toBeChecked();await expect(page.locator('.nr-discovery-row[data-status=unsupported]')).toContainText('X @example');
 await page.getByRole('button',{name:'接入所选的 3 个来源'}).click();await expect(page.locator('.nr-ok')).toHaveCount(3);
 const calls=await page.evaluate(()=>window.__calls);for(const c of ['nrSiteContent:discover','nrSiteContent:confirm','nrGitHub:connect','nrCommunity:connect'])assert.ok(calls.includes(c),c);assert.ok(!calls.some(c=>c.startsWith('nrGoogle:')&&c!=='nrGoogle:status'),'auth sources are not touched');
 await page.getByRole('button',{name:'去授权'}).first().click();await expect(page.locator('[data-slot=sheet-content]')).toContainText('接入 GitHub Traffic');
 await page.goto(`${base}/tests/s1/sources.html?source=discourse`);const forum=page.locator('[data-slot=sheet-content]');await forum.getByLabel('论坛地址').fill('https://forum.example.com');await forum.getByRole('button',{name:'读取论坛'}).click();await expect(forum).toContainText('不保存用户名');await forum.getByRole('button',{name:'确认接入'}).click();await expect(forum).toContainText('正在首次同步');
 await page.goto(`${base}/tests/s1/sources.html?connected`);await page.getByRole('region',{name:'数据健康'}).locator('.nr-health-row').first().getByRole('button',{name:'重试'}).click();await expect.poll(()=>page.evaluate(()=>window.__calls.includes('nrCommunity:sync'))).toBe(true);
 assert.deepEqual(errors,[]);
 console.log('PASS: GitHub history (stars, forks with the reason, 重新补全); data health summary, card health lines and retry; one-step discovery (defaults, optional unchecked, connect selected, auth untouched, 去授权), Discourse connect with background sync; GitHub repo connect and Traffic token guide (password field, 5 steps), verified Traffic state; data source catalog states (connected, soon, planned without actions), guided site content connection with type selection, content page listing and filter; 1440 light and 390 dark without overflow. Mocked API only.');
}finally{await browser.close();}
