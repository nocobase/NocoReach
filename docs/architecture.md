# 技术结构与运行边界

前端 `apps/nocoreach/client`、服务端 `apps/nocoreach/server`、迁移 `apps/nocoreach/database/main/migrations` 属于同一个 nocobase/nocobase3 应用；本机 Agent 保持为 `apps/agent`。数据库为独立 SQLite，不依赖旧 alpha 宿主。

浏览器通过原生 API Client 访问挂载路径下的 `/api/reach/<resource>/<action>`，原生认证与业务权限校验后调用领域服务。ReachStore 使用框架 Repository 与事务。nrSnapshots 存项目、策略、来源快照和知识；nrTasks 存任务；nrGoogleLinks、nrSyncJobs、nrSyncPartitions 存同步状态；nrKeywordRuns、nrKeywordCandidates 存付费查询和候选；nrSettings 通过原生 Secrets 加密。

在线 AI 使用原生 AI 服务。每日分析使用 Scheduler 与 Jobs，采集和任务执行由 ScheduleExecutor 调度。通知使用原生通知服务。本机 Agent 调用同一应用的专用业务接口。

付费查询先预留预算并复用已知结果，不确定结果不自动重试。第三方内容只作资料；密钥不返回前端、不写日志。数据源、模型和真实改仓库流程的验证缺口见 [验证记录](NOCOBASE3-VERIFICATION.md)。

构建、配置、来源校验与运行要求见 [开发说明](DEVELOPMENT.md)、[安装说明](INSTALL.md)、[迁移映射](NOCOBASE3-MIGRATION.md)。
