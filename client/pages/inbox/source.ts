// What NocoReach adds to the in-app messages it sent, for the Inbox (client/extensions/nocobase-inbox/source.ts): the
// kind of each message and the task it is about, as the server keeps them with the message's dispatch
// (server/nocoreach/inbox-notices.ts). A message about a task waiting for review is a decision until the task is
// reviewed, cancelled or archived; everything else is information.
import type { InboxNotice } from '#extensions/nocobase-inbox/model';
import type { InboxSource } from '#extensions/nocobase-inbox/source';

/** The source NocoReach's renderers are registered under. */
export const NOCOREACH_INBOX_SOURCE = 'nocoreach';

/** The task kinds: waiting for review, assigned, commented, back from snooze, and an older task message. */
export const TASK_NOTICE_TYPES = [
  'task.waiting',
  'task.owner',
  'task.comment',
  'task.snoozeDue',
  'task',
] as const;
export type TaskNoticeType = (typeof TASK_NOTICE_TYPES)[number];

interface NoticeView {
  readonly notificationId: string;
  readonly type: string;
  readonly task: {
    readonly id: string;
    readonly projectId: string;
    readonly label: string;
    readonly resolvedAt: string | null;
  } | null;
}

/** The notice of one message, as the Inbox reads it. */
export function noticeOf(view: NoticeView): InboxNotice {
  const { task } = view;
  return {
    notificationId: view.notificationId,
    source: NOCOREACH_INBOX_SOURCE,
    kind: view.type === 'task.waiting' ? 'decision' : 'info',
    type: view.type,
    subject: task ? { type: 'task', id: task.id, label: task.label } : null,
    decisionKey:
      view.type === 'task.waiting' && task ? `task:${task.id}` : null,
    data: task ? { taskId: task.id, projectId: task.projectId } : null,
    count: 1,
    resolvedAt: task?.resolvedAt ?? null,
    outcome: null,
  };
}

export const nocoReachInboxSource: InboxSource = {
  id: NOCOREACH_INBOX_SOURCE,
  // Without an answer the messages still list, as plain notifications: the inbox waits for this before it shows them.
  async notices(notificationIds, { api, signal }) {
    try {
      const result = await api.request<{ data?: unknown }>({
        path: `nocoreachInbox/notices?ids=${encodeURIComponent(notificationIds.join(','))}`,
        signal,
      });
      return Array.isArray(result?.data)
        ? (result.data as readonly NoticeView[]).map(noticeOf)
        : [];
    } catch {
      return [];
    }
  },
};
