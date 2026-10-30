// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
import {
  initializeMockDemo,
  MOCK_DEMO_KEY,
} from '../../server/nocoreach/mock-demo';

import {
  getCatalog,
  sourceState,
  type StatusInput,
} from '../../client/pages/data-sources';

vi.mock('#i18n', () => ({ $t: (key: string) => key }));

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  env: {
    ...process.env,
    NOCOBASE_TEST_DB_SQLITE_DIRECTORY: path.join(
      tmpdir(),
      `nocoreach-demo-startup-${randomUUID()}`,
    ),
  },
  server: {
    env: { DB_FILENAME: undefined, APP_PUBLIC_ORIGIN: 'http://localhost' },
  },
  config: {
    app: { publicOrigin: 'http://localhost' },
    users: {
      initialAdmin: {
        ...DEFAULT_ADMIN_CREDENTIALS,
        name: 'Demo startup admin',
      },
    },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    nocoreachMock: { enabled: true, environment: 'test' },
    agents: { server: { enabled: false } },
    nocoreach: { publicDns: '' },
  },
});

test('enabled deployments initialize a browsable demo before readiness without opting in again', async ({
  testApp,
  connection,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.ready;
  const marker = await connection
    .repository('nrSnapshots')
    .findOne({ filter: { key: MOCK_DEMO_KEY } });
  const progress = marker?.payload as {
    projectId: string;
    completed: string[];
  };
  expect(progress.completed).toContain('complete');
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch('/nocoreach/nrTaskWork/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ projectId: progress.projectId }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: Array<{ id: string; evidence: { simulated: boolean } }>;
  };
  expect(body.data).toHaveLength(36);
  expect(body.data.every((task) => task.evidence.simulated)).toBe(true);
  const detail = await admin.fetch('/nocoreach/nrTaskWork/get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({
      projectId: progress.projectId,
      taskId: String(body.data[0]!.id),
    }),
  });
  expect(detail.status).toBe(200);
  const state = (await detail.json()) as {
    data: { work: { history: unknown[] }; runs: unknown[] };
  };
  expect(state.data.work.history).toHaveLength(3);
  expect(state.data.runs).toHaveLength(0);
});

test('demo catalog connects simulated sources, leaves publishing unconfigured and keeps deliberate disconnections', async ({
  testApp,
  connection,
}) => {
  const marker = await connection
    .repository('nrSnapshots')
    .findOne({ filter: { key: MOCK_DEMO_KEY } });
  const progress = marker!.payload as {
    projectId: string;
    completed: string[];
  };
  const projectId = progress.projectId;
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const input: Record<string, unknown> = {};
  for (const [key, resource, action] of [
    ['google', 'nrGoogle', 'status'],
    ['site', 'nrSiteContent', 'summary'],
    ['keyword', 'nrKeywords', 'status'],
    ['github', 'nrGitHub', 'status'],
    ['community', 'nrCommunity', 'status'],
    ['repo', 'nrAgent', 'status'],
    ['packages', 'nrPackages', 'status'],
    ['hackernews', 'nrHackerNews', 'status'],
    ['reddit', 'nrReddit', 'status'],
    ['trends', 'nrTrends', 'status'],
    ['competitors', 'nrCompetitors', 'status'],
    ['x', 'nrX', 'status'],
    ['chat', 'nrChat', 'status'],
    ['xiaohongshu', 'nrXiaohongshu', 'status'],
    ['bilibili', 'nrBilibili', 'status'],
    ['youtube', 'nrYouTube', 'status'],
    ['articles', 'nrArticles', 'targets'],
  ]) {
    const response = await admin.fetch(`/nocoreach/${resource}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ projectId }),
    });
    expect({ resource, status: response.status }).toMatchObject({
      status: 200,
    });
    const { data } = (await response.json()) as {
      data: Record<string, unknown>;
    };
    if (key === 'articles') {
      expect(data.targets).toEqual([]);
      input[key] = { targets: (data.targets as unknown[]).length };
    } else if (key === 'repo') input.repos = data.repos;
    else input[key] = data;
  }
  const states = Object.fromEntries(
    getCatalog()
      .filter((source) => source.availability === 'available')
      .map((source) => [source.id, sourceState(source, input as StatusInput)]),
  );
  expect(Object.keys(states).length).toBeGreaterThan(15);
  // The docs have a repository of their own (2026-10-29): /docs pages go there, the rest to the website's.
  expect(input.repos).toMatchObject([
    { repo: 'nocobloom/nocobloom', urls: ['nocobloom.example'] },
    { repo: 'nocobloom/docs', urls: ['nocobloom.example/docs'] },
  ]);
  for (const [source, state] of Object.entries(states))
    expect({ [source]: state }).toEqual({
      [source]:
        source === 'articles'
          ? 'ready'
          : source === 'xiaohongshu'
            ? 'done'
            : 'connected',
    });
  expect(
    (input.google as { connection: { status: string } }).connection.status,
  ).toBe('ready_for_sync');

  // Model an older completed dataset; only the newly introduced defaults are backfilled.
  const runtime = testApp.application.container.resolve(nocoReachToken);
  const snapshots = runtime.legacy.db.getRepository('nrSnapshots');
  const old = {
    ...progress,
    completed: progress.completed.filter(
      (phase) => phase !== 'connection-defaults',
    ),
  };
  await snapshots.update({
    filter: { key: MOCK_DEMO_KEY },
    values: { payload: old },
  });
  await snapshots.update({
    filter: { key: `nr-task-agent:${projectId}` },
    values: { payload: { revision: 0, agentId: null, repo: null } },
  });
  await runtime.plugin.metadata(projectId, { status: 'active' });
  await initializeMockDemo(runtime.plugin);
  const repository = (await snapshots.findOne({
    filter: { key: `nr-task-agent:${projectId}` },
  }))!.get('payload') as {
    revision: number;
    repos: { repo: string; urls: string[] }[];
  };
  expect(repository.repos).toMatchObject([
    { repo: 'nocobloom/nocobloom', urls: ['nocobloom.example'] },
  ]);
  expect((await runtime.plugin.link(projectId))!.get('status')).toBe(
    'ready_for_sync',
  );

  await snapshots.update({
    filter: { key: MOCK_DEMO_KEY },
    values: { payload: old },
  });
  await snapshots.update({
    filter: { key: `nr-task-agent:${projectId}` },
    values: {
      payload: { revision: repository.revision + 1, agentId: null, repos: [] },
    },
  });
  await runtime.plugin.metadata(projectId, { status: 'disconnected' });
  await initializeMockDemo(runtime.plugin);
  expect(
    (await snapshots.findOne({
      filter: { key: `nr-task-agent:${projectId}` },
    }))!.get('payload'),
  ).toMatchObject({ repos: [] });
  expect((await runtime.plugin.link(projectId))!.get('status')).toBe(
    'disconnected',
  );
});
