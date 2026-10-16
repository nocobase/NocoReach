// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { MOCK_DEMO_KEY } from '../../server/nocoreach/mock-demo';
import { demoEditionKey } from '../../server/nocoreach/demo-install';
import {
  DEMO_STORIES,
  DEMO_DOCUMENTS,
} from '../../server/nocoreach/demo-content';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  env: {
    ...process.env,
    NOCOBASE_TEST_DB_SQLITE_DIRECTORY: path.join(
      tmpdir(),
      `nocoreach-editorial-fresh-${randomUUID()}`,
    ),
  },
  server: {
    env: { DB_FILENAME: undefined, APP_PUBLIC_ORIGIN: 'http://localhost' },
  },
  config: {
    app: { publicOrigin: 'http://localhost' },
    users: {
      initialAdmin: { ...DEFAULT_ADMIN_CREDENTIALS, name: 'Editorial test' },
    },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    nocoreachMock: {
      enabled: true,
      environment: 'demo',
      initializeData: true,
    },
    agents: { vectors: { store: false } },
    nocoreach: { publicDns: '' },
  },
});

test('new demo starts with the requested identity and authored content', async ({
  testApp,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.ready;
  const snapshots = runtime.legacy.db.getRepository('nrSnapshots');
  const progress = (await snapshots.findOne({
    filter: { key: MOCK_DEMO_KEY },
  }))!.get('payload');
  const project = await runtime.plugin.projects.get(progress.projectId);
  expect(project.name).toBe('nocobase.example');
  expect(project.domains).toEqual(['nocobase.example']);
  expect(
    (await snapshots.findOne({
      filter: { key: demoEditionKey(progress.projectId) },
    }))!.get('payload'),
  ).toMatchObject({
    tasks: DEMO_STORIES.length,
    documents: DEMO_DOCUMENTS.length,
    archived: 0,
  });
  expect(
    await runtime.legacy.db
      .getRepository('nrTasks')
      .count({ filter: { projectId: progress.projectId } }),
  ).toBe(DEMO_STORIES.length);
});
