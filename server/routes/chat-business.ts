import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { scopedApiKeysToken } from '@nocobase/app-plugin-api-keys/server';
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

// Preserve browser-owned OAuth cookies, credential headers and the connection
// routes' confirmation-session preconditions. Never synthesize a browser session.
const browserActions = new Map([
  ['nrGoogle/authorize', 'gsc'],
  ['nrGoogle/configure', 'gsc'],
  ['nrGitHub/setToken', 'github-traffic'],
  ['nrKeywords/configure', 'keywords'],
  ['nrYouTube/connect', 'youtube'],
  ['nrYouTube/disconnect', 'youtube'],
  ['nrYouTube/clear', 'youtube'],
  ['nrBilibili/disconnect', 'bilibili'],
  ['nrXiaohongshu/disconnect', 'xiaohongshu'],
]);

// Conversation runs may prepare and operate tasks, but cannot attest to a human
// review, manual execution, or publication. New commands require an explicit
// decision here before agents can execute them.
const conversationTaskCommands = new Set([
  'startTask',
  'selectPlaybook',
  'setAgent',
  'takeOwnership',
  'setOwner',
  'setCollaborators',
  'linkContent',
  'linkPage',
  'savePlan',
  'saveResult',
  'editStageOutput',
  'replan',
  'comment',
  'retryStage',
  'recoverResult',
  'cancelRun',
  'cancelTask',
  'archiveTask',
  'unarchiveTask',
]);

/** Chat commands act as the authenticated person and reuse the same business actions as the UI. */
export const chatBusinessRoutes = defineApiRoutes<Application>((app) => {
  const routes = new Hono<AuthEnv & AuthorizationEnv>();
  const auth = app.container.resolve(authenticationToken);
  const authorization = app.container.resolve(authorizationToken);
  const keys = app.container.resolve(scopedApiKeysToken);
  const agents = app.container.resolve(agentsToken);
  const runtime = () => app.container.resolve(nocoReachToken);
  routes.use('/nocoreachChat/*', auth.required({ scopedKeys: true }));
  routes.use('/nocoreachChat/*', authorization.middleware());
  routes.use('/nocoreachChat/*', async (c, next) => {
    await runtime().ready;
    const identity = runIdentityOf(c.get('auth'));
    if (!identity || !(await agents.gate.allowed(identity)).has(CHAT_BUSINESS))
      throw businessApiError(
        403,
        'taskExecution.executionAuthorizationExpired',
        'CHAT_BUSINESS_DENIED',
      );
    await next();
  });
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
      'Execute an existing NocoReach business operation as the conversation user. Pass its input in values (or --values-file). User permissions, task ownership, revisions and workflow checks still apply. Human review, manual execution and publication confirmations, connection session confirmations, OAuth and credential configuration return a browser handoff; the user must open that page, select projectId and configure there. Never ask for credentials in the conversation.',
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
      const session = c.get('auth')!;
      const user = session.user;
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
      const keyScope = await keys.resolve(session, c.req.raw);
      try {
        return await host.legacy.db.access!.run(
          {
            userId: String(user.id),
            http: c.req.raw,
            context: c.get('authz'),
            ...(keyScope ? { keyScope } : {}),
          },
          async () => {
            const project =
              typeof values.projectId === 'string' ||
              typeof values.projectId === 'number'
                ? String(values.projectId)
                : '';
            const needsHumanReview =
              resource === 'nrTaskWork' &&
              action === 'advance' &&
              !conversationTaskCommands.has(String(values.command));
            const browserSource = browserActions.get(`${resource}/${action}`);
            if (needsHumanReview || browserSource) {
              // These commands are deferred to the browser regardless of command-level
              // grants; only the shared resource/action boundary applies here.
              await host.legacy.db.access!.require(
                resource,
                action,
                project || undefined,
              );
              if (needsHumanReview) {
                if (!/^[1-9]\d{0,15}$/.test(String(values.taskId)))
                  throw businessApiError(400, 'taskWork.invalidTaskNumber');
                return c.json({
                  data: {
                    requiresBrowser: true,
                    projectId: values.projectId,
                    taskId: String(values.taskId),
                    url: `${app.publicBasePath}/actions/${String(values.taskId)}`,
                  },
                });
              }
              return c.json({
                data: {
                  requiresBrowser: true,
                  projectId: values.projectId,
                  url: `${app.publicBasePath}/connections?source=${browserSource}`,
                },
              });
            }
            await requireAccess(ctx);
            const invoke = () => fn(ctx, async () => {});
            if (host.plugin.mock?.enabled)
              await host.plugin.network.runProject(project, invoke);
            else await host.plugin.network.run(project, invoke);
            return c.json({ data: ctx.body ?? null });
          },
        );
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 600)
          throw businessApiError(status, (error as Error).message);
        throw error;
      }
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
