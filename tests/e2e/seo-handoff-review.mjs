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
 // 交给 Agent creates the task, not started, with the suggested 做法, and opens its page (2026-10-08).
 const handed=async(title,playbook)=>{await expect(page.locator('#where')).toHaveText(/^\/actions\/9\d\d$/,{useInnerText:false});const k=await kw(),h=k.handoffs.at(-1);if(title)assert.ok(h.title.includes(title),`${title} in ${h.title}`);if(playbook)assert.equal(h.playbookId,playbook);assert.ok(!k.advances.includes('startTask'),'not started by the hand-off');return h;};
 // 搜索表现 · 接近首页: queries with their rank, impressions and page; 优化现有页面, the page linked.
 await page.goto(`${base}/tests/s1/sources.html?page=search&connected`);const rows=page.locator('tbody tr');await rows.nth(0).getByRole('checkbox').click();await rows.nth(1).getByRole('checkbox').click();
 await bulk().click();await handed('等 2 个查询的排名推进前几名','optimize-page');
 let k=await kw();let h=k.handoffs.at(-1);assert.match(h.brief,/平均排名 .*曝光 .*排名页面 https:/);assert.equal(k.advances.at(-1),'linkPage');
 // 查询 tab: the ranking page is looked up first; 页面 tab: pages with clicks, CTR and rank.
 await page.goto(`${base}/tests/s1/sources.html?page=search&connected`);await page.getByRole('tab',{name:/^查询/}).click();await rows.nth(0).getByRole('checkbox').click();await bulk().click();await handed('的排名推进前几名','optimize-page');
 await page.goto(`${base}/tests/s1/sources.html?page=search&connected`);await page.getByRole('tab',{name:/^页面/}).click();await rows.nth(0).getByRole('checkbox').click();await bulk().click();await handed('的搜索表现');h=(await kw()).handoffs.at(-1);assert.match(h.brief,/点击率 /);
 // 找新词: the keyword hand-off with market numbers.
 await page.goto(`${base}/tests/s1/sources.html?page=research&connected`);await page.getByLabel('关键词',{exact:true}).fill('open source crm');await page.getByRole('button',{name:'查询'}).click();await expect(rows.first()).toBeVisible();
 await rows.nth(1).getByRole('checkbox').click();await rows.nth(2).getByRole('checkbox').click();await bulk().click();await handed('2 个关键词');h=(await kw()).handoffs.at(-1);assert.match(h.brief,/月搜索量/);
 // 排名跟踪: this week's and last week's Google rank in the brief.
 await page.goto(`${base}/tests/s1/sources.html?page=keywords&connected&saved`);const row=n=>page.locator('tbody tr').filter({hasText:n});
 await row('crm for teams').getByRole('checkbox').click();await row('open source crm').getByRole('checkbox').click();await page.getByRole('button',{name:'开始跟踪'}).click();await dialog.getByRole('button',{name:'开始跟踪'}).click();
 await expect(page.getByRole('tab',{name:'排名跟踪'})).toHaveAttribute('aria-selected','true');await row('open source crm').getByRole('checkbox').click();await bulk().click();await handed('提升「open source crm」的排名');
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/排名跟踪（每周在 Google 桌面端查前 100 名）/);
 // 竞品 · 关键词: catch up on a competitor's words (内容选题与大纲); 页面: compare its pages (竞品对比).
 await page.goto(`${base}/tests/s1/sources.html?page=domain&connected`);await page.getByLabel('域名').fill('competitor.io');await page.getByRole('button',{name:'查询'}).click();await expect(rows.first()).toBeVisible();
 await rows.nth(0).getByRole('checkbox').click();await rows.nth(1).getByRole('checkbox').click();await bulk().click();await handed('追上 competitor.io','content-outline');
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/竞品 competitor\.io 在 Google/);assert.match(h.brief,/排第 \d+ 位/);
 await page.goto(`${base}/tests/s1/sources.html?page=domain&connected`);await page.getByLabel('域名').fill('competitor.io');await page.getByRole('button',{name:'查询'}).click();await page.getByRole('tab',{name:/页面/}).click();await page.getByRole('button',{name:'查询热门页面'}).click();
 await expect(page.locator('tbody')).toContainText('/blog/open-source-crm');await rows.nth(0).getByRole('checkbox').click();await bulk().click();await handed('对比 competitor.io','competitor-compare');
 // 页面 → 性能检查: 审计 opens with the page filled into the Lighthouse box (nothing runs until 检查).
 await page.goto(`${base}/tests/s1/sources.html?page=content&connected`);await page.locator('tbody tr').filter({hasText:'安装指南'}).getByRole('button',{name:'安装指南'}).click();await page.getByRole('dialog').getByRole('button',{name:'性能检查'}).click();
 await expect(page.locator('#where')).toHaveText(/^\/audit\?lighthouse=/,{useInnerText:false});const asked=decodeURIComponent((await page.locator('#where').textContent()).split('lighthouse=')[1]);
 await expect(page.locator('[data-lighthouse]').getByLabel('要检查的网址')).toHaveValue(asked);assert.equal((await page.evaluate(()=>window.__lh||[])).filter(x=>x.action==='nrLighthouse:run').length,0,'not run by itself');
 // 页面: the page's recent numbers, 优化现有页面 with the page linked.
 await page.goto(`${base}/tests/s1/sources.html?page=content&connected`);await page.locator('tbody tr').filter({hasText:'安装指南'}).getByRole('button',{name:'安装指南'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'交给 Agent'}).click();h=await handed('优化「安装指南」','optimize-page');assert.match(h.brief,/页面：https:\/\/.*\/docs\/install/);
 // 社区 and GitHub lists: ticked rows (here the whole list, ticked from its header) in one task, 社区问题汇总 by default,
 // with the page's button at the top right.
 const section=async(name)=>{await page.getByRole('heading',{name,exact:true}).locator('xpath=..').locator('[data-all-check]').click();return bulk();};
 await page.goto(`${base}/tests/s1/sources.html?page=community&connected`);await (await section('无人回复')).click();await handed('无人回复的主题','community-reply');
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/插件无法加载（中文讨论区 · 2026-09-29）：https:\/\/forum\.example\.com/);
 await page.goto(`${base}/tests/s1/sources.html?page=hackernews&connected`);await (await section('分数最高的帖子')).click();await handed('Hacker News的 1 个帖子');
 // 竞品 › 动态: picked updates → 竞品对比.
 await page.goto(`${base}/tests/s1/sources.html?page=competitors&connected&view=watch`);await page.locator('[data-event]').nth(0).getByRole('checkbox').click();await page.locator('[data-event]').nth(1).getByRole('checkbox').click();
 await bulk().click();await handed('竞品对比：Appsmith、Retool 的 2 条新动态','competitor-compare');
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/Appsmith · 新版本：发布 v1\.62/);assert.match(h.brief,/Retool · 新页面：AI agents for operations/);
 // 趋势: picked related searches (rising and top) → 内容选题与大纲.
 await page.goto(`${base}/tests/s1/sources.html?page=trends&connected`);await expect(page.getByRole('toolbar',{name:'批量操作'})).toHaveCount(0);
 await page.locator('[data-query="nocobase ai"]').getByRole('checkbox').click();await page.locator('[data-query="nocobase docker"]').getByRole('checkbox').click();await bulk().click();await handed('2 个「NocoBase」的相关搜索','content-outline');
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/nocobase ai：上升 \+350%/);assert.match(h.brief,/nocobase docker：热度 100/);
 await page.goto(`${base}/tests/s1/sources.html?page=x&connected`);await (await section('互动最多')).click();await handed('X的 2 个帖子');h=(await kw()).handoffs.at(-1);assert.match(h.brief,/https:\/\/x\.com\/i\/web\/status\/1801/);
 await page.goto(`${base}/tests/s1/sources.html?page=discord&connected`);await (await section('可能没人回的提问')).click();await handed('Discord的 2 个没人回的提问起草回复','community-reply');h=(await kw()).handoffs.at(-1);assert.match(h.brief,/#help/);
 await page.goto(`${base}/tests/s1/sources.html?page=reddit&connected`);await (await section('帖子')).click();await handed('Reddit的 2 个帖子');h=(await kw()).handoffs.at(-1);assert.match(h.brief,/r\/selfhosted/);
 // Issues and Discussions ticked together go into one task.
 await page.goto(`${base}/tests/s1/sources.html?page=github&connected`);await page.getByRole('heading',{name:'Issues',exact:true}).locator('xpath=..').locator('[data-all-check]').click();await (await section('Discussions')).click();h=await handed('GitHub Issues','community-summary');assert.match(h.title,/GitHub Discussions/);
 // 访问 · 页面详情: the page's views, key events and search queries; 优化现有页面.
 // 访问, GitHub Traffic and 下载量 lists (2026-10-08): ticked rows from the bar at the bottom.
 await page.goto(`${base}/tests/s1/sources.html?page=website-sources&connected`);await page.locator('tbody tr').filter({hasText:'google'}).getByRole('checkbox').click();await expect(page.getByRole('toolbar',{name:'批量操作'})).toContainText('1个来源已选');await bulk().click();await handed('看懂来自 google 的访问','change-research');
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/google（organic）：浏览 9,000/);
 await page.goto(`${base}/tests/s1/sources.html?page=website-pages&connected`);await page.locator('tbody tr').nth(0).getByRole('checkbox').click();await bulk().click();await handed('优化 /docs/install','optimize-page');
 await page.goto(`${base}/tests/s1/sources.html?page=github&connected`);await page.locator('[data-referrer="news.ycombinator.com"] [data-row-check]').click();await page.locator('[data-path] [data-row-check]').first().click();await expect(page.getByRole('toolbar',{name:'批量操作'})).toContainText('2项已选');await bulk().click();h=await handed('访问来源');assert.match(h.title,/热门页面/);
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/news\.ycombinator\.com：浏览 2,400/);
 await page.goto(`${base}/tests/s1/sources.html?page=downloads&connected`);await page.locator('[data-package="npm:@nocobase/client"] [data-row-check]').click();await bulk().click();await handed('查清 @nocobase/client 下载量变化的原因');
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/@nocobase\/client（npm）：15,200，前一期 12,000，变化 \+27%/);
 await page.goto(`${base}/tests/s1/sources.html?page=website-pages&connected`);await page.getByRole('button',{name:'/docs/install'}).first().click();await page.getByRole('dialog').getByRole('button',{name:'交给 Agent'}).click();
 await handed('优化 /docs/install','optimize-page');
 h=(await kw()).handoffs.at(-1);assert.match(h.brief,/关键事件 120/);
 assert.deepEqual(errors,[]);
 console.log('PASS: 交给 Agent creates the task, not started, with the suggested 做法 and opens its page (from the bar that floats up when rows are ticked) from 访问 (sources, pages), GitHub (referrers, popular pages, Issues with Discussions), 下载量, 搜索表现 (接近首页 with pages linked, 查询 with the ranking page looked up, 页面), 找新词, 排名跟踪 (weekly checks in the brief), 竞品 (keywords → 内容选题与大纲, pages → 竞品对比) 页面 (detail drawer, and 性能检查 opening 审计 with the page filled in), 论坛 (unanswered), Hacker News, Reddit, X, Discord, 趋势 (picked related searches → 内容选题与大纲), 竞品动态 (picked updates → 竞品对比), GitHub Issues and Discussions (社区问题汇总) and 访问 (page detail); each opens the task page. Mocked API only.');
}finally{await browser.close();}
