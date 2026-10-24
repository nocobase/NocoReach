import { opportunityState, priorityRank, type Row } from './board';
import type { StrategyState, WatchRecord } from './model';
import type { TaskWork } from '../../../shared/task-pending.js';
import { taskStanding, type TaskStanding } from './task-standing';

// Where each opportunity of Insights shows: in today's message or on an earlier day (briefing.tsx renders both).

/** Days as yyyy-mm-dd, the way the analysis and the watch records date them. */
export const dayOf = (iso?: string) => String(iso || '').slice(0, 10);
export type Standing = ReturnType<typeof opportunityState>;
export type { TaskStanding };
export type Line = {
  row: Row;
  st: Standing;
  task?: TaskStanding;
  /** Where each task stands, when it was handed off one task per place and has several. */
  tasks?: TaskStanding[];
};
/** What Insights knows of a task: when it was created and its work. */
export type TaskInfo = {
  createdAt?: string;
  work?: TaskWork | null;
  status?: string;
};
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
  /** The project's tasks by id: a hand-off counts on the day its task was created, and shows where the task stands. */
  tasks: ReadonlyMap<string, TaskInfo> = new Map(),
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
    const task = row.taskId ? tasks.get(String(row.taskId)) : undefined,
      several = st.state === 'task' && row.tasks.length > 1,
      line: Line = {
        row,
        st,
        ...(task && st.state === 'task' ? { task: taskStanding(task) } : {}),
        ...(several
          ? {
              tasks: row.tasks.map((t) => {
                const info = tasks.get(String(t.taskId));
                return info ? taskStanding(info) : 'todo';
              }),
            }
          : {}),
      },
      raised = dayOf(row.firstSeenAt),
      ignored = dayOf(state.opportunityMeta?.[row.card.id]?.ignoredAt),
      handed = dayOf(task?.createdAt);
    if (
      today &&
      (raised >= today ||
        (st.reason === 'ignored' && ignored >= today) ||
        (st.state === 'task' && handed >= today))
    )
      decided.push(line);
    else if (raised) at(raised).items.push(line);
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
