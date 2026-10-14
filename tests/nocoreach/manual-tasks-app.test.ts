// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import { manualTasksToken } from '../../server/providers/manual-tasks.js';
import type { TaskService } from '../../server/nocoreach/execution/service.js';
import { ManualTaskInput, TASK_MEDIA_LIMIT } from '../../shared/manual-task.js';
import { databaseManagerToken } from '@nocobase/db';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { ManualTasks } from '../../server/nocoreach/manual-tasks.js';
import { validateTaskMedia } from '../../server/nocoreach/manual-tasks.js';
import type { TaskMediaRecord } from '../../server/nocoreach/manual-tasks.js';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
type Client = Awaited<ReturnType<typeof signIn>>;
const input = () => ({
  projectId: '1',
  title: 'Manual task',
  description: 'Multiline\ncompletion criteria',
  requestId: randomUUID(),
  attachmentIds: [] as string[],
});
function create(
  client: Client,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return client.fetch('/nocoreachTasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6n6AAAAAASUVORK5CYII=',
  'base64',
);
function upload(
  client: Client,
  draft: string,
  file = new File([png], '<script>.png', { type: 'image/png' }),
  project = '1',
) {
  const body = new FormData();
  body.set('file', file);
  return client.fetch(
    `/nocoreachTasks/media?projectId=${project}&requestId=${draft}`,
    { method: 'POST', headers: { origin: 'http://localhost' }, body },
  );
}

test('manual create is authorized, strictly validated, atomic, idempotent and does not enqueue execution', async ({
  testApp,
  connection,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  const execution = (
    runtime.plugin as unknown as { taskExecution: TaskService }
  ).taskExecution;
  execution.stop();
  const enqueue = vi.spyOn(execution.runtime, 'enqueue');
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  await runtime.plugin.projects.create({
    name: 'Manual tests',
    domain: 'manual.example.com',
  });
  const anonymous = await testApp.fetch(
    new Request(
      `http://localhost${testApp.publicBasePath}/api/nocoreachTasks`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input()),
      },
    ),
  );
  expect(anonymous.status).toBe(401);
  const credentials = {
    email: 'manual-outsider@example.test',
    password: 'fictional-password-123',
  };
  await testApp.application.container
    .resolve(userAdministrationServiceToken)
    .create({ ...credentials, name: 'Outsider' });
  const outsider = await signIn(testApp, credentials);
  expect((await create(outsider, {})).status).toBe(403);
  for (const invalid of [
    { ...input(), title: '' },
    { ...input(), description: '' },
    { ...input(), creatorId: 'forged' },
    { ...input(), status: 'done' },
    { ...input(), work: { stage: 'done' } },
    { ...input(), requestId: 'invalid' },
    {
      ...input(),
      attachmentIds: [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ],
    },
  ])
    expect((await create(admin, invalid)).status).toBe(400);
  expect((await create(admin, { ...input(), projectId: '999' })).status).toBe(
    404,
  );
  expect(
    (
      await create(admin, input(), {
        'X-NocoReach-Task-Session': 'a-different-session',
      })
    ).status,
  ).toBe(409);
  const body = input();
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => create(admin, body)),
  );
  for (const response of responses) expect(response.status).toBe(201);
  const payloads = await Promise.all(
    responses.map((response) => response.json()),
  );
  expect(new Set(payloads.map((value) => value.data.id)).size).toBe(1);
  const task = payloads[0].data;
  expect(task).toMatchObject({
    source: 'manual',
    number: 'T-1',
    brief: body.description,
    status: '待处理',
  });
  expect(typeof task.id).toBe('string');
  expect((await create(admin, { ...body, title: 'Different' })).status).toBe(
    409,
  );
  expect(
    (
      await connection
        .repository('nrTasks')
        .findMany({ filter: { projectId: '1' } })
    ).length,
  ).toBe(1);
  const detail = await admin.fetch('/nocoreach/nrTaskWork/get', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ projectId: '1', taskId: task.id }),
  });
  expect(detail.status).toBe(200);
  const persisted = await detail.json();
  expect(persisted.data.work).toMatchObject({
    schemaVersion: 2,
    revision: 0,
    stage: 'plan',
    plan: null,
    results: [],
    operations: [],
  });
  expect(persisted.data.work.humanOwnerId).toBe(
    persisted.data.task.evidence.createdBy.id,
  );
  // Independent service instances bypass the local per-key queue: the database
  // unique constraint remains the authoritative idempotency boundary.
  const container = testApp.application.container;
  const second = new ManualTasks(
    runtime,
    container.resolve(databaseManagerToken),
    container.resolve(serverFileRepositoryManagerToken),
    container.resolve(driveManagerToken),
    testApp.publicBasePath,
  );
  const first = container.resolve(manualTasksToken);
  const actor = {
    id: String(persisted.data.task.evidence.createdBy.id),
    name: 'Admin',
    sessionId: 'parallel-test',
  };
  const concurrent = input();
  const racing = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      (index % 2 ? first : second).create(actor, concurrent),
    ),
  );
  expect(new Set(racing.map((value) => value.id)).size).toBe(1);
  expect(
    await connection
      .repository('nrTasks')
      .count({ filter: { projectId: '1' } }),
  ).toBe(2);
  expect(enqueue).not.toHaveBeenCalled();
  const manifest = await admin.fetch('/cli/manifest');
  expect(manifest.status).toBe(200);
  const text = JSON.stringify(await manifest.json());
  expect(text).toContain('task create');
  expect(text).toContain('contentFile');
});

test('private media enforces ownership, project, session, draft, limits and persistent linking', async ({
  testApp,
  connection,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  (
    runtime.plugin as unknown as { taskExecution: TaskService }
  ).taskExecution.stop();
  await runtime.plugin.projects.create({
    name: 'Media tests',
    domain: 'media.example.com',
  });
  await runtime.plugin.projects.create({
    name: 'Other project',
    domain: 'other.example.com',
  });
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const draft = randomUUID();
  const extensionlessDraft = randomUUID();
  const extensionless = await upload(
    admin,
    extensionlessDraft,
    new File([png], 'clipboard', { type: 'image/png' }),
  );
  expect(extensionless.status).toBe(201);
  const extensionlessFile = (await extensionless.json()).data;
  expect(extensionlessFile.contentUrl).not.toMatch(/\.$/);
  expect(
    (
      await create(admin, {
        ...input(),
        requestId: extensionlessDraft,
        attachmentIds: [extensionlessFile.id],
      })
    ).status,
  ).toBe(201);
  const extensionlessRead = await testApp.fetch(
    new Request(`http://localhost${extensionlessFile.contentUrl}`, {
      headers: { cookie: admin.cookie },
    }),
  );
  expect(extensionlessRead.status).toBe(200);
  expect(Buffer.from(await extensionlessRead.arrayBuffer())).toEqual(png);
  const taskCount = await connection
    .repository('nrTasks')
    .count({ filter: { projectId: '1' } });

  expect(
    (
      await upload(
        admin,
        draft,
        new File(['not png'], 'fake.png', { type: 'image/png' }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await upload(
        admin,
        draft,
        new File(['<svg/>'], 'active.svg', { type: 'image/svg+xml' }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await upload(
        admin,
        draft,
        new File([new Uint8Array(TASK_MEDIA_LIMIT + 1)], 'large.png', {
          type: 'image/png',
        }),
      )
    ).status,
  ).toBe(400);
  const uploaded = await upload(admin, draft);
  expect(uploaded.status).toBe(201);
  const file = (await uploaded.json()).data;
  expect(file.contentUrl).not.toContain('blob:');
  expect(
    (
      await create(admin, {
        ...input(),
        requestId: draft,
        projectId: '2',
        attachmentIds: [file.id],
      })
    ).status,
  ).toBe(403);
  expect(
    (await create(admin, { ...input(), attachmentIds: [file.id] })).status,
  ).toBe(403);
  expect(
    await connection
      .repository('nrTasks')
      .count({ filter: { projectId: '1' } }),
  ).toBe(taskCount);
  const outsiderCredentials = {
    email: 'media-other@example.test',
    password: 'fictional-password-123',
  };
  const otherUser = await testApp.application.container
    .resolve(userAdministrationServiceToken)
    .create({ ...outsiderCredentials, name: 'Other member' });
  await runtime.legacy.db.getRepository('nrSnapshots').create({
    values: {
      key: 'nr-members',
      payload: { users: { [String(otherUser.id)]: 'member' } },
    },
  });
  const other = await signIn(testApp, outsiderCredentials);
  expect(
    (
      await testApp.fetch(
        new Request(`http://localhost${file.contentUrl}`, {
          headers: { cookie: other.cookie },
        }),
      )
    ).status,
  ).toBe(403);
  const denied = await create(other, {
    ...input(),
    requestId: draft,
    attachmentIds: [file.id],
  });
  expect(denied.status).toBe(403);
  const freshSession = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  expect(
    (
      await testApp.fetch(
        new Request(`http://localhost${file.contentUrl}`, {
          headers: { cookie: freshSession.cookie },
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await create(freshSession, {
        ...input(),
        requestId: draft,
        attachmentIds: [file.id],
      })
    ).status,
  ).toBe(403);
  const body = { ...input(), requestId: draft, attachmentIds: [file.id] };
  const created = await create(admin, body);
  expect(created.status).toBe(201);
  const task = (await created.json()).data;
  expect(
    (await admin.fetch(`/nocoreachTasks/${task.id}/media?projectId=2`)).status,
  ).toBe(404);
  expect((await create(admin, body)).status).toBe(201);
  const media = await admin.fetch(
    `/nocoreachTasks/${task.id}/media?projectId=1`,
  );
  expect((await media.json()).data[0]).toMatchObject({
    id: file.id,
    mimeType: 'image/png',
  });
  const bytes = await testApp.fetch(
    new Request(`http://localhost${file.contentUrl}`, {
      headers: { cookie: admin.cookie },
    }),
  );
  expect(bytes.status).toBe(200);
  expect(bytes.headers.get('x-content-type-options')).toBe('nosniff');
  expect(Buffer.from(await bytes.arrayBuffer())).toEqual(png);
  const range = await testApp.fetch(
    new Request(`http://localhost${file.contentUrl}`, {
      headers: { cookie: admin.cookie, range: 'bytes=2-7' },
    }),
  );
  expect(range.status).toBe(206);
  expect(range.headers.get('content-range')).toBe(`bytes 2-7/${png.length}`);
  expect(Buffer.from(await range.arrayBuffer())).toEqual(png.subarray(2, 8));
  const suffix = await testApp.fetch(
    new Request(`http://localhost${file.contentUrl}`, {
      headers: { cookie: admin.cookie, range: 'bytes=-5' },
    }),
  );
  expect(suffix.status).toBe(206);
  expect(Buffer.from(await suffix.arrayBuffer())).toEqual(png.subarray(-5));
  for (const invalid of [
    'bytes=9999-',
    'bytes=7-2',
    'bytes=-0',
    'bytes=0-1,4-5',
  ]) {
    const response = await testApp.fetch(
      new Request(`http://localhost${file.contentUrl}`, {
        headers: { cookie: admin.cookie, range: invalid },
      }),
    );
    expect(response.status).toBe(416);
  }
  expect(
    (await testApp.fetch(new Request(`http://localhost${file.contentUrl}`)))
      .status,
  ).toBe(401);
  expect(
    (
      await admin.fetch(`/nocoreachTasks/media/${file.id}`, {
        method: 'DELETE',
        headers: { origin: 'http://localhost' },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await connection
        .repository<TaskMediaRecord>('nrTaskMedia')
        .findOne({ filter: { id: file.id } })
    )?.taskId,
  ).toBe(task.id);
  const quotaDraft = randomUUID();
  const uploads = await Promise.all(
    Array.from({ length: 8 }, () => upload(admin, quotaDraft)),
  );
  expect(uploads.filter((response) => response.status === 201)).toHaveLength(5);
  expect(uploads.filter((response) => response.status === 429)).toHaveLength(3);
  const service = testApp.application.container.resolve(manualTasksToken);
  const pending = await connection
    .repository<TaskMediaRecord>('nrTaskMedia')
    .findMany({ filter: { draftId: quotaDraft } });
  await connection.repository('nrTaskMedia').updateMany({
    filter: { draftId: quotaDraft },
    values: { expiresAt: new Date(0) },
  });
  await service.cleanup();
  for (const entry of pending)
    expect(
      await connection
        .repository('nrTaskMedia')
        .findOne({ filter: { id: entry.id } }),
    ).toBeUndefined();
  expect(
    await connection
      .repository('nrTaskMedia')
      .findOne({ filter: { id: file.id } }),
  ).toBeDefined();

  // Compete for the same file through actual database operations. Creation
  // must never commit a task whose file was claimed for deletion.
  for (let index = 0; index < 4; index++) {
    const draft = randomUUID();
    const response = await upload(admin, draft);
    expect(response.status).toBe(201);
    const uploaded = (await response.json()).data;
    const row = await connection
      .repository<TaskMediaRecord>('nrTaskMedia')
      .findOne({ filter: { id: uploaded.id } });
    expect(row).toBeDefined();
    if (!row) throw new Error('Missing upload');
    const actor = { id: row.ownerId, name: 'Admin', sessionId: row.sessionId };
    const [created] = await Promise.allSettled([
      service.create(actor, {
        ...input(),
        requestId: draft,
        attachmentIds: [uploaded.id],
      }),
      service.discard(actor, uploaded.id),
    ]);
    const stored = await connection
      .repository<TaskMediaRecord>('nrTaskMedia')
      .findOne({ filter: { id: uploaded.id } });
    if (created.status === 'fulfilled')
      expect(stored?.taskId).toBe(created.value.id);
    else
      expect(
        await connection
          .repository('nrTasks')
          .findOne({ filter: { taskKey: `manual:${actor.id}:${draft}` } }),
      ).toBeUndefined();
  }
});

test('input and binary validation reject active or mislabeled media', async () => {
  expect(
    ManualTaskInput.safeParse({ ...input(), attachmentIds: ['same', 'same'] })
      .success,
  ).toBe(false);
  await expect(
    validateTaskMedia(
      new File(['video'], 'renamed.mp4', { type: 'video/mp4' }),
    ),
  ).rejects.toMatchObject({ reason: 'TASK_MEDIA_SIGNATURE' });
  await expect(
    validateTaskMedia(new File([], 'empty.png', { type: 'image/png' })),
  ).rejects.toMatchObject({ reason: 'TASK_MEDIA_INVALID' });
});
