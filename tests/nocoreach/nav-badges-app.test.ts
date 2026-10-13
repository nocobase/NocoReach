// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
test('badge API reads every project task through the real repository and preserves authorization and project isolation', async ({
  testApp,
  connection,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const runtime = testApp.application.container.resolve(nocoReachToken),
    plugin = runtime.plugin;
  vi.spyOn(plugin.taskExecution, 'tick').mockResolvedValue(undefined);
  await plugin.projects.create({
    name: 'Badge project A',
    domain: 'a.example.com',
    language: 'en-US',
  });
  await plugin.projects.create({
    name: 'Badge project B',
    domain: 'b.example.com',
    language: 'en-US',
  });
  const projects = await plugin.projects.list(),
    a = String(projects.at(-2).id),
    b = String(projects.at(-1).id);
  const actor = await connection
    .repository('user')
    .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } });
  const tasks = connection.repository('nrTasks');
  // Cross the previous 2000-record cap; tasks belong to the authenticated user.
  for (let i = 0; i < 2001; i++)
    await tasks.createOne({
      values: {
        id: 800000 + i,
        projectId: a,
        taskKey: `badge-${i}`,
        title: `Task ${i}`,
        status: '待处理',
        evidence: { createdBy: { id: String(actor!.id) } },
      },
    });
  await tasks.createOne({
    values: {
      id: 900000,
      projectId: b,
      taskKey: 'other-project',
      title: 'Other project',
      status: '待处理',
      evidence: { createdBy: { id: String(actor!.id) } },
    },
  });
  expect((await plugin.taskExecution.tasks(a)).length).toBe(2001);
  const path = '/nocoreach/nrStrategy/badges';
  const call = (id: string) =>
    admin.fetch(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ projectId: id }),
    });
  const response = await call(a);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: { insights: 0, opportunities: 0, tasks: 2001 },
  });
  expect(await (await call(b)).json()).toEqual({
    data: { insights: 0, opportunities: 0, tasks: 1 },
  });
  expect((await call('999999999')).status).toBe(404);
  const anonymous = await testApp.fetch(
    new Request(`http://localhost${testApp.publicBasePath}/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: a }),
    }),
  );
  expect(anonymous.status).toBe(401);
  const first = await tasks.findMany({ filter: { projectId: b } });
  await tasks.updateOne({
    filter: { id: first[0].id },
    values: { evidence: { work: { stage: 'done' } } },
  });
  expect(await (await call(b)).json()).toEqual({
    data: { insights: 0, opportunities: 0, tasks: 0 },
  });
});
