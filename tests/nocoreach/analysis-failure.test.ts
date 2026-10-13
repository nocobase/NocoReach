import { expect, test, vi } from 'vitest';
import { DailyAnalysis } from '../../server/nocoreach/daily-analysis';
import { ModelPreparationError } from '../../server/nocoreach/execution/provider';

function fixture() {
  const generate = vi
    .fn()
    .mockResolvedValue({ text: '{"insights":[],"observations":[]}' });
  const defaults = vi.fn().mockResolvedValue({
    effectiveChat: { modelService: 'test', model: 'test' },
  });
  const strategy = {
    context: vi
      .fn()
      .mockResolvedValue({ project: {}, evidence: { signals: { items: [] } } }),
    state: vi.fn().mockResolvedValue({ proposals: [] }),
    saveInsights: vi.fn().mockResolvedValue({ insights: { items: [] } }),
  };
  let payload: any = {
    runs: [],
    retry: { attempt: 1, nextAt: new Date().toISOString() },
  };
  const analysis = new DailyAnalysis({
    strategy,
    agents: { online: { services: { defaults }, gateway: { generate } } },
    db: {
      getRepository: () => ({
        findOne: async () => ({ id: 1, get: () => payload }),
        update: async ({ values }: any) => {
          payload = values.payload;
        },
      }),
    },
  });
  return { analysis, defaults, generate, strategy, state: () => payload };
}

test.each(['workflow', 'manual'])(
  'missing default model is an unbilled precondition and cancels retry: %s',
  async (trigger) => {
    const f = fixture();
    f.defaults.mockResolvedValue({ effectiveChat: null });
    expect(await f.analysis.run('1', trigger)).toMatchObject({
      ok: false,
      failureKind: 'model_configuration',
      retryable: false,
    });
    expect(f.generate).not.toHaveBeenCalled();
    expect(f.state().retry).toBeNull();
    expect((await f.analysis.state('1')).runs[0].failureKind).toBe(
      'model_configuration',
    );
  },
);

test('default lookup failure and context failure precede invocation', async () => {
  const f = fixture();
  f.defaults.mockRejectedValue(new Error('database unavailable'));
  expect(await f.analysis.run('1', 'workflow')).toMatchObject({
    failureKind: 'precondition',
    retryable: true,
  });
  expect(f.generate).not.toHaveBeenCalled();
  f.strategy.context.mockRejectedValue(new Error('context unavailable'));
  expect(await f.analysis.run('1', 'workflow')).toMatchObject({
    failureKind: 'precondition',
  });
});

test.each([
  [
    Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
    'billing_unknown',
    false,
  ],
  [
    Object.assign(new Error('unreachable'), { code: 'ECONNREFUSED' }),
    'provider_unavailable',
    true,
  ],
  [
    Object.assign(new Error('limited'), { status: 429 }),
    'provider_unavailable',
    true,
  ],
  [new Error('unknown'), 'billing_unknown', false],
])(
  'classifies gateway errors from execution evidence: %s',
  async (error, failureKind, retryable) => {
    const f = fixture();
    f.generate.mockRejectedValue(error);
    expect(await f.analysis.run('1', 'workflow')).toMatchObject({
      failureKind,
      retryable,
    });
    expect(f.generate).toHaveBeenCalledOnce();
  },
);

test('invalid output and persistence failures remain possibly billed', async () => {
  const f = fixture();
  f.generate.mockResolvedValue({ text: 'invalid' });
  expect(await f.analysis.run('1', 'workflow')).toMatchObject({
    failureKind: 'billing_unknown',
    retryable: false,
  });
  f.generate.mockResolvedValue({ text: '{"insights":[],"observations":[]}' });
  f.strategy.saveInsights.mockRejectedValue(
    new ModelPreparationError('model_configuration'),
  );
  expect(await f.analysis.run('1', 'workflow')).toMatchObject({
    failureKind: 'billing_unknown',
    retryable: false,
  });
});
