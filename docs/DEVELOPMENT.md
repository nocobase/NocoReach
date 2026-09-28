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

## 基于现有产品增量开发（2026-09-28 更新）

SPEC 的重写不是重建指令。默认继续使用现有 NocoBase 3、Portal、连接插件、模型和测试；不创建平行应用、不无依据替换技术栈、不删除已有业务数据或可用模块。若确有替换必要，先给出复用不可行的证据、影响范围与迁移办法。

以下是开发定位入口，不等于所有能力都已完整验收：

| 现有源码入口 | 优先检查与复用的内容 |
| --- | --- |
| apps/portal/src/routes.tsx、analysis-navigation.ts | 路由、业务导航与兼容入口 |
| apps/portal/src/pages/reach-workspace.tsx、reach-managed.tsx、reach-data.tsx | 工作区、现有业务管理与数据访问逻辑 |
| apps/portal/src/pages/analytics.ts、period.ts、workspace-cache.tsx | 指标计算、周期与页面缓存 |
| apps/portal/src/pages/google-connection.tsx、sync-panel.tsx | Google 接入和同步状态交互 |
| apps/portal/src/pages/keyword-research.tsx、keyword-api.ts、seo-opportunities.tsx | 关键词研究、候选与内容机会链路 |
| plugins/connections/server/ | Google、同步、关键词研究的服务端能力 |
| schemas/、tests/unit/、tests/e2e/ | 已有模型定义与回归基础；不是完整迁移集 |

每个开发任务先完成以下步骤：

1. 读取最新规格、路线图和验收，检查相关源码与当前工作区改动。
2. 明确本切片复用什么、调整什么、新增什么，以及仍未验证的依赖。
3. 对应用户流程补充必要细节后做最小可评审改动，不把整个路线图一次性实现。
4. 数据结构优先兼容扩展；需要迁移时明确旧任务、连接、研究记录和用户内容的保留方式，不能用重置数据库代替迁移。
5. 验证新增流程及受影响的既有能力，分别记录设计、实现、部署和验收状态。

新 Agent 与发布能力的技术方案尚未确定。概念对象不等于必须立即新建同名集合；先评估现有项目、nrTasks、研究与同步记录的承接方式，再决定扩展或新增。

## 连接插件前端入口

即使业务 UI 位于 Portal，管理后台仍需加载连接插件的前端入口。发布前执行 `node plugins/connections/scripts/build-client.cjs`，验证后发布 client.js、client-v2.js 及生成的 dist/client、dist/client-v2。宿主使用版本化静态资源时，还须将同一构建产物同步到当前 storage/dist-client/<version>/static/plugins/@nocoreach/plugin-connections/dist/ 对应目录，不能只更新插件目录。不要手工改写部署产物。

## 目标与方案增量

`src/pages/strategy` 复用 nocobase-ai 扩展和现有认证；`nrStrategy` 在服务端检查管理员身份与项目存在性。目标和方案保存在已有 nrSnapshots 的 strategy 项目记录，确认方案复用 nrTasks；数据库事务锁、版本号与请求标识防止重复提交及并发覆盖。尚未作为通用多租户能力验收。

前端解析测试：在 apps/portal 运行 `pnpm exec vitest run tests/strategy.test.ts`。真实策略 E2E 使用 NR_PORTAL_URL、NR_API_TOKEN（合法测试身份）和可选 NR_CHROMIUM_PATH；仅显式设置 NR_TEST_MODEL=1 时调用真实模型。不要将凭据写入仓库。

若构建包装器因更新检查权限失败，可直接用 Node 24 执行 `node_modules/typescript/bin/tsc`、`node_modules/vite/bin/vite.js build` 和 `scripts/build-html.mjs`，发布同一仓库构建产物，不手工改写 dist。

## 发现机会首页与上下文

主入口改为 /home，/project/strategy 重定向兼容。StrategyAIService 每轮通过 nrStrategy 读取已保存目标与证据，再调用 NocoBase aiConversations:updateOptions 更新会话配置，然后发送消息；仅在 sendMessages 请求中附加 systemMessage 无效。会话历史保存在原 AI 服务，本浏览器只保存会话标识，恢复时与当前用户可访问会话交叉核对；不承诺跨设备自动恢复。

confirmDirection 在同一事务中保存方向与创建任务，并校验机会仍存在、独立行动目标与请求幂等（旧方案仍保留原目标版本规则）。页面不会自动确认或发布。发现机会真实 E2E：tests/e2e/discovery-review.mjs（NR_PORTAL_URL、NR_API_TOKEN、可选 NR_CHROMIUM_PATH），会调用真实模型但不确认业务任务或修改用户目标。原 strategy-review.mjs 现仅验证临时记录保存/确认等后端流程，不再验证已替换的旧页面。


## 机会优先首页

nrSnapshots 中的策略记录兼容增加 insights 批次（生成时间、证据、卡片），保存校验内容长度与必需字段，ID 由服务端分配。历史 goal 和 proposals 保留。新行动 confirmDirection 要求 objective，不再要求全局 goal；机会行动保留对应卡片与证据，自由探索行动允许无 insightId。过期机会不能静默绑定到新卡片。

前端复用原 AIChatProvider，首次无卡片时生成，之后直接读取已保存洞察；更新失败保留旧批次。讨论按需展开，selectedOpportunity 每轮写入会话上下文。后台持续观察不属于此次实现。


## 2026-09-28 — 独立机会讨论页

机会子页与自由探索路由复用 strategy 模块；AI 根 Provider 按项目与页面范围重建，浏览器会话标识增加机会 scope，防止不同机会串用对话。原全局会话未删除。


## 2026-09-28 — 机会库

策略记录兼容增加 insightHistory；saveInsights 在原事务和版本锁内先保存旧批次再写最新批次，重复请求沿用原幂等机制。历史按稳定机会 ID 查找，讨论和任务确认使用对应历史批次的证据。本地试用采用 JSON 历史批次及前端分页，数据量增长后需独立集合及服务端分页。
