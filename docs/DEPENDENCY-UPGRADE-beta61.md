# beta 通道依赖升级（2026-10-11）

本次在 `upgrade/nocobase-app-beta` 分支及独立 worktree 完成，起点为 `66901b7e5c8b8de5356e0524ee0dac6e913781c8`。主 worktree 没有改动。依赖升级验证完成后，按用户后续要求部署至 252 服务器，迁移与线上验收见 [部署记录](DEPLOYMENT-beta61.md)。

## 版本来源与范围

依赖升级部署后，用户追加要求更新主题；已选择性合入 beta.61 的配色和共享展示样式，并修复宽松表格、手机头部的显示问题，见 [主题适配记录](THEME-UPGRADE-beta61.md)。下文描述最初依赖升级范围，完整模板源码标记仍保持 beta.58。

使用 npm 官方 registry，未切换到 nocobase.ai。实际运行了：

```sh
pnpm create @nocobase/app@beta reference-app --no-install --json
pnpm create @nocobase/app@beta beta-app --template-tag=beta --no-install --json
```

生成器为 `@nocobase/create-app@0.1.0-beta.30`。第一个命令仍取模板的 `latest`（beta.57），第二个命令取 `beta`（beta.61），因此以第二个生成结果为依赖参照。模板包为 `@nocobase/app-template-default@1.0.0-beta.61`。

这次合入依赖及其必要兼容修改；不整体合入 beta.61 的新首页、品牌、主题和文案结构。因此 `nocobase.defaultTemplateVersion` 仍为 `1.0.0-beta.58`，不能把依赖参照版本当作完成模板源码合并的版本。下次整体升级仍应从 beta.58 比较源码，核对本次已经合入的兼容修改。

主要版本：

| 依赖              | 升级前        | 升级后        |
| ----------------- | ------------- | ------------- |
| app-client        | 2.0.0-beta.2  | 3.0.0-beta.0  |
| app-server        | 2.0.0-beta.2  | 2.0.0-beta.3  |
| app-cli           | 1.0.0-beta.16 | 1.0.0-beta.18 |
| app-plugin-agents | 0.1.0-beta.3  | 0.1.0-beta.5  |
| agent-runner      | 0.1.0-beta.2  | 0.1.0-beta.4  |
| app-cli-client    | 0.1.0-beta.1  | 0.1.0-beta.2  |
| app-skills        | 0.1.0-beta.26 | 0.1.0-beta.29 |

认证、授权、用户、API Key、文件、通知、Scheduler、数据库浏览等已有插件采用 beta.61 中声明的版本。Agents、Runner、应用 CLI 采用与 app-client 3 配套的 beta 版本。新模板新增的 Mail 没有在 NocoReach 中使用，本次未添加。详细版本以 `package.json` 与 `pnpm-lock.yaml` 为准。

## 移除与保留

- `@nocobase/app-plugin-workflow`：用户确认不需要旧管理页内手工创建的工作流后，移除依赖、Client/Server/CLI 注册、配置及构建入口。没有回滚或删除其历史数据库记录。NocoReach 的 `pm.get('workflow')` 只是 `legacy/schedule.ts` 的兼容名称，实际每日分析仍由 Scheduler 执行。
- `@nocobase/hub-cli`：上游已停止维护，移除依赖及过时发布说明。仓库没有 Hub remote 或调用它的 CI 配置；不读取或更改用户凭据。
- `@nocobase/ai-employee-avatars`：旧模板中存在，但 NocoReach 原先就未声明，本次无须删除。
- 官方授权、用户、Scheduler 等插件：保留服务端能力及注册；其新版删除的管理界面由应用维护。
- 业务迁移、种子及 NocoReach 数据模型保持不变。

## 管理界面源码迁移

新版 app-client 移除了 settings/dev 路由体系；多数插件同时删除了管理页面，只保留 API。为继续提供原有功能，从 NocoBase 上游提交 `fb7b5764c97e19aab5668c331fd02744d374aaea`（移除这些界面前的版本）提取页面及其依赖闭包，放入 `client/pages/settings/`。这是应用自有代码，不是新增插件。

迁入用户、API Key、计划任务、通知日志、数据库浏览、权限集、权限检查、默认访问、共享及限制规则界面；使用现有 `client/components/ui/` primitives。保留双语资源，以应用 locale 的 `overrides` 提供原命名空间的文案。

设置页使用普通 `defineAppRoutes()`，应用的 `defineAdministrationRoutes()` 负责旧 `/settings` 路径，并把菜单和面包屑标题映射为应用的 `management.*` 文案键。原 SettingsLayout、头部设置入口、铃铛、项目切换器和 Agent 面板保留。页面继续使用原有 `authz.resource` 与 action，已保存的授权不随页面所有者变化。服务 token、鉴权 hooks、用户及数据库 API client 继续从官方公开入口获取，避免创建重复服务实例。

原框架已删除的 dev 路由构建隔离测试随接口删除；设置页权限、深层路由、拒绝加载与侧栏行为的测试继续维护。新增管理页面归应用负责，今后升级需同时验证 API、权限和文案。

## 验证

- `pnpm install --frozen-lockfile --offline` 通过，锁文件可复现安装；已执行 `pnpm nocobase skills sync`。
- `pnpm typecheck` 通过。最后一次构建再次检查 Client/Server 类型，单独的 `tsconfig.node.json` 检查也通过。
- `pnpm test`：120 个测试文件、691 个测试全部通过，包含 NocoReach 业务、Agents/Runner 协议、管理页路径与授权、中英文菜单及页面文案。Agents/Runner 测试运行真实插件和数据库，编码工具使用测试替身，没有调用真实模型。
- `pnpm build` 通过，26 个服务端导入包均能在部署目录解析。此构建的原生模块目标为本机 Linux x64 / Node 26；实际部署应使用目标环境参数重新构建。
- 145 个新增或修改的 JS/TS 文件通过 ESLint；`git diff --check` 通过。全仓库 `pnpm lint` 仍失败（29,247 errors、271 warnings），主要来自已有移植代码和格式；原 main 上未改动的 `server/nocoreach/google-sync.ts` 单独检查已有 409 errors，本次未批量重排业务代码。

使用独立临时数据库运行真实应用和 Chromium：十个管理页面均成功读取接口；新增用户、创建 API Key、暂停与恢复每日分析计划任务成功。另建临时项目，检查洞察、任务、项目 AI、Agent、Runner、模型和用量七个主应用页面。英文桌面页面及中文、深色、compact 主题下的 375px 手机页面均无浏览器运行异常；已人工查看用户、计划任务、任务、Agent 及手机截图。临时脚本、结果和截图保存在本 worktree 的 `storage/upgrade-verification/`，未把测试数据写入现有应用数据库。

`pnpm peers check` 仍报告上游/第三方版本约束不一致：Claude Agent SDK 要求较新的 Anthropic SDK；Tiptap 菜单扩展与 core/pm 小版本不同；Agents 声明的 react-day-picker 为 10.0.1，而模板为 10.0.2。没有 NocoBase 包自身 peer 版本冲突。本次保留模板依赖及锁定结果，没有通过 overrides 强制改写这些第三方包。

## 运行配置变化

新版认证会检查所有携带 Cookie 的写请求来源。部署环境须提供浏览器实际访问的 origin（`APP_PUBLIC_ORIGIN` 或 `app.publicOrigin`，只含协议、域名和端口，不含 `/main` 等路径）；额外前端来源通过 `auth.trustedOrigins` 配置。缺少可信来源时写请求返回 `403 INVALID_CSRF_ORIGIN`。临时浏览器测试也显式配置了自己的地址，没有关闭 CSRF 检查或改变线上配置。

## 回退

升级源码仍在独立 worktree，原 `main` 的 `66901b7` 源码与锁文件保留。后续经用户要求已部署新版并执行官方插件迁移；回退需协调数据库、存储、密钥和 Runner 版本，备份位置及恢复步骤见 [部署记录](DEPLOYMENT-beta61.md#回退路径)。
