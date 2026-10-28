import { t, type L } from './world/script/types.js';

/** Each entry is a fictional working document, not an instruction to produce one. */
export const ACME_NOTES: Record<string, L> = {
  '/': t(
    `## 建议采用的搜索摘要

标题：ACME 项目管理：任务、排期与团队协作。描述：把项目任务、依赖排期和客户评审放在一个协作空间，查看负责人、截止时间与交付风险，从现有 Excel 清单开始。

原文“让工作更高效”没有说明产品类别，也没有帮助搜索者判断能否管理跨团队交付。新文保留项目管理主词，依次交代任务、排期与协作。它不使用“最佳”“保证按时”等缺乏依据的承诺。

## 页面承接与复核

首屏必须能看到任务列表、排期与客户评审入口，否则摘要只是新增承诺。导入教程承接迁移需求，访客指南解释客户范围，定价页回答席位问题。不要为了放入关键词增加首页没有的能力。

发布前对照标题、描述、首屏与分享卡片；移动端预览只用于检查可读性，不保证搜索引擎按同样方式展示。观察时固定目标页和查询组，分开记录曝光、点击与排名。若查询构成改变，先解释构成变化，不能把全部波动归功于标题。`,
    `## Recommended search snippet

Title: ACME Project Management: Tasks, Timelines and Teamwork. Description: Organize project tasks, dependencies and client reviews in one workspace. See owners, deadlines and delivery risks, starting from your existing Excel checklist.

The original “Work more efficiently” neither identifies the product category nor helps someone evaluating cross-team delivery. The revision names project management, then tasks, schedules and collaboration. It avoids unsupported “best” and on-time guarantees.

## Landing-page support and review

The first screen must expose task, timeline and client-review entry points. Otherwise the snippet promises more than the page delivers. Link migration intent to the import guide, access questions to the guest guide and seat questions to pricing. Do not add unsupported features merely to include a keyword.

Before release, reconcile title, description, first screen and sharing metadata. Mobile previews check readability but do not guarantee search-engine presentation. Observe one fixed page and query cohort, recording impressions, clicks and position separately. If query composition changes, explain it before attributing movement to the title.`,
  ),
  '/pricing': t(
    `## 用十二人团队说明选择过程

示例团队有 12 位内部成员，另邀 3 位客户评审者。内部成员负责分配、排期与交付；客户只查看获邀项目并评论。先列出这些工作，再核对当前方案的席位定义、访客权限与报表范围。

| 需要确认的事 | 本案例的事实 | 决定前还缺什么 |
| --- | --- | --- |
| 内部协作 | 12 人持续参与项目 | 适用席位规则 |
| 客户评审 | 3 位外部访客 | 访客限制与计费口径 |
| 管理复盘 | 每周跨项目报表 | 方案是否包含该能力 |

## 可放到页面的案例文案

“先邀请实际负责交付的同事，再为客户开放对应的评审项目。确认成员与访客的区别后，按需要的排期、权限和报表能力选择方案。对席位计算有疑问，可携带团队人数与使用方式联系我们。”

案例不展示未经确认的折扣或总价，也不声称访客永远免费。定价页访问增长只是背景；申请演示变化需要同一观察窗口和事件定义，不能把访客权限说明直接写成已证明提高转化。`,
    `## Explain selection with a twelve-person team

The example has twelve internal members and three client reviewers. Members assign, schedule and deliver work; clients read and comment on invited projects. Establish these responsibilities before checking seat definitions, guest restrictions and reporting coverage.

| Question | Case fact | Still needed before choosing |
| --- | --- | --- |
| Internal collaboration | Twelve continuing participants | Applicable seat rules |
| Client review | Three external guests | Guest limits and billing treatment |
| Management review | Weekly cross-project reports | Whether the plan includes this capability |

## Copy proposed for the page

“Invite the colleagues responsible for delivery, then share the relevant review project with each client. After distinguishing members from guests, choose the scheduling, permissions and reporting your team needs. Bring your headcount and working arrangement to us if seat calculations are unclear.”

Do not invent discounts, totals or a promise that guests are always free. Increased pricing visits provide context, not proof of conversion improvement. Demo-request comparisons need the same observation window and event definition.`,
  ),
  '/compare/nimbus': t(
    `## 用同一份交付清单做比较

对比范围限定为 12 人项目团队带 3 位客户评审者。ACME 与 Nimbus 都是虚构产品；本页展示评估方法，不把演示结果写成现实市场排名。

| 评估场景 | 要求的演示 | 当前判断 |
| --- | --- | --- |
| 表格迁移 | 20 行试导、错误恢复、唯一编号对账 | ACME 教程已有演练；Nimbus 待核实 |
| 外部评审 | 获邀项目、附件与撤权 | ACME 有权限案例；Nimbus 待核实 |
| 排期延期 | 固定里程碑与独立任务 | ACME 有依赖示例；Nimbus 待核实 |
| 离开平台 | 任务、附件与评论分别导出 | 两者均需按格式复核 |

不使用全绿勾的能力表。区分“有入口”“本例验证通过”“尚未核实”三种证据强度。预算、实施时间与集成依赖另列，不把便宜或功能更多直接等同于适合。

建议读者携带同一份清单试用两者，记录实际版本、执行身份和结果。只有完成相同条件验证的单元格才能给出比较结论；没有搜索量和转化证据，不预测本页新增客户数。`,
    `## Compare one shared delivery checklist

Limit the evaluation to a twelve-person project team with three client reviewers. ACME and Nimbus are fictional; the page demonstrates an evaluation method rather than a real market ranking.

| Scenario | Required demonstration | Current finding |
| --- | --- | --- |
| Spreadsheet migration | Twenty-row pilot, recovery and ID reconciliation | ACME rehearsal available; Nimbus unverified |
| External review | Invited project, attachments and revocation | ACME access case available; Nimbus unverified |
| Schedule delay | Fixed milestone and independent tasks | ACME dependency case available; Nimbus unverified |
| Leaving the platform | Separate tasks, attachments and comments | Both require format-specific checks |

Avoid an all-green feature grid. Distinguish an available entry point, a passing rehearsal and an unverified capability. List budget, setup effort and integration dependencies separately; more features or a lower price do not establish fit.

Ask readers to trial the same checklist and record version, identity and result. Only comparable verified cells support a conclusion. Without demand or conversion evidence, do not forecast customer gains from this page.`,
  ),
  '/features/kanban': t(
    `## 先处理评审瓶颈

八人设计团队同时启动 19 个任务，评审列有 7 项。把评审上限设为 3 不会自动消除积压；第一天先标出 7 项里谁在等客户、谁在等内部设计意见。

待做列要求需求清楚；进行中要求有人负责；待评审要求交付物与评审人齐全；完成要求明确接受。阻塞任务仍计入在制品，不移回待做来掩盖超限。

周三一位评审人请假，团队暂停接入新的高保真设计，先由替补处理已有意见。客户迟迟未回复的任务保留阻塞原因与下一次联系时间。上限是促使团队作决定的提醒，不是自动拒绝客户需求的规则。

复核时按同一时点数卡片，检查阻塞计数、超限提示和负责人。不要用任务被移动到完成列的次数衡量交付；只有被接受的交付物才算完成。下一周对比评审等待时间，同时注明人员变化。`,
    `## Address the review bottleneck first

An eight-person design team has started nineteen tasks, with seven waiting for review. Setting a review limit of three does not remove that queue. First distinguish client feedback from internal design review.

Planned work needs a clear request; active work needs an owner; review needs a deliverable and reviewer; done needs explicit acceptance. Blocked cards still count as work in progress. Moving them back to Planned merely hides overload.

One reviewer is away Wednesday. The team pauses new high-fidelity designs and assigns a backup to existing feedback. Client-blocked cards retain a reason and next contact time. A limit prompts a decision; it is not an automatic rejection of customer requests.

Count cards at the same snapshot and inspect blocked counts, warnings and ownership. A move to Done is not evidence of delivery without acceptance. Compare review waiting time the next week while recording the staffing change.`,
  ),
  '/docs/notifications': t(
    `## 提醒应该要求什么动作

通知分为指派、提及与临期三类。指派提醒告诉接收人负责什么，提及提醒链接到具体讨论，临期提醒解释哪项承诺即将到期。任务名称变动不应再发一次指派通知。

| 场景 | 接收人 | 应看到什么 |
| --- | --- | --- |
| 新负责人 | 被指派的人 | 任务、截止时间与来源 |
| 评论提及 | 明确被提及的人 | 原评论与任务链接 |
| 截止前提醒 | 当前负责人 | 尚未完成的任务与下一步 |

旧稿把静默时段内的提醒写成“全部丢弃”，这仍需修改：应该区分延后通知与关键事项的实际配置，不能猜测所有渠道行为相同。撤销指派后，旧负责人不应继续收到后续临期提醒。

复核必须包含重试与重复事件：同一事件重放一次，不生成两个未读通知；任务已经完成，不继续提醒延期。尚未核对的邮件渠道保留待确认，不能用站内提醒通过替代邮件验证。`,
    `## What action should a notification request?

Separate assignment, mention and deadline notifications. Assignment identifies responsibility, a mention links to the exact discussion, and a deadline warning names the approaching commitment. Renaming a task must not send another assignment notification.

| Situation | Recipient | Required content |
| --- | --- | --- |
| New owner | Assigned person | Task, deadline and source |
| Comment mention | Explicitly mentioned person | Original comment and task link |
| Deadline warning | Current owner | Unfinished work and next action |

The old draft says all quiet-hour reminders are discarded. That remains a review issue: distinguish delayed delivery from configured critical notifications instead of assuming identical channels. After reassignment, the former owner must not keep receiving deadline warnings.

Include retries and duplicate events in verification. Replaying one event must not create two unread messages, and completed work must not continue generating overdue reminders. Keep email delivery unverified until checked; successful in-app delivery is not an email test.`,
  ),
  '/features/mobile': t(
    `## 把现场记录与同步状态分开

现场负责人先记录文字，再补照片。保存按钮后应能看出“本机草稿”“正在同步”“已同步”三个不同状态，不能把本机保存写成同事已经看到。

演练从地铁弱网开始：输入三段拜访记录，上传两张照片时断网，文字仍可恢复；网络恢复后先确认文字同步，再重试失败照片。重复点击上传不能创建两份相同附件。

| 检查点 | 期望 |
| --- | --- |
| 断网后返回页面 | 草稿文字仍在 |
| 照片失败 | 文字可读，失败照片可单独重试 |
| 换设备 | 只有已同步内容可见 |
| 撤销权限 | 本次新请求被拒绝，不继续上传 |

本研究只能说明这几个场景，不能得出完全离线可用。建议下一轮补后台退出和大附件，分别记录设备、系统版本、网络状态和耗时。不要把少数演练反馈写成整体满意率。`,
    `## Separate field notes from synchronization

Save text first and attach photos afterward. Distinguish Local draft, Syncing and Synced; a local save does not mean colleagues can already read it.

The rehearsal begins on a weak train connection. Enter three paragraphs, lose the network while uploading two photos, and recover the text. When connectivity returns, confirm text synchronization before retrying failed photos. Repeated taps must not create duplicate attachments.

| Checkpoint | Expected result |
| --- | --- |
| Reopen after connection loss | Draft text remains |
| Photo fails | Text is readable; retry the failed photo independently |
| Open another device | Only synchronized content appears |
| Revoke access | New requests fail and uploads stop |

These cases do not establish full offline operation. A follow-up should cover background termination and large attachments, recording device, OS, network and elapsed time. A few rehearsal comments cannot establish a satisfaction rate.`,
  ),
  '/templates': t(
    `## 模板先解决交接，后展示任务数量

活动策划模板保留 32 项任务，分为场地、供应商、宣传、报名、现场与复盘六阶段。每阶段写清交付物、接收人和前置条件；任务多不代表模板完整。

| 阶段 | 关键交付物 | 不能跳过的检查 |
| --- | --- | --- |
| 场地 | 已确认场地与备选方案 | 日期与容量一致 |
| 宣传 | 已批准的印刷文件 | 印刷确认早于采购截止 |
| 现场 | 值班与异常联系人表 | 每个时段有人接手 |
| 复盘 | 行动项与负责人 | 有下次检查时间 |

创建项目时先移动活动基准日期，再检查假期和固定采购日；不机械平移所有日期。演练中把印刷确认从采购之后移到之前，同时给供应商清单增加接收人，避免宣传组与场地组互相等待。

建议模板首页展示适用活动规模、必须补齐的字段和一个完成示例。下载次数与成功落地不是一回事；后续抽查创建后仍为空的责任字段，比把下载增长写成效率提升更有用。`,
    `## A template should solve handoffs, not showcase task count

The event template retains thirty-two tasks across venue, suppliers, promotion, registration, delivery and retrospective. Each phase needs a deliverable, recipient and prerequisite. A longer checklist is not necessarily more complete.

| Phase | Key deliverable | Required check |
| --- | --- | --- |
| Venue | Confirmed site and fallback | Dates and capacity agree |
| Promotion | Approved print file | Print approval precedes purchasing cutoff |
| Event delivery | Duty and escalation contacts | Every shift has a recipient |
| Retrospective | Owned action list | A next checkpoint exists |

On project creation, move the event anchor date and inspect holidays and fixed purchasing deadlines separately. Do not blindly shift all dates. The rehearsal moves print approval before purchasing and names a recipient for the supplier list, ending the mutual wait between promotion and venue teams.

The template landing page should state event scale, fields still to complete and one worked example. Downloads are not successful adoption. Inspecting empty responsibility fields after creation is more useful than claiming productivity gains from download growth.`,
  ),
  '/features/workload': t(
    `## 用可用时间解释负荷

设计师每周名义工时 40 小时，但本周请假一天，另有 6 小时固定会议，可安排容量为 26 小时。分配 30 小时工作时超出 4 小时，不能仍用 40 小时显示绿色。

已排任务 18 小时、新需求 12 小时，总计 30 小时。先确认估算是否包含返工，再由负责人决定延期、拆分或转交。不要自动平均分给不具备所需技能的同事。

跨项目任务按同一人员汇总；无估算任务单列，不能当成零工作量。阻塞任务保留已投入时间，但剩余投入与等待时间分开。

验收按人员、工作周和时区核对明细与汇总，确认请假只扣一次，会议不重复计入任务。页面展示“超出可用容量 4 小时”，并注明估算不是个人绩效评价。下一次复盘比较估算与实际，不据一周波动评价个人效率。`,
    `## Explain load through available time

A designer nominally works forty hours, but has one day of leave and six hours of fixed meetings. Available capacity is twenty-six hours. Scheduling thirty hours exceeds capacity by four; using forty as the denominator would incorrectly look healthy.

Eighteen hours of existing work plus twelve hours of new requests total thirty. Establish whether estimates include rework, then let the owner defer, split or reassign. Do not automatically distribute tasks to people without the necessary skills.

Aggregate each person's assignments across projects. List unestimated work separately instead of treating it as zero. For blocked tasks, distinguish remaining effort from elapsed waiting time.

Reconcile detail and summary by person, working week and time zone. Deduct leave once and avoid counting meetings again as tasks. Show “four hours over available capacity.” Estimates are planning aids, not individual performance ratings; compare them with actual effort in a later review.`,
  ),
  '/docs/recurring-tasks': t(
    `## 改这一次，还是改后面的全部

每周例会使用同一系列编号，各次任务有独立日期与完成记录。修改本周会议时间只影响本次；修改系列规则必须预览未来哪些实例会变化。

已经完成的会议保留历史日期。取消一周会议，不删除整条系列；恢复时也不重复创建已经存在的下一次。节假日例外由负责人明确选择跳过或改期。

示例先将周三会议改到周四，再把未来会议改为隔周。检查本周例外仍保留、已完成记录不变、未来日期没有重复。时区变更另外预览，不能只改显示文字。

文案应在保存前说明影响范围，例如“仅本次”与“本次及以后”。当前版本未核对的跨时区行为保留待确认，不写成所有设备都会自动保持同一当地时间。`,
    `## Change one occurrence or the future series

Weekly meetings share a series ID but retain separate dates and completion records. Editing this week's time affects one occurrence; editing the recurrence rule needs a preview of affected future instances.

Completed meetings keep their historical dates. Canceling one week must not delete the series, and restoring it must not duplicate the next existing occurrence. A holiday exception requires an explicit skip-or-reschedule decision.

Move this Wednesday's meeting to Thursday, then change future meetings to alternate weeks. Verify the one-off exception survives, completed records stay unchanged and future dates remain unique. Preview a time-zone change separately instead of changing only its label.

Before saving, distinguish “This occurrence” from “This and following.” Unverified cross-zone behavior stays open; do not promise that every device automatically retains the same local clock time.`,
  ),
  '/docs/getting-started': t(
    `## 第一周只建立一个完整项目

从一个真实交付目标开始：品牌页面上线。创建项目后邀请负责设计、开发与验收的三位同事，添加五个关键任务，不先导入几百条旧记录。

每个任务至少写交付物、负责人、截止时间和验收人。连接设计到开发、开发到验收的依赖，固定发布里程碑。用一个客户访客检查评审范围，再让内部成员提交第一份交付物。

第一周结束时检查：任务是否能找到负责人；评审是否指向具体附件版本；阻塞是否有下一步；完成是否有验收记录。只有这些链路跑通，再引入模板、批量导入和跨项目报表。

遇到无权限先核对项目成员和角色，不建议临时给所有人管理员权限。没有收到邀请时检查邀请状态与收件地址，避免反复创建同名账号。该教程的完成标准是走完一次协作，不是点完所有菜单。`,
    `## Complete one project journey in the first week

Start with a concrete delivery: launching a brand page. Invite the design, engineering and acceptance owners and create five key tasks rather than importing hundreds of historical records immediately.

Each task needs a deliverable, owner, deadline and reviewer. Connect design to development and development to acceptance, preserving the fixed release milestone. Use one client guest to inspect the review boundary, then have a member submit the first deliverable.

At week's end, verify ownership, attachment-specific review, an actionable blocker and explicit acceptance. Introduce templates, bulk imports and portfolio reporting after this chain works.

For access failures, inspect project membership and role instead of temporarily making everyone an administrator. For a missing invitation, check its state and address before creating another same-name account. Success means completing a collaboration cycle, not visiting every menu.`,
  ),
  '/docs/milestones': t(
    `## 里程碑记录承诺，任务记录工作

“开始开发”“完成验收”“正式发布”不能都用同一种完成标准。开发开始由负责人确认；验收需要客户明确接受；发布需要确认目标页面可见。

本例把正式发布固定在 D13，验收预计 D14，显示一天冲突。项目经理可以协商日期或减少范围，但不能仅把里程碑拖到后一天使提醒消失。决定须记录客户确认与受影响交付。

里程碑没有持续工时，不参与普通任务工时求和；它可以等待多个前置任务。某个前置任务完成不代表全部满足。验收表分别检查多依赖、固定日期、撤销完成和跨项目展示。

当前任务停在待补客户确认，活动中保留已经计算的影响与负责人留言。确认没有到达以前，Agent 可以交付建议，不能替客户批准新的日期。`,
    `## Milestones capture commitments; tasks capture work

Starting development, accepting delivery and launching require different evidence. A lead confirms the start; a client explicitly accepts; a release needs visible content on the target page.

The example fixes launch at D13 while acceptance is expected D14, exposing a one-day conflict. The project manager can renegotiate timing or reduce scope, but must not drag the milestone merely to remove a warning. Record client agreement and affected deliverables.

A milestone carries no duration and must not inflate task-effort totals. It may depend on several predecessors; completing one does not satisfy all. Check multiple dependencies, fixed dates, reopening and portfolio presentation.

This task awaits client confirmation. Activity retains the calculated impact and owner note. The Agent can deliver a recommendation while waiting, but cannot approve a new date for the client.`,
  ),
  '/docs/time-tracking': t(
    `## 把计时、估算与客户计费分开

同一任务估算 6 小时，实际记录 7.5 小时，其中 1 小时为内部返工。实际工时回答投入多少，计费工时由合同与负责人确认，不能自动把 7.5 小时全部开票。

按任务和人员展示开始、结束、时长与备注。漏关计时器产生 18 小时记录时，保留原值、修订值、修订人和理由，不静默覆盖。跨午夜记录按明确时区划分，不能两天各算一次。

周报分别展示估算、实际和已确认计费三列；未确认用待确认，不写零。导出前核对任务归属与可见范围，客户访客不应看到内部成本。

待做事项是用三条样例完成走查：正常计时、跨日计时和漏关修正。完成后再决定是否加入定价案例，当前没有足够依据承诺某种计费制度。`,
    `## Separate tracking, estimates and billing

A task was estimated at six hours and records 7.5 actual hours, including one hour of internal rework. Actual time measures effort; billable time depends on the agreement and owner approval. Do not invoice all 7.5 automatically.

Show start, end, duration and note by task and person. If a forgotten timer creates eighteen hours, retain original value, correction, actor and reason. Split cross-midnight records using an explicit time zone without counting the duration twice.

Weekly reports need separate estimated, actual and approved-billable columns. Pending approval is not zero. Verify scope before export; client guests must not see internal cost.

The planned walkthrough covers normal timing, midnight crossover and a forgotten timer. Decide whether to include this in pricing examples afterward; current evidence does not support a universal billing rule.`,
  ),
  '/features/calendar': t(
    `## 日历显示同一承诺的不同视图

任务截止日期与会议开始时间是不同类型。没有时刻的截止日期按日期显示，不因为查看者时区变化跨到前一天；会议则显示明确时区与时刻。

演练里客户会议从周四 16:00 改到周五 10:00，任务验收截止仍为周五。拖动会议后检查详情、提醒和周视图都更新；移动任务日期时保留变更记录，不能连带移动独立会议。

跨月视图显示上月延续的未完成任务，不把视窗以外的数据删除。取消的会议标记取消，已完成任务是否显示由筛选控制；不把隐藏误当成删除。

当前等待补充夏令时边界的演练资料，已有普通日期场景可供查看。未覆盖的地区与客户端单列，不宣称所有日历订阅都会立即同步。`,
    `## Show the same commitment consistently across views

A date-only task deadline differs from a meeting timestamp. A deadline must not move to the previous day because the viewer changes time zone; a meeting needs an explicit zone and time.

In the rehearsal, a client meeting moves from Thursday 16:00 to Friday 10:00 while task acceptance remains due Friday. Check the meeting detail, reminders and week view after dragging. Moving a task date records the change without moving an independent meeting.

A cross-month view retains unfinished work from the previous month; records outside the viewport are not deleted. Canceled meetings retain their canceled state, and filters determine whether completed tasks appear. Hidden does not mean deleted.

Daylight-saving boundary material remains outstanding; ordinary-date examples are available. List uncovered regions and clients rather than claiming every calendar subscription synchronizes immediately.`,
  ),
  '/docs/comments': t(
    `## 评论要指向交付物与决定

客户在设计稿 v2 下写“按钮颜色太浅”，设计师交付 v3 后应回复具体修改，并保留 v2 的讨论。不要把原评论移动到 v3 后造成它看起来仍在批评新版。

提及一个人表示需要其关注，不自动改变负责人。需要行动时创建明确的任务或记录下一步；“赞”与“收到”不能作为验收通过。

演练保留三条往来：客户提出对比度问题，设计师说明 v3 修改，客户明确接受 v3。内部预算讨论留在内部任务，不复制到访客可见评论区。

检查附件删除后的引用提示、编辑评论的更新时间与通知去重。完成任务仍保留讨论，导出时区分评论作者和任务负责人。文案强调可追溯的决定，避免把更多消息数当作更好的协作。`,
    `## Anchor comments to a deliverable and a decision

A client says the button is too pale on design v2. When the designer delivers v3, reply with the specific correction while preserving the v2 discussion. Moving the original comment onto v3 makes it appear to criticize the new version.

Mentioning someone requests attention; it does not automatically change ownership. Create an explicit action where needed. A reaction or “received” is not acceptance.

The rehearsal preserves three exchanges: client contrast feedback, the designer's v3 correction and explicit client acceptance of v3. Keep internal budget discussion out of guest-visible comments.

Check missing-attachment references, comment-edit timestamps and notification deduplication. Completed work retains its discussion, and export distinguishes commenter from task owner. More messages alone do not demonstrate better collaboration.`,
  ),
  '/docs/archive': t(
    `## 归档不是删除

项目验收后保留任务、附件、评论与交付版本，只从日常工作列表隐藏。归档前检查是否有未关闭的客户决定、未结工时和仍需访问的共享链接。

本例品牌改版已验收，但维护事项尚未交接。先把维护责任迁到后续项目并确认接收，再归档改版项目。不能为了把列表清空而遗失未完成任务。

恢复归档后应看到原任务状态与历史日期；恢复不意味着重发全部通知或重新创建周期任务。访客访问范围按当前授权核对，不自动恢复已撤销邀请。

验收检查归档前后搜索、详情链接、附件和恢复路径。明确归档与永久删除的入口区别，普通清理建议只到归档为止。`,
    `## Archiving is not deletion

After acceptance, keep tasks, attachments, comments and versions while hiding the project from daily work. Before archiving, check unresolved client decisions, unsettled time records and shared links still needed.

The brand-refresh example is accepted but maintenance is not handed over. Transfer maintenance responsibilities to a follow-up project and obtain recipient confirmation before archiving. Clearing a list must not lose unfinished work.

Restoration should recover original states and historical dates without resending every notification or recreating recurring work. Check current guest authorization instead of restoring revoked invitations automatically.

Verify search, direct links, attachments and restoration before and after archiving. Distinguish archive from permanent deletion; ordinary cleanup guidance should stop at archive.`,
  ),
  '/templates/sprint': t(
    `## 一个两周迭代的可交付范围

八人团队先确认迭代目标“完成客户评审闭环”，再选任务。把需求澄清、开发、测试与验收放在同一清单，而不是只统计开发卡片。

容量按请假和维护值班扣减。临时生产问题进入迭代时，负责人同时说明哪项原承诺移出；不能只往待办里添加工作。未完成任务保留原编号与迁移原因，不在新迭代复制一个看似全新的任务。

完成标准包括验收、文档与已知问题，不能只写代码完成。复盘对照目标、范围变化与未交付原因，故事点只在同一团队内用于规划，不用于比较个人。

模板必须留出本次目标、负责人和时间范围三个必填入口。演练中先跑一次跨迭代迁移，核对历史、评论和附件均未丢失，再将模板交给新团队。`,
    `## Define a deliverable two-week sprint

An eight-person team starts with “complete the client-review loop,” then selects work. Include clarification, implementation, testing and acceptance rather than counting only development cards.

Deduct leave and support duty from capacity. When an urgent production issue enters, the owner names the original commitment leaving scope. Do not keep adding work without a tradeoff. Carry unfinished tasks forward with their identity and reason, rather than copying them into apparently new records.

Done includes acceptance, documentation and known issues, not merely finished code. Review the goal, scope changes and causes of incomplete delivery. Story points support planning within one team; they are not individual comparisons.

The template requires a goal, owner and time window. Rehearse one carryover and verify history, comments and attachments before handing it to another team.`,
  ),
  '/docs/approvals': t(
    `## 接受的是哪一版

客户需要确认设计附件 v3，任务中同时保留 v1 和 v2。评审邀请必须指向 v3，并写出此次验收范围：移动菜单、按钮对比度和页脚联系方式。不能只发“请看看”。

客户提出修改时，记录具体意见，状态回到待修改；设计师交付 v4 后重新邀请，不沿用对 v3 的批准。若客户只回复“收到”，仍等待明确接受。

验收表列出附件版本、评审人、结论、时间和未关闭事项。客户确认 v4 后锁定本次接受记录，后续变更作为新一轮评审；不改写旧记录的版本号。

演练覆盖接受、退回、替换附件和过期链接四种路径。没有签收证据时不要自动完成任务，也不把系统中的验收按钮等同于合同层面的最终接受。`,
    `## Which version is being accepted?

The client must review attachment v3 while v1 and v2 remain available. Link the invitation to v3 and name the scope: mobile menu, button contrast and footer contact information. “Please take a look” is insufficient.

For requested changes, record specific feedback and return to revision. When the designer delivers v4, request a new review instead of reusing v3 approval. “Received” still leaves acceptance pending.

Record attachment version, reviewer, decision, time and unresolved items. After explicit acceptance of v4, preserve that record and treat later changes as another review. Do not rewrite a historical version number.

Cover acceptance, rejection, replacement and expired links. Without evidence, do not complete the task automatically or equate an application button with final contractual acceptance.`,
  ),
  '/docs/integrations': t(
    `## 重试之前先确认是否已经处理

项目状态回传以 event ID 识别一次变更。收到重复事件时检查已处理记录；已成功的直接返回已处理，不再次创建任务。网络超时不代表远端没有执行。

| 输入 | 处理 | 保存的证据 |
| --- | --- | --- |
| 新事件 E-104 | 校验后更新关联任务 | 事件编号、任务编号、结果 |
| 重复 E-104 | 返回已处理 | 原结果与重放时间 |
| 先收到新版本 | 保留当前状态 | 丢弃旧版本的理由 |
| 校验失败 | 停止并排入错误清单 | 错误字段，不记录密钥 |

回放只选择失败事件，先在演练环境确认重复和乱序，再开放自动重试。错误消息应说明事件与下一步，不把凭据写进日志。

当前缺少重复事件演练包，任务保留检查计划和失败原因。补齐后重跑上述四种输入，确认不会重复建任务；在此之前不声称集成已经修复。`,
    `## Establish whether an event was processed before retrying

Identify each status callback by event ID. For a duplicate, consult the processed-event record and return the original result instead of creating another task. A timeout does not prove the remote operation failed.

| Input | Handling | Evidence retained |
| --- | --- | --- |
| New E-104 | Validate and update the linked task | Event ID, task ID and result |
| Replayed E-104 | Return already processed | Original result and replay time |
| Newer version arrives first | Preserve current state | Reason for rejecting an older update |
| Validation failure | Stop and queue for correction | Invalid field, never credentials |

Replay failed events only. Verify duplicates and out-of-order delivery in rehearsal before enabling retries. Error messages identify the event and next action without logging secrets.

The duplicate-event pack is still missing, so this task retains its check plan and failure reason. Rerun all four inputs after the pack arrives. Until then, do not claim the integration has been repaired.`,
  ),
  '/docs/export': t(
    `## 导出前先问接收者要什么

客户要验收记录，内部团队要完整项目归档，两者不是同一份文件。先选择项目与日期范围，再分别处理任务表、评论与附件清单。一个 CSV 不能承诺包含所有二进制附件。

任务表保留稳定编号、负责人、状态和日期；附件清单记录文件名、对应任务与版本；评论保留作者和时间。内部工时和预算不进入客户交付包。

演练抽查一个同名任务、一个含逗号的标题、一个跨行备注和一个已撤销附件。导出后重新读取，核对记录数与源筛选一致；失效附件明确提示，不能悄悄遗漏。

恢复能力另行验证。能导出表格不等于可以一键恢复整个项目；文案应说明范围和缺项，让团队决定是否需要额外备份。`,
    `## Start with the recipient's need

A client needs acceptance records; an internal team needs a full archive. These are different packages. Select project and dates, then handle tasks, comments and attachment manifests separately. A CSV cannot promise to contain every binary attachment.

Keep stable IDs, owners, state and dates in the task sheet. The attachment manifest identifies file, task and version; comments retain author and time. Exclude internal time and budget from the client package.

Spot-check a duplicate title, a comma-containing title, multiline notes and a revoked attachment. Reopen the export and reconcile its count with the original filter. Flag unavailable attachments instead of silently omitting them.

Test restoration separately. Spreadsheet export does not establish one-click project recovery. Explain coverage and omissions so the team can decide on additional backups.`,
  ),
  '/blog/estimation': t(
    `## AI 估算适合作为讨论起点

同一项“做一个登录页面”可能只含界面，也可能包含登录、找回密码、权限和审计。不给出范围就比较估算，没有可比性。

本研究将演练任务分为已有组件拼装、外部集成和需求不明三类。让估算同时给出假设、范围、依赖与不确定性；外部接口未确认时给区间，不输出一个看似精确的小时数。

评审用历史类似任务核对，但区分开发时长与等待时间。人确认范围后再排入计划；新的信息出现时更新估算并保留旧值及原因。

尚未收集足够历史样本来评价准确率。建议先在十个可比较任务上记录预测区间与实际投入，检查哪些假设常被遗漏。不能将小样本偏差写成产品保证，也不以估算评价个人能力。`,
    `## AI estimates are a starting point for discussion

“Build a login page” might mean a screen or an authentication flow with recovery, permissions and audit. Estimates without aligned scope are not comparable.

The rehearsal groups work into existing-component assembly, external integration and unclear requirements. Require assumptions, scope, dependencies and uncertainty with every estimate. An unconfirmed external interface needs a range, not a falsely precise hour count.

Review against similar historical work while separating effort from waiting. A person confirms scope before scheduling. New information can change the estimate, but retain its previous value and reason.

There is insufficient history to assess accuracy. Start with ten comparable tasks and record predicted ranges and actual effort, then inspect recurring missing assumptions. A small sample is neither a product guarantee nor a measure of individual ability.`,
  ),
  '/features/portfolio': t(
    `## 跨项目视图先显示共同风险

三个项目共用两位设计师，其中两个项目都计划周四评审。按项目各自看没有冲突，按人员汇总才发现评审容量不足。组合视图应该让负责人看到这个共享依赖。

| 项目 | 当前承诺 | 需决定的事 |
| --- | --- | --- |
| 品牌改版 | 周五发布核心页 | 客户确认移动菜单 |
| 春季活动 | 周四锁定印刷稿 | 与改版争用设计评审 |
| 客户门户 | 下周一验收 | 外部接口资料尚缺 |

汇总按明确的项目范围和快照时间生成；已归档项目默认移出日常视图，但历史报告仍可追溯。不同项目的百分比不能直接平均为公司完成率。

建议周会先决定评审顺序，再更新各项目承诺。每个红色风险都应能打开对应任务与负责人，不只是一张颜色漂亮的总览。`,
    `## Surface shared risks across projects

Three projects share two designers, and two schedule reviews Thursday. Each project looks feasible alone; grouping by person exposes insufficient review capacity. Portfolio reporting should reveal that dependency.

| Project | Current commitment | Decision needed |
| --- | --- | --- |
| Brand refresh | Core pages Friday | Client confirmation of mobile menu |
| Seasonal event | Print artwork Thursday | Competing design-review slot |
| Client portal | Acceptance next Monday | External interface material missing |

Build totals from an explicit project scope and snapshot time. Archived projects leave the daily view but remain available in historical reports. Different project percentages cannot simply be averaged into company completion.

Decide review order before revising commitments. Every red risk should open its task and owner; a colorful overview alone is not actionable.`,
  ),
  '/blog/retrospectives': t(
    `## 复盘应该改变下一次行动

品牌改版按原日期发布，但案例库延后。结论不能只写“按时完成”：实际是减少范围换取日期，客户已确认这一取舍。

将事实、解释与行动分开。事实是品牌确认晚两天；解释是审批联系人不明确；行动是下次启动会指定唯一确认人与替补。解释需要访谈核对，不能凭延期时间猜测个人动机。

| 保留的做法 | 要改变的做法 | 下一次检查 |
| --- | --- | --- |
| 固定里程碑冲突可见 | 提前确认客户决策人 | 下次启动会 |
| 交付物保留版本 | 评审邀请明确范围 | 第一轮设计评审 |
| 范围减少有书面确认 | 维护交接更早启动 | 发布前两个工作日 |

每个改进项只有一位负责人和检查时间。下月复盘回看它是否执行，而不是重新写一份同样的总结。此次演练不提供足够样本证明流程改动缩短了工期。`,
    `## A retrospective should change the next action

The brand refresh launched on its original date, but the case library was deferred. “Delivered on time” hides the actual tradeoff: reduced scope in exchange for timing, accepted by the client.

Separate fact, explanation and action. Brand approval was two days late; an unclear decision contact is a proposed explanation; naming one approver and backup at kickoff is the action. Confirm the explanation through discussion instead of inferring personal motives from delay.

| Keep | Change | Next checkpoint |
| --- | --- | --- |
| Visible fixed-milestone conflicts | Identify the client decision maker early | Next kickoff |
| Versioned deliverables | Name review scope in the invitation | First design review |
| Written scope tradeoff | Start maintenance handover earlier | Two working days before launch |

Every action needs one owner and checkpoint. Next month, review whether it happened rather than writing the same summary again. This rehearsal does not establish that the process change shortened delivery time.`,
  ),
};

export const CRM_NOTES: Record<string, L> = {
  '/docs/lead-routing': t(
    `## 分配规则要处理缺席与重复

新线索先按区域匹配团队，再在可接单成员间轮转。休假成员暂时跳过，保留原有客户归属；不能因其休假把所有历史客户重新分配。

| 输入 | 处理结果 | 需要保留的原因 |
| --- | --- | --- |
| 华东新线索 | 分给华东可接单成员 | 命中区域与轮转位置 |
| 负责人休假 | 跳过本轮 | 休假范围与替补 |
| 同一表单重复回传 | 关联已有线索 | 提交编号相同 |
| 区域为空 | 待认领队列 | 缺少匹配条件 |

分配后记录责任人、规则版本和时间。主管手动改派时保留原负责人及理由，不让下一次同步把人改回去。待认领队列设置明确处理人，不能成为无人负责的永久角落。

当前缺少一次重复回传样例，已保存规则表和待验证输入。补齐后重放同一提交两次，检查只产生一条线索且只通知一次；不把均匀轮转解释为自动提高成交率。`,
    `## Routing must handle absence and duplicates

Match a new lead to a regional team, then rotate among available members. Skip people on leave for new assignments while preserving existing account ownership. Absence must not redistribute their entire history.

| Input | Outcome | Reason retained |
| --- | --- | --- |
| New eastern-region lead | Available member of that team | Region match and rotation position |
| Owner on leave | Skip this turn | Leave period and backup |
| Repeated form callback | Associate with existing lead | Same submission ID |
| Missing region | Unassigned review queue | Missing matching condition |

Record owner, rule version and assignment time. A manager's manual reassignment retains previous owner and reason, and subsequent sync must not silently undo it. Give the unassigned queue an accountable reviewer.

One duplicate-callback example is still missing. The rule matrix and pending input are saved. Replay the same submission twice after it arrives and verify one lead and one notification. Balanced routing does not itself prove improved win rate.`,
  ),
  '/docs/follow-ups': t(
    `## 跟进记录必须留下下一步

“已联系”没有说明客户回答什么，也没有告诉同事接下来该做什么。每条记录写沟通方式、客户事实、未解决问题、下一动作与时间；把客户原话和销售判断分开。

示例客户说预算下月才能确定。记录为预算时间待确认，不改成“客户没兴趣”。销售承诺周四提供部署清单，客户答应下周二反馈；两项动作分别有责任人。

| 字段 | 本例内容 |
| --- | --- |
| 客户事实 | 预算会在下月评审 |
| 待解决问题 | 是否需要私有部署 |
| 我方下一步 | 周四发送部署清单 |
| 客户下一步 | 下周二确认参与评估人员 |

逾期没有反馈时，保留原承诺并记录新的联系计划，不把原日期覆盖成今天让报表看起来准时。主管回看时能区分失联、等待客户和等待内部资料。跟进次数不能代替客户进展。`,
    `## A follow-up needs a next action

“Contacted” explains neither the customer's response nor what a colleague should do next. Record channel, customer facts, unresolved questions, next action and time. Separate what the customer said from the rep's interpretation.

The example customer says budget can be confirmed next month. Record that timing instead of labeling them uninterested. The rep promises a deployment checklist Thursday; the client will name evaluation participants next Tuesday. These are two separately owned actions.

| Field | Example |
| --- | --- |
| Customer fact | Budget review takes place next month |
| Open question | Whether private deployment is required |
| Our next step | Send deployment checklist Thursday |
| Customer next step | Confirm evaluators next Tuesday |

If feedback is late, preserve the original commitment and add a new contact plan. Replacing the old deadline with today conceals lateness. A manager must distinguish no contact, waiting for customer and waiting for internal material. Contact count is not progress.`,
  ),
  '/pricing': t(
    `## 先解释总使用成本

八人销售团队另有两位只看汇总的主管。选择方案前核对谁需要编辑客户、谁需要管理分配，以及邮件同步、导出和报表是否包含在范围内。

演示报价只列需求，不捏造折扣：成员席位、只读访问、邮件连接、实施迁移分别确认。不要把“按用户计费”写成所有人相同权限，也不把一次实施服务混成永久订阅。

| 决策问题 | 要收集的信息 |
| --- | --- |
| 谁需要日常维护客户 | 销售人数与协作方式 |
| 谁只看报表 | 管理层访问范围 |
| 历史数据如何进入 | 公司、联系人与跟进数量 |
| 是否接入邮件 | 邮箱类型和共享范围 |

定价页访问增加而演示申请下降，需要同时看来源构成、设备与表单错误，不能直接归因为价格太贵。建议先补清楚购买边界，再按同一事件定义观察；没有客户原话时，不声称已经知道流失原因。`,
    `## Explain the full usage scope before price

The sample has eight sales reps and two managers who mainly read summaries. Determine who edits accounts, who assigns ownership, and whether email, export and reporting belong in the chosen plan.

The illustrative quote lists requirements without invented discounts: member seats, read-only access, email connections and migration assistance need separate confirmation. Per-user billing does not imply identical permissions, and one-time implementation is not a perpetual subscription.

| Decision | Information needed |
| --- | --- |
| Who maintains accounts daily | Rep count and collaboration pattern |
| Who only reads reports | Management access scope |
| What history must migrate | Companies, contacts and follow-up volume |
| Whether email is connected | Mailbox type and sharing scope |

Higher pricing visits with fewer demo requests require source, device and form-error analysis. They do not establish that price is too high. Clarify purchase boundaries first and observe a consistent event definition. Without customer feedback, the reason for leaving remains uncertain.`,
  ),
  '/docs/forecast': t(
    `## 预测不是把所有商机金额相加

周一固定快照包含三条示例商机：48,000 处于谈判、32,000 在评估、20,000 已确认赢单。演示权重分别为 50%、25%、100%，加权和为 52,000；原始金额合计 100,000，两者都不是已确认收入。

| 商机 | 金额 | 权重 | 加权值 |
| --- | ---: | ---: | ---: |
| A | 48,000 | 50% | 24,000 |
| B | 32,000 | 25% | 8,000 |
| C | 20,000 | 100% | 20,000 |

预计成交日期已过、币种不一致或缺少金额的记录单列异常，不悄悄当零。已输单从预测中排除，但保留在历史快照；重新打开商机须记录原因。

主管先看客户证据和下一步，再调整预测判断。阶段权重没有回测，不宣称准确率。与下周对比时，拆开新增、阶段变化、日期推迟和赢输变化，不能只展示一个涨跌百分比。`,
    `## Forecast is not the sum of all deal values

A fixed Monday snapshot contains three example deals: 48,000 in negotiation, 32,000 in evaluation and 20,000 confirmed won. Illustrative weights of 50%, 25% and 100% produce 52,000. Raw value totals 100,000; neither total is recognized revenue.

| Deal | Amount | Weight | Weighted value |
| --- | ---: | ---: | ---: |
| A | 48,000 | 50% | 24,000 |
| B | 32,000 | 25% | 8,000 |
| C | 20,000 | 100% | 20,000 |

List expired close dates, mixed currencies and missing amounts as exceptions instead of silently treating them as zero. Exclude lost deals from the current forecast while retaining historical snapshots. Reopening needs a reason.

Review customer evidence and next steps before adjusting judgment. The weights are not backtested and establish no accuracy claim. Next week's comparison should separate new deals, stage changes, date movement and won/lost changes rather than showing only a percentage.`,
  ),
  '/blog/crm-for-small-teams': t(
    `## 建议按第一次销售协作来组织内容

小团队的选型问题不是“哪个功能最多”，而是能否把客户归属、下一步和历史记录放在同一个地方。建议一篇场景指南承接需求，暂不为每个近义关键词建立单独页面。

| 问题组 | 用户要完成什么 | 主承接页 |
| --- | --- | --- |
| 从 Excel 搬客户 | 保住公司与联系人关系 | /docs/import |
| 团队一起跟进 | 明确负责人和下一步 | /docs/follow-ups |
| 管理销售阶段 | 定义进入与退出条件 | /features/pipeline |
| 主管看周会数字 | 看清口径与异常 | /features/reports |

文章开头用三人销售团队交接客户的场景，再解释导入、归属、阶段和复盘四个步骤。每一步链接详细指南，正文提供选择标准，而不是复制所有配置步骤。

现有样本支持这些问题确实出现在演练中，但没有完整市场搜索量与同条件竞品试用。优先级按业务贴合度排序，不按虚构流量预测。下一步先让试用团队完成一次导入与交接，记录卡住的地方，再决定是否补单独教程。`,
    `## Organize the guide around the first shared sales workflow

Small teams need ownership, next actions and history in one place, not simply the longest feature list. Use one scenario guide to address that need instead of creating a page for every keyword synonym.

| Question group | User job | Primary destination |
| --- | --- | --- |
| Move customers from Excel | Preserve company/contact relationships | /docs/import |
| Follow up as a team | Establish owner and next action | /docs/follow-ups |
| Manage sales stages | Define entry and exit criteria | /features/pipeline |
| Run the weekly review | Understand definitions and exceptions | /features/reports |

Open with a three-person sales team handing over an account. Explain migration, ownership, stages and review, linking each to its detailed guide. The article provides selection criteria rather than duplicating all configuration instructions.

The rehearsal supports the existence of these problems but provides no complete market-volume study or comparable competitor trial. Prioritize business fit, not invented traffic forecasts. Next, observe a trial team completing one import and handover, record obstacles, and decide which additional tutorial is warranted.`,
  ),
  '/docs/handover': t(
    `## 离职转交应同时交接责任与上下文

原销售有 18 家客户、7 条进行中商机和 3 项本周承诺。只改客户负责人会漏掉未关联的跟进与报价。先列清关系，再由接收人逐项确认。

| 对象 | 交接内容 | 接收人检查 |
| --- | --- | --- |
| 客户 | 当前联系人与关系状态 | 可访问且归属正确 |
| 商机 | 阶段、金额、下一步 | 7 条均有明确动作 |
| 报价 | 当前有效版本与期限 | 不继续发送失效报价 |
| 本周承诺 | 内容、截止与对方预期 | 3 项均确认接手 |

保留原销售作为历史跟进作者；不要批量改写所有旧活动署名。私人邮件访问不随客户归属自动转移，按邮箱授权另行处理。

当前接收人还不能打开一份报价附件，任务停在待补资料。修复后检查直接链接与导出范围，再确认交接；撤销原销售权限放在确认责任接续之后，过程保留时间顺序。`,
    `## Transfer responsibility and context together

The former rep owns eighteen accounts, seven active deals and three commitments due this week. Changing account owner alone misses unlinked follow-ups and quotes. Inventory relationships, then ask the recipient to confirm each.

| Object | Handover content | Recipient check |
| --- | --- | --- |
| Account | Current contacts and relationship | Accessible and correctly assigned |
| Deal | Stage, amount and next action | Seven deals have explicit next steps |
| Quote | Current version and validity | No superseded quote continues being sent |
| Weekly commitment | Scope, deadline and expectation | All three accepted |

Keep the former rep as the author of historical follow-ups. Do not rewrite every old activity's attribution. Private email access does not transfer automatically with account ownership.

The recipient cannot yet open one quote attachment, so the task awaits material. After correction, verify direct links and export scope before accepting the handover. Revoke the former rep's access in the coordinated transition, retaining its chronology.`,
  ),
  '/docs/renewals': t(
    `## 提前提醒不等于自动续约

演练合同在 D30 到期。D0 确认联系人与当前使用范围，D10 讨论下一期需求，D20 发出经审核报价，D27 检查是否得到明确决定。客户没有回复时，保留待确认，不自动标为续约。

| 状态 | 下一动作 |
| --- | --- |
| 联系人已离职 | 先确认新决策人与授权关系 |
| 需要减少席位 | 核对下一期范围，重新报价 |
| 报价仍待审批 | 提醒内部负责人，不向客户承诺旧价 |
| 客户明确不续 | 记录原因与交付安排，停止续约催促 |

提醒依据合同到期日，不能误用商机创建日期。多个联系人收到消息时共享一份跟进记录，避免三位销售同时联系同一客户。

本次演练检查提醒日期、负责人、报价版本与不续约分支。续约率需要明确分母与周期；当前说明不声称提醒功能已经提高续约率。`,
    `## An early reminder is not automatic renewal

The rehearsal contract expires on D30. On D0, confirm contact and scope; D10, discuss the next term; D20, send an approved quote; D27, check for an explicit decision. No response remains pending, not renewed.

| State | Next action |
| --- | --- |
| Contact has left | Confirm the new decision maker and authority |
| Fewer seats requested | Establish next-term scope and requote |
| Quote awaits approval | Escalate internally without promising an old price |
| Customer declines | Record reason and transition, stop renewal prompts |

Schedule from contract expiry rather than deal creation. Several contacts should share one follow-up history so three reps do not independently chase the same client.

Check dates, owner, quote version and the decline branch. Renewal-rate claims require a defined cohort and period; this example does not establish that reminders improved retention.`,
  ),
  '/features/mobile': t(
    `## 拜访结束先保住文字记录

销售在离开客户现场时记录需求、参与人和下一步，再上传照片。网络差时分别显示草稿保存与上传结果；一张照片失败不能把全部文字清空。

演练输入三段拜访笔记，断网后重新打开页面，文字仍在；恢复网络后只重试失败附件。换设备时只显示已同步内容，不能把本机草稿误称为团队共享记录。

每条笔记保留拜访发生时间和记录时间。晚间补记上午拜访时，周报按发生时间处理，不把两者混在一起。客户电话与现场照片仍按该销售的权限访问。

新版只有两天观察数据，暂不判断增长效果。下一轮补后台退出与权限撤销检查，明确目前范围是草稿保留，不是完整离线 CRM。`,
    `## Preserve text before uploading visit photos

After a visit, record need, participants and next action before attaching photos. On a weak connection, distinguish draft storage from upload status. One failed photo must not clear the notes.

Enter three paragraphs, disconnect and reopen the page to recover them. Once online, retry only failed attachments. Another device should show only synchronized content, not a local draft described as shared history.

Keep visit time and entry time separately. An evening note about a morning visit belongs to the occurrence date in reporting. Customer phone numbers and photos retain the rep's access restrictions.

Only two days of post-change observation exist, so growth remains undecided. Add background termination and revocation checks next. Current scope is draft retention, not a fully offline CRM.`,
  ),
  '/features/reports': t(
    `## 固定周会快照与统计口径

周一 09:00 快照供本次会议使用。“本月新增”按创建日期计算，首次联系另列；金额统一币种后才求和，未换算金额进入异常清单。

| 指标 | 本报告定义 | 常见误读 |
| --- | --- | --- |
| 新增线索 | 本月创建且未删除 | 不等于首次联系数 |
| 活跃商机 | 未赢、未输且有负责人 | 不等于全部历史商机 |
| 本月赢单 | 确认日期在本月 | 不等于创建于本月 |
| 预计金额 | 同币种待成交金额 | 不等于确认收入 |

每个数字能打开同一筛选条件的明细；表格重开仍使用会议快照，避免会议中途数字不断变化。长期不动、预计日期已过和缺下一步的商机单列，主管先处理这些异常。

检查跨月边界、时区与输单排除；同一公司有两条独立商机时按商机计数，不把公司数混进漏斗。没有统一币种与定义以前，不发布看似精确的总体增长率。`,
    `## Fix the weekly snapshot and definitions

Use Monday 09:00 for the meeting snapshot. “New this month” means created this month; first contact is separate. Sum amounts only after establishing a common currency, leaving unresolved conversions in an exception list.

| Metric | Definition | Common misreading |
| --- | --- | --- |
| New leads | Created this month, not deleted | Not first-contact count |
| Active deals | Neither won nor lost, with an owner | Not all historical deals |
| Monthly wins | Confirmation date within the month | Not creation date |
| Pipeline value | Same-currency open-deal value | Not recognized revenue |

Every total opens details with identical filters. Reopening retains the meeting snapshot instead of changing numbers mid-discussion. Surface stale deals, expired close dates and missing next actions first.

Check month boundaries, time zone and lost exclusions. Two distinct deals at one company count as deals; account count is a different measure. Without common currency and definitions, do not publish a precise-looking overall growth rate.`,
  ),
  '/blog/lost-deals': t(
    `## “价格太贵”并不是一个足够具体的结论

12 条演练输单中 7 条标记价格；备注却分别提到预算冻结、上线推迟和缺少集成。首先保留原分类，再根据客户证据加子原因，不能替销售改写历史。

| 证据 | 建议分类 | 可做的下一步 |
| --- | --- | --- |
| 客户明确预算冻结 | 预算时点 | 约定是否下季度联系 |
| 项目启动延期 | 采购时机 | 记录新的时间窗口 |
| 必需集成缺失 | 能力不匹配 | 交产品团队评估，不承诺日期 |
| 客户没有解释 | 原因未说明 | 保留未知，不强迫猜测 |

三个追问示例：“这次主要卡在预算时间还是总投入？”“如果时间调整，是否还会继续评估？”“缺少的集成影响哪个具体工作？”每次只问与上下文相关的一项，不像问卷一样盘问。

研究样本很小，不能据此算出整个市场的输单原因比例。后续按同一分类回看一个季度，并分别展示有客户证据和销售判断的记录，再决定改产品、定价解释还是跟进时机。`,
    `## “Too expensive” is not a sufficiently specific finding

Seven of twelve rehearsal losses are labeled price, but notes mention frozen budgets, delayed launches and missing integration. Preserve the original category and add an evidence-backed subreason instead of rewriting history.

| Evidence | Suggested category | Useful next action |
| --- | --- | --- |
| Explicit budget freeze | Budget timing | Agree whether to reconnect next quarter |
| Project postponed | Buying window | Record the revised window |
| Required integration absent | Capability mismatch | Ask product to evaluate without promising a date |
| No explanation | Unknown | Retain uncertainty instead of forcing a guess |

Possible follow-ups: “Is the main issue budget timing or total investment?” “Would you continue evaluating if timing changed?” “Which work depends on the missing integration?” Ask the question relevant to the conversation, not an interrogation-style checklist.

The sample is too small to establish market-wide loss proportions. Review a quarter using consistent categories and separate customer evidence from sales interpretation before deciding whether to change the product, pricing explanation or contact timing.`,
  ),
  '/docs/email': t(
    `## 连接邮箱前明确同步边界

客户归属与邮箱授权是两套边界。销售接入私人邮箱，不代表全体成员可以查看历史邮件；共享邮箱也需要明确哪些团队能看正文与附件。

同步前预览文件夹、时间范围和客户匹配方式。联系人邮箱匹配只能提出候选，转发邮件和群组邮箱不能自动证明客户关系。示例正文全部虚构，不使用真实客户邮件。

| 操作 | 必须解释 |
| --- | --- |
| 首次同步 | 从哪天、哪些文件夹开始 |
| 共享给团队 | 谁能看正文和附件 |
| 撤销连接 | 停止后续同步，历史记录如何处理 |
| 转交客户 | 邮件权限是否需要另行授权 |

当前等待补齐提供商撤权行为的确认。先保存界面文案与检查清单，不承诺所有邮箱撤销后都会自动删除已同步副本。下一轮分别检查新请求、历史读取和附件链接。`,
    `## Define synchronization boundaries before connecting mail

Account ownership and mailbox authorization are separate. Connecting a personal mailbox does not expose all history to the team. A shared mailbox still needs explicit body and attachment access scope.

Preview folders, time range and matching rules before syncing. Matching an email address suggests a customer relationship; forwarded mail and group addresses do not prove one. All example messages are fictional.

| Operation | Required explanation |
| --- | --- |
| Initial synchronization | Starting date and folders |
| Team sharing | Who reads bodies and attachments |
| Disconnect | Stopping future sync and handling retained history |
| Account transfer | Whether separate mail authorization is required |

Provider-specific revocation behavior is still awaiting confirmation. Save the proposed copy and checks without promising that every provider deletes synchronized copies on disconnect. Next, verify new requests, historical reads and attachment links separately.`,
  ),
  '/docs/quick-start': t(
    `## 先完成一条客户关系的闭环

三人销售团队从一个虚构客户开始，创建公司、两位联系人和一条商机。指定当前负责人，记录一次沟通和下一步日期，再让主管查看同组数据。

不要先要求导入全部历史客户。第一轮核对公司与联系人关系、商机阶段、负责人权限和跟进记录。客户改期时保留原计划与原因，验证同事能接手。

主管在周会打开同一条商机，能看到客户问题、当前报价版本和待决定事项，才算完成上手。拥有很多客户记录但没有下一步，不算进入稳定使用。

后续再连接邮箱、导入旧表和设置分配规则。遇到权限问题先检查岗位与客户归属；不要为演示方便给全部销售开放所有客户。`,
    `## Complete one customer relationship cycle first

A three-person sales team starts with one fictional company, two contacts and one deal. Assign an owner, record a conversation and next date, then let the manager inspect team-scoped records.

Do not begin by importing all historical customers. Verify company/contact relationships, deal stage, ownership access and follow-up history. If the client reschedules, preserve the previous plan and reason and check that a colleague can take over.

On the weekly review, the manager should find the customer's problem, current quote version and pending decision on that deal. Many records with no next actions do not demonstrate successful onboarding.

Connect email, migrate history and add routing afterward. For access problems, inspect role and account ownership rather than granting every rep all customers for convenience.`,
  ),
  '/docs/integrations': t(
    `## 回传结果必须可以重复接收

网站表单发送提交编号 F-208，CRM 创建一条线索并保存关联。响应超时后网站重发同一编号，CRM 应返回已有线索，而不是再创建一次。

| 情况 | 处理 |
| --- | --- |
| 新编号 | 校验字段、创建并记录映射 |
| 重复编号 | 返回已有结果，保留重放时间 |
| 缺少邮箱 | 返回具体字段错误，不伪造联系方式 |
| 状态更新乱序 | 比较版本，保留较新状态 |

重试队列记录次数、下次时间和最后错误；超过限制交给负责人，不无限重发。日志保留提交编号，不记录连接密钥和完整私人邮件。

当前回放样例未到齐，已有规则表与失败诊断。补齐重复和乱序事件后，核对线索总数、归属与通知次数，再交付复核。接口返回成功不能单独证明客户已经收到联系。`,
    `## Accept callbacks idempotently

The website submits F-208, and CRM creates one lead with a stored mapping. If the response times out and F-208 is sent again, return the existing lead instead of creating another.

| Situation | Handling |
| --- | --- |
| New ID | Validate, create and store mapping |
| Duplicate ID | Return the existing result and record replay time |
| Missing email | Return a field error without inventing contact details |
| Out-of-order update | Compare versions and retain the newer state |

The retry queue records count, next attempt and last error. Escalate after the limit rather than retrying forever. Logs retain submission IDs, not connection secrets or complete private messages.

Replay samples remain incomplete, with the rule matrix and diagnosis saved. Once duplicate and out-of-order events are available, reconcile lead count, owner and notification count before review. A successful API response alone does not prove the customer was contacted.`,
  ),
};
