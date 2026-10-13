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
                ? { id: 'initiator', disabledAt: identity.disabledAt }
                : null,
          }
        : {
            findMany: async () =>
              identity.root ? [{ subjectId: 'initiator' }] : [],
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
    const { nocoReachRoutes } = await import('../../server/routes/nocoreach');
    const { nocoReachToken } = await import('../../server/providers/nocoreach');
    const f = await fixture();
    const container = new ServiceContainer();
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
