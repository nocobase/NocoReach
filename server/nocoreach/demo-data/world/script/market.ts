import { t, type Competitor, type TrendTerm } from './types.js';
export {
  ACME_BACKLINKS as BACKLINKS,
  ACME_AI as AI_QUESTIONS,
  ACME_PACKAGES as PACKAGES,
} from './acme.js';

export const COMPETITORS: Competitor[] = [
  {
    name: 'Nimbus',
    domain: 'nimbus.example',
    size: 1.6,
    tagline: t(
      '虚构的项目协作对比样例',
      'Fictional project collaboration comparison',
    ),
    pages: [
      [
        '/',
        t('Nimbus 项目协作', 'Nimbus project collaboration'),
        t(
          '用任务、日历和团队空间组织工作。虚构演示资料。',
          'Organize work with tasks, calendars and team spaces. Fictional demo material.',
        ),
      ],
      [
        '/pricing',
        t('Nimbus 团队方案', 'Nimbus team plans'),
        t(
          '团队规模、访客和排期能力的示例方案。',
          'Sample plans for team size, guests and scheduling.',
        ),
      ],
      [
        '/compare/acme',
        t('Nimbus 与 ACME', 'Nimbus and ACME'),
        t(
          '以相同的任务迁移和交付场景评估两种示例方案。',
          'Evaluate both sample options with the same migration and delivery scenarios.',
        ),
      ],
      [
        '/templates',
        t('项目模板', 'Project templates'),
        t(
          '活动、产品迭代和客户交付的示例模板。',
          'Sample templates for events, product iterations and client delivery.',
        ),
      ],
    ],
  },
  {
    name: 'Example Tasks',
    domain: 'tasks.example',
    size: 0.8,
    tagline: t('虚构的轻量任务工具', 'Fictional lightweight task tool'),
    pages: [
      [
        '/',
        t('Example Tasks 任务清单', 'Example Tasks task lists'),
        t(
          '面向小团队的任务与提醒示例。',
          'Sample tasks and reminders for small teams.',
        ),
      ],
      [
        '/pricing',
        t('团队方案', 'Team plans'),
        t(
          '简单任务协作的示例计费说明。',
          'Sample billing for simple task collaboration.',
        ),
      ],
    ],
  },
  {
    name: 'Example Sales',
    domain: 'sales.example',
    size: 1.2,
    tagline: t('虚构的销售流程对比样例', 'Fictional sales workflow comparison'),
    pages: [
      [
        '/',
        t('Example Sales 销售协作', 'Example Sales collaboration'),
        t(
          '客户、商机和下一步跟进的示例产品。',
          'A sample product for accounts, deals and next actions.',
        ),
      ],
      [
        '/pricing',
        t('销售团队方案', 'Sales team plans'),
        t(
          '按团队与销售流程选择示例方案。',
          'Choose sample plans by team and sales workflow.',
        ),
      ],
      [
        '/docs/import',
        t('客户导入', 'Account imports'),
        t(
          '核对联系人、负责人和重复记录。',
          'Check contacts, owners and duplicate records.',
        ),
      ],
    ],
  },
];

export const TRENDS: TrendTerm[] = [
  {
    term: t('项目管理软件', 'project management software'),
    base: 72,
    slope: 0.3,
  },
  { term: t('团队协作', 'team collaboration'), base: 65, slope: 0.2 },
  {
    term: t('看板工具', 'kanban tools'),
    base: 48,
    slope: 0.1,
    bursts: [[3, 1.5]],
  },
  { term: t('销售漏斗', 'sales pipeline'), base: 55, slope: 0.15 },
  { term: t('客户导入', 'crm import'), base: 34, slope: 0.25 },
];

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
