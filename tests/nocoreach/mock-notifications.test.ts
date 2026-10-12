// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  createNotificationManager,
  createNotificationRegistry,
  type NotificationDeliveryRecord,
  type NotificationStore,
} from '@nocobase/app-plugin-notification/server';
import { assertMockNotificationIsolation } from '../../server/routes/mock-external-guard';

/** Exercise the installed manager's real recovery/dispatch path; only storage and transports are test doubles. */
function fixture() {
  const now = '2026-10-12T00:00:00.000Z';
  const rows = new Map<string, NotificationDeliveryRecord>();
  for (const [index, provider] of [
    'smtp',
    'resend',
    'feishu-webhook',
    'dingtalk-webhook',
  ].entries()) {
    rows.set(provider, {
      id: provider,
      notificationId: 'old-notification',
      channelName: provider,
      channelType: provider.includes('webhook') ? 'im' : 'email',
      providerType: provider,
      recipientSnapshot: {},
      messageSnapshot: {},
      attemptCount: 1,
      status: index % 2 ? 'retrying' : 'pending',
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
  // Reusing an old external channel name for an in-app provider must not submit its old delivery either.
  rows.set('renamed', {
    ...rows.get('smtp')!,
    id: 'renamed',
    channelName: 'inbox',
  });
  rows.set('in-app', {
    ...rows.get('smtp')!,
    id: 'in-app',
    channelName: 'inbox',
    channelType: 'in-app',
    providerType: 'in-app',
  });
  const store = {
    now: async () => now,
    recoverExpired: async () => [],
    listReady: async () =>
      [...rows.values()].filter((row) =>
        ['pending', 'retrying'].includes(row.status),
      ),
    getDelivery: async (id: string) => rows.get(id),
    getLog: async () => undefined,
    claimDelivery: async (
      id: string,
      leaseToken: string,
      leaseExpiresAt: string,
    ) => {
      const row = {
        ...rows.get(id)!,
        status: 'preparing' as const,
        leaseToken,
        leaseExpiresAt,
      };
      rows.set(id, row);
      return row;
    },
    finishDelivery: async (
      delivery: NotificationDeliveryRecord,
      status: 'failed',
      lastError: NotificationDeliveryRecord['lastError'],
    ) => {
      const row = { ...delivery, status, lastError };
      rows.set(row.id, row);
      return row;
    },
    startAttempt: async (delivery: NotificationDeliveryRecord) => ({
      ...delivery,
      status: 'submitting' as const,
      attemptCount: delivery.attemptCount + 1,
    }),
    finishAttemptAndDelivery: async (
      _attempt: unknown,
      delivery: NotificationDeliveryRecord,
      status: 'accepted',
    ) => {
      const row = { ...delivery, status };
      rows.set(row.id, row);
      return row;
    },
  } as unknown as NotificationStore;
  const registry = createNotificationRegistry();
  const inAppSend = vi.fn(async () => ({ status: 'accepted' as const }));
  const externalCreate = vi.fn(async () => {
    throw new Error('External provider must never be constructed');
  });
  registry.registerChannel({
    type: 'in-app',
    createChannel: async () => ({
      type: 'in-app',
      validateMessage: () => ({ message: {}, recipients: [{}] }),
      prepare: async () => ({}),
    }),
  });
  registry.registerProvider({
    type: 'in-app',
    messageType: 'in-app',
    createProvider: async () => ({ type: 'in-app', send: inAppSend }),
  });
  for (const provider of [
    'smtp',
    'resend',
    'feishu-webhook',
    'dingtalk-webhook',
  ])
    registry.registerProvider({
      type: provider,
      messageType: 'in-app',
      createProvider: externalCreate,
    });
  const config = {
    channels: {
      inbox: { provider: 'in-app' },
      smtp: { provider: 'smtp', enabled: false },
      resend: { provider: 'resend', enabled: false },
      'feishu-webhook': { provider: 'feishu-webhook', enabled: false },
      'dingtalk-webhook': { provider: 'dingtalk-webhook', enabled: false },
    },
  };
  const executor = {
    registerJob: vi.fn(),
    setup: vi.fn(),
    shutdown: vi.fn(),
    addJob: async (job: { execute(): Promise<void> }) => job.execute(),
  };
  const manager = createNotificationManager({
    database: {} as never,
    store,
    registry,
    config,
    executor: executor as never,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as never,
  });
  return { manager, config, rows, externalCreate, inAppSend };
}

describe('mock notification recovery isolation', () => {
  it('rejects persisted external deliveries and retries while still delivering in-app messages', async () => {
    const f = fixture();
    assertMockNotificationIsolation(
      { enabled: true, environment: 'test' },
      f.config,
    );
    try {
      await f.manager.start();
      for (const id of [
        'smtp',
        'resend',
        'feishu-webhook',
        'dingtalk-webhook',
        'renamed',
      ]) {
        expect(f.rows.get(id)).toMatchObject({
          status: 'failed',
          lastError: { code: 'PROVIDER_UNAVAILABLE' },
        });
        await expect(
          f.manager.retryDelivery({
            deliveryId: id,
            reason: 'retry old delivery',
          }),
        ).rejects.toThrow();
      }
      expect(f.rows.get('in-app')?.status).toBe('accepted');
      expect(f.inAppSend).toHaveBeenCalledOnce();
      expect(f.externalCreate).not.toHaveBeenCalled();
    } finally {
      await f.manager.close();
    }
  });
});
