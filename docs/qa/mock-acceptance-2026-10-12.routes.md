# 2026-10-12 路由浏览器验收记录

本报告记录隔离模拟环境的 Chromium 只读验收。证据对应旧基线 `8bd161d8129cb90f0d206ee0a58c214512a226f4` 及验收修复 `710ac7f`；随后已整合 main `f4d7c9d`，最终源码 `db40caa016512670fc3d1c120a6a7abfc86371f3` **未重新执行相同全站路由矩阵**，本报告不能作为新 main 全站通过的证明；整合后的定向回归与独立审查见[主报告](mock-acceptance-2026-10-12.md)。

逐项结果见 [路由验收 JSON](mock-acceptance-2026-10-12.routes.json)。原始 246 条精简记录原样保留，10 条补验单列于 `supplement`。截图与完整 DOM、最终 URL、控制台和网络证据位于本轮临时目录 `/tmp/nocoreach-acceptance-20261012-e5plza9s/` 的 `routes`、`routes-recheck`、`routes-shell-final`、`routes-valid`；临时证据不属于仓库持久化附件。

## 原始基线与范围

- 实际访问 61 个路由模式：55 required、4 guest、2 optional。
- 原始基础/边界用例 246 条：233 passed、13 blocked、0 最终 failed；开发服务重启、依赖刷新和资源竞争造成的中断已单独重试。
- required 矩阵 220 条：管理员中英文各 52 passed + 3 blocked，普通成员中英文各 54 passed + 1 blocked。
- 验证页面标题或明确状态、加载结束、完整重定向 URL、控制台、失败网络及截图；包含 13 个重定向、6 个已移除路径的 fallback、未加入成员门禁、认证与设备边界。
- 管理员/成员业务导航入口分别为 32/28。375px 下首页、任务、数据接入、模拟页 × 两身份，共 8 条菜单开关与整体横向溢出检查通过。

“passed”仅表示该条声明的基础呈现或权限边界通过。成员官方 7 条路由的通过代表预期拒绝；代理和模拟页代表管理员权限说明，并不表示业务操作可用或完整功能已验收。

## 补验与剩余缺口

10 条补验全部通过，未触发任务执行、记忆 draft/check 或代理保存请求：

| 补验                                   | 数量 | 结果                                                                                     |
| -------------------------------------- | ---: | ---------------------------------------------------------------------------------------- |
| 真实任务详情，管理员/成员 × 中英文     |    4 | 合成任务 `391735266181120` 标题和详情可读；没有执行任务                                  |
| 真实代理详情，管理员 × 中英文          |    2 | 合成 Profile `0e291463-af33-482a-b96c-7e4eb974e01f` 名称及地址正确；取消回列表，没有保存 |
| 记忆操作权限修复，管理员/成员 × 中英文 |    4 | 成员不显示 Retry/Check now，管理员保留；双方均保留 Got it，未点击这些动作                |

任务 4 条与代理 2 条补验解除原 13 个 blocked 中的 6 个；原始 invalid-ID-only 历史不改写。仍有 7 个用例缺口：管理员真实 Agent 详情 2 条、有效邀请接受 3 条、环境禁注册导致注册表单未覆盖 2 条。Agent 错误态、无效邀请提示、注册跳登录均已有观察证据，不能代替成功态。

成员记忆 Retry/Check now 原先启用，与服务端管理员限制不一致；修复后四组合复验通过。`seen`/Got it 不属于该管理员限制，保留符合预期。硬刷新时还记录了 React script-tag 渲染告警；该全局控制台问题与页面呈现结论分开记录，不声称控制台无告警。

## 61 个实际路由模式

参数模式的原始访问使用无效 ID；上节明确列出后来补足的真实任务/代理详情。表中 auth 是路由声明，不代替业务成员检查或官方页面授权。

| ID  | 路由模式                           | auth     | 重定向目标               |
| --- | ---------------------------------- | -------- | ------------------------ |
| R01 | `/`                                | required | `/home`                  |
| R02 | `/inbox`                           | required | —                        |
| R03 | `/login`                           | guest    | —                        |
| R04 | `/register`                        | guest    | —                        |
| R05 | `/forgot-password`                 | guest    | —                        |
| R06 | `/reset-password`                  | guest    | —                        |
| R07 | `/device`                          | optional | —                        |
| R08 | `/actions/:taskId`                 | required | —                        |
| R09 | `/home/explore`                    | required | —                        |
| R10 | `/flows`                           | required | `/playbooks`             |
| R11 | `/data`                            | required | `/home`                  |
| R12 | `/data/chat`                       | required | `/data/discord`          |
| R13 | `/research/keywords`               | required | `/keywords?tab=research` |
| R14 | `/project/strategy`                | required | `/home`                  |
| R15 | `/insights`                        | required | `/home`                  |
| R16 | `/action-plan`                     | required | `/actions`               |
| R17 | `/seo-opportunities/overview`      | required | —                        |
| R18 | `/seo-opportunities/performance`   | required | —                        |
| R19 | `/seo-opportunities/opportunities` | required | `/keywords`              |
| R20 | `/website/overview`                | required | `/website`               |
| R21 | `/website/sources`                 | required | `/website`               |
| R22 | `/website/conversion`              | required | `/website`               |
| R23 | `/website/pages`                   | required | `/website?tab=pages`     |
| R24 | `/home`                            | required | —                        |
| R25 | `/opportunities`                   | required | —                        |
| R26 | `/actions`                         | required | —                        |
| R27 | `/website`                         | required | —                        |
| R28 | `/content`                         | required | —                        |
| R29 | `/audit`                           | required | —                        |
| R30 | `/data/github`                     | required | —                        |
| R31 | `/data/downloads`                  | required | —                        |
| R32 | `/seo-opportunities`               | required | —                        |
| R33 | `/keywords`                        | required | —                        |
| R34 | `/trends`                          | required | —                        |
| R35 | `/research/domain`                 | required | —                        |
| R36 | `/ai-search`                       | required | —                        |
| R37 | `/data/community`                  | required | —                        |
| R38 | `/data/hackernews`                 | required | —                        |
| R39 | `/data/reddit`                     | required | —                        |
| R40 | `/data/x`                          | required | —                        |
| R41 | `/data/discord`                    | required | —                        |
| R42 | `/data/slack`                      | required | —                        |
| R43 | `/project-ai`                      | required | —                        |
| R44 | `/agents`                          | required | —                        |
| R45 | `/agents/new`                      | required | —                        |
| R46 | `/agents/:agentId`                 | required | —                        |
| R47 | `/runtimes`                        | required | —                        |
| R48 | `/runtimes/connect`                | required | —                        |
| R49 | `/playbooks`                       | required | —                        |
| R50 | `/skills`                          | required | —                        |
| R51 | `/project`                         | required | —                        |
| R52 | `/rules`                           | required | —                        |
| R53 | `/models`                          | required | —                        |
| R54 | `/usage`                           | required | —                        |
| R55 | `/connections`                     | required | —                        |
| R56 | `/members`                         | required | —                        |
| R57 | `/proxy-profiles`                  | required | —                        |
| R58 | `/proxy-profiles/new`              | required | —                        |
| R59 | `/proxy-profiles/:profileId/edit`  | required | —                        |
| R60 | `/mock-integrations`               | required | —                        |
| R61 | `/invite/:token`                   | optional | —                        |
