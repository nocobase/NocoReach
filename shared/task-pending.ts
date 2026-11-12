export type TaskState = 'todo' | 'doing' | 'review' | 'done';
export type TaskWork = {
  boardState?: TaskState;
  stage?: string;
  flow?: { stages: { kind: string; key?: string }[] };
  stageIndex?: number;
  latestRun?: { id?: string; status: string } | null;
  history?: { action?: string; stageKey?: string; note?: string }[];
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

// Release states that wait for a person: the merge failed, the change was not seen online, an article could not be
// published or exported, or a new article waits as a draft for someone to publish it in the CMS (2026-11-12)
// (server/nocoreach/execution/article-flow.ts).
const RELEASE_WAITS = [
  'merge_failed',
  'not_seen',
  'publish_failed',
  'publish_conflict',
  'export_late',
  'awaiting_cms',
];

/**
 * An Agent step reopened after the closing stopped its run or withdrew its change, and not started again yet: it waits
 * for Start this step again (shared/task-reopen.ts), on the card and in the task list.
 */
export function awaitingRestart(
  w?: TaskWork | null,
): 'stopped' | 'withdrawn' | undefined {
  const st = w?.flow?.stages[w.stageIndex || 0];
  if (!w || w.stage !== 'flow' || st?.kind !== 'agent' || taskClosed(w)) return;
  const h = w.history || [],
    i = h.map((e) => e.action).lastIndexOf('unarchiveTask'),
    e = h[i];
  if (
    !e ||
    e.stageKey !== st.key ||
    (e.note !== 'stopped' && e.note !== 'withdrawn')
  )
    return;
  return h
    .slice(i + 1)
    .some((x) => x.action === 'runQueued' || x.action === 'recordManual')
    ? undefined
    : e.note;
}

// Where a task stands on the board and in the list, on the raw record: the pages, the Tasks badge, the server's status
// text and notifications (server/nocoreach/execution/model.ts `boardState`) all read this. No migration or owner
// reassignment.
export function taskState(
  w?: TaskWork | null,
  legacyStatus?: string,
): TaskState {
  if (w?.boardState) return w.boardState;
  if (w?.stage === 'done' || (!w && legacyStatus === '已完成')) return 'done';
  if (w?.stage === 'flow') {
    const kind = w.flow?.stages[w.stageIndex || 0]?.kind;
    if (kind === 'observe') return 'done';
    // An Agent step whose run failed, or that waits to be started again, waits for a person as a failed merge does
    // (2026-11-04 user decision); Try again or Start this step again puts it back in progress.
    if (kind === 'agent')
      return w.latestRun?.status === 'failed' || awaitingRestart(w)
        ? 'review'
        : 'doing';
    return kind === 'review' ||
      kind === 'publish' ||
      (kind === 'release' && RELEASE_WAITS.includes(w.release?.state || ''))
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
 * Needs you: open, not snoozed, and waiting to be started or for a person. Tasks › Waiting for me, its count, the Tasks
 * badge and the Insights waiting strip all use this; each adds whose task it is.
 */
export const taskWaiting = (
  work?: TaskWork | null,
  legacyStatus?: string,
): boolean =>
  !taskClosed(work) &&
  !taskSnoozed(work) &&
  ['todo', 'review'].includes(taskState(work, legacyStatus));
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
