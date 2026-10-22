import { z } from 'zod';
import type {
  InsightBatch,
  Opportunity,
  StrategyState,
  WatchRecord,
} from '../../../shared/strategy-model.js';
import {
  opportunityState,
  rowsFor,
  type Row,
} from '../../../shared/strategy-pending.js';
import {
  taskStanding,
  type TaskStanding,
  type TaskWork,
} from '../../../shared/task-pending.js';
import type { OnlineTool } from '../../online-agent/executor.js';
import { pageData } from './web-tool.js';

const input = z.strictObject({
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('An analysis day from `days`; omit for the latest analysis.'),
  offset: z.number().int().min(0).default(0),
});
const dayOf = (iso?: string) => String(iso || '').slice(0, 10);
/** A task as read from nrTasks, for where the task an opportunity became stands. */
export type AgentTask = {
  id: number | string;
  status?: string;
  evidence?: { work?: TaskWork | null } | null;
};
const TASK_STANDING: Record<TaskStanding, string> = {
  todo: 'handed_off_to_agent',
  doing: 'task_in_progress',
  review: 'task_needs_confirmation',
  done: 'task_done',
  closed: 'task_closed',
};
// Where an opportunity stands now, in the words Insights and Opportunities use: a handed-off one by where its task
// stands (2026-10-22: a done task's opportunity read "handed off"); handed_off_to_agent when its task is not known.
function standing(
  row: Row,
  state: StrategyState,
  tasks: ReadonlyMap<string, AgentTask>,
) {
  const st = opportunityState(row, state);
  if (st.state === 'pending') return 'awaiting_decision';
  if (st.state === 'task') {
    const task = row.taskId ? tasks.get(String(row.taskId)) : undefined;
    return TASK_STANDING[
      task
        ? taskStanding({ work: task.evidence?.work, status: task.status })
        : 'todo'
    ];
  }
  if (st.reason === 'ignored') return 'dismissed';
  if (st.reason === 'replaced') return 'merged_into_a_later_opportunity';
  return 'expired';
}
const watchOf = (w: WatchRecord) => ({
  change: w.startTitle,
  since: w.since,
  numbersThen: w.startFacts,
  waitingFor: w.waitingFor ?? null,
  decideBy: w.decideBy,
  ...(w.ended
    ? {
        endedAt: w.ended.at,
        outcome: w.ended.outcome,
        reason: w.ended.reason ?? null,
      }
    : {}),
});

/**
 * The daily analysis as Insights shows it, for the online agent: the analysis of one day (its notes, the opportunities
 * it raised and where each stands now, its verdict on every change with the reason), the opportunities awaiting a
 * decision now, and the watches. Read from the saved strategy state only; nothing is analysed again.
 */
export function analysisForAgent(
  state: StrategyState,
  day: string | undefined,
  link: (opportunityId: string) => string,
  tasks: AgentTask[] = [],
) {
  const taskById = new Map(tasks.map((t) => [String(t.id), t]));
  const batches = [state.insights, ...(state.insightHistory || [])].filter(
    (b): b is InsightBatch => Boolean(b?.generatedAt),
  );
  if (!batches.length) return { available: false, reason: 'no_analysis_yet' };
  // The last analysis of each day, newest day first.
  const byDay = new Map<string, InsightBatch>();
  for (const b of [...batches].sort((a, b) =>
    b.generatedAt.localeCompare(a.generatedAt),
  ))
    if (!byDay.has(dayOf(b.generatedAt))) byDay.set(dayOf(b.generatedAt), b);
  const days = [...byDay.keys()].slice(0, 90),
    batch = day ? byDay.get(day) : (state.insights ?? batches[0]);
  if (!batch) return { available: false, reason: 'no_analysis_that_day', days };
  const rows = rowsFor(state),
    rowOf = new Map(rows.map((r) => [r.card.id, r]));
  const opportunity = (card: Opportunity) => {
    const row = rowOf.get(card.id);
    return {
      no: card.no ? `O-${card.no}` : null,
      title: card.title,
      status: row ? standing(row, state, taskById) : 'not_on_opportunities',
      task: row?.taskNo ? `T-${row.taskNo}` : null,
      priority: row?.priority ?? card.priority ?? null,
      firstRaised: row?.firstSeenAt ?? card.firstSeenAt ?? null,
      why: card.reason || null,
      observation: card.observation,
      meaning: card.meaning,
      suggestion: card.suggestion,
      evidence: card.evidenceText,
      limitation: card.limitation,
      page: card.target || null,
      confidence: card.confidence ?? null,
      changes: card.signalIds ?? [],
      url: link(card.id),
    };
  };
  const reviews = batch.signalReviews || {},
    watches = Object.values(state.watch || {});
  return {
    available: true,
    days,
    analysis: {
      day: dayOf(batch.generatedAt),
      analyzedAt: batch.generatedAt,
      periodDays: batch.evidence?.periodDays ?? null,
      dataThrough: batch.evidence?.availableThrough ?? null,
      notes: batch.observations ?? [],
      limitations: batch.evidence?.limitations ?? [],
      opportunities: (batch.items || []).map(opportunity),
      changes: (batch.evidence?.signals?.items || []).map((s) => ({
        key: s.key,
        source: s.sourceName || s.source,
        title: s.title,
        facts: s.facts,
        page: s.url ?? null,
        verdict: reviews[s.key]?.verdict ?? null,
        reason: reviews[s.key]?.reason ?? null,
      })),
    },
    awaitingDecisionNow: rows
      .filter((r) => opportunityState(r, state).state === 'pending')
      .map((r) => ({
        no: r.card.no ? `O-${r.card.no}` : null,
        title: r.card.title,
        priority: r.priority,
        firstRaised: r.firstSeenAt,
        url: link(r.card.id),
      })),
    watching: watches.filter((w) => !w.ended).map(watchOf),
    watchesEnded: watches
      .filter((w) => w.ended)
      .sort((a, b) => b.ended!.at.localeCompare(a.ended!.at))
      .slice(0, 30)
      .map(watchOf),
  };
}

/**
 * `daily_analysis`: the saved daily analysis, read after `authorize` checks the user may still see Insights; the
 * project's tasks (empty when the user may not list them) say where each handed-off opportunity's task stands.
 */
export function dailyAnalysisTool(
  read: () => Promise<StrategyState>,
  authorize: () => Promise<void>,
  link: (opportunityId: string) => string,
  readTasks: () => Promise<AgentTask[]> = async () => [],
): OnlineTool {
  return {
    name: 'daily_analysis',
    description:
      "Read the project's daily analysis shown on Insights: the notes of a day's analysis, the opportunities it raised and where each stands now (awaiting decision; handed off to agent with its task, then that task in progress, needing confirmation, done or closed; dismissed; expired), its verdict on every change (do, watch, skip) with the reason, the opportunities awaiting a decision now, and the watches. Omit day for the latest analysis; `days` lists the earlier ones. Follow nextOffset to read everything. Link opportunities with their url.",
    inputSchema: z.toJSONSchema(input),
    async execute(args) {
      await authorize();
      const value = input.parse(args);
      return pageData(
        analysisForAgent(await read(), value.day, link, await readTasks()),
        value.offset,
      );
    },
  };
}

export type OverviewCard = {
  id: string;
  title?: string;
  cutoff?: string | null;
  window?: {
    start: string;
    end: string;
    days: number;
    previousStart?: string;
    previousEnd?: string;
  };
  metrics?: {
    key: string;
    label: string;
    value: number | null;
    previous: number | null;
    complete?: boolean;
    change: number | null;
  }[];
  series?: { date: string; value: number | null }[];
};
/**
 * The key numbers for the online agent, from the cards behind the Insights tiles (nrDataViews overview): each source's
 * metrics for the period with the previous period and the change, and its daily series.
 */
export function totalsOf(cards?: OverviewCard[]) {
  return (cards || []).map((card) => ({
    source: card.id,
    title: card.title ?? null,
    dataThrough: card.cutoff ?? null,
    period: card.window
      ? { start: card.window.start, end: card.window.end }
      : null,
    previousPeriod:
      card.window?.previousStart && card.window.previousEnd
        ? { start: card.window.previousStart, end: card.window.previousEnd }
        : null,
    metrics: (card.metrics || []).map((m) => ({
      key: m.key,
      label: m.label,
      value: m.value,
      previous: m.previous,
      change: m.change,
      complete: m.complete ?? null,
    })),
    daily: (card.series || []).map((p) => [p.date, p.value]),
  }));
}
