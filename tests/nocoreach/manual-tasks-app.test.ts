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
import {
  ManualTaskInput,
  TaskMediaView,
  TASK_MEDIA_LIMIT,
} from '../../shared/manual-task.js';
import { databaseManagerToken } from '@nocobase/db';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { ManualTasks } from '../../server/nocoreach/manual-tasks.js';
import { validateTaskMedia } from '../../server/nocoreach/manual-tasks.js';
import type { TaskMediaRecord } from '../../server/nocoreach/manual-tasks.js';
import { roleOf } from '../../server/nocoreach/policy.js';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';

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
  await testApp.application.container
    .resolve(authorizationToken)
    .permissionSets.assign({
      permissionSet: 'nr.member',
      subject: { type: 'user', id: String(otherUser.id) },
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

test('linked media follows task read grants while drafts require creation and their owning session', async ({
  testApp,
}) => {
  const container = testApp.application.container;
  const runtime = container.resolve(nocoReachToken);
  runtime.plugin.taskExecution.stop();
  const access = runtime.legacy.db.access!;
  const sets = container.resolve(authorizationToken).permissionSets;
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const linked: { taskId: string; file: TaskMediaView }[] = [];
  for (const projectId of ['1', '2']) {
    await runtime.plugin.projects.create({
      name: `Attachment access ${projectId}`,
      domain: `attachment-${projectId}.example.test`,
    });
    const requestId = randomUUID();
    const uploaded = await upload(admin, requestId, undefined, projectId);
    expect(uploaded.status).toBe(201);
    const file = TaskMediaView.parse((await uploaded.json()).data);
    const created = await create(admin, {
      ...input(),
      projectId,
      requestId,
      attachmentIds: [file.id],
    });
    expect(created.status).toBe(201);
    linked.push({ taskId: (await created.json()).data.id, file });
  }
  const [first, second] = linked;
  const credentials = {
    email: 'attachment-reader@example.test',
    password: 'fictional-password-123',
  };
  const user = await container.resolve(userAdministrationServiceToken).create({
    ...credentials,
    name: 'Attachment reader',
  });
  const reader = await signIn(testApp, credentials);
  const content = (file: TaskMediaView, headers: Record<string, string>) =>
    testApp.fetch(
      new Request(`http://localhost${file.contentUrl}`, { headers }),
    );
  const listPath = (taskId: string, projectId: string) =>
    `/nocoreachTasks/${taskId}/media?projectId=${projectId}`;
  const detail = () =>
    reader.fetch('/nocoreach/nrTaskWork/get', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ taskId: first.taskId, projectId: '1' }),
    });
  expect((await reader.fetch(listPath(first.taskId, '1'))).status).toBe(403);
  expect((await content(first.file, { cookie: reader.cookie })).status).toBe(
    403,
  );
  await sets.create({
    key: 'nr.attachment-reader',
    grants: access.grants([{ resource: 'nrTaskWork', action: 'get' }], '1'),
  });
  await sets.assign({
    permissionSet: 'nr.attachment-reader',
    subject: { type: 'user', id: user.id },
  });
  expect((await detail()).status).toBe(200);
  const readableList = await reader.fetch(listPath(first.taskId, '1'));
  expect(readableList.status).toBe(200);
  expect((await readableList.json()).data).toEqual([first.file]);
  const readableContent = await content(first.file, { cookie: reader.cookie });
  expect(readableContent.status).toBe(200);
  expect(Buffer.from(await readableContent.arrayBuffer())).toEqual(png);
  expect((await reader.fetch(listPath(second.taskId, '2'))).status).toBe(403);
  expect((await content(second.file, { cookie: reader.cookie })).status).toBe(
    403,
  );
  expect((await reader.fetch(listPath(second.taskId, '1'))).status).toBe(404);
  expect((await upload(reader, randomUUID())).status).toBe(403);

  // Changing a role takes effect on the next request, without a new session.
  await sets.update('nr.attachment-reader', {
    key: 'nr.attachment-reader',
    grants: access.grants(
      [{ resource: 'nrTasks', action: 'createManual' }],
      '1',
    ),
  });
  expect((await detail()).status).toBe(403);
  expect((await reader.fetch(listPath(first.taskId, '1'))).status).toBe(403);
  expect((await content(first.file, { cookie: reader.cookie })).status).toBe(
    403,
  );
  expect((await create(reader, input())).status).toBe(201);
  const draftId = randomUUID();
  const uploaded = await upload(reader, draftId);
  expect(uploaded.status).toBe(201);
  const draft = TaskMediaView.parse((await uploaded.json()).data);
  expect((await content(draft, { cookie: reader.cookie })).status).toBe(200);
  const otherSession = await signIn(testApp, credentials);
  for (const client of [otherSession, admin]) {
    expect((await content(draft, { cookie: client.cookie })).status).toBe(403);
    expect(
      (
        await create(client, {
          ...input(),
          requestId: draftId,
          attachmentIds: [draft.id],
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await client.fetch(`/nocoreachTasks/media/${draft.id}`, {
          method: 'DELETE',
          headers: { origin: 'http://localhost' },
        })
      ).status,
    ).toBe(403);
  }
  await sets.update('nr.attachment-reader', {
    key: 'nr.attachment-reader',
    grants: access.grants([{ resource: 'nrTaskWork', action: 'get' }], '1'),
  });
  expect((await content(draft, { cookie: reader.cookie })).status).toBe(403);
  expect(
    (
      await reader.fetch(`/nocoreachTasks/media/${draft.id}`, {
        method: 'DELETE',
        headers: { origin: 'http://localhost' },
      })
    ).status,
  ).toBe(403);

  // Attachment routes retain their session-only policy, including for root keys.
  const issued = await admin.fetch('/nocoreachKeys', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({
      name: 'Attachment read key',
      type: 'personal',
      scope: {
        groups: { 'nocoreach.business': { level: 'read', objects: ['1'] } },
      },
    }),
  });
  expect(issued.status).toBe(200);
  const keyHeaders = { 'x-api-key': (await issued.json()).data.secret };
  const keyList = (taskId: string, projectId: string) =>
    testApp.fetch(
      new Request(
        `http://localhost${testApp.publicBasePath}/api${listPath(taskId, projectId)}`,
        { headers: keyHeaders },
      ),
    );
  const keyListResponse = await keyList(first.taskId, '1');
  expect(keyListResponse.status).toBe(403);
  expect(await keyListResponse.json()).toMatchObject({
    error: { reason: 'SCOPED_KEY_FORBIDDEN' },
  });
  const keyContent = await content(first.file, keyHeaders);
  expect(keyContent.status).toBe(403);
  expect(await keyContent.json()).toMatchObject({
    error: { reason: 'SCOPED_KEY_FORBIDDEN' },
  });
  for (const [projectId, expected] of [
    ['1', 200],
    ['2', 403],
  ] as const) {
    const response = await testApp.fetch(
      new Request(
        `http://localhost${testApp.publicBasePath}/api/nocoreach/nrTaskWork/list`,
        {
          method: 'POST',
          headers: { ...keyHeaders, 'content-type': 'application/json' },
          body: JSON.stringify({ projectId }),
        },
      ),
    );
    expect(response.status).toBe(expected);
  }
  expect((await keyList(second.taskId, '2')).status).toBe(403);
  expect((await content(second.file, keyHeaders)).status).toBe(403);
  expect(
    (await content(second.file, { ...keyHeaders, cookie: admin.cookie }))
      .status,
  ).toBe(403);
  expect(
    (await content(draft, { ...keyHeaders, cookie: reader.cookie })).status,
  ).toBe(403);
  expect((await create(admin, input(), keyHeaders)).status).toBe(403);
});

test('retries durable draft deletion claims before expiry and reclaims quota without allowing reads or links', async ({
  testApp,
  connection,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  (
    runtime.plugin as unknown as { taskExecution: TaskService }
  ).taskExecution.stop();
  await runtime.plugin.projects.create({
    name: 'Deletion retries',
    domain: 'deletion.example.test',
  });
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const otherCredentials = {
    email: 'deletion-other@example.test',
    password: 'fictional-password-123',
  };
  const otherUser = await testApp.application.container
    .resolve(userAdministrationServiceToken)
    .create({ ...otherCredentials, name: 'Other deletion member' });
  await testApp.application.container
    .resolve(authorizationToken)
    .permissionSets.assign({
      permissionSet: 'nr.member',
      subject: { type: 'user', id: String(otherUser.id) },
    });
  expect(await roleOf(runtime.legacy.db, String(otherUser.id))).toBe('member');
  const other = await signIn(testApp, otherCredentials);
  const freshSession = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const service = testApp.application.container.resolve(manualTasksToken);
  const media = connection.repository<TaskMediaRecord>('nrTaskMedia');
  const disk = testApp.application.container
    .resolve(driveManagerToken)
    .use('local');
  const deleteStored = disk.delete.bind(disk);
  const draft = randomUUID();
  const records: TaskMediaView[] = [];
  const taskCount = await connection
    .repository('nrTasks')
    .count({ filter: { projectId: '1' } });
  for (let index = 0; index < 5; index++) {
    const response = await upload(admin, draft);
    expect(response.status).toBe(201);
    records.push(TaskMediaView.parse((await response.json()).data));
  }
  const discard = (client: Client, id: string) =>
    client.fetch(`/nocoreachTasks/media/${id}`, {
      method: 'DELETE',
      headers: { origin: 'http://localhost' },
    });
  const first = records[0]!;
  const stored = await media.findOne({ filter: { id: first.id } });
  if (!stored) throw new Error('Missing upload');
  expect(new Date(stored.expiresAt).getTime()).toBeGreaterThan(Date.now());
  const deletion = vi.spyOn(disk, 'delete');
  try {
    deletion.mockRejectedValueOnce(
      new Error('Temporary storage deletion failure'),
    );
    expect((await discard(admin, first.id)).status).toBe(500);
    expect(await media.findOne({ filter: { id: first.id } })).toMatchObject({
      deleting: true,
      taskId: null,
    });
    expect((await upload(admin, draft)).status).toBe(429);
    for (const client of [other, freshSession]) {
      const denied = await discard(client, first.id);
      expect(denied.status).toBe(403);
      expect(await denied.json()).toMatchObject({
        error: { reason: 'TASK_MEDIA_DELETE_DENIED' },
      });
    }
    expect(deletion).toHaveBeenCalledTimes(1);
    await expect(
      service.read(
        { id: stored.ownerId, name: 'Admin', sessionId: stored.sessionId },
        first.id,
      ),
    ).rejects.toMatchObject({ reason: 'TASK_MEDIA_NOT_FOUND' });
    const taskInput = {
      ...input(),
      requestId: draft,
      attachmentIds: [first.id],
    };
    expect((await create(admin, taskInput)).status).toBe(403);
    expect(
      await connection
        .repository('nrTasks')
        .count({ filter: { projectId: '1' } }),
    ).toBe(taskCount);
    expect((await discard(admin, first.id)).status).toBe(200);
    expect(await media.findOne({ filter: { id: first.id } })).toBeUndefined();
    expect((await discard(admin, first.id)).status).toBe(404);
    expect((await upload(admin, draft)).status).toBe(201);

    // Storage may have deleted the bytes before reporting failure. The durable
    // claim must still prevent linking; the installed FS disk retries ENOENT.
    const second = records[1]!;
    deletion.mockImplementationOnce(async (key) => {
      await deleteStored(key);
      throw new Error('Deletion response lost after removing bytes');
    });
    expect((await discard(admin, second.id)).status).toBe(500);
    expect(
      await disk.exists(
        (await media.findOne({ filter: { id: second.id } }))!.key,
      ),
    ).toBe(false);
    expect(
      (await create(admin, { ...taskInput, attachmentIds: [second.id] }))
        .status,
    ).toBe(403);
    deletion.mockRejectedValueOnce(new Error('Storage still unavailable'));
    await service.cleanup();
    expect(await media.findOne({ filter: { id: second.id } })).toMatchObject({
      deleting: true,
    });
    await service.cleanup();
    expect(await media.findOne({ filter: { id: second.id } })).toBeUndefined();
    expect((await discard(admin, second.id)).status).toBe(404);
    expect((await upload(admin, draft)).status).toBe(201);

    // Background cleanup must neither remove unclaimed fresh uploads nor linked
    // files, even if a stale or corrupt deletion flag is present on the latter.
    const linked = records[2]!;
    expect(
      (await create(admin, { ...taskInput, attachmentIds: [linked.id] }))
        .status,
    ).toBe(201);
    expect((await discard(admin, linked.id)).status).toBe(403);
    await media.updateMany({
      filter: { id: linked.id },
      values: { deleting: true },
    });
    const calls = deletion.mock.calls.length;
    await service.cleanup();
    expect(deletion).toHaveBeenCalledTimes(calls);
    expect(await media.findOne({ filter: { id: linked.id } })).toBeDefined();
    expect(
      await media.findOne({ filter: { id: records[3]!.id } }),
    ).toMatchObject({ deleting: false, taskId: null });
    await media.updateMany({
      filter: { id: linked.id },
      values: { deleting: false },
    });
  } finally {
    deletion.mockRestore();
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
