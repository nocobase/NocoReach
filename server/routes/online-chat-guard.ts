import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type MiddlewareHandler } from 'hono';
import { ONLINE_AGENT_ID } from '../../shared/online-agent.js';
import {
  OnlineAgentError,
  onlineApiError,
} from '../nocoreach/online-agent/errors.js';
import { onlineChatSettingsToken } from '../providers/online-agents.js';

/**
 * Chat panel › Settings turns the chat agent off for every conversation, but the plugin resolves the `nocoreach`
 * scope, where that switch is checked, only when a conversation is created; a saved conversation keeps its
 * configuration. So a new message or an approval in an online conversation is refused here while it is off. Stop and
 * reading stay open. Register before plugin routes.
 */
export const onlineChatGuard: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<AuthEnv>();
    const authenticate: MiddlewareHandler<AuthEnv> = async (context, next) => {
      if (context.req.method !== 'POST') return next();
      return app.container.resolve(authenticationToken).required()(
        context,
        next,
      );
    };
    const refuseWhileOff: MiddlewareHandler<AuthEnv> = async (
      context,
      next,
    ) => {
      if (context.req.method !== 'POST') return next();
      const settings = await app.container
        .resolve(onlineChatSettingsToken)
        .get();
      if (settings.enabled) return next();
      const detail = await app.container
        .resolve(agentsToken)
        .conversations.get(
          String(context.get('auth')!.user.id),
          context.req.param('conversationId')!,
        )
        // Not the caller's or not there: the plugin answers with its own error.
        .catch(() => null);
      if (detail?.agent?.id !== ONLINE_AGENT_ID) return next();
      throw onlineApiError(new OnlineAgentError('chatDisabled', 403));
    };
    for (const path of [
      '/agents/conversations/:conversationId/messages',
      '/agents/conversations/:conversationId/approval',
    ])
      router.use(path, authenticate, refuseWhileOff);
    return new Hono().route('/', router);
  });
