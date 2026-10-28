import type { PerLanguage, Query } from './types.js';
export {
  ACME_QUERIES as MAIN_QUERIES,
  ACME_RESEARCH as RESEARCH,
} from './acme.js';

type Extra = Partial<
  Pick<Query, 'ctr' | 'changes' | 'rank' | 'brand' | 'also'>
>;
const q = (
  query: string,
  path: string,
  impressions: number,
  position: number,
  extra: Extra = {},
): Query => ({ q: query, path, impressions, position, ...extra });
const brand: Extra = { brand: true, ctr: 1.15 };
const pricingDecline: Extra = {
  ...brand,
  changes: [{ kind: 'step', at: 14, to: 0.55 }],
};
export const TOPIC_WORDS: Record<string, readonly string[]> = {
  'project management': [
    'acme',
    'project',
    'task',
    'team',
    'kanban',
    '项目',
    '任务',
    '协作',
    '排期',
  ],
  crm: ['crm', 'sales', 'pipeline', 'contact', '客户', '销售', '商机', '报价'],
};

export const SECOND_QUERIES: PerLanguage<Query[]> = {
  zh: [
    q('acme crm', '/', 120, 1.1, brand),
    q('acme crm 价格', '/pricing', 25, 1.3, pricingDecline),
    q('acme crm 部署', '/docs/quick-start', 18, 1.5, brand),
    q('开源crm', '/', 200, 18.5),
    q('免费crm 小团队', '/blog/crm-for-small-teams', 90, 12.3),
    q('小团队 crm', '/blog/crm-for-small-teams', 70, 8.6),
    q('销售漏斗 管理', '/features/pipeline', 110, 15.8),
    q('销售漏斗 看板', '/features/pipeline', 45, 9.4),
    q('报价单 审批', '/features/quotes', 40, 9.2),
    q('报价单 模板', '/features/quotes', 60, 21.5),
    q('crm 导入 excel', '/docs/import', 60, 11.4),
    q('销售阶段 定义', '/blog/pipeline-stages', 35, 7.9, {
      changes: [{ kind: 'launch', at: 12, ramp: 8 }],
    }),
    q('example sales 替代', '/compare/example-sales', 90, 10.8),
    q('crm 私有部署', '/', 80, 6.4),
    q('客户交接 离职', '/features/permissions', 30, 9.7),
    q('crm 权限 团队', '/features/permissions', 40, 13.2),
    q('crm docker', '/docs/quick-start', 35, 7.1),
  ],
  en: [
    q('acme crm', '/', 100, 1.1, brand),
    q('acme crm pricing', '/pricing', 20, 1.2, pricingDecline),
    q('acme crm docker', '/docs/quick-start', 15, 1.4, brand),
    q('open source crm', '/', 260, 21.4),
    q('free crm for small teams', '/blog/crm-for-small-teams', 110, 13.1),
    q('crm for small sales team', '/blog/crm-for-small-teams', 80, 9.3),
    q('sales pipeline management', '/features/pipeline', 140, 17.6),
    q('kanban sales pipeline', '/features/pipeline', 50, 10.2),
    q('quote approval workflow', '/features/quotes', 35, 9.8),
    q('quote template', '/features/quotes', 90, 24.4),
    q('import contacts from excel crm', '/docs/import', 55, 12.2),
    q('define pipeline stages', '/blog/pipeline-stages', 40, 8.4, {
      changes: [{ kind: 'launch', at: 12, ramp: 8 }],
    }),
    q('example sales alternative', '/compare/example-sales', 160, 14.2),
    q('self hosted crm', '/', 90, 7.5),
    q('reassign accounts when rep leaves', '/features/permissions', 25, 8.8),
    q('crm team permissions', '/features/permissions', 35, 12.6),
    q('crm docker compose', '/docs/quick-start', 30, 8),
  ],
};
