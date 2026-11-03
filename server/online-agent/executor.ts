import type {
  ModelGateway,
  ModelMessage,
  ModelToolCall,
  ModelToolSpec,
} from '@nocobase/app-plugin-agents/server/tokens';
import type { OnlineEvent, OnlineModel } from '../../shared/online-agent.js';
import { OnlineAgentError, ToolInputError } from './errors.js';

export interface OnlineTool extends ModelToolSpec {
  execute(args: unknown, signal: AbortSignal): Promise<unknown>;
}
export interface ChatContext {
  instructions: string;
  tools: readonly OnlineTool[];
  authorize: () => Promise<void>;
}

/** Told to the model once a reply has used all its tool steps: answer from what it read, without more tools. */
export const STEP_LIMIT_PROMPT =
  'This reply has used all of its tool calls, so no more tools can be called. Answer the question now from the tool ' +
  'results above, in the language of the question. Say in one sentence which part you could not check, so the user ' +
  'can ask about it separately. Do not offer to call more tools.';

/**
 * The conversation as plain text, for the call without tools: a provider may refuse tool calls and results in a
 * request that declares no tools. Tool results stay in the assistant's own turn, never the user's, since they are data
 * and not instructions.
 */
export function withoutTools(messages: readonly ModelMessage[]) {
  const names = new Map<string, string>(),
    out: ModelMessage[] = [];
  for (const message of messages) {
    let content: string;
    if (message.role === 'assistant') {
      for (const call of message.toolCalls || []) names.set(call.id, call.name);
      content = [
        message.content,
        ...(message.toolCalls || []).map(
          (call) => `[Called ${call.name} with ${JSON.stringify(call.args)}]`,
        ),
      ]
        .filter(Boolean)
        .join('\n');
    } else if (message.role === 'tool')
      content = `[Result of ${names.get(message.toolCallId) ?? 'a tool'}]\n${message.content}`;
    else {
      out.push(message);
      continue;
    }
    const previous = out.at(-1);
    if (previous?.role === 'assistant')
      out[out.length - 1] = {
        role: 'assistant',
        content: `${previous.content}\n\n${content}`,
      };
    else out.push({ role: 'assistant', content });
  }
  return out;
}

/**
 * Bounded chat loop; every tool is supplied by the application and rechecks access. A reply that uses all its steps
 * gets one more model call without tools, so it answers from what it read instead of failing; the `partial` event says
 * the answer may be incomplete.
 */
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
  const step = async (
    request: readonly ModelMessage[],
    tools?: readonly OnlineTool[],
  ) => {
    signal.throwIfAborted();
    await context.authorize();
    if (JSON.stringify(request).length > 600000)
      throw new OnlineAgentError('contextLimit');
    let text = '',
      finish: string | undefined;
    const calls: ModelToolCall[] = [];
    for await (const event of models.stream({
      model,
      messages: request,
      ...(tools ? { tools } : {}),
      signal,
    })) {
      signal.throwIfAborted();
      progress?.();
      if (event.type === 'text') {
        text += event.delta;
        if (text.length > 200000) throw new OnlineAgentError('outputLimit');
        await emit({ type: 'text', text: event.delta });
      } else if (event.type === 'toolCall') {
        // The call without tools offers none to call.
        if (!tools) continue;
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
    return { text, calls };
  };
  for (let index = 0; index < maxSteps; index++) {
    const { text, calls } = await step(messages, context.tools);
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
        // Tool errors are returned to the model, but authorization and cancellation always stop the run. Arguments the
        // tool's schema refused say which fields to fix; any other failure names nothing of the application.
        try {
          output =
            JSON.stringify(await tool.execute(call.args, signal)) ?? 'null';
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof OnlineAgentError && error.status === 403)
            throw error;
          output =
            error instanceof ToolInputError
              ? error.message
              : 'Tool input or operation was rejected.';
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
  const { text } = await step([
    ...withoutTools(messages),
    { role: 'user', content: STEP_LIMIT_PROMPT },
  ]);
  if (!text.trim()) throw new OnlineAgentError('stepLimit');
  await emit({ type: 'partial', reason: 'stepLimit' });
  return text;
}
