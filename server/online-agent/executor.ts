import type {
  ModelGateway,
  ModelMessage,
  ModelToolCall,
  ModelToolSpec,
} from '@nocobase/app-plugin-agents/server/tokens';
import type { OnlineEvent, OnlineModel } from '../../shared/online-agent.js';
import { OnlineAgentError } from './errors.js';

export interface OnlineTool extends ModelToolSpec {
  execute(args: unknown, signal: AbortSignal): Promise<unknown>;
}
export interface ChatContext {
  instructions: string;
  tools: readonly OnlineTool[];
  authorize: () => Promise<void>;
}
/** Bounded chat loop; every tool is supplied by the application and rechecks access. */
export async function executeChat(
  models: Pick<ModelGateway, 'stream'>,
  {
    model,
    messages: input,
    context,
    signal,
    emit,
    progress,
  }: {
    model: OnlineModel;
    messages: ModelMessage[];
    context: ChatContext;
    signal: AbortSignal;
    emit: (event: OnlineEvent) => Promise<void>;
    /** Called whenever the model streams anything, reasoning included, and when a tool answers. */
    progress?: () => void;
  },
  maxSteps = 16,
): Promise<string> {
  const messages: ModelMessage[] = [
    { role: 'system', content: context.instructions },
    ...input,
  ];
  for (let step = 0; step < maxSteps; step++) {
    signal.throwIfAborted();
    await context.authorize();
    if (JSON.stringify(messages).length > 600000)
      throw new OnlineAgentError('contextLimit');
    let text = '',
      finish: string | undefined;
    const calls: ModelToolCall[] = [];
    for await (const event of models.stream({
      model,
      messages,
      tools: context.tools,
      signal,
    })) {
      signal.throwIfAborted();
      progress?.();
      if (event.type === 'text') {
        text += event.delta;
        if (text.length > 200000) throw new OnlineAgentError('outputLimit');
        await emit({ type: 'text', text: event.delta });
      } else if (event.type === 'toolCall') {
        if (
          calls.length >= 24 ||
          calls.some((call) => call.id === event.call.id)
        )
          throw new OnlineAgentError('invalidToolCall');
        calls.push(event.call);
        await emit({ type: 'toolCall', ...event.call });
      } else if (event.type === 'finish') {
        finish = event.reason;
        await emit({
          type: 'usage',
          model: event.model,
          usage: event.usage,
        });
      }
    }
    await context.authorize();
    if (!finish || finish === 'length' || finish === 'filtered')
      throw new OnlineAgentError(finish || 'incompleteResponse');
    messages.push({
      role: 'assistant',
      content: text,
      ...(calls.length ? { toolCalls: calls } : {}),
    });
    if (!calls.length) {
      if (!text.trim()) throw new OnlineAgentError('emptyResponse');
      return text;
    }
    for (const call of calls) {
      signal.throwIfAborted();
      await context.authorize();
      const tool = context.tools.find(
        (candidate) => candidate.name === call.name,
      );
      let output: string,
        ok = true;
      if (!tool) {
        output = 'Tool is not authorized for this run.';
        ok = false;
      } else {
        // Tool errors are returned to the model, but authorization and cancellation always stop the run.
        try {
          output =
            JSON.stringify(await tool.execute(call.args, signal)) ?? 'null';
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof OnlineAgentError && error.status === 403)
            throw error;
          output = 'Tool input or operation was rejected.';
          ok = false;
        }
      }
      progress?.();
      if (output.length > 24000) throw new OnlineAgentError('toolOutputLimit');
      await context.authorize();
      await emit({
        type: 'toolResult',
        id: call.id,
        name: call.name,
        output,
        ok,
      });
      messages.push({ role: 'tool', toolCallId: call.id, content: output });
    }
  }
  throw new OnlineAgentError('stepLimit');
}
