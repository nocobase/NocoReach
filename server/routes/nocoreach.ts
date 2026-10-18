import { requireAccess } from '../nocoreach/policy.js';
import { authorizationToken, type AuthorizationEnv } from '@nocobase/app-plugin-authorization/server';
import { scopedApiKeysToken, isApiKeySession } from '@nocobase/app-plugin-api-keys/server';
import { businessApiError as failure } from '../nocoreach/api-error.js';
import { getRequestLocale } from '@nocobase/i18n/server';
// The NocoReach actions, as the classic plugin registered them (`nrTasks:list`, `nrGoogle:callback`…), served at
// `/api/nocoreach/<resource>/<action>`. One declared route dispatches to the action the ported service registered
// (server/providers/nocoreach.ts); each action checks its own access the classic way (policy.ts requireAccess: joined
// NocoReach members, admin-only settings), and only the actions the service marked public answer without a session.
// Bodies are the classic actions' own inputs, validated by each action; here they only have to be a JSON object.
import { authenticationToken, isServiceAccount, type AuthEnv } from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  apiErrorResponse,
  ApiError,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { except } from 'hono/combine';
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
const projectSelector = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;


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
    const routes = new Hono<AuthEnv & AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const keys = app.container.resolve(scopedApiKeysToken);

    const run = async (
      context: Context<AuthEnv & AuthorizationEnv>,
      params: z.infer<typeof Params>,
      query: Record<string, string>,
      body: Record<string, unknown> | undefined,
    ) => {
      const runtime = app.container.resolve(nocoReachToken);
      await runtime.ready;
      const fn = runtime.legacy.resources.action(params.resource, params.action);
      if (!fn) throw failure(404, '没有这个操作', undefined, getRequestLocale(context));
      const session = context.get('auth');
      if (context.req.header('x-api-key')) {
        const scope = session ? await keys.resolve(session, context.req.raw) : null;
        if (!session || !isApiKeySession(session, context.req.raw.headers) || !scope || scope.permissions === null)
          throw new ApiError({ status: 'UNAUTHENTICATED', reason: 'SCOPED_NOCOREACH_KEY_REQUIRED', domain: 'nocoreach', message: 'A valid scoped NocoReach API key is required.' });
        if (runtime.legacy.resources.level(params.resource, params.action) === 'public')
          throw new ApiError({ status: 'PERMISSION_DENIED', reason: 'API_KEY_OAUTH_CALLBACK_FORBIDDEN', domain: 'nocoreach', message: 'OAuth completion requires a browser sign-in.' });
      }
      if (!session && runtime.legacy.resources.level(params.resource, params.action) !== 'public')
        throw failure(401, 'classicImport.signFirst', undefined, getRequestLocale(context));
      // This is a confirmation precondition, never an identity source: compare with
      // the session authenticated for this very request, not a client-supplied user.
      if (((params.resource === 'nrCollectors' && params.action === 'save') || (params.resource === 'nrArticles' && ['saveTarget', 'removeTarget'].includes(params.action)) || (['nrXiaohongshu', 'nrBilibili'].includes(params.resource) && params.action === 'disconnect') ||
           (params.resource === 'nrYouTube' && ['connect', 'disconnect', 'clear'].includes(params.action))) &&
          context.req.header('X-NocoReach-Confirmation-Session') !== session?.session.id)
        throw failure(409, 'xiaohongshu.sessionExpiredSignNocoreachAgain', 'NOCOREACH_CONFIRMATION_SESSION_CHANGED', getRequestLocale(context));
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
          ? { id: String(user.id), name: user.name, username: (user as { username?: string }).username, email: user.email, kind: isServiceAccount(user) ? 'service' : 'person' }
          : null,
        roles,
        app: runtime.legacy,
        cache: runtime.cache,
        logger: runtime.logger,
        locale: getRequestLocale(context),
      });
      try {
        const invoke = async () => {
        // Project metadata must not be read before the business membership/role check.
        // Public OAuth callbacks resolve their target only after validating the stored state/nonce.
        if (runtime.plugin.mock?.enabled && runtime.legacy.resources.level(params.resource, params.action) !== 'public' && !(params.resource === 'nrMembers' && params.action === 'me')) {
          await requireAccess(ctx);
          await runtime.plugin.network.runProject(String((ctx.action.params.values as Record<string, unknown>)?.projectId || ''), () => fn(ctx, async () => {}));
        } else {
          await runtime.plugin.network.run(String((ctx.action.params.values as Record<string, unknown>)?.projectId || ''), () => fn(ctx, async () => {}));
        }
        };
        if (session && !(params.resource === 'nrMembers' && params.action === 'me') && runtime.legacy.resources.level(params.resource, params.action) !== 'public') {
          const keyScope = await keys.resolve(session, context.req.raw);
          await runtime.legacy.db.access!.run({ userId: session.user.id, http: context.req.raw, context: context.get('authz'), ...(keyScope ? { keyScope } : {}) }, async () => {
            await runtime.legacy.db.access!.require(params.resource, params.action, projectSelector(body?.projectId || query.projectId));
            await invoke();
          });
        } else await invoke();
      } catch (error) {
        if (error instanceof ApiError) throw error;
        const status = (error as { status?: number }).status;
        if (error instanceof LegacyHttpError || (typeof status === 'number' && status >= 400 && status < 600))
          throw failure(status as number, (error as Error).message, undefined, getRequestLocale(context));
        runtime.logger.error('NocoReach action failed', {
          action: `${params.resource}:${params.action}`,
          message: (error as Error)?.message,
        });
        throw failure(500, 'proxyProfiles.requestNotCompletedTryAgain', undefined, getRequestLocale(context));
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
    routes.use('*', except((context) => !context.get('auth'), authorization.middleware()));
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
