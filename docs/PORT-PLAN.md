# NocoReach 搬到 NocoBase 3 的计划

2026-10-09 起草。原因：Studio 只能部署 NocoBase 3 新框架的应用（只有 host 一种部署方式，不能跑 Docker），旧 NocoReach 是装在经典 NocoBase 3.0.0-alpha.7 上的插件 + 门户，装不上去。做法：用 `pnpm create @nocobase/app` 新建应用，把旧代码按新框架的位置抄过来。

- 新应用目录：`NocoReach/nocoreach`（应用名 nocoreach），模板 `@nocobase/app-template-default` 1.0.0-beta.56。
- 旧代码：`NocoReach/github-repo`（nocobase/nocoreach 仓库 main 分支），搬完之前继续可用，只作参照。
- 本机开发：Node 24（`~/.local/node24`）+ pnpm 11；`pnpm dev` 跑在 13100 端口（13000 被别的服务占了），本地用 SQLite。

## 旧的东西搬到哪里

| 旧（经典 NocoBase 插件 + 门户） | 新（NocoBase 3 应用） |
| --- | --- |
| `plugins/connections/server/*.js`（约 6800 行，46 个资源） | `server/nocoreach/*.ts`，逻辑原样，只把 `require` 换成 `import`；跑在兼容层 `server/nocoreach/legacy/` 上；由 `server/providers/nocoreach.ts` 组装，`server/routes/nocoreach.ts` 一个路由按 `/api/nocoreach/<资源>/<操作>` 分发 |
| 插件里定义的表 `nrSnapshots`、`nrTasks`、`nrGoogleLinks`、`nrSyncPartitions`、`nrKeywordCandidates`、`nrKeywordRuns` 等 | `database/main/migrations/` 里的迁移 |
| `db.getRepository(x).find/findOne/create/update` | `databaseManagerToken` 的 `database.repository(x)`（排序、返回值写法不同，加一层小适配） |
| `sequelize.transaction` + `pg_advisory_xact_lock(hashtext(key))`（27 处，同一种写法） | `database.transaction()` + 进程内按 key 加锁的小工具（Studio 单进程运行） |
| `cronJobManager`（每日分析、定时同步、重试） | `@nocobase/app-server/jobs` 的定时执行器；管理员要看到执行记录的（每日分析）用 Scheduler 插件 |
| `@nocobase/plugin-ai` 的 LLM 服务（在线 AI） | `@nocobase/app-plugin-ai-employee`：`config.yml` 的 `ai.llmServices` + 服务端直接调用模型 |
| `notification-manager` 站内信 + 门户里的铃铛 | `@nocobase/app-plugin-notification` + `notification-in-app`；模板头部自带收件箱按钮，铃铛不用再做 |
| NocoReach 自己的 管理员/成员（`nr-members`） | `@nocobase/app-plugin-authorization` 的角色 + 接口上的 `authorization.middleware()` |
| `environmentVariables` / 加密保存的密钥（Google、DataForSEO 等） | `@nocobase/app-server/secrets` |
| 门户 `apps/portal`（React + shadcn + Tailwind，约 4.6 万行，95 个页面文件） | `client/pages/`、`client/components/`、`client/routes.ts`；同一套技术，主要是换 SDK 引用 |
| `@nocobase/portal-sdk/*`（routing、client、acl、auth、i18n） | `@nocobase/app-client`（`defineAppRoutes`、`useApiClient`、`authz`） |
| `api.action('nrTasks','list')`（158 处） | 换成调新接口的小封装，页面里改动最少 |
| `$t("中文")` + `en.json`（4254 条） | 先保留这套写法（中文原文作 key），以后再按新框架改成 `client/locales/` 的 key |
| 本地 Agent（`apps/agent`，约 660 行） | 程序本身不变，只改它调用的接口地址；接口用 Agent 密钥校验（不走登录） |
| 测试：`tests/unit/*.test.cjs`（304 个）、门户 vitest、e2e | `tests/` 下的 vitest + `tests/playwright/` |

## 分几步搬

每一步结束都能在浏览器里看到东西，跑相关测试，提交一次；每步开一个新会话（在 `nocoreach` 目录里开，才能读到 `.agents/skills/` 的开发指引）。

| 步 | 内容 | 做完能看到 |
| --- | --- | --- |
| 0 | 建应用、跑起来、写这份计划 | ✅ 登录页和空白首页（2026-10-09） |
| 1 | 打底：数据表迁移、数据访问适配、加锁、定时任务、密钥；管理员/成员；导航菜单和全部页面 | ✅ 菜单和旧版一样，全部页面能打开（不只是空壳），成员页能用；283 个单元测试通过（2026-10-09） |
| 2 | 项目和数据：项目、Google 接入（OAuth 回调）、同步、搜索/访问/页面数据页、各数据源（GitHub、Reddit、X、HN、趋势、下载量、论坛、Discord/Slack）、DataForSEO 关键词和排名、网站审计、AI 搜索 | 🟡 免费的数据源都真实跑通；要账号或付费的只验证到接入表单（2026-10-09） |
| 3 | 洞察和机会：每日分析（定时 + 在线 AI）、信号、洞察页、机会页、项目知识、分析规则、在线 AI 设置 | 洞察和机会页能用，每日分析能跑 |
| 4 | 任务和 Agent：任务服务、任务列表/看板/详情、做法、Skills、记忆、Agent 接口、通知 | 本地 Agent 能接任务、开 PR |
| 5 | 旧数据导入 + 部署到 Studio | Studio 上能打开，旧项目和任务都在 |

## 已定（2026-10-09）

- 界面外壳：用新框架自带的侧边栏 + 头部（和 Studio、NocoProject 一致）。旧门户的头部和铃铛不搬：收件箱、语言、主题用模板自带的；项目切换器放到头部。页面内容照搬旧的。
- 旧数据：第 5 步写一次性导入命令，把本机旧系统的项目、任务、机会、已同步数据和设置搬过来；Google 等授权可能要重新连。开发时用测试数据。
- 代码位置：nocobase/nocoreach 仓库的 `nocobase3` 分支；旧代码留在 main，搬完再替换。第 1 步做完后推送。
- 要账号的数据源（Google、DataForSEO、X、Discord/Slack 等）：第 5 步导入旧数据时把配置一起搬过来再真实验证；导入命令由用户在本机运行（不读已保存的密钥）。

## 第 1 步做了什么（2026-10-09）

- 服务端：旧插件 57 个模块转成 `server/nocoreach/*.ts`（逻辑不动）。兼容层 `server/nocoreach/legacy/` 提供旧代码要的东西：
  - `database.ts`：旧式 `getRepository().find/findOne/create/update/destroy`、记录的 `.get()/.toJSON()`、事务、`pg_advisory_xact_lock` 换成进程内按 key 的锁；新记录用雪花 ID，自动维护 `createdAt/updatedAt`。
  - `filters.ts`：旧的筛选（`$in`、`$like`、`$and/$or`）和排序（`['-createdAt']`）翻成新框架的格式。
  - `app.ts`：`resourceManager.define`、`acl.allow`、`cronJobManager`（交给新框架的定时执行器）、`pm.get`、`on('afterStart')`。
  - `variables.ts`：旧的环境变量（Google OAuth 配置、刷新令牌）存到 `nrVariables` 表，密钥用新框架的 secrets 加密。
  - `users.ts`：旧的 `users` 表从新框架账号读；分配了 root 权限集的人就是旧的 NocoBase 管理员。用户 ID 现在是字符串。
  - `context.ts`：每个请求包成旧的 `ctx`（`ctx.action.params`、`ctx.auth.user`、`ctx.throw` 等）。
- 数据表：`database/main/migrations/202610090001_create_nocoreach_tables.ts`（旧的 7 张表 + `nrVariables`）。
- 前端：旧门户的页面和组件复制到 `client/pages/`、`client/components/`；路由和菜单在 `client/nocoreach-routes.ts`；每页套上"已加入 NocoReach"和"有项目"两道门（`client/pages/nocoreach-page.tsx`）；项目切换器放在头部（`client/layouts/app-layout.tsx`）。
  - 旧 SDK 的请求客户端换成 `client/lib/nocoreach-api.ts`（用法不变）；sonner 提示换成 `client/lib/toast.ts`（走模板自带的提示框）；`$t` 读新框架保存的语言；AI 对话用模板的 `client/extensions/nocobase-ai`（接口名和旧版一样）。
- 测试：旧单元测试转到 `tests/nocoreach/`（vitest），283 个全部通过。

## 第 2 步做了什么（2026-10-09）

- 真实跑通（用 nocobase.com 的公开数据）：网站内容（258 页）、网站审计（找出描述重复、标题过长等）、GitHub 仓库（Issues）、论坛（297 个主题）、Hacker News、npm 下载量、发现数据、竞品动态（Appsmith：578 页、41k Star、最新版本）。
- 验证到需要账号为止：Google（保存配置、生成授权链接、伪造回调被拦下，密钥加密保存）；DataForSEO（保存、校验、断开；校验用的是免费接口）。
- 修了：公共 DNS 设置（`NOREACH_PUBLIC_DNS`，见 `server/config/nocoreach.ts`；本机代理会把域名解析成 198.18.x.x，开发时写在 `.env.local`）；日志参数顺序（定时任务报错现在带原因）；布尔字段筛选；Google 回调地址和"去添加用户"链接。
- 要用户的账号才能验证：Google 同步和搜索/访问页、DataForSEO 系列（关键词、排名跟踪、AI 搜索、Reddit、趋势、Lighthouse）、X、Discord/Slack、GitHub Traffic。可以在新应用的数据接入里填（Google 后台要加回调 `<地址>/main/api/nocoreach/nrGoogle/callback`），或等第 5 步导入。

## 还没搬、记下来的（按步骤）

- 第 2 步剩下：要账号的数据源，按决定放到第 5 步导入后验证。
- 第 3 步：在线 AI（服务端 `pm.get('@nocobase/plugin-ai')` / `llmServices` / `aiEmployees` 要接新框架的 ai-employee 插件，`config.yml` 配 `ai.llmServices`）；三处 AI 对话（洞察探索、任务页、数据接入页）验证；每日分析改成新框架定时任务（`daily-analysis.ts` 里旧工作流节点不再用）；知识库读 Office 文件（旧的文档解析器没有）。
- 第 4 步：通知（服务端 `pm.get('notification-manager')` 接新框架通知插件，站内信进模板的收件箱）；本地 Agent 程序和它的测试搬进仓库；Agent 接口地址改成 `/api/nocoreach/...`。
- 第 5 步：旧数据导入命令；部署到 Studio。
- 体验问题（不挡主流程，整体走查时再改）：菜单里"数据源接入后才显示对应页面"和数字角标；切换语言后 `$t` 要刷新页面才变；旧门户的 50 个前端测试和 e2e 还没搬；直接开 13100 端口时模板的 WebSocket（`/main/ws`）连不上。
