import type { TaskPart } from './opportunity-parts.js';
import { categoryOf } from './growth.js';
import { pageKey } from './page-identity.js';
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
/**
 * What a card's target names, for every comparison of two cards' targets: a page whatever its scheme, `www.`, trailing
 * slash, query or fragment (shared/page-identity.ts; 2026-11-22 O-113 named .../workflow-automation-tools/ where O-110
 * had no slash), a site path likewise, and any other target as its text.
 */
export function targetKey(target?: string) {
  const t = String(target || '').trim();
  if (t && !/\s/.test(t)) {
    if (t.startsWith('/'))
      return t.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
    const page = pageKey(
      /^https?:\/\//i.test(t)
        ? t
        : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(t)
          ? `https://${t}`
          : '',
    );
    if (page) return page;
  }
  return normalize(t);
}
const sameTarget = (a: Opportunity, b: Opportunity) => {
  const target = targetKey(a.target);
  return Boolean(target) && target === targetKey(b.target);
};
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
  return (
    sameSignals(a, b) &&
    (sameTarget(a, b) || wording(a.title) === wording(b.title))
  );
}
// Words that name the kind of work or page rather than what it is about, so different opportunities share them
// ("Add a comparison page for Lovable alternatives" and "Write a table, column and row permissions comparison" share
// only "comparison"), and the words that only join others. Longer ones first, so a word is never cut by a shorter one.
const GENERIC_TERMS = [
  '重写',
  '改写',
  '找回',
  '新建',
  '补上',
  '补齐',
  '补充',
  '做成',
  '联系',
  '合并',
  '优化',
  '提升',
  '更新',
  '选型',
  '对比',
  '指南',
  '页面',
  '文章',
  '内容',
  '文档',
  '博客',
  '一页',
  '点击',
  '曝光',
  '流量',
  '每月',
  '我们',
  '写',
  '补',
  '建',
  '改',
  '加',
  '给',
  '为',
  '把',
  '让',
  '做',
  '查',
  '页',
  '的',
  '了',
  '个',
  '次',
  '与',
  '和',
  '及',
  '并',
  '在',
].sort((a, b) => b.length - a.length);
const GENERIC_WORDS = new Set(
  `a an the to for of and or with in on at by from into our us we your new more page pages guide guides article
  articles post posts doc docs comparison compare vs write rewrite add update fix improve create build recover get
  make turn clicks impressions traffic monthly`.split(/\s+/),
);
/**
 * The terms a title is about, apart from its numbers and generic words: each pair of adjacent Han characters (Chinese
 * and Japanese titles have no spaces) and each other word of two or more letters.
 */
export function titleTerms(title?: string) {
  let t = normalize(title).replace(/\d+/g, ' ');
  for (const w of GENERIC_TERMS) t = t.split(w).join(' ');
  const terms = new Set<string>();
  for (const run of t.match(/\p{Script=Han}+/gu) || [])
    for (let i = 0; i + 1 < run.length; i++) terms.add(run.slice(i, i + 2));
  for (const w of t.match(/[\p{L}\p{N}]+/gu) || [])
    if (!/\p{Script=Han}/u.test(w) && w.length > 1 && !GENERIC_WORDS.has(w))
      terms.add(w);
  return terms;
}
/**
 * The same work raised again under a reworded title, when the analysis no longer saw the earlier card (2026-11-22 to
 * 11-25: O-98 came back as O-114, O-99 as O-117, O-89 as O-112, O-104 as O-105, O-110 as O-113, each a title in other
 * words): the same changes the server computes, and titles about one thing, sharing a term once generic words are left
 * out. A broad change backs different work under titles sharing nothing (O-81 and O-63 on one competitor's pages, O-21
 * and O-1 on a community digest); in 53 analyses of project 1 every pair with the same changes shared a term exactly
 * when it was one piece of work. Callers also require that the two were never raised by one analysis, which would
 * have made them two (O-8 and O-21 on 10-11). Never used to keep an opportunity ignored (opportunity-board.ts
 * withoutIgnored): a wrong match there would hide a new one.
 */
export function sameWork(a: Opportunity, b: Opportunity) {
  const stable = stableSignals(a);
  if (!stable || stable !== stableSignals(b)) return false;
  const terms = titleTerms(b.title);
  return [...titleTerms(a.title)].some((t) => terms.has(t));
}
/** Whether one analysis raised both cards. */
const together = (state: StrategyState, a: string, b: string) =>
  [state.insights, ...(state.insightHistory || [])].some(
    (batch) =>
      batch?.items?.some((c) => c.id === a) &&
      batch.items.some((c) => c.id === b),
  );
// A later card about the same thing, the same page or the same work in other words replaces an earlier one, whatever
// was decided on it.
const replaces = (
  later: Opportunity,
  earlier: Opportunity,
  state: StrategyState,
) =>
  sameOpportunity(later, earlier) ||
  sameTarget(later, earlier) ||
  (sameWork(later, earlier) && !together(state, later.id, earlier.id));
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
        replaces(r.card, row.card, state),
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
