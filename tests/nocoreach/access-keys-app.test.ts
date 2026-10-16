// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import {
  authenticationToken,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication/server';
import {
  apiKeyScopesToken,
  ApiKeyService,
  ScopedApiKeys,
} from '@nocobase/app-plugin-api-keys/server';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { administratorAction } from '../../server/access/catalog.js';
import { writeFile } from 'node:fs/promises';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});

test('scoped key rotation and its caller-owned record roll back together', async ({
  testApp,
  connection,
}) => {
  const container = testApp.application.container;
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const session = await (await admin.fetch('/auth/get-session')).json();
  const userId = session.user.id;
  const auth = container.resolve(authenticationToken);
  const scopes = container.resolve(apiKeyScopesToken);
  scopes.groups.add({
    id: 'nocoreach.test',
    title: 'NocoReach test',
    category: 'business',
    levels: { read: [{ kind: 'page', id: 'nocoreach.test' }] },
  });
  const keys = new ScopedApiKeys({
    auth,
    connection: () => connection,
    scopes,
  });
  const identity = { principal: { type: 'user', id: userId } };
  const initial = await keys.create(
    userId,
    {
      name: 'Rotation rollback',
      expiresInDays: 90,
      scope: { groups: { 'nocoreach.test': { level: 'read' } } },
    },
    identity,
  );
  let replacement = '';
  await expect(
    connection.transaction(async (transaction) => {
      const transactional = new ScopedApiKeys({
        auth: auth.forConnection(transaction),
        connection: () => transaction,
        scopes,
      });
      replacement = (await transactional.rotate(userId, initial.key.id)).secret;
      await transaction.repository('nrSnapshots').createOne({
        values: {
          id: '992345678901',
          key: 'rotation-rollback',
          payload: { keyId: initial.key.id },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      throw new Error('record write failed');
    }),
  ).rejects.toThrow('record write failed');
  expect(
    await connection
      .repository('nrSnapshots')
      .findOne({ filter: { key: 'rotation-rollback' } }),
  ).toBeUndefined();
  const credentials = new ApiKeyService(auth, 'default');
  expect((await credentials.verify(initial.secret))?.id).toBe(initial.key.id);
  expect(await credentials.verify(replacement)).toBeNull();
  expect((await keys.list(userId)).map((key) => key.id)).toEqual([
    initial.key.id,
  ]);
});

test('controlled keys constrain root across business, plugin and account routes', async ({
  testApp,
}) => {
  const container = testApp.application.container;
  const runtime = container.resolve(nocoReachToken);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const session = await (await admin.fetch('/auth/get-session')).json();
  const userId = session.user.id;
  await runtime.plugin.projects.create({
    name: 'First',
    domain: 'first.example.test',
  });
  await runtime.plugin.projects.create({
    name: 'Second',
    domain: 'second.example.test',
  });
  const create = await admin.fetch('/nocoreachKeys', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({
      name: 'Limited root',
      type: 'personal',
      scope: {
        groups: { 'nocoreach.business': { level: 'read', objects: ['1'] } },
      },
    }),
  });
  expect(create.status).toBe(200);
  const { data: issued } = await create.json();
  const call = (path: string, body?: unknown, cookie?: string) =>
    testApp.fetch(
      new Request(`http://localhost${testApp.publicBasePath}/api${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'x-api-key': issued.secret,
          ...(cookie ? { cookie } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  expect(
    (await call('/nocoreach/nrTaskWork/list', { projectId: '1' })).status,
  ).toBe(200);
  expect(
    (await call('/nocoreach/nrTaskWork/list', { projectId: '2' })).status,
  ).toBe(403);
  expect(
    (await call('/nocoreach/nrGoogle/configure', { projectId: '1' })).status,
  ).toBe(403);
  const projects = await call('/nocoreach/nrProjects/list');
  expect(projects.status).toBe(200);
  expect(
    (await projects.json()).data.map((project: { id: number }) =>
      String(project.id),
    ),
  ).toEqual(['1']);
  expect((await call('/users')).status).toBe(403);
  expect((await call('/auth/update-user', { name: 'Forbidden' })).status).toBe(
    403,
  );
  expect(
    (
      await call(
        '/nocoreach/nrGoogle/configure',
        { projectId: '2' },
        admin.cookie,
      )
    ).status,
  ).toBeGreaterThanOrEqual(400);
  const old = await new ApiKeyService(
    container.resolve(authenticationToken),
    'default',
  ).create({ userId, name: 'Legacy full key' });
  const oldResponse = await testApp.fetch(
    new Request(
      `http://localhost${testApp.publicBasePath}/api/nocoreach/nrProjects/list`,
      { headers: { 'x-api-key': old.secret, cookie: admin.cookie } },
    ),
  );
  expect(oldResponse.status).toBe(401);
  const rotate = await admin.fetch('/nocoreachKeys/rotate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ keyId: issued.key.id, ownerId: userId }),
  });
  expect(rotate.status).toBe(200);
  expect(
    (await call('/nocoreach/nrTaskWork/list', { projectId: '1' })).status,
  ).toBe(401);
});

test('multiple roles union actions on their own data selections and revoke on the next request', async ({
  testApp,
}) => {
  const container = testApp.application.container;
  const access = container.resolve(nocoReachToken).legacy.db.access!;
  const sets = container.resolve(authorizationToken).permissionSets;
  const credentials = {
    email: 'scoped-member@example.test',
    password: 'fictional-password-123',
  };
  const user = await container
    .resolve(userAdministrationServiceToken)
    .create({ ...credentials, name: 'Scoped member' });
  const client = await signIn(testApp, credentials);
  const call = (projectId: string) =>
    client.fetch('/nocoreach/nrTaskWork/list', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ projectId }),
    });
  expect((await call('1')).status).toBe(403);
  await sets.create({
    key: 'nr.first',
    grants: access.grants([{ resource: 'nrTaskWork', action: 'list' }], '1'),
  });
  await sets.create({
    key: 'nr.second',
    grants: access.grants([{ resource: 'nrProjects', action: 'list' }], '2'),
  });
  const first = await sets.assign({
    permissionSet: 'nr.first',
    subject: { type: 'user', id: user.id },
  });
  const second = await sets.assign({
    permissionSet: 'nr.second',
    subject: { type: 'user', id: user.id },
  });
  expect((await call('1')).status).toBe(200);
  expect((await call('2')).status).toBe(403);
  expect((await client.fetch('/agents/runs')).status).toBe(403);
  expect(
    (
      await client.fetch('/agents/workspaces/nocoreachTask/1:task:run/reset', {
        method: 'POST',
        headers: { origin: 'http://localhost' },
      })
    ).status,
  ).toBe(403);
  const execution = container.resolve(nocoReachToken).plugin.taskExecution;
  await expect(execution.authorized(user.id, '1')).rejects.toThrow();
  await sets.create({
    key: 'nr.runner',
    grants: access.grants([{ resource: 'nrTaskWork', action: 'execute' }], '1'),
  });
  const runner = await sets.assign({
    permissionSet: 'nr.runner',
    subject: { type: 'user', id: user.id },
  });
  expect(await execution.authorized(user.id, '1')).toBe(true);
  await sets.revoke(runner.id);
  await expect(execution.authorized(user.id, '1')).rejects.toThrow();
  expect((await call('1')).status).toBe(200);
  await sets.update('nr.second', {
    key: 'nr.second',
    grants: access.grants([{ resource: 'nrTaskWork', action: 'list' }], '2'),
  });
  expect((await call('2')).status).toBe(200);
  await sets.revoke(first.id);
  expect((await call('1')).status).toBe(403);
  await sets.revoke(second.id);
  expect(await access.role(user.id)).toBeNull();
  expect((await call('2')).status).toBe(403);
});

test('organization identities stay outside people and survive creator removal; management failures roll back rotation', async ({
  testApp,
  connection,
}) => {
  const container = testApp.application.container;
  const runtime = container.resolve(nocoReachToken);
  const access = runtime.legacy.db.access!;
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const actor = (await (await admin.fetch('/auth/get-session')).json()).user.id;
  const request = (path: string, body: unknown) =>
    admin.fetch(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify(body),
    });
  const users = container.resolve(userAdministrationServiceToken);
  const creatorCredentials = {
    email: 'organization-creator@example.test',
    password: 'fictional-password-123',
  };
  const creator = await users.create({
    ...creatorCredentials,
    name: 'Organization creator',
  });
  const successor = await users.create({
    email: 'organization-successor@example.test',
    password: 'fictional-password-123',
    name: 'Successor',
  });
  const sets = container.resolve(authorizationToken).permissionSets;
  const creatorAssignment = await sets.assign({
    permissionSet: 'nr.admin',
    subject: { type: 'user', id: creator.id },
  });
  await sets.assign({
    permissionSet: 'nr.admin',
    subject: { type: 'user', id: successor.id },
  });
  const creatorClient = await signIn(testApp, creatorCredentials);
  const owned = (body: unknown) =>
    creatorClient.fetch('/nocoreachKeys', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify(body),
    });
  const created = await owned({
    name: 'Organization integration',
    type: 'organization',
    roles: ['nr.member'],
    scope: {
      groups: { 'nocoreach.business': { level: 'read', objects: ['1'] } },
    },
  });
  expect(created.status).toBe(200);
  const issued = (await created.json()).data;
  const organization = await connection
    .repository('nrOrganizationKeys')
    .findOne({ filter: { id: issued.key.id } });
  expect(organization).toBeTruthy();
  const userId = String(organization!.serviceUserId);
  expect(await runtime.users.findOne({ filterByTk: userId })).toBeNull();
  expect(
    (await runtime.plugin.members.joined()).some(
      (person: { id: string }) => person.id === userId,
    ),
  ).toBe(false);
  const personal = (
    await (
      await owned({
        name: 'Personal integration',
        type: 'personal',
        scope: {
          groups: { 'nocoreach.business': { level: 'read', objects: ['1'] } },
        },
      })
    ).json()
  ).data;
  await sets.revoke(creatorAssignment.id);
  await users.disable(creator.id);
  const integrationRequest = (secret: string) =>
    testApp.fetch(
      new Request(
        `http://localhost${testApp.publicBasePath}/api/nocoreach/nrTaskWork/list`,
        {
          method: 'POST',
          headers: { 'x-api-key': secret, 'content-type': 'application/json' },
          body: JSON.stringify({ projectId: '1' }),
        },
      ),
    );
  expect((await integrationRequest(issued.secret)).status).toBe(200);
  expect((await integrationRequest(personal.secret)).status).toBe(401);
  await users.remove(creator.id, actor);
  expect((await integrationRequest(issued.secret)).status).toBe(200);
  const task = await runtime.legacy.db.getRepository('nrTasks').create({
    values: {
      projectId: '1',
      taskKey: randomUUID(),
      title: 'Owner validation',
      evidence: {},
    },
  });
  expect(
    (
      await request('/nocoreach/nrTaskWork/advance', {
        projectId: '1',
        taskId: String(task.id),
        revision: 0,
        requestId: randomUUID(),
        command: 'setOwner',
        userId,
      })
    ).status,
  ).toBe(404);
  const expiring = await access.as(actor, () =>
    runtime.keys!.create(actor, {
      name: 'Person key',
      type: 'personal',
      expiresInDays: 1,
      scope: { groups: { 'nocoreach.business': { level: 'read' } } },
    }),
  );
  await connection.query
    .updateTable('apikey')
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where('id', '=', expiring.key.id)
    .execute();
  expect((await integrationRequest(expiring.secret)).status).toBe(401);
  const event = vi
    .spyOn(access, 'event')
    .mockRejectedValueOnce(new Error('audit unavailable'));
  const rotation = await request('/nocoreachKeys/rotate', {
    keyId: issued.key.id,
    ownerId: userId,
  });
  expect(rotation.status).toBe(500);
  event.mockRestore();
  const credentials = new ApiKeyService(
    container.resolve(authenticationToken),
    'default',
  );
  expect((await credentials.verify(issued.secret))?.id).toBe(issued.key.id);
  expect(
    (
      await request('/nocoreachKeys/revoke', {
        keyId: issued.key.id,
        ownerId: userId,
      })
    ).status,
  ).toBe(200);
  expect(await credentials.verify(issued.secret)).toBeNull();
  expect(
    await connection
      .repository('nrAccessEvents')
      .count({ filter: { targetId: issued.key.id } }),
  ).toBe(2);
  for (const expiresInDays of [0, 366])
    expect(
      (
        await request('/nocoreachKeys', {
          name: 'Bad expiry',
          type: 'personal',
          expiresInDays,
          scope: { groups: { 'nocoreach.business': { level: 'read' } } },
        })
      ).status,
    ).toBe(400);
});

test('records the request cost without logging query parameters', async ({
  testApp,
  connection,
}) => {
  const container = testApp.application.container;
  const runtime = container.resolve(nocoReachToken);
  runtime.plugin.taskExecution.stop();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const actor = admin.user.id;
  const key = await runtime.legacy.db.access!.as(actor, () =>
    runtime.keys!.create(actor, {
      name: 'Cost sample',
      type: 'personal',
      scope: {
        groups: { 'nocoreach.business': { level: 'read', objects: ['1'] } },
      },
    }),
  );
  const client = await connection.client();
  const measure = async (fetch: () => Promise<Response>) => {
    const queries: string[] = [];
    const listener = (query: { sql: string }) => queries.push(query.sql);
    client.on('query', listener);
    const started = performance.now();
    try {
      expect((await fetch()).status).toBe(200);
      return {
        selects: queries.filter((sql) => /^select/iu.test(sql)).length,
        writes: queries.filter((sql) => /^(update|insert|delete)/iu.test(sql))
          .length,
        transactions: queries.filter((sql) => /^begin/iu.test(sql)).length,
        locks: queries.filter((sql) => /for update/iu.test(sql)).length,
        elapsedMs: Math.round((performance.now() - started) * 10) / 10,
      };
    } finally {
      client.off('query', listener);
    }
  };
  const cookie = await measure(() =>
    admin.fetch('/nocoreach/nrTaskWork/list', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ projectId: '1' }),
    }),
  );
  const apiKey = await measure(() =>
    testApp.fetch(
      new Request(
        `http://localhost${testApp.publicBasePath}/api/nocoreach/nrTaskWork/list`,
        {
          method: 'POST',
          headers: {
            'x-api-key': key.secret,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ projectId: '1' }),
        },
      ),
    ),
  );
  const executionAuthorization = await measure(async () => {
    await runtime.plugin.taskExecution.authorized(actor, '1');
    return new Response(null, { status: 200 });
  });
  expect(executionAuthorization.writes).toBe(0);
  expect(executionAuthorization.transactions).toBe(0);
  expect(executionAuthorization.locks).toBe(0);
  expect(cookie.writes).toBe(0);
  expect(cookie.transactions).toBe(0);
  expect(cookie.locks).toBe(0);
  expect(apiKey.transactions).toBe(0);
  expect(apiKey.locks).toBe(0);
  if (process.env.PM453_COST_OUTPUT)
    await writeFile(
      process.env.PM453_COST_OUTPUT,
      JSON.stringify({ cookie, apiKey, executionAuthorization }, null, 2),
    );
});

test('legacy membership migration is atomic, repeatable, and leaves the old snapshot unchanged after new role changes', async ({
  testApp,
  connection,
}) => {
  const container = testApp.application.container;
  const access = container.resolve(nocoReachToken).legacy.db.access!;
  const sets = container.resolve(authorizationToken).permissionSets;
  const users = container.resolve(userAdministrationServiceToken);
  const root = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const old = await new ApiKeyService(
    container.resolve(authenticationToken),
    'default',
  ).create({ userId: root.user.id, name: 'Pre-migration key' });
  const member = await users.create({
    name: 'Migrated member',
    email: 'migration-member@example.test',
    password: 'fictional-password-123',
  });
  const administrator = await users.create({
    name: 'Migrated administrator',
    email: 'migration-admin@example.test',
    password: 'fictional-password-123',
  });
  const outsider = await users.create({
    name: 'Unjoined',
    email: 'migration-outsider@example.test',
    password: 'fictional-password-123',
  });
  await sets.delete('nr.member');
  await sets.delete('nr.admin');
  await connection
    .repository('nrSnapshots')
    .deleteOne({ filter: { key: 'nr-migrations:access:20261016' } });
  const payload = {
    users: { [member.id]: 'member', [administrator.id]: 'admin' },
  };
  await connection.repository('nrSnapshots').createOne({
    values: {
      id: '202610160454',
      key: 'nr-members',
      payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  await connection.repository('nrSnapshots').updateOne({
    filter: { key: 'nr-members' },
    values: { payload: { users: { [member.id]: 'unknown-role' } } },
  });
  await expect(access.upgrade(administratorAction)).rejects.toThrow(
    'Unknown legacy membership',
  );
  expect(await sets.get('nr.member')).toBeUndefined();
  expect(
    await connection
      .repository('nrSnapshots')
      .findOne({ filter: { key: 'nr-migrations:access:20261016' } }),
  ).toBeUndefined();
  await connection
    .repository('nrSnapshots')
    .updateOne({ filter: { key: 'nr-members' }, values: { payload } });
  const audit = vi
    .spyOn(access, 'event')
    .mockRejectedValueOnce(new Error('migration audit failed'));
  await expect(access.upgrade(administratorAction)).rejects.toThrow(
    'migration audit failed',
  );
  audit.mockRestore();
  expect(
    (
      await new ApiKeyService(
        container.resolve(authenticationToken),
        'default',
      ).get(old.key.id)
    )?.enabled,
  ).toBe(true);
  await access.upgrade(administratorAction);
  expect(
    (
      await new ApiKeyService(
        container.resolve(authenticationToken),
        'default',
      ).get(old.key.id)
    )?.enabled,
  ).toBe(false);
  expect(await access.role(member.id)).toBe('member');
  expect(await access.role(administrator.id)).toBe('admin');
  expect(await access.role(outsider.id)).toBeNull();
  const count = (await sets.listAssignments()).length;
  await access.upgrade(administratorAction);
  expect((await sets.listAssignments()).length).toBe(count);
  await access.as(administrator.id, () =>
    access.replaceRoles(administrator.id, member.id, []),
  );
  expect(await access.role(member.id)).toBeNull();
  expect(
    (await connection
      .repository('nrSnapshots')
      .findOne({ filter: { key: 'nr-members' } }))!.payload,
  ).toEqual(payload);
  const assignment = (await sets.listAssignments('nr.admin')).find(
    (row) => row.subject.id === administrator.id,
  )!;
  await expect(sets.revoke(assignment.id)).rejects.toThrow();
  const disabled = await root.fetch(`/users/${administrator.id}/disable`, {
    method: 'POST',
    headers: { origin: 'http://localhost' },
  });
  expect(disabled.status).toBe(400);
  const removed = await root.fetch('/nocoreach/nrMembers/setRole', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ userId: administrator.id, roles: [] }),
  });
  expect(removed.status).toBe(409);
});
