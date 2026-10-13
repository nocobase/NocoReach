// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    agents: { server: { enabled: false }, vectors: { store: false } },
  },
});

test('the production analysis API classifies a real service without an API key before model invocation', async ({
  testApp,
  request,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const swagger = await admin.fetch('/swagger');
  expect(swagger.status).toBe(200);
  const document = await swagger.json();
  expect(document.paths['/api/agents/services']).toBeDefined();
  const runtime = testApp.application.container.resolve(nocoReachToken);
  const agents = testApp.application.container.resolve(agentsToken);
  await runtime.ready;
  const project = await runtime.plugin.projects.create({
    name: 'Analysis configuration regression',
    domain: 'analysis-config.example.test',
  });
  const headers = {
    'content-type': 'application/json',
    origin: 'http://localhost',
  };
  const service = await admin.fetch('/agents/services', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Missing key',
      provider: 'openai',
      models: [{ value: 'test-chat', label: 'Test chat', kind: 'chat' }],
    }),
  });
  expect(service.status).toBe(201);
  expect((await service.json()).data.apiKeySet).toBe(false);
  expect(
    (await agents.online.services.defaults()).effectiveChat,
  ).not.toBeNull();
  const generate = vi.spyOn(agents.online.gateway, 'generate');
  try {
    const body = JSON.stringify({ projectId: project.id });
    expect(
      (
        await request('/nocoreach/nrAnalysis/run', {
          method: 'POST',
          headers,
          body,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await admin.fetch('/nocoreach/nrAnalysis/run', {
          method: 'POST',
          headers,
          body: JSON.stringify({ projectId: 999999 }),
        })
      ).status,
    ).toBe(404);
    const run = await admin.fetch('/nocoreach/nrAnalysis/run', {
      method: 'POST',
      headers,
      body,
    });
    expect(run.status).toBe(200);
    await vi.waitFor(
      async () => {
        const status = await admin.fetch('/nocoreach/nrAnalysis/status', {
          method: 'POST',
          headers,
          body,
        });
        expect(status.status).toBe(200);
        expect((await status.json()).data).toMatchObject({
          running: false,
          retry: null,
          runs: [
            expect.objectContaining({
              ok: false,
              failureKind: 'model_configuration',
              retryable: false,
            }),
          ],
        });
      },
      { timeout: 10000 },
    );
    expect(generate).not.toHaveBeenCalled();
  } finally {
    generate.mockRestore();
  }
});
