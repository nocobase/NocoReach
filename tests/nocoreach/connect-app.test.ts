// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import { CONNECT_SOURCES } from '../../shared/connect-sources.js';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
type Client = Awaited<ReturnType<typeof signIn>>;
const post = (client: Client, path: string, body: unknown) =>
  client.fetch(`/nocoreachConnect/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  });

test('connect commands list, preview and add sources as the person, and send credentials to the browser', async ({
  testApp,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.plugin.projects.create({
    name: 'Connect tests',
    domain: 'connect.example.com',
  });
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  const anonymous = await testApp.fetch(
    new Request(
      `http://localhost${testApp.publicBasePath}/api/nocoreachConnect/sources?projectId=1`,
    ),
  );
  expect(anonymous.status).toBe(401);
  const outsiderCredentials = {
    email: 'connect-outsider@example.test',
    password: 'fictional-password-123',
  };
  await testApp.application.container
    .resolve(userAdministrationServiceToken)
    .create({ ...outsiderCredentials, name: 'Outsider' });
  const outsider = await signIn(testApp, outsiderCredentials);
  expect(
    (await outsider.fetch('/nocoreachConnect/sources?projectId=1')).status,
  ).toBe(403);

  // Every source of the page, in its order, with its state, route and panel.
  const listed = await admin.fetch('/nocoreachConnect/sources?projectId=1');
  expect(listed.status).toBe(200);
  const sources = (
    (await listed.json()) as {
      data: {
        id: string;
        state: string;
        via: string;
        url: string;
        needs: string[];
      }[];
    }
  ).data;
  expect(sources.map((source) => source.id)).toEqual(
    CONNECT_SOURCES.map((source) => source.id),
  );
  const github = sources.find((source) => source.id === 'github')!;
  expect(github).toMatchObject({ state: 'ready', via: 'cli' });
  expect(sources.find((source) => source.id === 'keywords')).toMatchObject({
    via: 'browser',
    url: `http://localhost${testApp.publicBasePath}/connections?source=keywords`,
  });
  expect(github.needs).toHaveLength(1);

  // A credential source is never connected here: the answer is its page.
  const keywords = await post(admin, 'add', {
    projectId: '1',
    source: 'keywords',
  });
  expect(keywords.status).toBe(200);
  expect(await keywords.json()).toMatchObject({
    data: {
      requiresBrowser: true,
      source: 'keywords',
      url: `http://localhost${testApp.publicBasePath}/connections?source=keywords`,
    },
  });
  for (const invalid of [
    { projectId: '1', source: 'unknown-source' },
    { projectId: '1', source: 'packages', registry: 'npm' },
    { projectId: '1', source: 'github', token: 'secret' },
  ])
    expect((await post(admin, 'add', invalid)).status).toBe(400);

  // Public sources run the panel's own action with the panel's input.
  const resources = runtime.legacy.resources;
  const original = resources.action.bind(resources);
  const seen: { resource: string; action: string; values: unknown }[] = [];
  const stub = vi
    .spyOn(resources, 'action')
    .mockImplementation((resource: string, action: string) => {
      const real = original(resource, action);
      if (
        !real ||
        !['nrGitHub', 'nrPackages', 'nrHackerNews', 'nrTrends'].includes(
          resource,
        )
      )
        return real;
      return async (ctx: {
        action: { params: { values: unknown } };
        body?: unknown;
      }) => {
        seen.push({ resource, action, values: ctx.action.params.values });
        ctx.body = { ok: true };
      };
    });
  try {
    expect(
      (
        await post(admin, 'add', {
          projectId: '1',
          source: 'github',
          url: 'https://github.com/org/repo',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(admin, 'preview', {
          projectId: '1',
          source: 'packages',
          registry: 'npm',
          name: 'example',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(admin, 'add', {
          projectId: '1',
          source: 'mentions',
          terms: 'Example, example.com',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(admin, 'add', {
          projectId: '1',
          source: 'trends',
          name: 'Example',
        })
      ).status,
    ).toBe(200);
  } finally {
    stub.mockRestore();
  }
  expect(seen).toEqual([
    {
      resource: 'nrGitHub',
      action: 'connect',
      values: { projectId: '1', url: 'https://github.com/org/repo' },
    },
    {
      resource: 'nrPackages',
      action: 'preview',
      values: { projectId: '1', registry: 'npm', name: 'example' },
    },
    {
      resource: 'nrHackerNews',
      action: 'connect',
      values: { projectId: '1', terms: ['Example', 'example.com'] },
    },
    {
      resource: 'nrTrends',
      action: 'connect',
      values: { projectId: '1', product: 'Example', locationCode: 0 },
    },
  ]);

  // A member without the connection grants is refused the same way as on the page.
  const memberCredentials = {
    email: 'connect-member@example.test',
    password: 'fictional-member-password',
    name: 'Connect member',
  };
  const user = await testApp.application.container
    .resolve(userAdministrationServiceToken)
    .create(memberCredentials);
  expect(
    (
      await admin.fetch('/nocoreach/nrMembers/setRole', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({ userId: user.id, role: 'member' }),
      })
    ).status,
  ).toBe(200);
  const member = await signIn(testApp, memberCredentials);
  const page = await member.fetch('/nocoreach/nrGitHub/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({
      projectId: '1',
      url: 'https://github.com/org/repo',
    }),
  });
  const command = await post(member, 'add', {
    projectId: '1',
    source: 'github',
    url: 'https://github.com/org/repo',
  });
  expect(command.status).toBe(page.status);
  expect(command.status).toBe(403);

  const manifest = JSON.stringify(
    await (await admin.fetch('/cli/manifest')).json(),
  );
  for (const name of ['list', 'guide', 'discover', 'preview', 'add'])
    expect(manifest).toContain(`"id":"connect:${name}"`);
});
