// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, vi } from 'vitest';
import { createAppTest, type TestApp } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import {
  authenticationToken,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { ApiKeyService } from '@nocobase/app-plugin-api-keys/server';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';

const test = createAppTest({
  scope: 'test',
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
async function fixture(testApp: TestApp) {
  const container = testApp.application.container;
  const runtime = container.resolve(nocoReachToken);
  runtime.plugin.taskExecution.stop();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const users = container.resolve(userAdministrationServiceToken);
  const sets = container.resolve(authorizationToken).permissionSets;
  const member = async (name: string) => {
    const credentials = {
      email: `${name}@example.test`,
      password: 'fictional-password-123',
    };
    const user = await users.create({ name, ...credentials });
    const assignment = await sets.assign({
      permissionSet: 'nr.member',
      subject: { type: 'user', id: user.id },
    });
    return { user, assignment, client: await signIn(testApp, credentials) };
  };
  const call = (path: string, body?: unknown, client = admin) =>
    client.fetch(`/nocoreachKeys${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const project = await runtime.plugin.projects.create({
    name: 'First',
    domain: 'first.example.test',
  });
  const scope = {
    groups: {
      'nocoreach.business': { level: 'read', objects: [String(project.id)] },
    },
  };
  const input = { name: 'Synthetic integration', type: 'personal', scope };
  const integration = (
    secret: string,
    projectId = String(project.id),
    cookie?: string,
    path = '/nocoreach/nrTaskWork/list',
  ) =>
    testApp.fetch(
      new Request(`http://localhost${testApp.publicBasePath}/api${path}`, {
        method: 'POST',
        headers: {
          'x-api-key': secret,
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ projectId }),
      }),
    );
  return {
    container,
    runtime,
    admin,
    users,
    sets,
    member,
    call,
    input,
    integration,
    project,
  };
}
test('the results dashboard preserves existing result grants and key project restrictions', async ({
  testApp,
}) => {
  const f = await fixture(testApp);
  const owner = await f.member('existing-results-reader');
  const issued = (await (await f.call('', f.input, owner.client)).json()).data;
  const access = f.runtime.legacy.db.access!;
  await f.sets.create({
    key: 'nr.resultsReader',
    grants: access.grants(
      [{ resource: 'nrTaskWork', action: 'results' }],
      String(f.project.id),
    ),
  });
  const assignment = await f.sets.assign({
    permissionSet: 'nr.resultsReader',
    subject: { type: 'user', id: owner.user.id },
  });
  await f.sets.revoke(owner.assignment.id);
  const path = '/nocoreach/nrTaskWork/board';
  expect(
    (
      await owner.client.fetch(path, {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ projectId: String(f.project.id) }),
      })
    ).status,
  ).toBe(200);
  expect(
    (await f.integration(issued.secret, String(f.project.id), undefined, path))
      .status,
  ).toBe(200);
  expect(
    (await f.integration(issued.secret, '999', undefined, path)).status,
  ).toBe(403);
  expect(access.catalogue()).not.toContainEqual({
    resource: 'nrTaskWork',
    action: 'board',
  });
  await f.sets.revoke(assignment.id);
  expect(
    (await f.integration(issued.secret, String(f.project.id), undefined, path))
      .status,
  ).toBe(403);
});
test('members manage only their personal keys with current scope, lifetime, rotation and safe history', async ({
  testApp,
  connection,
}) => {
  const f = await fixture(testApp);
  const a = await f.member('key-owner');
  const b = await f.member('other-owner');
  expect((await f.call('/list', undefined, a.client)).status).toBe(200);
  expect((await f.call('/options', undefined, a.client)).status).toBe(200);
  for (const body of [
    { ...f.input, userId: b.user.id },
    { ...f.input, type: 'organization', roles: ['nr.member'] },
    {
      ...f.input,
      scope: { groups: { 'nocoreach.business': { level: 'admin' } } },
    },
  ])
    expect((await f.call('', body, a.client)).status).toBe(403);
  for (const days of [0, 366, 1.5])
    expect(
      (await f.call('', { ...f.input, expiresInDays: days }, a.client)).status,
    ).toBe(400);
  const response = await f.call('', f.input, a.client);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const issued = (await response.json()).data;
  expect(
    Math.round((Date.parse(issued.key.expiresAt) - Date.now()) / 86400000),
  ).toBe(90);
  const target = { keyId: issued.key.id, ownerId: a.user.id };
  const historyPath = `/history?${new URLSearchParams(target)}`;
  const list = (await (await f.call('/list', undefined, a.client)).json()).data;
  expect(list.items[0].scope).toEqual(f.input.scope);
  expect(JSON.stringify(list)).not.toContain(issued.secret);
  expect(list.items[0]).not.toHaveProperty('key');
  expect(list.items[0]).not.toHaveProperty('metadata');
  expect(
    (await f.call('/list?type=organization', undefined, a.client)).status,
  ).toBe(403);
  expect((await f.call('/inventory', undefined, a.client)).status).toBe(403);
  expect((await f.call('/events', undefined, a.client)).status).toBe(403);
  expect((await f.call(historyPath, undefined, b.client)).status).toBe(403);
  for (const action of ['rotate', 'revoke']) {
    expect((await f.call(`/${action}`, target, b.client)).status).toBe(403);
    expect(
      (await f.call(`/${action}`, { ...target, ownerId: b.user.id }, b.client))
        .status,
    ).toBe(404);
  }
  expect((await f.integration(issued.secret)).status).toBe(200);
  expect((await f.integration(issued.secret, '999')).status).toBe(403);
  expect(
    (await f.integration(issued.secret, '999', f.admin.cookie)).status,
  ).toBeGreaterThanOrEqual(400);
  expect(
    (
      await f.integration(
        issued.secret,
        String(f.project.id),
        f.admin.cookie,
        '/nocoreachKeys/rotate',
      )
    ).status,
  ).toBeGreaterThanOrEqual(400);
  const expiryKey = (
    await (await f.call('', { ...f.input, expiresInDays: 1 }, a.client)).json()
  ).data;
  await connection.query
    .updateTable('apikey')
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where('id', '=', expiryKey.key.id)
    .execute();
  expect(
    (
      await f.call(
        '/rotate',
        { keyId: expiryKey.key.id, ownerId: a.user.id },
        a.client,
      )
    ).status,
  ).toBe(403);
  expect((await f.integration(expiryKey.secret)).status).toBe(401);
  // The credential plugin prunes expired records on verification; their provenance remains readable.
  expect(
    (
      await f.call(
        '/rotate',
        { keyId: expiryKey.key.id, ownerId: a.user.id },
        a.client,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await f.call(
        `/history?${new URLSearchParams({ keyId: expiryKey.key.id, ownerId: a.user.id })}`,
        undefined,
        a.client,
      )
    ).status,
  ).toBe(200);
  expect((await f.call('/revoke', target, a.client)).status).toBe(200);
  const history = (
    await (await f.call(historyPath, undefined, a.client)).json()
  ).data;
  expect(history.map((event: { action: string }) => event.action)).toContain(
    'key.revoke',
  );
  expect(history.every((event: object) => !('changes' in event))).toBe(true);
  expect(
    (await (await f.call('/list', undefined, a.client)).json()).data.items[0]
      .revoked,
  ).toBe(true);
  const second = (
    await (await f.call('', { ...f.input, expiresInDays: 1 }, a.client)).json()
  ).data;
  const rotatedResponse = await f.call(
    '/rotate',
    { keyId: second.key.id, ownerId: a.user.id },
    a.client,
  );
  expect(rotatedResponse.status).toBe(200);
  const rotated = (await rotatedResponse.json()).data;
  expect((await f.integration(second.secret)).status).toBe(401);
  expect((await f.integration(rotated.secret)).status).toBe(200);
  await f.sets.revoke(a.assignment.id);
  expect((await f.call('/list', undefined, a.client)).status).toBe(403);
  expect(
    (
      await f.call(
        '/revoke',
        { keyId: second.key.id, ownerId: a.user.id },
        a.client,
      )
    ).status,
  ).toBe(403);
  expect((await f.integration(rotated.secret)).status).toBe(403);
});

test('organization ownership remains managed; failed create, rotate and revoke audit writes roll back', async ({
  testApp,
  connection,
}) => {
  const f = await fixture(testApp);
  const a = await f.member('key-nonmanager');
  const input = { ...f.input, type: 'organization', roles: ['nr.member'] };
  const event = vi.spyOn(f.runtime.legacy.db.access!, 'event');
  const before = await connection.repository('nrOrganizationKeys').count();
  event.mockRejectedValueOnce(new Error('synthetic audit failure'));
  expect((await f.call('', input)).status).toBe(500);
  expect(await connection.repository('nrOrganizationKeys').count()).toBe(
    before,
  );
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() - 60000);
  const issuance = await f.call('', input).finally(() => vi.useRealTimers());
  const issued = (await issuance.json()).data;
  const list = (await (await f.call('/list?type=organization')).json()).data;
  expect(list.items).toHaveLength(1);
  const ownerId = list.items[0].ownerId;
  const target = { keyId: issued.key.id, ownerId };
  expect((await f.call('/rotate', target, a.client)).status).toBe(403);
  expect(
    (await f.runtime.plugin.members.joined()).some(
      (person: { id: string }) => person.id === ownerId,
    ),
  ).toBe(false);
  const credentials = new ApiKeyService(
    f.container.resolve(authenticationToken),
    'default',
  );
  for (const action of ['rotate', 'revoke']) {
    event.mockRejectedValueOnce(new Error('synthetic audit failure'));
    expect((await f.call(`/${action}`, target)).status).toBe(500);
    expect((await credentials.verify(issued.secret))?.id).toBe(issued.key.id);
  }
  event.mockRestore();
  const rotation = await f.call('/rotate', target);
  expect(rotation.status).toBe(200);
  const rotated = (await rotation.json()).data;
  expect(Date.parse(rotated.key.expiresAt)).toBeGreaterThan(
    Date.parse(issued.key.expiresAt),
  );
  expect((await f.call('/revoke', target)).status).toBe(200);
  const retired = (await (await f.call('/list?type=organization')).json()).data
    .items;
  expect(retired).toHaveLength(1);
  expect(retired[0].revoked).toBe(true);
  expect(retired[0].expiresAt).toBe(rotated.key.expiresAt);
  expect((await f.call(`/history?${new URLSearchParams(target)}`)).status).toBe(
    200,
  );
  expect(
    (
      await f.call(
        `/history?${new URLSearchParams(target)}`,
        undefined,
        a.client,
      )
    ).status,
  ).toBe(403);
});

test('measures every management operation and existing business paths without SQL parameters', async ({
  testApp,
  connection,
}) => {
  const f = await fixture(testApp);
  const owner = await f.member('cost-owner');
  const costs: Record<string, unknown> = {};
  const client = await connection.client();
  const measure = async (name: string, run: () => Promise<Response>) => {
    const sql: string[] = [];
    const listener = (event: { sql: string }) => sql.push(event.sql);
    client.on('query', listener);
    try {
      const response = await run();
      expect(response.status).toBe(200);
      costs[name] = {
        selects: sql.filter((s) => /^select/iu.test(s)).length,
        writes: sql.filter((s) => /^(insert|update|delete)/iu.test(s)).length,
        transactions: sql.filter((s) => /^begin/iu.test(s)).length,
        locks: sql.filter((s) => /for update/iu.test(s)).length,
      };
      if (/\.(list|options|history)$/.test(name))
        expect(costs[name]).toMatchObject({
          writes: 0,
          transactions: 0,
          locks: 0,
        });
      return response;
    } finally {
      client.off('query', listener);
    }
  };
  for (const type of ['personal', 'organization']) {
    const who = type === 'personal' ? owner.client : f.admin;
    const issued = (
      await (
        await measure(`${type}.create`, () =>
          f.call('', { ...f.input, type, roles: ['nr.member'] }, who),
        )
      ).json()
    ).data;
    const list = (
      await (
        await measure(`${type}.list`, () =>
          f.call(`/list?type=${type}`, undefined, who),
        )
      ).json()
    ).data;
    await measure(`${type}.options`, () => f.call('/options', undefined, who));
    const target = { keyId: issued.key.id, ownerId: list.items[0].ownerId };
    await measure(`${type}.history`, () =>
      f.call(`/history?${new URLSearchParams(target)}`, undefined, who),
    );
    const rotated = (
      await (
        await measure(`${type}.rotate`, () => f.call('/rotate', target, who))
      ).json()
    ).data;
    if (type === 'personal') {
      await measure('business.key', () => f.integration(rotated.secret));
      await measure('business.cookie', () =>
        f.admin.fetch('/nocoreach/nrTaskWork/list', {
          method: 'POST',
          headers: {
            origin: 'http://localhost',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ projectId: String(f.project.id) }),
        }),
      );
      await measure('runner.identity', async () => {
        await f.runtime.plugin.taskExecution.authorized(
          f.admin.user.id,
          String(f.project.id),
        );
        return new Response(null);
      });
    }
    await measure(`${type}.revoke`, () => f.call('/revoke', target, who));
  }
  const rootKey = (await (await f.call('', f.input)).json()).data;
  await measure('business.rootKey', () => f.integration(rootKey.secret));
  if (process.env.PM453_KEY_COST_OUTPUT)
    await writeFile(
      process.env.PM453_KEY_COST_OUTPUT,
      JSON.stringify(costs, null, 2),
    );
});
