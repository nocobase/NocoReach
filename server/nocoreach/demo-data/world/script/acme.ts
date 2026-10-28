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
    '# ACME\n\n虚构演示项目。管理任务、看板、里程碑和项目交接。先用二十行任务验证 Excel 导入与访客权限。',
    '# ACME\n\nFictional demo project. Manage tasks, boards, milestones and handovers. Rehearse twenty task rows and verify guest access before expanding.',
  ),
};

export const ACME_FORUM: Forum = {
  title: t('ACME 社区', 'ACME community'),
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
    `ACME 演示笔记：${s.comments[0][1].zh}`,
    `ACME demo notes: ${s.comments[0][1].en}`,
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
    `ACME：${ACME_DISCUSSIONS[ACME_STORIES.indexOf(s)].title.zh}`,
    `ACME: ${ACME_DISCUSSIONS[ACME_STORIES.indexOf(s)].title.en}`,
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
export const ACME_MEDIA: Media[] = ACME_STORIES.slice(0, 15).map((s, i) => ({
  title: t(
    `ACME 实操：${ACME_DISCUSSIONS[i].title.zh}`,
    `ACME workshop: ${ACME_DISCUSSIONS[i].title.en}`,
  ),
  description: s.brief,
  age: 2 + i * 3,
  views: 1840 + i * 1387,
  likes: 78 + i * 41,
  comments: 7 + i * 5,
  duration: 360 + i * 53,
  channel: ['ACME Demo', 'Team Delivery Demo', 'Implementation Workshop'][
    i % 3
  ],
}));
export const ACME_AI: AiQuestion[] = ACME_PAGES.slice(0, 10).map((p, i) => ({
  question: t(
    `ACME 如何处理${p.title.zh}？`,
    `How does ACME handle ${p.title.en.toLowerCase()}?`,
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

export const ACME_QUERIES: PerLanguage<Query[]> = {
  zh: [
    {
      q: '项目管理软件',
      path: '/',
      impressions: 180,
      position: 6,
      ctr: 0.3,
      rank: { at: 14, by: -5 },
    },
    { q: 'acme', path: '/', impressions: 220, position: 1.2, brand: true },
    {
      q: 'ACME vs Nimbus',
      path: '/compare/nimbus',
      impressions: 8,
      position: 23,
      ctr: 0.5,
    },
    {
      q: 'Excel 导入任务',
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
      q: 'ACME vs Nimbus',
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
    for (const [j, suffix] of (lang === 'zh'
      ? ['指南', '模板', '常见问题']
      : ['guide', 'template', 'common questions']
    ).entries()) {
      const keyword = `${lang === 'zh' ? '项目管理' : 'project management'} ${p.title[lang]} ${suffix}`;
      const position = 6.4 + i * 0.45 + j * 3;
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
