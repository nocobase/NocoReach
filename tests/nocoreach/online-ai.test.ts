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

// Agent › Who does the work › Daily analysis › Settings (2026-10-22): the plugin's default chat model, which its own
// pages no longer let anyone change, set through NocoReach by administrators only.
function registered(setDefaultChat = vi.fn().mockResolvedValue({})) {
  const actions: Record<
    string,
    (ctx: unknown, next: () => Promise<void>) => Promise<void>
  > = {};
  const p = {
    app: {
      resourceManager: {
        define: ({ actions: a }: { actions: typeof actions }) =>
          Object.assign(actions, a),
      },
      acl: { allow: vi.fn() },
    },
    agents: {
      models: {
        services: {
          setDefaultChat,
          defaults: vi.fn().mockResolvedValue({
            effectiveChat: { modelService: 'service', model: 'pro' },
          }),
          list: async () => [],
        },
      },
    },
    analysis: { state: async () => ({ runs: [] }) },
  };
  new OnlineAI(p as never).register();
  const call = async (values: Record<string, unknown>, roles: string[]) => {
    const ctx = {
      auth: { user: { id: 7 } },
      state: { currentRoles: roles },
      action: {
        resourceName: 'nrOnlineAI',
        actionName: 'setModel',
        params: { values },
      },
      body: undefined as unknown,
      throw: (status: number, message: string) => {
        throw Object.assign(new Error(message), { status });
      },
    };
    await actions.setModel!(ctx, async () => undefined);
    return ctx.body as { model: string | null };
  };
  return { call, setDefaultChat, allow: p.app.acl.allow };
}

test('administrators set the daily analysis model through the plugin default', async () => {
  const r = registered();
  const body = await r.call({ modelService: 'service', model: 'pro' }, [
    'root',
  ]);
  expect(r.setDefaultChat).toHaveBeenCalledWith(
    { modelService: 'service', model: 'pro' },
    '7',
  );
  expect(body.model).toBe('pro');
  expect(r.allow).toHaveBeenCalledWith(
    'nrOnlineAI',
    ['status', 'setModel'],
    'loggedIn',
  );
});

test('setting the daily analysis model needs a model and an administrator', async () => {
  const r = registered();
  await expect(
    r.call({ modelService: 'service' }, ['root']),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    r.call({ modelService: 'service', model: 'pro' }, ['member']),
  ).rejects.toMatchObject({
    status: 403,
  });
  expect(r.setDefaultChat).not.toHaveBeenCalled();
});
