// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});

test('aggregate reads deduplicate checks and preserve current identity, grants and mutations', async ({
  testApp,
  connection,
}) => {
  const container = testApp.application.container;
  const runtime = container.resolve(nocoReachToken);
  await runtime.ready;
  for (const name of ['first', 'second'])
    await runtime.plugin.projects.create({
      name,
      domain: `${name}.example.test`,
    });
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const read = async (client = admin, project = '1') => {
    const response = await client.fetch(
      `/nocoreachConnect/status?projectId=${project}`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    return (await response.json()).data;
  };
  expect(
    (
      await testApp.fetch(
        new Request(
          `http://localhost${testApp.publicBasePath}/api/nocoreachConnect/status?projectId=1`,
        ),
      )
    ).status,
  ).toBe(401);
  const calls = new Map<string, number>();
  let hold: Promise<void> | undefined;
  let finished: (() => void) | undefined;
  let failing = false;
  const resources = runtime.legacy.resources;
  const original = resources.action.bind(resources);
  const lookup = vi
    .spyOn(resources, 'action')
    .mockImplementation((resource, action) => {
      if (!(
        action === 'status' ||
        (resource === 'nrSources' && action === 'list') ||
        (resource === 'nrSiteContent' && action === 'summary') ||
        (resource === 'nrArticles' && action === 'targets')
      ))
        return original(resource, action);
      return async (ctx) => {
        calls.set(resource, (calls.get(resource) ?? 0) + 1);
        // A late business authorization check must remain valid in background refreshes.
        if (resource === 'nrGitHub') await hold;
        await runtime.legacy.db.access!.require(
          resource,
          action,
          String(ctx.action.params.values.projectId),
        );
        if (failing && resource === 'nrGitHub') throw new Error('unavailable');
        ctx.body =
          resource === 'nrSources'
            ? { sources: [] }
            : resource === 'nrArticles'
              ? { targets: [] }
              : {
                  connected: true,
                  configured: true,
                  revision: calls.get(resource),
                };
        if (resource === 'nrGitHub') finished?.();
      };
    });
  try {
    const cold = await Promise.all(Array.from({ length: 20 }, () => read()));
    expect(cold.every((value) => value.github.connected)).toBe(true);
    expect(calls.size).toBe(18);
    expect([...calls.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      18,
    );
    const driver = await connection.client<{
      on(event: string, listener: () => void): void;
      removeListener(event: string, listener: () => void): void;
    }>();
    let queries = 0;
    const measuring = new AsyncLocalStorage<boolean>();
    const count = () => {
      if (measuring.getStore()) queries += 1;
    };
    driver.on('query', count);
    try {
      await measuring.run(true, () => read());
    } finally {
      driver.removeListener('query', count);
    }
    // Count the request, excluding independently scheduled background work.
    expect(queries).toBeGreaterThan(0);
    expect(queries).toBeLessThanOrEqual(12);
    expect(calls.get('nrGitHub')).toBe(1);
    await read(admin, '2');
    expect(calls.get('nrGitHub')).toBe(2);

    const secondSession = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    await read(secondSession);
    expect(calls.get('nrGitHub')).toBe(3);

    // Re-check item grants before looking up a previously successful value.
    const require = runtime.legacy.db.access!.require.bind(
      runtime.legacy.db.access!,
    );
    const gate = vi
      .spyOn(runtime.legacy.db.access!, 'require')
      .mockImplementation(async (resource, action, project) => {
        if (resource === 'nrGitHub')
          throw Object.assign(new Error('revoked'), { status: 403 });
        await require(resource, action, project);
      });
    try {
      expect((await read()).github).toBeNull();
    } finally {
      gate.mockRestore();
    }
    expect(calls.get('nrGitHub')).toBe(3);

    // A real successful mutation invalidates every session's project copy.
    const saved = await admin.fetch('/nocoreach/nrReddit/disconnect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ projectId: '1' }),
    });
    expect(saved.status).toBe(200);
    await read();
    expect(calls.get('nrGitHub')).toBe(4);
    await read(admin, '2');
    expect(calls.get('nrGitHub')).toBe(4);

    const createKey = await admin.fetch('/nocoreachKeys', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        name: 'Connection reader',
        type: 'personal',
        scope: {
          groups: { 'nocoreach.business': { level: 'read', objects: ['1'] } },
        },
      }),
    });
    expect(createKey.status).toBe(200);
    const { data: issued } = await createKey.json();
    const keyRead = async (project: string) => {
      const response = await testApp.fetch(
        new Request(
          `http://localhost${testApp.publicBasePath}/api/nocoreachConnect/status?projectId=${project}`,
          {
            headers: { 'x-api-key': issued.secret },
          },
        ),
      );
      expect(response.status).toBe(200);
      return (await response.json()).data;
    };
    expect((await keyRead('1')).github).toMatchObject({ connected: true });
    expect(calls.get('nrGitHub')).toBe(5);
    expect((await keyRead('2')).github).toBeNull();
    expect(calls.get('nrGitHub')).toBe(5);

    const user = await container
      .resolve(userAdministrationServiceToken)
      .create({
        name: 'Outsider',
        email: 'status-outsider@example.test',
        password: 'fictional-password-123',
      });
    const outsider = await signIn(testApp, {
      email: user.email,
      password: 'fictional-password-123',
    });
    expect(
      (await outsider.fetch('/nocoreachConnect/status?projectId=1')).status,
    ).toBe(403);
    const sets = container.resolve(authorizationToken).permissionSets;
    await sets.assign({
      permissionSet: 'nr.member',
      subject: { type: 'user', id: user.id },
    });
    const unassigned = await read(outsider);
    expect(unassigned.github).toBeNull();
    expect(unassigned.publicSources).toEqual([]);
    const previous = (await read()).github.revision;
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 600_001);
    try {
      let release!: () => void;
      hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const done = new Promise<void>((resolve) => {
        finished = resolve;
      });
      const before = calls.get('nrGitHub')!;
      const stale = await Promise.all(Array.from({ length: 20 }, () => read()));
      expect(stale.every((value) => value.github.revision === previous)).toBe(
        true,
      );
      expect(calls.get('nrGitHub')).toBe(before + 1);
      release();
      await done;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect((await read()).github.revision).toBe(before + 1);
    } finally {
      clock.mockRestore();
      hold = undefined;
      finished = undefined;
    }
    runtime.connectionStatus.invalidate('1');
    failing = true;
    const partial = await read();
    expect(partial.github).toBeNull();
    expect(partial.reddit.connected).toBe(true);
  } finally {
    lookup.mockRestore();
  }
});
