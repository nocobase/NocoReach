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
      setDirty: vi.fn(),
      dirty: false,
    },
    conversation: null as Record<string, unknown> | null,
    agents: [] as { id: string; name: string; availability: unknown }[],
    markRead,
    actions: { markRead, stop: {} },
    createConversation: vi.fn(),
    send: vi.fn(() => true),
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
    useChatApi: () => ({ createConversation: state.createConversation }),
    useConversationMessages: () => ({
      items: [],
      pending: [],
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
