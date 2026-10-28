import { effectItems, effectPages } from './effect-model';
import type { Work } from './task-execution-types';

// The board's Done column (2026-10-28 user request, as Linear's "Completed issues: past week" and Jira's "hide completed
// issues older than"): only tasks still being watched and tasks that finished in the last 7 days, so the column does not
// grow without end. Older ones are a click away in the Done list. A task's age is when it finished, not when it was last
// touched: a comment on an old task does not bring it back.

export const RECENT_DONE_DAYS = 7;
const DAY = 86_400_000;

/** Live, with a page whose effect is still to be read at a checkpoint. */
export const isWatching = (w?: Partial<Work>) =>
  Boolean(
    w?.observeFrom &&
    effectPages(w).length &&
    effectItems(w).some((i) => !i.result),
  );

/** What happens to a task after it is finished without finishing it again. */
const AFTER_DONE = new Set([
  'comment',
  'setOwner',
  'setCollaborators',
  'takeOwnership',
  'linkPage',
  'linkContent',
  'setAgent',
  'archiveTask',
  'unarchiveTask',
  'retitle',
]);

/**
 * When a finished task finished: its last effect checkpoint once it was watched, the day it went live when it had no
 * page to watch, otherwise the last change to its work (dragging it to Done counts; reordering within Done does not).
 */
export function finishedAt(
  w?: Partial<Work>,
  updatedAt?: string,
): string | undefined {
  if (w?.observeFrom) {
    const read = effectItems(w)
      .map((i) => i.result?.computedAt)
      .filter((at): at is string => Boolean(at))
      .sort();
    return read.at(-1) || w.observeFrom;
  }
  const history = w?.history || [];
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    if (AFTER_DONE.has(e.action)) continue;
    if (e.action === 'moveWork' && e.previous === 'done' && e.note === 'done')
      continue;
    return e.at;
  }
  return updatedAt;
}

/** Whether a finished task stays on the board: watched, or finished in the last week. */
export function onBoard(
  w: Partial<Work> | undefined,
  updatedAt: string | undefined,
  now = Date.now(),
): boolean {
  if (isWatching(w)) return true;
  const at = Date.parse(finishedAt(w, updatedAt) || '');
  return Number.isFinite(at) && now - at <= RECENT_DONE_DAYS * DAY;
}
