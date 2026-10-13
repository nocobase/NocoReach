import type { DatabaseManager } from '@nocobase/db';
import type { JobExecutor, ScheduleExecutor } from '@nocobase/jobs';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
  type LifecycleLogger,
} from '@nocobase/lifecycle';
import { createLifecycleJobs } from '@nocobase/lifecycle/jobs';

export const NOCOREACH_LIFECYCLE_SCOPE = '@nocoreach/lifecycle';
export const NOCOREACH_LIFECYCLE_COLLECTIONS = {
  transitions: 'nrLifecycleTransitions',
  effectRuns: 'nrLifecycleEffectRuns',
} as const;

export interface NocoReachLifecyclesOptions {
  readonly database: DatabaseManager;
  readonly jobs: JobExecutor;
  readonly schedule: ScheduleExecutor;
  readonly logger: LifecycleLogger;
  readonly onSweep?: () => Promise<void>;
  readonly sweepEveryMs?: number;
  readonly leaseMs?: number;
  readonly clock?: () => Date;
}

export interface NocoReachLifecycles {
  readonly runtime: LifecycleRuntime;
  /** Register every business definition before starting recovery and consumption. */
  start(): Promise<void>;
  shutdown(): Promise<void>;
}

/** One application-owned runtime, backed by the same database as its business records. */
export function createNocoReachLifecycles(
  options: NocoReachLifecyclesOptions,
): NocoReachLifecycles {
  const dispatcher = createLifecycleJobs({
    jobs: options.jobs,
    schedule: options.schedule,
    jobName: 'nocoreach/lifecycle-effect',
    sweepName: 'nocoreach/lifecycle-sweep',
    sweepEveryMs: options.sweepEveryMs,
    onSweep: options.onSweep,
    logger: options.logger,
    clock: options.clock,
  });
  const runtime = new LifecycleRuntime({
    store: createRepositoryLifecycleStore(options.database, {
      collections: NOCOREACH_LIFECYCLE_COLLECTIONS,
    }),
    dispatcher,
    logger: options.logger,
    clock: options.clock,
    // No heartbeat is provided by lifecycle beta.1. Each business effect must
    // have a shorter timeout and fence its external submission independently.
    leaseMs: options.leaseMs ?? 15 * 60_000,
  });
  return {
    runtime,
    start: () => dispatcher.start(runtime),
    shutdown: () => dispatcher.shutdown(),
  };
}
