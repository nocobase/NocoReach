// @vitest-environment node
// NocoReach's in-app messages in the Notification plugin's own tables (server/nocoreach/inbox-notices.ts): the Inbox
// learns each message's kind and task, and a task keeps one "Waiting for you" message, closed once it is reviewed.
// Real migrations and the in-app plugin's own store on SQLite; synthetic data only.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { createTestDatabase } from '@nocobase/app-testing/server';
import { DatabaseInAppStore } from '@nocobase/app-plugin-notification-in-app/server';
import { onTestFinished, test } from 'vitest';

import {
  InboxNotices,
  TASK_NOTICE,
} from '../../server/nocoreach/inbox-notices.js';
import { legacyRecord } from '../../server/nocoreach/legacy/database.js';
import { LegacyNotifications } from '../../server/nocoreach/legacy/notifications.js';
import { Notifications } from '../../server/nocoreach/notifications.js';

const migrations = (name: string) => ({
  packageName: `@nocobase/${name}`,
  directory: fileURLToPath(
    new URL(
      `../../node_modules/@nocobase/${name}/dist/database/migrations`,
      import.meta.url,
    ),
  ),
});

async function harness() {
  const testDb = await createTestDatabase({
    migrations: [
      migrations('app-plugin-notification'),
      migrations('app-plugin-notification-in-app'),
    ],
  });
  onTestFinished(() => testDb.destroy());
  const database = testDb.database as any;
  const store = new DatabaseInAppStore(database);
  const notices = new InboxNotices(
    () => database,
    () => store,
  );
  let n = 0;
  // What the Notification service does with a message for the in-app channel: a dispatch with its source, then an item
  // per person.
  const service: any = {
    send: async ({ source, messages }: any) => {
      const message: any = Object.values(messages)[0];
      if (!('title' in message))
        return { notificationId: 'mail', status: 'completed' };
      const id = `n${++n}`;
      const at = new Date(Date.UTC(2026, 9, 1, 8, n)).toISOString();
      await database
        .query()
        .insertInto('notificationDispatches')
        .values({
          id,
          sourceType: source.type,
          sourceReferenceId: source.referenceId ?? null,
          createdAt: at,
          updatedAt: at,
        })
        .execute();
      for (const userId of message.to)
        await store.deliver({
          deliveryId: `${id}:${userId}`,
          notificationId: id,
          userId,
          message,
          createdAt: at,
        });
      return { notificationId: id, status: 'completed' };
    },
  };
  const users: any = {
    findOne: async ({ filterByTk }: any) =>
      legacyRecord({
        id: filterByTk,
        nickname: { '1': 'Esther', '3': 'Mia' }[filterByTk as string] ?? 'Lin',
      }),
  };
  const bridge = new LegacyNotifications(
    () => service,
    () => ({ inbox: { provider: 'in-app' } }),
    users,
    { basePath: '/main' },
    notices,
  );
  const repos: any = { notificationChannels: bridge.repository(), users };
  const p: any = {
    db: { getRepository: (name: string) => repos[name] },
    app: {
      logger: { warn: () => {} },
      pm: {
        get: (name: string) =>
          name === 'notification-manager' ? bridge.plugin : null,
      },
    },
    members: { list: async () => [{ id: '1', role: 'admin' }] },
    project: async () => ({ name: 'Acme' }),
  };
  const inbox = async (userId: string) => store.list({ userId, limit: 100 });
  return { database, store, notices, n: new Notifications(p), inbox };
}

const task = (id: number, no: number) => ({
  id,
  title: `Task ${no}`,
  evidence: { no },
});

test('a task keeps one Waiting for you message: an earlier one goes when it waits again, other tasks and kinds stay', async () => {
  const h = await harness();
  await h.n.taskEvents(task(12, 55), { humanOwnerId: '2' }, [
    { kind: 'waiting', step: 'Review draft' },
  ]);
  await h.n.taskEvents(task(13, 56), { humanOwnerId: '2' }, [
    { kind: 'waiting', step: 'Review draft' },
  ]);
  await h.n.taskEvents(task(12, 55), { humanOwnerId: '2' }, [
    { kind: 'comment', by: '3', comment: 'Shorter please' },
  ]);
  await h.n.taskEvents(task(12, 55), { humanOwnerId: '2' }, [
    { kind: 'waiting', step: 'Review draft' },
  ]);
  await h.n.taskEvents(task(12, 55), { humanOwnerId: '2' }, [
    { kind: 'waiting', step: 'Review again' },
  ]);
  const items = await h.inbox('2');
  assert.equal(items.length, 3);
  assert.equal(
    items.filter(
      (item) =>
        item.target?.type === 'route' && item.target.path === '/actions/12',
    ).length,
    2,
    'the comment and the latest Waiting for you',
  );
  assert.match(items[0]!.title!, /Review again/u);
});

test('once the task is reviewed, its Waiting for you messages read as read, for everyone who got one', async () => {
  const h = await harness();
  await h.n.taskEvents(task(12, 55), { humanOwnerId: '2' }, [
    { kind: 'waiting', step: 'Review draft' },
  ]);
  await h.n.taskEvents(task(12, 55), { humanOwnerId: '2' }, [
    { kind: 'comment', by: '3', comment: 'Shorter please' },
  ]);
  assert.equal(await h.n.close(12), 1);
  const items = await h.inbox('2');
  assert.deepEqual(
    items.map((item) => [
      item.title?.includes('Mia') ? 'comment' : 'waiting',
      Boolean(item.readAt),
    ]),
    [
      ['comment', false],
      ['waiting', true],
    ],
  );
  assert.equal(await h.n.close(12), 0, 'nothing left to close');
});

test("the Inbox learns each of the viewer's own messages' kind and task, and whether a waiting task was reviewed", async () => {
  const h = await harness();
  await h.n.taskEvents(task(12, 55), { humanOwnerId: '2' }, [
    { kind: 'waiting', step: 'Review draft' },
  ]);
  await h.n.taskEvents(task(13, 56), { humanOwnerId: '2' }, [
    { kind: 'owner', by: '1' },
  ]);
  await h.n.analysisFailed('7', 'the online AI could not be reached');
  // An older message, sent before messages carried their kind, and a message of another sender.
  for (const [id, type, path] of [
    ['old', 'nocoreach', '/actions/13'],
    ['other', 'workflow', '/actions/12'],
  ] as const) {
    await h.database
      .query()
      .insertInto('notificationDispatches')
      .values({
        id,
        sourceType: type,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      })
      .execute();
    await h.store.deliver({
      deliveryId: id,
      notificationId: id,
      userId: '2',
      message: {
        to: '2',
        title: id,
        body: id,
        target: { type: 'route', path },
      },
      createdAt: '2026-09-01T00:00:00.000Z',
    });
  }
  // The demo's messages have no dispatch; another message without one is nobody's NocoReach message.
  for (const id of ['nocoreach-demo-1', 'stray'])
    await h.store.deliver({
      deliveryId: id,
      notificationId: id,
      userId: '2',
      message: {
        to: '2',
        title: id,
        body: id,
        target: { type: 'route', path: '/actions/12' },
      },
      createdAt: '2026-09-02T00:00:00.000Z',
    });
  const mine = (await h.inbox('2')).map((item) => item.notificationId);
  const tasks = async (ids: readonly string[]) =>
    [
      {
        id: 12,
        projectId: 1,
        title: 'Task 55',
        updatedAt: '2026-10-03T08:00:00.000Z',
        evidence: { no: 55, work: { reviewed: true } },
      },
      {
        id: 13,
        projectId: 1,
        title: 'Task 56',
        evidence: { no: 56, work: { reviewed: false } },
      },
    ].filter((row) => ids.includes(String(row.id)));
  const waits = (work: any) => !work?.reviewed;
  const views = await h.notices.list('2', [...mine, 'n3'], tasks, waits);
  const byType = Object.fromEntries(views.map((view) => [view.type, view]));
  assert.deepEqual(Object.keys(byType).sort(), [
    'task',
    'task.owner',
    'task.waiting',
  ]);
  assert.deepEqual(byType['task.waiting']!.task, {
    id: '12',
    projectId: '1',
    label: 'T-55',
    resolvedAt: '2026-10-03T08:00:00.000Z',
  });
  assert.deepEqual(byType['task.owner']!.task, {
    id: '13',
    projectId: '1',
    label: 'T-56',
    resolvedAt: null,
  });
  assert.equal(
    views.find((view) => view.notificationId === 'old')?.task?.id,
    '13',
    'an older message is about the task it links to',
  );
  assert.deepEqual(
    views.find((view) => view.notificationId === 'nocoreach-demo-1'),
    {
      notificationId: 'nocoreach-demo-1',
      type: 'task',
      task: { id: '12', projectId: '1', label: 'T-55', resolvedAt: null },
    },
    'a demo message is about the task it links to',
  );
  assert.deepEqual(
    views.filter((view) => ['other', 'stray'].includes(view.notificationId)),
    [],
    "another sender's message is not NocoReach's",
  );
  // The failed analysis went to the admin, not to this viewer.
  assert.deepEqual(await h.notices.list('1', ['n3'], tasks, waits), [
    { notificationId: 'n3', type: 'analysisFailed', task: null },
  ]);
  assert.equal(TASK_NOTICE.waiting, 'nocoreach.task.waiting');
});
