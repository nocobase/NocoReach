/** Application-owned online chat contracts. No dependency on the Runner plugin's records. */
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
  ownerId: string;
  projectId: string | null;
  conversationId: string;
  sequence: number;
  model: OnlineModel;
  instructions: string;
  input: string;
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
/** What a conversation started from: a day's analysis on Insights, and the opportunity it asked about, if any. */
export interface OnlineSubject {
  kind: 'insights';
  day: string;
  opportunityId?: string;
}
/** A conversation asked from Insights, as Insights shows it: the first question and the latest answer. */
export interface OnlineThread {
  id: string;
  subject: OnlineSubject;
  question: string;
  answer: string;
  status: OnlineRunStatus;
  turns: number;
  updatedAt: string;
}
export interface OnlineConversation {
  id: string;
  ownerId: string;
  projectId: string | null;
  subject?: OnlineSubject | null;
  agentId: string;
  model: OnlineModel;
  title: string;
  activeRunId: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
export const DEFAULT_ONLINE_AGENT = 'online-default';
export const onlineRunActive = (run: Pick<OnlineRun, 'status'>) =>
  run.status === 'queued' || run.status === 'running';
