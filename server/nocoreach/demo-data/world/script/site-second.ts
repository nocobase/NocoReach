import { CRM_PAGES } from '../../crm-content.js';
import { t, type Site } from './types.js';

/** The CRM project has an established product site and an active editorial calendar. */
export const SECOND_SITE: Site = {
  name: 'Acme CRM',
  domain: 'crm.acme.example',
  tagline: t(
    '给中小销售团队的开源 CRM',
    'An open-source CRM for small sales teams',
  ),
  sessions: { zh: 260, en: 210 },
  pages: [
    ...CRM_PAGES,
    {
      path: '/',
      title: t(
        'Acme CRM：开源、可私有部署的 CRM',
        'Acme CRM: an open-source CRM you can self-host',
      ),
      description: t(
        'Acme CRM 是 Acme 虚构品牌旗下的独立销售协作产品：客户、商机、报价和跟进记录一站管理，可以私有部署，并按团队的销售流程自由调整字段和阶段。',
        'A separate sales collaboration product under the fictional Acme brand, bringing accounts, deals, quotes and activities together.',
      ),
      sections: [
        [
          t('为销售团队设计', 'Made for sales teams'),
          t(
            '每个销售只看到自己的客户，主管看团队漏斗，管理员调整字段和阶段。',
            'Each rep sees their own accounts, managers see the team funnel, and admins adjust fields and stages.',
          ),
        ],
        [
          t('数据在你手里', 'Your data stays yours'),
          t(
            '部署在自己的服务器上，随时导出全部数据。',
            'Run it on your own servers and export everything at any time.',
          ),
        ],
      ],
      weight: 10,
      published: 800,
      updated: 9,
      links: ['/features/pipeline', '/pricing', '/docs/quick-start'],
    },
    {
      path: '/pricing',
      title: t('价格', 'Pricing'),
      description: t(
        'Acme CRM 开源版免费，包含全部核心功能，由团队自行部署和维护；托管版按席位计费，提供备份和升级服务，具体价格以销售报价为准。',
        'The open-source edition is free; hosted plans are per seat, priced in a quote.',
      ),
      sections: [
        [
          t('开源版', 'Open source'),
          t(
            '全部核心功能，自行部署和维护。',
            'Every core feature, deployed and maintained by you.',
          ),
        ],
      ],
      weight: 4,
      published: 790,
      updated: 40,
    },
    {
      path: '/features/pipeline',
      title: t('销售漏斗', 'Sales pipeline'),
      description: t(
        '用销售漏斗看板管理商机：拖动卡片切换阶段，按阶段统计金额和赢单率，阶段名称和每个阶段的必填字段都可以按团队流程调整。',
        'Drag deal cards between stages and see amounts and win rates by stage.',
      ),
      sections: [
        [
          t('阶段看板', 'Stage board'),
          t(
            '阶段和必填字段可以按团队流程调整。',
            'Stages and their required fields follow your process.',
          ),
        ],
      ],
      weight: 3,
      published: 780,
      updated: 60,
    },
    {
      path: '/features/quotes',
      title: t('报价单', 'Quotes'),
      description: t(
        '从商机直接生成报价单，折扣超过百分之十五时自动交给主管审批，审批通过后导出 PDF 发给客户，所有版本和审批记录都会保留下来。',
        'Create a quote from a deal and send it as PDF after approval.',
      ),
      sections: [
        [
          t('报价审批', 'Quote approval'),
          t(
            '折扣超过 15% 的报价需要主管审批。',
            "Quotes with more than 15% discount need a manager's approval.",
          ),
        ],
      ],
      weight: 2,
      published: 770,
      updated: 70,
    },
    {
      path: '/features/permissions',
      title: t('团队与权限', 'Teams and permissions'),
      description: t(
        '按团队和岗位划分客户的可见范围，销售只看自己的客户，主管查看整个团队；销售离职时可以批量转移客户和商机，跟进记录不会丢失。',
        'Split account visibility by team and job, and keep history when accounts change hands.',
      ),
      sections: [
        [
          t('客户交接', 'Handing over accounts'),
          t(
            '销售离职时批量转移客户与商机，跟进记录不会丢失。',
            "Move a leaving rep's accounts and deals in bulk without losing activities.",
          ),
        ],
      ],
      weight: 1.6,
      published: 760,
      updated: 80,
    },
    {
      path: '/docs/quick-start',
      title: t('快速开始', 'Quick start'),
      description: t(
        '十分钟开始使用 Acme CRM：下载 docker-compose.yml 并修改密码，启动后用 Excel 模板导入客户，再邀请团队成员并分配销售和主管角色。',
        'Deploy Acme CRM with Docker, import accounts and invite your team.',
      ),
      sections: [
        [
          t('部署', 'Deploy'),
          t(
            '下载 docker-compose.yml，修改密码后执行 docker compose up -d。',
            'Download docker-compose.yml, change the passwords and run docker compose up -d.',
          ),
        ],
        [
          t('导入客户', 'Import accounts'),
          t(
            '使用 Excel 模板导入客户，电话和邮箱会自动去重。',
            'Import accounts from the Excel template; phone numbers and emails are deduplicated.',
          ),
        ],
        [
          t('邀请团队成员', 'Invite your team'),
          t(
            '在设置里邀请同事，并给销售和主管分配不同角色；主管能看到整个团队的漏斗，销售只看到自己负责的客户。',
            "Invite colleagues from settings and give reps and managers different roles: managers see the whole team's pipeline, reps see only the accounts they own.",
          ),
        ],
      ],
      weight: 2.4,
      published: 750,
      updated: 22,
    },
    {
      path: '/docs/import',
      title: t('导入客户数据', 'Importing account data'),
      description: t(
        '导入客户数据的 Excel 模板字段说明，电话和邮箱如何自动去重，以及日期格式不一致、负责人账号不存在等最常见导入错误的处理方法。',
        'The fields of the Excel import template, how phones and emails are de-duplicated, and the most common import errors with their fixes.',
      ),
      sections: [
        [
          t('常见错误', 'Common errors'),
          t(
            '日期格式不一致和负责人账号不存在是最常见的两类错误。',
            'Inconsistent dates and owners without accounts are the two most common errors.',
          ),
        ],
        [
          t('导入之前', 'Before you import'),
          t(
            '先在模板里统一日期格式，确认每个负责人都已经有账号，并去掉同一客户的重复行；第一次导入建议先试二十行。',
            'Use one date format in the template, make sure every owner already has an account, and remove duplicate rows for the same account; try twenty rows on your first import.',
          ),
        ],
      ],
      weight: 1.2,
      published: 740,
      updated: 50,
    },
    {
      path: '/blog/crm-for-small-teams',
      title: t(
        '十人以下的销售团队需要 CRM 吗？',
        'Does a sales team under ten need a CRM?',
      ),
      description: t(
        '十人以下的销售团队需要 CRM 吗？从共享表格换到 CRM 的合适时机，以及客户名称、负责人、阶段、金额和跟进日期这组最小可用字段。',
        'When to move from a shared sheet to a CRM, and the smallest useful set of fields.',
      ),
      sections: [
        [
          t('最小字段集合', 'The smallest field set'),
          t(
            '客户名称、负责人、阶段、预计金额和下次跟进日期就足够开始。',
            'Account name, owner, stage, expected amount and next follow-up date are enough to start.',
          ),
        ],
        [
          t('什么时候该换', 'When to switch'),
          t(
            '当客户超过两百个、同一份表格有多人同时修改，或者主管需要每周手动汇总漏斗时，就是换到 CRM 的好时机。',
            'Once you pass two hundred accounts, several people edit the same sheet, or a manager rebuilds the pipeline by hand every week, it is time to move to a CRM.',
          ),
        ],
      ],
      weight: 1.8,
      published: 40,
      updated: 40,
    },
    {
      path: '/blog/pipeline-stages',
      title: t('如何定义销售阶段', 'How to define pipeline stages'),
      description: t(
        '如何定义销售阶段：每个阶段都应该有可验证的进入条件，例如「已确认预算」比「意向强」更容易判断，阶段过多或过少都会影响预测。',
        'Every stage needs an entry condition you can verify.',
      ),
      sections: [
        [
          t('进入条件', 'Entry conditions'),
          t(
            '例如「已确认预算」比「意向强」更容易判断。',
            '"Budget confirmed" is easier to judge than "strong interest".',
          ),
        ],
        [
          t('阶段别太多', 'Keep it short'),
          t(
            '五到七个阶段通常就够用：太少看不出卡在哪里，太多则每个商机都要频繁调整，销售也不愿意及时更新。',
            'Five to seven stages are usually enough: too few hide where deals stall, and too many make every deal a chore to update, so reps stop keeping it current.',
          ),
        ],
      ],
      weight: 1.1,
      published: 12,
      changes: [{ kind: 'launch', at: 12, ramp: 8 }],
      index: 'discovered',
    },
    {
      path: '/compare/example-sales',
      title: t('Acme CRM 与 Example Sales 对比', 'Acme CRM vs Example Sales'),
      description: t(
        'Acme CRM 与 Example Sales 的对比：私有部署与云端托管、字段和页面的定制能力、按席位计算的长期成本，以及哪类销售团队更适合哪一种。',
        'How Acme CRM and Example Sales differ in self-hosting, customizing fields and pages, and long-term per-seat cost.',
      ),
      sections: [
        [
          t('定制', 'Customization'),
          t(
            'Acme CRM 的字段、阶段和页面都可以由管理员直接修改。',
            'Admins change Acme CRM fields, stages and pages directly.',
          ),
        ],
      ],
      weight: 1.4,
      published: 690,
      updated: 90,
    },
    {
      path: '/contact',
      title: t('联系我们', 'Contact us'),
      description: t('', ''),
      sections: [
        [
          t('预约演示', 'Book a demo'),
          t(
            '留下邮箱，我们会安排 30 分钟演示。',
            'Leave your email and we will book a 30-minute demo.',
          ),
        ],
      ],
      weight: 0.8,
      published: 800,
      flags: ['thin'],
    },
  ],
};
