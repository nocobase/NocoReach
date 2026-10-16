# Agents beta.11 部署记录

> 以下为此前实验版本的部署记录，不代表当前功能契约。当前版本的任务仅由 Runner 执行，在线 Agent 仅用于聊天；参见[当前说明](AGENTS-UPGRADE.md)。

后续在线 Agent 版本已于 2026-10-15 16:24 UTC 部署，当前线上状态见[在线 Agent 部署记录](DEPLOYMENT-online-agent.md)。下文保留首次插件升级的历史记录。

2026-10-15 13:09 UTC，将升级分支部署到 252 服务器的 [NocoReach](https://nocoreach.nfvd.net/main/)。应用和 Runner 已上线，数据库迁移、历史记录校验及重启后的健康检查通过。随后已接入新的 Mac Runner 并启用 Codex Agent，但新 Runner 尚未上报 Codex；真实任务验收仍待完成。关闭超时问题见下文。

## 发布与备份

| 项目                         | 值                                                                        |
| ---------------------------- | ------------------------------------------------------------------------- |
| 分支                         | `upgrade/agents-beta11`                                                   |
| 应用源码                     | `0397cf17ece2540bcdbd396651d93aee28b98f39`                                |
| 应用 / CLI                   | `1.0.0-beta.68`                                                           |
| Agents / Runner / CLI Client | `0.1.0-beta.11` / `0.1.0-beta.9` / `0.1.0-beta.7`                         |
| 运行环境                     | Linux x64、glibc、Node 24.15.0                                            |
| 新镜像                       | `nocoreach3:agents-beta11-0397cf1-20261015`                               |
| 新镜像 ID                    | `sha256:1619efee2cfa8c3889f5739118b94c3602c96be9bd60ad8d243e610df0ab749f` |
| 旧镜像                       | `nocoreach3:main-cbbb5a3-20261013`                                        |
| 旧镜像 ID                    | `sha256:19558d99b59917e8e697fd9c0f04904ed2f6e7b62e8773d46e67bcfba09036a2` |

使用项目 Dockerfile 的 `DIST=prebuilt` 模式打包，发布包由 `pnpm build --target linux-x64 --node-version 24 --tar` 生成。首次镜像构建的软件源下载停滞，改用服务器原有代理完成。归档已检查不含运行配置、环境文件或数据库。

- 发布目录：`/opt/nocoreach3/releases/agents-beta11-0397cf1-20261015/`。
- 发布包 SHA256：`850dc6fa21148bf4548a94cf3eef12d78cb3a2c69f2e01ecbe23f9ce94f5d607`。
- 停机一致备份：`/opt/nocoreach3/backups/agents-beta11-0397cf1-20261015/`，保留旧 Compose、配置、镜像标识、数据库统计和完整持久化存储。
- `config-storage.tar.gz` SHA256：`762f37f24cc9cd0b9a4a0b10916a19d9b796afca368299a7359875f63e9d96fb`。已逐文件读回，并提取数据库执行恢复一致性检查，结果为 `ok`。
- 备份目录权限为 0700，数据归档权限为 0600。它们包含业务数据和密钥，不进入 Git 仓库。
- 本机 Runner 状态另存于升级 worktree 的忽略目录 `storage/deployment-agents-beta11/runner-before.tar.gz`；旧 Runner beta.6 安装目录仍保留。

本记录是在部署后追加的文档，不在上述应用源码归档中。PR 没有合并，未触发 Studio 部署。

## 配置与数据库

沿用 `/opt/nocoreach3/config.yml` 和 `/opt/nocoreach3/storage-proxy-ab2ea8a`；配置哈希与备份一致。Compose 只替换镜像。容器仍为 `nocoreach3-app`，监听 `127.0.0.1:13041`，公网路径为 `/main`，保留原身份、密钥、网络设置和 SQLite 数据库。

部署前没有活动或排队中的官方运行。先使用 SQLite 一致副本、原配置和无外网连接的隔离容器验证迁移，再停止旧应用做完整备份并切换。

迁移记录从 63 增至 72：7 项官方 Agents 迁移，另有该分支基线中已有的任务媒体和绝对时间戳两项业务迁移。线上旧源码停留在 `cbbb5a3`，此次发布也包含升级分支基线中此前尚未部署的主线改动。

正式升级及首次重启核对时，原有 5 个业务任务、1730 条快照、6 次官方运行、142 条运行事件、6 条运行简报和 1 个 Google 连接数量保持不变。两条旧 Agent 记录按官方迁移停用并标记删除，历史行保留。数据库 `PRAGMA quick_check` 在预演、正式升级和重启后均为 `ok`。

## 验证结果与限制

- 应用源码 `0397cf1` 的 GitHub CI 测试和 Linux x64 构建通过，本地生产归档构建也通过。
- 容器为 `healthy`，公网 `/main/api/healthz` 返回 200 和 `ok: true`。
- 公网入口 JS、CSS 的内容与本次发布包逐字节一致，安装脚本可读取。
- 未认证 Swagger 和业务接口访问均返回 401；携带 Cookie 的不可信来源写请求返回 403。
- 部署内 `config check` 和 `secrets status` 命令成功；没有重置管理员密码或更换密钥。
- 现有个人 Runner 自动升级到 beta.9，协议版本为 11；重启后恢复在线，Codex 已登录，发现 7 个待启用 Agent。身份、仓库限制和本地策略保持原样。
- 服务器保存的初始管理员凭据已失效，用户选择自行登录启用 Agent。13:17 UTC 后只读核对发现新的 Mac Runner 已接入，旧 Runner 已撤销，`Codex · GPT-6 Astra` 已启用。新 Runner 仅上报 Claude 和 Pi，尚未上报 Codex，因此该 Agent 暂无匹配的执行机。本次未完成生产管理页面读写、附件上传、真实模型任务或仓库 PR 流程验收；本地隔离 UI 和集成测试不能替代这些验收。

**优雅关闭未通过验证。** 两次重启都先出现 30 秒 HTTP 连接排空超时，随后在 35 秒触发应用强制退出。暂停 Runner 后仍可复现；核心 HTTP 关闭代码与旧镜像一致，尚未定位阻止关闭的具体资源，因此未将其归因为 Runner 升级失败。旧版停止时也有连接排空超时，但本次新实例关闭后的内存 jobs 文件没有刷新。重启后数据库和历史记录校验通过，应用与 Runner 恢复健康；这不能证明内存队列在强制退出时完整持久化。后续维护应先排空执行和后台任务，并保留协调备份；关闭流程仍需单独排查。本次没有添加延时重试或兼容分支来隐藏问题。

另外保留两类上游提示：Agents 的 `queue.jobs` 弃用提示，以及历史迁移 `202610020003_ag_create_runs` 校验和变化提示。已对照新旧发布代码，后者仅因删除 `directoryKey/status` 索引声明；补充迁移 `202610260001_ag_drop_directory_index` 已执行，实际数据库没有该索引。没有执行 `db repair` 改写历史校验和。既有 Google 初步数据跳过提示仍存在。

## 登录后的操作

1. 当前已启用 `Codex · GPT-6 Astra`。需先让 Mac Runner 探测并上报已登录的 Codex CLI 及 `gpt-6-astra` 模型；Runner 在线本身不代表能运行所有工具。也可以启用它实际已上报的 Claude 或 Pi Agent。
2. 原本机 Runner 已撤销，下面的白名单调整仅在重新接入它时适用：将 `~/.nocoreach-runner-beta58/policy.json` 的 `agents` 白名单从旧名称 `NocoReach Codex` 改为实际选择的 Agent 名称或 ID，保留现有 `subjects`、`repos` 和 `build` 限制。没有自动重新接入旧 Runner 或放开其权限。
3. 在「项目 AI」重新选择默认 Agent；独立指定 Agent 的任务也需重选。没有自动映射旧 ID。
4. 新建一个研究或草稿验收任务，确认 Runner 领取、资料读取、成果返回和人工审核。旧直接模型任务不会自动转换或重放，详见[升级说明](AGENTS-UPGRADE.md)。

## 回退

旧镜像和升级前完整备份均保留，但尚未实际回退。需要回退时先停止应用和 Runner，另存升级后的数据，校验备份后在独立目录恢复配置、数据库和持久化文件，再使用旧 Compose 与旧镜像启动。必要时将本机 Runner 恢复到保留的 beta.6 程序及协调备份状态。

不能只降级镜像：官方迁移的回滚不会恢复已停用的旧 Agent、取消的运行或默认选择。恢复备份会回到升级前的数据时间点，应先处理升级后产生的业务更改。
