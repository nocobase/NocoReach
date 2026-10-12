// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { DataForSeo } from '../../server/nocoreach/dataforseo';
import { KeywordSuggest } from '../../server/nocoreach/keyword-suggest';
import { toFilter } from '../../server/nocoreach/legacy/filters';

vi.setConfig({ testTimeout: 30000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    database: {
      connections: { main: { pool: { acquireTimeoutMillis: 1500 } } },
    },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});

for (const [operator, expected] of [
  ['$gt', [2]],
  ['$gte', [1, 2]],
  ['$lt', [0]],
  ['$lte', [0, 1]],
] as const) {
  test(`datetime ${operator} preserves the boundary through reads and mutations`, async ({
    testApp,
  }) => {
    const db = testApp.application.container.resolve(nocoReachToken).legacy.db;
    const repo = db.getRepository('nrKeywordRuns');
    const projectId = randomUUID();
    const dates = [
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T00:00:00.001Z',
      '2026-10-01T00:00:00.002Z',
    ];
    for (const createdAt of dates)
      await repo.create({
        values: { projectId, createdAt, status: 'running' },
      });
    const filter = {
      $and: [{ projectId }, { $or: [{ createdAt: { [operator]: dates[1] } }] }],
    };
    await db.sequelize.transaction(async (transaction) => {
      const rows = await repo.find({ filter, sort: 'createdAt', transaction });
      expect(
        rows.map((row) => new Date(String(row.createdAt)).toISOString()),
      ).toEqual(expected.map((index) => dates[index]));
      // An implicit transaction must use its own metadata connection as well.
      expect(await repo.count({ filter })).toBe(expected.length);
      expect(
        new Date(
          String(
            (await repo.findOne({ filter, sort: 'createdAt' }))?.createdAt,
          ),
        ).toISOString(),
      ).toBe(dates[expected[0]]);
      expect(
        await repo.update({
          filter,
          values: { status: 'unknown' },
          transaction,
        }),
      ).toHaveLength(expected.length);
      expect(await repo.destroy({ filter, transaction })).toBe(expected.length);
    });
    expect(await repo.count({ filter: { projectId } })).toBe(
      3 - expected.length,
    );
  });
}

test('string dates and numeric comparisons keep their original operators', async ({
  testApp,
}) => {
  const db = testApp.application.container.resolve(nocoReachToken).legacy.db;
  const repo = db.getRepository('nrSyncPartitions');
  const projectId = randomUUID();
  for (const date of ['2026-09-30', '2026-10-01', '2026-10-02']) {
    await repo.create({ values: { projectId, date } });
  }
  const rows = await repo.find({
    filter: {
      projectId,
      date: { $startsWith: '2026-10-' },
    },
  });
  expect(rows.map((row) => row.date)).toEqual(['2026-10-01', '2026-10-02']);
  const runs = db.getRepository('nrKeywordRuns');
  for (const costUsd of [1, 2, 3])
    await runs.create({ values: { projectId, costUsd } });
  expect(
    (
      await runs.find({ filter: { projectId, costUsd: { $gt: 1, $lte: 2 } } })
    ).map((row) => row.costUsd),
  ).toEqual([2]);
  expect(
    toFilter(
      { date: { $gte: '2026-10-01' } },
      undefined,
      new Map([['date', 'string']]),
    )?.root,
  ).toMatchObject({ items: [{ operator: '$gte', value: '2026-10-01' }] });
  expect(
    toFilter(
      { day: { $gte: '2026-10-01' } },
      undefined,
      new Map([['day', 'date']]),
    )?.root,
  ).toMatchObject({
    items: [{ operator: '$dateNotBefore' }],
  });
});

test('DataForSEO runs, reuses results, blocks uncertain retries and enforces the monthly budget on real SQLite', async ({
  testApp,
}) => {
  const db = testApp.application.container.resolve(nocoReachToken).legacy.db;
  const projectId = randomUUID();
  const service = new DataForSeo(
    {
      db,
      env: () =>
        JSON.stringify({
          login: 'fixture',
          password: 'fixture',
          budget: 0.1,
          verifiedAt: 'fixture',
        }),
      app: { logger: { warn: vi.fn() } },
    },
    {
      demo: {
        specification: (value: { target: string }) => ({
          kind: 'demo',
          path: 'demo/live',
          request: { target: value.target },
          reservationUsd: 0.05,
        }),
        result: () => ({
          status: 'completed',
          result: { items: [] },
          costUsd: 0.06,
        }),
      },
    },
  );
  // Only the external request is stubbed; all claiming, reuse and budget queries use the real database.
  const request = vi.spyOn(service, 'request').mockResolvedValue({});
  const run = (target: string) =>
    service.run(projectId, 'demo', { target, requestKey: randomUUID() });
  const month = new Date(
    new Date().toISOString().slice(0, 7) + '-01T00:00:00.000Z',
  );
  const repo = db.getRepository('nrKeywordRuns');
  await repo.create({
    values: {
      projectId,
      status: 'completed',
      costUsd: 10,
      createdAt: new Date(month.getTime() - 1),
    },
  });
  await repo.create({
    values: { projectId, status: 'completed', costUsd: 0.02, createdAt: month },
  });
  const first = await run('first');
  expect(first.status).toBe('completed');
  expect((await run('first')).id).toBe(first.id);
  expect(request).toHaveBeenCalledTimes(1);
  await expect(run('over-budget')).rejects.toThrow('预算已用完');
  expect(request).toHaveBeenCalledTimes(1);

  const preview = await service.preview(projectId, 'demo', {
    target: 'uncertain',
  });
  const pending = await db.getRepository('nrKeywordRuns').create({
    values: {
      projectId,
      queryHash: preview.queryHash,
      status: 'unknown',
      reservedUsd: 0.05,
    },
  });
  expect((await run('uncertain')).id).toBe(pending.id);
  expect(request).toHaveBeenCalledTimes(1);
  request.mockRestore();
});

test('manual keyword metrics lookup clears a saved date error and preserves suggestions after reload', async ({
  testApp,
}) => {
  const db = testApp.application.container.resolve(nocoReachToken).legacy.db;
  const projectId = randomUUID();
  const service = new KeywordSuggest({
    db,
    env: () =>
      JSON.stringify({
        login: 'fixture',
        password: 'fixture',
        budget: 1,
        verifiedAt: 'fixture',
      }),
    app: { logger: { warn: vi.fn() } },
  });
  const saved = {
    at: '2026-10-09T10:00:00.000Z',
    market: { locationCode: 2840, language: 'en' },
    basis: { pages: 80, home: false, queries: 1, competitors: 1 },
    items: [
      'Open Source No-Code Platform',
      'zero volume',
      'missing volume',
    ].map((keyword, index) => ({
      id: `suggestion-${index}`,
      keyword,
      group: '产品与功能词',
      intent: 'commercial',
      reason: '官网产品能力',
      page: 'https://example.com/',
      site: { position: 9, clicks: 12, impressions: 100 },
    })),
    metrics: {},
    metricsAt: null,
    metricsError:
      'Operator "$gte" is not supported for Field "createdAt" of type "datetime".',
  };
  await service.save(projectId, saved);
  // Keep the real date filters, budget checks, result parser and snapshot persistence.
  const request = vi.spyOn(service.d4s, 'request').mockResolvedValue({
    status_code: 20000,
    cost: 0.0103,
    tasks: [
      {
        status_code: 20000,
        result: [
          {
            items: [
              {
                keyword: 'open source no-code platform',
                keyword_info: { search_volume: 1900 },
              },
              { keyword: 'zero volume', keyword_info: { search_volume: 0 } },
            ],
          },
        ],
      },
    ],
  });
  try {
    expect((await service.suggest(projectId)).metricsError).toBe(
      saved.metricsError,
    );
    expect(request).not.toHaveBeenCalled();

    const recovered = await service.lookup(projectId);
    expect(recovered.metricsError).toBeNull();
    expect(recovered.items.map((item) => item.metrics?.volume ?? null)).toEqual(
      [1900, 0, null],
    );
    expect(recovered.items[2].metrics).toBeNull();
    expect(recovered.metricsAt).toEqual(expect.any(String));
    expect(Number.isFinite(Date.parse(recovered.metricsAt))).toBe(true);
    expect(await service.state(projectId)).toEqual({
      ...saved,
      metrics: recovered.metrics,
      metricsAt: recovered.metricsAt,
      metricsError: null,
    });
    expect(await service.view(projectId)).toEqual(recovered);
    expect(await service.suggest(projectId)).toEqual(recovered);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toBe(
      'dataforseo_labs/google/keyword_overview/live',
    );
    expect(request.mock.calls[0][2]).toEqual([
      {
        keywords: saved.items.map((item) => item.keyword.toLowerCase()),
        location_code: 2840,
        language_code: 'en',
      },
    ]);
  } finally {
    request.mockRestore();
  }
});
