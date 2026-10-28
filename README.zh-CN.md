<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/public/assets/nocoreach-mark.svg" width="72" alt="NocoReach">
</p>

<h1 align="center">NocoReach</h1>

<p align="center"><strong>AI 找出增长机会，交给 Agent 执行</strong></p>

<p align="center">AI 增长运营平台 · 基于 NocoBase Core 构建</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoReach/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoReach?label=version&sort=semver" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase%20Core-1f6feb" alt="Built on NocoBase Core"></a>
</p>

<p align="center">
  <a href="https://solutions-cn.nocobase.com/reach/"><strong>在线体验</strong></a> · <a href="https://www.nocobase.com/solution-reach/">官网介绍</a> · <a href="README.md">English</a> · <strong>简体中文</strong> · <a href="README.ja-JP.md">日本語</a>
</p>

https://github.com/user-attachments/assets/25e0c3ba-ddd5-4dad-be9c-179bc145cd9b

NocoReach 是 AI 增长运营平台，接入网站、搜索、AI 搜索、社区、社交媒体和竞品等 20 多个数据源，每天自动分析所有数据的变化，找出数据里的机会，把值得做的市场动作交给 Agent 执行；改动由你审核，上线后自动对比效果。

## 特点

- **一站式完成**：查找关键词、查看数据、交给 Agent 撰写、审核发布和效果对比，都在同一个系统中完成。推荐与市场建议综合全部接入的数据，更加精准。
- **22 个数据源，统一存储**：GA4、Search Console、关键词与排名、Google Trends、竞品、AI 搜索（ChatGPT、Google AI 概览）、GitHub、npm / PyPI / Docker Hub、Discourse、Discord、Slack、Reddit、Hacker News、X、YouTube、Bilibili、小红书。缺的数据源，可以让 Coding Agent 开发。
- **每日分析**：44 条内置规则找出变化，AI 逐条给出结论（建议处理、建议观察、无需处理），值得做的市场动作写成带依据的机会。规则可以让 AI 帮忙调整：AI 参考各条规则最近找出的变化提出修改，你确认后生效，让规则更符合你的实际需求。
- **Agent 执行**：Claude Code、Codex 等编码 Agent 通过 Runner 运行在你的电脑或服务器上，多项任务并行。内置 12 种做法，覆盖调研、内容创作、内容优化和技术修复；可以修改，也可以让 AI 起草新的做法。
- **人工审核**：文章按读者看到的样子预览，页面改动显示前后对比，通过后才发布。
- **效果对比**：上线后第 7、28 天，自动对比改动页面的搜索点击和浏览量。
- **可定制**：Skills（通用 SKILL.md 格式）、项目知识、分析规则和做法都可以按团队调整；源码开放，可以让 Coding Agent 按需求定制。
- **自托管**：数据存在你自己的服务器上，模型与 Agent 自由选择，Apache-2.0 开源。

## 界面

<table>
  <tr>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/insights-zh.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/insights-zh-thumb.webp" width="240" alt="洞察"></a><br><b>洞察</b><br><sub>每日分析逐条判断当天的变化</sub></td>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/opportunities-zh.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/opportunities-zh-thumb.webp" width="240" alt="机会"></a><br><b>机会</b><br><sub>每个机会都附依据，一键交给 Agent</sub></td>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/tasks-zh.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/tasks-zh-thumb.webp" width="240" alt="任务"></a><br><b>任务</b><br><sub>多项任务并行推进</sub></td>
  </tr>
  <tr>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/traffic-zh.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/traffic-zh-thumb.webp" width="240" alt="访问"></a><br><b>访问</b><br><sub>GA4 访问、来源和关键事件</sub></td>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/keywords-zh.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/keywords-zh-thumb.webp" width="240" alt="关键词"></a><br><b>关键词</b><br><sub>勾选关键词，交给 Agent</sub></td>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/aisearch-zh.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/aisearch-zh-thumb.webp" width="240" alt="AI 搜索"></a><br><b>AI 搜索</b><br><sub>别人出现、你没有的问题，交给 Agent</sub></td>
  </tr>
</table>

其他页面：

- **数据**：页面、审计、搜索表现、趋势、竞品、GitHub、下载量、论坛、Hacker News、Reddit、X、Discord、Slack、YouTube、Bilibili、小红书
- **运营**：成果、做法、Skills、项目知识、分析规则、Agent、成员与角色、数据接入

## 快速开始

只想先看看：[在线体验](https://solutions-cn.nocobase.com/reach/)已用演示账号自动登录，数据都是虚构的。

在自己的电脑上运行，需要 Node.js 24 和 pnpm：

```bash
git clone https://github.com/nocobase/nocoreach.git
cd nocoreach
pnpm install
pnpm nocobase config init
pnpm dev
```

打开终端中显示的地址，用 `config.yml` 中的初始管理员登录，新建项目后在“设置 › 数据接入”中接入数据。生产部署请参考[构建与部署](docs/APP-TEMPLATE.md)；默认使用 SQLite，PostgreSQL 和 MySQL 的准备、配置与验证步骤见[多数据库部署](docs/DATABASE-DEPLOYMENT.zh-CN.md)。

## 许可证

NocoReach 基于 NocoBase Core 构建，以 [Apache-2.0](LICENSE) 协议开源。
