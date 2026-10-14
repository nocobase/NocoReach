// The classic (Koa) request context the ported NocoReach actions read and write, built for one NocoBase 3 request:
// `ctx.action.params` (query parameters, the JSON body as `values`), `ctx.auth.user`, `ctx.state.currentRoles`,
// `ctx.body`, `ctx.throw(status, message)`, `ctx.get/set` headers, `ctx.cache`, `ctx.cookies` and `ctx.redirect`.
// The NocoReach route turns what the action left in it into the response.
import type { LegacyApp, LegacyLogger } from './app.js';
import { apiErrorStatusCodes } from '@nocobase/app-server/router';

type Values = Record<string, unknown>;

// Ported actions sometimes forward a repository's canonical status name to ctx.throw.
// Never let that string (or a success/invalid number) become an HTTP response status.
function legacyErrorStatus(status: unknown): number {
  if (
    typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 400 &&
    status < 600
  )
    return status;
  if (typeof status === 'string' && Object.hasOwn(apiErrorStatusCodes, status))
    return apiErrorStatusCodes[status as keyof typeof apiErrorStatusCodes];
  return 500;
}

/** What `ctx.throw(status, message)` throws; the route answers it as an `/api` error with the message for the user. */
export class LegacyHttpError extends Error {
  readonly status: number;
  constructor(status: unknown, message: string) {
    super(message);
    this.status = legacyErrorStatus(status);
  }
}

/** A small expiring store for what classic code kept in `ctx.cache` (OAuth state, an analysis' evidence). */
export class LegacyCache {
  private items = new Map<string, { value: unknown; expires: number }>();
  async get(key: string) {
    const item = this.items.get(key);
    if (!item) return undefined;
    if (item.expires < Date.now()) {
      this.items.delete(key);
      return undefined;
    }
    return item.value;
  }
  /** Consume before yielding so concurrent callbacks cannot redeem the same state. */
  async take(key: string) {
    const item = this.items.get(key);
    this.items.delete(key);
    return item && item.expires > Date.now() ? item.value : undefined;
  }
  async set(key: string, value: unknown, ttl = 3600000) {
    if (this.items.size > 5000)
      for (const [k, v] of this.items)
        if (v.expires < Date.now()) this.items.delete(k);
    this.items.set(key, { value, expires: Date.now() + ttl });
  }
  async del(key: string) {
    this.items.delete(key);
  }
}

export interface LegacyUser {
  readonly id: string;
  readonly name?: string | null;
  readonly username?: string | null;
  readonly email?: string | null;
}

export interface LegacyContextInput {
  readonly resource: string;
  readonly action: string;
  readonly method: string;
  readonly query: Record<string, string>;
  readonly body: Values | undefined;
  readonly header: (name: string) => string | undefined;
  readonly cookie: (name: string) => string | undefined;
  readonly user: LegacyUser | null;
  readonly roles: string[];
  readonly app: LegacyApp;
  readonly cache: LegacyCache;
  readonly logger: LegacyLogger;
}

export interface CookieOut {
  readonly name: string;
  readonly value: string | null;
  readonly options: Values;
}

export function legacyContext(input: LegacyContextInput) {
  const headers: Record<string, string> = {};
  const cookies: CookieOut[] = [];
  const { query, body } = input;
  const params: Values = { ...query, values: body || {} };
  for (const key of ['filterByTk', 'projectId'])
    if (body && body[key] != null && params[key] == null)
      params[key] = body[key];
  const ctx = {
    action: { resourceName: input.resource, actionName: input.action, params },
    auth: input.user
      ? {
          user: {
            id: input.user.id,
            nickname: input.user.name ?? null,
            username: input.user.username ?? null,
            email: input.user.email ?? null,
          },
        }
      : undefined,
    state: {
      currentRoles: input.roles,
      currentUser: input.user ? { id: input.user.id } : undefined,
    } as Values,
    app: input.app,
    db: input.app.db,
    method: input.method,
    request: {
      query,
      body,
      headers: new Proxy(
        {},
        {
          get: (_t, name) =>
            typeof name === 'string' ? input.header(name) : undefined,
        },
      ),
    },
    body: undefined as unknown,
    redirectTo: undefined as string | undefined,
    headers,
    cookiesOut: cookies,
    logger: input.logger,
    cache: input.cache,
    get: (name: string) => input.header(name) || '',
    set: (name: string, value: string) => {
      headers[name] = value;
    },
    throw: (status: unknown, message?: string): never => {
      throw new LegacyHttpError(status, message || '请求没有完成');
    },
    redirect: (url: string) => {
      ctx.redirectTo = url;
    },
    cookies: {
      get: (name: string) => input.cookie(name),
      set: (name: string, value: string | null, options: Values = {}) => {
        cookies.push({ name, value, options });
      },
    },
  };
  return ctx;
}

export type LegacyContext = ReturnType<typeof legacyContext>;
