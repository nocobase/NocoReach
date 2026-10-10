// @vitest-environment node
// Real plugin/database contract; the coding tool itself is replaced by explicit Runner reports.
import { randomBytes, randomUUID } from 'node:crypto';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
test('official Runner claims a task, returns its result once, and handles cancellation', async ({
  testApp,
  connection,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const doc = await admin.fetch('/swagger');
  expect(doc.status).toBe(200);
  expect(JSON.stringify(await doc.json())).toContain('/agents/');
  const installer = await testApp.fetch(
    new Request(
      'http://localhost' +
        testApp.publicBasePath +
        '/api/agents/dist/installScript',
    ),
  );
  expect(installer.status).toBe(200);
  expect(await installer.text()).toContain('cli=nocoreach');
  expect(
    (
      await testApp.fetch(
        new Request(
          'http://localhost' + testApp.publicBasePath + '/api/agents',
        ),
      )
    ).status,
  ).toBe(401);
  const runtime = testApp.application.container.resolve(nocoReachToken);
  const agents = testApp.application.container.resolve(agentsToken);
  const person = await connection
    .repository('user')
    .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } });
  const actor = String(person!.id);
  const plugin = runtime.plugin as any,
    tasks = plugin.taskExecution;
  await plugin.projects.create({
    name: 'Runner contract',
    domain: 'runner.example.com',
    language: 'zh-CN',
  });
  const project = String((await plugin.projects.list()).at(-1).id);
  const agent = await agents.agents.create(actor, {
    name: 'Contract Agent',
    type: 'runner',
    access: 'everyone',
    modelEntries: [{ tool: 'claude', model: null }],
  });
  await tasks.agents.select(project, { agentId: agent.id, revision: 0 }, actor);
  const registration = await agents.runners.createRegistrationToken(actor, {
    trust: 'team',
  });
  const connected = await agents.runners.register({
    registrationToken: registration.token,
    name: 'Contract Runner',
    hostname: 'test',
    os: 'linux',
    arch: 'x64',
    version: '0.1.0-beta.2',
    protocolVersion: 7,
    features: [
      'input',
      'steer',
      'attachments',
      'checkout',
      'directories',
      'secrets',
      'skills',
      'mounts',
    ],
    tools: [{ kind: 'claude', authenticated: true }],
  });
  const runner = await agents.runners.authenticate(connected.runnerKey);
  async function startTask() {
    const row = await plugin.db.getRepository('nrTasks').create({
      values: {
        projectId: project,
        taskKey: randomUUID(),
        title: 'Research only',
        brief: 'Produce a report',
        status: '待处理',
        evidence: {},
      },
    });
    const id = String(row.id);
    await tasks.update(
      project,
      {
        taskId: id,
        revision: 0,
        requestId: randomUUID(),
        command: 'startTask',
        playbookId: 'change-research',
      },
      actor,
      'Admin',
    );
    return id;
  }
  const id = await startTask();
  const queued = (await tasks.get(project, id)).runs[0];
  expect(queued.pluginRunId).toBeTruthy();
  const countBefore = (await agents.runs.list({ agentId: agent.id })).length;
  const original = await tasks.snapshot(
    tasks.key('run', project, id, queued.id),
  );
  await expect(
    plugin.db.sequelize.transaction(async (tx: unknown) => {
      await tasks.runtime.enqueue({ ...original, id: randomUUID() }, tx);
      throw new Error('rollback marker');
    }),
  ).rejects.toThrow('rollback marker');
  expect((await agents.runs.list({ agentId: agent.id })).length).toBe(
    countBefore,
  );
  const payloads = await agents.claims.claim(runner, 1);
  expect(payloads).toHaveLength(1);
  const payload = payloads[0];
  expect(payload.run.id).toBe(queued.pluginRunId);
  expect(JSON.stringify(payload)).toContain('Research only');
  expect(payload.prompt.system).toContain(
    '最终回答必须是完整 JSON：{ok:boolean,content:string',
  );
  expect(payload.prompt.system).toContain('Never read, print or copy');
  expect(payload.prompt.system).toContain('不得跳过人工审核');
  await agents.reports.start(runner, payload.run.id, {
    workDir: '/synthetic',
    acceptsInput: false,
  });
  await agents.reports.events(runner, payload.run.id, {
    events: [
      {
        seq: 1,
        at: new Date().toISOString(),
        type: 'status',
        content: 'Preparing report',
      },
    ],
  });
  expect((await tasks.get(project, id)).agentEvents).toEqual([
    expect.objectContaining({ text: 'Preparing report' }),
  ]);
  await agents.reports.complete(runner, payload.run.id, {
    summary: JSON.stringify({ ok: true, content: 'Verified transport report' }),
    handledInputIds: payload.inputs.map((input) => input.id),
  });
  await tasks.runtime.sync(
    await tasks.snapshot(tasks.key('run', project, id, queued.id)),
  );
  await tasks.runtime.sync(
    await tasks.snapshot(tasks.key('run', project, id, queued.id)),
  );
  const finished = await tasks.get(project, id);
  expect(finished.artifacts).toHaveLength(1);
  expect(finished.artifacts[0].content).toBe('Verified transport report');
  const invalidId = await startTask();
  const invalid = (await tasks.get(project, invalidId)).runs[0];
  const invalidPayload = (await agents.claims.claim(runner, 10)).find(
    (payload) => payload.run.id === invalid.pluginRunId,
  )!;
  expect(invalidPayload?.run.id).toBe(invalid.pluginRunId);
  await agents.reports.start(runner, invalidPayload.run.id, {
    workDir: '/synthetic',
    acceptsInput: false,
  });
  await agents.reports.complete(runner, invalidPayload.run.id, {
    summary: 'not a structured result',
    handledInputIds: invalidPayload.inputs.map((input) => input.id),
  });
  await tasks.runtime.sync(
    await tasks.snapshot(tasks.key('run', project, invalidId, invalid.id)),
  );
  const rejected = await tasks.get(project, invalidId);
  expect(rejected.artifacts).toHaveLength(0);
  await vi.waitFor(
    async () => {
      await tasks.runtime.sync(
        await tasks.snapshot(tasks.key('run', project, invalidId, invalid.id)),
      );
      expect((await tasks.get(project, invalidId)).runs[0].error).toBe(
        'invalid_agent_result',
      );
    },
    { timeout: 10000 },
  );
  const cancelledId = await startTask();
  const before = await tasks.get(project, cancelledId);
  await tasks.update(
    project,
    {
      taskId: cancelledId,
      revision: before.work.revision,
      requestId: randomUUID(),
      command: 'cancelTask',
    },
    actor,
    'Admin',
  );
  await tasks.runtime.sync(
    await tasks.snapshot(
      tasks.key('run', project, cancelledId, before.runs[0].id),
    ),
  );
  expect((await agents.runs.get(before.runs[0].pluginRunId)).status).toBe(
    'cancelled',
  );
  expect((await tasks.get(project, cancelledId)).artifacts).toHaveLength(0);
});
