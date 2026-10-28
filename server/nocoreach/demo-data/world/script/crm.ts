import { historicalTopics, historicalReleases } from '../../history-content.js';
import { CRM_PAGES, CRM_STORIES } from '../../crm-content.js';
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

const QUESTIONS = [
  t(
    '1,280 行客户表有 86 条重复，该先合并还是先导入？',
    'Should we merge 86 duplicates before importing 1,280 account rows?',
  ),
  t(
    '销售请假后，今天的新线索怎样分给替补？',
    'How should new leads route when the assigned rep is on leave?',
  ),
  t(
    '同一个商机五个人选了不同阶段，怎么统一？',
    'How do we align five different stage choices for one deal?',
  ),
  t(
    '报价改到第三版，怎样防止同事发出旧附件？',
    'How do we stop an old attachment being sent after quote version three?',
  ),
  t(
    '临时协助同事跟进客户，会不会看到他全部客户？',
    'Does helping a colleague expose all of their accounts?',
  ),
  t(
    '客户要求下月再联系，怎样暂停这周的提醒？',
    'How do we pause reminders when a client asks for next-month contact?',
  ),
  t(
    '托管方案包含迁移和培训吗？',
    'Does the hosted plan include migration and training?',
  ),
  t(
    '主管的预测金额为什么和签约金额不一样？',
    'Why does forecast value differ from signed contracts?',
  ),
  t(
    '五名销售刚从表格迁移，应该先配置哪些内容？',
    'What should five reps configure first after leaving spreadsheets?',
  ),
  t(
    '转交客户以后，未完成跟进还在旧负责人名下？',
    'Why do open follow-ups remain with the old account owner?',
  ),
  t(
    '离续约还有九十天，现在应该确认什么？',
    'What should we confirm ninety days before renewal?',
  ),
  t(
    '外出拜访网络不好，照片没传完能先存文字吗？',
    'Can we save visit notes before photos finish on a weak connection?',
  ),
  t(
    '本月新增商机是按创建时间还是进入阶段时间？',
    'Do new monthly deals use creation time or stage entry time?',
  ),
  t(
    '输单只写“价格贵”，怎么区分预算和需求问题？',
    'How do we distinguish budget and fit in “too expensive” loss notes?',
  ),
  t(
    '连接个人邮箱后，谁能看客户邮件正文？',
    'Who can read customer email bodies after mailbox connection?',
  ),
  t(
    '预约表单提交后没有确认时区，算预约成功吗？',
    'Is a booking confirmed before its time zone is agreed?',
  ),
  t(
    '第一次演示怎样从客户走到一条明确的下一步？',
    'How do we reach a clear next action in the first walkthrough?',
  ),
  t(
    '十条商机能验证 AI 赢单预测准确率吗？',
    'Can ten deals validate AI win prediction accuracy?',
  ),
  t(
    '旧导入教程的按钮和现在界面不同，应该看哪篇？',
    'Which guide replaces the old importer screenshots?',
  ),
  t(
    '订单回传重试后生成两条跟进，怎么去重？',
    'How do we avoid duplicate follow-ups after a retried order callback?',
  ),
];

/** CRM sources share the editorial topics while retaining their own identities and timelines. */
export const CRM_REPOSITORY: Repository = {
  owner: 'acme',
  name: 'crm',
  description: t(
    '虚构的销售协作产品：客户、商机、报价与续约。',
    'A fictional sales collaboration product: accounts, deals, quotes and renewals.',
  ),
  topics: ['crm', 'sales', 'self-hosted', 'workflow', 'typescript'],
  people: [
    { login: '@editor', team: true },
    { login: 'crm-maintainer', team: true },
    { login: 'sales-ops-demo' },
    { login: 'migration-demo' },
  ],
  issues: CRM_STORIES.filter((s) => !s.archived && !s.cancelled).map(
    (s, i) => ({
      title: s.title,
      body: s.brief,
      labels: [
        s.kind === 'research' ? 'research' : 'documentation',
        i % 3 ? 'sales-workflow' : 'data-quality',
      ],
      author: i % 2 ? 'sales-ops-demo' : 'migration-demo',
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
  pulls: CRM_STORIES.slice(0, 9).map((s, i) => ({
    title: s.title,
    author: 'crm-maintainer',
    opened: 25 - i * 2,
    ...(i < 6 ? { merged: 12 - i } : {}),
    comments: 2 + (i % 4),
  })),
  commits: [
    t('保留重复导入的原始行号', 'Preserve source row IDs in duplicate imports'),
    t(
      '转交客户时显示未完成跟进',
      'Show open follow-ups during account handover',
    ),
    t('报价附件显示版本状态', 'Show version status on quote attachments'),
    t(
      '记录预约时区与确认状态',
      'Record booking time zone and confirmation status',
    ),
  ],
  releases: [
    {
      tag: 'v1.4.2',
      name: t('1.4.2：转交与提醒修复', '1.4.2: handover and reminder fixes'),
      notes: t(
        '修复转交后待办提醒对象；保留暂停联系原因。',
        'Fix follow-up recipients after handover; retain paused-contact reasons.',
      ),
      age: 3,
    },
    {
      tag: 'v1.4.1',
      name: t('1.4.1：导入预览', '1.4.1: import preview'),
      notes: t(
        '重复记录预览显示原始行号与合并前后数量。',
        'Duplicate previews show source rows and counts before and after merging.',
      ),
      age: 16,
    },
    {
      tag: 'v1.4.0',
      name: t('1.4：报价版本', '1.4: quote versions'),
      notes: t(
        '新增报价版本记录、折扣审核和作废说明。',
        'Add quote history, discount review and superseded notes.',
      ),
      age: 37,
    },
    ...historicalReleases(false),
  ],
  stars: {
    total: 1460,
    perDay: 5,
    changes: [{ kind: 'spike', at: 16, size: 2.4, halfLife: 3 }],
  },
  forks: 146,
  watchers: 32,
  languages: { TypeScript: 460000, CSS: 64000, JavaScript: 31000 },
  readme: t(
    '# ACME CRM\n\n虚构演示项目。管理客户、联系人、商机与下一步跟进。先用二十行样例验证导入与权限，再扩展流程。',
    '# ACME CRM\n\nFictional demo project. Manage accounts, contacts, deals and next actions. Rehearse twenty rows and verify access before expanding workflows.',
  ),
};

export const CRM_FORUM: Forum = {
  title: t('ACME CRM 社区', 'ACME CRM community'),
  description: t(
    '虚构销售团队的实施提问与经验交流。',
    'Implementation questions and experience from fictional sales teams.',
  ),
  categories: [
    [1, t('实施与导入', 'Implementation and imports'), 'implementation'],
    [2, t('销售流程', 'Sales workflows'), 'sales'],
    [3, t('经验与建议', 'Experiences and ideas'), 'ideas'],
  ],
  topics: [
    ...historicalTopics(false),
    ...CRM_STORIES.map((s, i) => ({
      title: QUESTIONS[i],
      category: 1 + (i % 3),
      tags: ['crm', i % 2 ? 'sales-operations' : 'implementation'],
      opened: 2 + i * 2,
      views: 98 + i * 47,
      likes: 2 + (i % 13),
      ...(s.state === 'done' && !s.archived ? { accepted: 2 } : {}),
      closed: Boolean(s.archived || s.cancelled),
      posts: [
        {
          author: `crm-demo-${(i % 5) + 1}`,
          after: 0,
          text: t(
            `${QUESTIONS[i].zh} ${s.comments[0][1].zh}`,
            `${QUESTIONS[i].en} ${s.comments[0][1].en}`,
          ),
        },
        ...s.comments.map(([, text], j) => ({
          author: j === 0 ? '@editor' : `crm-demo-${((i + 2) % 5) + 1}`,
          after: 2 + j * 5,
          text,
          likes: 1 + ((i + j) % 6),
        })),
      ],
    })),
  ],
};

export const CRM_SLACK: ChatChannel[] = [
  'sales-operations',
  'implementation',
  'content-review',
].map((name, channel) => ({
  name,
  members: [28, 19, 12][channel],
  messages: CRM_STORIES.filter((_, i) => i % 3 === channel).map((s, i) => ({
    at: 2 + i * 13 + channel * 3,
    author: i % 2 ? '@editor' : 'sales-ops-demo',
    text: s.brief,
    replies: s.comments.map(([, text]) => ['@editor', text] as const),
  })),
}));
export const CRM_DISCORD: ChatChannel[] = CRM_SLACK.map((c, i) => ({
  ...c,
  name: ['crm-help', 'import-workshop', 'sales-stories'][i],
  members: c.members * 3,
  forum: i === 1,
}));
export const CRM_X: SocialPost[] = CRM_STORIES.slice(0, 14).map((s, i) => ({
  at: 2 + i * 9,
  author: i % 3 ? `crm-demo-${(i % 5) + 1}` : '@editor',
  text: t(
    `ACME CRM 演示笔记：${s.comments[0][1].zh}`,
    `ACME CRM demo notes: ${s.comments[0][1].en}`,
  ),
  likes: 18 + i * 13,
  reposts: 2 + (i % 8),
  replies: 1 + (i % 6),
  quotes: i % 3,
  views: 480 + i * 340,
}));
export const CRM_HN: Story[] = CRM_STORIES.filter((_, i) =>
  [0, 4, 8, 9, 16, 19].includes(i),
).map((s, i) => ({
  title: t(`ACME CRM：${s.title.zh}`, `ACME CRM: ${s.title.en}`),
  path: s.path,
  author: 'crm-demo-team',
  points: 29 + i * 17,
  age: 3 + i * 5,
  comments: s.comments.map(
    ([, text], j) => [`crm-reader-${j + 1}`, 1 + j * 2, text] as const,
  ),
}));
export const CRM_REDDIT: Thread[] = CRM_STORIES.slice(0, 10).map((s, i) => ({
  subreddit: ['CRM', 'sales', 'selfhosted'][i % 3],
  title: s.title,
  description: s.brief,
  age: 2 + i * 3,
  traffic: 45 + i * 18,
}));
export const CRM_MEDIA: Media[] = CRM_STORIES.slice(0, 15).map((s, i) => ({
  title: t(
    `ACME CRM 实操：${QUESTIONS[i].zh}`,
    `ACME CRM workshop: ${QUESTIONS[i].en}`,
  ),
  description: s.brief,
  age: 2 + i * 3,
  views: 1840 + i * 1387,
  likes: 78 + i * 41,
  comments: 7 + i * 5,
  duration: 360 + i * 53,
  channel: [
    'ACME CRM Demo',
    'Sales Operations Demo',
    'Implementation Workshop',
  ][i % 3],
}));
export const CRM_AI: AiQuestion[] = CRM_PAGES.slice(0, 10).map((p, i) => ({
  question: t(
    `ACME CRM 如何处理${p.title.zh}？`,
    `How does ACME CRM handle ${p.title.en.toLowerCase()}?`,
  ),
  answer: t(
    `虚构演示资料说明：${p.description.zh}`,
    `The fictional demo explains: ${p.description.en}`,
  ),
  cites: i === 8 ? [] : [p.path],
  ...(i === 8 ? { rival: 'sales.example' } : {}),
  volume: 90 + i * 35,
  topics: ['open source crm', 'sales pipeline', 'workflow automation'],
}));
export const CRM_BACKLINKS: Backlink[] = CRM_PAGES.slice(0, 9).map((p, i) => ({
  domain: `sales-guide-${i + 1}.example`,
  path: `/articles/crm-${i + 1}`,
  title: p.title,
  anchor: p.title,
  target: p.path,
  rank: 20 + i * 4,
  dofollow: i % 3 !== 0,
  firstSeen: 25 + i * 7,
  ...(i === 6 ? { lost: 4 } : {}),
}));
export const CRM_PACKAGES: PackageLine = {
  versions: [
    ['1.4.2', 3],
    ['1.4.1', 16],
    ['1.4.0', 37],
    ['1.3.0', 80],
  ],
  npm: 1850,
  pypi: 410,
  docker: 238000,
  changes: [
    { kind: 'spike', at: 16, size: 1.8 },
    { kind: 'step', at: 37, to: 1.15 },
  ],
};

export const CRM_QUERIES: PerLanguage<Query[]> = { zh: [], en: [] };
export const CRM_RESEARCH: PerLanguage<(Research & { topic: string })[]> = {
  zh: [],
  en: [],
};
for (const lang of ['zh', 'en'] as const) {
  CRM_PAGES.forEach((p, i) => {
    for (const [j, suffix] of (lang === 'zh'
      ? ['指南', '模板', '常见问题']
      : ['guide', 'template', 'common questions']
    ).entries()) {
      const keyword = `${lang === 'zh' ? 'CRM' : 'crm'} ${p.title[lang]} ${suffix}`;
      const position = 6.4 + i * 0.75 + j * 3;
      CRM_QUERIES[lang].push({
        q: keyword,
        path: p.path,
        impressions: p.path === '/docs/renewals' ? 1 : 18 + i * 7 + j * 11,
        position,
        changes: p.changes,
        ...(i === 2 || i === 3 ? { rank: { at: 14, by: -3 } } : {}),
      });
      CRM_RESEARCH[lang].push({
        keyword,
        path: p.path,
        topic: 'crm',
        volume: 170 + i * 110 + j * 80,
        difficulty: 18 + i * 2 + j,
        cpc: 1.2 + i * 0.18,
        intent: j === 1 ? 'commercial' : 'informational',
        position,
      });
    }
  });
}
