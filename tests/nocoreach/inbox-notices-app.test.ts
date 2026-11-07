// @vitest-environment node
// GET /api/nocoreachInbox/notices names a message's task only while its reader may still read that task: a person
// whose project permission is revoked keeps their own old message, but no longer learns about the task through it.
// Synthetic data only.
import { randomBytes, randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import { signIn } from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { inAppNotificationStoreToken } from '@nocobase/app-plugin-notification-in-app/server';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import { TASK_NOTICE } from '../../server/nocoreach/inbox-notices.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    notification: { channels: { inbox: { provider: 'in-app' } } },
  },
});

test('a message stops naming its task once the reader loses access to the task', async ({
  testApp,
}) => {
  const container = testApp.application.container;
  const runtime = container.resolve(nocoReachToken);
  await runtime.ready;
  const access = runtime.legacy.db.access!;
  const sets = container.resolve(authorizationToken).permissionSets;
  if (!(await runtime.plugin.projects.ids()).length)
    await runtime.plugin.projects.create({
      name: 'First',
      domain: 'first.example.test',
    });
  const [projectId] = (await runtime.plugin.projects.ids()).map(String);
  const credentials = {
    email: 'inbox-reader@example.test',
    password: 'fictional-password-123',
  };
  const user = await container
    .resolve(userAdministrationServiceToken)
    .create({ ...credentials, name: 'Inbox reader' });
  await sets.create({
    key: 'nr.inbox-reader',
    grants: access.grants(
      [
        { resource: 'nrProjects', action: 'list' },
        { resource: 'nrTaskWork', action: 'get' },
      ],
      projectId,
    ),
  });
  const grant = await sets.assign({
    permissionSet: 'nr.inbox-reader',
    subject: { type: 'user', id: user.id },
  });
  const task = await runtime.plugin.db.getRepository('nrTasks').create({
    values: {
      projectId,
      taskKey: randomUUID(),
      title: 'Synthetic review',
      status: '进行中',
      evidence: { no: 7 },
    },
  });
  await runtime.plugin.notifications.send([user.id], {
    title: 'T-7 waits for you',
    content: 'Synthetic review',
    url: `/actions/${task.id}`,
    source: TASK_NOTICE.waiting,
    ref: task.id,
  });
  const store = container.resolve(inAppNotificationStoreToken);
  const item = await vi.waitFor(async () => {
    const [found] = await store.list({ userId: String(user.id) });
    expect(found).toBeDefined();
    return found!;
  });
  const client = await signIn(testApp, credentials);
  const notices = async () => {
    const response = await client.fetch(
      `/nocoreachInbox/notices?ids=${encodeURIComponent(item.notificationId)}`,
    );
    expect(response.status).toBe(200);
    return (await response.json()).data;
  };
  expect(await notices()).toEqual([
    {
      notificationId: item.notificationId,
      type: 'task.waiting',
      task: expect.objectContaining({
        id: String(task.id),
        projectId,
        label: 'T-7',
      }),
    },
  ]);

  await sets.revoke(grant.id);
  expect(await notices()).toEqual([
    { notificationId: item.notificationId, type: 'task.waiting', task: null },
  ]);
});
