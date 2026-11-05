import { systemMessageText } from '../../../shared/i18n/messages.js';
import type { DemoDataService, DemoModels } from '@nocobase/app-plugin-demo-mode/server/tokens';
import type { Agents, ModelMessage } from '@nocobase/app-plugin-agents/server/tokens';
import type { DatabaseConnection } from '@nocobase/db';
import {
  MOCK_AI_MODEL,
  simulateAi,
  type MockAiOperation,
} from '../../../app-plugins/nocoreach-mock/server/ai';
import { mockDelay, type MockEngine } from '../../../app-plugins/nocoreach-mock/server/engine';

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

/** A streamed answer that stopped short (`length`, `filtered`) or that a simulation could not use (`unusable`). */
export class ModelStreamError extends Error {
  readonly status = 502;
  constructor(readonly reason: 'length' | 'filtered' | 'unusable') {
    super(`The model's answer was cut off or unusable (${reason}).`);
    this.name = 'ModelStreamError';
  }
}

// Simulated and demo answers arrive whole; they are handed on a few characters at a time, as a model writes, and in
// at most this many pieces so a long one still arrives in about three seconds.
const PIECE_MS = 25;
const PIECES_MAX = 120;
async function* pieces(text: string, signal?: AbortSignal): AsyncGenerator<string> {
  const chars = Array.from(text);
  const size = Math.max(4, Math.ceil(chars.length / PIECES_MAX));
  for (let i = 0; i < chars.length; i += size) {
    signal?.throwIfAborted();
    if (i) await mockDelay(PIECE_MS, signal);
    yield chars.slice(i, i + size).join('');
  }
}
/**
 * A fixture's or a demo answer's text: the `text` of its JSON. A demo model may also answer in plain text, which is
 * the text itself; a simulated answer is always JSON.
 */
function answerText(answer: string, plain: boolean): string {
  let value: unknown;
  try {
    value = JSON.parse(answer);
  } catch {
    if (plain) return answer;
  }
  const text = (value as { text?: unknown } | null | undefined)?.text;
  if (typeof text === 'string') return text;
  throw new ModelStreamError('unusable');
}

/** Application text generation goes through Agents: model credentials and usage have one owner. */
export class OnlineProvider {
  constructor(
    private readonly p: { agents: Agents; mock?: MockEngine; demoModels?: DemoModels; demoData?: DemoDataService; demoConfiguration?: { readonly enabled: boolean }; network?: { inDemoProject(): Promise<boolean> } },
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
    maxOutputTokens?: number,
  ): Promise<string> {
    if (this.p.mock?.enabled)
      return simulateAi(this.p.mock, operation, prompt, signal);
    // A demo project must not reach a real model even if an administrator changed the default model.
    if (this.p.demoConfiguration?.enabled || await this.p.network?.inDemoProject()) {
      if (!this.p.demoModels) throw new ModelPreparationError('precondition', 'Demo model adapter unavailable');
      return this.p.demoModels.complete({ system, prompt, tag: operation });
    }
    const chosen = await this.prepare();
    await this.p.demoData?.load();
    // The demo's simulated model answers in process, where it can tell which operation asks.
    if (this.p.demoModels?.isDemoModel({ modelService: chosen.llmService }))
      return this.p.demoModels.complete({ system, prompt, tag: operation });
    const model = { modelService: chosen.llmService, model: chosen.model };
    await this.connect(model);
    const result = await this.p.agents.models.gateway.generate({
      model,
      system,
      prompt,
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      source: 'nocoreach',
      signal: signal ?? AbortSignal.timeout(240000),
    });
    return result.text;
  }
  // Validate locally before the gateway can send anything. Keep this outside
  // prepare(connection): connectionFor cannot join a caller's transaction.
  private async connect(model: { modelService: string; model: string }) {
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
  }
  /**
   * The answer as the model writes it, a piece of text at a time, routed as `complete` routes: the simulation, then a
   * demo project's model, then the default chat model. Throws `ModelPreparationError` before the first piece when no
   * model can answer, and `ModelStreamError` when the answer was cut off or filtered.
   */
  async *stream(
    system: string,
    prompt: string,
    operation?: MockAiOperation,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    if (this.p.mock?.enabled) {
      yield* pieces(answerText(await simulateAi(this.p.mock, operation, prompt, signal), false), signal);
      return;
    }
    if (this.p.demoConfiguration?.enabled || await this.p.network?.inDemoProject()) {
      if (!this.p.demoModels) throw new ModelPreparationError('precondition', 'Demo model adapter unavailable');
      yield* pieces(answerText(await this.p.demoModels.complete({ system, prompt, tag: operation }), true), signal);
      return;
    }
    const chosen = await this.prepare();
    await this.p.demoData?.load();
    if (this.p.demoModels?.isDemoModel({ modelService: chosen.llmService })) {
      yield* pieces(answerText(await this.p.demoModels.complete({ system, prompt, tag: operation }), true), signal);
      return;
    }
    const model = { modelService: chosen.llmService, model: chosen.model };
    await this.connect(model);
    const messages: ModelMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ];
    for await (const event of this.p.agents.models.gateway.stream({ model, messages, ...(signal ? { signal } : {}) })) {
      if (event.type === 'text') {
        if (event.delta) yield event.delta;
      } else if (event.type === 'finish' && (event.reason === 'length' || event.reason === 'filtered'))
        throw new ModelStreamError(event.reason);
    }
  }
}
