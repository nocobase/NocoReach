# 全站模拟数据浏览器验收（2026-10-12）

本轮使用真实 Chromium 154.0.8037.57，按实际路由及功能重新建表。路由呈现、权限边界和具体业务行为分别计数；未将页面能打开等同于功能全部通过，也未引用旧 PR #22 抽查作为本轮通过证据。

同一 PR 的后续补验见[最终版本补充验收](mock-acceptance-2026-10-12.followup.md)：最终产品源码更新为 `285447651790df3f1452b7ce03e2b02ca8f99881`，增加 packages 畸形数据错误的英文修复，补齐原七条边界，并提供有限功能清单与新鲜路由矩阵。下文第一阶段的旧基线、测试数和完整 build 均保留其真实版本，不覆盖为新版结果。

## 基线与环境

- 初始 main：`8bd161d8129cb90f0d206ee0a58c214512a226f4`，tree `cf6dc2319855ac9fd1ca3f27048c1a7adccae229`。
- 验收过程中 #27 合并；本分支整合到新 main `f4d7c9d09a12230ba2afaf289bc6a5192a61f139`，保留语义翻译 key 迁移。第一阶段修复提交：`db40caa016512670fc3d1c120a6a7abfc86371f3`；补验修复提交为上述 `2854476`。
- 各写入验收域分别使用新建 SQLite、storage、模拟项目和合成测试账号，端口 13173–13178。共享源文件及依赖，不共享写入数据库。未读取已有应用配置、用户 API key 或个人浏览器会话。
- 仅使用 `docs/MOCK-DATA.md` 假凭据和虚构 NocoBloom 数据。真实供应商、外部通知、Mail 发送、模型执行、Runner、发布均未调用。Mail 仅保留迁移元数据、不注册运行服务/路由的模拟隔离设计保持不变。
- 初次启动时旧 node_modules 缺少当前 main 依赖，按锁文件重新安装后启动。共享 dev 模块缓存、源码保存重启及 rebase 导致的加载中/模块临时失败作为环境诊断保留，不计产品缺陷或通过；以稳定后的复跑结果为准。

## 路由及权限

[完整 61 模式清单](mock-acceptance-2026-10-12.routes.md)、[246 条逐项记录与 10 条补验](mock-acceptance-2026-10-12.routes.json)、[路由注册及导航盘点](mock-acceptance-2026-10-12.inventory.json)。

初始基线实际访问 61 模式：246 条路由/边界记录中 233 通过、13 阻塞，无最终路由失败。55 条 required 路由覆盖 admin/member × 中英文；13 重定向、6 retired fallback、未加入成员门禁、访客登录跳转另有断言。管理员/成员导航分别为 32/28 项；四个核心页 × 两身份的 375px 菜单、Escape 和溢出检查通过。

另以真实合成任务及代理配置补验 6 条详情记录，通过并解除对应缺 ID 阻塞；记忆权限修复补验 4 条通过。原始 246 条记录不被覆盖。当时剩余 7 条阻塞为：管理员中英真实 Agent 详情 2、有效邀请接受 3、实例禁注册下的注册表单 2。后续通过受支持的安全夹具补齐有效详情/邀请，并将禁注册正确跳转归为预期边界通过，详见补充报告；未将无效 ID 页冒充有效实体操作。

本节的完整路线证据来自旧 main 加第一阶段修复，不将其重新标记为新提交全扫。后续针对 `2854476` 另行重新访问全部实际模式，记录在补充报告的新矩阵中。

## 第一阶段实际业务行为

| 范围                                          | 已通过的真实浏览器操作                                                                                                                                       | 限制                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 模拟设置                                      | 启用/保存/刷新；非法 seed、clock 校验；reset 取消不改 revision，确认递增并保留 seed/clock；停用后请求被拒且有可读提示                                        | 不变更真实环境安全设置                                                         |
| Google GA4/GSC                                | 本地模拟 OAuth、选择两类资源、确认；7/28/56 天同步及刷新；重复 7 天保持分区记录数                                                                            | 未完整浏览器覆盖每种 Google 故障/暂停/恢复组合                                 |
| 网站                                          | 错误 URL 校验、预览选择、确认导入 8 页、重复仍 8 页；取消不保存；全部取消选择时确认禁用；刷新                                                                | 不执行真实抓取                                                                 |
| DataForSEO 与搜索研究                         | 假凭据保存验证；关键词空值校验、查询、URL/刷新恢复、选中保存、CSV 下载；趋势查询、竞品新增；AI 品牌查询及结果页；AI 问答四种模拟模型结果、阅读回答、刷新恢复 | 不调用真实收费服务或模型                                                       |
| Slack / Discord / X / HN / Discourse / GitHub | UI 接入、保存刷新、重复同步；错误场景→正常恢复；GitHub 假 token 验证；中英文 375px                                                                           | 未跑每来源的限流/过期/超时/畸形/分页全部笛卡尔积                               |
| packages                                      | npm/PyPI/Docker 接入、重复、错误恢复、刷新和窄屏；修复后 28 天 npm 10,420、PyPI 3,168，Docker 24,576                                                         | Docker 指标不是日下载合计                                                      |
| Reddit                                        | 假配置、8 帖子、重复新增 0；失败 toast、刷新后 alert；固定业务时钟 cutoff；新词恢复；停止确认；中英/375px；匿名写入 401                                      | 不自动重试收费状态不明的同一查询；恢复使用新词                                 |
| Bilibili / 小红书 / YouTube                   | 空配置校验、检查保存、重复、newdata、pagination、error 恢复、slow 取消、刷新；中英/375px                                                                     | YouTube 仅模拟；真实网络采集受约束，未绕过                                     |
| 项目知识 / Skills / 做法 / 规则 / 代理        | 知识新增、改名、刷新、删除、语言；Skills 新增/编辑/取消/开关刷新；做法新增/编辑/取消/复制；规则有效范围保存刷新；代理保存/取消                               | #19 已开放的知识弹窗滚动修复不重复实施；代理引用与每字段完整重复校验未全部覆盖 |
| 成员 / 任务                                   | 管理员改角色刷新；成员只读及写 API 403；合成待办详情、评论保存刷新，`runs=[]`；成员记忆 draft/check 控件隐藏、seen 保留                                      | 未运行 Agent；#26 回复草稿实际成果态无安全生成条件，未通过 DB 伪造             |

去重例：Slack 16→16，Discord 两来源合计 36→36；X/HN/Discourse 各 8→8；Bilibili/小红书正常→重复→新增→分页为 3→3→4→20，YouTube 为 3→3→4→5。服务 API 用于准备场景和核实持久化，表中 UI 操作均由真实 Chromium 完成。

## 缺陷及修复证据

| 缺陷                                | 复现及根因                                                                   | 修复与回归                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 停用模拟项目显示内部码              | GitHub 预览真实返回 409 / `NR_MOCK_PROJECT_DISABLED`，UI 原样显示内部码      | API 错误适配保留 status/reason/payload，以语义 key 显示中英可操作说明；组件和 Playwright 回归                   |
| Reddit 失败提示误作成功且刷新消失   | error 场景真实失败，toast 类型仍 success，详情刷新无醒目失败状态             | error toast 与连接/报表持久 alert；真实失败→刷新→新词恢复 Playwright                                            |
| Reddit 数据时间不实且失败丢成功时间 | 固定时钟 2026-09-20，健康信息却显示 2026-10-12 操作日                        | 保存业务 cutoff 和 lastSuccessAt；失败保留成功历史；初审指出旧记录无 cutoff 仍错误回退，红测确认后改未知为 null |
| Bilibili 取消沿用成功               | 先成功后 slow 取消，刷新仍保留前次 `lastRun.ok=true`                         | 当前操作取消写 cancelled 失败状态，保留已有 3 视频和原 verifiedAt；取消/替换操作守卫及真实 UI 回归              |
| npm/PyPI 28 天永远空                | 取 28 个完整日却用 `> from` 排除第一天，仅剩 27 日，永不满足 28 日完整性     | 改 `>= from`；1..28 合计 406、排除今天/第29天、缺日仍 null 的红→绿边界测试及真实页面指标                        |
| 成员记忆按钮与权限不符              | member 能看到启用的 Retry/Check now；服务端始终 admin-only，并未发现越权成功 | 两处 UI 条件沿用 ReadOnly；成员隐藏、管理员保留、seen 仍可用，组件与中英双角色真实复验                          |
| 英文来源错误仍含中文                | Slack 包裹前缀、Discord/X 空后缀、HN 搜索词上下文未被旧动态模板翻译          | 严格来源错误语法和已知系统 copy 翻译，保留频道/查询/未知详情原文；中英保存快照组件与真实错误态回归              |

未新增 `as any`，所属 TypeScript 检查通过；保留历史文件原有 `@ts-nocheck`，不宣称已消除其全部既有类型问题。保持 #26 ReplyDrafts 和已合并 #27；#19 知识弹窗滚动与 #25 工作流不在本次修改范围。

## 第一阶段检查与独立审查

第一阶段源码 `db40caa016512670fc3d1c120a6a7abfc86371f3`：13 文件、124 项定向测试通过；`pnpm typecheck` 通过；完整 `pnpm build` 通过。已核对 client/server/CLI、模拟插件四个运行时 exports、CLI/兼容 Runner 两份压缩包内容及 manifest 的 size/SHA-256；部署依赖安装、裁剪和 29 包可达检查全部完成。最终 `2854476` 的前端增量检查另列，不混用版本。详见[检查 JSON](mock-acceptance-2026-10-12.checks.json)。

Scoped ESLint 无错误，仅保留 index 既有数组 index key warning；老页面/服务文件已有密集格式 lint 问题未批量改动。四条连接弹窗关闭 Playwright（1440/375 × compact/default）全部通过。全新 reviewer 针对最终源码独立代码审查和 Chromium 复验：**APPROVE，无 must-fix**；7 文件 78 测试通过，3 条关键 Playwright 通过，missing_scope/HealthLine 中英文 × 1440/375 共 8 组通过。禁用项目用例初次与同账号语言脚本竞争，停止并行语言操作后完整串行复跑通过，旧 attempt 不计通过。详见[独立审查报告](mock-acceptance-2026-10-12.review.md)。另单独执行 #26 回复草稿两文件 12 测试通过，但不替代真实成果态浏览器验证。初审独立运行 63 项测试，通过并发现旧 Reddit cutoff 必须修复项；该项已补红→绿回归。最终审查使用全新 agent、新数据库和 storage；在它之前的两轮审查所发现问题均修复后，才进入最后独立复验。

已完成的修复前后自动化：媒体 48 项；Reddit/API/健康 43 项，后续 legacy-cutoff 两文件 15 项；packages 7 项；memory 3 项；来源错误语义适配 19 项。上述有重叠，不相加作为总测试数。整合后统一测试以最终日志为准。

## 非阻断观察与明确未执行

开发模式各页出现 React script-tag 警告：`Encountered a script tag while rendering React component. Scripts inside React components are never executed when rendering on the client. Consider using template tag instead (https://developer.mozilla.org/en-US/docs/Web/HTML/Element/template).` 来源为 next-themes 0.4.6 注入脚本、React 开发渲染 `completeWork`，原栈 `react-dom_client.js?v=aab7941e:9369:86`。未抑制控制台，也未修改上游包；最终前端产物在独立生产模式实例复核 connections/project/data-reddit/home 四页：console 与 page errors 均为空，124 条脚本响应全部 200，无 Vite 脚本；该警告未在此生产 smoke 中复现。

官方用户创建 API 对带连字符用户名返回 500，日志 `Username is invalid`。该输入来自本轮造数脚本，未认定为应用 UI 缺陷；改用合法合成用户名后成员流程正常。

未执行真实 Agent 网络权限、真实模型、Runner、外部通知、Mail 发送、发布和真实 YouTube 抓取。缺少授权安全执行条件的真实能力明确 blocked/not run。未声称每个按钮 × 场景 × 角色 × 语言 × 宽度的所有组合通过。用户环境旧数据、凭据及安全设置保持不变。

## 复跑入口

先按 [模拟部署说明](../MOCK-DATA.md) 新建独立数据库、storage、项目与合成账号，再运行。以下变量仅指向本轮合成账号文件；不导入个人登录态。

```sh
pnpm typecheck
pnpm exec vitest run tests/nocoreach/mock-app.test.ts tests/nocoreach/bilibili-source.test.ts tests/nocoreach/reddit-source.test.ts tests/nocoreach/data-health.test.ts tests/nocoreach/data-health-locale.test.ts tests/nocoreach/packages-source.test.ts tests/nocoreach/packages-hackernews.test.ts tests/components/nocoreach-api.test.tsx tests/components/nocoreach-source-error-locale.test.tsx tests/components/project-memory-permissions.test.tsx tests/components/nocoreach-locale.test.tsx tests/logic/app-locale-coverage.test.ts tests/logic/nocoreach-locale-coverage.test.ts
pnpm build
```

新 Playwright 用例主动 opt-in：Reddit 需要 `APP_URL`、`NOCOREACH_MOCK_ACCEPTANCE=true`、`NOCOREACH_TEST_CREDENTIALS`；媒体需要 `APP_URL`、`NOCOREACH_MOCK_MEDIA_STORAGE_STATE`。系统 Chromium 可指定 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`。分别运行 `tests/playwright/nocoreach-mock-reddit.test.ts` 和 `tests/playwright/nocoreach-mock-media.test.ts`。默认未配置时跳过，不能把跳过当作浏览器通过。

临时截图、DOM、API 核实和可重放浏览器脚本保留在各独立实例目录，未将账号/session/config/原始日志提交。仓库内路线 JSON、清单、本报告和最终检查证据为持久交付；独立最终审查的中英文 375px 两张截图已随仓库提交；其他原始附件不依赖 `/tmp` 路径供远端 PR 读者读取。

最终发布前再次核对远端 main（2026-10-12 15:32 UTC）：仍为 `f4d7c9d09a12230ba2afaf289bc6a5192a61f139`。未合并、未部署。
