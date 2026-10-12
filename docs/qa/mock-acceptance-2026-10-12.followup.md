# 最终版本补充验收

本页延续同一 Draft PR #28。最终产品源码为 `285447651790df3f1452b7ce03e2b02ca8f99881`；它在 `db40caa016512670fc3d1c120a6a7abfc86371f3` 后仅增加 packages 错误文案修复及组件回归。文档提交不被当作新的产品实现版本。

## 新鲜全路由矩阵

重新从实际运行时注册表核对 **61 模式**（55 required、4 guest、2 optional）。[最终逐条 JSON](mock-acceptance-2026-10-12.final-routes.json)的全部 **243 条均通过**，每条实际绑定 `285447651790df3f1452b7ce03e2b02ca8f99881`：220 条 required（55 × admin/member × 中英）、12 条 guest/optional、4 条未加入成员、6 条 retired/fallback、1 条管理员打开有效邀请。Agent 两语及有效邀请三个分支由相同源码的独立实例 13186 实际重验后合并，环境来源明确记录。

另有 **10 条导航/窄屏**和 **6 条硬刷新**通过，单独列出，不计入 243。每个角色账号独立，中英文整段串行；语言 PUT 200 后核对账户菜单语言及真实硬刷新。其余路由通过 SPA 导航等待稳定 DOM、有限 API 完成和精确重定向 URL，不使用 networkidle 等待长连接。最终四个 required 组合各 55 条，任务夹具 `runs=[]`，模拟项目 enabled/normal。

成员英文根路由第一次被旧首页请求 tracker 等待超时，中文无效邀请第一次被通用文本长度阈值误判；均保留 firstAttempt，分别用全新页面真实 API/heading 断言重验。前轮 db40caa 的 137 条部分记录和 disabled 场景记录均未重新贴成新提交通过。最终主记录只有已分类的 React script-tag 开发告警，无未分类控制台错误。

本次 243 与原阶段 246 的计数口径不同：按上述固定集合生成，没有为了凑齐旧总数重复添加登录/无效邀请边界。路由通过只说明页面状态与声明的权限边界，不代表生成分析、执行 Agent 或每项业务功能成功。数据库中历史失败的每日分析和 inbox 通知也不被当作正常分析成功证据。

## 可审阅的有限功能清单

这是一份有限清单，不代表所有控件与场景的笛卡尔积。`历史` 指主报告中已执行的业务验收；`补验` 的实际提交及结果保存在 [逐项业务证据](mock-acceptance-2026-10-12.followup-cases.json)。完整路由打开/门禁计数另外记录，不与此表相加。

| 功能                        | 正常                                                         | 错误                                                     | 恢复/取消                                                            | 权限                                   | 持久化                                   | 证据与缺少条件                                                                            |
| --------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| 模拟设置                    | 启用保存                                                     | seed/clock 校验、停用拒绝                                | reset 取消/确认                                                      | 管理员设置                             | revision 与 seed/clock 刷新              | 历史；真实配置不变                                                                        |
| Google GA4/GSC              | 模拟 OAuth、选资源、7/28/56 天                               | malformed 两来源 job failed、旧 coverage/lastSyncAt 保留 | 新 normal job 成功；56 天排队任务 pause → reload → resume 同 ID 完成 | 路由成员门禁另表                       | paused 状态刷新、成功 cursor/recordCount | 补验及独立复验；另加 running 暂停与 35 秒无旧写回观察                                     |
| 网站                        | 预览选择、导入 8 页、重复不增                                | URL 校验                                                 | 取消不保存、无选项禁止确认                                           | 历史成员门禁                           | 刷新仍 8 页                              | 历史；真实抓取未执行                                                                      |
| DataForSEO/关键词/趋势/品牌 | 假凭据、查询、保存、CSV、竞品、四种模拟回答                  | 空关键词                                                 | URL 与刷新恢复                                                       | 历史路由门禁                           | 保存刷新                                 | 历史；真实付费 API/模型未执行                                                             |
| Slack                       | 接入、重复读取                                               | login-expired                                            | 刷新保留错误 → normal 读取成功                                       | 历史成员门禁                           | lastRun 失败与恢复                       | 补验；此补验未采集消息保留总数                                                            |
| Discord                     | 接入、重复读取                                               | rate-limit                                               | 刷新保留错误 → normal 读取成功                                       | 历史成员门禁                           | lastRun 失败与恢复                       | 补验；此补验未采集消息保留总数                                                            |
| X                           | 接入、重复搜索                                               | login-expired                                            | normal 搜索成功                                                      | 历史成员门禁                           | 8 → 8 → 8                                | 补验；未测每月额度耗尽跨月                                                                |
| Hacker News                 | 接入、重复同步                                               | malformed                                                | normal 同步成功                                                      | 历史成员门禁                           | 8 → 8 → 8、刷新错误                      | 补验；查询名称保持原文                                                                    |
| Discourse                   | 接入、重复同步                                               | timeout                                                  | normal 同步成功                                                      | 历史成员门禁                           | 8 → 8 → 8、刷新错误                      | 补验；分类/主题两个错误                                                                   |
| npm/PyPI/Docker             | 接入、重复、28 天/累计指标                                   | malformed 三包失败                                       | normal 同步成功                                                      | 历史成员门禁                           | 刷新错误与包列表仍 3                     | 补验发现英文残留，见下文修复；包数量不等同于完整历史值相等                                |
| Reddit                      | 8 帖、重复 0                                                 | 错误 toast、持久 alert                                   | 换新词恢复、停止确认                                                 | 匿名写入 401                           | cutoff 与 lastSuccessAt                  | 历史最终源码回归；不盲重试收费状态不明查询                                                |
| Bilibili/小红书/YouTube     | 正常、重复、newdata、pagination                              | 空配置、error                                            | slow 取消与恢复                                                      | 历史成员门禁                           | 刷新保留旧数据与正确取消状态             | 历史；YouTube 真采集未执行                                                                |
| 知识/Skills/做法/规则       | 新增编辑、复制/开关、规则范围                                | 已有字段校验                                             | 编辑/删除确认取消                                                    | 历史管理员/成员                        | 保存刷新                                 | 历史；知识弹窗滚动由开放 #19 处理                                                         |
| 代理字段/引用               | 创建、GitHub 连接选择                                        | 非 HTTP/S URL、密码缺用户名                              | 修正保存、编辑取消、解除引用后删除                                   | 成员隐藏管理入口且 list 403            | 密码不回填、引用计数 1、刷新仍引用       | 补验 P1–P8；引用时 UI 禁删/API 409；真实代理连通性 unsupported                            |
| 成员/待办/记忆              | 改角色、合成待办详情评论                                     | 成员写 API 403                                           | 取消/返回；seen 保留                                                 | Retry/Check now 对成员隐藏             | 角色、评论刷新                           | 历史；任务 runs=[]，无执行                                                                |
| Agent 详情                  | 官方离线 metadata fixture 后 GET 200、中英详情               | 无效 ID 另列边界                                         | 硬刷新同 ID/字段                                                     | admin 可编辑权限存在，但此处仅行使读取 | revision/owner/name/instructions         | 补验；不是创建 UI 或执行验收                                                              |
| 有效邀请                    | guest 中英创建账号加入；匹配已有邮箱 Join                    | 已登录其他邮箱 gate、重复接受拒绝                        | UI Sign out → 新账号加入                                             | 只应用空 grants，无额外角色            | accepted_user_id、emailVerified=false    | 补验；邮件未发送，非空 grants/回滚/过期/撤销未执行                                        |
| 公开注册                    | disableSignUp=true 正确跳转登录                              | 当前部署禁注册边界                                       | 中英一致                                                             | 未放宽认证配置                         | 无新账号产生                             | 当前配置的预期行为通过；启用后的注册表单成功态不适用/未执行                               |
| ReplyDrafts                 | 真实 Chromium 中实际组件的段落/列表/粗体及原始 Markdown 复制 | 危险 HTML/URL 过滤                                       | 不涉及任务重试                                                       | 不声明任务权限通过                     | 不声明 full-app 保存通过                 | component fixture only；无受支持无运行 completed-result seed，生成/持久化 pipeline 未执行 |

## 安全夹具与原七条缺口

Agent 使用已安装插件公开 `@nocobase/app-plugin-agents/server/tokens` 的服务，在停用 executor 的独立实例离线调用 `agents.create`。空 modelEntries、runnerIds、actions、skillIds，仅建立正常 metadata；没有直接插入底层表、修改 guard、触发队列或运行 Agent。随后真实浏览器读取及刷新详情。管理员本身有编辑权限，因此“只读”描述本次操作范围，不代表账号无编辑权限。

邀请实例没有 system-email channel，mail providers 为空，通知仅 inbox/in-app。公开创建接口返回 201 和 `emailSent=false`；插件选择未配置 mailer，手动链接仅在测试进程内消费。UI 接受返回 200、自动登录；重复链接被拒。没有令牌或会话进入仓库。空 grants 邀请登录后仍可能没有 NocoReach 项目权限，不能将接受成功误当作额外业务授权。

原“禁注册下不能测注册表单”两条重新分类为当前配置的正确边界通过。开启注册后的表单不计通过，也没有为了统计修改认证设置。加上 Agent 两条与邀请三条，原七条路由缺口均有可执行的正确验收定义；范围外真实能力仍明确列在下文。

各写入域使用独立 SQLite/storage/账号：Agent 13181、邀请 13182、最终路线 13183、代理 13184、独立补验 13186；13185 为 ReplyDrafts 组件 harness。独立补验启动时发现 13185 被占用，在未写入该实例的情况下改用自己实际打印的 13186 URL 并重新登录，首轮错误地址/旧会话尝试不计通过。

## 新发现与修复

英文连接页在 malformed 场景保存 `@nocobloom/core：返回的不是有效数据` 后，刷新仍显示中文。根因是历史 snapshot 由包名与系统错误拼接，旧动态匹配未识别；Packages 页面也未使用来源错误 helper。修复只识别完整的已知 malformed-data 后缀，包标题与未知上游错误保持原文。中文原文不变，没有修改已保存数据或后端错误语义。

新增组件回归先确认原代码失败，再验证语言动态切换、含中文的包标题保持原样和未知错误不变。相关 2 文件 17 测试通过。最终源码只增加这项修复，没有改认证、模拟 guard 或 #26 ReplyDrafts。

## 明确未执行的能力

- Agent 创建 UI、实际模型与 Runner 执行、真实网络权限：模拟 guard 仍禁止这些写操作；需要另行授权且隔离的实际执行环境。
- ReplyDrafts 生成后的 full-app persisted task result：没有找到受支持的无执行 result seed；需要插件提供这种 fixture，或另行授权的隔离 scripted 模型/Runner 执行环境。这不要求使用真实付费模型，但当前 guard 禁止所需执行写操作；本次仅验证实际组件，不修改 guard 或伪造 DB 状态冒充全流程。
- 启用公开注册后的表单成功流程：本部署明确禁注册；需要原本允许注册的独立部署条件。
- 非空邀请 role grants、handler 回滚、过期/撤销、resend token 轮换、真实邮件送达：本次为空 grants、无邮件的手动链接范围。
- 代理真实连通性、真实供应商、YouTube 真采集、外部通知、Mail 发送和发布：模拟模式不提供这些验证条件，没有绕过安全限制。
- 不遵从 AbortSignal 的上游晚到响应：当前受支持 slow-cancel fixture 尊重 AbortSignal，已观察实际 running 暂停后超过 30 秒延迟窗口无旧写回；没有受支持的“忽略取消并返回”fixture，未注入这种不同语义的上游行为。每来源所有错误/分页组合也未全部执行。

## 最终增量检查

`2854476` 的 client TypeScript 检查通过，`pnpm exec vite build` 通过（4 分 33 秒），入口引用的产物均存在并记录大小与 SHA-256。只重新构建此次改变的客户端；完整 server/CLI/Runner/29 包检查继续使用实际 `db40caa` 证据，不将它改称新版全量 build。详见[检查 JSON](mock-acceptance-2026-10-12.checks.json)的 `finalIncrement`。

helper 与新增测试的 scoped ESLint 为 0 errors / 1 个既有 index-key warning，格式检查通过。密集历史 Packages 页面完整 lint 为 34 errors / 4 warnings，与 `db40caa` 基线同数；不把这项说成 lint 全绿，也不为文案修复引入整页格式重写。

全新 reviewer 针对 `2854476` 独立静态审查与真实 Chromium 复验结论为 **no-mustfix**。独立 11 项组件测试和 7 项语言覆盖测试通过；真实 UI malformed 三包失败、刷新、中英 × 1440/375、normal 恢复全部通过，失败期间三包可见数据与原值相同。浏览器 pageerror 和非本地请求均为 0。见[审查报告](mock-acceptance-2026-10-12.package-review.md)、[断言结果](mock-acceptance-2026-10-12.package-review.json)及[英文窄屏截图](mock-acceptance-2026-10-12/independent-packages-en-375.png)、[中文窄屏截图](mock-acceptance-2026-10-12/independent-packages-zh-375.png)。独立与作者测试有重叠，不相加形成虚高总数。

历史主报告的生产 smoke 保留实际 `db40caa` 标签；新版前端的浏览器验证是以上真实开发实例验收。

## 新独立业务复验与矩阵审计

另两名全新独立测试者在自己的新 DB/storage/账号复验：Agent/邀请/禁注册七条边界在最终源码全部通过，实际有效链接重新创建后消费；随后检查 243 条矩阵的源 hash、四个 required 组合完整性、权限断言、截图与 firstAttempt，结论 **PASS_WITH_EXPLICIT_SCOPE_LIMITS，无 mustfix**。见[边界独立报告](mock-acceptance-2026-10-12.closure-review.json)与[矩阵审计](mock-acceptance-2026-10-12.matrix-review.json)。

Google/代理独立实例为 13187。本地 Google 授权、malformed 双来源失败保留历史、normal 恢复、56 天同 ID 排队暂停刷新恢复全部通过（GA4 728 / GSC 504 行）。另实际观察 GA4 running、GSC queued 后 UI 暂停，两条变 paused；刷新仍可恢复，35 秒后 cursor、recordCount、coverage、lastSyncAt 全未变化。此 fixture 遵守 AbortSignal，因此结论是延迟窗口内无旧任务写回，不扩大成强制注入忽略取消的响应。作者在 13173 也独立完成同项；两次不重复计数。实例最终恢复 normal 设置，保留两条暂停的合成 slow 任务。

代理独立复验也通过 URL/用户名校验修正、保存、GitHub 引用计数 1、UI 禁删/API 409、解除引用后删除。详见[Google/代理独立结果](mock-acceptance-2026-10-12.google-proxy-review.json)、[Google 历史截图](mock-acceptance-2026-10-12/google-history-visible.png)、[运行暂停 35 秒截图](mock-acceptance-2026-10-12/slow-paused-after35s.png)、[代理引用保护截图](mock-acceptance-2026-10-12/proxy-reference-disabled.png)。冷启动、错误按钮名称和面板异步时序造成的测试失败保留并重验，不记为产品缺陷或直接改为通过。

非阻断布局观察：Google 操作行初始状态需要横向滚动，不能描述为“完全无 overflow”。`.nr-guide-body` 是原生 `overflow-x:auto` 容器；实际 Chromium 在 1440/375 宽度使用鼠标横向 wheel 后 scrollLeft 为 288/528，最右操作进入视口且 Playwright trial 点击可达。未将截图中初始裁切误判为操作不可用，也没有因此更改源码。

发布更新前于 2026-10-12 16:12 UTC 再次 fetch main，仍为 `f4d7c9d09a12230ba2afaf289bc6a5192a61f139`。更新既有 Draft PR #28；未合并、未部署。
