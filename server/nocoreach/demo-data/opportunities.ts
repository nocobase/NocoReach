import type { DemoImportContext } from '@nocobase/app-plugin-demo-mode/server/tokens';

import type {
  Evidence,
  InsightBatch,
  Opportunity,
  Signal,
  SignalReview,
  StrategyState,
  WatchOutcome,
} from '../../../shared/strategy-model.js';
import { totals, type Partition } from '../execution/effect.js';
import { number as numberOpportunities } from '../opportunity-board.js';
import { applyVerdicts, endMissing, ignore } from '../watch.js';
import type { DemoContent } from './content.js';
import type { DemoTaskStory } from './editorial.js';

const DAY = 86_400_000;
const applyWatchVerdicts = applyVerdicts as (
  state: StrategyState,
  input: {
    signals: Signal[];
    reviews: Record<string, SignalReview>;
    cards: Opportunity[];
    now: string;
  },
) => void;
export interface OpportunityTask {
  id: string;
  key: string;
  title: string;
  createdAt: string;
  no?: number;
}

/** Daily analyses retain discovery, observation and handoff dates instead of restarting on import. */
export function opportunityHistory(
  context: DemoImportContext,
  content: DemoContent,
  which: 'main' | 'second',
  tasks: OpportunityTask[],
  partitions: Partition[],
): StrategyState {
  const copy =
    which === 'main' ? content.opportunities : content.secondOpportunities;
  const origin = `https://${content.projects[which].domain}`;
  const en = context.language === 'en-US';
  const words = (zh: string, english: string) => (en ? english : zh);
  const at = (ago: number) =>
    new Date(context.clock.now.getTime() - ago * DAY).toISOString();
  const day = (ago: number) => at(ago).slice(0, 10);
  const age = (iso: string) =>
    (context.clock.now.getTime() - Date.parse(iso)) / DAY;
  const evidence = (ago: number, signals: Signal[]): Evidence => ({
    searchQueries: [],
    pages: [],
    industryCandidates: [],
    analysisVersion: 3,
    capturedAt: at(ago),
    availableThrough: day(ago + 3),
    periodDays: 28,
    limitations: [copy.notice],
    signals: {
      computedAt: at(ago),
      coverage: { gsc: at(ago + 3), ga4: at(ago + 3), discourse: at(ago) },
      missing: [],
      items: signals,
    },
  });
  const linkedKeys =
    which === 'main'
      ? ['acme-dependencies', 'acme-handover']
      : ['crm-search', 'crm-forum-handoff'];
  const linked = (key: string) => tasks.find((task) => task.key === key);
  const state: StrategyState = {
    revision: 1,
    goal: { ...copy.goal, version: 1, confirmedAt: at(425) },
    proposals: [],
    opportunityMeta: {},
    watch: {},
    insightHistory: [],
  };
  const cards = copy.briefs.map(
    (
      [
        key,
        title,
        observation,
        meaning,
        suggestion,
        objective,
        path,
        source,
        priority,
      ],
      i,
    ): Opportunity => {
      const task = linkedKeys.includes(key) ? linked(key) : undefined;
      const discovered = task
        ? age(task.createdAt) + 3
        : i >= copy.briefs.length - 2
          ? 18 + (i % 2) * 9
          : [2, 5, 1, 8, 3, 6, 10, 4, 12, 7, 9, 11][i % 12];
      return {
        id: `editorial-opportunity-${key}`,
        title,
        observation,
        meaning,
        suggestion,
        objective,
        source:
          source === 'gsc' ? 'search' : source === 'site' ? 'website' : 'mixed',
        evidenceText: `${observation}\n${copy.notice}`,
        limitation: `${copy.notice} ${copy.limitation}`,
        signalIds: [`editorial-signal-${key}`],
        sources: [source],
        priority,
        priorityReason:
          priority === 'high' ? copy.priorityHigh : copy.priorityOther,
        confidence: 'supported',
        category: 'optimize',
        lifecycle: 'persistent',
        change: discovered <= 2 ? 'new' : 'continuing',
        audience: copy.audience,
        effort: 'medium',
        target: origin + path,
        firstSeenAt: at(discovered),
        updatedAt: at(0),
      };
    },
  );
  const signalFor = (card: Opportunity): Signal => ({
    key: card.signalIds![0],
    type: 'editorial',
    source: card.sources![0],
    title: card.title,
    facts: [card.observation, copy.notice],
    url: card.target,
    strength: card.priority === 'high' ? 90 : 65,
    actionable: true,
    action: 'optimize',
    isNew: age(card.firstSeenAt!) <= 2,
  });
  const handoff = (card: Opportunity, task: OpportunityTask) => {
    const snapshot = evidence(age(task.createdAt), [signalFor(card)]);
    state.proposals.push({
      id: `editorial-proposal-${task.key}`,
      title: task.title,
      brief: card.suggestion,
      status: 'approved',
      goalVersion: 1,
      insight: card,
      taskId: task.id as unknown as number,
      taskNo: task.no,
      evidence: snapshot,
    });
    state.opportunityMeta![card.id] = { reviewedAt: task.createdAt };
  };
  for (const card of cards) {
    const task = linkedKeys
      .map(linked)
      .find((t) => t && card.id === `editorial-opportunity-${t.key}`);
    if (task) handoff(card, task);
  }
  for (const [i, card] of cards.slice(-2).entries())
    state.opportunityMeta![card.id] = {
      status: 'ignored',
      ignoredAt: at(i ? 15 : 6),
      reviewedAt: at(i ? 15 : 6),
    };

  // Completed monthly work remains discoverable from Handled and links to its actual task.
  const stories = which === 'main' ? content.stories : content.secondTasks;
  const historical = stories
    .filter((story): story is DemoTaskStory & { age: number } =>
      Boolean(story.age),
    )
    .map((story): Opportunity => {
      const card: Opportunity = {
        id: `editorial-opportunity-${story.key}`,
        title: story.title,
        observation: story.brief,
        meaning: story.comments[0],
        suggestion: story.comments.at(-1)!,
        objective: copy.goal.intent,
        source: 'mixed',
        sources: ['discourse', 'ga4'],
        priority: 'medium',
        priorityReason: copy.priorityOther,
        confidence: 'supported',
        category: 'optimize',
        lifecycle: 'persistent',
        change: 'continuing',
        audience: copy.audience,
        effort: 'medium',
        target: origin + story.path,
        firstSeenAt: at(story.age + 4),
        updatedAt: at(story.age),
        evidenceText: `${story.brief}\n${copy.notice}`,
        limitation: copy.limitation,
        signalIds: [`editorial-signal-${story.key}`],
      };
      const task = linked(story.key);
      if (task) handoff(card, task);
      return card;
    });

  const configs =
    which === 'main'
      ? ([
          ['workload', '/features/workload', 'views', 2, 5],
          ['recurring', '/docs/recurring-tasks', 'views', 5, 3],
          ['mobile', '/features/mobile', 'views', 8, 1],
          ['templates', '/templates', 'views', 4, 6],
          ['github', '/docs/integrations', 'clicks', 0, 9],
          ['guest', '/docs/guests', 'clicks', 10, 2],
        ] as const)
      : ([
          ['renewal', '/docs/renewals', 'views', 3, 4],
          ['mobile', '/features/mobile', 'views', 7, 2],
          ['pricing', '/pricing', 'conversions', 9, 1],
          ['pipeline', '/features/pipeline', 'clicks', 0, 8],
          ['routing', '/docs/lead-routing', 'views', 5, 5],
          ['permissions', '/docs/permissions', 'clicks', 2, 7],
        ] as const);
  const metric = (
    path: string,
    kind: 'views' | 'clicks' | 'conversions',
    ago: number,
  ) => {
    const end = day(ago + 3),
      start = day(ago + 9);
    const current = totals(partitions, [origin + path], { start, end })[kind];
    const previous = totals(partitions, [origin + path], {
      start: day(ago + 16),
      end: day(ago + 10),
    })[kind];
    const delta = previous
      ? `${current >= previous ? '+' : ''}${Math.round(((current - previous) / previous) * 100)}%`
      : words('新样本', 'new sample');
    const unit =
      kind === 'clicks'
        ? words('点击', 'clicks')
        : kind === 'views'
          ? words('浏览', 'views')
          : words('转化事件', 'conversion events');
    return {
      chip: {
        tone:
          current > previous ? 'green' : current < previous ? 'amber' : 'grey',
        text: `${current.toLocaleString(en ? 'en-US' : 'zh-CN')} ${unit} · ${delta}`,
      },
      fact: `${start} – ${end}: ${current} ${unit}; ${words('前七天', 'previous seven days')}: ${previous}.`,
    };
  };
  const watchSignal = (
    config: (typeof configs)[number],
    ago: number,
  ): Signal => {
    const [key, path, kind] = config;
    const [, title, fact] = copy.watches.find((w) => w[0] === key)!;
    const value = metric(path, kind, ago);
    return {
      key: `editorial-watch-${key}`,
      type: 'editorial',
      source: kind === 'clicks' ? 'gsc' : 'ga4',
      title,
      facts: [value.fact, fact, copy.notice],
      chip: value.chip,
      url: origin + path,
      strength: 54 - configs.findIndex((entry) => entry[0] === key) * 3,
      actionable: false,
      action: null,
    };
  };
  const endings: {
    key: string;
    title: string;
    path: string;
    outcome: WatchOutcome;
    started: number;
    ended: number;
    reason: string;
  }[] = [
    {
      key: cards[0].signalIds![0],
      title: cards[0].title,
      path: new URL(cards[0].target!).pathname,
      outcome: 'opportunity',
      started: 7,
      ended: 2,
      reason: words(
        '连续两个窗口出现相同问题，转为机会并保留证据。',
        'The issue persisted across two windows; create an opportunity and retain the evidence.',
      ),
    },
    {
      key: 'editorial-ended-normal',
      title: words(
        '帮助中心访问回落后恢复',
        'Help-center traffic recovered after a dip',
      ),
      path: which === 'main' ? '/docs/getting-started' : '/docs/quick-start',
      outcome: 'normal',
      started: 8,
      ended: 1,
      reason: words(
        '同星期数据恢复，不需要新增改稿任务。',
        'Matching-weekday traffic recovered; no new rewrite is needed.',
      ),
    },
    {
      key: 'editorial-ended-skip',
      title: words(
        '品牌搜索的短时上升',
        'Short-lived rise in branded searches',
      ),
      path: '/',
      outcome: 'skip',
      started: 9,
      ended: 4,
      reason: words(
        '增长集中在已有品牌需求，未发现新的内容缺口。',
        'The increase came from existing branded demand, with no new content gap.',
      ),
    },
    {
      key: 'editorial-ended-expired',
      title: words(
        '对比页的低样本询问',
        'Low-volume questions about the comparison page',
      ),
      path: which === 'main' ? '/compare/nimbus' : '/pricing',
      outcome: 'expired',
      started: 15,
      ended: 3,
      reason: words(
        '观察到期，样本仍不足；保留记录，不据此扩大投入。',
        'The observation deadline passed with insufficient evidence; retain the record without expanding the work.',
      ),
    },
    {
      key: 'editorial-ended-ignored',
      title: words(
        '已停止活动的入口波动',
        'Traffic variation from a retired campaign',
      ),
      path: '/pricing',
      outcome: 'ignored',
      started: 11,
      ended: 6,
      reason: words(
        '活动已结束，负责人确认不再跟进这次波动。',
        'The campaign ended and the owner decided not to pursue this variation.',
      ),
    },
  ];
  const dates = [
    ...new Set([
      0,
      ...Array.from({ length: 29 }, (_, i) => i + 1),
      ...historical.map((c) => age(c.firstSeenAt!)),
    ]),
  ].sort((a, b) => b - a);
  const batches: InsightBatch[] = [];
  for (const ago of dates) {
    const signals: Signal[] = [];
    const batchCards = cards.filter((card) => age(card.firstSeenAt!) >= ago);
    batchCards.push(
      ...historical.filter((card) => age(card.firstSeenAt!) === ago),
    );
    const batch: InsightBatch = {
      generatedAt: at(ago),
      items: batchCards.map((card) => ({
        ...structuredClone(card),
        updatedAt: at(ago),
      })),
      evidence: evidence(ago, signals),
      observations: [copy.notice, ...copy.observations],
      signalReviews: {},
    };
    for (const card of batchCards) {
      signals.push(signalFor(card));
      batch.signalReviews![card.signalIds![0]] = {
        verdict: 'do',
        reason: copy.doReason,
      };
    }
    for (const config of configs) {
      const [key, , , since, remaining] = config;
      if (ago > since) continue;
      const s = watchSignal(config, ago);
      const waitingFor = copy.watches.find((w) => w[0] === key)![3];
      signals.push(s);
      batch.signalReviews![s.key] = {
        verdict: 'watch',
        reason: s.facts[0],
        waitingFor,
        decideBy: day(-remaining),
      };
    }
    for (const ending of endings) {
      if (ago > ending.started) continue;
      const value = metric(ending.path, 'views', ago);
      const s: Signal = {
        key: ending.key,
        type: 'editorial',
        source: 'ga4',
        title: ending.title,
        facts: [value.fact, copy.notice],
        chip: value.chip,
        url: origin + ending.path,
        strength: 36,
        actionable: ending.outcome === 'opportunity',
        action: ending.outcome === 'opportunity' ? 'optimize' : null,
      };
      if (ago > ending.ended) {
        signals.push(s);
        batch.signalReviews![s.key] = {
          verdict: 'watch',
          reason: value.fact,
          waitingFor: words(
            '核对完整窗口后决定是否采取行动。',
            'Review a complete window before deciding on action.',
          ),
          decideBy: day(
            ending.outcome === 'expired' ? ending.ended : ending.started - 13,
          ),
        };
      } else if (
        ending.outcome !== 'normal' &&
        ending.outcome !== 'opportunity'
      ) {
        signals.push(s);
        batch.signalReviews![s.key] = {
          verdict: 'skip',
          reason: ending.reason,
        };
      }
    }
    applyWatchVerdicts(state, {
      signals,
      reviews: batch.signalReviews!,
      cards: batchCards,
      now: at(ago),
    });
    for (const ending of endings.filter((e) => e.ended === ago)) {
      if (ending.outcome === 'ignored') {
        // Ignore before the skip verdict closes it so the user decision retains its own outcome.
        const watch = state.watch![ending.key];
        if (watch) delete watch.ended;
        ignore(state, ending.key, at(ago));
        state.signalMeta ||= {};
        state.signalMeta[ending.key] = { status: 'ignored', at: at(ago) };
      }
      const watch = state.watch![ending.key];
      if (watch?.ended) watch.ended.reason = ending.reason;
    }
    endMissing(state, { signals, missing: [], now: at(ago) });
    const normal = state.watch!['editorial-ended-normal'];
    if (normal?.ended) normal.ended.reason = endings[1].reason;
    batches.unshift(batch);
  }
  state.insights = batches[0];
  state.insightHistory = batches.slice(1);
  numberOpportunities(state);
  return state;
}
