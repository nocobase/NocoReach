// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import { projectWork } from '../../server/nocoreach/execution/model.js';
import { compare, windows } from '../../server/nocoreach/execution/effect.js';
vi.setConfig({ testTimeout: 60000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  server: {
    env: { DB_FILENAME: undefined, APP_PUBLIC_ORIGIN: 'http://localhost' },
  },
  config: {
    app: { publicOrigin: 'http://localhost' },
    users: { initialAdmin: DEFAULT_ADMIN_CREDENTIALS },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    nocoreachMock: {
      enabled: true,
      environment: 'test',
      initializeData: false,
    },
  },
});

test('results gate uses real auth and project filters; opportunities raised from a result keep working', async ({
  testApp,
  request,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.ready;
  const plugin = runtime.plugin as any,
    db = runtime.legacy.db;
  const project = await plugin.projects.create({
      name: 'Results acceptance',
      domain: 'results.example',
    }),
    other = await plugin.projects.create({
      name: 'Other project',
      domain: 'other.example',
    }),
    id = String(project.id);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const call = (resource: string, action: string, values: object) =>
    admin.fetch(`/nocoreach/${resource}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ projectId: id, ...values }),
    });
  const json = async (r: Response, status = 200) => {
    const body = await r.json();
    expect({
      status: r.status,
      unexpected: r.status === status ? null : body,
    }).toEqual({ status, unexpected: null });
    return body.data;
  };
  expect(
    (
      await request('/nocoreach/nrTaskWork/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      })
    ).status,
  ).toBe(401);
  const page = 'https://results.example/page',
    parts: any[] = [],
    range = windows('2026-10-01', 7);
  for (const [window, value] of [
    [range.baseline, 0],
    [range.after, 10],
  ] as const)
    for (
      let date = window.start;
      date <= window.end;
      date = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10)
    )
      parts.push({
        source: 'gsc',
        grain: 'query_page',
        date,
        payload: value
          ? [{ page, clicks: value, impressions: 100, position: 2 }]
          : [],
      });
  const r = compare(7, '2026-10-01', [page], parts, '2026-10-12T00:00:00Z');
  const work = {
    ...projectWork({}),
    stage: 'done',
    revision: 4,
    observeFrom: '2026-10-01T00:00:00Z',
    page: { url: page },
    observation: { results: [r] },
    history: [
      {
        at: '2026-10-12T00:00:00Z',
        actor: 'system',
        action: 'effect',
        note: '7',
      },
    ],
  };
  const original = await db.getRepository('nrTasks').create({
    values: {
      projectId: id,
      taskKey: randomUUID(),
      title: 'Original completed task',
      evidence: { work },
    },
  });
  const taskId = String(original.id),
    saved = original.get('evidence');
  const list = await json(await call('nrTaskWork', 'results', {}));
  expect(list.items).toHaveLength(1);
  expect(list.items[0].latest.coverage.gsc.baselineDays).toBe(7);
  const detail = await json(await call('nrTaskWork', 'result', { taskId }));
  expect(detail.results).toHaveLength(1);
  expect(detail.taskRevision).toBe(4);
  expect(detail.task.history).toBeUndefined();
  await json(
    await call('nrTaskWork', 'result', { projectId: String(other.id), taskId }),
    404,
  );
  // The dashboard reads the same evidence, per project, through the same gate.
  const board = await json(await call('nrTaskWork', 'board', { range: 'all' }));
  expect(board.counts).toMatchObject({ live: 1, up: 1, delivered: 0 });
  expect(board.totals.clicks).toEqual({ before: 0, after: 70, tasks: 1 });
  expect(board.changes.map((c: { taskId: string }) => c.taskId)).toEqual([
    taskId,
  ]);
  expect(
    (
      await json(
        await call('nrTaskWork', 'board', {
          projectId: String(other.id),
          range: 'all',
        }),
      )
    ).total,
  ).toBe(0);
  await json(await call('nrTaskWork', 'board', { range: '7' }), 400);
  expect(
    (
      await request('/nocoreach/nrTaskWork/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      })
    ).status,
  ).toBe(401);
  expect(
    (await db.getRepository('nrTasks').findOne({ filterByTk: taskId }))?.get(
      'evidence',
    ),
  ).toEqual(saved);
  // Follow-ups from a result were removed (2026-10-23 user decision: the flow ran too long); opportunities raised that
  // way before keep working: a fresh analysis does not expire them, Ignore and Restore count them, and Hand off
  // carries their source to the task.
  const fields = {
    title: 'Investigate next steps',
    objective: 'Understand the change',
    brief: 'Investigate without automatic execution',
  };
  const resultSource = {
    taskId,
    observeFrom: null,
    day: 7,
    observation: r,
    pages: [],
    capturedAt: new Date().toISOString(),
  };
  const op = { id: randomUUID() };
  let current = await plugin.strategy.state(id);
  await plugin.strategy.mutate(
    id,
    { requestId: randomUUID(), revision: current.revision },
    async (state: { resultOpportunities?: object[] }) => {
      state.resultOpportunities = [
        {
          id: op.id,
          title: 'Confirm the observation',
          observation: 'Clicks changed',
          meaning: 'Cause is unknown',
          evidenceText: 'Day 7 local data',
          limitation: 'No causal attribution',
          suggestion: 'Investigate',
          objective: 'Understand change',
          source: 'search',
          priority: 'medium',
          signalIds: [],
          sources: ['gsc'],
          resultSource,
          firstSeenAt: resultSource.capturedAt,
          updatedAt: resultSource.capturedAt,
          change: 'new',
        },
      ];
    },
  );
  // A fresh daily analysis must not expire a confirmed manual opportunity.
  plugin.strategy.context = async () => ({
    evidence: {
      summary: { web: { days: 0 }, search: { days: 0 } },
      publicSources: [],
    },
  });
  current = await plugin.strategy.state(id);
  await json(
    await call('nrStrategy', 'saveInsights', {
      revision: current.revision,
      requestId: randomUUID(),
      insights: [],
    }),
  );
  current = await plugin.strategy.state(id);
  expect(current.resultOpportunities[0].id).toBe(op.id);
  expect(
    (await json(await call('nrStrategy', 'badges', {}))).opportunities,
  ).toBe(1);
  await json(
    await call('nrStrategy', 'reviewOpportunity', {
      revision: current.revision,
      requestId: randomUUID(),
      insightId: op.id,
      status: 'ignored',
    }),
  );
  expect(
    (await json(await call('nrStrategy', 'badges', {}))).opportunities,
  ).toBe(0);
  current = await plugin.strategy.state(id);
  await json(
    await call('nrStrategy', 'reviewOpportunity', {
      revision: current.revision,
      requestId: randomUUID(),
      insightId: op.id,
      status: 'pending',
    }),
  );
  expect(
    (await json(await call('nrStrategy', 'badges', {}))).opportunities,
  ).toBe(1);
  current = await plugin.strategy.state(id);
  const handoff = await json(
    await call('nrStrategy', 'confirmDirection', {
      revision: current.revision,
      requestId: randomUUID(),
      insightId: op.id,
      ...fields,
    }),
  );
  const converted = await db
    .getRepository('nrTasks')
    .findOne({ filterByTk: handoff.proposals[0].taskId });
  expect(converted?.get('evidence').resultSource).toEqual(
    current.resultOpportunities[0].resultSource,
  );
  expect(projectWork(converted?.toJSON()).stage).toBe('plan');
  expect(
    (await json(await call('nrStrategy', 'badges', {}))).opportunities,
  ).toBe(0);
  const users = testApp.application.container.resolve(
    userAdministrationServiceToken,
  );
  const outsiderCredentials = {
    email: `outsider-${randomUUID()}@example.test`,
    password: 'fictional-test-password-123',
  };
  await users.create({ ...outsiderCredentials, name: 'Synthetic outsider' });
  const outsider = await signIn(testApp, outsiderCredentials);
  for (const [resource, action] of [
    ['nrTaskWork', 'results'],
    ['nrTaskWork', 'result'],
  ]) {
    expect(
      (
        await outsider.fetch(`/nocoreach/${resource}/${action}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            origin: 'http://localhost',
          },
          body: JSON.stringify({ projectId: id, taskId }),
        })
      ).status,
    ).toBe(403);
  }
});
