# 独立演示应用部署记录

2026-10-13 已完成两处发布，部署代码来自 `feat/rich-demo-data` 的 `664273ccda601c78e46330c4be754b01096d06de`，应用版本 `1.0.0-beta.66`。

| 目标                                                                         | 部署方式                                        | 演示项目                 |
| ---------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------ |
| [Studio nocoreach-demo](https://studio.v2.test.nocobase.com/nocoreach-demo/) | nb-studio；preview 环境，host/in-process，eager | NocoBloom 演示项目，ID 1 |
| [252 演示站](https://nocoreach.nfvd.net/demo/)                               | Docker Compose，nocoreach-demo-app              | NocoBloom 演示项目，ID 2 |

Studio 新应用的用户名为 `demo`，密码按用户指定值设置，未写入本记录。252 账号保持原样。252 原有项目 1 保留；在项目选择器中选择「NocoBloom 演示项目」查看完整数据。

## 首次发布标识

- 构建：Node 26.8.2、pnpm 11.7.0；目标 Linux x64、glibc、Node 24。使用 `pnpm build --target linux-x64 --node-version 24 --tar`，包含应用 CLI 和 Runner 分发包。
- 归档：79,851,913 字节；SHA256 `2f41c674cee8c2f0463d4d888f99942967c45be9c57ae346c1e65a334f99f7a3`。不含运行配置、环境文件或数据库。
- Studio release：`8b4d70bc-2d18-449f-a9ce-ea89ba69be63`。
- Studio 首次发布 deployment：`737ccedd-f34d-4089-8682-9d00bf790fc2`，状态 succeeded。
- 252 镜像：`nocoreach3:demo-rich-664273c-20261013`；目标机镜像 ID `sha256:5d49101a957283c36a191aa481a22cdecb63a44a4fcc93568563c2a68471e07c`。

## 数据与隔离

Studio 应用通过 `nb-studio app create` 单独创建，使用独立存储、数据库、生成密钥及初始管理员。启用 `nocoreachMock.enabled`、`environment: demo` 和 `initializeData`；关闭 Agents 服务和向量存储，通知仅站内，jobs/queue 使用 memory。应用级变量覆盖了共享环境中的在线模型密钥和嵌套应用托管配置。未导入正式业务数据。

252 更新前，先在复制的演示数据库、`--network none` 容器中启动新镜像，全部初始化阶段完成后才更新演示容器。保留原配置和 `/opt/nocoreach-demo/storage`，新增项目 2，不修改原项目。更新前后的 20 条已有业务快照逐条一致，新增 52 条快照；迁移记录维持 50 条，SQLite `quick_check` 为 `ok`。

252 正式 `nocoreach3-app` 的镜像、启动时间不变，`/main/api/healthz` 正常。Studio 已有 `nocoreach` 的应用记录及当前部署未改变。

## 验证结果

- 两处公网健康检查均返回 `ok: true`，252 容器为 healthy。
- 两处真实登录和业务 API 均成功；Studio 浏览器使用指定 demo 账号登录。
- 两处各有 36 个演示任务、108 条评论；16 个状态接口映射出的 21 个可用接入项，20 项为已接入，小红书为已采集。
- 分别重启后，项目列表、任务和评论数量保持，不重复初始化。
- 浏览器确认洞察指标、数据接入、任务列表、示例交付物和三条任务评论可见。顶部模拟数据横幅已移除，左下角显示演示图标。
- Google 每日同步未开启，页面会显示对应提示；已有历史模拟数据和接入状态正常。
- Studio 错误日志为空。252 重启时出现既有的 30 秒连接排空超时日志，随后正常停止、启动和恢复健康。

未验证真实供应商、真实模型或 Runner 执行，也未新增上传下载测试。Studio 嵌入式页面侧栏的旧版元信息读取仍显示 Default Template / v0.0.0；发布记录中的实际应用版本为 beta.66，本次未改框架元信息读取逻辑。

## 备份与后续更新

252 备份位于 `/opt/nocoreach-demo/backups/rich-demo-664273c-20261013/`，含旧 Compose、配置、镜像 ID、数据库统计和完整配置/存储归档，权限限制为 root。发布目录为 `/opt/nocoreach-demo/releases/rich-demo-664273c-20261013/`。旧镜像保留；回退代码不会自动撤销新增演示数据，恢复数据应停止演示容器并使用协调备份。

后续通过 `nb-studio` 发布时只指定 `nocoreach-demo`，252 只更新 `/opt/nocoreach-demo`。不要覆盖 Studio 的 `nocoreach` 或 252 的 `/opt/nocoreach3`。

本地构建、接口、接入状态、重启和日志证据位于忽略目录 `storage/deployment-demo-20261013/`。最后服务检查时间为 `2026-10-13T00:32:56Z`。

## 演示图标位置更新

2026-10-13 随后部署 `81236e7f63648d12deb6b3f82f55817d96738c4a`：演示图标直接替换侧栏底部标语前的盾牌图标，移除单独占用的一行；未开启模拟数据时保留原图标。

- Studio 当前 release：`853adfbd-7ad5-4af7-85b3-fba7b8a895bb`；deployment：`6214982e-b6cd-4e81-9858-7f64016cc3a0`，状态 succeeded。
- 当前归档 SHA256：`2df59f88fd2c7236d7f8efe448ef28040bb80c6a83a20e84296cd3259e10cd1b`。
- 252 当前镜像：`nocoreach3:demo-icon-81236e7-20261013`，容器 healthy。此次备份位于 `/opt/nocoreach-demo/backups/demo-icon-81236e7-20261013/`。
- 组件相关测试 3 个文件共 20 项通过，TypeScript、定向 ESLint 和格式检查通过。Studio 和 252 均验证图标原位替换，任务与评论仍为 36/108。
- 252 正式容器镜像及启动时间不变；Studio 正式应用仅最后访问时间变化，部署与运行实例未变。

此次发布证据位于 `storage/deployment-demo-icon-20261013/`。
