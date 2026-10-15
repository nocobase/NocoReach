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
import { OnlineAgentError } from '../online-agent/contracts.js';

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
const createConversation = z.strictObject({
  requestId: z.uuid(),
  agentId: z.string().min(1).max(100),
  model: model.nullable().optional(),
  projectId: z
    .string()
    .regex(/^[1-9]\d{0,15}$/)
    .nullable()
    .default(null),
  text: z.string().trim().min(1).max(30000),
});
const endpoint = (operationId: string, summary: string) =>
  describeRoute({
    tags: ['Online Agents'],
    operationId,
    summary,
    responses: { 200: dataResponse(z.unknown()), ...apiErrorResponses },
  });
const owner = (context: Context<AuthEnv>) =>
  String(context.get('auth')!.user.id);

export const onlineAgentRoutes = defineApiRoutes<Application>((app) => {
  const router = new Hono<AuthEnv>();
  const service = () => app.container.resolve(onlineAgentsToken);
  const runtime = () => app.container.resolve(nocoReachToken);
  const agents = app.container.resolve(agentsToken);
  router.use(
    '/onlineAgents/*',
    app.container.resolve(authenticationToken).required(),
  );
  router.use('/onlineAgents/*', bodyLimit({ maxSize: 100000 }));
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
    await next();
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
  const admin = async (context: Context<AuthEnv>) => {
    if ((await roleOf(runtime().legacy.db, owner(context))) !== 'admin')
      throw new OnlineAgentError('accessDenied', 403);
  };
  const project = async (projectId: string | null) => {
    if (projectId) await runtime().plugin.project(projectId);
  };
  router.get(
    '/onlineAgents/definitions',
    endpoint(
      'listOnlineAgents',
      'List online agents and their model readiness',
    ),
    async (context) => {
      const definitions = await service().definitions();
      const list = await Promise.all(
        definitions.map(async (agent) => {
          let ready = false;
          if (agent.enabled)
            try {
              await service().models.resolve(agent.model);
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
    async (context) =>
      context.json({ data: await agents.models.gateway.catalog('chat') }),
  );
  router.get(
    '/onlineAgents/conversations',
    endpoint(
      'listOnlineConversations',
      "List only the current person's online conversations",
    ),
    async (context) =>
      context.json({ data: await service().conversations(owner(context)) }),
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
        data: await service().createConversation({
          ...input,
          ownerId: owner(context),
        }),
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
        data: await service().send(
          conversation.id,
          owner(context),
          context.req.valid('json'),
        ),
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
      if (run.ownerId !== owner(context) || run.subject.kind !== 'conversation')
        throw new OnlineAgentError('runNotFound', 404);
      const conversation = await service().conversation(
        run.subject.id,
        owner(context),
      );
      await project(conversation.projectId);
      return context.json({ data: await service().cancel(run.id) });
    },
  );
  return new Hono().route('/', router);
});
