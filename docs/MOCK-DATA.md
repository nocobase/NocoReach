# NocoReach 模拟数据：部署、接入与验收

当前演示模式的 ACME 与 ACME CRM 数据说明见 [ACME 演示数据](DEMO-DATA.md)。本文介绍旧版独立模拟集成。

本功能在 `environment: demo` 中以 **nocobase.example** 为预定义演示项目；`test` 环境保留兼容的 NocoBloom 测试目录，支持按项目生成网站、Google 和 GitHub 的测试响应，用原始供应商响应替换第三方 I/O，继续走 NocoReach 现有的登录、权限、连接表单、供应商解析器、业务校验、同步、数据库和报表。它不是向页面直接塞入成功结果，也不需要真实第三方凭据。

适用于独立的演示或测试部署。默认关闭。模拟结果不能作为真实流量、市场结论、代理连通性或供应商可用性的证明。

## 1. 当前交付边界

- 独立插件源码：[`app-plugins/nocoreach-mock`](../app-plugins/nocoreach-mock/README.md)，包名 `@nocoreach/app-plugin-mock`。
- 当前应用通过 [`server/plugins.ts`](../server/plugins.ts) 注册插件源码；宿主负责业务入口与传输适配。安装包不能代替这些宿主适配。
- 在“设置 → 网络 Profile”（`/proxy-profiles`）中配置模拟响应，再为各数据接入选择 Profile。旧的 `/mock-integrations` 路由会重定向到此页面。路由、迁移和 API 约定详见[网络 Profile](NETWORK-PROFILES.md)。
- 包含 `./server`、`./client`、`./collectors`、`./ai` 导出；客户端以宿主提供的 UI 组件、项目/权限、请求和通知接口组合。构建和打包后仍须核对每个导出目标，不能仅凭 `pnpm pack` 成功就宣称可发布。
- 本变更叠加在尚未合并的数据源 PR #7 之上。构建与打包不等于 npm 发布，也不表示相关 PR 已合并。

以下是配置说明和验收步骤，不是“全部测试已通过”的报告。实际执行结果应另行记录命令、提交版本、通过/失败/未运行状态与阻塞原因。

## 2. 必须隔离的部署配置

使用**全新的专用数据库和独立 storage**，不要复制真实项目数据库、凭据、已排队的 Runner 工作或通知配置。不要在真实部署上临时打开模拟，再尝试切回真实服务。

在专用部署的 `config.yml` 合并以下完整配置。已有同名顶级节时合并字段，不要重复定义 YAML 键：

```yaml
nocoreachMock:
  enabled: true
  environment: demo # 仅允许 demo 或 test

agents:
  vectors:
    store: false
```

必须启用模拟并声明 `demo`/`test`；缺少环境声明会拒绝启动，`NODE_ENV=test` 不能代替。正式环境不注册模拟数据菜单或页面路由。Agents 配置独立于模拟数据：可以配置真实模型、测试连接、创建 Agent、注册 Runner 并执行任务。上例关闭向量存储只是可选设置，不再是启动条件。

`NOCOREACH_MOCK_ENABLED=true`、`NOCOREACH_MOCK_ENVIRONMENT=test` 可覆盖前两个字段；NocoReach 已废弃 `agents.server.enabled` 的开关作用，正式环境和 demo 都始终允许 Online Agent 执行。旧实例即使保留 `agents.server.enabled: false`，升级重启后也会自动启动执行器，无需手动改配置；该字段可清理。模型、凭据及 Agent 权限仍需正常配置。

通知只保留 `notification.channels` 中 `provider: in-app` 的启用通道，例如配置示例中的 `inbox`。SMTP、Resend、飞书、钉钉及其他外部通道必须删除或设置 `enabled: false`，否则启动报 `NR_MOCK_EXTERNAL_NOTIFICATIONS_ENABLED`。`notification.jobs`（未指定时使用 `jobs.default`）只允许指向已定义且 `adapter: memory` 的进程内配置；未选择时使用内置 memory。Redis、未知名称或其他适配器会报 `NR_MOCK_NOTIFICATION_WORKER_NOT_ISOLATED`。此外，`jobs.default`（NocoReach 定时/每日分析任务）和 `scheduler.jobs`（官方 Scheduler，未指定时继承默认 jobs）也只能选择已定义的 `adapter: memory` 配置；未知名称、`default` 伪名称或选中的 Redis 配置会在 provider 启动前以 `NR_MOCK_JOBS_WORKER_NOT_ISOLATED` 被拒绝。未指定任何选择器时使用内置 memory，未使用的 Redis 配置可以保留。共享队列可能把模拟任务交给真实 worker，因此不能只隔离通知队列。

Mail 插件虽随模板注册，模拟部署必须保持 `mail.providers: {}`，或将每个 provider 设为 `enabled: false`；否则在插件启动前报 `NR_MOCK_EXTERNAL_MAIL_ENABLED`。`mail.jobs` 同样只能选择已定义的 memory 队列，不能指向共享 Redis。模拟环境保留 Mail 迁移元数据，但不注册其服务提供者或任何根路径/API 路由，防止附件后台清理通过 Drive 出站；Mail API（包括可能实时读取附件的 GET）返回明确的模拟隔离错误。真实部署不受影响。

独立运行的源码部署可在启动前指定隔离路径，例如：

```sh
export APP_STORAGE_DIR="$PWD/storage/mock-demo"
export DB_FILENAME="$APP_STORAGE_DIR/database.sqlite"
mkdir -p "$APP_STORAGE_DIR"
pnpm dev
```

首次使用前确认目录是为本次模拟新建的，数据库不存在；不要删除一个用途不明的已有目录。SQLite 的 `DB_FILENAME` 会覆盖主连接文件路径。使用其他数据库或嵌入式宿主时，必须分别提供独立连接和宿主 storage，不能只改 SQLite 示例的文件名。仍按正常部署流程配置应用自己的管理员与加密主密钥；这些不是第三方模拟 token，不能复用本文的假值。不要提交 `config.yml`、数据库、storage 或运行时密钥。

首次启用只允许空的 NocoReach 业务数据集；已有业务记录、连接/凭据或不允许的快照会以 `NR_MOCK_PRISTINE_DATABASE_REQUIRED` 拒绝启动。用户与必要初始化不等于业务演示数据，不要靠手工清几张表来把真实库伪装成空库。启用后，引擎在数据库保存永久的模拟数据集标记。该数据库如果在关闭模拟的配置下重启，将报 `NR_MOCK_DATASET_CANNOT_RUN_LIVE`。传统版本数据导入在模拟部署或带标记数据库中被 `NR_MOCK_CLASSIC_IMPORT_BLOCKED` 拒绝，避免导入覆盖隔离状态。重置场景不清除此标记；需要真实部署时，另建干净数据库与 storage，不要手工删除标记来复用合成数据。

部署级模拟开启后，项目级关闭表示“阻止该项目请求上游”，不是切回真实供应商。未配置项目、缺少项目范围、损坏的设置、未知目标或不支持的操作均明确失败，不回退真实网络。

### 自动初始化演示项目

启用插件并通过专用数据库检查后，NocoReach 默认在启动期间创建 **nocobase.example 演示项目**（`test` 环境保留 NocoBloom 测试目录），无需逐项填写模拟凭据、连接数据源或手动采集。登录后在顶部项目切换器选中它即可浏览。之前已经启用模拟插件的部署升级后也会自动补建，原有项目保持不变。演示项目默认接入目录中所有已支持的数据源，包括 GitHub Traffic、Discussions 和代码仓库；Google 资源已选定，无需再手动授权、确认资源或填写供应商凭据。代码仓库预设为 `nocobloom/nocobloom` 的 `main` 分支，只配置演示目标，不启动真实 Runner。

| 数据范围                          | 初始内容                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Google Analytics / Search Console | 56 天历史分区，包括访问、来源、页面、搜索词及前后周期对比；自动同步默认关闭                                        |
| 网站与 SEO                        | 网站页面与正文元信息、可计算的网站审计、关键词研究与收藏、5 个排名跟踪词、域名报告、移动端和桌面端 Lighthouse 报告 |
| GitHub、论坛与软件包              | 仓库指标、流量、Star/Fork 历史、Issue、Release、论坛主题与可读取的回复，以及 npm、PyPI、Docker 数据                |
| 社交与视频                        | Hacker News、X、Slack、Discord、Reddit 的帖子或消息；YouTube、哔哩哔哩、小红书的模拟采集内容                       |
| 趋势、竞品与 AI 搜索              | 趋势序列、FlowGrove 竞品资料、品牌提及、竞品问题缺口、四种模型的模拟回答与问题研究                                 |
| 任务和讨论                        | demo：20 条人工编写任务，覆盖看板、修改、取消、归档和成果情景；test：36 条兼容模板任务                             |
| 项目知识与分析                    | demo：8 篇人工编写资料；test：6 篇兼容资料；均保留模拟每日分析                                                     |

演示项目使用固定时间和 `pagination`（分页）场景，让讨论等列表包含上百条记录，并保持列表与详情的内容身份一致。各渠道仍遵守现有的采集上限、时间窗口和保留规则，不保证每个渠道都有相同数量的记录。项目名称、讨论和交付物是中文业务样例，不随界面语言切换。不会创建可以登录的假用户，也不会执行真实模型、Runner 或对外发布。

初始化按阶段记录进度。启动日志中的 `Initializing simulated demo data` 会显示当前阶段；首次启动会比空库稍慢。失败阶段不会被标为完成，下次启动继续未完成部分。升级时会为旧演示项目补齐此前缺失的默认代码仓库和 Google 资源确认状态；已经手动配置或移除的代码仓库、已断开的 Google 连接保持不变。其他已完成的阶段不再写入，因此重新启动不会反复灌入数据，也不会覆盖用户改名、编辑、断开接入或删除的记录。任务批次与知识文档各自使用事务，失败会回滚该批次。完成后手动删除的样例不会自动恢复；在 Profile 中将场景改回 `normal` 也不会重新灌入演示数据。

需要空白的自动化测试环境时，在首次启动前设置：

```yaml
nocoreachMock:
  enabled: true
  environment: test
  initializeData: false
```

也可设置 `NOCOREACH_MOCK_INITIALIZE_DATA=false`。该选项只停止自动初始化，不删除已生成的数据，也不解除模拟隔离。

## 人工编写的演示内容包

`environment: demo` 的预定义项目名称与网站域名为 **nocobase.example**。这里的 NocoBase 内容是虚构编辑情景，不是官方产品承诺、客户评价或真实经营数据。非 demo 环境不安装此内容包。

第二版 `nocobase-opportunities-v2` 专门补齐洞察和机会页面：12 条手写机会（8 条待处理、2 条关联已有任务、2 条已忽略），以及 3 条持续观察和 1 条无需动作的变化。每条都有现象、判断、证据局限与建议动作。“今日待处理”使用最新分析中的机会，并不等同于任务看板里的待办；验收应同时检查这两个数据入口。新增内容与原分析合并，保留已有决策；安装前保存 strategy 快照，重启不会把用户忽略或删除的内容重新填回来。安装和重启日志分别为 `Installed demo opportunity dataset`、`Verified demo opportunity dataset`，包含实际筛选计数。

首版 `nocobase-editorial-v1` 包含 20 条独立任务和 8 篇知识资料，围绕客户台账迁移、岗位权限、审批退回、部署检查、备份演练和社区回复展开。每条任务有不同的背景、讨论和交付物；包含待处理、进行中、待确认、完成、退回修改、取消和归档情景。成果页覆盖上升、下降、无明显变化、等待、数据不足和无可用效果数据。人物不创建登录账号，成果为人工历史样例，不创建官方 Agent 运行或外部发布回执，也不会启动自动效果追踪。

升级已部署的旧 demo 时，只处理初始化器登记的项目。项目仍使用原来的 ID，已保存的网站、Google 分区等业务资料中的默认名称与域名同步更新。未修改的旧模板任务归档，用户已修改或接管的任务保留。新增内容与安装记录在一个事务中保存；失败全部回滚，重复启动不重复添加，也不恢复用户后来删除的样例。已有 Profile、固定时间和凭据不改。

如果预定义项目已经改用其他域名，安装会以 `NR_DEMO_PROJECT_CUSTOMIZED` 停止；有排队或运行中的 Google 同步、任务执行时，以 `NR_DEMO_ACTIVE_WORK` 停止。先检查项目和在途工作，不要删除永久模拟标记来强行安装。

内容原稿位于 [demo-content.ts](../server/nocoreach/demo-content.ts)，安装器位于 [demo-install.ts](../server/nocoreach/demo-install.ts)。后续新增一版内容需要新的安装版本及明确的增量策略；直接修改原稿不会覆盖已经安装的那一版。

部署时只选择 `nocoreach-demo`。不要为了更新演示数据推送 main：常规 main 发布会自动更新正式应用。保留现有数据库、storage 与模拟配置；先验证演示包，再通过 `nb-studio deploy --app nocoreach-demo --repository nocobase/nocoreach --sha <该包的已推送提交> --file <演示包路径>` 安装。也可在 GitHub Actions 的 **Deploy demo to Studio** 中手动选择 `demo/` 分支构建上传，避免为了演示部署合并到 main。部署后核对 `Installed editorial demo dataset` 日志、项目名称、任务详情和成果筛选；重启后确认不重复安装。

修改前的记录保存在同一数据库的 `demo-backup:<项目 ID>:nocobase-editorial-v1:<表名>:<记录 ID>` 快照中，安装摘要在 `demo-edition:<项目 ID>:nocobase-editorial-v1`。它们是数据恢复依据，不代替整库备份。代码回滚不会自动撤销这次数据安装；需要恢复时应先停用安装器，再由维护人员按快照恢复对应记录并核对安装后产生的编辑，不要直接清库。

## 3. 网络 Profile、固定时间与运行快照

按照[网络 Profile 使用方法](NETWORK-PROFILES.md#使用方法)创建模拟 Profile，再在当前项目的数据接入中逐个选择，或使用“应用到全部数据接入”一次性设置。场景、随机种子和固定时间由 Profile 提供。原来独立的应用模拟设置页不再启用；`nrMock/status` 保留只读兼容状态，`nrMock/configure` 和 `nrMock/reset` 在本应用中返回 `409 NR_MOCK_USE_NETWORK_PROFILES`。

固定时间必须是包含时区的 ISO 格式，保存时统一为 UTC，不改变操作系统和任务调度时间。Profile 修订号用于检测并发编辑。每次模拟操作固定所选 Profile 及其设置，Google 后台任务会保存不含凭据的快照，以便跨队列或重启恢复。编辑和暂停只影响后续操作。在隔离部署中清除选择表示暂停该接入，不会切换真实网络，不会删除历史数据，也不会取消已有任务。需要恢复正常场景时，编辑 Profile 并选择 `normal`。

不同接入使用各自的固定时间处理采集、日期窗口和保留规则；暂停后仍可按原时间查看单来源历史报表。跨来源总览与综合分析需要统一比较日期时，应为各接入选择相同固定时间。

### 场景

| 值              | 用途与限制                                                                      |
| --------------- | ------------------------------------------------------------------------------- |
| `normal`        | 稳定的正常数据和有效供应商协议                                                  |
| `newdata`       | 保持旧记录身份，追加或更新合成内容，验证增量、去重与变化                        |
| `empty`         | 空列表或零指标；连接身份、协议元信息不保证变空；历史数据不会被自动删除          |
| `pagination`    | HTTP 列表制造多页数据；媒体采集见下方固定批量上限，不是真实游标                 |
| `rate-limit`    | HTTP 429/供应商限流；媒体按生产错误分类映射                                     |
| `login-expired` | HTTP 401、Slack `invalid_auth` 或采集器 `login_required` 等失效形态             |
| `timeout`       | HTTP/模拟 AI 最多等待 30 秒或调用者更短的期限；媒体直接返回其超时错误           |
| `malformed`     | 无效 JSON 或违反真实采集器/提取器 schema 的响应                                 |
| `error`         | HTTP 503 或媒体上游失败                                                         |
| `slow-cancel`   | HTTP/模拟 AI 延迟 30 秒并接受真实 AbortSignal；媒体等待实际取消，不生成延迟成功 |

编辑 Profile 不会重新生成已保存的报表。DataForSEO 模拟查询按 Profile 身份和修订号隔离复用；其他数据源仍保留原有缓存和历史数据保留策略。需要重新采集时，请使用各数据源的刷新操作。

## 新项目与示例目标

网站、Google 和 GitHub 已支持[按项目生成模拟目标](NETWORK-PROFILES.md#从空项目验证新站点)。下面的 NocoBloom 表格是兼容演示目录，并不是新建项目必须使用的域名：可以从空库创建 `supabase.com` 项目，通过原有界面连接网站、选择对应的 Google 资源以及 `supabase/supabase` 仓库。数据为合成样例，不代表真实站点内容。其他供应商的目录限制仍以覆盖矩阵为准。

## 4. 从真实“数据接入”页面连接

下表保留旧 NocoBloom 演示项目示例；新项目的所有可用接入按[完整接入清单](NETWORK-PROFILES.md#全部接入点验收)验证，可以替换为当前项目的域名、仓库、包名及搜索词，不需要改源码白名单。当前项目的工作区、频道、媒体标题与 SEO 响应采用项目身份。

先创建并选择模拟网络 Profile，再打开应用的“数据接入”（`/connections`，前加实际 base path）。使用原有接入表单与按钮，保留预览、确认、权限和取消步骤。表单仍使用生产验证规则；`mock-token` 等过短值会被正常拒绝。

以下值全部是公开的虚构测试字符串，仅用于这个隔离部署。不要粘贴真实 token，不要据此到供应商网站注册、授权、充值或安装机器人。供应商说明中的外部注册链接在模拟验收中无需打开。模拟数据里的 GitHub、社交平台和视频 URL 只是格式正确的标识；在应用外打开这些 URL 不属于模拟。

| 来源                        | 表单输入                                                                                                                                        | 实际接入步骤                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 官网                        | `https://nocobloom.example`                                                                                                                     | 官网卡片 → 读取网站 → 选择页面分类 → 确认接入；可另加 `https://docs.nocobloom.example` 或 `https://blog.nocobloom.example`                             |
| Google GA4 / Search Console | 不填真实 OAuth Client ID 或 secret                                                                                                              | 授权 Google 账号 → 同应用回调 → 选择资源：`NocoBloom website` 与 `sc-domain:nocobloom.example` → 确认资源 → 启动同步；支持业务的 7/28/56 天范围        |
| DataForSEO                  | API Login：`demo@nocobloom.example`；API Password：`nocobloom-demo-password`；月预算：`5`                                                       | 保存 → 验证连接；再到关键词、竞品、趋势、Reddit、AI 搜索或 Lighthouse 相关页面发起查询                                                                 |
| GitHub                      | 仓库：`https://github.com/nocobloom/nocobloom`                                                                                                  | 先预览并接入仓库；需要流量/Discussions/历史数据时再在对应面板保存下方假 token，并同步                                                                  |
| GitHub token                | `github_pat_nocobloom_demo_only_0000000000000000`                                                                                               | 满足 `github_pat_` 或 `ghp_` 前缀与最短长度校验；不授予任何真实仓库访问权限                                                                            |
| Discourse                   | `https://community.nocobloom.example`                                                                                                           | 预览论坛 → 确认接入 → 同步；不需要账号                                                                                                                 |
| npm / PyPI / Docker Hub     | 分别选择注册表，填 `@nocobloom/core` / `nocobloom` / `nocobloom/nocobloom`                                                                      | 读取/预览 → 添加；保留原有下载量和累计拉取量展示逻辑                                                                                                   |
| Hacker News                 | `NocoBloom` 或 `nocobloom.example`                                                                                                              | 搜索最近 30 天 → 确认接入 → 同步                                                                                                                       |
| Reddit                      | `NocoBloom`                                                                                                                                     | 先验证 DataForSEO，再保存产品搜索词并查询；模拟的是 Google 收录的 Reddit 搜索结果，不是 Reddit API                                                     |
| Google Trends               | 产品 `NocoBloom`；竞品可用 `FlowGrove`、`StackMeadow`                                                                                           | 先验证 DataForSEO；设置产品词及页面提供的地区，再查询趋势                                                                                              |
| 竞品                        | `FlowGrove` / `https://flowgrove.example` / `flowgrove/flowgrove`；或 `StackMeadow` / `https://stackmeadow.example` / `stackmeadow/stackmeadow` | 通过现有竞品添加、预览与刷新流程；分析查询共用 DataForSEO                                                                                              |
| X                           | 搜索词 `NocoBloom`；Bearer Token：`nocobloom_mock_bearer_0000000000000000000000000000`                                                          | 保存并检查；官方账号排除项可留空，预算保留 `5`。页面可能记录合成计费统计，不会向 X 付费                                                                |
| Slack                       | `xoxb-nocobloom-demo-only-00000000000000000000`                                                                                                 | 检查 token → 勾选返回的 `nocobloom-help`、`nocobloom-templates` → 保存连接/同步；不安装真实 Slack 应用                                                 |
| Discord                     | `nocobloom_demo_only_000000.MOCK.nocobloom_demo_only_000000`                                                                                    | 检查 token → 选择返回的虚构服务器 → 勾选 `nocobloom-help`、`nocobloom-templates` 或论坛频道 `nocobloom-showcase` → 保存/同步；不打开真实机器人邀请链接 |
| 小红书                      | 采集器 `NocoReach 模拟采集器`；搜索词 `NocoBloom`                                                                                               | 选择采集器，确认测试会话的使用范围 → 保存连接 → 检查采集器 → 手动搜索；不需要 OpenCLI 或已登录的真实浏览器                                             |
| Bilibili                    | 同一模拟采集器；搜索词 `NocoBloom`；详情样例 `BV1NB411c7m1` 或 `https://www.bilibili.com/video/BV1NB411c7m1`                                    | 按现有面板检查、保存连接并手动采集搜索/详情；不需要部署真实采集器                                                                                      |
| YouTube                     | 搜索词 `NocoBloom`；样例 `https://www.youtube.com/watch?v=NocoBloom01`                                                                          | 保存关键词/视频，按原表单确认 → 手动读取；不调用真实 yt-dlp、字幕网络或浏览器                                                                          |

Google 授权使用当前应用的本地回调及现有 state/nonce 校验，返回当前项目域名对应的模拟账号（旧演示为 `demo@nocobloom.example`）；它不会显示或访问真实 Google 同意页，不验证 Google OAuth 配置，也不授予 Google 权限。GA4 ID、Slack channel ID、Discord guild/channel ID 随项目和 seed 生成，请选择接口返回的选项，不要抄其他项目的 ID。

需要核对原始虚构目录时，可在应用根目录运行这个不读取运行时配置的本地命令，并把 projectId、seed、clock 改为该项目设置。它只打印 `fixtureCatalog`，不创建连接或请求第三方：

```sh
node --import tsx --input-type=module --eval 'import { fixtureCatalog } from "./app-plugins/nocoreach-mock/server/fixtures.ts"; console.log(JSON.stringify(fixtureCatalog({ projectId: "1", seed: "nocoreach-1", clock: "2026-10-12T00:00:00.000Z", scenario: "normal", revision: 0, runId: "00000000-0000-4000-8000-000000000001" }), null, 2));'
```

## 5. 实际覆盖矩阵

精确 HTTP 操作清单以 [`FIXTURE_COVERAGE`](../app-plugins/nocoreach-mock/server/fixtures.ts) 为准；媒体协议见 [`collectors.ts`](../app-plugins/nocoreach-mock/server/collectors.ts)。只支持明确列出的协议，不存在“任意 URL 都返回成功”的兜底。

| 模块                       | 已模拟的供应商边界                                                                                                                                                                                   | 明确上限或未覆盖部分                                                                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google                     | token、userinfo、accountSummaries、property 元信息、GSC sites、GA4 runReport/batchRunReports/runRealtimeReport、GSC searchAnalytics/query、URL Inspection、Sitemaps 列表                             | 最多 550 个 UTC 日；遵循维度、指标、日期窗（含相对日期，今天到时钟为止）、筛选、排序及 offset/limit；实时为前 30 分钟；网址检查按路径给固定结论（资源外网址返回 403），站点地图只提交了 pages 和一个读取失败的旧文件（索引和 docs 显示为未提交）；不是全部 Google API，不验证真实授权 |
| DataForSEO 账号/关键词     | user_data、Labs id_list、related_keywords、keyword_suggestions、keyword_ideas、keyword_overview、Google Ads keywords_for_keywords                                                                    | 每请求一个 task；列表最多 250 条；成功响应 cost 为 0；保留真实预算、缓存与不确定结果处理                                                                                                                                                                                              |
| DataForSEO 网站/竞品/外链  | domain_rank_overview、historical_rank_overview、ranked_keywords、relevant_pages、domain_intersection；backlinks summary/backlinks/referring_domains/domain_pages_summary/domain_intersection/history | 历史最多 13 个月；都是合成排名、页面与外链，不能代表真实网站表现                                                                                                                                                                                                                      |
| DataForSEO SERP/Reddit     | Google organic live advanced/regular，包括 Reddit 线程结果                                                                                                                                           | Reddit 仅走本来使用的 SERP 解析路径；无直接 Reddit OAuth、投票数或评论数验证                                                                                                                                                                                                          |
| DataForSEO Trends          | Google Trends explore                                                                                                                                                                                | 最多 52 周；比较词与相关/上升查询是合成数据                                                                                                                                                                                                                                           |
| DataForSEO AI / Lighthouse | LLM mentions aggregated/cross-aggregated/search；ChatGPT、Claude、Gemini、Perplexity models/live；on_page lighthouse/live/json                                                                       | AI 回答、品牌份额、引用和性能分数均为固定合成响应；没有真实模型、网页性能或浏览器审计                                                                                                                                                                                                 |
| GitHub                     | 仓库、issue 列表/详情/搜索、release 列表/详情、traffic views/clones/referrers/paths、stargazer/fork 历史、GraphQL discussions/stargazers/forks、contents/tree、README/SKILL 原文                     | 项目范围内按请求的合法仓库标识生成合成数据（旧快照仍使用原目录）；REST 页码与 GraphQL 游标；流量 14 天；不支持写 issue、PR、提交、GraphQL mutation 或仓库执行                                                                                                                         |
| X                          | recent counts/search、tweet detail                                                                                                                                                                   | 7 个完整日；支持 since_id、start_time、next_token；无发帖                                                                                                                                                                                                                             |
| Slack                      | auth.test、频道列表、模拟 join、history、replies                                                                                                                                                     | 2 个虚构频道；支持 oldest/timestamp/cursor；join 只返回进程内模拟响应，不加入真实频道                                                                                                                                                                                                 |
| Discord                    | bot identity、guild、channels、messages、active/archived public threads                                                                                                                              | 1 个虚构服务器；有效 snowflake；支持 after/before/limit；无发送消息                                                                                                                                                                                                                   |
| Discourse                  | about/site/latest、topic detail、post stream                                                                                                                                                         | 列表、详情与帖子 ID 一致；支持 latest 页码与指定 post IDs；无发帖                                                                                                                                                                                                                     |
| 官网/公开来源              | 首页、robots、sitemap index/子地图、正文、favicon；当前项目主域名与 www/docs/blog 子域，兼容旧演示域名及两个虚构竞品                                                                                 | 仅明确支持的主机/路径；未知网页拒绝或返回缺失；不验证真实 DNS、TLS、SSRF 出口、JavaScript 页面或反爬                                                                                                                                                                                  |
| npm / PyPI / Docker Hub    | 包元信息、npm 日期区间下载量、PyPI/pypistats、Docker repository                                                                                                                                      | npm 最多 550 日，PyPI 180 日；Docker 为累计值样本；合法请求包名对应合成数据，无下载或安装真实软件包                                                                                                                                                                                   |
| Hacker News                | Algolia search_by_date 与 items detail                                                                                                                                                               | 帖子/评论父子 ID 一致；支持数字日期过滤、page/hitsPerPage                                                                                                                                                                                                                             |
| 小红书                     | 原 browser collector health/search 协议，经实际 HttpXiaohongshuAdapter 校验归一化                                                                                                                    | 正常 3 条、newdata 4 条、pagination 最多 20 条；只是有界批量，非真实游标分页；点赞保留 `1.2万` 等原始不精确形态；无真实登录/浏览器/反爬验证                                                                                                                                           |
| Bilibili                   | 原 browser collector health/search/video 协议，经实际 HttpBilibiliAdapter 校验                                                                                                                       | 正常 3 条、newdata 4 条、pagination 最多 20 条；只是有界批量；搜索摘要与详情完整度不同；无字幕或真实提取器验证                                                                                                                                                                        |
| YouTube                    | 原 yt-dlp 输出形状与字幕读取依赖，经实际 YouTubeProvider 校验                                                                                                                                        | 正常 3 条、newdata 4 条、pagination 最多 5 条；只是有界批量，不模拟无限翻页；人工/自动字幕样例不验证真实提取器、视频可用性或反爬                                                                                                                                                      |
| NocoReach 业务 AI          | daily-report、daily-judge、daily-judge-many、daily-rewrite、keyword-seeds、keyword-curate、ai-question-suggest、knowledge-suggest、memory-draft、memory-check、competitor-suggest、task-draft        | 只支持显式业务操作；daily-rewrite 返回空 rewrites；输出标记 `simulated: true`、`nocoreach-mock` / `synthetic-fixture-v1` 及“模拟 / Simulated”；不是实际模型推理                                                                                                                       |

真实 Agent 的配置、模型测试、聊天、研究、草稿与 Runner 执行使用官方插件的鉴权和权限。代码任务可以真实修改、推送任务分支和创建 PR；人工审核后，NocoReach 最终发布阶段记录“模拟发布完成”，不派发合并或回退任务、不验证线上发布、不启动发布效果追踪。第三方采集及上表列出的自动业务 AI 继续使用模拟响应。真实 Agent 会访问所配置的模型和 Runner，可能产生模型费用；模拟模式不是 Runner 或通用聊天工具的网络沙箱。

模拟 Profile 的测试只验证配置与执行器，不声称真实代理连通。场景、种子和固定时间由所选 Profile 决定；真实代理连接测试保持原路径，隔离模拟部署不会建立真实代理连接。

应用内通知继续进入原有收件箱；已读/未读等收件箱操作仍可用。NocoReach 业务邮件被抑制，通知插件的发送/测试发送等写入口被阻止；外部通道不可启用，恢复的外部待投递/重试也不能借模拟实例发送。通知日志等读取继续使用原插件权限。

这些边界是 NocoReach 接入点的应用级隔离，不是整个进程、浏览器或任意其他插件的通用网络沙箱。隔离部署不要配置 SMTP、Resend、Webhook、真实外部认证或其他未纳入本功能的外部服务；需要验证零出站时，还应独立观察或阻断测试环境的出站网络。

## 6. 人工验收清单

在专用测试部署进行。记录项目、seed、UTC clock、scenario、revision、构建版本、浏览器语言与观察结果；不要记录实际会话 cookie、token、密码或个人数据。尚未实际观察的页面步骤标为“未运行”，不要用 API 通过替代 UI 通过。

1. **中文与英文**：分别切换 `zh-CN`、`en-US`。从 `/connections` 完成官网、Google、DataForSEO、GitHub、论坛、包、HN、Reddit、Trends、X、Slack、Discord 和三种媒体的接入；检查字段错误、进度、空态、失败、确认和详情。内容本身可能保留双语虚构文案；检查操作文案是否符合当前语言。
2. **正常端到端**：normal 场景从预览、确认、同步进入相应数据页面；核对列表与详情 URL/ID 一致、时间不晚于 clock、保留真实解析与持久化。Google 分别执行 7/28/56 天同步，查看进度、持久化行数和报表。不得通过直接写报表表格来代替该流程。
3. **增量与空数据**：先 normal，再 newdata；检查旧 ID 稳定、新增/更新不重复。再用 empty 发起新操作；区分本次空结果与业务保留的旧数据，不把保留策略当成模拟失败。
4. **分页边界**：pagination 检查 HTTP 第二页、末页、去重和游标终止；媒体分别检查小红书/Bilibili 20 条、YouTube 5 条上限，不能记为真实媒体游标分页通过。
5. **各类失败**：逐一测试 rate-limit、login-expired、timeout、malformed、error；确认可读错误、失败状态、旧成功数据保留及可用的重试入口。DataForSEO 超时/坏响应仍可能显示“结果不确定/可能已计费”的生产提示：这是业务状态验证，不是真实收费。恢复 normal 后以新运行验证恢复。
6. **真实取消与晚到结果**：slow-cancel 开始后，分别取消小红书、Bilibili、YouTube 的实际业务运行，Google 使用暂停；确认任务终止、按钮恢复、没有晚到写回。立即重新开始时，旧运行不能覆盖新结果。关闭侧栏、取消确认框与后台取消是不同动作，分别检查；关闭弹层不应被误记为采集已取消。
7. **在途快照**：slow-cancel/长运行期间另一个管理员修改 seed/scenario/clock 或重置。旧运行保持旧 revision；新运行使用新设置。Google 入队后重启测试实例，再领取任务，仍使用入队快照；取消/暂停的旧批次不能写回。
8. **设置并发与权限**：匿名未登录、非成员、普通成员、管理员分别读取/保存/重置；成员只读、管理员才可写。两个窗口使用同一 revision 保存时，后者应冲突；重新加载后再编辑。测试无效项目 ID、无时区 clock、空 seed、未知场景。
9. **项目与会话隔离**：创建 A/B 两项目，设置不同 seed；交替、并发采集，并在请求未完成时切项目、退出登录再切账号。旧结果不得出现在新项目或新会话。禁用 B 后其上游请求失败；A 不受影响，B 不能转为真实网络。
10. **离线/零上游**：在依赖安装完成后，保留浏览器到本地应用/静态资源所需访问，观察并阻断测试服务器第三方出站；重复已覆盖流程。未调用真实 Agent 时，确认模拟采集与自动业务 AI 没有供应商 DNS/HTTP、代理 CONNECT、yt-dlp/OpenCLI 子进程或模型请求。真实 Agent 路径应单独验证，允许已配置的模型和 Runner 请求。浏览器断网会连本地 API 都不可用，不能用它证明服务端不出站。自动化网络断言是补充证据，不替代部署出口观察。
11. **拒绝与保留边界**：未知采集域名、未知采集 API、通知测试发送和代理检查必须失败；真实 Agent 配置、模型测试及任务执行应成功，审核后的发布只记录模拟完成，不能派发 merge/revert 或显示已上线；收件箱通知及其已读/未读操作仍可用。试用启用的 SMTP/Webhook 或默认 jobs、Scheduler、通知任一选中的共享 Redis 队列配置时应拒绝启动；恢复的外部投递不能真正发送。reset 后核对项目、凭据、旧报表和在途运行仍在，仅场景变 normal；验证带模拟标记的数据库不能以关闭模拟的配置重启。
12. **设置 UI 与中断流程**：检查明确的模拟标记、保存/重置确认、失败后的输入保留、加载遮挡、项目切换、新导航、重复点击、取消、关闭、浏览器 Back/Forward，以及窄屏和键盘焦点。未经实际浏览器观察，不将这一项标为完成。

## 7. 开发检查、构建与打包

从应用根目录运行；以下是可复现命令，不包含本地私有配置、个人状态或秘密：

```sh
pnpm exec vitest run \
  tests/nocoreach/mock-engine.test.ts \
  tests/nocoreach/mock-fixtures.test.ts \
  tests/nocoreach/mock-collectors.test.ts \
  tests/nocoreach/mock-network.test.ts \
  tests/nocoreach/mock-ai.test.ts \
  tests/nocoreach/mock-notifications.test.ts \
  tests/nocoreach/mock-isolation.test.ts \
  tests/logic/mock-external-guard.test.ts \
  tests/logic/mock-jobs-startup.test.ts \
  tests/components/mock-settings.test.tsx \
  tests/nocoreach/mock-app.test.ts

pnpm --dir app-plugins/nocoreach-mock typecheck
pnpm --dir app-plugins/nocoreach-mock build
pnpm exec tsc --noEmit -p tsconfig.server.json

pnpm exec prettier --check \
  docs/MOCK-DATA.md AGENTS.md config.example.yml \
  app-plugins/nocoreach-mock/README.md
```

`mock-app.test.ts` 使用真实应用、认证、业务解析与临时数据库，并在测试范围内拒绝供应商网络/子进程；它不是浏览器 E2E。不要把单元或应用集成测试的结果写成全部 UI 已验收。宿主变更还需对实际改动文件执行 ESLint、相关消费者测试与需要的应用构建；仅文档改动无需重复整个应用 `pnpm check`。

独立插件包检查：

```sh
mkdir -p storage/mock-plugin-pack
pnpm --dir app-plugins/nocoreach-mock build
pnpm --dir app-plugins/nocoreach-mock pack \
  --pack-destination "$PWD/storage/mock-plugin-pack"
```

检查 tarball 中每个 `package.json#exports` 目标是否真实存在，并在干净的消费者环境验证 Server/Client 注册；包括 `dist/client/index.js` / `index.d.ts` 在内，任何导出目标缺失时都不得认定完整插件可发布。`build`/`pack` 不会执行 `npm publish`，本指南也没有要求发布。

源码集成的职责：

- 插件提供模拟引擎、原始响应、媒体依赖、模拟 AI 和只读状态图标；不导入宿主私有业务源码。客户端在 [`client/plugins.ts`](../client/plugins.ts) 以 `nocoreachMock({ page: MockSettingsPage, navigation: false })` 保留旧地址跳转；[`client/mock-integrations.tsx`](../client/mock-integrations.tsx) 只通过 `createMockIndicator(host)` 装配状态图标，不再装配旧设置表单。全部应用配置使用网络 Profile。`createMockUi(host)` 及旧设置接口仅保留给未集成 Profile 的独立宿主，兼容测试使用测试专用适配器。
- 宿主从 `mockEngineToken` 取引擎，在变量加载后调用 `attach({ variables, app, project, requireAccess, assertPristine })`；保留原成员与管理员授权。首次启用必须提供并通过 `assertPristine`，缺少检查会报 `NR_MOCK_PRISTINE_CHECK_REQUIRED`；启动前的数据集检查和传统导入阻止也由宿主负责。
- [`outbound-network.ts`](../server/nocoreach/outbound-network.ts) / [`public-sources.ts`](../server/nocoreach/public-sources.ts) 在实例级边界路由模拟，不能替换全局 fetch，也不能为 `.example` 放宽生产公网校验。
- [`mock-collectors.ts`](../server/nocoreach/mock-collectors.ts) 将原始响应送给生产媒体适配器；[`sync-service.ts`](../server/nocoreach/sync-service.ts) 持久化 Google 运行快照。
- [`mock-external-guard.ts`](../server/routes/mock-external-guard.ts) 在插件路由前保护外部执行，启动隔离校验在 [`server/app.ts`](../server/app.ts) 中运行。
- 新增供应商、后台入口、模型入口或外部写入时，必须显式纳入隔离并追加“不调用真实 I/O”的测试；未知操作默认拒绝。

启用模拟数据后，左下角侧栏底部显示演示数据图标；悬停或键盘聚焦可查看简短说明，不再显示顶部横幅。部署关闭模拟时隐藏图标。

## English quick reference

This companion plugin replaces upstream I/O with a default fictional NocoBloom dataset and project-aware website, Google and GitHub responses while retaining the real NocoReach authentication, parsers, connection forms, jobs, persistence and business checks. It is off by default. Use a fresh, dedicated database and storage, never copied production data or real provider credentials.

Enable `nocoreachMock.enabled: true`, set `environment: demo` or `test`. Online Agent execution is always available in NocoReach, including deployments retaining the retired `agents.server.enabled: false` setting. No configuration edit is required when upgrading. Vector configuration is independent. Only enabled in-app notification channels are allowed. Selected jobs.default, scheduler.jobs and notification.jobs must resolve to process-local memory configurations; absent selectors use built-in memory, and unused Redis definitions may remain. Invalid names or selected Redis adapters fail before providers start. Disable or remove external channels and do not share job or schedule queues with live workers. In-app delivery and inbox read-state controls remain available; email, external notification writes and test sends are suppressed or blocked. Initial activation rejects existing NocoReach business data/credentials. A permanent simulated-dataset marker prevents restarting that database in live mode. Use a different clean database for live operation.

Open **Settings → Network profiles** (`/proxy-profiles`), create a mock profile, and select it on the project's data connections. Bulk assignment is available. See [the routing/upgrade contract](NETWORK-PROFILES.md). The old mock settings URL redirects there; host `nrMock/configure` and `reset` return a migration error. Status remains readable; standalone plugin hosts without profile integration retain their original API. Fixed clocks and revisions belong to the selected profile, and existing jobs keep their captured settings.

Use the existing Data connections page (`/connections`) and the fictional targets/tokens in section 4. Google uses same-app local consent/callback; it never opens real Google OAuth. Choose generated GA4, Slack and Discord IDs from the returned options, or inspect `fixtureCatalog` for the same project/seed/clock. Do not install real bots or open external provider setup links.

Coverage includes Google analytics/search, DataForSEO and its Reddit/Trends/AI-search/Lighthouse consumers, GitHub, X, Slack, Discord, Discourse, public websites, package statistics, Hacker News and three media adapters. The matrix above is authoritative about bounds. Xiaohongshu/Bilibili `pagination` means at most 20 items; YouTube means at most 5, not real cursor pagination. Simulated business AI is explicitly labeled; Agent configuration, model testing and task execution use real services and native authorization; the final NocoReach release is simulated without merging, live verification or effect tracking. Mail and external notifications remain blocked. Mock validation does not prove live connectivity; real proxy tests are unchanged. No mock result verifies real OAuth, login, anti-bot behavior, provider availability, extraction software or network security.

Run the commands in section 7 and manually verify both Chinese and English, normal/newdata/empty, pagination bounds, all failure scenarios, real cancellation, late-write rejection, concurrent settings, persisted Google snapshots, project/session isolation and zero fixture-provider egress, testing real Agent traffic separately. Record actual results separately; commands in this guide are not proof they passed. Production caches and historical-data retention remain active. The fixture clock does not set the operating-system or scheduler clock. Verify business date windows as well as captured fixture dates when replaying an older clock.

The Settings page and client registration are implemented. Build both sides and verify every export, including dist/client/index.js and its declaration; a successful tarball alone does not establish package readiness. Browser acceptance must be recorded separately. The change is stacked on unmerged source PR #7. Packaging does not publish to npm.
