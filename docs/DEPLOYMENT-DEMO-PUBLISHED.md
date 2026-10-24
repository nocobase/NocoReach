# Demo Mode 发布版部署记录

2026-10-23 已将 `feat/demo-mode` 当前工作区部署至 252 服务器的 <https://nocoreach.nfvd.net/main/>，保留现有演示数据。发布时间为 `2026-10-23T15:12:44Z`。

## 发布内容

- 基准提交：`d5b78dbd`，已合并当时最新主分支；本次发布还包含未提交的插件版本调整与迁移兼容补丁。
- 应用版本：`1.0.0-beta.69`；Demo Mode：`0.1.0-beta.0`，来自 npm 发布包。
- 目标：Linux x64、glibc、Node 24；容器运行 Node `24.15.0`。
- 镜像：`nocoreach3:demo-published-20261023-v3`。
- 镜像摘要：`sha256:14fe4febfe313e48c690db746cf5996c970f6a66c2b8ccebcc5c8991f3f122ab`。
- 旧镜像：`nocoreach3:demo-reset-20261023`。
- 发布目录：`252:/opt/nocoreach3/releases/demo-published-20261023/`，保存实际源码快照、构建包、迁移结果、数据校验和验收记录。
- 构建包 `artifact-v3.tar.gz` SHA256：`46088d731c30162ef3313b4a80160a95a98d56d440fd06a52e74f22a4cd07b24`。
- 源码快照 `source.tar.gz` SHA256：`7bd16006e6d1f15cf535da708a2f0e86acdb6109823dc15eaf4284c91ce0668d`。本记录是在发布后补写的，不包含在该快照中。

## 数据保留与迁移

原 `config.yml` 和 `storage-proxy-ab2ea8a` 挂载不变，配置文件与备份逐字节一致；只替换 Compose 的镜像。没有执行 demo 导入、清除或重置，已有自动重置计划保持原样。

发布包将早期本地源码版的迁移合并为一个初始化迁移，直接升级会拒绝已有数据库。仓库通过 [依赖补丁](../patches/@nocobase__app-plugin-demo-mode@0.1.0-beta.0.patch) 保留线上原有的 8 条完整迁移及原始清单校验值，不删除历史、不重新初始化。插件运行代码仍为发布版。[构建钩子](../cli/build-demo-migration-patch.mjs) 校验并将这些迁移带入部署包，避免构建重新安装 npm 包后遗漏补丁。

先在断网容器和数据库副本上演练，确认业务内容不变，再停止正式服务做一致备份。唯一需要确认历史校验值的条目是上游已记录修正的 Agents `202610020003_ag_create_runs`；通过官方 `db repair` 处理，没有手改迁移表。正式执行以下 6 条待执行迁移：

- `202610150001_authorization_permission_set_revision`
- `202610170001_ag_runner_quota`
- `202610250001_mail_imap_message_locations`
- `202610270001_ag_online_agent`
- `202610270002_ag_chat_list_visibility`
- `202610280001_ag_explicit_runner_tools`

迁移前后，所有 `nr_*` 和 `demo_mode_*` 表的内容哈希一致。启动后原有 84 条业务快照逐条未变，新增两条运行配置记录：`daily-analysis:workflow`、`nr-app-starts`。数据库 `quick_check` 返回 `ok`。

## 验收

- 新建数据库的 demo 集成测试 6 项通过；此前相关测试 64 项通过。
- Node 24 目标构建、生产依赖检查及迁移文件校验通过。
- 隔离副本、正式容器、正式容器重启后及公网域名均通过接口验收。
- 6 个演示账号、NocoBase／NocoCRM 两个项目、29 条任务、102 条导入记录保留；数据集仍为 `ready`、`zh-CN`，配置 revision 仍为 `6`。
- 演示管理员快捷登录、认证后 OpenAPI、项目和任务读取、首页及入口 JS/CSS 均正常。
- 当前会话没有可用浏览器，未进行真实浏览器视觉验收；未执行真实模型或 Runner 任务。

## 备份与回退

一致备份位于 `252:/opt/nocoreach3/backups/demo-published-20261023/`，目录权限 `0700`，包含完整存储、配置、旧 Compose、旧镜像标识和 `SHA256SUMS`。归档读取和校验通过，密钥随配置配套保留，勿公开分享。

需要回退时先停止 `app` 服务，另存升级后的存储，再从该备份恢复旧配置、Compose 和存储，使用旧镜像启动并验收。不要仅切回旧镜像而沿用已升级的数据库；回退前应处理备份之后新增的用户数据。部署脚本保存在发布目录，失败时会保留失败现场的存储并恢复配套备份。

## 关键词与技能只读浏览修复（2026-10-24）

- 关键词详情查询需要保存模拟查询缓存，已通过演示管理 API 将 `nrKeywordRuns` 加入访客写入集合，配置版本从 6 更新为 7；原定时重置计划和其他配置保持不变。
- 技能列表与详情改为只在内存中补齐尚未初始化的内置技能，浏览 Playbooks 不再写入 `nrSnapshots`；没有为此放开快照表的写权限。
- 当前运行镜像为 `nocoreach3:demo-skills-read-20261024`，在上一版镜像上仅更新编译后的技能服务文件。源文件、编译产物和部署脚本保存在 `/opt/nocoreach3/releases/demo-skills-read-20261024/`。
- 更新前的完整配置及存储备份位于 `/opt/nocoreach3/backups/demo-skills-read-20261024/config-storage.tar.gz`。本次没有执行数据生成、清空或重置。
- 技能单元测试、只读演示集成测试、服务端类型检查通过；线上验证覆盖管理员和增长负责人账号，以及两个项目的 Playbooks、技能、资料列表和记忆状态接口。

## Demo Mode beta.1 升级（2026-10-24）

- 发布源码：`8e1ed5fc`；镜像：`nocoreach3:demo-beta1-20261024`。Demo Mode 升至 `0.1.0-beta.1`，Agents 升至 `1.0.0-beta.22`，管理页只保留概览和每日重置。
- 发布目录：`/opt/nocoreach3/releases/demo-beta1-20261024/`，包含源码归档、部署归档、校验值、迁移预演、部署脚本和验收记录。
- 升级前的完整配置与存储备份：`/opt/nocoreach3/backups/demo-beta1-20261024-retry/config-storage.tar.gz`。
- 先用线上数据库副本预演，再执行正式升级。迁移校验没有冲突，仅执行 Agents 的 `202610290001_ag_repair_runner_agents`；所有 `nr_*` 和 `demo_mode_*` 表在迁移前后的内容校验值一致。
- 6 个演示账号、2 个项目、29 条任务、102 条导入跟踪记录保留；配置版本仍为 7，原集合写入例外、模拟策略、聊天策略和每日重置计划均保留。本次没有重新生成、清空或重置演示数据。
- 初次验收因脚本短时间内重复登录触发认证限流，自动回滚成功。验收脚本改为复用会话后再次预演及部署通过；未修改认证限流配置。首次备份和失败现场保留在 `/opt/nocoreach3/backups/demo-beta1-20261024/`。
- 验收覆盖管理员和增长负责人账号的登录、关键词详情、Playbooks、技能、项目资料和记忆状态接口，以及首页资源、配置和数据状态。
- 容器重启后通过公网域名重复验收，数据数量及完整演示配置与升级前一致；容器健康检查正常。未进行浏览器视觉验收。
