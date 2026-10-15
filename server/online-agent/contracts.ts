import type {
  OnlineEvent,
  OnlineModel,
  OnlineRun,
  OnlineUsage,
} from '../../shared/online-agent.js';

export class OnlineAgentError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}
export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}
export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: readonly ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
}
export type ModelEvent =
  | { type: 'text' | 'reasoning'; delta: string }
  | { type: 'toolCall'; call: ToolCall }
  | {
      type: 'finish';
      reason: 'stop' | 'toolCalls' | 'length' | 'filtered';
      model: string;
      usage: OnlineUsage;
    };
export interface ModelPort {
  stream(request: {
    model: OnlineModel;
    messages: readonly Message[];
    tools: readonly ToolSpec[];
    signal: AbortSignal;
  }): AsyncIterable<ModelEvent>;
  resolve(model?: OnlineModel | null, context?: unknown): Promise<OnlineModel>;
}
export interface OnlineTool extends ToolSpec {
  /** Validation and authorization belong to the host. Never accept an arbitrary shell command. */
  execute(args: unknown, signal: AbortSignal): Promise<unknown>;
}
export interface ExecutionContext {
  instructions: string;
  tools: readonly OnlineTool[];
  authorize: () => Promise<void>;
}
export interface ExecutionHost {
  prepare(run: OnlineRun, signal: AbortSignal): Promise<ExecutionContext>;
}
export interface StoredRecord {
  id: string;
  kind: 'agent' | 'conversation' | 'run';
  ownerId: string;
  groupId: string;
  status: string;
  revision: number;
  payload: unknown;
}
/** The only persistence boundary; context joins a host-owned transaction without opening another connection. */
export interface OnlineStore {
  transaction<T>(callback: (context: unknown) => Promise<T>): Promise<T>;
  get(id: string, context?: unknown): Promise<StoredRecord | null>;
  list(
    filter: Partial<
      Pick<StoredRecord, 'kind' | 'ownerId' | 'groupId' | 'status'>
    >,
    context?: unknown,
  ): Promise<StoredRecord[]>;
  create(record: StoredRecord, context?: unknown): Promise<void>;
  replace(
    record: StoredRecord,
    expectedRevision: number,
    context?: unknown,
  ): Promise<boolean>;
}
export interface OnlineExecutor {
  execute(input: {
    model: OnlineModel;
    messages: Message[];
    context: ExecutionContext;
    signal: AbortSignal;
    emit: (event: OnlineEvent) => Promise<void>;
  }): Promise<string>;
}
