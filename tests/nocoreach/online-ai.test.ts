import { expect, test, vi } from 'vitest';
import { OnlineAI } from '../../server/nocoreach/online-ai';
import { OnlineProvider } from '../../server/nocoreach/execution/provider';
import { aiFail } from '../../server/nocoreach/policy';
type Model = { modelService: string; model: string };
function fixture(model: Model | null, editing: Model | null = null) {
  const generate = vi.fn().mockResolvedValue({ text: 'draft' });
  const stream = vi.fn(async function* () {
    yield { type: 'text', delta: 'draft' };
    yield { type: 'finish', reason: 'stop' };
  });
  const defaults = vi.fn().mockResolvedValue({ effectiveChat: model });
  const connectionFor = vi.fn().mockResolvedValue({});
  const p = {
    editingModel: { get: async () => editing },
    agents: {
      models: {
        services: {
          defaults,
          connectionFor,
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
        gateway: { generate, stream },
      },
    },
    analysis: { state: async () => ({ runs: [] }) },
  };
  return {
    ai: new OnlineAI(p as never),
    provider: new OnlineProvider(p as never),
    generate,
    stream,
    defaults,
    connectionFor,
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
// Each cloud model row picks its own model (2026-11-13 user decision): what a person asks for on a page runs on Editing
// and suggestions' model, the daily analysis on the default chat model.
test('editing and suggestions run on their own model and the daily analysis on the default', async () => {
  const gemini = { modelService: 'gemini', model: 'gemini-pro' };
  const f = fixture({ modelService: 'service', model: 'test-model' }, gemini);
  await f.provider.complete('rules', 'input', 'task-draft');
  expect(f.generate).toHaveBeenLastCalledWith(
    expect.objectContaining({ model: gemini }),
  );
  let text = '';
  for await (const piece of f.provider.stream(
    'rules',
    'input',
    'article-rewrite',
  ))
    text += piece;
  expect(text).toBe('draft');
  expect(f.stream).toHaveBeenLastCalledWith(
    expect.objectContaining({ model: gemini }),
  );
  // New playbook's draft names no operation and is editing too.
  await f.provider.complete('rules', 'input');
  expect(f.generate).toHaveBeenLastCalledWith(
    expect.objectContaining({ model: gemini }),
  );
  for (const operation of [
    'daily-report',
    'analysis-rule-evaluate',
    'memory-check',
    'content-source-map',
  ] as const) {
    await f.provider.complete('rules', 'input', operation);
    expect(f.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: { modelService: 'service', model: 'test-model' },
      }),
    );
  }
  expect(await f.ai.status('1')).toMatchObject({
    model: 'test-model',
    editing: { choice: gemini, model: 'gemini-pro', available: true },
  });
});

test('editing and suggestions without a model of their own run on the default chat model', async () => {
  const f = fixture({ modelService: 'service', model: 'test-model' });
  await f.provider.complete('rules', 'input', 'article-rewrite');
  expect(f.generate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      model: { modelService: 'service', model: 'test-model' },
    }),
  );
  expect((await f.ai.status('1')).editing).toEqual({
    choice: null,
    model: 'test-model',
    available: true,
  });
});

test('an own editing model that can no longer answer is reported and not replaced', async () => {
  const gone = { modelService: 'removed', model: 'old' };
  const f = fixture({ modelService: 'service', model: 'test-model' }, gone);
  f.connectionFor.mockImplementation(async (model: Model) => {
    if (model.modelService === 'removed')
      throw Object.assign(new Error('Model service not found'), {
        name: 'ModelError',
        code: 'config',
      });
    return {};
  });
  expect((await f.ai.status('1')).editing).toEqual({
    choice: gone,
    model: 'old',
    available: false,
  });
  await expect(
    f.provider.complete('rules', 'input', 'keyword-seeds'),
  ).rejects.toMatchObject({ status: 409 });
  expect(f.generate).not.toHaveBeenCalled();
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
  let editing: Model | null = null;
  const editingModel = {
    get: async () => editing,
    set: vi.fn(async (model: Model | null) => {
      editing = model;
    }),
  };
  const connectionFor = vi.fn(async (model: Model) => {
    if (model.modelService !== 'service')
      throw Object.assign(new Error('Model service not found'), {
        name: 'ModelError',
        code: 'config',
      });
    return {};
  });
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
    editingModel,
    agents: {
      models: {
        services: {
          setDefaultChat,
          connectionFor,
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
    return ctx.body as {
      model: string | null;
      editing: { choice: Model | null; model: string | null };
    };
  };
  return { call, setDefaultChat, editingModel, allow: p.app.acl.allow };
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

test('administrators give editing and suggestions a model of their own, or take it back to the default', async () => {
  const r = registered();
  const body = await r.call(
    { role: 'editing', modelService: 'service', model: 'flash' },
    ['root'],
  );
  expect(r.setDefaultChat).not.toHaveBeenCalled();
  expect(r.editingModel.set).toHaveBeenCalledWith(
    { modelService: 'service', model: 'flash' },
    '7',
  );
  expect(body).toMatchObject({
    model: 'pro',
    editing: {
      choice: { modelService: 'service', model: 'flash' },
      model: 'flash',
    },
  });
  const back = await r.call({ role: 'editing', model: null }, ['root']);
  expect(r.editingModel.set).toHaveBeenLastCalledWith(null, '7');
  expect(back.editing).toMatchObject({ choice: null, model: 'pro' });
});

test('editing and suggestions only take a model that answers, set by an administrator', async () => {
  const r = registered();
  await expect(
    r.call({ role: 'editing', modelService: 'removed', model: 'old' }, [
      'root',
    ]),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    r.call({ role: 'editing', modelService: 'service', model: 'flash' }, [
      'member',
    ]),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    r.call({ role: 'editing', model: null }, ['member']),
  ).rejects.toMatchObject({ status: 403 });
  expect(r.editingModel.set).not.toHaveBeenCalled();
});
