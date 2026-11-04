// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import { signIn } from '@nocobase/app-plugin-authentication/testing';
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

test('project members reuse all connection states within the warm query budget', async ({
  testApp,
  connection,
}) => {
  const container = testApp.application.container;
  const runtime = container.resolve(nocoReachToken);
  await runtime.ready;
  const project = await runtime.plugin.projects.create({
    name: 'Member query budget',
    domain: 'member-query-budget.example.test',
  });
  const projectId = String(project.id);
  const credentials = {
    email: 'status-budget-member@example.test',
    password: 'fictional-member-budget-password',
  };
  const user = await container.resolve(userAdministrationServiceToken).create({
    name: 'Status budget member',
    ...credentials,
  });
  await container.resolve(authorizationToken).permissionSets.assign({
    permissionSet: 'nr.member',
    subject: { type: 'user', id: user.id },
  });
  const access = runtime.legacy.db.access!;
  await access.joinCreatedProject(String(user.id), projectId);
  expect(await runtime.users.isRoot(String(user.id))).toBe(false);
  expect(await access.role(String(user.id))).toBe('member');
  expect(
    await access.as(String(user.id), () =>
      access.allows('nrGoogle', 'configure', projectId),
    ),
  ).toBe(false);
  const member = await signIn(testApp, credentials);
  type Counts = { queries: number; reads: number; writes: number };
  const measurement = new AsyncLocalStorage<Counts>();
  const driver = await connection.client<{
    on(event: string, listener: (query: { sql: string }) => void): void;
    removeListener(
      event: string,
      listener: (query: { sql: string }) => void,
    ): void;
  }>();
  const count = ({ sql }: { sql: string }) => {
    const counts = measurement.getStore();
    if (!counts) return;
    counts.queries += 1;
    if (!/^\s*(select|pragma|with)\b/i.test(sql)) counts.writes += 1;
  };
  const resources = runtime.legacy.resources;
  const original = resources.action.bind(resources);
  const lookup = vi
    .spyOn(resources, 'action')
    .mockImplementation((resource, action) => {
      const fn = original(resource, action);
      if (!fn) return fn;
      return async (ctx, next) => {
        const counts = measurement.getStore();
        if (counts) counts.reads += 1;
        return fn(ctx, next);
      };
    });
  driver.on('query', count);
  const read = async () => {
    const response = await member.fetch(
      `/nocoreachConnect/status?projectId=${projectId}`,
    );
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(Object.keys(data)).toHaveLength(18);
    expect(Object.values(data).every((value) => value !== null)).toBe(true);
  };
  try {
    const cold = { queries: 0, reads: 0, writes: 0 };
    await measurement.run(cold, read);
    expect(cold.reads).toBe(18);
    const warm = { queries: 0, reads: 0, writes: 0 };
    await measurement.run(warm, read);
    expect(warm.reads).toBe(0);
    expect(warm.writes).toBe(0);
    expect(warm.queries).toBeGreaterThan(0);
    // The built-in member measured 27 queries; leave five for framework metadata lookups.
    expect(warm.queries).toBeLessThanOrEqual(32);
  } finally {
    driver.removeListener('query', count);
    lookup.mockRestore();
  }
});
