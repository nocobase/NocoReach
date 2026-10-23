// @vitest-environment node
import { expect, test, vi } from 'vitest';
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { DatabaseManager } from '@nocobase/db';
import { InsightThreads } from '../../server/nocoreach/online-agent/threads.js';

const row = (conversationId: string, day: string) => ({
  conversationId,
  ownerId: 'u1',
  projectId: '7',
  day,
  opportunityId: null,
  createdAt: `${day}T00:00:00.000Z`,
  turns: 1,
  countedSeq: 2,
  countedAt: '2026-10-22T01:00:00.000Z',
});
const detail = (id: string, archivedAt: string | null = null) => ({
  id,
  title: id,
  read: true,
  run: null,
  execution: null,
  archivedAt,
  lastMessageAt: '2026-10-22T01:00:00.000Z',
});
const missing = Object.assign(new Error('gone'), {
  code: 'CONVERSATION_NOT_FOUND',
});

function threads(get: (id: string) => Promise<unknown>) {
  const rows = [
    row('kept', '2026-10-20'),
    row('gone', '2026-10-21'),
    row('archived', '2026-10-22'),
  ];
  const database = {
    connection: () => ({
      repository: () => ({
        // Newest first, as `list` asks the database to sort them.
        findMany: async () => [...rows].reverse(),
        updateMany: vi.fn(),
      }),
    }),
  } as unknown as DatabaseManager;
  const conversations = {
    // Every page of the owner's list misses these, so each is read directly.
    list: vi.fn(async () => ({ items: [], nextCursor: 'more' })),
    get: vi.fn((_owner: string, id: string) => get(id)),
    messages: vi.fn(async () => ({ items: [] })),
  };
  return {
    conversations,
    list: new InsightThreads(database, {
      conversations,
    } as unknown as Agents).list('u1', '7'),
  };
}

test('conversations past the listed pages are read a few at once, leaving out gone and archived ones', async () => {
  let open = 0,
    most = 0;
  const { list, conversations } = threads(async (id) => {
    most = Math.max(most, ++open);
    await new Promise((done) => setTimeout(done, 5));
    open--;
    if (id === 'gone') throw missing;
    return detail(id, id === 'archived' ? '2026-10-22T02:00:00.000Z' : null);
  });
  expect((await list).map((thread) => thread.id)).toEqual(['kept']);
  expect(conversations.list).toHaveBeenCalledTimes(5);
  expect(conversations.get).toHaveBeenCalledTimes(3);
  expect(most).toBeGreaterThan(1);
});

test('a conversation that cannot be read for another reason fails the list rather than hiding it', async () => {
  const { list } = threads(async (id) => {
    if (id === 'gone') throw new Error('database unavailable');
    return detail(id);
  });
  await expect(list).rejects.toThrow('database unavailable');
});
