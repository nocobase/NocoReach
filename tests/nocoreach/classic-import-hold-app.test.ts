// @vitest-environment node
// The classic import holds NocoReach's timers (ImportHold in server/nocoreach/legacy/app.ts), against the application
// itself: the analysis timer, fired mid-import on a project whose retry is due, writes nothing, and neither does the
// Scheduler's daily analysis; the timer works again after finish, and once the lease has passed since a CLI's last
// call. tests/nocoreach/classic-import.test.ts covers the hold on its own.
import { randomBytes, randomUUID } from 'node:crypto';

import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect, vi } from 'vitest';

import { isAppOwnedSnapshot } from '../../server/nocoreach/classic-import.js';
import { STARTS_KEY } from '../../server/nocoreach/execution/restarts.js';
import {
  IMPORT_HOLD_LEASE_MS,
  type LegacyAction,
} from '../../server/nocoreach/legacy/app.js';
import { legacyContext } from '../../server/nocoreach/legacy/context.js';
import { ANALYSIS_SCHEDULE } from '../../server/nocoreach/schedule-management.js';
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

const at = '2026-09-01T00:00:00.000Z';
// A failed automatic analysis whose retry is due: the analysis timer starts a run at any time of day.
const due = {
  runs: [],
  retry: { attempt: 1, nextAt: '2026-01-01T00:00:00.000Z' },
};
const classicRows = [
  {
    id: '100',
    createdAt: at,
    updatedAt: at,
    key: 'project:1',
    payload: { id: 1, name: 'NocoBase', domain: 'nocobase.com' },
  },
  {
    id: '101',
    createdAt: at,
    updatedAt: at,
    key: 'daily-analysis:1',
    payload: due,
  },
];

test('timers leave the data alone while the classic import runs, and work again after finish or once the lease lapses', async ({
  testApp,
  connection,
}) => {
  const app = testApp.application;
  const nr = app.container.resolve(nocoReachToken);
  // The test fires the timers itself, through the handler the provider gives the schedule executor.
  await app.container
    .resolve(jobExecutorServiceToken)
    .getScheduleExecutor('nocoreach')
    .shutdown();
  // Reproduce a task timer firing before import without depending on the wall-clock second during sign-in.
  const taskCron = nr.legacy.jobs.find((job) => job.name === 'taskCron')!;
  await nr.legacy.tick(taskCron);
  nr.plugin.taskExecution.stop();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const analysisCron = nr.legacy.jobs.find(
    (job) => job.name === 'analysisCron',
  )!;
  const settled = async () => {
    await nr.plugin.analysis.running?.catch(() => undefined);
  };
  const call = async (action: string, body: Record<string, unknown>) => {
    const ctx = legacyContext({
      resource: 'nrImport',
      action,
      method: 'POST',
      query: {},
      body,
      header: () => undefined,
      cookie: () => undefined,
      user: { id: admin.user.id, name: 'admin' },
      roles: ['root'],
      app: nr.legacy,
      cache: nr.cache,
      logger: nr.logger,
    });
    await (nr.legacy.resources.action('nrImport', action) as LegacyAction)(
      ctx,
      async () => {},
    );
    return ctx.body as Record<string, unknown>;
  };
  const snapshot = async (key: string) =>
    (
      (await connection
        .repository('nrSnapshots')
        .findOne({ filter: { key } })) as { payload?: unknown } | null
    )?.payload;
  const keys = async () =>
    (
      (await connection.repository('nrSnapshots').findMany({})) as {
        key: string;
      }[]
    )
      .map((row) => row.key)
      .filter((key) => !isAppOwnedSnapshot(key))
      .sort();

  const starts = await snapshot(STARTS_KEY);
  expect(starts).toEqual({ starts: [expect.any(String)] });
  await call('begin', { replace: false });
  expect(
    await call('rows', {
      table: 'nrSnapshots',
      rows: [
        ...classicRows,
        { id: '102', key: STARTS_KEY, payload: { starts: [at] } },
      ],
    }),
  ).toEqual({ inserted: 2, skipped: 1 });
  expect(await snapshot(STARTS_KEY)).toEqual(starts);

  // Mid-import, project 1 exists with a retry due: the analysis timer's firing is skipped.
  expect(await nr.legacy.tick(analysisCron)).toBe(false);
  expect(nr.plugin.analysis.running).toBeFalsy();
  // So is the Scheduler's daily analysis: its firing is cancelled, and the minute timer catches the day up later.
  const schedules = (await (
    await admin.fetch('/scheduler/schedules')
  ).json()) as {
    data: { id: string; key: string }[];
  };
  const schedule = schedules.data.find(
    (item) => item.key === ANALYSIS_SCHEDULE,
  )!;
  const { occurrenceId } = await nr.schedules.trigger(randomUUID());
  await vi.waitFor(
    async () => {
      const response = await admin.fetch(
        `/scheduler/schedules/${schedule.id}/occurrences`,
      );
      const rows = (
        (await response.json()) as { data: { id: string; status: string }[] }
      ).data;
      expect(rows.find((row) => row.id === occurrenceId)?.status).toBe(
        'cancelled',
      );
    },
    { timeout: 10000 },
  );
  expect((await nr.analysisRuns.get(occurrenceId))?.status).toBe('cancelled');
  await settled();
  expect(await keys()).toEqual(['daily-analysis:1', 'project:1']);
  expect(await snapshot('daily-analysis:1')).toEqual(due);

  // After finish the same firing starts the retry.
  await call('variables', { variables: [] });
  await call('finish', {});
  expect(nr.legacy.importHold.held).toBe(false);
  expect(await nr.legacy.tick(analysisCron)).toBe(true);
  await settled();
  expect(await snapshot('daily-analysis:1')).not.toEqual(due);

  // A CLI that stops after a call: the timers stay held for the lease, then run again.
  await call('begin', { replace: true });
  expect(await snapshot(STARTS_KEY)).toEqual(starts);
  await call('rows', { table: 'nrSnapshots', rows: classicRows });
  expect(await nr.legacy.tick(analysisCron)).toBe(false);
  const clock = vi
    .spyOn(Date, 'now')
    .mockReturnValue(Date.now() + IMPORT_HOLD_LEASE_MS);
  const fired = nr.legacy.tick(analysisCron);
  clock.mockRestore();
  expect(await fired).toBe(true);
  await settled();
  expect(await snapshot('daily-analysis:1')).not.toEqual(due);
});
