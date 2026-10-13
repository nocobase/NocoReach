// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockEngine } from '../../app-plugins/nocoreach-mock/server/engine';
import {
  MOCK_AI_OPERATIONS,
  simulateAi,
} from '../../app-plugins/nocoreach-mock/server/ai';
import { OnlineProvider } from '../../server/nocoreach/execution/provider';
import { OnlineAI } from '../../server/nocoreach/online-ai';
import { TaskAgentsRuntime } from '../../server/nocoreach/execution/agents-runtime';
import { Notifications } from '../../server/nocoreach/notifications';
import {
  parseOutput,
  styleIssues,
  validInsight,
  DailyAnalysis,
} from '../../server/nocoreach/daily-analysis';
import type { MockScenario } from '../../app-plugins/nocoreach-mock/server/types';

async function setup(scenario: MockScenario = 'normal') {
  const state: Record<string, string> = {};
  const mock = new MockEngine({ enabled: true, environment: 'test' });
  await mock.attach({
    assertPristine: async () => {},
    variables: {
      all: () => state,
      set: async (key, value) => {
        state[key] = value;
      },
    },
    app: { resourceManager: { define: vi.fn() }, acl: { allow: vi.fn() } },
    project: async () => ({}),
    requireAccess: async () => 'admin',
  });
  await mock.configure({
    projectId: '1',
    enabled: true,
    scenario,
    seed: 'unit-test',
    clock: '2026-10-12T00:00:00.000Z',
    revision: 0,
  });
  const generate = vi.fn(() => {
    throw new Error('REAL MODEL MUST NOT RUN');
  });
  const defaults = vi.fn(() => {
    throw new Error('REAL DEFAULTS MUST NOT BE READ');
  });
  const p = {
    mock,
    agents: { online: { gateway: { generate }, services: { defaults } } },
    analysis: { state: async () => ({ runs: [] }) },
  };
  return {
    mock,
    generate,
    defaults,
    provider: new OnlineProvider(p as never),
    ai: new OnlineAI(p as never),
    p,
  };
}
const input = JSON.stringify({
  project: { name: 'Demo' },
  evidence: {
    signals: {
      items: [
        {
          key: 'gsc:demo',
          source: 'gsc',
          title: '示例曝光变化',
          facts: { impressions: 42 },
          actionable: true,
        },
        {
          key: 'site:demo',
          source: 'site',
          title: '示例页面变化',
          facts: { pages: 5 },
          actionable: false,
        },
      ],
    },
  },
});
afterEach(() => vi.useRealTimers());

describe('simulated AI boundary', () => {
  it('uses deterministic, visibly synthetic output through the real parsing and validation helpers', async () => {
    const f = await setup();
    const run = () =>
      f.mock.run('1', () =>
        f.provider.complete('rules', `资料\n${input}`, 'daily-report'),
      );
    const first = await run();
    expect(await run()).toBe(first);
    const parsed = parseOutput(first);
    expect(parsed.simulated).toBe(true);
    expect(parsed.provider).toBe('nocoreach-mock');
    expect(parsed.insights).toHaveLength(1);
    expect(parsed.insights[0].signalIds).toEqual(['gsc:demo']);
    expect(validInsight(parsed.insights[0])).toBe(true);
    expect(styleIssues(parsed.insights[0])).toEqual([]);
    expect(
      parsed.observations.every((text: string) => text.includes('Simulated')),
    ).toBe(true);
    expect(f.generate).not.toHaveBeenCalled();
    expect(f.defaults).not.toHaveBeenCalled();
  });
  it('records a simulated daily report through the existing daily lifecycle and save path', async () => {
    const f = await setup();
    const rows: Record<string, any> = {};
    const saved = vi.fn(async (_id, value) => ({
      insights: { items: value.insights, observations: value.observations },
    }));
    const repo = {
      findOne: async ({ filter }: any) =>
        rows[filter.key]
          ? { id: filter.key, get: () => rows[filter.key] }
          : null,
      create: async ({ values }: any) => {
        rows[values.key] = values.payload;
      },
      update: async ({ filterByTk, values }: any) => {
        rows[filterByTk] = values.payload;
      },
    };
    const p = {
      ...f.p,
      project: async () => ({ name: 'Demo' }),
      db: { getRepository: () => repo },
      strategy: {
        context: async () => JSON.parse(input),
        state: async () => ({ revision: 0, proposals: [] }),
        saveInsights: saved,
      },
    };
    const daily = new DailyAnalysis(p);
    const result = await f.mock.run('1', () => daily.run('1', 'manual'));
    expect(result.ok).toBe(true);
    expect(result.items).toBe(1);
    expect(result.model).toBe('nocoreach-mock/synthetic-fixture-v1');
    expect(saved).toHaveBeenCalledOnce();
    expect(rows['daily-analysis:1'].runs[0].model).toContain(
      'synthetic-fixture',
    );
    expect(f.generate).not.toHaveBeenCalled();
  });
  it('keeps competitor suggestions inside the supported fictional upstream catalog', async () => {
    const f = await setup();
    const reply = JSON.parse(
      await f.mock.run('1', () =>
        f.provider.complete('', '{}', 'competitor-suggest'),
      ),
    );
    const candidate = reply.competitors[0];
    expect((await f.mock.request('1', candidate.site)).status).toBe(200);
    expect(
      (
        await f.mock.request(
          '1',
          `https://api.github.com/repos/${candidate.repo}`,
        )
      ).status,
    ).toBe(200);
  });
  it('marks status synthetic without reading real credentials or model configuration', async () => {
    const f = await setup();
    expect(await f.ai.status('1')).toMatchObject({
      connected: true,
      simulated: true,
      service: { provider: 'synthetic' },
    });
    expect(await f.ai.status('2')).toMatchObject({
      connected: false,
      error: 'NR_MOCK_PROJECT_DISABLED',
    });
    expect(f.defaults).not.toHaveBeenCalled();
  });
  it('fails closed for unsupported AI, missing project context, disabled project, task invocation and Runner enqueue', async () => {
    const f = await setup();
    await expect(
      f.mock.run('1', () =>
        f.provider.complete('keyword suggestion prompt', '{}'),
      ),
    ).rejects.toMatchObject({ code: 'NR_MOCK_UNSUPPORTED_AI_OPERATION' });
    await expect(
      f.provider.complete('rules', '{}', 'daily-report'),
    ).rejects.toMatchObject({ code: 'NR_MOCK_PROJECT_REQUIRED' });
    await expect(
      f.mock.run('2', () => f.provider.complete('rules', '{}', 'daily-report')),
    ).rejects.toMatchObject({ code: 'NR_MOCK_PROJECT_DISABLED' });
    await expect(f.provider.invoke({} as never)).rejects.toMatchObject({
      code: 'NR_MOCK_UNSUPPORTED_OPERATION',
    });
    const enqueue = vi.fn();
    const runtime = new TaskAgentsRuntime(
      { runs: { enqueue } } as never,
      { p: { mock: f.mock } } as never,
      '/main',
    );
    await expect(
      runtime.enqueue({} as never, {} as never),
    ).rejects.toMatchObject({ code: 'NR_MOCK_UNSUPPORTED_OPERATION' });
    expect(enqueue).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });
  it.each(MOCK_AI_OPERATIONS)(
    'serves only the explicit %s operation with a synthetic marker',
    async (operation) => {
      const f = await setup();
      const text = await f.mock.run('1', () =>
        simulateAi(f.mock, operation, input),
      );
      expect(JSON.parse(text)).toMatchObject({
        simulated: true,
        provider: 'nocoreach-mock',
      });
    },
  );
  it.each([
    ['rate-limit', 429],
    ['login-expired', 401],
    ['error', 503],
  ] as const)(
    'retains %s errors without a live fallback',
    async (scenario, status) => {
      const f = await setup(scenario);
      await expect(
        f.mock.run('1', () =>
          f.provider.complete('rules', input, 'daily-report'),
        ),
      ).rejects.toMatchObject({ status });
      expect(f.generate).not.toHaveBeenCalled();
    },
  );
  it('keeps malformed and empty scenario behavior visible to the ordinary parser', async () => {
    const malformed = await setup('malformed'),
      empty = await setup('empty');
    expect(
      parseOutput(
        await malformed.mock.run('1', () =>
          malformed.provider.complete('', input, 'daily-report'),
        ),
      ),
    ).toBeNull();
    expect(
      JSON.parse(
        await empty.mock.run('1', () =>
          empty.provider.complete('', input, 'daily-report'),
        ),
      ).insights,
    ).toEqual([]);
  });
  it('honors cancellation and timeouts without leaving a timer or making network requests', async () => {
    vi.useFakeTimers();
    const f = await setup('slow-cancel'),
      controller = new AbortController();
    const pending = f.mock.run('1', () =>
      simulateAi(f.mock, 'daily-report', input, controller.signal),
    );
    const rejected = pending.catch((error: unknown) => error);
    controller.abort();
    expect(await rejected).toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
    const timeout = await setup('timeout');
    const timed = timeout.mock.run('1', () =>
      simulateAi(timeout.mock, 'daily-report', input, undefined, 5),
    );
    const failed = timed.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5);
    expect(await failed).toMatchObject({ name: 'TimeoutError' });
    expect(vi.getTimerCount()).toBe(0);
    expect(f.generate).not.toHaveBeenCalled();
  });
  it('suppresses external email while retaining ordinary in-app notifications', async () => {
    const f = await setup(),
      send = vi.fn(),
      emailLookup = vi.fn();
    const notifications = new Notifications({
      mock: f.mock,
      app: { pm: { get: () => ({ send }) } },
      db: {
        getRepository: () => ({
          findOne: async ({ filter }: any) => {
            if (filter.notificationType === 'email') emailLookup();
            return { get: () => 'smtp' };
          },
        }),
      },
    });
    expect(
      await notifications.send(['1'], {
        title: '模拟通知',
        content: 'demo',
        url: '/home',
      }),
    ).toBe(1);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].channelName).toBe('nocoreach');
    expect(emailLookup).not.toHaveBeenCalled();
  });
});
