import { opportunityState, priorityRank, type Row } from './board';
import type { StrategyState, WatchRecord } from './model';

// Where each opportunity of Insights shows: in today's message or on an earlier day (briefing.tsx renders both).

/** Days as yyyy-mm-dd, the way the analysis and the watch records date them. */
export const dayOf = (iso?: string) => String(iso || '').slice(0, 10);
export type Standing = ReturnType<typeof opportunityState>;
export type Line = { row: Row; st: Standing };
export type Day = { day: string; items: Line[]; ended: WatchRecord[] };
export type Feed = { pending: Row[]; decided: Line[]; days: Day[] };
/**
 * Where each opportunity shows, once: today if it waits for a decision (most important first, as on Opportunities'
 * To do), or was raised, dismissed or handed off on the latest analysis day; otherwise on the day it was first raised,
 * with where it went. Merged duplicates are left out. Watches show on the day they ended.
 */
export function feedOf(
  state: StrategyState,
  rows: Row[],
  /** When each task was created, by task id: a hand-off counts on the day it happened. */
  taskCreated: ReadonlyMap<string, string> = new Map(),
): Feed {
  const today = dayOf(state.insights?.generatedAt),
    pending: Row[] = [],
    decided: Line[] = [],
    days = new Map<string, Day>(),
    at = (day: string) => {
      if (!days.has(day)) days.set(day, { day, items: [], ended: [] });
      return days.get(day)!;
    };
  for (const row of rows) {
    const st = opportunityState(row, state);
    if (st.reason === 'replaced') continue;
    if (st.state === 'pending') {
      pending.push(row);
      continue;
    }
    // Decided today: raised today, dismissed today or handed off today. One decided earlier stays on the day it was
    // raised, even when today's analysis lists it again (2026-10-22: T-27 and T-30 read as today's hand-offs beside
    // the three opportunities dismissed today).
    const raised = dayOf(row.firstSeenAt),
      ignored = dayOf(state.opportunityMeta?.[row.card.id]?.ignoredAt),
      handed = dayOf(row.taskId ? taskCreated.get(String(row.taskId)) : '');
    if (
      today &&
      (raised >= today ||
        (st.reason === 'ignored' && ignored >= today) ||
        (st.state === 'task' && handed >= today))
    )
      decided.push({ row, st });
    else if (raised) at(raised).items.push({ row, st });
  }
  for (const w of Object.values(state.watch || {})) {
    const day = dayOf(w.ended?.at);
    if (day && (!today || day < today)) at(day).ended.push(w);
  }
  pending.sort(
    (a, b) =>
      (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3) ||
      String(b.firstSeenAt).localeCompare(String(a.firstSeenAt)),
  );
  return {
    pending,
    decided,
    days: [...days.values()].sort((a, b) => b.day.localeCompare(a.day)),
  };
}
