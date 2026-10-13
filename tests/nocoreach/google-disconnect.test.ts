// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { secretKey } from '../../server/nocoreach/policy';

vi.setConfig({ testTimeout: 30000, hookTimeout: 120000 });
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  if (cleanup) await cleanup();
  cleanup = undefined;
  vi.restoreAllMocks();
});
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
type TestApp = Parameters<typeof signIn>[0];
async function setup(testApp: TestApp) {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  const p = runtime.plugin;
  vi.spyOn(p.sync, 'tick').mockResolvedValue(undefined);
  const project = await p.projects.create({
    name: 'Disconnect fixture',
    domain: 'disconnect.example.test',
  });
  const id = String(project.id);
  cleanup = async () => {
    for (const projectId of [id, '999999']) {
      p.sync.freshFlights.delete(projectId);
      for (const table of ['nrSyncJobs', 'nrSyncPartitions', 'nrGoogleLinks'])
        await runtime.legacy.db
          .getRepository(table)
          .destroy({ filter: { projectId } });
      await p.variable(secretKey(projectId), null);
      for (const key of [`project:${projectId}`, `google-fresh:${projectId}`])
        await runtime.legacy.db
          .getRepository('nrSnapshots')
          .destroy({ filter: { key } });
    }
  };
  await p.projects.update(id, (value) => ({
    ...value,
    analyticsPropertyId: '123',
    searchConsoleProperty: 'sc-domain:example.test',
  }));
  await p.metadata(id, {
    ga4PropertyId: '123',
    gscSiteUrl: 'sc-domain:example.test',
    status: 'ready_for_sync',
    scheduleEnabled: true,
    nextSyncAt: '2026-01-01T00:00:00Z',
    accountEmail: 'fixture@example.test',
    authorizedAt: '2026-01-01T00:00:00Z',
  });
  await p.variable(secretKey(id), 'synthetic-refresh', true);
  vi.spyOn(p, 'token').mockResolvedValue('synthetic-access');
  vi.spyOn(p, 'googleJson').mockResolvedValue({ timeZone: 'UTC' });
  vi.spyOn(p, 'googleFetch').mockReturnValue(async () =>
    Response.json({ rows: [], rowCount: 0 }),
  );
  return { p, id, db: runtime.legacy.db, variables: runtime.variables };
}

for (const state of [
  'none',
  'ga4-only',
  'gsc-only',
  'mismatch',
  'expired',
  'connected',
  'disconnected',
  'missing-link',
]) {
  test(`disconnect is repeatable for ${state} and preserves other projects and history`, async ({
    testApp,
  }) => {
    const { p, id, db, variables } = await setup(testApp);
    if (state === 'missing-link')
      await db
        .getRepository('nrGoogleLinks')
        .destroy({ filter: { projectId: id } });
    else
      await p.metadata(id, {
        ...(state === 'none'
          ? { ga4PropertyId: '', gscSiteUrl: '', status: 'awaiting_selection' }
          : {}),
        ...(state === 'ga4-only' ? { gscSiteUrl: '' } : {}),
        ...(state === 'gsc-only' ? { ga4PropertyId: '' } : {}),
        ...(state === 'mismatch' ? { ga4PropertyId: '999' } : {}),
        ...(state === 'expired' ? { status: 'error' } : {}),
        ...(state === 'disconnected' ? { status: 'disconnected' } : {}),
      });
    if (state === 'expired') await p.variable(secretKey(id), null);
    await p.metadata('999999', {
      status: 'ready_for_sync',
      scheduleEnabled: true,
    });
    await p.variable(secretKey('999999'), 'other-refresh', true);
    const jobs = db.getRepository('nrSyncJobs');
    for (const status of [
      'queued',
      'running',
      'retrying',
      'paused',
      'succeeded',
    ])
      await jobs.create({
        values: {
          projectId: id,
          source: 'ga4',
          resource: '123',
          status,
          startDate: '2026-09-01',
          endDate: '2026-09-07',
          cursor: '2026-09-01',
        },
      });
    await jobs.create({
      values: { projectId: '999999', source: 'ga4', status: 'queued' },
    });
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    for (let n = 0; n < 2; n++) {
      const response = await admin.fetch('/nocoreach/nrGoogle/disconnect', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
        },
        body: JSON.stringify({ projectId: id }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: { disconnected: true, historyRetained: true },
      });
    }
    expect((await p.link(id))?.toJSON()).toMatchObject({
      status: 'disconnected',
      scheduleEnabled: false,
      nextSyncAt: null,
      accountEmail: '',
      authorizedAt: null,
    });
    expect(p.env(secretKey(id))).toBeFalsy();
    await variables.load();
    expect(p.env(secretKey(id))).toBeFalsy();
    expect(
      await db
        .getRepository('nrVariables')
        .findOne({ filter: { name: secretKey(id) } }),
    ).toBeNull();
    expect(
      (await jobs.find({ filter: { projectId: id } }))
        .map((r) => r.get('status'))
        .sort(),
    ).toEqual(['paused', 'paused', 'paused', 'paused', 'succeeded']);
    expect(
      (await jobs.findOne({ filter: { projectId: '999999' } }))?.get('status'),
    ).toBe('queued');
    expect(p.env(secretKey('999999'))).toBe('other-refresh');
    expect((await p.link('999999'))?.get('scheduleEnabled')).toBe(true);
    expect(p.token).not.toHaveBeenCalled();
  });
}

test('start and resume stay strict while pause and disable tolerate incomplete links', async ({
  testApp,
}) => {
  const { p, id, db } = await setup(testApp);
  await p.metadata(id, { ga4PropertyId: '', gscSiteUrl: '' });
  await p.sync.control(id, 'pause');
  await p.sync.control(id, 'disable');
  for (const command of ['enable', 'resume', 'retry'])
    await expect(p.sync.control(id, command)).rejects.toMatchObject({
      status: 409,
    });
  await expect(p.sync.enqueue(id)).rejects.toMatchObject({ status: 409 });
  await expect(p.sync.control(id, 'invalid')).rejects.toMatchObject({
    status: 400,
  });
  expect(await db.getRepository('nrSyncJobs').count()).toBe(0);
  await p.metadata(id, {
    ga4PropertyId: '123',
    gscSiteUrl: 'sc-domain:example.test',
  });
  expect(await p.sync.enqueue(id, 7, 'scheduled')).toEqual({ jobs: [] });
  expect((await p.sync.enqueue(id)).jobs).toHaveLength(2);
});

test('a rolled-back disconnect preserves credentials, metadata and runnable jobs', async ({
  testApp,
}) => {
  const { p, id, db, variables } = await setup(testApp);
  await p.sync.enqueue(id);
  const controller = new AbortController();
  p.sync.freshFlights.set(id, new Set([controller]));
  await expect(
    db.sequelize.transaction(async () => {
      await p.sync.disconnect(id);
      expect(p.env(secretKey(id))).toBe('synthetic-refresh');
      throw new Error('rollback disconnect');
    }),
  ).rejects.toThrow('rollback disconnect');
  expect(controller.signal.aborted).toBe(false);
  expect((await p.link(id))?.get('status')).toBe('ready_for_sync');
  expect(
    (await db.getRepository('nrSyncJobs').find()).map((r) => r.get('status')),
  ).toEqual(['queued', 'queued']);
  expect(p.env(secretKey(id))).toBe('synthetic-refresh');
  await variables.load();
  expect(p.env(secretKey(id))).toBe('synthetic-refresh');
  await p.sync.disconnect(id);
  expect(controller.signal.aborted).toBe(true);
});

for (const kind of ['batch', 'fresh'] as const)
  for (const failure of [false, true]) {
    test(`disconnect rejects late ${kind} ${failure ? 'failure' : 'success'} after reconnect`, async ({
      testApp,
    }) => {
      const { p, id, db } = await setup(testApp);
      if (kind === 'batch') await p.sync.enqueue(id);
      const entered = Promise.withResolvers<void>(),
        release = Promise.withResolvers<void>();
      vi.mocked(p.googleJson).mockImplementation(async () => {
        entered.resolve();
        await release.promise;
        if (failure) throw new Error('late upstream failure');
        return { timeZone: 'UTC' };
      });
      const work = kind === 'batch' ? p.sync.step() : p.sync.refreshFresh(id);
      const settled = work.then(
        () => undefined,
        () => undefined,
      );
      try {
        await Promise.race([
          entered.promise,
          work.then(() => {
            throw new Error('request did not start');
          }),
        ]);
        await p.sync.disconnect(id);
        await p.variable(secretKey(id), 'new-refresh', true);
        await p.metadata(id, { status: 'ready_for_sync' });
        if (kind === 'batch') await p.sync.control(id, 'resume');
      } finally {
        release.resolve();
        await settled;
      }
      if (kind === 'batch') {
        expect(await work).toBe(false);
        expect(
          (await db.getRepository('nrSyncJobs').find()).every(
            (r) => r.get('status') === 'queued' && r.get('recordCount') === 0,
          ),
        ).toBe(true);
      } else await expect(work).rejects.toMatchObject({ name: 'AbortError' });
      expect(await db.getRepository('nrSyncPartitions').count()).toBe(0);
      expect(
        await db
          .getRepository('nrSnapshots')
          .findOne({ filter: { key: `google-fresh:${id}` } }),
      ).toBeNull();
      expect((await p.link(id))?.get('lastSyncAt')).toBeFalsy();
      expect(p.sync.freshFlights.size).toBe(0);
    });
  }

test('disconnect denies anonymous, member and unassigned callers without changing credentials', async ({
  testApp,
  connection,
}) => {
  const { p, id } = await setup(testApp);
  const path = '/nocoreach/nrGoogle/disconnect';
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ projectId: id }),
  };
  expect(
    (
      await testApp.fetch(
        new Request(
          `http://localhost${testApp.publicBasePath}/api${path}`,
          init,
        ),
      )
    ).status,
  ).toBe(401);
  const users = testApp.application.container.resolve(
    userAdministrationServiceToken,
  );
  const actor = await connection
    .repository('user')
    .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } });
  for (const role of ['member', 'unassigned']) {
    const credentials = {
      email: `${randomUUID()}@example.test`,
      password: 'synthetic-password-123',
    };
    const user = await users.create({ ...credentials, name: role });
    if (role === 'member')
      await p.members.setRole(String(actor!.id), { userId: user.id, role });
    const client = await signIn(testApp, credentials);
    expect((await client.fetch(path, init)).status).toBe(403);
    expect(p.env(secretKey(id))).toBe('synthetic-refresh');
    expect((await p.link(id))?.get('status')).toBe('ready_for_sync');
  }
});
