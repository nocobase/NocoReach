import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ConversationView } from '../../client/extensions/nocobase-agent-chat/conversation-view';

const { panel, online, markRead, actions } = vi.hoisted(() => {
  const markRead = vi.fn();
  return {
    panel: { open: true, view: 'chat', newAgentId: null, composerRevision: 0 },
    online: { mode: 'online', setRunnerPending: vi.fn() },
    markRead,
    actions: { markRead, stop: {} },
  };
});
vi.mock('../../client/online-agent/context.js', () => ({
  useOnlineChat: () => online,
}));
vi.mock('../../client/extensions/nocobase-agent-chat/composer.js', () => ({
  Composer: () => null,
}));
// The plugin's pure helpers stay real; only the hooks that reach the provider, the network or the DOM are replaced.
vi.mock('@nocobase/app-plugin-agents/client/chat', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@nocobase/app-plugin-agents/client/chat')
    >();
  return {
    ...actual,
    useChatPanel: () => panel,
    useConversation: () => ({
      data: {
        id: 'runner-chat',
        title: 'Runner chat',
        read: false,
        agent: { id: 'runner', name: 'Runner' },
        run: null,
        execution: null,
        availability: { online: true, reason: null, onlineRunners: 1 },
      },
    }),
    useConversationActions: () => actions,
    useChatAgents: () => ({ data: [] }),
    useConversationMessages: () => ({
      items: [],
      pending: [],
      lastSeq: 0,
      hasMore: false,
      loadingOlder: false,
      dispatch: vi.fn(),
      loadOlder: vi.fn(),
      fetchNewer: vi.fn(),
    }),
    useSendMessage: () => vi.fn(),
    useAgentText: () => ({ name: (agent: { name: string }) => agent.name }),
    useChatStream: () => null,
    useChatScroll: () => ({ current: null }),
    useChatController: () => ({
      isStopping: () => false,
      resume: vi.fn(),
      approve: vi.fn(),
      submissions: {
        blocked: () => false,
        releaseUnknown: vi.fn(),
        snapshot: () => [],
      },
    }),
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
