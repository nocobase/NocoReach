// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { afterEach, expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import { onlineAgentsToken } from '../../server/providers/online-agents.js';
import {
  DEFAULT_ONLINE_AGENT,
  type OnlineConversation,
} from '../../shared/online-agent.js';
import {
  OnlineAgentError,
  type ModelEvent,
} from '../../server/online-agent/contracts.js';
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
afterEach(() => vi.restoreAllMocks());
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
type Client = Awaited<ReturnType<typeof signIn>>;
const post = (client: Client, path: string, body: unknown, method = 'POST') =>
  client.fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  });
const finish: ModelEvent = {
  type: 'finish',
  reason: 'stop',
  model: 'test-model',
  usage: { inputTokens: 7, outputTokens: 9 },
};

test('online conversations are durable, idempotent, owner-scoped and cancellable without a Runner', async ({
  testApp,
  connection,
}) => {
  const service = testApp.application.container.resolve(onlineAgentsToken);
  await service.stop();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const person = await connection
    .repository('user')
    .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } });
  const actor = String(person!.id);
  vi.spyOn(service.models, 'resolve').mockResolvedValue({
    modelService: 'test',
    model: 'test-model',
  });
  const stream = vi
    .spyOn(service.models, 'stream')
    .mockImplementation(async function* () {
      yield { type: 'text', delta: 'Complete answer' };
      yield finish;
    });
  const input = {
    requestId: randomUUID(),
    agentId: DEFAULT_ONLINE_AGENT,
    projectId: null,
    text: 'Original question',
  };
  const created = await post(admin, '/onlineAgents/conversations', input);
  expect(created.status).toBe(200);
  const conversation = ((await created.json()) as { data: OnlineConversation })
    .data;
  expect((await post(admin, '/onlineAgents/conversations', input)).status).toBe(
    200,
  );
  const conflict = await post(admin, '/onlineAgents/conversations', {
    ...input,
    text: 'Changed',
  });
  expect(conflict.status).toBe(409);
  expect((await conflict.json()).error.reason).toBe('requestConflict');
  service.start();
  await service.idle();
  await service.stop();
  const runs = await service.conversationRuns(conversation);
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({
    status: 'completed',
    output: 'Complete answer',
    usage: { inputTokens: 7, outputTokens: 9 },
  });
  expect(stream).toHaveBeenCalledOnce();
  const credentials = {
    email: 'online-member@example.com',
    password: 'test-password-123',
    name: 'Member',
  };
  const other = await testApp.application.container
    .resolve(userAdministrationServiceToken)
    .create(credentials);
  // Direct calls also enforce ownership; an application non-member is denied before reading any conversation.
  await expect(
    service.conversation(conversation.id, other.id),
  ).rejects.toMatchObject({ status: 404 });
  const outsider = await signIn(testApp, credentials);
  expect(
    (await outsider.fetch(`/onlineAgents/conversations/${conversation.id}`))
      .status,
  ).toBe(403);
  expect(
    (
      await post(outsider, '/onlineAgents/definitions', {
        name: 'Unauthorized',
        instructions: '',
        enabled: true,
        model: null,
        revision: 0,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await post(admin, '/nocoreach/nrMembers/setRole', {
        userId: other.id,
        role: 'member',
      })
    ).status,
  ).toBe(200);
  expect(
    (await outsider.fetch(`/onlineAgents/conversations/${conversation.id}`))
      .status,
  ).toBe(404);
  expect(
    (
      await post(outsider, '/onlineAgents/definitions', {
        name: 'Unauthorized member',
        instructions: '',
        enabled: true,
        model: null,
        revision: 0,
      })
    ).status,
  ).toBe(403);
  const message = {
    requestId: randomUUID(),
    revision: conversation.revision,
    text: 'Follow up',
  };
  expect(
    (
      await post(
        admin,
        `/onlineAgents/conversations/${conversation.id}/messages`,
        message,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await post(
        admin,
        `/onlineAgents/conversations/${conversation.id}/messages`,
        message,
      )
    ).status,
  ).toBe(200);
  const latest = await service.conversation(conversation.id, actor);
  const cancelled = await post(
    admin,
    `/onlineAgents/runs/${latest.activeRunId}/cancel`,
    {},
  );
  expect(cancelled.status).toBe(200);
  service.start();
  await service.idle();
  await service.stop();
  expect(stream).toHaveBeenCalledOnce();
  expect((await service.run(latest.activeRunId!)).status).toBe('cancelled');
  const invalid = await service.saveDefinition({
    name: 'Retired model',
    instructions: '',
    enabled: true,
    model: { modelService: 'removed', model: 'gone' },
    revision: 0,
  });
  vi.mocked(service.models.resolve).mockRejectedValueOnce(
    new OnlineAgentError('modelUnavailable'),
  );
  await expect(
    service.saveDefinition(
      { ...invalid, instructions: 'Still enabled' },
      invalid.id,
    ),
  ).rejects.toMatchObject({ code: 'modelUnavailable' });
  vi.mocked(service.models.resolve).mockRejectedValueOnce(
    new OnlineAgentError('modelUnavailable'),
  );
  expect(
    await service.saveDefinition({ ...invalid, enabled: false }, invalid.id),
  ).toMatchObject({ enabled: false });
  vi.mocked(service.models.resolve).mockResolvedValue({
    modelService: 'test',
    model: 'test-model',
  });
  const definition = await service.definition(DEFAULT_ONLINE_AGENT);
  await service.saveDefinition(
    { ...definition, enabled: false },
    definition.id,
  );
  await expect(
    service.saveDefinition(definition, definition.id),
  ).rejects.toMatchObject({ code: 'revisionConflict' });
  expect(
    (
      await post(
        admin,
        `/onlineAgents/conversations/${conversation.id}/messages`,
        {
          requestId: randomUUID(),
          revision: latest.revision,
          text: 'Disabled',
        },
      )
    ).status,
  ).toBe(409);
  expect(
    (await admin.fetch(`/onlineAgents/conversations/${conversation.id}`))
      .status,
  ).toBe(200);
  await service.saveDefinition(
    { ...(await service.definition(definition.id)), enabled: true },
    definition.id,
  );
});

test('online research uses task tools and result validation; legacy retry is explicit and repository work requires a Runner', async ({
  testApp,
  connection,
}) => {
  const service = testApp.application.container.resolve(onlineAgentsToken);
  await service.stop();
  const runtime = testApp.application.container.resolve(nocoReachToken),
    plugin = runtime.plugin;
  const tasks = plugin.taskExecution;
  const realTick = tasks.tick.bind(tasks);
  vi.spyOn(tasks, 'tick').mockResolvedValue(undefined);
  await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const person = await connection
      .repository('user')
      .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } }),
    actor = String(person!.id);
  await plugin.projects.create({
    name: 'Online research',
    domain: 'online.example.com',
    language: 'zh-CN',
  });
  const project = String((await plugin.projects.list()).at(-1).id);
  vi.spyOn(service.models, 'resolve').mockResolvedValue({
    modelService: 'test',
    model: 'test-model',
  });
  let mode: 'research' | 'legacy' = 'research';
  const stream = vi
    .spyOn(service.models, 'stream')
    .mockImplementation(async function* (request) {
      if (!request.messages.some((message) => message.role === 'tool')) {
        yield {
          type: 'toolCall',
          call: {
            id: 'context',
            name: 'task_data',
            args: { section: 'context' },
          },
        };
        yield {
          type: 'toolCall',
          call: {
            id: 'draft',
            name: 'task_draft',
            args: { content: 'Candidate draft' },
          },
        };
        yield { ...finish, reason: 'toolCalls' };
        return;
      }
      yield {
        type: 'text',
        delta:
          mode === 'legacy'
            ? 'Legacy deliverable'
            : JSON.stringify({
                ok: true,
                content: 'Research deliverable',
                report: {
                  kind: 'research',
                  sources: [],
                  asOf: 'Fixture data',
                  uncertainties: ['No live sources'],
                },
              }),
      };
      yield finish;
    });
  const task = await plugin.db.getRepository('nrTasks').create({
    values: {
      projectId: project,
      taskKey: randomUUID(),
      title: 'Research',
      brief: 'Read supplied evidence',
      status: '待处理',
      evidence: { createdBy: { id: actor, name: 'Admin' } },
    },
  });
  const taskId = String(task.id);
  const command = async (command: string, values: object = {}) =>
    tasks.update(
      project,
      {
        taskId,
        revision: (await tasks.get(project, taskId)).work.revision,
        requestId: randomUUID(),
        command,
        ...values,
      },
      actor,
      'Admin',
    );
  await tasks.agents.select(
    project,
    { revision: 0, agentId: DEFAULT_ONLINE_AGENT },
    actor,
  );
  await command('startTask', { playbookId: 'competitor-compare' });
  let view = await tasks.get(project, taskId);
  expect(view.runs[0].onlineRunId).toBeTruthy();
  expect(view.runs[0].pluginRunId).toBeUndefined();
  const realClaim = tasks.claim.bind(tasks);
  const concurrentClaim = vi
    .spyOn(tasks, 'claim')
    .mockImplementationOnce(async (run, options) => {
      // The synchronizer wins after the worker has read the queued business run.
      await realClaim(run, options);
      return null;
    });
  service.start();
  await service.idle();
  await service.stop();
  expect(concurrentClaim).toHaveBeenCalled();
  concurrentClaim.mockRestore();
  await realTick();
  view = await tasks.get(project, taskId, undefined, { userId: actor });
  expect(view.runs[0].status).toBe('succeeded');
  expect(view.work.flow.stages[view.work.stageIndex].kind).toBe('review');
  expect(view.work.results[0].content).toBe('Research deliverable');
  expect(view.savedDraft?.content).toBe('Candidate draft');
  expect(view.onlineExecution?.status).toBe('completed');
  const businessRun = view.runs[0];
  await expect(
    tasks.online.enqueue(
      { ...businessRun, input: '{}', id: randomUUID(), mode: 'build' },
      { connection } as never,
      DEFAULT_ONLINE_AGENT,
    ),
  ).rejects.toMatchObject({ status: 409 });
  // A saved pre-upgrade ai stage starts a new independent run only on an explicit retry.
  const legacyTask = await plugin.db.getRepository('nrTasks').create({
    values: {
      projectId: project,
      taskKey: randomUUID(),
      title: 'Legacy',
      brief: 'Saved workflow',
      status: '进行中',
      evidence: {
        work: {
          schemaVersion: 2,
          revision: 1,
          stage: 'flow',
          plan: null,
          planVersion: 0,
          step: 0,
          results: [],
          history: [],
          operations: [],
          humanOwnerId: actor,
          flow: {
            id: 'legacy',
            name: 'Legacy',
            version: 1,
            stages: [
              { key: 'draft', name: 'Draft', kind: 'ai', instruction: 'Write' },
              { key: 'review', name: 'Review', kind: 'review' },
            ],
          },
          stageIndex: 0,
        },
      },
    },
  });
  mode = 'legacy';
  const legacyId = String(legacyTask.id);
  await tasks.update(
    project,
    {
      taskId: legacyId,
      revision: 1,
      requestId: randomUUID(),
      command: 'retryStage',
      stageKey: 'draft',
    },
    actor,
    'Admin',
  );
  service.start();
  await service.idle();
  await service.stop();
  await realTick();
  const legacy = await tasks.get(project, legacyId);
  expect(legacy.work.results[0].content).toBe('Legacy deliverable');
  expect(legacy.work.stageIndex).toBe(1);
  expect(stream).toHaveBeenCalledTimes(4);
});

test('active cancellation preserves partial output and expired claims never replay after restart', async ({
  testApp,
  connection,
}) => {
  const service = testApp.application.container.resolve(onlineAgentsToken);
  await service.stop();
  await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const actor = String(
    (await connection
      .repository('user')
      .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } }))!.id,
  );
  vi.spyOn(service.models, 'resolve').mockResolvedValue({
    modelService: 'test',
    model: 'test-model',
  });
  const stream = vi
    .spyOn(service.models, 'stream')
    .mockImplementation(async function* ({ signal }) {
      yield { type: 'text', delta: 'Partial answer' };
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        else
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
      });
      yield finish;
    });
  const conversation = await service.createConversation({
    requestId: randomUUID(),
    ownerId: actor,
    agentId: DEFAULT_ONLINE_AGENT,
    projectId: null,
    text: 'Stop me',
  });
  service.start();
  await vi.waitFor(async () =>
    expect((await service.run(conversation.activeRunId!)).output).toBe(
      'Partial answer',
    ),
  );
  await service.cancel(conversation.activeRunId!);
  await service.idle();
  await service.stop();
  expect(await service.run(conversation.activeRunId!)).toMatchObject({
    status: 'cancelled',
    output: 'Partial answer',
  });
  const next = await service.send(conversation.id, actor, {
    requestId: randomUUID(),
    revision: 0,
    text: 'Interrupted turn',
  });
  const row = (await service.store.get(next.activeRunId!))!;
  const run = await service.run(next.activeRunId!);
  await service.store.replace(
    {
      ...row,
      status: 'running',
      revision: row.revision + 1,
      payload: {
        ...run,
        status: 'running',
        holder: 'previous-process',
        startedAt: '2020-01-01T00:00:00.000Z',
        deadline: '2020-01-01T00:00:01.000Z',
        revision: run.revision + 1,
      },
    },
    row.revision,
  );
  service.start();
  await service.idle();
  await service.stop();
  expect(await service.run(next.activeRunId!)).toMatchObject({
    status: 'failed',
    error: 'interrupted',
  });
  expect(stream).toHaveBeenCalledOnce();
});

test('disabled accounts stop active work, and shutdown does not wait for a stalled host preparation', async ({
  testApp,
  connection,
}) => {
  const service = testApp.application.container.resolve(onlineAgentsToken);
  await service.stop();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const administration = testApp.application.container.resolve(
    userAdministrationServiceToken,
  );
  const member = await administration.create({
    email: `disabled-online-${randomUUID()}@example.com`,
    password: 'test-password-123',
    name: 'Temporary member',
  });
  expect(
    (
      await post(admin, '/nocoreach/nrMembers/setRole', {
        userId: member.id,
        role: 'member',
      })
    ).status,
  ).toBe(200);
  vi.spyOn(service.models, 'resolve').mockResolvedValue({
    modelService: 'test',
    model: 'test-model',
  });
  vi.spyOn(service.models, 'stream').mockImplementation(async function* ({
    signal,
  }) {
    yield { type: 'text', delta: 'Before revocation' };
    await new Promise<void>((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
    });
    yield finish;
  });
  const conversation = await service.createConversation({
    requestId: randomUUID(),
    ownerId: member.id,
    agentId: DEFAULT_ONLINE_AGENT,
    projectId: null,
    text: 'Authorized before disable',
  });
  service.start();
  await vi.waitFor(async () =>
    expect((await service.run(conversation.activeRunId!)).output).toBe(
      'Before revocation',
    ),
  );
  await administration.disable(member.id);
  await vi.waitFor(async () =>
    expect(await service.run(conversation.activeRunId!)).toMatchObject({
      status: 'failed',
      error: 'accessDenied',
    }),
  );
  await service.stop();
  const actor = String(
    (await connection
      .repository('user')
      .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } }))!.id,
  );
  const { OnlineAgentService } =
    await import('../../server/online-agent/service.js');
  let release!: (context: {
    instructions: string;
    tools: [];
    authorize: () => Promise<void>;
  }) => void;
  let entered = false;
  const execute = vi.fn(async () => 'Must not execute');
  const stalled = new OnlineAgentService(
    service.store,
    service.models,
    { execute },
    {
      prepare: () => {
        entered = true;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    },
  );
  const waiting = await stalled.createConversation({
    requestId: randomUUID(),
    ownerId: actor,
    agentId: DEFAULT_ONLINE_AGENT,
    projectId: null,
    text: 'Stalled input preparation',
  });
  stalled.start();
  await vi.waitFor(() => expect(entered).toBe(true));
  try {
    await Promise.race([
      stalled.stop(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Shutdown waited for host I/O')),
          1000,
        ),
      ),
    ]);
    expect(await stalled.run(waiting.activeRunId!)).toMatchObject({
      status: 'failed',
      error: 'interrupted',
    });
  } finally {
    release({ instructions: '', tools: [], authorize: async () => {} });
  }
  expect(execute).not.toHaveBeenCalled();
});
