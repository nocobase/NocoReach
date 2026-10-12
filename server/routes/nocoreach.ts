// The NocoReach actions, as the classic plugin registered them (`nrTasks:list`, `nrGoogle:callback`…), served at
// `/api/nocoreach/<resource>/<action>`. One declared route dispatches to the action the ported service registered
// (server/providers/nocoreach.ts); each action checks its own access the classic way (policy.ts requireAccess: joined
// NocoReach members, admin-only settings), and only the actions the service marked public answer without a session.
// Bodies are the classic actions' own inputs, validated by each action; here they only have to be a JSON object.
import { authenticationToken, type AuthEnv } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiErrorStatusFromHttp,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { legacyContext, LegacyHttpError } from '../nocoreach/legacy/context.js';
import { nocoReachToken } from '../providers/nocoreach.js';

const Params = z.object({
  resource: z.string().regex(/^nr[A-Za-z]{1,40}$/),
  action: z.string().regex(/^[A-Za-z]{1,40}$/),
});
const Query = z.record(z.string(), z.string());
const Body = z.record(z.string(), z.unknown());

const failure = (status: number, message: string, reason = `NOCOREACH_${status}`) =>
  new ApiError({
    status: apiErrorStatusFromHttp(status),
    reason,
    domain: 'nocoreach',
    message,
    localizedMessage: { locale: 'zh-CN', message },
    ...([400, 401, 403, 404, 409, 429, 500, 501, 503, 504].includes(status)
      ? {}
      : { httpStatus: status as 400 }),
  });

const declaration = (method: 'get' | 'post') =>
  describeRoute({
    tags: ['NocoReach'],
    summary:
      method === 'get'
        ? 'Read through a NocoReach action'
        : 'Run a NocoReach action',
    operationId: method === 'get' ? 'readNocoReachAction' : 'runNocoReachAction',
    // Public actions (the Google OAuth callback) answer without a session.
    security: [],
    responses: {
      '200': dataResponse(z.unknown(), 'What the action returned.'),
      ...apiErrorResponses,
      '404': apiErrorResponse(404),
      '409': apiErrorResponse(409),
    },
  });

export const nocoReachRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);

    const run = async (
      context: Context<AuthEnv>,
      params: z.infer<typeof Params>,
      query: Record<string, string>,
      body: Record<string, unknown> | undefined,
    ) => {
      const runtime = app.container.resolve(nocoReachToken);
      await runtime.ready;
      const fn = runtime.legacy.resources.action(params.resource, params.action);
      if (!fn) throw failure(404, '没有这个操作');
      const session = context.get('auth');
      if (!session && runtime.legacy.resources.level(params.resource, params.action) !== 'public')
        throw failure(401, '请先登录');
      // This is a confirmation precondition, never an identity source: compare with
      // the session authenticated for this very request, not a client-supplied user.
      if (['nrXiaohongshu', 'nrBilibili'].includes(params.resource) && params.action === 'disconnect' &&
          context.req.header('X-NocoReach-Confirmation-Session') !== session?.session.id)
        throw failure(409, '登录已失效，请重新登录 NocoReach。', 'NOCOREACH_CONFIRMATION_SESSION_CHANGED');
      const user = session?.user ?? null;
      const roles = user && (await runtime.users.isRoot(String(user.id))) ? ['root'] : [];
      const ctx = legacyContext({
        resource: params.resource,
        action: params.action,
        method: context.req.method,
        query,
        body,
        header: (name) => context.req.header(name),
        cookie: (name) => getCookie(context, name),
        user: user
          ? { id: String(user.id), name: user.name, username: (user as { username?: string }).username, email: user.email }
          : null,
        roles,
        app: runtime.legacy,
        cache: runtime.cache,
        logger: runtime.logger,
      });
      try {
        await runtime.plugin.network.run(String((ctx.action.params.values as Record<string, unknown>)?.projectId || ''), () => fn(ctx, async () => {}));
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (error instanceof LegacyHttpError || (typeof status === 'number' && status >= 400 && status < 600))
          throw failure(status as number, (error as Error).message);
        runtime.logger.error('NocoReach action failed', {
          action: `${params.resource}:${params.action}`,
          message: (error as Error)?.message,
        });
        throw failure(500, '请求没有完成，请稍后重试');
      }
      for (const [name, value] of Object.entries(ctx.headers)) context.header(name, value);
      for (const cookie of ctx.cookiesOut) {
        const o = cookie.options as { httpOnly?: boolean; sameSite?: string; secure?: boolean; maxAge?: number; path?: string };
        if (cookie.value === null) deleteCookie(context, cookie.name, { path: o.path });
        else
          setCookie(context, cookie.name, cookie.value, {
            httpOnly: o.httpOnly,
            secure: o.secure,
            path: o.path,
            sameSite: o.sameSite === 'strict' ? 'Strict' : o.sameSite === 'none' ? 'None' : 'Lax',
            // Classic (Koa) cookies took milliseconds.
            ...(o.maxAge ? { maxAge: Math.round(o.maxAge / 1000) } : {}),
          });
      }
      if (ctx.redirectTo) return context.redirect(ctx.redirectTo);
      return context.json({ data: ctx.body ?? null });
    };

    routes.use('*', auth.optional());
    routes.get(
      '/:resource/:action',
      declaration('get'),
      apiValidator('param', Params),
      apiValidator('query', Query),
      (context) => run(context, context.req.valid('param'), context.req.valid('query'), undefined),
    );
    routes.post(
      '/:resource/:action',
      declaration('post'),
      apiValidator('param', Params),
      apiValidator('query', Query),
      apiValidator('json', Body),
      (context) =>
        run(context, context.req.valid('param'), context.req.valid('query'), context.req.valid('json')),
    );
    router.route('/nocoreach', routes);
    return router;
  });
