# 技术结构与运行边界

更新：2026-10-07。

## 组成

| 部分 | 技术 | 运行位置 | 源码 |
| --- | --- | --- | --- |
| 前端 | React、TypeScript、Refine、shadcn（NocoBase Portal 模板） | NocoBase Portal `main`，地址 `/x/main/` | `apps/portal` |
| 服务端插件 | NocoBase 插件，CommonJS；任务执行模块用 TypeScript 编译到 `dist/execution` | NocoBase 服务器（3.0.0-alpha.7） | `plugins/connections` |
| 本机 Agent | Node.js 命令行，调用 Claude Code | 执行任务的人的电脑 | `apps/agent` |
| 数据库 | PostgreSQL | 和 NocoBase 同一台机器（Docker） | — |

在线 AI 用 NocoBase AI 插件的模型服务和 AI 员工 atlas；每日分析是插件建的 NocoBase 工作流（定时触发，插件自带的节点）。

## 数据存放

插件启动时自动建好自己的表（`server/tables.js`，已有的不动）：

| 表 | 放什么 |
| --- | --- |
| nrSnapshots | 按 key 存的 JSON：项目（`project`、`project:<id>`）、策略与机会（`strategy:<id>`）、各数据源的数据和视图、记忆、知识库、Skills、运行记录等 |
| nrTasks | 任务：标题、状态、项目、依据与执行记录（evidence） |
| nrGoogleLinks、nrSyncJobs、nrSyncPartitions | Google 授权状态、同步任务、按天的同步数据 |
| nrKeywordRuns、nrKeywordCandidates | DataForSEO 付费查询记录（含费用）与关键词候选 |

密钥存在 NocoBase 的“变量和密钥”（加密），名字以 `NOREACH_` 开头，按项目区分。

## 数据链路

浏览器操作 → 服务端检查登录、管理员身份和项目 → 读取密钥 → 第三方接口 → 存进上面的表 → 信号规则与每日分析 → 页面与任务。

- 同步先暂存，再按项目、来源、日期在一个事务里写入并推进游标。
- 付费查询有请求键、预算预留和复用期；结果不确定时保留记录，不自动重发。
- 公开网页只读 HTTPS、拒绝私网地址、限制大小和跳转。

## 安全与运行限制

- 密钥只在服务端使用，不回显到前端、日志、提示词和仓库。
- 只有 admin、root 角色能用；多人权限还没做。
- 服务和数据库要一直开着；放在个人电脑上时，合上电脑定时任务就停。
- 本机 Agent 只在登记的仓库里改动、开 PR，发布由人确认。

## 源码维护

本仓库是唯一开发源。保留第三方版权头与许可声明（见 [第三方说明](../THIRD_PARTY_NOTICES.md)），依赖版本用锁文件固定；不提交数据库备份、真实数据、会话、密钥、构建产物和日志。构建、测试和部署见 [开发说明](DEVELOPMENT.md)，安装见 [安装与升级](INSTALL.md)。
