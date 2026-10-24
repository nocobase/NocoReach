import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorStatusFromHttp,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { onlineAgentsToken } from '../providers/online-agents.js';
import { nocoReachToken } from '../providers/nocoreach.js';
import { roleOf } from '../nocoreach/policy.js';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { OnlineAgentError } from '../online-agent/errors.js';

const model = z.strictObject({
  modelService: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
});
const definition = z.strictObject({
  name: z.string().trim().min(1).max(80),
  instructions: z.string().max(12000),
  enabled: z.boolean(),
  model: model.nullable(),
  revision: z.number().int().min(0),
});
const id = z.strictObject({
  id: z.string().regex(/^online-(?:[a-z]+-)?[a-zA-Z0-9-]{1,90}$/),
});
const message = z.strictObject({
  requestId: z.uuid(),
  revision: z.number().int().min(0),
  text: z.string().trim().min(1).max(30000),
});
const projectId = z.string().regex(/^[1-9]\d{0,15}$/);
// Asked from Insights: the analysis day, and the opportunity when asked from its line.
const subject = z.strictObject({
  kind: z.literal('insights'),
  day: z.iso.date(),
  opportunityId: z.string().min(1).max(100).optional(),
});
const createConversation = z
  .strictObject({
    requestId: z.uuid(),
    agentId: z.string().min(1).max(100),
    model: model.nullable().optional(),
    projectId: projectId.nullable().default(null),
    subject: subject.nullable().optional(),
    text: z.string().trim().min(1).max(30000),
  })
  .refine((v) => !v.subject || v.projectId, {
    message: 'A conversation asked from Insights belongs to a project',
    path: ['projectId'],
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
  const service = () => app.container.resolve(onlineAgentsToken);
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
      error instanceof OnlineAgentError
        ? new ApiError({
            status: apiErrorStatusFromHttp(error.status),
            domain: 'onlineAgent',
            reason: error.code,
            message: error.code,
          })
        : error,
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
    '/onlineAgents/definitions',
    endpoint(
      'listOnlineAgents',
      'List online agents and their model readiness',
    ),
    async (context) => {
      await requireReader();
      const definitions = await service().definitions();
      const list = await Promise.all(
        definitions.map(async (agent) => {
          let ready = false;
          if (agent.enabled)
            try {
              await service().resolveModel(agent.model);
              ready = true;
            } catch {
              /* No model credentials leave the server. */
            }
          return { ...agent, ready };
        }),
      );
      return context.json({ data: list });
    },
  );
  router.post(
    '/onlineAgents/definitions',
    endpoint('createOnlineAgent', 'Create an online agent'),
    apiValidator('json', definition),
    async (context) => {
      await admin(context);
      return context.json({
        data: await service().saveDefinition(context.req.valid('json')),
      });
    },
  );
  router.put(
    '/onlineAgents/definitions/:id',
    endpoint('updateOnlineAgent', 'Update an online agent at its revision'),
    apiValidator('param', id),
    apiValidator('json', definition),
    async (context) => {
      await admin(context);
      return context.json({
        data: await service().saveDefinition(
          context.req.valid('json'),
          context.req.valid('param').id,
        ),
      });
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
    '/onlineAgents/conversations',
    endpoint(
      'listOnlineConversations',
      "List only the current person's online conversations",
    ),
    async (context) => {
      const visible = [];
      for (const conversation of await service().conversations(owner(context)))
        if (await canRead(conversation.projectId)) visible.push(conversation);
      return context.json({ data: visible });
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
      return context.json({
        data: await service().threads(owner(context), id),
      });
    },
  );
  router.post(
    '/onlineAgents/conversations',
    endpoint(
      'createOnlineConversation',
      'Start an online conversation idempotently',
    ),
    apiValidator('json', createConversation),
    async (context) => {
      const input = context.req.valid('json');
      await project(input.projectId);
      return context.json({
        data: await service().send(owner(context), input),
      });
    },
  );
  router.get(
    '/onlineAgents/conversations/:id',
    endpoint(
      'readOnlineConversation',
      'Read an owned online conversation and execution records',
    ),
    apiValidator('param', id),
    async (context) => {
      const conversation = await service().conversation(
        context.req.valid('param').id,
        owner(context),
      );
      await project(conversation.projectId);
      return context.json({
        data: {
          conversation,
          runs: await service().conversationRuns(conversation),
        },
      });
    },
  );
  router.post(
    '/onlineAgents/conversations/:id/messages',
    endpoint(
      'sendOnlineMessage',
      'Queue another turn in an owned conversation',
    ),
    apiValidator('param', id),
    apiValidator('json', message),
    async (context) => {
      const conversation = await service().conversation(
        context.req.valid('param').id,
        owner(context),
      );
      await project(conversation.projectId);
      return context.json({
        data: await service().send(owner(context), {
          ...context.req.valid('json'),
          conversationId: conversation.id,
        }),
      });
    },
  );
  router.post(
    '/onlineAgents/runs/:id/cancel',
    endpoint('cancelOnlineConversationRun', 'Cancel an owned conversation run'),
    apiValidator('param', id),
    apiValidator('json', z.strictObject({})),
    async (context) => {
      const run = await service().run(context.req.valid('param').id);
      if (run.ownerId !== owner(context))
        throw new OnlineAgentError('runNotFound', 404);
      const conversation = await service().conversation(
        run.conversationId,
        owner(context),
      );
      await project(conversation.projectId);
      return context.json({
        data: await service().cancel(run.id),
      });
    },
  );
  return new Hono().route('/', router);
});
