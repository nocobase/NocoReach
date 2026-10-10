# beta.58 线上部署与本机 Runner 验收

部署日期：2026-10-10。目标为 https://nocoreach.nfvd.net/main/ ，采用现有独立 Docker 部署。本文记录的是本次目标站点，历史 Studio 实例不在此次部署范围内。

## 部署内容

- Default 模板：`1.0.0-beta.58`；官方 Agents 插件：`0.1.0-beta.3`；Runner：`0.1.0-beta.2`。应用自身的包版本仍为 `1.0.0-beta.56`，它不代表模板版本。
- 部署时源码分支：`template-upgrade-1.0.0-beta.58`，基于 `e24dbdee8ad164e1c32a4409225bd8ec5ebd144c` 的未提交工作区；部署时尚未提交或推送。
- 使用 `pnpm build --target linux-x64 --node-version 24 --tar` 构建，类型检查、原生模块平台检查和服务端依赖打包验证通过。远端通过官方 Dockerfile 的 `DIST=prebuilt` 打包为生产镜像。
- 最终镜像：`nocoreach3:agents-beta58-20261010-v3`，镜像 ID：`sha256:74bdeaa774c76f657db01d7a530faf43cdb341e9ebb16fbc4c3064c52f5b8168`。
- 部署归档 `dist-v3.tar.gz` 的 SHA-256：`ffdcbdd94be826d35fb88984f9713608ea89d22c6fb04988ac6b5a8585d9b36b`。
- 远端发布目录：`/opt/nocoreach3/releases/agents-beta58-20261010`。Compose 项目位于 `/opt/nocoreach3`，容器为 `nocoreach3-app`。
- 保留现有 `config.yml` 和 `/opt/nocoreach3/storage-proxy-ab2ea8a` 的挂载，包括数据库、密钥、登录配置与业务数据。没有重置管理员密码或改动其他应用。
- 迁移记录从 36 增加到 54，升级后的 SQLite `quick_check` 为 `ok`；验收数据创建前，原有业务表记录数均与升级前相同。

## 分发与本机服务

应用 CLI 和 Runner 的 Linux x64 安装包独立放在持久化存储的 `runners/dist/stable`，由线上应用提供下载。本机通过页面生成的一次性连接命令下载、注册并安装服务。

- Runner 名称：`本机 Codex Runner`，ID：`391329534181376`；个人 Runner，仅接收所有者发起的工作。
- Agent 名称：`NocoReach Codex`，ID：`391328519159808`。
- 服务：`nocoreach-runner-beta58.service`，已启用。
- Runner 状态目录：`~/.nocoreach-runner-beta58`；任务工作目录：`~/.nocoreach-runner-work`。
- Runner 安装目录：`~/.local/share/nocoreach-runner-beta58`；应用 CLI 安装目录：`~/.local/share/nocoreach-beta58`。
- 只启用 Codex，并发为 1；本地策略只允许 `NocoReach Codex`、`nr-*` subject，不允许仓库与 build 作业。
- 使用已经登录的 Codex 0.162.0，本次服务 PATH 直接指向已安装的可执行文件，避免版本管理器包装脚本在启动时联网更新。
- 这些目录和服务与本机原有的通用 Runner 独立，未覆盖其状态或注册。

## 实测发现并修复

1. 当部署路径为 `/main` 时，插件推导出的 CLI 名称与实际分发的 `nocoreach` 不一致。应用现在在 `server/config/agents.ts` 明确声明产品身份和 CLI 名称；集成测试验证公开安装脚本中的名称。
2. subject 的 `system` 字段会覆盖官方完整系统提示，导致声明在 guidance 中的 JSON 成果契约和官方凭据保护提示未进入 Codex。现在通过 `guidance.rules` 追加业务规则；集成测试直接断言实际领取载荷包含成果契约、凭据保护和人工审核规则。相关 2 项集成/成果测试通过，修改文件 lint 通过。
3. 首次真实运行因为成果契约缺失，虽然 Codex 进程完成，业务任务仍正确拒绝了不合格成果并显示 `invalid_agent_result`。保留该失败记录，用修复后的程序重试同一任务。

## 验收范围

独立项目 `Runner 真实执行验收`（项目 ID `3`），测试域名 `runner-check.example.invalid`。任务 `本机 Runner 真实执行验收 NR-20261010`（`391329347534848`，项目内 T-1）使用“变化原因调研”做法，不配置仓库。

首次尝试实际执行了只读 `pwd`。另一个 `printf` 命令被编程工具的命令策略拒绝，因此后续通过任务留言取消该命令要求，没有放宽命令权限。验收要求将 `17×23=391` 标记为算术计算，与真实命令输出区分。

浏览器实测通过：从任务详情点击“重试”，本机 Runner 领取官方运行 `391331218194432`，2026-10-10 09:41 UTC 执行 `pwd`，退出码 0，工具事件记录了实际工作目录。约 43 秒后，严格 JSON 成果通过业务校验，页面进入“待确认”。核对真实工具事件后，在浏览器勾选事实核验、选择“不接着做”并接受成果，任务进入“已完成”，成果显示“已通过”。全过程没有模拟 Runner 回执或手工改写任务状态。

应用完成后再次重启验证通过：公网健康检查返回 `ok: true`，容器恢复 healthy；浏览器重新加载后任务与已通过成果仍然存在，Runner 自动重连，显示在线 `0/1`、Codex 已登录。本机服务保持 active。

[打开验收任务](https://nocoreach.nfvd.net/main/actions/391329347534848)。请切换到“Runner 真实执行验收”项目。原始失败记录和修复后的成功记录均保留，便于复查。

本次不验证 GitHub PR 创建、合并、回退或普通成员账户的完整权限矩阵。线上默认模型服务尚未配置，每日分析与在线聊天需要另行配置模型；这不影响使用本机已登录 Codex 的 Runner 任务。

## 备份与恢复

升级前已停止应用并备份配置与完整活动存储，目录为 `/opt/nocoreach3/backups/agents-beta58-20261010`，包含旧 Compose、旧镜像 ID、校验文件及 `config-storage.tar.gz`（权限 0600）。原镜像 `nocoreach3:proxy-ab2ea8a` 保留。

需要回退时，先停止此应用，另行保存当前配置与存储，再恢复备份中的配置、存储及 Compose，然后启动旧镜像并验证。新版迁移后不能只切回旧镜像而继续使用新版数据库。恢复升级前备份会丢弃此后新建的验收记录及其他业务更改。
