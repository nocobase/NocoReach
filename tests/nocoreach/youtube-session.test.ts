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
import { YouTubeSource } from '../../server/nocoreach/youtube-source';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
test('requires the current request session for YouTube replacement and disconnect, including same-account reauthentication', async ({
  testApp,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.plugin.projects.create({
    name: 'YouTube session QA',
    domain: 'example.test',
  });
  const youtube = runtime.plugin.youtube as YouTubeSource;
  Object.assign(youtube, {
    reader: { search: async () => [], video: vi.fn() },
  });
  await youtube.connect('1', { terms: 'Synthetic', revision: null });
  await youtube.settled('1');
  const original = await youtube.status('1');
  const first = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const sessionA = (await (await first.fetch('/auth/get-session')).json()) as {
    session: { id: string };
  };
  const second = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const sessionB = (await (await second.fetch('/auth/get-session')).json()) as {
    session: { id: string };
  };
  expect(sessionA.session.id).not.toBe(sessionB.session.id);
  const call = (action: string, id?: string) =>
    second.fetch(`/nocoreach/nrYouTube/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost',
        ...(id ? { 'X-NocoReach-Confirmation-Session': id } : {}),
      },
      body: JSON.stringify({
        projectId: 1,
        revision: original.revision,
        terms: 'Replacement',
      }),
    });
  for (const action of ['connect', 'disconnect']) {
    for (const id of [undefined, 'forged-session', sessionA.session.id]) {
      const response = await call(action, id);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { reason: 'NOCOREACH_CONFIRMATION_SESSION_CHANGED' },
      });
      expect(await youtube.status('1')).toMatchObject({
        revision: original.revision,
        terms: ['Synthetic'],
      });
    }
  }
  expect((await call('connect', sessionB.session.id)).status).toBe(200);
  await youtube.settled('1');
  const current = await youtube.status('1');
  expect(current.terms).toEqual(['Replacement']);
  const response = await second.fetch('/nocoreach/nrYouTube/disconnect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost',
      'X-NocoReach-Confirmation-Session': sessionB.session.id,
    },
    body: JSON.stringify({ projectId: 1, revision: current.revision }),
  });
  expect(response.status).toBe(200);
  expect(await youtube.status('1')).toMatchObject({ configured: false });
});
