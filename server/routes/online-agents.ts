import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  apiErrorHandler,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { onlineChatSettingsToken } from '../providers/online-agents.js';
import { nocoReachToken } from '../providers/nocoreach.js';
import { roleOf } from '../nocoreach/policy.js';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import {
  OnlineAgentError,
  onlineApiError,
} from '../nocoreach/online-agent/errors.js';
import { InsightThreads } from '../nocoreach/online-agent/threads.js';
import { databaseManagerToken } from '@nocobase/db';
import { onlineProjectId as projectId } from '../../shared/online-agent.js';

const model = z.strictObject({
  modelService: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
});
const settings = z.strictObject({
  enabled: z.boolean(),
  instructions: z.string().max(12000),
  model: model.nullable(),
  revision: z.number().int().min(0),
});
// Asked from Insights: the analysis day, and the opportunity when asked from its line.
const thread = z.strictObject({
  projectId,
  day: z.iso.date(),
  opportunityId: z.string().min(1).max(100).optional(),
});
const endpoint = (operationId: string, summary: string) =>
  describeRoute({
    tags: ['Online Agents'],
    operationId,
    summary,
    responses: { 200: dataResponse(z.unknown()), ...apiErrorResponses },
  });
const owner = (context: Pick<Context<AuthEnv>, 'get'>) =>
  String(context.get('auth')!.user.id);

export const onlineAgentRoutes = defineApiRoutes<Application>((app) => {
  const router = new Hono<AuthEnv & AuthorizationEnv>();
  const store = () => app.container.resolve(onlineChatSettingsToken);
  const threads = new InsightThreads(
    app.container.resolve(databaseManagerToken),
    app.container.resolve(agentsToken),
  );
  const runtime = () => app.container.resolve(nocoReachToken);
  const agents = app.container.resolve(agentsToken);
  router.use(
    '/onlineAgents/*',
    app.container.resolve(authenticationToken).required(),
  );
  router.use('/onlineAgents/*', bodyLimit({ maxSize: 100000 }));
  router.use(
    '/onlineAgents/*',
    app.container.resolve(authorizationToken).middleware(),
  );
  router.use('/onlineAgents/*', async (context, next) => {
    await runtime().ready;
    if (
      !(await roleOf(runtime().legacy.db, String(context.get('auth')!.user.id)))
    )
      throw new OnlineAgentError('accessDenied', 403);
    const session = context.req.header('X-NocoReach-Session');
    if (session && session !== context.get('auth')!.session.id)
      throw new OnlineAgentError('sessionChanged');
    context.header('Cache-Control', 'no-store');
    await runtime().legacy.db.access!.run(
      { userId: owner(context), context: context.get('authz') },
      next,
    );
  });
  router.onError((error, context) =>
    apiErrorHandler(
      error instanceof OnlineAgentError ? onlineApiError(error) : error,
      context,
    ),
  );
  const admin = async (context: Pick<Context<AuthEnv>, 'get'>) => {
    await runtime().legacy.db.access!.requireFor(
      owner(context),
      'nrOnline',
      'manage',
    );
  };
  const project = async (projectId: string | null) => {
    await runtime().legacy.db.access!.require(
      'nrOnline',
      'read',
      projectId ?? undefined,
    );
    if (projectId) await runtime().plugin.project(projectId);
  };
  const canRead = (projectId?: string | null) =>
    runtime().legacy.db.access!.allows(
      'nrOnline',
      'read',
      projectId ?? undefined,
    );
  // Shared metadata is needed by readers of any project, including project-only roles.
  const requireReader = async () => {
    if (await canRead()) return;
    const projects = (await runtime().plugin.projects.all()) as {
      id: string | number;
    }[];
    for (const item of projects) if (await canRead(String(item.id))) return;
    throw new OnlineAgentError('accessDenied', 403);
  };
  router.get(
    '/onlineAgents/settings',
    endpoint(
      'readOnlineChatSettings',
      'Read Chat panel settings and whether its model is ready',
    ),
    async (context) => {
      await requireReader();
      const value = await store().get();
      let ready = false;
      try {
        const selected =
          value.model ??
          (await agents.models.services.defaults()).effectiveChat;
        if (selected) {
          await agents.models.services.connectionFor(selected, 'chat');
          ready = true;
        }
      } catch {
        /* No model credentials leave the server. */
      }
      return context.json({ data: { ...value, ready } });
    },
  );
  router.put(
    '/onlineAgents/settings',
    endpoint(
      'updateOnlineChatSettings',
      'Update Chat panel settings at their revision',
    ),
    apiValidator('json', settings),
    async (context) => {
      await admin(context);
      const value = context.req.valid('json');
      if (value.enabled && value.model)
        try {
          await agents.models.services.connectionFor(value.model, 'chat');
        } catch {
          throw new OnlineAgentError('modelUnavailable');
        }
      return context.json({ data: await store().save(value) });
    },
  );
  router.get(
    '/onlineAgents/models',
    endpoint(
      'listOnlineAgentModels',
      'List configured chat models without credentials',
    ),
    async (context) => {
      await requireReader();
      return context.json({
        data: await agents.models.gateway.catalog('chat'),
      });
    },
  );
  router.get(
    '/onlineAgents/threads',
    endpoint(
      'listOnlineInsightThreads',
      "List the current person's conversations asked from Insights in a project",
    ),
    apiValidator('query', z.strictObject({ projectId })),
    async (context) => {
      const { projectId: id } = context.req.valid('query');
      await project(id);
      return context.json({ data: await threads.list(owner(context), id) });
    },
  );
  router.post(
    '/onlineAgents/threads',
    endpoint(
      'startOnlineInsightThread',
      "Start a conversation about a day's analysis; the browser sends its first message",
    ),
    apiValidator('json', thread),
    async (context) => {
      const input = context.req.valid('json');
      await project(input.projectId);
      const auth = context.get('auth')!;
      const id = await threads.start(
        {
          user: { id: owner(context) },
          authorization: context.get('authz'),
          credentials: auth,
        },
        input.projectId,
        {
          kind: 'insights',
          day: input.day,
          ...(input.opportunityId
            ? { opportunityId: input.opportunityId }
            : {}),
        },
      );
      return context.json({ data: { id } });
    },
  );
  return new Hono().route('/', router);
});
