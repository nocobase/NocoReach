<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/public/assets/nocoreach-mark.svg" width="72" alt="NocoReach">
</p>

<h1 align="center">NocoReach</h1>

<p align="center"><strong>从数据中发现机会，NocoReach 帮你落地。</strong></p>

<p align="center">
AI 增长运营平台。<br>
数据采集、每日分析和 Agent 执行在同一个平台完成。
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong> · <a href="README.ja-JP.md">日本語</a>
</p>

> **项目状态**：NocoReach 处于早期阶段，功能和界面仍在持续调整。欢迎提交 Issue 和 PR。

![洞察：关键指标、今天的变化和 AI 结论](https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/insights-zh.png)

## 数据很多，落地很难

**数据分散。** 搜索数据在 Search Console 和 SEO 工具里，访问数据在 GA4，用户的讨论分布在论坛、社交媒体和社区群组；如果产品开源，还有 GitHub Star 和包下载量。想了解全貌，需要在十几个页面之间来回切换。

**有了数据，仍不知道下一步。** Ahrefs、Semrush 这类 SEO 平台数据全面，提供的是报表和指标。接下来做什么、先做哪一件，仍然要自己判断，执行也要另外安排。

**数据和执行是断开的。** OpenSEO 这类开源工具按量调用数据，成本很低，也可以通过 MCP 把数据交给 Claude Code 等 Agent。但它覆盖的只是 SEO 和 AI 搜索数据，执行发生在各自的本地环境：Agent 只能看到这一次提供给它的信息，做过什么、效果如何，也没有统一的记录。

## NocoReach：从数据到执行，一个平台打通

NocoReach 把增长运营的完整链路放进同一个平台：

```
数据接入 → 每日分析 → 机会 → 任务 → Agent 执行 → 审核发布 → 效果跟踪
```

- **数据集中存储**：已支持 20 多个来源，并在持续增加。搜索、网站、GitHub、包下载、社区和 AI 搜索的数据统一存储在同一个数据库中，可以放在一起分析。NocoReach 是开源的，需要的来源还没有，可以让你的 Agent 直接开发。
- **分析直接给出结论**：每天按规则找出变化，由 AI 判断是否值得处理，并附上依据。
- **Agent 拥有完整上下文**：执行任务时，Agent 可以直接读取相关的指标、关键词、页面、审计结果、社区帖子和项目知识，不需要人工再整理一遍。
- **执行直接进入仓库**：Agent 在网站和文档仓库中修改文件、提交 PR，由你审核合并。
- **结果可以追踪**：上线后第 7 天和第 28 天自动对比数据。每个任务从依据、执行到效果，都有完整记录。

|              | Ahrefs 等 SEO 平台 | OpenSEO 等开源工具         | **NocoReach**                                                              |
| ------------ | ------------------ | -------------------------- | -------------------------------------------------------------------------- |
| 数据范围     | SEO 与 AI 搜索     | SEO 与 AI 搜索             | SEO、AI 搜索、网站、GitHub、社区等 20 多个来源<br>其他市场数据可以自行接入 |
| 下一步做什么 | 根据报表自行判断   | 自行判断，或交给本地 Agent | 每日分析给出机会和依据                                                     |
| 执行         | 在平台之外完成     | 在各自的本地 Agent 中完成  | 平台内交给 Agent，修改仓库、提交 PR                                        |
| 审核与效果   | 自行安排           | 自行安排                   | 人工审核后发布，第 7、28 天自动对比                                        |
| 部署方式     | SaaS               | 自托管                     | 自托管，完整源码                                                           |

## 主要功能

### 数据接入

| 网站与产品                                                                                                      | 搜索与市场                                                                                                                 | 社区                                                                                |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| GA4 访问与转化<br>网站页面与网站审计<br>GitHub Star、Fork、Traffic、Discussions<br>npm、PyPI、Docker Hub 下载量 | Google Search Console<br>关键词研究与排名跟踪<br>Google Trends<br>竞品动态与竞品总览<br>AI 搜索（ChatGPT、Google AI 概览） | Discourse 论坛<br>Hacker News、Reddit、X<br>Discord、Slack<br>YouTube、B 站、小红书 |

- **自动发现**：输入官网地址，AI 找出可接入的文档站、GitHub 仓库和社区论坛，确认后再接入。
- **接入引导**：每个来源都说明需要准备的内容、常见问题，以及接入后能发现的信号。
- **数据健康**：集中显示同步失败和数据过期的来源。

![数据接入](https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/connections-zh.png)

### 每日分析与机会

- 内置 34 条分析规则，把数据归纳为五类信号：变化、缺口、时机、页面表现、转化。
- 每天定时分析。每条变化都有 AI 结论（建议处理、先观察、无需处理），并附理由和依据。
- 标记为“先观察”的变化必须写明观察指标、判断条件和截止日期，到期后给出结论。
- 没有新的发现时，不生成建议。
- 规则可以开关、调整阈值，也可以补充团队的关注重点。

![机会：依据、AI 建议和做法](https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/opportunities-zh.png)

### 任务与 Agent 执行

每个机会都附有依据，包括数据、时间范围和相关页面。确认值得做，就转为任务；否则忽略。

任务按“做法”推进。NocoReach 内置 12 种做法：

| 类型 | 做法                                                                 |
| ---- | -------------------------------------------------------------------- |
| 优化 | 优化现有页面、同步多语言版本                                         |
| 新建 | 新建文档页、撰写博客文章、撰写发布说明、内容选题与大纲、起草社区回复 |
| 调研 | 关键词调研、变化原因调研、竞品对比、社区问题汇总                     |
| 技术 | 技术修复（失效链接、跳转、站点地图、结构化数据）                     |

- **在线 AI** 负责调研、方案和草稿。
- **修改仓库的工作由 Agent 完成**：通过 Runner 在你的电脑或服务器上调用 Claude Code 等编程工具，读取仓库、修改文件、运行检查并提交 PR。每个任务对应一个分支和一个 PR。
- Agent 只能修改允许的目录。使用的模型、调用的工具、被拒绝的操作，都记录在任务页中。

![任务看板](https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/tasks-zh.png)

### 审核、发布与效果跟踪

- 关键节点由人确认：开始执行前查看任务说明，方案完成后审核方案，发布前检查改动。
- PR 由你审核合并。社区回复由 Agent 起草，由你发布到原帖；NocoReach 不会自动发帖。
- 上线后，系统对比改动页面在上线前后的搜索点击和访问量，分别在第 7 天和第 28 天给出结论：上升、下降、无明显变化或数据不足。结论只描述数据变化，不推断因果。
- 支持团队协作：分为管理员和成员两种角色，每个任务有负责人；需要处理的事项通过站内信通知。

### AI 搜索可见度

查询 ChatGPT 和 Google AI 概览在回答相关问题时，是否提到你的产品、引用了哪些页面，以及你和竞品各占多少提及份额。提到竞品而没有提到你的问题，就是优先补充的内容方向。

![AI 搜索：品牌提及和提及份额](https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/ai-search-zh.png)

### 做法、Skills 与项目知识

- **做法**：定义每类任务的步骤和需要人工审核的环节，可以修改，也可以新建。
- **Skills**：采用通用的 SKILL.md 格式，Claude Code 等工具都可以使用；支持从 GitHub 链接导入。
- **项目知识**：品牌、定位、语气、术语和写作规范，随每个任务一起交给 Agent。

## 适合谁

- 希望让 AI 更深入地参与市场工作的任何人；
- 官网、文档或博客存放在 Git 仓库中（Markdown、MDX）的团队，Agent 可以直接修改并提交 PR；
- 开源项目和开发者产品，GitHub、包下载量和技术社区的数据可以一起分析。

## 安全与可控

- **自托管**：部署在你自己的服务器上，数据只在你接入的服务之间传输。
- **密钥加密**：凭据加密存储在服务端。
- **模型自选**：使用你在 NocoReach 中配置的模型和 API Key。
- **费用可控**：DataForSEO 等按量计费的查询可以设置每月预算。
- **权限校验**：每个操作都在服务端检查管理员和成员权限。
- **网络代理**：数据采集支持 HTTP、HTTPS 和 SOCKS5 代理。
- 支持中文和英文界面，一个实例可以管理多个项目。

## 快速开始

需要 Node.js 24 和 pnpm。

```bash
git clone https://github.com/nocobase/nocoreach.git
cd nocoreach
pnpm install
pnpm nocobase config init
pnpm dev
```

打开终端中显示的地址，使用 `config.yml` 中的初始管理员账号登录（正式使用前请修改密码），然后：

1. 新建项目，填写官网地址；
2. 在“设置 → 数据接入”中接入数据源；
3. 在“AI 团队”中配置模型、连接 Runner，并选择默认 Agent；
4. 在“洞察”中查看每日分析结果。

如果只想体验产品，可以使用[模拟数据](docs/MOCK-DATA.md)启动演示环境，无需任何真实账号。生产部署请参考[构建与部署](docs/APP-TEMPLATE.md)；默认使用 SQLite，PostgreSQL 和 MySQL 的准备、配置与验证步骤见[多数据库部署](docs/DATABASE-DEPLOYMENT.zh-CN.md)。

## 基于 NocoBase 3

NocoReach 是一个 [NocoBase 3](https://www.nocobase.com) 应用。账号、权限、通知、定时任务、模型和 Agent 管理由 NocoBase 提供，NocoReach 专注于增长运营本身。完整源码都在这个仓库中，你可以直接修改，也可以交给 Agent 修改。

## 文档

| 文档                                              | 内容                                         |
| ------------------------------------------------- | -------------------------------------------- |
| [开发说明](docs/DEVELOPMENT.md)                   | 代码结构与开发约定                           |
| [模拟数据](docs/MOCK-DATA.md)                     | 无需真实账号，启动演示或测试环境             |
| [构建与部署](docs/APP-TEMPLATE.md)                | 配置、构建与 Docker 部署                     |
| [多数据库部署](docs/DATABASE-DEPLOYMENT.zh-CN.md) | PostgreSQL、MySQL 的驱动、连接配置和部署验证 |
| [变更记录](CHANGELOG.md)                          | 各版本的变更内容                             |
