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
import { conversationMissing } from './errors.js';

type Row = {
  conversationId: string;
  ownerId: string;
  projectId: string;
  day: string;
  opportunityId: string | null;
  createdAt: string;
  /** The questions counted up to message `countedSeq`; `countedAt` is the conversation's last message then. */
  turns: number | null;
  countedSeq: number | null;
  /** Null while a long conversation is still being counted. */
  countedAt: string | null;
};
/** Threads listed at most, newest first. */
const LISTED = 200;
/** Pages of the owner's Insights conversations read before falling back to reading them one by one. */
const SUMMARY_PAGES = 5;
/** Pages of 200 messages a count reads in one list. */
const COUNT_PAGES = 5;
/** Conversations counted at once. */
const COUNTS_AT_ONCE = 8;

/**
 * Conversations asked from Insights. The Agents plugin keeps the conversations; this index says which project and
 * analysis day each one is about, which its list cannot filter by.
 */
export class InsightThreads {
  private readonly starting = new Map<string, Promise<string>>();
  constructor(
    private readonly database: DatabaseManager,
    private readonly agents: Agents,
  ) {}
  private repo() {
    return this.database.connection().repository<Row>('nrInsightThreads');
  }
  /** Starts a conversation bound to the project; the first message is sent by the browser, as in the panel. */
  start(
    actor: OnlineAgentContext,
    projectId: string,
    subject: OnlineSubject,
  ): Promise<string> {
    // One conversation a day: two tabs asking at once share one start here, and the unique key settles two processes.
    const key = JSON.stringify([actor.user.id, projectId, subject.day]);
    let started = this.starting.get(key);
    if (!started) {
      started = this.startOnce(actor, projectId, subject).finally(() =>
        this.starting.delete(key),
      );
      this.starting.set(key, started);
    }
    return started;
  }
  /**
   * The day's open conversation; a row whose conversation is archived or gone is removed, so a new one can take it.
   * Any other failure to read it is thrown: the row, and with it the conversation's place in Insights, is kept.
   */
  private async open(ownerId: string, projectId: string, day: string) {
    const row = await this.repo().findOne({
      filter: { ownerId, projectId, day },
    });
    if (!row) return null;
    const detail = await this.agents.conversations
      .get(ownerId, row.conversationId)
      .catch((error: unknown) => {
        if (conversationMissing(error)) return null;
        throw error;
      });
    if (detail && !detail.archivedAt) return row.conversationId;
    await this.repo().deleteMany({
      filter: { conversationId: row.conversationId },
    });
    return null;
  }
  private async startOnce(
    actor: OnlineAgentContext,
    projectId: string,
    subject: OnlineSubject,
  ): Promise<string> {
    const ownerId = actor.user.id;
    const existing = await this.open(ownerId, projectId, subject.day);
    if (existing) return existing;
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
          ownerId,
          projectId,
          day: subject.day,
          opportunityId: subject.opportunityId ?? null,
          createdAt: new Date().toISOString(),
          turns: 0,
          countedSeq: 0,
          countedAt: null,
        },
      });
      return chat.sessionId;
    } catch (error) {
      // Not left behind unlisted: the empty conversation is archived.
      await this.agents.conversations
        .update(ownerId, chat.sessionId, { archived: true })
        .catch(() => {});
      // Another process started the day's conversation first.
      const winner = await this.open(ownerId, projectId, subject.day).catch(
        () => null,
      );
      if (winner) return winner;
      throw error;
    }
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
   * The questions asked in a conversation. Counts are kept on its row by message position, so restarts and other
   * processes share them: nothing is read while its last message is unchanged, and then only the messages since. Null
   * while a long conversation is still being counted.
   */
  private async turns(row: Row, lastMessageAt: string): Promise<number | null> {
    if (row.countedAt === lastMessageAt) return row.turns ?? 0;
    let seq = row.countedSeq ?? 0;
    let turns = row.turns ?? 0;
    let complete = false;
    for (let page = 0; page < COUNT_PAGES && !complete; page++) {
      const { items } = await this.agents.conversations.messages(
        row.ownerId,
        row.conversationId,
        { after: seq, limit: 200 },
      );
      for (const message of items) if (message.role === 'user') turns++;
      seq = items.at(-1)?.seq ?? seq;
      complete = items.length < 200;
    }
    // Two processes counting at once write the same count for the same position.
    await this.repo().updateMany({
      filter: { conversationId: row.conversationId },
      values: {
        turns,
        countedSeq: seq,
        countedAt: complete ? lastMessageAt : null,
      },
    });
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
    const open = listed.flatMap((row) => {
      const detail = details.get(row.conversationId);
      return detail ? [{ row, detail }] : [];
    });
    // Counted a few conversations at a time; only those with new messages read any.
    const counts: (number | null)[] = [];
    for (let i = 0; i < open.length; i += COUNTS_AT_ONCE)
      counts.push(
        ...(await Promise.all(
          open
            .slice(i, i + COUNTS_AT_ONCE)
            .map(({ row, detail }) =>
              this.turns(row, detail.lastMessageAt).catch(() => null),
            ),
        )),
      );
    return open.map(({ row, detail }, index) => ({
      id: row.conversationId,
      subject: {
        kind: 'insights',
        day: row.day,
        ...(row.opportunityId ? { opportunityId: row.opportunityId } : {}),
      },
      title: detail.title,
      running: detail.execution?.status === 'running' || !!detail.run,
      read: detail.read,
      turns: counts[index] ?? null,
      updatedAt: detail.lastMessageAt,
    }));
  }
}
