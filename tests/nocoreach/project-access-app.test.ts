// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { createAppTest, type TestApp } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication/server';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { expect } from 'vitest';
import {
  BASE_ACTIONS,
  CAPABILITY_ACTIONS,
} from '../../shared/access-capabilities.js';
import type {
  AccessMember,
  InvitationResult,
} from '../../shared/member-access.js';
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
  const runtime = container.resolve(nocoReachToken);
  await runtime.ready;
  const access = runtime.legacy.db.access!;
  const sets = container.resolve(authorizationToken).permissionSets;
  const users = container.resolve(userAdministrationServiceToken);
  const request = (path: string, body?: unknown, client = admin) =>
    client.fetch(`/nocoreachAccess${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const person = async (name: string, role = 'nr.member') => {
    const credentials = {
      email: `${name}@example.test`,
      password: 'fictional-password-123',
    };
    const user = await users.create({ name, ...credentials });
    await sets.assign({
      permissionSet: role,
      subject: { type: 'user', id: user.id },
    });
    return { user, client: await signIn(testApp, credentials) };
  };
  for (const name of ['first', 'second'])
    await runtime.plugin.projects.create({
      name,
      domain: `${name}.example.test`,
    });
  const projects = await access.projectIds(access.database.connection());
  expect(projects.length).toBeGreaterThanOrEqual(2);
  return { admin, runtime, access, sets, users, request, person, projects };
}

test('every registered business action belongs to exactly one capability or the base', async ({
  testApp,
}) => {
  const { access } = await fixture(testApp);
  const owners = new Map<string, string[]>();
  for (const action of BASE_ACTIONS) owners.set(action, ['base']);
  for (const [capability, actions] of Object.entries(CAPABILITY_ACTIONS))
    for (const action of actions)
      owners.set(action, [...(owners.get(action) ?? []), capability]);
  const registered = access
    .catalogue()
    .map(({ resource, action }) => `${resource}.${action}`);
  expect(registered.filter((action) => !owners.has(action))).toEqual([]);
  expect([...owners].filter(([, held]) => held.length > 1)).toEqual([]);
  expect(
    [...owners.keys()].filter((action) => !registered.includes(action)),
  ).toEqual([]);
});

test('a project-member role reaches only the projects its holder belongs to', async ({
  testApp,
}) => {
  const f = await fixture(testApp);
  const [first, second] = f.projects;
  const { user, client } = await f.person('project-reader');
  const can = (project?: string) =>
    f.access.as(user.id, () => f.access.allows('nrTaskWork', 'list', project));
  expect(await can(first)).toBe(false);
  const snapshot = (await (await f.request(`/members/${user.id}`)).json())
    .data as AccessMember;
  expect(snapshot.projects).toEqual([]);
  const saved = await f.request(`/members/${user.id}/roles`, {
    roles: ['nr.member'],
    expectedRoles: ['nr.member'],
    projectIds: [first],
    expectedProjects: [],
  });
  expect(saved.status).toBe(200);
  expect(await can(first)).toBe(true);
  expect(await can(second)).toBe(false);
  const overview = (projectId: string) =>
    client.fetch('/nocoreach/nrStrategy/overview', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ projectId }),
    });
  const permitted = await overview(first);
  expect(permitted.status).toBe(200);
  expect((await permitted.json()).data).toMatchObject({
    periodDays: 28,
    state: { revision: 0 },
  });
  expect((await overview(second)).status).toBe(403);

  // Application-wide and mixed-project reads never follow project membership.
  expect(await can()).toBe(false);
  const listed = await client.fetch('/nocoreach/nrProjects/list');
  expect(
    ((await listed.json()).data as { id: number }[]).map((project) =>
      String(project.id),
    ),
  ).toEqual([first]);
  const stale = await f.request(`/members/${user.id}/roles`, {
    roles: ['nr.member'],
    expectedRoles: ['nr.member'],
    projectIds: [second],
    expectedProjects: [],
  });
  expect(stale.status).toBe(409);
  expect((await f.request(`/members/${user.id}/remove`, {})).status).toBe(200);
  expect(await f.access.projectsOf(user.id)).toEqual(new Set());
});

test('batch invitations join projects on acceptance and add existing members directly', async ({
  testApp,
}) => {
  const f = await fixture(testApp);
  const [first, second] = f.projects;
  const existing = await f.person('already-member');
  const credentials = {
    email: 'invitee@example.test',
    password: 'fictional-password-123',
  };
  const invitee = await f.users.create({ name: 'Invitee', ...credentials });
  const response = await f.request('/invitations', {
    emails: [
      'invitee@example.test',
      'ALREADY-MEMBER@example.test',
      'brand-new@example.test',
    ],
    projectIds: [first, second],
  });
  expect(response.status).toBe(200);
  const results = (await response.json()).data as (InvitationResult & {
    invitationId?: string;
  })[];
  expect(results.map(({ email, outcome }) => [email, outcome])).toEqual([
    ['invitee@example.test', 'invited'],
    ['already-member@example.test', 'added'],
    ['brand-new@example.test', 'invited'],
  ]);
  expect(await f.access.projectsOf(existing.user.id)).toEqual(
    new Set([first, second]),
  );
  const repeated = await f.request('/invitations', {
    emails: ['already-member@example.test', 'invitee@example.test'],
    projectIds: [first],
  });
  expect(
    ((await repeated.json()).data as InvitationResult[]).map(
      (result) => result.reason ?? result.outcome,
    ),
  ).toEqual(['alreadyMember', 'alreadyPending']);
  const client = await signIn(testApp, credentials);
  expect(
    (await f.request(`/mine/${results[0].invitationId}/accept`, {}, client))
      .status,
  ).toBe(200);
  expect(await f.access.role(invitee.id)).toBe('member');
  expect(await f.access.projectsOf(invitee.id)).toEqual(
    new Set([first, second]),
  );
  expect(
    (
      await f.request('/invitations', {
        emails: ['nobody@example.test'],
        projectIds: ['999999'],
      })
    ).status,
  ).toBe(400);
});

test('upgrading removes per-action custom roles and keeps every member in every project', async ({
  testApp,
  connection,
}) => {
  const f = await fixture(testApp);
  const legacy = await f.person('legacy-custom', 'nr.member');
  await f.sets.revoke(
    (await f.sets.listAssignments('nr.member')).find(
      (assignment) => assignment.subject.id === legacy.user.id,
    )!.id,
  );
  await f.sets.create({
    key: 'nr.legacy',
    grants: f.access.grants([{ resource: 'nrTaskWork', action: 'list' }], '1'),
  });
  await f.sets.assign({
    permissionSet: 'nr.legacy',
    subject: { type: 'user', id: legacy.user.id },
  });
  await connection
    .repository('nrSnapshots')
    .deleteMany({ filter: { key: 'nr-migrations:access:20261018' } });
  await (
    f.access as unknown as { upgradeProjectAccess(): Promise<void> }
  ).upgradeProjectAccess();
  expect(await f.sets.get('nr.legacy')).toBeUndefined();
  expect(await f.access.role(legacy.user.id)).toBe('member');
  expect(await f.access.projectsOf(legacy.user.id)).toEqual(
    new Set(f.projects),
  );
  // The step runs once.
  await (
    f.access as unknown as { upgradeProjectAccess(): Promise<void> }
  ).upgradeProjectAccess();
  expect(
    await connection
      .repository('nrProjectMembers')
      .count({ filter: { userId: legacy.user.id } }),
  ).toBe(f.projects.length);
});
