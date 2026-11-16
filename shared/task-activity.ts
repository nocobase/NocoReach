import { timestamp } from './timestamps.js';

// A task's latest activity (2026-11-02 user decision: the board's four columns run newest first by it). It is the time
// of the last event the task page's Activity card shows, so the time on a card or in the Tasks list always matches the
// last line of Activity, and a write Activity does not show (a run starting, a retry being queued) cannot move a task.
// The task page, the board, the Tasks list and the daily analysis's recent tasks all read it from here.

/** Run bookkeeping Activity leaves out: the step card shows a current failure and Technical details keeps every run. */
export const QUIET_EVENTS: ReadonlySet<string> = new Set([
  'runQueued',
  'runFailed',
  'flowWaiting',
]);

/** Every recorded event Activity shows; `eventText` in client/pages/playbook-model.ts words each one. */
export const ACTIVITY_EVENTS: ReadonlySet<string> = new Set([
  'startTask',
  'retitle',
  'selectPlaybook',
  'restartWithPlaybook',
  'snoozeTask',
  'snoozeChanged',
  'unsnoozeTask',
  'snoozeEnded',
  'snoozeDue',
  'handoff',
  'runSucceeded',
  'approveStage',
  'requestStageChanges',
  'changePrimary',
  'editStageOutput',
  'recordManual',
  'retryStage',
  'cancelRun',
  'confirmPublish',
  'comment',
  'linkContent',
  'cancelTask',
  'archiveTask',
  'unarchiveTask',
  'prClosed',
  'merged',
  'revertRelease',
  'revertOpened',
  'simulatedRelease',
  'live',
  'notSeen',
  'effect',
  'retryMerge',
  'markMerged',
  'confirmLive',
  'waitLonger',
  'linkPage',
  'setAgent',
  'setOwner',
  'setCollaborators',
  'moveWork',
  'linkArticle',
  'editArticleDraft',
  'restoreArticleVersion',
  'retryPublish',
  'rebaseArticle',
  'articlePublished',
  'articleConflict',
  'articlePublishFailed',
  'articleExported',
  'articleExportLate',
  'articleDrift',
]);

export type ActivityEvent = { at?: string; action: string };
export type ActivityTask = {
  createdAt?: unknown;
  updatedAt?: unknown;
  evidence?: { work?: { history?: readonly ActivityEvent[] } | null } | null;
};

export const shownInActivity = (e: ActivityEvent): boolean =>
  ACTIVITY_EVENTS.has(e.action);

const instant = (value: unknown): number | null => {
  try {
    const at = Date.parse(timestamp(value ?? null) || '');
    return Number.isNaN(at) ? null : at;
  } catch {
    return null;
  }
};

/**
 * When the task last did something Activity shows, as an ISO timestamp. A task with nothing in Activity yet was last
 * active when it was created (its stored update time only for records without one).
 */
export function lastActivityAt(task: ActivityTask): string | undefined {
  let latest: number | null = null;
  for (const e of task.evidence?.work?.history ?? []) {
    if (!shownInActivity(e)) continue;
    const at = instant(e.at);
    if (at !== null && (latest === null || at > latest)) latest = at;
  }
  latest ??= instant(task.createdAt) ?? instant(task.updatedAt);
  return latest === null ? undefined : new Date(latest).toISOString();
}

/** Newest activity first; a task without a readable time goes last, and ties keep the newest task first. */
export function latestActivityFirst<
  T extends ActivityTask & { id: number | string },
>(tasks: readonly T[]): T[] {
  return tasks
    .map((task) => ({ task, at: instant(lastActivityAt(task)) }))
    .sort(
      (a, b) =>
        (a.at === null ? 1 : 0) - (b.at === null ? 1 : 0) ||
        (b.at ?? 0) - (a.at ?? 0) ||
        Number(b.task.id) - Number(a.task.id),
    )
    .map(({ task }) => task);
}
