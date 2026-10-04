import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// 交给 Agent from the search pages (apps/portal/tests/s1/sources.html): what is selected becomes one task with its data
// in the brief and a fitting 做法, then the task page opens. Mocked API only.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const kw=()=>page.evaluate(()=>window.__kw);
 const bulk=()=>page.getByRole('toolbar',{name:'批量操作'}).getByRole('button',{name:'交给 Agent'});
 const dialog=page.getByRole('dialog');
 const submit=async()=>{await dialog.getByRole('button',{name:'交给 Agent'}).click();await expect(page.locator('#where')).toHaveText(/^\/actions\/9\d\d$/,{useInnerText:false});};
 // 搜索表现 · 接近首页: queries with their rank, impressions and page; 优化现有页面, the page linked.
 await page.goto(`${base}/tests/s1/sources.html?page=search&connected`);const rows=page.locator('tbody tr');await rows.nth(0).getByRole('checkbox').click();await rows.nth(1).getByRole('checkbox').click();
 await bulk().click();await expect(dialog).toContainText('等 2 个查询的排名推进前几名');await expect(dialog.getByRole('combobox',{name:'做法'})).toContainText('优化现有页面');await submit();
 let k=await kw();let h=k.handoffs.at(-1);assert.match(h.brief,/平均排名 .*曝光 .*排名页面 https:/);assert.deepEqual(k.advances.slice(-2),['linkPage','startTask']);
 // 查询 tab: the ranking page is looked up first; 页面 tab: pages with clicks, CTR and rank.
 await page.goto(`${base}/tests/s1/sources.html?page=search&connected`);await page.getByRole('tab',{name:/^查询/}).click();await rows.nth(0).getByRole('checkbox').click();await bulk().click();await expect(dialog).toContainText('的排名推进前几名');await dialog.getByRole('button',{name:'取消'}).click();
 await page.getByRole('tab',{name:/^页面/}).click();await rows.nth(0).getByRole('checkbox').click();await bulk().click();await expect(dialog).toContainText('的搜索表现');await submit();h=(await kw()).handoffs.at(-1);assert.match(h.brief,/点击率 /);
 // 找新词: the keyword hand-off with market numbers.
 await page.goto(`${base}/tests/s1/sources.html?page=research&connected`);await page.getByLabel('关键词',{exact:true}).fill('open source crm');await page.getByRole('button',{name:'查询'}).click();await expect(rows.first()).toBeVisible();
 await rows.nth(1).getByRole('checkbox').click();await rows.nth(2).getByRole('checkbox').click();await bulk().click();await expect(dialog).toContainText('2 个关键词');await submit();h=(await kw()).handoffs.at(-1);assert.match(h.brief,/月搜索量/);
 // 排名跟踪: this week's and last week's Google rank in the brief.
 await page.goto(`${base}/tests/s1/sources.html?page=keywords&connected&saved`);const row=n=>page.locator('tbody tr').filter({hasText:n});
 await row('crm for teams').getByRole('checkbox').click();await row('open source crm').getByRole('checkbox').click();await page.getByRole('button',{name:'开始跟踪'}).click();await dialog.getByRole('button',{name:'开始跟踪'}).click();
 await expect(page.getByRole('tab',{name:'排名跟踪'})).toHaveAttribute('aria-selected','true');await row('open source crm').getByRole('checkbox').click();await bulk().click();await expect(dialog).toContainText('提升「open source crm」的排名');await submit();
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/排名跟踪（每周在 Google 桌面端查前 100 名）/);
 // 竞品 · 关键词: catch up on a competitor's words (内容选题与大纲); 页面: compare its pages (竞品对比).
 await page.goto(`${base}/tests/s1/sources.html?page=domain&connected`);await page.getByLabel('域名').fill('competitor.io');await page.getByRole('button',{name:'查询'}).click();await expect(rows.first()).toBeVisible();
 await rows.nth(0).getByRole('checkbox').click();await rows.nth(1).getByRole('checkbox').click();await bulk().click();await expect(dialog).toContainText('追上 competitor.io');await expect(dialog.getByRole('combobox',{name:'做法'})).toContainText('内容选题与大纲');await submit();
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/竞品 competitor\.io 在 Google/);assert.match(h.brief,/排第 \d+ 位/);
 await page.goto(`${base}/tests/s1/sources.html?page=domain&connected`);await page.getByLabel('域名').fill('competitor.io');await page.getByRole('button',{name:'查询'}).click();await page.getByRole('tab',{name:/页面/}).click();await page.getByRole('button',{name:'查询热门页面'}).click();
 await expect(page.locator('tbody')).toContainText('/blog/open-source-crm');await rows.nth(0).getByRole('checkbox').click();await bulk().click();await expect(dialog).toContainText('对比 competitor.io');await expect(dialog.getByRole('combobox',{name:'做法'})).toContainText('竞品对比');await submit();
 // 页面 → 性能检查: 审计 opens with the page filled into the Lighthouse box (nothing runs until 检查).
 await page.goto(`${base}/tests/s1/sources.html?page=content&connected`);await page.locator('tbody tr').filter({hasText:'安装指南'}).getByRole('button',{name:'安装指南'}).click();await page.getByRole('dialog').getByRole('button',{name:'性能检查'}).click();
 await expect(page.locator('#where')).toHaveText(/^\/audit\?lighthouse=/,{useInnerText:false});const asked=decodeURIComponent((await page.locator('#where').textContent()).split('lighthouse=')[1]);
 await expect(page.locator('[data-lighthouse]').getByLabel('要检查的网址')).toHaveValue(asked);assert.equal((await page.evaluate(()=>window.__lh||[])).filter(x=>x.action==='nrLighthouse:run').length,0,'not run by itself');
 // 页面: the page's recent numbers, 优化现有页面 with the page linked.
 await page.goto(`${base}/tests/s1/sources.html?page=content&connected`);await page.locator('tbody tr').filter({hasText:'安装指南'}).getByRole('button',{name:'安装指南'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'交给 Agent'}).click();await expect(page.getByRole('dialog').last()).toContainText('优化「安装指南」');await page.getByRole('dialog').last().getByRole('button',{name:'交给 Agent'}).click();
 await expect(page.locator('#where')).toHaveText(/^\/actions\/9\d\d$/,{useInnerText:false});h=(await kw()).handoffs.at(-1);assert.match(h.brief,/页面：https:\/\/.*\/docs\/install/);
 // 社区 and GitHub lists: the whole list in one task, 社区问题汇总 by default.
 const section=(name)=>page.getByRole('heading',{name,exact:true}).locator('xpath=..').getByRole('button',{name:'交给 Agent'});
 await page.goto(`${base}/tests/s1/sources.html?page=community&connected`);await section('无人回复').click();await expect(dialog).toContainText('无人回复的主题');await expect(dialog.getByRole('combobox',{name:'做法'})).toContainText('社区问题汇总');await submit();
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/插件无法加载（中文讨论区 · 2026-09-29）：https:\/\/forum\.example\.com/);
 await page.goto(`${base}/tests/s1/sources.html?page=hackernews&connected`);await section('分数最高的帖子').click();await expect(dialog).toContainText('Hacker News的 1 个帖子');await submit();
 // 竞品 › 动态: picked updates → 竞品对比.
 await page.goto(`${base}/tests/s1/sources.html?page=competitors&connected`);await page.locator('[data-event]').nth(0).getByRole('checkbox').click();await page.locator('[data-event]').nth(1).getByRole('checkbox').click();
 await page.getByRole('button',{name:'交给 Agent（2）'}).click();await expect(dialog).toContainText('竞品对比：Appsmith、Retool 的 2 条新动态');await expect(dialog.getByRole('combobox',{name:'做法'})).toContainText('竞品对比');await submit();
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/Appsmith · 新版本：发布 v1\.62/);assert.match(h.brief,/Retool · 新页面：AI agents for operations/);
 // 趋势: picked related searches (rising and top) → 内容选题与大纲.
 await page.goto(`${base}/tests/s1/sources.html?page=trends&connected`);const pickTrend=page.getByRole('button',{name:/^交给 Agent/});await expect(pickTrend).toBeDisabled();
 await page.locator('[data-query="nocobase ai"]').getByRole('checkbox').click();await page.locator('[data-query="nocobase docker"]').getByRole('checkbox').click();await page.getByRole('button',{name:'交给 Agent（2）'}).click();await expect(dialog).toContainText('2 个「NocoBase」的相关搜索');await expect(dialog.getByRole('combobox',{name:'做法'})).toContainText('内容选题与大纲');await submit();
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/nocobase ai：上升 \+350%/);assert.match(h.brief,/nocobase docker：热度 100/);
 await page.goto(`${base}/tests/s1/sources.html?page=x&connected`);await section('互动最多').click();await expect(dialog).toContainText('X的 2 个帖子');await submit();h=(await kw()).handoffs.at(-1);assert.match(h.brief,/https:\/\/x\.com\/i\/web\/status\/1801/);
 await page.goto(`${base}/tests/s1/sources.html?page=discord&connected`);await section('可能没人回的提问').click();await expect(dialog).toContainText('Discord的 2 个提问');await submit();h=(await kw()).handoffs.at(-1);assert.match(h.brief,/#help/);
 await page.goto(`${base}/tests/s1/sources.html?page=reddit&connected`);await section('帖子').click();await expect(dialog).toContainText('Reddit的 2 个帖子');await submit();h=(await kw()).handoffs.at(-1);assert.match(h.brief,/r\/selfhosted/);
 await page.goto(`${base}/tests/s1/sources.html?page=github&connected`);await section('Issues').click();await expect(dialog).toContainText('GitHub Issues');await dialog.getByRole('button',{name:'取消'}).click();await section('Discussions').click();await expect(dialog).toContainText('GitHub Discussions');await submit();
 // 访问 · 页面详情: the page's views, key events and search queries; 优化现有页面.
 await page.goto(`${base}/tests/s1/sources.html?page=website-pages&connected`);await page.getByRole('button',{name:'/docs/install'}).first().click();await page.getByRole('dialog').getByRole('button',{name:'交给 Agent'}).click();
 await expect(page.getByRole('dialog').last()).toContainText('优化 /docs/install');await page.getByRole('dialog').last().getByRole('button',{name:'交给 Agent'}).click();await expect(page.locator('#where')).toHaveText(/^\/actions\/9\d\d$/,{useInnerText:false});
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/关键事件 120/);
 assert.deepEqual(errors,[]);
 console.log('PASS: 交给 Agent from 搜索表现 (接近首页 with pages linked, 查询 with the ranking page looked up, 页面), 找新词, 排名跟踪 (weekly checks in the brief), 竞品 (keywords → 内容选题与大纲, pages → 竞品对比) 页面 (detail drawer, and 性能检查 opening 审计 with the page filled in), 论坛 (unanswered), Hacker News, Reddit, X, Discord, 趋势 (picked related searches → 内容选题与大纲), 竞品动态 (picked updates → 竞品对比), GitHub Issues and Discussions (社区问题汇总) and 访问 (page detail); each opens the task page. Mocked API only.');
}finally{await browser.close();}
