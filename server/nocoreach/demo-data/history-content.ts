import type { EditorialStory } from './editorial.js';
import {
  t,
  type L,
  type Forum,
  type Repository,
} from './world/script/types.js';

type Episode = readonly [
  age: number,
  path: string,
  title: L,
  finding: L,
  decision: L,
];

const Acme: readonly Episode[] = [
  [
    58,
    '/docs/import-excel',
    t(
      '给导入教程补上错误行修复示例',
      'Add failed-row recovery to the import guide',
    ),
    t(
      '演练表有 240 行，其中 8 行日期格式不一致、4 行负责人未邀请；原稿只展示全部成功的情况。',
      'The 240-row rehearsal contained eight inconsistent dates and four owners not yet invited; the draft only showed a successful import.',
    ),
    t(
      '保留原始行号，分两批重试 12 行；复核结果仍为 240 条，未新增重复任务。',
      'Keep source rows and retry the twelve failures in two batches. Verify 240 tasks remain, with no duplicate creations.',
    ),
  ],
  [
    86,
    '/docs/guests',
    t('说明客户访客与成员的区别', 'Clarify client guests and members'),
    t(
      '六个试用团队把客户评审者当成内部成员，三次询问是否能只开放一个项目。',
      'Six trial teams treated client reviewers as internal members; three asked how to share just one project.',
    ),
    t(
      '用品牌改版项目展示邀请、评论与撤销访问，记录撤销后详情链接的检查结果。',
      'Show invitation, comments and access revocation on a brand refresh project, including a direct-link check after revocation.',
    ),
  ],
  [
    115,
    '/templates',
    t(
      '为活动策划模板补齐负责人交接',
      'Add owner handoffs to the event template',
    ),
    t(
      '社区分享的 32 项活动清单有日期，却没有验收人；场地与宣传两组都认为对方负责终稿。',
      'A shared 32-task event checklist had dates but no approvers; venue and publicity teams each expected the other to own the final copy.',
    ),
    t(
      '为六个阶段补上交付物和接收人；将印刷确认放在采购截止日期之前。',
      'Add deliverables and recipients to six phases; place print approval before the purchasing deadline.',
    ),
  ],
  [
    146,
    '/features/timeline',
    t(
      '发布排期依赖的端到端示例',
      'Publish a complete dependency scheduling example',
    ),
    t(
      '四次上手演示都卡在“设计延期以后哪些任务要变”；只介绍连线操作没有解释影响范围。',
      'Four onboarding sessions stalled at which tasks move when design is late; showing dependency links did not explain their impact.',
    ),
    t(
      '用设计、评审、开发、验收四个阶段展示基准日期与调整日期，并保留一次人工确认。',
      'Show baseline and revised dates for design, review, development and acceptance, retaining a human confirmation.',
    ),
  ],
  [
    177,
    '/docs/weekly-reports',
    t(
      '周报从任务数量改为风险与下一步',
      'Replace task-count reporting with risks and next actions',
    ),
    t(
      '八个项目的周报列了 163 项已完成任务，但两项阻塞的客户验收没有明确负责人。',
      'Eight project reports listed 163 completed tasks, while two blocked client acceptances had no clear owner.',
    ),
    t(
      '新模板固定列出本周交付、阻塞、负责人和决策截止时间；删除没有行动项的完成率排行榜。',
      'The template now lists deliveries, blockers, owners and decision deadlines; remove completion rankings without actions.',
    ),
  ],
  [
    209,
    '/features/portfolio',
    t(
      '把项目总览中的风险口径写清楚',
      'Define risk labels in the portfolio overview',
    ),
    t(
      '三个部门对红色状态的理解不同：延期、缺人和等待客户被混在一起。',
      'Three departments used red status for different things: lateness, staffing shortages and waiting for clients.',
    ),
    t(
      '拆出风险原因与责任人，保留更新时间；不要从任务完成率直接推断项目健康度。',
      'Separate the risk reason, owner and update time; do not infer project health from completion percentage alone.',
    ),
  ],
  [
    241,
    '/docs/approvals',
    t(
      '补齐客户验收的退回与再次提交',
      'Document rejection and resubmission in client acceptance',
    ),
    t(
      '一个六轮设计评审案例中，旧附件被当成最新版本；原教程止于“发送给客户”。',
      'In a six-round design review, an old attachment was mistaken for the latest version; the guide stopped at sending it to the client.',
    ),
    t(
      '给每轮附件标记版本，保留退回理由；只将客户确认的那一版记为验收通过。',
      'Version each attachment and retain rejection reasons; mark only the client-confirmed version as accepted.',
    ),
  ],
  [
    273,
    '/docs/getting-started',
    t(
      '重写首次创建项目后的三步引导',
      'Rewrite the first three steps after project creation',
    ),
    t(
      '十二次引导演练中，五人先研究所有设置，没有邀请同事或完成第一项任务。',
      'In twelve onboarding rehearsals, five people explored every setting before inviting a teammate or completing a task.',
    ),
    t(
      '依次创建一项任务、邀请一名同事、完成一次交接；高级设置移到相关步骤之后。',
      'Create one task, invite one teammate and complete one handoff; place advanced settings after the relevant step.',
    ),
  ],
  [
    305,
    '/pricing',
    t('解释团队扩容时怎样估算席位', 'Explain seat planning as a team grows'),
    t(
      '十人团队的咨询经常把三位外部评审者算入编辑成员，导致对方案的理解不同。',
      'Ten-person teams often counted three external reviewers as editing members, producing conflicting plan estimates.',
    ),
    t(
      '以角色和实际操作列明需求，给出咨询清单；计费金额留给销售按当前方案确认。',
      'List needs by role and actual actions, and provide a consultation checklist; sales confirms current pricing.',
    ),
  ],
  [
    337,
    '/docs/integrations',
    t('发布日历同步排错检查表', 'Publish a calendar synchronization checklist'),
    t(
      '九条支持记录中，四条是时区差异，三条是重复订阅，两条是同步延迟。',
      'Of nine support cases, four involved time zones, three duplicate subscriptions and two synchronization delays.',
    ),
    t(
      '按时区、订阅地址、最近同步时间检查；示例保留同一任务在两个时区的显示值。',
      'Check time zone, subscription URL and last sync time; retain the same task displayed in two time zones.',
    ),
  ],
  [
    370,
    '/templates',
    t(
      '整理首批五个团队模板的适用范围',
      'Define the scope of the first five team templates',
    ),
    t(
      '营销、产品和交付团队直接套用同一套状态，导致“已完成”既表示初稿完成又表示客户验收。',
      'Marketing, product and delivery teams reused one status set, so done meant both draft completion and client acceptance.',
    ),
    t(
      '每个模板写出完成条件、交付物与不适用场景；示例记录均使用虚构人员。',
      'State completion criteria, deliverables and unsuitable uses for each template, using fictional people throughout.',
    ),
  ],
  [
    411,
    '/',
    t(
      '完成项目管理产品的首版定位页',
      'Complete the initial project management positioning page',
    ),
    t(
      '首轮访谈关注负责人、截止日期与交接；“一体化工作空间”无法让试用者判断具体用途。',
      'Initial interviews focused on owners, dates and handoffs; an all-in-one workspace claim did not explain the use case.',
    ),
    t(
      '首屏改为任务、排期与团队协作，并链接到可实际走通的首次交接教程。',
      'Lead with tasks, schedules and teamwork, linking to a first-handoff tutorial people can follow.',
    ),
  ],
];

const CRM: readonly Episode[] = [
  [
    57,
    '/docs/import',
    t(
      '客户导入教程补充合并前检查',
      'Add pre-merge checks to the account import guide',
    ),
    t(
      '1,280 行样表中有 86 条疑似重复、14 条未分配；同名公司并不一定是同一法人。',
      'The 1,280-row sample had 86 possible duplicates and fourteen unassigned records; matching names did not establish the same legal entity.',
    ),
    t(
      '先核对公司标识和关联商机，保留原行号与合并记录；未分配记录进入认领队列。',
      'Check company identifiers and linked deals, retain source rows and merge history, and put unassigned records in the claim queue.',
    ),
  ],
  [
    85,
    '/docs/lead-routing',
    t('补齐销售请假时的线索分配说明', 'Explain lead routing during rep leave'),
    t(
      '两名销售同时休假时，七条线索仍按原轮询分配，次日才被发现。',
      'When two reps were away, seven leads still followed the usual rotation and were discovered the next day.',
    ),
    t(
      '说明替补顺序、无人可用时的队列与恢复分配步骤；演练七条线索的最终负责人。',
      'Document backup order, the no-rep queue and resuming assignment; rehearse the final owner of all seven leads.',
    ),
  ],
  [
    116,
    '/features/pipeline',
    t(
      '统一进入报价阶段所需的证据',
      'Align evidence required for the quote stage',
    ),
    t(
      '周会上 18 条商机被标为报价，其中 6 条还没有确认联系人和预算范围。',
      'A review labeled eighteen deals as quoted, although six had no confirmed contact or budget range.',
    ),
    t(
      '补齐阶段进入条件与退回理由；用三条匿名样例展示需求确认、方案评审与正式报价的区别。',
      'Add stage entry criteria and rollback reasons, with three fictional examples separating discovery, solution review and formal quotes.',
    ),
  ],
  [
    147,
    '/docs/quotes',
    t(
      '发布报价版本与作废流程示例',
      'Publish quote versioning and withdrawal examples',
    ),
    t(
      '同一客户收到了第二版和第三版附件，销售需要解释哪一版仍然有效。',
      'One customer received version two and version three attachments; the rep needed to identify the valid one.',
    ),
    t(
      '在发送前核对版本、金额与有效期，作废旧附件时记录替代版本和通知结果。',
      'Check version, amount and expiry before sending; record the replacement and notification when withdrawing an old attachment.',
    ),
  ],
  [
    179,
    '/docs/follow-ups',
    t(
      '跟进提醒增加客户要求暂停的情景',
      'Add customer-requested pauses to follow-up reminders',
    ),
    t(
      '六条客户记录要求下月联系，旧教程仍建议每天提醒，销售只能逐条删除待办。',
      'Six customers requested contact next month, but the old guide still suggested daily reminders and reps deleted tasks manually.',
    ),
    t(
      '保留暂停原因和恢复日期，区分延期、完成与取消；不要把未联系误算成已跟进。',
      'Retain the pause reason and resume date, distinguish deferred, completed and cancelled work, and do not count missing contact as a follow-up.',
    ),
  ],
  [
    210,
    '/docs/permissions',
    t(
      '核对区域销售主管的客户可见范围',
      'Verify account visibility for regional sales managers',
    ),
    t(
      '东西两个区域共享一名售前顾问，团队担心临时协助会开放全部客户资料。',
      'Two regions shared a presales consultant and worried that temporary assistance would expose every account.',
    ),
    t(
      '按销售、主管和协助者三个账号验证列表、详情链接与导出；结束协助后再次核对。',
      'Verify lists, direct links and exports as rep, manager and helper, then check again after assistance ends.',
    ),
  ],
  [
    242,
    '/docs/handover',
    t(
      '客户交接清单纳入未完成跟进',
      'Include open follow-ups in account handovers',
    ),
    t(
      '转交 23 个客户后，11 项待办仍在原负责人名下，两个报价没有同步交接。',
      'After transferring 23 accounts, eleven tasks remained with the old owner and two quotes were missing from the handover.',
    ),
    t(
      '逐项确认客户、联系人、待办、报价和邮件权限，接收人确认之后才结束交接。',
      'Verify accounts, contacts, tasks, quotes and mail access; close the handover only after the recipient confirms.',
    ),
  ],
  [
    274,
    '/docs/forecast',
    t(
      '预测指南分开加权金额和已签金额',
      'Separate weighted forecasts from signed revenue',
    ),
    t(
      '月末报告将概率加权的商机金额与合同金额相加，主管无法说明总数来源。',
      'A month-end report added probability-weighted deals to signed contracts, leaving the manager unable to explain the total.',
    ),
    t(
      '固定快照时间、币种与阶段概率，签约额单独列出；保留预测变更原因。',
      'Fix snapshot time, currency and stage probability, list signed revenue separately and retain forecast change reasons.',
    ),
  ],
  [
    306,
    '/pricing',
    t(
      '写清托管方案的迁移与培训边界',
      'Clarify migration and training in the hosted plan',
    ),
    t(
      '五个咨询把数据清理、历史邮件和定制培训都理解为默认包含项目。',
      'Five inquiries assumed data cleanup, historical email and custom training were all included by default.',
    ),
    t(
      '将产品功能、实施工作和可选服务分开列示，预约咨询前先收集现有数据量与格式。',
      'Separate product features, implementation and optional services; collect current data volume and formats before consultation.',
    ),
  ],
  [
    338,
    '/docs/quick-start',
    t(
      '把首次演示缩短为一条客户跟进路径',
      'Focus the first walkthrough on one account follow-up',
    ),
    t(
      '七名新用户在创建字段时停住，还未录入客户；原演示包含太多管理配置。',
      'Seven new users stopped at field configuration before entering an account; the walkthrough contained too much administration.',
    ),
    t(
      '从一家虚构公司、一位联系人和一条商机开始，以明确下一次联系时间结束。',
      'Start with one fictional account, contact and deal, ending with an explicit next-contact date.',
    ),
  ],
  [
    371,
    '/blog/lost-deals',
    t('建立可复盘的输单原因示例', 'Create useful lost-deal review examples'),
    t(
      '首批 27 条输单记录有 19 条只写“价格”，未区分预算不足、缺少需求与竞品选择。',
      'Nineteen of the first 27 lost-deal notes said only price, without distinguishing budget, fit or competitor selection.',
    ),
    t(
      '保留客户原话、销售判断与待核实信息，季度复盘只比较同一口径的记录。',
      'Retain customer statements, rep interpretations and unverified details; compare consistent categories in quarterly reviews.',
    ),
  ],
  [
    412,
    '/',
    t(
      '完成销售协作产品的首版介绍',
      'Complete the initial sales collaboration overview',
    ),
    t(
      '早期需求围绕客户归属、下一步行动和交接；笼统的销售自动化文案没有回答这些问题。',
      'Early needs centered on account ownership, next actions and handovers; generic sales automation copy did not address them.',
    ),
    t(
      '用一条客户跟进路径串起客户、联系人和商机，明确团队适用规模与自建维护责任。',
      'Connect accounts, contacts and deals through a follow-up journey, defining team size and self-hosting responsibilities.',
    ),
  ],
];

export function historicalStories(main: boolean): EditorialStory[] {
  return (main ? Acme : CRM).map(
    ([age, path, title, finding, decision], i) => ({
      key: `${main ? 'acme' : 'crm'}-history-${age}`,
      path,
      age,
      owner: i % 2 ? 'growth' : 'content',
      state: 'done',
      title,
      brief: finding,
      comments: [
        ['content', finding],
        ['editor', decision],
      ],
      draft: t(
        `# ${title.zh}\n\n## 发现的问题\n\n${finding.zh}\n\n## 已确认的处理\n\n${decision.zh}\n\n## 复核记录\n\n使用演示项目与虚构记录完成复核，保留原稿以便对照；未将内容完成等同于业务转化提升。`,
        `# ${title.en}\n\n## Finding\n\n${finding.en}\n\n## Approved change\n\n${decision.en}\n\n## Review record\n\nChecked against the demo project and fictional records, retaining the earlier copy for comparison. Content completion does not establish conversion improvement.`,
      ),
    }),
  );
}

export function historicalTopics(main: boolean): Forum['topics'][number][] {
  return (main ? Acme : CRM).map(([age, , title, finding, decision], i) => ({
    title,
    category: 2,
    opened: age + 2,
    views: 280 + i * 137,
    likes: 5 + i * 2,
    accepted: 2,
    tags: [main ? 'project-delivery' : 'sales-operations'],
    posts: [
      {
        author: `${main ? 'project' : 'sales'}-team-${(i % 5) + 1}`,
        after: 0,
        text: finding,
      },
      { author: '@editor', after: 26 + i * 3, text: decision, likes: 3 + i },
    ],
  }));
}

export function historicalReleases(
  main: boolean,
): Repository['releases'][number][] {
  return (main ? Acme : CRM)
    .filter((_, i) => i % 2 === 1)
    .map(([age, , title, , decision], i) => ({
      age: age - 8,
      tag: `v${main ? '2' : '1'}.${3 - Math.floor(i / 2)}.${i % 2 ? 0 : 1}`,
      name: title,
      notes: decision,
    }));
}
