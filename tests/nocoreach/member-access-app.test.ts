// @vitest-environment node
import { accessPageLabelKey } from '../../shared/member-access.js';
import type { BusinessRole } from '../../shared/member-access.js';
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

test('expiry, revoke, concurrent duplicate creation and resending invalidate old links in both stores', async ({
  testApp,
  connection,
}) => {
  const f = await fixture(testApp);
  const p = await f.createPerson('renew');
  const invite = f.framework.invite.bind(f.framework);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived = 0;
  // Both requests pass their initial reads before either creates an application invitation.
  const simultaneous = vi
    .spyOn(f.framework, 'invite')
    .mockImplementation(async (...args) => {
      const result = await invite(...args);
      if (++arrived === 2) release();
      await ready;
      return result;
    });
  const attempts = await Promise.all(
    [1, 2].map(() =>
      f.request('/invitations', {
        email: p.user.email,
        roles: ['nr.member'],
      }),
    ),
  ).finally(() => simultaneous.mockRestore());
  expect(attempts.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  expect(
    await connection.repository('nrMemberInvitations').count({
      filter: { userId: p.user.id, status: 'pending' },
    }),
  ).toBe(1);
  const old = (
    await attempts.find((response) => response.status === 200)!.json()
  ).data;
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

for (const source of ['members', 'users'] as const) {
  for (const expired of [false, true]) {
    test(`${source} invitations with deleted roles can be revoked and replaced (${expired ? 'expired' : 'pending'})`, async ({
      testApp,
      connection,
    }) => {
      const f = await fixture(testApp);
      expect((await f.admin.fetch('/swagger')).status).toBe(200);
      const access = f.runtime.legacy.db.access!;
      const person =
        source === 'members' ? await f.createPerson('recovery') : undefined;
      const email = person?.user.email ?? 'recovery-new@example.test';
      const role = (
        await (
          await f.request('/roles', {
            key: 'nr.recovery',
            title: 'Recovery reader',
            grants: access.grants(
              [{ resource: 'nrTaskWork', action: 'get' }],
              '1',
            ),
          })
        ).json()
      ).data;
      // Issue eight days ago through public services, without touching Users' private storage.
      if (expired) {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.now() - 8 * 86400000);
      }
      const invitation = await f
        .invite(email, ['nr.recovery'])
        .finally(() => vi.useRealTimers());
      expect(invitation.source).toBe(source);
      expect(
        (
          await f.request(
            '/roles/nr.recovery',
            { revision: role.revision },
            'DELETE',
          )
        ).status,
      ).toBe(200);
      const accept = () =>
        person
          ? f.request(
              `/mine/${invitation.invitationId}/accept`,
              {},
              'POST',
              person.client,
            )
          : f.consume(
              new URL(invitation.inviteUrl).pathname.split('/').at(-1)!,
            );
      expect((await accept()).status).toBe(expired && person ? 409 : 400);
      expect(
        (
          await f.request(
            `/invitations/${source}/${invitation.invitationId}/resend`,
            {
              sendEmail: false,
            },
          )
        ).status,
      ).toBe(400);
      const outsider = await f.createPerson('unauthorized');
      expect(
        (
          await f.request(
            `/invitations/${source}/${invitation.invitationId}/revoke`,
            {},
            'POST',
            outsider.client,
          )
        ).status,
      ).toBe(403);
      // Page/read access alone does not confer invitation management.
      await f.sets.create({
        key: 'nr.invitation-reader',
        grants: access.grants(
          [{ resource: 'nrMembers', action: 'list' }],
          '$app',
        ),
      });
      await f.sets.assign({
        permissionSet: 'nr.invitation-reader',
        subject: { type: 'user', id: outsider.user.id },
      });
      expect(
        (
          await f.request(
            `/invitations/${source}/${invitation.invitationId}/revoke`,
            {},
            'POST',
            outsider.client,
          )
        ).status,
      ).toBe(403);
      if (!(expired && source === 'users'))
        expect(
          (await f.request('/invitations', { email, roles: ['nr.member'] }))
            .status,
        ).toBe(409);
      // Any current invitation manager can close the offer, even without its former grants.
      await f.sets.create({
        key: 'nr.invitation-manager',
        grants: access.grants(
          [{ resource: 'nrMembers', action: 'setRole' }],
          '$app',
        ),
      });
      await f.sets.assign({
        permissionSet: 'nr.invitation-manager',
        subject: { type: 'user', id: outsider.user.id },
      });
      expect(
        (
          await f.request(
            `/invitations/${source}/${invitation.invitationId}/revoke`,
            {},
            'POST',
            outsider.client,
          )
        ).status,
      ).toBe(200);
      expect((await accept()).status).toBe(person ? 409 : 400);
      if (person) expect(await access.role(person.user.id)).toBeNull();
      else
        expect(
          await connection.repository('user').findOne({ filter: { email } }),
        ).toBeUndefined();
      const replacement = await f.invite(email);
      expect(replacement.invitationId).not.toBe(invitation.invitationId);
      const accepted = person
        ? await f.request(
            `/mine/${replacement.invitationId}/accept`,
            {},
            'POST',
            person.client,
          )
        : await f.consume(
            new URL(replacement.inviteUrl).pathname.split('/').at(-1)!,
          );
      expect(accepted.status).toBe(200);
      const userId =
        person?.user.id ??
        String(
          (await connection.repository('user').findOne({ filter: { email } }))!
            .id,
        );
      expect(await access.role(userId)).toBe('member');
    });
  }
}

for (const source of ['members', 'users'] as const) {
  test(`${source} renewal cannot exceed the manager's authority or original ceiling, while revocation stays available`, async ({
    testApp,
  }) => {
    const f = await fixture(testApp);
    const access = f.runtime.legacy.db.access!;
    const manager = await f.createPerson('bounded-inviter');
    const person =
      source === 'members'
        ? await f.createPerson('bounded-invitee')
        : undefined;
    const managerGrants = access.grants(
      [{ resource: 'nrMembers', action: 'setRole' }],
      '$app',
    );
    const read = access.grants(
      [{ resource: 'nrTaskWork', action: 'get' }],
      '1',
    );
    await f.sets.create({
      key: 'nr.inviter',
      grants: [...managerGrants, ...read],
    });
    await f.sets.assign({
      permissionSet: 'nr.inviter',
      subject: { type: 'user', id: manager.user.id },
    });
    await f.sets.create({ key: 'nr.offered', grants: read });
    const created = await f.request(
      '/invitations',
      {
        email: person?.user.email ?? 'bounded-new@example.test',
        roles: ['nr.offered'],
      },
      'POST',
      manager.client,
    );
    expect(created.status).toBe(200);
    const invitation = (await created.json()).data;
    const resend = () =>
      f.request(
        `/invitations/${source}/${invitation.invitationId}/resend`,
        { sendEmail: false },
        'POST',
        manager.client,
      );
    const accept = () =>
      person
        ? f.request(
            `/mine/${invitation.invitationId}/accept`,
            {},
            'POST',
            person.client,
          )
        : f.consume(new URL(invitation.inviteUrl).pathname.split('/').at(-1)!);
    await f.sets.update('nr.inviter', {
      key: 'nr.inviter',
      grants: managerGrants,
    });
    const denied = await resend();
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.reason).toBe('ungrantable');
    expect((await accept()).status).toBe(403);
    // Even a manager who regains broader grants cannot expand a previously issued offer.
    const expanded = access.grants([{ resource: 'nrTaskWork', action: 'get' }]);
    await f.sets.update('nr.offered', { key: 'nr.offered', grants: expanded });
    await f.sets.update('nr.inviter', {
      key: 'nr.inviter',
      grants: [...managerGrants, ...expanded],
    });
    const ceiling = await resend();
    expect(ceiling.status).toBe(403);
    expect((await ceiling.json()).error.reason).toBe('roleExpanded');
    expect((await accept()).status).toBe(403);
    expect(
      (
        await f.request(
          `/invitations/${source}/${invitation.invitationId}/revoke`,
          {},
          'POST',
          manager.client,
        )
      ).status,
    ).toBe(200);
    // Removing management permission takes effect on the next request.
    const another = await f.invite(
      person?.user.email ?? 'bounded-new@example.test',
    );
    await f.sets.update('nr.inviter', { key: 'nr.inviter', grants: read });
    expect(
      (
        await f.request(
          `/invitations/${source}/${another.invitationId}/revoke`,
          {},
          'POST',
          manager.client,
        )
      ).status,
    ).toBe(403);
  });
}

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
  const invalidScope = await f.request('/roles', {
    key: 'nr.invalidScope',
    title: 'Invalid application scope',
    grants: [
      {
        resource: { type: 'nocoreach', id: '1' },
        actions: [{ action: 'nrTaskWork.list' }, { action: 'nrSkills.import' }],
      },
    ],
  });
  expect(invalidScope.status).toBe(400);
  expect(await invalidScope.json()).toMatchObject({
    error: { reason: 'invalidScope' },
  });
  expect(await f.sets.get('nr.invalidScope')).toBeUndefined();
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

test('role assignment rejects grants revoked after the request was authorized', async ({
  testApp,
}) => {
  const f = await fixture(testApp);
  const access = f.runtime.legacy.db.access!;
  const manager = await f.createPerson('delegating-manager');
  const target = await f.createPerson('delegation-target');
  const managerRole = 'nr.delegation-manager';
  const readerRole = 'nr.delegation-reader';
  for (const role of [
    {
      key: managerRole,
      grants: access.grants(
        [
          { resource: 'nrMembers', action: 'setRole' },
          { resource: 'nrMembers', action: 'list' },
        ],
        '$app',
      ),
    },
    {
      key: readerRole,
      grants: access.grants([{ resource: 'nrTaskWork', action: 'list' }], '1'),
    },
  ]) {
    await f.sets.create(role);
    await f.sets.assign({
      permissionSet: role.key,
      subject: { type: 'user', id: manager.user.id },
    });
  }
  const checked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const original = access.assertGrantable.bind(access);
  let paused = false;
  const check = vi
    .spyOn(access, 'assertGrantable')
    .mockImplementation(async (keys) => {
      const result = await original(keys);
      if (!paused && access.current()?.userId === manager.user.id) {
        paused = true;
        checked.resolve();
        await release.promise;
      }
      return result;
    });
  const assignment = f.request(
    `/members/${target.user.id}/roles`,
    { roles: [readerRole] },
    'POST',
    manager.client,
  );
  try {
    await Promise.race([
      checked.promise,
      assignment.then(() => {
        throw new Error('Assignment did not reach the delegation check');
      }),
    ]);
    expect(
      (
        await f.request(`/members/${manager.user.id}/roles`, {
          roles: [managerRole],
        })
      ).status,
    ).toBe(200);
  } finally {
    release.resolve();
    await assignment;
    check.mockRestore();
  }
  expect((await assignment).status).toBe(403);
  expect(await f.sets.listAssignments(readerRole)).toHaveLength(0);
  expect(await access.role(manager.user.id)).toBe('member');
});

test('concurrent role saves consume the same revision only once', async ({
  testApp,
}) => {
  const f = await fixture(testApp);
  const definition = {
    key: 'nr.concurrent-reader',
    title: 'Reader',
    grants: f.runtime.legacy.db.access!.grants(
      [
        { resource: 'nrTaskWork', action: 'list' },
        { resource: 'nrTaskWork', action: 'get' },
      ],
      '1',
    ),
  };
  const created = await f.request('/roles', definition);
  expect(created.status).toBe(200);
  const { revision } = (await created.json()).data as BusinessRole;
  const responses = await Promise.all([
    f.request(
      `/roles/${definition.key}`,
      { ...definition, grants: [], revision },
      'PUT',
    ),
    f.request(
      `/roles/${definition.key}`,
      { ...definition, title: 'Renamed reader', revision },
      'PUT',
    ),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  const successful = responses.find((response) => response.status === 200)!;
  const saved = (await successful.json()).data as BusinessRole;
  const current = await f.sets.get(definition.key);
  expect(current).toMatchObject({ title: saved.title, grants: saved.grants });
});

test('role deletion and assignment or invitation acceptance cannot both succeed', async ({
  testApp,
}) => {
  const f = await fixture(testApp);
  for (const source of ['assignment', 'members', 'users'] as const) {
    const key = `nr.concurrent-${source}`;
    const created = await f.request('/roles', {
      key,
      title: source,
      grants: f.runtime.legacy.db.access!.grants(
        [{ resource: 'nrTaskWork', action: 'list' }],
        '1',
      ),
    });
    expect(created.status).toBe(200);
    const { revision } = (await created.json()).data as BusinessRole;
    const person =
      source === 'users'
        ? undefined
        : await f.createPerson(`concurrent-${source}`);
    const invitation =
      source === 'assignment'
        ? undefined
        : await f.invite(
            person?.user.email ?? 'concurrent-users@example.test',
            [key],
          );
    const assign = () =>
      source === 'assignment'
        ? f.request(`/members/${person!.user.id}/roles`, { roles: [key] })
        : source === 'members'
          ? f.request(
              `/mine/${invitation!.invitationId}/accept`,
              {},
              'POST',
              person!.client,
            )
          : f.consume(
              new URL(invitation!.inviteUrl).pathname.split('/').at(-1)!,
            );
    const [assignment, deletion] = await Promise.all([
      assign(),
      f.request(`/roles/${key}`, { revision }, 'DELETE'),
    ]);
    if (assignment.status === 200) {
      expect(deletion.status).toBe(409);
      expect((await deletion.json()).error.reason).toBe('roleAssigned');
      expect(await f.sets.get(key)).toBeDefined();
      expect(await f.sets.listAssignments(key)).toHaveLength(1);
    } else {
      expect([400, 403]).toContain(assignment.status);
      expect(deletion.status).toBe(200);
      expect(await f.sets.get(key)).toBeUndefined();
      expect(await f.sets.listAssignments(key)).toHaveLength(0);
    }
  }
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
