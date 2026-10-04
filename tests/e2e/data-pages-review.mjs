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
  await expect(page.locator('[data-metric="Star 总数"]')).toContainText('24,414');await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(28);await expect(page.getByText('独立访客按天统计')).toBeVisible();
  await expect(page.getByText('news.ycombinator.com')).toBeVisible();await expect(page.locator('[data-discussions]')).toContainText('近 90 天共 24 个讨论，9 个已有答案');await expect(page.locator('[data-discussions]')).toContainText('还没有答案');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`github overflow ${width}`);}
 await page.goto(`${base}/tests/s1/sources.html?page=github`);await expect(page.getByRole('button',{name:'接入 GitHub'})).toBeVisible();
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=community&connected${dark?'&dark':''}`);
  await expect(page.locator('[data-metric="已标记解决"]')).toContainText('7%');await expect(page.locator('.nr-data-note').first()).toContainText('社区数据从');await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();
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
 // 趋势: each term's last four weeks, the 12-month lines, related searches (new ones marked), not-connected state.
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=trends&connected${dark?'&dark':''}`);
  await expect(page.getByRole('heading',{name:'趋势',exact:true})).toBeVisible();await expect(page.locator('[data-metric="NocoBase"]')).toContainText('68');await expect(page.locator('[data-metric="NocoBase"]')).toContainText('↑ 31%');await expect(page.locator('[data-metric="Retool"]')).toContainText('↓ 6%');
  await expect(page.locator('[data-trends-chart] .recharts-line')).toHaveCount(2);await expect(page.locator('[data-list="rising"] [data-query="nocobase ai"]')).toContainText('本周新出现');await expect(page.locator('[data-list="rising"]')).toContainText('+350%');
  await expect(page.getByRole('link',{name:'在 Google Trends 打开'})).toBeVisible();
  if(process.env.NR_SHOTS)await page.screenshot({path:`${process.env.NR_SHOTS}/trends-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`trends overflow ${width}`);}
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=trends`);await expect(page.getByRole('button',{name:'接入趋势'})).toBeVisible();
 // 竞品 › 动态: competitor cards (pages, stars this week, latest release), updates, add (a name from 记忆) and remove, the 查域名 tab.
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=competitors&connected${dark?'&dark':''}`);
  await expect(page.getByRole('tab',{name:'动态'})).toHaveAttribute('aria-selected','true');await expect(page.locator('[data-competitor="Appsmith"]')).toContainText('Star 36.2k（近一周 +340）');await expect(page.locator('[data-competitor="Appsmith"]')).toContainText('最新版本 v1.62');await expect(page.locator('[data-competitor="Retool"]')).toContainText('1,840 个页面');
  await expect(page.locator('[data-event]')).toHaveCount(3);await expect(page.locator('[data-event="page"]').first()).toContainText('Retool · 新页面 · AI agents for operations');
  if(process.env.NR_SHOTS)await page.screenshot({path:`${process.env.NR_SHOTS}/competitors-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`competitors overflow ${width}`);}
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:'添加竞品'}).click();let dlg=page.getByRole('dialog');await dlg.getByRole('button',{name:'ToolJet'}).click();await expect(dlg.getByLabel('竞品名称')).toHaveValue('ToolJet');await expect(dlg.getByRole('button',{name:'添加'})).toBeDisabled();
 await dlg.getByLabel('竞品 GitHub 仓库').fill('https://github.com/ToolJet/ToolJet');await dlg.getByRole('button',{name:'添加'}).click();await expect(page.locator('[data-competitor="ToolJet"]')).toContainText('正在第一次查看');
 await page.getByRole('button',{name:'不再关注 ToolJet'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'不再关注'}).click();await expect(page.locator('[data-competitor="ToolJet"]')).toHaveCount(0);
 assert.deepEqual(await page.evaluate(()=>window.__comp.filter(c=>c.action==='add'||c.action==='remove').map(c=>[c.action,c.name||c.competitorId,c.repo||''])),[['add','ToolJet','https://github.com/ToolJet/ToolJet'],['remove','c3','']]);
 // AI 识别: those already followed shown but not tickable, the rest ticked within the room left; added together.
 await page.getByRole('button',{name:'AI 识别'}).click();dlg=page.getByRole('dialog');await expect(dlg.locator('[data-candidate="Retool"]')).toContainText('已经在列表里');await expect(dlg.locator('[data-candidate="Retool"]').getByRole('checkbox')).toBeDisabled();
 await expect(dlg.locator('[data-candidate="ToolJet"]')).toContainText('tooljet.com · ToolJet/ToolJet');await dlg.locator('[data-candidate="Budibase"]').getByRole('checkbox').click();await dlg.getByRole('button',{name:'添加 1 个'}).click();
 await expect(page.locator('[data-competitor="ToolJet"]')).toBeVisible();assert.deepEqual(await page.evaluate(()=>window.__comp.filter(c=>c.action==='add').at(-1).items),[{name:'ToolJet',site:'https://tooljet.com',repo:'ToolJet/ToolJet'}]);
 assert.deepEqual(await page.evaluate(()=>window.__comp.filter(c=>c.action==='suggest').map(c=>c.force)),[true],'asked again from the button');
 await page.getByRole('tab',{name:'查域名'}).click();await expect(page.getByLabel('域名',{exact:true}).or(page.getByText('先接入 DataForSEO'))).toBeVisible();await expect(page.getByRole('heading',{name:'竞品',exact:true})).toHaveCount(1);
 // nothing followed yet: AI 识别 runs by itself and everything found is ticked; adding by hand is one click away; without an online AI it says so
 await page.goto(`${base}/tests/s1/sources.html?page=competitors`);const first=page.locator('[data-first-suggest]');await expect(first.locator('[data-candidate]')).toHaveCount(4);await first.getByRole('button',{name:'添加 4 个'}).click();await expect(page.locator('[data-competitor]')).toHaveCount(4);
 assert.deepEqual(await page.evaluate(()=>window.__comp.filter(c=>c.action==='suggest').map(c=>c.force)),[false],'the first look reuses a recent answer');
 await page.goto(`${base}/tests/s1/sources.html?page=competitors&noai`);await expect(page.locator('[data-first-suggest]').getByRole('alert')).toHaveText('还没有接入在线 AI，可以手动添加');await page.getByRole('button',{name:'手动添加'}).click();await expect(page.getByLabel('竞品名称')).toBeVisible();
 // X: mentions, engagement, the month's spending against the cap, daily counts, top and newest posts, not-connected state.
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=x&connected${dark?'&dark':''}`);
  await expect(page.getByRole('heading',{name:'X',exact:true})).toBeVisible();await expect(page.locator('[data-metric="提及"]')).toContainText('86');await expect(page.locator('[data-metric="本月花费"]')).toContainText('$1.90 / $5');
  await expect(page.locator('[data-x-post="1801"]').first()).toContainText('♥ 210');await expect(page.getByText('实际账单以 X 开发者后台为准')).toBeVisible();
  if(process.env.NR_SHOTS)await page.screenshot({path:`${process.env.NR_SHOTS}/x-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`x overflow ${width}`);}
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=x`);await expect(page.getByRole('button',{name:'接入 X'})).toBeVisible();
 // Discord and Slack, one page each: messages, questions, maybe unanswered, channels, threads with most replies, not-connected state.
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=discord&connected${dark?'&dark':''}`);
  await expect(page.getByRole('heading',{name:'Discord',exact:true})).toBeVisible();await expect(page.locator('[data-metric="可能没人回"]')).toContainText('2');await expect(page.locator('[data-chat-channel="help"]')).toContainText('640 条 · 51 问 · 2 没人回');
  await expect(page.locator('[data-chat-message]').first()).toContainText('怎么配置 SSO 登录？');await expect(page.getByText('服务器：NocoBase')).toBeVisible();
  if(process.env.NR_SHOTS)await page.screenshot({path:`${process.env.NR_SHOTS}/discord-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`discord overflow ${width}`);}
 await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/tests/s1/sources.html?page=slack&connected`);await expect(page.getByRole('heading',{name:'Slack',exact:true})).toBeVisible();await expect(page.getByText('工作区：NocoBase 工作区')).toBeVisible();await expect(page.locator('[data-metric="消息"]')).toContainText('392');
 await page.goto(`${base}/tests/s1/sources.html?page=discord`);await expect(page.getByRole('button',{name:'接入 Discord'})).toBeVisible();await page.goto(`${base}/tests/s1/sources.html?page=slack`);await expect(page.getByRole('button',{name:'接入 Slack'})).toBeVisible();
 // 访问: totals against the period before, the daily line with 初步 days, sources and pages tables, a page's details with its queries.
 for(const [width,height,dark] of [[1440,900,false],[390,844,true]]){await page.setViewportSize({width,height});await page.goto(`${base}/tests/s1/sources.html?page=website&connected${dark?'&dark':''}`);
  await expect(page.getByRole('heading',{name:'访问',exact:true})).toBeVisible();await expect(page.locator('[data-metric="浏览量"]')).toContainText('113K');await expect(page.locator('[data-website-chart] .recharts-area')).toHaveCount(1);
  await expect(page.getByRole('tab',{name:/^来源/})).toHaveAttribute('aria-selected','true');await expect(page.locator('tbody tr')).toHaveCount(2);
  if(process.env.NR_SHOTS)await page.screenshot({path:`${process.env.NR_SHOTS}/website-${width}.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`website overflow ${width}`);}
 await page.setViewportSize({width:1440,height:900});await page.getByRole('tab',{name:/^页面/}).click();await page.getByRole('button',{name:'/docs/install'}).click();
 await expect(page.getByRole('dialog')).toContainText('关联的搜索查询');await expect(page.getByRole('dialog')).toContainText('nocobase install');await page.getByRole('button',{name:'关闭详情'}).click();
 await page.goto(`${base}/tests/s1/sources.html?page=website`);await expect(page.getByRole('button',{name:'接入 GA4'})).toBeVisible();
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
 console.log('PASS: 访问 (totals, daily line, sources and pages, page details with queries, not-connected); 下载量 (totals with change, notes, daily chart, one row per package with Docker pulls and total, range and custom dates refetch, not-connected state); GitHub page (KPIs, daily stars, traffic caveat, referrers, discussions, not-connected state); 论坛 page (Discourse: KPIs, coverage note, chart, unanswered) and Hacker News page (mentions, daily bars, top stories, latest comments, not-connected state); Reddit page (threads first seen in range, subreddits, visits from Reddit, check now, not-connected state); 访问 · 来源 lists visits from Reddit with a link to the Reddit page; 页面 shows tasks in progress per page and a detail drawer (daily views and clicks with the go-live day, tasks with day-7/28 effects), range without custom dates; 1440 light and 390 dark without overflow. Mocked API only.');
}finally{await browser.close();}
