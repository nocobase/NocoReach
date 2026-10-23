import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type {
  OnlineAgentJson,
  OnlineAgentToolContext,
} from '@nocobase/app-plugin-agents/server/online-agent';
import type { NocoReachRuntime } from '../../providers/nocoreach.js';
import {
  INSIGHTS_SOURCE,
  ONLINE_AGENT_ID,
  ONLINE_CHAT_SCOPE,
  onlineProjectId,
  type OnlineChatSettings,
} from '../../../shared/online-agent.js';
import { OnlineAgentError, onlineApiError } from './errors.js';
import {
  createNocoReachOnlineHost,
  onlineAuthorization,
  onlineSystemPrompt,
  onlineToolSpecs,
  PROJECT_TOOLS,
  TASK_TOOLS,
  type OnlineToolName,
} from './host.js';
import type { OnlineBinding, OnlineTool } from './tool.js';

/** The business variable of an online conversation: the project it belongs to, set when it is created. */
export const onlineChatVariable = z.object({
  projectId: onlineProjectId.nullable(),
});

type Json = { [key: string]: OnlineAgentJson };
const page = (value: unknown): Json => {
  const { nextOffset = null, totalCharacters = null } = (value ?? {}) as {
    nextOffset?: number | null;
    totalCharacters?: number | null;
  };
  return { nextOffset, totalCharacters };
};
const task = (value: unknown): Json => {
  const item = (value ?? {}) as Record<string, unknown>;
  const pick = (key: string) =>
    typeof item[key] === 'string' || typeof item[key] === 'boolean'
      ? item[key]
      : null;
  return Object.fromEntries(
    [
      'taskId',
      'projectId',
      'title',
      'url',
      'state',
      'stage',
      'executable',
      'blockedReason',
    ].map((key) => [key, pick(key)]),
  );
};
/** What the chat shows of each call: never page text, project data or raw task records. */
const publicOutput: Record<OnlineToolName, (value: unknown) => Json> = {
  project_data: page,
  query_data: (value) => {
    const result = (value ?? {}) as Record<string, unknown>;
    return jsonOf(
      Object.fromEntries(
        [
          'source',
          'page',
          'url',
          'dataThrough',
          'total',
          'nextOffset',
          'accessDenied',
          'connected',
          'error',
        ]
          .filter((key) => key in result)
          .map((key) => [key, result[key]]),
      ),
    );
  },
  read_page: page,
  daily_analysis: page,
  task_get: task,
  task_execute: task,
  task_list: (value) => {
    const { items = [], nextOffset = null } = (value ?? {}) as {
      items?: unknown[];
      nextOffset?: number | null;
    };
    return { items: items.map(task), nextOffset };
  },
};
const publicInput = (name: OnlineToolName, value: unknown): Json => {
  const parsed = onlineToolSpecs[name].input.safeParse(value);
  return parsed.success ? jsonOf(parsed.data) : {};
};
/** Tool results are saved as JSON: drop undefined and turn dates into strings here, never in the plugin. */
const jsonOf = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value ?? {})) as Json;

/** The project a conversation was created for, from its saved variable; null for none. */
export function variableProject(variable: unknown): string | null {
  const parsed = onlineChatVariable.safeParse(variable);
  return parsed.success ? parsed.data.projectId : null;
}

/**
 * Turns whose tools are kept, and how long one is kept after its last tool call. The plugin says when a turn is
 * cancelled but not when it finishes, so a finished turn's tools (with the pages and project data they read) go once
 * idle this long, on a timer of their own: no later tool call is needed to free them.
 */
const TURNS_KEPT = 50;
const TURN_IDLE = 5 * 60_000;
/**
 * One model turn's tools, built once: paging through read_page or project_data reads what the turn already fetched,
 * and read_page's page limit holds for the whole turn. Each tool still rechecks access on every call. A turn resumed
 * after an approval keeps its id but runs under a new signal, so its tools are built again for that signal: Stop must
 * reach read_page's downloads and drop what the turn read.
 */
export function turnTools(
  build: (binding: OnlineBinding) => Promise<{ tools: OnlineTool[] }>,
  now: () => number = Date.now,
) {
  const turns = new Map<
    string,
    {
      at: number;
      signal: AbortSignal;
      tools: Promise<OnlineTool[]>;
      timer: NodeJS.Timeout;
    }
  >();
  const drop = (key: string) => {
    clearTimeout(turns.get(key)?.timer);
    turns.delete(key);
  };
  return (binding: OnlineBinding) => {
    const at = now();
    // Least recently used first: drop what has been idle too long or overflows.
    for (const [key, turn] of turns)
      if (at - turn.at > TURN_IDLE || turns.size > TURNS_KEPT) drop(key);
      else break;
    const kept = turns.get(binding.turnId);
    turns.delete(binding.turnId);
    if (kept?.signal === binding.signal) {
      turns.set(binding.turnId, { ...kept, at });
      kept.timer.refresh();
      return kept.tools;
    }
    clearTimeout(kept?.timer);
    const tools = build(binding).then((value) => value.tools);
    const forget = () => {
      if (turns.get(binding.turnId)?.tools === tools) drop(binding.turnId);
    };
    const timer = setTimeout(forget, TURN_IDLE);
    timer.unref();
    turns.set(binding.turnId, { at, signal: binding.signal, tools, timer });
    // A refusal is not kept: the next call checks again. A stopped turn calls no more tools.
    tools.catch(forget);
    binding.signal.addEventListener('abort', forget, { once: true });
    return tools;
  };
}

export function bindingOf(context: OnlineAgentToolContext): OnlineBinding {
  return {
    ownerId: context.user.id,
    projectId: variableProject(context.variable),
    turnId: createHash('sha256')
      .update(JSON.stringify([context.sessionId, context.execution.id]))
      .digest('hex'),
    signal: context.signal,
  };
}

/**
 * NocoReach's online chat on the Agents plugin's OnlineAgent: the tools, the `nocoreach` scope that every online
 * conversation is created with, and the Insights conversation source. Runner conversations never take this scope.
 */
export function registerOnlineChat(
  agents: Agents,
  runtime: () => NocoReachRuntime,
  settings: () => Promise<OnlineChatSettings>,
  basePath: string,
) {
  const online = agents.onlineAgent;
  const toolsOf = turnTools(
    createNocoReachOnlineHost(runtime, basePath, settings),
  );
  for (const name of Object.keys(onlineToolSpecs) as OnlineToolName[]) {
    const spec = onlineToolSpecs[name];
    online.configurator.registerTool(name, {
      version: '1',
      definition: {
        description: spec.description,
        inputSchema: spec.input,
        // Handing work to a Runner waits for the person to approve it in the chat.
        needsApproval: name === 'task_execute',
        public: {
          input: (value: unknown) => publicInput(name, value),
          output: (value: unknown) => publicOutput[name](value),
        },
        execute: async (input: unknown, { context }) => {
          const binding = bindingOf(context);
          try {
            const tool = (await toolsOf(binding)).find(
              (item) => item.name === name,
            );
            if (!tool) throw new OnlineAgentError('toolUnavailable', 403);
            return jsonOf(await tool.execute(input));
          } catch (error) {
            binding.signal.throwIfAborted();
            // The model reads a code, never an exception's text, so nothing of the original travels with it.
            // eslint-disable-next-line preserve-caught-error -- a cause could carry internal detail into the tool result
            throw new Error(
              error instanceof OnlineAgentError ? error.code : 'rejected',
            );
          }
        },
      },
    });
  }
  online.configurator.registerOnlineAgentScope(
    ONLINE_CHAT_SCOPE,
    {
      agentId: ONLINE_AGENT_ID,
      systemPromptTemplate: {
        variableSchema: onlineChatVariable,
        template: (context) => context.systemPrompt ?? '',
      },
    },
    async (context) => {
      const project = variableProject(context.variable);
      const host = runtime();
      await host.ready;
      const current = await settings();
      try {
        await onlineAuthorization(
          host,
          { ownerId: context.user.id, projectId: project },
          async () => current,
        )();
      } catch (error) {
        if (error instanceof OnlineAgentError) throw onlineApiError(error);
        throw error;
      }
      return {
        systemPromptTemplate: onlineSystemPrompt(current.instructions),
        tool: project ? [...TASK_TOOLS, ...PROJECT_TOOLS] : [...TASK_TOOLS],
        ...(current.model
          ? { model: [`${current.model.modelService}/${current.model.model}`] }
          : {}),
      };
    },
  );
  agents.conversations.sources.register({
    key: INSIGHTS_SOURCE,
    title: { ns: '@nocobase/app-plugin-agents', key: 'chat.sources.insights' },
  });
}
