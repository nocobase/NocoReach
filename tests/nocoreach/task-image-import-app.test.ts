// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import type { TaskService } from '../../server/nocoreach/execution/service.js';
import { download } from '../../server/nocoreach/public-sources.js';
import { TASK_MEDIA_LIMIT, TaskMediaView } from '../../shared/manual-task.js';

// An image pasted into the article body from another site (2026-11-12 user report: pasted images broke after a
// refresh) is copied from its address by the server and stored as the task's image. The read itself is the public
// download every collector uses (public addresses only, pinned on each hop, the website egress); here it is replaced
// so the route can be checked without the network.
vi.mock('../../server/nocoreach/public-sources.js', async (original) => ({
  ...(await original<
    typeof import('../../server/nocoreach/public-sources.js')
  >()),
  download: vi.fn(),
}));
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
const json = { 'Content-Type': 'application/json', origin: 'http://localhost' };
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6n6AAAAAASUVORK5CYII=',
  'base64',
);

test('a pasted image is copied from its address into the task’s images, and one that cannot be is refused with why', async ({
  testApp,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  (
    runtime.plugin as unknown as { taskExecution: TaskService }
  ).taskExecution.stop();
  await runtime.plugin.projects.create({
    name: 'Image import tests',
    domain: 'images.example.test',
  });
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
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
  const taskId = String((await created.json()).data.id);
  const read = vi.mocked(download);
  const copy = (url: string, task: string | null = taskId) =>
    admin.fetch(
      `/nocoreachTasks/media/import?projectId=1&requestId=${randomUUID()}${task ? `&taskId=${task}` : ''}`,
      { method: 'POST', headers: json, body: JSON.stringify({ url }) },
    );

  // Read through the website egress, over HTTPS, from whichever host the image's address leads to; stored by what
  // its bytes are, named after its address.
  read.mockResolvedValueOnce({ body: png } as never);
  const copied = await copy('http://cdn.example.org/media/team%20photo?x=1');
  expect(copied.status).toBe(201);
  const image = TaskMediaView.parse((await copied.json()).data);
  expect(image).toMatchObject({
    filename: 'team-photo.png',
    mimeType: 'image/png',
  });
  expect(image.contentUrl).toMatch(
    new RegExp(`/uploads/task-media/${image.id}\\.png$`),
  );
  const [address, hops, transport] = read.mock.calls[0]!;
  expect(String(address)).toBe(
    'https://cdn.example.org/media/team%20photo?x=1',
  );
  expect(hops).toBe(0);
  expect(transport).toMatchObject({
    connection: 'site',
    anyHost: true,
    limit: TASK_MEDIA_LIMIT,
    accept: expect.stringMatching(/^image\//),
  });

  // Something other than an image, an address that cannot be read, or one that is not on the web.
  read.mockResolvedValueOnce({ body: Buffer.from('<html></html>') } as never);
  const page = await copy('https://cdn.example.org/not-an-image');
  expect(page.status).toBe(400);
  expect(await page.json()).toMatchObject({
    error: { reason: 'TASK_MEDIA_INVALID' },
  });
  read.mockRejectedValueOnce(new Error('HTTP 403'));
  const refused = await copy(
    'https://internal-api-drive-stream.feishu.cn/download/x?token=secret',
  );
  expect(refused.status).toBe(503);
  const why = await refused.json();
  expect(why).toMatchObject({
    error: {
      reason: 'TASK_MEDIA_IMPORT_FAILED',
      metadata: { host: 'internal-api-drive-stream.feishu.cn' },
    },
  });
  expect(JSON.stringify(why)).not.toContain('secret');
  const calls = read.mock.calls.length;
  expect((await copy('ftp://cdn.example.org/team.png')).status).toBe(400);
  expect((await copy('https://cdn.example.org/team.png', null)).status).toBe(
    400,
  );
  expect(
    (await copy('https://cdn.example.org/team.png', '999999')).status,
  ).toBe(404);
  expect(read.mock.calls.length).toBe(calls);
});
