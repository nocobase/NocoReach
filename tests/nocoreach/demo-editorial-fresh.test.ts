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
import {
  rowsFor,
  opportunityState,
  todaySuggestions,
  insightPending,
  signalDisposition,
} from '../../shared/strategy-pending';
import {
  installDemoOpportunities,
  opportunityEditionKey,
} from '../../server/nocoreach/demo-opportunities';
import type { StrategyState } from '../../shared/strategy-model';
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

test('demo opportunities populate the actual page selectors and preserve decisions on restart', async ({
  testApp,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.ready;
  const p = runtime.plugin;
  const snapshots = runtime.legacy.db.getRepository('nrSnapshots');
  const progress = (await snapshots.findOne({
    filter: { key: MOCK_DEMO_KEY },
  }))!.get('payload');
  const id = progress.projectId;
  const row = (await snapshots.findOne({ filter: { key: `strategy:${id}` } }))!;
  const state = row.get('payload') as StrategyState;
  const tasks = (
    await runtime.legacy.db
      .getRepository('nrTasks')
      .find({ filter: { projectId: id } })
  ).map((t) => t.toJSON());
  const rows = rowsFor(state).filter((r) =>
    r.card.id.startsWith('editorial-opportunity-'),
  );
  expect(
    rows.filter((r) => opportunityState(r, state).state === 'pending'),
  ).toHaveLength(8);
  expect(
    rows.filter((r) => opportunityState(r, state).state === 'task'),
  ).toHaveLength(2);
  expect(
    rows.filter((r) => opportunityState(r, state).state === 'archived'),
  ).toHaveLength(2);
  expect(
    todaySuggestions(state, 50).filter((r) =>
      r.card.id.startsWith('editorial-opportunity-'),
    ),
  ).toHaveLength(8);
  expect(insightPending(state, tasks)).toBeGreaterThanOrEqual(8);
  expect(Object.values(state.watch!)).toHaveLength(3);
  expect(
    rows.every((r) => r.card.no && r.card.evidenceText && r.card.suggestion),
  ).toBe(true);
  for (const proposal of state.proposals.filter((p) =>
    p.id.startsWith('editorial-proposal-'),
  )) {
    expect(tasks.some((t) => String(t.id) === String(proposal.taskId))).toBe(
      true,
    );
    const signal = state.insights!.evidence.signals!.items.find(
      (s) => s.key === proposal.insight!.signalIds![0],
    )!;
    expect(signalDisposition(signal, state, tasks).next).toBe('task');
  }
  // Decisions belong to the user: startup must not restore ignored or deleted samples.
  state.opportunityMeta![rows[0]!.card.id] = { status: 'ignored' };
  state.insights!.items = state.insights!.items.filter(
    (c) => c.id !== rows[1]!.card.id,
  );
  await snapshots.update({ filterByTk: row.id, values: { payload: state } });
  await installDemoOpportunities(p, id);
  expect(
    (await snapshots.findOne({ filterByTk: row.id }))!.get('payload'),
  ).toEqual(state);
  expect(
    await snapshots.count({ filter: { key: opportunityEditionKey(id) } }),
  ).toBe(1);
  // An in-place upgrade must retain user content and roll back the whole strategy on a failed marker write.
  await snapshots.destroy({ filter: { key: opportunityEditionKey(id) } });
  await snapshots.destroy({
    filter: { key: `demo-backup:${id}:nocobase-opportunities-v2:strategy` },
  });
  const baseline: StrategyState = {
    ...state,
    insights: {
      ...state.insights!,
      items: state.insights!.items.filter(
        (c) => !c.id.startsWith('editorial-'),
      ),
      evidence: { ...state.insights!.evidence, signals: undefined },
    },
    proposals: [],
    watch: {},
    opportunityMeta: {},
  };
  await snapshots.update({ filterByTk: row.id, values: { payload: baseline } });
  const db = runtime.legacy.db;
  const original = db.getRepository.bind(db);
  const fault = vi.spyOn(db, 'getRepository').mockImplementation((name) => {
    const repo = original(name);
    if (name !== 'nrSnapshots') return repo;
    return {
      ...repo,
      create: async (options) => {
        if (options.values?.key === opportunityEditionKey(id))
          throw new Error('injected-opportunity-write-failure');
        return repo.create(options);
      },
    };
  });
  try {
    await expect(installDemoOpportunities(p, id)).rejects.toThrow(
      'injected-opportunity-write-failure',
    );
  } finally {
    fault.mockRestore();
  }
  expect(
    (await snapshots.findOne({ filterByTk: row.id }))!.get('payload'),
  ).toEqual(baseline);
  expect(
    await snapshots.findOne({
      filter: { key: `demo-backup:${id}:nocobase-opportunities-v2:strategy` },
    }),
  ).toBeNull();
  await installDemoOpportunities(p, id);
  const upgraded = (await snapshots.findOne({ filterByTk: row.id }))!.get(
    'payload',
  ) as StrategyState;
  for (const card of baseline.insights!.items)
    expect(upgraded.insights!.items).toContainEqual(card);
  expect(
    (await snapshots.findOne({
      filter: { key: `demo-backup:${id}:nocobase-opportunities-v2:strategy` },
    }))!.get('payload').state,
  ).toEqual(baseline);
  // Test/live gates execute before any database access.
  for (const environment of ['test', 'live']) {
    await installDemoOpportunities(
      { mock: { enabled: true, environment } } as never,
      id,
    );
  }
  await expect(
    installDemoOpportunities(p, 'unrelated-project'),
  ).rejects.toThrow('NR_DEMO_PROJECT_MISMATCH');
});
