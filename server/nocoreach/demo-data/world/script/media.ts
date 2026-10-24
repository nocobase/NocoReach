import { t, type L } from './types.js';

export interface Media {
  title: L;
  /** Days ago. */
  age: number;
  views: number;
  likes: number;
  comments: number;
  /** Seconds. */
  duration?: number;
  channel?: string;
  description?: L;
  /** Search terms that find it, besides the product name. */
  terms?: readonly string[];
}

const m = (
  zh: string,
  en: string,
  age: number,
  views: number,
  likes: number,
  comments: number,
  extra: Partial<Media> = {},
): Media => ({ title: t(zh, en), age, views, likes, comments, ...extra });

/** Bilibili videos: tutorials, a release walkthrough and community case studies. */
export const BILIBILI: Media[] = [
  m(
    'NocoBase 2.0 新功能全解析：页面引擎、AI 员工、工作流提速',
    'NocoBase 2.0 walkthrough: page engine, AI employees, faster workflows',
    17,
    48_200,
    2_310,
    386,
  ),
  m(
    '十分钟用 NocoBase 搭一个 CRM（附模板）',
    'Build a CRM with NocoBase in ten minutes (template included)',
    34,
    126_400,
    6_820,
    912,
  ),
  m(
    'NocoBase 权限实战：销售只能看自己的客户',
    'NocoBase permissions: reps see only their own accounts',
    12,
    18_900,
    1_040,
    147,
  ),
  m(
    'Docker 部署 NocoBase 常见问题排查',
    'Troubleshooting a Docker deployment of NocoBase',
    6,
    7_420,
    389,
    96,
  ),
  m(
    '用工作流 + 大模型自动分类售后工单',
    'Auto-label support tickets with workflows and an LLM',
    9,
    31_600,
    1_980,
    254,
  ),
  m(
    '从 Excel 到业务系统：客户台账迁移实录',
    'From Excel to a business system: moving a customer ledger',
    26,
    22_300,
    1_170,
    203,
  ),
  m(
    '采购审批流程设计：退回、重提与代理审批',
    'Designing purchase approvals: return, resubmit and delegation',
    41,
    15_800,
    760,
    118,
  ),
  m(
    'NocoBase 插件开发入门：写一个自定义字段',
    'Plugin development: writing a custom field type',
    63,
    11_200,
    640,
    92,
  ),
  m(
    '开源低代码平台横评：NocoBase / Gridline / StackMeadow',
    'Open-source low-code compared: NocoBase, Gridline, StackMeadow',
    22,
    64_900,
    3_120,
    1_043,
  ),
  m(
    '实验室预约系统是怎么搭出来的',
    'How we built a lab booking system',
    45,
    9_800,
    530,
    71,
  ),
  m(
    '备份与恢复演练：别只备份数据库',
    'Backup and restore drills: not just the database',
    2,
    1_960,
    140,
    23,
  ),
  m(
    'NocoBase 数据建模：一对多与多对多讲透',
    'Data modeling in NocoBase: one-to-many and many-to-many',
    88,
    27_400,
    1_560,
    188,
  ),
  m(
    '进销存系统零代码搭建（上）',
    'Inventory without code, part 1',
    110,
    38_700,
    1_890,
    266,
  ),
  m(
    '进销存系统零代码搭建（下）',
    'Inventory without code, part 2',
    103,
    21_100,
    1_020,
    141,
  ),
];

/** Xiaohongshu notes: practitioners sharing what they built and what tripped them up. */
export const XIAOHONGSHU: Media[] = [
  m(
    '打工人自救｜用开源工具给销售团队搭了个 CRM',
    'Built a CRM for our sales team with an open-source tool',
    5,
    0,
    1_260,
    214,
  ),
  m(
    '低代码平台怎么选？我试了 5 个后的真实感受',
    'Choosing a low-code platform: honest notes after trying five',
    13,
    0,
    3_480,
    512,
  ),
  m(
    'NocoBase 部署踩坑记录（Docker 版）',
    'NocoBase deployment pitfalls (Docker edition)',
    8,
    0,
    420,
    88,
  ),
  m(
    '行政小白也能做的审批系统',
    'An approval system even a new admin can build',
    19,
    0,
    2_110,
    301,
  ),
  m(
    'Excel 客户表迁移前一定要做的 3 件事',
    'Three things to do before moving customer sheets',
    24,
    0,
    1_680,
    147,
  ),
  m(
    'AI 员工帮我自动整理周报，太香了',
    'An AI employee now tidies my weekly report',
    10,
    0,
    980,
    132,
  ),
  m(
    '实验室预约｜高校老师的零代码实践',
    'Lab booking: a lecturer builds it without code',
    47,
    0,
    760,
    64,
  ),
  m(
    '给小公司做进销存，我用了这个开源项目',
    'Inventory for a small company with this open-source project',
    31,
    0,
    1_340,
    179,
  ),
  m(
    '权限设计太难了？三条原则讲清楚',
    'Permission design made simple: three principles',
    15,
    0,
    590,
    41,
  ),
  m(
    '开源 CRM vs 付费 CRM，小团队怎么选',
    'Open-source vs paid CRM for small teams',
    37,
    0,
    2_270,
    356,
  ),
  m(
    'NocoBase 2.0 上手一周的体验',
    'One week with NocoBase 2.0',
    16,
    0,
    840,
    97,
  ),
  m('售后工单系统搭建笔记', 'Notes on building a helpdesk', 52, 0, 470, 38),
];

/** YouTube: the official channel and community creators. */
export const YOUTUBE: Media[] = [
  m(
    'NocoBase 2.0 正式发布：新功能演示',
    'NocoBase 2.0 is here: feature tour',
    18,
    41_300,
    1_820,
    214,
    {
      duration: 912,
      channel: 'NocoBase',
      description: t(
        '2.0 的页面引擎、AI 员工和工作流改进。',
        'The 2.0 page engine, AI employees and workflow improvements.',
      ),
    },
  ),
  m(
    '十分钟搭建第一个应用',
    'Build your first app in 10 minutes',
    58,
    88_600,
    3_940,
    402,
    {
      duration: 640,
      channel: 'NocoBase',
      description: t(
        '客户表、录入表单和角色权限三个练习。',
        'Three exercises: a customer table, an entry form and role permissions.',
      ),
    },
  ),
  m(
    '自托管开源 CRM 完整教程',
    'Self-hosted open-source CRM: full tutorial',
    29,
    52_100,
    2_210,
    318,
    {
      duration: 1_860,
      channel: 'Selfhosted Simon',
      description: t(
        '从 Docker 部署到销售漏斗。',
        'From a Docker deploy to a sales pipeline.',
      ),
    },
  ),
  m(
    'Airtable vs NocoBase：哪个适合你的团队？',
    'Airtable vs NocoBase: which fits your team?',
    21,
    36_800,
    1_390,
    520,
    {
      duration: 1_120,
      channel: 'Tool Tradeoffs',
      description: t(
        '私有部署、权限和成本对比。',
        'Self-hosting, permissions and cost compared.',
      ),
    },
  ),
  m(
    '用 AI 自动分类工单（NocoBase 工作流）',
    'Auto-classify tickets with AI (NocoBase workflows)',
    8,
    14_900,
    760,
    88,
    {
      duration: 780,
      channel: 'Automate Weekly',
      description: t(
        '提示词、条件节点和人工确认。',
        'Prompts, condition nodes and a human check.',
      ),
    },
  ),
  m(
    'NocoBase 权限：行级与字段级',
    'NocoBase permissions: row and field level',
    11,
    9_700,
    420,
    61,
    {
      duration: 840,
      channel: 'NocoBase',
      description: t(
        '销售、主管和管理员三种角色。',
        'Reps, managers and admins.',
      ),
    },
  ),
  m(
    '在 Kubernetes 上部署 NocoBase',
    'Deploying NocoBase on Kubernetes',
    3,
    2_480,
    140,
    19,
    {
      duration: 1_340,
      channel: 'Cluster Notes',
      description: t(
        'Helm、共享存储与 Redis。',
        'Helm, shared storage and Redis.',
      ),
    },
  ),
  m(
    '开源低代码平台 2026 横评',
    'Open-source low-code platforms, 2026 review',
    40,
    61_200,
    2_640,
    734,
    {
      duration: 2_210,
      channel: 'Tool Tradeoffs',
      description: t(
        '五个平台的真实项目测试。',
        'Five platforms tested on a real project.',
      ),
    },
  ),
  m(
    'NocoBase 插件开发直播回放',
    'NocoBase plugin development live replay',
    66,
    6_300,
    290,
    37,
    {
      duration: 5_400,
      channel: 'NocoBase',
      description: t(
        '从零写一个自定义区块。',
        'Writing a custom block from scratch.',
      ),
    },
  ),
  m(
    '采购审批流程实战',
    'Purchase approval workflow in practice',
    33,
    11_800,
    510,
    66,
    {
      duration: 960,
      channel: 'Ops Builders',
      description: t(
        '退回、重提与代理审批。',
        'Return, resubmit and delegation.',
      ),
    },
  ),
];
