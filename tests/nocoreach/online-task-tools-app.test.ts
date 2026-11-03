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
import type { OnlineRun } from '../../shared/online-agent.js';
import { SYSTEM_PLAYBOOKS, stagesFor } from '../../shared/playbook-catalog.js';
import { discoverAgents } from './runner-fixture.js';

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
  const run = {
    id: randomUUID(),
    ownerId: user.id,
    projectId: null,
    instructions: '',
  } as OnlineRun;
  const signal = new AbortController().signal;
  const context = await createNocoReachOnlineHost(() => host, '/nested/main')(
    run,
    signal,
  );
  const call = async (name: string, input: unknown): Promise<any> =>
    context.tools.find((tool) => tool.name === name)!.execute(input, signal);
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
  // More than a page holds reads a full page instead of failing.
  expect(
    (await call('task_list', { scope: 'accessible', limit: 500 })).items,
  ).toHaveLength(3);
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

test("task_list reads a project conversation's tasks in one call, with their pages and opportunity, and says which input to fix", async ({
  testApp,
}) => {
  await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const container = testApp.application.container;
  const host = container.resolve(nocoReachToken);
  await host.ready;
  const user = await container.resolve(userAdministrationServiceToken).create({
    email: 'online-duplicates@example.test',
    password: 'test-password-123',
    name: 'Duplicate finder',
  });
  await container.resolve(authorizationToken).permissionSets.assign({
    permissionSet: 'nr.member',
    subject: { type: 'user', id: user.id },
  });
  const [project, other] = [
    await host.plugin.projects.create({
      name: 'NocoBase',
      domain: 'duplicates.example.test',
    }),
    await host.plugin.projects.create({
      name: 'Other',
      domain: 'other-duplicates.example.test',
    }),
  ];
  const projectId = String(project.id);
  for (const id of [projectId, String(other.id)])
    await host.legacy.db.access!.joinCreatedProject(user.id, id);
  const work = (extra: Record<string, unknown> = {}) => ({
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
    playbookId: 'optimize-page',
    humanOwnerId: user.id,
    humanOwnerName: 'Duplicate finder',
    ...extra,
  });
  const create = (values: Record<string, unknown>, into = projectId) =>
    host.plugin.db.getRepository('nrTasks').create({
      values: {
        projectId: into,
        taskKey: randomUUID(),
        status: '待处理',
        ...values,
      },
    });
  // Enough long tasks that a full page would pass the executor's tool output limit.
  for (let index = 0; index < 60; index++)
    await create({
      title: `Long ${index} ${'x'.repeat(190)}`,
      evidence: {
        createdBy: { id: user.id },
        no: 10 + index,
        pages: Array.from(
          { length: 8 },
          (_, n) =>
            `https://duplicates.example.test/${index}/${n}/${'p'.repeat(120)}`,
        ),
        work: work(),
      },
    });
  const page = 'https://duplicates.example.test/docs/install';
  // Two open tasks change the same page from the same opportunity and place; a third one is closed. Tasks list newest
  // first.
  const first = await create({
    title: 'Optimize page: install guide',
    evidence: {
      createdBy: { id: user.id },
      no: 1,
      pages: [page],
      insight: { id: randomUUID(), no: 12, title: 'Install guide' },
      part: { key: 'page:x', kind: 'page', label: 'Install guide' },
      work: work(),
    },
  });
  await create({
    title: 'Optimize page: install guide again',
    evidence: {
      createdBy: { id: user.id },
      no: 2,
      page,
      insight: { id: randomUUID(), no: 12, title: 'Install guide' },
      part: { key: 'page:x', kind: 'page', label: 'Install guide' },
      work: work({ startedPages: [page, `${page}/linux`] }),
    },
  });
  await create({
    title: 'Closed before it started',
    evidence: {
      createdBy: { id: user.id },
      no: 3,
      page,
      work: work({ cancelledAt: new Date().toISOString() }),
    },
  });
  await create(
    {
      title: 'In another project',
      evidence: { createdBy: { id: user.id }, work: work() },
    },
    String(other.id),
  );
  const signal = new AbortController().signal;
  const context = await createNocoReachOnlineHost(() => host, '')(
    {
      id: randomUUID(),
      ownerId: user.id,
      projectId,
      instructions: '',
      locale: 'zh-CN',
    } as OnlineRun,
    signal,
  );
  const tool = (name: string) =>
    context.tools.find((candidate) => candidate.name === name)!;
  const call = async (name: string, input: unknown): Promise<any> =>
    tool(name).execute(input, signal);
  const status = vi.spyOn(host.plugin.taskExecution.agents, 'status');
  expect((await call('project_data', { section: 'project' })).text).toContain(
    `"projectId":"${projectId}"`,
  );

  // The model asked for 500: it reads the largest page, of the conversation's project only, without Runner lookups.
  const open = await call('task_list', {
    scope: 'accessible',
    status: 'open',
    limit: 500,
  });
  expect(open.projects).toEqual([{ projectId, name: 'NocoBase' }]);
  const byNo = (no: string) =>
    open.items.find((item: { no: string }) => item.no === no);
  expect(open.items.slice(0, 2).map((item: { no: string }) => item.no)).toEqual(
    ['T-2', 'T-1'],
  );
  expect(byNo('T-1')).toEqual({
    taskId: String(first.id),
    projectId,
    no: 'T-1',
    title: 'Optimize page: install guide',
    url: `/actions/${first.id}?projectId=${projectId}`,
    state: 'todo',
    stateName: '待处理',
    playbookId: 'optimize-page',
    playbook: '优化现有页面',
    ownerName: 'Duplicate finder',
    pages: [page],
    opportunity: 'O-12',
    place: 'Install guide',
  });
  expect(byNo('T-2')).toMatchObject({
    pages: [page, `${page}/linux`],
    opportunity: 'O-12',
  });
  expect(open.items.map((item: { no: string }) => item.no)).not.toContain(
    'T-3',
  );
  expect(open.items[2]).toMatchObject({ morePages: 3 });
  expect(open.items[2].pages).toHaveLength(5);
  // A page that would pass the output limit ends early and says where to go on.
  expect(open.items.length).toBeLessThan(50);
  expect(JSON.stringify(open).length).toBeLessThan(24000);
  expect(open.nextOffset).toBe(open.items.length);
  const listed = [...open.items];
  for (let offset = open.nextOffset; offset !== null;) {
    const page = await call('task_list', {
      scope: 'accessible',
      status: 'open',
      offset,
    });
    expect(JSON.stringify(page).length).toBeLessThan(24000);
    listed.push(...page.items);
    offset = page.nextOffset;
  }
  expect(new Set(listed.map((item) => item.taskId)).size).toBe(62);
  expect(status).not.toHaveBeenCalled();

  const closed = await call('task_list', { status: 'closed' });
  expect(closed.items.map((item: { no: string }) => item.no)).toEqual(['T-3']);
  expect(closed.items[0]).toMatchObject({
    state: 'closed',
    stateName: '已关闭',
  });
  const everywhere: { title: string }[] = [];
  let read: { projectId: string }[] = [];
  for (let offset: number | null = 0; offset !== null;) {
    const page = await call('task_list', {
      allProjects: true,
      status: 'open',
      offset,
    });
    everywhere.push(...page.items);
    read = page.projects;
    offset = page.nextOffset;
  }
  expect(everywhere).toHaveLength(63);
  expect(everywhere.map((item) => item.title)).toContain('In another project');
  expect(read.map((item) => item.projectId).sort()).toEqual(
    [projectId, String(other.id)].sort(),
  );
  expect(
    (await call('task_list', { projectId: Number(other.id) })).items,
  ).toHaveLength(1);
  await call('task_list', { scope: 'executable', limit: 1 });
  expect(status).toHaveBeenCalled();

  // Input the schema refuses comes back as a ToolInputError naming the field and the rule.
  await expect(
    call('task_list', { projectId: 'nocobase', limit: 20 }),
  ).rejects.toMatchObject({
    message: expect.stringContaining(
      'projectId: must be the numeric project id, such as "1"',
    ),
  });
  await expect(
    call('task_list', { projectId, allProjects: true }),
  ).rejects.toThrow('allProjects: give projectId or allProjects, not both');
  await expect(call('task_list', { status: 'done' })).rejects.toThrow(
    'status: Invalid option: expected one of "open"|"closed"',
  );
  await expect(call('task_get', { projectId, taskId: 'T-1' })).rejects.toThrow(
    'taskId: must be the numeric task id',
  );
  for (const [name, input, field] of [
    ['project_data', { section: 'everything' }, 'section'],
    ['daily_analysis', { day: 'yesterday' }, 'day'],
    ['query_data', { source: 'nowhere' }, 'source'],
    ['read_page', { url: 'http://duplicates.example.test/' }, 'url'],
    ['analysis_rules', { offset: -1 }, 'offset'],
    ['propose_keyword_run', { mode: 'all' }, 'mode'],
  ] as const)
    await expect(call(name, input)).rejects.toThrow(
      new RegExp(`^Invalid input: ${field}: `),
    );
  expect(await call('propose_rule_changes', { changes: [] })).toMatchObject({
    rejected: true,
    reason: expect.stringMatching(/^changes: /),
  });
});

test("task tools name playbooks, steps and states as the task page does, in the turn's language", async ({
  testApp,
}) => {
  await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const container = testApp.application.container;
  const host = container.resolve(nocoReachToken);
  await host.ready;
  const user = await container.resolve(userAdministrationServiceToken).create({
    email: 'online-names@example.test',
    password: 'test-password-123',
    name: 'Name reader',
  });
  await container.resolve(authorizationToken).permissionSets.assign({
    permissionSet: 'nr.member',
    subject: { type: 'user', id: user.id },
  });
  const project = await host.plugin.projects.create({
    name: 'Names',
    domain: 'names.example.test',
  });
  const projectId = String(project.id);
  await host.legacy.db.access!.joinCreatedProject(user.id, projectId);
  const builtIn = SYSTEM_PLAYBOOKS.find((p) => p.id === 'optimize-page')!;
  // A started task keeps the playbook it started with: the built-in as it was, or a copy someone edited.
  const started = (edited: boolean) => {
    const stages = stagesFor(builtIn).map((stage) =>
      edited ? { ...stage, name: `${stage.name} (ours)` } : stage,
    );
    const name = edited ? 'Our page rewrite' : builtIn.name;
    return {
      stage: 'flow',
      stageIndex: 1,
      flow: { id: builtIn.id, name, version: 3, system: true, edited, stages },
      playbook: {
        id: builtIn.id,
        name,
        kind: builtIn.kind,
        version: 3,
        next: [],
        system: true,
        edited,
      },
    };
  };
  const tasks: Record<string, string> = {};
  for (const [no, extra] of [
    [1, {}],
    [2, started(false)],
    [3, started(true)],
    [4, { playbookId: 'removed-playbook' }],
  ] as const) {
    const task = await host.plugin.db.getRepository('nrTasks').create({
      values: {
        projectId,
        taskKey: randomUUID(),
        title: `Task ${no}`,
        status: '待处理',
        evidence: {
          createdBy: { id: user.id },
          no,
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
            playbookId: 'optimize-page',
            humanOwnerId: user.id,
            ...extra,
          },
        },
      },
    });
    tasks[`T-${no}`] = String(task.id);
  }
  const signal = new AbortController().signal;
  const read = async (locale?: string) => {
    const context = await createNocoReachOnlineHost(() => host, '')(
      {
        id: randomUUID(),
        ownerId: user.id,
        projectId,
        instructions: '',
        ...(locale ? { locale } : {}),
      } as OnlineRun,
      signal,
    );
    const call = async (name: string, input: unknown): Promise<any> =>
      context.tools.find((tool) => tool.name === name)!.execute(input, signal);
    const list = await call('task_list', { scope: 'accessible' });
    return {
      item: (no: string) =>
        list.items.find((item: { no: string }) => item.no === no),
      get: (no: string) => call('task_get', { projectId, taskId: tasks[no] }),
    };
  };

  const english = await read('en-US');
  expect(english.item('T-1')).toMatchObject({
    state: 'todo',
    stateName: 'To do',
    playbookId: 'optimize-page',
    playbook: 'Improve existing page',
  });
  expect(english.item('T-1')).not.toHaveProperty('step');
  expect(english.item('T-2')).toMatchObject({
    state: 'review',
    stateName: 'Needs you',
    playbook: 'Improve existing page',
    step: 'Review',
  });
  // An edited copy keeps its own words.
  expect(english.item('T-3')).toMatchObject({
    playbook: 'Our page rewrite',
    step: '审核 (ours)',
  });
  expect(english.item('T-4')).toMatchObject({
    playbookId: 'removed-playbook',
    playbook: null,
  });
  expect(await english.get('T-2')).toMatchObject({
    state: 'review',
    stateName: 'Needs you',
    stageKey: 'review',
    stageName: 'Review',
    playbook: 'Improve existing page',
  });
  // A language loaded on demand.
  const traditional = await read('zh-TW');
  expect(traditional.item('T-1')).toMatchObject({
    stateName: '待處理',
    playbook: '最佳化現有頁面',
  });
  expect(traditional.item('T-2')).toMatchObject({ step: '審核' });
  // A turn sent before turns kept their language.
  expect((await read()).item('T-1')).toMatchObject({
    playbook: 'Improve existing page',
  });
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
  const taskId = String(task.id),
    signal = new AbortController().signal;
  const run = {
    id: randomUUID(),
    ownerId: actor,
    projectId: null,
    instructions: '',
  } as OnlineRun;
  const context = await createNocoReachOnlineHost(() => host, '/main')(
    run,
    signal,
  );
  const call = async (name: string, input: unknown): Promise<any> =>
    context.tools.find((tool) => tool.name === name)!.execute(input, signal);
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
  const context = await createNocoReachOnlineHost(() => host, '/main')(
    {
      id: randomUUID(),
      ownerId: user.id,
      projectId,
      instructions: '',
    } as OnlineRun,
    signal,
  );
  const tool = context.tools.find((t) => t.name === 'daily_analysis')!;
  const page = (await tool.execute({}, signal)) as { text: string };
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
  await expect(tool.execute({}, signal)).rejects.toMatchObject({
    status: 403,
  });
});

test('query_data reads the pages a member may open, through their services, and denies the others alone', async ({
  testApp,
}) => {
  await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const container = testApp.application.container;
  const host = container.resolve(nocoReachToken);
  await host.ready;
  const users = container.resolve(userAdministrationServiceToken);
  const sets = container.resolve(authorizationToken).permissionSets;
  const project = await host.plugin.projects.create({
    name: 'Query data',
    domain: 'query-data.example.test',
  });
  const projectId = String(project.id);
  await sets.create({
    key: 'nr.query-reader',
    title: 'Query reader',
    grants: host.legacy.db.access!.roleGrants({
      scope: 'member',
      capabilities: ['view', 'tasks', 'sources.use.hackernews'],
    }),
  });
  const person = async (name: string, permissionSet: string) => {
    const user = await users.create({
      email: `${name}@example.test`,
      password: 'test-password-123',
      name,
    });
    await sets.assign({
      permissionSet,
      subject: { type: 'user', id: user.id },
    });
    await host.legacy.db.access!.joinCreatedProject(user.id, projectId);
    return user;
  };
  const member = await person('query-member', 'nr.member');
  const reader = await person('query-reader', 'nr.query-reader');
  const DAY = 86400000,
    ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  const snapshots = host.plugin.db.getRepository('nrSnapshots');
  await snapshots.create({
    values: {
      key: `reddit:${projectId}`,
      payload: {
        terms: ['query data'],
        status: 'active',
        retainedFrom: ago(90).slice(0, 10),
        dataThrough: ago(1).slice(0, 10),
        posts: Object.fromEntries(
          Array.from({ length: 60 }, (_, i) => [
            `p${i}`,
            {
              id: `p${i}`,
              title: i % 4 ? `Thread ${i}` : `Alternatives to query data ${i}`,
              url: `https://www.reddit.com/r/selfhosted/comments/${i}`,
              subreddit: 'selfhosted',
              snippet: 'A thread',
              postedAt: ago(2 + (i % 20)),
              firstSeenAt: ago(2),
              term: 'query data',
            },
          ]),
        ),
      },
    },
  });
  await snapshots.create({
    values: {
      key: `hackernews:${projectId}`,
      payload: {
        terms: ['query data'],
        status: 'active',
        retainedFrom: ago(90).slice(0, 10),
        mentions: Object.fromEntries(
          Array.from({ length: 30 }, (_, i) => [
            `h${i}`,
            {
              type: 'story',
              title: `Show HN: query data ${i}`,
              url: 'https://query-data.example.test',
              hnUrl: `https://news.ycombinator.com/item?id=${i}`,
              points: i * 3,
              comments: i,
              createdAt: ago(2 + (i % 10)),
              term: 'query data',
            },
          ]),
        ),
      },
    },
  });
  const signal = new AbortController().signal;
  const queryFor = async (ownerId: string) => {
    const context = await createNocoReachOnlineHost(() => host, '/main')(
      { id: randomUUID(), ownerId, projectId, instructions: '' } as OnlineRun,
      signal,
    );
    expect(context.instructions).toContain('query_data');
    const tool = context.tools.find((t) => t.name === 'query_data')!;
    return async (input: unknown): Promise<any> => tool.execute(input, signal);
  };

  const asMember = await queryFor(member.id);
  const reddit = await asMember({ source: 'reddit' });
  // The page's own count, and every post of the period behind it.
  expect(reddit).toMatchObject({
    page: 'Community › Reddit',
    url: '/main/data/reddit',
    total: 60,
    nextOffset: 20,
    dataThrough: ago(1).slice(0, 10),
    summary: {
      kpis: expect.arrayContaining([
        expect.objectContaining({ key: 'posts', value: 60 }),
      ]),
    },
  });
  expect(reddit.rows).toHaveLength(20);
  const rest = await asMember({ source: 'reddit', offset: 20, limit: 100 });
  expect(rest).toMatchObject({ total: 60, nextOffset: null });
  expect(rest.rows).toHaveLength(40);
  const alternatives = await asMember({
    source: 'reddit',
    filters: { keyword: 'alternatives' },
  });
  expect(alternatives.total).toBe(15);
  const week = await asMember({
    source: 'hackernews',
    range: '7',
    sort: '-points',
  });
  expect(week.period.end).toBe(ago(1).slice(0, 10));
  expect(
    week.rows.every((r: { date: string }) => r.date >= week.period.start),
  ).toBe(true);
  expect(week.rows.map((r: { points: number }) => r.points)).toEqual(
    [...week.rows.map((r: { points: number }) => r.points)].sort(
      (a, b) => b - a,
    ),
  );
  expect(await asMember({ source: 'forum' })).toMatchObject({
    connected: false,
  });

  const asReader = await queryFor(reader.id);
  expect(await asReader({ source: 'reddit' })).toEqual({
    source: 'reddit',
    page: 'Community › Reddit',
    url: '/main/data/reddit',
    accessDenied: true,
  });
  expect(await asReader({ source: 'search' })).toMatchObject({
    accessDenied: true,
  });
  expect((await asReader({ source: 'hackernews' })).total).toBe(30);
  // Site audit is part of viewing the project; this project has no website content yet.
  expect(await asReader({ source: 'audit' })).toMatchObject({
    connected: false,
  });
});
