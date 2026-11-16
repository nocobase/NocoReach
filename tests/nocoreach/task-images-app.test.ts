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
// message that carries them, then readable as the task is and handed to its runs. Documents too (2026-11-15): the
// ones a new task takes, checked the same way, linked by the message or change request they are sent with.
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

test('message images and documents upload for the task, link once with the message, follow the task’s read grants and reach its runs', async ({
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

  // A started task takes images and the documents a new task takes, checked the same way, for a task that exists.
  const first = await upload(admin, taskId);
  expect(first.status).toBe(201);
  const image = TaskMediaView.parse((await first.json()).data);
  expect(image.contentUrl).toMatch(
    new RegExp(`/uploads/task-media/${image.id}\\.png$`),
  );
  const stored = async (file: File) => {
    const response = await upload(admin, taskId, file);
    expect(response.status, file.name).toBe(201);
    return TaskMediaView.parse((await response.json()).data);
  };
  const notes = await stored(
      new File(['# Terms\n\nSay NocoBase 3.'], 'notes.md'),
    ),
    feedback = await stored(
      new File(['Shorter title, please.'], '新建文本文档 (2).txt', {
        type: 'text/plain',
      }),
    ),
    brief = await stored(new File([docx(['Notes'])], 'brief.docx'));
  expect([notes.mimeType, feedback.mimeType, brief.mimeType]).toEqual([
    'text/markdown',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);
  for (const [file, reason] of [
    // No videos: a run never receives them.
    [
      new File(
        [
          Buffer.concat([
            Buffer.from([0, 0, 0, 24]),
            Buffer.from('ftypisom'),
            Buffer.alloc(16),
          ]),
        ],
        'demo.mp4',
        { type: 'video/mp4' },
      ),
      'TASK_MEDIA_INVALID',
    ],
    [
      new File(['PK'], 'site.zip', { type: 'application/zip' }),
      'TASK_MEDIA_INVALID',
    ],
    // Text in another encoding (GBK) is named as such, as on New task.
    [
      new File([Buffer.from([0xc4, 0xe3, 0xba, 0xc3])], 'gbk.txt', {
        type: 'text/plain',
      }),
      'TASK_MEDIA_TEXT_ENCODING',
    ],
    [new File(['x'], 'old.doc'), 'TASK_MEDIA_LEGACY_FORMAT'],
    [new File(['not a pdf'], 'fake.pdf'), 'TASK_MEDIA_SIGNATURE'],
  ] as const) {
    const refused = await upload(admin, taskId, file);
    expect(refused.status, file.name).toBe(400);
    expect(await refused.json()).toMatchObject({ error: { reason } });
  }
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

  // Documents go with a message as images do, of their own kind, ten files a message at most.
  for (const [body, status] of [
    [{ imageIds: [notes.id] }, 409],
    [{ documentIds: [image.id] }, 409],
    [{ documentIds: [notes.id, notes.id] }, 400],
    [
      {
        imageIds: [image.id],
        documentIds: Array.from({ length: 10 }, () => randomUUID()),
      },
      400,
    ],
    [{ documentIds: [randomUUID()] }, 409],
  ] as const)
    expect(
      (await advance(taskId, { comment: 'Files', ...body })).status,
      JSON.stringify(body),
    ).toBe(status);
  const withDocuments = await advance(taskId, {
    comment: 'Use the terms in notes.md and the title in the text file.',
    imageIds: [image.id],
    documentIds: [notes.id, feedback.id],
  });
  expect(withDocuments.status).toBe(200);
  const documentWork = (await withDocuments.json()).data.work;
  expect(documentWork.history.at(-1)).toMatchObject({
    action: 'comment',
    images: [{ id: image.id }],
    documents: [
      {
        id: notes.id,
        name: 'notes.md',
        ref: `/uploads/task-media/${notes.id}.md`,
        type: 'text/markdown',
        size: notes.size,
      },
      {
        id: feedback.id,
        name: '新建文本文档 (2).txt',
        ref: `/uploads/task-media/${feedback.id}.txt`,
        type: 'text/plain',
        size: feedback.size,
      },
    ],
  });
  expect(documentWork.documents).toEqual([notes.id, feedback.id]);
  expect(documentWork.images).toEqual([image.id]);
  // Another task cannot take them.
  expect(
    (
      await advance(otherTaskId, {
        comment: 'Elsewhere',
        documentIds: [notes.id],
      })
    ).status,
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
  // A document downloads, as a new task's do; one never sent stays its uploader's.
  const download = await testApp.fetch(
    new Request(`http://localhost${feedback.contentUrl}`, {
      headers: { cookie: reader.cookie },
    }),
  );
  expect(download.status).toBe(200);
  expect(download.headers.get('content-disposition')).toMatch(/^attachment;/);
  expect(await download.text()).toBe('Shorter title, please.');
  expect(
    (
      await testApp.fetch(
        new Request(`http://localhost${brief.contentUrl}`, {
          headers: { cookie: reader.cookie },
        }),
      )
    ).status,
  ).toBe(403);

  // The task's runs receive it with the extension its path ends with.
  const files = await manual.forAgent(connection, '1', taskId, [image.id]);
  expect(files.map(({ name, type, ext }) => [name, type, ext])).toEqual([
    ['Screenshot 10.52.png', 'image/png', 'png'],
  ]);
  expect(await files[0].read!()).toEqual(png);
  expect(
    await manual.forAgent(connection, '1', otherTaskId, [image.id]),
  ).toEqual([]);
  // And the documents, with their names and types, for the runs that read the message.
  const documents = await manual.forAgent(connection, '1', taskId, [
    notes.id,
    feedback.id,
  ]);
  expect(documents.map(({ name, type, ext }) => [name, type, ext])).toEqual([
    ['notes.md', 'text/markdown', 'md'],
    ['新建文本文档 (2).txt', 'text/plain', 'txt'],
  ]);
  expect((await documents[1].read!()).toString()).toBe(
    'Shorter title, please.',
  );
});
