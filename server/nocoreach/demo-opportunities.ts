import type { PendingTask } from '../../shared/task-pending.js';
import type {
  StrategyState,
  Opportunity,
  Signal,
} from '../../shared/strategy-model.js';
import {
  rowsFor,
  opportunityState,
  insightPending,
} from '../../shared/strategy-pending.js';
import { MOCK_DATASET_MARKER } from '../../app-plugins/nocoreach-mock/server/engine.js';
import { number as numberOpportunities } from './opportunity-board.js';
import type { Connections } from './plugin.js';
import type { LegacyDatabase } from './legacy/database.js';
import type { LegacyVariables } from './legacy/variables.js';
import type { LegacyApp } from './legacy/app.js';

export const OPPORTUNITY_EDITION = 'nocobase-opportunities-v2';
export const opportunityEditionKey = (id: string) =>
  `demo-edition:${id}:${OPPORTUNITY_EDITION}`;
const notice = '人工编写的虚构演示情景；指标、客户反馈和判断均不代表真实业务。';
// Each brief has a distinct problem, evidence boundary and next action, rather than metric-only variants.
export const briefs = [
  [
    'permissions',
    '补齐销售只能查看本人客户的权限示例',
    '近 28 天“CRM 数据权限”样例查询有 2,140 次展示、43 次点击；社区三条讨论都卡在销售与主管的可见范围。',
    '读者已经进入实施阶段，只讲角色概念不足以帮助他们完成配置。',
    '用销售、主管、管理员三种身份演示同一条客户记录；附上允许和拒绝访问的验证步骤。',
    '让读者能独立验证记录权限，而不是只完成角色创建。',
    '/docs/permissions',
    'gsc',
    'high',
  ],
  [
    'docker',
    '为 Docker 首次启动补一张排障路线图',
    '演示讨论中出现容器正常但页面无法打开、端口冲突、数据库连接失败三类问题；安装页访问 860 次，下一步访问仅 114 次。',
    '这些是不同故障，按一条长命令反复重装会让首次体验更差。',
    '按容器状态、端口、日志、数据库四步组织排查，明确每一步成功时应看到什么。',
    '减少新用户在首次启动阶段的反复试错。',
    '/docs/installation/docker',
    'discourse',
    'high',
  ],
  [
    'migration',
    '写清 Excel 客户表导入前的去重与回滚',
    '样例导入访谈里，联系人电话有空格、公司名称存在简称，历史订单还关联旧客户编号。',
    '导入成功不等于数据可用，唯一键和关联关系才是迁移的主要阻碍。',
    '准备一份 30 行脏数据，演示规范化、冲突预览、分批导入和失败后的恢复。',
    '让迁移负责人能够制定一次可回退的小批量试导入。',
    '/guides/customer-import',
    'discourse',
    'high',
  ],
  [
    'approval',
    '补充采购审批退回后重新提交的完整例子',
    '采购审批教程的样例反馈集中在“退回后谁能改”和“再次提交是否重新审批”，现有示例只覆盖通过。',
    '只展示顺利流程会让真实落地时的例外处理缺少依据。',
    '展示申请、退回、修改、重提和撤销，逐步标注操作人及服务器校验条件。',
    '帮助实施者明确审批状态和可编辑范围。',
    '/solutions/purchase-approval',
    'site',
    'medium',
  ],
  [
    'pricing',
    '在商业插件说明里增加采购前核对清单',
    '样例售前讨论反复询问开发环境与生产环境如何计费、哪些能力属于商业插件。',
    '用户需要适用边界和确认入口，单纯列功能名称无法支持采购判断。',
    '整理需要销售确认的问题清单；对尚未核实的条款保留明确待确认标记，不自行编造价格。',
    '帮助采购人员一次性准备完整的确认问题。',
    '/commercial-plugins',
    'discourse',
    'medium',
  ],
  [
    'api',
    '给 API 列表接口增加分页与权限实操',
    '演示搜索词包含“API 只返回前 20 条”和“token 能否读取其他部门”；现有页面只有单次请求。',
    '分页和权限叠加才是集成任务的真实路径。',
    '提供翻页、过滤、错误处理示例，并用受限账号验证不能跨部门读取。',
    '让集成开发者能安全读取完整的授权数据集。',
    '/docs/api/pagination',
    'gsc',
    'medium',
  ],
  [
    'backup',
    '用恢复演练补齐备份教程的验收步骤',
    '样例团队完成了定时备份，但未验证附件是否包含在内，也没有记录恢复耗时。',
    '备份文件存在不能证明故障后能恢复服务。',
    '在独立测试环境恢复数据库与附件，抽查三条记录，记录耗时与失败处理；不触碰线上。',
    '形成可以重复执行的恢复验收清单。',
    '/guides/backup-restore',
    'site',
    'high',
  ],
  [
    'video',
    '把长教程拆成三个可独立完成的短练习',
    '演示视频的前两分钟留存尚可，切换到复杂审批配置后明显下降；评论想先完成客户表和表单。',
    '第一次接触产品的观众需要更短的成功路径。',
    '拆成客户表、录入表单、角色权限三节；每节都给出初始数据与验收结果。',
    '让新用户每次用十分钟完成一个可检查的结果。',
    '/tutorials/first-app',
    'youtube',
    'low',
  ],
  [
    'crm',
    '将 CRM 搜索落地页改成可验证的实施入口',
    '样例查询中“自建 CRM”点击增加，但页面只有功能概述，缺少数据模型与试用步骤。',
    '搜索意图更接近实施评估，应该展示最小可运行方案。',
    '先完成客户、联系人和跟进记录的关系图，再制作 15 分钟演示。',
    '使读者能判断方案是否适合自己的销售流程。',
    '/solutions/crm',
    'gsc',
    'medium',
  ],
  [
    'discourse',
    '整理社区中多角色审批的追问与答复',
    '同一演示讨论有四轮追问，涉及部门主管、代理审批与离职交接。',
    '直接回答“支持审批”会掩盖各类边界，需要拆分场景。',
    '整理已验证的配置和仍需确认的能力，附可复现步骤。',
    '让后续用户通过一条答复找到完整上下文。',
    '/community/approval-roles',
    'discourse',
    'medium',
  ],
  [
    'hype',
    '暂不跟进没有实施场景的 AI 热词榜',
    '样例热点中某个 AI 词上涨，但访问意图与当前数据管理用户的需求不一致。',
    '仅凭热度立项容易产出缺少产品关联的内容。',
    '保留检索记录，待出现实际业务案例后再评估。',
    '把有限编辑时间留给有明确问题的用户。',
    '/blog/ai-workflows',
    'trends',
    'low',
  ],
  [
    'duplicate',
    '不再新增第二篇泛化低代码介绍',
    '演示内容库已有两篇相近概念文章，新增选题与现有页面的查询覆盖高度重叠。',
    '继续堆叠概念文章会分散内部链接和维护精力。',
    '归档重复选题，将有用段落整理进现有介绍页。',
    '保持内容结构清楚，避免重复建设。',
    '/blog/low-code',
    'site',
    'low',
  ],
] as const;

export function opportunitySamples(now: string) {
  const cards: Opportunity[] = briefs.map(
    ([
      key,
      title,
      observation,
      meaning,
      suggestion,
      objective,
      path,
      source,
      priority,
    ]) => ({
      id: `editorial-opportunity-${key}`,
      title,
      observation,
      meaning,
      suggestion,
      objective,
      source:
        source === 'gsc' ? 'search' : source === 'site' ? 'website' : 'mixed',
      evidenceText: `${observation}\n${notice}`,
      limitation: `${notice} 单一渠道和有限样本不能证明因果，执行前需核对实际产品版本。`,
      signalIds: [`editorial-signal-${key}`],
      sources: [source],
      priority,
      priorityReason:
        priority === 'high'
          ? '直接阻碍用户完成首次实施或数据恢复。'
          : '先核对需求，再安排编辑与技术复核。',
      confidence: 'supported',
      category: 'optimize',
      lifecycle: 'persistent',
      change: 'new',
      audience: '评估与实施 NocoBase 的业务负责人和开发者',
      effort: 'medium',
      target: `https://nocobase.example${path}`,
      firstSeenAt: now,
    }),
  );
  const signals: Signal[] = cards.map((card, i) => ({
    key: card.signalIds![0],
    type: 'editorial',
    source: briefs[i][7],
    title: card.title,
    facts: [card.observation, notice],
    url: card.target,
    strength: 90 - i * 3,
    actionable: true,
    action: 'optimize',
    isNew: true,
  }));
  const watches = [
    [
      'conversion',
      '文档改版后试用转化暂时下降',
      '样例最近三天有 96 次文档访问、4 次试用，窗口尚短，周末结构也不同。',
      '等待完整七天并核对关键事件是否漏报，再与同星期比较。',
    ],
    [
      'github',
      'GitHub 新增关注是否带来实际使用',
      '演示仓库一周新增 78 个 Star，但下载和首次启动数据尚未同步完整。',
      '等下载与首次启动覆盖同一周后再判断，不把 Star 当成活跃用户。',
    ],
    [
      'localization',
      '英文采购案例是否值得优先翻译',
      '样例英文询问只有两条，来自不同规模团队，采购流程差异较大。',
      '补充至少三次需求访谈，确认共同问题后再确定内容范围。',
    ],
  ];
  for (const [key, title, fact] of watches)
    signals.push({
      key: `editorial-watch-${key}`,
      type: 'editorial',
      source: key === 'github' ? 'github' : 'ga4',
      title: title,
      facts: [fact, notice],
      strength: 40,
      actionable: false,
      action: null,
    });
  signals.push({
    key: 'editorial-normal-search',
    type: 'editorial',
    source: 'gsc',
    title: '品牌词点击保持稳定，暂不新增动作',
    facts: [
      '演示本周品牌词点击 318 次，上周 311 次，波动不足以支持单独立项。',
      notice,
    ],
    strength: 20,
    actionable: false,
    action: null,
  });
  return { cards, signals, watches };
}

/** Additive, startup-only upgrade; preserve existing decisions and never refill after user actions. */
export async function installDemoOpportunities(host: Connections, id: string) {
  const p = host as Connections & {
    db: LegacyDatabase;
    variables: LegacyVariables;
    app: LegacyApp;
  };
  if (!p.mock?.enabled || p.mock.environment !== 'demo') return;
  if (!p.variables.all()[MOCK_DATASET_MARKER])
    throw new Error('NR_DEMO_DATASET_REQUIRED');
  const repo = p.db.getRepository('nrSnapshots');
  await p.db.sequelize.transaction(async (transaction) => {
    const owner = (
      await repo.findOne({ filter: { key: 'mock-demo:v1' }, transaction })
    )?.get('payload') as { projectId?: unknown } | undefined;
    const project = (
      await repo.findOne({ filter: { key: `project:${id}` }, transaction })
    )?.get('payload') as { domains?: string[] } | undefined;
    if (
      String(owner?.projectId) !== id ||
      project?.domains?.length !== 1 ||
      project.domains[0] !== 'nocobase.example'
    )
      throw new Error('NR_DEMO_PROJECT_MISMATCH');
    const row = await repo.findOne({
      filter: { key: `strategy:${id}` },
      transaction,
    });
    const state: StrategyState = structuredClone(
      (row?.get('payload') as StrategyState | undefined) || {
        revision: 0,
        goal: null,
        proposals: [],
        operations: [],
      },
    );
    const installed = await repo.findOne({
      filter: { key: opportunityEditionKey(id) },
      transaction,
    });
    const now = new Date().toISOString();
    if (!installed) {
      await repo.create({
        values: {
          key: `demo-backup:${id}:${OPPORTUNITY_EDITION}:strategy`,
          payload: { existed: Boolean(row), state },
        },
        transaction,
      });
      const { cards, signals, watches } = opportunitySamples(now);
      const previous = state.insights;
      state.insightHistory ||= [];
      if (previous) state.insightHistory.unshift(structuredClone(previous));
      state.insights = {
        generatedAt: now,
        items: [...cards, ...(previous?.items || [])],
        evidence: {
          ...(previous?.evidence || {
            searchQueries: [],
            pages: [],
            industryCandidates: [],
          }),
          analysisVersion: 3,
          capturedAt: now,
          availableThrough: now.slice(0, 10),
          periodDays: 28,
          limitations: [notice, ...(previous?.evidence.limitations || [])],
          signals: {
            computedAt: now,
            coverage: { gsc: now, site: now, discourse: now },
            missing: [],
            items: [...signals, ...(previous?.evidence.signals?.items || [])],
          },
        },
        observations: [
          notice,
          '优先处理首次实施、权限验证与恢复演练；短期流量波动继续观察。',
        ],
        signalReviews: { ...previous?.signalReviews },
      };
      state.opportunityMeta ||= {};
      state.watch ||= {};
      for (const signal of signals)
        state.insights.signalReviews![signal.key] = {
          verdict: 'do',
          reason: '基于手写演示材料整理的待办建议，实施前仍需核实。',
        };
      for (const [key, , , waitingFor] of watches) {
        const signal = signals.find((s) => s.key === `editorial-watch-${key}`)!;
        const decideBy = new Date(Date.parse(now) + 7 * 86400000)
          .toISOString()
          .slice(0, 10);
        state.insights.signalReviews![signal.key] = {
          verdict: 'watch',
          reason: signal.facts[0],
          waitingFor,
          decideBy,
        };
        state.watch[signal.key] = {
          key: signal.key,
          source: signal.source,
          since: now,
          startTitle: signal.title,
          startFacts: signal.facts,
          waitingFor,
          decideBy,
          lastSeen: now,
        };
      }
      state.insights.signalReviews!['editorial-normal-search'] = {
        verdict: 'skip',
        reason: '正常波动，继续常规监测。',
      };
      for (const card of cards.slice(10))
        state.opportunityMeta[card.id] = {
          status: 'ignored',
          ignoredAt: now,
          reviewedAt: now,
        };
      const tasks = await p.db.getRepository('nrTasks').find({
        filter: {
          projectId: id,
          taskKey: { $startsWith: `nocobase-editorial-v1:${id}:` },
        },
        transaction,
      });
      for (const [index, card] of cards.slice(8, 10).entries()) {
        const task =
          tasks.find((t) =>
            String(t.title).includes(index === 0 ? 'CRM' : '社区'),
          ) || tasks[index];
        if (task)
          state.proposals.push({
            id: `editorial-proposal-${index}`,
            title: String(task.title),
            brief: card.suggestion,
            status: 'approved',
            goalVersion: null,
            insight: card,
            // Keep the opaque legacy ID: converting a snowflake string loses precision.
            taskId: task.id as number,
            taskNo: (task.get('evidence') as { no?: number } | undefined)?.no,
            evidence: state.insights.evidence,
          });
      }
      if (!state.goal)
        state.goal = {
          intent: '让评估 NocoBase 的团队完成第一个可验证的小型业务应用。',
          audience: '实施负责人、业务分析师和负责集成的开发者。',
          focus: '权限、数据迁移、审批、首次部署与恢复演练。',
          progress:
            '以成功完成练习和提出具体实施问题为进展；本项目为虚构演示。',
          version: 1,
          confirmedAt: now,
        };
      numberOpportunities(state);
      state.revision++;
      if (row)
        await repo.update({
          filterByTk: row.id,
          values: { payload: state },
          transaction,
        });
      else
        await repo.create({
          values: { key: `strategy:${id}`, payload: state },
          transaction,
        });
      await repo.create({
        values: {
          key: opportunityEditionKey(id),
          payload: {
            installedAt: now,
            opportunities: cards.length,
            signals: signals.length,
          },
        },
        transaction,
      });
    }
    const allTasks = (
      await p.db
        .getRepository('nrTasks')
        .find({ filter: { projectId: id }, transaction })
    ).map((t) => t.toJSON()) as unknown as PendingTask[];
    const rows = rowsFor(state);
    const counts = {
      projectId: id,
      edition: OPPORTUNITY_EDITION,
      pending: rows.filter(
        (r) => opportunityState(r, state).state === 'pending',
      ).length,
      linked: rows.filter((r) => opportunityState(r, state).state === 'task')
        .length,
      archived: rows.filter(
        (r) => opportunityState(r, state).state === 'archived',
      ).length,
      todayPending: insightPending(state, allTasks),
      watching: Object.values(state.watch || {}).filter((w) => !w.ended).length,
    };
    transaction.afterCommit(() =>
      p.app.logger.info(
        installed
          ? 'Verified demo opportunity dataset'
          : 'Installed demo opportunity dataset',
        counts,
      ),
    );
  });
}
