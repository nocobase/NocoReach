import { Readable } from 'node:stream';
import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  ApiError,
  apiErrorHandler,
  apiErrorStatusFromHttp,
  apiErrorResponses,
  apiErrorResponse,
  apiValidator,
  cliRoute,
  dataResponse,
  defineApiRoutes,
  defineRootRoutes,
  describeRoute,
} from '@nocobase/app-server/router';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { manualTasksToken } from '../providers/manual-tasks.js';
import { nocoReachToken } from '../providers/nocoreach.js';
import { roleOf } from '../nocoreach/policy.js';
import type { TaskCreator } from '../nocoreach/manual-tasks.js';
import {
  ManualTaskInput,
  ManualTaskView,
  TaskMediaView,
  TASK_MEDIA_LIMIT,
} from '../../shared/manual-task.js';

function creator(context: Context<AuthEnv>): TaskCreator {
  const auth = context.get('auth');
  if (!auth)
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      domain: 'nocoreach',
      reason: 'TASK_SIGN_IN',
      message: 'Sign in to create tasks.',
    });
  return {
    id: String(auth.user.id),
    name: auth.user.name || String(auth.user.id),
    sessionId: auth.session.id,
  };
}
const mediaQuery = z.strictObject({
  projectId: z.string().regex(/^[1-9]\d{0,15}$/),
  requestId: z.uuid(),
});
const fileParam = z.strictObject({ fileId: z.uuid() });

function member(app: Application): MiddlewareHandler<AuthEnv> {
  return async (context, next) => {
    const runtime = app.container.resolve(nocoReachToken);
    await runtime.ready;
    const actor = creator(context);
    const expected = context.req.header('X-NocoReach-Task-Session');
    if (expected && expected !== actor.sessionId)
      throw new ApiError({
        status: 'ALREADY_EXISTS',
        domain: 'nocoreach',
        reason: 'TASK_SESSION_CHANGED',
        message: 'The sign-in session changed.',
      });
    if (
      !(await runtime.users.isRoot(actor.id)) &&
      !(await roleOf(runtime.legacy.db, actor.id))
    )
      throw new ApiError({
        status: 'PERMISSION_DENIED',
        domain: 'nocoreach',
        reason: 'TASK_CREATE_DENIED',
        message: 'NocoReach membership is required.',
      });
    try {
      await next();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const status = (error as { status?: unknown }).status;
      if (typeof status === 'number' && status >= 400 && status < 500)
        throw new ApiError({
          status: apiErrorStatusFromHttp(status),
          domain: 'nocoreach',
          reason: 'TASK_PROJECT_UNAVAILABLE',
          message: 'The project or playbook is unavailable.',
        });
      throw error;
    }
  };
}

export const manualTaskRoutes = defineApiRoutes<Application>((app) => {
  const routes = new Hono<AuthEnv>();
  const auth = app.container.resolve(authenticationToken);
  const service = () => app.container.resolve(manualTasksToken);
  routes.use('/nocoreachTasks/*', auth.required(), member(app));
  routes.use('/nocoreachTasks', auth.required(), member(app));
  routes.post(
    '/nocoreachTasks',
    describeRoute({
      tags: ['NocoReach Tasks'],
      summary: 'Create a manual task',
      operationId: 'createManualTask',
      description:
        'Creates a pending task without starting execution. Identical requestId retries return the same task; changed input returns 409.',
      responses: {
        201: dataResponse(ManualTaskView),
        ...apiErrorResponses,
        409: apiErrorResponse(409),
      },
      ...cliRoute({
        command: 'task create',
        identities: ['person'],
        flags: {
          projectId: { name: 'project' },
          description: { contentFile: true },
        },
        examples: [
          'task create --project 1 --title "Review page" --description-file brief.md --request-id <uuid>',
        ],
      }),
    }),
    apiValidator('json', ManualTaskInput),
    async (context) =>
      context.json(
        {
          data: await service().create(
            creator(context),
            context.req.valid('json'),
          ),
        },
        201,
      ),
  );
  routes.post(
    '/nocoreachTasks/media',
    apiValidator('query', mediaQuery),
    async (context, next) => {
      await service().authorize(
        creator(context),
        context.req.valid('query').projectId,
      );
      await next();
    },
    describeRoute({
      tags: ['NocoReach Tasks'],
      summary: 'Upload an image or video for a task draft',
      operationId: 'uploadManualTaskMedia',
      responses: {
        201: dataResponse(TaskMediaView),
        ...apiErrorResponses,
        413: apiErrorResponse(413),
        429: apiErrorResponse(429),
      },
      ...cliRoute(false),
    }),
    bodyLimit({
      maxSize: TASK_MEDIA_LIMIT + 65536,
      onError: () => {
        throw new ApiError({
          status: 'INVALID_ARGUMENT',
          httpStatus: 413,
          domain: 'nocoreach',
          reason: 'TASK_MEDIA_TOO_LARGE',
          message: 'Files must be at most 20 MiB.',
        });
      },
    }),
    apiValidator('form', z.strictObject({ file: z.instanceof(File) })),
    async (context) => {
      const input = context.req.valid('query');
      return context.json(
        {
          data: await service().upload(
            creator(context),
            input.projectId,
            input.requestId,
            context.req.valid('form').file,
          ),
        },
        201,
      );
    },
  );
  routes.get(
    '/nocoreachTasks/:taskId/media',
    describeRoute({
      tags: ['NocoReach Tasks'],
      summary: 'Read task media',
      operationId: 'readManualTaskMedia',
      responses: {
        200: dataResponse(z.array(TaskMediaView)),
        ...apiErrorResponses,
        404: apiErrorResponse(404),
      },
      ...cliRoute(false),
    }),
    apiValidator(
      'param',
      z.strictObject({ taskId: z.string().regex(/^\d+$/) }),
    ),
    apiValidator(
      'query',
      z.strictObject({ projectId: z.string().regex(/^[1-9]\d{0,15}$/) }),
    ),
    async (context) =>
      context.json({
        data: await service().list(
          creator(context),
          context.req.valid('query').projectId,
          context.req.valid('param').taskId,
        ),
      }),
  );
  routes.delete(
    '/nocoreachTasks/media/:fileId',
    describeRoute({
      tags: ['NocoReach Tasks'],
      summary: 'Discard an unlinked draft file',
      operationId: 'discardManualTaskMedia',
      responses: {
        200: dataResponse(z.object({ deleted: z.boolean() })),
        ...apiErrorResponses,
        404: apiErrorResponse(404),
      },
      ...cliRoute(false),
    }),
    apiValidator('param', fileParam),
    async (context) => {
      await service().discard(
        creator(context),
        context.req.valid('param').fileId,
      );
      return context.json({ data: { deleted: true } });
    },
  );
  return new Hono().route('/', routes);
});

export const taskMediaContentRoutes = defineRootRoutes<Application>((app) => {
  const routes = new Hono<AuthEnv>();
  routes.onError(apiErrorHandler);
  const auth = app.container.resolve(authenticationToken);
  routes.use('/uploads/task-media/*', auth.required(), member(app));
  routes.get('/uploads/task-media/:file', async (context) => {
    const match = /^([0-9a-f-]{36})(?:\.([a-z0-9]{1,32}))?$/.exec(
      context.req.param('file'),
    );
    if (!match || !z.uuid().safeParse(match[1]).success)
      return context.notFound();
    const file = await app.container
      .resolve(manualTasksToken)
      .read(creator(context), match[1]);
    if (file.ext !== (match[2] ?? '')) return context.notFound();
    const disk = app.container.resolve(driveManagerToken).use(file.disk);
    context.header('Content-Type', file.mimeType);
    context.header('Content-Length', String(file.size));
    context.header('X-Content-Type-Options', 'nosniff');
    context.header('Cache-Control', 'private, no-store');
    context.header('Accept-Ranges', 'bytes');
    context.header(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    );
    const range = context.req.header('Range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const size = Number(file.size);
      const start = match?.[1]
        ? Number(match[1])
        : Math.max(0, size - Number(match?.[2]));
      const end =
        match?.[1] && match[2]
          ? Math.min(Number(match[2]), size - 1)
          : size - 1;
      if (
        !match ||
        (!match[1] && !match[2]) ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= size
      ) {
        context.header('Content-Range', `bytes */${size}`);
        context.header('Content-Length', '0');
        return context.body(null, 416);
      }
      context.header('Content-Range', `bytes ${start}-${end}/${size}`);
      context.header('Content-Length', String(end - start + 1));
      return context.body(
        Readable.toWeb(
          await disk.getStream(file.key, { range: { start, end } }),
        ),
        206,
      );
    }
    return context.body(Readable.toWeb(await disk.getStream(file.key)));
  });
  return new Hono().route('/', routes);
});
