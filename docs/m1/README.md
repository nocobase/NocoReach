# M1 实现与待验收项

日期：2026-09-30。状态：**源码实现及本地验证完成，真实宿主验收待可用测试身份；M1 尚未关闭。** 未提交、未推送。用户反馈页面仍旧后，已将构建发布到当前本地宿主；没有修改现有任务、用户或数据库，也未调用真实模型。

## 已实现

- 任务详情接入 M0 验证的 NocoProject 布局，增加共用页头、真人负责人、在线／人工／本地执行方式、运行状态、成果版本对照及活动时间线。紧凑／舒适密度保存在 URL；任务看板显示负责人、执行者与独立运行状态。保留原路由和六阶段业务列，打回成果返回待推进。
- 方案讨论继续复用既有在线聊天。确认方案前必须明确点击“由我负责”。在线文本步骤通过服务端创建持久 Run；后台每两秒检查队列，浏览器关闭不重复触发。一次 Run 固定项目、任务、方案、步骤、授权人、负责人、执行者、能力快照及模型。
- AI 成功只生成未批准成果。人工编辑另存版本，批准／打回绑定确切成果 ID；打回后必须产生新版本才能再次批准。迟到结果与人工修改发生冲突时单独保存候选，不覆写当前成果。实际执行／发布回执与效果验证继续独立处理。
- 旧任务使用只读兼容投影；无 work 的历史已完成任务仍为已完成，负责人缺失显示未指定。首次写入在同一事务内保存旧 work/status 快照、旧成果及方案，保留原 evidence；不伪造历史 Run、作者或用量。
- 新增执行模块为 TypeScript，编译到插件 `dist/execution`；已接入根构建和插件启动入口，现有 CommonJS 连接器保留。

## 存储与服务实现

本阶段继续复用 `nrTasks` 与 `nrSnapshots`，不增加宿主集合或批量迁移。`evidence.work.schemaVersion=2` 保存当前投影及既有业务历史。新增长数据按独立 snapshot 记录存储，未把 Run／完整版本列表持续塞入 task JSON：

| key 前缀 | 内容 |
| --- | --- |
| nr-task-run:项目:任务:runId | 单次执行与模型、输入快照、状态、结果引用及可用用量 |
| nr-task-artifact:项目:任务:artifactId | 不可覆写的成果正文版本 |
| nr-task-review:项目:任务:reviewId | 方案批准／成果批准／打回决定 |
| nr-task-plan:项目:任务:version | 不可覆写的方案版本 |
| nr-task-legacy:项目:任务: | 首次迁移前旧 work/status 快照 |
| nr-task-op:项目:任务:requestId | 调用人与请求载荷哈希，防止重复执行及同键异载荷 |

所有任务写入沿用 PostgreSQL 按项目＋任务的事务锁。请求版本过期返回 409；客户端保留草稿。运行结果单独事务写入。重复请求返回已保存状态，失败／未知请求不自动重试；运行中超过五分钟在后续 worker 扫描时标为 interrupted_or_unknown，不重新调用模型。当前 worker 单进程串行执行，跨实例通过任务锁防止重复认领；不是 M2 的通用租约／机器服务。

M1 注册 `nrTaskWork:get/advance` 和 `nrTaskRuns:start/get`；后者 get 返回该任务完整执行投影。成果编辑、审核仍统一经 `nrTaskWork:advance`，没有提前注册 M0 设计中的独立 artifacts/reviews 资源或本地运行协议。后续拆分可保留这些兼容入口。

当前权限沿用单项目管理员试运行：入口必须有登录用户及 admin/root 角色；任务查询绑定 projectId，后台调用前及写回前再核对项目、执行授权人和负责人角色。不会把 M1 的管理员验证冒称多成员项目权限系统；非管理员协作仍属后续阶段。

## 在线服务适配

当前宿主为 NocoBase 3.0.0-alpha.7，其 AI 接口与 NocoProject 的新版 app 容器不同。新适配通过已安装 plugin-ai 的 `aiEmployeesManager.resolveModel` 读取 Atlas 配置，再经 `aiManager.getLLMService` 调用；确认员工和模型已启用。只传已保存项目摘要、任务证据、方案、前序成果和本次打回意见，不传账号凭据。不启用工具或浏览器检索，不执行外部写入。

单次模型调用设置四分钟超时、关闭适配器可访问的 SDK 重试，不在应用层自动重跑。真实 provider 的错误、超时及 SDK 行为仍需宿主验收；不得以本地注入 provider 测试代表真实模型成功。新模块没有调用 NocoProject daemon；本地 Agent 选择仅明确提示 M2 待接入。

## 验证记录

| 检查 | 结果与边界 |
| --- | --- |
| 后端回归 | 54/54 通过，包括新增 14 项执行测试；使用内存 repository 边界验证，未冒称真实 PostgreSQL 并发验收 |
| 产品前端逻辑 | 3 个文件、10/10 通过，包括打回成果的看板列映射 |
| 构建 | 新服务 TS→CommonJS、Portal tsc、Vite build、build-html 通过；已有大 bundle 提示保留 |
| 组件视觉 | 1440/390px × 明/暗 × 紧凑/舒适，共 8 组通过，无整页横溢出、无 pageerror；已人工查看宽屏亮色与窄屏暗色合成截图 |
| 真实登录 | 本地宿主初始化身份返回 HTTP 401；补充正常 basic 认证器后仍为 401，未修改账号或绕过认证 |
| 真实在线流程 | 尚未执行；已准备 `tests/e2e/task-execution-review.mjs`，需要合法管理员测试 token |
| 发布 | 已发布到本地 13004 宿主及 main Portal，插件采用 server/index.js 与 dist/execution；仅重启目标 PM2 进程。HTTP 页面与构建入口 index-DKVxuz-y.js 一致，资源返回 200，新增执行接口对未登录访问返回 401。登录后的业务回归仍待测试身份 |

## 下一步验收

1. 本地发布已完成；使用已授权测试身份继续真实回归，不得输出或提交 token。
2. 执行真实 E2E：在线方案 → 明确负责人 → 保存并批准 → 后台文本执行 → 刷新恢复 → 人工修改 → 精确版本审核／打回 → 再生成；验证同请求不重复运行、并发保存 409 后草稿保留。脚本只创建并清理合成测试任务及其精确前缀记录；若仍在运行则保留供核对，不删除活跃任务。
3. 真实核验机会确认到任务入口、旧任务只读打开、非管理员拒绝、跨项目拒绝和数据库事务锁；现有机会确认的单元测试不能替代这一完整路径。
4. 检查四种主题／密度及窄屏下的完整任务页面。组件组合预览不包含真实聊天、认证和后台，不能替代此项。
5. 确认无剩余欠项后再关闭 M1、进入 M2。本地 Agent、取消协议、CMS 发布及自动效果复盘仍不在 M1 交付范围。

## 复现命令

使用 Node 24。在根目录运行：

```sh
node plugins/connections/scripts/build-server.cjs
node --test tests/unit/*.test.cjs
```

在 apps/portal 运行：

```sh
node node_modules/typescript/bin/tsc
node node_modules/vitest/vitest.mjs run ./tests/*.test.ts
node node_modules/vite/bin/vite.js build
node scripts/build-html.mjs
node node_modules/vite/bin/vite.js --config tests/m0/vite.config.ts
```

独立预览 `/tests/m1/`；根目录执行 `node tests/e2e/m1-components-review.mjs`，浏览器路径可用 `NR_CHROMIUM_PATH` 指定。真实脚本需要 `NR_PORTAL_URL`、`NR_API_TOKEN`、`NR_TEST_MODEL=1`，执行 `node tests/e2e/task-execution-review.mjs`。凭据仅通过本机环境注入。
