import { systemMessageText } from '../../shared/i18n/messages.js';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import type { AppRuntimeContext } from '@nocobase/app-server/runtime';
import {
  ApiError,
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type MiddlewareHandler } from 'hono';
import type { MockConfig } from '../../app-plugins/nocoreach-mock/server/types';

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

/** Mail can send, synchronize and download attachments outside NocoReach collectors. */
export function assertMockMailIsolation(
  mock: MockConfig | undefined,
  mail:
    | {
        providers?: Readonly<Record<string, { enabled?: boolean }>>;
        jobs?: string;
      }
    | undefined,
  jobs: Readonly<Record<string, unknown>> | undefined,
): void {
  if (!mock?.enabled) return;
  if (
    Object.values(mail?.providers ?? {}).some(
      (provider) => !provider || provider.enabled !== false,
    )
  ) {
    throw new Error(
      'NR_MOCK_EXTERNAL_MAIL_ENABLED: mock deployments require every mail provider to be removed or enabled=false',
    );
  }
  const name = mail?.jobs ?? jobs?.default;
  if (name === undefined) return;
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
      'NR_MOCK_MAIL_WORKER_NOT_ISOLATED: mock mail.jobs must select process-local memory jobs, or use the built-in memory default',
    );
  }
}

/** Preserve Mail's migration metadata, but never start its workers or routes in mock deployments.
 * Mail maintenance can delete expired attachments through Drive without resolving a Mail provider.
 */
export function isolateMockMailRuntime(
  runtime: AppRuntimeContext,
): AppRuntimeContext {
  if (!runtime.config.get<MockConfig>('nocoreachMock')?.enabled) return runtime;
  return {
    ...runtime,
    plugins: {
      ...runtime.plugins,
      plugins: runtime.plugins.plugins.map((plugin) =>
        plugin.definition.packageName === '@nocobase/app-plugin-mail'
          ? {
              ...plugin,
              definition: {
                ...plugin.definition,
                serviceProviders: [],
                routes: [],
              },
            }
          : plugin,
      ),
    },
  };
}

/** Keep external notification and Mail writes isolated; Agents retain their native authorization. */
export const mockExternalGuard: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<AuthEnv>();
    const guard: MiddlewareHandler<AuthEnv> = async (context, next) => {
      if (!app.config.get<MockConfig>('nocoreachMock')?.enabled) return next();
      const isRead = ['GET', 'HEAD', 'OPTIONS'].includes(context.req.method);
      // Mail GET routes can retrieve live attachments; no Mail API reaches a provider in mock mode.
      const mailRequest = /\/mail(?:\/|$)/.test(context.req.path);
      if (isRead && !mailRequest) return next();
      return app.container.resolve(authenticationToken).required()(
        context,
        async () => {
          throw new ApiError({
            status: 'FAILED_PRECONDITION',
            reason: 'NR_MOCK_EXTERNAL_EXECUTION_DISABLED',
            domain: 'nocoreach',
            message: systemMessageText('mock.externalWritesDisabled'),
          });
        },
      );
    };
    // Inbox read-state mutations use the separate /notificationInApp namespace and stay available.
    router.use('/notifications/*', guard);
    router.use('/mail/*', guard);
    return new Hono().route('/', router);
  });
