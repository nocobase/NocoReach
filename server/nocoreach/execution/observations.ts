import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  defineLifecycle,
  type JsonObject,
  LifecycleError,
  type LifecycleRecord,
  type LifecycleRuntime,
  SYSTEM_ACTOR,
} from '@nocobase/lifecycle';

import { systemMessageText } from '../../../shared/i18n/messages.js';
import {
  CHECKPOINTS,
  compare,
  dateOf,
  type EffectResult,
  pageKey,
  type Partition,
  shift,
  windows,
} from './effect.js';
import type { Work } from './model.js';

export const TASK_OBSERVATIONS_COLLECTION = 'nrTaskObservations';
export const TASK_OBSERVATIONS_LIFECYCLE = 'nocoreach.taskObservations';

export interface TaskObservationTask {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly work: Work;
}

export interface TaskObservationPage {
  readonly afterId?: string;
  readonly projectId?: string;
  readonly limit: number;
}

/** Adapts existing task projections and metrics without introducing a second Work format. */
export interface TaskObservationHost {
  pages(work: Work): string[];
  /** Ascending numeric task IDs, with an exclusive cursor and a database LIMIT. */
  tasks(
    page: TaskObservationPage,
    connection?: DatabaseConnection,
  ): Promise<TaskObservationTask[]>;
  task(
    projectId: string,
    taskId: string,
    connection: DatabaseConnection,
  ): Promise<TaskObservationTask | undefined>;
  /** Minimum available day of every configured source; empty if any has no data. */
  dataEnd(projectId: string): Promise<string>;
  partitions(
    projectId: string,
    start: string,
    end: string,
  ): Promise<Partition[]>;
  /**
   * Merge into the latest Work under the task lock, once per result.day, using
   * this connection. The result and the completed child must commit together.
   */
  saveResult(
    task: TaskObservationTask,
    result: EffectResult,
    connection: DatabaseConnection,
  ): Promise<void>;
}

export type TaskObservationStatus = 'pending' | 'completed' | 'cancelled';

export interface TaskObservationRecord extends LifecycleRecord {
  readonly observationKey: string;
  readonly taskId: string | number;
  readonly projectId: string;
  readonly day: number;
  readonly observeFrom: string | Date;
  readonly dueAt: string | Date;
  readonly status: TaskObservationStatus;
  readonly statusChangedAt: string | Date;
  readonly lifecycleVersion: number;
  readonly result: EffectResult | null;
  readonly completedAt: string | Date | null;
  readonly reason: string | null;
}

export interface TaskObservationsOptions {
  readonly clock?: () => Date;
  readonly retryAfterMs?: number;
}

export interface TaskObservationSweep {
  readonly scanned: number;
  completed: number;
  deferred: number;
  cancelled: number;
  competed: number;
  failed: number;
}

type ObservationTypes = {
  record: TaskObservationRecord;
  state: TaskObservationStatus;
  services: { connection: DatabaseConnection };
};

function transactionConnection(handle: unknown): DatabaseConnection {
  // The public repository lifecycle store documents this handle as its active
  // DatabaseConnection. Reject a different store rather than read outside it.
  if (
    !handle ||
    typeof handle !== 'object' ||
    !('repository' in handle) ||
    typeof handle.repository !== 'function'
  ) {
    throw new Error('Task observations require a repository lifecycle store');
  }
  return handle as DatabaseConnection;
}

function validLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError('Observation batch size must be between 1 and 500');
  }
  return limit;
}

function publicationMatches(
  task: TaskObservationTask | undefined,
  record: TaskObservationRecord,
): task is TaskObservationTask {
  return Boolean(
    task &&
    !task.work.cancelledAt &&
    task.work.observeFrom &&
    Date.parse(task.work.observeFrom) ===
      new Date(record.observeFrom).getTime(),
  );
}

/** Durable checkpoints share the application's runtime, but never hold the task open. */
export class TaskObservations {
  private readonly clock: () => Date;
  private readonly retryAfterMs: number;

  constructor(
    private readonly database: DatabaseManager,
    private readonly runtime: LifecycleRuntime,
    private readonly host: TaskObservationHost,
    options: TaskObservationsOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.retryAfterMs = options.retryAfterMs ?? 60 * 60_000;
    if (!Number.isFinite(this.retryAfterMs) || this.retryAfterMs <= 0) {
      throw new RangeError('Observation retry delay must be positive');
    }
    runtime.register(
      defineLifecycle<ObservationTypes>({
        name: TASK_OBSERVATIONS_LIFECYCLE,
        collection: TASK_OBSERVATIONS_COLLECTION,
        initial: 'pending',
        create: { guard: ({ actor }) => actor.system === true },
        states: [
          'pending',
          { name: 'completed', final: true },
          { name: 'cancelled', final: true },
        ],
        transitions: {
          defer: {
            from: 'pending',
            to: 'pending',
            manual: false,
            guard: ({ actor }) => actor.system === true,
            validate: (input) =>
              typeof input.dueAt === 'string' &&
              Number.isFinite(Date.parse(input.dueAt)) &&
              typeof input.reason === 'string'
                ? null
                : 'A deferred observation needs a due date and reason',
            accept: ['dueAt', 'reason'],
          },
          cancel: {
            from: 'pending',
            to: 'cancelled',
            manual: false,
            guard: ({ actor }) => actor.system === true,
            validate: (input) =>
              typeof input.reason === 'string'
                ? null
                : 'A cancelled observation needs a reason',
            accept: ['reason'],
          },
          complete: {
            from: 'pending',
            to: 'completed',
            manual: false,
            guard: ({ actor, input, record }) =>
              actor.system === true &&
              Boolean(
                input.result &&
                typeof input.result === 'object' &&
                !Array.isArray(input.result) &&
                input.result.day === record.day,
              ),
            set: async ({ record, input, services, now }) => {
              const task = await this.currentTask(record, services.connection);
              if (!publicationMatches(task, record)) {
                // A cancellation/publication change while calculating is a
                // stale observation. Nothing commits; the next sweep cancels it.
                throw new LifecycleError(
                  'CONFLICT',
                  'Task publication changed',
                );
              }
              const existing = task.work.observation?.results.find(
                (result) => result.day === record.day,
              );
              return {
                result: existing ?? input.result,
                completedAt: now.toISOString(),
                reason: null,
              };
            },
            onTransition: async ({ record, services }) => {
              const task = await this.currentTask(record, services.connection);
              if (!publicationMatches(task, record) || !record.result) {
                throw new LifecycleError(
                  'CONFLICT',
                  'Task publication changed',
                );
              }
              await this.host.saveResult(
                task,
                record.result,
                services.connection,
              );
            },
          },
        },
      }),
      {
        services: (handle) => ({
          connection:
            handle === undefined
              ? database.connection()
              : transactionConnection(handle),
        }),
      },
    );
  }

  private currentTask(
    record: TaskObservationRecord,
    connection: DatabaseConnection,
  ) {
    return this.host.task(record.projectId, String(record.taskId), connection);
  }

  /** Call in the transaction that first persists observeFrom after publication. */
  async schedule(
    task: TaskObservationTask,
    connection?: DatabaseConnection,
  ): Promise<number> {
    const from = task.work.observeFrom;
    if (!from || task.work.cancelledAt) return 0;
    if (!Number.isFinite(Date.parse(from))) {
      throw new Error(`Task ${task.id} has an invalid publication date`);
    }
    const adopt = async (tx: DatabaseConnection) => {
      let created = 0;
      const repository = tx.repository<TaskObservationRecord>(
        TASK_OBSERVATIONS_COLLECTION,
      );
      for (const day of CHECKPOINTS) {
        if (
          task.work.observation?.results.some((result) => result.day === day)
        ) {
          continue;
        }
        const observationKey = `${task.id}:${day}`;
        if (await repository.exists({ filter: { observationKey } })) continue;
        try {
          await this.runtime.create(
            TASK_OBSERVATIONS_LIFECYCLE,
            {
              observationKey,
              taskId: task.id,
              projectId: task.projectId,
              day,
              observeFrom: new Date(from).toISOString(),
              // The publication day is excluded and the last observed UTC day
              // must be finished before its partition can be compared.
              dueAt: `${shift(dateOf(from), day + 1)}T00:00:00.000Z`,
            },
            { actor: SYSTEM_ACTOR, transaction: tx },
          );
          created++;
        } catch (error) {
          // create() is a savepoint. Concurrent backfill/publish calls can
          // race on the unique task/day; only a committed matching row excuses it.
          if (!(await repository.exists({ filter: { observationKey } }))) {
            throw error;
          }
        }
      }
      return created;
    };
    return connection ? adopt(connection) : this.database.transaction(adopt);
  }

  /**
   * Startup adoption is paged separately from the due scan. Persist nextCursor
   * between pages; a repeated page is safe. No publication action is replayed.
   */
  async backfillPage(afterId?: string, limit = 100) {
    const tasks = await this.host.tasks({ afterId, limit: validLimit(limit) });
    let created = 0;
    for (const task of tasks) created += await this.schedule(task);
    return {
      scanned: tasks.length,
      created,
      nextCursor: tasks.length === limit ? tasks.at(-1)!.id : undefined,
    };
  }

  private async concurrentNotes(
    task: TaskObservationTask,
    result: EffectResult,
  ) {
    const keys = new Set(result.pages.map(pageKey).filter(Boolean));
    let afterId: string | undefined;
    for (;;) {
      const tasks = await this.host.tasks({
        projectId: task.projectId,
        afterId,
        limit: 100,
      });
      for (const other of tasks) {
        const from = other.work.observeFrom;
        if (
          !from ||
          other.id === task.id ||
          !Number.isFinite(Date.parse(from))
        ) {
          continue;
        }
        const day = dateOf(from);
        if (
          day >= result.baseline.start &&
          day <= result.after.end &&
          this.host.pages(other.work).some((page) => keys.has(pageKey(page)))
        ) {
          result.notes.push(
            systemMessageText('messages.concurrentTaskChangedPageLive', {
              0: other.title,
              1: day,
            }),
          );
        }
      }
      if (tasks.length < 100) return;
      const next = tasks.at(-1)!.id;
      if (next === afterId)
        throw new Error('Observation task cursor did not advance');
      afterId = next;
    }
  }

  /** One bounded batch of due rows; competing workers fence the final write by version. */
  async sweep(limit = 50): Promise<TaskObservationSweep> {
    const now = this.clock();
    const rows = await this.database
      .repository<TaskObservationRecord>(TASK_OBSERVATIONS_COLLECTION)
      .findMany({
        filter: (filter) =>
          filter.and([
            filter.string('status').eq('pending'),
            filter.date('dueAt').notAfter(now.toISOString()),
          ]),
        sort: (sort) => [sort.field('dueAt').asc(), sort.field('id').asc()],
        limit: validLimit(limit),
      });
    const summary: TaskObservationSweep = {
      scanned: rows.length,
      completed: 0,
      deferred: 0,
      cancelled: 0,
      competed: 0,
      failed: 0,
    };
    const failures: unknown[] = [];
    const ends = new Map<string, string>();
    for (const record of rows) {
      const fire = (transition: string, input: JsonObject) =>
        this.runtime.fire(TASK_OBSERVATIONS_LIFECYCLE, record.id, transition, {
          actor: SYSTEM_ACTOR,
          input,
          expect: { version: record.lifecycleVersion },
        });
      try {
        const task = await this.currentTask(record, this.database.connection());
        if (!publicationMatches(task, record)) {
          await fire('cancel', {
            reason: task ? 'publication_changed' : 'task_missing',
          });
          summary.cancelled++;
          continue;
        }
        const existing = task.work.observation?.results.find(
          (result) => result.day === record.day,
        );
        if (existing) {
          await fire('complete', { result: existing });
          summary.completed++;
          continue;
        }
        const pages = this.host.pages(task.work);
        if (!ends.has(task.projectId)) {
          ends.set(task.projectId, await this.host.dataEnd(task.projectId));
        }
        const from = dateOf(new Date(record.observeFrom).toISOString());
        const { baseline, after } = windows(from, record.day);
        if (!pages.length || after.end > ends.get(task.projectId)!) {
          await fire('defer', {
            dueAt: new Date(now.getTime() + this.retryAfterMs).toISOString(),
            reason: pages.length ? 'waiting_for_data' : 'waiting_for_pages',
          });
          summary.deferred++;
          continue;
        }
        const result = compare(
          record.day,
          from,
          pages,
          await this.host.partitions(task.projectId, baseline.start, after.end),
          now.toISOString(),
        );
        await this.concurrentNotes(task, result);
        await fire('complete', { result });
        summary.completed++;
      } catch (error) {
        if (
          error instanceof LifecycleError &&
          (error.code === 'CONFLICT' || error.code === 'INVALID_STATE')
        ) {
          summary.competed++;
          continue;
        }
        // A failing project's row must not remain first in every bounded due
        // batch. Keep its retry deadline durable and let other projects advance.
        // Report every failure after the batch so the dispatcher still sees it.
        summary.failed++;
        failures.push(error);
        try {
          await fire('defer', {
            dueAt: new Date(now.getTime() + this.retryAfterMs).toISOString(),
            reason: 'observation_failed',
          });
          summary.deferred++;
        } catch (deferError) {
          if (
            deferError instanceof LifecycleError &&
            (deferError.code === 'CONFLICT' ||
              deferError.code === 'INVALID_STATE')
          )
            summary.competed++;
          else failures.push(deferError);
        }
      }
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        `${summary.failed} task observation(s) could not be processed`,
      );
    return summary;
  }
}
