import type { Change, PerLanguage, Query, Research } from './types.js';

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
const release: Change[] = [
  { kind: 'launch', at: 18, ramp: 1 },
  { kind: 'spike', at: 18, size: 5, halfLife: 2 },
];
const hn: Change[] = [
  { kind: 'launch', at: 11, ramp: 1 },
  { kind: 'spike', at: 9, size: 6, halfLife: 1.2 },
];
const crmRise: Extra = {
  changes: [{ kind: 'step', at: 20, to: 1.5, over: 8 }],
  rank: { at: 20, by: -2.4 },
};
// The charts guide: more impressions from twelve days ago, but a worse position, so fewer clicks.
const chartsDrop: Extra = {
  changes: [{ kind: 'step', at: 12, to: 1.28, over: 3 }],
  rank: { at: 12, by: 2.8 },
};
const onboardingUp: Extra = {
  changes: [{ kind: 'step', at: 12, to: 1.18, over: 4 }],
  rank: { at: 12, by: -1.3 },
};
const lowCodeFade: Extra = {
  changes: [{ kind: 'step', at: 45, to: 0.72, over: 20 }],
  rank: { at: 45, by: 3 },
};
const aiRise: Extra = {
  changes: [{ kind: 'step', at: 25, to: 1.7, over: 10 }],
};

export const MAIN_QUERIES: PerLanguage<Query[]> = {
  zh: [
    q('nocobase', '/', 900, 1.1, brand),
    q('nocobase 是什么', '/', 120, 1.3, brand),
    q('nocobase 教程', '/docs/getting-started', 150, 1.8, {
      ...brand,
      ...onboardingUp,
    }),
    q('nocobase docker', '/docs/installation/docker', 140, 1.5, brand),
    q('nocobase 安装', '/docs/installation/docker', 130, 1.6, brand),
    q('nocobase github', '/', 60, 2.1, brand),
    q('nocobase 价格', '/pricing', 70, 1.4, brand),
    q('nocobase 插件', '/commercial-plugins', 65, 1.9, brand),
    q('nocobase 审批', '/docs/workflow/approval', 55, 1.7, brand),
    q('nocobase 权限', '/docs/permissions', 48, 1.5, brand),
    q('nocobase 升级', '/docs/installation/upgrade', 45, 1.4, {
      ...brand,
      changes: [{ kind: 'spike', at: 18, size: 3, halfLife: 3 }],
    }),
    q('nocobase 2.0', '/blog/release-v2', 40, 1.2, {
      ...brand,
      changes: release,
    }),
    q('nocobase ai', '/docs/ai-employees', 38, 1.6, { ...brand, ...aiRise }),
    q('nocobase api', '/docs/api', 35, 2, brand),
    q('nocobase crm', '/solutions/crm', 30, 1.6, brand),
    q('nocobase 和飞书多维表格', '/compare/airtable', 22, 2.4, brand),
    q('开源无代码平台', '/', 420, 6.8),
    q('无代码平台', '/', 680, 14.5),
    q('低代码平台', '/', 900, 18.2),
    q('开源低代码', '/', 380, 7.4),
    q('低代码平台排名', '/blog/low-code', 260, 12.6),
    q('私有部署 低代码', '/enterprise', 150, 5.2),
    q('自建crm', '/solutions/crm', 300, 8.9, crmRise),
    q('开源crm', '/solutions/crm', 520, 11.3, crmRise),
    q('crm系统 免费', '/solutions/crm', 380, 22),
    q('免费crm', '/templates/crm', 450, 19.8),
    q('crm 数据权限', '/docs/permissions', 76, 9.6, { ctr: 1.05 }),
    q('销售只能看自己的客户', '/docs/permissions', 40, 4.2),
    q('角色权限设计', '/blog/permission-design', 120, 9.4),
    q('rbac 权限设计', '/docs/permissions', 140, 13),
    q('数据权限 设计', '/docs/permissions/data-scope', 90, 11.2),
    q('审批流程设计', '/docs/workflow/approval', 210, 15.6),
    q('采购审批流程', '/solutions/purchase-approval', 160, 9.8),
    q('审批流 开源', '/docs/workflow/approval', 70, 6.5),
    q('工作流引擎 开源', '/docs/workflows', 260, 16.3),
    q('docker 部署 低代码', '/docs/installation/docker', 60, 4.1),
    q('docker compose postgres', '/docs/installation/docker', 180, 28),
    q('docker 端口被占用', '/docs/installation/docker', 90, 24),
    q('excel 导入 去重', '/guides/customer-import', 110, 12.5),
    q('excel 客户管理', '/blog/nocobase-vs-spreadsheets', 240, 16.8),
    q('共享表格 换 系统', '/blog/nocobase-vs-spreadsheets', 40, 8.1),
    q('进销存系统 开源', '/solutions/inventory', 190, 9.3),
    q('项目管理 甘特图 开源', '/solutions/project-management', 120, 13.4),
    q('工单系统 开源', '/tutorials/ticketing', 150, 10.2),
    q('售后工单系统 搭建', '/tutorials/ticketing', 60, 6.3),
    q('内部工具 搭建', '/', 90, 7.7),
    q('airtable 替代', '/compare/airtable', 85, 5.9),
    q('airtable 私有部署', '/compare/airtable', 45, 3.8),
    q('retool 替代 开源', '/compare/retool', 40, 6.6),
    q('图表 报表工具 开源', '/docs/reporting', 150, 14.8, chartsDrop),
    q('数据看板 搭建', '/docs/reporting', 130, 12, chartsDrop),
    q('api 分页', '/docs/api/pagination', 60, 17.5),
    q('api 只返回20条', '/docs/api/pagination', 18, 6.2),
    q('api 密钥 管理', '/docs/api/authentication', 40, 21),
    q('插件开发 教程', '/docs/plugins/development', 55, 9.9),
    q('外部 mysql 数据源', '/docs/data-sources/mysql', 45, 8.4),
    q('一对多 多对多 关系', '/docs/data-modeling/relations', 110, 18.7),
    q('数据库 备份 恢复演练', '/guides/backup-restore', 60, 13.2),
    q('附件 备份', '/guides/backup-restore', 30, 9.1),
    q('ai 工作流', '/blog/ai-workflows', 320, 19.5, { changes: hn }),
    q('ai 自动分类 工单', '/blog/ai-workflows', 45, 7.3, { changes: hn }),
    q('ai 员工', '/docs/ai-employees', 210, 12.4, aiRise),
    q('大模型 自动填表', '/docs/ai-employees', 40, 8.8, aiRise),
    // Two similar articles compete for the same searches.
    q('什么是低代码', '/blog/low-code', 520, 9.6, {
      ...lowCodeFade,
      also: ['/blog/what-is-no-code', 0.3],
    }),
    q('低代码 无代码 区别', '/blog/low-code', 300, 7.2, lowCodeFade),
    q('无代码是什么', '/blog/what-is-no-code', 220, 11.1),
    q('单点登录 oidc 配置', '/docs/sso', 60, 15.3),
    q('移动端 表单录入', '/docs/mobile', 40, 19.4),
    q('s3 兼容 对象存储', '/docs/files', 35, 34),
    q('生产环境 上线检查清单', '/guides/production-checklist', 25, 14, {
      changes: [{ kind: 'launch', at: 5, ramp: 8 }],
    }),
    q('kubernetes helm 部署', '/docs/installation/kubernetes', 15, 41),
    q('crm 模板', '/templates/crm', 140, 9.1),
    q('客户成功 模板', '/templates/customer-success', 20, 15),
    q('多角色审批', '/community/approval-roles', 35, 5.7),
    q('部门主管审批', '/docs/workflow/approval', 50, 10.6),
    q('审批 退回 重新提交', '/docs/workflow/approval', 28, 6.9),
    q('自动化 上线 检查清单', '/blog/workflow-checklist', 20, 11),
    q('权限设计 原则', '/blog/permission-design', 35, 7.8),
    q('无代码 客户案例', '/showcase', 25, 12),
    q('企业版 低代码', '/enterprise', 30, 9),
    q('低代码 商业插件', '/commercial-plugins', 40, 3.4),
    q('低代码平台 价格', '/pricing', 110, 16.5),
    q('十分钟 搭建应用', '/tutorials/first-app', 30, 4.9),
    q('无代码 入门教程', '/tutorials/first-app', 150, 10.4),
    q('无代码 快速开始', '/docs/getting-started', 35, 6, onboardingUp),
    q('数据建模', '/docs/data-modeling', 160, 21),
    q('树形结构 数据表', '/docs/data-modeling', 35, 14.2),
    q('工作流 触发器', '/docs/workflow/triggers', 45, 11.5),
    q('企业微信 审批 集成', '/integrations', 70, 18.2),
    q('钉钉 集成 低代码', '/integrations', 55, 16.9),
    q('自建 crm 注意事项', '/blog/self-hosted-crm', 20, 5.5, {
      changes: [{ kind: 'launch', at: 6, ramp: 6 }],
    }),
    q('nocobase 更新日志', '/changelog', 15, 2, brand),
    q('nocobase 快速开始', '/docs/getting-started', 60, 1.3, {
      ...brand,
      ...onboardingUp,
    }),
  ],
  en: [
    q('nocobase', '/', 1100, 1.1, brand),
    q('nocobase docker', '/docs/installation/docker', 170, 1.4, brand),
    q('nocobase tutorial', '/docs/getting-started', 140, 1.7, {
      ...brand,
      ...onboardingUp,
    }),
    q('nocobase github', '/', 90, 2, brand),
    q('nocobase pricing', '/pricing', 80, 1.3, brand),
    q('nocobase vs airtable', '/compare/airtable', 55, 1.5, brand),
    q('nocobase plugins', '/commercial-plugins', 60, 1.8, brand),
    q('nocobase api', '/docs/api', 45, 1.9, brand),
    q('nocobase 2.0', '/blog/release-v2', 50, 1.1, {
      ...brand,
      changes: release,
    }),
    q('nocobase ai', '/docs/ai-employees', 45, 1.5, { ...brand, ...aiRise }),
    q('nocobase upgrade', '/docs/installation/upgrade', 40, 1.3, {
      ...brand,
      changes: [{ kind: 'spike', at: 18, size: 3, halfLife: 3 }],
    }),
    q('nocobase permissions', '/docs/permissions', 35, 1.4, brand),
    q('nocobase docker compose', '/docs/installation/docker', 90, 1.4, brand),
    q('nocobase getting started', '/docs/getting-started', 70, 1.2, {
      ...brand,
      ...onboardingUp,
    }),
    q('nocobase changelog', '/changelog', 20, 1.8, brand),
    q('open source no code platform', '/', 520, 7.2),
    q('no code platform', '/', 1400, 22),
    q('low code platform', '/', 1800, 24),
    q('open source low code', '/', 600, 8.1),
    q('self hosted no code', '/enterprise', 240, 4.6),
    q('airtable alternative open source', '/compare/airtable', 380, 6.3),
    q('airtable alternative', '/compare/airtable', 900, 17.5),
    q('retool alternative open source', '/compare/retool', 210, 7.9),
    q('internal tools builder', '/', 320, 13.8),
    q('open source crm', '/solutions/crm', 850, 12.4, crmRise),
    q('self hosted crm', '/solutions/crm', 420, 9.1, crmRise),
    q('build your own crm', '/solutions/crm', 180, 6.7, crmRise),
    q('crm data permissions', '/docs/permissions', 60, 9.6, { ctr: 1.05 }),
    q('sales reps see only their own accounts', '/docs/permissions', 25, 3.9),
    q('role based access control design', '/docs/permissions', 260, 15.2),
    q('row level permissions', '/docs/permissions/data-scope', 190, 11.3),
    q('approval workflow software', '/docs/workflow/approval', 340, 18.9),
    q('purchase approval workflow', '/solutions/purchase-approval', 220, 10.1),
    q('approval return and resubmit', '/docs/workflow/approval', 30, 6.4),
    q('open source workflow engine', '/docs/workflows', 410, 17.7),
    q('docker compose postgres', '/docs/installation/docker', 2600, 31),
    q('port already in use docker', '/docs/installation/docker', 300, 27),
    q('import excel deduplicate', '/guides/customer-import', 140, 13.3),
    q(
      'replace spreadsheets with database',
      '/blog/nocobase-vs-spreadsheets',
      120,
      8.6,
    ),
    q('open source inventory management', '/solutions/inventory', 380, 14.1),
    q(
      'project management gantt open source',
      '/solutions/project-management',
      200,
      15.8,
    ),
    q('open source ticketing system', '/tutorials/ticketing', 520, 12.9),
    q('build a helpdesk ticketing system', '/tutorials/ticketing', 70, 9.2),
    q(
      'open source dashboard builder',
      '/docs/reporting',
      260,
      16.2,
      chartsDrop,
    ),
    q('build a reporting dashboard', '/docs/reporting', 150, 12.7, chartsDrop),
    q('rest api pagination', '/docs/api/pagination', 380, 29),
    q('api only returns 20 records', '/docs/api/pagination', 20, 5.8),
    q('api key management', '/docs/api/authentication', 110, 24),
    q('plugin development tutorial', '/docs/plugins/development', 70, 11.2),
    q('connect external mysql database', '/docs/data-sources/mysql', 90, 13.1),
    q(
      'one to many vs many to many',
      '/docs/data-modeling/relations',
      480,
      22.4,
    ),
    q('test backup restore', '/guides/backup-restore', 90, 18.4),
    q('ai workflow automation', '/blog/ai-workflows', 900, 23.5, {
      changes: hn,
    }),
    q('ai ticket classification', '/blog/ai-workflows', 80, 8.9, {
      changes: hn,
    }),
    q('ai agents for business apps', '/docs/ai-employees', 260, 15, aiRise),
    // Two similar articles compete for the same searches.
    q('what is low code', '/blog/low-code', 1100, 11.3, {
      ...lowCodeFade,
      also: ['/blog/what-is-no-code', 0.3],
    }),
    q('low code vs no code', '/blog/low-code', 700, 8.4, lowCodeFade),
    q('what is no code', '/blog/what-is-no-code', 480, 13.5),
    q('oidc sso setup', '/docs/sso', 110, 19.8),
    q('mobile data entry app', '/docs/mobile', 90, 21.3),
    q('s3 compatible storage', '/docs/files', 140, 38),
    q(
      'production deployment checklist',
      '/guides/production-checklist',
      60,
      16,
      {
        changes: [{ kind: 'launch', at: 5, ramp: 8 }],
      },
    ),
    q('kubernetes helm deploy', '/docs/installation/kubernetes', 40, 44),
    q('crm template', '/templates/crm', 380, 13.6),
    q('customer success template', '/templates/customer-success', 60, 18),
    q('multi role approval', '/community/approval-roles', 40, 6.2),
    q('manager approval workflow', '/docs/workflow/approval', 90, 11.4),
    q('automation launch checklist', '/blog/workflow-checklist', 45, 12.5),
    q('permission design principles', '/blog/permission-design', 60, 8.7),
    q('no code case studies', '/showcase', 40, 14.4),
    q('enterprise low code platform', '/enterprise', 220, 19.3),
    q('low code commercial plugins', '/commercial-plugins', 25, 4.1),
    q('low code pricing', '/pricing', 210, 17.2),
    q('build an app in 10 minutes', '/tutorials/first-app', 50, 6.1),
    q('no code tutorial for beginners', '/tutorials/first-app', 260, 12.2),
    q(
      'getting started with no code',
      '/docs/getting-started',
      70,
      7.4,
      onboardingUp,
    ),
    q('data modeling for business apps', '/docs/data-modeling', 90, 18.6),
    q('tree structure database table', '/docs/data-modeling', 60, 26),
    q('workflow triggers', '/docs/workflow/triggers', 70, 12.8),
    q('slack approval integration', '/integrations', 80, 17),
    q('self hosted crm questions', '/blog/self-hosted-crm', 25, 6, {
      changes: [{ kind: 'launch', at: 6, ramp: 6 }],
    }),
    q('no code vs spreadsheets', '/blog/nocobase-vs-spreadsheets', 75, 9.9),
    q('field level permissions', '/docs/permissions', 70, 12.1),
    q('department head approval', '/docs/workflow/approval', 35, 9.6),
    q('upgrade docker image safely', '/docs/installation/upgrade', 45, 15.5),
    q(
      'purchase request approval template',
      '/solutions/purchase-approval',
      50,
      11.8,
    ),
    q('lab booking system', '/showcase', 30, 19.2),
    q('nocobase vs retool', '/compare/retool', 30, 1.6, brand),
  ],
};

export const SECOND_QUERIES: PerLanguage<Query[]> = {
  zh: [
    q('nococrm', '/', 120, 1.1, brand),
    q('nococrm 价格', '/pricing', 25, 1.3, brand),
    q('nococrm 部署', '/docs/quick-start', 18, 1.5, brand),
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
    q('hubspot 替代', '/compare/hubspot', 90, 10.8),
    q('crm 私有部署', '/', 80, 6.4),
    q('客户交接 离职', '/features/permissions', 30, 9.7),
    q('crm 权限 团队', '/features/permissions', 40, 13.2),
    q('crm docker', '/docs/quick-start', 35, 7.1),
  ],
  en: [
    q('nococrm', '/', 100, 1.1, brand),
    q('nococrm pricing', '/pricing', 20, 1.2, brand),
    q('nococrm docker', '/docs/quick-start', 15, 1.4, brand),
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
    q('hubspot alternative', '/compare/hubspot', 160, 14.2),
    q('self hosted crm', '/', 90, 7.5),
    q('reassign accounts when rep leaves', '/features/permissions', 25, 8.8),
    q('crm team permissions', '/features/permissions', 35, 12.6),
    q('crm docker compose', '/docs/quick-start', 30, 8),
  ],
};

type R = Research & { topic: string };
const r = (
  keyword: string,
  volume: number,
  difficulty: number,
  cpc: number,
  intent: Research['intent'],
  topic: string,
  extra: Partial<Research> = {},
): R => ({ keyword, volume, difficulty, cpc, intent, topic, ...extra });

// Search interest by month, January first: B2B tools dip in the holidays and pick up after.
const work = [
  1.05, 0.92, 1.08, 1.04, 1.02, 0.97, 0.93, 0.9, 1.02, 1.06, 1.04, 0.86,
];
const springFestival = [
  0.95, 0.7, 1.12, 1.08, 1.03, 0.98, 0.95, 0.92, 1.03, 0.98, 1.05, 1.02,
];
const rising = [
  0.62, 0.66, 0.72, 0.76, 0.81, 0.86, 0.9, 0.95, 1, 1.06, 1.12, 1.2,
];

/** The keyword research universe: what the research tools suggest, ranking or not. */
export const RESEARCH: PerLanguage<R[]> = {
  zh: [
    r('内部工具', 2400, 34, 1.8, 'informational', 'tools', {
      season: springFestival,
    }),
    r('内部工具 搭建', 880, 29, 2.1, 'commercial', 'tools', {
      position: 7,
      path: '/',
    }),
    r('内部管理系统 开发', 1600, 41, 3.2, 'commercial', 'tools'),
    r('企业内部系统 低代码', 720, 37, 2.7, 'commercial', 'tools'),
    r('后台管理系统 开源', 3600, 45, 1.5, 'commercial', 'tools'),
    r('无代码 内部工具', 390, 22, 1.9, 'commercial', 'tools'),
    r('内部工具平台 对比', 260, 31, 2.4, 'commercial', 'tools'),
    r('低代码平台', 27100, 62, 4.6, 'commercial', 'tools', {
      position: 18,
      path: '/',
      season: springFestival,
    }),
    r('无代码平台', 14800, 55, 3.9, 'commercial', 'tools', {
      position: 14,
      path: '/',
    }),
    r('开源低代码', 4400, 39, 2.8, 'commercial', 'tools', {
      position: 7,
      path: '/',
    }),
    r('开源无代码平台', 3600, 33, 2.5, 'commercial', 'tools', {
      position: 7,
      path: '/',
    }),
    r('低代码平台排名', 2900, 48, 3.1, 'commercial', 'tools', {
      position: 13,
      path: '/blog/low-code',
    }),
    r('私有部署 低代码', 1300, 36, 4.2, 'commercial', 'tools', {
      position: 5,
      path: '/enterprise',
    }),
    r('什么是低代码', 8100, 41, 1.2, 'informational', 'tools', {
      position: 10,
      path: '/blog/low-code',
    }),
    r('低代码 无代码 区别', 4400, 30, 1.1, 'informational', 'tools', {
      position: 7,
      path: '/blog/low-code',
    }),
    r('airtable 替代', 1000, 28, 2.2, 'commercial', 'tools', {
      position: 6,
      path: '/compare/airtable',
    }),
    r('飞书多维表格 替代', 1900, 26, 1.7, 'commercial', 'tools'),
    r('工作流自动化', 6600, 47, 3.4, 'informational', 'workflow', {
      season: springFestival,
    }),
    r('工作流自动化 工具', 2400, 44, 3.9, 'commercial', 'workflow'),
    r('工作流引擎 开源', 2900, 52, 2.6, 'commercial', 'workflow', {
      position: 16,
      path: '/docs/workflows',
    }),
    r('审批流程设计', 3600, 38, 2.2, 'informational', 'workflow', {
      position: 16,
      path: '/docs/workflow/approval',
    }),
    r('采购审批流程', 2400, 27, 1.9, 'informational', 'workflow', {
      position: 10,
      path: '/solutions/purchase-approval',
    }),
    r('审批流 开源', 880, 33, 2.4, 'commercial', 'workflow', {
      position: 6,
      path: '/docs/workflow/approval',
    }),
    r('自动化 审批', 1300, 35, 2.8, 'commercial', 'workflow'),
    r('流程自动化 rpa 区别', 1000, 24, 1.6, 'informational', 'workflow'),
    r('bpm 开源', 1900, 49, 3, 'commercial', 'workflow'),
    r('定时任务 自动化', 720, 21, 1.3, 'informational', 'workflow'),
    r('企业微信 审批 集成', 1600, 31, 2.1, 'commercial', 'workflow', {
      position: 18,
      path: '/integrations',
    }),
    r('钉钉 审批 对接', 1300, 29, 2, 'commercial', 'workflow'),
    r('ai 工作流', 9900, 51, 3.6, 'informational', 'ai', {
      position: 20,
      path: '/blog/ai-workflows',
      season: rising,
    }),
    r('ai 员工', 5400, 46, 3.3, 'informational', 'ai', {
      position: 12,
      path: '/docs/ai-employees',
      season: rising,
    }),
    r('ai agent 企业应用', 3600, 54, 4.1, 'commercial', 'ai', {
      season: rising,
    }),
    r('大模型 业务系统 集成', 1300, 43, 3.7, 'commercial', 'ai', {
      season: rising,
    }),
    r('ai 自动分类 工单', 480, 25, 2.2, 'commercial', 'ai', {
      position: 7,
      path: '/blog/ai-workflows',
    }),
    r('开源crm', 6600, 44, 3.8, 'commercial', 'crm', {
      position: 11,
      path: '/solutions/crm',
    }),
    r('自建crm', 2400, 32, 3.1, 'commercial', 'crm', {
      position: 7,
      path: '/solutions/crm',
    }),
    r('免费crm', 9900, 58, 4.4, 'transactional', 'crm', {
      position: 20,
      path: '/templates/crm',
    }),
    r('crm系统 免费', 5400, 60, 4.6, 'transactional', 'crm', {
      position: 22,
      path: '/solutions/crm',
    }),
    r('crm 模板', 1600, 35, 2.3, 'commercial', 'crm', {
      position: 9,
      path: '/templates/crm',
    }),
    r('crm 数据权限', 590, 23, 2.9, 'informational', 'crm', {
      position: 11,
      path: '/docs/permissions',
    }),
    r('客户管理系统 开源', 3600, 47, 3.5, 'commercial', 'crm'),
    r('销售管理系统', 8100, 63, 5.2, 'commercial', 'crm'),
    r('销售漏斗', 4400, 39, 2.6, 'informational', 'crm'),
    r('客户台账 excel', 1900, 26, 1.4, 'informational', 'crm'),
    r('rbac 权限设计', 2900, 42, 1.8, 'informational', 'permissions', {
      position: 13,
      path: '/docs/permissions',
    }),
    r('角色权限设计', 1900, 36, 1.6, 'informational', 'permissions', {
      position: 9,
      path: '/blog/permission-design',
    }),
    r('数据权限 设计', 1300, 40, 2, 'informational', 'permissions', {
      position: 11,
      path: '/docs/permissions/data-scope',
    }),
    r('行级权限', 880, 38, 1.9, 'informational', 'permissions'),
    r('字段级权限', 590, 33, 1.7, 'informational', 'permissions'),
    r('权限管理系统 开源', 2400, 46, 2.5, 'commercial', 'permissions'),
    r('docker compose postgres', 2900, 37, 0.9, 'informational', 'deploy', {
      position: 28,
      path: '/docs/installation/docker',
    }),
    r('docker 端口被占用', 1600, 18, 0.4, 'informational', 'deploy', {
      position: 24,
      path: '/docs/installation/docker',
    }),
    r('kubernetes helm 部署', 1000, 44, 1.6, 'informational', 'deploy', {
      position: 41,
      path: '/docs/installation/kubernetes',
    }),
    r('数据库 备份 恢复演练', 720, 31, 1.5, 'informational', 'deploy', {
      position: 13,
      path: '/guides/backup-restore',
    }),
    r('生产环境 上线检查清单', 390, 22, 1.2, 'informational', 'deploy'),
    r('excel 导入 去重', 1300, 24, 0.8, 'informational', 'data', {
      position: 13,
      path: '/guides/customer-import',
    }),
    r('一对多 多对多 关系', 2400, 35, 0.7, 'informational', 'data', {
      position: 19,
      path: '/docs/data-modeling/relations',
    }),
    r('数据建模', 4400, 48, 1.9, 'informational', 'data', {
      position: 21,
      path: '/docs/data-modeling',
    }),
    r('进销存系统 开源', 3600, 43, 3, 'commercial', 'data', {
      position: 9,
      path: '/solutions/inventory',
    }),
    r('工单系统 开源', 2900, 41, 2.9, 'commercial', 'data', {
      position: 10,
      path: '/tutorials/ticketing',
    }),
    r('项目管理 甘特图', 6600, 52, 3.3, 'commercial', 'data', {
      position: 13,
      path: '/solutions/project-management',
    }),
    r('图表 报表工具 开源', 1900, 45, 2.7, 'commercial', 'data', {
      position: 15,
      path: '/docs/reporting',
    }),
    r('数据看板 搭建', 1600, 39, 2.5, 'commercial', 'data', {
      position: 12,
      path: '/docs/reporting',
    }),
    r('nocobase', 3600, 8, 0.6, 'navigational', 'brand', {
      position: 1,
      path: '/',
    }),
    r('nocobase 教程', 880, 9, 0.5, 'informational', 'brand', {
      position: 2,
      path: '/docs/getting-started',
    }),
    r('nocobase docker', 590, 7, 0.4, 'navigational', 'brand', {
      position: 2,
      path: '/docs/installation/docker',
    }),
    r('nocobase 插件', 390, 10, 0.6, 'informational', 'brand', {
      position: 2,
      path: '/commercial-plugins',
    }),
    r('nocobase 2.0', 480, 9, 0.5, 'navigational', 'brand', {
      position: 1,
      path: '/blog/release-v2',
      season: rising,
    }),
    r('nocobase 价格', 320, 12, 1.1, 'transactional', 'brand', {
      position: 1,
      path: '/pricing',
    }),
  ],
  en: [
    r('internal tools', 6600, 48, 4.9, 'informational', 'tools', {
      season: work,
    }),
    r('internal tools builder', 2900, 52, 7.4, 'commercial', 'tools', {
      position: 14,
      path: '/',
    }),
    r('build internal tools', 1600, 45, 6.8, 'commercial', 'tools'),
    r('internal tool platform', 880, 49, 8.2, 'commercial', 'tools'),
    r('open source internal tools', 1300, 37, 5.1, 'commercial', 'tools'),
    r('admin panel open source', 4400, 46, 2.9, 'commercial', 'tools'),
    r('internal tools comparison', 390, 33, 6.1, 'commercial', 'tools'),
    r('low code platform', 33100, 71, 11.8, 'commercial', 'tools', {
      position: 24,
      path: '/',
      season: work,
    }),
    r('no code platform', 22200, 66, 9.4, 'commercial', 'tools', {
      position: 22,
      path: '/',
    }),
    r('open source low code', 5400, 44, 6.3, 'commercial', 'tools', {
      position: 8,
      path: '/',
    }),
    r('open source no code platform', 4400, 39, 5.7, 'commercial', 'tools', {
      position: 7,
      path: '/',
    }),
    r('self hosted no code', 1900, 31, 5.2, 'commercial', 'tools', {
      position: 5,
      path: '/enterprise',
    }),
    r('what is low code', 12100, 47, 2.4, 'informational', 'tools', {
      position: 11,
      path: '/blog/low-code',
    }),
    r('low code vs no code', 8100, 38, 2.1, 'informational', 'tools', {
      position: 8,
      path: '/blog/low-code',
    }),
    r('airtable alternative', 9900, 54, 6.6, 'commercial', 'tools', {
      position: 17,
      path: '/compare/airtable',
    }),
    r(
      'airtable alternative open source',
      2900,
      35,
      4.8,
      'commercial',
      'tools',
      { position: 6, path: '/compare/airtable' },
    ),
    r('retool alternative open source', 1600, 33, 7.9, 'commercial', 'tools', {
      position: 8,
      path: '/compare/retool',
    }),
    r('workflow automation', 27100, 64, 9.6, 'informational', 'workflow', {
      season: work,
    }),
    r('workflow automation software', 9900, 69, 14.2, 'commercial', 'workflow'),
    r('workflow automation tools', 6600, 62, 12.5, 'commercial', 'workflow'),
    r('open source workflow engine', 3600, 51, 4.4, 'commercial', 'workflow', {
      position: 18,
      path: '/docs/workflows',
    }),
    r('approval workflow software', 4400, 49, 9.8, 'commercial', 'workflow', {
      position: 19,
      path: '/docs/workflow/approval',
    }),
    r(
      'purchase approval workflow',
      2400,
      34,
      6.2,
      'informational',
      'workflow',
      { position: 10, path: '/solutions/purchase-approval' },
    ),
    r('business process automation', 14800, 67, 13.1, 'commercial', 'workflow'),
    r(
      'workflow automation examples',
      3600,
      36,
      3.2,
      'informational',
      'workflow',
    ),
    r('n8n alternative', 2400, 41, 5.4, 'commercial', 'workflow', {
      season: rising,
    }),
    r(
      'scheduled workflow automation',
      880,
      29,
      4.7,
      'informational',
      'workflow',
    ),
    r('slack approval integration', 1300, 38, 6.9, 'commercial', 'workflow', {
      position: 17,
      path: '/integrations',
    }),
    r('ai workflow automation', 18100, 58, 8.7, 'commercial', 'ai', {
      position: 24,
      path: '/blog/ai-workflows',
      season: rising,
    }),
    r('ai agents for business', 9900, 61, 9.9, 'commercial', 'ai', {
      position: 15,
      path: '/docs/ai-employees',
      season: rising,
    }),
    r('ai agent platform open source', 4400, 47, 6.8, 'commercial', 'ai', {
      season: rising,
    }),
    r('llm in business apps', 1600, 44, 7.1, 'informational', 'ai', {
      season: rising,
    }),
    r('ai ticket classification', 720, 31, 5.6, 'commercial', 'ai', {
      position: 9,
      path: '/blog/ai-workflows',
    }),
    r('open source crm', 14800, 57, 8.9, 'commercial', 'crm', {
      position: 12,
      path: '/solutions/crm',
    }),
    r('self hosted crm', 4400, 41, 7.6, 'commercial', 'crm', {
      position: 9,
      path: '/solutions/crm',
    }),
    r('build your own crm', 1900, 35, 6.4, 'commercial', 'crm', {
      position: 7,
      path: '/solutions/crm',
    }),
    r('free crm', 33100, 74, 12.3, 'transactional', 'crm'),
    r('crm template', 5400, 39, 3.8, 'commercial', 'crm', {
      position: 14,
      path: '/templates/crm',
    }),
    r('crm data permissions', 480, 26, 6.1, 'informational', 'crm', {
      position: 11,
      path: '/docs/permissions',
    }),
    r('crm for small business', 18100, 72, 15.4, 'commercial', 'crm'),
    r('sales pipeline template', 3600, 34, 3.1, 'commercial', 'crm'),
    r('customer database spreadsheet', 2400, 29, 2.2, 'informational', 'crm'),
    r(
      'role based access control design',
      2900,
      45,
      4.1,
      'informational',
      'permissions',
      { position: 15, path: '/docs/permissions' },
    ),
    r('row level permissions', 1900, 42, 3.5, 'informational', 'permissions', {
      position: 11,
      path: '/docs/permissions/data-scope',
    }),
    r(
      'field level permissions',
      1000,
      36,
      3.2,
      'informational',
      'permissions',
      { position: 12, path: '/docs/permissions' },
    ),
    r(
      'permission design principles',
      590,
      28,
      2.6,
      'informational',
      'permissions',
      { position: 9, path: '/blog/permission-design' },
    ),
    r('rbac vs abac', 3600, 39, 3.8, 'informational', 'permissions'),
    r('docker compose postgres', 22200, 43, 1.4, 'informational', 'deploy', {
      position: 31,
      path: '/docs/installation/docker',
    }),
    r('port already in use docker', 2400, 21, 0.7, 'informational', 'deploy', {
      position: 27,
      path: '/docs/installation/docker',
    }),
    r('kubernetes helm deploy', 1600, 47, 2.9, 'informational', 'deploy', {
      position: 44,
      path: '/docs/installation/kubernetes',
    }),
    r('test backup restore', 880, 32, 3.4, 'informational', 'deploy', {
      position: 18,
      path: '/guides/backup-restore',
    }),
    r(
      'production deployment checklist',
      1300,
      35,
      2.7,
      'informational',
      'deploy',
    ),
    r('import excel deduplicate', 1000, 26, 1.1, 'informational', 'data', {
      position: 13,
      path: '/guides/customer-import',
    }),
    r('one to many vs many to many', 6600, 38, 1.2, 'informational', 'data', {
      position: 22,
      path: '/docs/data-modeling/relations',
    }),
    r('open source inventory management', 4400, 46, 5.9, 'commercial', 'data', {
      position: 14,
      path: '/solutions/inventory',
    }),
    r('open source ticketing system', 6600, 49, 6.7, 'commercial', 'data', {
      position: 13,
      path: '/tutorials/ticketing',
    }),
    r(
      'project management gantt open source',
      1900,
      44,
      5.3,
      'commercial',
      'data',
      { position: 16, path: '/solutions/project-management' },
    ),
    r('open source dashboard builder', 3600, 51, 6.2, 'commercial', 'data', {
      position: 16,
      path: '/docs/reporting',
    }),
    r('rest api pagination', 4400, 40, 1.6, 'informational', 'data', {
      position: 29,
      path: '/docs/api/pagination',
    }),
    r('nocobase', 6600, 9, 0.8, 'navigational', 'brand', {
      position: 1,
      path: '/',
    }),
    r('nocobase tutorial', 720, 10, 0.6, 'informational', 'brand', {
      position: 2,
      path: '/docs/getting-started',
    }),
    r('nocobase docker', 880, 8, 0.5, 'navigational', 'brand', {
      position: 1,
      path: '/docs/installation/docker',
    }),
    r('nocobase vs airtable', 480, 14, 2.4, 'commercial', 'brand', {
      position: 2,
      path: '/compare/airtable',
    }),
    r('nocobase 2.0', 590, 9, 0.6, 'navigational', 'brand', {
      position: 1,
      path: '/blog/release-v2',
      season: rising,
    }),
    r('nocobase pricing', 390, 13, 2.8, 'transactional', 'brand', {
      position: 1,
      path: '/pricing',
    }),
  ],
};

/** Words that point a research seed at a topic, in both languages. */
export const TOPIC_WORDS: Record<string, readonly string[]> = {
  tools: [
    'internal',
    'tool',
    'low code',
    'no code',
    'admin',
    'airtable',
    'retool',
    '内部',
    '工具',
    '低代码',
    '无代码',
    '后台',
  ],
  workflow: [
    'workflow',
    'automation',
    'approval',
    'process',
    '工作流',
    '自动化',
    '审批',
    '流程',
  ],
  ai: ['ai', 'agent', 'llm', 'gpt', '大模型', '智能'],
  crm: ['crm', 'sales', 'customer', 'pipeline', '客户', '销售'],
  permissions: ['permission', 'role', 'rbac', 'access', '权限', '角色'],
  deploy: ['docker', 'deploy', 'kubernetes', 'backup', '部署', '备份'],
  data: [
    'data',
    'database',
    'excel',
    'dashboard',
    'inventory',
    'ticket',
    '数据',
    '报表',
    '进销存',
    '工单',
  ],
  brand: ['nocobase', 'nococrm'],
};
