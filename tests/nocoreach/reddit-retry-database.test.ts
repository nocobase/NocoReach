// @vitest-environment node
import { expect, test } from 'vitest';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { createNocoReachTestDatabase } from '../fixtures/nocoreach-database';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database';
import { RedditSource } from '../../server/nocoreach/reddit-source';

test('persisted request keys survive a collector restart and rolled-back result save without another paid request', async () => {
  const database = await createNocoReachTestDatabase();
  const db = new LegacyDatabase(
    database.database,
    new SnowflakeIdGenerator({ workerId: 1 }),
  );
  let requests = 0;
  const host = {
    db,
    env: () =>
      JSON.stringify({
        login: 'synthetic',
        password: 'synthetic',
        budget: 5,
        verifiedAt: 'test',
      }),
    network: {
      bind() {},
      mockCacheKey: () => 'isolated-test',
      fetch: async () => {
        requests++;
        const payload = (
          await db
            .getRepository('nrSnapshots')
            .findOne({ filter: { key: 'reddit:1' } })
        )?.get('payload');
        expect(payload.plan.entries[0].requestKey).toMatch(/^reddit-/);
        return {
          ok: true,
          json: async () => ({
            status_code: 20000,
            cost: 0.002,
            tasks: [
              { status_code: 20000, id: 'safe-task', result: [{ items: [] }] },
            ],
          }),
        };
      },
    },
    app: { logger: { warn() {} } },
  };
  const source = new RedditSource(host);
  await source.mutate('1', () => ({
    status: 'active',
    terms: ['NocoBase'],
    posts: {},
  }));
  const mutate = source.mutate.bind(source);
  source.mutate = (id, fn) =>
    mutate(id, async (state) => {
      const next = await fn(state);
      if (next.lastRun) throw new Error('Synthetic final snapshot rollback');
      return next;
    });
  await expect(source.check('1')).rejects.toThrow(
    'Synthetic final snapshot rollback',
  );
  expect(requests).toBe(1);
  expect((await source.state('1')).plan.entries[0].status).toBe('pending');
  expect((await source.state('1')).lastRun).toBeUndefined();
  const recovered = new RedditSource(host);
  await recovered.check('1');
  expect(requests).toBe(1);
  expect((await recovered.state('1')).lastRun.ok).toBe(true);
  expect(
    (
      await db
        .getRepository('nrKeywordRuns')
        .find({ filter: { projectId: '1' } })
    ).length,
  ).toBe(1);
  await source.close();
  await recovered.close();
});
