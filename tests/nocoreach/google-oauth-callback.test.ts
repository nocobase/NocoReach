// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { googleOAuthCallback } from '../../server/nocoreach/google-oauth-callback';
import {
  GOOGLE_ENDPOINTS,
  GOOGLE_SCOPES,
  stateCacheKey,
} from '../../server/nocoreach/google-client';
import {
  LegacyCache,
  legacyContext,
} from '../../server/nocoreach/legacy/context';
import { LegacyUsers } from '../../server/nocoreach/legacy/users';
import { CALLBACK_PATH } from '../../server/nocoreach/policy';

afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const identity = {
    exists: true,
    disabledAt: null as string | null,
    root: false,
    role: 'admin' as string | null,
  };
  // Use the real account adapter and policy, with isolated in-memory table responses.
  const users = new LegacyUsers({
    table: (name) =>
      name === 'user'
        ? {
            findOne: async () =>
              identity.exists
                ? { id: 'initiator', kind: 'person', disabledAt: identity.disabledAt }
                : null,
          }
        : {
            findMany: async () =>
              identity.root ? [{ subjectId: 'initiator', permissionSetKey: 'root' }] : identity.role ? [{ subjectId: 'initiator', permissionSetKey: `nr.${identity.role}` }] : [],
          },
  });
  const db = {
    getRepository: (name: string) =>
      name === 'users'
        ? users
        : {
            findOne: async () => ({
              payload: { users: { initiator: identity.role } },
            }),
          },
  };
  const cache = new LegacyCache();
  const nonce = 'fictional-browser-nonce';
  const key = stateCacheKey('fictional-state');
  await cache.set(
    key,
    {
      id: '123',
      userId: 'initiator',
      nonceHash: createHash('sha256').update(nonce).digest('hex'),
    },
    600000,
  );
  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
  const host = {
    db,
    project: vi.fn(async () => undefined),
    network: {
      run: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
    },
    config: () => ({
      clientId: 'fictional-client',
      clientSecret: 'fictional-secret',
      redirectUri: 'https://app.example/callback',
    }),
    googleJson: vi.fn(async (_id: string, url: string) =>
      url === GOOGLE_ENDPOINTS.token
        ? {
            refresh_token: 'fictional-refresh',
            access_token: 'fictional-access',
            scope: GOOGLE_SCOPES.join(' '),
          }
        : { email: 'test@example.com' },
    ),
    variable: vi.fn(async () => undefined),
    metadata: vi.fn(async () => undefined),
    authAttemptFailed: vi.fn(async () => undefined),
    RETURN: '/main/connections',
  };
  const context = (
    user: string | null = 'initiator',
    cookie: string | undefined = nonce,
    query = { state: 'fictional-state', code: 'fictional-code' },
  ) =>
    legacyContext({
      resource: 'nrGoogle',
      action: 'callback',
      method: 'GET',
      query,
      body: undefined,
      header: () => undefined,
      cookie: () => cookie,
      user: user ? { id: user } : null,
      // Stale request roles must not grant access after revocation.
      roles: ['root'],
      app: { db } as never,
      cache,
      logger,
    });
  const run = async (ctx = context()) => {
    await googleOAuthCallback(host as never, ctx, async () => {});
    return ctx;
  };
  const denied = async (
    ctx: ReturnType<typeof context>,
    reason = 'initiator_access_denied',
  ) => {
    expect(ctx.redirectTo).toBe(
      `/main/connections?google=error&reason=${reason}`,
    );
    expect(host.variable).not.toHaveBeenCalled();
    expect(host.metadata).not.toHaveBeenCalled();
    expect(await cache.get(key)).toBeUndefined();
    expect(ctx.cookiesOut).toContainEqual({
      name: 'nr_google_oauth',
      value: null,
      options: { path: CALLBACK_PATH(), signed: false },
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(
      /fictional-(refresh|access|secret|code)/,
    );
  };
  return { identity, cache, key, host, context, run, denied, logger };
}

it.each(['member', 'removed', 'disabled', 'deleted', 'root-revoked'])(
  'rejects an initiator who became %s before exchange',
  async (change) => {
    const f = await fixture();
    if (change === 'member') f.identity.role = 'member';
    if (change === 'removed' || change === 'root-revoked')
      f.identity.role = null;
    if (change === 'disabled') f.identity.disabledAt = new Date().toISOString();
    if (change === 'deleted') f.identity.exists = false;
    await f.denied(await f.run());
    expect(f.host.googleJson).not.toHaveBeenCalled();
  },
);

it.each([null, 'other-admin'])(
  'rejects a missing or switched current account: %s',
  async (user) => {
    const f = await fixture();
    await f.denied(await f.run(f.context(user)));
    expect(f.host.googleJson).not.toHaveBeenCalled();
  },
);

it.each(['admin', 'root'])(
  'allows a current enabled %s and writes only the saved project',
  async (role) => {
    const f = await fixture();
    if (role === 'root') {
      f.identity.role = null;
      f.identity.root = true;
    }
    const ctx = await f.run();
    expect(ctx.redirectTo).toBe('/main/connections?google=authorized');
    expect(f.host.variable).toHaveBeenCalledWith(
      'NOREACH_GOOGLE_REFRESH_123',
      'fictional-refresh',
      true,
    );
    expect(f.host.metadata).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({
        status: 'awaiting_selection',
        accountEmail: 'test@example.com',
      }),
    );
    expect(f.host.network.run).toHaveBeenCalledWith(
      '123',
      expect.any(Function),
    );
    expect(ctx.headers).toMatchObject({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    expect(await f.cache.get(f.key)).toBeUndefined();
  },
);

it.each(['member', 'removed', 'disabled', 'deleted', 'root-revoked'])(
  'rejects %s during token exchange',
  async (change) => {
    const f = await fixture();
    if (change === 'root-revoked') {
      f.identity.root = true;
      f.identity.role = null;
    }
    f.host.googleJson.mockImplementation(async (_id, url) => {
      if (url === GOOGLE_ENDPOINTS.token) {
        if (change === 'member') f.identity.role = 'member';
        if (change === 'removed') f.identity.role = null;
        if (change === 'disabled')
          f.identity.disabledAt = new Date().toISOString();
        if (change === 'deleted') f.identity.exists = false;
        if (change === 'root-revoked') f.identity.root = false;
        return {
          refresh_token: 'fictional-refresh',
          access_token: 'fictional-access',
          scope: GOOGLE_SCOPES.join(' '),
        };
      }
      return { email: 'test@example.com' };
    });
    await f.denied(await f.run());
    expect(f.host.googleJson).toHaveBeenCalledTimes(2);
  },
);

it.each(['expired', 'mismatch', 'missing-cookie', 'missing-state'])(
  'rejects %s and clears state/cookie',
  async (kind) => {
    const f = await fixture();
    if (kind === 'expired') await f.cache.set(f.key, {}, -1);
    // With no state supplied there is no cache key to consume.
    if (kind === 'missing-state') await f.cache.del(f.key);
    const ctx = f.context(
      'initiator',
      kind === 'mismatch'
        ? 'wrong'
        : kind === 'missing-cookie'
          ? ''
          : undefined,
      kind === 'missing-state' ? { state: '', code: '' } : undefined,
    );
    await f.denied(await f.run(ctx), 'state_expired');
    expect(f.host.googleJson).not.toHaveBeenCalled();
    // Nothing verified which project or browser this was, so nothing is recorded against a project.
    expect(f.host.authAttemptFailed).not.toHaveBeenCalled();
  },
);

it('rejects sequential and concurrent replay', async () => {
  const f = await fixture();
  const results = await Promise.all([f.run(), f.run()]);
  expect(results.map((ctx) => ctx.redirectTo).sort()).toEqual([
    '/main/connections?google=authorized',
    '/main/connections?google=error&reason=state_expired',
  ]);
  expect((await f.run()).redirectTo).toContain('reason=state_expired');
  expect(f.host.variable).toHaveBeenCalledTimes(1);
  expect(f.host.metadata).toHaveBeenCalledTimes(1);
});

it('sanitizes upstream failures and consumes the request', async () => {
  const f = await fixture();
  f.host.googleJson.mockRejectedValue(
    new Error('fictional-access fictional-refresh fictional-secret'),
  );
  await f.denied(await f.run(), 'callback_failed');
});

it('rejects revocation while reading the Google identity', async () => {
  const f = await fixture();
  f.host.googleJson.mockImplementation(async (_id, url) => {
    if (url === GOOGLE_ENDPOINTS.token)
      return {
        refresh_token: 'fictional-refresh',
        access_token: 'fictional-access',
        scope: GOOGLE_SCOPES.join(' '),
      };
    f.identity.role = null;
    return { email: 'test@example.com' };
  });
  await f.denied(await f.run());
});

it('consumes provider-denied callbacks without exchanging tokens', async () => {
  const f = await fixture();
  const ctx = f.context();
  ctx.request.query.error = 'access_denied';
  await f.denied(await f.run(ctx), 'authorization_denied');
  expect(f.host.googleJson).not.toHaveBeenCalled();
});

it.each([null, 'other-admin', 'initiator'])(
  'enforces account binding through the production HTTP callback route: %s',
  async (userId) => {
    const { authenticationToken } =
      await import('@nocobase/app-plugin-authentication');
    const { ServiceContainer } = await import('@nocobase/service-provider');
    const { authorizationToken } = await import('@nocobase/app-plugin-authorization/server');
    const { scopedApiKeysToken } = await import('@nocobase/app-plugin-api-keys/server');
    const { nocoReachRoutes } = await import('../../server/routes/nocoreach');
    const { nocoReachToken } = await import('../../server/providers/nocoreach');
    const f = await fixture();
    const container = new ServiceContainer();
    container.instance(authorizationToken, { middleware: () => async (_context: unknown, next: () => Promise<void>) => next() } as never);
    container.instance(scopedApiKeysToken, { resolve: async () => null } as never);
    container.instance(authenticationToken, {
      optional:
        () =>
        async (context: import('hono').Context, next: () => Promise<void>) => {
          context.set(
            'auth',
            userId
              ? { user: { id: userId }, session: { id: 'test-session' } }
              : null,
          );
          await next();
        },
    } as never);
    container.instance(nocoReachToken, {
      ready: Promise.resolve(),
      legacy: {
        db: f.host.db,
        resources: {
          action:
            () =>
            (
              ctx: Parameters<typeof googleOAuthCallback>[1],
              next: () => Promise<void>,
            ) =>
              googleOAuthCallback(f.host as never, ctx, next),
          level: () => 'public',
        },
      },
      users: { isRoot: async () => false },
      cache: f.cache,
      logger: f.logger,
      plugin: { network: f.host.network },
    } as never);
    const router = await nocoReachRoutes.createRouter({ container } as never);
    const response = await router.request(
      '/nocoreach/nrGoogle/callback?state=fictional-state&code=fictional-code',
      {
        headers: { Cookie: 'nr_google_oauth=fictional-browser-nonce' },
      },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      userId === 'initiator'
        ? '/main/connections?google=authorized'
        : '/main/connections?google=error&reason=initiator_access_denied',
    );
    expect(response.headers.get('set-cookie')).toContain('nr_google_oauth=;');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await f.cache.get(f.key)).toBeUndefined();
    expect(f.host.variable).toHaveBeenCalledTimes(
      userId === 'initiator' ? 1 : 0,
    );
    expect(f.host.metadata).toHaveBeenCalledTimes(
      userId === 'initiator' ? 1 : 0,
    );
  },
);

// Authorizing again after Google refused the saved authorization (invalid_grant).
function previousLink(values: Record<string, unknown>) {
  return { get: (field: string) => values[field] ?? null };
}
const confirmed = {
  status: 'ready_for_sync',
  accountEmail: 'Test@Example.com',
  ga4PropertyId: '123',
  gscSiteUrl: 'sc-domain:example.test',
  authFailedAt: '2026-11-03T08:24:04.000Z',
};

it('keeps the confirmed resources and retries the refused syncs when the same account authorizes again', async () => {
  const f = await fixture();
  const retryRefused = vi.fn(async () => 2);
  Object.assign(f.host, {
    link: vi.fn(async () => previousLink(confirmed)),
    sync: { retryRefused },
  });
  const ctx = await f.run();
  expect(ctx.redirectTo).toBe('/main/connections?google=authorized');
  expect(f.host.metadata).toHaveBeenCalledWith('123', {
    accountEmail: 'test@example.com',
    authorizedAt: expect.any(String),
    authFailedAt: null,
    authAttemptFailedAt: null,
    authAttemptReason: null,
    status: 'ready_for_sync',
  });
  expect(retryRefused).toHaveBeenCalledWith('123');
  // The retry follows the saved authorization, never the other way round.
  expect(f.host.variable.mock.invocationCallOrder[0]).toBeLessThan(
    retryRefused.mock.invocationCallOrder[0],
  );
});

it.each([
  ['another account', { accountEmail: 'someone-else@example.com' }],
  ['missing resources', { gscSiteUrl: null }],
  ['a disconnected link', { status: 'disconnected' }],
])(
  'asks to confirm resources and retries nothing after %s',
  async (_case, change) => {
    const f = await fixture();
    const retryRefused = vi.fn(async () => 0);
    Object.assign(f.host, {
      link: vi.fn(async () => previousLink({ ...confirmed, ...change })),
      sync: { retryRefused },
    });
    expect((await f.run()).redirectTo).toBe(
      '/main/connections?google=authorized',
    );
    expect(f.host.metadata).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({
        authFailedAt: null,
        status: 'awaiting_selection',
      }),
    );
    expect(retryRefused).not.toHaveBeenCalled();
  },
);

it('keeps the new authorization when the refused syncs cannot be queued again', async () => {
  const f = await fixture();
  Object.assign(f.host, {
    link: vi.fn(async () => previousLink(confirmed)),
    sync: {
      retryRefused: vi.fn(async () => Promise.reject(new Error('busy'))),
    },
  });
  expect((await f.run()).redirectTo).toBe(
    '/main/connections?google=authorized',
  );
  expect(f.host.variable).toHaveBeenCalledTimes(1);
  expect(f.logger.warn).toHaveBeenCalledWith(
    'NocoReach Google sync retry after authorization skipped',
    { message: 'busy' },
  );
});

// A failed attempt is kept on the link (plugin.ts authAttemptFailed) until one succeeds.
const tokens = (scope = GOOGLE_SCOPES.join(' ')) => ({
  refresh_token: 'fictional-refresh',
  access_token: 'fictional-access',
  scope,
});
// What googleJson throws when fetch itself failed, before Google answered anything.
const unanswered = (code: 'network_timeout' | 'network_unreachable') =>
  Object.assign(new Error('Google API is currently unreachable'), {
    code,
    status: 502,
  });
// What googleJson throws for an answer Google gave with an error.
const answered = (code: string, status: number) =>
  Object.assign(new Error('Google refused'), { code, status });
const exchanges = (host: { googleJson: ReturnType<typeof vi.fn> }) =>
  host.googleJson.mock.calls.filter(
    ([, url]) => url === GOOGLE_ENDPOINTS.token,
  );

it('records why an attempt failed and clears it with the next authorization that succeeds', async () => {
  const f = await fixture();
  f.host.googleJson.mockImplementation(async (_id, url) =>
    url === GOOGLE_ENDPOINTS.token
      ? tokens(
          'openid email https://www.googleapis.com/auth/analytics.readonly',
        )
      : { email: 'test@example.com' },
  );
  await f.denied(await f.run(), 'missing_permissions');
  expect(f.host.authAttemptFailed).toHaveBeenCalledWith(
    '123',
    'missing_permissions',
  );
  // A failure is recorded after the attempt, never inside the network scope it ran in.
  expect(f.host.network.run).toHaveBeenCalledTimes(1);
  expect(f.host.authAttemptFailed.mock.invocationCallOrder[0]).toBeGreaterThan(
    f.host.googleJson.mock.invocationCallOrder[0],
  );

  const next = await fixture();
  expect((await next.run()).redirectTo).toBe(
    '/main/connections?google=authorized',
  );
  expect(next.host.metadata).toHaveBeenCalledWith(
    '123',
    expect.objectContaining({
      authAttemptFailedAt: null,
      authAttemptReason: null,
    }),
  );
  expect(next.host.authAttemptFailed).not.toHaveBeenCalled();
});

it('records an attempt Google did not approve, and one the initiator may no longer finish', async () => {
  const f = await fixture();
  const ctx = f.context();
  ctx.request.query.error = 'access_denied';
  await f.denied(await f.run(ctx), 'authorization_denied');
  expect(f.host.authAttemptFailed).toHaveBeenCalledWith(
    '123',
    'authorization_denied',
  );
  const member = await fixture();
  member.identity.role = 'member';
  await member.denied(await member.run());
  expect(member.host.authAttemptFailed).toHaveBeenCalledWith(
    '123',
    'initiator_access_denied',
  );
});

it('still redirects with the reason when the failure cannot be recorded', async () => {
  const f = await fixture();
  f.host.authAttemptFailed.mockRejectedValue(new Error('database is locked'));
  f.host.googleJson.mockRejectedValue(answered('google_api_error', 503));
  await f.denied(await f.run(), 'google_api_error');
});

it('exchanges the code once more when the connection failed before Google answered', async () => {
  const f = await fixture();
  let first = true;
  f.host.googleJson.mockImplementation(async (_id, url) => {
    if (url !== GOOGLE_ENDPOINTS.token) return { email: 'test@example.com' };
    if (first) {
      first = false;
      throw unanswered('network_unreachable');
    }
    return tokens();
  });
  expect((await f.run()).redirectTo).toBe(
    '/main/connections?google=authorized',
  );
  const sent = exchanges(f.host);
  expect(sent).toHaveLength(2);
  // The same authorization code both times; Google never answered the first.
  expect(
    sent.map(([, , init]) => new URLSearchParams(init.body).get('code')),
  ).toEqual(['fictional-code', 'fictional-code']);
  expect(f.host.variable).toHaveBeenCalledTimes(1);
  expect(f.host.authAttemptFailed).not.toHaveBeenCalled();
});

it.each([
  ['invalid_grant', 400],
  ['invalid_client', 401],
  ['google_api_error', 503],
])(
  'never sends the code again once Google answered, even with %s',
  async (code, status) => {
    const f = await fixture();
    f.host.googleJson.mockRejectedValue(answered(code, status));
    await f.denied(await f.run(), code);
    expect(exchanges(f.host)).toHaveLength(1);
    expect(f.host.authAttemptFailed).toHaveBeenCalledWith('123', code);
  },
);

it.each([
  ['the second try also gets no answer', unanswered('network_timeout')],
  // The first request reached Google and used the code; only its answer was lost.
  ['the code was used by the first try', answered('invalid_grant', 400)],
])(
  'says the connection failed when %s, after one retry',
  async (_case, second) => {
    const f = await fixture();
    f.host.googleJson
      .mockRejectedValueOnce(unanswered('network_timeout'))
      .mockRejectedValueOnce(second);
    await f.denied(await f.run(), 'network_timeout');
    expect(exchanges(f.host)).toHaveLength(2);
    expect(f.host.authAttemptFailed).toHaveBeenCalledWith(
      '123',
      'network_timeout',
    );
  },
);
