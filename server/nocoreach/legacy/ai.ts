// The classic `@nocobase/plugin-ai` surface the ported services call for the online AI — `pm.get('@nocobase/plugin-ai')`
// with its `aiManager` (providers, enabled models, one provider instance per call) and
// `aiEmployeesManager.resolveModel(employee)`, plus the `aiEmployees` and `llmServices` tables — rebuilt on the public
// AIManager of `@nocobase/app-plugin-ai-employee` (`aiManagerToken`).
//
// What differs from the classic plugin: model services are declared in config.yml (`ai.llmServices`) and the plugin
// deletes every service the configuration does not list, so this layer only reads them; a key never passes through
// NocoReach. The one thing NocoReach writes, as before, is which of the enabled models the "atlas" employee uses.
import type { AIEmployeeEntity, AIManager, LLMModelOptions, LLMServiceEntity } from '@nocobase/ai-employee';

import { legacyRecord, type LegacyRecord, type LegacyRepository } from './database.js';

type Values = Record<string, any>;

/** Errors the services already show as they are: 409 reads as "not set up", not as a failure of the request. */
const notReady = (message: string) => Object.assign(new Error(message), { status: 409 });
const readOnly = () => {
  throw notReady('模型服务在 config.yml 的 ai.llmServices 里配置，NocoReach 只读');
};

const field = (row: unknown, key: string) =>
  row && typeof (row as LegacyRecord).get === 'function' ? (row as LegacyRecord).get(key) : (row as Values)?.[key];

export class LegacyAI {
  /** What `pm.get('@nocobase/plugin-ai')` answers. */
  readonly plugin: {
    aiManager: {
      readonly llmProviders: AIManager['llmProviderManager']['llmProviders'];
      listLLMProviders(): ReturnType<AIManager['llmProviderManager']['listLLMProviders']>;
      listAllEnabledModels(): ReturnType<AIManager['llmProviderManager']['listAllEnabledModels']>;
      getLLMService(options: LLMModelOptions): ReturnType<AIManager['llmProviderManager']['getLLMService']>;
    };
    aiEmployeesManager: { resolveModel(employee: unknown): Promise<LLMModelOptions> };
  };

  constructor(private readonly manager: () => AIManager) {
    const providers = () => this.manager().llmProviderManager;
    this.plugin = {
      aiManager: {
        get llmProviders() {
          return providers().llmProviders;
        },
        listLLMProviders: () => providers().listLLMProviders(),
        listAllEnabledModels: () => providers().listAllEnabledModels(),
        getLLMService: (options) => providers().getLLMService(options),
      },
      aiEmployeesManager: { resolveModel: (employee) => this.resolveModel(employee) },
    };
  }

  // The AI Employee plugin's own rule (its AIEmployeesManager.resolveModel, which is not exported): an employee with model
  // settings runs the first of its models that is enabled now; one without runs the first enabled model of all services.
  // Failures say what is missing, with 409, because each means "set up the online AI" to the services above.
  async resolveModel(employee: unknown): Promise<LLMModelOptions> {
    const settings = field(employee, 'modelSettings') as Values | undefined;
    const providers = this.manager().llmProviderManager;
    if (settings?.enabled) {
      const chosen = (Array.isArray(settings.models) ? settings.models : [])
        .filter((m: Values) => m?.llmService && m?.model)
        .map((m: Values) => ({ llmService: String(m.llmService), model: String(m.model) }));
      if (!chosen.length && settings.llmService && settings.model)
        chosen.push({ llmService: String(settings.llmService), model: String(settings.model) });
      if (!chosen.length) throw notReady('还没有接入在线 AI');
      const enabled = await providers.listAllEnabledModels();
      const available = chosen.filter((m: LLMModelOptions) =>
        enabled.some((s) => s.llmService === m.llmService && s.enabledModels.some((o) => o.value === m.model)),
      );
      if (!available.length) throw notReady('在线 AI 选的模型现在没有启用');
      return available[0];
    }
    try {
      return await providers.resolveModel();
    } catch {
      throw notReady('还没有接入在线 AI');
    }
  }

  /** `db.getRepository('aiEmployees')`: the plugin's employees by username; `update` merges into the stored employee. */
  employees(): LegacyRepository {
    const employees = () => this.manager().employeeManager;
    const username = (options: Values = {}) => {
      const name = options.filter?.username ?? options.filterByTk;
      if (typeof name !== 'string' || !name) throw new Error('aiEmployees on NocoBase 3 is looked up by username');
      return name;
    };
    return {
      find: async () => (await employees().listEmployees()).map((e) => legacyRecord(e as Values)),
      findOne: async (options) => {
        const e = await employees().getEmployee(username(options));
        return e ? legacyRecord(e as Values) : null;
      },
      count: async () => (await employees().listEmployees()).length,
      update: async (options = {}) => {
        const current = await employees().getEmployee(username(options));
        if (!current) return [];
        const next = await employees().upsertEmployee({ ...current, ...(options.values as Partial<AIEmployeeEntity>) });
        return [legacyRecord(next as Values)];
      },
      create: async () => {
        throw new Error('AI employees on NocoBase 3 are registered in code, not created by NocoReach');
      },
      destroy: async () => {
        throw new Error('AI employees on NocoBase 3 are registered in code, not removed by NocoReach');
      },
    };
  }

  /** `db.getRepository('llmServices')`: the services config.yml declares, read-only. */
  services(): LegacyRepository {
    const services = () => this.manager().llmServiceManager;
    const shape = (s: LLMServiceEntity) => legacyRecord(s as unknown as Values);
    return {
      find: async () => (await services().listLLMServices()).map(shape),
      findOne: async (options = {}) => {
        const name = (options.filter as Values | undefined)?.name ?? options.filterByTk;
        if (typeof name !== 'string' || !name) return null;
        const s = await services().getLLMService(name);
        return s ? shape(s) : null;
      },
      count: async () => (await services().listLLMServices()).length,
      create: async () => readOnly(),
      update: async () => readOnly(),
      destroy: async () => readOnly(),
    };
  }
}
