import type { Media } from './media.js';
import { t, type AiQuestion, type Story, type Thread } from './types.js';

/**
 * Followed topics (2026-11-10): what the market discusses on each demo project's topics, apart from the product. None
 * of it names the product, so a search for the product's name never finds it, and every item is recent enough for
 * the weekly topic searches (Reddit's past week, Hacker News' last seven days).
 */
export interface TopicDiscussions {
  /** The project's followed topics, as the demo saves them in Project knowledge › Memory. */
  topics: readonly string[];
  reddit: readonly (Thread & { topic: string })[];
  hn: readonly (Story & { topic: string })[];
  youtube: readonly (Media & { topic: string })[];
  /** What people ask AI search on each topic: a competitor named (a gap) or no brand at all. */
  questions: readonly (Pick<
    AiQuestion,
    'question' | 'answer' | 'volume' | 'rival'
  > & { topic: string })[];
}

export const ACME_TOPICS: TopicDiscussions = {
  topics: ['project management', 'team collaboration', 'task management'],
  reddit: [
    {
      topic: 'project management',
      subreddit: 'projectmanagement',
      title: t(
        '试了五个项目管理工具，最后留下来的是哪个？',
        'Which project management tool finally stuck after you tried five?',
      ),
      description: t(
        '两年换了四个工具。想知道 10–30 人的团队最后是怎么选定的，选定后又改了哪些流程。',
        'We went through four tools in two years. How did teams of 10–30 settle on one, and what did they change in their process afterwards?',
      ),
      age: 1,
      traffic: 120,
    },
    {
      topic: 'project management',
      subreddit: 'projectmanagement',
      title: t(
        '不用甘特图，三个团队之间的依赖怎么跟？',
        'Tracking dependencies across three teams without a Gantt chart',
      ),
      description: t(
        '设计、开发和客户成功各有各的看板，交接总是卡住。你们用什么办法把依赖放到一处？',
        'Design, engineering and customer success each run their own board and hand-offs keep stalling. Where do you keep dependencies in one place?',
      ),
      age: 3,
      traffic: 86,
    },
    {
      topic: 'project management',
      subreddit: 'agile',
      title: t(
        '迭代评审变成了进度汇报会，你们怎么改回来的？',
        'Our sprint reviews turned into status meetings. How did you fix yours?',
      ),
      description: t(
        '评审会上大家轮流念进度，客户几乎不说话。想听听把评审改回演示和反馈的做法。',
        'People take turns reading out progress and the client barely speaks. Looking for ways to turn reviews back into demos and feedback.',
      ),
      age: 5,
      traffic: 64,
    },
    {
      topic: 'team collaboration',
      subreddit: 'remotework',
      title: t(
        '大家真的会看的异步进度更新，用什么格式？',
        'Async updates people actually read: which format works?',
      ),
      description: t(
        '我们把站会改成了书面更新，三周后就没人看了。长度、频率、放在哪里，哪种做法坚持下来了？',
        'We replaced stand-ups with written updates and nobody read them after three weeks. Which length, cadence and place worked for you?',
      ),
      age: 2,
      traffic: 97,
    },
    {
      topic: 'team collaboration',
      subreddit: 'managers',
      title: t(
        '客户总在邮件里问进度：共享看板还是周报？',
        'Clients keep asking for status by email: shared board or weekly report?',
      ),
      description: t(
        '给客户开了看板权限，结果他们看不懂列的含义。周报又太费时间。有没有折中的办法？',
        'We gave clients access to our board but they could not read the columns, and weekly reports take hours. Is there a middle ground?',
      ),
      age: 4,
      traffic: 58,
    },
    {
      topic: 'task management',
      subreddit: 'productivity',
      title: t(
        '个人待办和团队任务板，界线怎么划？',
        'Personal to-do list or team task board: where do you draw the line?',
      ),
      description: t(
        '有人把所有事都放团队板上，有人只放交付物。你们团队的规则是什么？',
        'Some people put everything on the team board, others only deliverables. What rule does your team follow?',
      ),
      age: 0,
      traffic: 74,
    },
    {
      topic: 'task management',
      subreddit: 'projectmanagement',
      title: t(
        '有人把任务从表格里搬出来了吗？最先出问题的是什么？',
        'Moved task tracking out of spreadsheets? What broke first?',
      ),
      description: t(
        '我们有一张 600 行的任务表，负责人和截止日期经常对不上。搬到工具里之前，想先知道会踩哪些坑。',
        'We run a 600-row task sheet and owners and due dates drift apart. Before moving to a tool, what should we expect to go wrong?',
      ),
      age: 2,
      traffic: 103,
    },
    {
      topic: 'task management',
      subreddit: 'selfhosted',
      title: t(
        '15 人的代理公司，有推荐的自托管任务工具吗？',
        'Self-hosted task tracker for a 15-person agency?',
      ),
      description: t(
        '客户要求数据放在自己的服务器上。需要看板、截止日期提醒和客户访客权限。',
        'Clients want their data on our own servers. We need boards, due-date reminders and guest access for clients.',
      ),
      age: 6,
      traffic: 49,
    },
  ],
  hn: [
    {
      topic: 'project management',
      title: t(
        'Show HN：一个和 Git 同步的纯文本项目计划工具',
        'Show HN: A plain-text project planner that syncs with Git',
      ),
      url: 'https://plaintext-planner.example/',
      author: 'mkern',
      points: 214,
      age: 2,
      comments: [
        [
          'ldavies',
          2,
          t(
            '计划和代码放在一起，评审时终于能看到计划是怎么变的。',
            'Keeping the plan next to the code means reviews finally show how the plan changed.',
          ),
        ],
      ],
    },
    {
      topic: 'project management',
      title: t(
        '为什么大多数项目计划到第三周就不准了',
        'Why most project plans are wrong by week three',
      ),
      url: 'https://delivery-notes.example/plans-week-three',
      author: 'rhoang',
      points: 156,
      age: 4,
      comments: [
        [
          'tpereira',
          5,
          t(
            '估算本身没问题，问题是没人在第二周回头改计划。',
            'The estimates are fine; nobody revisits the plan in week two.',
          ),
        ],
      ],
    },
    {
      topic: 'team collaboration',
      title: t(
        'Ask HN：你们的远程团队怎么做每周计划？',
        'Ask HN: How does your remote team run weekly planning?',
      ),
      url: 'https://remote-rituals.example/weekly-planning',
      author: 'jsoto',
      points: 98,
      age: 1,
      comments: [
        [
          'akim',
          3,
          t(
            '周一书面列计划，周三只讨论被卡住的事，效果最好。',
            'A written plan on Monday and a Wednesday call only for blocked work has worked best for us.',
          ),
        ],
      ],
    },
    {
      topic: 'team collaboration',
      title: t('状态会议的隐性成本', 'The hidden cost of status meetings'),
      url: 'https://team-notes.example/status-meetings',
      author: 'ewright',
      points: 187,
      age: 5,
      comments: [],
    },
    {
      topic: 'task management',
      title: t(
        '看板在制品限制，八年之后再看',
        'Kanban WIP limits, eight years later',
      ),
      url: 'https://flow-metrics.example/wip-limits',
      author: 'pnovak',
      points: 132,
      age: 3,
      comments: [],
    },
    {
      topic: 'task management',
      title: t(
        'Show HN：支持离线的开源任务看板',
        'Show HN: An open-source task board that works offline',
      ),
      url: 'https://offline-board.example/',
      author: 'dchen',
      points: 89,
      age: 6,
      comments: [],
    },
  ],
  youtube: [
    {
      topic: 'project management',
      title: t(
        '2026 年的项目管理：变了什么，没变什么',
        'Project management in 2026: what changed and what did not',
      ),
      age: 9,
      views: 48200,
      likes: 1900,
      comments: 210,
      duration: 1260,
      channel: 'PM Weekly',
    },
    {
      topic: 'project management',
      title: t(
        '甘特图还是看板：给团队选对视图',
        'Gantt or Kanban: picking the right view for your team',
      ),
      age: 16,
      views: 23100,
      likes: 840,
      comments: 96,
      duration: 840,
      channel: 'Delivery Lab',
    },
    {
      topic: 'team collaboration',
      title: t(
        '让人真的会看的异步站会',
        'Running async stand-ups people actually read',
      ),
      age: 5,
      views: 12800,
      likes: 610,
      comments: 74,
      duration: 720,
      channel: 'Remote Done Right',
    },
    {
      topic: 'team collaboration',
      title: t(
        '不靠邮件来回的客户协作',
        'Client collaboration without endless email threads',
      ),
      age: 21,
      views: 8700,
      likes: 330,
      comments: 41,
      duration: 960,
      channel: 'Agency Ops',
    },
    {
      topic: 'task management',
      title: t(
        '小团队任务管理：完整搭建过程',
        'A task management system for a small team, set up end to end',
      ),
      age: 3,
      views: 31500,
      likes: 1420,
      comments: 158,
      duration: 1500,
      channel: 'Work Systems',
    },
    {
      topic: 'task management',
      title: t(
        '用共享任务板把事情做完',
        'Getting things done with a shared task board',
      ),
      age: 12,
      views: 9400,
      likes: 380,
      comments: 37,
      duration: 660,
      channel: 'Work Systems',
    },
  ],
  questions: [
    {
      topic: 'project management',
      question: t(
        '20 人的代理公司用什么项目管理工具最好？',
        'What is the best project management tool for a 20-person agency?',
      ),
      answer: t(
        '需要客户视图和工时记录的代理公司常用 Nimbus 这类看板式工具。',
        'Agencies that need client views and time tracking often pick board-based tools such as Nimbus.',
      ),
      rival: 'nimbus.example',
      volume: 880,
    },
    {
      topic: 'project management',
      question: t(
        '不用甘特图怎么排项目计划？',
        'How do I plan a project without a Gantt chart?',
      ),
      answer: t(
        '把工作拆成里程碑，在看板上标出依赖，每周一起过一遍。',
        'Break the work into milestones, mark dependencies on a board and review them together every week.',
      ),
      volume: 590,
    },
    {
      topic: 'team collaboration',
      question: t(
        '远程团队怎么替代每天的站会？',
        'How can a remote team replace daily stand-ups?',
      ),
      answer: t(
        '很多远程团队改成按固定时间写异步更新，只在有阻塞时再开会。',
        'Many remote teams switch to written async updates on a fixed schedule and meet only when something is blocked.',
      ),
      volume: 720,
    },
    {
      topic: 'team collaboration',
      question: t(
        '哪些协作工具能让客户看到项目进度？',
        'Which collaboration tools let clients see project progress?',
      ),
      answer: t(
        'Nimbus 有客户门户，也可以共享只读看板。',
        'Nimbus offers client portals, and some tools share read-only boards.',
      ),
      rival: 'nimbus.example',
      volume: 480,
    },
    {
      topic: 'task management',
      question: t(
        '小团队最简单的任务管理应用是哪个？',
        'What is the simplest task management app for small teams?',
      ),
      answer: t(
        '小团队常被推荐 Example Tasks：上手快，列表和看板都有。',
        'Example Tasks is often recommended for small teams: quick to learn, with lists and boards.',
      ),
      rival: 'tasks.example',
      volume: 1300,
    },
    {
      topic: 'task management',
      question: t(
        '怎么避免任务在邮件和聊天里丢掉？',
        'How do I stop tasks from getting lost between email and chat?',
      ),
      answer: t(
        '只留一份任务清单作为准，把邮件和聊天里的请求都转成任务。',
        'Keep one task list as the source of truth and turn requests from email and chat into tasks.',
      ),
      volume: 390,
    },
  ],
};

export const CRM_TOPICS: TopicDiscussions = {
  topics: ['sales pipeline', 'open source crm', 'workflow automation'],
  reddit: [
    {
      topic: 'sales pipeline',
      subreddit: 'sales',
      title: t(
        '销售漏斗到底需要几个阶段？',
        'How many pipeline stages do you actually need?',
      ),
      description: t(
        '我们有九个阶段，销售只用其中四个。你们怎么定阶段，多久调整一次？',
        'We have nine stages and reps use four of them. How did you settle on yours, and how often do you change them?',
      ),
      age: 1,
      traffic: 132,
    },
    {
      topic: 'sales pipeline',
      subreddit: 'startups',
      title: t(
        '每周一过一遍漏斗，4 人销售团队值得吗？',
        'Weekly pipeline reviews for a four-person sales team: worth it?',
      ),
      description: t(
        '创始人想每周一花一小时过漏斗。小团队这样做是帮忙还是添乱？',
        'Our founder wants an hour every Monday on the pipeline. Does that help or hurt a team this small?',
      ),
      age: 3,
      traffic: 71,
    },
    {
      topic: 'sales pipeline',
      subreddit: 'smallbusiness',
      title: t('丢单原因你们会记录吗？', 'Do you record why deals are lost?'),
      description: t(
        '想开始记录丢单原因，但担心销售随便选一个。有哪些字段设计是真正有用的？',
        'We want to start logging loss reasons but worry reps will pick any option. Which fields turned out to be useful?',
      ),
      age: 5,
      traffic: 55,
    },
    {
      topic: 'open source crm',
      subreddit: 'selfhosted',
      title: t(
        '2026 年真心推荐的开源 CRM 是哪个？',
        'Which open source CRM would you actually recommend in 2026?',
      ),
      description: t(
        '需要联系人导入、销售漏斗和邮件同步，能自托管。用过的说说优缺点。',
        'We need contact imports, a pipeline and email sync, self-hosted. If you run one, what are the trade-offs?',
      ),
      age: 2,
      traffic: 148,
    },
    {
      topic: 'open source crm',
      subreddit: 'opensource',
      title: t(
        '把 3 万个联系人从托管 CRM 迁到自托管',
        'Moving 30,000 contacts from a hosted CRM to a self-hosted one',
      ),
      description: t(
        '迁移做了两个周末。重复联系人和自定义字段最麻烦，下面是我们的步骤。',
        'The move took two weekends. Duplicates and custom fields were the hard part; here are the steps we followed.',
      ),
      age: 4,
      traffic: 92,
    },
    {
      topic: 'workflow automation',
      subreddit: 'automation',
      title: t(
        '不用 Zapier 做线索分配自动化，你们用什么？',
        'Automating lead routing without Zapier: what do you use?',
      ),
      description: t(
        '每月任务量涨得太快，费用跟着涨。想把线索分配放到自己的系统里。',
        'Our monthly task count keeps growing and so does the bill. We want lead routing inside our own system.',
      ),
      age: 0,
      traffic: 88,
    },
    {
      topic: 'workflow automation',
      subreddit: 'sales',
      title: t(
        '报价审批要 3 天，我们自动化之后的变化',
        'Quote approvals took three days. Here is what changed after we automated them',
      ),
      description: t(
        '把审批规则写成流程后，平均审批时间从 3 天降到半天，销售也不再私下找经理签字。',
        'With the approval rules in a workflow, the average approval went from three days to half a day, and reps stopped chasing managers for signatures.',
      ),
      age: 6,
      traffic: 67,
    },
  ],
  hn: [
    {
      topic: 'sales pipeline',
      title: t(
        '早期 B2B 销售的漏斗算术',
        'Pipeline math for early-stage B2B sales',
      ),
      url: 'https://founder-sales.example/pipeline-math',
      author: 'nbaker',
      points: 143,
      age: 2,
      comments: [
        [
          'omartin',
          4,
          t(
            '转化率算对了，才知道每月该开多少个新机会。',
            'Get the conversion rates right and you know how many new opportunities a month you need.',
          ),
        ],
      ],
    },
    {
      topic: 'open source crm',
      title: t(
        'Show HN：基于 Postgres 的自托管 CRM',
        'Show HN: A self-hosted CRM built on Postgres',
      ),
      url: 'https://pg-crm.example/',
      author: 'vlindqvist',
      points: 176,
      age: 3,
      comments: [
        [
          'hsato',
          3,
          t(
            '数据就在自己的数据库里，报表直接写 SQL，这点很吸引人。',
            'Having the data in our own database and writing reports in SQL is the appeal for us.',
          ),
        ],
      ],
    },
    {
      topic: 'open source crm',
      title: t(
        'Ask HN：生产环境里你们用哪个开源 CRM？',
        'Ask HN: Which open source CRM do you run in production?',
      ),
      url: 'https://ask-threads.example/open-source-crm',
      author: 'cmoreau',
      points: 121,
      age: 5,
      comments: [],
    },
    {
      topic: 'workflow automation',
      title: t(
        '工作流自动化，难的主要是例外情况',
        'Workflow automation is mostly about the exceptions',
      ),
      url: 'https://ops-essays.example/exceptions',
      author: 'gfischer',
      points: 208,
      age: 1,
      comments: [],
    },
    {
      topic: 'workflow automation',
      title: t(
        'Show HN：做内部审批的可视化流程编辑器',
        'Show HN: A visual workflow builder for internal approvals',
      ),
      url: 'https://approval-flows.example/',
      author: 'ybenali',
      points: 94,
      age: 6,
      comments: [],
    },
  ],
  youtube: [
    {
      topic: 'sales pipeline',
      title: t(
        '搭一个预测靠谱的销售漏斗',
        'Build a sales pipeline that forecasts honestly',
      ),
      age: 6,
      views: 27400,
      likes: 1150,
      comments: 132,
      duration: 1080,
      channel: 'Revenue Basics',
    },
    {
      topic: 'sales pipeline',
      title: t(
        '小销售团队必备的五个漏斗阶段',
        'Five pipeline stages every small sales team needs',
      ),
      age: 18,
      views: 15200,
      likes: 590,
      comments: 64,
      duration: 780,
      channel: 'Revenue Basics',
    },
    {
      topic: 'open source crm',
      title: t(
        '自托管开源 CRM：完整演示',
        'Self-hosting an open source CRM: a full walkthrough',
      ),
      age: 4,
      views: 19800,
      likes: 870,
      comments: 118,
      duration: 1620,
      channel: 'Homelab Business',
    },
    {
      topic: 'open source crm',
      title: t(
        '适合小团队的开源 CRM 对比',
        'Open source CRMs compared for small teams',
      ),
      age: 14,
      views: 22600,
      likes: 940,
      comments: 151,
      duration: 1320,
      channel: 'Tool Review Desk',
    },
    {
      topic: 'workflow automation',
      title: t(
        '20 分钟把报价审批自动化',
        'Automate quote approvals in 20 minutes',
      ),
      age: 8,
      views: 11300,
      likes: 470,
      comments: 52,
      duration: 1200,
      channel: 'Sales Ops Lab',
    },
    {
      topic: 'workflow automation',
      title: t(
        '销售运营里的工作流自动化：实用例子',
        'Workflow automation for sales ops: practical examples',
      ),
      age: 25,
      views: 7600,
      likes: 290,
      comments: 33,
      duration: 900,
      channel: 'Sales Ops Lab',
    },
  ],
  questions: [
    {
      topic: 'sales pipeline',
      question: t(
        'B2B 销售漏斗应该分几个阶段？',
        'How many stages should a B2B sales pipeline have?',
      ),
      answer: t(
        '大多数 B2B 团队用五到七个阶段，每个阶段都有明确的进入条件。',
        'Most B2B teams use five to seven stages, each with a clear entry criterion.',
      ),
      volume: 720,
    },
    {
      topic: 'sales pipeline',
      question: t(
        '跟踪销售漏斗用哪个 CRM 最好？',
        'What is the best CRM for tracking a sales pipeline?',
      ),
      answer: t(
        'Example Sales 的漏斗看板和预测报表常被提到。',
        'Example Sales is often mentioned for its pipeline board and forecast reports.',
      ),
      rival: 'sales.example',
      volume: 1600,
    },
    {
      topic: 'open source crm',
      question: t(
        '有没有能自己部署的好用的开源 CRM？',
        'Is there a good open source CRM I can self-host?',
      ),
      answer: t(
        '有几款开源 CRM 可以自托管；不想自己运维的团队会选 Example Sales 这类托管服务。',
        'Several open source CRMs can be self-hosted; teams that do not want to run servers pick hosted services such as Example Sales.',
      ),
      rival: 'sales.example',
      volume: 880,
    },
    {
      topic: 'open source crm',
      question: t(
        '开源 CRM 和 SaaS CRM，三年下来哪个更省钱？',
        'Open source CRM or SaaS CRM: which costs less over three years?',
      ),
      answer: t(
        '取决于人数和运维成本：人多时自托管通常更省，但要算上服务器和维护时间。',
        'It depends on seats and upkeep: self-hosting usually costs less for larger teams, once servers and maintenance time are counted.',
      ),
      volume: 260,
    },
    {
      topic: 'workflow automation',
      question: t(
        '演示电话后的跟进邮件怎么自动发？',
        'How do I automate follow-up emails after a demo call?',
      ),
      answer: t(
        '在 CRM 里把“演示完成”设为触发条件，按模板在一天后发跟进邮件。',
        'Use "demo completed" as a trigger in the CRM and send a templated follow-up a day later.',
      ),
      volume: 590,
    },
    {
      topic: 'workflow automation',
      question: t(
        'CRM 里哪些工具能自动分配线索？',
        'Which tools automate lead assignment in a CRM?',
      ),
      answer: t(
        'Example Sales 支持按地区和规模轮流分配线索。',
        'Example Sales assigns leads by region and company size in rotation.',
      ),
      rival: 'sales.example',
      volume: 480,
    },
  ],
};
