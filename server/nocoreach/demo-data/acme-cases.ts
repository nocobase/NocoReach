import type { CaseStudy } from './case-study.js';
import { t } from './world/script/types.js';

export const ACME_CASES: Record<string, CaseStudy> = {
  '/docs/import-excel': {
    audience: t(
      '第一次从 Excel 迁移项目的实施负责人与团队管理员。',
      'Implementation leads and team administrators moving a project out of Excel for the first time.',
    ),
    decision: t(
      '用一个包含失败行的完整导入案例替换“上传即可”的说明，读者最后应得到 240 条可追溯的任务。',
      'Replace the upload-only explanation with a complete import and recovery walkthrough ending in 240 traceable tasks.',
    ),
    evidence: t(
      '演练包 MIG-240 有 240 行：228 行通过预检，8 行日期混用日/月顺序，4 行负责人尚未加入项目。重复任务名称来自不同周的例会，不能作为去重键。论坛提问是教程选题依据，不能据此估算所有用户的失败率。',
      'Rehearsal pack MIG-240 contains 240 rows: 228 pass preflight, eight mix day/month date formats, and four name owners who have not joined the project. Recurring meetings have identical titles but distinct identities. Forum questions justify the tutorial; they do not establish a population-wide failure rate.',
    ),
    document: t(
      `## 从一张表到可核对的项目

先另存原表，不在原件上清理。为每行保留 Source row 和 External ID；这两个字段帮助定位问题，任务名称仅用于展示。以品牌改版项目为例，先导入 20 行，确认字段和负责人后再处理全量。

| 原列 | 目标字段 | 处理方法 |
| --- | --- | --- |
| 编号 | External ID | 保留文本格式；0012 不能变成 12 |
| 工作项 | Task title | 必填；同名例会不合并 |
| 负责人邮箱 | Assignee | 先邀请到项目；无法匹配时留在错误清单 |
| 截止日期 | Due date | 转为 YYYY-MM-DD；空值保持为空 |
| 阶段 | Status | 映射到待做、进行中、待评审、完成 |

## 导入与恢复

1. 上传 20 行试导文件，在预览里逐列确认，不把“备注”映射到任务名称。
2. 对照源行号抽查第 1、12、20 行，检查前导零、中文标点和空日期。
3. 处理全量文件时，先记录已成功的 228 行和导入批次号。下载剩余 12 行的错误清单，不再上传原来的 240 行。
4. 将 8 行日期统一为 ISO 格式；邀请 4 位负责人并确认其项目成员身份。分两批重试失败行。
5. 按 External ID 核对 240 个唯一值，再抽查两个同名例会，确认它们仍是两条任务。

## 读者可能卡住的地方

**导入成功但负责人为空？** 先核对邮箱是否属于当前项目成员，再处理匹配，不用姓名模糊搜索自动认领。

**能不能直接重新上传全部文件？** 先确认当前导入器的更新键和重复策略。如果界面只支持新增，重传会创建重复项；只重试错误清单。

**可以删除这一批重新来吗？** 先筛出批次内记录，确认是否有人已补充评论或附件，再由管理员决定。不要让教程把删除整项目当成通用恢复方法。

配图需覆盖映射预览、错误清单和最终唯一编号检查；截图使用演练数据，保留源行号，隐藏无关窗口。`,
      `## From a spreadsheet to a reconciled project

Save an untouched copy before cleaning the workbook. Retain Source row and External ID on every row; a title is a label, not an identity. Use a brand-refresh project and import twenty rows before processing the full workbook.

| Source column | Destination | Rule |
| --- | --- | --- |
| Number | External ID | Keep text formatting: 0012 must not become 12 |
| Work item | Task title | Required; do not merge recurring meetings with the same name |
| Owner email | Assignee | Invite the person first; unresolved owners stay on the error sheet |
| Deadline | Due date | Normalize to YYYY-MM-DD; preserve blanks |
| Phase | Status | Map explicitly to planned, active, review or done |

## Import and recovery walkthrough

1. Upload a twenty-row sample and inspect every mapping. A Notes column must not become the task title.
2. Compare source rows 1, 12 and 20 with the preview. Check leading zeros, punctuation and empty dates.
3. Process the full file and record the batch ID and 228 successful rows. Download the twelve rejected rows instead of uploading the original file again.
4. Normalize the eight dates and invite the four missing owners to the project. Retry the failures in two batches.
5. Reconcile 240 distinct External IDs, then inspect two identically named weekly meetings. Both must still exist.

## Questions the walkthrough must answer

**Why is an owner blank after import?** Check project membership and the exact email address before attempting a match. A similar display name is insufficient evidence to assign work.

**Can I upload the full workbook again?** First establish whether the importer updates an existing external key or only creates records. A create-only import can duplicate the 228 successful rows. Recover from the error sheet.

**Can I delete the batch and start over?** Filter the batch and check for comments or attachments added since import. An administrator decides how to recover; deleting the whole project is not a general recovery instruction.

Capture the mapping preview, the rejected-row sheet and the final unique-ID check. Keep source row numbers visible and use only the rehearsal workbook.`,
    ),
    checks: t(
      '核对 228 + 8 + 4 = 240；第 0012 行编号仍含前导零；同名例会保留两条；错误清单重试后没有重复；截图中的列名与正文一致。',
      'Reconcile 228 + 8 + 4 = 240; preserve leading zeros in 0012; retain two same-title meetings; verify no duplicate after recovery; match screenshot column names to the text.',
    ),
    limitation: t(
      '这是虚构演练结果；不同版本的更新键与回滚能力需在对应版本确认，不能保证任意 Excel 文件无损迁移。',
      'These are fictional rehearsal results. Update keys and rollback behavior require version-specific confirmation; arbitrary Excel files are not guaranteed to migrate without loss.',
    ),
    review: t(
      '恢复段落还像是在让读者重新导入整张表。请明确 228 行已经成功，只重试 12 行，并补上同名例会不合并的检查。',
      'The recovery section still sounds like a full reimport. State that 228 rows already succeeded, retry only twelve, and check that same-title meetings remain separate.',
    ),
    revision: t(
      '已把恢复拆成日期和负责人两批，补上 External ID 核对及同名例会示例；最终数量仍为 240。',
      'Split recovery into date and owner batches, added External ID reconciliation and the same-title meeting example; the final count remains 240.',
    ),
  },
  '/features/timeline': {
    audience: t(
      '负责跨团队交付、需要向客户解释延期影响的项目经理。',
      'Project managers coordinating several teams and explaining schedule changes to clients.',
    ),
    decision: t(
      '只移动依赖链中的可调整任务，固定发布里程碑保留原日期并显示冲突，交给负责人作决定。',
      'Move only adjustable tasks on the dependency chain. Keep the fixed release milestone visible and escalate the resulting conflict to its owner.',
    ),
    evidence: t(
      '18 项任务的改版演练中，品牌确认晚两天。受影响的是设计、开发和验收三个阶段；域名准备与合同核对没有依赖关系。旧说明“所有日期自动变化”会误导负责人。',
      'In the eighteen-task redesign rehearsal, brand approval is two days late. Design, development and acceptance are affected; domain preparation and contract checks are independent. The old claim that every date changes automatically is misleading.',
    ),
    document: t(
      `## 先保留基准，再计算影响

把项目原计划保存为基准。延期说明应回答三个问题：谁还没交付、哪些工作依赖它、谁决定是否改变承诺日期。不能为了消除红色提醒直接移动客户承诺。

| 阶段 | 基准工作日 | 延期后的建议 | 谁来确认 |
| --- | --- | --- | --- |
| 品牌确认 | D1–D2 | D1–D4 | 客户对接人 |
| 页面设计 | D3–D5 | D5–D7 | 设计负责人 |
| 开发与联调 | D6–D10 | D8–D12 | 开发负责人 |
| 客户验收 | D11–D12 | D13–D14 | 项目经理与客户 |
| 固定发布里程碑 | D13 | 保留 D13，标记冲突 | 业务负责人 |

D 表示同一工作日历中的工作日；周末和请假不能简单按自然日相加。先确认“完成后开始”的依赖关系，再查看建议日期。域名准备没有挂在品牌确认之后，应保持不变。

## 负责人如何处理冲突

选项一是接受 D14 验收、调整发布承诺；需要客户确认并记录新的基准版本。选项二是缩小本期范围，保留 D13 发布；必须明确延期的页面和验收责任。不要默认压缩测试时间，也不要自动给团队增加周末工作。

本次演练选择第二种：保留核心页面，案例库下一批发布。活动里记录决定人、被移出的范围以及下次检查时间。后续展示“基准 D13 / 当前承诺 D13 / 范围减少”，而不是只展示一个绿色日期。

## 验收画面

同时显示原日期与建议日期；点开固定里程碑应看到冲突原因；独立任务的日期不变；撤回模拟延期后依赖链恢复，已记录的人工决定仍可追溯。`,
      `## Preserve the baseline before calculating impact

Save the original plan as a baseline. A delay explanation must identify the missing deliverable, dependent work and the person who can change the commitment. Moving a client commitment merely to remove a warning hides the decision.

| Phase | Baseline working days | Proposed schedule | Decision owner |
| --- | --- | --- | --- |
| Brand approval | D1–D2 | D1–D4 | Client contact |
| Page design | D3–D5 | D5–D7 | Design lead |
| Development and integration | D6–D10 | D8–D12 | Engineering lead |
| Client acceptance | D11–D12 | D13–D14 | Project manager and client |
| Fixed release milestone | D13 | Retain D13 and flag conflict | Business owner |

D means a working day in the same calendar. Weekends and leave cannot be handled by adding calendar days blindly. Verify finish-to-start dependencies before inspecting suggested dates. Domain preparation is independent and must not move.

## Resolve the conflict explicitly

One option is to accept D14 acceptance and renegotiate the launch. Record client agreement and a new baseline version. Another is to reduce scope while retaining D13. Name the deferred pages and their acceptance owners. Do not silently shorten testing or schedule weekend work.

The rehearsal chooses reduced scope: core pages remain, and the case library moves to the next release. Record the decision owner, removed scope and next checkpoint. The resulting report says “baseline D13 / current commitment D13 / reduced scope,” rather than presenting an unexplained green date.

## Review the actual screens

Show original and proposed dates together. Opening the fixed milestone should explain the conflict. Independent dates should remain unchanged. Undoing the simulated delay should restore the dependency chain while preserving the recorded human decision.`,
    ),
    checks: t(
      '检查四段依赖链、固定里程碑冲突和独立任务；用工作日历复算日期；确认范围调整由负责人批准，旧基准仍可读。',
      'Check the four-phase chain, fixed milestone conflict and independent task; recalculate with the working calendar; verify owner approval of scope and retention of the baseline.',
    ),
    limitation: t(
      '表内日期是演练工作日，不是对客户的交付承诺；自动排期行为以当前配置为准。',
      'The table uses rehearsal working days, not client commitments. Automatic scheduling depends on the actual configuration.',
    ),
    review: t(
      '第一版表格把固定发布日也顺延了。请保留 D13，并解释减少范围与修改日期是两个需要人确认的选项。',
      'Version one also moved the fixed launch. Retain D13 and explain that reducing scope and changing the date are separate human decisions.',
    ),
    revision: t(
      '固定里程碑已保持 D13，新增两种处理方案，并把域名准备列为不受影响的核对项。',
      'Kept the milestone at D13, added both resolution options and an unaffected domain-preparation check.',
    ),
  },
  '/docs/weekly-reports': {
    audience: t(
      '每周要快速识别交付风险的项目负责人。',
      'Project owners who need to identify delivery risks during a short weekly review.',
    ),
    decision: t(
      '周报先列交付、阻塞和需要决定的事项，再提供任务明细；完成率不能替代风险判断。',
      'Lead with deliveries, blockers and decisions, then link task details. Completion percentage cannot stand in for delivery risk.',
    ),
    evidence: t(
      '虚构周报样本覆盖 8 个项目、163 项已完成任务；两个客户验收阻塞没有负责人。把任务数放在首屏没有帮助主管发现真正影响发布时间的事项。',
      'The fictional sample covers eight projects and 163 completed tasks, but two blocked client acceptances have no owner. Leading with counts obscures the items that can move the release.',
    ),
    document: t(
      `## 本周交付摘要

品牌改版已完成桌面端验收；移动端菜单仍待客户确认。支付回调的重试说明已交给支持团队，暂未对外发布。两个交付分别记录验收人和证据链接，不将“发了消息”记为完成。

| 风险或决定 | 影响 | 负责人 | 下一步与截止 |
| --- | --- | --- | --- |
| 移动菜单未确认 | 客户验收无法关闭 | 客户对接人 | 周三 15:00 收到明确意见 |
| 案例页授权待补 | 发布包缺少两张图片 | 内容负责人 | 周四中午换成已授权素材 |
| 下周设计产能减少 | 两项新需求无法并行 | 项目经理 | 周五排期会选择优先项 |

## 如何生成这份周报

固定在周一 09:00 截取上周工作日快照；明确时区，迟到更新进入下次快照。已完成任务按实际完成时间计数，撤销完成的任务从本期移除，不按最后编辑时间重复计入。详情链接沿用与汇总相同的项目和时间过滤条件。

每个阻塞写一个动作、一位负责人和一个检查时间。“跟进一下”不能作为行动项。若客户没有给出决定，状态继续是等待客户，不替对方猜结论。

## 下周安排

先完成移动菜单验收与素材替换，再排入新的动效需求。项目经理在周五决定动效是否进入本期；没有决定以前，周报不把它列入承诺交付。

第一版仅列完成率，第二版增加上述风险表以及验收证据。团队可沿用这份模板，但应替换为自己真实的负责人和日期。`,
      `## Weekly delivery summary

Desktop acceptance for the brand refresh is complete; the client has not confirmed the mobile menu. The payment-callback retry explanation has reached support but is not published. Each delivery names its approver and evidence; sending a message does not complete acceptance.

| Risk or decision | Impact | Owner | Next action and deadline |
| --- | --- | --- | --- |
| Mobile menu unconfirmed | Client acceptance cannot close | Client contact | Obtain explicit feedback by Wednesday 15:00 |
| Case-study image permission missing | Two images cannot enter the release | Content lead | Replace with cleared assets by Thursday noon |
| Reduced design capacity next week | Two new requests cannot run together | Project manager | Choose priority at Friday planning |

## Build a reproducible report

Take a Monday 09:00 snapshot of the previous working week and state the time zone. Late updates belong to the next snapshot. Count completed tasks by completion time; remove reopened tasks from the completed set. Last-edit timestamps must not count the same delivery twice. Detail links retain the same project and time filters as the summary.

Give every blocker one action, one owner and one checkpoint. “Follow up” is not an actionable item. If the client has not decided, retain Waiting for client rather than guessing the outcome.

## Next week's commitment

Finish mobile-menu acceptance and the asset replacement before scheduling animation requests. The project manager decides on Friday whether animation enters this release. Until that decision exists, it must not appear as a committed delivery.

Version one listed completion percentages. Version two adds the risk table and acceptance evidence. Teams can reuse the structure after replacing the fictional people and deadlines with their own.`,
    ),
    checks: t(
      '用同一快照核对汇总与明细；两个阻塞都有负责人和时间；“已发送”不等于“已验收”；周报没有隐去未完成项目。',
      'Reconcile summary and details against one snapshot; assign both blockers; distinguish sent from accepted; keep unfinished projects visible.',
    ),
    limitation: t(
      '示例不把完成任务数折算为产能或个人绩效；演练快照不能证明实际团队效率提升。',
      'Do not convert task counts into capacity or individual performance. A rehearsal snapshot does not prove improved team productivity.',
    ),
    review: t(
      '163 项完成任务还是占了开头，两项客户阻塞藏在最后。把要决定的事提前，分别补上负责人和周三/周四的截止时间。',
      'The 163 completed tasks still dominate the opening and the two client blockers are buried. Lead with decisions and add owners and Wednesday/Thursday checkpoints.',
    ),
    revision: t(
      '第二版已改成三行风险表，补上快照时间、统计口径和下周尚未承诺的范围。',
      'Version two leads with a three-row risk table, defines the snapshot and counting rules, and identifies work not yet committed for next week.',
    ),
  },
  '/docs/guests': {
    audience: t(
      '需要邀请外部客户评审的项目管理员。',
      'Project administrators inviting external clients to review deliverables.',
    ),
    decision: t(
      '用客户评审者的身份核对邀请、查看、评论和撤销访问，避免只展示管理员视角。',
      'Verify invitation, reading, commenting and revocation as the client reviewer, rather than showing only the administrator view.',
    ),
    evidence: t(
      '演练使用 12 位内部成员和 3 位客户访客；其中一位访客只参与品牌改版，另一项目的报价和工时不应出现。三个咨询都在问“客户是否能看见其他项目”。',
      'The rehearsal uses twelve internal members and three client guests. One guest participates only in the brand refresh; another project’s quotes and time records must not appear. Three inquiries ask whether clients can see other projects.',
    ),
    document: t(
      `## 给客户一个明确的评审范围

邀请前先确定客户要看哪份交付物。本例只开放品牌改版项目中的评审任务和客户版附件；内部预算、工时和其他项目不属于评审资料。

| 动作 | 客户访客 | 内部项目成员 |
| --- | --- | --- |
| 查看获邀项目的评审任务 | 允许 | 允许 |
| 评论客户版设计稿 | 允许 | 允许 |
| 调整内部排期与负责人 | 不允许 | 按岗位权限 |
| 查看内部工时与预算 | 不允许 | 按岗位权限 |
| 打开未获邀项目链接 | 拒绝 | 按项目成员范围 |

管理员先发邀请，再使用访客会话打开详情链接。检查附件的访问规则是否和任务一致，不以“菜单里没有”作为访问被拒绝的证据。

## 评审结束之后

保留客户对附件 v3 的确认评论，然后撤销访客访问。重新打开收藏的任务链接和附件链接，确认不再可读。历史评论仍留在项目中，不因为撤销访问而删除已经发生的验收记录。

如果项目仍有后续评审，重新邀请时应再确认范围，不能自动恢复所有旧项目。席位与计费另查定价说明，不从这里的权限表推导收费规则。`,
      `## Give a client a specific review boundary

Decide which deliverable the client needs before sending an invitation. This example shares review tasks and client-facing attachments in the brand-refresh project. Internal budgets, time records and other projects are outside that boundary.

| Action | Client guest | Internal project member |
| --- | --- | --- |
| Read invited review tasks | Allowed | Allowed |
| Comment on the client design file | Allowed | Allowed |
| Change internal schedules and owners | Denied | According to role |
| Read internal time and budgets | Denied | According to role |
| Open another project's direct link | Denied | According to project membership |

After inviting the client, open the direct task link in a guest session. Check attachment authorization separately. An absent menu does not demonstrate that a direct request is denied.

## After acceptance

Keep the client's approval of attachment v3, then revoke guest access. Reopen bookmarked task and attachment links to confirm they are no longer readable. Historical comments stay in the project; revocation must not erase an acceptance record.

For a later review, confirm the scope again before reinviting. Do not automatically restore every old project. Seat billing belongs to the pricing documentation and cannot be inferred from this permissions table.`,
    ),
    checks: t(
      '分别检查获邀和未获邀项目、任务和附件、撤销前和撤销后；保留 v3 验收评论；使用访客会话。',
      'Check invited and uninvited projects, tasks and attachments, before and after revocation; preserve the v3 approval; use a guest session.',
    ),
    limitation: t(
      '权限说明不代表计费承诺；演练之外的共享链接和文件存储策略需单独核对。',
      'Permissions are not a billing promise. Shared links and storage policies outside this rehearsal need separate verification.',
    ),
    review: t(
      '只有任务详情的拒绝画面，还缺附件原链接。补齐撤销后的两个入口，确认历史验收评论不会一起删除。',
      'The task-link denial is shown, but the original attachment link is missing. Check both after revocation and retain the historical approval comment.',
    ),
    revision: t(
      '补上附件原链接拒绝结果，并确认客户对 v3 的评论仍可由内部成员查看。',
      'Added the original attachment-link denial and confirmed that internal members can still read the client’s v3 approval.',
    ),
  },
  '/docs/project-handover': {
    audience: t(
      '接手正在交付的项目、不能只靠群消息了解进度的新负责人。',
      'Incoming owners taking over an active project without relying on chat history alone.',
    ),
    decision: t(
      '交接以接收人确认未决事项为结束条件，发送通知只是开始。',
      'A handover ends when the recipient accepts the outstanding work; sending a notification only starts it.',
    ),
    evidence: t(
      '交接演练包含 7 项未完成任务、2 项客户决定和 1 份仍在修改的报价附件。原清单仅有链接，没有说明下一步该找谁。',
      'The rehearsal includes seven unfinished tasks, two client decisions and one quote attachment still being revised. The original checklist had links but no next owner or action.',
    ),
    document: t(
      `## 接手人首先需要知道什么

先读交付目标与当前承诺，再打开未决事项。不要按文件创建时间堆一串附件。把仍有效的版本放在清单里，旧版本保留供追溯。

| 项目 | 当前事实 | 接收后的动作 |
| --- | --- | --- |
| 客户验收 | 设计稿 v3 已发，未明确通过 | 周二联系客户，保留书面意见 |
| 报价附件 | v2 缺少新增范围 | 找商务负责人补齐；不发送旧价 |
| 发布安排 | 暂定周五，依赖验收 | 验收后再确认窗口 |
| 风险 | 原负责人周三起休假 | 明确替补联系人 |

## 交接流程

原负责人逐项列出当前状态、下一动作、责任人、截止时间和证据。接收人打开链接，检查权限和附件版本，对缺项留言；不能只回复“收到”就关闭任务。

本例接收人指出报价仍引用 v1 的交付范围。原负责人将链接改到 v2 并补充待确认项，接收人确认七项任务都能访问后接受交接。历史负责人保留在活动中，当前负责人字段改成接收人。

交接后第一个工作日回看两项客户决定，确认没有因人员变动错过约定时间。通知送达失败时，项目仍处于待交接。`,
      `## What the incoming owner needs first

Start with the delivery goal and current commitment, then inspect unresolved work. A chronological pile of attachments is not a handover. Identify the current version while retaining older versions for reference.

| Item | Current fact | Recipient's next action |
| --- | --- | --- |
| Client acceptance | Design v3 sent, not explicitly approved | Contact the client Tuesday and retain written feedback |
| Quote attachment | v2 omits the added scope | Ask the commercial owner to amend it; do not send the old price |
| Release window | Tentatively Friday, dependent on acceptance | Confirm the window after acceptance |
| Availability risk | Previous owner is away from Wednesday | Name a backup contact |

## Complete the handover

The outgoing owner records state, next action, owner, deadline and evidence for each item. The recipient opens every link, checks access and attachment versions, and comments on gaps. “Received” alone is not acceptance.

In the rehearsal, the recipient finds that the quote still references the v1 scope. The outgoing owner corrects the v2 link and records the pending decision. The recipient accepts only after opening all seven tasks. Keep the previous owner in Activity while changing the current assignment.

On the next working day, revisit the two client decisions to ensure the personnel change has not caused a missed commitment. A failed notification leaves the handover pending.`,
    ),
    checks: t(
      '七项任务可访问，报价版本一致，两项决定有接收人；接收确认晚于补充资料；通知失败不会标记已交接。',
      'Open all seven tasks, reconcile quote versions and assign both decisions; acceptance follows the correction; notification failure does not complete handover.',
    ),
    limitation: t(
      '交接清单不改变客户合同和截止承诺，调整须另行取得确认。',
      'A handover checklist does not change contractual scope or deadlines; changes need separate agreement.',
    ),
    review: t(
      '接收人只是回了“收到”，还没有确认报价附件。请保留待交接，并写出谁补 v2、谁复查。',
      'The recipient only acknowledged the message and has not checked the quote. Keep handover pending and name who fixes v2 and who rechecks it.',
    ),
    revision: t(
      '已补上报价版本纠正和接收人的逐项确认，结束条件改为明确接受未决工作。',
      'Added the quote-version correction and item-by-item recipient confirmation; closure now requires explicit acceptance of outstanding work.',
    ),
  },
};
