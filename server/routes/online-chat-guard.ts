import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import {
  ONLINE_AGENT_ID,
  ONLINE_CHAT_SCOPE,
} from '../../shared/online-agent.js';
import {
  conversationOrNull,
  OnlineAgentError,
  onlineApiError,
} from '../nocoreach/online-agent/errors.js';
import { onlineAuthorization } from '../nocoreach/online-agent/host.js';
import { variableProject } from '../nocoreach/online-agent/register.js';
import { nocoReachToken } from '../providers/nocoreach.js';
import { onlineChatSettingsToken } from '../providers/online-agents.js';

type Env = AuthEnv & AuthorizationEnv;

/**
 * The plugin resolves the `nocoreach` scope, where Chat panel › Settings' switch, the person's role and their access to
 * the project are checked, only when a conversation is created; a saved conversation keeps its configuration. So a new
 * message or an approval in an online conversation checks them again here, as every tool call does. Runner
 * conversations pass untouched. Stop and reading stay open. Creating one without that scope, or changing a saved one's
 * scopes to leave it out, is refused too. Register before plugin routes.
 */
export const onlineChatGuard: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<Env>();
    const authenticate: MiddlewareHandler<AuthEnv> = async (context, next) => {
      if (!['POST', 'PATCH'].includes(context.req.method)) return next();
      return app.container.resolve(authenticationToken).required()(
        context,
        next,
      );
    };
    const authorizeOnline: MiddlewareHandler<Env> = async (context, next) => {
      if (context.req.method !== 'POST') return next();
      const agents = app.container.resolve(agentsToken);
      const auth = context.get('auth')!;
      const ownerId = String(auth.user.id);
      const id = context.req.param('conversationId')!;
      // Not the caller's or not there: the plugin answers with its own error.
      const detail = await conversationOrNull(agents, ownerId, id);
      if (detail?.agent?.id !== ONLINE_AGENT_ID) return next();
      const config = await agents.onlineAgent.configuration(
        {
          user: { id: ownerId },
          authorization: context.get('authz'),
          credentials: auth,
        },
        id,
      );
      const host = app.container.resolve(nocoReachToken);
      await host.ready;
      try {
        await onlineAuthorization(
          host,
          { ownerId, projectId: variableProject(config.variable) },
          () => app.container.resolve(onlineChatSettingsToken).get(),
        )();
      } catch (error) {
        if (error instanceof OnlineAgentError) throw onlineApiError(error);
        throw error;
      }
      return next();
    };
    const authorize: MiddlewareHandler<AuthorizationEnv> = async (
      context,
      next,
    ) => {
      if (context.req.method !== 'POST') return next();
      return app.container.resolve(authorizationToken).middleware()(
        context,
        next,
      );
    };
    // The plugin takes scopes as optional, so a conversation with the online agent must name `nocoreach`: without it the
    // conversation skips NocoReach's prompt, the Chat panel switch, its model and the project check.
    const scopeRequired = () =>
      onlineApiError(new OnlineAgentError('scopeRequired', 400));
    const bodyOf = (context: Context) =>
      context.req.raw
        .clone()
        .json()
        // Malformed: the plugin's validator answers.
        .catch(() => null) as Promise<{
        agentId?: unknown;
        config?: { agentId?: unknown; scope?: unknown };
      } | null>;
    const named = (scope: unknown) =>
      Array.isArray(scope) && scope.includes(ONLINE_CHAT_SCOPE);
    const requireScope: MiddlewareHandler<Env> = async (context, next) => {
      if (context.req.method !== 'POST') return next();
      const body = await bodyOf(context);
      if (!body || typeof body !== 'object') return next();
      // No agent named means the plugin's native one.
      const agentId = body.agentId ?? body.config?.agentId ?? ONLINE_AGENT_ID;
      if (agentId !== ONLINE_AGENT_ID || named(body.config?.scope))
        return next();
      throw scopeRequired();
    };
    // The plugin resolves a saved conversation's configuration again when its scopes are changed, so an online one must
    // keep `nocoreach` there too; leaving `scope` out keeps the saved scopes.
    const keepScope: MiddlewareHandler<Env> = async (context, next) => {
      if (context.req.method !== 'PATCH') return next();
      const body = await bodyOf(context);
      const scope =
        body && typeof body === 'object' ? body.config?.scope : undefined;
      if (scope === undefined || named(scope)) return next();
      const detail = await conversationOrNull(
        app.container.resolve(agentsToken),
        String(context.get('auth')!.user.id),
        context.req.param('conversationId')!,
      );
      if (detail?.agent?.id !== ONLINE_AGENT_ID) return next();
      throw scopeRequired();
    };
    router.use('/agents/conversations', authenticate, requireScope);
    router.use(
      '/agents/conversations/:conversationId/config',
      authenticate,
      keepScope,
    );
    for (const path of [
      '/agents/conversations/:conversationId/messages',
      '/agents/conversations/:conversationId/approval',
    ])
      router.use(path, authenticate, authorize, authorizeOnline);
    return new Hono().route('/', router);
  });
