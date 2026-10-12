import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type MiddlewareHandler } from 'hono';
import type { MockConfig } from '../../app-plugins/nocoreach-mock/server/types';

/** Fail before any provider starts a paid Online run or background vector embedding. */
export function assertMockWorkerIsolation(
  mock: MockConfig | undefined,
  agents:
    | { server?: { enabled?: boolean }; vectors?: { store?: unknown } }
    | undefined,
): void {
  if (!mock?.enabled) return;
  if (agents?.server?.enabled !== false || agents?.vectors?.store !== false) {
    throw new Error(
      'NR_MOCK_AI_WORKERS_ENABLED: mock deployments require agents.server.enabled=false and agents.vectors.store=false in config.yml',
    );
  }
}

/** NocoReach jobs and Scheduler firings must never reach a differently configured live worker. */
export function assertMockJobsIsolation(
  mock: MockConfig | undefined,
  jobs: Readonly<Record<string, unknown>> | undefined,
  scheduler: { jobs?: string } | undefined,
): void {
  if (!mock?.enabled) return;
  // NocoReach timers and analysis jobs always use jobs.default. Scheduler may override it.
  // A separate notification.jobs selection does not isolate either of these executors.
  for (const [setting, name] of [
    ['jobs.default', jobs?.default],
    ['scheduler.jobs', scheduler?.jobs],
  ] as const) {
    if (name === undefined) continue;
    // `default` is a selector, not a named configuration; Scheduler explicitly rejects it.
    const selected =
      typeof name === 'string' && name !== 'default' ? jobs?.[name] : undefined;
    if (
      !selected ||
      typeof selected !== 'object' ||
      Array.isArray(selected) ||
      !('adapter' in selected) ||
      selected.adapter !== 'memory'
    ) {
      throw new Error(
        `NR_MOCK_JOBS_WORKER_NOT_ISOLATED: mock ${setting} must select a defined process-local memory jobs configuration, or be omitted to use the memory default`,
      );
    }
  }
}

/** Current configuration is the only source of notification transports, including recovered deliveries. */
export function assertMockNotificationIsolation(
  mock: MockConfig | undefined,
  notification:
    | {
        channels?: Readonly<
          Record<string, { provider?: string; enabled?: boolean }>
        >;
        jobs?: string;
      }
    | undefined,
  jobs?: Readonly<Record<string, unknown>>,
): void {
  if (!mock?.enabled) return;
  if (
    Object.values(notification?.channels ?? {}).some(
      (channel) =>
        !channel ||
        (channel.enabled !== false && channel.provider !== 'in-app'),
    )
  ) {
    throw new Error(
      'NR_MOCK_EXTERNAL_NOTIFICATIONS_ENABLED: mock deployments only allow enabled notification.channels with provider=in-app; remove or disable every external channel',
    );
  }
  // A shared broker could hand mock notification jobs to a live worker using different channel config.
  // Built-in memory is process-local; persisted delivery snapshots are revalidated by the manager.
  const name = notification?.jobs ?? jobs?.default;
  if (name !== undefined) {
    const selected = typeof name === 'string' ? jobs?.[name] : undefined;
    if (
      !selected ||
      typeof selected !== 'object' ||
      !('adapter' in selected) ||
      selected.adapter !== 'memory'
    ) {
      throw new Error(
        'NR_MOCK_NOTIFICATION_WORKER_NOT_ISOLATED: mock notification.jobs must select a process-local memory jobs configuration, or use the built-in memory default',
      );
    }
  }
}

/**
 * The shared Agents UI/CLI can call models and claim Runner work outside NocoReach's provider.
 * In a dedicated mock deployment its mutation surface is unavailable. Preserve plugin-owned
 * read authentication/authorization, and register this guard before all plugin routes.
 */
export const mockExternalGuard: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<AuthEnv>();
    const guard: MiddlewareHandler<AuthEnv> = async (context, next) => {
      if (!app.config.get<MockConfig>('nocoreachMock')?.enabled) return next();
      const isRead = ['GET', 'HEAD', 'OPTIONS'].includes(context.req.method);
      // Protocol reads may serve inputs/mounts for pre-existing real Runner work. Admin lists remain readable.
      const runnerProtocol =
        /\/agents\/(?:runners\/(?:runs|jobs)(?:\/|$)|runs\/current(?:\/|$))/.test(
          context.req.path,
        );
      if (isRead && !runnerProtocol) return next();
      return app.container.resolve(authenticationToken).required()(
        context,
        async () => {
          throw new ApiError({
            status: 'FAILED_PRECONDITION',
            reason: 'NR_MOCK_EXTERNAL_EXECUTION_DISABLED',
            domain: 'nocoreach',
            message:
              '模拟环境禁止真实 AI、模型测试、Runner 执行和外部通知发送。请使用 NocoReach 的模拟业务入口。',
          });
        },
      );
    };
    router.use('/agents/*', guard);
    // Inbox read-state mutations use the separate /notificationInApp namespace and stay available.
    router.use('/notifications/*', guard);
    return new Hono().route('/', router);
  });
