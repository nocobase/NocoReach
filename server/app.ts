import type { Application } from '@nocobase/app-server/application';
import { DatabaseProvider } from '@nocobase/app-server/database';
import { I18nProvider, i18nHttpMiddleware } from '@nocobase/app-server/i18n';
import { CachingProvider } from '@nocobase/app-server/caching';
import { DriveProvider } from '@nocobase/app-server/drive';
import { IdGeneratorProvider } from '@nocobase/app-server/id-generator';
import {
  LoggingProvider,
  requestLoggingMiddleware,
} from '@nocobase/app-server/logging';
import { QueueServiceProvider } from '@nocobase/app-server/queue';
import { SecretsProvider } from '@nocobase/app-server/secrets';
import { JobExecutorServiceProvider } from '@nocobase/app-server/jobs';
import {
  SessionProvider,
  sessionHttpMiddleware,
} from '@nocobase/app-server/session';
import { healthCheckApiRoutes } from '@nocobase/app-server/router';
import {
  createAppFromRuntime,
  type AppRuntimeContext,
} from '@nocobase/app-server/runtime';
import { spaRootRoutes } from '@nocobase/app-server/spa';
import { taskAgentRetryGuard } from './routes/agent-retry-guard';
import { MockDatasetSafetyProvider } from './providers/mock-dataset.js';
import {
  assertMockWorkerIsolation,
  assertMockJobsIsolation,
  assertMockNotificationIsolation,
  assertMockMailIsolation,
  isolateMockMailRuntime,
  mockExternalGuard,
} from './routes/mock-external-guard';

export function createApp(runtime: AppRuntimeContext): Application {
  const app = createAppFromRuntime(runtime);
  assertMockWorkerIsolation(
    app.config.get('nocoreachMock'),
    app.config.get('agents'),
  );

  assertMockJobsIsolation(
    app.config.get('nocoreachMock'),
    app.config.get('jobs'),
    app.config.get('scheduler'),
  );

  assertMockNotificationIsolation(
    app.config.get('nocoreachMock'),
    app.config.get('notification'),
    app.config.get('jobs'),
  );

  assertMockMailIsolation(
    app.config.get('nocoreachMock'),
    app.config.get('mail'),
    app.config.get('jobs'),
  );

  app.addServiceProvider(DatabaseProvider);
  app.addServiceProvider(I18nProvider);
  app.addServiceProvider(LoggingProvider);
  app.addServiceProvider(CachingProvider);
  app.addServiceProvider(IdGeneratorProvider);
  app.addServiceProvider(SecretsProvider);
  app.addServiceProvider(SessionProvider);
  app.addServiceProvider(DriveProvider);
  app.addServiceProvider(QueueServiceProvider, {
    nodeEnv: runtime.env.NODE_ENV,
  });
  app.addServiceProvider(JobExecutorServiceProvider, {
    nodeEnv: runtime.env.NODE_ENV,
  });
  app.addServiceProvider(MockDatasetSafetyProvider);
  app.addHttpMiddleware(requestLoggingMiddleware);
  app.addHttpMiddleware(sessionHttpMiddleware);
  app.addHttpMiddleware(i18nHttpMiddleware);
  app.addRoutes(healthCheckApiRoutes);
  // The generic Agents retry cannot recreate a NocoReach task's business snapshot.
  // Install the subject-specific guard before plugin contributions (see AGENTS.md).
  app.addRoutes(mockExternalGuard);
  app.addRoutes(taskAgentRetryGuard);
  app.addRuntimeContributions(isolateMockMailRuntime(runtime));
  app.addRoutes(spaRootRoutes);

  return app;
}
