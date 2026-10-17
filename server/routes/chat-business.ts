import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  agentsToken,
  runIdentityOf,
} from '@nocobase/app-plugin-agents/server/tokens';
import {
  apiErrorResponses,
  apiValidator,
  cliRoute,
  dataResponse,
  defineApiRoutes,
  describeRoute,
} from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import { Hono } from 'hono';
import { z } from 'zod';
import { nocoReachToken } from '../providers/nocoreach.js';
import { manualTasksToken } from '../providers/manual-tasks.js';
import { CHAT_BUSINESS } from '../nocoreach/execution/task-business.js';
import { legacyContext } from '../nocoreach/legacy/context.js';
import { requireAccess, adminOnly, roleOf } from '../nocoreach/policy.js';
import { businessApiError } from '../nocoreach/api-error.js';
import { ManualTaskInput, ManualTaskView } from '../../shared/manual-task.js';

const ActionInput = z.strictObject({
  resource: z.string().regex(/^nr[A-Za-z]{1,40}$/),
  action: z.string().regex(/^[A-Za-z]{1,40}$/),
  values: z.record(z.string(), z.unknown()).default({}),
});

/** Chat commands act as the authenticated person and reuse the same business actions as the UI. */
export const chatBusinessRoutes = defineApiRoutes<Application>((app) => {
  const routes = new Hono<AuthEnv>();
  const auth = app.container.resolve(authenticationToken);
  const agents = app.container.resolve(agentsToken);
  const runtime = () => app.container.resolve(nocoReachToken);
  routes.use(
    '/nocoreachChat/*',
    auth.required({ scopedKeys: true }),
    async (c, next) => {
      await runtime().ready;
      const identity = runIdentityOf(c.get('auth'));
      if (
        !identity ||
        !(await agents.gate.allowed(identity)).has(CHAT_BUSINESS)
      )
        throw businessApiError(
          403,
          'taskExecution.executionAuthorizationExpired',
          'CHAT_BUSINESS_DENIED',
        );
      await next();
    },
  );
  const declaration = (
    operationId: string,
    summary: string,
    command: string,
    schema: z.ZodType,
  ) =>
    describeRoute({
      tags: ['NocoReach Chat'],
      operationId,
      summary,
      security: [{ runToken: [] }],
      responses: { 200: dataResponse(schema), ...apiErrorResponses },
      ...cliRoute({
        command,
        action: CHAT_BUSINESS,
        identities: ['run'],
        flags: { values: { contentFile: true } },
      }),
    });
  routes.get(
    '/nocoreachChat/actions',
    declaration(
      'listChatBusinessActions',
      'Discover NocoReach business operations. Call business action with resource, action and a JSON values object. Start with nrProjects/list; task operations take projectId. nrTaskWork/list returns tasks, get takes taskId, advance takes taskId, revision, requestId (UUID) and command. Read get before advance; use its available actions and current revision. business task create creates a pending task; advance starts or updates it.',
      'business actions',
      z.array(z.object({ resource: z.string(), action: z.string() })),
    ),
    async (c) => {
      const host = runtime();
      const userId = String(c.get('auth')!.user.id);
      const role = (await roleOf(host.legacy.db, userId)) as string | null;
      return c.json({
        data: host.legacy.resources
          .list()
          .filter(
            ({ resource, action }) =>
              host.legacy.resources.level(resource, action) !== 'public' &&
              (role === 'admin' || !adminOnly(resource, action)),
          ),
      });
    },
  );
  routes.post(
    '/nocoreachChat/action',
    declaration(
      'executeChatBusinessAction',
      'Execute an existing NocoReach business operation as the conversation user. Pass its input in values (or --values-file). User permissions, task ownership, revisions and workflow checks still apply. Google authorization returns a browser handoff; the user must open that page, select projectId and authorize there.',
      'business action',
      z.unknown(),
    ),
    apiValidator('json', ActionInput),
    async (c) => {
      const host = runtime();
      const { resource, action, values } = c.req.valid('json');
      const fn = host.legacy.resources.action(resource, action);
      if (!fn || host.legacy.resources.level(resource, action) === 'public')
        throw businessApiError(404, '没有这个操作');
      const user = c.get('auth')!.user;
      const ctx = legacyContext({
        resource,
        action,
        method: 'POST',
        query: {},
        body: values,
        user: { id: String(user.id), name: user.name, email: user.email },
        roles: (await host.users.isRoot(String(user.id))) ? ['root'] : [],
        header: () => undefined,
        cookie: () => undefined,
        app: host.legacy,
        cache: host.cache,
        logger: host.logger,
      });
      try {
        await requireAccess(ctx);
        // OAuth nonce cookies belong in the user's browser, never in a Runner or model context.
        if (resource === 'nrGoogle' && action === 'authorize')
          return c.json({
            data: {
              requiresBrowser: true,
              projectId: values.projectId,
              url: `${app.publicBasePath}/connections?source=gsc`,
            },
          });
        const invoke = () => fn(ctx, async () => {});
        const project =
          typeof values.projectId === 'string' ||
          typeof values.projectId === 'number'
            ? String(values.projectId)
            : '';
        if (host.plugin.mock?.enabled)
          await host.plugin.network.runProject(project, invoke);
        else await host.plugin.network.run(project, invoke);
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 600)
          throw businessApiError(status, (error as Error).message);
        throw error;
      }
      return c.json({ data: ctx.body ?? null });
    },
  );
  routes.post(
    '/nocoreachChat/tasks',
    declaration(
      'createChatTask',
      'Create a pending task as the conversation user. Reuse requestId for retries. Start execution separately through nrTaskWork/advance.',
      'business task create',
      ManualTaskView,
    ),
    apiValidator('json', ManualTaskInput),
    async (c) => {
      const session = c.get('auth')!;
      return c.json({
        data: await app.container.resolve(manualTasksToken).create(
          {
            id: String(session.user.id),
            name: session.user.name || String(session.user.id),
            sessionId: session.session.id,
          },
          c.req.valid('json'),
        ),
      });
    },
  );
  return new Hono().route('/', routes);
});
