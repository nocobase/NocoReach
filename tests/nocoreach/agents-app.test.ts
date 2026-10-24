// @vitest-environment node
// Real plugin/database contract; the coding tool itself is replaced by explicit Runner reports.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest';
import { create as createTar } from 'tar';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { discoverAgents } from './runner-fixture';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
afterEach(() => vi.restoreAllMocks());
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const distribution = await mkdtemp(join(tmpdir(), 'nocoreach-dist-test-'));
let cliArchive: Buffer;
let cliSha256: string;
beforeAll(async () => {
  const product = join(distribution, 'stable/nocoreach');
  const staging = join(distribution, 'staging');
  await mkdir(join(staging, 'nocoreach/bin'), { recursive: true });
  await mkdir(product, { recursive: true });
  await writeFile(
    join(staging, 'nocoreach/bin/nocoreach'),
    '#!/usr/bin/env node\nconsole.log("nocoreach-test");\n',
    { mode: 0o755 },
  );
  await createTar(
    { gzip: true, cwd: staging, file: join(product, 'cli.tar.gz') },
    ['nocoreach'],
  );
  cliArchive = await readFile(join(product, 'cli.tar.gz'));
  cliSha256 = createHash('sha256').update(cliArchive).digest('hex');
  await writeFile(
    join(product, 'manifest.json'),
    JSON.stringify({
      schema: 1,
      product: 'nocoreach',
      bin: 'nocoreach',
      versions: {
        '1.0.0': {
          targets: {
            universal: {
              file: 'cli.tar.gz',
              sha256: cliSha256,
              size: cliArchive.length,
            },
          },
        },
      },
    }),
  );
});
afterAll(() => rm(distribution, { recursive: true, force: true }));
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    agents: { dist: { dir: distribution } },
  },
});

test('the distributed Runner accepts ACP registration and online tool and capacity updates', async ({
  testApp,
  connection,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const agents = testApp.application.container.resolve(agentsToken);
  const person = await connection
    .repository('user')
    .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } });
  const runnerRoot = pathToFileURL(
    createRequire(import.meta.url).resolve(
      '@nocobase/agent-runner/package.json',
    ),
  );
  // Use the installed Runner's parser; the server's parser can hide version skew.
  const protocol = await import(
    new URL('dist/protocol/index.js', runnerRoot).href
  );
  const { ApiClient } = await import(
    new URL('dist/lib/http.js', runnerRoot).href
  );
  const { version } = JSON.parse(await readFile(runnerRoot, 'utf8'));
  const registration = await agents.runners.createRegistrationToken(
    String(person!.id),
    { enabledTools: ['amp'], slots: 2, toolSlots: { amp: 1 } },
  );
  const options = {
    server: `http://localhost${testApp.publicBasePath}`,
    headers: { 'x-nocobase-protocol': String(protocol.PROTOCOL_VERSION) },
    fetch: (input: string | URL | Request, init?: RequestInit) =>
      testApp.fetch(new Request(input, init)),
  };
  const registered = await new ApiClient(options).post(
    protocol.RUNNER_ROUTES.register,
    {
      registrationToken: registration.token,
      name: 'Protocol compatibility Runner',
      hostname: 'test',
      os: 'linux',
      arch: 'x64',
      version,
      protocolVersion: protocol.PROTOCOL_VERSION,
      features: [],
      tools: [{ kind: 'amp', authenticated: true }],
    },
    protocol.RegisterResponseSchema,
  );
  expect(registered).toMatchObject({
    enabledTools: ['amp'],
    slots: 2,
    toolSlots: { amp: 1 },
  });
  const runner = new ApiClient({
    ...options,
    headers: {
      ...options.headers,
      'x-nocobase-runner-key': registered.runnerKey,
    },
  });
  const heartbeat = (slots: number) =>
    runner.post(
      protocol.RUNNER_ROUTES.heartbeat,
      {
        version,
        features: [],
        tools: [],
        active: [],
        load: { slots, free: slots, capacitySource: 'online' },
      },
      protocol.HeartbeatResponseSchema,
    );
  expect(await heartbeat(2)).toMatchObject({
    enabledTools: ['amp'],
    capacity: { slots: 2, toolSlots: { amp: 1 } },
  });
  const changed = await admin.fetch(`/agents/runners/${registered.runnerId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
    },
    body: JSON.stringify({
      enabledTools: ['codex'],
      slots: 4,
      toolSlots: { codex: 3 },
      redetectTools: true,
    }),
  });
  expect(changed.status).toBe(200);
  const updated = await heartbeat(2);
  expect(updated).toMatchObject({
    enabledTools: ['codex'],
    detectTools: true,
    capacity: { slots: 4, toolSlots: { codex: 3 } },
  });
  expect(updated.compatibility).toBeUndefined();
  expect(await heartbeat(4)).toMatchObject({ detectTools: false });
  expect(await agents.runners.get(registered.runnerId)).toMatchObject({
    slots: 4,
    reportedSlots: 4,
    capacitySource: 'online',
  });
});

test('task assignment enqueues the selected official agent and keeps the project default', async ({
  testApp,
  connection,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const runtime = testApp.application.container.resolve(nocoReachToken);
  const agents = testApp.application.container.resolve(agentsToken);
  const person = await connection
    .repository('user')
    .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } });
  const actor = String(person!.id);
  const plugin = runtime.plugin as any;
  const tasks = plugin.taskExecution;
  vi.spyOn(tasks, 'tick').mockResolvedValue(undefined);
  await plugin.projects.create({
    name: 'Task assignment',
    domain: 'assignment.example.com',
    language: 'zh-CN',
  });
  const project = String((await plugin.projects.list()).at(-1).id);
  const { discovered } = await discoverAgents(agents, actor, [
    'assignment-default',
    'assignment-task',
    'assignment-pending',
  ]);
  const [defaultAgent, taskAgent, pendingAgent] = discovered;
  for (const agent of [defaultAgent, taskAgent])
    await agents.agents.update(agent.id, actor, {
      expectedRevision: agent.revision,
      description: 'Task research',
      enabled: true,
    });
  // Existing defaults remain readable after removing project-level selection.
  await tasks.lock(project, 'agent', (tx) =>
    tasks.put(
      `nr-task-agent:${project}`,
      { revision: 1, agentId: defaultAgent.id, repo: null },
      tx,
    ),
  );
  const task = await plugin.db.getRepository('nrTasks').create({
    values: {
      projectId: project,
      taskKey: randomUUID(),
      title: 'Assign directly',
      brief: 'Research without a repository',
      status: '待处理',
      evidence: { createdBy: { id: actor, name: 'Admin' } },
    },
  });
  const taskId = String(task.id);
  async function command(
    command: string,
    values: Record<string, unknown> = {},
  ) {
    const view = await tasks.get(project, taskId);
    return admin.fetch('/nocoreach/nrTaskWork/advance', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        projectId: project,
        taskId,
        revision: view.work.revision,
        requestId: randomUUID(),
        command,
        ...values,
      }),
    });
  }
  const choices = (await tasks.get(project, taskId)).agent.options;
  expect(choices.map((option: { id: string }) => option.id)).toContain(
    taskAgent.id,
  );
  expect(choices.map((option: { id: string }) => option.id)).not.toContain(
    pendingAgent.id,
  );
  expect((await command('setAgent', { agentId: pendingAgent.id })).status).toBe(
    409,
  );
  expect((await command('setAgent', { agentId: taskAgent.id })).status).toBe(
    200,
  );
  expect((await tasks.get(project, taskId)).agent.agentId).toBe(taskAgent.id);
  expect(
    (await command('startTask', { playbookId: 'change-research' })).status,
  ).toBe(200);
  const view = await tasks.get(project, taskId);
  expect(view.work.agentId).toBe(taskAgent.id);
  expect(view.runs[0].agentName).toBe(taskAgent.name);
  expect((await agents.runs.get(view.runs[0].pluginRunId)).agentId).toBe(
    taskAgent.id,
  );
  expect((await tasks.agents.doc(project)).agentId).toBe(defaultAgent.id);
  expect((await command('setAgent', { agentId: defaultAgent.id })).status).toBe(
    409,
  );
  // Remove this test's queued work so it cannot be claimed by the next contract test's runner.
  await command('cancelRun', { runId: view.runs[0].id });
  await tasks.runtime.sync((await tasks.get(project, taskId)).runs[0]);
});

test('protocol 11 Runner claims a task, returns its result once, and handles cancellation', async ({
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
  // Drive synchronization explicitly so the claim/timer gap is deterministic.
  vi.spyOn(tasks, 'tick').mockResolvedValue(undefined);
  const knowledge = [1, 2].map((id) => ({
    id: String(id),
    title: `Knowledge ${id}`,
    text: '知'.repeat(120000),
  }));
  const skills = [
    {
      name: 'review',
      required: true,
      body: 'Review',
      files: [{ path: 'reference.md', text: '识'.repeat(200000) }],
    },
  ];
  const knowledgeSource = vi
    .spyOn(plugin.knowledge, 'forAgent')
    .mockResolvedValue(knowledge);
  vi.spyOn(plugin.skills, 'forAgent').mockResolvedValue(skills);
  await plugin.projects.create({
    name: 'Runner contract',
    domain: 'runner.example.com',
    language: 'zh-CN',
  });
  const project = String((await plugin.projects.list()).at(-1).id);
  const {
    connected,
    discovered: [pending],
  } = await discoverAgents(agents, actor, ['contract-model']);
  const agent = await agents.agents.update(pending.id, actor, {
    expectedRevision: pending.revision,
    description: 'Contract tasks',
    enabled: true,
  });
  expect(agent.actions).toEqual(
    expect.arrayContaining(['nocoreach.tasks/read', 'nocoreach.tasks/propose']),
  );
  await tasks.lock(project, 'agent', (tx) =>
    tasks.put(
      `nr-task-agent:${project}`,
      { revision: 1, agentId: agent.id, repo: null },
      tx,
    ),
  );
  const runner = await agents.runners.authenticate(connected.runnerKey);
  async function startTask(playbookId = 'change-research') {
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
        playbookId,
      },
      actor,
      'Admin',
    );
    return id;
  }
  async function command(taskId: string, command: string, values = {}) {
    const view = await tasks.get(project, taskId);
    return tasks.update(
      project,
      {
        taskId,
        command,
        revision: view.work.revision,
        requestId: randomUUID(),
        ...values,
      },
      actor,
      'Admin',
    );
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
  expect(payload.workspace.readOnly).toBe(true);
  // A fresh Runner must receive a downloadable CLI, rather than requiring a command already on its PATH.
  expect(payload.cli.package).toMatchObject({
    kind: 'archive',
    version: '1.0.0',
    sha256: cliSha256,
  });
  if (payload.cli.package.kind !== 'archive')
    throw new Error('CLI archive missing from claim');
  const runnerRoot = pathToFileURL(
    createRequire(import.meta.url).resolve(
      '@nocobase/agent-runner/package.json',
    ),
  );
  const { ApiClient } = await import(
    new URL('dist/lib/http.js', runnerRoot).href
  );
  const { resolveCli } = await import(
    new URL('dist/agent/cli.js', runnerRoot).href
  );
  const downloadClient = new ApiClient({
    server: 'http://localhost' + testApp.publicBasePath,
    headers: {
      'x-nocobase-runner-key': connected.runnerKey,
      'x-nocobase-protocol': '9',
    },
    fetch: (input: string | URL | Request, init?: RequestInit) =>
      testApp.fetch(new Request(input, init)),
  });
  expect(
    Buffer.from(await downloadClient.download(payload.cli.package.url)),
  ).toEqual(cliArchive);
  const executable = await resolveCli({
    paths: { cliDir: join(distribution, 'fresh-runner') },
    cli: payload.cli,
    searchPath: '',
    client: downloadClient,
  });
  const installed = await promisify(execFile)(executable, ['--version']);
  expect(installed.stdout.trim()).toBe('nocoreach-test');
  expect(payload.run.id).toBe(queued.pluginRunId);
  expect(JSON.stringify(payload)).toContain('Research only');
  expect(payload.prompt.system).toContain(
    '最终回答必须是完整 JSON：{ok:boolean,content:string',
  );
  expect(payload.prompt.system).toContain('Never read, print or copy');
  expect(payload.prompt.system).toContain('不得跳过人工审核');
  // Only what the step cannot do without fails it, and the task's own Skills come first (2026-10-24, T-35: a Skill
  // installed on the computer asked for a missing CLI and the run threw its research away).
  expect(payload.prompt.system).toContain('以这次任务提供的 Skills 为准');
  expect(payload.prompt.system).toContain('missing_tool');
  expect(payload.prompt.system).not.toContain('立即失败');
  expect(JSON.stringify(payload).length).toBeLessThan(30000);
  const mount = payload.mounts!.find(
    (mount) => mount.name === 'nocoreach-task-materials',
  )!;
  expect(mount).toBeTruthy();
  // Editing project materials after enqueue cannot change the current step's evidence.
  knowledgeSource.mockResolvedValue([]);
  const mountUrl = `http://localhost${testApp.publicBasePath}/api/agents/runners/runs/${payload.run.id}/mounts/${mount.name}`;
  expect((await testApp.fetch(new Request(mountUrl))).status).toBe(401);
  const downloaded = await testApp.fetch(
    new Request(mountUrl, {
      headers: {
        'x-nocobase-runner-key': connected.runnerKey,
        'x-nocobase-protocol': '9',
      },
    }),
  );
  expect(downloaded.status).toBe(200);
  const bundle = (await downloaded.json()).data;
  expect(bundle.hash).toBe(mount.hash);
  expect(JSON.parse(bundle.files[0].content)).toEqual(knowledge);
  expect(JSON.parse(bundle.files[1].content)).toEqual(skills);

  // Commands use the official ephemeral run credential and cannot choose another project.
  const runToken = (payload.cli.credential.content as { token: string }).token;
  await tasks.business.current({
    kind: 'run',
    userId: actor,
    displayName: 'Contract Agent',
    run: await agents.runs.authenticateToken(runToken),
    agent: await agents.agents.get(agent.id),
  });
  const businessRequest = (suffix: string, body?: unknown, token = runToken) =>
    testApp.fetch(
      new Request(
        `http://localhost${testApp.publicBasePath}/api/nocoreachAgent/${suffix}`,
        {
          method: body ? 'PUT' : 'GET',
          headers: {
            'x-nocobase-run-token': token,
            'content-type': 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      ),
    );
  expect((await businessRequest('data', undefined, '')).status).toBe(401);
  expect((await admin.fetch('/nocoreachAgent/data')).status).toBe(403);

  const contextResponse = await businessRequest('data?section=context');
  expect(contextResponse.status).toBe(200);
  expect((await businessRequest('data?projectId=other')).status).toBe(400);
  expect((await contextResponse.json()).data.projectId).toBe(project);
  const materialResponse = await businessRequest('data?section=knowledge');
  const materialPage = (await materialResponse.json()).data;
  expect(materialPage.value).toBeNull();
  expect(materialPage.page.text.length).toBe(16000);
  expect(materialPage.page.nextOffset).toBe(16000);
  // Exercise the same installed CLI, manifest and file flag used by a real Runner.
  const candidate =
    'Candidate only\n\nKeep this as a draft, with 中文 and `code`.';
  const directory = await mkdtemp(join(tmpdir(), 'nocoreach-task-cli-'));
  const listener = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const result = await testApp.fetch(
        new Request(`http://localhost${request.url}`, {
          method: request.method,
          headers: request.headers as Record<string, string>,
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
        }),
      );
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      response.writeHead(500).end();
    }
  });
  try {
    await new Promise<void>((resolve) =>
      listener.listen(0, '127.0.0.1', resolve),
    );
    const address = listener.address() as { port: number };
    await writeFile(
      join(directory, 'run.json'),
      JSON.stringify({
        ...payload.cli.credential.content,
        server: `http://127.0.0.1:${address.port}${testApp.publicBasePath}`,
        manifestUrl: `${testApp.publicBasePath}/api/cli/manifest`,
      }),
      { mode: 0o600 },
    );
    await writeFile(join(directory, 'draft.md'), candidate);
    const cliUrl = new URL(
      'dist/index.js',
      pathToFileURL(
        createRequire(import.meta.url).resolve(
          '@nocobase/app-cli-client/package.json',
        ),
      ),
    );
    const cli = `import { runAppCli } from ${JSON.stringify(cliUrl.href)}; await runAppCli({bin:'nocoreach',displayName:'NocoReach',stateDir:'.nocoreach-test',homeEnv:'NOCOREACH_TEST_CLI_HOME',runCredentialsFile:'run.json'}, ['task','draft','--content-file','draft.md','--json']);`;
    const result = await promisify(execFile)(
      process.execPath,
      ['--input-type=module', '--eval', cli],
      {
        cwd: directory,
        env: {
          ...process.env,
          NOCOREACH_TEST_CLI_HOME: join(directory, 'state'),
        },
        timeout: 30000,
      },
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      result: { data: { submitted: false } },
    });
    expect((await tasks.get(project, id)).savedDraft.content).toBe(candidate);
    await writeFile(
      join(directory, 'invalid-result.json'),
      JSON.stringify({
        ok: true,
        content: 'Keep this draft',
        report: {
          kind: 'research',
          sources: [{ title: 'Invalid source', url: '../unknown.json' }],
          asOf: '',
          uncertainties: [],
        },
      }),
    );
    const submitCli = cli.replace(
      "['task','draft','--content-file','draft.md','--json']",
      "['task','result','--content-file','invalid-result.json','--json']",
    );
    const rejectedCli = await promisify(execFile)(
      process.execPath,
      ['--input-type=module', '--eval', submitCli],
      {
        cwd: directory,
        env: {
          ...process.env,
          NOCOREACH_TEST_CLI_HOME: join(directory, 'state'),
        },
        timeout: 30000,
      },
    ).then(
      () => null,
      (error) => error,
    );
    expect(JSON.parse(rejectedCli.stdout)).toMatchObject({ ok: false });
    expect(rejectedCli.stdout).toContain('report.sources.0');
  } finally {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
  expect((await tasks.get(project, id)).artifacts).toHaveLength(0);
  const sourceBefore = (await tasks.get(project, id)).sources;
  await tasks.business.prepare(await agents.runs.get(payload.run.id));
  expect((await tasks.get(project, id)).sources).toEqual(sourceBefore);
  // Disabling an agent immediately revokes command access, including an issued run token.
  const editable = await agents.agents.get(agent.id);
  await agents.agents.update(agent.id, actor, {
    expectedRevision: editable.revision,
    enabled: false,
  });
  expect((await businessRequest('data')).status).toBe(403);
  expect((await businessRequest('result', { content: '{}' })).status).toBe(403);
  const revoked = await agents.agents.get(agent.id);
  await agents.agents.update(agent.id, actor, {
    expectedRevision: revoked.revision,
    enabled: true,
  });

  // Official claim already dispatched the run; the business snapshot is still queued.
  const beforeManual = await tasks.get(project, id);
  expect(beforeManual.runs[0].status).toBe('queued');
  await expect(
    command(id, 'recordManual', {
      stageKey: 'analyze',
      content: 'Manual report',
    }),
  ).rejects.toThrow('已领取');
  expect((await tasks.get(project, id)).work.revision).toBe(
    beforeManual.work.revision,
  );
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
  expect((await tasks.get(project, id)).execution.events).toEqual([
    expect.objectContaining({ content: 'Preparing report', type: 'status' }),
  ]);
  const reportAsOf = `数据截至 2026-10-08；${'来源抓取于 2026-10-12T05:08:31.097Z；'.repeat(6)}`;
  const structured = {
    ok: true,
    content: 'Verified transport report',
    report: {
      kind: 'research',
      sources: [{ title: 'Knowledge', material: 'knowledge' }],
      asOf: reportAsOf,
      uncertainties: [],
    },
  };
  expect(
    (await businessRequest('result', { content: 'invalid' }, '')).status,
  ).toBe(401);
  expect(
    (
      await admin.fetch('/nocoreachAgent/result', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({ content: JSON.stringify(structured) }),
      })
    ).status,
  ).toBe(403);
  const invalidResult = await businessRequest('result', {
    content: JSON.stringify({
      ...structured,
      report: {
        ...structured.report,
        sources: [{ title: 'Bad', url: 'file:///secret' }],
      },
    }),
  });
  expect(invalidResult.status).toBe(400);
  expect(JSON.stringify(await invalidResult.json())).toContain(
    'report.sources.0',
  );
  expect(
    (
      await businessRequest('result', {
        content: JSON.stringify(structured),
        taskId: 'other',
      })
    ).status,
  ).toBe(400);
  const submitted = await businessRequest('result', {
    content: JSON.stringify(structured),
  });
  expect(submitted.status).toBe(200);
  const submission = (await submitted.json()).data;
  expect(submission.submitted).toBe(true);
  expect(
    (
      await (
        await businessRequest('result', { content: JSON.stringify(structured) })
      ).json()
    ).data,
  ).toEqual(submission);
  expect(
    (
      await businessRequest('result', {
        content: JSON.stringify({ ...structured, content: 'Replacement' }),
      })
    ).status,
  ).toBe(409);
  expect((await tasks.get(project, id)).artifacts).toHaveLength(0);
  await agents.reports.complete(runner, payload.run.id, {
    // The isolated structured result takes precedence over the human-readable Runner summary.
    summary: 'Result submitted. Local continuation saved separately.',
    handledInputIds: payload.inputs.map((input) => input.id),
  });
  await tasks.runtime.sync(
    await tasks.snapshot(tasks.key('run', project, id, queued.id)),
  );
  await tasks.runtime.sync(
    await tasks.snapshot(tasks.key('run', project, id, queued.id)),
  );
  const finished = await tasks.get(project, id);
  expect([401, 403]).toContain((await businessRequest('data')).status);
  expect(finished.artifacts).toHaveLength(1);
  expect(finished.artifacts[0].content).toBe('Verified transport report');
  expect(finished.artifacts[0].report.asOf).toBe(reportAsOf);
  expect(finished.artifacts[0].report.sources).toEqual(
    structured.report.sources,
  );
  expect([401, 403]).toContain(
    (await businessRequest('result', { content: JSON.stringify(structured) }))
      .status,
  );
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
    summary: JSON.stringify({
      ok: true,
      content: 'Draft with invalid timing',
      report: {
        kind: 'research',
        sources: [],
        asOf: '时'.repeat(1001),
        uncertainties: [],
      },
    }),
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
      expect((await tasks.get(project, invalidId)).runs[0].errorDetail).toBe(
        'Agent 成果的 report.asOf 超过 1000 字符，请缩短资料时间说明',
      );
    },
    { timeout: 10000 },
  );
  // Historical invalid-result runs can be revalidated explicitly without another Runner call.
  const recoveryId = await startTask();
  const recoveryRun = (await tasks.get(project, recoveryId)).runs[0];
  const recoveryPayload = (await agents.claims.claim(runner, 10)).find(
    (p) => p.run.id === recoveryRun.pluginRunId,
  )!;
  await agents.reports.start(runner, recoveryPayload.run.id, {
    workDir: '/synthetic',
    acceptsInput: false,
  });
  // Model the persisted business failure created by the older strict parser.
  await tasks.claim(recoveryRun, { runtimeRunId: recoveryPayload.run.id });
  await tasks.finish(
    recoveryRun,
    undefined,
    'invalid_agent_result',
    'Agent 未返回有效成果',
  );
  await agents.reports.complete(runner, recoveryPayload.run.id, {
    summary:
      JSON.stringify({
        ...structured,
        report: {
          ...structured.report,
          sources: [
            { title: 'Task', url: `nocoreach://task/${recoveryId}` },
            {
              title: 'Knowledge',
              url: '../.nocoreach-materials/knowledge.json',
            },
          ],
        },
      }) +
      '\n\nLocal continuation saved: /runner/repository (' +
      'a'.repeat(40) +
      '); not pushed.',
    handledInputIds: recoveryPayload.inputs.map((p) => p.id),
  });
  const recoveryView = await tasks.get(project, recoveryId);
  const recoveryCommand = {
    taskId: recoveryId,
    command: 'recoverResult',
    stageKey: 'analyze',
    runId: recoveryRun.id,
    revision: recoveryView.work.revision,
    requestId: randomUUID(),
  };
  await expect(
    tasks.update(project, recoveryCommand, 'unknown-user', 'Unauthorized'),
  ).rejects.toThrow();
  await tasks.update(project, recoveryCommand, actor, 'Admin');
  await tasks.update(project, recoveryCommand, actor, 'Admin');
  const recovered = await tasks.get(project, recoveryId);
  expect(recovered.artifacts).toHaveLength(1);
  expect(recovered.artifacts[0].report.sources).toEqual([
    { title: 'Task', material: 'context' },
    { title: 'Knowledge', material: 'knowledge' },
  ]);
  expect(recovered.artifacts[0].approvedAt).toBeUndefined();
  expect(recovered.work.flow.stages[recovered.work.stageIndex].kind).toBe(
    'review',
  );
  expect(recovered.runs[0].status).toBe('failed');
  expect(recovered.runs[0].error).toBe('invalid_agent_result');
  expect(
    recovered.work.history.filter((e) => e.action === 'recoverResult'),
  ).toHaveLength(1);
  await expect(
    command(recoveryId, 'recoverResult', {
      stageKey: 'analyze',
      runId: recoveryRun.id,
    }),
  ).rejects.toThrow();
  await expect(
    command(invalidId, 'recoverResult', {
      stageKey: 'analyze',
      runId: invalid.id,
    }),
  ).rejects.toThrow('report.asOf');
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

  // Generic retry must not create an unmapped plugin run; task retry creates both records.
  const retryPath = `/agents/runs/${invalid.pluginRunId}/retry`;
  const beforeRetry = (await agents.runs.list({ agentId: agent.id })).length;
  expect(
    (
      await testApp.fetch(
        new Request(
          `http://localhost${testApp.publicBasePath}/api${retryPath}`,
          { method: 'POST' },
        ),
      )
    ).status,
  ).toBe(401);
  const refused = await admin.fetch(retryPath, {
    method: 'POST',
    headers: { origin: 'http://localhost' },
  });
  expect(refused.status).toBe(400);
  expect(JSON.stringify(await refused.json())).toContain(
    'NOCOREACH_TASK_RETRY_REQUIRED',
  );
  expect((await agents.runs.list({ agentId: agent.id })).length).toBe(
    beforeRetry,
  );
  expect(
    (
      await admin.fetch(`/agents/runs/${invalid.pluginRunId}/cancel`, {
        method: 'POST',
        headers: { origin: 'http://localhost' },
      })
    ).status,
  ).toBe(400);
  const credentials = {
    email: 'outsider@example.com',
    password: 'test-password-123',
  };
  await testApp.application.container
    .resolve(userAdministrationServiceToken)
    .create({ ...credentials, name: 'Outsider' });
  const outsider = await signIn(testApp, credentials);
  expect((await outsider.fetch('/agents/runs')).status).toBe(403);
  const hidden = await outsider.fetch(retryPath, {
    method: 'POST',
    headers: { origin: 'http://localhost' },
  });
  expect(hidden.status).toBe(404);
  expect(JSON.stringify(await hidden.json())).not.toContain(
    'NOCOREACH_TASK_RETRY_REQUIRED',
  );
  expect(
    (
      await admin.fetch('/agents/runs/does-not-exist/retry', {
        method: 'POST',
        headers: { origin: 'http://localhost' },
      })
    ).status,
  ).toBe(404);
  const retried = await command(invalidId, 'retryStage', {
    stageKey: 'analyze',
  });
  const newRun = retried.runs.find(
    (run: { status: string }) => run.status === 'queued',
  );
  expect(newRun.id).not.toBe(invalid.id);
  expect((await agents.runs.get(newRun.pluginRunId)).subject.id).toBe(
    `${project}:${invalidId}:${newRun.id}`,
  );
  await agents.runs.cancel(newRun.pluginRunId, actor);
  await tasks.runtime.sync(
    await tasks.snapshot(tasks.key('run', project, invalidId, newRun.id)),
  );

  // An unclaimed run can be replaced atomically, so the Runner can never claim it afterwards.
  const manualId = await startTask();
  const manualRun = (await tasks.get(project, manualId)).runs[0];
  await expect(
    command(manualId, 'recordManual', { stageKey: 'analyze', content: '' }),
  ).rejects.toThrow('请填写完整内容');
  expect((await agents.runs.get(manualRun.pluginRunId)).status).toBe('queued');
  await command(manualId, 'recordManual', {
    stageKey: 'analyze',
    content: 'Manual report',
  });
  expect((await agents.runs.get(manualRun.pluginRunId)).status).toBe(
    'cancelled',
  );
  expect(
    (await agents.claims.claim(runner, 10)).some(
      (payload) => payload.run.id === manualRun.pluginRunId,
    ),
  ).toBe(false);

  // Retry behavior for other subject kinds remains the official plugin's.
  const unregister = agents.subjects.register({
    kind: 'retryControl',
    title: { key: 'control', ns: 'test' },
  });
  const control = await agents.runs.enqueue({
    agentId: agent.id,
    subject: { kind: 'retryControl', id: randomUUID() },
    actorUserId: actor,
    input: {
      type: 'signal',
      actor: { kind: 'user', id: actor, name: 'Admin' },
      text: 'Retry control',
    },
  });
  if (control.outcome === 'pending')
    throw new Error('Control run must enqueue');
  await agents.runs.cancel(control.runId, actor);
  const controlRetry = await admin.fetch(
    `/agents/runs/${control.runId}/retry`,
    { method: 'POST', headers: { origin: 'http://localhost' } },
  );
  expect(controlRetry.status).toBe(200);
  await agents.runs.cancel((await controlRetry.json()).data.id, actor);
  unregister();

  // Structured build evidence survives the real plugin boundary. An archived Agent can
  // prevent PR cleanup, but must not undo the user's decision to cancel the task.
  await tasks.agents.saveRepo(project, {
    repo: 'org/site',
    baseBranch: 'main',
    revision: 1,
  });
  const buildId = await startTask('optimize-page');
  const build = (await tasks.get(project, buildId)).runs[0];
  const buildPayload = (await agents.claims.claim(runner, 10)).find(
    (payload) => payload.run.id === build.pluginRunId,
  )!;
  expect(buildPayload.prompt.system).toContain('verifyText');
  expect(buildPayload.prompt.system).toContain(
    'gh pr create --repo <data.repo.repo> --base <data.repo.baseBranch> --head <data.branch>',
  );
  expect(buildPayload.prompt.system).toContain(
    'NocoReach CLI 不提供 pr open/link/unlink；Runner 通用工作区说明中提及这些命令时，以本任务的 GitHub CLI 规则为准',
  );
  // Empty paths mean the whole repository, matching the repository form and result validator.
  const buildSnapshot = await tasks.snapshot(
    tasks.key('run', project, buildId, build.id),
  );
  expect(JSON.parse(buildSnapshot.input).repo.allowedPaths).toEqual([]);
  expect(buildPayload.prompt.system).toContain(
    'data.repo.allowedPaths 为空数组 [] 时表示整个仓库，不额外限制目录，不是禁止修改',
  );
  expect(buildPayload.prompt.system).toContain(
    '非空时只允许修改与列表项相同的文件或所列目录内的文件',
  );
  expect(buildPayload.prompt.system).toContain(
    '无论列表是否为空，都只修改当前任务需要的内容，并遵守仓库规则和 Runner 策略',
  );
  await agents.reports.start(runner, build.pluginRunId, {
    workDir: '/synthetic',
    acceptsInput: false,
  });
  const changes = [
    { path: 'docs/demo.md', before: 'Before', after: '立即体验 Demo' },
  ];
  const buildResult = {
    ok: true,
    content: 'Added demo',
    pr: {
      url: 'https://github.com/org/site/pull/1',
      number: 1,
      branch: `nocoreach/task-${buildId}`,
      headSha: 'abc1234',
      files: [{ path: 'docs/demo.md', additions: 1, deletions: 1 }],
      checks: { ok: true, summary: 'Passed' },
      release: '增加演示入口',
      verifyText: '立即体验 Demo',
      pages: ['https://runner.example.com/demo'],
      changes,
      visibleChanges: [
        {
          page: '/demo',
          label: '页面开头',
          before: '',
          after: '立即体验 Demo',
        },
        { page: '/demo', label: '', before: 'dropped', after: 'no label' },
        'not an object',
      ],
    },
  };
  const buildToken = (buildPayload.cli.credential.content as { token: string })
    .token;
  for (const invalid of [
    { url: 'https://github.com/other/site/pull/1' },
    { branch: 'wrong-branch' },
    { headSha: 'invalid-sha' },
  ]) {
    const response = await businessRequest(
      'result',
      {
        content: JSON.stringify({
          ...buildResult,
          pr: { ...buildResult.pr, ...invalid },
        }),
      },
      buildToken,
    );
    expect(response.status).toBe(400);
    expect(await tasks.business.submitted(build)).toBeFalsy();
  }
  expect(
    (
      await businessRequest(
        'result',
        {
          content: JSON.stringify(buildResult),
        },
        buildToken,
      )
    ).status,
  ).toBe(200);
  expect((await tasks.get(project, buildId)).artifacts).toHaveLength(0);
  await tasks.runtime.sync(
    await tasks.snapshot(tasks.key('run', project, buildId, build.id)),
  );
  const runningBuild = await tasks.snapshot(
    tasks.key('run', project, buildId, build.id),
  );
  const configured = await tasks.agents.doc(project);
  const changedRepo = vi.spyOn(tasks.agents, 'doc').mockResolvedValueOnce({
    ...configured,
    repo: { ...configured.repo!, repo: 'other/site' },
  });
  await expect(
    tasks.acceptAgentResult(project, runningBuild.runtimeRunId, {
      ...buildResult,
      taskId: buildId,
      runId: build.id,
    }),
  ).rejects.toMatchObject({ status: 400 });
  changedRepo.mockRestore();
  expect((await tasks.get(project, buildId)).artifacts).toHaveLength(0);
  await agents.reports.complete(runner, build.pluginRunId, {
    summary: 'Build completed; structured result already submitted.',
    handledInputIds: buildPayload.inputs.map((input) => input.id),
  });
  await tasks.runtime.sync(
    await tasks.snapshot(tasks.key('run', project, buildId, build.id)),
  );
  const built = await tasks.get(project, buildId);
  expect(built.artifacts[0].pr).toMatchObject({
    verifyText: '立即体验 Demo',
    release: '增加演示入口',
    changes,
    visibleChanges: [
      { page: '/demo', label: '页面开头', before: '', after: '立即体验 Demo' },
    ],
  });
  await agents.agents.update(agent.id, actor, {
    expectedRevision: (await agents.agents.get(agent.id)).revision,
    enabled: false,
  });
  const cancelledBuild = await command(buildId, 'cancelTask');
  expect(cancelledBuild.task.status).toBe('已取消');
  expect(cancelledBuild.work.prClose).toMatchObject({
    state: 'failed',
    number: 1,
  });
  expect(cancelledBuild.work.prClose.error).toContain('手动关闭 PR');
});

test('conversation runners discover business commands, query tasks and execute as their user', async ({
  testApp,
  connection,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const doc = await admin.fetch('/swagger');
  expect(doc.status).toBe(200);
  expect(
    Object.keys((await doc.json()).paths).some((path) =>
      path.endsWith('/nocoreachChat/action'),
    ),
  ).toBe(true);
  const runtime = testApp.application.container.resolve(nocoReachToken);
  const agents = testApp.application.container.resolve(agentsToken);
  const plugin = runtime.plugin as any;
  const tasks = plugin.taskExecution;
  vi.spyOn(tasks, 'tick').mockResolvedValue(undefined);
  const person = await connection
    .repository('user')
    .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } });
  const actor = String(person!.id);
  const user = await testApp.application.container
    .resolve(userAdministrationServiceToken)
    .create({
      email: 'chat-business@example.com',
      password: 'test-password-123',
      name: 'Chat member',
    });
  const setRole = (role: string | null) =>
    admin.fetch('/nocoreach/nrMembers/setRole', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ userId: user.id, role }),
    });
  expect((await setRole('member')).status).toBe(200);
  await plugin.projects.create({
    name: 'Chat business',
    domain: 'chat-business.example.com',
    language: 'zh-CN',
  });
  const projectId = String((await plugin.projects.list()).at(-1).id);
  await plugin.db.access!.joinCreatedProject(user.id, projectId);
  const {
    connected,
    discovered: [pending],
  } = await discoverAgents(agents, actor, ['chat-business-model']);
  const agent = await agents.agents.update(pending.id, actor, {
    expectedRevision: pending.revision,
    description: 'Chat business',
    enabled: true,
  });
  const conversation = await agents.conversations.create(user.id, {
    agentId: agent.id,
  });
  const chat = await agents.conversations.send(user.id, conversation.id, {
    content: '查询任务并执行我安排的工作',
  });
  const runner = await agents.runners.authenticate(connected.runnerKey);
  const payload = (await agents.claims.claim(runner, 10)).find(
    (p) => p.run.id === chat.run!.id,
  )!;
  expect(payload).toBeDefined();
  const token = (payload.cli.credential.content as { token: string }).token;
  const request = (path: string, body?: unknown, credential = token) =>
    testApp.fetch(
      new Request(`http://localhost${testApp.publicBasePath}/api/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'x-nocobase-run-token': credential,
          'content-type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  const action = (
    resource: string,
    action: string,
    values: Record<string, unknown> = {},
  ) => request('nocoreachChat/action', { resource, action, values });
  expect((await request('nocoreachChat/actions', undefined, '')).status).toBe(
    401,
  );
  expect((await admin.fetch('/nocoreachChat/actions')).status).toBe(403);
  const manifest = await request('cli/manifest');
  expect(manifest.status).toBe(200);
  const manifestText = JSON.stringify(await manifest.json());
  expect(manifestText).toContain('business actions');
  expect(manifestText).toContain('business action');
  expect(manifestText).toContain('business task create');
  const catalog = await request('nocoreachChat/actions');
  expect(catalog.status).toBe(200);
  const operations = (await catalog.json()).data;
  expect(operations).toContainEqual({
    resource: 'nrTaskWork',
    action: 'advance',
  });
  expect(operations).not.toContainEqual({
    resource: 'nrMembers',
    action: 'setRole',
  });
  expect(
    (await action('nrMembers', 'setRole', { userId: user.id, role: 'admin' }))
      .status,
  ).toBe(403);
  expect((await action('nrGoogle', 'callback')).status).toBe(404);
  expect((await action('nrUnknown', 'list')).status).toBe(404);
  for (const [resource, operation] of [
    ['nrGoogle', 'configure'],
    ['nrGitHub', 'setToken'],
    ['nrKeywords', 'configure'],
  ]) {
    expect((await action(resource, operation, { projectId })).status).toBe(403);
  }
  expect((await action('nrProjects', 'list')).status).toBe(200);
  const input = {
    projectId,
    title: 'Chat-created task',
    description: 'Research the project',
    requestId: randomUUID(),
    playbookId: 'change-research',
  };
  const created = await request('nocoreachChat/tasks', input);
  expect(created.status).toBe(200);
  const task = (await created.json()).data;
  const replay = await request('nocoreachChat/tasks', input);
  expect((await replay.json()).data.id).toBe(task.id);
  const list = await action('nrTaskWork', 'list', { projectId });
  expect(list.status).toBe(200);
  expect((await list.json()).data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: task.id, title: input.title }),
    ]),
  );
  const get = await action('nrTaskWork', 'get', { projectId, taskId: task.id });
  expect(get.status).toBe(200);
  const view = (await get.json()).data;
  const advance = {
    projectId,
    taskId: task.id,
    revision: view.work.revision,
    requestId: randomUUID(),
    command: 'setAgent',
    agentId: agent.id,
  };
  expect((await action('nrTaskWork', 'advance', advance)).status).toBe(200);
  expect(
    (
      await action('nrTaskWork', 'advance', {
        ...advance,
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(409);
  const selected = (
    await (
      await action('nrTaskWork', 'get', { projectId, taskId: task.id })
    ).json()
  ).data;
  const started = await action('nrTaskWork', 'advance', {
    projectId,
    taskId: task.id,
    revision: selected.work.revision,
    requestId: randomUUID(),
    command: 'startTask',
  });
  expect(started.status).toBe(200);
  expect((await started.json()).data.runs[0].agentId).toBe(agent.id);
  // A valid approval must stay a human action even when the conversation is
  // running as the task owner. Prepare a real review through the normal service.
  const running = await tasks.get(projectId, task.id);
  await tasks.update(
    projectId,
    {
      taskId: task.id,
      command: 'recordManual',
      revision: running.work.revision,
      requestId: randomUUID(),
      stageKey: running.work.flow.stages[running.work.stageIndex].key,
      content: 'Report ready for human review',
    },
    user.id,
    'Chat member',
  );
  const review = await tasks.get(projectId, task.id);
  const reviewStage = review.work.flow.stages[review.work.stageIndex];
  expect(reviewStage.kind).toBe('review');
  const update = vi.spyOn(tasks, 'update');
  for (const command of [
    'approveStage',
    'approvePlan',
    'approveResult',
    'startSimple',
    'requestChanges',
    'requestStageChanges',
    'recordManual',
    'recordExecution',
    'verify',
    'confirmPublish',
    'confirmLive',
    'markMerged',
    'retryMerge',
    'moveWork',
    'completeStage',
    'futureApprovalCommand',
  ]) {
    const response = await action('nrTaskWork', 'advance', {
      projectId,
      taskId: task.id,
      command,
      revision: review.work.revision,
      requestId: randomUUID(),
      stageKey: reviewStage.key,
      artifactId: review.work.results[review.work.stageIndex - 1].id,
      checked: (reviewStage.checklist || []).map(
        (item: { key: string }) => item.key,
      ),
      state: 'done',
      confirm: true,
      confirmOutOfScope: true,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      requiresBrowser: true,
      projectId,
      taskId: task.id,
      url: `${testApp.publicBasePath}/actions/${task.id}`,
    });
  }
  expect(update).not.toHaveBeenCalled();
  update.mockRestore();
  const afterReview = await tasks.get(projectId, task.id);
  expect(afterReview.work).toEqual(review.work);
  expect(afterReview.reviews).toEqual(review.reviews);
  const humanApproval = await admin.fetch('/nocoreach/nrTaskWork/advance', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({
      projectId,
      taskId: task.id,
      command: 'approveStage',
      revision: review.work.revision,
      requestId: randomUUID(),
      stageKey: reviewStage.key,
      artifactId: review.work.results[review.work.stageIndex - 1].id,
      checked: (reviewStage.checklist || []).map(
        (item: { key: string }) => item.key,
      ),
    }),
  });
  expect(humanApproval.status).toBe(200);
  expect((await humanApproval.json()).data.reviews).toHaveLength(
    review.reviews.length + 1,
  );

  // Generic business access never turns the chat into an assigned-task result writer.
  expect((await request('nocoreachAgent/data')).status).toBe(403);
  expect((await setRole(null)).status).toBe(200);
  expect((await request('nocoreachChat/actions')).status).toBe(403);
  expect((await action('nrTaskWork', 'list', { projectId })).status).toBe(403);
  expect((await setRole('admin')).status).toBe(200);
  const oauth = await action('nrGoogle', 'authorize', { projectId });
  expect(oauth.status).toBe(200);
  expect((await oauth.json()).data).toEqual({
    requiresBrowser: true,
    projectId,
    url: `${testApp.publicBasePath}/connections?source=gsc`,
  });
  const connectionWrites = [
    vi.spyOn(plugin.collectors, 'save'),
    vi.spyOn(plugin.youtube, 'connect'),
    vi.spyOn(plugin.youtube, 'disconnect'),
    vi.spyOn(plugin.youtube, 'clear'),
    vi.spyOn(plugin.bilibili, 'disconnect'),
    vi.spyOn(plugin.xiaohongshu, 'disconnect'),
  ];
  for (const [resource, operation, source] of [
    ['nrGoogle', 'configure', 'gsc'],
    ['nrGitHub', 'setToken', 'github-traffic'],
    ['nrKeywords', 'configure', 'keywords'],
    ['nrYouTube', 'connect', 'youtube'],
    ['nrYouTube', 'disconnect', 'youtube'],
    ['nrYouTube', 'clear', 'youtube'],
    ['nrBilibili', 'disconnect', 'bilibili'],
    ['nrXiaohongshu', 'disconnect', 'xiaohongshu'],
  ]) {
    const handoff = await action(resource, operation, { projectId });
    expect(handoff.status).toBe(200);
    expect((await handoff.json()).data).toEqual({
      requiresBrowser: true,
      projectId,
      url: `${testApp.publicBasePath}/connections?source=${source}`,
    });
  }
  for (const platform of ['xiaohongshu', 'bilibili', 'youtube']) {
    const handoff = await action('nrCollectors', 'save', {
      projectId,
      platform,
      revision: 0,
    });
    expect(handoff.status).toBe(200);
    expect((await handoff.json()).data).toEqual({
      requiresBrowser: true,
      projectId,
      url: `${testApp.publicBasePath}/connections?source=${platform}`,
    });
  }
  for (const write of connectionWrites) expect(write).not.toHaveBeenCalled();
  const currentAgent = await agents.agents.get(agent.id);
  await agents.agents.update(agent.id, actor, {
    expectedRevision: currentAgent.revision,
    enabled: false,
  });
  expect((await request('nocoreachChat/actions')).status).toBe(403);
  await agents.conversations.stop(user.id, chat.conversation.id);
});
