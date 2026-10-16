// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import { CreatedTaskStarter } from '../../client/pages/task-create-start.js';
import { discoverAgents } from './runner-fixture.js';
import type { TaskData } from '../../client/pages/task-execution-types.js';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});

test('manual creation and existing start preserve authorization, state and idempotency across lost responses', async ({
  testApp,
  connection,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  const plugin = runtime.plugin as any;
  const tasks = plugin.taskExecution;
  tasks.stop();
  const agents = testApp.application.container.resolve(agentsToken);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const actor = String(
    (await connection
      .repository('user')
      .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } }))!.id,
  );
  await plugin.projects.create({
    name: 'Manual start',
    domain: 'manual-start.example.test',
  });
  const projectId = String((await plugin.projects.list()).at(-1).id);
  const {
    discovered: [agent],
  } = await discoverAgents(agents, actor, ['manual-start-agent']);
  await agents.agents.update(agent.id, actor, {
    expectedRevision: agent.revision,
    description: 'Isolated research',
    enabled: true,
  });
  const client = await connection.client<Knex>();
  const locks = vi.spyOn(tasks, 'lock');
  const costs: Record<string, unknown> = {};
  async function measured<T>(name: string, run: () => Promise<T>) {
    const statements: string[] = [];
    const previousLocks = locks.mock.calls.length;
    const observe = ({ sql }: { sql: string }) => statements.push(sql);
    client.on('query', observe);
    try {
      return await run();
    } finally {
      client.off('query', observe);
      costs[name] = {
        total: statements.length,
        reads: statements.filter((sql) => /^select/i.test(sql)).length,
        writes: statements.filter((sql) => /^(insert|update|delete)/i.test(sql))
          .length,
        transactions: statements.filter((sql) => /^begin/i.test(sql)).length,
        taskLocks: locks.mock.calls.length - previousLocks,
      };
    }
  }
  async function call(resource: string, action: string, body: object) {
    const response = await admin.fetch(`/nocoreach/${resource}/${action}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(payload.error?.message || 'Rejected'), {
        status: response.status,
      });
    return payload.data;
  }
  await measured('options.agent', () =>
    call('nrAgent', 'status', { projectId }),
  );
  await measured('options.playbooks', () =>
    call('nrPlaybooks', 'list', { projectId }),
  );
  const body = {
    projectId,
    title: 'Created once',
    description: 'Research criteria',
    requestId: randomUUID(),
  };
  const create = () =>
    admin.fetch('/nocoreachTasks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify(body),
    });
  const created = await measured('create', create);
  expect(created.status).toBe(201);
  const task = (await created.json()).data;
  const withPlaybook = await measured('create.withPlaybook', () =>
    admin.fetch('/nocoreachTasks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        ...body,
        requestId: randomUUID(),
        playbookId: 'change-research',
      }),
    }),
  );
  expect(withPlaybook.status).toBe(201);
  const pendingTask = (await withPlaybook.json()).data;
  expect((await tasks.get(projectId, pendingTask.id)).runs).toHaveLength(0);
  const warmBaseline = await measured('create.warmBaseline', () =>
    admin.fetch('/nocoreachTasks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ ...body, requestId: randomUUID() }),
    }),
  );
  expect(warmBaseline.status).toBe(201);
  expect((await create().then((response) => response.json())).data.id).toBe(
    task.id,
  );
  expect((await tasks.get(projectId, task.id)).runs).toHaveLength(0);

  // A project member may read this task, but cannot start another owner's task.
  const credentials = {
    email: 'manual-start-other@example.test',
    password: 'fictional-password-123',
  };
  const person = await testApp.application.container
    .resolve(userAdministrationServiceToken)
    .create({ ...credentials, name: 'Other member' });
  await plugin.db.getRepository('nrSnapshots').create({
    values: {
      key: 'nr-members',
      payload: { users: { [String(person.id)]: 'member' } },
    },
  });
  const member = await signIn(testApp, credentials);
  const denied = await member.fetch('/nocoreach/nrTaskWork/advance', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({
      projectId,
      taskId: task.id,
      revision: 0,
      requestId: randomUUID(),
      command: 'startTask',
      playbookId: 'change-research',
    }),
  });
  expect(denied.status).toBe(403);
  expect((await tasks.get(projectId, task.id)).work.stage).toBe('plan');
  let loseResponse = true;
  let advanceIndex = 0;
  const starter = new CreatedTaskStarter(async (action, values) => {
    const result = (await measured(`${action}.${advanceIndex++}`, () =>
      call('nrTaskWork', action, { projectId, taskId: task.id, ...values }),
    )) as TaskData;
    if (
      action === 'advance' &&
      (values as { command?: string }).command === 'startTask' &&
      loseResponse
    ) {
      loseResponse = false;
      throw new TypeError('Committed response lost');
    }
    return result;
  });
  await expect(starter.start(agent.id, 'change-research')).rejects.toThrow(
    'Committed response lost',
  );
  expect(starter.data!.runs).toHaveLength(1);
  const runId = starter.data!.runs[0].id;
  const recovered = await starter.start(agent.id, 'change-research');
  expect(recovered.runs).toHaveLength(1);
  expect(recovered.runs[0]).toMatchObject({
    id: runId,
    status: 'queued',
    agentId: agent.id,
  });
  expect((await agents.runs.get(recovered.runs[0].pluginRunId!))!.agentId).toBe(
    agent.id,
  );
  expect((await create().then((response) => response.json())).data.id).toBe(
    task.id,
  );
  await measured('feedback.sources', () =>
    call('nrHealth', 'connected', { projectId }),
  );
  await measured('feedback.badges', () =>
    call('nrStrategy', 'badges', { projectId }),
  );
  process.stdout.write(
    `PM-459 measured request costs ${JSON.stringify(costs)}\n`,
  );
  await tasks.updateTask(
    projectId,
    {
      taskId: task.id,
      revision: recovered.work.revision,
      requestId: randomUUID(),
      command: 'cancelRun',
      runId,
    },
    actor,
    'Admin',
  );
  await tasks.runtime.sync((await tasks.get(projectId, task.id)).runs[0]);
});
