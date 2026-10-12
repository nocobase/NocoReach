import type { DatabaseConnection } from '@nocobase/db';
import {
  defineLifecycle,
  LifecycleError,
  type JsonObject,
  type LifecycleRecord,
  type LifecycleRuntime,
  type TransitionDefinition,
} from '@nocobase/lifecycle';

import { systemMessageText } from '../../../shared/i18n/messages.js';
import { fail, projectWork, type Work } from './model.js';

export const TASK_ENGINE = 'lifecycle-v1';
export const TASK_LIFECYCLE = 'nocoreach.task.v1';

export type TaskState =
  | 'idle'
  | 'ready'
  | 'queued'
  | 'running'
  | 'review'
  | 'merging'
  | 'verifying'
  | 'release'
  | 'completed'
  | 'cancelled';

export interface LifecycleTask extends LifecycleRecord {
  readonly projectId: string;
  readonly evidence?: Record<string, unknown>;
  readonly executionEngine?: string | null;
  readonly executionState?: TaskState | null;
  readonly lifecycleVersion?: number;
}

interface TaskTypes {
  record: LifecycleTask;
  state: TaskState;
}

export interface TaskMutation {
  readonly command: string;
  readonly actor: string;
  readonly requestId?: string;
  readonly system?: boolean;
}

const activeStates = [
  'ready',
  'queued',
  'running',
  'review',
  'merging',
  'verifying',
  'release',
] as const;
const nextStates = [...activeStates, 'completed'] as const;
const stateSet = new Set<string>(['idle', ...nextStates, 'cancelled']);

/** Execution state deliberately excludes the user-controlled board position. */
export function taskState(work: Work): TaskState {
  if (work.cancelledAt) return 'cancelled';
  if (work.stage === 'done' || work.observeFrom) return 'completed';
  if (!work.flow) return 'idle';
  const stage = work.flow.stages[work.stageIndex ?? 0];
  if (!stage || stage.kind === 'observe') return 'completed';
  if (stage.kind === 'review') return 'review';
  if (stage.kind === 'publish') return 'release';
  if (stage.kind === 'release') {
    if (work.release?.state === 'merging') return 'merging';
    if (work.release?.state === 'verifying') return 'verifying';
    return 'release';
  }
  if (work.latestRun?.status === 'queued') return 'queued';
  if (work.latestRun?.status === 'running') return 'running';
  return 'ready';
}

function destination(input: JsonObject): TaskState {
  const state = input.nextState;
  if (typeof state !== 'string' || !stateSet.has(state))
    throw new Error('Invalid task lifecycle destination');
  return state as TaskState;
}

function transition(
  from: TransitionDefinition<TaskTypes>['from'],
  to: readonly TaskState[],
  manual = true,
): TransitionDefinition<TaskTypes> {
  return {
    from,
    to,
    manual,
    route: ({ input }) => destination(input),
    validate: (input) =>
      typeof input.nextState === 'string' &&
      to.some((state) => state === input.nextState)
        ? null
        : 'The command cannot reach this task state.',
    guard: ({ record, actor, input }) =>
      record.executionEngine === TASK_ENGINE &&
      String(record.projectId) === input.projectId &&
      (manual ? !actor.system : actor.system === true),
  };
}

export const taskLifecycle = defineLifecycle<TaskTypes>({
  name: TASK_LIFECYCLE,
  collection: 'nrTasks',
  stateField: 'executionState',
  changedAtField: 'executionStateChangedAt',
  versionField: 'lifecycleVersion',
  initial: 'idle',
  states: [
    'idle',
    'ready',
    'queued',
    'running',
    'review',
    'merging',
    'verifying',
    'release',
    { name: 'completed', final: true },
    { name: 'cancelled', final: true },
  ],
  transitions: {
    start: transition('idle', nextStates),
    approve: transition('review', nextStates),
    requestChanges: transition('review', ['ready', 'queued']),
    recordManual: transition(['ready', 'queued'], nextStates),
    retry: transition('ready', ['ready', 'queued']),
    retryRelease: transition('release', ['merging']),
    publish: transition('release', nextStates),
    markMerged: transition(['merging', 'release'], ['verifying', 'release']),
    waitLonger: transition('release', ['verifying']),
    confirmLive: transition(['verifying', 'release'], ['completed']),
    cancel: transition('*', ['cancelled']),
    claim: transition('queued', ['running'], false),
    result: transition(['queued', 'running'], nextStates, false),
    mergeResult: transition('merging', ['verifying', 'release'], false),
    live: transition('verifying', ['completed'], false),
    releaseFailed: transition('verifying', ['release'], false),
  },
});

const commands: Readonly<Record<string, string>> = {
  startTask: 'start',
  approveStage: 'approve',
  requestStageChanges: 'requestChanges',
  recordManual: 'recordManual',
  retryStage: 'retry',
  retryMerge: 'retryRelease',
  markMerged: 'markMerged',
  waitLonger: 'waitLonger',
  confirmLive: 'confirmLive',
  confirmPublish: 'publish',
  cancelTask: 'cancel',
  runStarted: 'claim',
  runSucceeded: 'result',
  runFailed: 'result',
  merged: 'mergeResult',
  live: 'live',
  notSeen: 'releaseFailed',
};

/**
 * The existing business command validates ownership, immutable artifacts, PR head,
 * revision and request fingerprint, and prepares its related writes in one outer
 * transaction. This gate then commits the declared state transition in that same
 * transaction. A refusal rolls back the command, including official Agent enqueue.
 */
export class TaskLifecycle {
  constructor(readonly runtime: LifecycleRuntime) {
    runtime.register(taskLifecycle);
  }

  /** Adopt only an idle task at its first explicit start; never replay an old flow. */
  async adopt(
    task: LifecycleTask,
    connection: DatabaseConnection,
  ): Promise<void> {
    if (task.executionEngine === TASK_ENGINE) return;
    if (task.executionEngine)
      return fail(
        systemMessageText('taskExecution.workflowMovedAnotherStageRefresh'),
        409,
      );
    const work = projectWork(task);
    if (
      work.stage !== 'plan' ||
      work.flow ||
      work.plan ||
      work.cancelledAt ||
      work.archivedAt
    )
      return;
    const fields = {
      executionEngine: TASK_ENGINE,
      executionState: 'idle' as const,
      executionStateChangedAt: new Date(),
      lifecycleVersion: 0,
    };
    const updated = await connection.repository('nrTasks').updateMany({
      filter: (f) =>
        f.and([
          f.number('id').eq(String(task.id)),
          f.string('projectId').eq(String(task.projectId)),
          f.string('executionEngine').empty(),
          f.string('executionState').empty(),
          f.number('lifecycleVersion').eq(0),
        ]),
      values: fields,
    });
    if (updated.updatedCount !== 1)
      return fail(
        systemMessageText('taskExecution.workflowMovedAnotherStageRefresh'),
        409,
      );
    Object.assign(task, fields);
  }

  async apply(
    task: LifecycleTask,
    work: Work,
    connection: DatabaseConnection,
    mutation?: TaskMutation,
  ): Promise<void> {
    if (task.executionEngine !== TASK_ENGINE) return;
    const previous = projectWork(task);
    if (task.executionState !== taskState(previous))
      return fail(
        systemMessageText('taskExecution.workflowMovedAnotherStageRefresh'),
        409,
      );
    const next = taskState(work);
    const stateChanged = next !== task.executionState;
    const stageChanged = previous.stageIndex !== work.stageIndex;
    // Comments, board moves, saved drafts and observation results do not re-enter
    // a state, restart its clock or turn a completed execution into an active one.
    if (!stateChanged && !stageChanged) return;
    const event: unknown = work.history.slice(previous.history.length).at(-1);
    const action =
      typeof event === 'object' && event !== null && 'action' in event
        ? event.action
        : undefined;
    const actor =
      typeof event === 'object' && event !== null && 'actor' in event
        ? event.actor
        : undefined;
    const change: TaskMutation = mutation ?? {
      command: typeof action === 'string' ? action : '',
      actor: typeof actor === 'string' ? actor : 'system',
      system: true,
    };
    const name = commands[change.command];
    if (!name)
      return fail(
        systemMessageText('taskExecution.actionNotSupportedCurrentStage'),
        409,
      );
    try {
      const result = await this.runtime.fire(TASK_LIFECYCLE, task.id, name, {
        actor: { id: change.actor, ...(change.system ? { system: true } : {}) },
        manual: !change.system,
        requestId: change.requestId,
        expect: { version: task.lifecycleVersion ?? 0 },
        transaction: connection,
        input: {
          projectId: String(task.projectId),
          command: change.command,
          nextState: next,
          stageKey: work.flow?.stages[work.stageIndex ?? 0]?.key ?? null,
          stageIndex: work.stageIndex ?? null,
          runId: work.latestRun?.id ?? null,
        },
      });
      Object.assign(task, {
        executionState: result.record.executionState,
        executionStateChangedAt: result.record.executionStateChangedAt,
        lifecycleVersion: result.record.lifecycleVersion,
      });
    } catch (error) {
      if (error instanceof LifecycleError)
        return fail(
          systemMessageText('taskExecution.taskUpdatedRefreshBeforeSaving'),
          409,
        );
      throw error;
    }
  }

  describe() {
    return this.runtime.describe(TASK_LIFECYCLE);
  }
}
