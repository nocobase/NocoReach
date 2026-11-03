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
import { sampleDataToken } from '@nocobase/app-server/sample-data';
import { databaseManagerToken } from '@nocobase/db';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { demoAccounts } from '../../server/nocoreach/demo-data/steps';

// Generating the data takes minutes, during the application's first start.
vi.setConfig({ testTimeout: 900000, hookTimeout: 900000 });

// What the generator recorded, which an installation does not keep: a source that failed only leaves a warning.
const generated = vi.hoisted(() => ({
  data: undefined as Record<string, unknown> | undefined,
}));
vi.mock('../../server/nocoreach/demo-data/samples', async (original) => {
  const actual =
    await original<typeof import('../../server/nocoreach/demo-data/samples')>();
  return {
    ...actual,
    generateNocoReachSamples: async (
      ...args: Parameters<typeof actual.generateNocoReachSamples>
    ) => {
      await actual.generateNocoReachSamples(...args);
      generated.data = { ...args[1].data };
    },
  };
});

const createSampleTest = (options: { sampleData: boolean; demo: boolean }) =>
  createAppTest({
    createServer: createStandaloneServer,
    env: {
      ...process.env,
      NOCOBASE_TEST_DB_SQLITE_DIRECTORY: path.join(
        tmpdir(),
        `nocoreach-preview-sample-${randomUUID()}`,
      ),
    },
    server: {
      env: { DB_FILENAME: undefined, APP_PUBLIC_ORIGIN: 'http://localhost' },
    },
    config: {
      app: { publicOrigin: 'http://localhost', sampleData: options.sampleData },
      users: {
        initialAdmin: { ...DEFAULT_ADMIN_CREDENTIALS, name: 'Sample admin' },
      },
      secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
      nocoreach: { publicDns: '' },
      demoMode: { enabled: options.demo },
    },
  });

const test = createSampleTest({ sampleData: true, demo: false });
const ordinaryTest = createSampleTest({ sampleData: false, demo: false });
const demoTest = createSampleTest({ sampleData: true, demo: true });

const json = { 'Content-Type': 'application/json', origin: 'http://localhost' };
const post = (body: unknown = {}) => ({
  method: 'POST',
  headers: json,
  body: JSON.stringify(body),
});

type TestApp = Parameters<Parameters<typeof test>[1]>[0]['testApp'];

async function ledgerStatus(testApp: TestApp): Promise<string | undefined> {
  const row = (await testApp.application.container
    .resolve(databaseManagerToken)
    .query()
    .selectFrom('__nocobase_seeds' as never)
    .select(['status' as never])
    .where('name' as never, '=', 'sample-data:nocoreach/demo' as never)
    .executeTakeFirst()) as { status?: string } | undefined;
  return row?.status;
}

describe('sample data on a first installation', () => {
  test('builds the demo once, offline and open to writes, outside Demo Mode', async ({
    testApp,
  }) => {
    const { container } = testApp.application;
    const runtime = container.resolve(nocoReachToken);
    await runtime.ready;

    expect(await ledgerStatus(testApp)).toBe('executed');
    expect(await container.resolve(sampleDataToken).run()).toEqual({
      executed: [],
      skipped: [],
      failed: [],
    });
    expect(generated.data?.skipped).toEqual([]);

    const projects = await runtime.plugin.projects.all();
    expect(projects.map((project) => project.name)).toEqual([
      'Acme',
      'Acme CRM',
    ]);
    expect(projects.map((project) => project.demo)).toEqual([
      { dataset: 'nocoreach', language: 'en-US' },
      { dataset: 'nocoreach', language: 'en-US' },
    ]);
    const [main] = projects.map((project) => String(project.id));
    expect(
      await runtime.plugin.db
        .getRepository('nrTasks')
        .count({ filter: { projectId: main } }),
    ).toBeGreaterThan(10);
    const keywords = await runtime.plugin.keywordService.saved(main);
    expect(keywords.items.length).toBeGreaterThan(30);

    // Its requests stay in the process, answered by the demo world rather than Demo Mode's adapter.
    const page = await runtime.plugin.network.fetch(
      'site',
      'https://acme.example/',
      {},
      main,
    );
    expect(page.status).toBe(200);

    // Its business AI is simulated too, and nothing about that needs Demo Mode.
    await expect(
      runtime.plugin.network.runProject(main, () =>
        runtime.plugin.taskExecution!.provider!.complete('system', 'prompt'),
      ),
    ).resolves.toEqual(expect.any(String));

    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const created = await admin.fetch(
      '/nocoreach/nrProjects/create',
      post({
        name: 'A project of my own',
        domain: 'own.example',
        language: 'en-US',
      }),
    );
    expect(created.status).toBe(200);

    // The accounts sign in with their published passwords, limited to the projects they joined.
    const [lead] = demoAccounts('en-US');
    const member = await signIn(testApp, {
      email: `${lead.username}@acme.example`,
      password: lead.password,
    });
    const seen = (await (
      await member.fetch('/nocoreach/nrProjects/list', post())
    ).json()) as { data: { name: string }[] };
    expect(seen.data.map((project) => project.name)).toEqual([
      'Acme',
      'Acme CRM',
    ]);

    expect((await admin.fetch('/demoMode/data')).status).toBe(404);
  });
});

describe('an installation that did not ask for sample data', () => {
  const test = ordinaryTest;
  test('stays without it', async ({ testApp }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    expect(await ledgerStatus(testApp)).toBe('skipped');
    expect(await runtime.plugin.projects.all()).toEqual([]);
  });
});

describe('a Demo Mode deployment', () => {
  const test = demoTest;
  test('leaves a Demo Mode deployment to its dataset', async ({ testApp }) => {
    const { container } = testApp.application;
    const runtime = container.resolve(nocoReachToken);
    await runtime.ready;
    expect(container.resolve(sampleDataToken).registrations()).toEqual([]);
    expect(await ledgerStatus(testApp)).toBeUndefined();
    expect(await runtime.plugin.projects.all()).toEqual([]);
  });
});
