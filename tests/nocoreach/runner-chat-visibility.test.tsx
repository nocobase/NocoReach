import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ConversationView } from '../../client/extensions/nocobase-agent-chat/conversation-view';

const { panel, online, markRead, actions } = vi.hoisted(() => {
  const markRead = vi.fn();
  return {
    panel: { open: true, view: 'chat', newAgentId: null },
    online: { mode: 'online', setRunnerPending: vi.fn() },
    markRead,
    actions: { markRead, stop: {}, fallback: {}, restore: {} },
  };
});
vi.mock('../../client/online-agent/context.js', () => ({
  useOnlineChat: () => online,
}));
vi.mock('../../client/extensions/nocobase-agent-chat/composer.js', () => ({
  Composer: () => null,
}));
vi.mock('@nocobase/app-plugin-agents/client/chat', async () => {
  const { createContext } = await import('react');
  return {
    ChatExtensionsContext: createContext({}),
    useChatPanel: () => panel,
    useConversation: () => ({
      data: {
        id: 'runner-chat',
        title: 'Runner chat',
        read: false,
        agent: { id: 'runner', name: 'Runner' },
        run: null,
      },
    }),
    useConversationActions: () => actions,
    useChatAgents: () => ({ data: [] }),
    useConversationMessages: () => ({ items: [], pending: [], lastSeq: 0 }),
    useSendMessage: () => vi.fn(),
    useAgentText: () => ({ name: (agent: { name: string }) => agent.name }),
    timelineOrder: (items: unknown[]) => items,
  };
});

test('a retained Runner conversation marks replies read only while its chat view is visible', () => {
  const view = render(<ConversationView conversationId='runner-chat' />);
  expect(markRead).not.toHaveBeenCalled();
  online.mode = 'runner';
  view.rerender(<ConversationView conversationId='runner-chat' />);
  expect(markRead).toHaveBeenCalledExactlyOnceWith('runner-chat');
  markRead.mockClear();
  panel.view = 'history';
  view.rerender(<ConversationView conversationId='runner-chat' />);
  expect(markRead).not.toHaveBeenCalled();
  panel.view = 'chat';
  panel.open = false;
  view.rerender(<ConversationView conversationId='runner-chat' />);
  expect(markRead).not.toHaveBeenCalled();
});
