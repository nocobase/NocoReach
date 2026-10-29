import type { DemoContent } from './content.js';
import type { EditorialStory } from './editorial.js';
import { t, type L, type Page } from './world/script/types.js';

export const ACME_STORIES: readonly EditorialStory[] = [
  {
    key: 'acme-excel-import',
    owner: 'admin',
    path: '/docs/import-excel',
    state: 'todo',
    title: {
      zh: '论坛里 5 个人在问怎么导入 Excel，写一篇教程',
      en: 'Write an Excel import tutorial for five forum questions',
    },
    brief: {
      zh: '近 14 天有 5 个主题询问 Excel 任务导入，3 个还没有回复。用 240 条任务演示列映射、负责人匹配和日期格式；先试导 20 行，再检查错误行和重复记录。',
      en: 'Five threads in 14 days ask about Excel imports; three are unanswered. Demonstrate column mapping, owners and dates with 240 tasks, rehearse 20 rows and inspect failures and duplicates.',
    },
    comments: [
      [
        'growth',
        {
          zh: '别把任务名称相同当成重复；我们每周都有同名例会。',
          en: 'Identical titles are not duplicates; our weekly meetings share names.',
        },
      ],
      [
        'editor',
        {
          zh: '先保留原表行号，截图覆盖预览和失败修正两个步骤。',
          en: 'Keep source row numbers and show preview and failed-row correction.',
        },
      ],
    ],
  },
  {
    key: 'acme-search-home',
    path: '/',
    state: 'todo',
    title: {
      zh: '「项目管理软件」排名升到第 6，优化首页标题与摘要',
      en: 'Improve the homepage snippet as project management software reaches rank six',
    },
    brief: {
      zh: '样例查询平均排名从 11 升到 6，点击率仍约 1.2%。标题优先说明任务、排期和团队协作；将搜索意图与首屏承诺逐项核对。',
      en: 'The sample query moved from rank 11 to six but CTR remains around 1.2%. Name tasks, schedules and teamwork in the snippet and check it against the landing page.',
    },
    comments: [
      [
        'content',
        {
          zh: '搜索词更偏团队交付，不能只写“让工作更高效”。',
          en: 'Search intent is team delivery; “work more efficiently” is too vague.',
        },
      ],
      [
        'editor',
        {
          zh: '保留一个具体场景，试验前后使用相同的搜索词组。',
          en: 'Keep a concrete use case and compare the same query cohort.',
        },
      ],
    ],
  },
  {
    key: 'acme-pricing-case',
    path: '/pricing',
    state: 'todo',
    title: {
      zh: '定价页访问上涨，补上十二人团队的使用案例',
      en: 'Add a twelve-person team example to the growing pricing page',
    },
    brief: {
      zh: '最近 28 天定价页访问明显增加，试用团队反复询问外部客户算不算席位。写出 12 位成员、3 位客户访客的协作案例，分清产品行为与计费待确认项。',
      en: 'Pricing visits grew in the latest 28 days and trial teams ask whether clients occupy seats. Show 12 members and three client guests; separate behavior from billing details awaiting confirmation.',
    },
    comments: [
      [
        'content',
        {
          zh: '案例要说明谁能编辑任务，谁只能看获邀项目。',
          en: 'Explain who edits tasks and who sees only invited projects.',
        },
      ],
      [
        'editor',
        {
          zh: '不编造折扣，先展示选择步骤与咨询入口。',
          en: 'Do not invent discounts; show selection steps and the contact route.',
        },
      ],
    ],
  },
  {
    key: 'acme-comparison',
    owner: 'growth',
    path: '/compare/nimbus',
    state: 'todo',
    title: {
      zh: '「Acme vs Nimbus」有人搜索，补齐项目协作对比',
      en: 'Complete the Acme vs Nimbus project collaboration comparison',
    },
    brief: {
      zh: '对比关键词有持续搜索，现有页面只有简短介绍。用同一份跨团队交付清单比较导入、访客、依赖与导出；Nimbus 也是虚构样例。',
      en: 'Comparison searches recur, but the current page is only a stub. Compare imports, guests, dependencies and exports with one delivery checklist. Nimbus is also a fictional sample.',
    },
    comments: [
      [
        'growth',
        {
          zh: '先列适用团队和限制，不把所有能力都打勾。',
          en: 'List team fit and limits instead of checking every capability.',
        },
      ],
      [
        'editor',
        {
          zh: '缺少验证的能力标为待确认，补上评估日期。',
          en: 'Mark unverified capabilities as pending and date the evaluation.',
        },
      ],
    ],
  },
  {
    key: 'acme-kanban-wip',
    path: '/features/kanban',
    state: 'doing',
    title: {
      zh: '用设计团队的一周解释看板在制品限制',
      en: 'Explain Kanban work-in-progress limits with a design team week',
    },
    brief: {
      zh: '八人设计团队同时开了 19 个任务，评审列堆积。演示待做、进行中、待评审、完成四列及超限提醒，说明阻塞任务仍计入在制品。',
      en: 'An eight-person design team started 19 tasks and overloaded review. Show four columns and WIP warnings, counting blocked tasks as work in progress.',
    },
    comments: [
      [
        'content',
        {
          zh: '先看卡住原因，不能为了图表好看把任务挪到完成。',
          en: 'Inspect blockers; do not move unfinished cards to done to improve charts.',
        },
      ],
      [
        'editor',
        {
          zh: '周三请假是例外，示例里保留人员变化。',
          en: 'Keep Wednesday leave in the example as an exception.',
        },
      ],
    ],
  },
  {
    key: 'acme-dependencies',
    owner: 'admin',
    path: '/features/timeline',
    state: 'review',
    title: {
      zh: '补齐排期依赖的延期示例',
      en: 'Add a schedule dependency delay example',
    },
    brief: {
      zh: '网站改版项目共 18 项任务，品牌确认晚两天。稿件展示依赖链和交付日期变动，提醒手动日期与自动排期的区别。',
      en: 'A website redesign has 18 tasks and a two-day brand approval delay. Show the dependency chain and distinguish manual dates from automatic scheduling.',
    },
    comments: [
      [
        'content',
        {
          zh: '已把里程碑设成不可自动移动，需由负责人确认。',
          en: 'The milestone is fixed and needs owner confirmation.',
        },
      ],
      [
        'editor',
        {
          zh: '请把原日期与调整后日期放在同一张图上。',
          en: 'Show original and revised dates together.',
        },
      ],
    ],
    draft: {
      zh: '# 上游任务晚了两天，为什么发布日没有跟着变？\n\n网站改版项目共 18 项任务，品牌确认晚两天。稿件展示依赖链和交付日期变动，提醒手动日期与自动排期的区别。\n\n## 操作与核对\n\n已把里程碑设成不可自动移动，需由负责人确认。\n\n请把原日期与调整后日期放在同一张图上。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# Why did the release date stay fixed after a two-day upstream delay?\n\nA website redesign has 18 tasks and a two-day brand approval delay. Show the dependency chain and distinguish manual dates from automatic scheduling.\n\n## Steps and checks\n\nThe milestone is fixed and needs owner confirmation.\n\nShow original and revised dates together.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-guest-access',
    path: '/docs/guests',
    state: 'done',
    title: {
      zh: '发布客户访客权限检查表',
      en: 'Publish the client guest access checklist',
    },
    brief: {
      zh: '虚构客户只需确认设计稿，不应看到内部工时和预算。验证邀请、链接访问、附件下载及撤销邀请；完成后观察相关文档搜索。',
      en: 'A fictional client approves designs without seeing internal time or budgets. Verify invitations, links, downloads and revocation, then observe documentation search.',
    },
    comments: [
      [
        'growth',
        {
          zh: '使用访客账号复验，不以管理员看到的页面为准。',
          en: 'Recheck with a guest account instead of an administrator.',
        },
      ],
      [
        'editor',
        {
          zh: '四条访问路径都已核对，稿件通过。',
          en: 'All four access paths checked; approved.',
        },
      ],
    ],
    outcome: 'up',
    draft: {
      zh: '# 邀请客户后，他们能看到别的项目和内部工时吗？\n\n虚构客户只需确认设计稿，不应看到内部工时和预算。验证邀请、链接访问、附件下载及撤销邀请；完成后观察相关文档搜索。\n\n## 操作与核对\n\n使用访客账号复验，不以管理员看到的页面为准。\n\n四条访问路径都已核对，稿件通过。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# Can invited clients see other projects or internal time entries?\n\nA fictional client approves designs without seeing internal time or budgets. Verify invitations, links, downloads and revocation, then observe documentation search.\n\n## Steps and checks\n\nRecheck with a guest account instead of an administrator.\n\nAll four access paths checked; approved.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-weekly-report',
    path: '/docs/weekly-reports',
    state: 'done',
    title: {
      zh: '把周报从任务数量改为交付进展',
      en: 'Explain delivery progress in weekly reports',
    },
    brief: {
      zh: '项目经理每周花 45 分钟拼周报。用里程碑、阻塞项、负责人和下一步替代完成任务数排名；保留延期项目的说明。',
      en: 'A manager spends 45 minutes assembling a weekly report. Use milestones, blockers, owners and next steps instead of ranking completed-task counts; retain explanations for delays.',
    },
    comments: [
      [
        'content',
        {
          zh: '拆小任务会让完成数虚高，必须回到里程碑验收。',
          en: 'Splitting tasks inflates counts; return to milestone acceptance.',
        },
      ],
      [
        'editor',
        {
          zh: '周报示例已经包含一个延期项目和恢复计划。',
          en: 'The sample includes a delayed project and a recovery plan.',
        },
      ],
    ],
    outcome: 'up',
    draft: {
      zh: '# 完成任务很多，为什么客户还是说看不到进展？\n\n项目经理每周花 45 分钟拼周报。用里程碑、阻塞项、负责人和下一步替代完成任务数排名；保留延期项目的说明。\n\n## 操作与核对\n\n拆小任务会让完成数虚高，必须回到里程碑验收。\n\n周报示例已经包含一个延期项目和恢复计划。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# Why do clients see little progress despite many completed tasks?\n\nA manager spends 45 minutes assembling a weekly report. Use milestones, blockers, owners and next steps instead of ranking completed-task counts; retain explanations for delays.\n\n## Steps and checks\n\nSplitting tasks inflates counts; return to milestone acceptance.\n\nThe sample includes a delayed project and a recovery plan.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-notifications',
    owner: 'editor',
    path: '/docs/notifications',
    state: 'doing',
    title: {
      zh: '通知减噪指南退回：不能承诺永不漏消息',
      en: 'Revise notification guidance without promising zero missed updates',
    },
    brief: {
      zh: '初稿把关闭关注写成所有提醒都会停止。区分指派、提及、关注和每日摘要，明确重要截止日期仍需团队约定。',
      en: 'The draft says unfollowing stops every alert. Separate assignments, mentions, watching and daily digests and retain team agreements for critical deadlines.',
    },
    comments: [
      [
        'content',
        {
          zh: '“关闭即静音所有通知”的说法不准确，这版退回。',
          en: 'Unfollowing does not mute every notification; return this draft.',
        },
      ],
      [
        'editor',
        {
          zh: '已补通知类型表，等待产品复核。',
          en: 'The notification matrix is added and awaits product review.',
        },
      ],
    ],
    rejected: true,
    draft: {
      zh: '# 关闭关注后为什么还收到指派提醒？\n\n初稿把关闭关注写成所有提醒都会停止。区分指派、提及、关注和每日摘要，明确重要截止日期仍需团队约定。\n\n## 操作与核对\n\n“关闭即静音所有通知”的说法不准确，这版退回。\n\n已补通知类型表，等待产品复核。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# Why do assignment alerts continue after unfollowing?\n\nThe draft says unfollowing stops every alert. Separate assignments, mentions, watching and daily digests and retain team agreements for critical deadlines.\n\n## Steps and checks\n\nUnfollowing does not mute every notification; return this draft.\n\nThe notification matrix is added and awaits product review.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-mobile-notes',
    path: '/features/mobile',
    state: 'done',
    title: {
      zh: '复盘手机端任务更新页的访问下降',
      en: 'Review declining mobile task update visits',
    },
    brief: {
      zh: '手机任务更新指南改版后搜索点击下降，移动访客停留也变短。检查图片体积和键盘遮挡，区分访问下降与提交失败。',
      en: 'Search clicks and mobile engagement declined after the task update guide changed. Inspect image weight and keyboard overlap; distinguish fewer visits from failed submissions.',
    },
    comments: [
      [
        'growth',
        {
          zh: '弱网下先保留文字，不能等照片传完才允许保存。',
          en: 'Save text on weak networks before photos finish uploading.',
        },
      ],
      [
        'editor',
        {
          zh: '下一轮只修改上传区，保留设备拆分观察。',
          en: 'Change only the upload area next and retain device-level analysis.',
        },
      ],
    ],
    outcome: 'down',
    kind: 'research',
    draft: {
      zh: '# 工地现场上传照片时，下一步按钮被键盘挡住了\n\n手机任务更新指南改版后搜索点击下降，移动访客停留也变短。检查图片体积和键盘遮挡，区分访问下降与提交失败。\n\n## 操作与核对\n\n弱网下先保留文字，不能等照片传完才允许保存。\n\n下一轮只修改上传区，保留设备拆分观察。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# The keyboard covers the next button during a field photo upload\n\nSearch clicks and mobile engagement declined after the task update guide changed. Inspect image weight and keyboard overlap; distinguish fewer visits from failed submissions.\n\n## Steps and checks\n\nSave text on weak networks before photos finish uploading.\n\nChange only the upload area next and retain device-level analysis.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-templates',
    path: '/templates',
    state: 'done',
    title: {
      zh: '检查项目模板专题为何没有明显变化',
      en: 'Review the flat result of the project template collection',
    },
    brief: {
      zh: '模板入口改版后点击基本持平。区分活动筹备、产品迭代和客户交付需求，核对使用模板后的首次任务创建。',
      en: 'Clicks stayed flat after the template index redesign. Separate events, product iterations and client delivery; inspect first-task creation after template use.',
    },
    comments: [
      [
        'content',
        {
          zh: '模板预览要显示示例标记，避免误当成真实待办。',
          en: 'Mark preview tasks as examples so they are not mistaken for real work.',
        },
      ],
      [
        'editor',
        {
          zh: '暂不下成功结论，先补三个团队的访谈。',
          en: 'No success claim yet; interview three teams first.',
        },
      ],
    ],
    outcome: 'flat',
    kind: 'research',
    draft: {
      zh: '# 选了活动模板，哪些示例任务可以删？\n\n模板入口改版后点击基本持平。区分活动筹备、产品迭代和客户交付需求，核对使用模板后的首次任务创建。\n\n## 操作与核对\n\n模板预览要显示示例标记，避免误当成真实待办。\n\n暂不下成功结论，先补三个团队的访谈。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# Which sample tasks can we remove from the event template?\n\nClicks stayed flat after the template index redesign. Separate events, product iterations and client delivery; inspect first-task creation after template use.\n\n## Steps and checks\n\nMark preview tasks as examples so they are not mistaken for real work.\n\nNo success claim yet; interview three teams first.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-workload',
    path: '/features/workload',
    state: 'done',
    title: {
      zh: '团队负荷页样本不足，先记录排期口径',
      en: 'Record workload definitions while evidence is insufficient',
    },
    brief: {
      zh: '新页面上线三天，仅有少量搜索点击。说明半天请假、跨项目任务与未估时任务的处理，等完整观察窗口。',
      en: 'The page has three days of sparse search data. Explain half-day leave, cross-project tasks and unestimated work, then wait for a full observation window.',
    },
    comments: [
      [
        'content',
        {
          zh: '未估时任务要单列，不能默认是零工作量。',
          en: 'Show unestimated tasks separately; they are not zero effort.',
        },
      ],
      [
        'editor',
        {
          zh: '图表口径已补齐，暂不能判断访问变化。',
          en: 'Chart definitions are ready; traffic evidence is insufficient.',
        },
      ],
    ],
    outcome: 'insufficient',
    draft: {
      zh: '# 一个人跨三个项目，负荷是按任务数算的吗？\n\n新页面上线三天，仅有少量搜索点击。说明半天请假、跨项目任务与未估时任务的处理，等完整观察窗口。\n\n## 操作与核对\n\n未估时任务要单列，不能默认是零工作量。\n\n图表口径已补齐，暂不能判断访问变化。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# Is workload across three projects counted by task number?\n\nThe page has three days of sparse search data. Explain half-day leave, cross-project tasks and unestimated work, then wait for a full observation window.\n\n## Steps and checks\n\nShow unestimated tasks separately; they are not zero effort.\n\nChart definitions are ready; traffic evidence is insufficient.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-recurring',
    path: '/docs/recurring-tasks',
    state: 'done',
    title: {
      zh: '重复任务指南已完成，等待一周观察',
      en: 'Wait one week after the recurring task guide',
    },
    brief: {
      zh: '团队周会在节假日顺延，引发重复创建问题。指南解释时区、跳过本次和停止系列，当前只有两天数据。',
      en: 'Holiday shifts caused duplicate weekly meetings. The guide explains time zones, skipping one occurrence and ending the series; only two days of data exist.',
    },
    comments: [
      [
        'growth',
        {
          zh: '单次跳过和停止系列必须给出不同确认文案。',
          en: 'Skipping one occurrence and ending the series need distinct confirmations.',
        },
      ],
      [
        'editor',
        {
          zh: '周五再看完整窗口，先不宣布改善。',
          en: 'Review the full window on Friday without an early success claim.',
        },
      ],
    ],
    outcome: 'waiting',
    draft: {
      zh: '# 跳过国庆周会，会不会把后面的会议都取消？\n\n团队周会在节假日顺延，引发重复创建问题。指南解释时区、跳过本次和停止系列，当前只有两天数据。\n\n## 操作与核对\n\n单次跳过和停止系列必须给出不同确认文案。\n\n周五再看完整窗口，先不宣布改善。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# Does skipping a holiday meeting cancel future occurrences?\n\nHoliday shifts caused duplicate weekly meetings. The guide explains time zones, skipping one occurrence and ending the series; only two days of data exist.\n\n## Steps and checks\n\nSkipping one occurrence and ending the series need distinct confirmations.\n\nReview the full window on Friday without an early success claim.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-onboarding',
    path: '/docs/getting-started',
    state: 'done',
    title: {
      zh: '完成五分钟建立首个项目的上手指南',
      en: 'Complete the first-project quick start',
    },
    brief: {
      zh: '把首次上手缩成建项目、建三条任务、邀请同事、完成一次交接。避免一开始要求配置完整字段体系。',
      en: 'Start with a project, three tasks, a teammate invitation and one accepted handoff, rather than configuring every field first.',
    },
    comments: [
      [
        'content',
        {
          zh: '先用两人小组走通，再邀请整个部门。',
          en: 'Rehearse with two people before inviting the whole department.',
        },
      ],
      [
        'editor',
        {
          zh: '验收包含同事接手，不只是发送邀请。',
          en: 'Acceptance includes the teammate taking over, not just an invitation.',
        },
      ],
    ],
    outcome: 'up',
    draft: {
      zh: '# 第一次用 Acme，先建项目还是先邀请所有人？\n\n把首次上手缩成建项目、建三条任务、邀请同事、完成一次交接。避免一开始要求配置完整字段体系。\n\n## 操作与核对\n\n先用两人小组走通，再邀请整个部门。\n\n验收包含同事接手，不只是发送邀请。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# Should we create a project or invite everyone first?\n\nStart with a project, three tasks, a teammate invitation and one accepted handoff, rather than configuring every field first.\n\n## Steps and checks\n\nRehearse with two people before inviting the whole department.\n\nAcceptance includes the teammate taking over, not just an invitation.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-milestones',
    path: '/docs/milestones',
    state: 'doing',
    title: {
      zh: '明确里程碑延期时谁来确认新日期',
      en: 'Define who accepts a revised milestone date',
    },
    brief: {
      zh: '客户验收从周四推迟到下周一，三条下游任务受影响。写明提出变更、评估影响和确认交付日期的负责人。',
      en: 'Client acceptance moves from Thursday to Monday and affects three downstream tasks. Name who proposes, assesses and confirms the new date.',
    },
    comments: [
      [
        'content',
        {
          zh: '保留基准日期与变更理由，不覆盖历史。',
          en: 'Keep the baseline and change reason instead of overwriting history.',
        },
      ],
      [
        'editor',
        {
          zh: '需要同时通知内部负责人和客户联系人。',
          en: 'Notify both the internal owner and client contact.',
        },
      ],
    ],
  },
  {
    key: 'acme-handover',
    owner: 'admin',
    path: '/docs/project-handover',
    state: 'review',
    title: {
      zh: '把项目交接清单补到文档和附件级别',
      en: 'Extend the handover checklist to documents and attachments',
    },
    brief: {
      zh: '项目经理休假两周，接手人找不到评审记录。核对开放任务、最近决策、附件位置、客户联系人与升级路径。',
      en: 'A manager takes two weeks off and the cover cannot find review records. Check open tasks, decisions, attachments, client contacts and escalation routes.',
    },
    comments: [
      [
        'growth',
        {
          zh: '未决事项单独列出，不藏在会议纪要末尾。',
          en: 'List pending decisions separately instead of burying them in minutes.',
        },
      ],
      [
        'editor',
        {
          zh: '收到接手人确认后，交接任务才算完成。',
          en: 'Complete the handover only after the receiving owner confirms.',
        },
      ],
    ],
    draft: {
      zh: '# 接手项目后，怎样快速知道哪些事项还没定？\n\n项目经理休假两周，接手人找不到评审记录。核对开放任务、最近决策、附件位置、客户联系人与升级路径。\n\n## 操作与核对\n\n未决事项单独列出，不藏在会议纪要末尾。\n\n收到接手人确认后，交接任务才算完成。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# How do we identify unresolved decisions after taking over a project?\n\nA manager takes two weeks off and the cover cannot find review records. Check open tasks, decisions, attachments, client contacts and escalation routes.\n\n## Steps and checks\n\nList pending decisions separately instead of burying them in minutes.\n\nComplete the handover only after the receiving owner confirms.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-time-tracking',
    path: '/docs/time-tracking',
    state: 'todo',
    title: {
      zh: '解释计划工时、实际工时和可计费工时',
      en: 'Explain planned, actual and billable time',
    },
    brief: {
      zh: '代理团队把所有记录工时当成客户账单，引发误解。用一周 32 小时记录说明内部讨论、返工和已确认计费时间。',
      en: 'An agency treated every logged hour as billable. Use 32 sample hours to distinguish internal discussions, rework and confirmed billable time.',
    },
    comments: [
      [
        'content',
        {
          zh: '不在教程里默认全部工时可计费。',
          en: 'Do not assume every logged hour is billable.',
        },
      ],
      [
        'editor',
        {
          zh: '会保留审核人和修改记录。',
          en: 'Keep reviewer identity and edit history.',
        },
      ],
    ],
  },
  {
    key: 'acme-calendar',
    path: '/features/calendar',
    state: 'doing',
    title: {
      zh: '核对跨时区截止日期的日历说明',
      en: 'Clarify cross-time-zone due dates',
    },
    brief: {
      zh: '新加坡和洛杉矶团队对“周五截止”理解不同。区分日期任务与精确时刻，例子显示两个地区的本地时间。',
      en: 'Singapore and Los Angeles teams interpret Friday differently. Separate date-only tasks from exact deadlines and show both local times.',
    },
    comments: [
      [
        'content',
        {
          zh: '全天任务不要偷偷转换成午夜时间戳。',
          en: 'Do not silently turn all-day tasks into midnight timestamps.',
        },
      ],
      [
        'editor',
        {
          zh: '补充夏令时变化前后的示例。',
          en: 'Include examples around daylight-saving changes.',
        },
      ],
    ],
  },
  {
    key: 'acme-comments',
    path: '/docs/comments',
    state: 'done',
    title: {
      zh: '整理任务评论中的决定与下一步',
      en: 'Document decisions and next actions in task comments',
    },
    brief: {
      zh: '设计评审有 46 条评论，最后采用哪个版本不明确。补一条决策摘要，关联附件版本并写明后续负责人。',
      en: 'A design review has 46 comments but no clear final version. Add a decision summary, link the selected attachment and name the next owner.',
    },
    comments: [
      [
        'growth',
        {
          zh: '决定要链接到具体版本，不能只写“就用这个”。',
          en: 'Link the exact version instead of saying “use this one.”',
        },
      ],
      [
        'editor',
        {
          zh: '保留被否决方案的理由，方便接手人理解。',
          en: 'Keep reasons for rejected options to help future owners.',
        },
      ],
    ],
    draft: {
      zh: '# 评论太多，怎样标记最终采用的设计？\n\n设计评审有 46 条评论，最后采用哪个版本不明确。补一条决策摘要，关联附件版本并写明后续负责人。\n\n## 操作与核对\n\n决定要链接到具体版本，不能只写“就用这个”。\n\n保留被否决方案的理由，方便接手人理解。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# How do we mark the final design in a long comment thread?\n\nA design review has 46 comments but no clear final version. Add a decision summary, link the selected attachment and name the next owner.\n\n## Steps and checks\n\nLink the exact version instead of saying “use this one.”\n\nKeep reasons for rejected options to help future owners.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-archive',
    path: '/docs/archive',
    state: 'done',
    title: {
      zh: '发布结项归档与重新打开检查表',
      en: 'Publish project archive and reopening checks',
    },
    brief: {
      zh: '季度活动结项后仍需查看发票和复盘。解释只读归档、导出、保留权限与重新打开，避免把归档说成删除。',
      en: 'After a quarterly event, invoices and retrospectives remain needed. Explain read-only archiving, export, retained access and reopening; archiving is not deletion.',
    },
    comments: [
      [
        'content',
        {
          zh: '归档前核对访客访问，完成不代表自动撤销。',
          en: 'Check guest access before archiving; completion does not revoke it.',
        },
      ],
      [
        'editor',
        {
          zh: '恢复项目后检查未完成提醒是否重新启用。',
          en: 'After reopening, check whether pending reminders resume.',
        },
      ],
    ],
    draft: {
      zh: '# 项目归档后客户还能查看验收记录吗？\n\n季度活动结项后仍需查看发票和复盘。解释只读归档、导出、保留权限与重新打开，避免把归档说成删除。\n\n## 操作与核对\n\n归档前核对访客访问，完成不代表自动撤销。\n\n恢复项目后检查未完成提醒是否重新启用。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# Can clients still view acceptance records after archiving?\n\nAfter a quarterly event, invoices and retrospectives remain needed. Explain read-only archiving, export, retained access and reopening; archiving is not deletion.\n\n## Steps and checks\n\nCheck guest access before archiving; completion does not revoke it.\n\nAfter reopening, check whether pending reminders resume.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-sprint',
    path: '/templates/sprint',
    state: 'todo',
    title: {
      zh: '为两周迭代模板增加中途插单处理',
      en: 'Add unplanned work to the two-week sprint template',
    },
    brief: {
      zh: '开发团队第三天收到紧急修复。保留最初承诺与新增事项，说明谁接受范围变更，不能把所有未完成项算成效率问题。',
      en: 'An urgent fix arrives on day three. Preserve original commitments and additions, name the scope-change owner and avoid treating every unfinished task as poor efficiency.',
    },
    comments: [
      [
        'content',
        {
          zh: '保留插单原因与替换掉的任务。',
          en: 'Keep the reason and the task it displaced.',
        },
      ],
      [
        'editor',
        {
          zh: '迭代复盘分别看计划内与计划外工作。',
          en: 'Separate planned and unplanned work in the retrospective.',
        },
      ],
    ],
  },
  {
    key: 'acme-client-approval',
    path: '/docs/approvals',
    state: 'review',
    title: {
      zh: '把客户验收从评论确认改成明确的检查步骤',
      en: 'Make client acceptance steps explicit',
    },
    brief: {
      zh: '客户在评论里说“差不多”，团队误判为验收通过。明确提交版本、验收标准、修改项与正式确认。',
      en: 'A client says “almost there” in comments and the team treats it as acceptance. Specify version, criteria, requested changes and explicit confirmation.',
    },
    comments: [
      [
        'growth',
        {
          zh: '只认明确确认，含糊评论保留待处理状态。',
          en: 'Require explicit confirmation; ambiguous comments leave acceptance pending.',
        },
      ],
      [
        'editor',
        {
          zh: '附件版本和审批记录要一起显示。',
          en: 'Show the attachment version alongside its approval record.',
        },
      ],
    ],
    draft: {
      zh: '# 客户说“可以看看”，是否等于审批通过？\n\n客户在评论里说“差不多”，团队误判为验收通过。明确提交版本、验收标准、修改项与正式确认。\n\n## 操作与核对\n\n只认明确确认，含糊评论保留待处理状态。\n\n附件版本和审批记录要一起显示。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# Does “looks worth reviewing” count as approval?\n\nA client says “almost there” in comments and the team treats it as acceptance. Specify version, criteria, requested changes and explicit confirmation.\n\n## Steps and checks\n\nRequire explicit confirmation; ambiguous comments leave acceptance pending.\n\nShow the attachment version alongside its approval record.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-integrations',
    path: '/docs/integrations',
    state: 'doing',
    title: {
      zh: '补全任务同步中的重复与冲突处理',
      en: 'Explain duplicate and conflicting task sync events',
    },
    brief: {
      zh: '仓库重复推送同一事件后创建两条任务。示例按事件编号幂等处理，并解释手动修改标题时如何保留冲突记录。',
      en: 'A repeated repository event creates two tasks. Demonstrate event-ID idempotency and retain conflicts when titles were edited manually.',
    },
    comments: [
      [
        'content',
        {
          zh: '用外部事件编号去重，不能只按标题判断。',
          en: 'De-duplicate by external event ID, not task title.',
        },
      ],
      [
        'editor',
        {
          zh: '补上超时、重复、乱序三个分支。',
          en: 'Cover timeouts, duplicates and out-of-order events.',
        },
      ],
    ],
  },
  {
    key: 'acme-export',
    path: '/docs/export',
    state: 'done',
    title: {
      zh: '完成项目导出与附件核对教程',
      en: 'Complete project export and attachment checks',
    },
    brief: {
      zh: '迁移团队需要导出 36 个任务、8 个附件和评论摘要。导出后核对数量、负责人和时间，说明附件链接有效期。',
      en: 'A migration needs 36 tasks, eight attachments and comment summaries. Verify counts, owners and times and explain attachment-link expiry.',
    },
    comments: [
      [
        'content',
        {
          zh: '附件下载包与表格分开验收。',
          en: 'Verify the attachment archive separately from the sheet.',
        },
      ],
      [
        'editor',
        {
          zh: '已加入丢失附件时的处理步骤。',
          en: 'Added steps for missing attachments.',
        },
      ],
    ],
    outcome: 'up',
    draft: {
      zh: '# 导出表格以后附件和评论还能一起带走吗？\n\n迁移团队需要导出 36 个任务、8 个附件和评论摘要。导出后核对数量、负责人和时间，说明附件链接有效期。\n\n## 操作与核对\n\n附件下载包与表格分开验收。\n\n已加入丢失附件时的处理步骤。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# Can we export attachments and comments with the task sheet?\n\nA migration needs 36 tasks, eight attachments and comment summaries. Verify counts, owners and times and explain attachment-link expiry.\n\n## Steps and checks\n\nVerify the attachment archive separately from the sheet.\n\nAdded steps for missing attachments.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-ai-estimates',
    path: '/blog/estimation',
    state: 'todo',
    title: {
      zh: '暂停“AI 自动估时准确率 95%”宣传提案',
      en: 'Pause the unsupported 95% AI estimation proposal',
    },
    brief: {
      zh: '仅有十条演示任务，无法支持准确率承诺。先记录团队如何估时与调整，不发布成功率数字。',
      en: 'Ten sample tasks cannot support an accuracy promise. Document how teams estimate and revise before publishing performance claims.',
    },
    comments: [
      [
        'growth',
        {
          zh: '样本和工作类型都不足以外推，这个提案先取消。',
          en: 'The sample and task types do not support extrapolation; cancel this proposal.',
        },
      ],
      [
        'editor',
        {
          zh: '保留研究笔记，不进入发布队列。',
          en: 'Keep the research notes outside the release queue.',
        },
      ],
    ],
    kind: 'research',
    cancelled: true,
  },
  {
    key: 'acme-old-import',
    path: '/docs/import-excel',
    state: 'done',
    title: {
      zh: '归档旧版 Excel 字段映射截图',
      en: 'Archive outdated Excel mapping screenshots',
    },
    brief: {
      zh: '旧稿使用已移除的单步导入界面。保留历史记录并指向新的预览流程，避免团队重复取用旧截图。',
      en: 'The old draft shows a retired single-step importer. Keep history and point to the preview flow so editors do not reuse outdated screenshots.',
    },
    comments: [
      [
        'content',
        {
          zh: '旧稿不再作为新教程素材，保留归档说明。',
          en: 'Exclude the old draft from new tutorials and retain an archive note.',
        },
      ],
      [
        'editor',
        {
          zh: '所有新稿统一使用预览、核对、确认三个步骤。',
          en: 'New drafts use preview, check and confirm.',
        },
      ],
    ],
    archived: true,
    draft: {
      zh: '# 帮助文章里的导入按钮为什么和界面不同？\n\n旧稿使用已移除的单步导入界面。保留历史记录并指向新的预览流程，避免团队重复取用旧截图。\n\n## 操作与核对\n\n旧稿不再作为新教程素材，保留归档说明。\n\n所有新稿统一使用预览、核对、确认三个步骤。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# Why does the importer in the article look different from the interface?\n\nThe old draft shows a retired single-step importer. Keep history and point to the preview flow so editors do not reuse outdated screenshots.\n\n## Steps and checks\n\nExclude the old draft from new tutorials and retain an archive note.\n\nNew drafts use preview, check and confirm.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
  {
    key: 'acme-portfolio',
    path: '/features/portfolio',
    state: 'todo',
    title: {
      zh: '为跨项目总览补上三个项目的风险案例',
      en: 'Add a three-project risk example to the portfolio overview',
    },
    brief: {
      zh: '同一设计师同时参与网站、活动和产品发布。总览展示共享资源冲突与里程碑风险，不用平均完成率掩盖延期。',
      en: 'One designer works on a website, event and product launch. Show shared-resource conflicts and milestone risk instead of hiding delays behind average completion.',
    },
    comments: [
      [
        'content',
        {
          zh: '完成率不能平均后当作交付把握。',
          en: 'Averaged completion is not delivery confidence.',
        },
      ],
      [
        'editor',
        {
          zh: '风险卡要标责任人和下一次确认时间。',
          en: 'Risk cards need an owner and next review time.',
        },
      ],
    ],
  },
  {
    key: 'acme-retrospective',
    path: '/blog/retrospectives',
    state: 'done',
    title: {
      zh: '复盘会议模板保留没有结论的事项',
      en: 'Keep unresolved items in the retrospective template',
    },
    brief: {
      zh: '团队每次复盘列十条行动项，下次很少追踪。新模板限制同时推进三项，未确认原因保留假设，不强行归因。',
      en: 'Retrospectives produce ten actions with little follow-up. Limit active actions to three and keep uncertain causes as hypotheses.',
    },
    comments: [
      [
        'growth',
        {
          zh: '行动项要有负责人、验证方式和复查时间。',
          en: 'Each action needs an owner, validation method and review date.',
        },
      ],
      [
        'editor',
        {
          zh: '本次点击持平，行动项完成情况需要单独记录。',
          en: 'Clicks are flat; action completion requires separate tracking.',
        },
      ],
    ],
    outcome: 'flat',
    kind: 'research',
    draft: {
      zh: '# 复盘每次都写很多，怎么让下一次真的有人跟进？\n\n团队每次复盘列十条行动项，下次很少追踪。新模板限制同时推进三项，未确认原因保留假设，不强行归因。\n\n## 操作与核对\n\n行动项要有负责人、验证方式和复查时间。\n\n本次点击持平，行动项完成情况需要单独记录。\n\n样例中的团队、记录和结果均为虚构，发布前由编辑核对产品适用范围。',
      en: '# How do we get follow-through on retrospective actions?\n\nRetrospectives produce ten actions with little follow-up. Limit active actions to three and keep uncertain causes as hypotheses.\n\n## Steps and checks\n\nEach action needs an owner, validation method and review date.\n\nClicks are flat; action completion requires separate tracking.\n\nTeams, records and outcomes are fictional. Editorial review must confirm product scope before publication.',
    },
  },
];

export const ACME_DISCUSSIONS = [
  {
    title: {
      zh: '240 行任务怎样保留负责人和截止日期？',
      en: 'How do we keep owners and due dates when importing 240 tasks?',
    },
    text: {
      zh: '近 14 天有 5 个主题询问 Excel 任务导入，3 个还没有回复。用 240 条任务演示列映射、负责人匹配和日期格式；先试导 20 行，再检查错误行和重复记录。',
      en: 'Five threads in 14 days ask about Excel imports; three are unanswered. Demonstrate column mapping, owners and dates with 240 tasks, rehearse 20 rows and inspect failures and duplicates.',
    },
  },
  {
    title: {
      zh: '找项目管理软件，Acme 适合十人的交付团队吗？',
      en: 'Is Acme suitable for a ten-person delivery team?',
    },
    text: {
      zh: '样例查询平均排名从 11 升到 6，点击率仍约 1.2%。标题优先说明任务、排期和团队协作；将搜索意图与首屏承诺逐项核对。',
      en: 'The sample query moved from rank 11 to six but CTR remains around 1.2%. Name tasks, schedules and teamwork in the snippet and check it against the landing page.',
    },
  },
  {
    title: {
      zh: '十二名成员加三位客户，应该怎样选方案？',
      en: 'How should twelve members and three client guests choose a plan?',
    },
    text: {
      zh: '最近 28 天定价页访问明显增加，试用团队反复询问外部客户算不算席位。写出 12 位成员、3 位客户访客的协作案例，分清产品行为与计费待确认项。',
      en: 'Pricing visits grew in the latest 28 days and trial teams ask whether clients occupy seats. Show 12 members and three client guests; separate behavior from billing details awaiting confirmation.',
    },
  },
  {
    title: {
      zh: '跨团队交付时 Acme 和 Nimbus 怎么比较？',
      en: 'How should we compare Acme and Nimbus for cross-team delivery?',
    },
    text: {
      zh: '对比关键词有持续搜索，现有页面只有简短介绍。用同一份跨团队交付清单比较导入、访客、依赖与导出；Nimbus 也是虚构样例。',
      en: 'Comparison searches recur, but the current page is only a stub. Compare imports, guests, dependencies and exports with one delivery checklist. Nimbus is also a fictional sample.',
    },
  },
  {
    title: {
      zh: '任务卡在评审列，该扩大限制还是先停止开新任务？',
      en: 'Should we raise the review limit or stop starting tasks?',
    },
    text: {
      zh: '八人设计团队同时开了 19 个任务，评审列堆积。演示待做、进行中、待评审、完成四列及超限提醒，说明阻塞任务仍计入在制品。',
      en: 'An eight-person design team started 19 tasks and overloaded review. Show four columns and WIP warnings, counting blocked tasks as work in progress.',
    },
  },
  {
    title: {
      zh: '上游任务晚了两天，为什么发布日没有跟着变？',
      en: 'Why did the release date stay fixed after a two-day upstream delay?',
    },
    text: {
      zh: '网站改版项目共 18 项任务，品牌确认晚两天。稿件展示依赖链和交付日期变动，提醒手动日期与自动排期的区别。',
      en: 'A website redesign has 18 tasks and a two-day brand approval delay. Show the dependency chain and distinguish manual dates from automatic scheduling.',
    },
  },
  {
    title: {
      zh: '邀请客户后，他们能看到别的项目和内部工时吗？',
      en: 'Can invited clients see other projects or internal time entries?',
    },
    text: {
      zh: '虚构客户只需确认设计稿，不应看到内部工时和预算。验证邀请、链接访问、附件下载及撤销邀请；完成后观察相关文档搜索。',
      en: 'A fictional client approves designs without seeing internal time or budgets. Verify invitations, links, downloads and revocation, then observe documentation search.',
    },
  },
  {
    title: {
      zh: '完成任务很多，为什么客户还是说看不到进展？',
      en: 'Why do clients see little progress despite many completed tasks?',
    },
    text: {
      zh: '项目经理每周花 45 分钟拼周报。用里程碑、阻塞项、负责人和下一步替代完成任务数排名；保留延期项目的说明。',
      en: 'A manager spends 45 minutes assembling a weekly report. Use milestones, blockers, owners and next steps instead of ranking completed-task counts; retain explanations for delays.',
    },
  },
  {
    title: {
      zh: '关闭关注后为什么还收到指派提醒？',
      en: 'Why do assignment alerts continue after unfollowing?',
    },
    text: {
      zh: '初稿把关闭关注写成所有提醒都会停止。区分指派、提及、关注和每日摘要，明确重要截止日期仍需团队约定。',
      en: 'The draft says unfollowing stops every alert. Separate assignments, mentions, watching and daily digests and retain team agreements for critical deadlines.',
    },
  },
  {
    title: {
      zh: '工地现场上传照片时，下一步按钮被键盘挡住了',
      en: 'The keyboard covers the next button during a field photo upload',
    },
    text: {
      zh: '手机任务更新指南改版后搜索点击下降，移动访客停留也变短。检查图片体积和键盘遮挡，区分访问下降与提交失败。',
      en: 'Search clicks and mobile engagement declined after the task update guide changed. Inspect image weight and keyboard overlap; distinguish fewer visits from failed submissions.',
    },
  },
  {
    title: {
      zh: '选了活动模板，哪些示例任务可以删？',
      en: 'Which sample tasks can we remove from the event template?',
    },
    text: {
      zh: '模板入口改版后点击基本持平。区分活动筹备、产品迭代和客户交付需求，核对使用模板后的首次任务创建。',
      en: 'Clicks stayed flat after the template index redesign. Separate events, product iterations and client delivery; inspect first-task creation after template use.',
    },
  },
  {
    title: {
      zh: '一个人跨三个项目，负荷是按任务数算的吗？',
      en: 'Is workload across three projects counted by task number?',
    },
    text: {
      zh: '新页面上线三天，仅有少量搜索点击。说明半天请假、跨项目任务与未估时任务的处理，等完整观察窗口。',
      en: 'The page has three days of sparse search data. Explain half-day leave, cross-project tasks and unestimated work, then wait for a full observation window.',
    },
  },
  {
    title: {
      zh: '跳过国庆周会，会不会把后面的会议都取消？',
      en: 'Does skipping a holiday meeting cancel future occurrences?',
    },
    text: {
      zh: '团队周会在节假日顺延，引发重复创建问题。指南解释时区、跳过本次和停止系列，当前只有两天数据。',
      en: 'Holiday shifts caused duplicate weekly meetings. The guide explains time zones, skipping one occurrence and ending the series; only two days of data exist.',
    },
  },
  {
    title: {
      zh: '第一次用 Acme，先建项目还是先邀请所有人？',
      en: 'Should we create a project or invite everyone first?',
    },
    text: {
      zh: '把首次上手缩成建项目、建三条任务、邀请同事、完成一次交接。避免一开始要求配置完整字段体系。',
      en: 'Start with a project, three tasks, a teammate invitation and one accepted handoff, rather than configuring every field first.',
    },
  },
  {
    title: {
      zh: '客户推迟验收，怎样保留原来的承诺日期？',
      en: 'How do we retain the original commitment after delayed client acceptance?',
    },
    text: {
      zh: '客户验收从周四推迟到下周一，三条下游任务受影响。写明提出变更、评估影响和确认交付日期的负责人。',
      en: 'Client acceptance moves from Thursday to Monday and affects three downstream tasks. Name who proposes, assesses and confirms the new date.',
    },
  },
  {
    title: {
      zh: '接手项目后，怎样快速知道哪些事项还没定？',
      en: 'How do we identify unresolved decisions after taking over a project?',
    },
    text: {
      zh: '项目经理休假两周，接手人找不到评审记录。核对开放任务、最近决策、附件位置、客户联系人与升级路径。',
      en: 'A manager takes two weeks off and the cover cannot find review records. Check open tasks, decisions, attachments, client contacts and escalation routes.',
    },
  },
  {
    title: {
      zh: '客户周报能不能只展示已确认的计费工时？',
      en: 'Can a client report show only approved billable hours?',
    },
    text: {
      zh: '代理团队把所有记录工时当成客户账单，引发误解。用一周 32 小时记录说明内部讨论、返工和已确认计费时间。',
      en: 'An agency treated every logged hour as billable. Use 32 sample hours to distinguish internal discussions, rework and confirmed billable time.',
    },
  },
  {
    title: {
      zh: '周五截止在对方时区为什么变成周四？',
      en: 'Why does a Friday deadline appear on Thursday for a teammate?',
    },
    text: {
      zh: '新加坡和洛杉矶团队对“周五截止”理解不同。区分日期任务与精确时刻，例子显示两个地区的本地时间。',
      en: 'Singapore and Los Angeles teams interpret Friday differently. Separate date-only tasks from exact deadlines and show both local times.',
    },
  },
  {
    title: {
      zh: '评论太多，怎样标记最终采用的设计？',
      en: 'How do we mark the final design in a long comment thread?',
    },
    text: {
      zh: '设计评审有 46 条评论，最后采用哪个版本不明确。补一条决策摘要，关联附件版本并写明后续负责人。',
      en: 'A design review has 46 comments but no clear final version. Add a decision summary, link the selected attachment and name the next owner.',
    },
  },
  {
    title: {
      zh: '项目归档后客户还能查看验收记录吗？',
      en: 'Can clients still view acceptance records after archiving?',
    },
    text: {
      zh: '季度活动结项后仍需查看发票和复盘。解释只读归档、导出、保留权限与重新打开，避免把归档说成删除。',
      en: 'After a quarterly event, invoices and retrospectives remain needed. Explain read-only archiving, export, retained access and reopening; archiving is not deletion.',
    },
  },
  {
    title: {
      zh: '迭代中途插入紧急任务，原计划怎么留痕？',
      en: 'How do we record an urgent addition without losing the sprint baseline?',
    },
    text: {
      zh: '开发团队第三天收到紧急修复。保留最初承诺与新增事项，说明谁接受范围变更，不能把所有未完成项算成效率问题。',
      en: 'An urgent fix arrives on day three. Preserve original commitments and additions, name the scope-change owner and avoid treating every unfinished task as poor efficiency.',
    },
  },
  {
    title: {
      zh: '客户说“可以看看”，是否等于审批通过？',
      en: 'Does “looks worth reviewing” count as approval?',
    },
    text: {
      zh: '客户在评论里说“差不多”，团队误判为验收通过。明确提交版本、验收标准、修改项与正式确认。',
      en: 'A client says “almost there” in comments and the team treats it as acceptance. Specify version, criteria, requested changes and explicit confirmation.',
    },
  },
  {
    title: {
      zh: '同一条提交通知重试后为什么多了一张卡？',
      en: 'Why did retrying a commit notification create another card?',
    },
    text: {
      zh: '仓库重复推送同一事件后创建两条任务。示例按事件编号幂等处理，并解释手动修改标题时如何保留冲突记录。',
      en: 'A repeated repository event creates two tasks. Demonstrate event-ID idempotency and retain conflicts when titles were edited manually.',
    },
  },
  {
    title: {
      zh: '导出表格以后附件和评论还能一起带走吗？',
      en: 'Can we export attachments and comments with the task sheet?',
    },
    text: {
      zh: '迁移团队需要导出 36 个任务、8 个附件和评论摘要。导出后核对数量、负责人和时间，说明附件链接有效期。',
      en: 'A migration needs 36 tasks, eight attachments and comment summaries. Verify counts, owners and times and explain attachment-link expiry.',
    },
  },
  {
    title: {
      zh: '能不能用十条历史任务预测下季度全部工时？',
      en: 'Can ten past tasks predict all next-quarter effort?',
    },
    text: {
      zh: '仅有十条演示任务，无法支持准确率承诺。先记录团队如何估时与调整，不发布成功率数字。',
      en: 'Ten sample tasks cannot support an accuracy promise. Document how teams estimate and revise before publishing performance claims.',
    },
  },
  {
    title: {
      zh: '帮助文章里的导入按钮为什么和界面不同？',
      en: 'Why does the importer in the article look different from the interface?',
    },
    text: {
      zh: '旧稿使用已移除的单步导入界面。保留历史记录并指向新的预览流程，避免团队重复取用旧截图。',
      en: 'The old draft shows a retired single-step importer. Keep history and point to the preview flow so editors do not reuse outdated screenshots.',
    },
  },
  {
    title: {
      zh: '三个项目都显示 80%，为什么下周仍可能交付不了？',
      en: 'Why are three projects at 80% still at risk next week?',
    },
    text: {
      zh: '同一设计师同时参与网站、活动和产品发布。总览展示共享资源冲突与里程碑风险，不用平均完成率掩盖延期。',
      en: 'One designer works on a website, event and product launch. Show shared-resource conflicts and milestone risk instead of hiding delays behind average completion.',
    },
  },
  {
    title: {
      zh: '复盘每次都写很多，怎么让下一次真的有人跟进？',
      en: 'How do we get follow-through on retrospective actions?',
    },
    text: {
      zh: '团队每次复盘列十条行动项，下次很少追踪。新模板限制同时推进三项，未确认原因保留假设，不强行归因。',
      en: 'Retrospectives produce ten actions with little follow-up. Limit active actions to three and keep uncertain causes as hypotheses.',
    },
  },
];

export const ACME_PAGES: readonly Page[] = [
  {
    path: '/',
    title: {
      zh: 'Acme 项目管理：任务、排期与团队协作',
      en: 'Acme project management: tasks, schedules and teamwork',
    },
    description: {
      zh: '把计划拆成有负责人和截止日期的任务，用看板协作，用时间线检查依赖，用项目周报同步风险。先邀请一位同事，完成一次明确的任务交接。',
      en: 'Turn plans into owned, dated tasks. Collaborate on boards, check dependencies on timelines and share risks in weekly reports. Start with one teammate and one accepted handoff.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '把计划拆成有负责人和截止日期的任务，用看板协作，用时间线检查依赖，用项目周报同步风险。先邀请一位同事，完成一次明确的任务交接。',
          en: 'Turn plans into owned, dated tasks. Collaborate on boards, check dependencies on timelines and share risks in weekly reports. Start with one teammate and one accepted handoff.',
        },
      ],
    ],
    weight: 9,
    published: 780,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/pricing',
    title: {
      zh: '团队方案与席位说明',
      en: 'Team plans and seats',
    },
    description: {
      zh: '按团队成员和协作范围选择方案。先确认项目数量、客户访客和报表需求，再与销售核对计费范围；示例方案不构成真实报价。',
      en: 'Choose a plan by team size and collaboration scope. Check projects, client guests and reporting needs before confirming billing with sales. Sample plans are not real quotes.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '按团队成员和协作范围选择方案。先确认项目数量、客户访客和报表需求，再与销售核对计费范围；示例方案不构成真实报价。',
          en: 'Choose a plan by team size and collaboration scope. Check projects, client guests and reporting needs before confirming billing with sales. Sample plans are not real quotes.',
        },
      ],
    ],
    weight: 3.5,
    published: 777,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
    changes: [
      {
        kind: 'step',
        at: 28,
        to: 1.35,
      },
    ],
  },
  {
    path: '/docs/import-excel',
    title: {
      zh: 'Excel 任务导入',
      en: 'Import tasks from Excel',
    },
    description: {
      zh: '导入任务名称、负责人、截止日期和状态。上传前保留原始表格，预览列映射并核对日期格式；错误行保留原始行号，便于回表修正。',
      en: 'Import task titles, owners, due dates and status. Keep the source sheet, preview column mappings and check date formats. Failed rows retain source row numbers for correction.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '导入任务名称、负责人、截止日期和状态。上传前保留原始表格，预览列映射并核对日期格式；错误行保留原始行号，便于回表修正。',
          en: 'Import task titles, owners, due dates and status. Keep the source sheet, preview column mappings and check date formats. Failed rows retain source row numbers for correction.',
        },
      ],
    ],
    weight: 1.4,
    published: 774,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/compare/nimbus',
    title: {
      zh: 'Acme 与 Nimbus',
      en: 'Acme and Nimbus',
    },
    description: {
      zh: '用同一份项目交付清单评估两个虚构产品：导入现有任务、邀请客户、检查依赖、归档和导出。完整对比内容正在准备中。',
      en: 'Evaluate two fictional products using the same delivery checklist: import work, invite clients, inspect dependencies, archive and export. The full comparison is being prepared.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '用同一份项目交付清单评估两个虚构产品：导入现有任务、邀请客户、检查依赖、归档和导出。完整对比内容正在准备中。',
          en: 'Evaluate two fictional products using the same delivery checklist: import work, invite clients, inspect dependencies, archive and export. The full comparison is being prepared.',
        },
      ],
    ],
    weight: 1.75,
    published: 771,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
    flags: ['thin'],
    index: 'crawled',
  },
  {
    path: '/features/kanban',
    title: {
      zh: '团队任务看板',
      en: 'Team Kanban boards',
    },
    description: {
      zh: '待做、进行中、待评审与完成各有明确条件。为评审设置在制品限制，显示阻塞原因与负责人；超限时先处理积压，再接受新任务。',
      en: 'Define entry conditions for planned, active, review and done work. Limit review WIP and show blocker reasons and owners. Clear bottlenecks before accepting more work.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '待做、进行中、待评审与完成各有明确条件。为评审设置在制品限制，显示阻塞原因与负责人；超限时先处理积压，再接受新任务。',
          en: 'Define entry conditions for planned, active, review and done work. Limit review WIP and show blocker reasons and owners. Clear bottlenecks before accepting more work.',
        },
      ],
    ],
    weight: 2.1,
    published: 768,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/features/timeline',
    title: {
      zh: '项目时间线与依赖',
      en: 'Project timelines and dependencies',
    },
    description: {
      zh: '连接前后置任务并标记关键里程碑。上游延期时查看影响范围，手动设定的交付日期由负责人确认，基准计划保留供复盘。',
      en: 'Connect dependencies and mark key milestones. Inspect downstream effects of delays, confirm fixed dates with owners and retain the baseline for review.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '连接前后置任务并标记关键里程碑。上游延期时查看影响范围，手动设定的交付日期由负责人确认，基准计划保留供复盘。',
          en: 'Connect dependencies and mark key milestones. Inspect downstream effects of delays, confirm fixed dates with owners and retain the baseline for review.',
        },
      ],
    ],
    weight: 0.7,
    published: 765,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/docs/guests',
    title: {
      zh: '客户访客与项目权限',
      en: 'Client guests and project access',
    },
    description: {
      zh: '访客仅查看获邀项目。邀请前检查任务、附件和内部工时的可见范围，撤销后使用原链接再次验证。客户验收记录与内部预算分别管理。',
      en: 'Guests see invited projects only. Check task, attachment and internal-time visibility before inviting them, and recheck old links after revocation. Keep acceptance records separate from internal budgets.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '访客仅查看获邀项目。邀请前检查任务、附件和内部工时的可见范围，撤销后使用原链接再次验证。客户验收记录与内部预算分别管理。',
          en: 'Guests see invited projects only. Check task, attachment and internal-time visibility before inviting them, and recheck old links after revocation. Keep acceptance records separate from internal budgets.',
        },
      ],
    ],
    weight: 1.05,
    published: 762,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
    changes: [
      {
        kind: 'step',
        at: 14,
        to: 1.35,
      },
    ],
  },
  {
    path: '/docs/weekly-reports',
    title: {
      zh: '围绕交付的项目周报',
      en: 'Delivery-focused weekly reports',
    },
    description: {
      zh: '周报列出已验收里程碑、阻塞项、下一步与负责人。延期项目保留基准日期、变更理由和恢复计划，避免用任务完成数替代交付进度。',
      en: 'Report accepted milestones, blockers, next steps and owners. Delayed projects keep baseline dates, change reasons and recovery plans instead of substituting task counts for delivery progress.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '周报列出已验收里程碑、阻塞项、下一步与负责人。延期项目保留基准日期、变更理由和恢复计划，避免用任务完成数替代交付进度。',
          en: 'Report accepted milestones, blockers, next steps and owners. Delayed projects keep baseline dates, change reasons and recovery plans instead of substituting task counts for delivery progress.',
        },
      ],
    ],
    weight: 1.4,
    published: 759,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
    changes: [
      {
        kind: 'step',
        at: 14,
        to: 1.35,
      },
    ],
  },
  {
    path: '/docs/notifications',
    title: {
      zh: '提醒与每日摘要',
      en: 'Notifications and daily digests',
    },
    description: {
      zh: '分别设置指派、提及、关注和摘要。取消关注不会改变指派关系，关键截止日期仍需团队约定响应方式。定期清理过期关注项目。',
      en: 'Configure assignment alerts, mentions, watching and digests separately. Unfollowing does not change assignment; agree on responses to critical deadlines and remove stale watches.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '分别设置指派、提及、关注和摘要。取消关注不会改变指派关系，关键截止日期仍需团队约定响应方式。定期清理过期关注项目。',
          en: 'Configure assignment alerts, mentions, watching and digests separately. Unfollowing does not change assignment; agree on responses to critical deadlines and remove stale watches.',
        },
      ],
    ],
    weight: 1.75,
    published: 756,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/features/mobile',
    title: {
      zh: '手机端任务与现场记录',
      en: 'Mobile tasks and field notes',
    },
    description: {
      zh: '现场更新任务、记录阻塞与上传照片。网络不稳定时先保留文字草稿并显示上传进度；发送前核对任务与照片所属项目。',
      en: 'Update work, record blockers and upload photos in the field. On weak connections, retain text drafts and show upload progress. Check the task and project before sending.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '现场更新任务、记录阻塞与上传照片。网络不稳定时先保留文字草稿并显示上传进度；发送前核对任务与照片所属项目。',
          en: 'Update work, record blockers and upload photos in the field. On weak connections, retain text drafts and show upload progress. Check the task and project before sending.',
        },
      ],
    ],
    weight: 2.1,
    published: 753,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
    changes: [
      {
        kind: 'step',
        at: 14,
        to: 0.72,
      },
    ],
  },
  {
    path: '/templates',
    title: {
      zh: '项目模板库',
      en: 'Project templates',
    },
    description: {
      zh: '从客户交付、活动筹备或产品迭代开始。模板提供阶段与示例任务，创建后替换为自己的负责人和日期，确认所有示例占位都已处理。',
      en: 'Start with client delivery, events or product iterations. Templates provide phases and example tasks; replace owners and dates and review every placeholder.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '从客户交付、活动筹备或产品迭代开始。模板提供阶段与示例任务，创建后替换为自己的负责人和日期，确认所有示例占位都已处理。',
          en: 'Start with client delivery, events or product iterations. Templates provide phases and example tasks; replace owners and dates and review every placeholder.',
        },
      ],
    ],
    weight: 0.7,
    published: 750,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/features/workload',
    title: {
      zh: '跨项目团队负荷',
      en: 'Workload across projects',
    },
    description: {
      zh: '汇总计划工时和可用时间，单列未估时任务。请假减少可用时间，跨项目任务合并显示，避免同一人被重复排期。',
      en: 'Compare planned effort with availability and show unestimated work separately. Leave reduces availability and cross-project work shares one view to reveal double booking.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '汇总计划工时和可用时间，单列未估时任务。请假减少可用时间，跨项目任务合并显示，避免同一人被重复排期。',
          en: 'Compare planned effort with availability and show unestimated work separately. Leave reduces availability and cross-project work shares one view to reveal double booking.',
        },
      ],
    ],
    weight: 0.015,
    published: 12,
    updated: 12,
    links: ['/docs/getting-started', '/pricing', '/templates'],
    index: 'discovered',
    changes: [
      {
        kind: 'launch',
        at: 12,
        ramp: 7,
      },
    ],
  },
  {
    path: '/docs/recurring-tasks',
    title: {
      zh: '重复任务与节假日',
      en: 'Recurring tasks and holidays',
    },
    description: {
      zh: '按团队时区建立重复规则。跳过本次保留后续安排，停止系列影响未来实例；改动前预览下一次日期并检查已手动调整的任务。',
      en: 'Create recurrence in the team time zone. Skipping one keeps future occurrences; ending the series changes future instances. Preview the next date and inspect manually edited tasks.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '按团队时区建立重复规则。跳过本次保留后续安排，停止系列影响未来实例；改动前预览下一次日期并检查已手动调整的任务。',
          en: 'Create recurrence in the team time zone. Skipping one keeps future occurrences; ending the series changes future instances. Preview the next date and inspect manually edited tasks.',
        },
      ],
    ],
    weight: 1.4,
    published: 744,
    updated: 2,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/docs/getting-started',
    title: {
      zh: '建立你的第一个项目',
      en: 'Create your first project',
    },
    description: {
      zh: '创建项目并添加三条任务，为每条指定负责人和截止日期。邀请一位同事接手其中一条，完成后在评论里确认结果，再逐步扩展团队。',
      en: 'Create a project and three tasks with owners and due dates. Invite a teammate to take one, confirm its result in comments and expand the team gradually.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '创建项目并添加三条任务，为每条指定负责人和截止日期。邀请一位同事接手其中一条，完成后在评论里确认结果，再逐步扩展团队。',
          en: 'Create a project and three tasks with owners and due dates. Invite a teammate to take one, confirm its result in comments and expand the team gradually.',
        },
      ],
    ],
    weight: 1.75,
    published: 741,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
    changes: [
      {
        kind: 'step',
        at: 14,
        to: 1.35,
      },
    ],
  },
  {
    path: '/docs/milestones',
    title: {
      zh: '里程碑与交付承诺',
      en: 'Milestones and commitments',
    },
    description: {
      zh: '里程碑记录验收标准、确认人与基准日期。变更时记录原因及影响，通知相关人员，并保留原承诺与新的确认日期。',
      en: 'Milestones record acceptance criteria, approvers and baseline dates. Changes retain reasons, impacts, notifications, original commitments and confirmed replacement dates.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '里程碑记录验收标准、确认人与基准日期。变更时记录原因及影响，通知相关人员，并保留原承诺与新的确认日期。',
          en: 'Milestones record acceptance criteria, approvers and baseline dates. Changes retain reasons, impacts, notifications, original commitments and confirmed replacement dates.',
        },
      ],
    ],
    weight: 2.1,
    published: 738,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/docs/project-handover',
    title: {
      zh: '项目交接检查表',
      en: 'Project handover checklist',
    },
    description: {
      zh: '交接包含开放任务、未决问题、最近决定、附件位置、客户联系人和升级路径。接收人确认尚未完成的事项后，交接才算完成。',
      en: 'Handover includes open tasks, pending decisions, recent agreements, attachments, client contacts and escalation routes. Finish only after the receiver accepts outstanding work.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '交接包含开放任务、未决问题、最近决定、附件位置、客户联系人和升级路径。接收人确认尚未完成的事项后，交接才算完成。',
          en: 'Handover includes open tasks, pending decisions, recent agreements, attachments, client contacts and escalation routes. Finish only after the receiver accepts outstanding work.',
        },
      ],
    ],
    weight: 0.7,
    published: 735,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/docs/time-tracking',
    title: {
      zh: '计划、实际与计费工时',
      en: 'Planned, actual and billable time',
    },
    description: {
      zh: '记录实际投入并保留修改历史。计划用于排期，实际用于复盘，可计费时间经过约定与审核，三种口径分别呈现。',
      en: 'Log actual effort with edit history. Planned time supports scheduling, actual time supports review and billable time requires agreement and approval. Keep the definitions separate.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '记录实际投入并保留修改历史。计划用于排期，实际用于复盘，可计费时间经过约定与审核，三种口径分别呈现。',
          en: 'Log actual effort with edit history. Planned time supports scheduling, actual time supports review and billable time requires agreement and approval. Keep the definitions separate.',
        },
      ],
    ],
    weight: 1.05,
    published: 732,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/features/calendar',
    title: {
      zh: '日历与跨时区协作',
      en: 'Calendars across time zones',
    },
    description: {
      zh: '全天任务以日期呈现，精确截止时刻显示当地时间。跨时区会议查看参与者的时间，节假日调整保留原安排和原因。',
      en: 'All-day tasks show dates while precise deadlines show local times. Review participant times for cross-zone meetings and retain original plans and reasons when holidays change them.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '全天任务以日期呈现，精确截止时刻显示当地时间。跨时区会议查看参与者的时间，节假日调整保留原安排和原因。',
          en: 'All-day tasks show dates while precise deadlines show local times. Review participant times for cross-zone meetings and retain original plans and reasons when holidays change them.',
        },
      ],
    ],
    weight: 1.4,
    published: 729,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/docs/comments',
    title: {
      zh: '任务评论与决定记录',
      en: 'Task comments and decisions',
    },
    description: {
      zh: '讨论完成后补上决定摘要、采用的附件版本与下一步负责人。引用具体评论与版本，保留未解决的问题和复查时间。',
      en: 'Close discussions with a decision summary, selected attachment version and next owner. Link exact comments and versions and retain pending questions and review times.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '讨论完成后补上决定摘要、采用的附件版本与下一步负责人。引用具体评论与版本，保留未解决的问题和复查时间。',
          en: 'Close discussions with a decision summary, selected attachment version and next owner. Link exact comments and versions and retain pending questions and review times.',
        },
      ],
    ],
    weight: 1.75,
    published: 726,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/docs/archive',
    title: {
      zh: '项目归档与恢复',
      en: 'Archive and reopen projects',
    },
    description: {
      zh: '结项前核对验收记录、未完成任务和访客权限。归档保留历史，不等于删除；恢复后重新确认提醒、负责人和后续安排。',
      en: 'Review acceptance, open tasks and guest access before closing. Archiving retains history and is not deletion. Reopening requires checking alerts, owners and next steps.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '结项前核对验收记录、未完成任务和访客权限。归档保留历史，不等于删除；恢复后重新确认提醒、负责人和后续安排。',
          en: 'Review acceptance, open tasks and guest access before closing. Archiving retains history and is not deletion. Reopening requires checking alerts, owners and next steps.',
        },
      ],
    ],
    weight: 2.1,
    published: 723,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/templates/sprint',
    title: {
      zh: '两周迭代模板',
      en: 'Two-week sprint template',
    },
    description: {
      zh: '记录迭代目标、初始承诺、插单和范围变化。计划内与计划外任务分别复盘，保留取舍理由，避免通过移动任务改写历史。',
      en: 'Record goals, original commitments, urgent additions and scope changes. Review planned and unplanned work separately and retain trade-offs rather than rewriting history by moving tasks.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '记录迭代目标、初始承诺、插单和范围变化。计划内与计划外任务分别复盘，保留取舍理由，避免通过移动任务改写历史。',
          en: 'Record goals, original commitments, urgent additions and scope changes. Review planned and unplanned work separately and retain trade-offs rather than rewriting history by moving tasks.',
        },
      ],
    ],
    weight: 0.7,
    published: 720,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/docs/approvals',
    title: {
      zh: '客户验收与修改项',
      en: 'Client acceptance and revisions',
    },
    description: {
      zh: '提交明确的附件版本和验收标准。客户选择确认或提出修改，含糊的评论不替代正式确认；修改后关联新的版本。',
      en: 'Submit an exact attachment version and acceptance criteria. Clients confirm or request changes; ambiguous comments are not acceptance. Revisions link a new version.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '提交明确的附件版本和验收标准。客户选择确认或提出修改，含糊的评论不替代正式确认；修改后关联新的版本。',
          en: 'Submit an exact attachment version and acceptance criteria. Clients confirm or request changes; ambiguous comments are not acceptance. Revisions link a new version.',
        },
      ],
    ],
    weight: 1.05,
    published: 717,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/docs/integrations',
    title: {
      zh: '任务同步与重复事件',
      en: 'Task sync and duplicate events',
    },
    description: {
      zh: '使用外部事件编号防止重复创建，重试从确认点继续。遇到手动编辑冲突时保留两边内容，交负责人确认。',
      en: 'Prevent duplicate creation with external event IDs and resume retries from checkpoints. Keep both sides of conflicts with manual edits for owner review.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '使用外部事件编号防止重复创建，重试从确认点继续。遇到手动编辑冲突时保留两边内容，交负责人确认。',
          en: 'Prevent duplicate creation with external event IDs and resume retries from checkpoints. Keep both sides of conflicts with manual edits for owner review.',
        },
      ],
    ],
    weight: 1.4,
    published: 714,
    updated: 18,
    links: [
      '/docs/getting-started',
      '/pricing',
      '/templates',
      '/docs/integrations/webhooks-old',
    ],
    flags: ['broken-link'],
  },
  {
    path: '/docs/export',
    title: {
      zh: '导出任务与附件',
      en: 'Export tasks and attachments',
    },
    description: {
      zh: '分别导出任务表格、附件包和评论摘要。核对总数、负责人、时区与缺失文件，导出链接到期后重新申请。',
      en: 'Export task sheets, attachment archives and comment summaries separately. Verify totals, owners, time zones and missing files; request a new link after expiry.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '分别导出任务表格、附件包和评论摘要。核对总数、负责人、时区与缺失文件，导出链接到期后重新申请。',
          en: 'Export task sheets, attachment archives and comment summaries separately. Verify totals, owners, time zones and missing files; request a new link after expiry.',
        },
      ],
    ],
    weight: 1.75,
    published: 711,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
    changes: [
      {
        kind: 'step',
        at: 14,
        to: 1.35,
      },
    ],
  },
  {
    path: '/blog/estimation',
    title: {
      zh: '团队如何校准任务估时',
      en: 'How teams calibrate task estimates',
    },
    description: {
      zh: '比较同类任务的计划与实际投入，记录范围变化和未知事项。少量历史不能证明预测准确率，估时需持续复查。',
      en: 'Compare planned and actual effort for similar tasks and record scope changes and unknowns. Small histories do not establish prediction accuracy; revisit estimates regularly.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '比较同类任务的计划与实际投入，记录范围变化和未知事项。少量历史不能证明预测准确率，估时需持续复查。',
          en: 'Compare planned and actual effort for similar tasks and record scope changes and unknowns. Small histories do not establish prediction accuracy; revisit estimates regularly.',
        },
      ],
    ],
    weight: 2.1,
    published: 708,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/features/portfolio',
    title: {
      zh: '跨项目交付总览',
      en: 'Portfolio delivery overview',
    },
    description: {
      zh: '汇总多个项目的里程碑、风险和共享资源。每张风险卡包含负责人和复查时间，整体完成率不能代替具体交付承诺。',
      en: 'Review milestones, risks and shared resources across projects. Risk cards name an owner and review time; overall completion does not replace individual delivery commitments.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '汇总多个项目的里程碑、风险和共享资源。每张风险卡包含负责人和复查时间，整体完成率不能代替具体交付承诺。',
          en: 'Review milestones, risks and shared resources across projects. Risk cards name an owner and review time; overall completion does not replace individual delivery commitments.',
        },
      ],
    ],
    weight: 0.7,
    published: 705,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/blog/retrospectives',
    title: {
      zh: '让复盘行动有人跟进',
      en: 'Follow through on retrospective actions',
    },
    description: {
      zh: '每轮选择最多三项改进，指定负责人、验证方法和复查日期。尚未确认的原因标为假设，下次会议先核对上次行动。',
      en: 'Choose up to three improvements with owners, validation methods and review dates. Label uncertain causes as hypotheses and review previous actions first next time.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '每轮选择最多三项改进，指定负责人、验证方法和复查日期。尚未确认的原因标为假设，下次会议先核对上次行动。',
          en: 'Choose up to three improvements with owners, validation methods and review dates. Label uncertain causes as hypotheses and review previous actions first next time.',
        },
      ],
    ],
    weight: 1.05,
    published: 702,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/contact',
    title: {
      zh: '预约团队演示',
      en: 'Book a team walkthrough',
    },
    description: {
      zh: '',
      en: '',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '说明团队规模、当前工具和最想解决的一次协作问题。演示围绕你的任务交接过程展开。',
          en: 'Describe your team, current tools and a collaboration problem. The walkthrough follows a task handoff.',
        },
      ],
    ],
    weight: 1.4,
    published: 699,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
    flags: ['thin'],
  },
  {
    path: '/showcase',
    title: {
      zh: '客户交付团队的示例故事',
      en: 'Sample client-delivery stories',
    },
    description: {
      zh: '虚构的 Acme Studio 团队以十二位成员和三位客户访客演示网站交付：先导入任务，再确认里程碑，最后整理验收和复盘。',
      en: 'The fictional Acme Studio team demonstrates website delivery with twelve members and three client guests: import tasks, confirm milestones, then organize acceptance and review.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '虚构的 Acme Studio 团队以十二位成员和三位客户访客演示网站交付：先导入任务，再确认里程碑，最后整理验收和复盘。',
          en: 'The fictional Acme Studio team demonstrates website delivery with twelve members and three client guests: import tasks, confirm milestones, then organize acceptance and review.',
        },
      ],
    ],
    weight: 1.75,
    published: 696,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
    flags: ['missing-alt'],
  },
  {
    path: '/changelog',
    title: {
      zh: 'Acme 更新记录',
      en: 'Acme release notes',
    },
    description: {
      zh: '2.4.2 修复重复任务的时区显示；2.4.1 改善 Excel 导入预览；2.4.0 新增客户访客与项目交接检查表。',
      en: '2.4.2 corrects time-zone display for recurring tasks; 2.4.1 improves Excel import previews; 2.4.0 adds client guests and project handover checks.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '2.4.2 修复重复任务的时区显示；2.4.1 改善 Excel 导入预览；2.4.0 新增客户访客与项目交接检查表。',
          en: '2.4.2 corrects time-zone display for recurring tasks; 2.4.1 improves Excel import previews; 2.4.0 adds client guests and project handover checks.',
        },
      ],
    ],
    weight: 2.1,
    published: 693,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
  {
    path: '/products/crm',
    title: {
      zh: 'Acme CRM 销售协作',
      en: 'Acme CRM sales collaboration',
    },
    description: {
      zh: '销售团队使用独立的 Acme CRM 管理客户、商机、报价与续约；项目交付团队使用 Acme 管理任务与里程碑。',
      en: 'Sales teams use the separate Acme CRM product for accounts, deals, quotes and renewals; delivery teams use Acme for tasks and milestones.',
    },
    sections: [
      [
        {
          zh: '协作方式',
          en: 'How it works',
        },
        {
          zh: '销售团队使用独立的 Acme CRM 管理客户、商机、报价与续约；项目交付团队使用 Acme 管理任务与里程碑。',
          en: 'Sales teams use the separate Acme CRM product for accounts, deals, quotes and renewals; delivery teams use Acme for tasks and milestones.',
        },
      ],
    ],
    weight: 0.7,
    published: 690,
    updated: 18,
    links: ['/docs/getting-started', '/pricing', '/templates'],
  },
];

const DOCUMENTS: readonly [string, string, L, L][] = [
  [
    'positioning',
    'product',
    {
      zh: '产品定位与边界',
      en: 'Product positioning and scope',
    },
    {
      zh: 'Acme 是虚构的项目管理产品，面向 5–50 人的项目交付、设计、产品和运营团队。核心是任务、看板、时间线、里程碑、客户访客和团队周报。Acme CRM 是另一独立演示项目，负责客户与商机。',
      en: 'Acme is a fictional project management product for delivery, design, product and operations teams of 5–50. It centers on tasks, boards, timelines, milestones, client guests and weekly reports. Acme CRM is a separate demo project for accounts and deals.',
    },
  ],
  [
    'personas',
    'customer',
    {
      zh: '团队角色与日常问题',
      en: 'Team roles and daily needs',
    },
    {
      zh: '项目经理关心依赖与交付承诺；执行者关心下一步和阻塞；客户只需查看获邀内容并确认版本。虚构的 Acme Studio 有十二位成员和三位客户访客，每周交付网站与活动项目。',
      en: 'Managers care about dependencies and commitments, contributors about next actions and blockers, and clients about invited material and approvals. Fictional Acme Studio has twelve members and three client guests delivering websites and events weekly.',
    },
  ],
  [
    'migration',
    'product',
    {
      zh: '从 Excel 迁移任务',
      en: 'Move tasks from Excel',
    },
    {
      zh: '保留源文件和行号。先试导二十行，核对负责人、状态和日期；任务同名不能直接当作重复。失败行修正后重试同一批次，核对新增、更新与跳过数量。240 条任务为虚构演练。',
      en: 'Keep source files and row numbers. Rehearse twenty rows and check owners, status and dates; titles alone do not establish duplicates. Retry corrected rows and compare created, updated and skipped counts. The 240 tasks are a fictional rehearsal.',
    },
  ],
  [
    'permissions',
    'product',
    {
      zh: '成员、访客与交接',
      en: 'Members, guests and handovers',
    },
    {
      zh: '成员参与项目工作，访客只查看获邀内容。验证列表、直达链接、附件和撤销后访问。交接必须由接收人确认，项目结束不代表访客权限自动撤销。',
      en: 'Members contribute to project work while guests see invited content. Verify lists, direct links, attachments and access after revocation. Receiving owners confirm handovers; completion does not automatically revoke guest access.',
    },
  ],
  [
    'voice',
    'other',
    {
      zh: '内容语气与案例规范',
      en: 'Voice and example standards',
    },
    {
      zh: '用具体协作动作说明价值，不写“永不延期”“自动解决所有协作问题”。案例、竞品 Nimbus、团队和指标均为虚构样例，不代表真实产品能力。尚未验证的计费和功能列为待确认。',
      en: 'Explain value through concrete actions. Avoid “never miss a deadline” or “solve every collaboration issue.” Cases, competitor Nimbus, teams and metrics are fictional. Mark unverified billing and capabilities as pending.',
    },
  ],
  [
    'calendar',
    'other',
    {
      zh: '四周内容安排',
      en: 'Four-week content calendar',
    },
    {
      zh: '第一周补 Excel 导入与首页摘要；第二周完成定价案例与访客指南；第三周评审时间线、看板和客户验收；第四周复盘手机端表现与跨项目负荷。每周留一个社区答疑位置。',
      en: 'Week one: Excel imports and homepage snippets. Week two: pricing examples and guest guidance. Week three: timelines, boards and acceptance. Week four: mobile results and workload. Reserve a weekly community support slot.',
    },
  ],
  [
    'measurement',
    'industry',
    {
      zh: '指标口径与观察窗口',
      en: 'Metric definitions and observation windows',
    },
    {
      zh: '任务完成不等于项目验收，访问增加不等于试用成功。比较同星期七天窗口，明确设备、渠道和页面。保留下降、持平、样本不足与等待状态；演示结果不能证明真实业务因果。',
      en: 'Task completion is not project acceptance; visits are not successful trials. Compare matching seven-day windows by device, channel and page. Preserve declines, flat results, insufficient evidence and waiting; demo outcomes do not prove real causation.',
    },
  ],
  [
    'delivery',
    'other',
    {
      zh: '交付与复盘检查表',
      en: 'Delivery and retrospective checklist',
    },
    {
      zh: '交付前核对版本、验收标准与确认人；结项保留附件、决策和未完成事项。复盘最多同时推进三项改善，每项有负责人、验证方式和复查日期。',
      en: 'Before delivery confirm version, acceptance criteria and approver. Closing retains attachments, decisions and unfinished work. Pursue at most three retrospective actions with owners, validation and review dates.',
    },
  ],
];

export function acmeDocuments(language: string): DemoContent['documents'] {
  const lang = language === 'en-US' ? 'en' : 'zh';
  return DOCUMENTS.map(([key, category, title, text]) => ({
    key,
    category,
    title: title[lang],
    text: text[lang],
  }));
}

export function acmeOpportunities(
  language: string,
): DemoContent['opportunities'] {
  const lang = language === 'en-US' ? 'en' : 'zh';
  const copy = (value: L) => value[lang];
  const selected = [0, 1, 2, 3, 4, 14, 16, 17, 20, 21, 22, 26, 5, 15, 24, 25];
  return {
    notice: copy(
      t(
        '人工编写的项目管理演示；团队、指标和反馈均为虚构。',
        'Hand-authored project management demo; teams, metrics and feedback are fictional.',
      ),
    ),
    limitation: copy(
      t(
        '样例用于展示判断过程，执行前需核对实际产品范围。',
        'Examples demonstrate decisions; confirm actual product scope before execution.',
      ),
    ),
    priorityHigh: copy(
      t(
        '直接影响首次迁移或项目交付。',
        'Directly affects first migration or delivery.',
      ),
    ),
    priorityOther: copy(
      t(
        '已有具体问题，先确认范围再安排复核。',
        'A concrete issue exists; confirm scope before review.',
      ),
    ),
    audience: copy(
      t(
        '项目经理、团队成员和客户协作负责人',
        'Project managers, contributors and client collaboration owners',
      ),
    ),
    observations: [
      copy(
        t(
          '本周优先解决 Excel 导入、首页搜索摘要与客户协作说明；负荷页继续积累样本。',
          'Prioritize Excel imports, homepage snippets and client collaboration this week; collect more workload-page evidence.',
        ),
      ),
    ],
    doReason: copy(
      t(
        '样例搜索或社区反馈指向明确的协作问题。',
        'Sample search or community evidence identifies a concrete collaboration issue.',
      ),
    ),
    skipReason: copy(
      t(
        '证据不足或已被新版本替代，暂不追加任务。',
        'Evidence is insufficient or the new version supersedes it; do not add work yet.',
      ),
    ),
    briefs: selected.map((index, order) => {
      const s = ACME_STORIES[index];
      return [
        s.key,
        copy(s.title),
        copy(s.brief),
        copy(s.comments[0][1]),
        copy(s.comments[1][1]),
        copy(ACME_DISCUSSIONS[index].title),
        s.path,
        ['discourse', 'gsc', 'ga4', 'keywords'][order % 4],
        order < 4 ? 'high' : 'medium',
      ];
    }),
    watches: [
      [
        'workload',
        t(
          '负荷页仍在积累有效样本',
          'Workload page is still gathering evidence',
        ),
        t(
          '新页面已被发现，观察窗口尚不完整。',
          'The new page is discovered but the window is incomplete.',
        ),
        t(
          '等待完整七天并核对收录情况。',
          'Wait seven complete days and check indexing.',
        ),
      ],
      [
        'recurring',
        t(
          '重复任务指南等待完整观察窗口',
          'Recurring-task guide awaits a full window',
        ),
        t(
          '指南调整后的访问仍受星期结构影响。',
          'Traffic after the guide revision still varies by weekday.',
        ),
        t('比较同星期的七天数据。', 'Compare matching seven-day windows.'),
      ],
      [
        'mobile',
        t(
          '手机端访问下降是否来自图片加载',
          'Is mobile decline related to image loading?',
        ),
        t(
          '访问下降与新版上传区同时出现，尚不能推断因果。',
          'Traffic decline coincides with the upload update, without proving causation.',
        ),
        t(
          '按设备拆分，核对加载与提交错误。',
          'Split by device and inspect load and submission errors.',
        ),
      ],
      [
        'templates',
        t('模板入口变化暂时持平', 'Template changes remain flat'),
        t(
          '活动、交付和迭代模板的需求不同。',
          'Events, delivery and sprint templates serve different needs.',
        ),
        t(
          '补充三个团队访谈与首次任务创建记录。',
          'Add three team interviews and first-task creation records.',
        ),
      ],
      [
        'github',
        t(
          '集成指南的搜索增长是否持续',
          'Will integration-guide search growth persist?',
        ),
        t(
          '搜索增长需要和指南访问、集成尝试一起核对。',
          'Check search growth alongside guide visits and integration attempts.',
        ),
        t('等同一周数据齐全后再判断。', 'Wait for aligned weekly evidence.'),
      ],
      [
        'guest',
        t(
          '访客指南访问改善后继续观察激活',
          'Watch activation after guest-guide improvement',
        ),
        t(
          '搜索点击上升，完成邀请不代表客户已经接手。',
          'Search clicks rose; invitations are not accepted handoffs.',
        ),
        t(
          '检查客户首次查看与明确确认。',
          'Check first client views and explicit acceptance.',
        ),
      ],
    ].map(([key, title, fact, waiting]) => [
      key as string,
      copy(title as L),
      copy(fact as L),
      copy(waiting as L),
    ]),
    normal: [
      copy(t('品牌搜索保持平稳', 'Brand search remains stable')),
      copy(
        t(
          '日常波动没有显示新的协作障碍。',
          'Routine variation reveals no new collaboration blocker.',
        ),
      ),
    ],
    goal: {
      intent: copy(
        t(
          '让试用团队顺利从 Excel 迁移，并完成第一次清楚的项目交付。',
          'Help trial teams move from Excel and complete a clear first delivery.',
        ),
      ),
      audience: copy(
        t(
          '项目经理、设计和交付团队',
          'Project managers, design and delivery teams',
        ),
      ),
      focus: copy(
        t(
          '任务导入、排期、访客协作和项目交接',
          'Task imports, schedules, guest collaboration and handovers',
        ),
      ),
      progress: copy(
        t(
          '以任务接手和里程碑验收为进展；全部指标为虚构演示。',
          'Track accepted handoffs and milestones; all metrics are fictional.',
        ),
      ),
    },
  };
}
