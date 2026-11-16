// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { secretKey } from '../../server/nocoreach/policy';
import {
  GOOGLE_ENDPOINTS,
  GOOGLE_SCOPES,
} from '../../server/nocoreach/google-client';
import {
  TESTING_AUTHORIZATION_MS,
  lastedTestingWeek,
} from '../../server/nocoreach/google-authorization';

vi.setConfig({ testTimeout: 30000, hookTimeout: 120000 });
const DAY = 86400000;
const GOOGLE_APP = [
  'NOREACH_GOOGLE_CLIENT_ID',
  'NOREACH_GOOGLE_CLIENT_SECRET',
  'NOREACH_GOOGLE_BASE_URL',
];

describe('lastedTestingWeek', () => {
  const given = '2026-10-27T08:22:01.000Z';
  const after = (ms: number) => new Date(Date.parse(given) + ms).toISOString();
  it.each([
    // The refusal on the test Studio: the daily sync seven days and two minutes later.
    [
      'seven days and two minutes',
      after(TESTING_AUTHORIZATION_MS + 120000),
      true,
    ],
    ['just under seven days', after(TESTING_AUTHORIZATION_MS - 1800000), true],
    [
      'a day after, at the next daily sync',
      after(TESTING_AUTHORIZATION_MS + DAY),
      true,
    ],
    ['two days', after(2 * DAY), false],
    ['six days', after(6 * DAY), false],
    ['nine days', after(9 * DAY), false],
  ])('%s → %s', (_case, failedAt, expected) => {
    expect(lastedTestingWeek(given, failedAt)).toBe(expected);
  });
  it('needs both times', () => {
    expect(lastedTestingWeek(null, after(TESTING_AUTHORIZATION_MS))).toBe(
      false,
    );
    expect(lastedTestingWeek(given, null)).toBe(false);
    expect(lastedTestingWeek('not a date', given)).toBe(false);
  });
});

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
async function setup(testApp: TestApp, authorizedAt: string) {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  const p = runtime.plugin;
  vi.spyOn(p.sync, 'tick').mockResolvedValue(undefined);
  const project = await p.projects.create({
    name: 'Authorization fixture',
    domain: 'authorization.example.test',
  });
  const id = String(project.id);
  cleanup = async () => {
    for (const table of ['nrSyncJobs', 'nrGoogleLinks'])
      await runtime.legacy.db
        .getRepository(table)
        .destroy({ filter: { projectId: id } });
    await p.variable(secretKey(id), null);
    for (const name of GOOGLE_APP) await p.variable(name, null);
    await runtime.legacy.db
      .getRepository('nrSnapshots')
      .destroy({ filter: { key: `project:${id}` } });
  };
  await p.variable(
    'NOREACH_GOOGLE_CLIENT_ID',
    'fixture.apps.googleusercontent.com',
  );
  await p.variable('NOREACH_GOOGLE_CLIENT_SECRET', 'fixture-secret', true);
  await p.variable('NOREACH_GOOGLE_BASE_URL', 'http://localhost');
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
    accountEmail: 'fixture@example.test',
    authorizedAt,
  });
  await p.variable(secretKey(id), 'synthetic-refresh', true);
  const google = (answer: () => Response | Promise<Response>) =>
    vi.spyOn(p, 'googleFetch').mockReturnValue(async () => answer());
  const refused = () =>
    Response.json(
      {
        error: 'invalid_grant',
        error_description: 'Token has been expired or revoked.',
      },
      { status: 400 },
    );
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const status = async () => {
    const response = await admin.fetch('/nocoreach/nrGoogle/status', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ projectId: id }),
    });
    expect(response.status).toBe(200);
    return (await response.json()).data as {
      authorized: boolean;
      authFailedAt: string | null;
      testingWeek: boolean;
      failedAttempt: { at: string; reason: string } | null;
    };
  };
  const failedAt = async () => (await p.link(id))?.get('authFailedAt') ?? null;
  return {
    p,
    id,
    db: runtime.legacy.db,
    admin,
    google,
    refused,
    status,
    failedAt,
  };
}

test('a refusal of the saved authorization is recorded once and reported by status', async ({
  testApp,
}) => {
  const authorizedAt = new Date(
    Date.now() - TESTING_AUTHORIZATION_MS - 120000,
  ).toISOString();
  const f = await setup(testApp, authorizedAt);
  expect(await f.status()).toMatchObject({
    authorized: true,
    authFailedAt: null,
    testingWeek: false,
  });
  f.google(f.refused);
  const before = Date.now();
  await expect(f.p.token(f.id)).rejects.toMatchObject({
    code: 'invalid_grant',
  });
  const first = await f.failedAt();
  expect(Date.parse(String(first))).toBeGreaterThanOrEqual(before - 1000);
  // Later refusals (the next sync, a page reading Google) keep when it first happened.
  await new Promise((resolve) => setTimeout(resolve, 5));
  await expect(f.p.token(f.id)).rejects.toMatchObject({
    code: 'invalid_grant',
  });
  expect(await f.failedAt()).toBe(first);
  expect(await f.status()).toMatchObject({
    authorized: true,
    authFailedAt: first,
    testingWeek: true,
  });
  // Refused two days after it was given: not the seven days of Testing.
  await f.p.metadata(f.id, {
    authorizedAt: new Date(Date.parse(String(first)) - 2 * DAY).toISOString(),
  });
  expect(await f.status()).toMatchObject({
    authFailedAt: first,
    testingWeek: false,
  });
  // A new authorization clears it (google-oauth-callback.ts writes authFailedAt: null with it).
  await f.p.metadata(f.id, {
    authFailedAt: null,
    authorizedAt: new Date().toISOString(),
  });
  expect(await f.status()).toMatchObject({
    authorized: true,
    authFailedAt: null,
    testingWeek: false,
  });
});

test('other failures, and the refusal of an authorization replaced meanwhile, are not recorded', async ({
  testApp,
}) => {
  const f = await setup(testApp, new Date(Date.now() - DAY).toISOString());
  f.google(() =>
    Response.json(
      { error: { message: 'Backend error', code: 503 } },
      { status: 503 },
    ),
  );
  await expect(f.p.token(f.id)).rejects.toMatchObject({
    code: 'google_api_error',
  });
  f.google(() => {
    throw Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
  });
  await expect(f.p.token(f.id)).rejects.toMatchObject({
    code: 'network_unreachable',
  });
  // The person authorized again while this refresh, with the old authorization, was out.
  f.google(async () => {
    await f.p.variable(secretKey(f.id), 'newer-refresh', true);
    return f.refused();
  });
  await expect(f.p.token(f.id)).rejects.toMatchObject({
    code: 'invalid_grant',
  });
  expect(await f.failedAt()).toBeNull();
  expect((await f.status()).authFailedAt).toBeNull();
});

test('a disconnect clears the refusal, and status reports none without a saved authorization', async ({
  testApp,
}) => {
  const f = await setup(testApp, new Date(Date.now() - DAY).toISOString());
  f.google(f.refused);
  await expect(f.p.token(f.id)).rejects.toMatchObject({
    code: 'invalid_grant',
  });
  expect(await f.failedAt()).not.toBeNull();
  await f.p.variable(secretKey(f.id), null);
  expect(await f.status()).toMatchObject({
    authorized: false,
    authFailedAt: null,
  });
  await f.p.sync.disconnect(f.id);
  expect(await f.failedAt()).toBeNull();
});

test('retryRefused queues the jobs Google refused for the selected resources only', async ({
  testApp,
}) => {
  const f = await setup(testApp, new Date(Date.now() - 8 * DAY).toISOString());
  const jobs = f.db.getRepository('nrSyncJobs');
  const job = async (values: Record<string, unknown>) =>
    (
      await jobs.create({
        values: {
          projectId: f.id,
          status: 'failed',
          startDate: '2026-10-25',
          endDate: '2026-10-31',
          cursor: '2026-10-25',
          attempts: 1,
          recordCount: 0,
          trigger: 'scheduled',
          ...values,
        },
      })
    ).id;
  const ga4 = await job({
    source: 'ga4',
    resource: '123',
    errorCode: 'invalid_grant',
  });
  const gsc = await job({
    source: 'gsc',
    resource: 'sc-domain:example.test',
    errorCode: 'invalid_grant',
  });
  const timeout = await job({
    source: 'ga4',
    resource: '123',
    errorCode: 'network_timeout',
  });
  const earlier = await job({
    source: 'ga4',
    resource: '999',
    errorCode: 'invalid_grant',
  });
  const done = await job({
    source: 'gsc',
    resource: 'sc-domain:example.test',
    status: 'succeeded',
    errorCode: null,
  });
  expect(await f.p.sync.retryRefused(f.id)).toBe(2);
  const state = async (id: unknown) => {
    const row = await jobs.findOne({ filterByTk: id });
    return [
      row?.get('status'),
      row?.get('errorCode') ?? null,
      row?.get('attempts'),
    ];
  };
  expect(await state(ga4)).toEqual(['queued', null, 0]);
  expect(await state(gsc)).toEqual(['queued', null, 0]);
  expect(await state(timeout)).toEqual(['failed', 'network_timeout', 1]);
  expect(await state(earlier)).toEqual(['failed', 'invalid_grant', 1]);
  expect((await state(done))[0]).toBe('succeeded');
  expect(await f.p.sync.retryRefused(f.id)).toBe(0);
});

// Authorizing again through the real routes: authorize, then the callback Google's consent page redirects to, with the
// state and the browser's nonce cookie, and Google's answers in place of the network.
async function authorizeAgain(
  f: Awaited<ReturnType<typeof setup>>,
  token: () => Response | Promise<Response>,
) {
  const start = await f.admin.fetch('/nocoreach/nrGoogle/authorize', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ projectId: f.id }),
  });
  expect(start.status).toBe(200);
  const state = new URL(
    (await start.json()).data.authorizationUrl,
  ).searchParams.get('state');
  const nonce = start.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith('nr_google_oauth='))!
    .split(';')[0];
  const sent: string[] = [];
  vi.spyOn(f.p, 'googleFetch').mockReturnValue(async (url: string | URL) => {
    sent.push(String(url));
    return String(url) === GOOGLE_ENDPOINTS.token
      ? token()
      : Response.json({ email: 'fixture@example.test' });
  });
  const callback = await f.admin.fetch(
    `/nocoreach/nrGoogle/callback?${new URLSearchParams({ state: String(state), code: 'fixture-code' })}`,
    { headers: { cookie: nonce }, redirect: 'manual' },
  );
  expect(callback.status).toBe(302);
  return {
    reason: new URL(
      String(callback.headers.get('location')),
      'http://localhost',
    ).searchParams.get('reason'),
    exchanges: sent.filter((url) => url === GOOGLE_ENDPOINTS.token).length,
  };
}

test('a failed authorization attempt stays on the link, in status and Data health, until one succeeds', async ({
  testApp,
}) => {
  const f = await setup(testApp, new Date(Date.now() - 8 * DAY).toISOString());
  // Google refused the saved authorization; both syncs failed with it.
  for (const [source, resource] of [
    ['ga4', '123'],
    ['gsc', 'sc-domain:example.test'],
  ])
    await f.db.getRepository('nrSyncJobs').create({
      values: {
        projectId: f.id,
        status: 'failed',
        source,
        resource,
        startDate: '2026-10-25',
        endDate: '2026-10-31',
        cursor: '2026-10-25',
        attempts: 1,
        recordCount: 0,
        trigger: 'scheduled',
        errorCode: 'invalid_grant',
      },
    });
  const health = async () => {
    const response = await f.admin.fetch('/nocoreach/nrHealth/list', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ projectId: Number(f.id) }),
    });
    expect(response.status).toBe(200);
    const items = (await response.json()).data.items as {
      id: string;
      state: string;
      attemptText?: { key: string; params: Record<string, unknown> };
    }[];
    return items.filter((item) => item.id === 'ga4' || item.id === 'gsc');
  };
  expect((await f.status()).failedAttempt).toBeNull();
  expect((await health()).map((row) => row.attemptText)).toEqual([
    undefined,
    undefined,
  ]);

  // Google's consent page was left with the Search Console box unticked.
  const partial = await authorizeAgain(f, () =>
    Response.json({
      refresh_token: 'partial-refresh',
      access_token: 'partial-access',
      scope: 'openid email https://www.googleapis.com/auth/analytics.readonly',
    }),
  );
  expect(partial).toEqual({ reason: 'missing_permissions', exchanges: 1 });
  const first = (await f.status()).failedAttempt;
  expect(first).toEqual({
    at: expect.any(String),
    reason: 'missing_permissions',
  });
  const rows = await health();
  expect(rows.map((row) => row.state)).toEqual(['failing', 'failing']);
  for (const row of rows)
    expect(row.attemptText).toEqual({
      key: 'google.authorizationAttemptFailedAt',
      params: {
        0: { dateTime: first!.at },
        1: { key: 'google.authorizationLacksReadAccessAnalytics' },
      },
    });
  // The authorization Google refused is still the saved one.
  expect(f.p.env(secretKey(f.id))).toBe('synthetic-refresh');

  // The server's way out to Google dropped: no answer, then none again after one retry.
  const timedOut = await authorizeAgain(f, () => {
    throw new DOMException(
      'The operation was aborted due to timeout',
      'TimeoutError',
    );
  });
  expect(timedOut).toEqual({ reason: 'network_timeout', exchanges: 2 });
  const second = (await f.status()).failedAttempt;
  expect(second?.reason).toBe('network_timeout');
  expect(Date.parse(second!.at)).toBeGreaterThanOrEqual(Date.parse(first!.at));

  // It drops once more, and the retry gets through: the attempt is cleared and the refused syncs queued again.
  let dropped = false;
  const recovered = await authorizeAgain(f, () => {
    if (!dropped) {
      dropped = true;
      throw Object.assign(new TypeError('fetch failed'), {
        cause: Object.assign(new Error('read ECONNRESET'), {
          code: 'ECONNRESET',
        }),
      });
    }
    return Response.json({
      refresh_token: 'new-refresh',
      access_token: 'new-access',
      scope: GOOGLE_SCOPES.join(' '),
    });
  });
  expect(recovered).toEqual({ reason: null, exchanges: 2 });
  expect(await f.status()).toMatchObject({
    authorized: true,
    authFailedAt: null,
    failedAttempt: null,
  });
  expect(f.p.env(secretKey(f.id))).toBe('new-refresh');
  expect((await health()).map((row) => [row.state, row.attemptText])).toEqual([
    ['healthy', undefined],
    ['healthy', undefined],
  ]);
});

test('a disconnect clears a failed attempt, which a later failure records again', async ({
  testApp,
}) => {
  const f = await setup(testApp, new Date(Date.now() - DAY).toISOString());
  await f.p.authAttemptFailed(f.id, 'network_unreachable');
  expect((await f.status()).failedAttempt?.reason).toBe('network_unreachable');
  await f.p.sync.disconnect(f.id);
  expect(await f.status()).toMatchObject({
    authorized: false,
    failedAttempt: null,
  });
  await f.p.authAttemptFailed(f.id, 'authorization_denied');
  expect((await f.status()).failedAttempt?.reason).toBe('authorization_denied');
});
