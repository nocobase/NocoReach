// Reopening a closed task (2026-10-29 user decision: every closed task can be reopened, and it resumes at the step where
// it was closed with everything done or approved kept). The task page says where a closed task goes back to and the
// server moves it there with the same rules, so the card never promises what reopening does not do.
//
// A task closed before it started, after it finished or while it was live and being watched (Close task archived it)
// keeps its place. A task stopped halfway (Close task cancelled it) goes back to the step it stood at, except:
// - a change the closing withdrew (its unmerged pull request closed) goes back to the Agent step that made it, which
//   waits to be started again and then submits the change anew;
// - an Agent step whose run the closing stopped waits at that step to be started again;
// - a publish the closing stopped before the change was merged goes back to the review before it, so publishing waits
//   for a new approval. A change already merged or live never goes back.
// While the executor is still stopping (a run the closing asked to stop, or the pull request being closed), the task
// is reopened once that has finished.

type ReopenStage = { key: string; kind: string; name?: string };
export type ReopenWork = {
  stage?: string;
  stageIndex?: number;
  cancelledAt?: string;
  archivedAt?: string;
  flow?: { stages: ReopenStage[] };
  results?: ({ pr?: { number: number } } | null)[];
  release?: { state: string; mergedAt?: string; article?: unknown };
  prClose?: { number: number; state: 'closing' | 'closed' | 'failed' };
};
export type ReopenRun = {
  status: string;
  mode?: string;
  stepId?: string;
  planVersion?: number;
  createdAt?: string;
  endedAt?: string;
  error?: string;
};
export type Reopening = {
  /** The step it goes back to, as an index into the playbook's steps; left out when the task keeps its place. */
  stageIndex?: number;
  /** Why the Agent step it goes back to waits to be started again. */
  restart?: 'stopped' | 'withdrawn';
  /** Closing the pull request had not started yet: it is dropped and the change stays open. */
  keepsChange?: boolean;
  /** The executor is still stopping or the pull request is being closed: reopen once it has finished. */
  wait?: boolean;
};

const latestRun = (runs: readonly ReopenRun[], key: string) =>
  runs
    .filter((r) => r.stepId === key && (r.planVersion ?? 0) === 0)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];

export function reopening(
  w: ReopenWork,
  runs: readonly ReopenRun[],
): Reopening {
  const stages = w.flow?.stages;
  if (!w.cancelledAt || w.stage !== 'flow' || !stages?.length) return {};
  if (runs.some((r) => r.status === 'running')) return { wait: true };
  const at = w.stageIndex ?? 0,
    keepsChange = runs.some((r) => r.mode === 'close' && r.status === 'queued');
  // The pull request the closing closed, or tried to: the Agent step that opened it submits the change again.
  const withdrawn = w.prClose && !keepsChange ? w.prClose.number : undefined;
  if (withdrawn !== undefined) {
    for (let i = Math.min(at, stages.length - 1); i >= 0; i--)
      if (
        stages[i]?.kind === 'agent' &&
        w.results?.[i]?.pr?.number === withdrawn
      )
        return { stageIndex: i, restart: 'withdrawn' };
  }
  const stage = stages[at];
  if (stage?.kind === 'agent') {
    // A run the closing dropped or stopped ended when the task was closed or after it; one that failed earlier keeps
    // its own card.
    const run = latestRun(runs, stage.key);
    const stopped =
      run?.error === 'cancelled' &&
      String(run.endedAt || '') >= String(w.cancelledAt);
    return {
      stageIndex: at,
      ...(stopped ? { restart: 'stopped' as const } : {}),
      ...(keepsChange ? { keepsChange } : {}),
    };
  }
  if (
    stage?.kind === 'release' &&
    w.release?.state === 'merging' &&
    !w.release.mergedAt &&
    stages[at - 1]?.kind === 'review'
  )
    return { stageIndex: at - 1, ...(keepsChange ? { keepsChange } : {}) };
  return { stageIndex: at, ...(keepsChange ? { keepsChange } : {}) };
}
