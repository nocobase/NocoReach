# CLI 分发修复（beta.63）

beta.62 修复了 Runner 协议兼容，但 Studio 发布包未包含本地另行构建的 NocoReach CLI。应用使用 `served`，找不到对应平台的 CLI 包时退回 `preinstalled`；Runner 主机没有 `nocoreach` 命令，因此任务在启动编码工具之前失败。

## 修复

- `cli/plugins.ts` 注册应用自有的 `afterServerBuild` hooks，以 `--universal --skip-build` 构建 NocoReach CLI 和配套 Runner 到 `dist/runners`。使用已有 CLI 扩展点，不创建独立插件包；`--skip-build` 避免递归触发应用构建。
- `server/config/agents.ts` 从配置模块所在位置解析 `dist/runners`，不依赖当前工作目录、宿主 rootDir 或 Studio 挂载前缀。beta.64 修正了 beta.63 对宿主根目录的假设：Standalone 的 rootDir 是 dist，Studio 的 rootDir 则是发布目录。
- `config.yml` 的显式 `agents.dist.dir` 仍可覆盖。Studio 现有的 Runner npm 版本配置保留；有匹配安装包时由官方分发机制优先选择安装包。
- 应用版本升为 `1.0.0-beta.63`，让新 CLI 的版本和部署版本一致。通用安装包要求 Runner 主机使用 Node.js 24 或更新版本。

## 验证要求

构建 `pnpm build --target linux-x64 --node-version 24 --tar` 后，部署归档必须包含两个产品的 manifest 和 tar.gz。检查包内版本、SHA-256，并使用官方 Runner 的 `resolveCli` 在空 CLI 缓存中下载、校验、解包并执行命令。

`tests/nocoreach/agents-app.test.ts` 的真实应用／数据库测试提供独立临时 CLI 产物：任务领取必须返回 `archive` 而非 `preinstalled`，再由官方 Runner 客户端经应用挂载前缀下载，官方安装器在无预装命令的情况下安装并执行。其余任务成果、取消及业务重试校验继续执行。

修复不自动重试失败业务任务，避免重复修改仓库。部署验证完成后，从原任务页点击“重试”启动新的业务运行。

## 本次检查

- 全量 138 个测试文件、834 个测试通过；类型检查、修改代码的 ESLint 和格式检查通过。
- Linux x64 / Node 24 发布构建通过，归档内实际包含 CLI beta.63 与 Runner beta.6 的 universal 安装包及 manifest；逐项校验大小与 SHA-256 一致。
- 直接加载编译后的 Agents 配置，官方服务将 CLI 解析为 `archive`；使用官方 Runner 安装器在全新临时缓存中解包实际构建产物，执行 `--version` 返回 `nocoreach/1.0.0-beta.63`。
- 不新增数据库迁移，不修改现有 Runner 注册或授权。

## beta.64 宿主目录修正

beta.63 在线验收发现 Studio 虽成功启动，但分发接口仍返回空清单。改为相对配置模块定位产物，避免把 Studio 发布目录误认为 dist。发布验收必须在 Studio 上通过注册 Runner 凭据下载实际 CLI 并执行 `--version`；仅用 standalone 路径做本地 smoke 不足以验证嵌入式部署。
