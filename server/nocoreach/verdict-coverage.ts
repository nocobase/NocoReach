import { systemMessageText } from '../../shared/i18n/messages.js';
import type {
  Opportunity,
  Signal,
  SignalReview,
  StrategyState,
} from '../../shared/strategy-model.js';
import {
  citedSignals,
  opportunityState,
  rowsFor,
} from '../../shared/strategy-pending.js';
import {
  taskClosed,
  taskState,
  type TaskWork,
} from '../../shared/task-pending.js';
import { mergeCards, withoutIgnored } from './opportunity-board.js';

/** A task as read from nrTasks: its number, state and the pages it is about. */
export type CoverTask = {
  id: number | string;
  evidence?: {
    no?: number;
    work?: (TaskWork & { page?: { url?: string } | null }) | null;
    page?: unknown;
    signalKey?: unknown;
    insight?: { target?: unknown; signalIds?: unknown } | null;
    context?: { signals?: { items?: { key?: unknown; url?: unknown }[] } };
  } | null;
};
type Cover =
  | { kind: 'task'; no?: number; state: 'open' | 'done' | 'closed' }
  | { kind: 'opportunity'; no?: number }
  | { kind: 'ignored' };

// A page compared without scheme, `www.`, trailing slash, query or fragment.
function pageOf(url: unknown) {
  if (typeof url !== 'string') return '';
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return `${u.host.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '';
  }
}
function taskPages(t: CoverTask) {
  const e = t.evidence || {},
    ids = new Set([
      ...(Array.isArray(e.insight?.signalIds)
        ? (e.insight.signalIds as unknown[])
        : []),
      ...(typeof e.signalKey === 'string' ? [e.signalKey] : []),
    ]);
  return [
    e.work?.page?.url,
    e.page,
    e.insight?.target,
    ...(e.context?.signals?.items || [])
      .filter((s) => ids.has(s.key))
      .map((s) => s.url),
  ]
    .map(pageOf)
    .filter(Boolean);
}
const taskCover = (t: CoverTask | undefined, no?: number): Cover => ({
  kind: 'task',
  no: no ?? t?.evidence?.no,
  state: taskClosed(t?.evidence?.work)
    ? 'closed'
    : taskState(t?.evidence?.work) === 'done'
      ? 'done'
      : 'open',
});

/**
 * What already covers a change: a task (handed off from it, from an opportunity citing it, or about its page), an
 * opportunity citing it or about its page, or an ignored one. Tasks first, then pending opportunities, then ignores.
 */
function coverOf(
  s: Signal,
  state: StrategyState,
  tasks: CoverTask[],
): Cover | null {
  const page = pageOf(s.url),
    byId = new Map(tasks.map((t) => [String(t.id), t]));
  for (const p of state.proposals || []) {
    const cites =
      p.signalKey === s.key || (p.insight?.signalIds || []).includes(s.key);
    if (p.taskId && cites)
      return taskCover(byId.get(String(p.taskId)), p.taskNo);
  }
  if (page) {
    const t = tasks.find((x) => taskPages(x).includes(page));
    if (t) return taskCover(t);
  }
  let ignored = false;
  for (const row of rowsFor(state)) {
    const about =
      (row.card.signalIds || []).includes(s.key) ||
      (Boolean(page) &&
        [row.card.target, ...citedSignals(row).map((x) => x.url)]
          .map(pageOf)
          .includes(page));
    if (!about) continue;
    const st = opportunityState(row, state);
    if (st.state === 'task')
      return taskCover(byId.get(String(row.taskId)), row.taskNo);
    if (st.state === 'pending') return { kind: 'opportunity', no: row.card.no };
    if (st.reason === 'ignored') ignored = true;
  }
  return ignored ? { kind: 'ignored' } : null;
}
function reasonOf(c: Cover, locale: string) {
  return reasonText(c, locale)
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function reasonText(c: Cover, locale: string) {
  if (c.kind === 'ignored')
    return systemMessageText('strategy.verdictCoveredIgnored', {}, locale);
  const no = c.no ? `${c.kind === 'task' ? 'T' : 'O'}-${c.no}` : '';
  if (c.kind === 'opportunity')
    return systemMessageText(
      'strategy.verdictCoveredOpportunity',
      { 0: no },
      locale,
    );
  return systemMessageText(
    c.state === 'closed'
      ? 'strategy.verdictCoveredTaskClosed'
      : c.state === 'done'
        ? 'strategy.verdictCoveredTaskDone'
        : 'strategy.verdictCoveredTask',
    { 0: no },
    locale,
  );
}
const SOURCE: Record<string, Opportunity['source']> = {
  gsc: 'search',
  rank: 'search',
  'ai-search': 'search',
  ga4: 'website',
  site: 'website',
};
// An opportunity written from the change itself when the analysis judged it worth doing but wrote none.
function cardFor(s: Signal, review: SignalReview, locale: string) {
  const facts = Array.isArray(s.facts) ? s.facts : [],
    title = s.title || s.key,
    why = review.reason || facts[0] || title;
  return {
    title: title.slice(0, 200),
    reason: why.slice(0, 300),
    observation: (facts.join('; ') || title).slice(0, 2000),
    meaning: '',
    evidenceText: [s.sourceName || s.source, ...facts]
      .join(': ')
      .slice(0, 3000),
    limitation: systemMessageText(
      'strategy.autoOpportunityLimitation',
      {},
      locale,
    ),
    suggestion: why.slice(0, 3000),
    objective: why.slice(0, 1000),
    source: SOURCE[s.source] || 'market',
    signalIds: [s.key],
    target: (s.url || '').slice(0, 500),
    audience: '',
    sources: [s.source],
    category: 'unclassified',
    priority: 'unrated',
    priorityReason: '',
    confidence: 'verify',
    effort: 'unknown',
    lifecycle: 'persistent',
  };
}

/**
 * Keeps the latest analysis's verdicts and opportunities in step (2026-10-21): a change judged worth doing must have an
 * opportunity, as the analysis prompt asks but nothing checked. One no opportunity cites becomes "skip" with the reason
 * when a task, an opportunity or an ignored one already covers it, and otherwise gets an opportunity written from the
 * change. Runs on every save of verdicts (the daily analysis and the ones filled in afterwards). Returns what changed.
 */
export function settleVerdicts(
  state: StrategyState,
  tasks: CoverTask[],
  now: string,
  uuid: () => string,
  locale = 'zh-CN',
): { skipped: string[]; raised: string[] } {
  const batch = state.insights,
    out = { skipped: [] as string[], raised: [] as string[] };
  if (!batch?.signalReviews) return out;
  const reviews = batch.signalReviews;
  batch.items ||= [];
  const cited = new Set(batch.items.flatMap((c) => c.signalIds || []));
  const cards: ReturnType<typeof cardFor>[] = [];
  for (const s of batch.evidence.signals?.items || []) {
    const review = reviews[s.key];
    if (review?.verdict !== 'do' || cited.has(s.key)) continue;
    const cover = coverOf(s, state, tasks);
    if (cover) {
      reviews[s.key] = { verdict: 'skip', reason: reasonOf(cover, locale) };
      out.skipped.push(s.key);
    } else cards.push(cardFor(s, review, locale));
  }
  if (!cards.length) return out;
  const listed = new Map(batch.items.map((c) => [c.id, c]));
  const merged = mergeCards(state, cards, now, uuid) as Opportunity[];
  const kept = new Set(
    (withoutIgnored(state, merged) as Opportunity[]).map((c) => c.id),
  );
  for (const c of cards) {
    const key = c.signalIds[0],
      card = merged.find((m) => m.signalIds?.[0] === key),
      same = card && listed.get(card.id);
    if (card && kept.has(card.id) && !same) {
      batch.items.push(card);
      listed.set(card.id, card);
      out.raised.push(key);
      continue;
    }
    // Dropped on the way: an ignored opportunity, or one the latest analysis already lists.
    reviews[key] = {
      verdict: 'skip',
      reason: reasonOf(
        card && !kept.has(card.id)
          ? { kind: 'ignored' }
          : { kind: 'opportunity', no: same?.no },
        locale,
      ),
    };
    out.skipped.push(key);
  }
  return out;
}
