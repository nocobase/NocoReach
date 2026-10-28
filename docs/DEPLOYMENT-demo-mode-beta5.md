# Demo Mode beta.5 首次部署记录

2026-10-28，已将 `@nocobase/app-plugin-demo-mode@0.2.0-beta.5` 部署到 252 服务器的 [NocoReach 演示站](https://nocoreach.nfvd.net/main/)。部署使用原有 Docker Compose、独立演示数据库和持久化存储。

本文保留首次部署的镜像、迁移与备份记录。后续补齐了插件翻译、升级了其余 NocoBase 配套包，并适配 Scheduler beta.20；最终 CI 结果和后续部署标识记录在 [PR #304](https://github.com/nocobase/NocoReach/pull/304)。下方版本表和验收结果仅对应首次部署。

## 适配内容

- 删除应用层的演示 Cookie 配置，由插件根据 HTTPS 公网地址设置 `SameSite=None; Secure; Partitioned`，并处理旧 Cookie 和自动登录的会话检查。
- 使用插件的访客会话偏好隔离，同一演示账号的不同访客不会互相修改语言和主题偏好。应用现有主题控件仍使用本地存储，插件没有替代这些控件。
- 配套升级 App Client、App Server、Authentication、Authorization、Users、Agents、Runner 和 CLI，清理本地 Mock 插件重复的框架实例。
- 删除 Agent 页面对已废弃 pending discoveries 的读取和一键启用逻辑，继续使用已启用的 Agent；没有可用 Agent 时进入插件的运行环境配置流程。
- 明确将归档会话自动清理设为关闭，保留已有的任务记录保留策略。部署配置仍可显式启用清理。
- 保留应用的数据集、项目识别、模拟网络、模型和任务适配器。它们承担项目级业务行为，插件的部署级演示判断和通用写入保护不能替代。

## 发布标识

| 项目                    | 值                                                                        |
| ----------------------- | ------------------------------------------------------------------------- |
| 源码分支                | `feat/upgrade-demo-mode`                                                  |
| 源码基线                | `6abdb3d275f9e047111565a6ebd808f1f47328f7`，构建包含本次未提交修改        |
| 应用版本                | `1.0.0-beta.72`                                                           |
| Demo Mode               | `0.2.0-beta.5`                                                            |
| App Client / App Server | `4.0.0-beta.4` / `3.0.0-beta.4`                                           |
| Agents / Runner         | `1.0.0-beta.29` / `0.1.0-beta.21`                                         |
| App CLI / CLI Client    | `1.0.0-beta.30` / `0.1.0-beta.17`                                         |
| 目标平台                | Linux x64 glibc，Node.js 24                                               |
| 镜像                    | `nocoreach3:demo-beta5-6abdb3d2-20261028`                                 |
| 镜像 ID                 | `sha256:bc48295ef855b0dd121bca70bc7ac28faa742bb8a11a56ada1887d25b0bdd099` |
| 服务器发布目录          | `/opt/nocoreach3/releases/demo-beta5-6abdb3d2-20261028`                   |
| Compose / 容器          | `/opt/nocoreach3/compose.yml` / `nocoreach3-app`                          |

构建命令为 `pnpm build --target linux-x64 --node-version 24 --tar`。应用 CLI 和 Runner 已随镜像打包。源码归档与构建上下文的 SHA-256 分别为：

- `source.tar.gz`：`aa3ca1d93a62eccbc223b22fdcd4aeb82b809f5f78e7873030052c3985895ffb`。
- `image-context.tar.gz`：`3daf3ea369ec2e70b9e4f7a1b56d11cc2f558693f99949cc1b29a1a1b86e73e8`。

源码快照在部署前归档；本文等部署后验收记录不在该快照内。部署时 Git 修改尚未提交或推送。

## 数据与迁移

保留 `/opt/nocoreach3/config.demo-c081d2b7.yml` 和 `/opt/nocoreach3/storage-demo-c081d2b7` 的原挂载。配置文件的 SHA-256 在切换及重启后保持一致；SQLite `quick_check` 均为 `ok`。

先在隔离数据库副本验证迁移，再停止正式应用并备份，随后执行已核对的迁移。执行结果如下：

- 历史迁移 `202610140002_absolute_business_timestamps` 的校验值发生变化。比对旧发布和源码确认，仅新增 MySQL 路径，本站 SQLite 分支未变；通过 `db repair` 更新记录，没有重新执行时间转换。
- 执行 Agents 的 pending Agent 退役、会话关注状态和会话链接 3 项迁移；目录索引迁移不适用于当前数据库，跳过。
- Member 权限种子为既有用户补充显式授权，再移除旧的全局 Member 分配。演示库没有真实 Agent 或运行记录，pending Agent 清理没有删除业务引用。
- 迁移记录从 71 增至 74，种子记录从 4 增至 5。业务表记录数在切换时保持不变；仅元数据、权限分配和正常启动快照发生预期变化。
- 演示数据仍生成于 `2026-10-28T03:00:01.142Z`，没有因部署或验证重启而重置。下次计划重置为 `2026-10-29T03:00:00Z`。
- 浏览器验收新增登录会话，并通过已有允许写入的 `nrKeywordRuns` 缓存市场查询结果；任务保存仍被只读策略拒绝。

隔离预演发现，运行中复制的内存调度持久化文件可能仍记录旧的重置时间，启动副本时会补执行重置。正式部署先正常停止应用，核对落盘的下次执行时间在未来，再备份及升级。恢复预演副本后重新验证，业务数据保持一致。

## 验收结果

- 冻结依赖安装、应用类型检查、Linux x64 完整构建通过；变更范围 ESLint、格式、文档相对链接和 `git diff --check` 通过。
- Demo 数据、模拟网络、模型和 Runner 适配、实际 Cookie 策略、访客偏好隔离、成员和项目权限、API 密钥、Agent 页面及插件接入回归通过。
- 容器为 `healthy`；公网 `/main/api/healthz` 返回 200，应用名称和挂载路径正确。
- 新访客自动进入管理员账号；账号菜单可切换至普通成员，成员读取项目正常，访问演示管理 API 返回 403。
- 两个独立浏览器访客的偏好互不影响；切换账号和服务重启后，当前访客的偏好仍保留。
- 来自另一个站点的 iframe 能自动登录，并通过后续会话查询识别用户；浏览器 Cookie 确认具有 `Secure`、`SameSite=None` 和与嵌入站点对应的分区键。
- 演示管理中英文切换、375 像素手机菜单和 Agent 页面完成浏览器检查；页面没有捕获到 JavaScript 异常。
- 任务表单写入被拒绝时保留用户输入，显示统一提示。草稿拒绝测试使用模拟响应；任务创建拒绝由实际服务器返回。
- 重启应用后，同一浏览器的账号、偏好、项目仍可读取，数据库完整性和配置校验通过。
- 从公网实际下载 CLI `1.0.0-beta.72` 和 Runner `0.1.0-beta.21`，大小及 SHA-256 与 manifest 一致；官方 Runner 安装器在空缓存安装 CLI 后可执行，重复调用不重新下载。两份 universal 包使用本机 Node.js 26.8.2 执行版本命令通过；生产应用运行在 Node.js 24。
- CLI 的实际安装包包含浏览器认证配置，隔离传输测试确认 `login` 到达设备码接口；旧版安装升级、`current` 切换和用户状态保留的 5 项相关回归通过。

分发包校验值：

| 产品          | SHA-256                                                            |
| ------------- | ------------------------------------------------------------------ |
| NocoReach CLI | `4ad2b1357cab9cdbac3cb1845ef42211d1069d9128fb8d64869bb99bf201eb8d` |
| Runner        | `0434c894fc9509ed35dbcf94d08d56e51c980fc2e24e503cb173ea40e744bc55` |

原始验收记录与截图保存在本地忽略目录 `storage/demo-mode-beta5/`；服务器发布目录保存迁移、备份、重启及验收摘要。

## 备份与回退

升级前已停止应用，备份完整配置、Compose 和活动存储，备份目录为：

`/opt/nocoreach3/backups/demo-beta5-6abdb3d2-20261028`

其中 `config-storage.tar.gz` 的 SHA-256 为 `488c7b5b5a6d14fcc249699782f3592004687b40c60c05337d501be4c9164d97`。目录权限为 0700，数据归档为 0600。旧镜像 `nocoreach3:main-fd1d4890-20261025` 保留。

需要回退时，先停止应用并另行保存当前配置与数据，再成套恢复旧配置、存储、Compose 和镜像。新版数据库已有迁移，不能仅切回旧镜像。恢复备份会丢弃备份之后的数据变更。

## 运行提示与验证范围

- 部署过程中根分区一度仅剩约 613 MB；最终复核可用空间为 28,879,450,112 字节，约 26.9 GiB，使用率 86%。本次仅删除自己的隔离预演容器和临时目录，没有清理其他项目、镜像或数据卷。
- 重启时活跃连接排空超过 30 秒，框架关闭连接后正常重启。之后健康检查、会话和数据验证通过。
- 日志仍有 Agents 的 `queue.jobs` 弃用提示、无效旧 Runner 密钥的心跳 401，以及一次搜索索引任务的凭据过期提示。未重注册 Runner 或修改业务凭据；这些记录不作为真实外部集成可用的证据。
- 依赖安装仍提示 Anthropic SDK、Tiptap 和 react-day-picker 的上游 peer 版本约束差异；本次相关类型检查和构建通过，没有扩大到无关依赖升级。
- 验收覆盖专用演示环境，没有启动真实模型或真实 Runner 任务，没有发布内容、验证外部 OAuth 服务或执行附件上传。
