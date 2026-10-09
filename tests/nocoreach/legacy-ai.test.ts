// The online AI bridge (server/nocoreach/legacy/ai.ts): the classic `@nocobase/plugin-ai` calls answered by a stand-in
// AIManager of the AI Employee plugin (synthetic data only).
import assert from 'node:assert/strict';
import { test } from 'vitest';

import { LegacyAI } from '../../server/nocoreach/legacy/ai.js';

type Service = { name: string; title: string; provider: string; options: Record<string, unknown>; enabled: boolean; models: string[] };

function harness(services: Service[] = [], employee: Record<string, any> = { username: 'atlas', enabled: true }) {
  const employees = new Map([[employee.username, { ...employee }]]);
  const enabled = () =>
    services
      .filter((s) => s.enabled && s.models.length)
      .map((s) => ({ llmService: s.name, llmServiceTitle: s.title, provider: s.provider, enabledModels: s.models.map((m) => ({ label: m, value: m })) }));
  const manager: any = {
    llmProviderManager: {
      llmProviders: new Map([['deepseek', { title: 'DeepSeek' }]]),
      listLLMProviders: () => [{ name: 'deepseek', title: 'DeepSeek', supportedModel: ['LLM'] }],
      listAllEnabledModels: async () => enabled(),
      resolveModel: async () => {
        const first = enabled()[0];
        if (!first) throw new Error('LLM service not configured');
        return { llmService: first.llmService, model: first.enabledModels[0].value };
      },
      getLLMService: async (o: any) => ({ provider: { o }, model: o.model, service: services.find((s) => s.name === o.llmService) }),
    },
    employeeManager: {
      getEmployee: async (u: string) => employees.get(u),
      listEmployees: async () => [...employees.values()],
      upsertEmployee: async (e: any) => (employees.set(e.username, { ...e }), e),
    },
    llmServiceManager: {
      getLLMService: async (n: string) => services.find((s) => s.name === n),
      listLLMServices: async () => services,
    },
  };
  return { ai: new LegacyAI(() => manager), employees };
}

const DEEPSEEK: Service = { name: 'deepseek', title: 'DeepSeek', provider: 'deepseek', options: { apiKey: 'sk-x' }, enabled: true, models: ['deepseek-chat', 'deepseek-reasoner'] };

test('an employee without model settings runs the first enabled model; nothing configured is a 409 the pages show', async () => {
  assert.deepEqual(await harness([DEEPSEEK]).ai.resolveModel({ get: () => null }), { llmService: 'deepseek', model: 'deepseek-chat' });
  await assert.rejects(harness().ai.resolveModel({}), (e: any) => e.status === 409 && e.message === '还没有接入在线 AI');
});

test('an employee with model settings runs only a chosen model that is enabled now', async () => {
  const chosen = { modelSettings: { enabled: true, models: [{ llmService: 'deepseek', model: 'deepseek-reasoner' }] } };
  assert.deepEqual(await harness([DEEPSEEK]).ai.resolveModel(chosen), { llmService: 'deepseek', model: 'deepseek-reasoner' });
  await assert.rejects(harness([{ ...DEEPSEEK, enabled: false }]).ai.resolveModel(chosen), (e: any) => e.status === 409 && /没有启用/.test(e.message));
  await assert.rejects(harness([DEEPSEEK]).ai.resolveModel({ modelSettings: { enabled: true, models: [] } }), (e: any) => e.status === 409);
});

test('the classic plugin calls reach the AI manager', async () => {
  const { plugin } = harness([DEEPSEEK]).ai;
  assert.equal(plugin.aiManager.llmProviders.get('deepseek')?.title, 'DeepSeek');
  assert.deepEqual(plugin.aiManager.listLLMProviders().map((p) => p.name), ['deepseek']);
  assert.equal((await plugin.aiManager.listAllEnabledModels())[0].llmService, 'deepseek');
  assert.equal((await plugin.aiManager.getLLMService({ llmService: 'deepseek', model: 'deepseek-chat' })).model, 'deepseek-chat');
  assert.deepEqual(await plugin.aiEmployeesManager.resolveModel({}), { llmService: 'deepseek', model: 'deepseek-chat' });
});

test('aiEmployees reads by username and merges an update; llmServices is read-only', async () => {
  const h = harness([DEEPSEEK], { username: 'atlas', enabled: true, nickname: 'Atlas' });
  const employees = h.ai.employees();
  const atlas = await employees.findOne({ filter: { username: 'atlas' } });
  assert.equal(atlas?.get('nickname'), 'Atlas');
  assert.equal(await employees.findOne({ filter: { username: 'nobody' } }), null);
  await employees.update({ filter: { username: 'atlas' }, values: { modelSettings: { enabled: true, models: [{ llmService: 'deepseek', model: 'deepseek-chat' }] } } });
  assert.equal(h.employees.get('atlas')?.nickname, 'Atlas', 'the rest of the employee is kept');
  assert.equal(h.employees.get('atlas')?.modelSettings.models[0].model, 'deepseek-chat');
  const services = h.ai.services();
  assert.equal((await services.findOne({ filter: { name: 'deepseek' } }))?.get('provider'), 'deepseek');
  assert.equal(await services.findOne({ filter: { name: 'missing' } }), null);
  await assert.rejects(services.create({ values: { name: 'x' } }), (e: any) => e.status === 409 && /config\.yml/.test(e.message));
  await assert.rejects(services.update({ filter: { name: 'deepseek' }, values: {} }), (e: any) => e.status === 409);
});
