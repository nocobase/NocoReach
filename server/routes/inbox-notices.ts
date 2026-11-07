import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  apiErrorHandler,
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
import { waitsForReview } from '../nocoreach/execution/model.js';
import type { TaskRow } from '../nocoreach/inbox-notices.js';

const Query = z.object({ ids: z.string().max(4000) }).strict();
const Notice = z.object({
  notificationId: z.string(),
  type: z.string(),
  task: z
    .object({
      id: z.string(),
      projectId: z.string(),
      label: z.string(),
      resolvedAt: z.string().nullable(),
    })
    .nullable(),
});

/**
 * What NocoReach knows about the signed-in user's own in-app messages (server/nocoreach/inbox-notices.ts): their kind
 * and the task each is about, for the Inbox's details and actions. Only the viewer's messages are read, so it needs
 * no permission beyond being signed in; the task itself is read through the task API, which checks access.
 */
export const inboxNoticeRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthEnv>();
    routes.onError(apiErrorHandler);
    routes.use('*', app.container.resolve(authenticationToken).required());
    routes.get(
      '/notices',
      describeRoute({
        tags: ['NocoReach'],
        summary: "Describe the signed-in user's NocoReach inbox messages",
        operationId: 'listNocoReachInboxNotices',
        responses: {
          '200': dataResponse(z.array(Notice)),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', Query),
      async (context) => {
        const runtime = app.container.resolve(nocoReachToken);
        await runtime.ready;
        const ids = context.req
          .valid('query')
          .ids.split(',')
          .map((id) => id.trim())
          .filter(Boolean);
        const tasks = async (taskIds: readonly string[]) =>
          (
            await runtime.legacy.db.getRepository('nrTasks').find({
              filter: { id: { $in: [...taskIds] } },
              fields: ['id', 'projectId', 'title', 'updatedAt', 'evidence'],
            })
          ).map((row) => row.toJSON() as unknown as TaskRow);
        const data = await runtime.inboxNotices.list(
          String(context.get('auth')!.user.id),
          ids,
          tasks,
          waitsForReview as (work: unknown) => boolean,
        );
        return context.json({ data });
      },
    );
    router.route('/nocoreachInbox', routes);
    return router;
  });
