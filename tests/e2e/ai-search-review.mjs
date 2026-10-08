import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// Isolated AI 搜索 (apps/portal/tests/s1/sources.html?page=ai): mocked API, no paid query.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls=action=>page.evaluate(a=>(window.__ai||[]).filter(c=>c.action===a),action);
 await page.goto(`${base}/tests/s1/sources.html?page=ai&connected&nokeys`);await expect(page.getByRole('button',{name:'去数据接入'})).toBeVisible();
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){
  await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=ai&connected&tab=brand&fresh${dark?'&dark&density=default':''}`);
  await expect(page.getByText('还没有查过品牌提及')).toBeVisible();
  // 品牌提及: brand and one competitor, both platforms at once, share of mentions, questions not citing us.
  await page.getByLabel('品牌或域名').fill('NocoBase');await page.getByLabel('添加竞品').fill('appsmith.com');await page.getByLabel('添加竞品').press('Enter');
  await page.getByRole('button',{name:'查询'}).click();
  await expect(page.locator('[data-platform="chat_gpt"]')).toContainText('1,240');await expect(page.locator('[data-platform="google"]')).toContainText('310');
  await expect(page.locator('[data-platform="chat_gpt"]').getByLabel('提及份额',{exact:true})).toContainText('你 44% · appsmith.com 56%');
  await expect(page.locator('[data-platform="chat_gpt"]')).toContainText('10 / 30');
  await expect(page.getByText('共 34 个，按 AI 搜索量排序')).toBeVisible();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`);
 }
 const brand=await calls('nrAiSearch:brand');assert.deepEqual(brand.slice(-2).map(c=>[c.platform,c.target,c.competitors.join()]),[['chat_gpt','NocoBase','appsmith.com'],['google','NocoBase','appsmith.com']]);
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:'只看没引用本站的'}).click();await expect(page.getByText('22 个没引用本站，共 34 个')).toBeVisible();
 const rows=page.locator('tbody tr');await rows.nth(0).getByRole('checkbox').click();await rows.nth(1).getByRole('checkbox').click();
 await page.getByRole('toolbar',{name:'批量操作'}).getByRole('button',{name:'交给 Agent'}).click();
 await expect(page.locator('#where')).toHaveText(/^\/actions\/9\d\d$/,{useInnerText:false});{const k=await page.evaluate(()=>window.__kw),h=k.handoffs.at(-1);assert.ok(h.title.includes('等 2 个问题时引用本站'),h.title);assert.equal(h.playbookId,'content-outline');assert.ok(!k.advances.includes('startTask'),'not started by the hand-off');}
 // A Google failure leaves ChatGPT's result in place; recent lookups reopen without a query.
 await page.goto(`${base}/tests/s1/sources.html?page=ai&connected&tab=brand&fresh&googlefail`);await page.getByLabel('品牌或域名').fill('NocoBase');await page.getByRole('button',{name:'查询'}).click();
 await expect(page.locator('[data-platform="google"]')).toContainText('不要重复发起付费请求');await expect(page.locator('[data-platform="chat_gpt"]')).toContainText('1,240');
 await page.goto(`${base}/tests/s1/sources.html?page=ai&connected&tab=brand`);await page.getByRole('button',{name:/NocoBase.*对比 appsmith\.com/}).click();
 await expect(page.locator('[data-platform="chat_gpt"]')).toContainText('1,240');assert.equal((await calls('nrAiSearch:open')).at(-1).kind,'brand');
 await expect(page.getByRole('heading',{name:/「NocoBase」的品牌提及/})).toContainText('对比 appsmith.com');await expect(page.getByRole('heading',{name:'查过的品牌'})).toBeVisible();await expect(page.locator('[aria-current="true"]')).toContainText('正在看');
 // 问 AI: four models at once by default; each answer on its own card; a model that could not be asked says why.
 await page.goto(`${base}/tests/s1/sources.html?page=ai&connected&tab=brand&fresh`);await page.getByRole('tab',{name:'问 AI'}).click();await expect(page.getByText('还没有问过 AI')).toBeVisible();
 for(const m of ['ChatGPT','Claude','Gemini','Perplexity'])await expect(page.getByRole('checkbox',{name:m})).toBeChecked();
 await page.getByLabel('问题').fill('What is the best open source no-code platform?');await page.getByRole('button',{name:'提问',exact:true}).click();
 // One row per model: mentioned or not, the sentence naming us, cited sites merged per site (Google redirects by their title).
 await expect(page.locator('[data-model="chat_gpt"]')).toContainText('提到了');await expect(page.locator('[data-model="chat_gpt"]')).toContainText('“For business apps, Demo and Budibase are good picks.”');
 await expect(page.locator('[data-model="chat_gpt"]').getByLabel('引用的网站')).toHaveText('example.com ×2budibase.comg2.com');
 await expect(page.locator('[data-model="claude"]')).toContainText('没提到');await expect(page.locator('[data-model="claude"]')).toContainText('回答里没有出现你的名称或网站');
 await expect(page.locator('[data-model="gemini"]')).toContainText('没读到 Gemini 的模型目录');
 await page.locator('[data-model="claude"]').getByRole('button',{name:'看回答'}).click();const reader=page.getByRole('dialog');await expect(reader).toContainText('Claude 的回答');await expect(reader.locator('table')).toContainText('Internal tools');await page.keyboard.press('Escape');await expect(reader).toHaveCount(0);
 assert.deepEqual((await calls('nrAiSearch:ask')).map(c=>c.model).sort(),['chat_gpt','claude','gemini','perplexity']);
 // Answers are ticked like any list (here the one that leaves you out) and handed off from the bar at the bottom.
 await page.locator('[data-model="claude"] [data-row-check]').click();await expect(page.getByRole('toolbar',{name:'批量操作'})).toContainText('1个回答已选');await page.getByRole('toolbar',{name:'批量操作'}).getByRole('button',{name:'交给 Agent'}).click();await expect(page.locator('#where')).toHaveText(/^\/actions\/9\d\d$/,{useInnerText:false});{const k=await page.evaluate(()=>window.__kw),h=k.handoffs.at(-1);assert.ok(h.title.includes('让 AI 回答「What is the best open source no-code platform?」时提到我们'),h.title);assert.equal(h.playbookId,'content-outline');assert.ok(!k.advances.includes('startTask'),'not started by the hand-off');}
 await expect(page.locator('#where')).toHaveText(/^\/actions\/9\d\d$/,{useInnerText:false});
 await page.goto(`${base}/tests/s1/sources.html?page=ai&connected&tab=brand&fresh`);await page.getByRole('tab',{name:'问 AI'}).click();await page.getByLabel('问题').fill('What is the best open source no-code platform?');
 for(const m of ['ChatGPT','Claude','Gemini','Perplexity'])await page.getByRole('checkbox',{name:m}).click();
 await page.getByRole('button',{name:'提问',exact:true}).click();await expect(page.getByText('至少选一个模型')).toBeVisible();
 // Questions asked before stay listed under the answers: switch between them and back, the open one marked.
 await page.goto(`${base}/tests/s1/sources.html?page=ai&connected&tab=brand`);await page.getByRole('tab',{name:'问 AI'}).click();await expect(page.getByRole('heading',{name:'问过的问题'})).toBeVisible();
 await page.getByRole('button',{name:/What is the best open source no-code platform\?/}).click();await expect(page.getByRole('heading',{name:/「What is the best open source no-code platform\?」的回答/})).toBeVisible();
 await expect(page.locator('[aria-current="true"]')).toContainText('What is the best open source no-code platform?');await expect(page.locator('[data-model]')).toHaveCount(2);
 await page.getByRole('button',{name:/Best open source CRM\?/}).click();await expect(page.getByRole('heading',{name:/「Best open source CRM\?」的回答/})).toBeVisible();await expect(page.locator('[data-model]')).toHaveCount(1);
 await page.getByRole('button',{name:/What is the best open source no-code platform\?/}).click();await expect(page.locator('[data-model]')).toHaveCount(2);
 await expect(page.getByRole('button',{name:'最近问过的'})).toHaveCount(0);
 assert.deepEqual(errors,[]);
 // 问题 (default tab): first time the AI's topics are edited, then 开始查询; questions marked; chances first; detail; hand-off
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=ai&connected`);await expect(page.getByRole('tab',{name:'问题'})).toHaveAttribute('aria-selected','true');
 const setup=page.locator('[data-topic-setup]');await expect(setup).toContainText('no-code database');await setup.getByRole('button',{name:'去掉 no-code database'}).click();await setup.getByLabel('添加主题').fill('Low Code Platform');await setup.getByRole('button',{name:'添加'}).click();
 await expect(setup.getByRole('button',{name:'开始查询（约 $1.2）'})).toBeVisible();await setup.getByRole('button',{name:'开始查询（约 $1.2）'}).click();
 assert.deepEqual(await page.evaluate(()=>window.__aq.calls.filter(c=>c.action==='topics').map(c=>c.topics)),[['internal tool builder','open source crm','low code platform']],'only confirmed topics are paid for');
 const counts=page.locator('[data-question-counts]');await expect(counts).toContainText('4');await expect(counts).toContainText('1 · 25%');await expect(page.getByRole('tab',{name:'机会 (2)'})).toHaveAttribute('aria-selected','true');
 const first=page.locator('tbody tr').filter({hasText:'best open source alternative to retool'});await expect(first).toContainText('没出现');await expect(first).toContainText('Appsmith');await expect(first).toContainText('reddit.com');
 await expect(page.locator('[data-cited-domains]')).toContainText('reddit.com');await page.getByRole('tab',{name:'已出现 (1)'}).click();await expect(page.locator('tbody tr').first()).toContainText('提到 · 引用');
 await page.getByRole('tab',{name:'机会 (2)'}).click();await page.locator('tbody tr').filter({hasText:'best open source alternative'}).locator('td').nth(1).click();let d=page.getByRole('dialog');await expect(d).toContainText('Appsmith and ToolJet');await expect(d).toContainText('g2.com');await page.keyboard.press('Escape');
 await page.locator('[data-topics]').getByLabel('添加主题').fill('no-code database');await page.locator('[data-topics]').getByRole('button',{name:'添加'}).click();await expect(page.locator('[data-topics]')).toContainText('no-code database');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'questions overflow 1440');
 await page.locator('tbody tr').nth(0).getByRole('checkbox').click();await page.locator('tbody tr').nth(1).getByRole('checkbox').click();await page.getByRole('toolbar',{name:'批量操作'}).getByRole('button',{name:'交给 Agent'}).click();await expect(page.locator('#where')).toHaveText(/^\/actions\/9\d\d$/,{useInnerText:false});{const k=await page.evaluate(()=>window.__kw),h=k.handoffs.at(-1);assert.ok(h.title.includes('等 2 个问题时提到我们'),h.title);assert.equal(h.playbookId,'content-outline');assert.ok(!k.advances.includes('startTask'),'not started by the hand-off');}
 await page.setViewportSize({width:390,height:844});await page.goto(`${base}/tests/s1/sources.html?page=ai&connected&aq&dark`);await expect(page.locator('tbody tr').first()).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'questions overflow 390');
 await page.setViewportSize({width:1440,height:900});
 // 实测 (2026-10-09): with two competitors, an admin can spend about $0.11 once to see how exclude and several competitors work.
 await page.goto(`${base}/tests/s1/sources.html?page=ai&connected&tab=brand&fresh`);await page.getByLabel('品牌或域名').fill('NocoBase');
 for(const c of ['Retool','Appsmith']){await page.getByLabel('添加竞品').fill(c);await page.getByLabel('添加竞品').press('Enter');}
 const probe=page.locator('[data-probe]');await expect(probe).toBeVisible();const before=(await calls('nrAiSearch:brand')).length;
 await probe.getByRole('button',{name:'花约 $0.11 实测'}).click();const ask=page.getByRole('alertdialog');await expect(ask).toContainText('没提到 NocoBase');await ask.getByRole('button',{name:'实测'}).click();
 await expect(probe.locator('[data-probe-result]')).toContainText('排除条件有效');await expect(probe.locator('[data-probe-result]')).toContainText('按“提到任一个”算');await expect(probe).toContainText('实际花费 $0.11');
 {const p=(await calls('nrAiSearch:probe')).at(-1);assert.deepEqual([p.target,p.competitors.join()],['NocoBase','Retool,Appsmith']);assert.ok(p.requestKey);assert.equal((await calls('nrAiSearch:brand')).length,before,'no brand lookup needed for the probe');}
 await page.screenshot({path:'/tmp/nr-probe.png'});
 console.log('PASS: AI 搜索 (not connected; 品牌提及: brand and competitor, ChatGPT and Google at once, mentions, share, questions not citing us, hand two questions to the Agent, one platform failing, lookups made before listed under the results with the open one marked; 问 AI: four models by default, one row per model with the sentence naming us and cited sites merged per site, full answer in the reading window with tables, a model that could not be asked, hand off, switching between questions asked before and back, no model chosen; 1440 light and 390 dark without overflow). Mocked API only.');
}finally{await browser.close();}
