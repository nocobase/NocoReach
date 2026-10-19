import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  isApiKeySession,
  scopedApiKeysToken,
} from '@nocobase/app-plugin-api-keys/server';
import { ApiError, defineApiRoutes } from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { APIError } from 'better-auth/api';
import {
  apiErrorHandler,
  apiErrorStatusFromHttp,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import { nocoReachToken } from '../providers/nocoreach.js';

/** Application-wide credential invariant, deliberately registered before every plugin route. */
export const accessGuard = defineApiRoutes<Application>((app) => {
  const routes = new Hono();
  if (
    !app.container.has(authenticationToken) ||
    !app.container.has(scopedApiKeysToken)
  )
    return routes;
  const auth = app.container.resolve(authenticationToken);
  routes.use('*', async (context, next) => {
    const headers = context.req.raw.headers;
    const key = headers.get('x-api-key');
    // The legacy dispatcher authenticates once and applies this invariant itself. Do not verify its keys twice.
    const businessDispatcher = context.req.path.includes('/api/nocoreach/');
    if (key && !businessDispatcher) {
      const session = await auth.getSession(headers).catch((error: unknown) => {
        if (error instanceof APIError)
          return apiErrorHandler(
            new ApiError({
              status: apiErrorStatusFromHttp(error.statusCode),
              reason: error.body?.code ?? 'API_KEY_REJECTED',
              domain: 'authentication',
              message: 'The API key is invalid or expired.',
            }),
            context as Context,
          );
        throw error;
      });
      if (session instanceof Response) return session;
      const fail = (reason: string) => {
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason,
          domain: 'nocoreach',
          message: 'A valid scoped NocoReach API key is required.',
        });
      };
      if (!session || !isApiKeySession(session, headers))
        fail('API_KEY_CREDENTIAL_CONFLICT');
      const scope = await app.container
        .resolve(scopedApiKeysToken)
        .resolve(session!, context.req.raw);
      if (!scope || scope.permissions === null)
        fail('UNSCOPED_API_KEY_RETIRED');
      const runtime = app.container.resolve(nocoReachToken);
      await runtime.ready;
      if (
        !(await runtime.legacy.db.access!.roleFor(
          context.req.raw,
          session!.user.id,
        ))
      )
        fail('API_KEY_OWNER_INACTIVE');
      if (context.req.path.endsWith('/nocoreach/nrGoogle/callback'))
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'API_KEY_OAUTH_CALLBACK_FORBIDDEN',
          domain: 'nocoreach',
          message: 'OAuth completion requires a browser sign-in.',
        });
      // Authentication's get-session is a protocol endpoint; all other account operations require a person signing in.
      if (
        context.req.path.includes('/api/auth/') &&
        !context.req.path.endsWith('/get-session')
      ) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'API_KEY_ACCOUNT_FORBIDDEN',
          domain: 'nocoreach',
          message: 'API keys cannot use account endpoints.',
        });
      }
    }
    const path = context.req.path;
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(context.req.method) &&
      (path.includes('/api/apiKeys') || path.includes('/api/auth/api-key/'))
    ) {
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'USE_NOCOREACH_KEY_MANAGEMENT',
        domain: 'nocoreach',
        message: 'Use the NocoReach controlled key management endpoint.',
      });
    }
    await next();
  });
  return routes;
});
