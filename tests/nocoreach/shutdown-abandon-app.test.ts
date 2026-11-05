// @vitest-environment node
// The provider wires shutdown's give-up on a timer firing (LegacyApp.abandon) into both the classic database and the
// project network, against the application itself: once abandoned, the firing can neither write nor send, while the
// rest of the application still writes. afterDisable stops the sources that have a cancellation path before the
// provider closes the network. tests/nocoreach/cron-firing-deadline.test.ts covers the mechanism on its own.
import { randomBytes } from 'node:crypto';

import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect, vi } from 'vitest';

import { Connections } from '../../server/nocoreach/plugin.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import { createStandaloneServer } from '../../server/standalone.js';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});

test('a timer firing shutdown gives up on can neither write nor send; the application still writes', async ({
  testApp,
}) => {
  const app = testApp.application;
  const nr = app.container.resolve(nocoReachToken);
  // The test fires its own timer.
  await app.container
    .resolve(jobExecutorServiceToken)
    .getScheduleExecutor('nocoreach')
    .shutdown();
  const closing = Promise.withResolvers<void>();
  const outcomes: Record<string, unknown> = {};
  const record = (name: string, work: () => Promise<unknown>) =>
    work().then(
      () => (outcomes[name] = 'allowed'),
      (error: unknown) => (outcomes[name] = error),
    );
  const job = nr.legacy.cronJobManager.addJob({
    name: 'abandonedCron',
    cronTime: '0 0 1 1 *',
    onTick: async () => {
      await closing.promise;
      await record('send', () =>
        nr.plugin.network.fetch('site', 'https://example.com/', {}, '1'),
      );
      await record('write', () =>
        nr.legacy.db.getRepository('nrSnapshots').create({
          values: { key: 'abandoned-firing', payload: {} },
        }),
      );
    },
  });
  try {
    const shutdown = new AbortController();
    shutdown.abort();
    expect(await nr.legacy.tick(job, { signal: shutdown.signal })).toBe(true);
    expect(await nr.legacy.settle(20)).toBe(false);
    expect(nr.legacy.abandon()).toBe(1);
    closing.resolve();
    await expect.poll(() => Object.keys(outcomes).length).toBe(2);
    expect(outcomes.send).toMatchObject({ code: 'NR_SHUTTING_DOWN' });
    expect(outcomes.write).toMatchObject({ code: 'NR_SHUTTING_DOWN' });
    const snapshots = nr.legacy.db.getRepository('nrSnapshots');
    expect(
      await snapshots.findOne({ filter: { key: 'abandoned-firing' } }),
    ).toBeNull();
    // Outside the firing the application goes on writing.
    await snapshots.create({ values: { key: 'after-abandon', payload: {} } });
    expect(
      await snapshots.findOne({ filter: { key: 'after-abandon' } }),
    ).not.toBeNull();
    await snapshots.destroy({ filter: { key: 'after-abandon' } });
  } finally {
    nr.legacy.cronJobManager.removeJob(job);
  }
});

test('afterDisable stops Google sync and GitHub trends before anything else closes', async () => {
  const order: string[] = [];
  const owner = {
    sync: { stop: () => order.push('sync') },
    githubTrends: { stop: () => order.push('githubTrends') },
    trends: {
      close: async () => {
        order.push('trends');
      },
    },
    app: { cronJobManager: { removeJob: () => {} } },
  };
  await Connections.prototype.afterDisable.call(owner);
  expect(order).toEqual(['sync', 'githubTrends', 'trends']);
});
