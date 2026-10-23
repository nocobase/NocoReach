import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { OnlineAgentContext } from '@nocobase/app-plugin-agents/server/online-agent';
import type { ConversationSummary } from '@nocobase/app-plugin-agents/shared/conversations';
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
/** Threads listed at most, newest first. */
const LISTED = 200;
/** Pages of the owner's Insights conversations read before falling back to reading them one by one. */
const SUMMARY_PAGES = 5;
/** Pages of 200 messages a count reads in one list, and the conversations whose counts are kept. */
const COUNT_PAGES = 5;
const COUNTS_KEPT = 2000;

/**
 * Conversations asked from Insights. The Agents plugin keeps the conversations; this index says which project and
 * analysis day each one is about, which its list cannot filter by.
 */
export class InsightThreads {
  private readonly counts = new Map<
    string,
    { seq: number; turns: number; lastMessageAt: string; complete: boolean }
  >();
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
    // One conversation a day: another tab may have started it since this page read the list.
    const ownerId = actor.user.id;
    const existing: Row[] = [];
    for await (const row of this.repo().findMany({
      filter: { ownerId, projectId, day: subject.day },
    }))
      existing.push(row);
    existing.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const row of existing) {
      const detail = await this.agents.conversations
        .get(ownerId, row.conversationId)
        .catch(() => null);
      if (detail && !detail.archivedAt) return row.conversationId;
    }
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
  /** The open Insights conversations of these ids, read a page of the owner's list at a time rather than one by one. */
  private async summaries(ownerId: string, ids: Set<string>) {
    const found = new Map<string, ConversationSummary>();
    let pageToken: string | undefined;
    for (let page = 0; page < SUMMARY_PAGES && found.size < ids.size; page++) {
      const { items, nextCursor } = await this.agents.conversations.list(
        ownerId,
        { source: INSIGHTS_SOURCE, pageSize: 100, pageToken },
      );
      for (const item of items) if (ids.has(item.id)) found.set(item.id, item);
      if (!nextCursor) return found;
      pageToken = nextCursor;
    }
    // Past the pages read: the rest one by one (archived ones are left out).
    for (const id of ids)
      if (!found.has(id)) {
        const detail = await this.agents.conversations
          .get(ownerId, id)
          .catch(() => null);
        if (detail && !detail.archivedAt) found.set(id, detail);
      }
    return found;
  }
  /**
   * The questions asked in a conversation. Counts are kept by message position: nothing is read while its last message
   * is unchanged, and then only the messages since. Null while a long conversation is still being counted.
   */
  private async turns(
    ownerId: string,
    id: string,
    lastMessageAt: string,
  ): Promise<number | null> {
    const kept = this.counts.get(id);
    if (kept?.complete && kept.lastMessageAt === lastMessageAt)
      return kept.turns;
    let { seq, turns } = kept ?? { seq: 0, turns: 0 };
    let complete = false;
    for (let page = 0; page < COUNT_PAGES && !complete; page++) {
      const { items } = await this.agents.conversations.messages(ownerId, id, {
        after: seq,
        limit: 200,
      });
      for (const message of items) if (message.role === 'user') turns++;
      seq = items.at(-1)?.seq ?? seq;
      complete = items.length < 200;
    }
    // Most recently counted last, so the oldest goes first.
    this.counts.delete(id);
    this.counts.set(id, { seq, turns, lastMessageAt, complete });
    if (this.counts.size > COUNTS_KEPT)
      this.counts.delete(this.counts.keys().next().value!);
    return complete ? turns : null;
  }
  async list(ownerId: string, projectId: string): Promise<OnlineThread[]> {
    const rows: Row[] = [];
    for await (const row of this.repo().findMany({
      filter: { ownerId, projectId },
    }))
      rows.push(row);
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const listed = rows.slice(0, LISTED);
    const details = await this.summaries(
      ownerId,
      new Set(listed.map((row) => row.conversationId)),
    );
    const threads: OnlineThread[] = [];
    for (const row of listed) {
      const detail = details.get(row.conversationId);
      if (!detail) continue;
      const turns = await this.turns(
        ownerId,
        row.conversationId,
        detail.lastMessageAt,
      ).catch(() => null);
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
