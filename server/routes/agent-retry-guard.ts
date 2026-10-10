import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type MiddlewareHandler } from 'hono';
import { TASK_SUBJECT } from '../nocoreach/execution/agents-runtime';
import { roleOf } from '../nocoreach/policy';
import { nocoReachToken } from '../providers/nocoreach';

/**
 * The plugin's retry copies the old subject into a new run. NocoReach must instead
 * revalidate the task stage and create a new business snapshot through retryStage/retryMerge.
 * Until SubjectBinding exposes a retry hook, reject only this subject on the shared HTTP/CLI
 * endpoint. Register before plugin routes; no replacement endpoint or private plugin API.
 */
export const taskAgentRetryGuard: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<AuthEnv>();
    const authenticate: MiddlewareHandler<AuthEnv> = async (context, next) => {
      if (context.req.method !== 'POST') return next();
      // Resolve only when this guard is used; custom runtime fixtures may omit Agents/Auth.
      return app.container.resolve(authenticationToken).required()(
        context,
        next,
      );
    };
    router.use('/agents/runs/:runId/retry', authenticate);
    router.use('/agents/runs/:runId/retry', async (context, next) => {
      if (context.req.method !== 'POST') return next();
      const agents = app.container.resolve(agentsToken);
      let run;
      try {
        run = await agents.runs.get(context.req.param('runId'));
      } catch (error) {
        // Let the plugin render its own missing-run error; never mask unexpected failures.
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'RUN_NOT_FOUND'
        )
          return next();
        throw error;
      }
      if (run.subject.kind !== TASK_SUBJECT) return next();
      const runtime = app.container.resolve(nocoReachToken);
      await runtime.ready;
      const actor = String(context.get('auth')!.user.id);
      if (
        run.actorUserId !== actor &&
        run.ownerUserId !== actor &&
        (await roleOf(runtime.legacy.db, actor)) !== 'admin'
      ) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'RUN_NOT_FOUND',
          domain: 'agents',
          message: 'Run not found.',
        });
      }
      const message =
        '请回到 NocoReach 任务页重试当前阶段；通用运行重试无法更新任务的审核和成果。';
      throw new ApiError({
        status: 'FAILED_PRECONDITION',
        reason: 'NOCOREACH_TASK_RETRY_REQUIRED',
        domain: 'nocoreach',
        message,
        localizedMessage: { locale: 'zh-CN', message },
      });
    });
    return new Hono().route('/', router);
  });
