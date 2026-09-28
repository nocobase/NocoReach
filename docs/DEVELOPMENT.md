# 源码与开发说明

## 目录与唯一开发入口

```text
apps/portal/          当前部署版本的前端源码、模板组件、依赖锁文件
plugins/connections/ 自定义连接插件（直接运行的 CommonJS JavaScript）
schemas/             Google 连接、同步与关键词研究的数据模型定义
tests/unit/          连接策略、OAuth 错误、同步聚合、研究参数测试
tests/e2e/           真实环境导航与交互回归
```

后续新改动以本仓库为源码入口。旧 iteration/round 目录不再作为另一份开发源；宿主中的 Portal 路径作为发布工作目录，修改应来自本仓库。此次入库没有重新部署或更换正在运行的系统。

## 安装与本地构建

当前验证工具链：Node.js 24，pnpm 11。前端依赖以锁文件为准。

```sh
cd apps/portal
pnpm install --frozen-lockfile
cp .env.example .env
pnpm build
pnpm build:html
```

需要本地 Vite 预览时，将本地 `.env` 的 `NOCOBASE_API_URL` 设为授权测试宿主的 API 地址，再运行 `pnpm dev`。浏览器可见环境变量绝不能放 OAuth secret、API password 或令牌。

## 测试

仓库根目录执行 `node --test tests/unit/*.test.cjs`。

真实回归需要已部署且有合法测试数据的 NocoReach，空数据库不能通过已有数据详情测试。安装 Playwright Chromium 后，在本机环境设置 `NR_PORTAL_URL`、`NR_ACCOUNT`、`NR_PASSWORD`，运行 `node tests/e2e/navigation-review.mjs`；可用 `NR_CHROMIUM_PATH` 指定浏览器。不要提交环境变量值或测试截图。该测试不提交付费查询。

## 后端与部署边界

本仓库包含应用源码，不包含 NocoBase 宿主、数据库或私有插件发行包。连接插件入口为 `plugins/connections/server/index.js`；现有插件安装、启用及 Portal 发布必须针对正确的宿主环境执行。

`schemas/` 仅收录现有 Google/同步/关键词模型定义，不是已验证的全量自动迁移。现有基础集合包括 `nrSnapshots`、`nrTasks`、`nrConnectionRequests`，项目初始化当前依赖既有数据；未移入个人备份导入脚本。干净环境一键安装、全量模型迁移、新项目初始化和非管理员权限还未完成，不能承诺克隆即用。

当前源码仍包含项目 1 的试运行假设。它是需要消除的产品限制，不是通用多项目设计。不要通过复制真实项目记录或密钥“补齐”新环境。

发布流程：仓库改动 → 本地测试与构建 → 明确选择宿主与 Portal → 同步必要源文件到发布工作目录 → 发布 → 真实回归 → 同一提交记录设计和验收变化。不直接修改已部署 dist，也不将 `.env`、会话、数据库或日志带入仓库。

所有重新部署、外部授权或付费验证应在相应任务范围内执行；本次仅归档源码并验证，不自动触发采集。
