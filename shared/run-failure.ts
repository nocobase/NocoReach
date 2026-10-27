// Why a task run failed, grouped by what its owner can do about it. The task page's failure card and the Agent page's
// Tasks row read the same groups.

export type FailureGroup =
  | 'restart'
  | 'disconnected'
  | 'toolLogin'
  | 'quota'
  | 'network'
  | 'setup'
  | 'model'
  | 'notPicked'
  | 'missingTool'
  | 'toolSignIn'
  | 'stuck'
  | 'tooLong'
  | 'invalid'
  | 'task';

/** The Agents plugin's failure reasons (`failureReason` of an official run). */
export const OFFICIAL_FAILURE_GROUP: Record<string, FailureGroup> = {
  runnerOffline: 'disconnected',
  leaseExpired: 'disconnected',
  startTimeout: 'disconnected',
  runnerUpgrade: 'disconnected',
  toolAuth: 'toolLogin',
  toolQuota: 'quota',
  toolRateLimit: 'quota',
  toolNetwork: 'network',
  prepareNetwork: 'network',
  idleTimeout: 'stuck',
  stepLimit: 'stuck',
  toolProcess: 'stuck',
  contextOverflow: 'tooLong',
  modelUnavailable: 'model',
  queuedExpired: 'notPicked',
  policyRefused: 'notPicked',
  setupFailed: 'setup',
  cliUnavailable: 'setup',
  checkoutFailed: 'setup',
  repoAccessDenied: 'setup',
  repoAccessUnavailable: 'setup',
  workspaceBusy: 'setup',
  runnerDiskFull: 'setup',
};

/**
 * The codes an Agent reports in `error` when the computer it runs on keeps it from doing a step (the result rules in
 * server/nocoreach/execution/agent-result.ts list them). The official run then completed, so it has no failure reason.
 */
export const AGENT_FAILURE_GROUP: Record<string, FailureGroup> = {
  missing_tool: 'missingTool',
  tool_signed_out: 'toolSignIn',
  quota_exhausted: 'quota',
};

/** Failures caused by the computer the Agent runs on, not by the task. */
export const COMPUTER_FAILURE_GROUPS: ReadonlySet<FailureGroup> = new Set([
  'disconnected',
  'toolLogin',
  'quota',
  'network',
  'setup',
  'model',
  'notPicked',
  'missingTool',
  'toolSignIn',
]);

/**
 * Failures every Agent on that computer meets alike: the tools installed on it, their sign-ins, its network and its
 * setup (2026-10-24 user decision: Claude Code and Codex on one computer share these, so switching Agent does not help
 * and is not offered). A coding tool's own sign-in, quota or model is not shared.
 */
export const SHARED_FAILURE_GROUPS: ReadonlySet<FailureGroup> = new Set([
  'missingTool',
  'toolSignIn',
  'network',
  'setup',
]);

/** What a task run records about its failure. */
export interface FailedRun {
  restartedAt?: string;
  error?: string;
  failureReason?: string | null;
}

/**
 * The group of a failed run: NocoReach's restart first, then the official reason (stored on the run, or read from the
 * official run for the latest one), then the Agent's own code. Anything else is the task's.
 */
export function failureGroup(
  run: FailedRun,
  officialReason?: string | null,
): FailureGroup {
  if (run.restartedAt) return 'restart';
  const reason = run.failureReason || officialReason;
  if (reason && OFFICIAL_FAILURE_GROUP[reason])
    return OFFICIAL_FAILURE_GROUP[reason];
  if (run.error && AGENT_FAILURE_GROUP[run.error])
    return AGENT_FAILURE_GROUP[run.error];
  if (run.error === 'invalid_agent_result') return 'invalid';
  return 'task';
}
