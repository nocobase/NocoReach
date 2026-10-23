// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import { createNocoReachOnlineHost } from '../../server/nocoreach/online-agent/host.js';
import type { OnlineBinding } from '../../server/nocoreach/online-agent/tool.js';
import { discoverAgents } from './runner-fixture.js';

const settings = async () => ({
  enabled: true,
  instructions: '',
  model: null,
  revision: 0,
});
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  scope: 'test',
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});

test('online tools isolate users/projects, paginate, link tasks and recheck revoked membership', async ({
  testApp,
  connection,
}) => {
  await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const container = testApp.application.container;
  const host = container.resolve(nocoReachToken);
  await host.ready;
  const user = await container.resolve(userAdministrationServiceToken).create({
    email: 'online-tasks@example.test',
    password: 'test-password-123',
    name: 'Task owner',
  });
  const sets = container.resolve(authorizationToken).permissionSets;
  const assignment = await sets.assign({
    permissionSet: 'nr.member',
    subject: { type: 'user', id: user.id },
  });
  const projects = [];
  for (const name of ['visible', 'also-visible', 'hidden'])
    projects.push(
      await host.plugin.projects.create({
        name,
        domain: `${name}.example.test`,
      }),
    );
  for (const project of projects.slice(0, 2))
    await host.legacy.db.access!.joinCreatedProject(
      user.id,
      String(project.id),
    );
  const ids: string[] = [];
  for (const [index, project] of projects.entries()) {
    const task = await host.plugin.db.getRepository('nrTasks').create({
      values: {
        projectId: String(project.id),
        taskKey: randomUUID(),
        title: `Task ${index}`,
        status: '待处理',
        evidence: { createdBy: { id: user.id } },
      },
    });
    ids.push(String(task.id));
  }
  const run: OnlineBinding = {
    turnId: randomUUID(),
    ownerId: user.id,
    projectId: null,
    signal: new AbortController().signal,
  };
  const context = await createNocoReachOnlineHost(
    () => host,
    '/nested/main',
    settings,
  )(run);
  const call = async (name: string, input: unknown): Promise<any> =>
    context.tools.find((tool) => tool.name === name)!.execute(input);
  const first = await call('task_list', { limit: 1 });
  expect(first.items).toHaveLength(1);
  expect(first.nextOffset).toBe(1);
  expect(first.items[0].url).toBe(
    `/nested/main/actions/${ids[0]}?projectId=${projects[0].id}`,
  );
  const second = await call('task_list', {
    limit: 1,
    offset: first.nextOffset,
  });
  expect(second.items[0].taskId).toBe(ids[1]);
  expect(second.nextOffset).toBeNull();
  expect((await call('task_list', { scope: 'executable' })).items).toEqual([]);
  await expect(
    call('task_get', { projectId: String(projects[2].id), taskId: ids[2] }),
  ).rejects.toBeDefined();
  await expect(
    call('task_execute', {
      projectId: String(projects[2].id),
      taskId: ids[2],
      revision: 0,
      command: 'startTask',
    }),
  ).rejects.toBeDefined();
  await expect(
    call('task_execute', {
      projectId: String(projects[0].id),
      taskId: ids[0],
      revision: 0,
      command: 'approveStage',
    }),
  ).rejects.toBeDefined();
  await expect(
    call('task_list', { ownerId: 'someone-else' }),
  ).rejects.toBeDefined();
  const other = await host.plugin.db.getRepository('nrTasks').create({
    values: {
      projectId: String(projects[0].id),
      taskKey: randomUUID(),
      title: 'Another owner',
      status: '待处理',
      evidence: { createdBy: { id: 'another-owner' } },
    },
  });
  expect((await call('task_list', {})).items).toHaveLength(2);
  expect((await call('task_list', { scope: 'accessible' })).items).toHaveLength(
    3,
  );
  await expect(
    call('task_execute', {
      projectId: String(projects[0].id),
      taskId: String(other.id),
      revision: 0,
      command: 'startTask',
    }),
  ).rejects.toBeDefined();
  await sets.revoke(assignment.id);
  await expect(call('task_list', {})).rejects.toMatchObject({ status: 403 });
  expect(
    await connection.repository('nrTasks').findOne({ filter: { id: ids[2] } }),
  ).toBeTruthy();
});

test('online start enqueues the selected Runner exactly once and never becomes the executor', async ({
  testApp,
  connection,
}) => {
  await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const container = testApp.application.container;
  const host = container.resolve(nocoReachToken);
  await host.ready;
  const user = (await connection.repository('user').findOne({
    filter: { email: DEFAULT_ADMIN_CREDENTIALS.email },
  }))!;
  const actor = String(user.id);
  const agents = container.resolve(agentsToken);
  const { discovered } = await discoverAgents(agents, actor, [
    'online-task-runner',
  ]);
  const runner = discovered[0];
  await agents.agents.update(runner.id, actor, {
    expectedRevision: runner.revision,
    description: 'Research',
    enabled: true,
  });
  const project = await host.plugin.projects.create({
    name: 'Runner tasks',
    domain: 'runner-tasks.example.test',
  });
  const projectId = String(project.id);
  const task = await host.plugin.db.getRepository('nrTasks').create({
    values: {
      projectId,
      taskKey: randomUUID(),
      title: 'Research',
      brief: 'Research the market',
      status: '待处理',
      evidence: {
        createdBy: { id: actor },
        work: {
          schemaVersion: 2,
          revision: 0,
          stage: 'plan',
          plan: null,
          planVersion: 0,
          step: 0,
          results: [],
          history: [],
          operations: [],
          receipt: null,
          verification: null,
          playbookId: 'change-research',
        },
      },
    },
  });
  const taskId = String(task.id);
  const run: OnlineBinding = {
    turnId: randomUUID(),
    ownerId: actor,
    projectId: null,
    signal: new AbortController().signal,
  };
  const context = await createNocoReachOnlineHost(
    () => host,
    '/main',
    settings,
  )(run);
  const call = async (name: string, input: unknown): Promise<any> =>
    context.tools.find((tool) => tool.name === name)!.execute(input);
  const selected = await call('task_execute', {
    projectId,
    taskId,
    revision: 0,
    command: 'setAgent',
    agentId: runner.id,
  });
  expect(selected.agentId).toBe(runner.id);
  const before = await call('task_get', { projectId, taskId });
  expect(before.command).toBe('startTask');
  const input = {
    projectId,
    taskId,
    revision: before.revision,
    command: 'startTask',
  };
  const started = await call('task_execute', input);
  expect(started.latestRun.status).toBe('queued');
  expect(started.ownerId).toBe(actor);
  expect(started.ownerName).toBe(user.name);
  await call('task_execute', input);
  const data = await host.plugin.taskExecution.get(projectId, taskId);
  expect(data.runs).toHaveLength(1);
  expect(data.runs[0].agentId).toBe(runner.id);
  expect(data.runs[0].pluginRunId).toBeTruthy();
  expect(data.runs[0].actor).toBe(actor);
  await expect(
    call('task_execute', {
      projectId,
      taskId,
      revision: 0,
      command: 'retryStage',
      stageKey: 'analyze',
    }),
  ).rejects.toBeDefined();
});

test('daily_analysis reads the saved analysis for a project member and stops once access is revoked', async ({
  testApp,
}) => {
  await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const container = testApp.application.container;
  const host = container.resolve(nocoReachToken);
  await host.ready;
  const user = await container.resolve(userAdministrationServiceToken).create({
    email: 'online-analysis@example.test',
    password: 'test-password-123',
    name: 'Analysis reader',
  });
  const assignment = await container
    .resolve(authorizationToken)
    .permissionSets.assign({
      permissionSet: 'nr.member',
      subject: { type: 'user', id: user.id },
    });
  const project = await host.plugin.projects.create({
    name: 'Analysis',
    domain: 'analysis.example.test',
  });
  const projectId = String(project.id);
  await host.legacy.db.access!.joinCreatedProject(user.id, projectId);
  await host.plugin.db.getRepository('nrSnapshots').create({
    values: {
      key: `strategy:${projectId}`,
      payload: {
        revision: 1,
        goal: null,
        proposals: [],
        insights: {
          generatedAt: '2026-10-21T01:00:00Z',
          observations: ['Search impressions fell 27%'],
          items: [
            {
              id: 'o1',
              no: 7,
              title: 'Fix indexing',
              observation: '',
              meaning: '',
              evidenceText: '',
              limitation: '',
              suggestion: 'Check Search Console coverage',
              objective: '',
              source: 'search',
            },
          ],
          evidence: {
            analysisVersion: 3,
            capturedAt: '',
            availableThrough: '2026-10-17',
            periodDays: 28,
            searchQueries: [],
            pages: [],
            industryCandidates: [],
            limitations: [],
          },
        },
      },
    },
  });
  const signal = new AbortController().signal;
  const context = await createNocoReachOnlineHost(
    () => host,
    '/main',
    settings,
  )({
    turnId: randomUUID(),
    ownerId: user.id,
    projectId,
    signal,
  });
  const tool = context.tools.find((t) => t.name === 'daily_analysis')!;
  const page = (await tool.execute({})) as { text: string };
  const view = JSON.parse(page.text);
  expect(view.analysis).toMatchObject({
    day: '2026-10-21',
    notes: ['Search impressions fell 27%'],
  });
  expect(view.analysis.opportunities[0]).toMatchObject({
    no: 'O-7',
    status: 'awaiting_decision',
    url: '/main/opportunities?item=o1',
  });
  await container
    .resolve(authorizationToken)
    .permissionSets.revoke(assignment.id);
  await expect(tool.execute({})).rejects.toMatchObject({
    status: 403,
  });
});
