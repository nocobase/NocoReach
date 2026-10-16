import { expect, test, vi } from 'vitest';
import { OnlineAI } from '../../server/nocoreach/online-ai';
import { OnlineProvider } from '../../server/nocoreach/execution/provider';
import { aiFail } from '../../server/nocoreach/policy';
function fixture(model: { modelService: string; model: string } | null) {
  const generate = vi.fn().mockResolvedValue({ text: 'draft' });
  const defaults = vi.fn().mockResolvedValue({ effectiveChat: model });
  const p = {
    agents: {
      models: {
        services: {
          defaults,
          connectionFor: vi.fn().mockResolvedValue({}),
          list: async () => [
            {
              name: 'service',
              title: 'Service',
              provider: 'openai',
              enabled: true,
              apiKey: 'private-key',
            },
          ],
        },
        gateway: { generate },
      },
    },
    analysis: { state: async () => ({ runs: [] }) },
  };
  return {
    ai: new OnlineAI(p as never),
    provider: new OnlineProvider(p as never),
    generate,
    defaults,
  };
}
test('business status uses the official default model and excludes credentials', async () => {
  const f = fixture({ modelService: 'service', model: 'test-model' });
  const status = await f.ai.status('1');
  expect(status.connected).toBe(true);
  expect(status.model).toBe('test-model');
  expect(JSON.stringify(status)).not.toContain('private-key');
  expect(await f.provider.complete('rules', 'input')).toBe('draft');
  expect(f.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      source: 'nocoreach',
      model: { modelService: 'service', model: 'test-model' },
    }),
  );
});
test('missing default model provides an actionable configuration error', async () => {
  const f = fixture(null);
  expect((await f.ai.status()).connected).toBe(false);
  await expect(f.provider.prepare()).rejects.toMatchObject({ status: 409 });
  expect(f.generate).not.toHaveBeenCalled();
});

test('a default lookup outage keeps the caller error instead of claiming configuration is missing', async () => {
  const f = fixture({ modelService: 'service', model: 'test-model' });
  f.defaults.mockRejectedValue(new Error('database unavailable'));
  const failure = await f.provider.prepare().catch((error: unknown) => error);
  expect(failure).toMatchObject({ status: 502, reason: 'precondition' });
  expect(() => aiFail(failure, 'Suggestion unavailable')).toThrow(
    'Suggestion unavailable',
  );
  expect(f.generate).not.toHaveBeenCalled();
});
