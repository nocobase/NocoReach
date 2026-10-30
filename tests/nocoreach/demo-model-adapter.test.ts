// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { OnlineProvider } from '../../server/nocoreach/execution/provider';
import type { DemoModelRequest } from '@nocobase/app-plugin-demo-mode/server/tokens';
import { demoAnswers } from '../../server/nocoreach/demo-data/answers';

const request = (input: Partial<DemoModelRequest>): DemoModelRequest => ({
  model: 'demo',
  system: '',
  prompt: '',
  messages: [],
  tools: [],
  toolResults: [],
  language: 'zh',
  ...input,
});

it('asks for the authorized current-project analysis and uses its opportunity links', async () => {
  const answers = demoAnswers();
  const initial = request({
    prompt: '哪些机会值得做？',
    tools: [{ name: 'daily_analysis' }],
  });
  expect(
    await answers.find((answer) => answer.match(initial))?.reply(initial),
  ).toEqual({
    toolCalls: [{ name: 'daily_analysis', arguments: {} }],
  });
  const scoped = request({
    ...initial,
    toolResults: [
      {
        name: 'daily_analysis',
        content: JSON.stringify({
          text: JSON.stringify({
            awaitingDecisionNow: [
              {
                title: '核对 CRM 报价版本',
                url: '/opportunities?project=crm&item=quote',
                priority: 'high',
              },
            ],
          }),
        }),
      },
    ],
  });
  const reply = await answers
    .find((answer) => answer.match(scoped))
    ?.reply(scoped);
  expect(reply).toContain(
    '[核对 CRM 报价版本](/opportunities?project=crm&item=quote)',
  );
  expect(reply).not.toContain('Excel');
  const denied = request({
    ...initial,
    toolResults: [{ name: 'daily_analysis', content: '{"accessDenied":true}' }],
  });
  expect(
    await answers.find((answer) => answer.match(denied))?.reply(denied),
  ).not.toContain('/opportunities?');
});

it.each(['Acme', 'Acme CRM'])(
  'keeps %s memory suggestions aligned with its product',
  async (project) => {
    const input = request({
      tag: 'memory-draft',
      prompt: JSON.stringify({
        project,
        website: [{ text: 'Acme and Acme CRM are separate products.' }],
      }),
    });
    const reply = await demoAnswers()
      .find((answer) => answer.match(input))
      ?.reply(input);
    expect(String(reply)).toContain(
      project === 'Acme' ? '项目管理' : '销售协作',
    );
    expect(String(reply)).not.toMatch(/NocoBase|低代码/);
  },
);
it.each(['Acme', 'Acme CRM'])(
  'keeps %s keyword seeds scoped and compatible with proposal provenance',
  async (project) => {
    const input = request({
      tag: 'keyword-seeds',
      prompt: JSON.stringify({ project }),
    });
    const reply = await demoAnswers()
      .find((answer) => answer.match(input))
      ?.reply(input);
    const result = JSON.parse(String(reply)) as {
      seeds: { seed: string; from: string[]; why: string }[];
    };
    expect(result.seeds.length).toBeGreaterThan(4);
    expect(
      result.seeds.every(
        (seed) => seed.from.includes('memory') && seed.why.includes(project),
      ),
    ).toBe(true);
    expect(result.seeds.map((seed) => seed.seed)).toContain(
      project === 'Acme' ? 'project management' : 'sales pipeline',
    );
    expect(JSON.stringify(result)).not.toMatch(
      /nocobase|low code|internal tool builder/i,
    );
  },
);
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
