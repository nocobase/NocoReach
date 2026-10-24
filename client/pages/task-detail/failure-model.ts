import { $t, $legacyText } from '#i18n';
import {
  AGENT_FAILURE_GROUP,
  SHARED_FAILURE_GROUPS,
  failureGroup,
  type FailureGroup,
} from '../../../shared/run-failure.js';
import type { Run, TaskData } from '../task-execution-types';

export type Failure = {
  /** Why the run stopped, in the owner's words. */
  why: string;
  /** What to do the first time. */
  next: string;
  /** What to fix before trying again, once the same cause stopped the step twice in a row. */
  fix?: string;
  group: FailureGroup;
  /** Every Agent on the computer meets it alike, so switching Agent does not help. */
  shared: boolean;
};

const TOOL_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
  pi: 'Pi',
};

// Why a run stopped, in the owner's words; the raw error and the transcript stay in Technical details.
const runErrors = (): Record<string, string> => ({
  interrupted_or_unknown: $t('taskDetail.runInterruptedResultUnknown'),
  context_changed: $t('taskDetail.taskChangedBeforeRun'),
  cancelled: $t('taskDetail.stoppedCheckChangesAlreadyPushed'),
  no_changes: $t('taskDetail.agentNotChangeFiles'),
  no_repo: $t('taskDetail.noWebsiteSourceRepositoryConnected'),
  revert_failed: $t('taskDetail.revertPrNotOpened'),
  replaced_by_manual: $t('taskDetail.switchedDoing'),
});

type Copy = { why: string; next: string; fix: string };
const copy = (why: string, next: string, fix: string): Copy => ({
  why,
  next,
  fix,
});

// Each group's reason, what to do the first time and what to fix first (2026-10-24 user decision: say whose problem
// it is; after the same cause twice, stop suggesting Try again).
function groupCopy(group: FailureGroup): Copy | undefined {
  switch (group) {
    case 'disconnected':
      return copy(
        $t('taskDetail.failureDisconnected'),
        $t('taskDetail.failureDisconnectedNext'),
        $t('taskDetail.failureDisconnectedFix'),
      );
    case 'toolLogin':
      return copy(
        $t('taskDetail.failureToolLogin'),
        $t('taskDetail.failureToolLoginNext'),
        $t('taskDetail.failureToolLoginFix'),
      );
    case 'quota':
      return copy(
        $t('taskDetail.failureQuota'),
        $t('taskDetail.failureQuotaNext'),
        $t('taskDetail.failureQuotaFix'),
      );
    case 'network':
      return copy(
        $t('taskDetail.failureNetwork'),
        $t('taskDetail.failureNetworkNext'),
        $t('taskDetail.failureNetworkFix'),
      );
    case 'setup':
      return copy(
        $t('taskDetail.failureSetup'),
        $t('taskDetail.failureSetupNext'),
        $t('taskDetail.failureSetupFix'),
      );
    case 'model':
      return copy(
        $t('taskDetail.failureModel'),
        $t('taskDetail.failureModelNext'),
        $t('taskDetail.failureModelFix'),
      );
    case 'notPicked':
      return copy(
        $t('taskDetail.failureNotPicked'),
        $t('taskDetail.failureNotPickedNext'),
        $t('taskDetail.failureNotPickedFix'),
      );
    case 'missingTool':
      return copy(
        $t('taskDetail.failureMissingTool'),
        $t('taskDetail.failureMissingToolNext'),
        $t('taskDetail.failureMissingToolFix'),
      );
    case 'toolSignIn':
      return copy(
        $t('taskDetail.failureToolSignIn'),
        $t('taskDetail.failureToolSignInNext'),
        $t('taskDetail.failureToolSignInFix'),
      );
    case 'stuck':
      return copy(
        $t('taskDetail.failureStuck'),
        $t('taskDetail.failureStuckNext'),
        $t('taskDetail.failureStuckFix'),
      );
    case 'tooLong':
      return copy(
        $t('taskDetail.failureTooLong'),
        $t('taskDetail.failureTooLongNext'),
        $t('taskDetail.failureTooLongFix'),
      );
    case 'invalid':
      return copy(
        $t('taskDetail.failureInvalidResult'),
        $t('taskDetail.failureInvalidResultNext'),
        $t('taskDetail.failureInvalidResultFix'),
      );
    default:
      return undefined;
  }
}

/** The computer (unless this reader may not see it) and the coding tool of the run's latest attempt. */
export function failedOn(run: Run, data: Pick<TaskData, 'execution'>) {
  const x =
    data.execution?.runId === run.id
      ? data.execution.run.executions?.at(-1)
      : undefined;
  return {
    machine: x && !x.machineHidden ? x.runnerName || '' : '',
    tool: x?.tool ? TOOL_NAMES[x.tool] || x.tool : '',
  };
}

// The wording that names the computer or the tool when the run says which; otherwise the general wording.
function named(
  group: FailureGroup,
  base: Copy,
  { machine, tool }: { machine: string; tool: string },
): Copy {
  if (group === 'toolLogin' && (machine || tool))
    return {
      why:
        machine && tool
          ? $t('taskDetail.failureToolLoginOn', { 0: machine, 1: tool })
          : tool
            ? $t('taskDetail.failureToolLoginTool', { 0: tool })
            : $t('taskDetail.failureToolLoginMachine', { 0: machine }),
      next: tool
        ? $t('taskDetail.failureToolLoginToolNext', { 0: tool })
        : base.next,
      fix: tool
        ? $t('taskDetail.failureToolLoginToolFix', { 0: tool })
        : base.fix,
    };
  if (group === 'quota' && tool)
    return { ...base, why: $t('taskDetail.failureQuotaTool', { 0: tool }) };
  if (!machine) return base;
  const on: Partial<Record<FailureGroup, () => string>> = {
    disconnected: () => $t('taskDetail.failureDisconnectedOn', { 0: machine }),
    network: () => $t('taskDetail.failureNetworkOn', { 0: machine }),
    setup: () => $t('taskDetail.failureSetupOn', { 0: machine }),
    missingTool: () => $t('taskDetail.failureMissingToolOn', { 0: machine }),
    toolSignIn: () => $t('taskDetail.failureToolSignInOn', { 0: machine }),
  };
  const why = on[group];
  return why ? { ...base, why: why() } : base;
}

/** Sentences in a row: a space between them, none after a Chinese or Japanese full stop. */
export function sentences(...parts: (string | false | undefined)[]) {
  return parts
    .filter((p): p is string => Boolean(p))
    .reduce(
      (text, part) =>
        !text
          ? part
          : /[。！？：]$/u.test(text)
            ? text + part
            : `${text} ${part}`,
      '',
    );
}

/** What the Agent itself said, when it said more than a code. */
function agentSaid(run: Run) {
  return run.errorDetail &&
    run.errorDetail !== run.error &&
    !/^[a-z_]+$/.test(run.errorDetail)
    ? $legacyText(run.errorDetail)
    : '';
}

/** The run's failure group: the official reason reaches the task's latest run with its execution. */
export function groupOf(run: Run, data: Pick<TaskData, 'execution'>) {
  return failureGroup(
    run,
    data.execution?.runId === run.id
      ? data.execution.run.failureReason
      : undefined,
  );
}

/**
 * What went wrong with `run` and what to do: NocoReach's restart, the official reason, the Agent's own code, then
 * NocoReach's codes, then whatever the Agent said; never a bare code.
 */
export function failureOf(
  run: Run,
  data: Pick<TaskData, 'execution'>,
): Failure {
  const group = groupOf(run, data),
    said = agentSaid(run);
  // NocoReach itself restarted while the run worked (every deploy restarts it): not the computer's doing (2026-10-22
  // user report). The step usually started again by itself; this shows when it could not.
  if (group === 'restart')
    return {
      why: $t('taskDetail.failureRestart'),
      next: $t('taskDetail.failureRestartNext'),
      group,
      shared: false,
    };
  const base = groupCopy(group);
  if (base) {
    const c = named(group, base, failedOn(run, data));
    // An Agent that reported the computer's problem itself says which tool it missed.
    const why =
      said && AGENT_FAILURE_GROUP[run.error || '']
        ? sentences(c.why, $t('taskDetail.failureAgentSaid', { 0: said }))
        : c.why;
    return { ...c, why, group, shared: SHARED_FAILURE_GROUPS.has(group) };
  }
  const next = $t('taskDetail.failureUnknownNext'),
    known = runErrors()[run.error || ''];
  if (known) return { why: known, next, group, shared: false };
  return {
    why: said
      ? $t('taskDetail.failureAgentSaid', { 0: said })
      : $t('taskDetail.failureUnknown'),
    next,
    group,
    shared: false,
  };
}

/**
 * How often the step failed in a row and how often for the same cause as the latest run. Runs a NocoReach restart
 * interrupted say nothing about the step, so both counts pass over them; a cause the task gives no reason for
 * (`task`) never counts as the same.
 */
export function failureStreak(
  stageRuns: Run[],
  group: FailureGroup,
  data: Pick<TaskData, 'execution'>,
) {
  const runs = stageRuns.filter((r) => !r.restartedAt);
  const streak = runs.findIndex((r) => r.status !== 'failed');
  const failures = group === 'restart' ? 0 : streak < 0 ? runs.length : streak;
  let same = 0;
  if (group !== 'restart' && group !== 'task')
    for (const r of runs.slice(0, failures)) {
      if (groupOf(r, data) !== group) break;
      same++;
    }
  return { failures, same };
}
