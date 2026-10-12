// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { ServiceContainer } from '@nocobase/service-provider';
import { ApiError } from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import {
  assertMockWorkerIsolation,
  assertMockJobsIsolation,
  assertMockNotificationIsolation,
  mockExternalGuard,
} from '../../server/routes/mock-external-guard';

async function fixture(enabled = true, signedIn = true) {
  const container = new ServiceContainer();
  const authenticated = vi.fn(async (context, next) =>
    signedIn ? next() : context.json({ error: 'Unauthorized' }, 401),
  );
  container.instance(authenticationToken, {
    required: () => authenticated,
  } as never);
  const app = {
    container,
    config: {
      get: (name: string) =>
        name === 'nocoreachMock' ? { enabled, environment: 'test' } : undefined,
    },
  };
  const router = await mockExternalGuard.createRouter(
    app as unknown as Application,
  );
  router.onError((error, context) =>
    error instanceof ApiError
      ? context.json(
          { error: error.message, reason: (error as any).reason },
          409,
        )
      : context.json({ error: error.message }, 500),
  );
  const external = vi.fn((context) => context.json({ live: true }));
  router.all('/agents/*', external);
  router.all('/notifications/*', external);
  router.all('/notificationInApp/*', (context) =>
    context.json({ inbox: true }),
  );
  router.all('/nocoreach/*', (context) => context.json({ business: true }));
  return { router, external, authenticated };
}

describe('dedicated mock deployment external execution guard', () => {
  it.each([
    '/agents',
    '/agents/checkModel',
    '/notifications/testSends',
    '/notifications/deliveries/1/retry',
    '/agents/checkConnection',
    '/agents/discoverModels',
    '/agents/demo/invoke',
    '/agents/conversations/start',
    '/agents/conversations/1/messages',
    '/agents/runs/1/retry',
    '/agents/runRequests/1/confirm',
    '/agents/runners/claim',
    '/agents/runners/register',
    '/agents/runners/runs/1/gitCredentials',
  ])(
    'blocks %s before plugin code can perform an external action',
    async (path) => {
      const f = await fixture();
      const response = await f.router.request(path, { method: 'POST' });
      expect(response.status).toBe(409);
      expect((await response.json()).error).toContain('模拟');
      expect(f.authenticated).toHaveBeenCalledOnce();
      expect(f.external).not.toHaveBeenCalled();
    },
  );
  it.each(['PUT', 'PATCH', 'DELETE'])(
    'blocks every %s mutation instead of guessing known action names',
    async (method) => {
      const f = await fixture();
      expect(
        (await f.router.request('/agents/unrecognized-action', { method }))
          .status,
      ).toBe(409);
      expect(f.external).not.toHaveBeenCalled();
    },
  );
  it('requires authentication before disclosing mock execution policy', async () => {
    const f = await fixture(true, false);
    expect(
      (await f.router.request('/agents/checkModel', { method: 'POST' })).status,
    ).toBe(401);
    expect(f.external).not.toHaveBeenCalled();
  });
  it.each([
    '/agents/models',
    '/agents/services',
    '/agents/runs/1',
    '/agents/runners',
    '/agents/runners/1/runs',
  ])(
    'preserves safe read routes %s and their native access checks',
    async (path) => {
      const f = await fixture();
      expect((await f.router.request(path)).status).toBe(200);
      expect(f.external).toHaveBeenCalledOnce();
      expect(f.authenticated).not.toHaveBeenCalled();
    },
  );
  it.each([
    '/agents/runners/runs/1/status',
    '/agents/runners/jobs/1/status',
    '/agents/runners/runs/1/mounts/data',
    '/agents/runs/current/context',
  ])(
    'withholds existing Runner/run-token execution inputs at %s',
    async (path) => {
      const f = await fixture();
      expect((await f.router.request(path)).status).toBe(409);
      expect(f.external).not.toHaveBeenCalled();
    },
  );
  it('leaves real mode and NocoReach business paths unchanged', async () => {
    const real = await fixture(false);
    expect(
      (await real.router.request('/agents/checkModel', { method: 'POST' }))
        .status,
    ).toBe(200);
    expect(real.external).toHaveBeenCalledOnce();
    const mock = await fixture();
    expect(
      (
        await mock.router.request('/nocoreach/nrMock/status', {
          method: 'POST',
        })
      ).status,
    ).toBe(200);
  });
  it('blocks notification test sends even with a valid test header, while preserving inbox actions and read-only logs', async () => {
    const mock = await fixture();
    expect(
      (
        await mock.router.request('/notifications/testSends', {
          method: 'POST',
          headers: { 'x-nocobase-notification-test': '1' },
          body: JSON.stringify({
            channel: 'smtp',
            values: { to: 'someone@example.com' },
          }),
        })
      ).status,
    ).toBe(409);
    expect(mock.external).not.toHaveBeenCalled();
    expect((await mock.router.request('/notifications/logs')).status).toBe(200);
    expect(
      (
        await mock.router.request('/notificationInApp/messages/1/markRead', {
          method: 'POST',
        })
      ).status,
    ).toBe(200);
    const anonymous = await fixture(true, false);
    expect(
      (
        await anonymous.router.request('/notifications/testSends', {
          method: 'POST',
        })
      ).status,
    ).toBe(401);
    const real = await fixture(false);
    expect(
      (
        await real.router.request('/notifications/testSends', {
          method: 'POST',
        })
      ).status,
    ).toBe(200);
  });
  it.each([
    'smtp',
    'resend',
    'feishu-webhook',
    'dingtalk-webhook',
    'unknown-provider',
  ])('rejects enabled %s notifications before workers start', (provider) => {
    const mock = { enabled: true, environment: 'test' as const };
    expect(() =>
      assertMockNotificationIsolation(mock, {
        channels: { external: { provider } },
      }),
    ).toThrow('NR_MOCK_EXTERNAL_NOTIFICATIONS_ENABLED');
    expect(() =>
      assertMockNotificationIsolation(mock, {
        channels: { external: { provider, enabled: true } },
      }),
    ).toThrow('NR_MOCK_EXTERNAL_NOTIFICATIONS_ENABLED');
    expect(() =>
      assertMockNotificationIsolation(mock, {
        channels: {
          inbox: { provider: 'in-app' },
          external: { provider, enabled: false },
        },
      }),
    ).not.toThrow();
    expect(() =>
      assertMockNotificationIsolation(
        { enabled: false },
        { channels: { external: { provider } } },
      ),
    ).not.toThrow();
  });
  it('requires notification workers to use process-local memory, never shared brokers', () => {
    const mock = { enabled: true, environment: 'test' as const };
    const notification = { channels: { inbox: { provider: 'in-app' } } };
    const jobs = {
      default: 'redis',
      redis: { adapter: 'redis' },
      memory: {
        adapter: 'memory',
        persistence: { path: '/dedicated-mock/jobs' },
      },
    };
    expect(() =>
      assertMockNotificationIsolation(mock, notification, jobs),
    ).toThrow('NR_MOCK_NOTIFICATION_WORKER_NOT_ISOLATED');
    expect(() =>
      assertMockNotificationIsolation(
        mock,
        { ...notification, jobs: 'missing' },
        jobs,
      ),
    ).toThrow('NR_MOCK_NOTIFICATION_WORKER_NOT_ISOLATED');
    expect(() =>
      assertMockNotificationIsolation(
        mock,
        { ...notification, jobs: 'memory' },
        jobs,
      ),
    ).not.toThrow();
    expect(() =>
      assertMockNotificationIsolation(mock, notification),
    ).not.toThrow();
  });
  it('requires online execution and vector workers disabled before startup', () => {
    const config = { enabled: true, environment: 'test' as const };
    expect(() => assertMockWorkerIsolation(config, undefined)).toThrow(
      'agents.server.enabled=false',
    );
    expect(() =>
      assertMockWorkerIsolation(config, { server: { enabled: false } }),
    ).toThrow('agents.vectors.store=false');
    expect(() =>
      assertMockWorkerIsolation(config, {
        server: { enabled: true },
        vectors: { store: false },
      }),
    ).toThrow('NR_MOCK_AI_WORKERS_ENABLED');
    expect(() =>
      assertMockWorkerIsolation(config, {
        server: { enabled: false },
        vectors: { store: false },
      }),
    ).not.toThrow();
    expect(() =>
      assertMockWorkerIsolation({ enabled: false }, undefined),
    ).not.toThrow();
  });
});

describe('dedicated mock deployment jobs isolation', () => {
  const mock = { enabled: true, environment: 'test' as const };
  const configurations = {
    memory: { adapter: 'memory' },
    redis: { adapter: 'redis' },
  };

  it('does not let memory notification and scheduler overrides conceal a shared default executor', () => {
    const jobs = { ...configurations, default: 'redis' };
    expect(() =>
      assertMockNotificationIsolation(mock, { jobs: 'memory' }, jobs),
    ).not.toThrow();
    expect(() =>
      assertMockJobsIsolation(mock, jobs, { jobs: 'memory' }),
    ).toThrow('NR_MOCK_JOBS_WORKER_NOT_ISOLATED: mock jobs.default');
  });

  it.each([undefined, 'memory'])(
    'rejects a Redis scheduler override with jobs.default=%s',
    (defaultName) => {
      expect(() =>
        assertMockJobsIsolation(
          mock,
          { ...configurations, default: defaultName },
          { jobs: 'redis' },
        ),
      ).toThrow('NR_MOCK_JOBS_WORKER_NOT_ISOLATED: mock scheduler.jobs');
    },
  );

  it.each(['missing', 'default', '', null, 1])(
    'rejects invalid jobs.default selector %s',
    (defaultName) => {
      expect(() =>
        assertMockJobsIsolation(
          mock,
          { ...configurations, default: defaultName },
          undefined,
        ),
      ).toThrow('NR_MOCK_JOBS_WORKER_NOT_ISOLATED: mock jobs.default');
    },
  );

  it.each(['missing', 'default', ''])(
    'rejects invalid scheduler.jobs selector %s without falling back',
    (name) => {
      expect(() =>
        assertMockJobsIsolation(
          mock,
          { ...configurations, default: 'memory' },
          { jobs: name },
        ),
      ).toThrow('NR_MOCK_JOBS_WORKER_NOT_ISOLATED: mock scheduler.jobs');
    },
  );

  it.each([null, 'memory', {}, [], { adapter: 'unknown' }])(
    'rejects invalid selected configuration %j for both executor selectors',
    (selected) => {
      expect(() =>
        assertMockJobsIsolation(
          mock,
          { ...configurations, default: 'selected', selected },
          undefined,
        ),
      ).toThrow('NR_MOCK_JOBS_WORKER_NOT_ISOLATED: mock jobs.default');
      expect(() =>
        assertMockJobsIsolation(
          mock,
          { ...configurations, default: 'memory', selected },
          { jobs: 'selected' },
        ),
      ).toThrow('NR_MOCK_JOBS_WORKER_NOT_ISOLATED: mock scheduler.jobs');
    },
  );

  it.each([
    [undefined, undefined],
    [configurations, undefined],
    [configurations, { jobs: 'memory' }],
    [{ ...configurations, default: 'memory' }, undefined],
    [{ ...configurations, default: 'memory' }, { jobs: 'memory' }],
  ])(
    'allows built-in or explicitly selected memory with unused Redis configurations: %j, %j',
    (jobs, scheduler) => {
      expect(() =>
        assertMockJobsIsolation(mock, jobs, scheduler),
      ).not.toThrow();
    },
  );

  it.each([undefined, { enabled: false }])(
    'leaves Redis selections unchanged when mock configuration is %j',
    (disabled) => {
      expect(() =>
        assertMockJobsIsolation(
          disabled,
          { ...configurations, default: 'redis' },
          { jobs: 'redis' },
        ),
      ).not.toThrow();
    },
  );
});
