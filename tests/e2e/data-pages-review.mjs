import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// Isolated data pages (apps/portal/tests/s1/sources.html?page=downloads|github|community|content): mocked API, no auth or network.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // 下载量 (网站与产品): totals with change, the daily chart, one row per package with Docker's pulls and total.
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){
  await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=downloads&connected${dark?'&dark':''}`);
  await expect(page.getByRole('heading',{name:'下载量',exact:true})).toBeVisible();await expect(page.locator('[data-metric="下载量"]')).toContainText('15,200');await expect(page.locator('[data-metric="下载量"]')).toContainText('27%');
  await expect(page.getByText('Docker 拉取从 2026-09-10 开始每天记录')).toBeVisible();await expect(page.locator('.recharts-area')).toBeVisible();
  await expect(page.locator('[data-package="docker:nocobase/nocobase"]')).toContainText('Docker Hub · 拉取');await expect(page.locator('[data-package="docker:nocobase/nocobase"]')).toContainText('1,250,000');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`downloads overflow ${width}`);
 }
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=downloads&connected`);
 const count=()=>page.evaluate(()=>window.__calls.filter(c=>c==='nrDataViews:downloads').length);const before=await count();
 await page.getByRole('button',{name:'近 90 天'}).click();await expect.poll(count).toBeGreaterThan(before);await expect(page.getByRole('button',{name:'近 90 天'})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'自定义'}).click();await expect(page.getByLabel('开始日期')).toBeVisible();await page.getByLabel('开始日期').fill('2026-09-01');await expect.poll(count).toBeGreaterThan(before+1);
 await page.goto(`${base}/tests/s1/sources.html?page=downloads`);await expect(page.getByRole('button',{name:'接入软件包'})).toBeVisible();
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=github&connected${dark?'&dark':''}`);
  await expect(page.locator('.nr-data-kpis')).toContainText('24,414');await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(28);await expect(page.getByText('独立访客按天统计')).toBeVisible();
  await expect(page.locator('table').first()).toContainText('news.ycombinator.com');await expect(page.locator('[data-discussions]')).toContainText('近 90 天共 24 个讨论，9 个已有答案');await expect(page.locator('[data-discussions]')).toContainText('还没有答案');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`github overflow ${width}`);}
 await page.goto(`${base}/tests/s1/sources.html?page=github`);await expect(page.getByRole('button',{name:'接入 GitHub'})).toBeVisible();
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=community&connected${dark?'&dark':''}`);
  await expect(page.locator('.nr-data-kpis')).toContainText('7%');await expect(page.locator('.nr-data-note').first()).toContainText('社区数据从');await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();
  await expect(page.getByRole('heading',{name:'论坛',exact:true})).toBeVisible();await expect(page.getByText('Discourse 论坛')).toBeVisible();
  await expect(page.getByText('插件无法加载')).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`community overflow ${width}`);
  // Hacker News page: mentions with change, the daily bars, top stories and latest comments.
  await page.goto(`${base}/tests/s1/sources.html?page=hackernews&connected${dark?'&dark':''}`);await expect(page.getByRole('heading',{name:'Hacker News',exact:true})).toBeVisible();await expect(page.locator('[data-metric="提及"]')).toContainText('6');await expect(page.getByText('搜索词：nocobase')).toBeVisible();
  await expect(page.locator('[data-story]')).toContainText('Show HN: NocoBase 2.0');await expect(page.locator('[data-story]')).toContainText('120 分 · 40 条评论');await expect(page.locator('[data-comment]')).toContainText('We moved to NocoBase last year.');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`hn overflow ${width}`);}
 await page.goto(`${base}/tests/s1/sources.html?page=hackernews`);await expect(page.getByRole('button',{name:'接入 Hacker News'})).toBeVisible();
 // Reddit page: threads first seen in range with subreddits, visits from Reddit, check now, not-connected state.
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=reddit&connected${dark?'&dark':''}`);
  await expect(page.getByRole('heading',{name:'Reddit',exact:true})).toBeVisible();await expect(page.locator('[data-metric="新发现的帖子"]')).toContainText('9');await expect(page.locator('[data-metric="来自 Reddit 的访问"]')).toContainText('180');
  await expect(page.locator('[data-post="abc"]')).toContainText('r/selfhosted · 发帖 2026-09-28');await expect(page.locator('[data-post="def"]')).toContainText('发现于 2026-09-22');await expect(page.getByRole('link',{name:/^r\/nocode/})).toContainText('3 个');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`reddit overflow ${width}`);}
 await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'立即查找'}).click();await expect(page.getByText('新发现 2 个帖子')).toBeVisible();
 await page.goto(`${base}/tests/s1/sources.html?page=reddit`);await expect(page.getByRole('button',{name:'接入 Reddit 讨论'})).toBeVisible();
 // 访问 · 来源: visits from Reddit with its source rows and a link to the Reddit page.
 await page.goto(`${base}/tests/s1/sources.html?page=website-sources&connected`);const rv=page.locator('[data-reddit-visits]');await expect(rv).toContainText('会话');await expect(page.getByText('来源：reddit.com / referral（260 PV）')).toBeVisible();
 await page.getByRole('button',{name:'看 Reddit 上的帖子'}).click();
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=content&connected`);await expect(page.getByRole('button',{name:'自定义'})).toHaveCount(0);
 await page.getByRole('button',{name:'近 90 天'}).click();await expect(page.getByRole('columnheader',{name:'访问（近 90 天）'})).toBeVisible();
 // 内容 详情: tasks in progress per page, daily chart with the go-live day marked, tasks with their effect checks.
 await page.goto(`${base}/tests/s1/sources.html?page=content&connected`);const install=page.locator('tbody tr').filter({hasText:'安装指南'});
 await expect(install).toContainText('T-13 补充 Docker');await install.getByRole('button',{name:'安装指南'}).click();
 await expect(page.locator('[data-content-chart] .recharts-line')).toHaveCount(2);await expect(page.locator('[data-content-chart]')).toContainText('T-12 上线');
 await expect(page.locator('[data-content-task="501"]')).toContainText('第 7 天：上升，搜索点击 30 → 45（+50%）');await expect(page.locator('[data-content-task="501"]')).toContainText('第 28 天：预计');
 await expect(page.locator('[data-content-task="502"]')).toContainText('进行中');await page.getByRole('button',{name:'关闭详情'}).click();
 assert.deepEqual(errors,[]);
 console.log('PASS: 下载量 (totals with change, notes, daily chart, one row per package with Docker pulls and total, range and custom dates refetch, not-connected state); GitHub page (KPIs, daily stars, traffic caveat, referrers, discussions, not-connected state); 论坛 page (Discourse: KPIs, coverage note, chart, unanswered) and Hacker News page (mentions, daily bars, top stories, latest comments, not-connected state); Reddit page (threads first seen in range, subreddits, visits from Reddit, check now, not-connected state); 访问 · 来源 lists visits from Reddit with a link to the Reddit page; 页面 shows tasks in progress per page and a detail drawer (daily views and clicks with the go-live day, tasks with day-7/28 effects), range without custom dates; 1440 light and 390 dark without overflow. Mocked API only.');
}finally{await browser.close();}
