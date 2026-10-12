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
  const defaultAgent = await agents.agents.create(actor, {
    name: 'Default Agent',
    type: 'runner',
    access: 'everyone',
    modelEntries: [{ tool: 'claude', model: null }],
  });
  const taskAgent = await agents.agents.create(actor, {
    name: 'Chosen Agent',
    type: 'runner',
    access: 'everyone',
    modelEntries: [{ tool: 'claude', model: null }],
  });
  await tasks.agents.select(
    project,
    { agentId: defaultAgent.id, revision: 0 },
    actor,
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
  // An Online option must not make a task read or mutation deadlock SQLite by reading models inside its transaction.
  const online = await agents.agents.create(actor, {
    name: 'Online without model',
    type: 'online',
    access: 'everyone',
    modelEntries: [],
  });
  const choices = (await tasks.get(project, taskId)).agent.options;
  expect(
    choices.find((option: { id: string }) => option.id === online.id),
  ).toMatchObject({ type: 'online', online: false });
  expect((await command('setAgent', { agentId: taskAgent.id })).status).toBe(
    200,
  );
  expect((await tasks.get(project, taskId)).agent.agentId).toBe(taskAgent.id);
  expect(
    (await command('startTask', { playbookId: 'change-research' })).status,
  ).toBe(200);
  const view = await tasks.get(project, taskId);
  expect(view.work.agentId).toBe(taskAgent.id);
  expect(view.runs[0].agentName).toBe('Chosen Agent');
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

test('protocol 9 Runner claims a task, returns its result once, and handles cancellation', async ({
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
  const agent = await agents.agents.create(actor, {
    name: 'Contract Agent',
    actions: ['nocoreach.tasks/read', 'nocoreach.tasks/propose'],
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
    version: '0.1.0-beta.6',
    protocolVersion: 9,
    features: [
      'archives',
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
  } finally {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
  expect((await tasks.get(project, id)).artifacts).toHaveLength(0);
  const sourceBefore = (await tasks.get(project, id)).sources;
  await tasks.business.prepare(await agents.runs.get(payload.run.id));
  expect((await tasks.get(project, id)).sources).toEqual(sourceBefore);
  // Revoking the capability immediately revokes command access, including an issued run token.
  const editable = await agents.agents.get(agent.id);
  await agents.agents.update(agent.id, actor, {
    expectedRevision: editable.revision,
    actions: [],
  });
  expect((await businessRequest('data')).status).toBe(403);
  const revoked = await agents.agents.get(agent.id);
  await agents.agents.update(agent.id, actor, {
    expectedRevision: revoked.revision,
    actions: ['nocoreach.tasks/read', 'nocoreach.tasks/propose'],
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
  await agents.reports.complete(runner, payload.run.id, {
    summary: JSON.stringify({
      ok: true,
      content: 'Verified transport report',
      report: {
        kind: 'research',
        sources: [],
        asOf: '2026-10-10',
        uncertainties: [],
      },
    }),
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
  const credentials = {
    email: 'outsider@example.com',
    password: 'test-password-123',
  };
  await testApp.application.container
    .resolve(userAdministrationServiceToken)
    .create({ ...credentials, name: 'Outsider' });
  const outsider = await signIn(testApp, credentials);
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
  await agents.reports.start(runner, build.pluginRunId, {
    workDir: '/synthetic',
    acceptsInput: false,
  });
  const changes = [
    { path: 'docs/demo.md', before: 'Before', after: '立即体验 Demo' },
  ];
  await agents.reports.complete(runner, build.pluginRunId, {
    summary: JSON.stringify({
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
      },
    }),
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
  });
  await agents.agents.archive(agent.id, actor);
  const cancelledBuild = await command(buildId, 'cancelTask');
  expect(cancelledBuild.task.status).toBe('已取消');
  expect(cancelledBuild.work.prClose).toMatchObject({
    state: 'failed',
    number: 1,
  });
  expect(cancelledBuild.work.prClose.error).toContain('手动关闭 PR');
});
