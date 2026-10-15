/** Application-owned online execution contracts. No dependency on the Runner plugin's records. */
export interface OnlineModel {
  modelService: string;
  model: string;
}
export interface OnlineAgentDefinition {
  id: string;
  name: string;
  instructions: string;
  enabled: boolean;
  model: OnlineModel | null;
  revision: number;
}
export type OnlineRunStatus =
  'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface OnlineUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}
export type OnlineEvent =
  | { type: 'text'; text: string }
  | { type: 'toolCall'; id: string; name: string; args: unknown }
  | {
      type: 'toolResult';
      id: string;
      name: string;
      output: string;
      ok: boolean;
    }
  | { type: 'usage'; model: string; usage: OnlineUsage };
export interface OnlineRun {
  id: string;
  agentId: string;
  agentName: string;
  requestHash: string;
  actorId: string;
  ownerId: string;
  projectId: string | null;
  subject: { kind: 'conversation' | 'task'; id: string };
  model: OnlineModel;
  instructions: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  status: OnlineRunStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  deadline: string | null;
  holder: string | null;
  cancelRequested: boolean;
  output: string;
  events: OnlineEvent[];
  usage: OnlineUsage;
  error: string | null;
  revision: number;
}
export interface OnlineConversation {
  requestHash: string;
  id: string;
  ownerId: string;
  projectId: string | null;
  agentId: string;
  model: OnlineModel;
  title: string;
  activeRunId: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
export const ONLINE_AGENT_PREFIX = 'online-';
export const DEFAULT_ONLINE_AGENT = 'online-default';
export const isOnlineAgent = (id: string | null | undefined) =>
  Boolean(id?.startsWith(ONLINE_AGENT_PREFIX));
export const onlineRunActive = (run: Pick<OnlineRun, 'status'>) =>
  run.status === 'queued' || run.status === 'running';
