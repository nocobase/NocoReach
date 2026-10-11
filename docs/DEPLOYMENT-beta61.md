# beta.61 依赖升级部署记录

后续按用户要求发布了主题补丁，当前镜像为 `nocoreach3:app-beta61-theme2-20261011`；当前发布标识与视觉验收见 [主题适配记录](THEME-UPGRADE-beta61.md)。以下保留首次依赖升级的迁移和验收记录。

2026-10-11 按用户要求，将 `upgrade/nocobase-app-beta` worktree 的升级结果部署到 252 服务器的 <https://nocoreach.nfvd.net/main/>。应用已启动，完成真实浏览器读写、历史任务读取和服务重启验证。既有 Google 同步和默认在线模型配置问题仍存在，见下文。

## 发布标识

| 项目      | 值                                                                        |
| --------- | ------------------------------------------------------------------------- |
| 源码目录  | `/home/gchust/work/NocoReach-app-beta`                                    |
| 分支      | `upgrade/nocobase-app-beta`                                               |
| 基准提交  | `66901b7e5c8b8de5356e0524ee0dac6e913781c8`                                |
| 源码状态  | 发布的是包含未提交修改的 worktree 快照；没有提交、推送或合并到 main       |
| 应用版本  | `1.0.0-beta.56`；依赖参照 default beta.61，完整模板源码标记仍为 beta.58   |
| 构建环境  | Node 26.8.2、pnpm 11.7.0                                                  |
| 运行目标  | Linux x64、glibc、Node 24 / ABI 137                                       |
| 发布时间  | `2026-10-11T09:11:13Z`                                                    |
| 重启验证  | `2026-10-11T09:24:49Z`，09:25 UTC 再次检查通过                            |
| 新镜像    | `nocoreach3:app-beta61-20261011`                                          |
| 新镜像 ID | `sha256:46d935bb0ba1af6efbb6003008311a09fdb5fa22a964af1377d99193eab4b0e5` |
| 旧镜像    | `nocoreach3:task-adaptation-20261011-v3`                                  |
| 旧镜像 ID | `sha256:98ee88cbd0f7f88dfaf9394430ff55b519e7db7982cf2b594ae06d9db2d6421a` |

部署包 `dist.tar.gz` 的 SHA256：

```text
7103b11a4e430835891ceb5ae2e5bd5d5089b6d4a39cbba25670b0cfde52d154
```

735 个源码文件的归档 `source.tar.gz` 的 SHA256：

```text
f94e31da02092b042da1317cb39d17ca3ddc94b535e6b1ca9ebe03b38d3fbfa2
```

本部署记录及随后更新的文档不在此前生成的源码快照中；部署代码没有再修改。服务器发布目录为 `/opt/nocoreach3/releases/app-beta61-20261011`，保留源码、构建包、校验信息和验收结果。

## 部署与数据

- SSH 目标为 `252`（`root@192.168.2.252`），Docker Compose 单实例；容器 `nocoreach3-app`，监听 `127.0.0.1:13041`，容器端口 13000，公网路径 `/main`。
- 使用 `pnpm build --target linux-x64 --node-version 24 --tar` 构建，再用仓库 Dockerfile 的 `DIST=prebuilt` 模式打包。构建通过，26 个服务端依赖入口均能解析；归档未包含运行配置、环境文件或数据库。
- 原配置 `/opt/nocoreach3/config.yml` 只读挂载；SHA256 与部署前备份一致。`app.publicOrigin` 已为 `https://nocoreach.nfvd.net`，满足新版 Cookie 写请求来源校验。
- 原存储 `/opt/nocoreach3/storage-proxy-ab2ea8a` 保持挂载到 `/app/storage`；SQLite、上传、密钥、jobs 和 queue 持久化目录保留。Compose 仅替换应用镜像。
- 先在隔离容器、克隆数据库、禁用网络的条件下验证启动与迁移，再停旧应用做一致备份并切换镜像。
- 新增且仅新增官方 Agents 迁移 `202610100001_ag_index_run_event_types`，迁移记录由 54 变为 55；SQLite `PRAGMA quick_check` 返回 `ok`。没有新增 NocoReach 业务迁移或导入示例数据。
- 原数据数量保留：业务任务 5、官方 runs 6、用户 1、Agent 1、Runner 1、Google 连接 1、同步任务 8、同步分区 290。验收写入后 `nr_snapshots` 1723 → 1724；其他业务表数量不变。
- Workflow 注册和入口随本次升级移除，其历史数据没有删除。每日分析继续由 Scheduler 执行。

部署前一致备份位于 `/opt/nocoreach3/backups/app-beta61-20261011/`：

- `config-storage.tar.gz`：完整配置与持久化存储，约 108 MB，权限 0600，归档逐文件读回验证通过；校验值在 `SHA256SUMS`。
- `compose.yml`、`config.yml`、`old-image.txt` 和 `before.json`：旧部署配置、镜像标识、全表数量及迁移记录。
- 备份目录为 0700，含密钥与业务数据，不应加入仓库或公开分享。

构建时主机空间偏紧，清理超过 24 小时的 Docker builder 缓存，释放约 4.1 GB；没有清理镜像、容器或数据卷。重启验收时剩余空间约 5.6 GiB。

## Runner 与应用 CLI

同步构建并发布了 Linux x64 独立安装包（内置 Node 24.15.0），放入持久化存储的 `runners/dist`：

| 程序            | 分发版本                 | SHA256                                                             |
| --------------- | ------------------------ | ------------------------------------------------------------------ |
| nocobase-runner | `0.1.0-beta.4`           | `44d0ed6ce5140538505d421c4934e40026ec99d9c6c34beec1d5fa2fc1d50c1a` |
| nocoreach CLI   | `1.0.0-beta.56.20261011` | `18b26fcbe3530c6a4c945111cf758da84f37153a98cde515254f3aeeb9a1c628` |

CLI 使用独立发布版本，避免相同应用版本的旧包命中缓存。打包最初遇到临时目录跨文件系统的 `EXDEV`；把 `TMPDIR` 指向 worktree 的临时目录后成功，没有修改官方包。

现有“本机 Codex Runner”自动从 beta.2 更新到 beta.4；服务重启后再次自动连接。数据库确认协议版本 8，页面显示在线、Codex 已登录。没有改 Runner 本地权限或凭据，也没有新建真实模型执行。

## 验收证据

| 检查               | 结果                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 容器与公网健康检查 | `healthy`；`GET /main/api/healthz` 为 200，`ok: true`                                                                     |
| 现有管理员会话     | 升级及重启后均有效；真实域名下页面刷新、懒加载与 API 请求正常                                                             |
| 管理页面           | 权限集、用户、Scheduler 可读取原数据；自动化菜单仅保留定时任务                                                            |
| 业务读写           | 在既有“部署验收（可删除）”项目新增 71 字测试知识，再修改标题，保存成功                                                    |
| 重启持久化         | 标题、正文和原知识记录均可重新读取；配置哈希不变                                                                          |
| 历史任务           | NocoBase 的 T-2 回复草稿、来源、审核状态和官方 RunTranscript 可正常读取                                                   |
| Runner             | beta.4／协议 8，重启后在线，Codex 已登录                                                                                  |
| Scheduler          | `nocoreach.daily-analysis` 仍启用，cron `0 9 * * *`、Asia/Shanghai，原运行计数 1637 保留，下一次为 `2026-10-12T01:00:00Z` |
| 未认证访问         | Swagger、Users 均返回 401，分别为 `API_DOCS_UNAUTHENTICATED`、`AUTHENTICATION_REQUIRED`                                   |
| 来源保护           | 携带测试 Cookie 的不可信来源写请求返回 403 `INVALID_CSRF_ORIGIN`                                                          |
| 浏览器控制台       | 所检查页面没有捕获到 error 或 warn                                                                                        |

保留的测试知识为项目 1 下 `5ff92b25-8d1`，标题“beta61 部署持久化验收”，只含验收说明。没有推进原业务任务、发布论坛回复或主动执行每日分析。

本地证据在忽略目录 `storage/deployment-beta61/`：`knowledge-after-restart.png`、`runner-after-restart.png`、`scheduler-live.png`、`public-http-checks.json`、`browser-console.json`、`restart-verification.json`、`migration-result.json` 和 `log-summary.json`。服务器发布目录也保存数据库、迁移和日志摘要。

## 发现的问题与验证边界

1. **原有 Google 同步问题仍在。** 部署前 Search Console／GA4 已报告同步失败，旧日志已有跳过 Google 初步数据和同步失败记录。本次没有更改连接、代理或 OAuth 凭据。
2. **默认在线模型尚未配置。** 初版记忆和每日分析的相关功能仍提示未接入在线 AI；粘贴知识时能够按默认分类保存。该情况部署前已存在，Runner 登录状态正常不等于已配置在线模型。
3. **停机连接释放较慢。** 验证重启时出现一次 `HTTP server did not drain within 30000ms; closing active connections.`，之后正常停止、启动并恢复 Runner 连接；没有发现数据丢失。后续发布应预留约 30 秒连接排空时间，此处未修改上游关闭逻辑。
4. **上游弃用提示。** 两次启动均出现 Agents 包声明 `queue.jobs` 已弃用并被忽略的警告。启动成功、Scheduler 和 Runner 可用；本次未触发新的真实 Agent 任务，不能据此覆盖所有后台执行路径。
5. **初始登录凭据已失效。** 服务器保存的初始管理员用户名／密码返回 401；用部署前数据库和旧镜像在隔离容器验证，同样返回 `INVALID_USERNAME_OR_PASSWORD`。未重置密码。本次使用既有管理员浏览器会话完成读写，未验证当前有效密码重新登录。
6. **文件上传未完成浏览器验证。** 浏览器扩展未启用本地文件访问，文件选择器设置文件被拒绝；没有修改浏览器权限。改用粘贴文字完成知识写入测试。Runner 安装包下载和自动升级已实际发生，但这不替代业务附件上传测试。
7. **未在生产创建普通用户，也未等待下一次每日计划。** 未认证拒绝已验证，普通用户权限覆盖来自升级前的自动化测试；生产检查确认计划保持启用和下次时间，没有主动触发有外部调用的分析。

部署前的类型检查、691 个测试及新增／修改代码 ESLint 均通过；全仓库历史 lint 和第三方 peer 约束问题见 [依赖升级记录](DEPENDENCY-UPGRADE-beta61.md)。

## 回退路径

旧镜像与完整备份均保留。回退尚未执行；应同时考虑数据库迁移和已自动升级的 Runner，不能把仅换镜像当作已验证的回退方案。

1. 停止应用和连接它的 Runner，另外保留当前数据库及存储，避免丢掉发布后产生的数据。
2. 校验备份 `SHA256SUMS`。将 `config-storage.tar.gz` 恢复到新的隔离目录，保留原权限、文件属主和密钥；不要把备份直接覆盖到仍在运行的 SQLite 上。
3. 从备份恢复 Compose／配置，选择旧镜像，将存储挂载指向协调恢复后的目录。恢复备份会回到发布前的数据时间点，若期间已有新业务写入，应先决定如何保留。
4. 原 Runner 使用 beta.2／协议 7，本次为 beta.4／协议 8。旧服务端若不接受新协议，应恢复匹配的 Runner 程序及旧分发清单，保留原 Runner 身份配置，再启动连接。
5. 验证公网健康、登录、原任务／知识、密钥解密、Runner、定时任务和再次重启持久化。
