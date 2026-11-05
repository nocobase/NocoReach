// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { describe, expect, vi } from 'vitest';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { demoDataToken } from '@nocobase/app-plugin-demo-mode/server/tokens';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { projectWork } from '../../server/nocoreach/execution/model';
import { createDemoTest, json } from './demo-data-app-fixture';

const readOnlyTest = createDemoTest();

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
          value: ['nrSnapshots'],
        }),
      },
    );
    expect(configured.status).toBe(200);
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
