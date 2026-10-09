import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  defineApiRoutes,
  describeRoute,
  apiValidator,
  dataResponse,
  apiErrorResponse,
  ApiError,
} from '@nocobase/app-server/router';
import { reachToken } from '../providers/reach/index.js';
const statuses = {
  400: 'INVALID_ARGUMENT',
  401: 'UNAUTHENTICATED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  409: 'ABORTED',
  422: 'INVALID_ARGUMENT',
  502: 'UNAVAILABLE',
  503: 'UNAVAILABLE',
} as const;
function fail(status: number | string, message: string): never {
  const code =
    typeof status === 'number'
      ? statuses[status as keyof typeof statuses]
      : Object.values(statuses).find((value) => value === status);
  throw new ApiError({
    status: code || 'INTERNAL',
    reason: 'REACH_OPERATION_FAILED',
    domain: 'nocoreach',
    message,
  });
}
export const reachRoutes = defineApiRoutes(
  (app: import('@nocobase/app-server/application').Application) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const reach = app.container.resolve(reachToken);
    const cache = new Map<string, { value: unknown; expires: number }>();
    for (const entry of reach.routes.entries.values()) {
      const path = `/reach/${entry.resource}/${entry.action}`;
      // Public OAuth and daemon operations verify one-time nonce or computer credentials inside their domain handlers.
      const middleware =
        entry.access === 'public' ? auth.optional() : auth.required();
      const declaration = (suffix = '') =>
        describeRoute({
          tags: ['NocoReach'],
          summary: `${entry.resource} ${entry.action}`,
          operationId: `reach_${entry.resource}_${entry.action}${suffix}`,
          responses: {
            200: dataResponse(z.unknown()),
            400: apiErrorResponse(400),
            401: apiErrorResponse(401),
            403: apiErrorResponse(403),
            409: apiErrorResponse(409),
            500: apiErrorResponse(500),
          },
          ...(entry.access === 'public' ? { security: [] } : {}),
        });
      const handler = async (c: any) => {
        const values =
          c.req.method === 'GET' ? c.req.query() : c.req.valid('json');
        let redirect: string | undefined;
        const identity = c.get('auth');
        const context: any = {
          method: c.req.method,
          auth: identity
            ? {
                ...identity,
                user: { ...identity.user, nickname: identity.user.name },
              }
            : null,
          store: reach.store,
          state: {},
          logger: reach.logger,
          action: {
            resourceName: entry.resource,
            actionName: entry.action,
            params: { ...c.req.query(), values },
          },
          request: {
            query: c.req.query(),
            headers: Object.fromEntries(c.req.raw.headers),
          },
          get: (key: string) => c.req.header(key),
          set: (key: string, value: string) => c.header(key, value),
          throw: (status: number, message: string) => {
            throw Object.assign(new Error(message), { status });
          },
          redirect: (url: string) => {
            redirect = c.req.path.split('/api/reach/')[0] + url;
          },
          cookies: {
            get: (name: string) => getCookie(c, name),
            set: (name: string, value: string | null, options: any) => {
              const opts = {
                ...options,
                maxAge: options.maxAge ? options.maxAge / 1000 : undefined,
              };
              delete opts.signed;
              if (value === null) deleteCookie(c, name, opts);
              else setCookie(c, name, value, opts);
            },
          },
          cache: {
            set: async (key: string, value: unknown, ttl: number) => {
              cache.set(key, { value, expires: Date.now() + ttl });
            },
            get: async (key: string) => {
              const found = cache.get(key);
              if (found && found.expires > Date.now()) return found.value;
              cache.delete(key);
              return undefined;
            },
            del: async (key: string) => {
              cache.delete(key);
            },
          },
        };
        try {
          await entry.handler(context, async () => {});
        } catch (error: any) {
          if (error instanceof ApiError) throw error;
          fail(
            error.status || 500,
            error.status ? error.message : '请求未完成，请稍后重试。',
          );
        }
        if (redirect) return c.redirect(redirect);
        return c.json({ data: context.body ?? null });
      };
      if (
        [
          'callback',
          'list',
          'get',
          'status',
          'state',
          'context',
          'summary',
          'report',
          'me',
        ].includes(entry.action)
      )
        router.get(
          path,
          middleware,
          declaration(),
          apiValidator('query', z.record(z.string(), z.string())),
          handler,
        );
      if (entry.action !== 'callback')
        router.post(
          path,
          middleware,
          declaration('_post'),
          apiValidator('json', z.record(z.string(), z.unknown())),
          handler,
        );
    }
    return router;
  },
);
