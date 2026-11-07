import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { scopedApiKeysToken } from '@nocobase/app-plugin-api-keys/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
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
 * no permission beyond being signed in. A message names its task only while the viewer may still read it through the
 * task API (nrTaskWork get on its project): once they leave the project or lose the permission, `task` is null.
 */
export const inboxNoticeRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthEnv & AuthorizationEnv>();
    const keys = app.container.resolve(scopedApiKeysToken);
    routes.onError(apiErrorHandler);
    routes.use('*', app.container.resolve(authenticationToken).required());
    routes.use('*', app.container.resolve(authorizationToken).middleware());
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
        const session = context.get('auth')!;
        const userId = String(session.user.id);
        const access = runtime.legacy.db.access!;
        const tasks = async (taskIds: readonly string[]) => {
          // No longer a NocoReach member: none of their tasks is readable.
          if (!(await access.roleFor(context.req.raw, userId))) return [];
          const keyScope = await keys.resolve(session, context.req.raw);
          const rows = (
            await runtime.legacy.db.getRepository('nrTasks').find({
              filter: { id: { $in: [...taskIds] } },
              fields: ['id', 'projectId', 'title', 'updatedAt', 'evidence'],
            })
          ).map((row) => row.toJSON() as unknown as TaskRow);
          return access.run(
            {
              userId,
              http: context.req.raw,
              context: context.get('authz'),
              ...(keyScope ? { keyScope } : {}),
            },
            async () => {
              const readable: TaskRow[] = [];
              for (const row of rows)
                if (
                  await access.allows(
                    'nrTaskWork',
                    'get',
                    String(row.projectId),
                  )
                )
                  readable.push(row);
              return readable;
            },
          );
        };
        const data = await runtime.inboxNotices.list(
          userId,
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
