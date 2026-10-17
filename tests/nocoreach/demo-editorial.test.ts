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
  installEditorialDemo,
  demoEditionKey,
  DEMO_EDITION,
} from '../../server/nocoreach/demo-install';
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
      `nocoreach-editorial-${randomUUID()}`,
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
      initializeData: false,
    },
    agents: { vectors: { store: false } },
    nocoreach: { publicDns: '' },
  },
});

test('upgrades only the owned demo, rolls back failures, preserves edits, and keeps every result filter populated', async ({
  testApp,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.ready;
  const p = runtime.plugin;
  const db = runtime.legacy.db;
  const snapshots = db.getRepository('nrSnapshots');
  // Build the real older edition, then exercise exactly the in-place upgrade path.
  Object.defineProperty(p.mock!, 'environment', {
    value: 'test',
    configurable: true,
  });
  await initializeMockDemo(p);
  const progress = (await snapshots.findOne({
    filter: { key: MOCK_DEMO_KEY },
  }))!.get('payload');
  const id = progress.projectId;
  const other = await p.projects.create({
    name: 'Do not touch',
    domain: 'untouched.example',
    language: 'zh-CN',
  });
  const otherBefore = await p.projects.get(String(other.id));
  const tasks = db.getRepository('nrTasks');
  const edited = (await tasks.find({ filter: { projectId: id } }))[0]!;
  const editedEvidence = edited.get('evidence');
  editedEvidence.work.revision = 3;
  await tasks.update({
    filterByTk: edited.id,
    values: { title: '用户自己编辑过的标题', evidence: editedEvidence },
  });
  await installEditorialDemo(p, id, progress.clock);
  expect(
    await snapshots.findOne({ filter: { key: demoEditionKey(id) } }),
  ).toBeNull();
  Object.defineProperty(p.mock!, 'environment', {
    value: 'demo',
    configurable: true,
  });
  await expect(
    installEditorialDemo(p, String(other.id), progress.clock),
  ).rejects.toThrow('NR_DEMO_PROJECT_MISMATCH');

  const pending = await db
    .getRepository('nrSyncJobs')
    .create({ values: { projectId: id, status: 'queued' } });
  await expect(installEditorialDemo(p, id, progress.clock)).rejects.toThrow(
    'NR_DEMO_ACTIVE_WORK',
  );
  await db.getRepository('nrSyncJobs').destroy({ filterByTk: pending.id });
  const projectBefore = await p.projects.get(id);
  await p.projects.update(id, (value: Record<string, unknown>) => ({
    ...value,
    domains: ['customized.example'],
  }));
  await expect(installEditorialDemo(p, id, progress.clock)).rejects.toThrow(
    'NR_DEMO_PROJECT_CUSTOMIZED',
  );
  await p.projects.update(id, () => projectBefore);

  const original = db.getRepository.bind(db);
  const failure = vi.spyOn(db, 'getRepository').mockImplementation((name) => {
    const repo = original(name);
    if (name === 'nrTasks')
      return {
        ...repo,
        create: async (options) => {
          if (
            String((options.values as { taskKey?: string }).taskKey).startsWith(
              DEMO_EDITION,
            )
          )
            throw new Error('injected-write-failure');
          return repo.create(options);
        },
      };
    return repo;
  });
  await expect(installEditorialDemo(p, id, progress.clock)).rejects.toThrow(
    'injected-write-failure',
  );
  failure.mockRestore();
  expect((await p.projects.get(id)).domains).toEqual(['nocobloom.example']);
  expect(
    await snapshots.findOne({ filter: { key: demoEditionKey(id) } }),
  ).toBeNull();
  expect(
    await snapshots.count({
      filter: { key: { $startsWith: `demo-backup:${id}:` } },
    }),
  ).toBe(0);

  await initializeMockDemo(p);
  expect((await p.projects.get(id)).name).toBe('nocobase.example');
  expect((await p.projects.get(id)).domains).toEqual(['nocobase.example']);
  expect(await p.projects.get(String(other.id))).toEqual(otherBefore);
  const marker = (await snapshots.findOne({
    filter: { key: demoEditionKey(id) },
  }))!.get('payload');
  expect(marker).toMatchObject({
    tasks: DEMO_STORIES.length,
    documents: DEMO_DOCUMENTS.length,
    archived: 35,
  });
  expect((await tasks.findOne({ filterByTk: edited.id }))!.get('title')).toBe(
    '用户自己编辑过的标题',
  );
  expect(
    (await tasks.findOne({ filterByTk: edited.id }))!.get('evidence').work
      .archivedAt,
  ).toBeUndefined();
  const before = await tasks.find({ filter: { projectId: id } });
  await initializeMockDemo(p);
  expect(await tasks.count({ filter: { projectId: id } })).toBe(before.length);
  expect((await p.knowledge.list(id)).items).toHaveLength(
    6 + DEMO_DOCUMENTS.length,
  );
  // Historical manual comparisons must never be overwritten by the background observer.
  await p.taskExecution.observeEffects();
  expect(
    (await tasks.find({ filter: { projectId: id } })).map((row) =>
      row.toJSON(),
    ),
  ).toEqual(before.map((row) => row.toJSON()));

  await p.network.runProject(id, async () => {
    await p.siteContent.refresh(id);
    expect(
      (await p.siteContent.state(id)).pages.every((page: { url: string }) =>
        page.url.includes('nocobase.example'),
      ),
    ).toBe(true);
    await p.sync.enqueue(id, 7, 'manual');
    for (let n = 0; n < 8; n++) await p.sync.step(id);
  });
  expect(
    await db
      .getRepository('nrSyncJobs')
      .count({ filter: { projectId: id, status: 'failed' } }),
  ).toBe(0);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  for (const status of [
    'up',
    'down',
    'flat',
    'insufficient',
    'waiting',
    'unavailable',
  ]) {
    const response = await admin.fetch('/nocoreach/nrTaskWork/results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ projectId: id, status }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { total: number; items: { simulated: boolean }[] };
    };
    expect(body.data.total).toBeGreaterThan(0);
    expect(body.data.items.every((item) => item.simulated)).toBe(true);
  }
  expect(
    await snapshots.count({
      filter: { key: { $startsWith: `nr-task-run:${id}:` } },
    }),
  ).toBe(0);
});

test('live deployments are a no-op before accessing any database', async () => {
  const database = vi.fn(() => {
    throw new Error('live database accessed');
  });
  await installEditorialDemo(
    {
      mock: { enabled: false, environment: null },
      db: { getRepository: database },
    } as never,
    '1',
    new Date().toISOString(),
  );
  expect(database).not.toHaveBeenCalled();
});
