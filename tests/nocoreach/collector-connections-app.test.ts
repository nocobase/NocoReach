// @vitest-environment node
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
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
import { CollectorConnections } from '../../server/nocoreach/collector-connections';
import { createCollector } from '../../collectors/xiaohongshu.mjs';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const token = 'isolated-project-collector-token-123456789';
const collector = createCollector({
  token,
  run: async (args: string[]) =>
    args[0] === '--version'
      ? 'opencli 1.0.0'
      : JSON.stringify([
          {
            title: 'Project collector note',
            url: 'https://www.xiaohongshu.com/explore/69a123456789abcdef012345',
            likes: '25',
          },
        ]),
});
await new Promise<void>((resolve) => collector.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${(collector.address() as AddressInfo).port}`;
afterAll(async () => {
  collector.closeAllConnections();
  await new Promise<void>((resolve) => collector.close(() => resolve()));
});
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});

test('saves sealed project connections over authenticated routes, reloads them and collects through the selected service', async ({
  testApp,
  connection,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.plugin.projects.create({
    name: 'Collector settings',
    domain: 'example.com',
  });
  await runtime.plugin.projects.create({
    name: 'Other project',
    domain: 'example.org',
  });
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const { session } = (await (
    await admin.fetch('/auth/get-session')
  ).json()) as { session: { id: string } };
  const call = (
    resource: string,
    action: string,
    values: object = {},
    sessionId = session.id,
  ) =>
    admin.fetch(`/nocoreach/${resource}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost',
        'X-NocoReach-Confirmation-Session': sessionId,
      },
      body: JSON.stringify({
        projectId: '1',
        ...(resource === 'nrCollectors' ? { platform: 'xiaohongshu' } : {}),
        ...values,
      }),
    });
  expect(
    (
      await call(
        'nrCollectors',
        'save',
        { revision: 0, url, token },
        'stale-session',
      )
    ).status,
  ).toBe(409);
  expect(
    (await call('nrCollectors', 'status', { projectId: '999' })).status,
  ).toBe(404);
  const invalid = await call('nrCollectors', 'save', {
    revision: 0,
    url: 'http://remote.example',
    token,
  });
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({
    error: { metadata: { key: 'collectorConnection.invalidUrl' } },
  });
  for (const platform of ['xiaohongshu', 'bilibili', 'youtube']) {
    const saved = await call('nrCollectors', 'save', {
      platform,
      revision: 0,
      url,
      token,
    });
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body).toMatchObject({
      data: { source: 'project', revision: 1, url, hasToken: true },
    });
    expect(JSON.stringify(body)).not.toContain(token);
    expect(
      runtime.plugin.collectors.allowed('1', platform as 'youtube')[0].url,
    ).toBe(url);
    if (platform !== 'youtube') {
      const resource =
        platform === 'xiaohongshu' ? 'nrXiaohongshu' : 'nrBilibili';
      const response = await call(resource, 'status');
      expect(response.status).toBe(200);
      const status = await response.json();
      expect(status).toMatchObject({
        data: {
          collectors: [
            {
              id: `project-${platform}-1`,
              nameKey: 'collectorConnection.projectSource',
            },
          ],
        },
      });
      expect(JSON.stringify(status)).not.toContain(token);
      expect(JSON.stringify(status)).not.toContain(url);
    }
  }
  expect(
    await (await call('nrCollectors', 'status', { projectId: '2' })).json(),
  ).toMatchObject({ data: { source: 'none', hasToken: false } });
  const stored = (await connection
    .repository('nrVariables')
    .findMany({})) as Record<string, unknown>[];
  const rows = stored.filter((row) =>
    String(row.name).startsWith('NOREACH_COLLECTOR_'),
  );
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.secret).toBe(true);
    expect(String(row.value)).not.toContain(token);
  }
  await runtime.variables.load();
  const reloaded = new CollectorConnections(
    runtime.variables,
    runtime.plugin.db,
    [],
  );
  expect(reloaded.allowed('1', 'xiaohongshu')[0].token).toBe(token);
  const busy = vi
    .spyOn(runtime.plugin.xiaohongshu!, 'isCollectorBusy')
    .mockReturnValueOnce(true);
  const blocked = await call('nrCollectors', 'save', {
    revision: 1,
    url,
    token: token + '-while-busy',
  });
  busy.mockRestore();
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toMatchObject({
    error: { metadata: { key: 'collectorConnection.activeRun' } },
  });
  expect(
    (
      await call('nrXiaohongshu', 'connect', {
        collectorId: 'project-xiaohongshu-1',
        query: 'NocoBase',
        revision: 0,
      })
    ).status,
  ).toBe(200);
  expect((await call('nrXiaohongshu', 'search', { revision: 1 })).status).toBe(
    200,
  );
  expect(await runtime.plugin.xiaohongshu!.view('1')).toMatchObject({
    total: 1,
    verifiedAt: expect.any(String),
  });
  expect(
    (
      await call('nrBilibili', 'connect', {
        collectorId: 'project-bilibili-1',
        revision: null,
        terms: ['NocoBase'],
        bvids: [],
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call('nrCollectors', 'save', {
        revision: 1,
        url,
        token: token + '-rotated',
      })
    ).status,
  ).toBe(200);
  expect(await runtime.plugin.xiaohongshu!.view('1')).toMatchObject({
    total: 1,
    connected: true,
    verifiedAt: null,
    revision: 2,
  });
  const stale = await call('nrCollectors', 'save', {
    revision: 1,
    url,
    token,
  });
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({
    error: { metadata: { key: 'collectorConnection.stale' } },
  });
  const credentials = {
    email: 'collector-member@example.test',
    password: 'isolated-member-password',
    name: 'Collector member',
  };
  const user = await testApp.application.container
    .resolve(userAdministrationServiceToken)
    .create(credentials);
  expect(
    (await call('nrMembers', 'setRole', { userId: user.id, role: 'member' }))
      .status,
  ).toBe(200);
  const member = await signIn(testApp, credentials);
  const memberSession = (await (
    await member.fetch('/auth/get-session')
  ).json()) as { session: { id: string } };
  for (const action of ['status', 'save']) {
    const response = await member.fetch(`/nocoreach/nrCollectors/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost',
        'X-NocoReach-Confirmation-Session': memberSession.session.id,
      },
      body: JSON.stringify({
        projectId: '1',
        platform: 'xiaohongshu',
        revision: 2,
        url,
        token,
      }),
    });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(token);
  }
  const access = runtime.legacy.db.access!;
  const sets =
    testApp.application.container.resolve(authorizationToken).permissionSets;
  await sets.create({
    key: 'nr.collector-editor',
    grants: access.grants(
      [
        { resource: 'nrCollectors', action: 'status' },
        { resource: 'nrCollectors', action: 'save' },
      ],
      '1',
    ),
  });
  await sets.assign({
    permissionSet: 'nr.collector-editor',
    subject: { type: 'user', id: user.id },
  });
  expect(await access.role(user.id)).toBe('member');
  const configure = (projectId: string, sessionId = memberSession.session.id) =>
    member.fetch('/nocoreach/nrCollectors/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost',
        'X-NocoReach-Confirmation-Session': sessionId,
      },
      body: JSON.stringify({
        projectId,
        platform: 'youtube',
        revision: 1,
        url,
        token,
      }),
    });
  expect((await configure('1', 'stale-session')).status).toBe(409);
  expect((await configure('2')).status).toBe(403);
  expect((await configure('1')).status).toBe(200);
  await sets.replaceSubjectAssignments({
    subject: { type: 'user', id: user.id },
    managedPermissionSets: ['nr.collector-editor'],
    permissionSets: [],
  });
  expect((await configure('1')).status).toBe(403);
  // Failed snapshot invalidation rolls back both the sealed value and the published cache.
  const reset = vi
    .spyOn(runtime.plugin.xiaohongshu!, 'resetCollector')
    .mockRejectedValueOnce(new Error('injected rollback'));
  await expect(
    runtime.plugin.collectors.save('1', 'xiaohongshu', {
      revision: 2,
      url,
      token,
    }),
  ).rejects.toThrow('injected rollback');
  reset.mockRestore();
  expect(runtime.plugin.collectors.allowed('1', 'xiaohongshu')[0].token).toBe(
    token + '-rotated',
  );
  expect(runtime.plugin.collectors.status('1', 'xiaohongshu').revision).toBe(2);
  await runtime.variables.load();
  expect(runtime.plugin.collectors.allowed('1', 'xiaohongshu')[0].token).toBe(
    token + '-rotated',
  );
  expect(runtime.plugin.collectors.status('1', 'xiaohongshu').revision).toBe(2);
});
