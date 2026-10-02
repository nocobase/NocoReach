# OpenSEO 第 3 批示意：域名与外链（待用户确认，未开发）

2026-10-03 夜里准备。按约定每批先给用户看示意图，确认后再做。示意图见同目录 [openseo-batch3-mockup.html](openseo-batch3-mockup.html)（浏览器直接打开）。

## 范围（路线图第 7a 项第 3 批）

查任何网站（含竞品）的排名关键词、热门页面、外链；外链里的域名可以免费查 Ahrefs DR。

参考：OpenSEO db8bde1 的 `src/client/features/domain/`（Domain Overview：搜索栏、两个标签“关键词 / 页面”、包含和排除词筛选）和 `src/client/features/backlinks/`（Backlinks：外链增长图、新增与流失、三个标签“外链 / 来源域名 / 热门页面”、dofollow 与网址筛选、Ahrefs DR 查询）。

## 建议做法

- 菜单只加一项“域名与外链”，页面里两个标签：**域名概览**、**外链**（SPEC 已定“同类页面合成一项用标签页”）。
- 搜索栏：输入域名（默认填本站域名），选市场；和关键词研究一样点了就查、不显示价钱，30 天内同样的查询直接打开，花费在数据接入看。
- 域名概览：指标卡（估算自然流量、排名关键词数、前 3／前 10 的词数）+ 两个标签表格：
  - 关键词：关键词、排名、月搜索量、估算流量、排名页面、难度、意图；勾选后“保存为关键词”（进第 2 批的“关键词”页）。
  - 页面：页面、估算流量、排名关键词数。
- 外链：指标卡（外链数、来源域名数、新增、流失）+ 外链增长图（来源域名和外链按月）+ 三个标签表格：
  - 外链：来源页面、目标页面、锚文本、dofollow、首次发现；
  - 来源域名：域名、外链数、首次发现，“查 DR”按钮（Ahrefs 免费接口，不花 DataForSEO 的钱）；
  - 热门页面：被链接最多的本站（或对方）页面。
- 和本站数据对照（我们比 OpenSEO 多的）：查本站域名时，关键词表加“本站点击”（Search Console 近 28 天），能看出估算和实际的差距。
- 不做：OpenSEO 首页那种每次打开自动拍外链快照（会自动花钱）；导出到 Google 表格。

## 每次查询会用到的 DataForSEO 接口（费用按用户规则不在页面显示）

| 页面 | 接口 | 说明 |
| --- | --- | --- |
| 域名概览 | dataforseo_labs/google/domain_rank_overview/live | 指标卡 |
| 域名概览 · 关键词 | dataforseo_labs/google/ranked_keywords/live | 最多 100 行一查 |
| 域名概览 · 页面 | dataforseo_labs/google/relevant_pages/live | 最多 100 行一查 |
| 外链 | backlinks/summary/live、backlinks/history/live | 指标卡与增长图 |
| 外链 · 三个表 | backlinks/backlinks/live、backlinks/referring_domains/live、backlinks/domain_pages/live | 各一查 |

外链接口需要 DataForSEO 账号单独开通 Backlinks（有月费门槛）；没开通时页面说明并只显示域名概览。

## 等你定

1. 外链要不要做？DataForSEO 的 Backlinks 需要另外开通、有最低月费；不做就只做域名概览（关键词、页面）。
2. 打开“域名与外链”时，是只查用户点的那个标签（推荐，省钱），还是一次把概览和两个表都查好（打开就全有，但一次查 3–4 个接口）？
3. 竞品域名要不要记下来（例如在项目知识的“竞品”里），以后每天自动对比？自动对比会每天花钱，建议先不做。
