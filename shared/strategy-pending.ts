import type { TaskPart } from './opportunity-parts.js';
import { categoryOf } from './growth.js';
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
/**
 * Pending opportunities in the order they are shown: by priority, which the AI set from the growth, the relevance to
 * the product and the effort; at the same priority Trending now first, as it does not keep (2026-11-10), and among
 * those the one Insights' first note is about (its batch's `leadId`); then the newest first. `saveInsights` gives that
 * one the highest priority of its batch's trending opportunities, so Most worth a look today is the first of them here.
 */
export function pendingOrder(a: Row, b: Row): number {
  const trending = (r: Row) => Number(categoryOf(r.card) === 'trending'),
    lead = (r: Row) => Number(r.batch.leadId === r.card.id);
  return (
    (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3) ||
    trending(b) - trending(a) ||
    lead(b) - lead(a) ||
    String(b.firstSeenAt).localeCompare(String(a.firstSeenAt))
  );
}
/**
 * The priority the opportunity of Insights' first note takes so it ranks first among the batch's trending
 * opportunities (or among all of them, when it is not trending): the highest any of them has, if above its own.
 */
export function leadPriority(
  lead: Pick<Opportunity, 'priority' | 'growth'>,
  items: Pick<Opportunity, 'priority' | 'growth'>[],
): string | undefined {
  const trending = (c: Pick<Opportunity, 'growth'>) =>
      categoryOf(c) === 'trending',
    peers = trending(lead) ? items.filter(trending) : items,
    rank = (c: Pick<Opportunity, 'priority'>) =>
      priorityRank[c.priority || 'unrated'] ?? 3,
    top = peers.reduce((m, c) => Math.min(m, rank(c)), rank(lead));
  return top < rank(lead)
    ? Object.keys(priorityRank).find((k) => priorityRank[k] === top)
    : undefined;
}
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
  /** Every task handed off from it, first first (an opportunity can need several, one per place to change). */
  tasks: { taskId: number; taskNo?: number; part?: TaskPart }[];
  firstSeenAt: string;
};
export function rowsFor(state: StrategyState): Row[] {
  const seen = new Set<string>();
  const manualBatches: InsightBatch[] = (state.resultOpportunities || []).map(
    (card) => ({
      items: [card],
      generatedAt: card.firstSeenAt || card.resultSource?.capturedAt || '',
      evidence: {
        capturedAt: card.resultSource?.capturedAt || '',
        availableThrough: null,
        periodDays: 28,
        searchQueries: [],
        pages: [],
        industryCandidates: [],
        limitations: [],
      },
    }),
  );
  const batches = [
    ...manualBatches,
    state.insights,
    ...(state.insightHistory || []),
  ].filter(Boolean) as InsightBatch[];
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
            handed = state.proposals
              .filter((p) => p.taskId && p.insight?.id === card.id)
              .reverse(),
            task = handed[0];
          return {
            card,
            batch,
            priority: m?.priority || card.priority || 'unrated',
            status: task ? 'task' : m?.status || 'pending',
            manual: Boolean(m?.priority),
            taskId: task?.taskId,
            taskNo: task?.taskNo,
            tasks: handed.map((p) => ({
              taskId: p.taskId!,
              ...(p.taskNo !== undefined ? { taskNo: p.taskNo } : {}),
              ...(p.part ? { part: p.part } : {}),
            })),
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
const normalize = (s?: string) =>
  String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
/** Text compared apart from its numbers ("Turn 7,534 impressions…" and "Turn 7,470 impressions…" read the same). */
export const wording = (s?: string) => normalize(s).replace(/\d+/g, '');
// A Skill's finding is keyed `skill:<skillId>:<kind>:<digest>` (server/nocoreach/skill-analysis.ts). Until
// 2026-11-25 the digest was of everything the Skill cited, which changed from one day to the next, so the same finding
// came back under another key (2026-11-21: O-93 came back as O-108, O-91 as O-111, O-95 as O-109). It is now of the
// page or largest keyword or question the growth rests on, but cards saved before keep the old keys, and a Skill may
// still name another largest row for one opportunity. Only the changes the server computes itself are sure to keep
// their key, so only those decide whether two cards cite the same changes.
const isSkillSignal = (key: string) => key.startsWith('skill:');
/** The changes a card cites that keep their key from one analysis to the next: all but its Skills' findings. */
export const stableSignals = (c: Pick<Opportunity, 'signalIds'>) =>
  (c.signalIds || [])
    .filter((k) => !isSkillSignal(k))
    .sort()
    .join('|');
/** Which Skill found what kind of growth, for each Skill finding a card cites: its key without the daily digest. */
const skillFindings = (c: Pick<Opportunity, 'signalIds'>) =>
  new Set(
    (c.signalIds || [])
      .filter(isSkillSignal)
      .map((k) => k.slice(0, k.lastIndexOf(':'))),
  );
/**
 * Two cards cite the same changes: the same changes the server computed, whatever their Skills found. Cards resting
 * on Skill findings alone cite the same when one Skill found the same kind of growth for both; that alone is no
 * evidence of one opportunity (a Skill finds many gaps of one kind), so callers also compare the page or the title.
 */
export function sameSignals(
  a: Pick<Opportunity, 'signalIds'>,
  b: Pick<Opportunity, 'signalIds'>,
) {
  const stable = stableSignals(a);
  if (stable || stableSignals(b)) return stable === stableSignals(b);
  const found = skillFindings(b);
  return [...skillFindings(a)].some((k) => found.has(k));
}
// The same opportunity raised again in other words (2026-10-19, O-2 and O-9 were one): the same changes cited, and
// the same page, or the same title apart from its numbers ("回复 3 个…" / "回复 4 个…"). One change can back several
// different actions (a community digest), so the changes alone never decide it. Daily analysis keeps its card.
export function sameOpportunity(a: Opportunity, b: Opportunity) {
  const target = normalize(a.target);
  return (
    sameSignals(a, b) &&
    ((Boolean(target) && target === normalize(b.target)) ||
      wording(a.title) === wording(b.title))
  );
}
// A later card about the same thing, or the same page, replaces an earlier one, whatever was decided on it.
const replaces = (later: Opportunity, earlier: Opportunity) =>
  sameOpportunity(later, earlier) ||
  (Boolean(normalize(later.target)) &&
    normalize(later.target) === normalize(earlier.target));
// An undecided opportunity waits this many days after the last analysis that raised it (2026-10-19: one quiet day no
// longer expires it). Days count from the latest analysis, not the clock, as watching does.
export const opportunityKeepDays = 14;
const day = (iso?: string) => Date.parse(String(iso || '').slice(0, 10));
export function opportunityState(
  row: Row,
  state: StrategyState,
): { state: OpportunityState; reason?: 'ignored' | 'expired' | 'replaced' } {
  if (row.taskId) return { state: 'task' };
  const m = state.opportunityMeta?.[row.card.id];
  if (m?.status === 'ignored') return { state: 'archived', reason: 'ignored' };
  if (row.card.resultSource || row.batch === state.insights || m?.restoredAt)
    return { state: 'pending' };
  // Raised again later under another card (handed off, ignored or still pending there): this earlier copy never
  // comes back (2026-10-20: O-1…O-6 returned beside O-8…O-14 once nothing expired the next day).
  if (
    rowsFor(state).some(
      (r) =>
        r.card.id !== row.card.id &&
        !r.card.resultSource &&
        r.batch.generatedAt > row.batch.generatedAt &&
        replaces(r.card, row.card),
    )
  )
    return { state: 'archived', reason: 'replaced' };
  // rowsFor keeps each card from the newest analysis that raised it.
  const quiet =
    (day(state.insights?.generatedAt) - day(row.batch.generatedAt)) / 86400000;
  if (quiet < opportunityKeepDays) return { state: 'pending' };
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
      .sort(pendingOrder)
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
        !r.card.resultSource &&
        ['pending', 'discussing'].includes(r.status) &&
        r.card.confidence === 'supported' &&
        r.card.lifecycle !== 'watch' &&
        !(r.card.reviewAt && Date.parse(r.card.reviewAt) < now),
    )
    .slice(0, limit);
}

import { taskStanding, type PendingTask } from './task-pending.js';
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
    .map((t) => {
      const standing = taskStanding({
        work: t.evidence?.work,
        status: t.status,
      });
      return {
        id: t.id,
        no: t.evidence?.no,
        standing,
        state:
          standing === 'closed' || standing === 'done'
            ? standing
            : ('open' as const),
      };
    });
  const open = linked.find((t) => t.state === 'open'),
    last = linked
      .filter((t) => t.state !== 'open')
      .sort((a, b) => b.id - a.id)[0],
    earlier = last
      ? { id: last.id, no: last.no, state: last.state as 'done' | 'closed' }
      : undefined;
  if (open)
    return {
      next: 'task' as const,
      taskId: open.id,
      taskNo: open.no,
      taskStanding: open.standing,
    };
  const pending = rows.find(
    (r) => opportunityState(r, state).state === 'pending',
  );
  if (pending) return { next: 'opportunity' as const, row: pending, earlier };
  // An opportunity you ignored keeps the changes it rests on quiet, whichever analysis raised it. Ignoring one from an
  // earlier analysis (kept pending for 14 days) used to bring its changes back on Insights as changes to act on,
  // since the analysis never raises an ignored opportunity again (withoutIgnored) and so never in the latest batch.
  if (rows.some((r) => opportunityState(r, state).reason === 'ignored'))
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
