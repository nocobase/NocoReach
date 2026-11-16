// Changing the playbook of a started task (2026-11-11 user decision, after T-78 was started with Content topic and
// outline when it needed Keyword research): while no Agent run is queued or running and nothing has been published,
// the task starts again from the first step of the playbook chosen. The brief, pages, attachments, owner, Agent and
// the messages in Activity stay; the earlier playbook's results, change requests, versions and runs do not carry over
// and stay in Activity. The server (`restartWithPlaybook` in server/nocoreach/execution/service.ts) and the task page
// share these rules.
//
// Each start is an attempt: `work.attempt` counts the changes (none before the first). Runs, reviews and versions keep
// the attempt they belong to, and whatever reads them by step key or position reads the current attempt only, since
// built-in playbooks share step keys (`analyze` and `accept` in every document playbook, `build` and `review` in every
// page playbook).

/** The history event a change of playbook records. */
export const RESTART_ACTION = 'restartWithPlaybook';

type Attempted = { attempt?: unknown } | null | undefined;

/** The attempt a task, run, review or version belongs to; records from before the first change have none (0). */
export const attemptOf = (x: Attempted): number =>
  typeof x?.attempt === 'number' &&
  Number.isSafeInteger(x.attempt) &&
  x.attempt > 0
    ? x.attempt
    : 0;

/** Whether a run, review or version belongs to the task's current attempt. */
export const sameAttempt = (x: Attempted, w: Attempted) =>
  attemptOf(x) === attemptOf(w);

/** The attempt to keep on a new run, review or version: none for the first. */
export const attemptField = (w: Attempted): { attempt?: number } =>
  attemptOf(w) ? { attempt: attemptOf(w) } : {};

export type PlaybookChangeWork = {
  stage?: string;
  flow?: { stages: readonly { kind: string }[] } | null;
  stageIndex?: number;
  cancelledAt?: string;
  archivedAt?: string;
  release?: unknown;
};
export type PlaybookChangeBlock =
  'notStarted' | 'closed' | 'running' | 'published' | 'done';

/**
 * Why the playbook cannot change now, or undefined when it can: not started yet (the start card chooses it), closed,
 * an Agent run queued or running (stop it first), published (at Publish or after, or with a release), or finished.
 */
export function playbookChangeBlock(
  w: PlaybookChangeWork | null | undefined,
  runs: readonly { status: string }[],
): PlaybookChangeBlock | undefined {
  if (!w?.flow || (w.stage !== 'flow' && w.stage !== 'done'))
    return 'notStarted';
  if (w.cancelledAt || w.archivedAt) return 'closed';
  if (runs.some((r) => r.status === 'queued' || r.status === 'running'))
    return 'running';
  const kind = w.flow.stages[w.stageIndex ?? 0]?.kind;
  if (
    w.release ||
    kind === 'release' ||
    kind === 'publish' ||
    kind === 'observe'
  )
    return 'published';
  if (w.stage !== 'flow') return 'done';
  return undefined;
}

type HistoryEvent = { action?: string };

/** The history since the playbook last changed: the current attempt's events, or all of them before any change. */
export function sinceRestart<T extends HistoryEvent>(
  history: readonly T[],
): T[] {
  const i = history.map((e) => e?.action).lastIndexOf(RESTART_ACTION);
  return i < 0 ? [...history] : history.slice(i + 1);
}

/** What a change of playbook records of the playbook it replaced, so Activity names the earlier steps by their names. */
export type ReplacedPlaybook = {
  id: string;
  name: string;
  system?: boolean;
  edited?: boolean;
  version?: number;
  attempt: number;
  stages: { key: string; name: string; kind: string }[];
};
