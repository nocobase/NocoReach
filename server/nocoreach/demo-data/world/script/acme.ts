import { historicalTopics, historicalReleases } from '../../history-content.js';
import {
  ACME_PAGES,
  ACME_STORIES,
  ACME_DISCUSSIONS,
} from '../../acme-content.js';
import type { Media } from './media.js';
import {
  t,
  type Repository,
  type Forum,
  type ChatChannel,
  type SocialPost,
  type Story,
  type Thread,
  type AiQuestion,
  type Backlink,
  type PackageLine,
  type Query,
  type Research,
  type PerLanguage,
} from './types.js';

/** Source discussions and editorial tasks refer to the same fictional project workflows. */
export const ACME_REPOSITORY: Repository = {
  owner: 'acme',
  name: 'acme',
  description: t(
    '虚构的项目管理产品：任务、看板、排期与客户协作。',
    'A fictional project management product: tasks, boards, schedules and client collaboration.',
  ),
  topics: ['project-management', 'kanban', 'team-collaboration', 'typescript'],
  people: [
    { login: '@editor', team: true },
    { login: 'acme-maintainer', team: true },
    { login: 'project-lead-demo' },
    { login: 'migration-demo' },
  ],
  issues: ACME_STORIES.filter((s) => !s.archived && !s.cancelled).map(
    (s, i) => ({
      title: ACME_DISCUSSIONS[ACME_STORIES.indexOf(s)].title,
      body: ACME_DISCUSSIONS[ACME_STORIES.indexOf(s)].text,
      labels: [
        s.kind === 'research' ? 'research' : 'documentation',
        i % 3 ? 'team-collaboration' : 'data-quality',
      ],
      author: i % 2 ? 'project-lead-demo' : 'migration-demo',
      opened: 40 - i,
      ...(s.state === 'done' ? { closed: 4 + (i % 5) } : {}),
      comments: 2 + (i % 7),
      reactions: 3 + i * 2,
      ...(i % 3 === 1
        ? {
            discussion: {
              category: 'Q&A' as const,
              answered: s.state === 'done',
            },
          }
        : {}),
    }),
  ),
  pulls: ACME_STORIES.slice(0, 9).map((s, i) => ({
    title: s.title,
    author: 'acme-maintainer',
    opened: 25 - i * 2,
    ...(i < 6 ? { merged: 12 - i } : {}),
    comments: 2 + (i % 4),
  })),
  commits: [
    t(
      '导入任务预览保留原始行号',
      'Preserve source rows in task import previews',
    ),
    t(
      '交接项目时显示未决事项',
      'Show pending decisions during project handover',
    ),
    t('验收附件显示版本状态', 'Show version status on acceptance attachments'),
    t(
      '记录里程碑基准日期与变更理由',
      'Record milestone baselines and change reasons',
    ),
  ],
  releases: [
    {
      tag: 'v2.4.2',
      name: t(
        '2.4.2：重复任务时区修复',
        '2.4.2: recurring-task time-zone fixes',
      ),
      notes: t(
        '修复重复任务时区显示；跳过本次保留后续安排。',
        'Correct recurrence time-zone display; skipping one occurrence retains the series.',
      ),
      age: 3,
    },
    {
      tag: 'v2.4.1',
      name: t('2.4.1：导入预览', '2.4.1: import preview'),
      notes: t(
        '任务导入预览显示原始行号与创建、更新、失败数量。',
        'Task previews show source rows and created, updated and failed counts.',
      ),
      age: 16,
    },
    {
      tag: 'v2.4.0',
      name: t('2.4：客户访客', '2.4: client guests'),
      notes: t(
        '新增客户访客记录、折扣审核和作废说明。',
        'Add client guests and project handover checks.',
      ),
      age: 37,
    },
    ...historicalReleases(true),
  ],
  stars: {
    total: 4260,
    perDay: 14,
    changes: [{ kind: 'spike', at: 16, size: 2.4, halfLife: 3 }],
  },
  forks: 510,
  watchers: 86,
  languages: { TypeScript: 820000, CSS: 64000, JavaScript: 31000 },
  readme: t(
    '# Acme\n\n虚构演示项目。管理任务、看板、里程碑和项目交接。先用二十行任务验证 Excel 导入与访客权限。',
    '# Acme\n\nFictional demo project. Manage tasks, boards, milestones and handovers. Rehearse twenty task rows and verify guest access before expanding.',
  ),
};

export const ACME_FORUM: Forum = {
  title: t('Acme 社区', 'Acme community'),
  description: t(
    '虚构项目团队的协作提问与交付经验。',
    'Collaboration questions and delivery experience from fictional project teams.',
  ),
  categories: [
    [1, t('实施与导入', 'Implementation and imports'), 'implementation'],
    [2, t('任务与交付', 'Tasks and delivery'), 'delivery'],
    [3, t('经验与建议', 'Experiences and ideas'), 'ideas'],
  ],
  topics: [
    ...historicalTopics(true),
    ...[
      [
        t(
          'Excel 导入后负责人为空，怎样匹配同事？',
          'How do we match owners left blank after an Excel import?',
        ),
        t(
          '我们有 240 行任务，表格里用了同事昵称，预览里负责人是空的。是否应该先邀请成员？',
          'We have 240 tasks with teammate nicknames; preview owners are blank. Should we invite members first?',
        ),
      ],
      [
        t(
          '截止日期 10/11 导入后变了，应该用什么格式？',
          'Which date format prevents 10/11 changing after import?',
        ),
        t(
          '团队来自两个地区，同一列混有日/月和月/日，想先试二十行确认。',
          'Two regions use different date orders in the same column. We want to rehearse twenty rows first.',
        ),
      ],
      [
        t(
          '重试失败的 Excel 行会不会重复创建任务？',
          'Will retrying failed Excel rows duplicate tasks?',
        ),
        t(
          '首次导入有四行失败，已经修正负责人和日期，只想补这四行。',
          'Four rows failed on the first import. Owners and dates are fixed; we only want those four retried.',
        ),
      ],
      [
        t(
          '每周例会任务同名，Excel 导入会误判重复吗？',
          'Will identically named weekly meetings be treated as duplicates?',
        ),
        t(
          '每周例会名称相同但日期不同，希望保留原始行号检查结果。',
          'Weekly meetings share a title but differ in date. We need source row numbers to check the result.',
        ),
      ],
      [
        t(
          '从 Excel 导入子任务，父子关系怎么对应？',
          'How should parent and child tasks map from Excel?',
        ),
        t(
          '活动项目有六个阶段和二十四项子任务，准备先导入一组父子关系。',
          'Our event has six phases and twenty-four subtasks. We want to rehearse one parent-child group.',
        ),
      ],
    ].map(([title, body], i) => ({
      title,
      category: 1,
      tags: ['excel-import', 'task-management'],
      opened: 2 + i * 2,
      views: 120 + i * 73,
      likes: 3 + i,
      ...(i > 2 ? { accepted: 2 } : {}),
      posts: [
        { author: `acme-import-${i + 1}`, after: 0, text: body },
        ...(i > 2
          ? [
              {
                author: '@editor',
                after: 3,
                text: t(
                  '先保留行号并试导二十行。任务名称不作为唯一标识；父任务映射请在预览中逐项核对。',
                  'Keep row numbers and rehearse twenty rows. Titles are not unique identifiers; verify parent mappings in the preview.',
                ),
                likes: 4,
              },
            ]
          : []),
      ],
    })),
    ...ACME_STORIES.slice(1).map((s, i) => ({
      title: ACME_DISCUSSIONS[i + 1].title,
      category: 2 + (i % 2),
      tags: ['teamwork', 'project-delivery'],
      opened: 16 + i,
      views: 96 + i * 47,
      likes: 2 + (i % 12),
      ...(s.state === 'done' && !s.archived ? { accepted: 2 } : {}),
      closed: Boolean(s.archived || s.cancelled),
      posts: [
        {
          author: `acme-team-${(i % 6) + 1}`,
          after: 0,
          text: ACME_DISCUSSIONS[i + 1].text,
        },
        ...s.comments.map(([, text], j) => ({
          author: j ? '@editor' : 'project-lead-demo',
          after: 3 + j * 5,
          text,
          likes: 2 + j,
        })),
      ],
    })),
  ],
};

export const ACME_SLACK: ChatChannel[] = [
  'project-delivery',
  'implementation',
  'content-review',
].map((name, channel) => ({
  name,
  members: [28, 19, 12][channel],
  messages: ACME_STORIES.filter((_, i) => i % 3 === channel).map((s, i) => ({
    at: 2 + i * 13 + channel * 3,
    author: i % 2 ? '@editor' : 'project-lead-demo',
    text: ACME_DISCUSSIONS[i * 3 + channel].title,
    replies: s.comments.map(([, text]) => ['@editor', text] as const),
  })),
}));
export const ACME_DISCORD: ChatChannel[] = ACME_SLACK.map((c, i) => ({
  ...c,
  name: ['acme-help', 'import-workshop', 'delivery-stories'][i],
  members: c.members * 3,
  forum: i === 1,
}));
export const ACME_X: SocialPost[] = ACME_STORIES.slice(0, 14).map((s, i) => ({
  at: 2 + i * 9,
  author: i % 3 ? `acme-demo-${(i % 5) + 1}` : '@editor',
  text: t(
    `Acme 演示笔记：${s.comments[0][1].zh}`,
    `Acme demo notes: ${s.comments[0][1].en}`,
  ),
  likes: 18 + i * 13,
  reposts: 2 + (i % 8),
  replies: 1 + (i % 6),
  quotes: i % 3,
  views: 480 + i * 340,
}));
export const ACME_HN: Story[] = ACME_STORIES.filter((_, i) =>
  [0, 4, 8, 9, 16, 19].includes(i),
).map((s, i) => ({
  title: t(
    `Acme：${ACME_DISCUSSIONS[ACME_STORIES.indexOf(s)].title.zh}`,
    `Acme: ${ACME_DISCUSSIONS[ACME_STORIES.indexOf(s)].title.en}`,
  ),
  path: s.path,
  author: 'acme-demo-team',
  points: 29 + i * 17,
  age: 3 + i * 5,
  comments: s.comments.map(
    ([, text], j) => [`crm-reader-${j + 1}`, 1 + j * 2, text] as const,
  ),
}));
export const ACME_REDDIT: Thread[] = ACME_STORIES.slice(0, 10).map((_, i) => ({
  subreddit: ['projectmanagement', 'productivity', 'selfhosted'][i % 3],
  title: ACME_DISCUSSIONS[i].title,
  description: ACME_DISCUSSIONS[i].text,
  age: 2 + i * 3,
  traffic: 45 + i * 18,
}));
// Video and note titles as creators write them: the subject first, the product named only where a viewer would.
const ACME_MEDIA_TITLES = [
  t(
    '导入 240 行任务，负责人和截止日期一个不丢',
    'Importing 240 tasks without losing owners or due dates',
  ),
  t(
    '十人交付团队用 Acme 管项目，一个月真实体验',
    'A month running a ten-person delivery team on Acme',
  ),
  t(
    '十二人加三位客户，Acme 方案怎么选最划算',
    'Choosing an Acme plan for 12 members and 3 client guests',
  ),
  t(
    'Acme 和 Nimbus 跨团队交付对比，看完再选',
    'Acme vs Nimbus for cross-team delivery: an honest comparison',
  ),
  t(
    '看板卡在评审列？三步理顺在制品限制',
    'Stuck in review? Fixing work-in-progress limits in three steps',
  ),
  t(
    '上游晚了两天，发布日为什么没动：依赖设置详解',
    'Why the release date did not move: task dependencies explained',
  ),
  t(
    '邀请客户进项目之前，先把这几个权限设好',
    'Set these permissions before inviting clients to a project',
  ),
  t(
    '任务做了很多，客户却看不到进展？周报这样写',
    'Clients cannot see progress? A weekly report that shows it',
  ),
  t(
    '取消关注还收到提醒？通知设置一次讲清',
    'Still getting alerts after unfollowing? Notification settings explained',
  ),
  t(
    '工地现场用手机传照片和记录，实拍演示',
    'Field notes and photo uploads on mobile, filmed on site',
  ),
  t(
    '活动模板怎么改：示例任务删哪些、留哪些',
    'Trimming the event template: which sample tasks to keep',
  ),
  t(
    '一个人跨三个项目，团队负荷到底怎么看',
    'Reading team workload when one person spans three projects',
  ),
  t(
    '节假日跳过周会，后面的重复会议会不会被取消',
    'Skipping a holiday meeting without cancelling the series',
  ),
  t(
    '第一次用 Acme：先建项目还是先拉人？',
    'First week with Acme: create the project or invite people first?',
  ),
  t(
    '客户推迟验收，原来的承诺日期怎么保留',
    'Keeping the original commitment date when a client delays sign-off',
  ),
];
export const ACME_MEDIA: Media[] = ACME_STORIES.slice(0, 15).map((s, i) => ({
  title: ACME_MEDIA_TITLES[i],
  description: s.brief,
  age: 2 + i * 3,
  views: 1840 + i * 1387,
  likes: 78 + i * 41,
  comments: 7 + i * 5,
  duration: 360 + i * 53,
  channel: ['Acme Demo', 'Team Delivery Demo', 'Implementation Workshop'][
    i % 3
  ],
}));
export const ACME_AI: AiQuestion[] = ACME_PAGES.slice(0, 10).map((p, i) => ({
  // The one a competitor answers for asks without naming Acme: an answer to a question naming the product names it.
  question:
    i === 8
      ? t(
          `哪个项目管理工具的${p.title.zh}做得好？`,
          `Which project management tool handles ${p.title.en.toLowerCase()} best?`,
        )
      : t(
          `Acme 如何处理${p.title.zh}？`,
          `How does Acme handle ${p.title.en.toLowerCase()}?`,
        ),
  answer: t(
    `虚构演示资料说明：${p.description.zh}`,
    `The fictional demo explains: ${p.description.en}`,
  ),
  cites: i === 8 ? [] : [p.path],
  ...(i === 8 ? { rival: 'nimbus.example' } : {}),
  volume: 90 + i * 35,
  topics: ['project management', 'team collaboration', 'task management'],
}));
export const ACME_BACKLINKS: Backlink[] = ACME_PAGES.slice(0, 9).map(
  (p, i) => ({
    domain: `project-guide-${i + 1}.example`,
    path: `/articles/projects-${i + 1}`,
    title: p.title,
    anchor: p.title,
    target: p.path,
    rank: 20 + i * 4,
    dofollow: i % 3 !== 0,
    firstSeen: 25 + i * 7,
    ...(i === 6 ? { lost: 4 } : {}),
  }),
);
export const ACME_PACKAGES: PackageLine = {
  versions: [
    ['2.4.2', 3],
    ['2.4.1', 16],
    ['2.4.0', 37],
    ['2.3.0', 80],
  ],
  npm: 1850,
  pypi: 410,
  docker: 238000,
  changes: [
    { kind: 'spike', at: 16, size: 1.8 },
    { kind: 'step', at: 37, to: 1.15 },
  ],
};

/** Search phrases authored for each page, in the supported Taiwan and US markets. */
const SEARCH_TERMS: Record<string, PerLanguage<readonly string[]>> = {
  '/': {
    zh: ['專案管理軟體', '免費專案管理軟體', '如何選擇專案管理軟體'],
    en: [
      'project management software',
      'free project management software',
      'how to choose project management software',
    ],
  },
  '/pricing': {
    zh: ['Acme 價格', 'Acme 價格 方案比較', 'Acme 價格如何計算'],
    en: [
      'acme pricing',
      'acme pricing for teams',
      'how does acme pricing work',
    ],
  },
  '/docs/import-excel': {
    zh: ['Excel 匯入任務', 'Excel 匯入任務 日期格式', '如何用 Excel 匯入任務'],
    en: [
      'import tasks from excel',
      'import tasks from excel with subtasks',
      'how to import tasks from excel',
    ],
  },
  '/compare/nimbus': {
    zh: [
      'Acme vs Nimbus',
      'Acme vs Nimbus 功能比較',
      'Acme vs Nimbus 如何選擇',
    ],
    en: [
      'acme vs nimbus',
      'acme vs nimbus for small teams',
      'which is better acme vs nimbus',
    ],
  },
  '/features/kanban': {
    zh: ['專案看板', '專案看板 範例', '如何建立專案看板'],
    en: [
      'kanban boards',
      'kanban boards for small teams',
      'how to use kanban boards',
    ],
  },
  '/features/timeline': {
    zh: ['團隊排程', '團隊排程 工具', '如何安排團隊排程'],
    en: [
      'team scheduling',
      'team scheduling tools',
      'how to improve team scheduling',
    ],
  },
  '/docs/guests': {
    zh: ['專案訪客權限', '專案訪客權限 設定', '如何設定專案訪客權限'],
    en: [
      'project guest access',
      'project guest access permissions',
      'how to manage project guest access',
    ],
  },
  '/docs/weekly-reports': {
    zh: ['專案週報', '專案週報 範本', '如何撰寫專案週報'],
    en: [
      'project status reports',
      'project status reports template',
      'how to write project status reports',
    ],
  },
  '/docs/notifications': {
    zh: ['任務通知', '任務通知 設定', '如何關閉任務通知'],
    en: [
      'task notifications',
      'task notifications settings',
      'how to turn off task notifications',
    ],
  },
  '/features/mobile': {
    zh: ['手機任務管理', '手機任務管理 app', '如何用手機任務管理工具'],
    en: [
      'mobile task management',
      'mobile task management apps',
      'how to use mobile task management',
    ],
  },
  '/templates': {
    zh: ['專案範本', '專案範本 免費下載', '如何建立專案範本'],
    en: [
      'project templates',
      'project templates free download',
      'how to create project templates',
    ],
  },
  '/features/workload': {
    zh: ['工作量管理', '工作量管理 工具', '如何做好工作量管理'],
    en: [
      'workload management',
      'workload management tools',
      'how to improve workload management',
    ],
  },
  '/docs/recurring-tasks': {
    zh: ['重複任務', '重複任務 設定', '如何設定重複任務'],
    en: [
      'recurring tasks',
      'recurring tasks with due dates',
      'how to set up recurring tasks',
    ],
  },
  '/docs/getting-started': {
    zh: ['Acme 入門', 'Acme 入門 教學', 'Acme 入門如何開始'],
    en: [
      'acme getting started',
      'acme getting started tutorial',
      'what does acme getting started cover',
    ],
  },
  '/docs/milestones': {
    zh: ['專案里程碑', '專案里程碑 範例', '如何設定專案里程碑'],
    en: [
      'project milestones',
      'project milestones examples',
      'how to define project milestones',
    ],
  },
  '/docs/project-handover': {
    zh: ['專案交接', '專案交接 清單', '如何完成專案交接'],
    en: [
      'project handover',
      'project handover checklist',
      'how to plan a project handover',
    ],
  },
  '/docs/time-tracking': {
    zh: ['工時追蹤', '工時追蹤 工具', '如何使用工時追蹤'],
    en: [
      'time tracking',
      'time tracking for projects',
      'how to set up time tracking',
    ],
  },
  '/features/calendar': {
    zh: ['團隊行事曆', '團隊行事曆 共用', '如何共用團隊行事曆'],
    en: [
      'team calendar',
      'team calendar sharing',
      'how to share a team calendar',
    ],
  },
  '/docs/comments': {
    zh: ['任務留言', '任務留言 提及同事', '如何管理任務留言'],
    en: [
      'task comments',
      'task comments with mentions',
      'how to organize task comments',
    ],
  },
  '/docs/archive': {
    zh: ['專案封存', '專案封存 還原', '如何還原專案封存資料'],
    en: [
      'project archiving',
      'project archiving and recovery',
      'how does project archiving work',
    ],
  },
  '/templates/sprint': {
    zh: ['衝刺規劃', '衝刺規劃 範本', '如何進行衝刺規劃'],
    en: [
      'sprint planning',
      'sprint planning templates',
      'how to run sprint planning',
    ],
  },
  '/docs/approvals': {
    zh: ['專案審核', '專案審核 流程', '如何設定專案審核流程'],
    en: [
      'project approvals',
      'project approvals workflow',
      'how to manage project approvals',
    ],
  },
  '/docs/integrations': {
    zh: ['專案管理整合', '專案管理整合 Slack', '如何設定專案管理整合'],
    en: [
      'project management integrations',
      'project management integrations with slack',
      'how to configure project management integrations',
    ],
  },
  '/docs/export': {
    zh: ['任務匯出', '任務匯出 Excel', '如何將任務匯出成 Excel'],
    en: [
      'export project tasks',
      'export project tasks to excel',
      'how to export project tasks',
    ],
  },
  '/blog/estimation': {
    zh: ['任務估時', '任務估時 方法', '如何提高任務估時準確度'],
    en: [
      'task estimation',
      'task estimation techniques',
      'how to improve task estimation',
    ],
  },
  '/features/portfolio': {
    zh: ['專案組合管理', '專案組合管理 工具', '如何進行專案組合管理'],
    en: [
      'project portfolio management',
      'project portfolio management tools',
      'how to start project portfolio management',
    ],
  },
  '/blog/retrospectives': {
    zh: ['專案回顧', '專案回顧 範本', '如何主持專案回顧'],
    en: [
      'project retrospectives',
      'project retrospectives templates',
      'how to run project retrospectives',
    ],
  },
  '/contact': {
    zh: ['Acme 產品展示', 'Acme 產品展示 預約', '如何預約 Acme 產品展示'],
    en: [
      'acme product demo',
      'acme product demo booking',
      'how to book an acme product demo',
    ],
  },
  '/showcase': {
    zh: ['專案管理案例', '專案管理案例 行銷團隊', '如何參考專案管理案例'],
    en: [
      'project management examples',
      'project management examples for marketing',
      'where to find project management examples',
    ],
  },
  '/changelog': {
    zh: ['Acme 更新', 'Acme 更新 紀錄', '如何查看 Acme 更新'],
    en: [
      'acme updates',
      'acme updates release notes',
      'where to find acme updates',
    ],
  },
  '/products/crm': {
    zh: ['Acme CRM', 'Acme CRM 客戶管理', '如何使用 Acme CRM'],
    en: ['acme crm', 'acme crm for sales teams', 'how to use acme crm'],
  },
};

export const ACME_QUERIES: PerLanguage<Query[]> = {
  zh: [
    {
      q: '專案管理軟體',
      path: '/',
      impressions: 180,
      position: 6,
      ctr: 0.3,
      rank: { at: 14, by: -5 },
    },
    { q: 'acme', path: '/', impressions: 220, position: 1.2, brand: true },
    {
      q: 'Acme vs Nimbus',
      path: '/compare/nimbus',
      impressions: 8,
      position: 23,
      ctr: 0.5,
    },
    {
      q: 'Excel 匯入任務',
      path: '/docs/import-excel',
      impressions: 63,
      position: 9.2,
    },
  ],
  en: [
    {
      q: 'project management software',
      path: '/',
      impressions: 230,
      position: 6,
      ctr: 0.3,
      rank: { at: 14, by: -5 },
    },
    { q: 'acme', path: '/', impressions: 280, position: 1.2, brand: true },
    {
      q: 'Acme vs Nimbus',
      path: '/compare/nimbus',
      impressions: 10,
      position: 23,
      ctr: 0.5,
    },
    {
      q: 'import tasks from Excel',
      path: '/docs/import-excel',
      impressions: 80,
      position: 9.2,
    },
  ],
};
export const ACME_RESEARCH: PerLanguage<(Research & { topic: string })[]> = {
  zh: [],
  en: [],
};
for (const lang of ['zh', 'en'] as const) {
  ACME_RESEARCH[lang].push(
    ...ACME_QUERIES[lang].map((q) => ({
      keyword: q.q,
      path: q.path,
      topic: 'project management',
      volume: q.impressions * 28,
      difficulty: 28,
      cpc: 2.8,
      intent: 'commercial' as const,
      position: q.position,
    })),
  );
  ACME_PAGES.forEach((p, i) => {
    for (const [j, keyword] of SEARCH_TERMS[p.path][lang].entries()) {
      const position = 6.4 + i * 0.45 + j * 3;
      if (
        ACME_RESEARCH[lang].some(
          (k) => k.keyword.toLowerCase() === keyword.toLowerCase(),
        )
      )
        continue;
      ACME_QUERIES[lang].push({
        q: keyword,
        path: p.path,
        impressions:
          p.path === '/features/workload'
            ? 1
            : (18 + i * 7 + j * 11) *
              (p.path === '/docs/guests' || p.path === '/docs/weekly-reports'
                ? 4.4
                : 1),
        position,
        changes: p.changes,
        ...(p.path === '/features/mobile' ? { rank: { at: 14, by: 4 } } : {}),
      });
      ACME_RESEARCH[lang].push({
        keyword,
        path: p.path,
        topic: 'project management',
        volume: 170 + i * 110 + j * 80,
        difficulty: 18 + i * 2 + j,
        cpc: 1.2 + i * 0.18,
        intent: j === 1 ? 'commercial' : 'informational',
        position,
      });
    }
  });
}
