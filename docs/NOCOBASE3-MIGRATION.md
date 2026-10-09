# nocobase/nocobase3 迁移记录

状态：2026-10-09，迁移实现及本地核心流程验收完成；外部服务端到端验收尚未完成。逐项证据见 [验证记录](NOCOBASE3-VERIFICATION.md)。

## 范围与源码入口

用户批准使用官方脚手架创建 `apps/nocoreach`，采用独立 SQLite。只迁移旧版已实现功能，不修复旧版已有问题，不补齐规划功能，不迁移数据库，不兼容 alpha.7。

- 复用：现有页面、业务组件、文案、数据分析与任务业务规则、本机 Agent。
- 调整：业务页面通过新框架路由与 API Client 加载；业务服务使用原生数据库 Repository、身份与权限服务、密钥服务、AI 服务、通知和 Jobs/Scheduler。
- 新增：应用业务表迁移、业务持久化与操作入口、原生框架集成测试。
- 依赖：Node.js 24 以上、pnpm 11；官方 npm.nocobase.ai 包注册表。没有依赖旧版运行目录。

旧版 `apps/portal` 与 `plugins/connections` 已移除，可从 Git 提交 `ac9addb430a0b3c70f09f526a8bcb67658f2d1c4` 查阅迁移基线；新功能维护入口为 `apps/nocoreach/client` 和 `apps/nocoreach/server`。本机 Agent 仍在 `apps/agent`。

## 初始化与运行

```bash
pnpm --dir apps/nocoreach install --frozen-lockfile
cd apps/nocoreach
pnpm nocobase config init --dialect sqlite
pnpm dev
```

`config init` 只在首次运行、配置文件不存在时执行。阅读并设置本地 `config.yml` 的初始管理员、密钥与部署配置；不要提交该文件。使用命令打印的地址及挂载路径访问。本次验证使用 `http://127.0.0.1:14030/main/`。

```bash
# 仓库根目录
pnpm typecheck
pnpm test
pnpm build
# 启动构建产物（填写实际对外 origin，不包含 /main）
APP_PUBLIC_ORIGIN=http://127.0.0.1:14030 APP_SERVER_PORT=14030 pnpm start
# 构建本机 Agent
node apps/agent/build.cjs
```

生产模式必须设置 `APP_PUBLIC_ORIGIN`（或 `config.yml` 的 `app.publicOrigin`）为实际对外来源。框架据此检查带 Cookie 的写请求；未配置时会拒绝请求，不应关闭来源检查来绕过。

业务接口位于应用挂载路径下的 `/api/reach/<resource>/<action>`；前端使用原生 API Client 处理挂载路径。本机 Agent 的服务器地址必须包含挂载路径，例如 `https://example.com/main`。Google 回调地址为 `https://example.com/main/api/reach/nrGoogle/callback`。

脚手架记录为 `@nocobase/app-template-default@1.0.0-beta.56`，新框架 `@nocobase/app-server` / `app-client` 为 `2.0.0-beta.1`；这些是 nocobase/nocobase3 的包版本，不能据此误判为旧 NocoBase 2 或 alpha.7 宿主。

## 实现映射

| 原有能力 | 新实现位置与框架能力 |
| --- | --- |
| 页面与导航、项目切换、中英文、主题、密度 | `client/pages`、`client/reach-routes.tsx`、`client/layouts/app-layout.tsx` |
| 登录、用户、框架设置 | 官方 Authentication / Users / Authorization 插件 |
| 管理员、成员、未加入权限 | 原生身份与权限集加应用成员分配；服务端仍检查业务操作权限 |
| 项目、任务、快照、Google 同步与关键词记录 | `database/main/migrations`，`server/providers/reach/store.cjs` 使用原生 Repository |
| 业务 API | `server/routes/reach.ts`，原生 Hono 路由、认证与错误响应 |
| Google / 数据源密钥 | 应用 `nrSettings` 通过原生 Secrets 加密与轮换 |
| 在线 AI 与对话 | 原生 AI 服务、官方 AI UI 扩展；配置保存在未跟踪的服务端 config.yml |
| 每日分析 | 原生 Scheduler 自定义 target + Jobs 执行业务分析；启停由框架调度管理界面负责 |
| 采集与任务执行 | 原生 ScheduleExecutor 调度现有业务服务 |
| 通知 | 原生站内通知；配置 SMTP / Resend 渠道后附加邮件通知 |
| 本机 Agent | 原有独立命令行，改用新业务 API 地址 |

每日分析是一个现有业务服务调用，不为此新建多阶段 Workflow。Scheduler 负责启停与运行记录，业务层保留每日去重、已知安全失败重试与不确定付费结果不自动重试规则。服务端使用上海时区确定每日 09:00。

## 验证边界

业务集成测试覆盖新数据库建表、事务回滚、项目隔离、成员边界、知识保存、任务创建/编号/详情及页面读取接口。框架测试另外验证登录与真实业务 HTTP 路由。浏览器检查、截图清单、未验证项及测试数据说明见 [验证记录](NOCOBASE3-VERIFICATION.md)。

线上旧版基线登录后没有项目，首页显示“创建第一个项目”。不会为对比而向生产创建项目。已填充业务页面需使用本地合成数据并说明来源，不能将其称为线上实测对比。

未配置真实第三方凭据时，只验证未接入、配置及错误交互；Google、DataForSEO、在线模型等真实远程结果不得标为已验证。不确定的付费请求不自动重试。

本地数据库、配置、日志、截图与工作流审查文件位于被忽略的位置，不提交。验收用测试记录必须在报告中列出或清理。
