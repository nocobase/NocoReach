# @nocoreach/app-plugin-mock

## 中文

NocoBase 3 的 NocoReach 演示/测试伴随插件。默认关闭，用虚构 NocoBloom 的原始供应商响应运行真实解析、权限、连接、同步和持久化流程。没有真实凭据，也没有真实网络兜底。未知目标、禁用项目、缺少项目范围或未实现操作明确失败。

应用内完整接入步骤、格式正确的假 token、覆盖矩阵与人工验收见源码仓库的 `docs/MOCK-DATA.md`。本 README 也包含独立包必须遵守的安全边界。

### 启用与隔离

必须使用全新的专用数据库和独立 storage。在 NocoReach 部署配置中同时设置：

```yaml
nocoreachMock:
  enabled: true
  environment: test # 仅允许 test 或 demo
agents:
  server:
    enabled: false
  vectors:
    store: false
```

前两项也可用 `NOCOREACH_MOCK_ENABLED=true` 和 `NOCOREACH_MOCK_ENVIRONMENT=test` 设置。不能用 `NODE_ENV` 代替环境声明，不能遗漏显式关闭 Agents 执行器和向量存储。

通知只能启用 `provider: in-app` 通道。删除其他通道或设为 `enabled: false`；`jobs.default`、`scheduler.jobs` 和 `notification.jobs` 均使用内置进程内 memory，或显式选择已定义的 `adapter: memory` 配置，不能选择共享 Redis 队列；未使用的 Redis 配置可保留。宿主在任何插件工作者启动前校验这些条件，禁止外部通知发送/测试发送，保留收件箱通知与已读/未读操作。

NocoReach 宿主首次启用时拒绝已有业务数据或凭据。引擎给数据库写入永久模拟标记，宿主在工作者启动前检查；已标记数据库不能关闭模拟后作为真实库运行，损坏标记也明确失败。另建干净数据库用于真实环境，不能手工移除标记。重置不清除标记、数据库、历史或凭据。宿主也阻止传统版本数据导入，避免覆盖模拟标记或带入真实凭据。

### 宿主接入责任

- `./server` 默认导出为 Server plugin；通过 `mockEngineToken` 取引擎，变量加载后调用 `attach({ variables, app, project, requireAccess, assertPristine })`。登录、成员/管理员权限、项目查找和存储由宿主负责。首次启用必须提供并通过 `assertPristine`，否则 `NR_MOCK_PRISTINE_CHECK_REQUIRED` 拒绝继续。
- 源码应用在 `server/plugins.ts` 注册 Server 插件，在自己的启动流程和路由最前面安装数据集、工作者及外部执行保护。这些保护不是只安装包就会自动覆盖任意宿主；移植时必须一并实现。
- `./client` 默认导出是接收 `{ page, parent? }` 的插件工厂；`createMockUi(host)` 返回 `MockSettingsPage` 与 `MockBanner`。宿主提供 UI 组件、当前项目/权限/语言、请求、通知和导航回调。应用在 `client/plugins.ts` 注册“设置 → 模拟数据 / Simulated data”，路由 `/mock-integrations`。
- 一次操作以 `run(projectId, fn)` 包住，通过 `request(projectId, url, init)` 获取原供应商 `Response`。使用实例级传输层，不能覆盖全局 fetch，也不能放宽生产网络安全规则。
- 媒体通过 `./collectors` 导出的原始响应依赖进入宿主生产适配器，保留真实 schema 校验。模拟不启动浏览器、OpenCLI、yt-dlp 或字幕下载。
- 跨队列/进程保存 `capture(projectId)` 的无凭据快照，以 `runSnapshot(snapshot, fn)` 恢复。验证快照属于实际内部任务和项目，不接受浏览器提供的运行快照。Google 同步的宿主实现会持久化快照。
- `./ai` 只支持显式的模拟业务操作，结果带 `simulated: true`、`nocoreach-mock` / `synthetic-fixture-v1` 及模拟文案。所有其他 AI、Runner、外部写入使用 `guardExternal` 或更早的宿主路由保护拒绝。取消、revision 和晚到结果校验仍由业务服务负责。

### 项目设置与场景

管理员在 NocoReach“设置 → 模拟数据”选择项目模拟状态、场景、随机种子和固定时间，点“保存设置”；“重置模拟场景”有确认步骤。部署级开关仍只能由部署配置控制。普通成员在设置页看到管理员权限说明，业务页仍显示模拟标记；状态读取通过 API 提供。`nrMock/status` 接受 projectId，成员可读。`nrMock/configure` 接受 projectId、enabled、scenario、seed、clock、revision；`nrMock/reset` 接受 projectId、revision。写操作仅管理员可用，旧修订号返回 409。clock 必须包含时区，保存为 UTC；默认 clock 是实例启动当天 UTC 零点，首次保存后持久化，不改变真实服务器时钟。

场景为 normal、newdata、empty、pagination、rate-limit、login-expired、timeout、malformed、error、slow-cancel。HTTP/模拟 AI 的 slow-cancel 最多延迟 30 秒，并遵循真实 AbortSignal；媒体 slow-cancel 等待实际取消。媒体 timeout 直接产生超时错误；HTTP/模拟 AI 则等待调用者期限或最多 30 秒。

重置保留 enabled、seed 和 clock，只恢复 normal 并递增 revision。它不删数据、不清凭据、不取消在途任务；取消要到对应业务页。设置变化只影响后续操作，在途/嵌套操作沿用不可变快照。生产业务缓存和历史保留策略继续生效。

### 覆盖与限制

`server/fixtures.ts` 的 `FIXTURE_COVERAGE` 列出 Google、DataForSEO、GitHub、X、Slack、Discord、Discourse、公开网站、包统计及 Hacker News 的准确操作与上限。Reddit、Trends、AI 搜索和 Lighthouse 通过现有 DataForSEO 路径模拟。`fixtureCatalog` 提供当前项目/seed 对应的 GA4、Slack、Discord 等虚构 ID；`status.defaults` 提供安全目标。

小红书/Bilibili 的 pagination 最多 20 条，YouTube 最多 5 条，是有界批量而非真实游标分页。代理连通性检查不支持，不能返回虚构的“已连通”。不验证真实 OAuth、登录、第三方可用性、反爬、提取器或模型效果。需要整个部署零出站时，应另外观察/隔离服务器出口；本包不是所有插件和浏览器的通用网络沙箱。

### 构建与打包

在本目录执行 `pnpm typecheck`、`pnpm build`，然后 `pnpm pack` 检查独立包内容。构建产物在 dist；包内不得导入宿主私有源码。核对每个 exports 的目标存在，并在实际宿主注册验证。缺少任何服务端/客户端导出目标时不能认定完整包可发布。build/pack 不等于 npm publish；本变更基于尚未合并的数据源 PR #7。

## English

An off-by-default NocoBase 3 companion plugin for dedicated NocoReach demo/test deployments. It replaces upstream I/O with fictional NocoBloom responses while preserving real authentication, parsers, validation, jobs and persistence. It has no live fallback. Unknown targets, unavailable projects and unsupported operations fail closed.

Use a fresh database and separate storage. Set the four fields in the YAML above: mock enabled, explicit demo/test environment, Agents server disabled and vector store disabled. Only enabled in-app notification channels are allowed. Selected jobs.default, scheduler.jobs and notification.jobs must resolve to process-local memory; absent selectors use built-in memory and unused Redis definitions are allowed. External sends/test sends are blocked; inbox delivery and read-state controls remain available. NocoReach's host rejects existing business data/credentials on first activation and checks the permanent dataset marker before workers boot. A marked database cannot restart live. Use another clean database rather than removing its marker.

Register the Server plugin, resolve mockEngineToken and attach authenticated host storage/project/access adapters, including the mandatory first-activation assertPristine check. The Client factory takes {page, parent?}; createMockUi(host) supplies the settings page and banner through injected host UI/access/request adapters. In NocoReach, use Settings → Simulated data at /mock-integrations, prefixed by the application base path. The host must install early dataset, worker and external-execution guards; package registration alone does not protect arbitrary hosts. Wrap operations in run(projectId, fn), route requests through the engine and inject media fixture dependencies into real production adapters. Never replace global fetch. Persist credential-free capture(projectId) snapshots across queue/process boundaries and restore with runSnapshot; bind them to actual internal jobs, never browser-supplied snapshots.

Members may read nrMock/status; administrators may configure/reset with the current revision. Clocks must contain a timezone and are stored as UTC. Reset restores normal and increments revision while preserving enabled, seed and clock. It never deletes business data/credentials or cancels active work. In-flight operations keep immutable snapshots; normal cache and history-retention behavior remains active.

Scenarios: normal, newdata, empty, pagination, rate-limit, login-expired, timeout, malformed, error and slow-cancel. HTTP/AI delays honor real AbortSignals; media slow-cancel waits for actual cancellation. Media pagination is bounded to 20 Xiaohongshu/Bilibili items or 5 YouTube items, not real cursors. Explicit business AI fixtures are marked synthetic; real models, Runner execution and external writes are blocked. Proxy connectivity and real OAuth, anti-bot, extractor and provider validation are outside scope. See FIXTURE_COVERAGE and fixtureCatalog for exact operations, limits and generated identities.

Run pnpm typecheck, pnpm build and pnpm pack in this directory, inspect every export target and verify host registration. Both client and server exports must exist and work in the consuming host; server compilation or tarball creation alone does not establish a releasable full plugin. Packaging does not publish to npm, and the source PR #7 beneath this change is unmerged. Test commands and manual checks are documented in the source application's docs/MOCK-DATA.md; their presence is not a claim of passing results.
