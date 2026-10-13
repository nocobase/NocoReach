// @vitest-environment node
import type { Application } from '@nocobase/app-server/application';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';
import OnlineExecutorProvider from '../../server/providers/online-executor.js';
import providers from '../../server/providers/index.js';

function fixture(enabled?: boolean, mock = false) {
  const executor = { start: vi.fn(), stop: vi.fn(async () => {}) };
  const container = new ServiceContainer();
  container.instance(agentsToken, { online: { executor } } as never);
  const app = {
    container,
    config: {
      get: (key: string) =>
        key === 'agents'
          ? { server: { enabled } }
          : { enabled: mock, environment: 'demo' },
    },
  } as unknown as Application;
  return { executor, provider: new OnlineExecutorProvider(app) };
}

describe('NocoReach Online Agent availability', () => {
  it('registers the compatibility lifecycle in the application', () => {
    expect(providers).toContain(OnlineExecutorProvider);
  });

  it.each([false, true])(
    'ignores the retired false override with simulation=%s and releases the executor on shutdown',
    async (mock) => {
      const { executor, provider } = fixture(false, mock);
      await provider.start();
      await provider.start();
      expect(executor.start).toHaveBeenCalledOnce();
      await provider.shutdown();
      await provider.shutdown();
      expect(executor.stop).toHaveBeenCalledOnce();
      await provider.start();
      expect(executor.start).toHaveBeenCalledTimes(2);
      await provider.shutdown();
      expect(executor.stop).toHaveBeenCalledTimes(2);
    },
  );

  it.each([undefined, true])(
    'preserves plugin ownership when enabled=%s instead of starting or stopping it twice',
    async (enabled) => {
      const { executor, provider } = fixture(enabled);
      await provider.start();
      await provider.shutdown();
      expect(executor.start).not.toHaveBeenCalled();
      expect(executor.stop).not.toHaveBeenCalled();
    },
  );
});
