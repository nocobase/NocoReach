// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
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
import { expect, onTestFinished, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { administratorAction } from '../../server/access/catalog.js';
import {
  projectWork,
  type Run,
  type Work,
} from '../../server/nocoreach/execution/model.js';
import { discoverAgents } from './runner-fixture.js';

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

test('admin-scoped keys cannot change members through either management endpoint', async ({
  testApp,
  connection,
}) => {
  const container = testApp.application.container;
  const access = container.resolve(nocoReachToken).legacy.db.access!;
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const target = await container
    .resolve(userAdministrationServiceToken)
    .create({
      email: 'key-membership-target@example.test',
      password: 'fictional-password-123',
      name: 'Membership target',
    });
  const created = await admin.fetch('/nocoreachKeys', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({
      name: 'Business administrator key',
      type: 'personal',
      scope: {
        groups: { 'nocoreach.business': { level: 'admin', objects: 'all' } },
      },
    }),
  });
  expect(created.status).toBe(200);
  const { data: key } = await created.json();
  const call = (path: string, body: unknown, cookie?: string) =>
    testApp.request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        'x-api-key': key.secret,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  for (const cookie of [undefined, admin.cookie]) {
    expect(
      (
        await call(
          '/nocoreach/nrMembers/setRole',
          {
            userId: target.id,
            role: 'member',
          },
          cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          `/nocoreachAccess/members/${target.id}/roles`,
          {
            roles: ['nr.member'],
            expectedRoles: [],
          },
          cookie,
        )
      ).status,
    ).toBe(403);
  }
  expect(await access.role(target.id)).toBeNull();
  expect(
    await connection
      .repository('authorizationPermissionSetAssignments')
      .findMany({
        filter: {
          subjectType: 'user',
          subjectId: target.id,
          permissionSetKey: 'nr.member',
        },
      }),
  ).toEqual([]);
  expect(
    await connection.repository('nrAccessEvents').findMany({
      filter: { action: 'member.roles', targetId: target.id },
    }),
  ).toEqual([]);
});

test('project permissions cannot write shared Skills or application settings', async ({
  testApp,
}) => {
  const container = testApp.application.container;
  const runtime = container.resolve(nocoReachToken);
  const access = runtime.legacy.db.access!;
  const sets = container.resolve(authorizationToken).permissionSets;
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  if (!(await runtime.plugin.projects.ids()).length)
    for (const name of ['First', 'Second'])
      await runtime.plugin.projects.create({
        name,
        domain: `${name.toLowerCase()}.example.test`,
      });
  const { skill } = await runtime.plugin.skills.create(
    {
      name: 'shared-check',
      description: 'Shared instructions',
      body: 'Original body',
    },
    admin.user.id,
  );
  const credentials = {
    email: 'project-editor@example.test',
    password: 'fictional-password-123',
  };
  const user = await container
    .resolve(userAdministrationServiceToken)
    .create({ ...credentials, name: 'Project editor' });
  const client = await signIn(testApp, credentials);
  const projectGrants = access.grants(
    [
      { resource: 'nrProjects', action: 'list' },
      { resource: 'nrSkills', action: 'edit' },
      { resource: 'nrSkills', action: 'setEnabled' },
      { resource: 'nrKnowledgeAdd', action: 'suggest' },
      { resource: 'nrKnowledgeAdd', action: 'confirm' },
    ],
    '1',
  );
  await sets.create({ key: 'nr.project-editor', grants: projectGrants });
  await sets.assign({
    permissionSet: 'nr.project-editor',
    subject: { type: 'user', id: user.id },
  });
  const post = (path: string, body: Record<string, unknown>) =>
    client.fetch(`/nocoreach/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ projectId: '1', ...body }),
    });
  expect(
    (
      await post('nrSkills/edit', {
        skillId: skill.id,
        body: 'Unapproved change',
      })
    ).status,
  ).toBe(403);
  expect(
    (await runtime.plugin.skills.get('2', { skillId: skill.id })).body,
  ).toBe('Original body');
  expect(
    (await post('nrSkills/setEnabled', { skillId: skill.id, enabled: true }))
      .status,
  ).toBe(200);
  expect(
    (
      await post('nrSkills/setEnabled', {
        projectId: '2',
        skillId: skill.id,
        enabled: true,
      })
    ).status,
  ).toBe(403);
  const suggested = await post('nrKnowledgeAdd/suggest', {
    text: '---\nname: imported-check\ndescription: Imported instructions\n---\nRead the project notes.',
  });
  expect(suggested.status).toBe(200);
  const { data: draft } = await suggested.json();
  expect(
    (await post('nrKnowledgeAdd/confirm', { draftId: draft.draftId })).status,
  ).toBe(403);
  const importLink = vi.spyOn(runtime.plugin.skills, 'importLink');
  try {
    expect(
      (
        await post('nrKnowledgeAdd/confirm', {
          kind: 'skills',
          link: 'https://example.test/skills',
          paths: ['shared'],
        })
      ).status,
    ).toBe(403);
    expect(importLink).not.toHaveBeenCalled();
  } finally {
    importLink.mockRestore();
  }
  await sets.update('nr.project-editor', {
    key: 'nr.project-editor',
    grants: [
      ...projectGrants,
      ...access.grants(
        [
          { resource: 'nrSkills', action: 'edit' },
          { resource: 'nrSkills', action: 'import' },
        ],
        '$app',
      ),
    ],
  });
  expect(
    (
      await post('nrSkills/edit', {
        skillId: skill.id,
        body: 'Approved change',
      })
    ).status,
  ).toBe(200);
  expect(
    (await runtime.plugin.skills.get('2', { skillId: skill.id })).body,
  ).toBe('Approved change');
  expect(
    (await post('nrKnowledgeAdd/confirm', { draftId: draft.draftId })).status,
  ).toBe(200);
  const issued = await admin.fetch('/nocoreachKeys', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({
      name: 'Project administrator',
      type: 'personal',
      scope: {
        groups: { 'nocoreach.business': { level: 'admin', objects: ['1'] } },
      },
    }),
  });
  expect(issued.status).toBe(200);
  const { data: key } = await issued.json();
  const keyed = (path: string, body: object) =>
    testApp.fetch(
      new Request(
        `http://localhost${testApp.publicBasePath}/api/nocoreach/${path}`,
        {
          method: 'POST',
          headers: {
            'x-api-key': key.secret,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      ),
    );
  const before = await runtime.plugin.projects.get('2');
  // A project's language is a project setting: the key reaches only its own project.
  expect(
    (await keyed('nrProjects/edit', { projectId: '1', language: 'en-US' }))
      .status,
  ).toBe(200);
  expect(
    (await keyed('nrProjects/edit', { projectId: '2', language: 'en-US' }))
      .status,
  ).toBe(403);
  expect(
    (
      await keyed('nrSkills/edit', {
        projectId: '1',
        skillId: skill.id,
        body: 'Unapproved key change',
      })
    ).status,
  ).toBe(403);
  expect((await runtime.plugin.projects.get('2')).language).toBe(
    before.language,
  );
  expect(
    (await runtime.plugin.skills.get('2', { skillId: skill.id })).body,
  ).toBe('Approved change');
});

test('multiple roles union actions on their own data selections and revoke on the next request', async ({
  testApp,
}) => {
  const container = testApp.application.container;
  const runtime = container.resolve(nocoReachToken);
  const access = runtime.legacy.db.access!;
  const sets = container.resolve(authorizationToken).permissionSets;
  if (!(await runtime.plugin.projects.ids()).length) {
    await runtime.plugin.projects.create({
      name: 'First',
      domain: 'first.example.test',
    });
    await runtime.plugin.projects.create({
      name: 'Second',
      domain: 'second.example.test',
    });
  }
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

  const root = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const agents = container.resolve(agentsToken);
  const {
    discovered: [agent],
  } = await discoverAgents(agents, root.user.id, ['sync-permissions']);
  await agents.agents.update(agent.id, root.user.id, {
    expectedRevision: agent.revision,
    description: 'Task planning',
    enabled: true,
  });
  const work: Work = {
    ...projectWork({}),
    stage: 'work',
    planVersion: 1,
    approvedPlanVersion: 1,
    humanOwnerId: user.id,
    plan: {
      deliverable: 'A plan',
      verification: 'Review it',
      steps: [
        {
          id: 'plan',
          title: 'Plan',
          owner: 'local',
          instruction: 'Write a plan',
          acceptance: 'Ready to review',
        },
      ],
    },
  };
  const task = await runtime.plugin.db.getRepository('nrTasks').create({
    values: {
      projectId: '1',
      taskKey: randomUUID(),
      title: 'Revoked execution',
      status: '进行中',
      evidence: { work },
    },
  });
  const run: Run = {
    id: randomUUID(),
    projectId: '1',
    taskId: String(task.id),
    planVersion: 1,
    stepId: 'plan',
    baseArtifactId: null,
    ownerId: user.id,
    actor: root.user.id,
    inputVersion: 1,
    capabilitySnapshot: [],
    mode: 'plan',
    status: 'queued',
    createdAt: new Date().toISOString(),
    input: '{}',
    model: { llmService: 'runner', model: 'sync-permissions' },
  };
  const runKey = execution.key('run', '1', run.taskId, run.id);
  await execution.lock('1', run.taskId, async (tx) => {
    run.pluginRunId = await execution.runtime.enqueue(run, tx, agent.id);
    await execution.put(runKey, run, tx);
  });
  const official = await agents.runs.get(run.pluginRunId!);
  const started = await execution.claim(run, { runtimeRunId: official.id });
  expect(started).not.toBeNull();
  const completed = vi.spyOn(agents.runs, 'get').mockResolvedValue({
    ...official,
    status: 'completed',
    summary: JSON.stringify({ ok: true, content: 'A completed plan' }),
  });
  await sets.revoke(runner.id);
  await expect(execution.authorized(user.id, '1')).rejects.toThrow();
  try {
    await execution.runtime.sync(started!);
  } finally {
    completed.mockRestore();
  }
  expect(await execution.snapshot(runKey)).toMatchObject({
    status: 'failed',
    error: 'authorization_revoked',
    pluginSettled: true,
  });
  expect(await execution.list('artifact', '1', run.taskId)).toEqual([]);
  expect(projectWork(await execution.task('1', run.taskId)).results).toEqual(
    [],
  );
  expect((await call('1')).status).toBe(200);
  await sets.update('nr.second', {
    key: 'nr.second',
    grants: access.grants([{ resource: 'nrTaskWork', action: 'list' }], '2'),
  });
  expect((await call('2')).status).toBe(200);
  await sets.update('nr.first', {
    key: 'nr.first',
    grants: [
      ...access.grants(
        [
          { resource: 'nrTaskWork', action: 'list' },
          { resource: 'nrProjects', action: 'list' },
        ],
        '1',
      ),
      ...access.grants([{ resource: 'nrProjects', action: 'create' }]),
    ],
  });
  const createProject = (domain: string) =>
    client.fetch('/nocoreach/nrProjects/create', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ name: 'Third', domain }),
    });
  expect((await createProject('second.example.test')).status).toBe(409);
  const created = await createProject('third.example.test');
  expect(created.status).toBe(200);
  expect(await created.json()).toMatchObject({ data: { id: 3 } });
  await sets.revoke(first.id);
  expect((await call('1')).status).toBe(403);
  await sets.revoke(second.id);
  expect(await access.role(user.id)).toBeNull();
  expect((await call('2')).status).toBe(403);
});

for (const failure of ['actor', 'owner', 'preparation'] as const) {
  test(`Runner admission prevents dispatch after ${failure} failure during source preparation`, async ({
    testApp,
  }) => {
    onTestFinished(() => vi.restoreAllMocks());
    const container = testApp.application.container;
    const runtime = container.resolve(nocoReachToken);
    const tasks = runtime.plugin.taskExecution;
    const access = runtime.legacy.db.access!;
    const sets = container.resolve(authorizationToken).permissionSets;
    const agents = container.resolve(agentsToken);
    vi.spyOn(tasks, 'tick').mockResolvedValue(undefined);
    const root = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const project = String(
      (
        await runtime.plugin.projects.create({
          name: 'Claim admission',
          domain: `claim-${failure}.example.test`,
        })
      ).id,
    );
    const user = await container
      .resolve(userAdministrationServiceToken)
      .create({
        email: `claim-${failure}@example.test`,
        password: 'fictional-password-123',
        name: 'Task member',
      });
    await sets.create({
      key: `nr.claim-reader-${failure}`,
      grants: access.grants(
        [{ resource: 'nrTaskWork', action: 'list' }],
        project,
      ),
    });
    await sets.create({
      key: `nr.claim-executor-${failure}`,
      grants: access.grants(
        [{ resource: 'nrTaskWork', action: 'execute' }],
        project,
      ),
    });
    await sets.assign({
      permissionSet: `nr.claim-reader-${failure}`,
      subject: { type: 'user', id: user.id },
    });
    const assignment = await sets.assign({
      permissionSet: `nr.claim-executor-${failure}`,
      subject: { type: 'user', id: user.id },
    });
    const {
      connected,
      discovered: [discovered],
    } = await discoverAgents(agents, root.user.id, [`claim-${failure}`]);
    await agents.agents.update(discovered.id, root.user.id, {
      expectedRevision: discovered.revision,
      description: 'Task planning',
      enabled: true,
    });
    const actor = failure === 'actor' ? user.id : root.user.id;
    const ownerId = failure === 'owner' ? user.id : root.user.id;
    const work: Work = {
      ...projectWork({}),
      stage: 'work',
      planVersion: 1,
      approvedPlanVersion: 1,
      humanOwnerId: ownerId,
      plan: {
        deliverable: 'A plan',
        verification: 'Review',
        steps: [
          {
            id: 'plan',
            title: 'Plan',
            owner: 'local',
            instruction: 'Plan',
            acceptance: 'Ready',
          },
        ],
      },
    };
    const task = await runtime.plugin.db.getRepository('nrTasks').create({
      values: {
        projectId: project,
        taskKey: randomUUID(),
        title: 'Current execution grants',
        status: '进行中',
        evidence: { work },
      },
    });
    const run: Run = {
      id: randomUUID(),
      projectId: project,
      taskId: String(task.id),
      planVersion: 1,
      stepId: 'plan',
      baseArtifactId: null,
      actor,
      ownerId,
      inputVersion: 1,
      capabilitySnapshot: [],
      mode: 'plan',
      status: 'queued',
      createdAt: new Date().toISOString(),
      input: JSON.stringify({ mode: 'plan' }),
      model: { llmService: 'runner', model: `claim-${failure}` },
    };
    await tasks.lock(project, run.taskId, async (tx) => {
      run.pluginRunId = await tasks.runtime.enqueue(run, tx, discovered.id);
      await tasks.put(tasks.key('run', project, run.taskId, run.id), run, tx);
    });
    const registered = await agents.runners.authenticate(connected.runnerKey);
    const runner = await agents.runners.heartbeat(registered, {
      version: '0.1.0-beta.9',
      features: registered.features,
      tools: registered.tools,
      active: [],
      load: { slots: registered.slots, free: registered.slots },
    });
    const queued = await agents.runs.get(run.pluginRunId!);
    // Read-only selection diagnoses the real subject without preparing external sources.
    const selection = await agents.claims.selectionWait(run.pluginRunId!);
    expect(selection?.entries[0].compatibleCount).toBe(1);
    expect(selection?.entries[0].reason).toBe('ready');
    const snapshot = vi
      .spyOn(runtime.plugin.taskData, 'agentSnapshot')
      .mockImplementation(async () => {
        if (failure !== 'preparation') await sets.revoke(assignment.id);
        return {};
      });
    if (failure === 'preparation')
      vi.spyOn(runtime.plugin.community, 'state').mockRejectedValue(
        new Error('Source preparation failed'),
      );
    expect(await agents.claims.claim(runner, 1)).toEqual([]);
    expect(snapshot).toHaveBeenCalledOnce();
    if (failure === 'preparation') {
      expect(await agents.runs.get(run.pluginRunId!)).toMatchObject({
        status: 'queued',
        failureDetail: expect.stringContaining(
          'Task source preparation did not complete',
        ),
      });
      return;
    }
    await expect(tasks.authorized(user.id, project)).rejects.toThrow();
    expect(await access.role(user.id)).toBe('member');
    expect(await agents.runs.get(run.pluginRunId!)).toMatchObject({
      status: 'cancelled',
      attempt: queued.attempt,
      failureDetail: expect.stringContaining('authorization_revoked'),
    });
  });
}

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

test('ordinary requests and execution authorization do not acquire management locks', async ({
  testApp,
  connection,
}) => {
  const container = testApp.application.container;
  const runtime = container.resolve(nocoReachToken);
  runtime.plugin.taskExecution.stop();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const actor = admin.user.id;
  const project = await runtime.plugin.projects.create({
    name: 'Request query measurement',
    domain: 'query-measurement.example.test',
  });
  const projectId = String(project.id);
  const key = await runtime.legacy.db.access!.as(actor, () =>
    runtime.keys!.create(actor, {
      name: 'Cost sample',
      type: 'personal',
      scope: {
        groups: {
          'nocoreach.business': { level: 'read', objects: [projectId] },
        },
      },
    }),
  );
  const client = await connection.client();
  const queryScope = new AsyncLocalStorage<string[]>();
  const measure = async (fetch: () => Promise<Response>) => {
    const queries: string[] = [];
    // Shared-client events also include independent Scheduler and Runner jobs.
    const listener = (query: { sql: string }) => {
      if (queryScope.getStore() === queries) queries.push(query.sql);
    };
    client.on('query', listener);
    try {
      expect((await queryScope.run(queries, fetch)).status).toBe(200);
      expect(queries.length).toBeGreaterThan(0);
      return {
        writes: queries.filter((sql) => /^(update|insert|delete)/iu.test(sql))
          .length,
        transactions: queries.filter((sql) => /^begin/iu.test(sql)).length,
        locks: queries.filter((sql) => /for update/iu.test(sql)).length,
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
      body: JSON.stringify({ projectId }),
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
          body: JSON.stringify({ projectId }),
        },
      ),
    ),
  );
  const executionAuthorization = await measure(async () => {
    await runtime.plugin.taskExecution.authorized(actor, projectId);
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

  // Calibrate against real SQL: exclude an unrelated transaction during the
  // observation window, but still detect one belonging to the measured work.
  const unrelated = await measure(async () => {
    await queryScope.exit(() =>
      connection.transaction(async (tx) => {
        await tx.repository('nrSnapshots').count();
      }),
    );
    await connection.repository('nrSnapshots').count();
    return new Response(null, { status: 200 });
  });
  expect(unrelated.transactions).toBe(0);
  const foreground = await measure(async () => {
    await connection.transaction(async (tx) => {
      await tx.repository('nrSnapshots').count();
    });
    return new Response(null, { status: 200 });
  });
  expect(foreground.transactions).toBe(1);
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
  expect((await sets.get('nr.member'))!.grants).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        actions: expect.arrayContaining([
          { action: 'nrTaskWork.command.waitLonger' },
        ]),
      }),
    ]),
  );
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
    body: JSON.stringify({ userId: administrator.id, role: null }),
  });
  expect(removed.status).toBe(409);
});
