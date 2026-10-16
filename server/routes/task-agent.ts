import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  agentsToken,
  runIdentityOf,
} from '@nocobase/app-plugin-agents/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorStatusFromHttp,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  cliRoute,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type MiddlewareHandler } from 'hono';
import { nocoReachToken } from '../providers/nocoreach.js';
import type { TaskService } from '../nocoreach/execution/service.js';
import { TASK_DRAFT, TASK_READ } from '../nocoreach/execution/task-business.js';
import {
  TaskAgentDataQuery,
  TaskAgentData,
  TaskAgentDraftInput,
  TaskAgentDraft,
  TaskAgentResultInput,
  TaskAgentResult,
} from './schemas.js';

export const taskAgentRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthEnv>();
    const auth = app.container.resolve(authenticationToken);
    const agents = app.container.resolve(agentsToken);
    const runtime = () => app.container.resolve(nocoReachToken);
    const business = () =>
      (runtime().plugin as unknown as { taskExecution: TaskService })
        .taskExecution.business;
    const allow =
      (action: string): MiddlewareHandler<AuthEnv> =>
      async (context, next) => {
        await runtime().ready;
        const identity = runIdentityOf(context.get('auth'));
        if (!identity || !(await agents.gate.allowed(identity)).has(action))
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            domain: 'nocoreach',
            reason: 'TASK_AGENT_DENIED',
            message:
              'This command requires an active NocoReach task run with the corresponding agent capability.',
          });
        try {
          await next();
        } catch (error) {
          if (error instanceof ApiError) throw error;
          const status = (error as { status?: number }).status;
          if (status === 403 || status === 409)
            throw new ApiError({
              status: apiErrorStatusFromHttp(status),
              domain: 'nocoreach',
              reason: 'TASK_RUN_CHANGED',
              message: (error as Error).message,
              localizedMessage: {
                locale: 'zh-CN',
                message: (error as Error).message,
              },
            });
          throw error;
        }
      };
    // Run tokens are scoped credentials; allow them here, then require the current task identity.
    routes.use('*', auth.required({ scopedKeys: true }));
    routes.get(
      '/data',
      allow(TASK_READ),
      describeRoute({
        tags: ['NocoReach Tasks'],
        summary: 'Read a snapshot of the current task',
        operationId: 'readCurrentTaskData',
        security: [{ runToken: [] }],
        responses: {
          200: dataResponse(TaskAgentData),
          ...apiErrorResponses,
          409: apiErrorResponse(409),
        },
        ...cliRoute({
          command: 'task data',
          action: TASK_READ,
          examples: [
            'task data --section sources',
            'task data --section metrics',
          ],
        }),
      }),
      apiValidator('query', TaskAgentDataQuery),
      async (context) =>
        context.json({
          data: await business().data(
            runIdentityOf(context.get('auth'))!,
            context.req.valid('query').section,
            context.req.valid('query').offset,
            context.req.valid('query').limit,
          ),
        }),
    );
    routes.put(
      '/draft',
      allow(TASK_DRAFT),
      describeRoute({
        tags: ['NocoReach Tasks'],
        summary: 'Save a candidate draft for the current task run',
        operationId: 'saveCurrentTaskDraft',
        description:
          'Does not approve, publish, or complete the task. Submit the final structured result to finish the run.',
        security: [{ runToken: [] }],
        responses: {
          200: dataResponse(TaskAgentDraft),
          ...apiErrorResponses,
          409: apiErrorResponse(409),
        },
        ...cliRoute({
          command: 'task draft',
          action: TASK_DRAFT,
          flags: { content: { contentFile: true } },
          examples: ['task draft --content-file draft.md'],
        }),
      }),
      apiValidator('json', TaskAgentDraftInput),
      async (context) =>
        context.json({
          data: await business().draft(
            runIdentityOf(context.get('auth'))!,
            context.req.valid('json').content,
          ),
        }),
    );
    routes.put(
      '/result',
      allow(TASK_DRAFT),
      describeRoute({
        tags: ['NocoReach Tasks'],
        summary: 'Validate and submit the current task result',
        operationId: 'submitCurrentTaskResult',
        description:
          'Send the complete result JSON as content (or --content-file result.json). Validation errors identify the field; correct only that payload and retry at most twice. A successful submission is immutable and idempotent. It is applied only when the Runner completes, never on cancellation or failure; human review is still required.',
        security: [{ runToken: [] }],
        responses: {
          200: dataResponse(TaskAgentResult),
          ...apiErrorResponses,
          409: apiErrorResponse(409),
          400: apiErrorResponse(400),
        },
        ...cliRoute({
          command: 'task result',
          action: TASK_DRAFT,
          flags: { content: { contentFile: true } },
          examples: ['task result --content-file result.json'],
        }),
      }),
      apiValidator('json', TaskAgentResultInput),
      async (context) =>
        context.json({
          data: await business()
            .submit(
              runIdentityOf(context.get('auth'))!,
              context.req.valid('json').content,
            )
            .catch((error: unknown) => {
              if ((error as { status?: number }).status === 422)
                throw new ApiError({
                  status: 'INVALID_ARGUMENT',
                  domain: 'nocoreach',
                  reason: 'INVALID_TASK_RESULT',
                  message: (error as Error).message,
                  localizedMessage: {
                    locale: 'zh-CN',
                    message: (error as Error).message,
                  },
                });
              throw error;
            }),
        }),
    );
    router.route('/nocoreachAgent', routes);
    return router;
  });
