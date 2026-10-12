# 最终独立验收报告

结论：**APPROVE；未发现 must-fix。** 可在主代理完成其构建检查后创建英文 Draft PR；本 reviewer 未创建 PR、merge 或部署。

- 最终源码：`db40caa016512670fc3d1c120a6a7abfc86371f3`
- 基线：`f4d7c9d09a12230ba2afaf289bc6a5192a61f139`
- 独立复验日期：2026-10-12 UTC。
- 独立实例：`http://127.0.0.1:13180/main/`；Chromium 154.0.8037.57。
- 独立数据库和 storage：`/tmp/nocoreach-release_review-20261012-_08fmoii/`，由指定 provisioning helper 新建；独立合成管理员，UI 登录创建 project 1。没有复用其他 reviewer 的业务数据库或 session。
- 阅读仓库 AGENTS、application-development SKILL、frontend workflow、DEVELOPMENT 和 MOCK-DATA。未修改 repo 源码、未 commit。现有 CHANGELOG/docs/qa/test-results 工作区改动不属于本 reviewer。

## 代码审查

审查 baseline→最终 hash 的全部产品修复 diff 与相关调用：

1. `NR_MOCK_PROJECT_DISABLED` 在 API adapter 映射为语义键，保留服务端阻止行为，双语文本可行动。
2. Reddit 失败走 error toast，并在数据页持续显示；lastSuccessAt 保留前次成功，dataThrough 使用业务时间且未知历史保持 null。
3. Bilibili 取消记录 failed/cancelled；revision 和 operation identity 阻止旧运行污染新配置，既有视频及 verifiedAt 保留。
4. packages 窗口包含第 28 日，避免正常完整区间只有 27 个桶。
5. memory 的普通成员 draft retry/check now 隐藏，seen 行为仍保留；服务端授权未放宽。
6. translateSourceError 只识别服务所属语法和白名单；Slack/Discord/X/HN 保存错误的渠道、query 和未知上游细节保持原样。
7. 本轮 missing_scope 修复使用完整首尾锚定模板，动态 scope 保留；healthText 的 systemError 分支确实调用 translateSourceError，HealthLine 和 HealthPanel 共用。

未发现需要阻止 Draft PR 的代码问题。

## 独立执行结果（均针对最终 hash）

**Vitest：7 files / 78 tests PASS**：

- tests/components/nocoreach-source-error-locale.test.tsx
- tests/components/nocoreach-api.test.tsx
- tests/components/project-memory-permissions.test.tsx
- tests/nocoreach/bilibili-source.test.ts
- tests/nocoreach/data-health.test.ts
- tests/nocoreach/packages-source.test.ts
- tests/nocoreach/reddit-source.test.ts

**真实 Chromium：**

- 使用 MOCK-DATA 文档假 Slack token，在 UI 检查 token、选择返回频道并连接。切换模拟 error 后 UI Read now，刷新后错误仍保留；没有真实 Slack 调用。
- 实际持久错误的 HealthLine：en/zh × 1440/375 四组 DOM 断言通过；英文为 `Sync failing for over a day: Slack: Slack rejected the request: mock_error`，中文正常。HealthPanel 截图亦确认英文翻译。
- missing_scope：仅拦截 `nrChat/status` 的返回快照，把 lastRun.errors 换为合成 `Slack #分析：Slack 应用缺少权限：channels:history,分析。任务，{0}，请在 OAuth & Permissions 里加上后重新安装`。en/zh × 1440/375 四组 UI 断言通过；英文系统模板翻译，`分析`、`分析。任务，{0}` 原样保留。**这是浏览器渲染回归，非真实 provider 权限调用或真实 missing_scope 持久化。** 375px 双语截图已目视确认换行和按钮可读。自定义脚本 0 page errors。
- Playwright Bilibili：取消后刷新保留 cancelled 提示、旧 recent 和 verifiedAt；恢复 normal 再读取成功，PASS。
- Playwright Reddit：失败持续显示、历史成功证据保留和新 query 恢复，PASS。
- Playwright disabled：英文409原始阻止代码+可读提示，中文375可读提示及无页面横向溢出，串行重跑 PASS（15.6s）。初次中文步骤与独立 locale 脚本并行，因同一测试账号语言偏好竞争等待中文字段超时；该 attempt 不计通过。停止其他语言操作后串行重跑完整用例通过。

## 证据

根目录 `/tmp/nocoreach-release_review-20261012-_08fmoii/`：

- `review.mjs`：真实 Slack mock 接入、error、刷新。
- `locales.mjs` / `locale-results.json`：8 组本轮浏览器断言，0 page errors。
- `slack-error-en.png`：保存错误。
- `persisted-en-1440.png`、`persisted-en-375.png`、`persisted-zh-1440.png`、`persisted-zh-375.png`：健康状态。
- `missing-scope-en-1440.png`、`missing-scope-en-375.png`、`missing-scope-zh-1440.png`、`missing-scope-zh-375.png`：动态权限错误。
- 同名 `.txt` 保存当时 DOM 文本。
- `playwright-results/`：首轮 media/Reddit 和有干扰 disabled attempt；`disabled-serial/`：独立串行重跑的双语截图。
- `baseline-connections.png` / `baseline-dom.txt`；登录 bootstrap pageErrors 为空；OpenAPI 获取200。

## 边界与未覆盖

本轮没有重复246路由全扫，没有独立重跑普通成员浏览器403/seen（相关 component tests 通过，前 reviewer 的浏览器证据不计为本轮执行）；没有独立运行全构建，主代理另行负责。未测试真实 provider、真实 OAuth、真实模型、Runner、邮件、外部通知或发布；未进行进程级零出口观测。Mail mock 无服务/route、保留 metadata 按设计接受。未将任何模拟结果描述为真实供应商可用性。未读生产配置或真实凭据；指定 helper 仅用于克隆隔离测试模板并生成本轮假账号。无剩余产品阻塞项。

仓库持久截图：[English 375px](mock-acceptance-2026-10-12/missing-scope-en-375.png)、[中文 375px](mock-acceptance-2026-10-12/missing-scope-zh-375.png)。其他原始临时附件未提交。
