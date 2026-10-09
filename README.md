# NocoReach

English: [README.en.md](README.en.md)

当前已迁至官方 **nocobase/nocobase3** 应用：源码入口为 [`apps/nocoreach`](apps/nocoreach)，采用独立 SQLite。本地核心流程已验证，外部服务端到端验收仍有缺口；验证边界见 [迁移记录](docs/NOCOBASE3-MIGRATION.md)。

NocoReach 是给内容放在 Git 仓库里的团队（重点是开源产品）用的 AI 内容优化工作台，基于 NocoBase 3。

它每天读你的网站和产品数据（Google Analytics、Search Console、GitHub、社区、DataForSEO 等），由在线 AI 找出最值得做的事；你点“交给 Agent”，你自己电脑上的 Claude Code 按团队的做法修改网站仓库并提交 PR；你在 NocoReach 里看过效果再发布，之后系统在第 7 天和第 28 天对比改动前后的数据。

```
接数据 → 每日分析 → 机会 → 交给 Agent → 改仓库、开 PR → 你确认发布 → 核实上线 → 看效果
```

## 主要功能

- **洞察**：每天的关键指标、最新变化（每条都有 AI 的结论）、今天值得做的事、等你处理的事。
- **机会与任务**：每个机会都附依据；交给 Agent 后按做法执行，你在关键一步把关，任务有列表和看板两种视图。
- **AI 团队**：本机 Agent（Claude Code）与在线 AI；可编辑的做法、Skills、项目知识（记忆和知识库）；分析规则（找变化的规则可开关、改数字，写团队侧重点）。
- **数据页**：访问、页面、审计、GitHub、下载量、搜索表现、关键词、竞品、AI 搜索、趋势、论坛、Hacker News、Reddit、X、Discord、Slack。每页的数据都能交给 Agent。
- **中英文**：界面可以切换中文和英文；AI 写的内容按项目设的语言写。
- **安全**：密钥加密存在服务端；Agent 只改登记的仓库，发布必须由人确认；付费查询有月度预算，结果不确定时不自动重试。

## 开始使用

- [安装与升级](docs/INSTALL.md)：用 NocoBase 命令行在一台新机器上装好 NocoReach。
- [使用手册](docs/GUIDE.md)：第一次怎么设置、每天怎么用、哪些会花钱。

已支持管理员和成员两种角色；还缺什么见 [路线图](docs/ROADMAP.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [产品设计 SPEC](SPEC.md) | 定位、对象、流程、页面与规则（当前有效的设计） |
| [路线图](docs/ROADMAP.md) | 已完成、还缺什么、待决定的问题 |
| [验收记录](docs/ACCEPTANCE.md) | 每次交付怎么验证的 |
| [设计决策](docs/DECISIONS.md) | 为什么这样设计 |
| [交付变更](CHANGELOG.md) | 实际交付了什么 |
| [技术结构](docs/architecture.md)、[开发说明](docs/DEVELOPMENT.md) | 组成、数据存放、构建、测试与部署 |
| [协作规则](CONTRIBUTING.md) | 代码、设计、测试怎么一起更新 |
| [市场调研](docs/research/) | 同类产品与方案研究 |
| [历史归档](docs/archive/README.md) | 被替代的设计与计划 |

## 源码

| 目录 | 内容 |
| --- | --- |
| [`apps/nocoreach`](apps/nocoreach) | 新框架应用，前端 client、后端 server、数据库 database |
| [`apps/agent`](apps/agent) | 本机 Agent |

复用代码的归属见 [第三方说明](THIRD_PARTY_NOTICES.md)。
