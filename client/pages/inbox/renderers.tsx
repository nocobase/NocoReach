/* eslint-disable react-refresh/only-export-components -- the renderers and the parts they render are one contribution */
// How NocoReach's messages read in the Inbox (client/extensions/nocobase-inbox/registry.ts). A task message (Waiting
// for you, assigned, a new comment, back from snooze) shows the task as it is now: its status, current step, owner,
// the output under review and the latest comments, with Review / Snooze / Mark as read. Whoever cannot act on the task
// is told why instead. Every other NocoReach message, such as a failed daily analysis, shows its whole text.
import { createUuid } from '@nocobase/app-client';
import { inboxKeys } from '@nocobase/app-plugin-notification-in-app/client/inbox';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClockIcon,
  ClipboardCheckIcon,
  ClockIcon,
  ListTodoIcon,
  MailOpenIcon,
  MessageSquareIcon,
  TriangleAlertIcon,
  UserRoundPlusIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import {
  defineInboxRenderer,
  type InboxCanAct,
  type InboxPartProps,
} from '#extensions/nocobase-inbox/registry';
import type { InboxEntry } from '#extensions/nocobase-inbox/model';
import { $legacyText, $t, useNocoReachLocale } from '#i18n';
import { formatDateTime } from '#lib/format';
import { NocoReachHttpError, nocobaseClient as api } from '#lib/nocoreach-api';

import { useMe } from '../me';
import { stageName } from '../playbook-model';
import { localizeWorkSnapshots } from '../playbook-snapshot';
import { TaskStatusTag } from '../task-status-tag';
import { SnoozeDialog } from '../task-detail/task-snooze';
import {
  isClosed,
  isSnoozed,
  type TaskData,
  type Work,
} from '../task-execution-types';
import { NOCOREACH_INBOX_SOURCE, TASK_NOTICE_TYPES } from './source';

/** How much of the output under review and of each comment the detail shows. */
const SUMMARY_LENGTH = 400;
const RECENT_COMMENTS = 3;

interface TaskRef {
  readonly projectId: string;
  readonly taskId: string;
}

/** What a task message's detail loaded: the task as its page reads it, and its members to name who commented. */
export interface TaskModel {
  readonly ref: TaskRef | null;
  readonly data?: TaskData;
  readonly members: ReadonlyMap<string, string>;
  readonly error: unknown;
  readonly loading: boolean;
}

function refOf(entry: InboxEntry): TaskRef | null {
  const data = entry.notice?.data;
  const projectId = typeof data?.projectId === 'string' ? data.projectId : '';
  const taskId = typeof data?.taskId === 'string' ? data.taskId : '';
  return projectId && taskId ? { projectId, taskId } : null;
}

const taskKey = (ref: TaskRef | null, part: string) => [
  ...inboxKeys.all,
  'nocoreach',
  part,
  ref?.projectId ?? null,
  ref?.taskId ?? null,
];

const task = (ref: TaskRef, action: string, body: object = {}) =>
  api.action<unknown>('nrTaskWork', action, {
    method: 'POST',
    body: { projectId: ref.projectId, taskId: ref.taskId, ...body },
    unwrap: 'data',
  });

function useTaskModel(entry: InboxEntry): TaskModel {
  const ref = refOf(entry);
  // Under the inbox's key, so the realtime refresh that brings a new message also brings the task as it is now.
  const data = useQuery({
    queryKey: taskKey(ref, 'task'),
    queryFn: () => task(ref!, 'get') as Promise<TaskData>,
    enabled: ref !== null,
    retry: false,
  });
  const members = useQuery({
    queryKey: taskKey(ref, 'members'),
    queryFn: () =>
      task(ref!, 'members') as Promise<{ id: string; name: string }[]>,
    enabled: ref !== null && data.isSuccess,
    retry: false,
    staleTime: 60_000,
  });
  return {
    ref,
    data: data.data
      ? { ...data.data, work: localizeWorkSnapshots(data.data.work) }
      : undefined,
    members: new Map(
      (Array.isArray(members.data) ? members.data : []).map((m) => [
        String(m.id),
        m.name,
      ]),
    ),
    error: data.error,
    loading: ref !== null && data.isPending,
  };
}

const stageOf = (w: Work) => w.flow?.stages[w.stageIndex || 0];
/** The current step's name as the task page words it. */
const stepName = (w: Work) => {
  const stage = stageOf(w);
  return stage ? $legacyText(stageName(stage, w)) : '';
};
/** Waiting for its owner's review now: in Needs you, neither closed nor finished. */
const inReview = (w: Work) =>
  !isClosed(w) && w.stage !== 'done' && stageOf(w)?.kind === 'review';
const ownerOf = (data: TaskData) =>
  data.work.humanOwnerId ||
  (data.task.evidence as { createdBy?: { id?: string } } | undefined)?.createdBy
    ?.id;

function useTaskCanAct(_entry: InboxEntry, model: TaskModel): InboxCanAct {
  const { can } = useMe();
  if (model.loading) return { state: 'loading' };
  if (!model.ref) return { state: 'no', reason: $t('taskInbox.taskGone') };
  if (model.error || !model.data) {
    const status =
      model.error instanceof NocoReachHttpError ? model.error.status : 0;
    return {
      state: 'no',
      reason:
        status === 403
          ? $t('taskInbox.noAccess')
          : status === 404
            ? $t('taskInbox.taskGone')
            : $t('taskInbox.loadFailed'),
    };
  }
  if (!can(ownerOf(model.data)))
    return {
      state: 'no',
      reason: $t('taskInbox.ownerOnly', {
        0: model.data.work.humanOwnerName || $t('common.owner'),
      }),
    };
  return { state: 'yes' };
}

function TaskActions({
  entry,
  model,
  onOpen,
  onDecided,
}: InboxPartProps<TaskModel>): ReactElement | null {
  const queryClient = useQueryClient();
  const [snoozing, setSnoozing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { data, ref } = model;
  if (!data || !ref) return null;
  const w = data.work;
  const review = entry.notice?.type === 'task.waiting' && inReview(w);
  const snoozable =
    !isClosed(w) &&
    w.stage !== 'done' &&
    !isSnoozed(w) &&
    !data.runs.some((r) => r.status === 'queued' || r.status === 'running');
  // The task page's own command, as its Snooze dialog sends it; the answer is the task as it is now.
  const update = async (command: string, body: object = {}) => {
    setBusy(true);
    setError('');
    try {
      const next = (await task(ref, 'advance', {
        revision: w.revision,
        requestId: createUuid(),
        command,
        ...body,
      })) as TaskData;
      queryClient.setQueryData(taskKey(ref, 'task'), next);
      onDecided();
      return next;
    } catch (e) {
      // The key, translated when shown, so a language switch rewords it.
      setError(
        e instanceof NocoReachHttpError && e.status === 403
          ? 'taskInbox.noAccess'
          : 'common.operationFailed',
      );
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {onOpen ? (
        <Button data-action='open' onClick={onOpen}>
          {review ? <ClipboardCheckIcon data-icon='inline-start' /> : null}
          {review ? $t('taskInbox.review') : $t('taskInbox.openTask')}
        </Button>
      ) : null}
      {snoozable ? (
        <Button
          variant='outline'
          data-action='snooze'
          disabled={busy}
          onClick={() => setSnoozing(true)}
        >
          <ClockIcon data-icon='inline-start' />
          {$t('taskSnooze.menu')}
        </Button>
      ) : null}
      {!entry.item.readAt ? (
        <Button variant='ghost' data-action='read' onClick={onDecided}>
          <MailOpenIcon data-icon='inline-start' />
          {$t('taskInbox.markRead')}
        </Button>
      ) : null}
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {$t(error)}
        </p>
      ) : null}
      <SnoozeDialog
        projectId={Number(ref.projectId)}
        open={snoozing}
        onClose={() => setSnoozing(false)}
        data={data}
        busy={busy}
        update={update}
      />
    </>
  );
}

/** Plain text of a Markdown output, shortened to a summary. */
function summaryOf(content: string): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    // Tables read badly as plain text; the summary leaves them out.
    .replace(/^\s*\|.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*+\s]+/gm, '')
    .replace(/[*_`]+/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return plain.length > SUMMARY_LENGTH
    ? `${plain.slice(0, SUMMARY_LENGTH).trimEnd()}…`
    : plain;
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className='flex flex-col gap-2'>
      <h3 className='text-xs font-medium text-muted-foreground'>{title}</h3>
      {children}
    </section>
  );
}

function Fact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex min-w-0 flex-col gap-1'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='min-w-0 text-sm wrap-anywhere'>{children}</dd>
    </div>
  );
}

function TaskBody({ entry, model }: InboxPartProps<TaskModel>): ReactElement {
  const { data, members } = model;
  const message = <MessageText entry={entry} />;
  if (model.loading)
    return (
      <div
        role='status'
        aria-label={$t('common.loading')}
        className='flex flex-col gap-3'
      >
        <Skeleton className='h-12 w-full' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  if (!data) return message;
  const w = data.work;
  const stage = stageOf(w);
  const index = w.stageIndex || 0;
  // The output the current step reviews (the previous step's), else the latest one.
  const output =
    (stage?.kind === 'review' ? w.results[index - 1] : undefined) ??
    [...w.results].reverse().find(Boolean) ??
    undefined;
  const summary = output?.content ? summaryOf(output.content) : '';
  const comments = (w.history || [])
    .filter(
      (e) =>
        (e.action === 'comment' || e.action === 'requestStageChanges') &&
        e.comment,
    )
    .slice(-RECENT_COMMENTS)
    .reverse();
  const nameOf = (id?: string) =>
    (id && members.get(String(id))) ||
    (id && String(id) === String(w.humanOwnerId) && w.humanOwnerName) ||
    $t('common.member');
  return (
    <>
      <dl
        className='grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-3'
        data-slot='task-facts'
      >
        <Fact label={$t('common.status')}>
          <TaskStatusTag
            work={w}
            status={(data.task as { status?: string }).status || ''}
          />
        </Fact>
        <Fact label={$t('taskInbox.currentStep')}>
          {w.stage === 'done'
            ? $t('taskInbox.allStepsDone')
            : stepName(w) || $t('taskInbox.notStarted')}
        </Fact>
        <Fact label={$t('common.owner')}>
          {w.humanOwnerName || $t('taskInbox.noOwner')}
        </Fact>
      </dl>
      {summary ? (
        <Section title={$t('taskInbox.output')}>
          <p
            className='text-sm whitespace-pre-wrap wrap-anywhere'
            data-slot='task-output'
          >
            {summary}
          </p>
        </Section>
      ) : null}
      <Section title={$t('taskInbox.recentComments')}>
        {comments.length ? (
          <ol className='flex flex-col gap-3' data-slot='task-comments'>
            {comments.map((e) => (
              <li key={`${e.at}:${e.action}`} className='flex flex-col gap-0.5'>
                <p className='flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground'>
                  <span className='font-medium text-foreground'>
                    {nameOf(e.actor)}
                  </span>
                  <time>{e.at ? formatDateTime(e.at) : ''}</time>
                </p>
                <p className='text-sm whitespace-pre-wrap wrap-anywhere'>
                  {e.comment}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {$t('taskInbox.noComments')}
          </p>
        )}
      </Section>
    </>
  );
}

/** The message as sent, in full, with when it came. */
function MessageText({ entry }: { readonly entry: InboxEntry }): ReactElement {
  const { body } = textOf(entry);
  const { createdAt } = entry.item;
  return (
    <div className='flex flex-col gap-2' data-slot='message-body'>
      {body ? (
        <p className='text-sm whitespace-pre-wrap wrap-anywhere'>{body}</p>
      ) : null}
      <p className='text-xs text-muted-foreground'>
        {$t('taskInbox.sentAt', { 0: formatDateTime(createdAt) })}
      </p>
    </div>
  );
}

const TASK_ICONS: Readonly<Record<string, LucideIcon>> = {
  'task.waiting': ClipboardCheckIcon,
  'task.owner': UserRoundPlusIcon,
  'task.comment': MessageSquareIcon,
  'task.snoozeDue': AlarmClockIcon,
};

const taskLabel = (type: string) =>
  ({
    'task.waiting': $t('taskInbox.kinds.waiting'),
    'task.owner': $t('taskInbox.kinds.owner'),
    'task.comment': $t('taskInbox.kinds.comment'),
    'task.snoozeDue': $t('taskInbox.kinds.snoozeDue'),
  })[type] ?? $t('taskInbox.kinds.task');

/** The message's text as sent: the server stores its own wording in one language, read here in the viewer's. */
const textOf = (entry: InboxEntry) => {
  const title = $legacyText(entry.item.title ?? '');
  const body = $legacyText(entry.item.body ?? '');
  return { title, body: body && body !== title ? body : '' };
};
const titleOf = (entry: InboxEntry) => {
  const { title, body } = textOf(entry);
  return { title: title || body, sentence: body || null };
};

/** A task message: what happened, and the task as it is now. */
export const taskRenderer = defineInboxRenderer<TaskModel>({
  source: NOCOREACH_INBOX_SOURCE,
  types: TASK_NOTICE_TYPES,
  icon: (entry) => TASK_ICONS[entry.notice?.type ?? ''] ?? ListTodoIcon,
  useWording() {
    // Read again when the language changes.
    useNocoReachLocale();
    return {
      label: (entry) => taskLabel(entry.notice?.type ?? ''),
      text: (entry, model) => {
        const text = titleOf(entry);
        // The step it waits on, as the task names it now in the viewer's language.
        const step = model?.data ? stepName(model.data.work) : undefined;
        if (
          entry.notice?.type === 'task.waiting' &&
          step &&
          entry.notice.subject?.label
        )
          return {
            title: $t('messages.waits', {
              0: entry.notice.subject.label,
              1: step,
            }),
            sentence: text.sentence,
          };
        // The detail's body shows the task; the comment itself is a line of it, not the sentence.
        return entry.notice?.type === 'task.waiting' ||
          entry.notice?.type === 'task.owner'
          ? text
          : { title: text.title, sentence: null };
      },
      open: $t('taskInbox.openTask'),
    };
  },
  useModel: useTaskModel,
  useCanAct: useTaskCanAct,
  Actions: TaskActions,
  Body: (props) => (
    <>
      {props.entry.notice?.type === 'task.comment' ||
      props.entry.notice?.type === 'task.snoozeDue' ? (
        <MessageText entry={props.entry} />
      ) : null}
      <TaskBody {...props} />
    </>
  ),
  context: (_entry, model) => ({
    ids: model.ref ? [model.ref.taskId] : [],
  }),
});

/** Any other NocoReach message, such as a failed daily analysis: its whole text. */
export const messageRenderer = defineInboxRenderer<null>({
  source: NOCOREACH_INBOX_SOURCE,
  icon: (entry) =>
    entry.notice?.type === 'analysisFailed' ? TriangleAlertIcon : MailOpenIcon,
  useWording() {
    // Read again when the language changes.
    useNocoReachLocale();
    return {
      label: (entry) =>
        entry.notice?.type === 'analysisFailed'
          ? $t('taskInbox.kinds.analysisFailed')
          : $t('taskInbox.kinds.message'),
      text: (entry) => ({ title: titleOf(entry).title, sentence: null }),
    };
  },
  Body: ({ entry }) => <MessageText entry={entry} />,
});

export const nocoReachRenderers = [taskRenderer, messageRenderer];
