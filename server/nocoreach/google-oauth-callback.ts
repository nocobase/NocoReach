import { createHash } from 'node:crypto';
import * as g from './google-client.js';
import type { LegacyContext } from './legacy/context.js';
import { callbackReason } from './oauth-errors.js';
import type { LegacyDatabase } from './legacy/database.js';
import { CALLBACK_PATH, roleOf, secretKey } from './policy.js';

interface Host {
  db: Pick<LegacyDatabase, 'getRepository'>;
  project(id: string): Promise<unknown>;
  network: {
    run<T>(id: string, fn: () => Promise<T>): Promise<T>;
    runProject?<T>(id: string, fn: () => Promise<T>): Promise<T>;
  };
  config(): { clientId: string; clientSecret: string; redirectUri: string };
  googleJson(
    id: string,
    url: string,
    init: RequestInit,
  ): Promise<Record<string, string>>;
  variable(name: string, value: string, secret: boolean): Promise<unknown>;
  metadata(id: string, values: Record<string, string>): Promise<unknown>;
  RETURN: string;
}
type OAuthState = { id: string; userId: string; nonceHash: string };
function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

async function requireInitiator(
  host: Host,
  ctx: LegacyContext,
  userId: string,
) {
  // Bind to the current account, not a role snapshot or the Google identity.
  if (!userId || ctx.auth?.user.id !== userId) fail('initiator_access_denied');
  const row = await host.db
    .getRepository('users')
    .findOne({ filterByTk: userId });
  const user = row?.toJSON();
  if (!user || user.disabledAt || (await roleOf(host.db, userId)) !== 'admin')
    fail('initiator_access_denied');
}

export async function googleOAuthCallback(
  host: Host,
  ctx: LegacyContext,
  next: () => Promise<unknown>,
) {
  ctx.set('Cache-Control', 'no-store');
  ctx.set('Referrer-Policy', 'no-referrer');
  // Also clear cookies for expired, malformed and mismatched callbacks.
  ctx.cookies.set('nr_google_oauth', null, {
    path: CALLBACK_PATH(),
    signed: false,
  });
  let stage = 'state';
  try {
    const state = String(ctx.request.query.state || '');
    if (!state) fail('state_expired');
    const saved = (await ctx.cache.take(g.stateCacheKey(state))) as
      OAuthState | undefined;
    const nonce = ctx.cookies.get('nr_google_oauth');
    if (
      !saved ||
      !nonce ||
      createHash('sha256').update(nonce).digest('hex') !== saved.nonceHash
    )
      fail('state_expired');
    await host.project(saved.id);
    if (ctx.request.query.error) fail('authorization_denied');
    stage = 'authorization';
    await requireInitiator(host, ctx, saved.userId);
    const run =
      host.network.runProject?.bind(host.network) ??
      host.network.run.bind(host.network);
    await run(String(saved.id), async () => {
      stage = 'exchange';
      const c = host.config();
      const tokens = await host.googleJson(saved.id, g.GOOGLE_ENDPOINTS.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: c.clientId,
          client_secret: c.clientSecret,
          redirect_uri: c.redirectUri,
          code: String(ctx.request.query.code || ''),
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!tokens.refresh_token || !tokens.access_token) fail('missing_token');
      const required = g.GOOGLE_SCOPES.filter((s) => s.startsWith('https:'));
      if (
        required.some(
          (s) =>
            !String(tokens.scope || '')
              .split(' ')
              .includes(s),
        )
      )
        fail('missing_permissions');
      stage = 'identity';
      const identity = await host.googleJson(
        saved.id,
        g.GOOGLE_ENDPOINTS.userInfo,
        {
          ...g.jsonRequest(tokens.access_token, undefined),
          signal: AbortSignal.timeout(20000),
        },
      );
      // OAuth I/O must stay outside transactions. Re-read access after all upstream
      // awaits, immediately before persisting either credentials or link metadata.
      stage = 'authorization';
      await requireInitiator(host, ctx, saved.userId);
      stage = 'save';
      await host.variable(secretKey(saved.id), tokens.refresh_token, true);
      await host.metadata(saved.id, {
        accountEmail: identity.email || '',
        authorizedAt: new Date().toISOString(),
        status: 'awaiting_selection',
      });
      ctx.redirect(host.RETURN + '?google=authorized');
    });
  } catch (error) {
    const reason = String(callbackReason(error, stage));
    ctx.logger.warn('NocoReach Google callback failed', { stage, reason });
    ctx.redirect(host.RETURN + '?google=error&reason=' + reason);
  }
  await next();
}
