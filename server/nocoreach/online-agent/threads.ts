import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { OnlineAgentContext } from '@nocobase/app-plugin-agents/server/online-agent';
import type { DatabaseManager } from '@nocobase/db';
import {
  INSIGHTS_SOURCE,
  ONLINE_AGENT_ID,
  ONLINE_CHAT_SCOPE,
  type OnlineSubject,
  type OnlineThread,
} from '../../../shared/online-agent.js';

type Row = {
  conversationId: string;
  ownerId: string;
  projectId: string;
  day: string;
  opportunityId: string | null;
  createdAt: string;
};
/** Threads listed at most, newest first, and how many of them have their questions counted. */
const LISTED = 200;
const COUNTED = 60;

/**
 * Conversations asked from Insights. The Agents plugin keeps the conversations; this index says which project and
 * analysis day each one is about, which its list cannot filter by.
 */
export class InsightThreads {
  constructor(
    private readonly database: DatabaseManager,
    private readonly agents: Agents,
  ) {}
  private repo() {
    return this.database.connection().repository<Row>('nrInsightThreads');
  }
  /** Starts a conversation bound to the project; the first message is sent by the browser, as in the panel. */
  async start(
    actor: OnlineAgentContext,
    projectId: string,
    subject: OnlineSubject,
  ): Promise<string> {
    // An HTTP entry: the scope validates the variable as it does for the panel's own requests.
    const chat = await this.agents.onlineAgent.realtime(
      actor,
      {
        agentId: ONLINE_AGENT_ID,
        scope: [ONLINE_CHAT_SCOPE],
        context: { variable: { projectId } },
        source: INSIGHTS_SOURCE,
      },
      'http',
    );
    try {
      await this.repo().createOne({
        values: {
          conversationId: chat.sessionId,
          ownerId: actor.user.id,
          projectId,
          day: subject.day,
          opportunityId: subject.opportunityId ?? null,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      // Not left behind unlisted: the empty conversation is archived.
      await this.agents.conversations
        .update(actor.user.id, chat.sessionId, { archived: true })
        .catch(() => {});
      throw error;
    }
    return chat.sessionId;
  }
  async list(ownerId: string, projectId: string): Promise<OnlineThread[]> {
    const rows: Row[] = [];
    for await (const row of this.repo().findMany({
      filter: { ownerId, projectId },
    }))
      rows.push(row);
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const threads: OnlineThread[] = [];
    for (const [index, row] of rows.slice(0, LISTED).entries()) {
      const detail = await this.agents.conversations
        .get(ownerId, row.conversationId)
        .catch(() => null);
      if (!detail || detail.archivedAt) continue;
      let turns: number | null = null;
      if (index < COUNTED) {
        const page = await this.agents.conversations.messages(
          ownerId,
          row.conversationId,
          { limit: 200 },
        );
        turns = page.hasMore
          ? null
          : page.items.filter((message) => message.role === 'user').length;
      }
      threads.push({
        id: row.conversationId,
        subject: {
          kind: 'insights',
          day: row.day,
          ...(row.opportunityId ? { opportunityId: row.opportunityId } : {}),
        },
        title: detail.title,
        running: detail.execution?.status === 'running' || !!detail.run,
        read: detail.read,
        turns,
        updatedAt: detail.lastMessageAt,
      });
    }
    return threads;
  }
}
