# NocoReach 项目开发约束

本文保留应用对通用模板的适配和容易回归的业务边界，只在修改相关功能时查阅。通用开发方式以 [应用开发 Skill](../.agents/skills/nocobase-app-development/SKILL.md) 及其参考为准；本文明确说明的应用适配优先于模板示例。

历史背景见 [变更记录](../CHANGELOG.md) 和 [移植计划](PORT-PLAN.md)。移植计划中的旧 Agent、AI 配置、部署步骤和待办反映当时状态，不作为当前实现规范；依赖版本以 `package.json` 和锁文件为准。

## 前端

修改 `client/` 前阅读 [前端工作流](../.agents/skills/nocobase-app-development/references/frontend/ui-workflow.md)，由它按任务引导组件、样式、交互和验证。以下是本应用需要保留的差异。

### 业务页面与文案

- 旧门户的业务页面和组件位于 `client/pages/`、`client/components/`。请求使用 `client/lib/nocoreach-api.ts` 的 `nocobaseClient.action()` 契约，提示使用 `client/lib/toast.ts`。
- 业务正文沿用 `client/i18n` 的 `$t("中文")`，中文原文为 key，英文在 `client/i18n/en.json`。业务菜单使用 `client/locales/` 的 `nocoreach.nav.*`；外壳和管理页面沿用应用 locales 及官方命名空间 overrides。不要将通用模板的文案规则直接套到旧业务页面。
- 包内导入使用 `package.json#imports` 的 `#components/*` 等映射；目录入口显式指向 `index`，不新增 Vite alias 或 TypeScript paths。
- 用户提到当前界面的标注、标记或选区时，先从根目录运行 `pnpm exec agent-annotations list --json` 找到记录；没有匹配或目标仍不明确时再询问。只问标注在哪里时不实施改动。

### 路由、身份与外壳

- 业务页面在 `client/nocoreach-routes.ts` 声明，经 `client/pages/nocoreach-page.tsx` 的成员和项目门槛访问。业务页面使用 `authz: 'skip'`，官方 Agents 页面保留插件授权；接口仍独立执行 NocoReach 业务鉴权。
- 所有页面使用 `defineAppRoutes()`。管理页面由 `client/pages/settings/routes.ts` 的 `defineAdministrationRoutes()` 声明为 `/settings/...` 普通路由，在应用自己的 `SettingsLayout` 展示；不调用已删除的 `defineSettingsRoutes()`、`defineDevRoutes()`，不假定 `/dev` 自动隔离生产构建。
- Settings 菜单从 `useClientApplication().runtime.routes` 选取 `/settings` 下的路由，有可访问管理页面时才显示入口。管理页面源码由应用维护，保留原授权资源 ID；菜单使用 `management.*`，正文使用原插件命名空间 overrides。服务和 token 继续从官方包导入，不复制 token 创建代码。
- NocoReach 身份与请求缓存位于 `client/routing/app-router.tsx` 的已认证子树，复用官方 session 边界和授权 revision，不移到 application 层。身份读取失败或缺少角色时不授予权限；持久化报表缓存按 user/session/revision 隔离，卸载后的旧请求不得写回。
- 保留退出登录的错误检查与提示、切换账号时权限快照清理、权限 revision 触发的页面重查；检查未完成或失败时不展示受保护内容。
- 面包屑由布局渲染，页面只声明路径；项目切换器位于 `client/layouts/app-layout.tsx`。App 与 Settings 共用桌面折叠偏好 `nocobase:sidebar:collapsed`，手机菜单状态各自维护。保留权限过滤、分组展开状态、折叠后的 tooltip/popover 与键盘操作。

### 主题与组件

- 使用现有 shadcn/ui 组件及语义主题 token；缺少 primitive 时经 CLI 添加，不手工重写生成组件。页面弹层使用路由式组件，先读 [弹层参考](../.agents/skills/nocobase-app-development/references/frontend/references/overlay.md)。
- `client/theme/presentation.css` 在生成组件外统一适配官方 `data-slot` 和旧业务 `.nr-page` 表格；App 与 Settings 共用 `app-brand-surface`。保留 NocoReach 品牌、业务 Tag 语义色、两种密度及浏览器偏好，不单独重做某个页面的主题。
- 任务表格的最小宽度按固定列及标题列所需的 spacing 单位计算，防止宽松模式把标题挤成一字。手机头部保留紧凑品牌、项目图标、较小按钮间距；面包屑在 sm 以上显示，完整项目名保留在切换菜单及辅助文本中。

## 后端与数据

接口、服务、数据库操作分别按应用开发 Skill 的 [接口](../.agents/skills/nocobase-app-development/references/server-routes.md)、[HTTP 契约](../.agents/skills/nocobase-app-development/references/http-api.md)、[服务](../.agents/skills/nocobase-app-development/references/services-and-jobs.md)、[数据访问](../.agents/skills/nocobase-app-development/references/database-and-data.md) 参考执行；数据库 API 另见 [数据库 Skill](../.agents/skills/nocobase-db/SKILL.md)。

### 兼容层与权限

- `server/nocoreach/*.ts` 是移植的经典业务服务，保留了密集写法和 `// @ts-nocheck`。NocoBase 3 行为适配放在 `server/nocoreach/legacy/`，业务行为放在服务内，不顺手重写整个移植层。
- 兼容层重建 repositories、filters、transactions、resource actions、定时器等旧接口；旧 advisory locks 使用进程内按 key 的锁。设置存入 `nrVariables`，密钥加密保存；用户来自 NocoBase 3 账号，事务内读取使用调用方连接。
- `server/providers/nocoreach.ts` 装配兼容层并管理定时器。`server/routes/nocoreach.ts` 分发 `/api/nocoreach/<resource>/<action>`；每个 action 经 `server/nocoreach/policy.ts` 检查 `nr-members` 的管理员/成员资格，root 用户始终为管理员，不以页面或集合授权代替业务鉴权。
- 通知由官方 Notification 插件及其已配置的站内频道发送，收件箱适配在 `legacy/notifications.ts`。每日分析是 Scheduler 目标 `nocoreach.daily-analysis`，管理员在 `/settings/schedules` 查看执行。`pm.get('workflow')`、`workflows` 只是 `legacy/schedule.ts` 的旧接口名称，官方 Workflow 已移除，不重新引入。
- 服务端路由必须自行鉴权，页上的 `auth`/`authz` 不是服务端保护。背景任务从 provider 注册，不依赖目录自动发现。

### 事务与同步

- SQLite 使用单连接。不能在业务事务中等待另一个数据库连接完成；旧在线任务读取 Agents 默认模型时显式传 `tx.connection`，用户读取也在调用方事务内。
- Google 同步按“短事务领取 → 事务外采集 → 短事务校验并提交”执行，持有事务时不得等待 OAuth 或 Google API。单实例 `busy` 保护在途批次；暂停取消旧批次，即使立即恢复也不能写回旧结果。整批采集限时两分钟，失败沿用有界重试。
- `legacy/database.ts` 的 `transactionContext()` 隔离快照缓存与构建 Promise；事务内不能等待事务外的快照构建，也不能将未提交结果放入共享缓存。
- 不修改已执行的历史迁移或直接改迁移历史表来消除校验错误。数据库 Collection 文件是生成缓存；迁移规则见 [迁移参考](../.agents/skills/nocobase-app-development/references/migrations.md)。构建必须保留迁移与种子的 `.manifest.json`，不为已安装依赖重建其清单。

## 出站网络

修改采集、OAuth、连接测试或任何带项目范围的后台网络入口时，同时检查本节和上述事务约束。

- `server/nocoreach/proxy-profiles.ts` 将全局 Profile 与按项目/连接的引用一起加密存入 `nrVariables`；`outbound-network.ts` 使用实例级 AsyncLocalStorage。新增采集服务注入此传输层；所有带项目 ID 的后台/内部网络入口纳入 `network.bind`，URL-only 预览从路由继承项目范围。
- Google OAuth/同步显式传项目 fetcher；Google/DataForSEO 派生功能共用实际连接设置；项目图标的首页与图片抓取共用网站出口。选择界面在 `client/components/connection-network.tsx`，Profile 管理在 `client/pages/proxy-profiles/`。
- 固定 API 按来源和 Profile 版本复用有界连接池；公开抓取与连接测试使用独立 dispatcher。不修改全局 fetch/dispatcher 或 Studio 环境变量。Profile 更新后新请求使用新连接，在途请求完成后释放旧连接；应用停止时清理连接池。
- 公开抓取必须经过 `download` 的公网 IP 校验和固定 IP 隧道；保留原主机 TLS 校验。代理失败不得回退直连。
- `socks-proxy.ts` 建立 SOCKS 隧道：`socks5` 本机解析、`socks5h` 代理解析；公开抓取无论协议都连接已校验 IP。清理建连阶段 socket，保持有界连接池。
- Runner 和在线 AI 不使用本节代理设置；不要将它扩展成宿主全局网络策略。

## 任务执行

先读 [Agents 插件 Skill](../.agents/skills/nocobase-app-plugin-agents/SKILL.md)。Agent、Runner、模型和用量页面复用官方插件，模型与密钥通过官方模型管理维护，业务模型调用使用 `online.gateway`。旧本机程序与密钥协议已删除，不恢复旧凭据迁移。

### 入队、选择与重试

- `server/nocoreach/execution/agents-runtime.ts` 注册 `nocoreachTask` subject：业务事务内向官方 runs 入队，提交后发事件，通过 `pluginRunId` 同步结果；审核、revision、取消检查保留在业务服务。
- `nr-task-agent:<project>` 保存默认共享 Agent 及仓库约束，`/project-ai` 维护项目默认值。任务的 `evidence.work.agentId` 优先于项目默认值，每次业务 run 保存实际 Agent ID/名称。只有负责人或管理员可改派，排队、执行中、完成和关闭后禁止更换。
- 研究与草稿可使用 Online 或 Runner；包含仓库改动的任务拒绝 Online。就绪状态按当前用户的官方资格判断，并在业务事务外读取模型和 Runner，避免单连接互等。
- 人工接管通过同事务 `runs.withdrawQueued` 与官方领取互斥；只读 subject `assemble` 不得改变业务状态。Agent 不可用时仍可取消任务，PR 清理失败须记录并提示手动关闭。
- `server/app.ts` 在插件路由前注册 `server/routes/agent-retry-guard.ts`，只拦截 `nocoreachTask` 的通用 HTTP/CLI retry。业务重试必须经 TaskService 检查阶段、审核状态并创建新的输入快照；复制旧 subject 到新官方 run 会绕过它们。上游 `SubjectBinding` 提供等价 retry 扩展点后才替换该守卫，其他 subject 维持官方行为。

### 能力、资料与来源

- `execution/task-business.ts` 提供业务能力、预设以及当前 run 专属 `task data` / `task draft` 命令，同时校验能力授权、调用者/负责人资格、revision 和运行状态。`task draft --content-file` 接收完整多行稿件，只暂存，不推进阶段。
- `execution/task-materials.ts` 通过官方 mounts 交付任务资料。正文保留在不可变业务输入快照中，`nr-task-materials:<pluginRunId>` 只引用该快照；提示词保留文件位置。知识和 Skills 随输入快照交付。
- 长资料用 offset 分页。Online 的任务上下文、知识、Skills 与来源分别限额，Runner 保留完整挂载，不用一个预算挤掉其他资料。
- `execution/community-materials.ts` 从已配置的论坛连接读取原帖和回复，经官方 briefs prepare 在领取事务外准备不可变来源快照。限制为配置的论坛域名、5 个主题、每主题 100 楼以及总正文预算；缺失/截断用稳定 code 和参数记录，界面翻译，Agent 保留可读说明。不放宽 Runner 本机工具策略；来源和候选稿按业务 run 隔离。
- `allowedPaths: []` 表示整个仓库，不额外限制目录；非空时只允许匹配文件或目录内文件。Runner 指令、仓库设置界面和 `allowedPath()` 校验必须一致，并保留当前任务范围、仓库规则和 Runner 策略。

### 成果与执行记录

- 任务页复用官方 `RunHeader` / `RunTranscript`，通过 `?run=` 选择历史运行；只允许参与者及管理员读取 transcript。展示实际模型/Runner、工具输入输出和权限拒绝，业务失败优先于工具回合完成。
- 研究、社区回复和内容成果分别校验 `report.kind`，保留 `sources`、`asOf`、`uncertainties` 后进入人工审核。`report.asOf` 最多 1000 字符，不截断多来源时间说明；任务指令与校验共用上限，超限错误明确字段及限制。
- `execution/agent-result.ts` 管理成果校验与 Runner 指令；build 成果必须包含发布说明、页面验证依据、改动对比，无法验证时明确返回空值。
- 业务测试在 `tests/nocoreach/`；`agents-app.test.ts` 覆盖官方 Runner 协议与真实插件/数据库，修改入队、资料、取消、重试或 CLI 分发时检查对应覆盖。

## 升级与发布

升级前读 [应用升级 Skill](../.agents/skills/nocobase-app-upgrade/SKILL.md)，构建部署包或排查生产问题前读 [部署 Skill](../.agents/skills/nocobase-deployment/SKILL.md)。运行 `pnpm nocobase` 命令前读 [CLI 参考](../.agents/skills/nocobase-app-development/references/cli.md)。以下是本应用与通用流程不同的部分。

### 模板与依赖

- 当前完整模板源码标记为 `nocobase.defaultTemplateVersion: 1.0.0-beta.58`；后来选择性合入的依赖、主题和适配不代表完整模板升级。不以新模板覆盖本应用，不无依据推进模板版本标记。
- Hub CLI 与官方 Workflow 已移除，发布和业务实现不恢复它们。旧移植文档中的 AI employee、本机 Agent 和旧配置只是历史。
- 运行时依赖声明在 `dependencies`，客户端库、构建工具和纯类型依赖在 `devDependencies`；所有应用插件（包括仅客户端或禁用的插件）仍在 `dependencies`。`@nocobase/db` 与驱动保持为运行时依赖。声明和锁文件同步，插件注册仍以 client/server/cli composition roots 为准。

### CLI 与 Runner 分发

- `cli/plugins.ts` 的应用自有 `afterServerBuild` hooks 把 NocoReach CLI 和 Runner universal 包一起构建到 `dist/runners`；不能只在本机 storage 生成后遗漏发布包。依赖升级后两个分发产品也要随部署重新构建。
- `server/config/agents.ts` 从配置模块位置解析分发目录，不假定 Studio 的 rootDir 等于 dist；显式 `agents.dist.dir` 可覆盖默认值。部署前确认实际分发目录同时包含对应 manifest 和安装包。
- Runner 的应用身份、CLI 名称固定为 `nocoreach`，与 `package.json` 的 `nocobase.cli.bin` 和发布安装包一致，不从 `/main` 或部署路径推导。
- 分发验证包括空缓存下载、校验、解包和执行；Studio 嵌入部署须经实际应用验证，standalone 成功不足以证明宿主路径正确。步骤与历史原因见 [CLI 分发说明](CLI-DISTRIBUTION-beta63.md)。

### 配置与静态资源

- 路由不硬编码部署前缀。页面、API 和动态产物使用 `resolveAppUrl`，静态文件用 `resolveAssetUrl`；服务端路径用统一的 `AppPaths`，保留 `createAppFromRuntime(runtime)` 的配置、宿主日志和生命周期绑定。
- 浏览器访问 origin 必须与 `app.publicOrigin` / `APP_PUBLIC_ORIGIN` 对应，不通过关闭来源检查解决认证问题。远端开发代理的写请求影响目标后端。
- `CDN_BASE_URL` 是构建变量，要求完整 HTTPS URL 及末尾 `/`；未设置时为 `./`，开发模式忽略。优先级是进程环境、`.env.local`、`.env`。上传完整 `dist/client/` 资源并配置 CORS，应用服务器仍保留 client 目录和 HTML 注入；Docker 源码构建用同名 build arg，运行时不能改变已编译的资源 URL。
- 开发文件监听排除本应用整个 `dist/`，不排除链接的工作区依赖。辅助 Vite 测试使用独立临时 `cacheDir`，不清理或重写正在运行的开发服务缓存。

### 旧数据导入

`pnpm nocobase app import-classic` 对应 `cli/commands/import-classic.ts`。命令在可访问旧 Postgres 的机器读取 `CLASSIC_DB_*`，使用 root 用户的 `NOCOREACH_API_KEY` 经 HTTP 调目标应用的 `nrImport`，不直连 Studio 数据库。旧密钥在源机器解密、由目标重新加密。导入是单独的数据迁移任务，操作前查阅 [移植记录](PORT-PLAN.md)，不作为普通部署步骤。
