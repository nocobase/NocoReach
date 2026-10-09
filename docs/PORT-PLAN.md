# NocoReach 搬到 NocoBase 3 的计划

2026-10-09 起草。原因：Studio 只能部署 NocoBase 3 新框架的应用（只有 host 一种部署方式，不能跑 Docker），旧 NocoReach 是装在经典 NocoBase 3.0.0-alpha.7 上的插件 + 门户，装不上去。做法：用 `pnpm create @nocobase/app` 新建应用，把旧代码按新框架的位置抄过来。

- 新应用目录：`NocoReach/nocoreach`（应用名 nocoreach），模板 `@nocobase/app-template-default` 1.0.0-beta.56。
- 旧代码：`NocoReach/github-repo`（nocobase/nocoreach 仓库 main 分支），搬完之前继续可用，只作参照。
- 本机开发：Node 24（`~/.local/node24`）+ pnpm 11；`pnpm dev` 跑在 13100 端口（13000 被别的服务占了），本地用 SQLite。

## 旧的东西搬到哪里

| 旧（经典 NocoBase 插件 + 门户） | 新（NocoBase 3 应用） |
| --- | --- |
| `plugins/connections/server/*.js`（约 6800 行，46 个资源） | 业务逻辑放 `server/providers/`（服务），接口放 `server/routes/`（Hono，`/api/...`） |
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
| 1 | 打底：数据表迁移、数据访问适配、加锁、定时任务、密钥；管理员/成员；导航菜单和全部页面的空壳 | 登录后菜单和旧版一样，成员页能用 |
| 2 | 项目和数据：项目、Google 接入（OAuth 回调）、同步、搜索/访问/页面数据页、各数据源（GitHub、Reddit、X、HN、趋势、下载量、论坛、Discord/Slack）、DataForSEO 关键词和排名、网站审计、AI 搜索 | 数据页都有数据 |
| 3 | 洞察和机会：每日分析（定时 + 在线 AI）、信号、洞察页、机会页、项目知识、分析规则、在线 AI 设置 | 洞察和机会页能用，每日分析能跑 |
| 4 | 任务和 Agent：任务服务、任务列表/看板/详情、做法、Skills、记忆、Agent 接口、通知 | 本地 Agent 能接任务、开 PR |
| 5 | 旧数据导入 + 部署到 Studio | Studio 上能打开，旧项目和任务都在 |

## 已定（2026-10-09）

- 界面外壳：用新框架自带的侧边栏 + 头部（和 Studio、NocoProject 一致）。旧门户的头部和铃铛不搬：收件箱、语言、主题用模板自带的；项目切换器放到头部。页面内容照搬旧的。
- 旧数据：第 5 步写一次性导入命令，把本机旧系统的项目、任务、机会、已同步数据和设置搬过来；Google 等授权可能要重新连。开发时用测试数据。
- 代码位置：nocobase/nocoreach 仓库的 `nocobase3` 分支；旧代码留在 main，搬完再替换。第 1 步做完后推送。
