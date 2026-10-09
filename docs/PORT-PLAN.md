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
| 本地 Agent（`apps/agent`，约 660 行） | `agent/`：程序本身不变，只改它调用的接口地址（`/api/nocoreach/nrAgentDaemon/<操作>`）；接口用 Agent 密钥校验（不走登录） |
| 测试：`tests/unit/*.test.cjs`（304 个）、门户 vitest、e2e | `tests/` 下的 vitest + `tests/playwright/` |

## 分几步搬

每一步结束都能在浏览器里看到东西，跑相关测试，提交一次；每步开一个新会话（在 `nocoreach` 目录里开，才能读到 `.agents/skills/` 的开发指引）。

| 步 | 内容 | 做完能看到 |
| --- | --- | --- |
| 0 | 建应用、跑起来、写这份计划 | ✅ 登录页和空白首页（2026-10-09） |
| 1 | 打底：数据表迁移、数据访问适配、加锁、定时任务、密钥；管理员/成员；导航菜单和全部页面 | ✅ 菜单和旧版一样，全部页面能打开（不只是空壳），成员页能用；283 个单元测试通过（2026-10-09） |
| 2 | 项目和数据：项目、Google 接入（OAuth 回调）、同步、搜索/访问/页面数据页、各数据源（GitHub、Reddit、X、HN、趋势、下载量、论坛、Discord/Slack）、DataForSEO 关键词和排名、网站审计、AI 搜索 | 🟡 免费的数据源都真实跑通；要账号或付费的只验证到接入表单（2026-10-09） |
| 3 | 洞察和机会：每日分析（定时 + 在线 AI）、信号、洞察页、机会页、项目知识、分析规则、在线 AI 设置 | ✅ 用 DeepSeek 跑出真实洞察：洞察页和机会页有 5 条待办；每日分析按时触发；数据接入页 AI 问答能用（2026-10-09） |
| 4 | 任务和 Agent：任务服务、任务列表/看板/详情、做法、Skills、记忆、Agent 接口、通知 | 🟡 机会 → 任务 → 本机 Agent 分析 → 审核 → 完成走通，通知进收件箱；开 PR 那一步等用户定测试仓库（2026-10-09） |
| 5 | 旧数据导入 + 部署到 Studio | Studio 上能打开，旧项目和任务都在 |

## 已定（2026-10-09）

- 界面外壳：用新框架自带的侧边栏 + 头部（和 Studio、NocoProject 一致）。旧门户的头部和铃铛不搬：收件箱、语言、主题用模板自带的；项目切换器放到头部。页面内容照搬旧的。
- 旧数据：第 5 步写一次性导入命令，把本机旧系统的项目、任务、机会、已同步数据和设置搬过来；Google 等授权可能要重新连。开发时用测试数据。
- 代码位置：nocobase/nocoreach 仓库的 `nocobase3` 分支；旧代码留在 main，搬完再替换。第 1 步做完后推送。
- 要账号的数据源（Google、DataForSEO、X、Discord/Slack 等）：第 5 步导入旧数据时把配置一起搬过来再真实验证；导入命令由用户在本机运行（不读已保存的密钥）。
- 在线 AI 的模型（2026-10-09 用户选）：沿用旧系统的 DeepSeek `deepseek-chat`。服务写在本机 `config.yml` 的 `ai.llmServices.deepseek`，Key 由用户自己用 `pnpm nocobase config set --from-env …` 写入，不进仓库。

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

## 第 3 步做了什么（2026-10-09）

- 在线 AI：兼容层 `server/nocoreach/legacy/ai.ts` 让旧代码的 `pm.get('@nocobase/plugin-ai')`、`aiEmployees`、`llmServices` 走新框架 AI 员工插件公开的 `AIManager`（`aiManagerToken`）：服务商、已启用模型、直接调用模型（`getLLMService` → `provider.invoke`，和旧版一样）。每日分析、起草做法、关键词建议、竞品识别、知识库建议、记忆更新都经过这里，旧服务代码没改。
- 和旧版不同的一处（新框架的规定）：模型服务和 API Key 只能写在 `config.yml` 的 `ai.llmServices`，插件会删掉配置里没有的服务，所以 NocoReach 不能再自己保存 Key。Agent 页“接入在线 AI”对话框改成：从已启用的模型里选一个 → 测试并保存（保存的是 atlas 员工用哪个模型，和旧版一样）；一个都没有时，提示管理员去 config.yml 配，并链到“高级设置”（`/settings/ai/llm-services`，这个链接以前少了 `/main`，已修）。
- 每日分析的定时：改用 Scheduler 插件。`server/providers/nocoreach.ts` 定义计划任务 `nocoreach.daily-analysis`（每天 9:00，服务器时区），触发后交给后台任务执行旧的“逐个项目分析”节点（通过 `pm.get('workflow').registerInstruction` 拿到同一个类，今天已成功的项目跳过）。管理员在“设置 → 自动化 → 计划任务”（`/settings/schedules`）看每次执行和结果，能停用/启用。旧的每分钟补跑和重试（`analysisCron`）照旧：它读计划任务的启用状态和时间，停用后也不再补跑。
  - 实测：临时改成每分钟触发，一次执行从“已接受”到“失败：项目 1：还没有接入在线 AI”完整走通；停用/启用后服务端读到的状态跟着变。
- 三处 AI 对话：洞察页其实没有对话（旧门户里也只有基类），实际是任务页（旧流程任务）和数据接入页两处，共用 `strategy/service.ts` 的基类。它们每轮用旧的 `aiConversations:updateOptions` 写系统提示，新框架没有这个接口，改成 `PUT /api/aiEmployee/conversations/{sessionId}/options`（先读再合并，保留已选模型）。没有模型时数据接入页显示“尚无可用 AI 模型，问答暂不可用”。
- 知识库读 Office 文件：新框架的 `@nocobase/ai-employee` 公开导出同一个 `loadByWorker`，已接上。实测 Word（.docx）和 Excel（.xlsx）能读出文字；上传后没接模型时按默认存进知识库草稿。
- 测试：新增 `tests/nocoreach/legacy-ai.test.ts`、`legacy-schedule.test.ts`，改写 `online-ai.test.ts`（按“选模型”），共 292 个全过。
- 真实模型验证（DeepSeek `deepseek-chat`）：Agent 页选模型、测试并保存，atlas 指向它；手动跑每日分析约 10 秒完成，写出 4 条观察、9 条变化的结论，第二次运行存下 5 条机会（洞察页“待办 5”，机会页能看详情）；数据接入页问一个问题，DeepSeek 正常回答（新的设置系统提示接口返回 200，已选模型保留）。
  - 第一次运行模型给的 3 条机会全被校验丢掉，第二次 5 条全部通过：是模型这次输出的差别，不是搬迁问题（同样的校验，旧版就有）。
  - 费用：两次分析各约 6–8 千输入 token、2–3 千输出 token（估算，直接调用模型时不记用量）；一次对话 2,662 输入 + 271 输出 token（插件有记录）；加两次连接测试，合计约两三万 token，按 DeepSeek 公开价不到一毛钱人民币，以 DeepSeek 后台为准。

## 第 4 步做了什么（2026-10-09）

- 通知：兼容层 `server/nocoreach/legacy/notifications.ts` 让旧代码的 `pm.get('notification-manager')` 和 `notificationChannels` 走新框架的通知插件。站内信发到 `config.yml` 里配置的站内信频道（模板自带的 `inbox`），进头部自带的收件箱，点“打开”跳到任务页（旧的 `/x/main/...` 链接换成本应用的路由）；没有再做铃铛。邮件：`config.yml` 里配了启用的 `smtp` 或 `resend` 频道时，按用户的邮箱另发一封（新框架不会自动把用户换成邮箱，兼容层自己读）；本机没配邮件，没有实测。
  - 实测：把 T-1 的负责人改成测试成员，测试成员收到“你是 T-1 的负责人了”（查库确认，没有用测试成员登录）；Agent 交回大纲后，Super Admin 收到“T-1 等你审核”，头部收件箱显示未读 1，点“打开”进到任务页。
- 修了：在任务上换负责人卡 60 秒后失败。原因是本机 SQLite 只有一个连接，旧代码在事务里读用户，而兼容层的用户表没有跟进这个事务，读操作排队等事务结束。现在 `legacy/users.ts` 在调用方的事务里读（`LegacyDatabase.table`）。Postgres 上本来不会卡。
- 修了：机会页“负责人”默认是“未指定”（旧页面用经典的 `auth:check` 取当前用户，新框架没有），改成读 NocoReach 成员信息，默认又是“你”。
- 本机 Agent：旧程序搬到仓库的 `agent/`（版本 0.3.0），用 `node agent/build.cjs` 单独编译（用应用自带的 TypeScript，不进服务端构建），接口改成 `<地址>/main/api/nocoreach/nrAgentDaemon/<操作>`，读新框架的错误格式；测试搬成 `tests/nocoreach/agent-program.test.ts`（14 个，新增一个用本地假服务器验证地址、密钥头和报错）。Agent 页“添加电脑”的命令改成 `node agent/build.cjs`、`node agent/dist/cli.js login --server http://…/main …`。
  - 实测：在 Agent 页添加“开发 Mac”，按页面命令登录，几秒内显示“可用 · Claude Code 2.1.285 · 程序 0.3.0 · 在终端里运行”。
  - 测试时用了单独的目录 `NOCOREACH_AGENT_HOME=~/.nocoreach-agent-nb3`、在终端里运行，没有装后台服务：默认目录 `~/.nocoreach-agent` 和后台服务 `com.nocoreach.agent` 还是旧系统在用，新程序 `login`/`install-service` 会覆盖它们。旧系统停用、正式切到新应用时再用默认目录装后台服务。
- 任务主流程（项目 1，全部在浏览器里操作）：机会页把 O-1“给字段联动写文档”交给本机 Agent（做法“内容选题与大纲”）→ 任务 T-1 → 确定开始执行 → 本机 Agent 领到运行（项目没接仓库，按“只根据资料和公开网页分析”跑）→ 进度实时回到任务页（约 3 分半）→ 大纲交回、进入审核 → 勾选核对项、接受并交给“新建文档页” → T-1 已完成，自动生成 T-2“新建文档页：给字段联动写文档”（未开始），交付的文档自动存进知识库。任务列表、看板（待处理/进行中/待确认/已完成）、任务详情、做法、Skills、项目知识（记忆、知识库）页面都正常。
- 任务页 AI 对话：只有旧流程任务（有旧式步骤方案、没有做法）才用 `task-work.tsx` 的对话，新建任务都走做法。临时在本地库写了一条旧流程测试任务，“和 AI 讨论”里提问，DeepSeek 按任务依据回答（设置系统提示的新接口正常）；验证完删掉了。
- 记忆：项目知识页“重试”生成了初版记忆（用 DeepSeek），读到 1 份资料（Agent 交付的文档），官网 0 个页面（见下面体验问题）。
- 测试：`tests/nocoreach` 共 310 个全过；`tsc` 前端、服务端都通过。

## 还没搬、记下来的（按步骤）

- 第 2 步剩下：要账号的数据源，按决定放到第 5 步导入后验证。
- 第 3 步剩下：DeepSeek 的模型列表里已经没有 `deepseek-chat`（只有 `deepseek-flash`、`deepseek-v4-pro`），现在还能调用，以后可能下线，到时在“高级设置”里启用新模型、再在 Agent 页换。
- 部署（第 5 步）：Studio 上模型 Key 走环境变量，要在 `server/config/ai.ts` 的 `env` 里把变量映射到服务的 `options.apiKey`；计划任务和后台任务现在用内存版（单进程够用）。
- 第 4 步剩下：
  - 开 PR：T-2“新建文档页”要改仓库、推送分支、开 PR，是对外操作，等用户定用哪个测试仓库（旧的是 estheryo/website-test），再在“数据接入 → 网站源码”接入、开始 T-2，看 PR、合并/关闭、预览链接这几步。
  - 成员视角：“别人负责的任务成员不能拖动/关闭”没有在浏览器里用测试成员验证（不知道它的密码）；前端代码和旧版一致，用户 ID 已按字符串比较。
  - 本机 SQLite 只有一个连接：旧代码在事务里调用新框架插件（AI 员工、计划任务）时会卡 60 秒后失败。主流程里已知的一处（读用户）已修；在线 AI 步骤（`queueFlowRun` 里取模型）只有旧流程会走到。Postgres 上不受影响。
- 第 5 步：旧数据导入命令；部署到 Studio。
- 体验问题（不挡主流程，整体走查时再改）：英文界面下在线 AI 用英文回答（系统提示也经过 `$t` 翻译），每日分析的洞察仍是中文；数据接入页问答的系统提示里只有已接入来源摘要，没有面板上的接入说明，回答可能和页面写的不一致（例：Star 增长的算法）；Agent 页“测试并保存”后，“今天的每日分析”一栏要刷新才再出现；数据接入页在英文界面下三个分类是空的（`data-sources.tsx` 的 `categories` 在加载时就翻译成英文，和目录里的中文分类对不上）；洞察页把“还没有接入在线 AI”说成“这类失败可能已经产生费用，所以没有自动重试”（没接入时不会产生费用，也许应该自动重试或直接提示去接入）；服务端返回的中文提示（如“还没有接入在线 AI”）在英文界面不翻译；菜单里"数据源接入后才显示对应页面"和数字角标；记忆初稿读不到官网：项目域名 nocobase.com 会跳到 www.nocobase.com，下载拒绝跨域名跳转（旧版一样，可以把项目域名写成 www.nocobase.com 或允许同站跳转）；日期格式不统一（任务动态“09/10, 16:11”，Agent 页“10/9 11:30”）；任务对话窗口里 Atlas 的开场白是英文；任务详情右侧“进度”里审核一步总写“你”，负责人是别人时也一样；切换语言后 `$t` 要刷新页面才变；旧门户的 50 个前端测试和 e2e 还没搬；直接开 13100 端口时模板的 WebSocket（`/main/ws`）连不上。
