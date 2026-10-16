// @vitest-environment node
import { accessPageLabelKey } from '../../shared/member-access.js';
import { randomBytes } from 'node:crypto';
import { createAppTest, type TestApp } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { expect, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import english from '../../shared/i18n/en.json';
import chinese from '../../shared/i18n/zh.json';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';

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
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const actor = (await (await admin.fetch('/auth/get-session')).json()).user
    .id as string;
  const runtime = container.resolve(nocoReachToken);
  const sets = container.resolve(authorizationToken).permissionSets;
  const users = container.resolve(userAdministrationServiceToken);
  const framework = container.resolve(userManagementServiceToken);
  const request = (
    path: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
    client = admin,
  ) =>
    client.fetch(`/nocoreachAccess${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const createPerson = async (name: string) => {
    const credentials = {
      email: `${name}@example.test`,
      password: 'fictional-password-123',
    };
    const user = await users.create({ name, ...credentials });
    return { user, client: await signIn(testApp, credentials) };
  };
  const invite = async (email: string, roles = ['nr.member']) => {
    const response = await request('/invitations', { email, roles });
    const payload = await response.json();
    expect(response.status).toBe(200);
    return payload.data as {
      invitationId: string;
      source: 'members' | 'users';
      inviteUrl: string;
      emailSent: boolean;
    };
  };
  const consume = async (token: string, client = admin) =>
    client.fetch('/users/invitations/accept', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        token,
        name: 'New invitee',
        password: 'fictional-password-123',
      }),
    });
  return {
    admin,
    actor,
    runtime,
    sets,
    users,
    framework,
    request,
    createPerson,
    invite,
    consume,
  };
}

test('existing people actively accept only their own invitation, merge roles and cannot accept twice', async ({
  testApp,
  connection,
}) => {
  const f = await fixture(testApp);
  expect((await f.admin.fetch('/swagger')).status).toBe(200);
  const catalogue = (await (await f.request('/catalog')).json()).data;
  for (const item of catalogue.actions as {
    resource: string;
    action: string;
  }[]) {
    expect(english).toHaveProperty(`accessMembers.resources.${item.resource}`);
    expect(chinese).toHaveProperty(`accessMembers.resources.${item.resource}`);
    expect(english).toHaveProperty(`accessMembers.operations.${item.action}`);
    expect(chinese).toHaveProperty(`accessMembers.operations.${item.action}`);
  }
  for (const page of catalogue.pages as { id: string }[]) {
    expect(english).toHaveProperty(accessPageLabelKey(page.id));
    expect(chinese).toHaveProperty(accessPageLabelKey(page.id));
  }
  if (process.env.REACH_CATALOG_FILE)
    await writeFile(
      process.env.REACH_CATALOG_FILE,
      JSON.stringify((await (await f.request('/catalog')).json()).data),
    );
  const { user, client } = await f.createPerson('existing');
  const wrong = await f.createPerson('wrong');
  const invited = await f.invite(user.email);
  expect(invited.source).toBe('members');
  expect(invited.emailSent).toBe(false);
  expect(await f.runtime.legacy.db.access!.role(user.id)).toBeNull();
  expect((await f.request('/members', undefined, 'GET', client)).status).toBe(
    403,
  );
  expect(
    (
      await f.request(
        `/mine/${invited.invitationId}`,
        undefined,
        'GET',
        wrong.client,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await f.request(
        `/mine/${invited.invitationId}/accept`,
        {},
        'POST',
        wrong.client,
      )
    ).status,
  ).toBe(404);
  expect((await f.request('/mine', undefined, 'GET', client)).status).toBe(200);
  const row = await connection
    .repository('nrMemberInvitations')
    .findOne({ filter: { id: invited.invitationId } });
  expect(
    new Date(row!.expiresAt as string).getTime() -
      new Date(row!.createdAt as string).getTime(),
  ).toBe(7 * 86400000);
  await f.sets.create({ key: 'nr.empty', grants: [] });
  await f.sets.assign({
    permissionSet: 'nr.empty',
    subject: { type: 'user', id: user.id },
  });
  expect(
    (
      await f.request(
        `/mine/${invited.invitationId}/accept`,
        {},
        'POST',
        client,
      )
    ).status,
  ).toBe(200);
  const assignments = await f.sets.getEffective({
    principal: { type: 'user', id: user.id },
  });
  expect(assignments.map((set) => set.key)).toEqual(
    expect.arrayContaining(['nr.member', 'nr.empty']),
  );
  expect(
    (
      await f.request(
        `/mine/${invited.invitationId}/accept`,
        {},
        'POST',
        client,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await f.request('/invitations', {
        email: user.email,
        roles: ['nr.member'],
      })
    ).status,
  ).toBe(409);
  expect((await f.request(`/members/${user.id}/remove`, {})).status).toBe(200);
  expect((await f.request('/members', undefined, 'GET', client)).status).toBe(
    403,
  );
});

test('new invitations reuse framework account creation, match existing login and roll back grant failures', async ({
  testApp,
  connection,
}) => {
  const f = await fixture(testApp);
  const invited = await f.invite('new@example.test');
  expect(invited.source).toBe('users');
  expect(invited.emailSent).toBe(false);
  const token = new URL(invited.inviteUrl).pathname.split('/').at(-1)!;
  const acceptance = await f.consume(token);
  expect(acceptance.status).toBe(200);
  const { data } = await acceptance.json();
  const acceptedUser = await connection
    .repository('user')
    .findOne({ filter: { email: data.email } });
  expect(await f.runtime.legacy.db.access!.role(String(acceptedUser!.id))).toBe(
    'member',
  );
  expect(acceptedUser!.emailVerified).toBe(false);
  const repeated = await f.consume(token);
  expect(repeated.status).toBe(400);
  expect((await repeated.json()).error.reason).toBe('INVITATION_ACCEPTED');
  const failed = await f.invite('rollback@example.test');
  const failToken = new URL(failed.inviteUrl).pathname.split('/').at(-1)!;
  const event = vi
    .spyOn(f.runtime.legacy.db.access!, 'event')
    .mockRejectedValueOnce(new Error('synthetic audit failure'));
  expect((await f.consume(failToken)).status).toBe(500);
  event.mockRestore();
  expect(
    await connection
      .repository('user')
      .findOne({ filter: { email: 'rollback@example.test' } }),
  ).toBeUndefined();
  expect((await f.framework.getInvitation(failed.invitationId))!.status).toBe(
    'pending',
  );
  expect((await f.consume(failToken)).status).toBe(200);
  await f.sets.create({
    key: 'nr.rollback-reader',
    grants: f.runtime.legacy.db.access!.grants(
      [{ resource: 'nrTaskWork', action: 'get' }],
      '1',
    ),
  });
  const grantFailure = await f.invite('grant-failure@example.test', [
    'nr.member',
    'nr.rollback-reader',
  ]);
  const grantToken = new URL(grantFailure.inviteUrl).pathname
    .split('/')
    .at(-1)!;
  const bind = f.sets.withTransaction.bind(f.sets);
  const assignmentFailure = vi
    .spyOn(f.sets, 'withTransaction')
    .mockImplementation((transaction) => {
      const bound = bind(transaction);
      const assign = bound.assign.bind(bound);
      vi.spyOn(bound, 'assign').mockImplementation(async (input) => {
        if (input.permissionSet === 'nr.rollback-reader')
          throw new Error('synthetic grant failure');
        return assign(input);
      });
      return bound;
    });
  expect((await f.consume(grantToken)).status).toBe(500);
  assignmentFailure.mockRestore();
  expect(
    await connection
      .repository('user')
      .findOne({ filter: { email: 'grant-failure@example.test' } }),
  ).toBeUndefined();
  expect(
    (await f.framework.getInvitation(grantFailure.invitationId))!.status,
  ).toBe('pending');
  expect((await f.consume(grantToken)).status).toBe(200);
  const registered = await f.invite('registered@example.test');
  const credentials = {
    email: 'registered@example.test',
    password: 'fictional-password-123',
  };
  const person = await f.users.create({
    ...credentials,
    name: 'Registered after invitation',
  });
  const regToken = new URL(registered.inviteUrl).pathname.split('/').at(-1)!;
  const wrongAccount = await f.consume(regToken);
  expect(wrongAccount.status).toBe(400);
  expect((await wrongAccount.json()).error.reason).toBe(
    'INVITATION_SIGN_IN_REQUIRED',
  );
  const signed = await signIn(testApp, credentials);
  expect((await f.consume(regToken, signed)).status).toBe(200);
  expect(await f.runtime.legacy.db.access!.role(person.id)).toBe('member');
});

test('expiry, revoke, duplicate creation and resending invalidate old links in both stores', async ({
  testApp,
  connection,
}) => {
  const f = await fixture(testApp);
  const p = await f.createPerson('renew');
  const old = await f.invite(p.user.email);
  expect(
    (
      await f.request('/invitations', {
        email: p.user.email,
        roles: ['nr.member'],
      })
    ).status,
  ).toBe(409);
  await connection.repository('nrMemberInvitations').updateOne({
    filter: { id: old.invitationId },
    values: { expiresAt: new Date(0) },
  });
  expect(
    (await f.request(`/mine/${old.invitationId}/accept`, {}, 'POST', p.client))
      .status,
  ).toBe(409);
  const renewed = await f.request(
    `/invitations/members/${old.invitationId}/resend`,
    { sendEmail: false },
  );
  expect(renewed.status).toBe(200);
  const next = (await renewed.json()).data;
  expect(next.invitationId).not.toBe(old.invitationId);
  expect(
    (await f.request(`/mine/${old.invitationId}/accept`, {}, 'POST', p.client))
      .status,
  ).toBe(409);
  expect(
    (await f.request(`/invitations/members/${next.invitationId}/revoke`, {}))
      .status,
  ).toBe(200);
  expect(
    (await f.request(`/mine/${next.invitationId}/accept`, {}, 'POST', p.client))
      .status,
  ).toBe(409);
  const n = await f.invite('renew-new@example.test');
  const nToken = new URL(n.inviteUrl).pathname.split('/').at(-1)!;
  const regen = await f.request(`/invitations/users/${n.invitationId}/resend`, {
    sendEmail: false,
  });
  expect(regen.status).toBe(200);
  expect((await f.consume(nToken)).status).toBeGreaterThanOrEqual(400);
  const newerToken = new URL((await regen.json()).data.inviteUrl).pathname
    .split('/')
    .at(-1)!;
  expect(
    (await f.request(`/invitations/users/${n.invitationId}/revoke`, {})).status,
  ).toBe(200);
  const revoked = await f.consume(newerToken);
  expect(revoked.status).toBe(400);
  expect((await revoked.json()).error.reason).toBe('INVITATION_REVOKED');
});

test('acceptance rechecks the original ceiling, current roles and inviter authority with atomic rollback', async ({
  testApp,
  connection,
}) => {
  const f = await fixture(testApp);
  const access = f.runtime.legacy.db.access!;
  await f.sets.create({
    key: 'nr.reader',
    grants: access.grants([{ resource: 'nrTaskWork', action: 'get' }], '1'),
  });
  const p = await f.createPerson('ceiling');
  const invited = await f.invite(p.user.email, ['nr.reader']);
  await f.sets.update('nr.reader', {
    key: 'nr.reader',
    grants: access.grants([{ resource: 'nrTaskWork', action: 'get' }]),
  });
  expect(
    (
      await f.request(
        `/mine/${invited.invitationId}/accept`,
        {},
        'POST',
        p.client,
      )
    ).status,
  ).toBe(403);
  expect(await access.role(p.user.id)).toBeNull();
  await f.sets.update('nr.reader', {
    key: 'nr.reader',
    grants: access.grants([{ resource: 'nrTaskWork', action: 'get' }], '1'),
  });
  const event = vi
    .spyOn(access, 'event')
    .mockRejectedValueOnce(new Error('synthetic audit failure'));
  expect(
    (
      await f.request(
        `/mine/${invited.invitationId}/accept`,
        {},
        'POST',
        p.client,
      )
    ).status,
  ).toBe(500);
  event.mockRestore();
  expect(
    (await connection
      .repository('nrMemberInvitations')
      .findOne({ filter: { id: invited.invitationId } }))!.status,
  ).toBe('pending');
  expect(await access.role(p.user.id)).toBeNull();
  expect(
    (
      await f.request(
        `/mine/${invited.invitationId}/accept`,
        {},
        'POST',
        p.client,
      )
    ).status,
  ).toBe(200);
  const manager = await f.createPerson('inviter');
  const assignment = await f.sets.assign({
    permissionSet: 'nr.admin',
    subject: { type: 'user', id: manager.user.id },
  });
  // Keep a second business administrator so the grantor can legitimately lose their role.
  await f.sets.assign({
    permissionSet: 'nr.admin',
    subject: { type: 'user', id: f.actor },
  });
  const fresh = await f.request(
    '/invitations',
    { email: 'inviter-lost@example.test', roles: ['nr.reader'] },
    'POST',
    manager.client,
  );
  expect(fresh.status).toBe(200);
  const token = new URL((await fresh.json()).data.inviteUrl).pathname
    .split('/')
    .at(-1)!;
  await f.sets.revoke(assignment.id);
  expect((await f.consume(token)).status).toBe(403);
  expect(
    await connection
      .repository('user')
      .findOne({ filter: { email: 'inviter-lost@example.test' } }),
  ).toBeUndefined();
  const deletedRole = await f.invite('role-deleted@example.test', [
    'nr.reader',
  ]);
  await f.sets.delete('nr.reader');
  expect(
    (
      await f.consume(
        new URL(deletedRole.inviteUrl).pathname.split('/').at(-1)!,
      )
    ).status,
  ).toBe(400);
});

test('role catalogue, bounded grants, revisions, multiple assignments and final administrator protection', async ({
  testApp,
}) => {
  const f = await fixture(testApp);
  const user = await f.createPerson('multirole');
  const grants = f.runtime.legacy.db.access!.grants(
    [{ resource: 'nrTaskWork', action: 'list' }],
    '1',
  );
  const definition = { key: 'nr.reader', title: 'Reader', grants };
  expect((await f.request('/roles', definition)).status).toBe(200);
  expect(
    (
      await f.request('/roles', {
        key: 'nr.bad',
        title: 'Bad',
        grants: [
          {
            resource: { type: 'user', id: '*' },
            actions: [{ action: 'create' }],
          },
        ],
      })
    ).status,
  ).toBe(400);
  expect(
    (await f.request('/roles', { ...definition, key: 'nr.admin' })).status,
  ).toBe(403);
  const listed = (await (await f.request('/roles')).json()).data;
  const reader = listed.items.find(
    (role: { key: string }) => role.key === 'nr.reader',
  );
  expect(
    (
      await f.request(
        '/roles/nr.reader',
        { ...definition, revision: 'stale' },
        'PUT',
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await f.request(
        '/roles/nr.reader',
        { ...definition, title: 'Read one', revision: reader.revision },
        'PUT',
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await f.request(`/members/${user.user.id}/roles`, {
        roles: ['nr.reader', 'nr.member'],
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await f.request(
        '/roles/nr.reader',
        { revision: reader.revision },
        'DELETE',
      )
    ).status,
  ).toBe(409);
  const fresh = (await (await f.request('/roles')).json()).data.items.find(
    (role: { key: string }) => role.key === 'nr.reader',
  );
  expect(
    (
      await f.request(
        '/roles/nr.reader',
        { revision: fresh.revision },
        'DELETE',
      )
    ).status,
  ).toBe(409);
  const memberList = (await (await f.request('/members')).json()).data;
  expect(
    memberList.items.find(
      (person: { id: string }) => person.id === user.user.id,
    ).roles,
  ).toEqual(expect.arrayContaining(['nr.member', 'nr.reader']));
  expect(
    (await f.request(`/members/${user.user.id}/roles`, { roles: ['nr.admin'] }))
      .status,
  ).toBe(200);
  expect((await f.request(`/members/${user.user.id}/remove`, {})).status).toBe(
    409,
  );
  expect((await f.request(`/members/${f.actor}/remove`, {})).status).toBe(403);
  const scoped = await f.createPerson('limited-manager');
  await f.sets.create({
    key: 'nr.manager',
    grants: f.runtime.legacy.db.access!.grants(
      [
        { resource: 'nrMembers', action: 'setRole' },
        { resource: 'nrMembers', action: 'list' },
      ],
      '$app',
    ),
  });
  await f.sets.assign({
    permissionSet: 'nr.manager',
    subject: { type: 'user', id: scoped.user.id },
  });
  expect(
    (
      await f.request(
        '/invitations',
        { email: 'escalation@example.test', roles: ['nr.admin'] },
        'POST',
        scoped.client,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await f.request(
        '/roles',
        { ...definition, key: 'nr.escalation' },
        'POST',
        scoped.client,
      )
    ).status,
  ).toBe(403);
  await f.sets.assign({
    permissionSet: 'nr.admin',
    subject: { type: 'user', id: f.actor },
  });
  expect(
    (
      await f.request(
        `/members/${user.user.id}/remove`,
        {},
        'POST',
        scoped.client,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await scoped.client.fetch('/nocoreach/nrMembers/setRole', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({ userId: user.user.id, roles: [] }),
      })
    ).status,
  ).toBe(403);
});

test('service people are excluded and API keys cannot manage or accept with mixed cookies', async ({
  testApp,
}) => {
  const f = await fixture(testApp);
  const service = await f.users.createServiceAccount({
    name: 'Synthetic integration',
  });
  expect(
    (await f.request(`/members/${service.id}/roles`, { roles: ['nr.member'] }))
      .status,
  ).toBe(403);
  expect(
    (
      await f.request('/invitations', {
        email: service.email,
        roles: ['nr.member'],
      })
    ).status,
  ).toBe(403);
  const response = await f.admin.fetch('/nocoreachKeys', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({
      name: 'Test read key',
      type: 'personal',
      scope: {
        groups: { 'nocoreach.business': { level: 'admin', objects: 'all' } },
      },
    }),
  });
  expect(response.status).toBe(200);
  const key = (await response.json()).data.secret;
  for (const path of ['/members', '/roles', '/mine']) {
    const denied = await testApp.fetch(
      new Request(
        `http://localhost${testApp.publicBasePath}/api/nocoreachAccess${path}`,
        { headers: { 'x-api-key': key, cookie: f.admin.cookie } },
      ),
    );
    expect(denied.status).toBe(403);
  }
});

test('generic invitation metadata cannot impersonate an application inviter or replay another proposal', async ({
  testApp,
  connection,
}) => {
  const f = await fixture(testApp);
  const legitimate = await f.invite('legitimate@example.test');
  const original = await f.framework.getInvitation(legitimate.invitationId);
  const [forged] = await f.framework.invite({
    emails: ['forged@example.test'],
    invitedBy: f.actor,
    data: original!.data,
    origin: 'http://localhost',
  });
  expect(forged.outcome).toBe('invited');
  if (forged.outcome !== 'invited')
    throw new Error('Expected synthetic invitation');
  const token = new URL(forged.inviteUrl!).pathname.split('/').at(-1)!;
  const rejected = await f.consume(token);
  expect(rejected.status).toBe(400);
  expect((await rejected.json()).error.reason).toBe('invalidInvitation');
  expect(
    await connection
      .repository('user')
      .findOne({ filter: { email: 'forged@example.test' } }),
  ).toBeUndefined();
  const list = (await (await f.request('/invitations')).json()).data as {
    id: string;
  }[];
  expect(list.map((row) => row.id)).toContain(legitimate.invitationId);
  expect(list.map((row) => row.id)).not.toContain(forged.invitationId);
});

test('measures management and acceptance costs without recording parameters or invitation links', async ({
  testApp,
  connection,
}) => {
  const f = await fixture(testApp);
  f.runtime.plugin.taskExecution.stop();
  const database = await connection.client();
  const costs: Record<string, unknown> = {};
  const measure = async (label: string, run: () => Promise<Response>) => {
    const statements: string[] = [];
    const listener = (query: { sql: string }) => statements.push(query.sql);
    database.on('query', listener);
    try {
      const result = await run();
      expect(result.status).toBe(200);
      costs[label] = {
        selects: statements.filter((sql) => /^select/iu.test(sql)).length,
        writes: statements.filter((sql) =>
          /^(insert|update|delete)/iu.test(sql),
        ).length,
        transactions: statements.filter((sql) => /^begin/iu.test(sql)).length,
        locks: statements.filter((sql) => /for update/iu.test(sql)).length,
      };
      return result;
    } finally {
      database.off('query', listener);
    }
  };
  await measure('members', () => f.request('/members'));
  await measure('roles', () => f.request('/roles'));
  await measure('catalogue', () => f.request('/catalog'));
  const person = await f.createPerson('cost-invitee');
  const created = await measure('inviteExisting', () =>
    f.request('/invitations', {
      email: person.user.email,
      roles: ['nr.member'],
    }),
  );
  const invitation = (await created.json()).data;
  await measure('pendingInvitations', () => f.request('/invitations'));
  await measure('ownInvitations', () =>
    f.request('/mine', undefined, 'GET', person.client),
  );
  await measure('acceptExisting', () =>
    f.request(
      `/mine/${invitation.invitationId}/accept`,
      {},
      'POST',
      person.client,
    ),
  );
  const fresh = await measure('inviteNew', () =>
    f.request('/invitations', {
      email: 'cost-new@example.test',
      roles: ['nr.member'],
    }),
  );
  const token = new URL((await fresh.json()).data.inviteUrl).pathname
    .split('/')
    .at(-1)!;
  await measure('acceptNew', () => f.consume(token));
  const roleResponse = await measure('createRole', () =>
    f.request('/roles', {
      key: 'nr.cost-reader',
      title: 'Cost reader',
      grants: f.runtime.legacy.db.access!.grants(
        [{ resource: 'nrTaskWork', action: 'get' }],
        '1',
      ),
    }),
  );
  const role = (await roleResponse.json()).data;
  const edited = await measure('editRole', () =>
    f.request(
      '/roles/nr.cost-reader',
      {
        key: role.key,
        title: 'Cost reader edited',
        grants: role.grants,
        revision: role.revision,
      },
      'PUT',
    ),
  );
  const revision = (await edited.json()).data.revision;
  await measure('replaceMemberRoles', () =>
    f.request(`/members/${person.user.id}/roles`, {
      roles: ['nr.member', 'nr.cost-reader'],
    }),
  );
  await measure('removeMember', () =>
    f.request(`/members/${person.user.id}/remove`, {}),
  );
  await measure('deleteRole', () =>
    f.request('/roles/nr.cost-reader', { revision }, 'DELETE'),
  );
  const pendingNew = await f.invite('cost-resend@example.test');
  const renewal = await measure('resendNew', () =>
    f.request(`/invitations/users/${pendingNew.invitationId}/resend`, {
      sendEmail: false,
    }),
  );
  const renewed = (await renewal.json()).data;
  await measure('revokeNew', () =>
    f.request(`/invitations/users/${renewed.invitationId}/revoke`, {}),
  );
  const pendingExisting = await f.invite(person.user.email);
  const replaced = await measure('resendExisting', () =>
    f.request(`/invitations/members/${pendingExisting.invitationId}/resend`, {
      sendEmail: false,
    }),
  );
  const replacementId = (await replaced.json()).data.invitationId;
  await measure('revokeExisting', () =>
    f.request(`/invitations/members/${replacementId}/revoke`, {}),
  );
  if (process.env.REACH_COST_FILE)
    await writeFile(
      process.env.REACH_COST_FILE,
      JSON.stringify(costs, null, 2),
    );
  console.info('Access management SQL costs', costs);
});
