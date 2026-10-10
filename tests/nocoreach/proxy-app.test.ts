// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
test('proxy actions persist encrypted profiles, enforce authentication and reload after startup', async ({
  testApp,
  connection,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const path = '/nocoreach/nrProxyProfiles/';
  const anonymous = await testApp.fetch(
    new Request(`http://localhost${testApp.publicBasePath}/api${path}list`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  );
  expect(anonymous.status).toBe(401);
  const call = (action: string, body: object = {}) =>
    admin.fetch(path + action, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify(body),
    });
  const saved = await call('save', {
    name: '测试出口',
    url: 'http://localhost:7890',
    username: 'test',
    password: 'secret-proxy-password',
  });
  expect(
    saved.status,
    saved.status === 200 ? undefined : await saved.clone().text(),
  ).toBe(200);
  const payload = (await saved.json()) as {
    data: { id: string; hasPassword: boolean };
  };
  expect(payload.data.hasPassword).toBe(true);
  expect(JSON.stringify(payload)).not.toContain('secret-proxy-password');
  const stored = (await connection
    .repository('nrVariables')
    .findMany({})) as Record<string, unknown>[];
  const row = stored.find((r) => r.name === 'NOREACH_PROXY_PROFILES');
  expect(row?.secret).toBe(true);
  expect(row?.value).not.toContain('secret-proxy-password');
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.variables.load();
  expect(runtime.plugin.proxyProfiles.profile(payload.data.id).password).toBe(
    'secret-proxy-password',
  );
  expect(
    (await call('save', { name: 'bad', url: 'socks5://localhost:1234' }))
      .status,
  ).toBe(400);
  expect((await call('remove', { id: payload.data.id })).status).toBe(200);
  expect(await (await call('list')).json()).toEqual({ data: [] });
});
