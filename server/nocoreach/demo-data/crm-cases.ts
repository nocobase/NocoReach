import type { CaseStudy } from './case-study.js';
import { scenario } from './case-study.js';
import { t } from './world/script/types.js';

export const CRM_CASES: Record<string, CaseStudy> = {
  '/docs/import': {
    audience: t(
      '要把客户、联系人和历史跟进从表格迁入 CRM 的销售运营。',
      'Sales operations migrating companies, contacts and historical follow-ups from spreadsheets.',
    ),
    decision: t(
      '先建立公司外部编号，再导联系人和跟进；保留疑似重复供人工确认，不按手机号自动合并。',
      'Create company external IDs before importing contacts and follow-ups. Leave suspected duplicates for review instead of merging on phone number.',
    ),
    evidence: t(
      '公司原表有 1,280 行，其中 86 行经逐组核对为重复、14 行缺负责人；另有 320 位联系人，其中 8 位没有邮箱、6 位共用总机。空值和总机号码都不适合作为唯一键。',
      'The company source has 1,280 rows, including 86 duplicates verified individually and 14 missing owners. A separate sheet has 320 contacts, eight without email and six sharing a switchboard. Blank values and switchboards are unsuitable unique identifiers.',
    ),
    document: t(
      `## 不把一行表格当作一个客户

公司、联系人和跟进是三类记录。先把公司的 External ID 整理好，再把联系人挂到公司，最后导入带时间和负责人信息的跟进。同一家公司有两位联系人，应得到一个公司和两个联系人。

| 原始字段 | 目标 | 导入规则 |
| --- | --- | --- |
| 公司编号 | Company external ID | 必填；保留原编号，不按公司简称合并 |
| 联系人编号 | Contact external ID | 每人唯一；空邮箱不影响身份 |
| 公司名称 | Company name | 用于人工核对，不作为唯一键 |
| 电话 | Phone | 文本；保留区号、分机和前导零 |
| 跟进内容 | Activity note | 按原发生时间保存，不改成导入当天 |
| 原销售 | Owner | 未匹配的进入待认领清单 |

## 三步导入与对账

第一批只导 20 家公司，抽查两家名称相近但不同的法人。确认后完成 1,194 家去重后的公司主表，再导 320 位联系人。86 行重复逐组确认，保留合并前编号与历史跟进；14 行缺负责人进入待认领队列。演练撤销一组合并后检查关联恢复，再重新确认，最终仍为 1,194 家公司。

联系人导入后用 Company external ID 关联公司。6 位共用总机的联系人分别存在，8 位无邮箱联系人也保留。最后导历史跟进，保留原发生日期、原负责人和来源行号；未匹配负责人标记待认领，不能默认全部分给管理员。

对账从三个方向进行：公司唯一编号总数、联系人唯一编号总数、孤立关系清单。数量相等还不够，应抽查一个公司多人、同名公司、空邮箱和离职转交四种情况。

## 失败后怎么恢复

将失败行另存，修正后只重试失败行。若导入器不支持更新，不能重传成功批次。公司关系匹配失败时，保留联系人为待关联，先核对主表编号，再决定是否新建公司。

本教程的截图使用虚构公司与联系人；邮件采用 example 域名。客户名单不应进入公开演示或培训附件。`,
      `## A spreadsheet row is not a customer

Companies, contacts and follow-ups are different records. Establish Company external IDs, attach contacts to companies, then import dated follow-ups with their owners. Two contacts at one company must produce one company and two contacts.

| Source field | Destination | Import rule |
| --- | --- | --- |
| Company number | Company external ID | Required; preserve the original ID rather than merging abbreviations |
| Contact number | Contact external ID | Unique per person; a missing email does not erase identity |
| Company name | Company name | Human verification, not a unique key |
| Phone | Phone | Text, preserving country codes, extensions and leading zeros |
| Follow-up text | Activity note | Preserve occurrence time instead of using import day |
| Previous rep | Owner | Unmatched people enter an unassigned review list |

## Import and reconcile in three steps

Pilot twenty companies and inspect two similarly named but distinct legal entities. Complete the 1,194-company reconciled master before importing the 320 contacts. Review all 86 duplicate rows individually, retaining original IDs and follow-up history. Put fourteen ownerless records in the assignment queue. Undo one merge, verify restored relationships, then confirm it again; the final company count remains 1,194.

Link contacts using Company external ID. Retain all six contacts sharing a switchboard and the eight without email. Import follow-ups last, preserving the original date, owner and source row. Mark unresolved owners for assignment rather than giving everything to the administrator.

Reconcile distinct company IDs, distinct contact IDs and orphaned relationships. Matching totals are necessary but insufficient. Inspect one company with several contacts, similar company names, missing emails and a former employee's transferred account.

## Recover without duplicating successful work

Export rejected rows, correct them and retry only those rows. If the importer cannot update, repeating a successful batch can duplicate it. For a failed company match, leave the contact pending association while checking the master ID; do not create another company automatically.

Use fictional companies and contacts in screenshots, with example-domain email addresses. Customer lists do not belong in public demo downloads.`,
    ),
    checks: t(
      '1,280 − 86 = 1,194 家公司；320 位联系人另行对账；6 位总机联系人未合并；8 个空邮箱未丢失；14 条待认领记录保留；撤销合并可恢复原关联；历史跟进时间未被导入时间覆盖。',
      'Reconcile 1,280 − 86 = 1,194 companies and separately 320 contacts; retain six switchboard contacts and eight missing emails; retain fourteen unassigned accounts and verify merge undo; keep historical follow-up dates.',
    ),
    limitation: t(
      '演练数量不能作为真实客户迁移统计；唯一键和更新策略须按目标版本确认。',
      'Rehearsal counts are not real customer migration statistics. Verify unique keys and update semantics in the target version.',
    ),
    review: t(
      '手机号去重会把 6 个总机联系人合并。请以外部编号关联，并补充空邮箱与离职负责人两种失败情况。',
      'Phone-based deduplication would merge six switchboard contacts. Use external IDs and cover missing email and former-owner cases.',
    ),
    revision: t(
      '已取消手机号自动合并，增加四类抽查记录；失败行分开重试，联系人与公司分别对账。',
      'Removed automatic phone merging, added four spot-check categories and separate company/contact reconciliation with rejected-row recovery.',
    ),
  },
  '/features/pipeline': {
    audience: t(
      '需要用同一标准开销售周会的销售主管和客户经理。',
      'Sales managers and account executives who need a shared standard for pipeline reviews.',
    ),
    decision: t(
      '把阶段变动绑定到客户证据，而不是销售的主观信心；阶段概率仅作演示，不充当预测模型。',
      'Tie stage movement to customer evidence rather than a rep’s confidence. Illustrative stage probabilities are not a forecasting model.',
    ),
    evidence: t(
      '24 条商机的演练快照里，5 条“谈判中”没有有效报价，3 条没有下一步日期。旧页面只画了漏斗，没有解释什么时候能进入下一阶段。',
      'In a 24-deal rehearsal snapshot, five Negotiation deals lack a valid quote and three have no next-action date. The old page drew a funnel without defining entry requirements.',
    ),
    document: t(
      `## 用客户行为定义阶段

一个电话、一次演示和一份报价并不自动代表商机向前。阶段要描述双方已经确认什么，下一步还缺什么。示例团队使用下面的四阶段标准。

| 阶段 | 进入条件 | 离开前要有的证据 |
| --- | --- | --- |
| 已确认需求 | 联系人确认具体问题与使用团队 | 需求摘要、下一步日期 |
| 方案评估 | 客户同意评估范围与参与人 | 演示反馈、未解决问题 |
| 商务谈判 | 有效报价已送达并进入讨论 | 报价版本、决策人、采购步骤 |
| 赢单 | 合同或订单明确确认 | 确认文件、金额与服务起始日期 |

## 先清理异常，再讨论预测

将没有有效报价的 5 条谈判商机退回方案评估，并记录原因；不要删除它们。3 条缺下一步日期的记录由当前负责人补充，无法联系客户的保留为待核实，不随意填明天。

某演示商机金额为 48,000，阶段权重为 50%，加权值为 24,000。这只是计算示例，不表示成交概率经过校准，更不是已确认收入。周会同时显示原始金额、权重、预计日期和证据，避免只看加权总额。

## 第二版调整

第一版把“销售发出报价”写成进入谈判的充分条件。复核后改为客户确认进入商务讨论，并补上报价版本和决策人。周会清单增加“长期无动作”和“预计日期已过”两类异常，让主管先处理阻塞。

历史阶段变化保留旧值、修改人、时间与原因；回退阶段不会删掉前次评估记录。`,
      `## Define stages through customer behavior

A call, a demo and a quote do not automatically advance a deal. A stage should describe what both parties have confirmed and what remains unresolved. The sample team uses four stages.

| Stage | Entry condition | Evidence needed before advancing |
| --- | --- | --- |
| Qualified need | Contact confirms a concrete problem and team | Needs summary and next-action date |
| Solution evaluation | Customer agrees scope and participants | Demo feedback and unresolved issues |
| Commercial negotiation | A current quote has reached active discussion | Quote version, decision maker and purchasing steps |
| Won | Contract or order explicitly confirmed | Confirmation document, amount and service start date |

## Clear exceptions before discussing forecast

Return the five Negotiation deals without a valid quote to Solution evaluation and record why; do not delete them. Owners complete the three missing next-action dates. Where the customer cannot be reached, retain an unresolved status rather than inventing a tomorrow deadline.

A sample deal worth 48,000 with a 50% stage weight contributes 24,000 to a weighted view. This demonstrates arithmetic, not a calibrated probability or recognized revenue. Display raw amount, weight, expected date and evidence together.

## Changes in version two

Version one treated sending a quote as sufficient to enter negotiation. The revision requires customer confirmation that commercial discussion has begun, and adds quote version and decision maker. The weekly list also surfaces stale activity and expired expected-close dates.

Keep old stage, new stage, actor, time and reason in history. Moving backward does not erase an earlier evaluation.`,
    ),
    checks: t(
      '5 条缺报价商机保留回退原因；3 条缺日期不填假日期；48,000 × 50% = 24,000；赢单需确认文件；回退保留历史。',
      'Preserve reasons for five stage reversals; do not invent dates for three gaps; verify 48,000 × 50% = 24,000; require won evidence; retain stage history.',
    ),
    limitation: t(
      '阶段权重没有历史回测，不能宣称预测准确率；未完成的数据清理不写成真实增长结果。',
      'Stage weights have not been backtested and imply no forecast accuracy. Rehearsal cleanup is not a real growth result.',
    ),
    review: t(
      '发出报价不等于进入谈判。请加上客户确认、决策人和报价版本，并解释加权金额为什么不是收入。',
      'Sending a quote does not mean negotiation. Add customer confirmation, decision maker and quote version, and explain why weighted value is not revenue.',
    ),
    revision: t(
      '第二版收紧了谈判条件，新增异常商机清单和加权金额算例，保留原版供对照。',
      'Version two tightens negotiation entry, adds exception deals and weighted-value arithmetic, and retains the earlier version for comparison.',
    ),
  },
  '/docs/quotes': {
    audience: t(
      '负责折扣审批、报价交付与客户确认的销售团队。',
      'Sales teams handling discount approval, quote delivery and client acceptance.',
    ),
    decision: t(
      '把 48,000 元的 v1 与 43,200 元的 v2 分开保存，折扣审批、发送与客户接受分别记录。',
      'Retain v1 at 48,000 and v2 at 43,200 separately, recording discount approval, delivery and customer acceptance as distinct events.',
    ),
    evidence: t(
      '演练报价申请 10% 折扣，金额减少 4,800，但旧版 PDF 仍在待发送邮件中。主管批准折扣并不意味着客户收到新版。',
      'The rehearsal requests a 10% discount, reducing the amount by 4,800, while the outgoing email still contains the old PDF. Manager approval does not establish that the client received the revision.',
    ),
    document: t(
      `## 先把版本与批准分开

销售提出折扣理由并创建 v2。主管复核范围、毛利与有效期后作决定，不直接替销售修改报价。v1 保留原始内容和已发送记录；v2 在审批前不得标记已发送。

| 版本 | 金额 | 当前状态 | 下一动作 |
| --- | ---: | --- | --- |
| v1 | 48,000 | 已发送，待新版正式替代 | 保留旧附件和发送记录 |
| v2 | 43,200 | 折扣 10%，待主管复核 | 补齐折扣理由与有效期 |

计算为 48,000 × 90% = 43,200，差额 4,800；币种与税费口径沿用同一原报价。本次只改变折扣，不悄悄增加服务范围。

## 批准以后还需要什么

审批通过后生成 v2 PDF，核对附件版本、金额、有效期和收件人，再替换邮件中的 v1。保存实际发送结果后才显示已发送；网络超时进入待核对，不立即重发两封邮件。

向客户说明新旧差异，并要求确认具体版本。客户只回复“收到”不是接受。若客户已接受 v1，先由商务负责人确认变更安排，系统标记旧版失效不能替代客户同意。

## 本次退回原因

初稿没有说明客户收到的是哪个附件，也把审批与发送合成一个状态。本稿保留 v1 已发送、v2 待审批两个事实；下一版须补审批通过后 v2 实际发送的演练记录。未补齐前保持待修改，不声称报价已经成功交付。`,
      `## Separate versioning from approval

Sales records the discount reason and creates v2. The manager reviews scope, margin and validity rather than editing the rep's quote directly. Keep v1 and its delivery record unchanged. Do not mark v2 sent before approval.

| Version | Amount | Current state | Next action |
| --- | ---: | --- | --- |
| v1 | 48,000 | Sent; awaiting formal replacement | Retain original attachment and delivery record |
| v2 | 43,200 | 10% discount, awaiting manager review | Complete reason and validity period |

48,000 × 90% = 43,200, a difference of 4,800. Currency and tax treatment remain those of the original quote. This change concerns discount only; it must not silently add services.

## Approval is followed by delivery

After approval, generate the v2 PDF and check version, amount, validity and recipient before replacing v1 in the outgoing message. Mark sent only after a delivery result exists. A network timeout becomes pending verification rather than triggering two immediate emails.

Explain the difference and request acceptance of the specific version. “Received” is not acceptance. If the client already accepted v1, the commercial owner must establish the change arrangement; superseding a version in software does not replace client consent.

## Why this draft was returned

The first draft never identified the delivered attachment and combined approval with sending. This revision preserves two facts: v1 was sent and v2 awaits approval. The next version must add the post-approval v2 delivery rehearsal record. Until then, keep the task in revision without claiming successful quote delivery.`,
    ),
    checks: t(
      '48,000 减 4,800 等于 43,200；审批绑定 v2；发送附件为 v2；记录收件人与发送结果；客户接受指向具体版本。',
      'Verify 48,000 minus 4,800 equals 43,200; bind approval to v2; send the v2 attachment; record recipient and delivery result; identify the accepted version.',
    ),
    limitation: t(
      '此稿仍缺 v2 发送演练记录；演示不会发送真实报价，不推断客户已经接受。',
      'The v2 delivery rehearsal record is still missing. The demo sends no real quote and does not infer customer acceptance.',
    ),
    review: t(
      '审批通过和客户收到新版是两件事。请补上替换旧 PDF、核对收件人及实际发送结果，当前不要写成已交付。',
      'Approval and receipt are different. Show replacement of the old PDF, recipient checks and the actual delivery result; do not claim delivery yet.',
    ),
    revision: t(
      '已分开审批与发送状态，保留 v1；v2 的发送演练记录仍待补齐，暂不请求批准。',
      'Separated approval and delivery states and retained v1. The v2 delivery rehearsal remains outstanding, so approval is not requested yet.',
    ),
  },
  '/docs/permissions': {
    audience: t(
      '管理两个销售组、需要处理跨组访问与离职转交的 CRM 管理员。',
      'CRM administrators managing two sales teams, cross-team access and former-employee handovers.',
    ),
    decision: t(
      '按客户归属而不是创建人解释访问范围，同时检查列表、详情、导出和撤权。',
      'Explain access through account ownership rather than record creator, checking lists, details, exports and revocation.',
    ),
    evidence: t(
      '演练里原销售创建的客户后来转给同组同事。若规则仍按创建人过滤，新负责人看不到客户，原销售却可能继续看到。管理员截图无法揭示这个问题。',
      'A former rep created an account that was later transferred to a teammate. Filtering by creator can hide it from the new owner while retaining the old owner’s access. Administrator screenshots conceal the problem.',
    ),
    document: t(
      `## 从三个岗位开始

| 岗位 | 客户范围 | 可执行动作 |
| --- | --- | --- |
| 销售 | 当前归属本人 | 跟进、修改业务信息 |
| 销售主管 | 当前归属本组 | 查看、分配负责人、按授权导出 |
| 运营 | 经确认的汇总 | 查看来源分布，不读取个人电话 |

转交客户时修改当前负责人及所属组，不改写创建人。创建人是历史事实，负责人是业务责任，两者不能替代。

## 复核顺序

先用销售账号打开本人客户，再打开另一组客户的直接链接；拒绝结果需要记录。接着用主管账号查看同组离职转交的客户，并检查跨组客户仍不可读。最后用运营账号检查汇总和导出，不能只因为页面上没有电话列就认为接口不会返回电话。

撤销销售访问后重新请求列表、详情和导出。历史跟进保留原作者，撤权不等于删除业务历史。授权变更前后各保留一份检查表。

如果主管临时兼任另一岗位，记录当前生效身份与权限组合，不能把拥有多个角色直接理解成所有权限的并集。`,
      `## Start with three responsibilities

| Role | Account scope | Allowed actions |
| --- | --- | --- |
| Sales rep | Currently assigned accounts | Follow up and edit business details |
| Sales manager | Accounts currently owned by the team | Read, reassign and export as authorized |
| Operations | Approved aggregates | Read source distribution without personal phone numbers |

A handover changes current owner and team, not creator. Creator records a historical fact; owner records current responsibility. They are not interchangeable.

## Verification sequence

As a rep, open an assigned account and then a direct link to another team's account, recording the denial. As a manager, open a former employee's account transferred within the team and verify that another team's account remains inaccessible. As operations, check both summaries and exports. A hidden phone column does not prove that the response omits phone data.

After revocation, request the list, detail and export again. Follow-ups retain their original author: revoking access does not delete business history. Save checks from before and after the change.

If a manager temporarily holds another role, record the effective identity and role combination. Possessing several roles does not by itself establish that all permissions are combined.`,
    ),
    checks: t(
      '本人、同组、跨组三种范围都有记录；检查详情和导出；离职转交后新负责人可读；撤权后旧请求被拒绝。',
      'Cover own, team and cross-team scopes; check details and export; verify the new owner after transfer; reject old access after revocation.',
    ),
    limitation: t(
      '示例矩阵是本演练的策略，部署时须按业务岗位与实际授权配置核对。',
      'This matrix is the rehearsal policy; a deployment must verify its own responsibilities and authorization configuration.',
    ),
    review: t(
      '“本人记录”仍写成创建人。改成当前归属，并补上离职转交后原负责人和接收人的两次检查。',
      '“Own records” still means creator in the draft. Use current ownership and check both former and incoming owners after transfer.',
    ),
    revision: t(
      '归属字段与创建人已经分开，补齐跨组详情、导出与撤权检查。',
      'Separated ownership from creator and added cross-team detail, export and revocation checks.',
    ),
  },
  '/contact': scenario(
    t(
      '准备申请 CRM 演示但不愿先填完整公司档案的销售负责人。',
      'Sales leads requesting a CRM demo without completing a full company profile first.',
    ),
    t(
      '表单先收联系方式和需要解决的问题；可选信息不阻止提交，失败时保留已填内容。',
      'Collect contact details and the problem first; optional profile fields must not block submission, and failures must preserve entered text.',
    ),
    t(
      '虚构走查发现两处阻塞：手机端公司规模选项被遮挡，失败提示清空了需求描述。流量上涨本身不能证明这两处是转化下降的全部原因。',
      'The fictional walkthrough finds a covered company-size selector on mobile and an error that clears the needs description. More traffic alone cannot establish these as the sole causes of lower conversion.',
    ),
    [
      [
        t('首次申请', 'First request'),
        t(
          '必填姓名、邮箱、需求；电话可选',
          'Require name, email and need; phone optional',
        ),
        t(
          '空电话可以提交；说明后续联系用途',
          'Allow an empty phone and explain follow-up use',
        ),
      ],
      [
        t('邮箱格式错误', 'Invalid email'),
        t(
          '字段旁提示，保留其他输入',
          'Show inline feedback and retain other fields',
        ),
        t(
          '修正邮箱后无需重写需求',
          'Correct email without retyping the request',
        ),
      ],
      [
        t('网络超时', 'Network timeout'),
        t(
          '保留内容与提交编号，允许重试',
          'Keep content and submission ID for retry',
        ),
        t('同一提交不生成两条线索', 'A retry must not create two leads'),
      ],
      [
        t('已受理', 'Accepted'),
        t(
          '给出确认编号和预计回复窗口',
          'Show a confirmation ID and response window',
        ),
        t(
          '不显示已经安排演示或已发邮件的假状态',
          'Do not claim a scheduled meeting or sent email without evidence',
        ),
      ],
    ],
    t(
      '文案建议：“告诉我们团队目前如何管理客户，以及最希望改善的一件事。”提交按钮为“申请演示”。成功页说明下一步是团队联系确认时间，不自动承诺当天安排。手机端按 360 和 390 宽度检查键盘打开后的提交按钮与错误提示。',
      'Suggested prompt: “How does your team manage customers today, and what is the first thing you want to improve?” Use “Request a demo.” The confirmation explains that the team will arrange a time, without promising a same-day meeting. Check 360 and 390 widths with the keyboard open, including the submit button and error feedback.',
    ),
    t(
      '表单走查与转化归因分开；公开演示不会发送真实邮件或安排会议。',
      'Form checks and conversion attribution remain separate. The public demo sends no real email and schedules no meeting.',
    ),
    t(
      '成功提示写成“邮件已发送”但这里只有模拟记录。改成申请已记录，保留确认编号。',
      'The success copy says email sent, but only a simulated record exists. Say the request was recorded and retain its confirmation ID.',
    ),
    t(
      '已修改成功文案，并补上超时重试不重复建线索的检查。',
      'Updated the confirmation and added the retry-without-duplicate-lead check.',
    ),
  ),
};
