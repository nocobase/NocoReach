import type {
  StrategyState,
  InsightBatch,
  Opportunity,
} from './strategy-model.js';
export type OpportunityState = 'pending' | 'task' | 'archived';
export const priorityRank: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  unrated: 3,
};
export function citedSignals(row: Row) {
  const ids = new Set(row.card.signalIds || []);
  return (row.batch.evidence.signals?.items || []).filter((s) =>
    ids.has(s.key),
  );
}
export type Row = {
  card: Opportunity;
  batch: InsightBatch;
  priority: string;
  status: string;
  manual: boolean;
  taskId?: number;
  taskNo?: number;
  firstSeenAt: string;
};
export function rowsFor(state: StrategyState): Row[] {
  const seen = new Set<string>();
  const manualBatches: InsightBatch[] = (state.resultOpportunities || []).map(card => ({items:[card],generatedAt:card.firstSeenAt||card.resultSource?.capturedAt||'',evidence:{capturedAt:card.resultSource?.capturedAt||'',availableThrough:null,periodDays:28,searchQueries:[],pages:[],industryCandidates:[],limitations:[]}}));
  const batches = [...manualBatches,state.insights, ...(state.insightHistory || [])].filter(
    Boolean,
  ) as InsightBatch[];
  return batches
    .flatMap((batch) =>
      batch.items
        .filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        })
        .map((card) => {
          const m = state.opportunityMeta?.[card.id],
            task = state.proposals.find(
              (p) => p.taskId && p.insight?.id === card.id,
            );
          return {
            card,
            batch,
            priority: m?.priority || card.priority || 'unrated',
            status: task ? 'task' : m?.status || 'pending',
            manual: Boolean(m?.priority),
            taskId: task?.taskId,
            taskNo: task?.taskNo,
            firstSeenAt:
              card.firstSeenAt ||
              [...batches]
                .reverse()
                .find((b) => b.items.some((c) => c.id === card.id))
                ?.generatedAt ||
              batch.generatedAt,
          };
        }),
    )
    .sort(
      (a, b) =>
        ['high', 'medium', 'low', 'unrated'].indexOf(a.priority) -
          ['high', 'medium', 'low', 'unrated'].indexOf(b.priority) ||
        b.batch.generatedAt.localeCompare(a.batch.generatedAt) ||
        a.card.id.localeCompare(b.card.id),
    );
}
export const overviewPeriodDays = 28;
export function opportunityState(
  row: Row,
  state: StrategyState,
): { state: OpportunityState; reason?: 'ignored' | 'expired' } {
  if (row.taskId) return { state: 'task' };
  const m = state.opportunityMeta?.[row.card.id];
  if (m?.status === 'ignored') return { state: 'archived', reason: 'ignored' };
  if (row.card.resultSource || row.batch === state.insights || m?.restoredAt)
    return { state: 'pending' };
  return { state: 'archived', reason: 'expired' };
}
export function todaySuggestions(state: StrategyState, limit = 5): Row[] {
  // Signal-based batches (analysis v3) replace the list: a suggestion stays while its signal is present.
  if (state.insights?.evidence.analysisVersion === 3) {
    const latest = state.insights;
    return rowsFor({ ...state, insightHistory: [] })
      .filter(
        (r) =>
          r.batch === latest && opportunityState(r, state).state === 'pending',
      )
      .sort(
        (a, b) =>
          (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3),
      )
      .slice(0, limit);
  }
  const batches = [state.insights, ...(state.insightHistory || [])].filter(
    (b) =>
      b?.evidence.periodDays === overviewPeriodDays &&
      b.evidence.analysisVersion === 2,
  ) as InsightBatch[];
  const now = Date.now();
  return rowsFor({
    ...state,
    insights: batches[0],
    insightHistory: batches.slice(1),
  })
    .filter(
      (r) =>
        !r.card.resultSource && ['pending', 'discussing'].includes(r.status) &&
        r.card.confidence === 'supported' &&
        r.card.lifecycle !== 'watch' &&
        !(r.card.reviewAt && Date.parse(r.card.reviewAt) < now),
    )
    .slice(0, limit);
}

import { taskClosed, taskState, type PendingTask } from './task-pending.js';
export function signalDisposition(
  s: { key: string },
  state: StrategyState,
  tasks: PendingTask[],
) {
  const rows = rowsFor(state).filter((r) =>
    citedSignals(r).some((x) => x.key === s.key),
  );
  const ids = [
    ...new Set(
      [
        ...rows.map((r) => r.taskId),
        ...state.proposals
          .filter((p) => p.signalKey === s.key)
          .map((p) => p.taskId),
      ].filter((x): x is number => Boolean(x)),
    ),
  ];
  const linked = ids
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is PendingTask => Boolean(t))
    .map((t) => ({
      id: t.id,
      no: t.evidence?.no,
      state: taskClosed(t.evidence?.work)
        ? ('closed' as const)
        : taskState(t.evidence?.work, t.status) === 'done'
          ? ('done' as const)
          : ('open' as const),
    }));
  const open = linked.find((t) => t.state === 'open'),
    last = linked
      .filter((t) => t.state !== 'open')
      .sort((a, b) => b.id - a.id)[0],
    earlier = last
      ? { id: last.id, no: last.no, state: last.state as 'done' | 'closed' }
      : undefined;
  if (open) return { next: 'task' as const, taskId: open.id, taskNo: open.no };
  const pending = rows.find(
    (r) => opportunityState(r, state).state === 'pending',
  );
  if (pending) return { next: 'opportunity' as const, row: pending, earlier };
  if (
    rows.some(
      (r) =>
        opportunityState(r, state).reason === 'ignored' &&
        r.batch === state.insights,
    )
  )
    return { next: 'hand' as const, dismissed: true, earlier };
  if (state.signalMeta?.[s.key]?.status === 'ignored')
    return { next: 'hand' as const, dismissed: true, ignored: true, earlier };
  const review = state.insights?.signalReviews?.[s.key];
  return review
    ? { next: 'hand' as const, verdict: review.verdict, earlier }
    : { next: 'judge' as const, earlier };
}
// Exactly the todo rows rendered by TodayChanges, including its v2/v3 selection and 50-row display bound.
export function insightPending(
  state: StrategyState,
  tasks: PendingTask[],
): number {
  const rows = todaySuggestions(state, 50),
    cited = new Set(rows.flatMap((r) => citedSignals(r).map((s) => s.key)));
  return (
    rows.length +
    (state.insights?.evidence.signals?.items || []).filter((s) => {
      if (cited.has(s.key)) return false;
      const x = signalDisposition(s, state, tasks);
      return (
        x.next === 'opportunity' ||
        (x.next === 'hand' && x.verdict === 'do' && !x.ignored)
      );
    }).length
  );
}
