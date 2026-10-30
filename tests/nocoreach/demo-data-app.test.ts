// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import {
  demoDataToken,
  demoConfigurationToken,
} from '@nocobase/app-plugin-demo-mode/server/tokens';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { createStandaloneServer } from '../../server/standalone';
import { onlineAgentsToken } from '../../server/providers/online-agents';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { PROJECT_VARIABLES } from '../../server/nocoreach/demo-data/clear';
import { taskOwner, taskState, taskClosed } from '../../shared/task-pending';
import { historyBounds } from '../../server/nocoreach/search-history';
import { projectWork } from '../../server/nocoreach/execution/model';
import { OnlineProvider } from '../../server/nocoreach/execution/provider';
import { migrateDemoIdentityEmails } from '../../server/nocoreach/demo-data/identities';
import type { StrategyState } from '../../shared/strategy-model';
import { rowsFor, opportunityState } from '../../shared/strategy-pending';
import { recentlyEnded, verdictsOf } from '../../client/pages/strategy/watch';

vi.setConfig({ testTimeout: 300000, hookTimeout: 300000 });
// The demo's synthetic traffic is keyed by calendar date while its observation windows sit a set number of days before
// today, so which conclusion a measured task reaches moves from day to day (Acme CRM's flat task read "up" on 2026-10-30).
// Fix the day so every outcome stays covered; the clock still advances, so timeouts and timestamps behave as usual.
vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
vi.setSystemTime(new Date('2026-10-29T12:00:00Z'));
// Play the demo Agent's runs back without the pauses a visitor sees.
process.env.NOCOREACH_DEMO_AGENT_PACE = '0';
const createDemoTest = (enabled = true) =>
  createAppTest({
    createServer: createStandaloneServer,
    env: {
      ...process.env,
      NOCOBASE_TEST_DB_SQLITE_DIRECTORY: path.join(
        tmpdir(),
        `nocoreach-demo-data-${randomUUID()}`,
      ),
    },
    server: {
      env: { DB_FILENAME: undefined, APP_PUBLIC_ORIGIN: 'http://localhost' },
    },
    config: {
      app: { publicOrigin: 'http://localhost' },
      users: {
        initialAdmin: { ...DEFAULT_ADMIN_CREDENTIALS, name: 'Demo data admin' },
      },
      secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
      nocoreach: { publicDns: '' },
      demoMode: { enabled },
    },
  });
const test = createDemoTest();
const accountConflictTest = createDemoTest();
const readOnlyTest = createDemoTest();
const configurationTest = createDemoTest();
const entryTest = createDemoTest();
// Its conversation stays queued, which would block the full cleanup other read-only tests make.
const conversationTest = createDemoTest();
const offTest = createDemoTest(false);

const json = { 'Content-Type': 'application/json', origin: 'http://localhost' };

describe('demo visitor entry', () => {
  const test = entryTest;
  test('enters existing accounts before generation and keeps signed-in visitors on their account', async ({
    testApp,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const specification = await (await admin.fetch('/swagger')).json();
    expect(Object.keys(specification.paths)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/demoMode/accounts/signInDefault'),
      ]),
    );
    const users = testApp.application.container.resolve(
      userManagementServiceToken,
    );
    const person = await users.create({
      name: 'Existing visitor',
      username: 'existingvisitor',
      email: 'visitor@example.com',
      password: 'original-visitor-password',
    });
    const accounts = await (await testApp.request('/demoMode/accounts')).json();
    expect(
      accounts.data.map((account: { username: string }) => account.username),
    ).toEqual(
      expect.arrayContaining([
        DEFAULT_ADMIN_CREDENTIALS.username,
        person.username,
      ]),
    );

    const entered = await testApp.request('/demoMode/accounts/signInDefault', {
      method: 'POST',
      headers: json,
    });
    expect(entered.status).toBe(200);
    expect(await entered.json()).toEqual({ data: { signedIn: true } });
    const cookie = entered.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    expect(
      (await testApp.request('/demoMode/data', { headers: { cookie } })).status,
    ).toBe(200);

    const switched = await testApp.request(
      '/demoMode/accounts/existingvisitor/signIn',
      {
        method: 'POST',
        headers: { ...json, cookie },
      },
    );
    expect(switched.status).toBe(200);
    const visitorCookie = switched.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const retained = await testApp.request('/demoMode/accounts/signInDefault', {
      method: 'POST',
      headers: { ...json, cookie: visitorCookie },
    });
    expect(await retained.json()).toEqual({ data: { signedIn: false } });
    const session = await (
      await testApp.request('/auth/get-session', {
        headers: { cookie: visitorCookie },
      })
    ).json();
    expect(session.user.id).toBe(person.id);
    await signIn(testApp, {
      email: person.email,
      password: 'original-visitor-password',
    });
    const demo = testApp.application.container.resolve(demoDataToken);
    expect((await demo.status()).present).toBe(false);
  });
});

describe('read-only demo conversations', () => {
  const test = conversationTest;
  test('enables integrated demo chat by default and preserves explicit disabled overrides', async ({
    testApp,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const demo = testApp.application.container.resolve(demoDataToken);
    const online = testApp.application.container.resolve(onlineAgentsToken);
    const demoConfiguration = testApp.application.container.resolve(
      demoConfigurationToken,
    );
    const read = vi.fn(async () => 'local result');
    const mock = vi.fn(async () => 'simulated result');
    expect(
      await demoConfiguration.runChatTool('daily_analysis', {
        readOnly: true,
        run: read,
      }),
    ).toBe('local result');
    expect(
      await demoConfiguration.runChatTool('query_data', {
        readOnly: true,
        run: read,
      }),
    ).toBe('local result');
    expect(
      await demoConfiguration.runChatTool('read_page', { run: read, mock }),
    ).toBe('simulated result');
    expect(read).toHaveBeenCalledTimes(2);
    expect(mock).toHaveBeenCalledTimes(1);

    await expect(online.resolveModel()).resolves.toEqual({
      modelService: demo.models.serviceName,
      model: 'demo-chat',
    });
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const initial = await (await admin.fetch('/demoMode/configuration')).json();
    expect(
      (
        await admin.fetch('/demoMode/configuration/chat', {
          method: 'PUT',
          headers: json,
          body: JSON.stringify({
            expectedRevision: initial.data.revision,
            value: { enabled: true, tools: {} },
          }),
        })
      ).status,
    ).toBe(200);
    expect(
      await online.resolveModel({
        modelService: 'real-service',
        model: 'real-model',
      }),
    ).toEqual({ modelService: demo.models.serviceName, model: 'demo-chat' });
    expect(
      (
        await admin.fetch('/demoMode/data/import', {
          method: 'POST',
          headers: json,
          body: JSON.stringify({ language: 'zh-CN' }),
        })
      ).status,
    ).toBe(200);
    await demo.whenIdle();
    const [main] = (await runtime.plugin.projects.all()) as { id: number }[];
    const ask = (projectId: string | null) =>
      admin.fetch('/onlineAgents/conversations', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({
          requestId: randomUUID(),
          agentId: 'online-default',
          projectId,
          text: '最近的搜索流量怎么样？',
        }),
      });
    const refused = await ask(String(main!.id));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      error: { reason: 'DEMO_READ_ONLY' },
    });
    const configuration = (await (
      await admin.fetch('/demoMode/configuration')
    ).json()) as {
      data: { revision: number };
    };
    expect(
      (
        await admin.fetch('/demoMode/configuration/collections', {
          method: 'PUT',
          headers: json,
          body: JSON.stringify({
            expectedRevision: configuration.data.revision,
            value: ['nrOnlineAgentRecords'],
          }),
        })
      ).status,
    ).toBe(200);
    const allowed = await ask(String(main!.id));
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({
      data: {
        projectId: String(main!.id),
        model: { modelService: 'demo-model' },
      },
    });
    // General chat retains the same ownership checks and explicit persistence permission.
    const general = await ask(null);
    expect(general.status).toBe(200);
    const created = (await general.json()).data;
    const member = await signIn(testApp, {
      email: 'chencheng@acme.example',
      password: 'chencheng123',
    });
    expect(
      (await member.fetch(`/onlineAgents/conversations/${created.id}`)).status,
    ).toBe(404);
    expect(
      (
        await member.fetch('/demoMode/configuration/chat', {
          method: 'PUT',
          headers: json,
          body: JSON.stringify({
            expectedRevision: 2,
            value: { enabled: false, tools: {} },
          }),
        })
      ).status,
    ).toBe(403);
    const current = (
      await (await admin.fetch('/demoMode/configuration')).json()
    ).data;
    expect(
      (
        await admin.fetch('/demoMode/configuration/chat', {
          method: 'PUT',
          headers: json,
          body: JSON.stringify({
            expectedRevision: current.revision,
            value: { enabled: false, tools: {} },
          }),
        })
      ).status,
    ).toBe(200);
    await expect(online.resolveModel()).rejects.toMatchObject({
      reason: 'DEMO_CHAT_DISABLED',
    });
  });
});

describe('read-only demo lifecycle', () => {
  const test = readOnlyTest;
  test('allows demo lifecycle operations while preserving the acting administrator and protecting other writes', async ({
    testApp,
    connection,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const demo = testApp.application.container.resolve(demoDataToken);
    const post = (language = 'zh-CN') => ({
      method: 'POST',
      headers: json,
      body: JSON.stringify({ language }),
    });
    expect(
      (await testApp.request('/demoMode/data/import', post())).status,
    ).toBe(401);
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const snapshots = runtime.plugin.db.getRepository('nrSnapshots');
    await snapshots.create({
      values: { key: 'project', payload: { id: 41, name: 'Legacy project' } },
    });
    // Full cleanup is also available before a dataset tracking row exists.
    expect((await admin.fetch('/demoMode/data/clear', post())).status).toBe(
      200,
    );
    expect(await runtime.plugin.projects.all()).toEqual([]);
    expect((await admin.fetch('/demoMode/data/import', post())).status).toBe(
      200,
    );
    await demo.whenIdle();
    expect(await demo.status()).toMatchObject({
      enabled: true,
      present: true,
      state: 'ready',
      failure: null,
    });
    const member = await signIn(testApp, {
      email: 'chencheng@acme.example',
      password: 'chencheng123',
    });
    for (const action of ['import', 'clear', 'reset']) {
      expect(
        (await member.fetch(`/demoMode/data/${action}`, post())).status,
      ).toBe(403);
    }
    expect((await admin.fetch('/demoMode/data/import', post())).status).toBe(
      409,
    );
    await snapshots.create({
      values: { key: 'project:41', payload: { id: 41, name: 'Old project' } },
    });
    const actingAdmin = await connection.repository('user').findOne({
      filter: { email: DEFAULT_ADMIN_CREDENTIALS.email },
    });
    expect(
      (await admin.fetch('/demoMode/data/reset', post('en-US'))).status,
    ).toBe(200);
    await demo.whenIdle();
    expect(await demo.status()).toMatchObject({
      enabled: true,
      present: true,
      language: 'en-US',
    });
    expect(
      await connection.repository('user').findOne({
        filter: { email: DEFAULT_ADMIN_CREDENTIALS.email },
      }),
    ).toMatchObject({ id: actingAdmin!.id, disabledAt: null });
    expect((await admin.fetch('/demoMode/configuration')).status).toBe(200);
    expect(
      (await runtime.plugin.projects.all()).map(
        (p: { name: string }) => p.name,
      ),
    ).toEqual(['Acme', 'Acme CRM']);
    const write = await admin.fetch('/nocoreach/nrProjects/create', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        name: 'Blocked project',
        domain: 'blocked.example',
        language: 'zh-CN',
      }),
    });
    expect(write.status).toBe(400);
    expect(await write.json()).toMatchObject({
      error: { reason: 'DEMO_READ_ONLY' },
    });
    expect(await runtime.plugin.projects.all()).toHaveLength(2);
    const projectId = String((await runtime.plugin.projects.all())[0].id);
    const snapshotBeforeReads = await runtime.plugin.db
      .getRepository('nrSnapshots')
      .find({});
    for (const [resource, action] of [
      ['nrPlaybooks', 'list'],
      ['nrSkills', 'list'],
      ['nrKnowledge', 'list'],
      ['nrMemory', 'status'],
    ]) {
      const response = await admin.fetch(`/nocoreach/${resource}/${action}`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ projectId }),
      });
      expect(response.status).toBe(200);
      expect((await response.json()).data).toBeDefined();
    }
    expect(
      (await runtime.plugin.db.getRepository('nrSnapshots').find({})).map(
        (row) => row.toJSON(),
      ),
    ).toEqual(snapshotBeforeReads.map((row) => row.toJSON()));
    const knowledge = () =>
      admin.fetch('/nocoreach/nrKnowledge/add', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({
          projectId,
          title: 'Scoped demo note',
          text: 'Fictional fixture',
        }),
      });
    expect((await knowledge()).status).toBe(400);
    const configuration = (
      await (await admin.fetch('/demoMode/configuration')).json()
    ).data;
    const configured = await admin.fetch(
      '/demoMode/configuration/collections',
      {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({
          expectedRevision: configuration.revision,
          value: ['nrSnapshots', 'nrKeywordRuns'],
        }),
      },
    );
    expect(configured.status).toBe(200);
    // Read-looking keyword endpoints persist provider results in the query cache.
    const keywordInput = {
      projectId,
      keyword: 'acme tutorial',
      locationCode: 2840,
      language: 'en',
    };
    const keywordDetail = async (action: string) => {
      const response = await admin.fetch(
        `/nocoreach/nrKeywordDetail/${action}`,
        {
          method: 'POST',
          headers: json,
          body: JSON.stringify(keywordInput),
        },
      );
      expect(response.status).toBe(200);
      return (await response.json()).data;
    };
    const market = await keywordDetail('market');
    expect(market.overview.status).toBe('ready');
    expect(market.overview.item.monthlySearches).toHaveLength(12);
    expect(market.related.status).toBe('ready');
    expect(market.related.related.length).toBeGreaterThan(0);
    const serp = await keywordDetail('serp');
    expect(serp.status).toBe('ready');
    expect(serp.items).toHaveLength(10);
    expect((await keywordDetail('market')).overview).toEqual(market.overview);

    const added = await knowledge();
    expect(added.status).toBe(200);
    const tasks = await runtime.plugin.db
      .getRepository('nrTasks')
      .find({ filter: { projectId } });
    const task = tasks
      .map((row) => row.toJSON())
      .find((row) => projectWork(row).stage !== 'done')!;
    const work = projectWork(task);
    const allowed = (await configured.json()).data;
    expect(
      (
        await admin.fetch('/demoMode/configuration/collections', {
          method: 'PUT',
          headers: json,
          body: JSON.stringify({
            expectedRevision: allowed.revision,
            value: [...allowed.collections, 'nrTasks'],
          }),
        })
      ).status,
    ).toBe(200);
    const commented = await admin.fetch('/nocoreach/nrTaskWork/advance', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        projectId,
        taskId: String(task.id),
        command: 'comment',
        comment: 'Scoped fictional note',
        revision: work.revision,
        requestId: randomUUID(),
      }),
    });
    expect(commented.status).toBe(200);

    // With tasks and snapshots writable, an opportunity can be handed off to a new task.
    const call = async (resource: string, action: string, body: object) =>
      admin.fetch(`/nocoreach/${resource}/${action}`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ projectId, ...body }),
      });
    const state = (await (await call('nrStrategy', 'state', {})).json()).data;
    const opportunity = state.insights.items[0];
    const handoff = {
      insightId: opportunity.id,
      title: opportunity.title,
      brief: 'Fictional demo brief',
      objective: 'Improve the demo page',
      playbookId: 'optimize-page',
      revision: state.revision,
      requestId: randomUUID(),
    };
    const handed = await call('nrStrategy', 'confirmDirection', handoff);
    expect(handed.status).toBe(200);
    const createdId = String((await handed.json()).data.proposals[0].taskId);
    let detail = (
      await (await call('nrTaskWork', 'get', { taskId: createdId })).json()
    ).data;
    expect(detail.agent).toMatchObject({
      agentId: 'nocoreach.runner',
      online: true,
    });
    const started = await call('nrTaskWork', 'advance', {
      taskId: createdId,
      command: 'startTask',
      playbookId: 'optimize-page',
      revision: detail.work.revision,
      requestId: randomUUID(),
    });
    expect(started.status).toBe(200);
    await vi.waitFor(
      async () => {
        detail = (
          await (await call('nrTaskWork', 'get', { taskId: createdId })).json()
        ).data;
        expect(detail.runs[0]?.status).toBe('succeeded');
      },
      { timeout: 10000 },
    );
    expect(detail.runs[0]).toMatchObject({
      simulated: true,
      demoAgentId: 'nocoreach.runner',
      mode: 'build',
    });
    expect(detail.runs[0].pluginRunId).toBeUndefined();
    // Technical details show the run as a Runner's would be: thinking, tool calls with their results, the summary.
    expect(detail.runs[0].transcript).toBeUndefined();
    const execution = detail.execution as {
      canInspect: boolean;
      run: { status: string; usage: { outputTokens: number } };
      events: { seq: number; type: string; tool?: string; output?: string }[];
    };
    expect(execution).toMatchObject({
      canInspect: true,
      run: { status: 'completed' },
    });
    expect(execution.run.usage.outputTokens).toBeGreaterThan(0);
    expect(execution.events.map((event) => event.seq)).toEqual(
      execution.events.map((_, index) => index + 1),
    );
    expect(new Set(execution.events.map((event) => event.type))).toEqual(
      new Set(['status', 'thinking', 'toolUse', 'toolResult', 'text', 'usage']),
    );
    expect(
      execution.events
        .filter((event) => event.type === 'toolUse')
        .map((event) => event.tool),
    ).toEqual(expect.arrayContaining(['Bash', 'WebFetch', 'Read', 'Write']));
    const fetched = execution.events.find(
      (event) => event.type === 'toolResult' && event.tool === 'WebFetch',
    );
    // The Agent reads the opportunity's page on the demo site, in the imported language.
    expect(fetched?.output).toMatch(/Import tasks from Excel/u);
    expect(fetched?.output).toContain('preview column mappings');
    const review = detail.work.flow.stages[detail.work.stageIndex];
    expect(review.kind).toBe('review');
    const approved = await call('nrTaskWork', 'advance', {
      taskId: createdId,
      command: 'approveStage',
      stageKey: review.key,
      artifactId: detail.work.results[detail.work.stageIndex - 1].id,
      checked: review.checklist.map((item: { key: string }) => item.key),
      revision: detail.work.revision,
      requestId: randomUUID(),
    });
    expect(approved.status).toBe(200);
    expect((await approved.json()).data.work).toMatchObject({
      stage: 'done',
      release: { state: 'simulated' },
    });

    // The same physical snapshot table still cannot create a project through another endpoint.
    expect(
      (
        await admin.fetch('/nocoreach/nrProjects/create', {
          method: 'POST',
          headers: json,
          body: JSON.stringify({
            name: 'Still blocked',
            domain: 'blocked.example',
            language: 'en-US',
          }),
        })
      ).status,
    ).toBe(400);

    expect((await admin.fetch('/demoMode/data/clear', post())).status).toBe(
      200,
    );
    expect(await runtime.plugin.projects.all()).toEqual([]);
    expect((await admin.fetch('/demoMode/data/clear', post())).status).toBe(
      200,
    );
    expect((await demo.status()).enabled).toBe(true);
    expect((await admin.fetch('/demoMode/configuration')).status).toBe(200);
    expect(
      await connection
        .repository('user')
        .findOne({ filter: { id: actingAdmin!.id } }),
    ).toMatchObject({ disabledAt: null });
  });
});

test('imports the demo through the API and clears all business data while preserving system configuration', async ({
  testApp,
  connection,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.ready;
  const demo = testApp.application.container.resolve(demoDataToken);
  expect((await testApp.request('/demoMode/data')).status).toBe(401);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  // An unrelated account named admin must survive generation and resets.
  const users = testApp.application.container.resolve(
    userManagementServiceToken,
  );
  const existingAccount = await users.create({
    name: 'Existing account',
    username: 'admin',
    email: 'existing-account@example.com',
    password: 'existing-account-password',
  });
  // A project made before the demo: requests are read-only in a demo, so it is made outside one.
  await runtime.plugin.projects.create({
    name: 'Own project',
    domain: 'own.example',
    language: 'zh-CN',
  });

  const before = await admin.fetch('/demoMode/data');
  expect(before.status).toBe(200);
  const listed = (await before.json()) as {
    data: {
      available: boolean;
      accountsByLanguage: Record<string, { username: string }[]>;
    };
  };
  expect(listed.data.available).toBe(true);
  expect(
    listed.data.accountsByLanguage['zh-CN']!.map((a) => a.username),
  ).toContain('zhouning');

  const started = await admin.fetch('/demoMode/data/import', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ language: 'zh-CN' }),
  });
  expect(started.status).toBe(200);
  await demo.whenIdle();
  const status = await demo.status();
  expect(status.failure).toBeNull();
  expect(status).toMatchObject({ present: true, language: 'zh-CN' });
  expect(status.accounts).toHaveLength(5);
  expect(status.accounts.map((account) => account.username)).not.toContain(
    'admin',
  );
  expect(
    (await runtime.plugin.db.access!.authorization.permissionSets.list()).map(
      (permissionSet) => permissionSet.key,
    ),
  ).not.toContain('nr.demo-admin');
  const row = await connection
    .repository('demoModeDatasets')
    .findOne({ filter: { id: 'nocoreach' } });
  const data = (
    typeof row!.data === 'string' ? JSON.parse(row!.data) : row!.data
  ) as {
    projects: { main: string; second: string };
    skipped: string[];
  };
  expect(data.skipped).toEqual([]);
  const { main, second } = data.projects;

  // Both projects must reach the same business surfaces with their own content.
  for (const [id, name, domain, count] of [
    [main, 'Acme', 'acme.example', 47],
    [second, 'Acme CRM', 'crm.acme.example', 39],
  ] as const) {
    const project = await runtime.plugin.projects.get(id);
    expect(project).toMatchObject({ name, domains: [domain] });
    const rows = await runtime.plugin.db
      .getRepository('nrTasks')
      .find({ filter: { projectId: id } });
    expect(rows).toHaveLength(count);
    expect(
      new Set(
        rows.map((row) => projectWork(row.toJSON()).boardState).filter(Boolean),
      ),
    ).toEqual(new Set(['todo', 'doing', 'review', 'done']));
    const adminUser = await connection
      .repository('user')
      .findOne({ filter: { username: DEFAULT_ADMIN_CREDENTIALS.username } });
    const waiting = rows
      .map((row) => row.toJSON())
      .filter(
        (task) =>
          taskOwner(task) === String(adminUser!.id) &&
          !taskClosed(task.evidence?.work) &&
          ['todo', 'review'].includes(
            taskState(task.evidence?.work, task.status),
          ),
      );
    expect(
      waiting.length,
      `${name}: default visitor's waiting work`,
    ).toBeGreaterThanOrEqual(3);
    expect(
      new Set(
        waiting.map((task) => taskState(task.evidence?.work, task.status)),
      ),
    ).toEqual(new Set(['todo', 'review']));
    for (const row of rows.filter((row) =>
      String(row.get('taskKey')).includes('nocoreach-demo:'),
    )) {
      const task = row.toJSON(),
        work = projectWork(task);
      for (const artifact of work.results.filter(Boolean)) {
        expect(Date.parse(artifact!.createdAt)).toBeGreaterThanOrEqual(
          Date.parse(task.createdAt),
        );
        expect(Date.parse(artifact!.createdAt)).toBeLessThanOrEqual(
          Date.parse(task.updatedAt),
        );
      }
      for (const result of work.observation?.results ?? []) {
        expect(Date.parse(result.after.end)).toBeLessThan(
          Date.parse(result.computedAt),
        );
        expect(Date.parse(result.computedAt)).toBeLessThanOrEqual(
          Date.parse(task.updatedAt),
        );
        expect(result.coverage?.gsc.afterDays).toBe(7);
      }
    }
    const outcomes = new Set(
      rows.flatMap(
        (row) =>
          projectWork(row.toJSON()).observation?.results.map(
            (result) => result.conclusion,
          ) ?? [],
      ),
    );
    expect(outcomes, `${name}: measured outcome coverage`).toEqual(
      new Set(['up', 'down', 'flat', 'insufficient']),
    );
    const search = await runtime.plugin.dataViews.search(id, { range: '12m' });
    expect(search.complete, `${name}: full year of search`).toBe(true);
    expect(search.coverage.current.missingDays).toBe(0);
    expect(search.coverage.current.recordedDays).toBe(search.window.days);
    expect(search.trend.every((point) => point.clicks !== null)).toBe(true);
    // A year-over-year Search Console comparison exceeds its 16-month retention, so remain honest about that gap.
    expect(search.previousComplete).toBe(false);
    expect(search.previous).toBeNull();
    const longest = await runtime.plugin.dataViews.search(id, { range: '16m' });
    const bounds = historyBounds(runtime.plugin, id);
    expect(longest.coverage.current.records[0].start).toBe(bounds.earliest);
    const website = await runtime.plugin.dataViews.website(id, {
      range: '12m',
    });
    expect(website.complete, `${name}: yearly website report`).toBe(true);
    expect(website.missing).toEqual([]);
    expect(website.daily.length).toBeGreaterThanOrEqual(365);
    expect(website.previousDaily.length).toBeGreaterThanOrEqual(365);
    expect(website.totals.current.sessions).toBeGreaterThan(0);
    expect(website.totals.previous.sessions).toBeGreaterThan(0);
    const historical = await runtime.plugin.dataViews.search(id, {
      range: 'custom',
      from: search.window.start,
      to: new Date(Date.parse(search.window.start) + 6 * 86400000)
        .toISOString()
        .slice(0, 10),
    });
    expect(historical.complete).toBe(true);
    expect(historical.totals.clicks).toBeGreaterThan(0);
    const snapshots = runtime.plugin.db.getRepository('nrSnapshots');
    const read = async (key: string) =>
      (await snapshots.findOne({ filter: { key: `${key}:${id}` } }))?.get(
        'payload',
      );
    expect((await read('knowledge')).items).toHaveLength(8);
    const strategy = await read('strategy');
    expect(strategy.insights.items).toHaveLength(id === main ? 16 : 12);
    expect(strategy.proposals).toHaveLength(14);
    const timeline = strategy as StrategyState;
    const watches = Object.values(timeline.watch!).filter(
      (watch) => !watch.ended,
    );
    expect(watches).toHaveLength(6);
    expect(
      new Set(watches.map((watch) => watch.decideBy)).size,
    ).toBeGreaterThanOrEqual(5);
    for (const watch of watches) {
      const current = timeline.insights!.evidence.signals!.items.find(
        (signal) => signal.key === watch.key,
      )!;
      expect(current.chip?.text).toMatch(/\d/);
      expect(watch.startChip?.text).toMatch(/\d/);
      expect(watch.decideBy > timeline.insights!.generatedAt.slice(0, 10)).toBe(
        true,
      );
      expect(
        Date.parse(watch.decideBy) - Date.parse(watch.since.slice(0, 10)),
      ).toBeLessThan(14 * 86400000);
      if (
        watch.since.slice(0, 10) !== timeline.insights!.generatedAt.slice(0, 10)
      )
        expect(verdictsOf(timeline, watch.key).length).toBeGreaterThan(1);
    }
    expect(
      watches.filter(
        (watch) =>
          watch.startChip?.text !==
          timeline.insights!.evidence.signals!.items.find(
            (signal) => signal.key === watch.key,
          )!.chip?.text,
      ).length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      new Set(recentlyEnded(timeline).map((watch) => watch.ended!.outcome)),
    ).toEqual(new Set(['opportunity', 'normal', 'skip', 'expired', 'ignored']));
    const handled = rowsFor(timeline).filter(
      (row) => opportunityState(row, timeline).state !== 'pending',
    );
    expect(handled.length).toBeGreaterThanOrEqual(16);
    expect(
      new Set(handled.map((row) => row.firstSeenAt.slice(0, 7))).size,
    ).toBeGreaterThanOrEqual(10);
    for (const proposal of timeline.proposals) {
      const task = rows.find(
        (row) => String(row.id) === String(proposal.taskId),
      )!;
      expect(Date.parse(proposal.insight!.firstSeenAt!)).toBeLessThan(
        new Date(task.get('createdAt') as string).getTime(),
      );
    }
    for (const key of id === main
      ? ['acme-dependencies', 'acme-weekly-report', 'acme-kanban-wip']
      : ['crm-import', 'crm-pipeline', 'crm-routing']) {
      const task = rows.find((row) => String(row.taskKey).endsWith(`:${key}`))!;
      const response = await admin.fetch('/nocoreach/nrTaskWork/get', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ projectId: id, taskId: String(task.id) }),
      });
      expect(response.status).toBe(200);
      const detail = (await response.json()).data;
      const activity = detail.work.history;
      expect(
        activity.some(
          (event: { action: string }) => event.action === 'startTask',
        ),
      ).toBe(true);
      const latestVersion = Math.max(
        ...detail.artifacts.map(
          (artifact: { version: number }) => artifact.version,
        ),
      );
      for (const artifact of detail.artifacts) {
        expect(activity).toContainEqual(
          expect.objectContaining({
            action: 'runSucceeded',
            artifactId: artifact.id,
            runId: artifact.runId,
          }),
        );
        expect(artifact.content).toContain('##');
        expect(artifact.content.length).toBeGreaterThan(
          artifact.version === latestVersion ? 500 : 200,
        );
      }
      for (const event of activity) {
        expect(Date.parse(event.at)).toBeGreaterThanOrEqual(
          new Date(task.get('createdAt') as string).getTime(),
        );
        expect(Date.parse(event.at)).toBeLessThanOrEqual(
          new Date(task.get('updatedAt') as string).getTime(),
        );
      }
      expect(detail.runs.length).toBeGreaterThanOrEqual(1);
      expect(detail.execution.canInspect).toBe(true);
      expect(detail.execution.events.length).toBeGreaterThanOrEqual(9);
      expect(
        detail.execution.events.some(
          (event: { type: string }) => event.type === 'toolResult',
        ),
      ).toBe(true);
      expect(
        detail.runs.every(
          (run: { simulated: boolean; pluginRunId?: string }) =>
            run.simulated && !run.pluginRunId,
        ),
      ).toBe(true);
      for (const run of detail.runs) {
        expect(Date.parse(run.startedAt)).toBeGreaterThanOrEqual(
          new Date(task.get('createdAt') as string).getTime(),
        );
        expect(Date.parse(run.endedAt)).toBeLessThanOrEqual(
          new Date(task.get('updatedAt') as string).getTime(),
        );
      }
      if (key === 'acme-dependencies' || key === 'crm-import') {
        expect(
          new Set(detail.runs.map((run: { status: string }) => run.status)),
        ).toEqual(new Set(['succeeded']));
        const previous = await admin.fetch('/nocoreach/nrTaskWork/get', {
          method: 'POST',
          headers: json,
          body: JSON.stringify({
            projectId: id,
            taskId: String(task.id),
            runId: detail.runs.find(
              (run: { status: string }) => run.status === 'succeeded',
            ).id,
          }),
        });
        expect(
          (await previous.json()).data.execution.events.length,
        ).toBeGreaterThan(5);
      }
      if (key === 'acme-weekly-report' || key === 'crm-pipeline') {
        expect(detail.artifacts).toHaveLength(2);
        const versions = [...detail.artifacts].sort(
          (a, b) => a.version - b.version,
        );
        expect(versions[1].content.length).toBeGreaterThan(
          versions[0].content.length,
        );
        const request = activity.find(
          (event: { action: string }) => event.action === 'requestStageChanges',
        );
        expect(request.artifactId).toBe(versions[0].id);
        expect(Date.parse(request.at)).toBeGreaterThan(
          Date.parse(versions[0].createdAt),
        );
        expect(Date.parse(request.at)).toBeLessThan(
          Date.parse(versions[1].createdAt),
        );
        expect(
          detail.reviews.some(
            (review: { decision: string }) =>
              review.decision === 'requestChanges',
          ),
        ).toBe(true);
      }
    }
    const taskIds = new Set(rows.map((row) => String(row.id)));
    expect(
      strategy.proposals.every((proposal: { taskId: string }) =>
        taskIds.has(String(proposal.taskId)),
      ),
    ).toBe(true);
    for (const key of [
      'site-content',
      'github',
      'community',
      'packages',
      'chat',
      'rank-tracking',
      'youtube',
    ]) {
      const snapshot = await read(key);
      expect(snapshot, `${name}: ${key}`).toBeTruthy();
      expect(JSON.stringify(snapshot)).not.toMatch(/nocobase|nococrm/i);
    }
    expect(
      (await runtime.plugin.aiSearch.list(id)).length,
    ).toBeGreaterThanOrEqual(2);
    const token = await runtime.plugin.demoProjects.worldRequest(
      id,
      'https://oauth2.googleapis.com/token',
      { method: 'POST' },
    );
    expect(token.status).toBe(200);
  }

  // The importer and the demo's own people see the demo projects; a member sees only theirs.
  const member = await signIn(testApp, {
    email: 'chencheng@acme.example',
    password: 'chencheng123',
  });
  expect((await member.fetch('/demoMode/data')).status).toBe(403);
  expect(
    (
      await member.fetch('/demoMode/data/reset', {
        method: 'POST',
        headers: json,
        body: '{}',
      })
    ).status,
  ).toBe(403);
  const projects = (await (
    await member.fetch('/nocoreach/nrProjects/list', {
      method: 'POST',
      headers: json,
      body: '{}',
    })
  ).json()) as { data: { id: number }[] };
  expect(projects.data.map((p) => String(p.id))).toEqual([main]);

  const tasks = (await (
    await admin.fetch('/nocoreach/nrTaskWork/list', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ projectId: main }),
    })
  ).json()) as { data: unknown[] };
  expect(tasks.data.length).toBeGreaterThan(0);

  // Requests for a demo project are answered in process; anything the fixtures do not cover is refused.
  await expect(
    runtime.plugin.network.fetch('site', 'https://unknown.invalid/', {}, main),
  ).rejects.toMatchObject({
    code: 'NR_DEMO_OFFLINE',
  });
  const google = await admin.fetch('/nocoreach/nrGoogle/status', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ projectId: main }),
  });
  expect(google.status).toBe(200);

  // The demo's business AI answers from the simulated model.
  const defaults = await runtime.plugin.agents.models.services.defaults();
  expect(runtime.plugin.demoModels?.isDemoModel(defaults.effectiveChat)).toBe(
    true,
  );
  runtime.plugin.demoModels?.bind(null, null);
  const judgment = await new OnlineProvider(runtime.plugin).complete(
    '',
    JSON.stringify({ signal: { key: 'test-signal' } }),
    'daily-judge',
  );
  expect(JSON.parse(judgment)).toMatchObject({
    key: 'test-signal',
    verdict: 'skip',
  });
  const environmentModel = (await demo.status()).model.service;
  expect(environmentModel).toBeTruthy();

  // Visitor-created project content must go too; a global snapshot whose skill ID matches the project must stay.
  const visitorKey = `nr-task-op:${main}:visitor-task:request`;
  const sharedKey = `nr-skill:${main}`;
  for (const key of [visitorKey, `google-local-reports:${main}`, sharedKey])
    await runtime.plugin.db.getRepository('nrSnapshots').create({
      values: {
        key,
        payload: { value: 'preserve boundaries' },
      },
    });
  const demoChat = `demo-chat-${randomUUID()}`;
  const ownChat = `own-chat-${randomUUID()}`;
  for (const [id, projectId] of [
    [demoChat, main],
    [ownChat, 'non-demo-project'],
  ])
    await connection.repository('nrOnlineAgentRecords').createOne({
      values: {
        id,
        kind: 'conversation',
        ownerId: 'test-owner',
        groupId: '',
        status: '',
        revision: 0,
        payload: JSON.stringify({ projectId }),
      },
    });

  for (const key of [
    'nr-task-materials:orphan',
    'project-icon:missing',
    'nr-migrations:cleanup-test',
    'mock-demo:cleanup-test',
  ])
    await runtime.plugin.db
      .getRepository('nrSnapshots')
      .create({ values: { key, payload: { saved: true } } });
  await runtime.variables.set('NOREACH_GITHUB_TOKEN_orphan', 'project-secret');
  await runtime.cache.set('project-data', { stale: true });
  const disk = testApp.application.container
    .resolve(driveManagerToken)
    .use('local');
  const fileId = randomUUID();
  const fileKey = `tests/demo-data/${fileId}.txt`;
  await disk.put(fileKey, Buffer.from('old project attachment'));
  await connection.repository('nrTaskMedia').createOne({
    values: {
      id: fileId,
      disk: 'local',
      key: fileKey,
      filename: 'attachment.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 22,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: 'test-owner',
      sessionId: 'test-session',
      projectId: 'missing',
      draftId: randomUUID(),
      expiresAt: new Date(Date.now() + 60000),
      deleting: false,
    },
  });
  const legacyChatId = randomUUID();
  const legacyRunId = randomUUID();
  const createdAt = new Date();
  await connection.repository('agConversations').createOne({
    values: {
      id: legacyChatId,
      userId: 'test-owner',
      agentId: 'test-agent',
      mode: 'online',
      titleSource: 'user',
      category: 'chat',
      source: 'application',
      lastMessageAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    },
  });
  await connection.repository('agConversationMessages').createOne({
    values: {
      id: randomUUID(),
      conversationId: legacyChatId,
      seq: 1,
      role: 'user',
      content: 'Old conversation',
      searchText: 'Old conversation',
      createdAt,
      updatedAt: createdAt,
    },
  });
  await connection.repository('agRuns').createOne({
    values: {
      id: legacyRunId,
      agentId: 'test-agent',
      status: 'completed',
      subjectKind: 'conversation',
      subjectId: legacyChatId,
      threadScope: '',
      actorUserId: 'test-owner',
      createdAt,
      updatedAt: createdAt,
    },
  });
  const chatFileKey = `tests/demo-data/${legacyChatId}.txt`;
  await disk.put(chatFileKey, Buffer.from('old chat attachment'));
  await connection.repository('agChatAttachments').createOne({
    values: {
      id: randomUUID(),
      disk: 'local',
      key: chatFileKey,
      filename: 'chat.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 19,
      uploaderId: 'test-owner',
      conversationId: legacyChatId,
      createdAt,
      updatedAt: createdAt,
    },
  });
  const globalAgents = await connection
    .repository('nrOnlineAgentRecords')
    .findMany({ filter: { kind: 'agent' } });
  // A live conversation refuses the operation before any business record or blob is deleted.
  const activeId = randomUUID();
  await connection.repository('nrOnlineAgentRecords').createOne({
    values: {
      id: activeId,
      kind: 'run',
      ownerId: 'test-owner',
      groupId: '',
      status: 'running',
      revision: 0,
      payload: '{}',
    },
  });
  // More than one cleanup page, with retained messages between stale ones on every page.
  const inbox = Array.from({ length: 450 }, (_, index) => ({
    id: `inbox-cleanup-${String(index).padStart(4, '0')}`,
    kind: (['demo', 'task', 'other'] as const)[index % 3],
  }));
  for (const { id, kind } of inbox)
    await connection.repository('notificationInAppItems').createOne({
      values: {
        id,
        deliveryId: randomUUID(),
        notificationId:
          kind === 'demo' ? `nocoreach-demo-${id.slice(-4)}` : randomUUID(),
        userId: 'test-owner',
        title: id,
        body: id,
        actionUrl: null,
        readAt: null,
        createdAt,
        updatedAt: createdAt,
        target:
          kind === 'task'
            ? { type: 'route', path: `/actions/${id}` }
            : { type: 'route', path: '/settings' },
      },
    });
  const clearRequest = () =>
    admin.fetch('/demoMode/data/clear', {
      method: 'POST',
      headers: json,
      body: '{}',
    });
  const blocked = await clearRequest();
  expect(blocked.status).toBe(400);
  expect(await blocked.json()).toMatchObject({
    error: { reason: 'DEMO_DATA_WORK_RUNNING' },
  });
  expect(await runtime.plugin.projects.all()).toHaveLength(3);
  expect(await disk.exists(fileKey)).toBe(true);
  await connection
    .repository('nrOnlineAgentRecords')
    .deleteOne({ filter: { id: activeId } });
  // An unavailable storage disk leaves the cleanup record intact so the same action can retry.
  const deletion = vi
    .spyOn(disk, 'delete')
    .mockRejectedValueOnce(new Error('storage unavailable'));
  expect((await clearRequest()).status).toBe(500);
  deletion.mockRestore();
  expect(
    await connection
      .repository('nrTaskMedia')
      .findOne({ filter: { id: fileId } }),
  ).toBeDefined();
  expect(await runtime.plugin.projects.all()).toHaveLength(3);
  const cleared = await admin.fetch('/demoMode/data/clear', {
    method: 'POST',
    headers: json,
    body: '{}',
  });
  expect(cleared.status).toBe(200);
  const remaining = (await runtime.plugin.projects.all()) as {
    id: number;
    name: string;
  }[];
  expect(remaining).toEqual([]);
  expect(
    (
      await connection.query
        .selectFrom('notificationInAppItems')
        .select(['id'])
        .where('id', 'like', 'inbox-cleanup-%')
        .orderBy('id', 'asc')
        .execute<{ id: string }>()
    ).map(({ id }) => id),
  ).toEqual(inbox.filter(({ kind }) => kind === 'other').map(({ id }) => id));
  expect(await disk.exists(fileKey)).toBe(false);
  expect(await disk.exists(chatFileKey)).toBe(false);
  for (const table of [
    'agConversations',
    'agConversationMessages',
    'agChatAttachments',
    'agRuns',
  ])
    expect(await connection.repository(table).count()).toBe(0);
  expect(
    await connection
      .repository('nrOnlineAgentRecords')
      .findMany({ filter: { kind: 'agent' } }),
  ).toEqual(globalAgents);
  expect(await connection.repository('nrTaskMedia').count()).toBe(0);
  expect(await runtime.cache.get('project-data')).toBeUndefined();
  expect(runtime.variables.get('NOREACH_GITHUB_TOKEN_orphan')).toBeUndefined();
  for (const key of ['nr-task-materials:orphan', 'project-icon:missing'])
    expect(
      await connection.repository('nrSnapshots').findOne({ filter: { key } }),
    ).toBeUndefined();
  for (const key of ['nr-migrations:cleanup-test', 'mock-demo:cleanup-test'])
    expect(
      await connection.repository('nrSnapshots').findOne({ filter: { key } }),
    ).toBeDefined();
  expect((await admin.fetch('/demoMode/data')).status).toBe(200);
  for (const id of [main, second]) {
    const keys = (await connection.repository('nrSnapshots').findMany({})).map(
      (r) => String(r.key),
    );
    expect(
      keys.filter((key) => key.split(':')[1] === id && key !== sharedKey),
    ).toEqual([]);
    for (const table of [
      'nrTasks',
      'nrGoogleLinks',
      'nrSyncPartitions',
      'nrProjectMembers',
    ])
      expect(
        await connection.repository(table).count({ filter: { projectId: id } }),
      ).toBe(0);
    for (const prefix of PROJECT_VARIABLES)
      expect(runtime.variables.get(`${prefix}${id}`)).toBeUndefined();
  }
  expect(
    await connection
      .repository('nrSnapshots')
      .findOne({ filter: { key: sharedKey } }),
  ).toMatchObject({ payload: { value: 'preserve boundaries' } });
  expect(
    await connection
      .repository('nrOnlineAgentRecords')
      .findOne({ filter: { id: demoChat } }),
  ).toBeUndefined();
  expect(
    await connection
      .repository('nrOnlineAgentRecords')
      .findOne({ filter: { id: ownChat } }),
  ).toBeUndefined();
  // NocoReach does not configure account deletion, so the demo's accounts are disabled and can no longer sign in.
  const people = await connection.query
    .selectFrom('user')
    .select(['email', 'disabledAt'])
    .where('email', 'like', '%@acme.example')
    .execute();
  expect(people).toHaveLength(5);
  expect(people.every((person) => person.disabledAt)).toBe(true);
  expect(
    (await runtime.plugin.agents.models.services.list()).map((s) => s.title),
  ).toContain('Demo model');
  expect((await demo.status()).present).toBe(false);
  expect(
    (await runtime.plugin.agents.models.services.defaults()).chat,
  ).toMatchObject({
    modelService: environmentModel,
    model: 'demo-chat',
  });

  // Imported again, in English: the disabled accounts come back, under the English story's names.
  const adminId = String(
    people.length &&
      (await connection.query
        .selectFrom('user')
        .select(['id'])
        .where('email', '=', DEFAULT_ADMIN_CREDENTIALS.email)
        .executeTakeFirst())!.id,
  );
  const english = await demo.importNow(adminId, 'en-US');
  expect(english.failure).toBeNull();
  expect(english.accounts.map((account) => account.username)).toEqual([
    'grace',
    'ethan',
    'sophie',
    'henry',
    'chloe',
  ]);
  // The existing administrator keeps managing the demo after regeneration.
  const administrator = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  expect((await administrator.fetch('/demoMode/configuration')).status).toBe(
    200,
  );
  expect((await administrator.fetch('/demoMode/data')).status).toBe(200);
  expect(await users.get(existingAccount.id)).toMatchObject({
    username: 'admin',
    disabledAt: null,
  });
  await signIn(testApp, {
    email: 'existing-account@example.com',
    password: 'existing-account-password',
  });
  const grace = await signIn(testApp, {
    email: 'grace@acme.example',
    password: 'grace123',
  });
  const graceProjects = (await (
    await grace.fetch('/nocoreach/nrProjects/list', {
      method: 'POST',
      headers: json,
      body: '{}',
    })
  ).json()) as { data: { name: string; language: string }[] };
  expect(graceProjects.data.map((p) => p.name)).toEqual(['Acme', 'Acme CRM']);
  expect(graceProjects.data.at(-1)!.language).toBe('en-US');

  const reset = await demo.reset(undefined, 'zh-CN', { wait: true });
  expect(reset).toMatchObject({
    present: true,
    language: 'zh-CN',
    failure: null,
  });
  expect(reset.model.service).toBe(environmentModel);
  await demo.clear(adminId);
  expect(((await runtime.plugin.projects.all()) as unknown[]).length).toBe(0);
});

describe('existing account conflicts', () => {
  const test = accountConflictTest;
  test('renames owned legacy demo emails without changing unrelated identities or passwords', async ({
    testApp,
    connection,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const users = testApp.application.container.resolve(
      userManagementServiceToken,
    );
    const specs = [
      {
        username: 'grace',
        email: 'grace@nocobase.example',
        dataset: 'nocoreach',
      },
      { username: 'xulan', email: 'xulan@nocobase.example' },
      {
        username: 'ethan',
        email: 'ethan@nocobase.example',
        dataset: 'another-demo',
      },
      {
        username: 'sophie',
        email: 'sophie@team.example',
        dataset: 'nocoreach',
      },
    ];
    const accounts = [];
    for (const spec of specs) {
      const account = await users.create({
        name: spec.username,
        username: spec.username,
        email: spec.email,
        password: 'original-password-123',
      });
      if (spec.dataset)
        await connection.repository('demoModeAccounts').createOne({
          values: {
            userId: account.id,
            datasetId: spec.dataset,
            passwordHash: 'fixture-owned-account',
          },
        });
      accounts.push(account);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      await migrateDemoIdentityEmails(
        runtime.plugin.db.access!.database,
        users,
      );
      for (const [index, account] of accounts.entries()) {
        const current = await users.get(account.id);
        expect(current).toMatchObject({
          id: account.id,
          username: account.username,
          name: account.name,
          email: index === 0 ? 'grace@acme.example' : account.email,
        });
        expect(current.roleScopes).toEqual(account.roleScopes);
      }
    }
    await signIn(testApp, {
      email: 'grace@acme.example',
      password: 'original-password-123',
    });
  });

  test('refuses to reuse a pre-existing account even when both demo username and email match', async ({
    testApp,
    connection,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const users = testApp.application.container.resolve(
      userManagementServiceToken,
    );
    const own = await users.create({
      name: 'Existing person',
      username: 'zhouning',
      email: 'zhouning@acme.example',
      password: 'original-password-123',
    });
    const adminId = (await connection.query
      .selectFrom('user')
      .select(['id'])
      .where('email', '=', DEFAULT_ADMIN_CREDENTIALS.email)
      .executeTakeFirst())!.id;
    const demo = testApp.application.container.resolve(demoDataToken);
    await runtime.plugin.db.getRepository('nrSnapshots').create({
      values: {
        key: 'project:41',
        payload: { id: 41, name: 'Existing project' },
      },
    });
    await expect(
      demo.importNow(String(adminId), 'zh-CN'),
    ).rejects.toMatchObject({
      reason: 'DEMO_DATA_ACCOUNT_CONFLICT',
    });
    const existing = await connection.query
      .selectFrom('user')
      .select(['name', 'disabledAt'])
      .where('id', '=', own.id)
      .executeTakeFirst();
    expect(existing).toMatchObject({
      name: 'Existing person',
      disabledAt: null,
    });
    await signIn(testApp, {
      email: 'zhouning@acme.example',
      password: 'original-password-123',
    });
    expect(await runtime.plugin.projects.all()).toEqual([]);
  });
});

describe('demo configuration permissions', () => {
  const test = configurationTest;
  test('enforces independent read/configure permissions and configuration versions through HTTP', async ({
    testApp,
    connection,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const { authorizationToken } =
      await import('@nocobase/app-plugin-authorization');
    const authz = testApp.application.container.resolve(authorizationToken);
    const users = testApp.application.container.resolve(
      userManagementServiceToken,
    );
    const reader = await users.create({
      name: 'Configuration reader',
      username: 'configreader',
      email: 'configreader@example.com',
      password: 'test-password-1234',
    });
    await authz.permissionSets.create({
      key: 'configuration-reader',
      title: 'Configuration reader',
      grants: [
        {
          resource: { type: 'settings', id: 'demoMode.configuration' },
          actions: [{ action: 'read' }],
        },
      ],
    });
    await authz.permissionSets.assign({
      subject: { type: 'user', id: reader.id },
      permissionSet: 'configuration-reader',
    });
    expect((await testApp.request('/demoMode/configuration')).status).toBe(401);
    const signedReader = await signIn(testApp, {
      email: 'configreader@example.com',
      password: 'test-password-1234',
    });
    expect((await signedReader.fetch('/demoMode/configuration')).status).toBe(
      200,
    );
    expect((await signedReader.fetch('/demoMode/data')).status).toBe(403);
    const put = (expectedRevision: number, value: unknown) => ({
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ expectedRevision, value }),
    });
    expect(
      (await signedReader.fetch('/demoMode/configuration/mocks', put(0, {})))
        .status,
    ).toBe(403);
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    // A beta.2 deployment may have a disabled schedule saved beside its write and simulation policies.
    await connection.query
      .updateTable('demoModeConfiguration')
      .set({
        value: JSON.stringify({
          schedule: {
            enabled: false,
            hour: 8,
            minute: 15,
            timezone: 'Asia/Shanghai',
            language: 'zh-CN',
          },
          collections: ['nrTasks'],
          mocks: { 'nocoreach.runner': false },
        }),
      })
      .where('id', '=', 'default')
      .execute();
    const before = (await (
      await admin.fetch('/demoMode/configuration')
    ).json()) as { data: { revision: number } };
    expect(before.data).toMatchObject({
      schedule: {
        enabled: true,
        hour: 3,
        minute: 0,
        timezone: 'UTC',
        language: 'en-US',
      },
      collections: ['nrTasks'],
      mocks: { 'nocoreach.runner': false },
    });
    const revision = before.data.revision;
    expect(
      (await admin.fetch('/demoMode/configuration/schedule', put(revision, {})))
        .status,
    ).toBe(404);
    expect(
      (
        await admin.fetch(
          // Collection exceptions must name an existing logical collection.
          '/demoMode/configuration/collections',
          put(revision, ['nrMissingDemoCollection']),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.fetch(
          '/demoMode/configuration/mocks',
          put(revision, { 'nocoreach.runner': false }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await admin.fetch(
          '/demoMode/configuration/mocks',
          put(revision, { 'nocoreach.runner': true }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await admin.fetch(
          '/demoMode/configuration/mocks',
          put(revision + 1, { 'nocoreach.runner': true }),
        )
      ).status,
    ).toBe(200);
    expect((await signedReader.fetch('/demoMode/configuration')).status).toBe(
      200,
    );
  });
});
describe('disabled demo environment', () => {
  const test = offTest;
  test('does not expose demo management outside demo deployments', async ({
    testApp,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    expect((await admin.fetch('/demoMode/configuration')).status).toBe(404);
    expect((await admin.fetch('/demoMode/data')).status).toBe(404);
    expect(
      await (await testApp.request('/demoMode/accounts')).json(),
    ).toMatchObject({ data: [] });
    const entry = await testApp.request('/demoMode/accounts/signInDefault', {
      method: 'POST',
      headers: json,
    });
    expect(await entry.json()).toEqual({ data: { signedIn: false } });
    expect(entry.headers.get('set-cookie')).toBeNull();
    const demo = testApp.application.container.resolve(demoDataToken);
    await expect(demo.importNow('admin')).rejects.toMatchObject({
      reason: 'DEMO_MODE_REQUIRED',
    });
  });
});
