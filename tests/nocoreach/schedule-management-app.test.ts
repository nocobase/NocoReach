// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import {
  ANALYSIS_SCHEDULE,
  ScheduleManagement,
} from '../../server/nocoreach/schedule-management.js';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    nocoreachMock: {
      enabled: true,
      environment: 'test',
      initializeData: false,
    },
    agents: { vectors: { store: false } },
  },
});

test('daily schedule edits apply live, persist, preserve pause, and manual dispatch uses Scheduler history exactly once', async ({
  testApp,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  const scheduler = testApp.application.container.resolve(
    schedulerServiceToken,
  );
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const list = await (await admin.fetch('/scheduler/schedules')).json();
  const schedule = list.data.find(
    (item: { key: string }) => item.key === ANALYSIS_SCHEDULE,
  );
  expect(schedule).toBeTruthy();
  const base = `/nocoreach/schedules/${schedule.id}`;
  const send = (
    client: typeof admin,
    path: string,
    method: string,
    body: unknown,
  ) =>
    client.fetch(path, {
      method,
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify(body),
    });
  const anonymous = await testApp.fetch(
    new Request(`http://localhost${testApp.publicBasePath}/api${base}/timing`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ time: '12:30' }),
    }),
  );
  expect(anonymous.status).toBe(401);
  const credentials = {
    email: 'schedule-outsider@example.test',
    password: 'fictional-password-123',
  };
  await testApp.application.container
    .resolve(userAdministrationServiceToken)
    .create({ ...credentials, name: 'Outsider' });
  const outsider = await signIn(testApp, credentials);
  expect(
    (await send(outsider, `${base}/timing`, 'PUT', { time: '12:30' })).status,
  ).toBe(403);
  expect(
    (
      await send(outsider, `${base}/trigger`, 'POST', {
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await send(admin, '/nocoreach/schedules/foreign/timing', 'PUT', {
        time: '12:30',
      })
    ).status,
  ).toBe(404);
  expect(
    (await send(admin, `${base}/timing`, 'PUT', { time: '25:00' })).status,
  ).toBe(400);
  const changed = await send(admin, `${base}/timing`, 'PUT', { time: '13:37' });
  expect(changed.status).toBe(200);
  const view = (await changed.json()).data;
  expect(view.cron).toBe('37 13 * * *');
  expect(Date.parse(view.nextRunAt)).toBeGreaterThan(Date.now());
  // Fresh app-side service and another official sync both read persisted settings.
  const fresh = new ScheduleManagement(
    runtime.legacy.db,
    runtime.workflows,
    scheduler,
  );
  expect((await fresh.timing()).cron).toBe('37 13 * * *');
  expect((await scheduler.refreshSchedule(ANALYSIS_SCHEDULE))?.cron).toBe(
    '37 13 * * *',
  );
  await send(admin, `/scheduler/schedules/${schedule.id}/disable`, 'POST', {});
  const paused = await send(admin, `${base}/timing`, 'PUT', { time: '14:42' });
  expect((await paused.json()).data).toMatchObject({
    enabled: false,
    cron: '42 14 * * *',
    scheduleStatus: 'paused',
  });
  // No projects: the real instruction finishes as failed, proving acceptance is not reported as success.
  const requestId = randomUUID();
  const trigger = await send(admin, `${base}/trigger`, 'POST', { requestId });
  expect(trigger.status).toBe(200);
  const dispatched = (await trigger.json()).data;
  const replay = await send(admin, `${base}/trigger`, 'POST', { requestId });
  expect((await replay.json()).data).toEqual(dispatched);
  await vi.waitFor(
    async () => {
      const response = await admin.fetch(
        `/scheduler/schedules/${schedule.id}/occurrences`,
      );
      const rows = (await response.json()).data.filter(
        (r: { id: string }) => r.id === dispatched.occurrenceId,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('failed');
    },
    { timeout: 10000 },
  );
  expect(
    (await runtime.workflows.definition(ANALYSIS_SCHEDULE))?.enabled,
  ).toBeFalsy();
  const saved = await runtime.schedules.timing();
  const refresh = vi.spyOn(scheduler, 'refreshSchedule');
  refresh.mockRejectedValueOnce(new Error('simulated executor failure'));
  expect(
    (await send(admin, `${base}/timing`, 'PUT', { time: '17:00' })).status,
  ).toBe(500);
  expect(await runtime.schedules.timing()).toEqual(saved);
  expect((await runtime.workflows.definition(ANALYSIS_SCHEDULE))?.cron).toBe(
    saved.cron,
  );
  refresh.mockRestore();
  const concurrentId = randomUUID();
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      send(admin, `${base}/trigger`, 'POST', { requestId: concurrentId }),
    ),
  );
  const receipts = await Promise.all(
    concurrent.map((response) => response.json()),
  );
  expect(receipts[0].data).toEqual(receipts[1].data);
  expect(concurrent.every((response) => response.status === 200)).toBe(true);
});
