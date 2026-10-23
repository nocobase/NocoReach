/** The online assistant: the Agents plugin's native `online` agent with NocoReach's tools and prompt. */
export interface OnlineModel {
  modelService: string;
  model: string;
}
/** Chat panel › Settings: what every new online conversation starts with. */
export interface OnlineChatSettings {
  enabled: boolean;
  instructions: string;
  /** Null follows the system default chat model, as the daily analysis does. */
  model: OnlineModel | null;
  revision: number;
}
/** The OnlineAgent scope of NocoReach's online conversations; its variable binds a conversation to a project. */
export const ONLINE_CHAT_SCOPE = 'nocoreach';
/** The conversation source of conversations started on Insights. */
export const INSIGHTS_SOURCE = 'insights';
export const ONLINE_AGENT_ID = 'online';
/** What a conversation started from: a day's analysis on Insights, and the opportunity it asked about, if any. */
export interface OnlineSubject {
  kind: 'insights';
  day: string;
  opportunityId?: string;
}
/** A conversation asked from Insights, as Insights lists it. */
export interface OnlineThread {
  id: string;
  subject: OnlineSubject;
  title: string | null;
  running: boolean;
  read: boolean;
  /** The questions asked in it; null when not counted (older conversations). */
  turns: number | null;
  updatedAt: string;
}
