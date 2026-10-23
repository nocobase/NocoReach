import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import type { ConversationSummary } from '@nocobase/app-plugin-agents/shared/conversations';
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
  conversationMissing,
  OnlineAgentError,
  onlineApiError,
} from '../nocoreach/online-agent/errors.js';
import { onlineAuthorization } from '../nocoreach/online-agent/host.js';
import { requireOnlineMember } from '../nocoreach/online-agent/access.js';
import { variableProject } from '../nocoreach/online-agent/register.js';
import { nocoReachToken } from '../providers/nocoreach.js';
import { onlineChatSettingsToken } from '../providers/online-agents.js';

type Env = AuthEnv & AuthorizationEnv;

/**
 * The plugin resolves the `nocoreach` scope, where Chat panel › Settings' switch, the person's role and their access to
 * the project are checked, only when a conversation is created; a saved conversation keeps its configuration. So a new
 * message or an approval in an online conversation checks them again here, as every tool call does. Runner
 * conversations pass untouched. Stop stays open; reading and config edits recheck project access even while chat is
 * off. Lists omit conversations the owner can no longer read. Saved scopes and the project binding cannot be removed
 * to bypass these checks. Register before plugin routes.
 */
export const onlineChatGuard: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<Env>();
    const authenticate: MiddlewareHandler<AuthEnv> = async (context, next) => {
      if (!['GET', 'POST', 'PATCH'].includes(context.req.method)) return next();
      return app.container.resolve(authenticationToken).required()(
        context,
        next,
      );
    };
    // Not the caller's or not there: the plugin answers with its own error. Runner conversations are known before the
    // authorization context is built, so they skip it: only reading the online configuration needs it.
    const online = new WeakSet<Request>();
    const identify: MiddlewareHandler<AuthEnv> = async (context, next) => {
      if (!['GET', 'POST', 'PATCH'].includes(context.req.method)) return next();
      const detail = await conversationOrNull(
        app.container.resolve(agentsToken),
        String(context.get('auth')!.user.id),
        context.req.param('conversationId')!,
      );
      if (detail?.agent?.id === ONLINE_AGENT_ID) online.add(context.req.raw);
      return next();
    };
    const authorize: MiddlewareHandler<AuthorizationEnv> = async (
      context,
      next,
    ) => {
      if (!online.has(context.req.raw)) return next();
      return app.container.resolve(authorizationToken).middleware()(
        context,
        next,
      );
    };
    const configuration = (context: Context<Env>, id: string) => {
      const auth = context.get('auth')!;
      return app.container.resolve(agentsToken).onlineAgent.configuration(
        {
          user: { id: String(auth.user.id) },
          authorization: context.get('authz'),
          credentials: auth,
        },
        id,
      );
    };
    const authorizeOnline: MiddlewareHandler<Env> = async (context, next) => {
      if (!online.has(context.req.raw)) return next();
      const ownerId = String(context.get('auth')!.user.id);
      const config = await configuration(
        context,
        context.req.param('conversationId')!,
      );
      const projectId = variableProject(config.variable);
      const host = app.container.resolve(nocoReachToken);
      await host.ready;
      try {
        if (context.req.method === 'POST')
          await onlineAuthorization(host, { ownerId, projectId }, () =>
            app.container.resolve(onlineChatSettingsToken).get(),
          )();
        else {
          await requireOnlineMember(
            host.legacy.db,
            ownerId,
            projectId ?? undefined,
          );
          if (projectId) await host.plugin.project(projectId);
          // History belongs to its original project, including when the owner can currently read both projects.
          if (context.req.method === 'PATCH') {
            const variable = (await bodyOf(context))?.config?.context?.variable;
            if (
              variable !== undefined &&
              variableProject(variable) !== projectId
            )
              throw new OnlineAgentError('accessDenied', 403);
          }
        }
      } catch (error) {
        if (error instanceof OnlineAgentError) throw onlineApiError(error);
        throw error;
      }
      return next();
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
        config?: {
          agentId?: unknown;
          scope?: unknown;
          context?: { variable?: unknown };
        };
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
    const authorizeList: MiddlewareHandler<AuthorizationEnv> = async (
      context,
      next,
    ) => {
      if (context.req.method !== 'GET') return next();
      return app.container.resolve(authorizationToken).middleware()(
        context,
        next,
      );
    };
    const filterList: MiddlewareHandler<Env> = async (context, next) => {
      if (context.req.method !== 'GET') return next();
      await next();
      if (context.res.status !== 200) return;
      const result = (await context.res.clone().json()) as {
        data: ConversationSummary[];
      };
      const ownerId = String(context.get('auth')!.user.id);
      const host = app.container.resolve(nocoReachToken);
      await host.ready;
      // Share checks only within this request; revoked grants must take effect on the next read.
      const projects = new Map<string | null, Promise<void>>();
      const visible = async (item: ConversationSummary) => {
        if (item.agent?.id !== ONLINE_AGENT_ID) return true;
        try {
          const projectId = variableProject(
            (await configuration(context, item.id)).variable,
          );
          let permitted = projects.get(projectId);
          if (!permitted) {
            permitted = requireOnlineMember(
              host.legacy.db,
              ownerId,
              projectId ?? undefined,
            );
            projects.set(projectId, permitted);
          }
          await permitted;
          return true;
        } catch (error) {
          if (
            conversationMissing(error) ||
            (error instanceof OnlineAgentError && error.status === 403)
          )
            return false;
          throw error;
        }
      };
      const filtered: ConversationSummary[] = [];
      // The plugin exposes saved configuration per conversation; bound reads on a full history page.
      for (let offset = 0; offset < result.data.length; offset += 8) {
        const batch = result.data.slice(offset, offset + 8);
        const allowed = await Promise.all(batch.map(visible));
        filtered.push(...batch.filter((_, index) => allowed[index]));
      }
      const headers = new Headers(context.res.headers);
      headers.delete('Content-Length');
      context.res = new Response(
        JSON.stringify({ ...result, data: filtered }),
        { status: context.res.status, headers },
      );
    };
    router.use(
      '/agents/conversations',
      authenticate,
      requireScope,
      authorizeList,
      filterList,
    );
    router.use(
      '/agents/conversations/:conversationId/config',
      authenticate,
      keepScope,
      identify,
      authorize,
      authorizeOnline,
    );
    for (const path of [
      '/agents/conversations/:conversationId',
      '/agents/conversations/:conversationId/messages',
      '/agents/conversations/:conversationId/events',
      '/agents/conversations/:conversationId/approval',
    ])
      router.use(path, authenticate, identify, authorize, authorizeOnline);
    return new Hono().route('/', router);
  });
