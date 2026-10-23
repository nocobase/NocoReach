// Every deploy restarts NocoReach, and a Runner cannot renew its lease while the application is down: the Agents
// sweep of the new instance then takes the run back as lost, and since task runs have one attempt the run fails
// (2026-10-22 user report: eight deploys in 90 minutes failed a task three times, each blamed on a healthy Mac).
// These helpers tell such a failure apart from a computer that went away, from the times this application started.

/** Where the times this application started are kept (`nrSnapshots`), oldest first. */
export const STARTS_KEY = 'nr-app-starts';
const KEEP_STARTS = 50;
/** Failures meaning the Runner and the application lost each other, not that the work itself went wrong. */
const LOST = new Set(['runnerOffline', 'leaseExpired', 'startTimeout']);
/**
 * How long after a start a lost run is still the restart's doing. The Agents sweep runs every 30 s and takes back a
 * run whose 45 s lease lapsed, or whose Runner was not heard from for 150 s, in its first passes after the start; a
 * healthy Runner renews within 15 s once the application answers again. Five minutes also covers a slow start.
 */
export const RESTART_WINDOW_MS = 5 * 60_000;

/** The list of starts with `at` added once, keeping the latest ones. */
export function withStart(starts: readonly string[], at: string): string[] {
  return [...new Set([...starts, at])].sort().slice(-KEEP_STARTS);
}

interface LostRun {
  readonly status: string;
  readonly failureReason?: string | null;
  readonly dispatchedAt?: string | null;
  readonly finishedAt?: string | null;
  readonly executions?: readonly { readonly dispatchedAt?: string | null }[];
}

/**
 * The start that interrupted `run`, if a restart did: the run lost its Runner (offline, lease lapsed or never
 * started), an earlier instance handed it out, and it failed shortly after this application started again.
 */
export function restartOf(
  run: LostRun,
  starts: readonly string[],
): string | undefined {
  if (run.status !== 'failed' || !LOST.has(run.failureReason || ''))
    return undefined;
  const handedOut = Date.parse(
    run.executions?.at(-1)?.dispatchedAt || run.dispatchedAt || '',
  );
  const failed = Date.parse(run.finishedAt || '');
  if (Number.isNaN(handedOut) || Number.isNaN(failed)) return undefined;
  return [...starts]
    .sort()
    .reverse()
    .find((start) => {
      const at = Date.parse(start);
      return at > handedOut && at <= failed && failed - at <= RESTART_WINDOW_MS;
    });
}
