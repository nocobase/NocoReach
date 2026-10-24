import {
  t,
  type AiQuestion,
  type Backlink,
  type Competitor,
  type PackageLine,
  type TrendTerm,
} from './types.js';

export const COMPETITORS: Competitor[] = [
  {
    name: 'FlowGrove',
    domain: 'flowgrove.example',
    tagline: t(
      '面向运营团队的云端工作流平台',
      'The cloud workflow platform for operations teams',
    ),
    size: 1.6,
    pages: [
      [
        '/',
        t(
          'FlowGrove：让运营流程自动运转',
          'FlowGrove: operations that run themselves',
        ),
        t(
          '拖拽式流程设计，300+ 集成。',
          'Drag-and-drop processes and 300+ integrations.',
        ),
      ],
      [
        '/pricing',
        t('FlowGrove 价格', 'FlowGrove pricing'),
        t(
          '按流程执行次数计费，团队版每月起。',
          'Priced by workflow runs, with monthly team plans.',
        ),
      ],
      [
        '/templates/approval',
        t('审批流程模板', 'Approval templates'),
        t(
          '采购、报销和请假审批模板。',
          'Purchase, expense and leave approval templates.',
        ),
      ],
      [
        '/blog/ai-agents',
        t(
          'AI Agent 如何接管重复工作',
          'How AI agents take over repetitive work',
        ),
        t('三个运营团队的 AI 实践。', 'Three operations teams using AI.'),
      ],
      [
        '/docs/workflows',
        t('工作流指南', 'Workflow guide'),
        t('触发器、动作和错误处理。', 'Triggers, actions and error handling.'),
      ],
      [
        '/compare/nocobase',
        t('FlowGrove 与 NocoBase 对比', 'FlowGrove vs NocoBase'),
        t('云端托管与私有部署的取舍。', 'Hosted cloud versus self-hosting.'),
      ],
    ],
  },
  {
    name: 'StackMeadow',
    domain: 'stackmeadow.example',
    tagline: t(
      '开发者优先的内部工具构建器',
      'The developer-first internal tool builder',
    ),
    size: 1.1,
    pages: [
      [
        '/',
        t(
          'StackMeadow：用代码和组件搭内部工具',
          'StackMeadow: internal tools from code and components',
        ),
        t(
          '连接数据库和 API，几分钟生成管理后台。',
          'Connect databases and APIs and get an admin panel in minutes.',
        ),
      ],
      [
        '/pricing',
        t('StackMeadow 价格', 'StackMeadow pricing'),
        t(
          '免费版 5 个用户，团队版按席位。',
          'Free for five users, then per seat.',
        ),
      ],
      [
        '/docs/permissions',
        t('权限控制', 'Access control'),
        t('应用级和页面级权限。', 'App- and page-level permissions.'),
      ],
      [
        '/blog/self-hosting',
        t(
          '现在可以私有部署 StackMeadow 了',
          'You can now self-host StackMeadow',
        ),
        t('企业版支持 Docker 部署。', 'The enterprise edition runs on Docker.'),
      ],
    ],
  },
  {
    name: 'Gridline',
    domain: 'gridline.example',
    tagline: t('像表格一样好用的数据库', 'A database as easy as a spreadsheet'),
    size: 2.3,
    pages: [
      [
        '/',
        t(
          'Gridline：团队的在线数据库',
          'Gridline: the online database for teams',
        ),
        t(
          '表格界面，关系字段，自动化。',
          'A spreadsheet interface with relations and automations.',
        ),
      ],
      [
        '/pricing',
        t('Gridline 价格', 'Gridline pricing'),
        t('每个工作区 5 万条记录起。', 'From 50,000 records per workspace.'),
      ],
      [
        '/templates/crm',
        t('CRM 模板', 'CRM template'),
        t('销售漏斗和联系人管理。', 'Sales pipeline and contacts.'),
      ],
      [
        '/blog/spreadsheet-to-database',
        t('从表格到数据库', 'From spreadsheet to database'),
        t('团队迁移的五个步骤。', 'Five steps for a team migration.'),
      ],
    ],
  },
];

export const BACKLINKS: Backlink[] = [
  {
    domain: 'opensource-weekly.example',
    path: '/issues/312',
    title: t('开源周刊第 312 期', 'Open Source Weekly #312'),
    anchor: t('NocoBase 2.0', 'NocoBase 2.0'),
    target: '/blog/release-v2',
    rank: 61,
    dofollow: true,
    firstSeen: 17,
  },
  {
    domain: 'devtools-review.example',
    path: '/no-code-platforms-2026',
    title: t('2026 年无代码平台横评', 'No-code platforms compared, 2026'),
    anchor: t('开源无代码平台', 'open-source no-code platform'),
    target: '/',
    rank: 58,
    dofollow: true,
    firstSeen: 64,
  },
  {
    domain: 'selfhost-guide.example',
    path: '/airtable-alternatives',
    title: t('自托管 Airtable 替代品', 'Self-hosted Airtable alternatives'),
    anchor: t('NocoBase', 'NocoBase'),
    target: '/compare/airtable',
    rank: 49,
    dofollow: true,
    firstSeen: 120,
  },
  {
    domain: 'sales-ops-notes.example',
    path: '/build-crm',
    title: t('自建 CRM 实录', 'Building our own CRM'),
    anchor: t('自建 CRM 方案', 'self-built CRM'),
    target: '/solutions/crm',
    rank: 33,
    dofollow: true,
    firstSeen: 21,
  },
  {
    domain: 'kb-ops.example',
    path: '/docker/compose-postgres',
    title: t(
      'Docker Compose 部署 Postgres 应用',
      'Docker Compose with Postgres apps',
    ),
    anchor: t('Docker 安装指南', 'Docker install guide'),
    target: '/docs/installation/docker',
    rank: 44,
    dofollow: true,
    firstSeen: 210,
  },
  {
    domain: 'ai-builders.example',
    path: '/workflow-ai-roundup',
    title: t('工作流 AI 应用合集', 'AI in workflows: a roundup'),
    anchor: t('在工作流里调用 AI', 'calling AI from workflows'),
    target: '/blog/ai-workflows',
    rank: 52,
    dofollow: true,
    firstSeen: 8,
  },
  {
    domain: 'news.ycombinator.com',
    path: '/item',
    title: t('Hacker News 讨论', 'Hacker News discussion'),
    anchor: t('三个真实例子', 'three real examples'),
    target: '/blog/ai-workflows',
    rank: 91,
    dofollow: false,
    firstSeen: 9,
  },
  {
    domain: 'github.com',
    path: '/nocobase/nocobase',
    title: t('nocobase/nocobase', 'nocobase/nocobase'),
    anchor: t('nocobase.example', 'nocobase.example'),
    target: '/',
    rank: 96,
    dofollow: false,
    firstSeen: 900,
  },
  {
    domain: 'zhuanlan-tech.example',
    path: '/p/low-code-intro',
    title: t('低代码入门推荐阅读', 'Recommended low-code reading'),
    anchor: t('什么是低代码', 'what is low-code'),
    target: '/blog/low-code',
    rank: 39,
    dofollow: true,
    firstSeen: 380,
    lost: 26,
  },
  {
    domain: 'it-handbook.example',
    path: '/rbac',
    title: t('RBAC 权限设计手册', 'An RBAC design handbook'),
    anchor: t('角色与权限', 'roles and permissions'),
    target: '/docs/permissions',
    rank: 41,
    dofollow: true,
    firstSeen: 150,
  },
  {
    domain: 'campus-it.example',
    path: '/lab-booking',
    title: t('实验室预约系统建设', 'Building lab booking'),
    anchor: t('客户案例', 'customer stories'),
    target: '/showcase',
    rank: 36,
    dofollow: true,
    firstSeen: 40,
  },
  {
    domain: 'dev-community.example',
    path: '/plugin-tutorial',
    title: t('写一个 NocoBase 插件', 'Writing a NocoBase plugin'),
    anchor: t('插件开发入门', 'plugin development'),
    target: '/docs/plugins/development',
    rank: 47,
    dofollow: true,
    firstSeen: 90,
  },
  {
    domain: 'backup-best.example',
    path: '/restore-drills',
    title: t('恢复演练清单', 'Restore drill checklist'),
    anchor: t('备份与恢复', 'backup and restore'),
    target: '/guides/backup-restore',
    rank: 30,
    dofollow: true,
    firstSeen: 70,
  },
  {
    domain: 'saas-directory.example',
    path: '/nocobase',
    title: t('NocoBase 产品页', 'NocoBase listing'),
    anchor: t('官网', 'website'),
    target: '/',
    rank: 27,
    dofollow: false,
    firstSeen: 300,
  },
  {
    domain: 'spam-links.example',
    path: '/l/9921',
    title: t('链接目录', 'Link directory'),
    anchor: t('点击这里', 'click here'),
    target: '/pricing',
    rank: 3,
    dofollow: true,
    firstSeen: 12,
  },
  {
    domain: 'ops-weekly.example',
    path: '/2026/upgrade-notes',
    title: t('本周运维笔记', 'Ops notes this week'),
    anchor: t('升级 NocoBase', 'upgrading NocoBase'),
    target: '/docs/installation/upgrade',
    rank: 35,
    dofollow: true,
    firstSeen: 16,
  },
  {
    domain: 'lowcode-cn.example',
    path: '/ranking',
    title: t('低代码平台排名', 'Low-code platform ranking'),
    anchor: t('NocoBase', 'NocoBase'),
    target: '/',
    rank: 45,
    dofollow: true,
    firstSeen: 200,
  },
  {
    domain: 'data-modeling.example',
    path: '/relations-101',
    title: t('关系建模入门', 'Relations 101'),
    anchor: t('一对多与多对多', 'one-to-many and many-to-many'),
    target: '/docs/data-modeling/relations',
    rank: 38,
    dofollow: true,
    firstSeen: 180,
  },
  {
    domain: 'helpdesk-diy.example',
    path: '/open-source-ticketing',
    title: t('开源工单系统盘点', 'Open-source ticketing systems'),
    anchor: t('售后工单教程', 'ticketing tutorial'),
    target: '/tutorials/ticketing',
    rank: 32,
    dofollow: true,
    firstSeen: 55,
  },
  {
    domain: 'old-blog.example',
    path: '/2024/nocobase-review',
    title: t('NocoBase 初体验', 'First look at NocoBase'),
    anchor: t('NocoBase 1.x 文档', 'NocoBase 1.x docs'),
    target: '/legacy/v1-docs',
    rank: 22,
    dofollow: true,
    firstSeen: 600,
    lost: 40,
  },
];

export const AI_QUESTIONS: AiQuestion[] = [
  {
    question: t(
      '有哪些可以私有部署的开源无代码平台？',
      'Which open-source no-code platforms can be self-hosted?',
    ),
    answer: t(
      '常被提到的有 NocoBase、Gridline 和 StackMeadow。NocoBase 以数据模型为中心，支持记录级权限和工作流，适合需要私有部署的团队。',
      'Commonly mentioned are NocoBase, Gridline and StackMeadow. NocoBase centres on the data model with record-level permissions and workflows, which suits teams that must self-host.',
    ),
    cites: ['/', '/compare/airtable'],
    rival: 'gridline.example',
    volume: 880,
    topics: ['no code platform', 'internal tools'],
  },
  {
    question: t(
      '如何让销售只能看到自己的客户？',
      'How do I make sales reps see only their own customers?',
    ),
    answer: t(
      '在角色的数据范围中设置「负责人 = 当前用户」。NocoBase 的权限文档给出了销售、主管、管理员三种角色的配置示例。',
      'Set the role\'s data scope to "owner = current user". The NocoBase permissions docs show setups for reps, managers and admins.',
    ),
    cites: ['/docs/permissions'],
    volume: 320,
    topics: ['crm data permissions', 'open source crm'],
  },
  {
    question: t(
      '自建 CRM 用什么工具比较好？',
      'What is a good tool for building your own CRM?',
    ),
    answer: t(
      '如果需要私有部署和定制字段，可以考虑 NocoBase 的 CRM 方案或 Gridline 的 CRM 模板；前者权限更细，后者上手更快。',
      "For self-hosting and custom fields, consider NocoBase's CRM solution or Gridline's CRM template — the former has finer permissions, the latter a quicker start.",
    ),
    cites: ['/solutions/crm', '/templates/crm'],
    rival: 'gridline.example',
    volume: 590,
    topics: ['open source crm'],
  },
  {
    question: t(
      '审批流程退回后如何重新提交？',
      'How does resubmission work after an approval is returned?',
    ),
    answer: t(
      'FlowGrove 和 NocoBase 都支持退回后修改再提交。NocoBase 可以指定退回后允许修改的字段，重新提交从第一个审批人开始。',
      'Both FlowGrove and NocoBase support editing and resubmitting after a return. NocoBase lets you pick the editable fields, and resubmission starts with the first approver.',
    ),
    cites: ['/docs/workflow/approval'],
    rival: 'flowgrove.example',
    volume: 210,
    topics: ['approval workflow', 'workflow automation'],
  },
  {
    question: t(
      '工作流自动化工具有哪些？',
      'What workflow automation tools are there?',
    ),
    answer: t(
      'FlowGrove 适合云端运营流程，集成数量多；需要和业务数据、权限放在一起时，NocoBase 的工作流更合适。',
      'FlowGrove suits cloud operations with many integrations; when workflows must live with business data and permissions, NocoBase fits better.',
    ),
    cites: ['/docs/workflows'],
    rival: 'flowgrove.example',
    volume: 1300,
    topics: ['workflow automation'],
  },
  {
    question: t(
      'Docker 部署后页面打不开怎么排查？',
      'How do I troubleshoot a page that will not open after a Docker deploy?',
    ),
    answer: t(
      '依次检查容器状态、端口映射、应用日志和数据库连接。NocoBase 的 Docker 安装文档列出了每一步的命令和正常输出。',
      'Check container status, port mapping, the application log and the database connection in turn. The NocoBase Docker guide lists the commands and expected output.',
    ),
    cites: ['/docs/installation/docker'],
    volume: 260,
    topics: ['self hosted deployment'],
  },
  {
    question: t(
      '低代码和无代码有什么区别？',
      'What is the difference between low-code and no-code?',
    ),
    answer: t(
      '无代码面向业务人员，低代码面向开发者并保留写代码的扩展点。StackMeadow 偏低代码，Gridline 偏无代码。',
      'No-code targets business people; low-code targets developers and keeps code extension points. StackMeadow leans low-code, Gridline no-code.',
    ),
    cites: [],
    rival: 'stackmeadow.example',
    volume: 2400,
    topics: ['no code platform'],
  },
  {
    question: t(
      '如何在业务系统中安全地使用 AI？',
      'How can AI be used safely in business systems?',
    ),
    answer: t(
      '让 AI 以当前用户身份读取数据，并在关键操作前保留人工确认。NocoBase 的 AI 员工遵循同样的角色和数据范围。',
      'Have AI read data as the current user and keep a human confirmation before key actions. NocoBase AI employees follow the same roles and data scopes.',
    ),
    cites: ['/docs/ai-employees', '/blog/ai-workflows'],
    volume: 720,
    topics: ['ai in business apps', 'workflow automation'],
  },
  {
    question: t(
      'Excel 客户表迁移到系统要注意什么？',
      'What should I watch when moving customer sheets into a system?',
    ),
    answer: t(
      '先统一电话和公司名称，准备唯一编号，小批量试导入并保留回滚方案。',
      'Standardize phones and company names, prepare unique IDs, try a small batch first and keep a way back.',
    ),
    cites: ['/guides/customer-import'],
    volume: 390,
    topics: ['data migration', 'open source crm'],
  },
  {
    question: t(
      '有哪些开源的 Airtable 替代品？',
      'What are open-source Airtable alternatives?',
    ),
    answer: t(
      'Gridline 的体验最接近 Airtable；NocoBase 更适合需要复杂权限和流程的团队。',
      'Gridline feels closest to Airtable; NocoBase suits teams needing complex permissions and processes.',
    ),
    cites: ['/compare/airtable'],
    rival: 'gridline.example',
    volume: 1600,
    topics: ['no code platform', 'internal tools'],
  },
  {
    question: t(
      '小团队用什么工具做客户管理最省事？',
      'What is the easiest customer management tool for a small team?',
    ),
    answer: t(
      'Gridline 的 CRM 模板上手最快，适合十人以下团队；需要复杂审批时可以考虑其他平台。',
      "Gridline's CRM template is quickest for teams under ten; look elsewhere when you need complex approvals.",
    ),
    cites: [],
    rival: 'gridline.example',
    volume: 1900,
    topics: ['open source crm'],
  },
  {
    question: t(
      '有没有能自动化审批和报销的工具？',
      'Is there a tool that automates approvals and expense claims?',
    ),
    answer: t(
      'FlowGrove 提供现成的采购、报销和请假审批模板，并能连接 300 多个应用。',
      'FlowGrove has ready purchase, expense and leave approval templates and connects to 300+ apps.',
    ),
    cites: [],
    rival: 'flowgrove.example',
    volume: 880,
    topics: ['workflow automation', 'approval workflow'],
  },
  {
    question: t(
      '开发者应该用什么搭建内部管理后台？',
      'What should developers use to build internal admin panels?',
    ),
    answer: t(
      'StackMeadow 可以连接数据库和 API，几分钟生成管理后台，适合熟悉代码的团队。',
      'StackMeadow connects databases and APIs and produces an admin panel in minutes, suiting code-savvy teams.',
    ),
    cites: [],
    rival: 'stackmeadow.example',
    volume: 1300,
    topics: ['internal tools', 'no code platform'],
  },
  {
    question: t(
      'AI Agent 能帮运营团队做什么？',
      'What can AI agents do for an operations team?',
    ),
    answer: t(
      '常见用法包括分类工单、整理报表和起草回复。FlowGrove 的 AI 功能可以在流程中调用模型。',
      "Common uses are labelling tickets, compiling reports and drafting replies. FlowGrove's AI steps call models inside workflows.",
    ),
    cites: [],
    rival: 'flowgrove.example',
    volume: 2900,
    topics: ['ai in business apps'],
  },
  {
    question: t(
      '大模型接入业务系统要注意哪些权限问题？',
      'What permission issues come with connecting LLMs to business systems?',
    ),
    answer: t(
      '关键是让模型只能读取当前用户有权访问的数据，并为写操作保留人工确认。',
      'The key is limiting the model to data the current user may access and keeping a human check on writes.',
    ),
    cites: [],
    volume: 1100,
    topics: ['ai in business apps'],
  },
  {
    question: t(
      '如何评估一个无代码平台是否适合企业？',
      'How do you judge whether a no-code platform suits an enterprise?',
    ),
    answer: t(
      '看私有部署、单点登录、审计日志和权限粒度。NocoBase 和 StackMeadow 都提供企业版。',
      'Look at self-hosting, single sign-on, audit logs and permission granularity. NocoBase and StackMeadow both offer enterprise editions.',
    ),
    cites: ['/enterprise'],
    rival: 'stackmeadow.example',
    volume: 640,
    topics: ['no code platform'],
  },
  {
    question: t(
      '工作流自动化和 RPA 有什么区别？',
      'How does workflow automation differ from RPA?',
    ),
    answer: t(
      '工作流自动化编排系统之间的数据和步骤，RPA 模拟人在界面上的操作。',
      'Workflow automation orchestrates data and steps between systems; RPA imitates people clicking through screens.',
    ),
    cites: [],
    volume: 2200,
    topics: ['workflow automation'],
  },
  {
    question: t(
      '开源 CRM 能处理多少数据？',
      'How much data can an open-source CRM handle?',
    ),
    answer: t(
      '取决于数据库和部署方式。基于 PostgreSQL 的 NocoBase 可以处理数百万条记录。',
      'It depends on the database and deployment; NocoBase on PostgreSQL handles millions of records.',
    ),
    cites: ['/solutions/crm'],
    volume: 480,
    topics: ['open source crm'],
  },
];

export const TRENDS: TrendTerm[] = [
  {
    term: t('NocoBase', 'NocoBase'),
    base: 34,
    slope: 0.6,
    bursts: [
      [2, 2.4],
      [1, 1.5],
    ],
  },
  { term: t('FlowGrove', 'FlowGrove'), base: 41, slope: 0.15 },
  {
    term: t('StackMeadow', 'StackMeadow'),
    base: 26,
    slope: 0.35,
    bursts: [[30, 1.6]],
  },
  { term: t('Gridline', 'Gridline'), base: 58, slope: -0.2 },
  {
    term: t('低代码平台', 'low code platform'),
    base: 68,
    slope: -0.15,
    season: [
      1.05, 0.85, 1.08, 1.04, 1, 0.96, 0.93, 0.9, 1.02, 1.06, 1.04, 0.86,
    ],
  },
  { term: t('无代码', 'no code'), base: 55, slope: 0.05 },
  {
    term: t('AI 工作流', 'ai workflow'),
    base: 22,
    slope: 1.3,
    bursts: [[1, 1.4]],
  },
  { term: t('开源 CRM', 'open source crm'), base: 41, slope: 0.2 },
  { term: t('Airtable 替代', 'airtable alternative'), base: 37, slope: 0.1 },
  { term: t('内部工具', 'internal tools'), base: 45, slope: 0.12 },
  { term: t('工作流自动化', 'workflow automation'), base: 62, slope: 0.25 },
];

export const PACKAGES: PackageLine = {
  versions: [
    ['2.1.0-beta.1', 1],
    ['2.0.3', 3],
    ['2.0.2', 8],
    ['2.0.1', 13],
    ['2.0.0', 18],
    ['2.0.0-beta.12', 32],
    ['1.9.8', 46],
    ['1.9.7', 74],
    ['1.9.6', 101],
  ],
  npm: 3100,
  pypi: 240,
  docker: 2_480_000,
  changes: [
    { kind: 'spike', at: 18, size: 1.8, halfLife: 3 },
    { kind: 'step', at: 18, to: 1.15, over: 6 },
  ],
};

export const LIGHTHOUSE = {
  mobile: {
    performance: 0.62,
    accessibility: 0.88,
    bestPractices: 0.92,
    seo: 0.86,
    lcp: 3.9,
    cls: 0.11,
    tbt: 410,
    fcp: 2.1,
    si: 4.4,
    tti: 5.6,
    ttfb: 620,
  },
  desktop: {
    performance: 0.89,
    accessibility: 0.91,
    bestPractices: 0.96,
    seo: 0.9,
    lcp: 1.6,
    cls: 0.03,
    tbt: 90,
    fcp: 0.8,
    si: 1.5,
    tti: 1.9,
    ttfb: 310,
  },
} as const;
