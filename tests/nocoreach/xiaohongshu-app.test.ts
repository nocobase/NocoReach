// @vitest-environment node
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { createCollector } from '../../collectors/xiaohongshu.mjs';
import { XiaohongshuSource } from '../../server/nocoreach/xiaohongshu-source';
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const token = 'isolated-app-test-collector-token-no-account';
const collector = createCollector({
  token,
  run: async (args: string[]) =>
    args[0] === '--version'
      ? 'opencli 1.0.0'
      : JSON.stringify([
          {
            title: '隔离测试笔记',
            url: 'https://www.xiaohongshu.com/explore/69a123456789abcdef012345',
            likes: '25',
            published_at: '2026-03-01',
            author: 'not persisted',
          },
        ]),
});
await new Promise<void>((resolve) => collector.listen(0, '127.0.0.1', resolve));
const configs = [
  {
    id: 'test-browser',
    name: '仅测试的浏览器',
    platforms: ['xiaohongshu'] as ('xiaohongshu' | 'bilibili')[],
    url: `http://127.0.0.1:${(collector.address() as AddressInfo).port}`,
    token,
    projectIds: ['1'],
  },
];
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    nocoreach: { publicDns: '', browserCollectors: configs },
  },
});
afterAll(async () => {
  collector.closeAllConnections();
  await new Promise<void>((resolve) => collector.close(() => resolve()));
});
test('real application routes, database and HTTP collector complete a manual collection without external services', async ({
  testApp,
  connection,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.plugin.projects.create({
    name: '小红书测试项目',
    domain: 'example.com',
  });
  await runtime.plugin.projects.create({
    name: '无权限采集项目',
    domain: 'example.org',
  });
  const path = '/nocoreach/nrXiaohongshu/';
  const anonymous = await testApp.fetch(
    new Request(`http://localhost${testApp.publicBasePath}/api${path}status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 1 }),
    }),
  );
  expect(anonymous.status).toBe(401);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const call = (action: string, values: object = {}) =>
    admin.fetch(path + action, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ projectId: 1, ...values }),
    });
  const status = await call('status');
  expect(status.status).toBe(200);
  expect(await status.json()).toMatchObject({
    data: {
      configured: true,
      connected: false,
      collectors: [{ id: 'test-browser' }],
    },
  });
  const health = await call('test', { collectorId: 'test-browser' });
  expect(health.status).toBe(200);
  expect(await health.json()).toMatchObject({
    data: { toolInstalled: true, browser: 'unchecked', login: 'unchecked' },
  });
  const connected = await call('connect', {
    collectorId: 'test-browser',
    query: 'NocoBase',
    revision: 0,
    authorized: true,
  });
  expect(connected.status).toBe(200);
  expect(await connected.json()).toMatchObject({
    data: { connected: true, verifiedAt: null },
  });
  const searched = await call('search', { revision: 1 });
  expect(searched.status).toBe(200);
  expect(await searched.json()).toMatchObject({
    data: {
      total: 1,
      lastRun: { ok: true, count: 1 },
      notes: [{ title: '隔离测试笔记', publishedAt: null, likes: 25 }],
    },
  });
  const rows = (await connection
    .repository('nrSnapshots')
    .findMany({})) as Record<string, unknown>[];
  const stored = rows.find((entry) => entry.key === 'xiaohongshu:1');
  expect(stored).toBeTruthy();
  expect(JSON.stringify(stored)).not.toContain(token);
  expect(JSON.stringify(stored)).not.toContain('not persisted');
  // A fresh service instance reads the persisted snapshot; it does not depend on browser process memory.
  const reloaded = new XiaohongshuSource(runtime.plugin, configs);
  expect(await reloaded.view('1')).toMatchObject({ connected: true, total: 1 });
  expect(
    (
      await call('connect', {
        collectorId: 'test-browser',
        query: 'NocoBase',
        revision: 0,
        authorized: true,
        projectId: 2,
      })
    ).status,
  ).toBe(409);
  expect((await call('disconnect', { revision: 1 })).status).toBe(200);
  expect(await (await call('view')).json()).toMatchObject({
    data: { connected: false, total: 1 },
  });
});
