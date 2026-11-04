// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import { manualTasksToken } from '../../server/providers/manual-tasks.js';
import type { TaskService } from '../../server/nocoreach/execution/service.js';
import { TaskMediaView } from '../../shared/manual-task.js';
import { docx } from './office-fixtures.js';

// Images on a started task (2026-11-03): uploaded for the task by whoever may read it, linked to the task by the
// message that carries them, then readable as the task is and handed to its runs.
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
type Client = Awaited<ReturnType<typeof signIn>>;
const json = { 'Content-Type': 'application/json', origin: 'http://localhost' };
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6n6AAAAAASUVORK5CYII=',
  'base64',
);
function upload(
  client: Client,
  taskId: string,
  file = new File([png], 'Screenshot 10.52.png', { type: 'image/png' }),
) {
  const body = new FormData();
  body.set('file', file);
  return client.fetch(
    `/nocoreachTasks/media?projectId=1&requestId=${randomUUID()}&taskId=${taskId}`,
    { method: 'POST', headers: { origin: 'http://localhost' }, body },
  );
}

test('message images upload for the task, link once with the message, follow the task’s read grants and reach its runs', async ({
  testApp,
  connection,
}) => {
  const container = testApp.application.container;
  const runtime = container.resolve(nocoReachToken);
  (
    runtime.plugin as unknown as { taskExecution: TaskService }
  ).taskExecution.stop();
  const manual = container.resolve(manualTasksToken);
  await runtime.plugin.projects.create({
    name: 'Image tests',
    domain: 'images.example.test',
  });
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const task = async () => {
    const created = await admin.fetch('/nocoreachTasks', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        projectId: '1',
        title: 'Article review',
        description: 'Fictional review task',
        requestId: randomUUID(),
        attachmentIds: [],
      }),
    });
    expect(created.status).toBe(201);
    return String((await created.json()).data.id);
  };
  const taskId = await task(),
    otherTaskId = await task();
  const advance = async (id: string, body: object, client = admin) => {
    const got = await client.fetch('/nocoreach/nrTaskWork/get', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ projectId: '1', taskId: id }),
    });
    const revision = (await got.json()).data.work.revision;
    return client.fetch('/nocoreach/nrTaskWork/advance', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        projectId: '1',
        taskId: id,
        revision,
        requestId: randomUUID(),
        command: 'comment',
        ...body,
      }),
    });
  };

  // A started task takes images only, for a task that exists.
  const first = await upload(admin, taskId);
  expect(first.status).toBe(201);
  const image = TaskMediaView.parse((await first.json()).data);
  expect(image.contentUrl).toMatch(
    new RegExp(`/uploads/task-media/${image.id}\\.png$`),
  );
  const document = await upload(
    admin,
    taskId,
    new File([docx(['Notes'])], 'notes.docx'),
  );
  expect(document.status).toBe(400);
  expect(await document.json()).toMatchObject({
    error: { reason: 'TASK_MEDIA_INVALID' },
  });
  const missing = await upload(admin, '999999');
  expect(missing.status).toBe(404);
  expect(await missing.json()).toMatchObject({
    error: { reason: 'TASK_NOT_FOUND' },
  });

  // Sent with a message, the image is the task's: listed on the message, numbered by its place.
  const sent = await advance(taskId, {
    comment: 'Image 1 circles the line to delete.',
    imageIds: [image.id],
  });
  expect(sent.status).toBe(200);
  const work = (await sent.json()).data.work;
  expect(work.history.at(-1)).toMatchObject({
    action: 'comment',
    images: [
      {
        id: image.id,
        name: 'Screenshot 10.52.png',
        ref: `/uploads/task-media/${image.id}.png`,
      },
    ],
  });
  expect(work.images).toEqual([image.id]);
  // Sending it again on the same task is fine; another task cannot take it.
  expect(
    (await advance(taskId, { comment: 'Again', imageIds: [image.id] })).status,
  ).toBe(200);
  expect(
    (await advance(otherTaskId, { comment: 'Elsewhere', imageIds: [image.id] }))
      .status,
  ).toBe(409);
  expect(
    (await advance(taskId, { comment: 'Unknown', imageIds: [randomUUID()] }))
      .status,
  ).toBe(409);

  // Whoever may read the task may see the image and add images to it; nobody else.
  const credentials = {
    email: 'image-reader@example.test',
    password: 'fictional-password-123',
  };
  const user = await container.resolve(userAdministrationServiceToken).create({
    ...credentials,
    name: 'Image reader',
  });
  const reader = await signIn(testApp, credentials);
  const content = (client: Client) =>
    testApp.fetch(
      new Request(`http://localhost${image.contentUrl}`, {
        headers: { cookie: client.cookie },
      }),
    );
  expect((await content(reader)).status).toBe(403);
  expect((await upload(reader, taskId)).status).toBe(403);
  const access = runtime.legacy.db.access!;
  const sets = container.resolve(authorizationToken).permissionSets;
  await sets.create({
    key: 'nr.image-reader',
    grants: access.grants([{ resource: 'nrTaskWork', action: 'get' }], '1'),
  });
  await sets.assign({
    permissionSet: 'nr.image-reader',
    subject: { type: 'user', id: user.id },
  });
  const read = await content(reader);
  expect(read.status).toBe(200);
  expect(Buffer.from(await read.arrayBuffer())).toEqual(png);

  // The task's runs receive it with the extension its path ends with.
  const files = await manual.forAgent(connection, '1', taskId, [image.id]);
  expect(files.map(({ name, type, ext }) => [name, type, ext])).toEqual([
    ['Screenshot 10.52.png', 'image/png', 'png'],
  ]);
  expect(await files[0].read!()).toEqual(png);
  expect(
    await manual.forAgent(connection, '1', otherTaskId, [image.id]),
  ).toEqual([]);
});
