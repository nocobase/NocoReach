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
    nocoreach: {
      browserCollectors: [
        {
          id: 'qa',
          name: 'Synthetic only',
          platforms: ['bilibili'],
          url: 'http://127.0.0.1:18061',
          token: 'synthetic-session-test-no-upstream-request',
          projectIds: ['1'],
        },
      ],
    },
  },
});

test('binds Bilibili disconnect to the authenticated request session and preserves the connection on a stale confirmation', async ({
  testApp,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.plugin.projects.create({
    name: 'Session QA',
    domain: 'example.test',
  });
  const configured = await runtime.plugin.bilibili!.connect('1', {
    collectorId: 'qa',
    terms: ['NocoBase'],
    bvids: [],
    revision: null,
  });
  const first = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const sessionA = (await (await first.fetch('/auth/get-session')).json()) as {
    session: { id: string };
  };
  const second = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const sessionB = (await (await second.fetch('/auth/get-session')).json()) as {
    session: { id: string };
  };
  expect(sessionA.session.id).not.toBe(sessionB.session.id);
  const call = (id?: string) =>
    second.fetch('/nocoreach/nrBilibili/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost',
        ...(id ? { 'X-NocoReach-Confirmation-Session': id } : {}),
      },
      body: JSON.stringify({ projectId: 1, revision: configured.revision }),
    });
  for (const id of [undefined, 'forged-session', sessionA.session.id]) {
    const response = await call(id);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { reason: 'NOCOREACH_CONFIRMATION_SESSION_CHANGED' },
    });
    expect(await runtime.plugin.bilibili!.status('1')).toMatchObject({
      connected: true,
      revision: configured.revision,
    });
  }
  expect((await call(sessionB.session.id)).status).toBe(200);
  expect(await runtime.plugin.bilibili!.status('1')).toMatchObject({
    connected: false,
  });
});
