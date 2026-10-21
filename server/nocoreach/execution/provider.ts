import { systemMessageText } from '../../../shared/i18n/messages.js';
import type { DemoDataService, DemoModels } from '@nocobase/app-plugin-demo-mode/server/tokens';
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { DatabaseConnection } from '@nocobase/db';
import {
  MOCK_AI_MODEL,
  simulateAi,
  type MockAiOperation,
} from '../../../app-plugins/nocoreach-mock/server/ai';
import type { MockEngine } from '../../../app-plugins/nocoreach-mock/server/engine';

/** Raised only before a gateway request has started. */
export class ModelPreparationError extends Error {
  readonly status: number;
  constructor(
    readonly reason: 'model_configuration' | 'precondition',
    cause?: unknown,
  ) {
    super(
      cause instanceof Error
        ? cause.message
        : reason === 'model_configuration'
          ? systemMessageText('taskExecution.defaultModelRequired')
          : String(cause),
      { cause },
    );
    this.status =
      reason === 'model_configuration'
        ? 409
        : cause instanceof Error &&
            'status' in cause &&
            typeof cause.status === 'number'
          ? cause.status
          : 502;
  }
}

/** Application text generation goes through Agents: model credentials and usage have one owner. */
export class OnlineProvider {
  constructor(
    private readonly p: { agents: Agents; mock?: MockEngine; demoModels?: DemoModels; demoData?: DemoDataService; network?: { inDemoProject(): Promise<boolean> } },
  ) {}
  async prepare(connection?: DatabaseConnection) {
    if (this.p.mock?.enabled) {
      this.p.mock.context();
      return MOCK_AI_MODEL;
    }
    let model;
    try {
      model = (await this.p.agents.models.services.defaults(connection))
        .effectiveChat;
    } catch (cause) {
      throw new ModelPreparationError('precondition', cause);
    }
    if (!model) throw new ModelPreparationError('model_configuration');
    return { llmService: model.modelService, model: model.model };
  }
  async complete(
    system: string,
    prompt: string,
    operation?: MockAiOperation,
    signal?: AbortSignal,
  ): Promise<string> {
    if (this.p.mock?.enabled)
      return simulateAi(this.p.mock, operation, prompt, signal);
    // A demo project must not reach a real model even if an administrator changed the default model.
    if (await this.p.network?.inDemoProject()) {
      if (!this.p.demoModels) throw new ModelPreparationError('precondition', 'Demo model adapter unavailable');
      return this.p.demoModels.complete({ system, prompt, tag: operation });
    }
    const chosen = await this.prepare();
    await this.p.demoData?.load();
    // The demo's simulated model answers in process, where it can tell which operation asks.
    if (this.p.demoModels?.isDemoModel({ modelService: chosen.llmService }))
      return this.p.demoModels.complete({ system, prompt, tag: operation });
    const model = { modelService: chosen.llmService, model: chosen.model };
    // Validate locally before the gateway can send anything. Keep this outside
    // prepare(connection): connectionFor cannot join a caller's transaction.
    try {
      await this.p.agents.models.services.connectionFor(model, 'chat');
    } catch (cause) {
      const configuration =
        cause instanceof Error &&
        cause.name === 'ModelError' &&
        'code' in cause &&
        (cause.code === 'config' || cause.code === 'auth');
      throw new ModelPreparationError(
        configuration ? 'model_configuration' : 'precondition',
        cause,
      );
    }
    const result = await this.p.agents.models.gateway.generate({
      model,
      system,
      prompt,
      source: 'nocoreach',
      signal: signal ?? AbortSignal.timeout(240000),
    });
    return result.text;
  }
}
