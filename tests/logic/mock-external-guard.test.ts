// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { ServiceContainer } from '@nocobase/service-provider';
import { ApiError } from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import {
  assertMockJobsIsolation,
  assertMockNotificationIsolation,
  assertMockMailIsolation,
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
      ? context.json({ error: error.message, reason: error.reason }, 409)
      : context.json({ error: error.message }, 500),
  );
  const external = vi.fn((context) => context.json({ live: true }));
  router.all('/agents/*', external);
  router.all('/notifications/*', external);
  router.all('/mail/*', external);
  router.all('/notificationInApp/*', (context) =>
    context.json({ inbox: true }),
  );
  router.all('/nocoreach/*', (context) => context.json({ business: true }));
  return { router, external, authenticated };
}

describe('dedicated mock deployment external execution guard', () => {
  it.each([
    '/mail',
    '/mail/accounts',
    '/mail/drafts/1/send',
    '/mail/accounts/1/sync',
    '/notifications/deliveries/1/retry',
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
        (
          await f.router.request('/notifications/unrecognized-action', {
            method,
          })
        ).status,
      ).toBe(409);
      expect(f.external).not.toHaveBeenCalled();
    },
  );
  it.each([
    '/agents',
    '/agents/services',
    '/agents/checkModel',
    '/agents/checkConnection',
    '/agents/discoverModels',
    '/agents/runners/register',
    '/agents/runners/claim',
    '/agents/conversations/start',
  ])(
    'allows Agent configuration and execution at %s through native plugin checks',
    async (path) => {
      const f = await fixture();
      expect((await f.router.request(path, { method: 'POST' })).status).toBe(
        200,
      );
      expect(f.external).toHaveBeenCalledOnce();
      expect(f.authenticated).not.toHaveBeenCalled();
    },
  );
  it('requires authentication before disclosing mock execution policy', async () => {
    const f = await fixture(true, false);
    expect(
      (
        await f.router.request('/notifications/deliveries/1/retry', {
          method: 'POST',
        })
      ).status,
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
  ])('preserves Runner protocol access checks at %s', async (path) => {
    const f = await fixture();
    expect((await f.router.request(path)).status).toBe(200);
    expect(f.external).toHaveBeenCalledOnce();
  });
  it('leaves real mode and NocoReach business paths unchanged', async () => {
    const real = await fixture(false);
    expect(
      (
        await real.router.request('/notifications/deliveries/1/retry', {
          method: 'POST',
        })
      ).status,
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
  it('blocks notification mutations while preserving inbox actions and read-only logs', async () => {
    const mock = await fixture();
    expect(
      (
        await mock.router.request('/notifications/deliveries/1/retry', {
          method: 'POST',
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
        await anonymous.router.request('/notifications/deliveries/1/retry', {
          method: 'POST',
        })
      ).status,
    ).toBe(401);
    const real = await fixture(false);
    expect(
      (
        await real.router.request('/notifications/deliveries/1/retry', {
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

describe('mock Mail isolation after template upgrade', () => {
  const mock = { enabled: true, environment: 'test' as const };
  it.each([{}, { enabled: true }])(
    'rejects enabled Mail providers %j',
    (provider) => {
      expect(() =>
        assertMockMailIsolation(
          mock,
          { providers: { live: provider } },
          undefined,
        ),
      ).toThrow('NR_MOCK_EXTERNAL_MAIL_ENABLED');
    },
  );
  it('allows no providers or explicitly disabled providers, and preserves live mode', () => {
    expect(() =>
      assertMockMailIsolation(mock, { providers: {} }, undefined),
    ).not.toThrow();
    expect(() =>
      assertMockMailIsolation(
        mock,
        { providers: { live: { enabled: false } } },
        undefined,
      ),
    ).not.toThrow();
    expect(() =>
      assertMockMailIsolation(
        undefined,
        { providers: { live: {} } },
        undefined,
      ),
    ).not.toThrow();
  });
  it.each(['redis', 'missing', 'default'])(
    'rejects non-local Mail jobs %s',
    (jobs) => {
      expect(() =>
        assertMockMailIsolation(
          mock,
          { jobs },
          { redis: { adapter: 'redis' } },
        ),
      ).toThrow('NR_MOCK_MAIL_WORKER_NOT_ISOLATED');
    },
  );
  it('accepts a defined memory Mail executor', () => {
    expect(() =>
      assertMockMailIsolation(
        mock,
        { jobs: 'local' },
        { local: { adapter: 'memory' } },
      ),
    ).not.toThrow();
  });
  it.each([
    '/mail/messages/1/attachments/2',
    '/mail/accounts/1/messages/2/body',
  ])('blocks external Mail reads at %s before plugin code', async (path) => {
    const f = await fixture();
    expect((await f.router.request(path)).status).toBe(409);
    expect(f.external).not.toHaveBeenCalled();
    const real = await fixture(false);
    expect((await real.router.request(path)).status).toBe(200);
    expect(real.external).toHaveBeenCalledOnce();
  });
});
