// @vitest-environment node
import { Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application } from '@nocobase/app-server/application';
import { createAppPaths } from '@nocobase/app-server/config';
import { DatabaseProvider } from '@nocobase/app-server/database';
import { JobExecutorServiceProvider } from '@nocobase/app-server/jobs';
import { QueueServiceProvider } from '@nocobase/app-server/queue';
import type { AppRuntimeContext } from '@nocobase/app-server/runtime';
import { ServiceProviderRegistry } from '@nocobase/service-provider';
import { createApp } from '../../server/app.js';

afterEach(() => vi.restoreAllMocks());

const configurations = {
  memory: { adapter: 'memory' },
  redis: {
    adapter: 'redis',
    connection: { host: 'redis-must-not-be-contacted.invalid', port: 6379 },
  },
};

function runtime(
  jobs: Record<string, unknown>,
  scheduler: { jobs?: string },
): AppRuntimeContext {
  const values: Record<string, unknown> = {
    nocoreachMock: { enabled: true, environment: 'test' },
    agents: { server: { enabled: false }, vectors: { store: false } },
    // This independent memory selection must not conceal unsafe business workers.
    notification: { jobs: 'memory' },
    jobs,
    scheduler,
  };
  return {
    config: { get: (name: string) => values[name] },
    env: {},
    scope: {},
    paths: createAppPaths({ rootDir: process.cwd() }),
    plugins: { appPackageName: 'nocoreach', plugins: [] },
    serviceProviders: [],
    routes: [],
  } as unknown as AppRuntimeContext;
}

describe('mock jobs startup preflight', () => {
  it.each([
    [{ ...configurations, default: 'redis' }, { jobs: 'memory' }],
    [{ ...configurations, default: 'memory' }, { jobs: 'redis' }],
    [configurations, { jobs: 'redis' }],
    [{ ...configurations, default: 'missing' }, { jobs: 'memory' }],
    [{ ...configurations, default: 'memory' }, { jobs: 'default' }],
  ])(
    'rejects unsafe jobs before business provider registration, startup or Redis connections: %j, %j',
    (jobs, scheduler) => {
      const register = vi.spyOn(Application.prototype, 'addServiceProvider');
      const contributions = vi.spyOn(
        Application.prototype,
        'addRuntimeContributions',
      );
      const boot = vi.spyOn(ServiceProviderRegistry.prototype, 'bootAll');
      const start = vi.spyOn(ServiceProviderRegistry.prototype, 'startAll');
      const connect = vi
        .spyOn(Socket.prototype, 'connect')
        .mockImplementation(() => {
          throw new Error('Startup must not contact Redis');
        });

      expect(() => createApp(runtime(jobs, scheduler))).toThrow(
        'NR_MOCK_JOBS_WORKER_NOT_ISOLATED',
      );
      // Application's constructor registers Router/Realtime scaffolding before the app preflight.
      // Database, queues, jobs and plugin/app worker contributions must remain unregistered.
      const providers = register.mock.calls.map(([provider]) => provider);
      expect(providers).not.toContain(DatabaseProvider);
      expect(providers).not.toContain(JobExecutorServiceProvider);
      expect(providers).not.toContain(QueueServiceProvider);
      expect(contributions).not.toHaveBeenCalled();
      expect(boot).not.toHaveBeenCalled();
      expect(start).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
    },
  );
});
