// What NocoReach knows about the in-app messages it sent, kept in the Notification plugin's own records: each message's
// dispatch carries its kind as the source type (`nocoreach.task.waiting`, `nocoreach.analysisFailed`…) and the task it
// is about as the source reference. The Inbox reads them to show a task's details and actions (GET
// /api/nocoreachInbox/notices), and the task service closes a task's "Waiting for you" messages once they no longer
// hold. Nothing new is stored: the messages, their read state and their deletion stay the in-app plugin's.
import type { DatabaseManager } from '@nocobase/db';
import type { InAppStore } from '@nocobase/app-plugin-notification-in-app/server';

/** The source type of every message NocoReach sends; a kind follows it after a dot. */
export const NOCOREACH_SOURCE = 'nocoreach';

/** The kinds of task messages, each with its source type. */
export const TASK_NOTICE = {
  waiting: `${NOCOREACH_SOURCE}.task.waiting`,
  owner: `${NOCOREACH_SOURCE}.task.owner`,
  comment: `${NOCOREACH_SOURCE}.task.comment`,
  snoozeDue: `${NOCOREACH_SOURCE}.task.snoozeDue`,
} as const;
export const ANALYSIS_FAILED_NOTICE = `${NOCOREACH_SOURCE}.analysisFailed`;

/** What the Inbox is told about one of the viewer's messages. */
export interface InboxNoticeView {
  readonly notificationId: string;
  /** `task.waiting`, `task.owner`, `task.comment`, `task.snoozeDue`, `task` (an older task message), `analysisFailed` or `message`. */
  readonly type: string;
  readonly task: {
    readonly id: string;
    readonly projectId: string;
    readonly label: string;
    /** For a waiting message: when the task stopped waiting for review (reviewed, cancelled or archived). */
    readonly resolvedAt: string | null;
  } | null;
}

/** The fields of a task the Inbox is told about. */
export interface TaskRow {
  readonly id: string | number;
  readonly projectId: string | number;
  readonly title?: string;
  readonly updatedAt?: string | Date;
  readonly evidence?: { no?: number; work?: unknown } | null;
}

const TASK_PATH = /^\/actions\/(\d+)$/;
/** The notification id prefix of the demo's messages (demo-data/activity.ts `DEMO_NOTIFICATION`). */
const DEMO_NOTIFICATION = 'nocoreach-demo-';
const MAX_IDS = 100;

/** Whether a task waits for its owner's review: in Needs you, neither cancelled nor archived. */
export type WaitsForReview = (work: unknown) => boolean;

export class InboxNotices {
  constructor(
    private readonly database: () => DatabaseManager,
    private readonly store: () => InAppStore | undefined,
  ) {}

  /**
   * Marks read (`read`) or deletes (`delete`) every in-app message of this kind about this reference, for everyone
   * who got one; through the in-app store, so each person's open inbox refreshes. Returns how many changed.
   */
  async close(
    type: string,
    referenceId: string,
    action: 'read' | 'delete',
  ): Promise<number> {
    const store = this.store();
    if (!store) return 0;
    let query = this.database()
      .query()
      .selectFrom('notificationInAppItems as item')
      .innerJoin(
        'notificationDispatches as dispatch',
        'dispatch.id',
        'item.notificationId',
      )
      .select(['item.id as id', 'item.userId as userId'])
      .where('dispatch.sourceType', '=', type)
      .where('dispatch.sourceReferenceId', '=', String(referenceId));
    if (action === 'read') query = query.where('item.readAt', 'is', null);
    const rows = await query.execute<{ id: string; userId: string }>();
    for (const row of rows)
      await store.update({
        id: String(row.id),
        userId: String(row.userId),
        action,
      });
    return rows.length;
  }

  /**
   * What NocoReach knows about these messages of `userId`: only their own messages, and only those NocoReach sent.
   * `tasks` reads the tasks they are about, in one query.
   */
  async list(
    userId: string,
    notificationIds: readonly string[],
    tasks: (ids: readonly string[]) => Promise<readonly TaskRow[]>,
    waits: WaitsForReview,
  ): Promise<InboxNoticeView[]> {
    const ids = [...new Set(notificationIds)].slice(0, MAX_IDS);
    if (!ids.length) return [];
    const rows = await this.database()
      .query()
      .selectFrom('notificationInAppItems as item')
      .leftJoin(
        'notificationDispatches as dispatch',
        'dispatch.id',
        'item.notificationId',
      )
      .select([
        'item.notificationId as notificationId',
        'item.target as target',
        'dispatch.sourceType as sourceType',
        'dispatch.sourceReferenceId as referenceId',
      ])
      .where('item.userId', '=', String(userId))
      .where('item.notificationId', 'in', ids)
      .where((builder) =>
        builder.or([
          builder('dispatch.sourceType', '=', NOCOREACH_SOURCE),
          builder('dispatch.sourceType', 'like', `${NOCOREACH_SOURCE}.%`),
          // The demo's messages (demo-data/activity.ts) are written without a dispatch.
          builder.and([
            builder('dispatch.id', 'is', null),
            builder('item.notificationId', 'like', `${DEMO_NOTIFICATION}%`),
          ]),
        ]),
      )
      .execute<{
        notificationId: string;
        target: unknown;
        sourceType: string | null;
        referenceId: string | null;
      }>();
    const seen = new Map<string, { type: string; taskId: string | null }>();
    for (const row of rows) {
      if (seen.has(row.notificationId)) continue;
      const kind = (row.sourceType ?? '').slice(NOCOREACH_SOURCE.length + 1);
      if (kind.startsWith('task.'))
        seen.set(row.notificationId, { type: kind, taskId: row.referenceId });
      else {
        // An older or demo message names no kind: a link to a task makes it a task message.
        const path = routeOf(row.target)?.match(TASK_PATH)?.[1] ?? null;
        seen.set(row.notificationId, {
          type: kind || (path ? 'task' : 'message'),
          taskId: kind ? null : path,
        });
      }
    }
    const taskIds = [
      ...new Set(
        [...seen.values()]
          .map((v) => v.taskId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const byId = new Map(
      (taskIds.length ? await tasks(taskIds) : []).map((t) => [
        String(t.id),
        t,
      ]),
    );
    return [...seen].map(([notificationId, { type, taskId }]) => {
      const task = taskId ? byId.get(taskId) : undefined;
      return {
        notificationId,
        type,
        task: task
          ? {
              id: String(task.id),
              projectId: String(task.projectId),
              label: task.evidence?.no
                ? `T-${task.evidence.no}`
                : String(task.title ?? ''),
              resolvedAt:
                type === 'task.waiting' && !waits(task.evidence?.work)
                  ? isoOf(task.updatedAt)
                  : null,
            }
          : null,
      };
    });
  }
}

function routeOf(target: unknown): string | undefined {
  const value = typeof target === 'string' ? safeJson(target) : target;
  return value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'route'
    ? String((value as { path?: string }).path ?? '')
    : undefined;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isoOf(value: string | Date | undefined): string {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}
