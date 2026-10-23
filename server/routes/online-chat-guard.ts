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
import { Hono, type MiddlewareHandler } from 'hono';
import {
  ONLINE_AGENT_ID,
  ONLINE_CHAT_SCOPE,
} from '../../shared/online-agent.js';
import {
  conversationMissing,
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
 * conversations pass untouched. Stop and reading stay open. Creating one without that scope is refused too. Register
 * before plugin routes.
 */
export const onlineChatGuard: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<Env>();
    const authenticate: MiddlewareHandler<AuthEnv> = async (context, next) => {
      if (context.req.method !== 'POST') return next();
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
      const detail = await agents.conversations
        .get(ownerId, id)
        // Not the caller's or not there: the plugin answers with its own error.
        .catch((error: unknown) => {
          if (conversationMissing(error)) return null;
          throw error;
        });
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
    const requireScope: MiddlewareHandler<Env> = async (context, next) => {
      if (context.req.method !== 'POST') return next();
      const body = (await context.req.raw
        .clone()
        .json()
        // Malformed: the plugin's validator answers.
        .catch(() => null)) as {
        agentId?: unknown;
        config?: { agentId?: unknown; scope?: unknown };
      } | null;
      if (!body || typeof body !== 'object') return next();
      // No agent named means the plugin's native one.
      const agentId = body.agentId ?? body.config?.agentId ?? ONLINE_AGENT_ID;
      const scope = body.config?.scope;
      if (
        agentId !== ONLINE_AGENT_ID ||
        (Array.isArray(scope) && scope.includes(ONLINE_CHAT_SCOPE))
      )
        return next();
      throw onlineApiError(new OnlineAgentError('scopeRequired', 400));
    };
    router.use('/agents/conversations', authenticate, requireScope);
    for (const path of [
      '/agents/conversations/:conversationId/messages',
      '/agents/conversations/:conversationId/approval',
    ])
      router.use(path, authenticate, authorize, authorizeOnline);
    return new Hono().route('/', router);
  });
