import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { ConversationView } from '../../client/extensions/nocobase-agent-chat/conversation-view';

type ComposerProps = {
  disabled: boolean;
  onSend: (content: string, context: undefined) => boolean;
  notice?: unknown;
};
const state = vi.hoisted(() => {
  const markRead = vi.fn();
  return {
    panel: {
      open: true,
      view: 'chat',
      newAgentId: null as string | null,
      composerRevision: 0,
      source: 'panel',
      selectConversation: vi.fn(),
      resetSource: vi.fn(),
      focusComposer: vi.fn(),
      openChat: vi.fn(),
    },
    online: {
      settings: { enabled: true } as { enabled: boolean } | undefined,
      enabled: true,
      touch: vi.fn(),
      refresh: vi.fn(),
      setDirty: vi.fn(),
      dirty: false,
    },
    conversation: null as Record<string, unknown> | null,
    agents: [] as { id: string; name: string; availability: unknown }[],
    markRead,
    actions: { markRead, stop: {} },
    createConversation: vi.fn(),
    updateConversation: vi.fn(() => Promise.resolve({})),
    send: vi.fn(() => true),
    // Messages the plugin's send did not get through, as the server's guard refusing one while the chat agent is off.
    pending: [] as unknown[],
    items: [] as unknown[],
    composer: { current: null as ComposerProps | null },
  };
});
vi.mock('../../client/online-agent/context.js', () => ({
  useOnlineChat: () => state.online,
}));
vi.mock('../../client/pages/reach-data.js', () => ({
  useProject: () => ({ project: { id: 7 } }),
}));
vi.mock('../../client/extensions/nocobase-agent-chat/composer.js', () => ({
  Composer: (props: ComposerProps) => {
    state.composer.current = props;
    return null;
  },
}));
vi.mock('../../client/extensions/nocobase-agent-chat/agent-choice.js', () => ({
  ChatAgentChoice: () => null,
}));
// The plugin's pure helpers stay real; only the hooks that reach the provider, the network or the DOM are replaced.
vi.mock('@nocobase/app-plugin-agents/client/chat', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@nocobase/app-plugin-agents/client/chat')
    >();
  return {
    ...actual,
    useChatPanel: () => state.panel,
    useConversation: (id: string | null) => ({
      data: id ? state.conversation : undefined,
      isSuccess: true,
    }),
    useConversationActions: () => state.actions,
    useChatAgents: () => ({ data: state.agents, isSuccess: true }),
    useChatApi: () => ({
      createConversation: state.createConversation,
      updateConversation: state.updateConversation,
    }),
    useConversationMessages: () => ({
      items: state.items,
      pending: state.pending,
      lastSeq: 0,
      hasMore: false,
      loaded: true,
      loadingOlder: false,
      dispatch: vi.fn(),
      loadOlder: vi.fn(),
      fetchNewer: vi.fn(),
    }),
    useSendMessage: () => state.send,
    useAgentText: () => ({ name: (agent: { name: string }) => agent.name }),
    useChatStream: () => null,
    useFormatters: () => ({ relative: () => '', dateTime: () => '' }),
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

const runnerChat = {
  id: 'runner-chat',
  title: 'Runner chat',
  read: false,
  agent: { id: 'runner', name: 'Runner' },
  run: null,
  execution: null,
  availability: { online: true, reason: null, onlineRunners: 1 },
};
const onlineAgent = {
  id: 'online',
  name: 'Online',
  availability: { online: true, reason: null, onlineRunners: 0 },
};
beforeEach(() => {
  vi.clearAllMocks();
  state.panel.open = true;
  state.panel.view = 'chat';
  state.online.settings = { enabled: true };
  state.online.enabled = true;
  state.conversation = runnerChat;
  state.agents = [onlineAgent];
  state.composer.current = null;
  state.pending = [];
  state.items = [];
});

test('a retained conversation marks replies read only while its chat view is visible', () => {
  const view = render(<ConversationView conversationId='runner-chat' />);
  expect(state.markRead).toHaveBeenCalledExactlyOnceWith('runner-chat');
  state.markRead.mockClear();
  state.panel.view = 'history';
  view.rerender(<ConversationView conversationId='runner-chat' />);
  expect(state.markRead).not.toHaveBeenCalled();
  state.panel.view = 'chat';
  state.panel.open = false;
  view.rerender(<ConversationView conversationId='runner-chat' />);
  expect(state.markRead).not.toHaveBeenCalled();
});

test('a new online conversation is created with NocoReach scope and the current project before its first message', async () => {
  state.conversation = null;
  const detail = { ...runnerChat, id: 'online-chat', agent: onlineAgent };
  let resolve!: (value: typeof detail) => void;
  state.createConversation.mockReturnValue(
    new Promise((done) => (resolve = done)),
  );
  render(<ConversationView conversationId={null} />);
  act(() => void state.composer.current!.onSend('Hello', undefined));
  expect(state.createConversation).toHaveBeenCalledExactlyOnceWith({
    agentId: 'online',
    source: 'panel',
    config: {
      scope: ['nocoreach'],
      context: { variable: { projectId: '7' } },
    },
  });
  expect(state.send).not.toHaveBeenCalled();
  expect(state.composer.current!.disabled).toBe(true);
  await act(async () => resolve(detail));
  expect(state.panel.selectConversation).toHaveBeenCalledWith(
    'online-chat',
    undefined,
    { preserveComposer: true },
  );
});

test('an online conversation stays readable but cannot be continued while the Chat panel is off', () => {
  state.conversation = { ...runnerChat, agent: onlineAgent };
  state.online.settings = { enabled: false };
  state.online.enabled = false;
  render(<ConversationView conversationId='runner-chat' />);
  expect(state.composer.current!.disabled).toBe(true);
  render(<>{state.composer.current!.notice as React.ReactNode}</>);
  expect(screen.getByTestId('chat-online-off')).toBeInTheDocument();
});

test('a message in an online conversation is sent at once, and one the guard refuses reads Chat panel › Settings again', async () => {
  state.conversation = { ...runnerChat, agent: onlineAgent };
  const view = render(<ConversationView conversationId='runner-chat' />);
  let taken = false;
  await act(async () => {
    taken = state.composer.current!.onSend('Hi', undefined);
  });
  expect(taken).toBe(true);
  expect(state.send).toHaveBeenCalledOnce();
  expect(state.online.touch).toHaveBeenCalledOnce();
  expect(state.online.refresh).not.toHaveBeenCalled();

  // Turned off since the panel last read it: the server refuses, and the panel reads the switch again.
  state.pending = [{ clientId: 'c1', content: 'Hi', status: 'failed' }];
  view.rerender(<ConversationView conversationId='runner-chat' />);
  expect(state.online.refresh).toHaveBeenCalledOnce();
});

test('a message refused while the Chat panel is off offers no retry, only discarding it', () => {
  state.conversation = { ...runnerChat, agent: onlineAgent };
  state.pending = [{ clientId: 'c1', content: 'Hi', status: 'failed' }];
  const pendingButtons = (view: ReturnType<typeof render>) =>
    view.container.querySelectorAll('[data-chat-message="pending"] button');
  const on = render(<ConversationView conversationId='runner-chat' />);
  // Another failure while it is on can be sent again.
  expect(pendingButtons(on)).toHaveLength(2);
  on.unmount();

  state.online.settings = { enabled: false };
  state.online.enabled = false;
  const off = render(<ConversationView conversationId='runner-chat' />);
  expect(pendingButtons(off)).toHaveLength(1);
});

test('a new online conversation left before it was created is archived, not left empty in the history', async () => {
  state.conversation = null;
  let resolve!: (value: { id: string }) => void;
  state.createConversation.mockReturnValue(
    new Promise((done) => (resolve = done)),
  );
  const view = render(<ConversationView conversationId={null} />);
  act(() => void state.composer.current!.onSend('Hello', undefined));
  view.unmount();
  await act(async () => resolve({ id: 'online-chat' }));
  expect(state.panel.selectConversation).not.toHaveBeenCalled();
  expect(state.updateConversation).toHaveBeenCalledExactlyOnceWith(
    'online-chat',
    { archived: true },
  );
});

test('a new online conversation the server refuses reads Chat panel › Settings again', async () => {
  state.conversation = null;
  state.createConversation.mockRejectedValue(new Error('chatDisabled'));
  render(<ConversationView conversationId={null} />);
  await act(async () => void state.composer.current!.onSend('Hi', undefined));
  expect(state.online.refresh).toHaveBeenCalledOnce();
});

test('a message the plugin does not take stays in the composer', async () => {
  state.conversation = { ...runnerChat, agent: onlineAgent };
  state.send.mockReturnValueOnce(false);
  render(<ConversationView conversationId='runner-chat' />);
  let taken = true;
  await act(async () => {
    taken = state.composer.current!.onSend('Hi', undefined);
  });
  expect(taken).toBe(false);
  expect(state.online.touch).not.toHaveBeenCalled();
});

test('a stopped online reply says so once: its saved notice, not the feedback line too', () => {
  state.conversation = {
    ...runnerChat,
    agent: onlineAgent,
    execution: { status: 'idle', outcome: 'cancelled' },
  };
  state.items = [
    {
      id: 'reply',
      role: 'assistant',
      metadata: { seq: 2, createdAt: '2026-10-22T00:00:00Z' },
      parts: [
        { type: 'text', text: 'Partial', state: 'done' },
        {
          type: 'data-notice',
          id: 'execution-status',
          data: { type: 'cancelled', title: 'Stopped' },
        },
      ],
    },
  ];
  const view = render(<ConversationView conversationId='runner-chat' />);
  const notices = view.container.querySelectorAll('[data-chat-part="notice"]');
  expect(notices).toHaveLength(1);
  // The plugin's English title is never shown.
  expect(notices[0]).not.toHaveTextContent('Stopped');
  expect(view.container.querySelector('[data-chat-feedback]')).toBeNull();
});
