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
import { OnlineAgentError } from '../../server/online-agent/errors.js';
import type { ModelEvent } from '@nocobase/app-plugin-agents/server/tokens';
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
  vi.spyOn(service, 'resolveModel').mockResolvedValue({
    modelService: 'test',
    model: 'test-model',
  });
  const stream = vi
    .spyOn(service.models.gateway, 'stream')
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
  await expect(
    service.send(actor, {
      ...message,
      conversationId: conversation.id,
      revision: latest.revision,
    }),
  ).rejects.toMatchObject({ code: 'requestConflict' });
  await expect(
    service.send(actor, {
      ...input,
      requestId: message.requestId,
    }),
  ).rejects.toMatchObject({ code: 'requestConflict' });
  expect(await service.conversationRuns(latest)).toHaveLength(2);
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
  const concurrent = await Promise.allSettled(
    ['A', 'B'].map((text) =>
      service.send(actor, {
        requestId: randomUUID(),
        conversationId: latest.id,
        revision: latest.revision,
        text,
      }),
    ),
  );
  expect(
    concurrent.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(
    concurrent.filter((result) => result.status === 'rejected'),
  ).toHaveLength(1);
  const afterConcurrent = await service.conversation(conversation.id, actor);
  expect(await service.conversationRuns(afterConcurrent)).toHaveLength(3);
  await service.cancel(afterConcurrent.activeRunId);
  const invalid = await service.saveDefinition({
    name: 'Retired model',
    instructions: '',
    enabled: true,
    model: { modelService: 'removed', model: 'gone' },
    revision: 0,
  });
  vi.mocked(service.resolveModel).mockRejectedValueOnce(
    new OnlineAgentError('modelUnavailable'),
  );
  await expect(
    service.saveDefinition(
      { ...invalid, instructions: 'Still enabled' },
      invalid.id,
    ),
  ).rejects.toMatchObject({ code: 'modelUnavailable' });
  vi.mocked(service.resolveModel).mockRejectedValueOnce(
    new OnlineAgentError('modelUnavailable'),
  );
  expect(
    await service.saveDefinition({ ...invalid, enabled: false }, invalid.id),
  ).toMatchObject({ enabled: false });
  vi.mocked(service.resolveModel).mockResolvedValue({
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
          revision: afterConcurrent.revision,
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
  vi.spyOn(service, 'resolveModel').mockResolvedValue({
    modelService: 'test',
    model: 'test-model',
  });
  const stream = vi
    .spyOn(service.models.gateway, 'stream')
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
  const conversation = await service.send(actor, {
    requestId: randomUUID(),
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
  const next = await service.send(actor, {
    conversationId: conversation.id,
    requestId: randomUUID(),
    revision: 0,
    text: 'Interrupted turn',
  });
  const run = await service.run(next.activeRunId!);
  await service.records.save('run', {
    ...run,
    status: 'running',
    holder: 'previous-process',
    startedAt: '2020-01-01T00:00:00.000Z',
    deadline: '2020-01-01T00:00:01.000Z',
  });
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
  vi.spyOn(service, 'resolveModel').mockResolvedValue({
    modelService: 'test',
    model: 'test-model',
  });
  vi.spyOn(service.models.gateway, 'stream').mockImplementation(
    async function* ({ signal }) {
      yield { type: 'text', delta: 'Before revocation' };
      await new Promise<void>((_resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        else
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
      });
      yield finish;
    },
  );
  const conversation = await service.send(member.id, {
    requestId: randomUUID(),
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
  const stream = vi.mocked(service.models.gateway.stream).mockClear();
  const stalled = new OnlineAgentService(
    service.database,
    service.models,
    () => {
      entered = true;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  );
  vi.spyOn(stalled, 'resolveModel').mockResolvedValue({
    modelService: 'test',
    model: 'test-model',
  });
  const waiting = await stalled.send(actor, {
    requestId: randomUUID(),
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
  expect(stream).not.toHaveBeenCalled();
});

test('online agents cannot be task executors and chat exposes only read-only project tools', async ({
  testApp,
  connection,
}) => {
  const service = testApp.application.container.resolve(onlineAgentsToken);
  await service.stop();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const actor = String(
    (await connection
      .repository('user')
      .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } }))!.id,
  );
  const { plugin } = testApp.application.container.resolve(nocoReachToken);
  await plugin.projects.create({
    name: 'Chat context',
    domain: 'chat.example.com',
    language: 'zh-CN',
  });
  const project = String((await plugin.projects.list()).at(-1).id);
  vi.spyOn(service, 'resolveModel').mockResolvedValue({
    modelService: 'fixture',
    model: 'fixture',
  });
  let metrics: unknown;
  const stream = vi
    .spyOn(service.models.gateway, 'stream')
    .mockImplementation(async function* (request) {
      if (!request.messages.some((message) => message.role === 'tool')) {
        yield {
          type: 'toolCall',
          call: {
            id: 'metrics',
            name: 'project_data',
            args: { section: 'metrics' },
          },
        };
        yield { ...finish, reason: 'toolCalls' };
        return;
      }
      const material = request.messages.find(
        (message) => message.role === 'tool',
      );
      metrics = JSON.parse(JSON.parse(material!.content).text);
      yield { type: 'text', delta: 'Answer from context' };
      yield finish;
    });
  const before = await service.conversations(actor);
  const status = await plugin.taskExecution.agents.status(
    project,
    undefined,
    actor,
  );
  expect(
    status.options.some((agent) => agent.id === DEFAULT_ONLINE_AGENT),
  ).toBe(false);
  expect(
    (
      await post(admin, '/nocoreach/nrAgent/select', {
        projectId: project,
        agentId: DEFAULT_ONLINE_AGENT,
        revision: 0,
      })
    ).status,
  ).toBe(404);
  const task = await plugin.db.getRepository('nrTasks').create({
    values: {
      projectId: project,
      taskKey: randomUUID(),
      title: 'Runner only',
      status: '待处理',
      evidence: { createdBy: { id: actor, name: 'Admin' } },
    },
  });
  const response = await post(admin, '/nocoreach/nrTaskWork/advance', {
    projectId: project,
    taskId: String(task.id),
    revision: 0,
    requestId: randomUUID(),
    command: 'setAgent',
    agentId: DEFAULT_ONLINE_AGENT,
  });
  expect(response.status).toBe(409);
  const tasks = plugin.taskExecution;
  const taskId = String(task.id);
  const view = await tasks.get(project, taskId);
  // A task saved by the previous deployment cannot bypass Runner validation on start.
  await tasks.lock(project, taskId, async (tx) => {
    const stored = await tasks.task(project, taskId, tx);
    await tasks.save(
      stored,
      { ...view.work, agentId: DEFAULT_ONLINE_AGENT },
      tx,
    );
  });
  const denied = await post(admin, '/nocoreach/nrTaskWork/advance', {
    projectId: project,
    taskId,
    revision: (await tasks.get(project, taskId)).work.revision,
    requestId: randomUUID(),
    command: 'startTask',
    playbookId: 'change-research',
  });
  expect(denied.status).toBe(409);
  expect(await denied.text()).toContain('任务 Agent 已失效，请重新选择');
  expect(
    (await plugin.taskExecution.get(project, String(task.id))).runs,
  ).toEqual([]);
  expect(await service.conversations(actor)).toEqual(before);
  const conversation = await service.send(actor, {
    requestId: randomUUID(),
    projectId: project,
    agentId: DEFAULT_ONLINE_AGENT,
    text: 'Project question',
  });
  service.start();
  await service.idle();
  await service.stop();
  expect(stream).toHaveBeenCalledTimes(2);
  expect(stream.mock.calls[0][0].tools.map((tool) => tool.name).sort()).toEqual(
    ['project_data', 'read_page'],
  );
  expect(metrics).toEqual({ available: false, reason: 'metrics_unavailable' });
  expect((await service.run(conversation.activeRunId!)).status).toBe(
    'completed',
  );
});

test('chat stores one input per turn, reconstructs completed history and preserves safe gateway error codes', async ({
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
  vi.spyOn(service, 'resolveModel').mockResolvedValue({
    modelService: 'fixture',
    model: 'fixture',
  });
  const { agentsToken } =
    await import('@nocobase/app-plugin-agents/server/tokens');
  const gateway =
    testApp.application.container.resolve(agentsToken).models.gateway;
  const requests: unknown[][] = [];
  const stream = vi
    .spyOn(gateway, 'stream')
    .mockImplementation(async function* (request) {
      requests.push(structuredClone(request.messages) as unknown[]);
      yield { type: 'text', delta: 'First answer' };
      yield finish;
    });
  let conversation = await service.send(actor, {
    requestId: randomUUID(),
    projectId: null,
    agentId: DEFAULT_ONLINE_AGENT,
    text: 'First question',
  });
  const execute = async () => {
    service.start();
    await service.idle();
    await service.stop();
  };
  await execute();
  conversation = await service.send(actor, {
    conversationId: conversation.id,
    requestId: randomUUID(),
    revision: conversation.revision,
    text: 'Second question',
  });
  await execute();
  const prompt = (requests[1] as { role: string; content: string }[]).filter(
    (message) => message.role !== 'system',
  );
  expect(prompt).toEqual([
    { role: 'user', content: 'First question' },
    { role: 'assistant', content: 'First answer' },
    { role: 'user', content: 'Second question' },
  ]);
  const stored = await service.conversationRuns(conversation);
  expect(stored.map((turn) => turn.input)).toEqual([
    'First question',
    'Second question',
  ]);
  expect(
    stored.every((turn) => !('messages' in turn) && !('subject' in turn)),
  ).toBe(true);
  for (const [code, safe] of [
    ['auth', 'modelAuth'],
    ['quota', 'modelQuota'],
    ['rateLimit', 'modelRateLimit'],
    ['network', 'modelNetwork'],
  ]) {
    stream.mockImplementation(async function* () {
      yield { type: 'text', delta: 'Unfinished answer' };
      throw Object.assign(
        new Error('provider credentials and raw details must remain private'),
        { name: 'ModelError', code },
      );
    });
    conversation = await service.send(actor, {
      conversationId: conversation.id,
      requestId: randomUUID(),
      revision: conversation.revision,
      text: `Question ${code}`,
    });
    await execute();
    const failed = await service.run(conversation.activeRunId!);
    expect(failed).toMatchObject({ status: 'failed', error: safe });
    expect(JSON.stringify(failed)).not.toContain('provider credentials');
    expect(
      stream.mock
        .lastCall![0].messages.filter((message) => message.role === 'assistant')
        .map((message) => message.content),
    ).toEqual(['First answer', 'First answer']);
  }
});
