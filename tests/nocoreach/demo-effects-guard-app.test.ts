// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });

const origin = 'http://localhost';
const createTest = (enabled: boolean) =>
  createAppTest({
    createServer: createStandaloneServer,
    env: {
      ...process.env,
      NOCOBASE_TEST_DB_SQLITE_DIRECTORY: path.join(
        tmpdir(),
        `nocoreach-demo-effects-${randomUUID()}`,
      ),
    },
    server: { env: { DB_FILENAME: undefined } },
    config: {
      users: { initialAdmin: DEFAULT_ADMIN_CREDENTIALS },
      secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
      nocoreach: { publicDns: '' },
      demoMode: { enabled },
    },
  });

const provider = vi.fn<(url: string) => void>();
let listener: Server;
let baseUrl: string;

beforeAll(async () => {
  listener = createServer((request, response) => {
    provider(request.url ?? '');
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ object: 'list', data: [{ id: 'probe' }] }));
  });
  await new Promise<void>((resolve) =>
    listener.listen(0, '127.0.0.1', resolve),
  );
  baseUrl = `http://127.0.0.1:${(listener.address() as AddressInfo).port}/v1`;
});
afterAll(() => new Promise((resolve) => listener.close(resolve)));
beforeEach(() => provider.mockClear());

const connection = () => ({
  provider: 'openai-compatible',
  baseUrl,
  apiKey: 'visitor-supplied',
});

const demoTest = createTest(true);
const ordinaryTest = createTest(false);

describe('in Demo Mode', () => {
  const test = demoTest;
  test('refuses model probes and Mail writes before they reach anything outside the demo', async ({
    testApp,
  }) => {
    const entered = await testApp.request('/demoMode/accounts/signInDefault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin },
    });
    expect(entered.status).toBe(200);
    const cookie = entered.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const headers = { 'Content-Type': 'application/json', origin, cookie };

    for (const [route, body] of [
      ['/agents/discoverModels', connection()],
      ['/agents/discoverModels?from=query', connection()],
      ['/agents/discoverModels/', connection()],
      ['/agents/checkConnection', { ...connection(), model: 'probe' }],
      [
        '/agents/checkModel',
        { modelService: 'demo-model', model: 'demo-chat' },
      ],
      ['/mail/messages/send', { accountId: 'none' }],
    ] as const) {
      const response = await testApp.request(route, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      expect({
        route,
        status: response.status,
        timing: response.headers.get('server-timing'),
        reason: (await response.json()).error.reason,
      }).toEqual({
        route,
        status: 400,
        timing: expect.stringContaining('demo-read-only'),
        reason: 'DEMO_READ_ONLY',
      });
    }
    expect(provider).not.toHaveBeenCalled();

    // Reads pass through: the same subtree keeps answering for a signed-in visitor.
    const mail = await testApp.request('/mail/accounts', {
      headers: { cookie },
    });
    expect(mail.status).toBe(200);
    // An unlisted Agents read is not caught by the listed paths.
    const services = await testApp.request('/agents/services', {
      headers: { cookie },
    });
    expect(services.status).toBe(200);
  });
});

describe('outside Demo Mode', () => {
  const test = ordinaryTest;
  test('leaves the same routes alone outside Demo Mode', async ({
    testApp,
  }) => {
    const signedIn = await testApp.request('/auth/sign-in/username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin },
      body: JSON.stringify({
        username: DEFAULT_ADMIN_CREDENTIALS.username,
        password: DEFAULT_ADMIN_CREDENTIALS.password,
      }),
    });
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const response = await testApp.request('/agents/discoverModels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin, cookie },
      body: JSON.stringify(connection()),
    });
    expect(response.status).toBe(200);
    // Shows the Demo Mode assertion above is not passing merely because nothing can reach the listener.
    expect(provider).toHaveBeenCalledWith('/v1/models');
  });
});
