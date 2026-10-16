import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { z } from 'zod';
import { nocoReachToken } from '../providers/nocoreach.js';
import { DAILY_TIME } from '../nocoreach/schedule-management.js';

const Params = z.object({ id: z.string().min(1).max(128) });
const Timing = z.object({ time: z.string().regex(DAILY_TIME) }).strict();
const Trigger = z.object({ requestId: z.uuid() }).strict();

export const scheduleManagementRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const authentication = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    routes.onError(apiErrorHandler);
    routes.use('*', authentication.required(), authorization.middleware());
    routes.use('*', async (context, next) => {
      if (
        !(await context.get('authz').can({
          resource: { type: 'page', id: 'scheduler.schedules' },
          action: 'access',
        }))
      ) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'SCHEDULE_ACCESS_REQUIRED',
          domain: 'nocoreach',
          message: 'Schedule access is required.',
        });
      }
      await next();
    });
    const requireSchedule = async (id: string) => {
      const runtime = app.container.resolve(nocoReachToken);
      await runtime.ready;
      if (!(await runtime.schedules.supported(id)))
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'SCHEDULE_NOT_FOUND',
          domain: 'nocoreach',
          message: 'Schedule is not available for management.',
        });
      return runtime.schedules;
    };
    routes.put(
      '/:id/timing',
      describeRoute({
        tags: ['NocoReach'],
        summary: 'Change daily analysis time',
        operationId: 'updateNocoReachScheduleTiming',
        responses: {
          '200': dataResponse(z.unknown()),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', Params),
      apiValidator('json', Timing),
      async (context) => {
        const service = await requireSchedule(context.req.valid('param').id);
        const data = await service.save(context.req.valid('json').time);
        return context.json({ data });
      },
    );
    routes.post(
      '/:id/trigger',
      describeRoute({
        tags: ['NocoReach'],
        summary: 'Trigger daily analysis once',
        operationId: 'triggerNocoReachSchedule',
        responses: {
          '200': dataResponse(z.object({ occurrenceId: z.string() })),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', Params),
      apiValidator('json', Trigger),
      async (context) => {
        const service = await requireSchedule(context.req.valid('param').id);
        const data = await service.trigger(context.req.valid('json').requestId);
        return context.json({ data });
      },
    );
    router.route('/nocoreach/schedules', routes);
    return router;
  });
