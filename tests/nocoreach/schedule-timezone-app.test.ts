// @vitest-environment node
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { createTestAppConfig } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { apiDocsToken } from '@nocobase/app-server/router';
import { expect, test, vi } from 'vitest';
import {
  createStandaloneServer,
  type StandaloneServer,
} from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import {
  ANALYSIS_SCHEDULE,
  TIMING_KEY,
} from '../../server/nocoreach/schedule-management.js';

test('timezone saves validate before writes, isolate tasks, roll back, and survive an application restart', async () => {
  const config = await createTestAppConfig({
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
  let server: StandaloneServer | undefined;
  const controlKey = 'test.timezone-control';
  async function boot() {
    const instance = await createStandaloneServer({
      configPath: config.path,
      viteDevUrl: false,
      env: { APP_STORAGE_DIR: path.join(config.directory, 'storage') },
    });
    server = instance;
    const scheduler = instance.application.container.resolve(
      schedulerServiceToken,
    );
    // Only the test installs a second task; product definitions stay unchanged.
    scheduler.defineSchedule({
      key: controlKey,
      title: 'Synthetic Shanghai control',
      schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
      target: { type: 'app.nocoreach.daily-analysis', config: {} },
    });
    await scheduler.refreshSchedule(controlKey);
    const session = await signIn(
      {
        fetch: (request) => instance.fetch(request),
        publicBasePath: instance.application.publicBasePath,
      },
      DEFAULT_ADMIN_CREDENTIALS,
    );
    return {
      scheduler,
      session,
      runtime: instance.application.container.resolve(nocoReachToken),
    };
  }
  try {
    let app = await boot();
    const document = await server!.application.container
      .resolve(apiDocsToken)
      .getDocument();
    const timingOperation =
      document.paths?.['/api/nocoreach/schedules/{id}/timing']?.put;
    expect(timingOperation?.operationId).toBe('updateNocoReachScheduleTiming');
    expect(JSON.stringify(timingOperation?.requestBody)).toContain('timezone');
    const initial = (await app.scheduler.list()).find(
      (item) => item.key === ANALYSIS_SCHEDULE,
    )!;
    const repo = app.runtime.legacy.db.getRepository('nrSnapshots');
    expect(await repo.findOne({ filter: { key: TIMING_KEY } })).toBeNull();
    expect(
      await app.scheduler.refreshSchedule(ANALYSIS_SCHEDULE),
    ).toMatchObject({
      timezone: initial.timezone,
      cron: initial.cron,
      nextRunAt: initial.nextRunAt,
    });
    expect(await repo.findOne({ filter: { key: TIMING_KEY } })).toBeNull();
    const base = `/nocoreach/schedules/${initial.id}/timing`;
    const save = (body: unknown) =>
      app.session.fetch(base, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify(body),
      });
    for (const timezone of ['Mars/Olympus', '+08:00', '-0500', '', null]) {
      expect((await save({ time: '09:00', timezone })).status).toBe(400);
      expect(await repo.findOne({ filter: { key: TIMING_KEY } })).toBeNull();
    }
    expect((await save({ time: '09:00' })).status).toBe(200);
    expect((await app.runtime.schedules.timing()).timezone).toBe(
      initial.timezone,
    );
    const control = (await app.scheduler.list()).find(
      (item) => item.key === controlKey,
    )!;
    expect(new Date(control.nextRunAt!).getUTCHours()).toBe(1);
    const response = await save({ time: '09:00', timezone: ' UTC ' });
    expect(response.status).toBe(200);
    const utc = (await response.json()).data;
    expect(utc.timezone).toBe('UTC');
    expect(new Date(utc.nextRunAt).getUTCHours()).toBe(9);
    expect((await save({ time: '09:00' })).status).toBe(200);
    expect((await app.runtime.schedules.timing()).timezone).toBe('UTC');
    expect(
      (await app.scheduler.list()).find((item) => item.key === controlKey),
    ).toEqual(control);
    const invalidBefore = await app.runtime.schedules.timing();
    expect((await save({ time: '10:00', timezone: '+08:00' })).status).toBe(
      400,
    );
    expect(await app.runtime.schedules.timing()).toEqual(invalidBefore);
    expect(
      (await save({ time: '09:00', timezone: 'Asia/Shanghai' })).status,
    ).toBe(200);
    const shanghai = (await app.scheduler.list()).find(
      (item) => item.key === ANALYSIS_SCHEDULE,
    )!;
    expect(new Date(shanghai.nextRunAt!).getUTCHours()).toBe(1);
    expect((await save({ time: '09:00', timezone: 'Etc/GMT+8' })).status).toBe(
      200,
    );
    expect((await save({ time: '09:00', timezone: 'UTC' })).status).toBe(200);
    const saved = await app.runtime.schedules.timing();
    const refresh = vi.spyOn(app.scheduler, 'refreshSchedule');
    refresh.mockRejectedValueOnce(new Error('synthetic refresh failure'));
    expect(
      (await save({ time: '10:00', timezone: 'America/New_York' })).status,
    ).toBe(500);
    expect(await app.runtime.schedules.timing()).toEqual(saved);
    expect(
      (await app.scheduler.list()).find(
        (item) => item.key === ANALYSIS_SCHEDULE,
      ),
    ).toMatchObject({ cron: saved.cron, timezone: saved.timezone });
    refresh.mockRestore();
    await app.session.fetch(`/scheduler/schedules/${initial.id}/disable`, {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });
    expect(
      (await (await save({ time: '09:00', timezone: 'UTC' })).json()).data
        .enabled,
    ).toBe(false);
    await server!.close();
    server = undefined;
    // Snowflake IDs count seconds and a new process restarts the sequence for the same worker. Restarting within the
    // second of the previous process's last ID could issue it again, so the restarted server starts in the next second.
    await new Promise((resolve) =>
      setTimeout(resolve, 1001 - (Date.now() % 1000)),
    );
    app = await boot();
    expect(await app.runtime.schedules.timing()).toMatchObject({
      cron: '0 9 * * *',
      timezone: 'UTC',
    });
    expect(
      (await app.scheduler.list()).find(
        (item) => item.key === ANALYSIS_SCHEDULE,
      ),
    ).toMatchObject({
      id: initial.id,
      timezone: 'UTC',
      cron: '0 9 * * *',
      enabled: false,
    });
    expect(
      (await app.scheduler.list()).find((item) => item.key === controlKey),
    ).toMatchObject({
      id: control.id,
      timezone: 'Asia/Shanghai',
      cron: control.cron,
      nextRunAt: control.nextRunAt,
      enabled: true,
    });
  } finally {
    await server?.close();
    await config.dispose();
  }
}, 120000);
