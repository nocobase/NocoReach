import type { DemoContent } from './content.js';
import type { EditorialStory } from './editorial.js';
import { t, type L, type Page } from './world/script/types.js';

/** Shared narrative anchors for CRM tasks, source discussions and the website. */
export const CRM_STORIES: readonly EditorialStory[] = [
  {
    key: 'crm-import',
    owner: 'admin',
    path: '/docs/import',
    state: 'review',
    title: t(
      '给 1,280 条客户导入补重复记录预览',
      'Add a duplicate preview to the 1,280-account import guide',
    ),
    brief: t(
      '虚构经销商的表格有 1,280 行，其中 86 行重复、14 行缺少负责人。先演示二十行试导，解释重复公司与同名联系人的区别，交付一份错误处理清单。',
      'A fictional distributor has 1,280 rows, including 86 duplicates and 14 missing owners. Rehearse twenty rows, distinguish duplicate companies from contacts with the same name and deliver an error-handling checklist.',
    ),
    comments: [
      [
        'content',
        t(
          '先保留原始行号，合并时不要丢掉历史跟进。',
          'Keep original row numbers and preserve activity history when merging.',
        ),
      ],
      [
        'editor',
        t(
          '把“自动合并全部”改为逐组确认，补一次撤销示例。',
          'Replace “merge everything automatically” with group-by-group review and an undo example.',
        ),
      ],
    ],
    draft: t(
      '# 客户导入核对表\n\n1. 备份原始文件，保留来源行号。\n2. 先试导 20 行，核对负责人和日期。\n3. 86 条候选重复逐组确认，14 条未分配记录进入待认领队列。\n4. 检查合并后的联系人、跟进历史和撤销记录。\n\n这些数量是演示样本，不是实际客户数据。',
      '# Account import checklist\n\n1. Back up the source and retain row IDs.\n2. Rehearse 20 rows and verify owners and dates.\n3. Review 86 candidate duplicates individually; send 14 unassigned rows to the claim queue.\n4. Check contacts, activities and undo history after merging.\n\nCounts are fictional demo samples.',
    ),
  },
  {
    key: 'crm-routing',
    path: '/docs/lead-routing',
    state: 'doing',
    title: t(
      '重写跨区域线索分配和请假替补规则',
      'Rewrite regional lead routing and leave coverage',
    ),
    brief: t(
      '周一新增的 37 条演示线索中，6 条没有地区、3 条落到请假销售。先写地区缺失时的公共队列，再写替补人和两小时未认领升级规则。',
      'Of 37 sample Monday leads, six lack a region and three reached a rep on leave. Explain the shared queue, cover owner and escalation after two unclaimed hours.',
    ),
    comments: [
      [
        'growth',
        t(
          '轮询分配不能绕过区域限制；替补人也要有访问权限。',
          'Round robin must respect territories; cover reps also need access.',
        ),
      ],
      [
        'content',
        t(
          '我用一条无地区线索跑完整时间线。',
          'I will follow one regionless lead through the whole timeline.',
        ),
      ],
    ],
  },
  {
    key: 'crm-pipeline',
    owner: 'editor',
    path: '/features/pipeline',
    state: 'review',
    title: t(
      '把“意向强”改成可验证的销售阶段',
      'Replace “strong interest” with verifiable sales stages',
    ),
    brief: t(
      '虚构五人团队对同一商机的阶段判断不同。用“已确认需求、已发报价、已确认采购流程”替换主观标签；每阶段说明进入条件和下一步负责人。',
      'Five fictional reps disagree on the same deal stage. Replace subjective labels with confirmed needs, quote sent and purchasing process confirmed; name entry evidence and the next owner.',
    ),
    comments: [
      [
        'content',
        t(
          '销售说预算只能填区间，不能要求首次通话就给精确金额。',
          'Reps can give a budget range, not an exact amount on the first call.',
        ),
      ],
      [
        'editor',
        t(
          '保留区间，同时把“预算未确认”做成显式状态。',
          'Keep ranges and explicitly mark budgets that are still unconfirmed.',
        ),
      ],
    ],
    draft: t(
      '# 销售阶段示例\n\n| 阶段 | 进入证据 | 下一步 |\n| --- | --- | --- |\n| 需求确认 | 客户确认问题与参与人 | 预约方案沟通 |\n| 报价发出 | 报价版本与发送日期 | 确认采购流程 |\n| 合同评审 | 采购人与审批节点已知 | 记录待解决条款 |\n\n停留超过 14 天只触发复核，不自动标为输单。',
      '# Example sales stages\n\n| Stage | Entry evidence | Next action |\n| --- | --- | --- |\n| Needs confirmed | Problem and participants confirmed | Book solution review |\n| Quote sent | Quote version and sent date | Confirm purchasing process |\n| Contract review | Buyer and approvals known | Record unresolved clauses |\n\nFourteen days without movement triggers review, not an automatic loss.',
    ),
  },
  {
    key: 'crm-quote',
    path: '/docs/quotes',
    state: 'doing',
    rejected: true,
    title: t(
      '补齐报价打折后的审批与版本记录',
      'Add approval and version history for discounted quotes',
    ),
    brief: t(
      '一笔虚构报价从 48,000 元改为 43,200 元，旧 PDF 仍附在邮件里。说明折扣审批、版本作废和重新发送过程，禁止默认审批人直接修改销售报价。',
      'A fictional quote changes from 48,000 to 43,200 while the old PDF remains attached. Document discount approval, superseded versions and resending without implying reviewers edit the quote themselves.',
    ),
    comments: [
      [
        'editor',
        t(
          '上一稿没说客户收到哪个版本，退回补充。',
          'The previous draft never said which version the customer received; please revise.',
        ),
      ],
      [
        'content',
        t(
          '加入 V1 作废、V2 待审批、V2 已发送三个时间点。',
          'Added V1 superseded, V2 pending approval and V2 sent timestamps.',
        ),
      ],
    ],
    draft: t(
      '# 报价版本 · 修订中\n\nV1：48,000 元，已发送。V2：43,200 元，折扣 10%，待主管审核。\n\n审批后生成新的 PDF，并保留旧版作废标记。发送前核对附件版本与收件人，发送结果另外记录。',
      '# Quote versions · revision\n\nV1: 48,000, sent. V2: 43,200, a 10% discount, awaiting manager review.\n\nAfter approval, create a new PDF and retain the superseded marker on V1. Check attachment version and recipient before sending; record delivery separately.',
    ),
  },
  {
    key: 'crm-permissions',
    path: '/docs/permissions',
    state: 'done',
    outcome: 'up',
    title: t(
      '验证销售只能看本人客户的三个入口',
      'Verify own-account access through three entry points',
    ),
    brief: t(
      '指南增加列表、直达详情与导出三种验证。主管看团队数据，临时协作只开放指定客户，样例搜索点击上升后仍需区分教程访问与实际启用。',
      'The guide now verifies lists, direct detail links and exports. Managers see their team; temporary collaborators see specified accounts. Increased tutorial clicks do not prove adoption.',
    ),
    comments: [
      [
        'content',
        t(
          '普通销售复制其他组详情链接时应拒绝访问。',
          'A rep copying another team’s detail URL should be refused.',
        ),
      ],
      [
        'editor',
        t(
          '三项验证记录齐全，保留“演示结果”标记。',
          'All three checks are recorded; retain the demo-result label.',
        ),
      ],
    ],
    draft: t(
      '# 客户可见范围\n\n销售：本人负责的客户；主管：所在团队；临时协作：明确授权的单个客户。\n\n用三个账号分别核对列表、详情与导出。撤销协作后再次测试旧链接，不能只看菜单消失。',
      '# Account visibility\n\nReps: owned accounts. Managers: their team. Temporary collaborators: specifically shared accounts.\n\nVerify lists, detail links and exports with three accounts. After revoking collaboration, test old links again; a hidden menu is insufficient.',
    ),
  },
  {
    key: 'crm-follow-up',
    path: '/docs/follow-ups',
    state: 'done',
    outcome: 'up',
    title: t(
      '把跟进提醒改成可执行的下一步',
      'Make follow-up reminders describe an actionable next step',
    ),
    brief: t(
      '演示销售常写“下周联系”。改为具体日期、沟通目标与负责人，并把超期与暂停联系分开。观察提醒指南访问和示例完成情况。',
      'Sample reps often write “contact next week.” Add a date, purpose and owner, and distinguish overdue work from paused contact. Observe guide visits and exercise completion.',
    ),
    comments: [
      [
        'growth',
        t(
          '客户要求下月再联系时，不该每天被标红。',
          'A customer asking for next-month contact should not turn red every day.',
        ),
      ],
      [
        'content',
        t('已增加暂停原因和恢复日期。', 'Added pause reason and resume date.'),
      ],
    ],
    draft: t(
      '# 一条有用的下一步\n\n在约定跟进日，由负责人确认演示参与人；完成后记录结果与下一日期。客户暂停时写明原因和恢复日期。提醒只是帮助跟进，不能代替客户确认。',
      '# A useful next step\n\nOn the agreed follow-up date, the owner confirms demo participants, then records the outcome and next date. For paused contact, record a reason and resume date. A reminder does not replace customer confirmation.',
    ),
  },
  {
    key: 'crm-pricing',
    path: '/pricing',
    state: 'done',
    outcome: 'down',
    title: t(
      '复盘价格页简化后预约量下降',
      'Review fewer bookings after simplifying pricing',
    ),
    kind: 'research',
    brief: t(
      '删除实施服务说明后访问增加但预约减少。访谈样例显示读者不知道数据迁移是否收费；按新访客与回访客拆分，补问答后继续观察。',
      'Visits rose but bookings fell after implementation details were removed. Sample interviews show uncertainty about migration fees. Split new and returning visitors and test a revised FAQ.',
    ),
    comments: [
      [
        'growth',
        t(
          '不能直接归因于价格，先核对预约事件有没有漏报。',
          'Do not blame price before checking booking-event completeness.',
        ),
      ],
      [
        'editor',
        t(
          '报告保留埋点与内容两种解释，避免只选支持改稿的证据。',
          'Retain both tracking and content explanations rather than selecting favorable evidence.',
        ),
      ],
    ],
    draft: t(
      '# 价格页复盘\n\n访问增加与预约下降同时发生，不能证明价格导致流失。先核对预约成功事件，再补充迁移、培训与托管服务边界。按相同星期比较，保留未预约访客的反馈。',
      '# Pricing review\n\nMore visits and fewer bookings do not prove price caused abandonment. Verify booking events, then clarify migration, training and hosting scope. Compare matching weekdays and retain feedback from visitors who did not book.',
    ),
  },
  {
    key: 'crm-forecast',
    path: '/docs/forecast',
    state: 'done',
    outcome: 'flat',
    title: t(
      '修正销售预测里把概率当承诺的解释',
      'Correct the forecast guide’s probability-as-promise wording',
    ),
    brief: t(
      '将 60% 概率改为历史分组统计的说明，并展示滑单案例。内容已完成，搜索结果暂时没有明显变化，下一轮观察读者能否解释计算口径。',
      'Explain 60% as a historical cohort estimate and show a slipped deal. The content is complete; search results remain flat, so test whether readers understand the calculation.',
    ),
    comments: [
      [
        'content',
        t(
          '预计金额和签约金额用不同列，避免求和混在一起。',
          'Separate forecast and signed amounts so totals are not mixed.',
        ),
      ],
      [
        'editor',
        t('通过，保留无明显变化的结果。', 'Approved; retain the flat result.'),
      ],
    ],
    draft: t(
      '# 预测不是承诺\n\n按阶段概率计算加权金额，同时列出未加权管道金额、已签金额与滑单。每周固定时间截取快照，不能用今天的阶段倒推上周预测。',
      '# Forecasts are not promises\n\nShow stage-weighted amount beside unweighted pipeline, signed amount and slipped deals. Capture a weekly snapshot; today’s stages cannot reconstruct last week’s forecast.',
    ),
  },
  {
    key: 'crm-search',
    path: '/blog/crm-for-small-teams',
    state: 'review',
    kind: 'research',
    title: t(
      '区分“免费 CRM”搜索里的三类需求',
      'Separate three intents behind “free CRM” searches',
    ),
    brief: t(
      '样例访谈分别来自五人创业团队、已有服务器的实施顾问和正在替换表格的主管。区分软件费用、托管成本与迁移成本，不用一句“免费”概括。',
      'Sample interviews cover a five-person startup, a consultant with servers and a manager replacing spreadsheets. Separate software, hosting and migration costs rather than summarizing all as free.',
    ),
    comments: [
      [
        'growth',
        t(
          '落地页首屏先回答是否需要自己维护服务器。',
          'Answer server-maintenance responsibility in the landing-page opening.',
        ),
      ],
      [
        'editor',
        t(
          '三类需求分别配入口，不做所有团队都适用的承诺。',
          'Give each intent its own entry point without promising a fit for everyone.',
        ),
      ],
    ],
    draft: t(
      '# 小团队 CRM 需求摘要\n\n1. 当天可用：优先了解托管与导入服务。\n2. 自行维护：先读部署、备份与升级责任。\n3. 替换表格：先验证客户、联系人和商机关系。\n\n这是虚构访谈摘要，不能代表市场占比。',
      '# Small-team CRM research\n\n1. Ready today: hosting and import help.\n2. Self-managed: deployment, backups and upgrade responsibility.\n3. Replacing sheets: account, contact and deal relationships first.\n\nFictional interview notes do not establish market shares.',
    ),
  },
  {
    key: 'crm-forum-handoff',
    path: '/docs/handover',
    state: 'doing',
    title: t(
      '回复客户转交后提醒仍发给原负责人的问题',
      'Answer why reminders still reach the previous account owner',
    ),
    brief: t(
      '论坛样例里客户已转交，但未完成的跟进任务仍保留旧负责人。回复要区分客户归属与任务归属，给出批量核对步骤，不能声称已自动修复用户数据。',
      'A sample forum account was transferred while open follow-ups kept their old owners. Distinguish account and task ownership and provide a reconciliation checklist without claiming to fix user data.',
    ),
    comments: [
      [
        'content',
        t(
          '已复现“客户已转交、任务未转交”组合。',
          'Reproduced transferred account with untransferred tasks.',
        ),
      ],
      [
        'growth',
        t(
          '请对方先导出待办清单，确认范围后再操作。',
          'Ask for an open-task export and confirmation of scope before changes.',
        ),
      ],
    ],
  },
  {
    key: 'crm-renewal',
    path: '/docs/renewals',
    state: 'done',
    outcome: 'insufficient',
    title: t(
      '为续约提醒补齐 90／60／30 天时间线',
      'Add a 90/60/30-day renewal timeline',
    ),
    brief: t(
      '新上线指南只有三天样例数据，演示 90 天确认价值、60 天核对用量、30 天确认合同。遇到取消自动续约时停止发送相应提醒。',
      'The new guide has only three days of sample data. At 90 days confirm value, at 60 review usage, and at 30 confirm terms. Stop applicable reminders when auto-renewal is cancelled.',
    ),
    comments: [
      [
        'content',
        t(
          '补了停用和恢复，不再只有正常续约一路。',
          'Added cancellation and resumption, not only the happy renewal path.',
        ),
      ],
      [
        'growth',
        t(
          '样本不足，本周不要写转化提升。',
          'The sample is too small to claim conversion improvement this week.',
        ),
      ],
    ],
    draft: t(
      '# 续约准备\n\n90 天：确认业务价值与决策人。60 天：核对使用和新增需求。30 天：复核合同、报价和采购节点。\n\n停止续约的客户保留原因与交接记录，不继续推送自动提醒。',
      '# Renewal preparation\n\n90 days: confirm value and decision maker. 60 days: review usage and new needs. 30 days: check terms, quote and procurement milestones.\n\nRetain cancellation reasons and handover notes; stop automatic reminders for cancelled renewals.',
    ),
  },
  {
    key: 'crm-mobile',
    path: '/features/mobile',
    state: 'done',
    outcome: 'waiting',
    title: t(
      '观察拜访记录手机端指南的新版本',
      'Observe the new mobile visit-notes guide',
    ),
    brief: t(
      '新版演示先保存文字再上传照片，弱网时保留草稿。目前只有两天数据，等待七天窗口，同时人工检查上传失败提示。',
      'The new demo saves text before uploading photos and preserves drafts on weak connections. Only two days exist; wait seven days and manually check upload-error messages.',
    ),
    comments: [
      [
        'content',
        t(
          '地铁场景下断网重试已加进操作步骤。',
          'Added retry steps for a lost connection on a train.',
        ),
      ],
      [
        'editor',
        t(
          '暂不宣称完全离线可用，范围只覆盖草稿保留。',
          'Do not promise full offline operation; the scope is draft retention.',
        ),
      ],
    ],
  },
  {
    key: 'crm-dashboard',
    owner: 'admin',
    path: '/features/reports',
    state: 'todo',
    title: t(
      '给周会仪表盘补口径说明和异常商机清单',
      'Add definitions and exception deals to the weekly dashboard',
    ),
    brief: t(
      '主管要知道“本月新增”按创建日期还是首次联系计算。页面需说明金额币种、时区和输单排除规则，并展示长期不动的商机。',
      'The manager asks whether “new this month” means created or first contacted. Explain currency, time zone and lost-deal exclusions, and show stalled deals.',
    ),
    comments: [
      [
        'growth',
        t(
          '汇总数字应该能点回同一筛选条件的明细。',
          'Totals should link to details with the same filters.',
        ),
      ],
      [
        'content',
        t(
          '拿周一快照做例子，避免周会中数字不断变动。',
          'Use Monday’s snapshot so numbers do not change during the meeting.',
        ),
      ],
    ],
  },
  {
    key: 'crm-loss-review',
    owner: 'growth',
    path: '/blog/lost-deals',
    state: 'todo',
    kind: 'research',
    title: t(
      '拆解“价格太贵”背后的输单原因',
      'Investigate what “too expensive” means in lost deals',
    ),
    brief: t(
      '12 条演示输单中 7 条填写价格原因，但备注提到预算冻结、上线延期和缺少集成。先核对事实，再整理可操作的原因分类，不把所有输单推给价格。',
      'Seven of twelve sample losses say price, but notes mention frozen budgets, delayed launches and missing integrations. Verify facts before designing actionable categories.',
    ),
    comments: [
      [
        'growth',
        t(
          '保留“客户未说明”，不要强迫销售猜一个原因。',
          'Keep “customer did not say”; do not force a guess.',
        ),
      ],
      [
        'content',
        t(
          '准备三个追问示例，避免像盘问客户。',
          'Preparing three follow-up examples that do not sound like an interrogation.',
        ),
      ],
    ],
  },
  {
    key: 'crm-email-history',
    path: '/docs/email',
    state: 'doing',
    title: t(
      '说明共享邮箱与私人邮件的可见边界',
      'Explain shared-mailbox and private-email visibility',
    ),
    brief: t(
      '样例销售把私人邮箱接入后担心历史邮件被全员查看。文档需列出同步范围、匹配客户规则和撤回访问方式，并使用虚构邮件内容。',
      'A sample rep worries that linking a personal mailbox exposes old messages. Document sync scope, account matching and access revocation using fictional emails.',
    ),
    comments: [
      [
        'editor',
        t(
          '不要承诺所有邮件提供商都支持相同的撤回行为。',
          'Do not promise identical revocation behavior across all providers.',
        ),
      ],
      [
        'content',
        t(
          '增加同步前预览，正文样例全部重新编写。',
          'Added a pre-sync preview and entirely fictional message bodies.',
        ),
      ],
    ],
  },
  {
    key: 'crm-contact-form',
    owner: 'admin',
    path: '/contact',
    state: 'review',
    title: t(
      '给预约演示表单增加时区和确认步骤',
      'Add time zones and confirmation to demo bookings',
    ),
    brief: t(
      '两位虚构访客把上午九点理解成各自当地时间。表单需展示明确时区、确认邮件示例以及改期入口；不要在提交成功时承诺已确认会议。',
      'Two fictional visitors interpret 9 a.m. in different time zones. Show an explicit zone, confirmation-email example and rescheduling entry; submission alone does not confirm a meeting.',
    ),
    comments: [
      [
        'growth',
        t(
          '手机号改为选填，先观察表单完成率。',
          'Make phone optional and observe completion.',
        ),
      ],
      [
        'editor',
        t(
          '成功页区分“已收到预约”与“时间已确认”。',
          'Distinguish request received from meeting confirmed.',
        ),
      ],
    ],
    draft: t(
      '# 预约确认\n\n提交时显示日期、时间和时区，邮箱必填，手机号选填。成功页说明已收到请求，会议以确认邮件为准。改期链接应保留原预约编号。',
      '# Booking confirmation\n\nDisplay date, time and zone. Require email and make phone optional. The success page acknowledges the request; the confirmation email establishes the meeting. Rescheduling retains the booking reference.',
    ),
  },
  {
    key: 'crm-quick-start',
    path: '/docs/quick-start',
    state: 'done',
    title: t(
      '完成五人团队第一周上线清单',
      'Complete the first-week checklist for a five-person team',
    ),
    brief: t(
      '从建立三个示例客户开始，逐步验证联系人、商机、下次跟进与主管视图。已完成内容核对，但未设置效果观察，不补写增长数字。',
      'Start with three sample accounts and verify contacts, deals, next actions and the manager view. Content review is complete; no effect observation was configured, so do not invent growth numbers.',
    ),
    comments: [
      [
        'content',
        t(
          '五个账号都走过一遍，截图已去掉真实姓名。',
          'All five accounts completed the exercise; screenshots contain no real names.',
        ),
      ],
      [
        'editor',
        t(
          '验收通过，后续效果另设观察任务。',
          'Approved; effect monitoring belongs to a separate follow-up.',
        ),
      ],
    ],
    draft: t(
      '# 第一周上线清单\n\n周一：建三个示例客户。周二：分配负责人并验证权限。周三：导入二十行。周四：建立商机和跟进。周五：主管核对漏斗与待办。\n\n每一步都能暂停和复核，不要求一次迁移全部历史数据。',
      '# First week checklist\n\nMonday: create three sample accounts. Tuesday: assign owners and verify access. Wednesday: import twenty rows. Thursday: add deals and next actions. Friday: review pipeline and open work.\n\nPause and verify each step; a complete historical migration is not required.',
    ),
  },
  {
    key: 'crm-ai-scoring',
    path: '/features/pipeline',
    state: 'todo',
    cancelled: true,
    title: t(
      '取消缺少验证数据的 AI 赢单预测宣传稿',
      'Cancel the AI win-prediction article without validation data',
    ),
    brief: t(
      '样例提案希望用十条历史商机宣称预测准确率 95%。数据量与验证方法都不支持该结论，取消宣传稿，保留需求问题供后续研究。',
      'A sample proposal claims 95% accuracy from ten historical deals. Neither sample size nor validation supports it. Cancel the promotional draft and retain the research question.',
    ),
    comments: [
      [
        'editor',
        t(
          '没有独立验证集，不能发布准确率承诺。',
          'There is no independent validation set; do not publish an accuracy promise.',
        ),
      ],
      [
        'growth',
        t(
          '同意取消，先把阶段信息维护好。',
          'Agreed; improve stage data quality first.',
        ),
      ],
    ],
  },
  {
    key: 'crm-old-import',
    path: '/docs/import',
    state: 'done',
    archived: true,
    title: t(
      '归档旧版 CSV 编码排障说明',
      'Archive the old CSV encoding troubleshooting note',
    ),
    brief: t(
      '旧说明只适用于已退役的导入器。保留历史讨论和归档原因，入口改指向当前导入指南，避免两份相互矛盾的教程同时出现。',
      'The old note applies only to the retired importer. Preserve its discussion and archive reason, and direct readers to the current guide rather than leaving conflicting instructions.',
    ),
    comments: [
      [
        'content',
        t(
          '新指南已覆盖 UTF-8 与 Excel 导入，不再维护旧截图。',
          'The current guide covers UTF-8 and Excel; old screenshots are retired.',
        ),
      ],
      [
        'editor',
        t(
          '保留归档记录，方便追溯旧链接。',
          'Keep the archive record so old links remain explainable.',
        ),
      ],
    ],
  },
  {
    key: 'crm-integrations',
    path: '/docs/integrations',
    state: 'todo',
    title: t(
      '写清订单回传失败后的重试与去重',
      'Explain retries and de-duplication for failed order callbacks',
    ),
    brief: t(
      '演示电商订单回传在超时后重复发送，生成两条跟进。教程需说明事件编号、幂等处理和人工重放清单，并区分“收到请求”与“处理完成”。',
      'A sample order callback retries after a timeout and creates duplicate activities. Explain event IDs, idempotency and manual replay, distinguishing received from processed.',
    ),
    comments: [
      [
        'growth',
        t(
          '先用沙箱订单演练，不调用真实支付服务。',
          'Rehearse with sandbox orders without contacting real payment services.',
        ),
      ],
      [
        'content',
        t(
          '会包含超时、重复与乱序三类样例。',
          'Including timeout, duplicate and out-of-order examples.',
        ),
      ],
    ],
  },
];

const DOCUMENTS: readonly [string, L, L][] = [
  [
    'positioning',
    t('产品定位与适用边界', 'Positioning and scope'),
    t(
      'Acme CRM 是虚构的销售协作产品，面向五到五十人的团队。核心是客户、联系人、商机与跟进；演示中的价格、指标和用户反馈均不代表真实产品。自建部署需要团队承担维护责任，不承诺一键迁移所有历史系统。',
      'Acme CRM is a fictional sales collaboration product for teams of five to fifty. It centers on accounts, contacts, deals and follow-ups. Prices, metrics and feedback are synthetic. Self-hosting requires maintenance; no universal one-click migration is promised.',
    ),
  ],
  [
    'personas',
    t('销售团队角色与日常问题', 'Sales roles and everyday needs'),
    t(
      '销售每天确认待办与客户下一步；主管每周核对阶段、停滞商机与预测；运营负责来源字段和导入质量。虚构客户“青屿设备”有五名销售，“远帆服务”有两个区域团队。前者关注第一周上线，后者关注转交和跨区权限。',
      'Reps review next actions daily, managers review stalled deals and forecasts weekly, and operations owns source fields and imports. Fictional Northbay Equipment has five reps; Horizon Services has two regional teams. Their priorities are first-week setup and regional handovers respectively.',
    ),
  ],
  [
    'stages',
    t('销售阶段与统计口径', 'Sales stages and metric definitions'),
    t(
      '阶段依次为待确认、需求确认、方案沟通、报价发出、合同评审、赢单或输单。进入条件必须有客户证据。新增按创建时间计，赢单按签约时间计；币种分开汇总，概率加权金额不等于承诺收入。周会使用固定快照。',
      'Stages are unqualified, needs confirmed, solution review, quote sent, contract review, won or lost. Evidence is required. New deals use creation time, wins use signing time and currencies are summarized separately. Weighted value is not committed revenue. Weekly reviews use a fixed snapshot.',
    ),
  ],
  [
    'migration',
    t('导入与去重演练手册', 'Import and de-duplication rehearsal'),
    t(
      '保留原始文件与行号，先试二十行。以公司标识核对客户，联系人另行判断；同名不能直接合并。负责人不存在时进入待认领队列。合并前检查历史跟进、商机与附件，记录撤销办法。样例中的 1,280 行、86 条重复和 14 条未分配均为虚构。',
      'Keep source files and row numbers and rehearse twenty rows. Match accounts by company identifiers and assess contacts separately; identical names do not establish duplicates. Missing owners enter the claim queue. Check activities, deals and attachments before merging and record undo steps. The 1,280 rows, 86 duplicates and 14 unassigned records are fictional.',
    ),
  ],
  [
    'voice',
    t('内容语气与禁用承诺', 'Editorial voice and unsupported promises'),
    t(
      '用销售能采取的动作解释功能：谁在什么时间做什么、出现例外怎么办。避免“永不丢单”“预测准确率 95%”“所有邮件自动同步”。引用反馈需标注虚构，样本不足时明确暂不能判断。对比页面优先说明部署和责任边界。',
      'Explain who does what, when, and what happens on exceptions. Avoid “never lose a deal,” “95% prediction accuracy” and “all emails sync automatically.” Label fictional feedback and state insufficient evidence. Comparison pages explain deployment and responsibility first.',
    ),
  ],
  [
    'calendar',
    t('未来四周的内容安排', 'Four-week editorial schedule'),
    t(
      '第一周完成导入与权限复核；第二周发布阶段定义和报价版本示例；第三周验证移动拜访与预约表单；第四周复盘续约指南和价格页。每周留一个机动位置处理社区问题，延期时记录原因与新的负责人。',
      'Week one: imports and permissions. Week two: stages and quote versions. Week three: mobile visits and booking forms. Week four: renewal and pricing reviews. Reserve one slot each week for community issues and record delay reasons and new owners.',
    ),
  ],
  [
    'measurement',
    t('观察窗口与结果解读', 'Observation windows and result interpretation'),
    t(
      '内容完成不等于发布，发布不等于产生效果。至少比较同星期七天窗口；新增页面样本小可标记数据不足。预约成功事件与表单提交分开统计，按设备和新老访客拆分。保留上升、下降、持平、等待及无观察结果。',
      'Content completion, publication and effect are separate. Compare matching seven-day windows; small new-page samples may be insufficient. Track confirmed bookings separately from submissions and split by device and visitor cohort. Preserve increases, declines, flat results, waiting and no observation.',
    ),
  ],
  [
    'handover',
    t('客户转交与隐私检查', 'Account handover and privacy checks'),
    t(
      '客户转交时逐项核对联系人、未完成任务、报价、附件和邮件访问。客户负责人变化不自动表示任务都已转交。撤销旧协作权限后验证直达链接与导出。公开案例不得使用真实邮箱、电话、合同或客户姓名。',
      'A handover reviews contacts, open tasks, quotes, attachments and email access. A new account owner does not imply tasks were transferred. After revoking access, verify direct links and exports. Public examples contain no real emails, phone numbers, contracts or customer names.',
    ),
  ],
];

export function crmDocuments(language: string): DemoContent['documents'] {
  const lang = language === 'en-US' ? 'en' : 'zh';
  return DOCUMENTS.map(([key, title, text]) => ({
    key,
    title: title[lang],
    text: text[lang],
    category:
      key === 'personas'
        ? 'customer'
        : key === 'measurement'
          ? 'industry'
          : key === 'positioning'
            ? 'product'
            : 'other',
  }));
}

/** Public-facing copy, separate from the team's task instructions. */
export const CRM_PAGES: readonly Page[] = [
  [
    '/docs/lead-routing',
    t('线索分配与请假替补', 'Lead routing and leave coverage'),
    t(
      '按地区分配线索，缺少地区时进入待认领队列。请假替补需要相同的数据访问权限。两小时未认领时通知主管，同时保留原始来源与分配记录。',
      'Route leads by region and place unknown regions in a claim queue. Cover reps need the same data access. Escalate after two unclaimed hours while retaining source and routing history.',
    ),
  ],
  [
    '/docs/quotes',
    t('报价版本与折扣审批', 'Quote versions and discount approval'),
    t(
      '每次报价修改生成新的版本记录，旧版保留作废说明。折扣超出约定范围时交主管审核，批准后再生成附件与发送记录。',
      'Record a new quote version on each revision and keep superseded notes. Discounts outside the agreed range need manager review before attachment generation and delivery.',
    ),
  ],
  [
    '/docs/permissions',
    t('客户数据权限指南', 'Account access guide'),
    t(
      '销售查看本人客户，主管查看团队客户。临时协作逐个客户授权；分别验证列表、详情链接与导出，撤销后再次核对旧链接。',
      'Reps see owned accounts and managers see their team. Share temporary access per account; verify lists, detail links and exports, including old links after revocation.',
    ),
  ],
  [
    '/docs/follow-ups',
    t('下一步跟进与暂停联系', 'Next actions and paused contact'),
    t(
      '每项跟进写明目标、时间与负责人。客户要求暂停时记录原因和恢复日期，超期提醒与暂停状态分别处理，避免反复打扰客户。',
      'Each next action names a purpose, time and owner. Record a pause reason and resume date when requested. Treat overdue and paused work separately to avoid repeated unwanted contact.',
    ),
  ],
  [
    '/docs/forecast',
    t('销售预测与每周快照', 'Sales forecasts and weekly snapshots'),
    t(
      '分别查看未加权商机金额、按阶段加权金额和已签合同金额。保留每周预测快照与滑单原因，不用今天的数据重写过去的判断。',
      'Separate unweighted deals, stage-weighted values and signed contracts. Retain weekly forecasts and reasons for slippage rather than rewriting old estimates with current data.',
    ),
  ],
  [
    '/docs/handover',
    t('客户转交检查表', 'Account handover checklist'),
    t(
      '转交客户后核对联系人、跟进任务、报价和协作权限。记录接收人确认与尚未移交的事项；旧负责人不再需要访问时及时撤销共享。',
      'After an account transfer, review contacts, follow-ups, quotes and shared access. Record acceptance and outstanding work; revoke the previous owner’s shared access when no longer needed.',
    ),
  ],
  [
    '/docs/renewals',
    t('续约准备时间线', 'Renewal preparation timeline'),
    t(
      '续约前 90 天确认价值与决策人，60 天核对用量与需求，30 天检查合同和采购节点。取消续约时停止相应自动提醒并保留原因。',
      'At 90 days confirm value and decision makers, at 60 review usage and needs, and at 30 check terms and procurement. Cancel applicable reminders when renewal stops and retain the reason.',
    ),
  ],
  [
    '/features/mobile',
    t('手机端拜访记录', 'Mobile visit notes'),
    t(
      '拜访后先记录沟通要点和下一步，再上传照片。网络不稳定时保存草稿并显示上传状态；保留草稿不代表所有功能都能离线运行。',
      'Capture discussion points and next actions before uploading photos. Keep drafts and show upload status on unstable networks; draft retention does not mean all features work offline.',
    ),
  ],
  [
    '/features/reports',
    t('销售周会报表', 'Weekly sales reports'),
    t(
      '从汇总数字进入相同筛选条件的明细，检查停滞商机、未分配客户和即将续约合同。报表显示时间范围、时区和币种，避免不同口径直接相加。',
      'Open matching detail filters from totals to review stalled deals, unassigned accounts and upcoming renewals. Reports specify period, time zone and currency so incompatible totals are not combined.',
    ),
  ],
  [
    '/blog/lost-deals',
    t('从输单备注发现下一步', 'Find next actions in lost-deal notes'),
    t(
      '“价格太贵”可能对应预算冻结、上线延期或缺少集成。保留客户原话与“未说明”状态，核对事实后再设计改善行动。',
      '“Too expensive” may mean frozen budgets, delayed deployment or missing integrations. Keep customer wording and “not specified,” then verify facts before selecting actions.',
    ),
  ],
  [
    '/docs/email',
    t('邮件同步范围与可见性', 'Email sync scope and visibility'),
    t(
      '连接邮箱前预览同步范围，核对邮件如何匹配客户以及谁能查看正文。撤销访问后验证旧入口；不同提供商的同步与撤回行为需要分别确认。',
      'Preview sync scope before connecting a mailbox and check account matching and body visibility. After revoking access, verify old entry points; confirm sync and revocation behavior per provider.',
    ),
  ],
  [
    '/docs/integrations',
    t('订单回传与幂等重试', 'Order callbacks and idempotent retries'),
    t(
      '使用事件编号识别重复回传，分别记录接收、处理中和完成。超时后从确认点重试，人工重放前核对已处理事件，避免重复创建跟进任务。',
      'Use event IDs to detect duplicate callbacks and distinguish received, processing and complete. Resume from a confirmed checkpoint after timeouts and check processed IDs before manual replay.',
    ),
  ],
].map(([path, title, text], i) => ({
  path: path as string,
  title: title as L,
  description: text as L,
  sections: [[t('操作与核对', 'Steps and checks'), text as L]],
  weight: i === 6 ? 0.015 : 0.8 + (i % 4) * 0.35,
  published: i === 6 ? 12 : 690 - i * 11,
  updated: i === 7 ? 2 : 14,
  ...(i === 6
    ? {
        changes: [{ kind: 'launch' as const, at: 12, ramp: 7 }],
        index: 'discovered' as const,
      }
    : {}),
  links: ['/docs/quick-start', '/docs/import', '/contact'],
}));

export function crmOpportunities(
  language: string,
): DemoContent['opportunities'] {
  const lang = language === 'en-US' ? 'en' : 'zh';
  const copy = (value: L) => value[lang];
  const selected = [0, 1, 2, 3, 12, 14, 15, 19, 8, 9, 17, 13];
  const observations = [
    t(
      '导入相关搜索展示增加，社区仍反复询问重复联系人该如何合并。',
      'Import impressions rose while the community keeps asking how to merge duplicate contacts.',
    ),
    t(
      '无地区线索与请假分配的问题在样例讨论中同时出现。',
      'Unknown territories and routing to absent reps appear together in sample discussions.',
    ),
    t(
      '漏斗页有访问，但访谈中五名销售给同一商机选择了不同阶段。',
      'The pipeline page receives visits, but five interviewed reps selected different stages for the same deal.',
    ),
    t(
      '报价版本问题有两条未解决提问，错误附件会影响采购沟通。',
      'Two unresolved quote-version questions highlight the risk of sending the wrong attachment.',
    ),
    t(
      '报表页的说明偏短，主管无法核对“本月新增”的日期口径。',
      'The report page is too brief to verify the date definition of new deals this month.',
    ),
    t(
      '邮件接入讨论关注正文可见范围，现有说明没有撤销访问步骤。',
      'Mailbox discussions focus on body visibility, but the guide lacks revocation steps.',
    ),
    t(
      '预约页面移动访问增加，样例反馈集中在时区不清楚。',
      'Mobile booking-page visits grew and sample feedback highlights unclear time zones.',
    ),
    t(
      '集成问题开始出现重复回传，当前示例只演示成功一次。',
      'Duplicate callback questions appeared while the current example covers one successful delivery only.',
    ),
    t(
      '“免费 CRM”搜索同时包含托管、自建与替换表格三类需求。',
      'Free-CRM searches mix hosting, self-management and spreadsheet-replacement intents.',
    ),
    t(
      '客户转交后的未完成任务仍留在原负责人名下。',
      'Open follow-ups remain assigned to previous owners after account transfer.',
    ),
    t(
      'AI 赢单预测提案只有十条演示样本，无法支持准确率宣传。',
      'The AI forecasting proposal has only ten sample deals, insufficient for an accuracy claim.',
    ),
    t(
      '输单原因样本只有十二条，尚不足以据此调整产品定价。',
      'Twelve sample losses are insufficient grounds for changing product pricing.',
    ),
  ];
  return {
    notice: copy(
      t(
        '人工编写的 CRM 演示分析；客户、指标与反馈均为虚构。',
        'Hand-authored CRM demo analysis; accounts, metrics and feedback are fictional.',
      ),
    ),
    limitation: copy(
      t(
        '样例用于演示分析过程，不证明真实客户行为或因果关系。',
        'Samples demonstrate analysis, not real customer behavior or causation.',
      ),
    ),
    priorityHigh: copy(
      t(
        '直接影响客户数据质量或销售协作。',
        'Directly affects account data quality or sales collaboration.',
      ),
    ),
    priorityOther: copy(
      t(
        '先验证问题，再安排内容与产品复核。',
        'Validate the issue before editorial and product review.',
      ),
    ),
    audience: copy(
      t(
        '销售主管、销售运营和负责实施的顾问',
        'Sales managers, revenue operations and implementation consultants',
      ),
    ),
    observations: [
      copy(
        t(
          '本周先解决导入、线索分配和报价版本；续约指南继续积累样本。',
          'Prioritize imports, lead routing and quote versions this week; keep collecting renewal-guide samples.',
        ),
      ),
    ],
    doReason: copy(
      t(
        '多个样例入口指向同一问题，交给负责人核实。',
        'Several sample sources point to the issue; assign an owner to verify it.',
      ),
    ),
    skipReason: copy(
      t(
        '品牌词在正常波动范围，保持常规观察。',
        'Branded queries remain within routine variation; continue monitoring.',
      ),
    ),
    briefs: selected.map((index, i) => {
      const story = CRM_STORIES[index];
      return [
        story.key,
        copy(story.title),
        copy(observations[i]),
        copy(story.brief),
        copy(story.comments[0][1]),
        copy(
          t(
            '让销售团队完成可验证的下一步。',
            'Help the sales team complete a verifiable next step.',
          ),
        ),
        story.path,
        i % 3 === 0 ? 'gsc' : i % 3 === 1 ? 'discourse' : 'site',
        i < 4 ? 'high' : 'medium',
      ];
    }),
    watches: [
      [
        'renewal',
        copy(t('续约指南样本尚不足', 'Renewal guide has too little data')),
        copy(
          t(
            '新页面的有效事件仍少，不据此判断转化。',
            'The new page has few meaningful events; no conversion conclusion yet.',
          ),
        ),
        copy(
          t(
            '等待完整七天并核对收录。',
            'Wait seven full days and verify indexing.',
          ),
        ),
      ],
      [
        'mobile',
        copy(
          t(
            '移动拜访指南改版后等待观察',
            'Observe the revised mobile visit guide',
          ),
        ),
        copy(
          t(
            '新版正在观察，弱网失败仍需人工复测。',
            'The revision is under observation; weak-network failures need manual rechecks.',
          ),
        ),
        copy(
          t(
            '按相同设备比较完整窗口。',
            'Compare complete windows for the same devices.',
          ),
        ),
      ],
      [
        'pricing',
        copy(
          t(
            '价格页预约下降的原因待确认',
            'Pricing-page booking decline needs investigation',
          ),
        ),
        copy(
          t(
            '流量上涨但预约减少，可能涉及内容或事件漏报。',
            'Visits rose while bookings fell; content and missing events are possible explanations.',
          ),
        ),
        copy(
          t(
            '核对预约事件后再做改稿决策。',
            'Verify booking events before deciding on a rewrite.',
          ),
        ),
      ],
      [
        'pipeline',
        copy(
          t(
            '漏斗说明页搜索开始变化',
            'Pipeline-guide searches are starting to shift',
          ),
        ),
        copy(
          t(
            '先核对查询意图，再判断是否需要新的销售阶段示例。',
            'Check query intent before adding another sales-stage example.',
          ),
        ),
        copy(
          t(
            '积累同星期数据，检查新增查询是否与阶段定义有关。',
            'Collect matching weekdays and check whether new queries concern stage definitions.',
          ),
        ),
      ],
      [
        'routing',
        copy(
          t(
            '线索分配教程等待跟进反馈',
            'Lead-routing guide awaits follow-up evidence',
          ),
        ),
        copy(
          t(
            '指南访问不等于团队已正确配置分配规则。',
            'Guide views do not establish that teams configured routing correctly.',
          ),
        ),
        copy(
          t(
            '结合异常线索的处理反馈判断是否补充例外情形。',
            'Review exception handling before adding more routing examples.',
          ),
        ),
      ],
      [
        'permissions',
        copy(
          t(
            '权限指南改版后的搜索表现',
            'Search performance after the permissions-guide revision',
          ),
        ),
        copy(
          t(
            '检查搜索需求与撤销访问的操作反馈是否一致。',
            'Compare search demand with feedback on access revocation.',
          ),
        ),
        copy(
          t(
            '完成七天观察，并核对直接链接和导出场景。',
            'Complete seven days of observation and check direct-link and export scenarios.',
          ),
        ),
      ],
    ],
    normal: [
      copy(t('CRM 品牌词稳定', 'CRM branded searches are steady')),
      copy(
        t(
          '同星期比较未见明显变化，暂不另立任务。',
          'Matching weekdays show no material movement; no separate task yet.',
        ),
      ),
    ],
    goal: {
      intent: copy(
        t(
          '让销售团队可靠地维护客户与下一步跟进。',
          'Help sales teams maintain reliable accounts and next actions.',
        ),
      ),
      audience: copy(
        t(
          '五到五十人的销售团队及销售运营。',
          'Sales teams of five to fifty and revenue operations.',
        ),
      ),
      focus: copy(
        t(
          '导入、分配、漏斗、报价、转交与续约。',
          'Imports, routing, pipeline, quotes, handover and renewals.',
        ),
      ),
      progress: copy(
        t(
          '核对数据质量和任务交接，不用演示流量承诺收入。',
          'Verify data quality and handovers; demo traffic does not promise revenue.',
        ),
      ),
    },
  };
}
