import { t, type L } from './world/script/types.js';

/**
 * Two of the main demo project's blog articles as its CMS holds them (world/cms.ts), published there long ago, so
 * Content workshop › What to make › WeChat layout has a body to lay out (Content workshop PR 3). Between them they
 * show what the layout handles: headings, a list, a numbered list, bold and italic text, a quote, a code block, a
 * table, and links to the site, to another site and to a relative address, which become references. The other
 * articles are not in the CMS, so their WeChat layout row says the body cannot be read. Titles and descriptions are
 * the Library's (workshop-content.ts).
 */
export type WorkshopCmsArticle = {
  id: number;
  slug: string;
  title: L;
  description: L;
  body: L;
  /** Days before now it was last changed in the CMS. */
  updatedDaysAgo: number;
};

const FENCE = '```';

const MEETING_NOTES: WorkshopCmsArticle = {
  id: 140,
  slug: 'ai-meeting-notes',
  title: t(
    '用 AI 把会议纪要整理成任务',
    'Turning meeting notes into tasks with AI',
  ),
  description: t(
    'AI 从会议纪要里找出待办、负责人和截止日期，生成任务草稿；人确认后才写进项目，没有负责人的条目留给会议主持人分配。',
    'AI picks out action items, owners and due dates from meeting notes and drafts tasks; nothing reaches the project until a person confirms, and items without an owner go back to the meeting host.',
  ),
  body: t(
    [
      '# 用 AI 把会议纪要整理成任务',
      '',
      '开完会，纪要里往往埋着十几条待办，却没人把它们变成任务。我们试了一个办法：让 AI 先起草，人再确认。',
      '',
      '## 先找出待办',
      '',
      'AI 只提取明确的待办：谁、做什么、什么时候。讨论和结论留在纪要里，不变成任务。一条待办至少要有这三样：',
      '',
      '- **负责人**：纪要里点到名字的人；',
      '- **要做的事**：一句话说清楚，动词开头；',
      '- **截止日期**：写了日期就用，没写就留空。',
      '',
      '下面是我们给 AI 的提示词，可以直接复制使用：',
      '',
      `${FENCE}text`,
      '从下面的会议纪要里找出待办事项。',
      '每条写成：负责人 | 要做的事 | 截止日期',
      '没有明确负责人的，负责人写“待分配”。',
      '只列待办，不要总结讨论内容。',
      FENCE,
      '',
      '## 人确认后再写入',
      '',
      '任务草稿先给会议主持人确认，负责人不明确的条目由主持人分配。确认后的任务会带上会议链接，方便之后回看上下文。',
      '',
      '> 我们的规则是：AI 只起草，不直接建任务。每条任务都要有人点过“确认”。',
      '',
      '## 开始之前',
      '',
      '如果团队还没有固定的纪要格式，可以先用[会议纪要模板](https://acme.example/templates/meeting-notes)，再读一读[项目启动会怎么开](/blog/project-kickoff)。纪要的写法也可以参考 [Nimbus 博客上的这篇](https://nimbus.example/blog/meeting-notes)。',
    ].join('\n'),
    [
      '# Turning meeting notes into tasks with AI',
      '',
      'After a meeting, the notes often hide a dozen action items that nobody turns into tasks. We tried one way out: the AI drafts, and a person confirms.',
      '',
      '## Find the action items first',
      '',
      'AI only extracts clear action items: who, what and by when. Discussion and conclusions stay in the notes. An action item needs all three:',
      '',
      '- **Owner**: the person the notes name;',
      '- **What to do**: one sentence that starts with a verb;',
      '- **Due date**: the date the notes give, or none.',
      '',
      'This is the prompt we give the AI; copy it as it is:',
      '',
      `${FENCE}text`,
      'Find the action items in the meeting notes below.',
      'Write each as: owner | what to do | due date',
      'Where no owner is named, write "unassigned".',
      'List action items only; do not summarize the discussion.',
      FENCE,
      '',
      '## A person confirms before anything is written',
      '',
      'The meeting host confirms the drafts and assigns items whose owner is unclear. Each confirmed task links back to the meeting, so its context is a click away.',
      '',
      '> Our rule: the AI drafts and never creates a task itself. Someone clicks Confirm on every one.',
      '',
      '## Before you start',
      '',
      'If your team has no fixed format for notes yet, start from the [meeting notes template](https://acme.example/templates/meeting-notes) and read [how to run a kickoff](/blog/project-kickoff). For how to write the notes, [this post on the Nimbus blog](https://nimbus.example/blog/meeting-notes) helps too.',
    ].join('\n'),
  ),
  updatedDaysAgo: 7,
};

const CHOOSE_TOOL: WorkshopCmsArticle = {
  id: 141,
  slug: 'choose-pm-tool',
  title: t(
    '项目管理工具怎么选：电子表格、Acme 和 Nimbus 对比',
    'Choosing a project management tool: spreadsheets, Acme and Nimbus compared',
  ),
  description: t(
    '先看团队规模和协作方式，再看功能。电子表格适合什么时候，Acme 和 Nimbus 各适合什么团队，迁移前要准备什么。',
    'Start from team size and how you work, then features: when a spreadsheet is enough, which teams Acme and Nimbus suit, and what to prepare before moving.',
  ),
  body: t(
    [
      '# 项目管理工具怎么选：电子表格、Acme 和 Nimbus 对比',
      '',
      '选工具时，先看团队规模和协作方式，再看功能清单。',
      '',
      '## 先看团队规模和协作方式',
      '',
      '人数、要不要跨团队排期、客户是否需要看进度，比功能清单更能决定该用什么。',
      '',
      '## 电子表格适合什么时候',
      '',
      '五人以内、任务不多、很少跨团队排期时，电子表格完全够用。出现下面两种情况，再考虑换工具：',
      '',
      '1. 同一个任务改出了多个版本，没人知道哪个是最新的；',
      '2. 延期之后，下游的人最后才知道。',
      '',
      '## Acme 和 Nimbus 的差别',
      '',
      '| | 电子表格 | Acme | Nimbus |',
      '| --- | --- | --- | --- |',
      '| 看板和时间线 | 手工维护 | 有 | 有 |',
      '| 客户访客 | 不支持 | 支持 | 不支持 |',
      '| 交付验收 | 不支持 | 支持 | 需要插件 |',
      '| 适合 | 五人以内的小团队 | 做客户项目的团队 | 内部研发团队 |',
      '',
      '两者都有看板和时间线。Acme 侧重客户协作：客户访客、交付验收和项目周报；Nimbus 侧重内部研发流程。',
      '',
      '*竞品与对比均为虚构样例。*',
      '',
      '## 迁移前要准备什么',
      '',
      '保留原表行号，先试导 20 行，核对负责人、状态和日期。同名任务不能直接当成重复。详细步骤见[从电子表格导入](https://acme.example/docs/import-spreadsheet)。',
    ].join('\n'),
    [
      '# Choosing a project management tool: spreadsheets, Acme and Nimbus compared',
      '',
      'When you choose a tool, start from team size and how you work, then the feature list.',
      '',
      '## Start from team size and how you work',
      '',
      'Headcount, whether schedules cross teams and whether clients need to see progress decide more than any feature list.',
      '',
      '## When a spreadsheet is enough',
      '',
      'For five people or fewer, a modest task list and little cross-team scheduling, a spreadsheet is fine. Consider a tool once either of these happens:',
      '',
      '1. One task forks into versions and nobody knows which is current;',
      '2. A slip reaches the people downstream last.',
      '',
      '## Where Acme and Nimbus differ',
      '',
      '| | Spreadsheet | Acme | Nimbus |',
      '| --- | --- | --- | --- |',
      '| Boards and timelines | Kept by hand | Yes | Yes |',
      '| Client guests | No | Yes | No |',
      '| Delivery sign-off | No | Yes | With a plugin |',
      '| Suits | Teams of five or fewer | Teams doing client work | Internal engineering teams |',
      '',
      'Both have boards and timelines. Acme leans toward client work: client guests, delivery sign-off and weekly reports; Nimbus toward internal engineering workflows.',
      '',
      '*The competitor and the comparison are fictional.*',
      '',
      '## What to prepare before moving',
      '',
      'Keep source row numbers, rehearse an import with 20 rows, and check owners, status and dates. Tasks with the same title are not duplicates. The steps are in [importing from a spreadsheet](https://acme.example/docs/import-spreadsheet).',
    ].join('\n'),
  ),
  updatedDaysAgo: 18,
};

export const WORKSHOP_CMS_ARTICLES: readonly WorkshopCmsArticle[] = [
  MEETING_NOTES,
  CHOOSE_TOOL,
];
