// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { OnlineProvider } from '../../server/nocoreach/execution/provider';
it('routes demo projects to their adapter even when the default model is real, without fallback', async () => {
  const generate = vi.fn();
  const defaults = vi.fn(async () => ({
    effectiveChat: { modelService: 'real', model: 'live' },
  }));
  const complete = vi.fn(async () => 'fictional');
  const provider = new OnlineProvider({
    agents: { models: { services: { defaults }, gateway: { generate } } },
    network: { inDemoProject: async () => true },
    demoModels: { complete },
  } as unknown as ConstructorParameters<typeof OnlineProvider>[0]);
  expect(await provider.complete('system', 'prompt')).toBe('fictional');
  complete.mockRejectedValueOnce(new Error('DEMO_MOCK_UNAVAILABLE'));
  await expect(provider.complete('system', 'prompt')).rejects.toThrow(
    'DEMO_MOCK_UNAVAILABLE',
  );
  expect(defaults).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});
it('preserves ordinary non-demo model routing', async () => {
  const generate = vi.fn(async () => ({ text: 'live result' }));
  const complete = vi.fn();
  const provider = new OnlineProvider({
    agents: {
      models: {
        services: {
          defaults: async () => ({
            effectiveChat: { modelService: 'real', model: 'live' },
          }),
          connectionFor: async () => ({}),
        },
        gateway: { generate },
      },
    },
    network: { inDemoProject: async () => false },
    demoModels: { complete, isDemoModel: () => false },
  } as unknown as ConstructorParameters<typeof OnlineProvider>[0]);
  expect(await provider.complete('system', 'prompt')).toBe('live result');
  expect(generate).toHaveBeenCalledOnce();
  expect(complete).not.toHaveBeenCalled();
});
