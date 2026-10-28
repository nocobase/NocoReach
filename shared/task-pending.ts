export type TaskState = 'todo' | 'doing' | 'review' | 'done';
export type TaskWork = {
  boardState?: TaskState;
  stage?: string;
  flow?: { stages: { kind: string }[] };
  stageIndex?: number;
  release?: { state: string };
  receipt?: { note: string } | null;
  results?: ({ rejectedAt?: string } | null)[];
  step?: number;
  cancelledAt?: string;
  archivedAt?: string;
  humanOwnerId?: string;
  snooze?: TaskSnooze | null;
};
/** Put aside until a day (Snooze, 2026-10-28 user request, as Gmail's): the task keeps its place and comes back then. */
export type TaskSnooze = {
  /** When it comes back: 09:00 of `day` in the daily analysis's time zone. */
  until: string;
  day: string;
  reason?: string;
  at: string;
  by: string;
  byName?: string;
};
export type PendingTask = {
  id: number;
  status?: string;
  evidence?: {
    work?: TaskWork | null;
    createdBy?: { id?: string };
    no?: number;
  };
};

// The same raw-record predicate as the Insights waiting strip; no migration or owner reassignment.
export function taskState(
  w?: TaskWork | null,
  legacyStatus?: string,
): TaskState {
  if (w?.boardState) return w.boardState;
  if (w?.stage === 'done' || (!w && legacyStatus === '已完成')) return 'done';
  if (w?.stage === 'flow') {
    const kind = w.flow?.stages[w.stageIndex || 0]?.kind;
    if (kind === 'observe') return 'done';
    return kind === 'review' ||
      kind === 'publish' ||
      (kind === 'release' &&
        ['merge_failed', 'not_seen'].includes(w.release?.state || ''))
      ? 'review'
      : 'doing';
  }
  if (w?.stage === 'verification') return w.receipt?.note ? 'done' : 'review';
  if (w?.stage === 'execution') return 'review';
  if (w?.stage === 'work')
    return w.results?.[w.step || 0] && !w.results[w.step || 0]?.rejectedAt
      ? 'review'
      : 'doing';
  return 'todo';
}
export function taskOwner(task: Pick<PendingTask, 'evidence'>): string | null {
  return (
    task.evidence?.work?.humanOwnerId ?? task.evidence?.createdBy?.id ?? null
  );
}
export const taskClosed = (work?: TaskWork | null): boolean =>
  Boolean(work?.cancelledAt || work?.archivedAt);
/** Snoozed: out of Needs you and Current, and of every count and reminder of what waits, until it comes back. */
export const taskSnoozed = (work?: TaskWork | null): boolean =>
  Boolean(work?.snooze && !taskClosed(work) && work.stage !== 'done');
/**
 * Where a task stands now: what Insights, Opportunities and the online agent say of the task an opportunity or a
 * change was handed off as. A cancelled task, or one archived before it finished, is closed; one archived after it
 * finished stays done (2026-10-23, as Results counts it; server/nocoreach/execution/model.ts `taskStanding`).
 */
export type TaskStanding = TaskState | 'closed' | 'snoozed';
export const taskStanding = (task: {
  work?: TaskWork | null;
  status?: string;
}): TaskStanding => {
  if (task.work?.cancelledAt) return 'closed';
  const state = taskState(task.work, task.status);
  if (task.work?.archivedAt && state !== 'done') return 'closed';
  return taskSnoozed(task.work) ? 'snoozed' : state;
};
