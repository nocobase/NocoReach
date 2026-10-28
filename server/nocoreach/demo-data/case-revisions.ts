import { t, type L } from './world/script/types.js';

/** Deliberately incomplete first drafts explain the specific human feedback retained in Activity. */
export const FIRST_DRAFTS: Record<string, L> = {
  'acme-dependencies': t(
    `## 延期影响 · 第一版

品牌确认晚两天后，将依赖链整体顺延。设计从 D3–D5 改为 D5–D7，开发从 D6–D10 改为 D8–D12，验收从 D11–D12 改为 D13–D14，发布从 D13 改为 D15。

建议负责人在时间线上检查新日期，然后通知各团队。独立的域名准备仍按原安排进行。

## 初稿待复核

这版把固定发布里程碑也直接移动了，尚未说明谁有权修改客户承诺，也没有比较保留日期但缩小范围的方案。工作日历与客户确认仍待补充。`,
    `## Delay impact: first draft

After brand approval slips two days, move the dependency chain together. Design changes from D3–D5 to D5–D7, development from D6–D10 to D8–D12, acceptance from D11–D12 to D13–D14, and launch from D13 to D15.

Ask the owner to inspect the new timeline and notify the teams. Independent domain preparation retains its original schedule.

## Open review issues

This draft moves the fixed launch milestone without establishing who may change the client commitment. It does not compare retaining the date with reduced scope. The working calendar and client confirmation remain unverified.`,
  ),
  'acme-weekly-report': t(
    `## 本周完成情况 · 第一版

八个项目共完成 163 项任务。设计组完成的任务最多，建议在周报首屏展示完成数排名和各项目完成比例，再按任务清单展开。

品牌改版的桌面版本已交付，支付回调说明已经发给支持团队。下周继续处理移动端与案例素材。

## 其他事项

移动菜单还在等客户回复，案例图片授权还没拿到，下一周设计师可用时间减少。

## 初稿待复核

两个客户相关阻塞没有明确负责人和检查时间；任务数量不能说明交付风险，发出资料也不表示验收通过。此版尚未固定周会快照与统计口径。`,
    `## Weekly completion: first draft

Eight projects completed 163 tasks. Design has the largest count, so the proposal leads with team rankings and completion percentages before linking the task list.

The desktop brand refresh was delivered and callback guidance was sent to support. Mobile work and case-study assets continue next week.

## Other items

The client has not replied about the mobile menu, image permission is outstanding, and design availability falls next week.

## Open review issues

The two client-related blockers have no owner or checkpoint. Counts do not explain delivery risk, and sending material is not acceptance. The meeting snapshot and counting rules are not yet defined.`,
  ),
  'acme-guest-access': t(
    `## 邀请客户评审 · 第一版

在品牌改版项目中邀请三位客户访客，允许查看评审任务并评论设计附件。内部成员继续负责排期与预算。

客户确认设计稿 v3 后，管理员撤销邀请。使用原任务链接打开详情，演练显示访问被拒绝；把这一步截图放进指南。

## 初稿待复核

当前只有任务详情的检查，没有重新打开原附件链接。此版也没有确认撤销后 v3 的历史验收评论是否仍由内部成员保留，不能据一张拒绝截图断言全部访问路径都被关闭。`,
    `## Invite a client reviewer: first draft

Invite three client guests to the brand-refresh project, allowing review-task access and comments on design attachments. Internal members retain schedule and budget responsibilities.

After the client accepts design v3, revoke the invitation. Opening the original task link produces an access denial in the rehearsal; include that screenshot in the guide.

## Open review issues

Only the task detail was checked; the original attachment link has not been reopened. The draft also leaves retention of the historical v3 approval unverified. One denied screen cannot establish that every access path is closed.`,
  ),
  'acme-handover': t(
    `## 项目交接说明 · 第一版

原负责人列出七项未完成任务、两项客户决定和报价附件链接，将清单发送给接收人。收到“收到”的回复后，建议将交接任务标为完成。

清单记录周五发布窗口与原负责人周三起休假，后续事项由新负责人继续推进。

## 初稿待复核

接收人尚未逐项打开附件，报价链接仍指向旧范围。此版把消息确认等同于接受责任，也没有给报价修订和复查分别指定人员；完成条件需要重新定义。`,
    `## Project handover: first draft

The outgoing owner sends a list of seven unfinished tasks, two client decisions and a quote attachment. The proposal marks handover complete after the recipient replies “Received.”

The list names a Friday release window and the outgoing owner's leave from Wednesday. Remaining work is expected to continue under the new owner.

## Open review issues

The recipient has not opened every attachment, and the quote link still points to an older scope. This version confuses message acknowledgement with responsibility acceptance and assigns neither the quote correction nor its recheck. Closure criteria need revision.`,
  ),
  'crm-import': t(
    `## 公司与联系人导入 · 第一版

先试导二十行，再处理 1,280 行公司资料。86 行重复逐组确认，14 行缺少负责人进入待认领清单。公司完成后再处理 320 位联系人并关联历史跟进。

初步建议用电话号码识别联系人重复，以减少人工核对；重复号码合并到一条联系人。

## 初稿待复核

六位联系人共用总机，按电话合并会丢掉不同的人。八位联系人没有邮箱，原负责人离职的情况也没有恢复步骤。尚缺外部编号关联、合并撤销和历史跟进恢复的检查。`,
    `## Company and contact import: first draft

Pilot twenty rows, then process 1,280 company rows. Review 86 duplicates individually and leave fourteen missing owners in the assignment queue. Import 320 contacts afterward and associate their follow-up history.

The initial proposal uses phone numbers to identify duplicate contacts and merges repeated numbers to reduce manual review.

## Open review issues

Six contacts share a switchboard, so phone merging would lose distinct people. Eight contacts have no email, and former-owner recovery is not covered. External-ID association, merge undo and restoration of follow-up history still need verification.`,
  ),
  'crm-pipeline': t(
    `## 阶段建议 · 第一版

需求确认后进入方案评估；销售发出报价后即可进入商务谈判；合同确认后标记赢单。每次变化记录销售负责人和日期。

一条金额 48,000 的谈判商机按 50% 权重显示 24,000，周会可汇总加权值。

## 初稿待复核

发出报价不表示客户已经进入商务讨论。此版没有要求决策人、有效报价版本和客户确认，也未解释加权值与收入的区别。五条缺有效报价的谈判商机以及三条无下一步日期的商机尚未处理。`,
    `## Stage proposal: first draft

Move confirmed needs into solution evaluation, move to commercial negotiation as soon as the rep sends a quote, and mark won after contract confirmation. Record owner and date on each transition.

A negotiation deal worth 48,000 contributes 24,000 at an illustrative 50% weight, allowing a weighted meeting total.

## Open review issues

Sending a quote does not establish active customer negotiation. The draft requires neither a decision maker, current quote version nor customer confirmation, and does not distinguish weighted value from revenue. Five negotiation deals without a valid quote and three without next-action dates remain unresolved.`,
  ),
  'crm-permissions': t(
    `## 销售客户范围 · 第一版

销售只查看自己创建的客户，主管查看本组创建的客户，运营查看汇总。管理员先配置角色，再使用销售账号确认列表中没有其他组记录。

客户转交时修改当前负责人，历史跟进保留原作者。

## 初稿待复核

列表规则仍按创建人，修改负责人后新销售可能看不到客户，离职销售却仍可读。此版只检查列表，没有核对跨组详情链接、导出与撤权。应以当前归属定义业务责任后再验证全部入口。`,
    `## Sales account scope: first draft

A rep sees accounts they created, a manager sees accounts created by their team, and operations sees aggregates. Configure roles, then check that the rep's list excludes other teams.

A handover changes current owner while historical follow-ups retain their original author.

## Open review issues

The filter still uses creator. A new owner may not see the transferred account while the former rep retains access. Only the list was checked; cross-team direct links, exports and revocation remain open. Define responsibility through current ownership and verify each entry point.`,
  ),
  'crm-contact-form': t(
    `## 演示申请表文案 · 第一版

收集姓名、工作邮箱与团队需要解决的问题，电话可选。邮箱错误时保留其他输入；网络超时可以重试同一提交编号，避免生成两条线索。

成功提示拟写为：“邮件已发送，我们已经为你安排演示。”

## 初稿待复核

演示环境只保存模拟申请，没有发出邮件或创建日历邀请。提示超出了实际完成的动作。需要改成申请已记录，展示确认编号和后续联系安排；不承诺已有会议。`,
    `## Demo request form copy: first draft

Collect name, work email and the team's problem, with optional phone. Preserve other fields on email errors and retry the same submission ID after a timeout to avoid duplicate leads.

The proposed success message reads: “Email sent. Your demo has been scheduled.”

## Open review issues

The demo records a simulated request without sending email or creating a calendar invitation. The message claims actions that did not happen. Replace it with request-recorded confirmation, its reference number and the next contact step, without claiming an existing meeting.`,
  ),
};
