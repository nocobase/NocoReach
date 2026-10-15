// @vitest-environment node
// Independent integration acceptance: real application, auth, database, business parsers and persistence.
// Only the unified runtime plugin replaces upstream I/O; all credentials below are fictional.
import { randomBytes, randomUUID } from 'node:crypto';
import { ALL_SOURCE_IDS } from './fixtures/all-source-ids';
import { promises as dns } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { createStandaloneServer } from '../../server/standalone';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { mailServiceToken } from '@nocobase/app-plugin-mail';
import {
  initializeMockDemo,
  MOCK_DEMO_KEY,
} from '../../server/nocoreach/mock-demo';
import { nocoReachToken } from '../../server/providers/nocoreach';
import type { LegacyContext } from '../../server/nocoreach/legacy/context';
import {
  fixtureCatalog,
  FIXTURE_PRODUCT,
} from '../../app-plugins/nocoreach-mock/server/fixtures';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
afterEach(() => vi.restoreAllMocks());
const test = createAppTest({
  createServer: createStandaloneServer,
  // Keep the provisioner's stale-database cleanup separate from other validation processes.
  env: {
    ...process.env,
    NOCOBASE_TEST_DB_SQLITE_DIRECTORY: path.join(
      tmpdir(),
      `nocoreach-mock-app-${randomUUID()}`,
    ),
  },
  // Never inherit the interactive validation server's database or CSRF origin.
  server: {
    env: { DB_FILENAME: undefined, APP_PUBLIC_ORIGIN: 'http://localhost' },
  },
  config: {
    app: { publicOrigin: 'http://localhost' },
    users: {
      initialAdmin: {
        ...DEFAULT_ADMIN_CREDENTIALS,
        name: 'Mock acceptance admin',
      },
    },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    nocoreachMock: {
      enabled: true,
      environment: 'test',
      initializeData: false,
    },
    // Exercise compatibility with the configuration used by existing Studio demos.
    agents: { server: { enabled: false }, vectors: { store: false } },
    nocoreach: { publicDns: '' },
  },
});
const CLOCK = new Date(
  new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z',
).toISOString();
const ROOT = '/nocoreach/';
type Client = Awaited<ReturnType<typeof signIn>>;
function request(
  client: Client,
  resource: string,
  action: string,
  values: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return client.fetch(`${ROOT}${resource}/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost',
      ...headers,
    },
    body: JSON.stringify(values),
  });
}
async function data(
  response: Promise<Response> | Response,
  status = 200,
): Promise<any> {
  const r = await response,
    value = await r.json();
  expect({
    status: r.status,
    unexpected: r.status === status ? null : value,
  }).toEqual({ status, unexpected: null });
  return (value as { data: unknown }).data;
}
function denyNetwork() {
  const rejected = () => {
    throw new Error('LIVE THIRD-PARTY I/O FORBIDDEN IN MOCK ACCEPTANCE');
  };
  const undici = createRequire(import.meta.url)('undici');
  const spies = [
    vi.spyOn(Socket.prototype, 'connect').mockImplementation(rejected),
    vi.spyOn(childProcess, 'spawn').mockImplementation(rejected),
    vi.spyOn(childProcess, 'execFile').mockImplementation(rejected),
    vi.spyOn(globalThis, 'fetch').mockImplementation(rejected),
    vi.spyOn(dns, 'lookup').mockImplementation(rejected),
    vi.spyOn(dns, 'resolve4').mockImplementation(rejected),
    vi.spyOn(dns, 'resolve6').mockImplementation(rejected),
    vi.spyOn(http, 'request').mockImplementation(rejected),
    vi.spyOn(https, 'request').mockImplementation(rejected),
    vi.spyOn(https, 'get').mockImplementation(rejected),
    vi.spyOn(undici, 'fetch').mockImplementation(rejected),
    vi.spyOn(undici, 'request').mockImplementation(rejected),
  ];
  return () => {
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  };
}
async function setup(testApp: any, target?: { name: string; domain: string }) {
  expect(testApp.application.container.has(mailServiceToken)).toBe(false);
  expect(
    JSON.stringify(testApp.application.databaseTaskContributions),
  ).toContain('@nocobase/app-plugin-mail');
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.ready;
  expect(
    testApp.application.config.get('database').connections.main.filename,
  ).toBe(testApp.config.testDatabases.connectionConfig('main').filename);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const session = (await (await admin.fetch('/auth/get-session')).json())
    .session.id;
  const project = await runtime.plugin.projects.create(
    target ?? {
      name: `Mock ${randomUUID()}`,
      domain: `mock-${randomUUID()}.example`,
    },
  );
  const id = String(project.id);
  const call = (
    resource: string,
    action: string,
    values: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ) =>
    request(
      admin,
      resource,
      action,
      resource === 'nrProxyProfiles' &&
        ['save', 'get', 'list', 'remove', 'test', 'capabilities'].includes(
          action,
        )
        ? values
        : { projectId: id, ...values },
      { 'X-NocoReach-Confirmation-Session': session, ...headers },
    );
  const mockProfile = await data(
    call('nrProxyProfiles', 'save', {
      kind: 'mock',
      name: `Mock ${id}`,
      mock: { scenario: 'normal', seed: 'acceptance', clock: CLOCK },
    }),
  );
  await data(
    call('nrProxyProfiles', 'selectAll', { profileId: mockProfile.id }),
  );
  const configure = async (
    scenario: string,
    extra: Record<string, unknown> = {},
  ) => {
    const current = await data(
      call('nrProxyProfiles', 'get', { id: mockProfile.id }),
    );
    await data(
      call('nrProxyProfiles', 'save', {
        kind: 'mock',
        id: current.id,
        name: current.name,
        revision: current.revision,
        mock: {
          ...current.mock,
          scenario,
          ...(extra.seed === undefined ? {} : { seed: extra.seed }),
          ...(extra.clock === undefined ? {} : { clock: extra.clock }),
        },
      }),
    );
    if (extra.enabled === false)
      await data(call('nrProxyProfiles', 'selectAll', { profileId: null }));
    return data(call('nrMock', 'status'));
  };
  return {
    runtime,
    plugin: runtime.plugin as any,
    admin,
    id,
    call,
    configure,
    session,
    catalog: await runtime.plugin.network.runProject(id, () =>
      fixtureCatalog(runtime.plugin.mock!.capture(id)),
    ),
  };
}

test('canonical repository status names remain failing HTTP responses through classic actions', async ({
  testApp,
}) => {
  const { runtime, call } = await setup(testApp);
  runtime.legacy.resources.define({
    name: 'nrMockHttpStatusProbe',
    actions: {
      fail: (ctx: LegacyContext): Promise<void> => {
        const values = ctx.action.params.values as Record<string, unknown>;
        ctx.throw(values.status, 'Query failed');
      },
    },
  });
  for (const [status, expected] of [
    ['INVALID_ARGUMENT', 400],
    ['FAILED_PRECONDITION', 400],
    ['UNAUTHENTICATED', 401],
    ['PERMISSION_DENIED', 403],
    ['INTERNAL', 500],
    ['UNKNOWN_STATUS', 500],
    [200, 500],
    [502, 502],
  ] as const) {
    const response = await call('nrMockHttpStatusProbe', 'fail', { status });
    expect(response.status).toBe(expected);
    expect(response.ok).toBe(false);
    const payload = await response.json();
    expect(payload.error.code).toBe(expected);
    expect(payload.data).toBeUndefined();
  }
});

test('mock admin API enforces anonymous/member/outsider roles, revision, IDs and persistent isolated settings', async ({
  testApp,
  connection,
}) => {
  const { runtime, admin, id, call, configure } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  for (const action of ['status', 'configure', 'reset']) {
    const anonymous = await testApp.fetch(
      new Request(
        `http://localhost${testApp.publicBasePath}/api${ROOT}nrMock/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: id }),
        },
      ),
    );
    expect(anonymous.status).toBe(401);
  }
  const userService = testApp.application.container.resolve(
    userAdministrationServiceToken,
  );
  const credentials = (kind: string) => ({
    email: `${kind}-${randomUUID()}@example.test`,
    password: 'fictional-test-password-123',
  });
  const mc = credentials('member'),
    oc = credentials('outsider');
  const memberUser = await userService.create({ ...mc, name: 'Mock member' });
  await userService.create({ ...oc, name: 'Mock outsider' });
  const actor = await connection
    .repository('user')
    .findOne({ filter: { email: DEFAULT_ADMIN_CREDENTIALS.email } });
  await runtime.plugin.members.setRole(String(actor!.id), {
    userId: memberUser.id,
    role: 'member',
  });
  const member = await signIn(testApp, mc),
    outsider = await signIn(testApp, oc);
  expect(
    (await request(member, 'nrMock', 'status', { projectId: id })).status,
  ).toBe(200);
  for (const action of ['configure', 'reset'])
    expect(
      (await request(member, 'nrMock', action, { projectId: id })).status,
    ).toBe(403);
  for (const action of ['status', 'configure', 'reset'])
    expect(
      (await request(outsider, 'nrMock', action, { projectId: id })).status,
    ).toBe(403);
  for (const badId of ['', '0', '-1', '../1', '99999999999999999'])
    expect((await call('nrMock', 'status', { projectId: badId })).status).toBe(
      400,
    );
  expect(
    (await call('nrMock', 'status', { projectId: '999999999' })).status,
  ).toBe(404);
  expect(
    (
      await call('nrMock', 'configure', {
        enabled: true,
        scenario: 'normal',
        seed: 'valid',
        clock: CLOCK,
        revision: 0,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call('nrProxyProfiles', 'save', {
        kind: 'mock',
        name: 'Invalid scenario',
        mock: { scenario: 'invented', seed: 'valid', clock: CLOCK },
      })
    ).status,
  ).toBe(400);
  const changed = await configure('newdata');
  expect(changed).toMatchObject({
    projectId: id,
    globalEnabled: true,
    simulated: true,
    scenario: 'newdata',
    revision: 2,
  });
  const second = await runtime.plugin.projects.create({
    name: 'Isolated project',
    domain: 'second.example',
  });
  expect(
    await data(call('nrMock', 'status', { projectId: String(second.id) })),
  ).toMatchObject({ enabled: false, revision: 0 });
  await runtime.variables.load();
  expect(await data(call('nrMock', 'status'))).toMatchObject({
    scenario: 'newdata',
    revision: 2,
  });
  expect((await request(admin, 'nrMembers', 'me')).status).toBe(200);
  verifyNetwork();
});

test('Google local OAuth consent, resource selection and frozen background sync persist real GA4/GSC partitions', async ({
  testApp,
  connection,
}) => {
  const { plugin, id, call, admin, catalog, configure } = await setup(testApp);
  await configure('normal', { clock: '2026-09-01T12:00:00.000Z' });
  const verifyNetwork = denyNetwork();
  const authorize = await call('nrGoogle', 'authorize');
  const consentCookie = authorize.headers.get('set-cookie')?.split(';')[0];
  const authorization = await data(authorize);
  expect(authorization.simulated).toBe(true);
  expect(authorization.authorizationUrl).toMatch(
    /^\/.*\/api\/nocoreach\/nrGoogle\/callback\?/,
  );
  const callbackPath = authorization.authorizationUrl.replace(
    testApp.publicBasePath + '/api',
    '',
  );
  const callback = await admin.fetch(callbackPath, {
    headers: { Cookie: consentCookie! },
  });
  expect(callback.status).toBe(302);
  expect(callback.headers.get('location')).toContain('google=authorized');
  const resources = await data(call('nrGoogle', 'resources'));
  expect(resources.analytics[0].id).toBe(catalog.ga4PropertyId);
  await data(
    call('nrGoogle', 'select', {
      ga4: 'wrong-property',
      gsc: catalog.gscSiteUrl,
    }),
    400,
  );
  await data(
    call('nrGoogle', 'select', {
      ga4: catalog.ga4PropertyId,
      gsc: catalog.gscSiteUrl,
    }),
  );
  const queued = await data(call('nrGoogle', 'syncNow', { days: 7 }));
  expect(queued.jobs).toHaveLength(2);
  expect(
    queued.jobs.every(
      (job: any) =>
        job.startDate === '2026-08-23' && job.endDate === '2026-08-29',
    ),
  ).toBe(true);
  const frozen = await connection
    .repository('nrSnapshots')
    .findMany({ filter: { key: `mock-google-run:${queued.jobs[0].id}` } });
  expect((frozen[0] as any).payload).toMatchObject({
    scenario: 'normal',
    projectId: id,
  });
  await configure('error', { clock: CLOCK });
  await plugin.sync.step();
  await plugin.sync.step();
  const result = await data(call('nrGoogle', 'syncStatus'));
  expect(result.jobs.every((job: any) => job.status === 'succeeded')).toBe(
    true,
  );
  const partitions = await connection
    .repository('nrSyncPartitions')
    .findMany({ filter: { projectId: id } });
  expect(partitions).toHaveLength(35);
  expect(partitions.every((row: any) => row.payload.length > 0)).toBe(true);
  expect(new Set(partitions.map((row: any) => row.source))).toEqual(
    new Set(['ga4', 'gsc']),
  );
  await configure('normal', { clock: '2026-09-01T12:00:00.000Z' });
  // Exercise the authenticated report routes after the real sync writes string-date partitions.
  const search = await data(call('nrDataViews', 'search', { range: '7' }));
  expect(search.connected).toBe(true);
  expect(search.totals.clicks).toBeGreaterThan(0);
  expect(search.pages.rows.length).toBeGreaterThan(0);
  const page = await data(
    call('nrDataViews', 'page', {
      range: '7',
      url: String(catalog.origin) + '/docs/getting-started',
    }),
  );
  expect(page.connected).toBe(true);
  expect(page.daily).toHaveLength(7);
  expect(
    page.daily.some((day: { clicks?: number }) => (day.clicks ?? 0) > 0),
  ).toBe(true);
  expect(
    page.daily.some((day: { views?: number }) => (day.views ?? 0) > 0),
  ).toBe(true);
  const fresh = await plugin.sync.refreshFresh(id);
  expect(fresh.ga4.map((row: any) => row.date)).toEqual([
    '2026-08-30',
    '2026-08-31',
  ]);
  expect(fresh.gsc.map((row: any) => row.date)).toEqual([
    '2026-08-30',
    '2026-08-31',
  ]);
  verifyNetwork();
});

async function configureSeo(call: Awaited<ReturnType<typeof setup>>['call']) {
  await data(
    call(
      'nrKeywords',
      'configure',
      { monthlyBudgetUsd: 10 },
      {
        'x-noreach-research-credentials': Buffer.from(
          JSON.stringify({
            login: 'fictional@nocobloom.example',
            password: 'fake-credential-never-live',
          }),
        ).toString('base64'),
      },
    ),
  );
  expect(await data(call('nrKeywords', 'check'))).toMatchObject({
    configured: true,
    verifiedAt: expect.any(String),
  });
}
const keywordQuery = {
  view: 'related',
  target: 'internal tools',
  locationCode: 2840,
  language: 'en',
  limit: 20,
};

test('DataForSEO verifies fake credentials, persists keyword/domain/Lighthouse results and retains unknown paid runs without retries', async ({
  testApp,
  connection,
}) => {
  const { call, configure, id, plugin } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  await configureSeo(call);
  const run = await data(
    call('nrKeywords', 'run', { ...keywordQuery, requestKey: randomUUID() }),
  );
  expect(run).toMatchObject({
    status: 'completed',
    costUsd: 0,
    reservedUsd: 0,
  });
  expect(run.result.items.length).toBeGreaterThan(0);
  expect(
    (
      await data(
        call('nrKeywords', 'run', {
          ...keywordQuery,
          requestKey: randomUUID(),
        }),
      )
    ).id,
  ).toBe(run.id);
  await data(
    call('nrKeywords', 'saveFromRun', {
      runId: String(run.id),
      itemIds: [run.result.items[0].id],
    }),
  );
  expect((await data(call('nrKeywords', 'saved'))).items).toHaveLength(1);
  for (const view of ['keywords', 'pages']) {
    const domain = await data(
      call('nrDomains', 'run', {
        target: FIXTURE_PRODUCT.domain,
        view,
        locationCode: 2840,
        language: 'en',
        requestKey: randomUUID(),
      }),
    );
    expect(domain).toMatchObject({ status: 'completed', costUsd: 0 });
    if (view === 'keywords') {
      expect(domain.result.summary).toMatchObject({
        traffic: expect.any(Number),
        keywords: 232,
        top3: 41,
        top10: 81,
      });
      expect(domain.result.summary.traffic).toBeGreaterThan(0);
      const persisted = await data(
        call('nrDomains', 'getRun', { runId: String(domain.id) }),
      );
      expect(persisted.result.summary).toEqual(domain.result.summary);
      const recent = await data(call('nrDomains', 'list'));
      expect(
        recent.find((item) => String(item.id) === String(domain.id)).summary,
      ).toEqual(domain.result.summary);
    }
  }
  expect(
    await data(
      call('nrLighthouse', 'run', {
        url: FIXTURE_PRODUCT.origin,
        strategy: 'mobile',
        requestKey: randomUUID(),
      }),
    ),
  ).toMatchObject({
    status: 'completed',
    result: { scores: { performance: 74 } },
  });
  for (const scenario of [
    'error',
    'login-expired',
    'rate-limit',
    'malformed',
  ]) {
    await configure(scenario);
    const query = {
      ...keywordQuery,
      target: 'internal tools ' + scenario,
      requestKey: randomUUID(),
    };
    const failed = await data(call('nrKeywords', 'run', query));
    expect(failed).toMatchObject({ status: 'unknown', reservedUsd: 0.05 });
    expect(
      (
        await data(
          call('nrKeywords', 'run', { ...query, requestKey: randomUUID() }),
        )
      ).id,
    ).toBe(failed.id);
  }
  await configure('empty');
  const empty = await data(
    call('nrKeywords', 'run', {
      ...keywordQuery,
      target: 'empty results',
      requestKey: randomUUID(),
    }),
  );
  expect(empty).toMatchObject({ status: 'completed', result: { items: [] } });
  const before = await connection
    .repository('nrKeywordRuns')
    .findMany({ filter: { projectId: id } });
  const mock = await data(call('nrMock', 'status'));
  await data(call('nrMock', 'reset', { revision: mock.revision }), 409);
  await configure('normal');
  await configure('normal');
  expect(
    await connection
      .repository('nrKeywordRuns')
      .findMany({ filter: { projectId: id } }),
  ).toEqual(before);
  expect((await data(call('nrKeywords', 'saved'))).items).toHaveLength(1);
  expect(plugin.mock.status(id).scenario).toBe('normal');
  verifyNetwork();
});

test('GitHub connects, parses repository/issues/releases/traffic/history and preserves snapshots on upstream failure', async ({
  testApp,
  connection,
}) => {
  const { call, plugin, id, configure } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  const connected = await data(
    call('nrGitHub', 'connect', {
      url: 'https://github.com/' + FIXTURE_PRODUCT.repository,
    }),
  );
  expect(connected).toMatchObject({
    connected: true,
    repo: FIXTURE_PRODUCT.repository,
  });
  expect(connected.releases.length).toBeGreaterThan(0);
  expect(connected.issues.total).toBeGreaterThan(0);
  await data(
    call(
      'nrGitHub',
      'setToken',
      {},
      {
        'x-noreach-github-token':
          'github_pat_FictionalMockOnlyNeverLive1234567890',
      },
    ),
  );
  await plugin.github.backfill(id);
  const success = await plugin.github.state(id);
  expect(success.starHistory.complete).toBe(true);
  expect(Object.keys(success.traffic.views).length).toBeGreaterThan(0);
  const view = await data(call('nrDataViews', 'github', { range: '28' }));
  const paths = view.tables.paths.items as Array<{
    path: string;
    title: string;
    count: number;
    uniques: number;
  }>;
  expect(paths).toHaveLength(4);
  expect(new Set(paths.map((item) => item.path)).size).toBe(paths.length);
  expect(
    paths.map(({ path, title, count, uniques }) => ({
      path,
      title,
      count,
      uniques,
    })),
  ).toEqual(success.traffic.paths[view.tables.paths.date]);
  // The production page uses each path as its selection key.
  for (const item of paths)
    expect(
      paths.filter((candidate) => candidate.path === item.path),
    ).toHaveLength(1);
  await configure('error');
  await data(call('nrGitHub', 'sync'));
  const failed = await plugin.github.state(id);
  expect(failed.lastSync.ok).toBe(false);
  expect(failed.releases).toEqual(success.releases);
  expect(failed.issues).toEqual(success.issues);
  const row = await connection
    .repository('nrSnapshots')
    .findOne({ filter: { key: `github:${id}` } });
  expect(JSON.stringify(row)).not.toContain('github_pat_');
  verifyNetwork();
});

test('website previews are user/project scoped; sitemap discovery and content enrichment use production parsing and storage', async ({
  testApp,
  connection,
}) => {
  const { call, plugin, id, configure } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  const preview = await data(
    call('nrSources', 'preview', {
      kind: 'website',
      url: FIXTURE_PRODUCT.origin + '/docs/reporting',
    }),
  );
  expect(preview.items[0].text).toContain('NocoBloom');
  const other = await plugin.projects.create({
    name: 'Website isolation',
    domain: 'website-isolation.example',
  });
  await data(
    call('nrSources', 'save', {
      projectId: String(other.id),
      previewId: preview.previewId,
    }),
    409,
  );
  const saved = await data(
    call('nrSources', 'save', { previewId: preview.previewId }),
  );
  expect(saved.sources).toHaveLength(1);
  const discovered = await data(
    call('nrSiteContent', 'discover', { url: FIXTURE_PRODUCT.origin }),
  );
  expect(discovered.total).toBe(8);
  await data(
    call('nrSiteContent', 'confirm', {
      previewId: discovered.previewId,
      types: ['blog', 'docs', 'page'],
    }),
  );
  await plugin.siteContent.enrich(id);
  const content = await plugin.siteContent.state(id);
  expect(content.pages).toHaveLength(8);
  expect(
    content.pages.some(
      (page: any) => page.fetchedAt && page.title.includes('NocoBloom'),
    ),
  ).toBe(true);
  await configure('error');
  await data(call('nrSources', 'refresh', { id: saved.sources[0].id }), 502);
  expect((await data(call('nrSources', 'list'))).sources[0].items).toEqual(
    saved.sources[0].items,
  );
  const rows = await connection.repository('nrSnapshots').findMany({});
  expect(
    rows.some(
      (r: any) =>
        String(r.key).includes(id) &&
        JSON.stringify(r.payload).includes('reporting'),
    ),
  ).toBe(true);
  verifyNetwork();
});

test('community connects, imports topics and reads complete real task materials from matching list/detail IDs', async ({
  testApp,
}) => {
  const { call, plugin, id } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  await data(
    call('nrCommunity', 'connect', { url: FIXTURE_PRODUCT.community }),
  );
  await plugin.community.runs.wait(id);
  const state = await plugin.community.state(id);
  expect(Object.keys(state.topics).length).toBeGreaterThan(0);
  expect(state.lastSync.ok).toBe(true);
  const material = await plugin.community.taskTopic(
    id,
    Object.keys(state.topics)[0],
  );
  expect(material.complete).toBe(true);
  expect(material.posts.length).toBeGreaterThan(0);
  expect(material.posts[0].text).toContain('NocoBloom');
  expect(await plugin.community.taskTopic(id, '1')).toMatchObject({
    complete: false,
    posts: [],
    missing: [{ code: 'forum_unavailable' }],
  });
  verifyNetwork();
});

test('npm, PyPI and Docker connectors retain registry metadata and daily download series', async ({
  testApp,
}) => {
  const { call, plugin, id } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  for (const [registry, name] of [
    ['npm', FIXTURE_PRODUCT.npm],
    ['pypi', 'nocobloom'],
    ['docker', 'nocobloom/nocobloom'],
  ]) {
    await data(call('nrPackages', 'add', { registry, name }));
    await plugin.packages.runs.wait(id);
  }
  await data(call('nrPackages', 'sync'));
  const state = await plugin.packages.state(id);
  expect(state.packages).toHaveLength(3);
  expect(state.lastSync.ok).toBe(true);
  expect(Object.keys(state.daily).length).toBeGreaterThanOrEqual(2);
  expect(Object.keys(state.samples).length).toBeGreaterThan(0);
  verifyNetwork();
});

test('Hacker News imports story/comment relationships and repeated sync is idempotent', async ({
  testApp,
}) => {
  const { call, plugin, id } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  await data(call('nrHackerNews', 'connect', { terms: ['NocoBloom'] }));
  await plugin.hackernews.runs.wait(id);
  const first = await plugin.hackernews.state(id);
  expect(Object.keys(first.mentions).length).toBeGreaterThan(0);
  expect(first.lastSync.ok).toBe(true);
  await data(call('nrHackerNews', 'sync'));
  const second = await plugin.hackernews.state(id);
  expect(Object.keys(second.mentions).sort()).toEqual(
    Object.keys(first.mentions).sort(),
  );
  verifyNetwork();
});

test('X imports posts/counts and preserves prior posts through 429 and expired-login scenarios', async ({
  testApp,
}) => {
  const { call, plugin, id, configure } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  await data(
    call('nrX', 'connect', {
      terms: ['NocoBloom'],
      token: 'FictionalMockOnlyNeverLiveToken01234567890123456789',
      cap: 5,
    }),
  );
  await plugin.xSource.runs.wait(id);
  const first = await plugin.xSource.state(id);
  expect(Object.keys(first.posts).length).toBeGreaterThan(0);
  expect(Object.keys(first.counts)).toHaveLength(7);
  for (const scenario of ['rate-limit', 'login-expired']) {
    await configure(scenario);
    const checked = await data(call('nrX', 'check'));
    expect(checked.errors.length).toBeGreaterThan(0);
    expect((await plugin.xSource.state(id)).posts).toEqual(first.posts);
  }
  verifyNetwork();
});

for (const platform of ['slack', 'discord'] as const) {
  test(`${platform} inspect/select/import traverses real chat permissions and preserves saved messages on failures`, async ({
    testApp,
    connection,
  }) => {
    const { call, plugin, id, configure } = await setup(testApp);
    const verifyNetwork = denyNetwork();
    const token =
      platform === 'slack'
        ? 'xoxb-FictionalMockOnlyNeverLive1234567890'
        : 'FictionalMockOnlyNeverLive1234567890.fake.FictionalMockOnlyNeverLive1234567890';
    const inspect = await data(call('nrChat', 'inspect', { platform, token }));
    expect(inspect.channels.length).toBeGreaterThan(0);
    await data(
      call('nrChat', 'connect', {
        platform,
        token,
        guildId: inspect.guildId,
        channels: [inspect.channels[0].id],
      }),
    );
    await plugin.chat.runs.wait(id);
    const first = await plugin.chat.state(id);
    expect(Object.keys(first.messages).length).toBeGreaterThan(0);
    expect(first.lastRuns[platform].ok).toBe(true);
    await configure('login-expired');
    const failed = await data(call('nrChat', 'sync', { platform }));
    expect(failed.errors.length).toBeGreaterThan(0);
    expect((await plugin.chat.state(id)).messages).toEqual(first.messages);
    const stored = await connection
      .repository('nrSnapshots')
      .findOne({ filter: { key: `chat:${id}` } });
    expect(JSON.stringify(stored)).not.toContain(token);
    verifyNetwork();
  });
}

test('Xiaohongshu uses the real HTTP adapter/parser, keeps old data for empty/error/expired/malformed and cancels without late writes', async ({
  testApp,
  connection,
}) => {
  const { call, plugin, id, configure } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  expect(
    await data(
      call('nrXiaohongshu', 'test', { collectorId: 'nocoreach-mock' }),
    ),
  ).toMatchObject({ toolInstalled: true });
  await data(call('nrMissingSource', 'status'), 404);
  await data(
    call('nrXiaohongshu', 'connect', {
      collectorId: 'nocoreach-mock',
      query: 'NocoBloom',
      authorized: true,
      revision: 0,
    }),
  );
  const first = await data(call('nrXiaohongshu', 'search', { revision: 1 }));
  expect(first.total).toBeGreaterThan(0);
  expect(first.lastRun.ok).toBe(true);
  const original = first.notes;
  for (const scenario of [
    'error',
    'login-expired',
    'rate-limit',
    'malformed',
  ]) {
    await configure(scenario);
    expect(
      (await call('nrXiaohongshu', 'search', { revision: 1 })).status,
    ).toBeGreaterThanOrEqual(400);
    expect((await data(call('nrXiaohongshu', 'view'))).notes).toEqual(original);
  }
  await configure('empty');
  await data(call('nrXiaohongshu', 'search', { revision: 1 }), 502);
  const empty = await data(call('nrXiaohongshu', 'view'));
  expect(empty.lastRun).toMatchObject({ ok: false });
  expect(empty.notes).toEqual(original);
  await configure('slow-cancel');
  const pending = call('nrXiaohongshu', 'search', { revision: 1 });
  await vi.waitFor(async () =>
    expect((await plugin.xiaohongshu.status(id)).running).toBeTruthy(),
  );
  const active = await plugin.xiaohongshu.status(id);
  await configure('newdata');
  await data(
    call('nrXiaohongshu', 'cancel', { requestId: 'wrong-request' }),
    409,
  );
  await data(call('nrXiaohongshu', 'cancel', { requestId: active.running }));
  expect((await pending).status).toBeGreaterThanOrEqual(400);
  expect((await data(call('nrXiaohongshu', 'view'))).notes).toEqual(original);
  const added = await data(call('nrXiaohongshu', 'search', { revision: 1 }));
  expect(added.total).toBeGreaterThan(first.total);
  const snapshot = await connection
    .repository('nrSnapshots')
    .findOne({ filter: { key: `xiaohongshu:${id}` } });
  expect(JSON.stringify(snapshot)).not.toContain('fictional-collector-token');
  verifyNetwork();
});

test('Bilibili real connect/search/video normalization persists usable videos and preserves them on malformed/expired/cancelled requests', async ({
  testApp,
}) => {
  const { call, plugin, id, configure } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  await data(call('nrBilibili', 'test', { collectorId: 'nocoreach-mock' }));
  await data(
    call('nrBilibili', 'connect', {
      collectorId: 'nocoreach-mock',
      terms: ['NocoBloom'],
      bvids: ['BV1NB411c7m1'],
      revision: null,
    }),
  );
  const first = await data(call('nrBilibili', 'sync'));
  expect(first.total).toBeGreaterThan(0);
  expect(first.lastRun.ok).toBe(true);
  const original = (await plugin.bilibili.state(id)).videos;
  for (const scenario of ['malformed', 'login-expired']) {
    await configure(scenario);
    await call('nrBilibili', 'sync');
    expect((await plugin.bilibili.state(id)).videos).toEqual(original);
  }
  await configure('slow-cancel');
  const pending = call('nrBilibili', 'sync');
  await vi.waitFor(async () =>
    expect((await plugin.bilibili.status(id)).checking).toBe(true),
  );
  const active = await plugin.bilibili.status(id);
  await configure('newdata');
  await data(call('nrBilibili', 'cancel', { requestId: active.requestId }));
  await pending;
  expect((await plugin.bilibili.state(id)).videos).toEqual(original);
  verifyNetwork();
});

test('YouTube real runner/caption normalization persists transcripts, avoids OS processes and retains old data on malformed and cancellation', async ({
  testApp,
}) => {
  const { call, plugin, id, configure } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  await data(
    call('nrYouTube', 'connect', {
      terms: ['NocoBloom'],
      videoUrls: ['https://www.youtube.com/watch?v=NocoBloom01'],
      revision: null,
      autoSync: false,
    }),
  );
  await plugin.youtube.settled(id);
  const first = await data(call('nrYouTube', 'status'));
  expect(first).toMatchObject({
    connected: true,
    syncing: false,
    analyticsAvailable: false,
  });
  expect(first.total).toBeGreaterThan(0);
  expect(JSON.stringify(first.videos)).toContain('NocoBloom');
  const original = first.videos;
  await configure('malformed');
  await data(call('nrYouTube', 'sync'));
  await plugin.youtube.settled(id);
  expect((await data(call('nrYouTube', 'status'))).videos).toEqual(original);
  await configure('slow-cancel');
  await data(call('nrYouTube', 'sync'));
  const active = await data(call('nrYouTube', 'status'));
  expect(active.syncing).toBe(true);
  await configure('newdata');
  await data(call('nrYouTube', 'cancel', { runId: 'wrong-run' }), 409);
  await data(call('nrYouTube', 'cancel', { runId: active.runId }));
  expect((await data(call('nrYouTube', 'status'))).videos).toEqual(original);
  verifyNetwork();
});

test('unsupported upstreams, disabled projects and captured cross-project contexts fail closed without live network', async ({
  testApp,
}) => {
  const { call, plugin, id, configure } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  await expect(
    plugin.network.run(id, () =>
      plugin.network.fetch(
        'github',
        'https://unmatched.nocobloom.example/no-fixture',
      ),
    ),
  ).rejects.toMatchObject({ code: 'mock_unsupported_operation' });
  await expect(
    plugin.network.run(id, () =>
      plugin.network.fetch('github', 'https://api.github.com/user'),
    ),
  ).rejects.toBeTruthy();
  await expect(
    plugin.network.fetch(
      'github',
      'https://api.github.com/repos/nocobloom/nocobloom',
    ),
  ).rejects.toBeTruthy();
  const snapshot = plugin.mock.capture(id);
  expect(Object.isFrozen(snapshot)).toBe(true);
  await configure('error');
  const frozen = await plugin.mock.runSnapshot(snapshot, () =>
    plugin.network.run(id, () =>
      plugin.network.fetch(
        'github',
        'https://api.github.com/repos/nocobloom/nocobloom',
      ),
    ),
  );
  expect(frozen.status).toBe(200);
  const other = await plugin.projects.create({
    name: 'Disabled mock project',
    domain: 'disabled-mock.example',
  });
  expect(() =>
    plugin.mock.runSnapshot(snapshot, () =>
      plugin.mock.runSnapshot(
        { ...snapshot, projectId: String(other.id) },
        () => null,
      ),
    ),
  ).toThrow('NR_MOCK_SNAPSHOT_PROJECT_MISMATCH');
  await data(
    call('nrGitHub', 'connect', {
      projectId: String(other.id),
      url: 'https://github.com/' + FIXTURE_PRODUCT.repository,
    }),
    409,
  );
  const otherProfile = await data(
    call('nrProxyProfiles', 'save', {
      kind: 'mock',
      name: `Mock ${other.id}`,
      mock: { scenario: 'normal', seed: snapshot.seed, clock: snapshot.clock },
    }),
  );
  await data(
    call('nrProxyProfiles', 'selectAll', {
      projectId: String(other.id),
      profileId: otherProfile.id,
    }),
  );
  const otherCatalog = fixtureCatalog(plugin.mock.capture(String(other.id)));
  expect(otherCatalog.ga4PropertyId).not.toBe(
    fixtureCatalog(snapshot).ga4PropertyId,
  );
  expect(plugin.mock.status(id).scenario).toBe('error');
  await configure('normal', { enabled: false });
  await data(
    call('nrGitHub', 'connect', {
      url: 'https://github.com/' + FIXTURE_PRODUCT.repository,
    }),
    409,
  );
  verifyNetwork();
});

test('DataForSEO derived Reddit, Trends, rank tracking and competitor research flow through production business services', async ({
  testApp,
}) => {
  const { call, plugin, id } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  await configureSeo(call);
  await data(call('nrReddit', 'connect', { terms: ['NocoBloom'] }));
  await plugin.reddit.runs.wait(id);
  expect(
    Object.keys((await plugin.reddit.state(id)).posts).length,
  ).toBeGreaterThan(0);
  expect((await plugin.reddit.state(id)).lastRun.ok).toBe(true);
  await data(
    call('nrTrends', 'connect', { product: 'NocoBloom', locationCode: 0 }),
  );
  await plugin.trends.runs.wait(id);
  expect((await plugin.trends.state(id)).latest.points).toHaveLength(52);
  await plugin.rankTracking.add(id, {
    keywords: [
      { keyword: 'internal tools', locationCode: 2840, language: 'en' },
    ],
  });
  const rank = await data(call('nrRankTracking', 'check'));
  expect(rank).toMatchObject({ checked: 1, errors: [] });
  expect(rank.keywords[0].history).toHaveLength(1);
  await data(
    call('nrCompetitors', 'add', {
      name: 'FlowGrove',
      site: 'https://flowgrove.example',
    }),
  );
  await plugin.competitors.checking;
  await plugin.competitorResearch.refresh(id);
  const competitor = (await plugin.competitorResearch.state(id)).domains[
    'flowgrove.example'
  ];
  expect(competitor.errors).toEqual([]);
  expect(competitor.months).toHaveLength(13);
  expect(competitor.gap.length).toBeGreaterThan(0);
  expect(competitor.pages.length).toBeGreaterThan(0);
  verifyNetwork();
});

test('DataForSEO AI brand/gap and all four model catalogs produce persisted parsed answers with zero billed cost', async ({
  testApp,
  connection,
}) => {
  const { call, id } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  await configureSeo(call);
  const brand = await data(
    call('nrAiSearch', 'brand', {
      target: 'NocoBloom',
      platform: 'chat_gpt',
      competitors: ['FlowGrove'],
      requestKey: randomUUID(),
    }),
  );
  expect(brand).toMatchObject({ status: 'completed', costUsd: 0 });
  expect(brand.result.questions.length).toBeGreaterThan(0);
  const gap = await data(
    call('nrAiSearch', 'gap', {
      target: 'NocoBloom',
      platform: 'chat_gpt',
      competitor: 'FlowGrove',
      requestKey: randomUUID(),
    }),
  );
  expect(gap).toMatchObject({ status: 'completed', costUsd: 0 });
  expect(gap.result.questions.length).toBeGreaterThan(0);
  for (const model of ['chat_gpt', 'claude', 'gemini', 'perplexity']) {
    const answer = await data(
      call('nrAiSearch', 'ask', {
        question: 'How does NocoBloom help teams build internal tools?',
        model,
        requestKey: randomUUID(),
      }),
    );
    expect(answer).toMatchObject({ status: 'completed', costUsd: 0 });
    expect(answer.result.text).toContain('NocoBloom');
  }
  const runs = await connection
    .repository('nrKeywordRuns')
    .findMany({ filter: { projectId: id } });
  expect(runs).toHaveLength(6);
  verifyNetwork();
});

test('classic import cannot clear simulated business data or overwrite the dataset marker, even for root', async ({
  testApp,
  connection,
}) => {
  const { call, id } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  const marker = await connection
    .repository('nrVariables')
    .findOne({ filter: { name: 'NOREACH_MOCK_DATASET_MARKER' } });
  const project = await connection
    .repository('nrSnapshots')
    .findOne({ filter: { key: `project:${id}` } });
  expect(marker).toBeTruthy();
  const attempts: [string, Record<string, unknown>][] = [
    ['begin', { replace: true }],
    ['rows', { table: 'nrSnapshots', rows: [] }],
    [
      'variables',
      {
        variables: [
          {
            name: 'NOREACH_MOCK_DATASET_MARKER',
            value: 'attempted-overwrite',
            secret: false,
          },
        ],
      },
    ],
    ['plan', { users: [] }],
    ['finish', {}],
  ];
  for (const [action, values] of attempts) {
    const response = await call('nrImport', action, values);
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toBe(
      'NR_MOCK_CLASSIC_IMPORT_BLOCKED',
    );
  }
  expect(
    await connection
      .repository('nrVariables')
      .findOne({ filter: { name: 'NOREACH_MOCK_DATASET_MARKER' } }),
  ).toEqual(marker);
  expect(
    await connection
      .repository('nrSnapshots')
      .findOne({ filter: { key: `project:${id}` } }),
  ).toEqual(project);
  verifyNetwork();
});

test('persistent demo initializes every connector and task discussions, then preserves edits on repeat', async ({
  testApp,
  connection,
}) => {
  const { plugin, id: untouched } = await setup(testApp);
  // This test drives indexing explicitly; a wall-clock cron tick can consume the first batch.
  vi.spyOn(plugin.searchIndex, 'tick').mockResolvedValue(undefined);
  const verifyNetwork = denyNetwork();
  // A failed task batch rolls back tasks, numbering and artifacts; completed connector phases survive.
  const originalPut = plugin.taskExecution.put.bind(plugin.taskExecution);
  const failedWrite = vi
    .spyOn(plugin.taskExecution, 'put')
    .mockImplementation(async (key, payload, tx) => {
      if (String(key).startsWith('nr-task-artifact:'))
        throw new Error('demo interrupted');
      return originalPut(key, payload, tx);
    });
  await expect(initializeMockDemo(plugin)).rejects.toThrow('demo interrupted');
  expect(await connection.repository('nrTasks').count({})).toBe(0);
  const interrupted = (
    await connection.repository('nrSnapshots').findMany({})
  ).find((row) => row.key === MOCK_DEMO_KEY)?.payload as {
    completed: string[];
  };
  expect(interrupted.completed).toContain('google');
  expect(interrupted.completed).not.toContain('tasks');
  failedWrite.mockRestore();
  await initializeMockDemo(plugin);
  const progress = (
    await connection.repository('nrSnapshots').findMany({})
  ).find((row) => row.key === MOCK_DEMO_KEY)?.payload as {
    projectId: string;
    completed: string[];
  };
  expect(progress.completed).toContain('complete');
  const id = progress.projectId;
  expect(id).not.toBe(untouched);
  expect(await plugin.taskExecution.tasks(untouched)).toHaveLength(0);
  const tasks = await plugin.taskExecution.tasks(id);
  expect(tasks).toHaveLength(36);
  expect(new Set(tasks.map((task) => task.evidence.work.boardState)).size).toBe(
    4,
  );
  expect(
    tasks.reduce(
      (sum, task) =>
        sum +
        task.evidence.work.history.filter((entry) => entry.action === 'comment')
          .length,
      0,
    ),
  ).toBe(108);
  expect(
    (await plugin.taskExecution.view(id, String(tasks[0].id))).work
      .schemaVersion,
  ).toBe(2);
  expect(
    (await plugin.sync.status(id)).coverage.every(
      (item) => item.availableThrough,
    ),
  ).toBe(true);
  expect((await plugin.siteContent.summary(id)).enriched).toBeGreaterThan(5);
  expect((await plugin.github.status(id)).issues.total).toBeGreaterThan(0);
  expect(
    Object.keys((await plugin.community.state(id)).topics).length,
  ).toBeGreaterThan(0);
  expect((await plugin.packages.state(id)).packages).toHaveLength(3);
  expect(
    Object.keys((await plugin.hackernews.state(id)).mentions).length,
  ).toBeGreaterThan(0);
  expect(
    Object.keys((await plugin.xSource.state(id)).posts).length,
  ).toBeGreaterThan(0);
  expect(
    Object.keys((await plugin.chat.state(id)).messages).length,
  ).toBeGreaterThan(0);
  expect((await plugin.youtube.status(id)).total).toBeGreaterThan(0);
  expect((await plugin.bilibili.status(id)).total).toBeGreaterThan(0);
  expect((await plugin.xiaohongshu.state(id)).notes.length).toBeGreaterThan(0);
  expect((await plugin.keywordService.saved(id)).items.length).toBeGreaterThan(
    0,
  );
  expect((await plugin.rankTracking.status(id)).keywords).toHaveLength(5);
  expect(
    Object.keys((await plugin.reddit.state(id)).posts).length,
  ).toBeGreaterThan(0);
  expect((await plugin.trends.state(id)).latest.points).toHaveLength(52);
  expect(
    (await plugin.competitorResearch.state(id)).domains['flowgrove.example']
      .pages.length,
  ).toBeGreaterThan(0);
  expect((await plugin.analysis.state(id)).runs[0].ok).toBe(true);
  expect((await plugin.knowledge.list(id)).items).toHaveLength(6);
  // Indexing and sitemaps read simulated Search Console through the project's connection.
  expect(await plugin.searchIndex.run(id)).toBe(8);
  expect(await plugin.searchIndex.run(id)).toBe(0);
  const indexing = await plugin.searchIndex.view(id);
  expect(new Set(indexing.pages.map((page) => page.status))).toEqual(
    new Set(['indexed', 'notIndexed']),
  );
  const sitemaps = await plugin.searchIndex.sitemaps(id);
  expect(sitemaps.sitemaps).toHaveLength(2);
  expect(
    sitemaps.unsubmitted.some((entry) =>
      entry.path.endsWith('/sitemap-docs.xml'),
    ),
  ).toBe(true);
  const topics = Object.keys((await plugin.community.state(id)).topics);
  expect(topics.length).toBeGreaterThan(100);
  const topic = await plugin.community.taskTopic(id, topics.at(-1));
  expect(topic.posts.length).toBeGreaterThan(0);
  const review = tasks.find(
    (task) => task.evidence.work.boardState === 'review',
  );
  const detail = await plugin.taskExecution.view(id, String(review.id));
  expect(detail.work.flow.stages[detail.work.stageIndex].kind).toBe('review');
  expect(detail.artifacts).toHaveLength(1);
  expect(detail.runs).toHaveLength(0);
  await plugin.db.getRepository('nrTasks').update({
    filterByTk: tasks[0].id,
    values: { title: '用户修改，不能覆盖' },
  });
  const before = await connection.repository('nrSnapshots').count({});
  await initializeMockDemo(plugin);
  expect(await connection.repository('nrSnapshots').count({})).toBe(before);
  expect(await plugin.taskExecution.tasks(id)).toHaveLength(36);
  expect((await plugin.taskExecution.task(id, String(tasks[0].id))).title).toBe(
    '用户修改，不能覆盖',
  );
  verifyNetwork();
});

test('demo publishes its environment and allows Agent configuration through native authorization', async ({
  testApp,
}) => {
  expect(testApp.application.config.publicValues()).toMatchObject({
    nocoreachMock: { enabled: true, environment: 'test' },
  });
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  // The legacy false override must not leave Online runs queued indefinitely.
  const agents = testApp.application.container.resolve(agentsToken);
  const claims = vi.spyOn(agents.claims, 'claimServer');
  await expect
    .poll(() => claims.mock.calls.length, { timeout: 10000 })
    .toBeGreaterThan(0);
  const payload = {
    name: 'Demo research agent',
    type: 'online',
    access: 'everyone',
    modelEntries: [],
  };
  const send = (client: { fetch: typeof admin.fetch }) =>
    client.fetch('/agents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify(payload),
    });
  const anonymous = await send({
    fetch: (url, init) =>
      testApp.fetch(
        new Request(
          `http://localhost${testApp.publicBasePath}/api${url}`,
          init,
        ),
      ),
  });
  expect(anonymous.status).toBe(401);
  const response = await send(admin);
  expect(response.status).toBeLessThan(300);
  const body = await response.json();
  expect(body.data).toMatchObject({ name: payload.name, type: 'online' });
});

test('a newly created Supabase project collects its own website, repository and Google data without live upstream I/O', async ({
  testApp,
}) => {
  const { plugin, admin } = await setup(testApp);
  const verifyNetwork = denyNetwork();
  const project = await data(
    request(admin, 'nrProjects', 'create', {
      name: 'Supabase validation',
      domain: 'supabase.com',
    }),
  );
  const id = String(project.id);
  const call = (
    resource: string,
    action: string,
    values: Record<string, unknown> = {},
  ) => request(admin, resource, action, { projectId: id, ...values });
  const profile = await data(
    request(admin, 'nrProxyProfiles', 'save', {
      name: `New site ${id}`,
      kind: 'mock',
      mock: { scenario: 'normal', seed: 'new-site', clock: CLOCK },
    }),
  );
  await data(call('nrProxyProfiles', 'selectAll', { profileId: profile.id }));
  const discovered = await data(
    call('nrSiteContent', 'discover', { url: 'https://supabase.com' }),
  );
  expect(discovered.total).toBe(8);
  expect(discovered.origin).toBe('https://supabase.com');
  await data(
    call('nrSiteContent', 'confirm', {
      previewId: discovered.previewId,
      types: ['blog', 'docs', 'page'],
    }),
  );
  await plugin.siteContent.enrich(id);
  await plugin.siteContent.enrich(id);
  const content = await data(call('nrSiteContent', 'list'));
  expect(content.pages).toHaveLength(8);
  expect(
    content.pages.every(
      (page: {
        url: string;
        fetchedAt: string;
        fetchError?: string;
        title: string;
      }) =>
        page.url.startsWith('https://supabase.com/') &&
        page.fetchedAt &&
        !page.fetchError &&
        page.title,
    ),
  ).toBe(true);
  const repo = await data(
    call('nrGitHub', 'connect', {
      url: 'https://github.com/supabase/supabase',
    }),
  );
  expect(repo).toMatchObject({ connected: true, repo: 'supabase/supabase' });
  expect(repo.issues.total).toBeGreaterThan(0);
  const authorize = await call('nrGoogle', 'authorize');
  const cookie = authorize.headers.get('set-cookie')?.split(';')[0];
  const authorization = await data(authorize);
  const callback = await admin.fetch(
    authorization.authorizationUrl.replace(testApp.publicBasePath + '/api', ''),
    { headers: { Cookie: cookie! } },
  );
  expect(callback.status).toBe(302);
  expect(callback.headers.get('location')).toContain('google=authorized');
  const resources = await data(call('nrGoogle', 'resources'));
  expect(resources.analytics[0].name).toBe('Supabase validation website');
  expect(
    resources.searchConsole.map((site: { id: string }) => site.id),
  ).toEqual(['sc-domain:supabase.com', 'https://supabase.com/']);
  await data(
    call('nrGoogle', 'select', {
      ga4: resources.analytics[0].id,
      gsc: 'sc-domain:supabase.com',
    }),
  );
  const queued = await data(call('nrGoogle', 'syncNow', { days: 7 }));
  expect(queued.jobs).toHaveLength(2);
  await plugin.sync.step();
  await plugin.sync.step();
  const status = await data(call('nrGoogle', 'syncStatus'));
  expect(
    status.jobs.every((job: { status: string }) => job.status === 'succeeded'),
  ).toBe(true);
  const search = await data(call('nrDataViews', 'search', { range: '7' }));
  expect(search.totals.clicks).toBeGreaterThan(0);
  expect(search.pages.rows.length).toBeGreaterThan(0);
  expect(JSON.stringify(search.pages.rows)).toContain('supabase.com');
  await data(
    call('nrSiteContent', 'discover', { url: 'https://unrelated.example' }),
    501,
  );
  await data(
    call('nrProxyProfiles', 'select', { connection: 'site', profileId: null }),
  );
  await data(
    call('nrSiteContent', 'discover', { url: 'https://supabase.com' }),
    409,
  );
  expect((await data(call('nrSiteContent', 'list'))).pages).toHaveLength(8);
  verifyNetwork();
});

test('fixture preparation accepts existing project creation domain grammar', async ({
  testApp,
}) => {
  const { admin } = await setup(testApp);
  const created = await data(
    request(admin, 'nrProjects', 'create', {
      name: 'Existing domain',
      domain: 'foo..bar.com',
    }),
  );
  const result = await data(
    request(admin, 'nrSiteContent', 'list', { projectId: String(created.id) }),
  );
  expect(result.pages).toEqual([]);
});

for (const target of [
  {
    name: 'Supabase',
    domain: 'supabase-coverage.example',
    slug: 'supabase',
    npm: '@supabase/supabase-js',
  },
  {
    name: 'Atlas QA',
    domain: 'atlas-qa.example',
    slug: 'atlasqa',
    npm: '@atlasqa/sdk',
  },
]) {
  test(`all 21 catalog connections collect usable synthetic data for ${target.domain} with zero provider egress`, async ({
    testApp,
  }) => {
    const { call, plugin, id, configure, admin } = await setup(testApp, target);
    const verifyNetwork = denyNetwork();
    const covered = new Set<string>();
    const origin = `https://${target.domain}`;
    const repository = `${target.slug}/${target.slug}`;

    const discovery = await data(
      call('nrSiteContent', 'discover', { url: origin }),
    );
    await data(
      call('nrSiteContent', 'confirm', {
        previewId: discovery.previewId,
        types: ['blog', 'docs', 'page'],
      }),
    );
    await plugin.siteContent.enrich(id);
    await plugin.siteContent.enrich(id);
    const site = await data(call('nrSiteContent', 'list'));
    expect(site.pages).toHaveLength(8);
    expect(
      site.pages.every(
        (row: { fetchedAt: string; fetchError: string; url: string }) =>
          row.fetchedAt && !row.fetchError && row.url.startsWith(origin),
      ),
    ).toBe(true);
    covered.add('site');

    await data(
      call('nrGitHub', 'connect', { url: `https://github.com/${repository}` }),
    );
    await data(
      call(
        'nrGitHub',
        'setToken',
        {},
        {
          'x-noreach-github-token':
            'github_pat_FictionalMockOnlyNeverLive1234567890',
        },
      ),
    );
    await plugin.github.backfill(id);
    await data(call('nrGitHub', 'sync'));
    const gh = await plugin.github.state(id);
    expect(gh.repo).toBe(repository);
    expect(gh.lastSync.ok).toBe(true);
    expect(gh.starHistory.complete).toBe(true);
    expect(Object.keys(gh.traffic.views).length).toBeGreaterThan(0);
    expect(gh.discussions.enabled).toBe(true);
    expect(gh.discussions.top.length).toBeGreaterThan(0);
    const githubView = await data(
      call('nrDataViews', 'github', { range: '7' }),
    );
    expect(githubView.history).toMatchObject({
      state: 'complete',
      error: null,
    });
    expect(githubView.tables.issues.length).toBeGreaterThan(0);
    expect(githubView.tables.pulls.length).toBeGreaterThan(0);
    expect(githubView.figures.starsAdded).toBeGreaterThan(0);
    expect(githubView.figures.views).toBeGreaterThan(0);
    expect(githubView.totals.contributors).toBeGreaterThan(0);
    // Main's new GitHub hot view must use the same project Profile and raw transport.
    // Only skip wall-clock vendor pacing; requests, parsers and persistence stay real.
    vi.spyOn(plugin.githubTrends, 'sleep').mockResolvedValue(undefined);
    await plugin.githubTrends.refresh(id);
    const hot = await data(call('nrGitHubTrends', 'view'));
    expect(hot.lastRun).toMatchObject({
      ok: true,
      day: CLOCK.slice(0, 10),
      errors: [],
    });
    expect(hot.topics.length).toBeGreaterThan(0);
    expect(hot.newHot.all.length).toBeGreaterThan(0);
    expect(hot.trending.daily.length).toBeGreaterThan(0);
    ['github', 'github-traffic', 'github-discussions'].forEach((source) =>
      covered.add(source),
    );

    // Source-code configuration is a local record, not a provider feed or a real Runner invocation.
    const agent = await data(call('nrAgent', 'status'));
    await data(
      call('nrAgent', 'saveRepo', {
        revision: agent.revision,
        repo: repository,
        baseBranch: 'main',
        allowedPaths: ['docs'],
        contentCheck: true,
      }),
    );
    expect((await data(call('nrAgent', 'status'))).repo.repo).toBe(repository);
    covered.add('repo');

    await configure('normal', {
      clock: new Date(Date.parse(CLOCK) - 86400000).toISOString(),
    });
    for (const [registry, name] of [
      ['npm', target.npm],
      ['pypi', target.slug],
      ['docker', `${target.slug}/postgres`],
    ]) {
      await data(call('nrPackages', 'add', { registry, name }));
      await plugin.packages.runs.wait(id);
    }
    // Two real collection observations establish a Docker delta; never seed normalized samples.
    await configure('newdata', { clock: CLOCK });
    await data(call('nrPackages', 'sync'));
    const packages = await plugin.packages.state(id);
    expect(packages.lastSync.ok).toBe(true);
    expect(
      Object.keys(packages.daily[`npm:${target.npm}`]).length,
    ).toBeGreaterThan(100);
    expect(Object.keys(packages.daily[`pypi:${target.slug}`])).toHaveLength(
      181,
    );
    const pulls = Object.values(
      packages.samples[`docker:${target.slug}/postgres`],
    ) as number[];
    expect(pulls).toHaveLength(2);
    expect(pulls[1]).toBeGreaterThan(pulls[0]);
    covered.add('packages');
    await configure('normal');

    await data(
      call('nrCommunity', 'connect', { url: `https://forum.${target.domain}` }),
    );
    await plugin.community.runs.wait(id);
    const community = await plugin.community.state(id);
    expect(community.lastSync.ok).toBe(true);
    expect(Object.keys(community.topics).length).toBeGreaterThan(0);
    const material = await plugin.community.taskTopic(
      id,
      Object.keys(community.topics)[0],
    );
    expect(material.complete).toBe(true);
    expect(JSON.stringify(material.posts)).toContain(target.name);
    expect(JSON.stringify(material.posts)).not.toContain('NocoBloom');
    covered.add('discourse');

    await data(
      call('nrHackerNews', 'connect', { terms: [target.name, target.domain] }),
    );
    await plugin.hackernews.runs.wait(id);
    const hn = await plugin.hackernews.state(id);
    expect(hn.lastSync.ok).toBe(true);
    expect(Object.keys(hn.mentions).length).toBeGreaterThan(0);
    expect(JSON.stringify(hn.mentions)).toContain(target.domain);
    covered.add('mentions');

    await data(
      call('nrX', 'connect', {
        terms: [target.name],
        token: 'FictionalMockOnlyNeverLiveToken01234567890123456789',
        cap: 5,
      }),
    );
    await plugin.xSource.runs.wait(id);
    const x = await plugin.xSource.state(id);
    expect(Object.keys(x.posts).length).toBeGreaterThan(0);
    expect(JSON.stringify(x.posts)).toContain(target.name);
    covered.add('social');

    for (const platform of ['slack', 'discord']) {
      const token =
        platform === 'slack'
          ? 'xoxb-FictionalMockOnlyNeverLive1234567890'
          : 'FictionalMockOnlyNeverLive1234567890.fake.FictionalMockOnlyNeverLive1234567890';
      const inspected = await data(
        call('nrChat', 'inspect', { platform, token }),
      );
      expect(inspected.channels.length).toBeGreaterThan(0);
      await data(
        call('nrChat', 'connect', {
          platform,
          token,
          guildId: inspected.guildId,
          channels: inspected.channels.map(
            (channel: { id: string }) => channel.id,
          ),
        }),
      );
      await plugin.chat.runs.wait(id);
      const chat = await plugin.chat.state(id);
      expect(chat.lastRuns[platform].ok).toBe(true);
      expect(JSON.stringify(chat.messages)).toContain(target.name);
      covered.add(platform);
    }

    await configureSeo(call);
    const keyword = await data(
      call('nrKeywords', 'run', {
        ...keywordQuery,
        target: `${target.name} database`,
        requestKey: randomUUID(),
      }),
    );
    expect(keyword.status).toBe('completed');
    expect(keyword.result.items.length).toBeGreaterThan(0);
    await data(
      call('nrKeywords', 'saveFromRun', {
        runId: String(keyword.id),
        itemIds: [keyword.result.items[0].id],
      }),
    );
    const domain = await data(
      call('nrDomains', 'run', {
        target: target.domain,
        view: 'pages',
        locationCode: 2840,
        language: 'en',
        requestKey: randomUUID(),
      }),
    );
    expect(domain.status).toBe('completed');
    expect(JSON.stringify(domain.result)).toContain(target.domain);
    await plugin.rankTracking.add(id, {
      keywords: [
        {
          keyword: `${target.name} database`,
          locationCode: 2840,
          language: 'en',
        },
      ],
    });
    const rank = await data(call('nrRankTracking', 'check'));
    expect(rank).toMatchObject({ checked: 1, errors: [] });
    expect(rank.keywords[0].history[0].position).not.toBeNull();
    const lighthouse = await data(
      call('nrLighthouse', 'run', {
        url: origin,
        strategy: 'mobile',
        requestKey: randomUUID(),
      }),
    );
    expect(lighthouse).toMatchObject({
      status: 'completed',
      result: { scores: { performance: 74 } },
    });
    covered.add('keywords');

    await data(
      call('nrTrends', 'connect', { product: target.name, locationCode: 0 }),
    );
    await plugin.trends.runs.wait(id);
    expect((await plugin.trends.state(id)).latest.points).toHaveLength(52);
    covered.add('trends');
    await data(call('nrReddit', 'connect', { terms: [target.name] }));
    await plugin.reddit.runs.wait(id);
    const reddit = await plugin.reddit.state(id);
    expect(reddit.lastRun.ok).toBe(true);
    expect(Object.keys(reddit.posts).length).toBeGreaterThan(0);
    expect(JSON.stringify(reddit.posts)).toContain(target.name);
    covered.add('reddit');

    await data(
      call('nrCompetitors', 'add', {
        name: 'Rival QA',
        site: `https://rival-${target.slug}.example`,
        repo: `rival-${target.slug}/server`,
      }),
    );
    await plugin.competitors.checking;
    const competitors = await plugin.competitors.state(id);
    expect(competitors.lastRun).toMatchObject({ ok: true, errors: [] });
    expect(Object.values(competitors.track)).toEqual([
      expect.objectContaining({ pages: 8, siteError: null, repoError: null }),
    ]);
    await plugin.competitorResearch.refresh(id);
    const competitor = (await plugin.competitorResearch.state(id)).domains[
      `rival-${target.slug}.example`
    ];
    expect(competitor.errors).toEqual([]);
    expect(competitor.months).toHaveLength(13);
    covered.add('competitors');

    const brand = await data(
      call('nrAiSearch', 'brand', {
        target: target.name,
        platform: 'chat_gpt',
        competitors: ['Rival QA'],
        requestKey: randomUUID(),
      }),
    );
    expect(brand).toMatchObject({ status: 'completed', costUsd: 0 });
    expect(brand.result.questions.length).toBeGreaterThan(0);
    const gap = await data(
      call('nrAiSearch', 'gap', {
        target: target.name,
        competitor: 'Rival QA',
        platform: 'chat_gpt',
        requestKey: randomUUID(),
      }),
    );
    expect(gap.result.questions.length).toBeGreaterThan(0);
    for (const model of ['chat_gpt', 'claude', 'gemini', 'perplexity']) {
      const answer = await data(
        call('nrAiSearch', 'ask', {
          question: `How does ${target.name} help teams?`,
          model,
          requestKey: randomUUID(),
        }),
      );
      expect(answer).toMatchObject({ status: 'completed', costUsd: 0 });
      expect(answer.result.text).toContain(target.name);
      expect(answer.result.ownCited).toBeGreaterThan(0);
      expect(answer.result.text).not.toContain('NocoBloom');
    }
    covered.add('ai-visibility');

    await data(
      call('nrXiaohongshu', 'connect', {
        collectorId: 'nocoreach-mock',
        query: target.name,
        authorized: true,
        revision: 0,
      }),
    );
    const notes = await data(call('nrXiaohongshu', 'search', { revision: 1 }));
    expect(notes.lastRun.ok).toBe(true);
    expect(notes.total).toBeGreaterThan(0);
    expect(JSON.stringify(notes.notes)).toContain(target.name);
    covered.add('xiaohongshu');
    await data(
      call('nrBilibili', 'connect', {
        collectorId: 'nocoreach-mock',
        terms: [target.name],
        bvids: ['BV1xx411c7mD'],
        revision: null,
      }),
    );
    const bilibili = await data(call('nrBilibili', 'sync'));
    expect(bilibili.lastRun.ok).toBe(true);
    expect(bilibili.total).toBeGreaterThan(0);
    expect(JSON.stringify((await plugin.bilibili.state(id)).videos)).toContain(
      target.name,
    );
    covered.add('bilibili');
    await data(
      call('nrYouTube', 'connect', {
        terms: [target.name],
        videoUrls: ['https://www.youtube.com/watch?v=Supabase001'],
        revision: null,
        autoSync: false,
      }),
    );
    await plugin.youtube.settled(id);
    const youtube = await data(call('nrYouTube', 'status'));
    expect(youtube.total).toBeGreaterThan(0);
    expect(JSON.stringify(youtube.videos)).toContain(target.name);
    expect(JSON.stringify(youtube.videos)).not.toContain('NocoBloom');
    covered.add('youtube');

    const authorized = await call('nrGoogle', 'authorize');
    const cookie = authorized.headers.get('set-cookie')?.split(';')[0];
    const authorization = await data(authorized);
    const callback = await admin.fetch(
      authorization.authorizationUrl.replace(
        testApp.publicBasePath + '/api',
        '',
      ),
      { headers: { Cookie: cookie! } },
    );
    expect(callback.status).toBe(302);
    const resources = await data(call('nrGoogle', 'resources'));
    expect(resources.analytics[0].name).toBe(`${target.name} website`);
    await data(
      call('nrGoogle', 'select', {
        ga4: resources.analytics[0].id,
        gsc: `sc-domain:${target.domain}`,
      }),
    );
    await data(call('nrGoogle', 'syncNow', { days: 28 }));
    for (let i = 0; i < 8; i++) await plugin.sync.step(id);
    const google = await data(call('nrGoogle', 'syncStatus'));
    expect(
      google.jobs.every(
        (job: { status: string }) => job.status === 'succeeded',
      ),
    ).toBe(true);
    const web = await data(call('nrDataViews', 'website', { range: '7' }));
    expect(JSON.stringify(web)).toContain('views');
    const search = await data(call('nrDataViews', 'search', { range: '7' }));
    expect(search.totals.clicks).toBeGreaterThan(0);
    covered.add('ga4');
    covered.add('gsc');

    expect([...covered].sort()).toEqual([...ALL_SOURCE_IDS].sort());
    verifyNetwork();
  });
}
