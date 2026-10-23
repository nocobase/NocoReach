// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { MockLanguageModelV4 } from 'ai/test';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import { onlineChatSettingsToken } from '../../server/providers/online-agents.js';
import type { OnlineThread } from '../../shared/online-agent.js';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
type Client = Awaited<ReturnType<typeof signIn>>;
type Chunk = Record<string, unknown>;
type App = Parameters<Parameters<typeof test>[1]>[0]['testApp'];
const send = (client: Client, path: string, body: unknown, method = 'POST') =>
  client.fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  });
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const finish = (reason = 'stop'): Chunk => ({
  type: 'finish',
  usage,
  finishReason: { unified: reason, raw: reason },
});
const toolCall = (name: string, input: unknown): Chunk[] => [
  {
    type: 'tool-call',
    toolCallId: `${name}-call`,
    toolName: name,
    input: JSON.stringify(input),
  },
  finish('tool-calls'),
];
const text = (value: string): Chunk[] => [
  { type: 'text-start', id: 't' },
  { type: 'text-delta', id: 't', delta: value },
  { type: 'text-end', id: 't' },
  finish(),
];

/** The plugin's native execution answers from these steps instead of a model service. */
function scriptModel(testApp: App, steps: Chunk[][]) {
  const prompts: unknown[] = [];
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      prompts.push(options.prompt);
      const chunks = steps.shift() ?? text('Done.');
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          },
        }),
      };
    },
  });
  type Deps = {
    model: () => Promise<unknown>;
    defaultModel: () => Promise<unknown>;
  };
  // The service, its native backend and the native execution each keep a copy of the model dependencies.
  const backend = (
    testApp.application.container.resolve(agentsToken)
      .onlineAgent as unknown as {
      native: { deps: Deps; native: { deps: Deps } };
    }
  ).native;
  for (const deps of [backend.deps, backend.native.deps]) {
    deps.model = async () => model;
    deps.defaultModel = async () => ({
      modelService: 'fixture',
      model: 'chat',
    });
  }
  return prompts;
}
async function startOnline(
  client: Client,
  projectId: string | null,
  agentId = 'online',
) {
  return send(client, '/agents/conversations', {
    agentId,
    config: { scope: ['nocoreach'], context: { variable: { projectId } } },
  });
}
async function ask(client: Client, id: string, question: string) {
  const response = await send(client, `/agents/conversations/${id}/messages`, {
    message: {
      id: `q-${Date.now()}`,
      role: 'user',
      parts: [{ type: 'text', text: question }],
    },
  });
  expect(response.status).toBe(200);
  await response.text();
  await vi.waitFor(
    async () => {
      const detail = (
        await (await client.fetch(`/agents/conversations/${id}`)).json()
      ).data;
      // Waiting for an approval also ends the turn for now.
      expect(
        detail.execution?.waitingApproval ||
          (detail.execution?.status ?? 'idle') === 'idle',
      ).toBe(true);
    },
    { timeout: 20000 },
  );
  return (
    await (await client.fetch(`/agents/conversations/${id}/messages`)).json()
  ).data as {
    role: string;
    parts: { type: string; state?: string; output?: unknown }[];
  }[];
}
async function member(testApp: App, email: string) {
  const container = testApp.application.container;
  const credentials = { email, password: 'test-password-123' };
  const user = await container
    .resolve(userAdministrationServiceToken)
    .create({ ...credentials, name: email });
  const assignment = await container
    .resolve(authorizationToken)
    .permissionSets.assign({
      permissionSet: 'nr.member',
      subject: { type: 'user', id: user.id },
    });
  return { user, assignment, client: await signIn(testApp, credentials) };
}

test('online conversations take the nocoreach scope, its project tools and Chat panel settings', async ({
  testApp,
}) => {
  const container = testApp.application.container;
  const { plugin } = container.resolve(nocoReachToken);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const project = await plugin.projects.create({
    name: 'Scoped chat',
    domain: 'scoped-chat.example.test',
  });
  const projectId = String(project.id);
  const settings = (await (await admin.fetch('/onlineAgents/settings')).json())
    .data;
  expect(settings).toMatchObject({ enabled: true, instructions: '' });
  const saved = await send(
    admin,
    '/onlineAgents/settings',
    {
      enabled: true,
      instructions: 'Answer briefly.',
      model: null,
      revision: settings.revision,
    },
    'PUT',
  );
  expect(saved.status).toBe(200);

  const prompts = scriptModel(testApp, [
    toolCall('project_data', { section: 'project' }),
    text('The project is Scoped chat.'),
  ]);
  const created = await startOnline(admin, projectId);
  expect(created.status).toBe(201);
  const id = (await created.json()).data.id as string;
  const config = (
    await (await admin.fetch(`/agents/conversations/${id}/config`)).json()
  ).data;
  expect(config.tool.sort()).toEqual(
    [
      'daily_analysis',
      'project_data',
      'read_page',
      'task_execute',
      'task_get',
      'task_list',
    ].sort(),
  );
  expect(config.systemPrompt).toContain('Answer briefly.');
  expect(config.systemPrompt).toContain('online assistant in NocoReach');
  expect(config.variable).toEqual({ projectId });

  const history = await ask(admin, id, 'What is this project?');
  const tool = history
    .flatMap((message) => message.parts)
    .find((part) => part.type === 'tool-project_data');
  expect(tool).toMatchObject({ state: 'output-available' });
  // The chat shows how much was read, never the project data itself.
  expect(Object.keys(tool!.output as object).sort()).toEqual([
    'nextOffset',
    'totalCharacters',
  ]);
  expect(JSON.stringify(history)).not.toContain('scoped-chat.example.test');
  expect(JSON.stringify(prompts.at(-1))).toContain('Scoped chat');

  // Without a project only the task tools are offered.
  const unbound = await startOnline(admin, null);
  const unboundConfig = (
    await (
      await admin.fetch(
        `/agents/conversations/${(await unbound.json()).data.id}/config`,
      )
    ).json()
  ).data;
  expect(unboundConfig.tool.sort()).toEqual(
    ['task_execute', 'task_get', 'task_list'].sort(),
  );
  // A Runner agent cannot take NocoReach's native tools.
  expect((await startOnline(admin, null, 'runner-agent')).status).not.toBe(201);
  // Variables are checked against the scope.
  expect(
    (
      await send(admin, '/agents/conversations', {
        agentId: 'online',
        config: {
          scope: ['nocoreach'],
          context: { variable: { projectId: 'x' } },
        },
      })
    ).status,
  ).toBe(400);
  // The online agent is reached only through NocoReach's scope: its prompt, switch, model and project check.
  for (const body of [
    { agentId: 'online' },
    {},
    { agentId: 'online', config: { scope: [] } },
  ]) {
    const refused = await send(admin, '/agents/conversations', body);
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toMatchObject({
      domain: 'onlineAgent',
      reason: 'scopeRequired',
    });
  }
});

test('creation and tools recheck project access and the Chat panel switch', async ({
  testApp,
}) => {
  const container = testApp.application.container;
  const { plugin, legacy } = container.resolve(nocoReachToken);
  await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const joined = await plugin.projects.create({
    name: 'Joined',
    domain: 'joined.example.test',
  });
  const other = await plugin.projects.create({
    name: 'Other',
    domain: 'other.example.test',
  });
  const { user, assignment, client } = await member(
    testApp,
    'online-member@example.test',
  );
  await legacy.db.access!.joinCreatedProject(user.id, String(joined.id));
  scriptModel(testApp, [
    toolCall('project_data', { section: 'project' }),
    text('Read.'),
  ]);
  expect((await startOnline(client, String(other.id))).status).toBe(403);
  const created = await startOnline(client, String(joined.id));
  expect(created.status).toBe(201);
  const id = (await created.json()).data.id as string;

  const store = container.resolve(onlineChatSettingsToken);
  const current = await store.get();
  await store.save({ ...current, enabled: false });
  expect((await startOnline(client, String(joined.id))).status).toBe(403);
  // A conversation created before the switch was turned off cannot be continued or approved in either.
  for (const path of ['messages', 'approval']) {
    const refused = await send(client, `/agents/conversations/${id}/${path}`, {
      message: {
        id: `q-${path}`,
        role: 'user',
        parts: [{ type: 'text', text: 'Read the project' }],
      },
    });
    expect(refused.status).toBe(403);
    expect((await refused.json()).error).toMatchObject({
      domain: 'onlineAgent',
      reason: 'chatDisabled',
    });
  }

  const enabled = await store.get();
  await store.save({ ...enabled, enabled: true });
  // On again, the same conversation answers, and its tools read the project.
  const history = await ask(client, id, 'Read the project');
  const tool = history
    .flatMap((message) => message.parts)
    .find((part) => part.type === 'tool-project_data');
  expect(tool?.state).toBe('output-available');
  // Still a member, but no longer in the project: its conversation cannot be continued.
  await container
    .resolve(databaseManagerToken)
    .transaction((connection) =>
      legacy.db.access!.setProjects(connection, user.id, []),
    );
  const left = await send(client, `/agents/conversations/${id}/messages`, {
    message: {
      id: 'q-left',
      role: 'user',
      parts: [{ type: 'text', text: 'Read the project again' }],
    },
  });
  expect(left.status).toBe(403);
  expect((await left.json()).error).toMatchObject({
    domain: 'onlineAgent',
    reason: 'accessDenied',
  });
  await container
    .resolve(authorizationToken)
    .permissionSets.revoke(assignment.id);
  expect((await startOnline(client, String(joined.id))).status).toBe(403);
});

test('task_execute waits for approval in the chat before it hands work to a Runner', async ({
  testApp,
}) => {
  const container = testApp.application.container;
  const { plugin } = container.resolve(nocoReachToken);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const project = await plugin.projects.create({
    name: 'Approval',
    domain: 'approval.example.test',
  });
  scriptModel(testApp, [
    toolCall('task_execute', {
      projectId: String(project.id),
      taskId: '1',
      command: 'startTask',
      revision: 0,
    }),
  ]);
  const id = (await (await startOnline(admin, String(project.id))).json()).data
    .id as string;
  const history = await ask(admin, id, 'Start task 1');
  const part = history
    .flatMap((message) => message.parts)
    .find((item) => item.type === 'tool-task_execute');
  expect(part?.state).toBe('approval-requested');
});

test('conversations asked from Insights are indexed by project and day and list only for their owner', async ({
  testApp,
}) => {
  const container = testApp.application.container;
  const { plugin, legacy } = container.resolve(nocoReachToken);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const project = await plugin.projects.create({
    name: 'Insights',
    domain: 'insights.example.test',
  });
  const projectId = String(project.id);
  scriptModel(testApp, [text('About that day.')]);
  const started = await send(admin, '/onlineAgents/threads', {
    projectId,
    day: '2026-10-21',
    opportunityId: 'o1',
  });
  expect(started.status).toBe(200);
  const id = (await started.json()).data.id as string;
  // One conversation a day: starting the day again, as another tab would, returns it.
  const again = await send(admin, '/onlineAgents/threads', {
    projectId,
    day: '2026-10-21',
  });
  expect((await again.json()).data.id).toBe(id);
  const detail = (
    await (await admin.fetch(`/agents/conversations/${id}`)).json()
  ).data;
  expect(detail.source).toBe('insights');
  const config = (
    await (await admin.fetch(`/agents/conversations/${id}/config`)).json()
  ).data;
  expect(config.variable).toEqual({ projectId });
  await ask(admin, id, 'Why this opportunity?');

  const listed = (
    await (
      await admin.fetch(`/onlineAgents/threads?projectId=${projectId}`)
    ).json()
  ).data as OnlineThread[];
  expect(listed).toEqual([
    expect.objectContaining({
      id,
      subject: { kind: 'insights', day: '2026-10-21', opportunityId: 'o1' },
      running: false,
      turns: 1,
    }),
  ]);
  // Two tabs asking a new day's first question at once share one conversation.
  const pair = await Promise.all(
    [0, 1].map(
      async () =>
        (
          await (
            await send(admin, '/onlineAgents/threads', {
              projectId,
              day: '2026-10-22',
            })
          ).json()
        ).data.id as string,
    ),
  );
  expect(pair[1]).toBe(pair[0]);
  // An archived day's conversation gives way to a new one.
  expect(
    (
      await send(
        admin,
        `/agents/conversations/${pair[0]}`,
        { archived: true },
        'PATCH',
      )
    ).status,
  ).toBe(200);
  const fresh = (
    await (
      await send(admin, '/onlineAgents/threads', {
        projectId,
        day: '2026-10-22',
      })
    ).json()
  ).data.id as string;
  expect(fresh).not.toBe(pair[0]);

  const { user, client } = await member(
    testApp,
    'insights-member@example.test',
  );
  await legacy.db.access!.joinCreatedProject(user.id, projectId);
  expect(
    (
      await (
        await client.fetch(`/onlineAgents/threads?projectId=${projectId}`)
      ).json()
    ).data,
  ).toEqual([]);
  expect((await client.fetch(`/agents/conversations/${id}`)).status).toBe(404);
  const hidden = await plugin.projects.create({
    name: 'Hidden',
    domain: 'hidden-insights.example.test',
  });
  expect(
    (
      await send(client, '/onlineAgents/threads', {
        projectId: String(hidden.id),
        day: '2026-10-21',
      })
    ).status,
  ).toBe(403);
});
