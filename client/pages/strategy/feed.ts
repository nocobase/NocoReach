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
 * To do) or was raised, raised again or dismissed on the latest analysis day; otherwise on the day it was first raised,
 * with where it went. Merged duplicates are left out. Watches show on the day they ended.
 */
export function feedOf(state: StrategyState, rows: Row[]): Feed {
  const latest = state.insights?.generatedAt || '',
    today = dayOf(latest),
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
    const raised = dayOf(row.firstSeenAt),
      ignored = dayOf(state.opportunityMeta?.[row.card.id]?.ignoredAt);
    if (
      today &&
      (row.batch.generatedAt === latest ||
        raised >= today ||
        (st.reason === 'ignored' && ignored >= today))
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
