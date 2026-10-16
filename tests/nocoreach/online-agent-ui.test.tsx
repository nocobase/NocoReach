import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import {
  OnlineChatProvider,
  useOnlineChat,
} from '../../client/online-agent/context.js';
import { OnlineChatView } from '../../client/online-agent/chat.js';
import { OnlineApiError } from '../../client/online-agent/api.js';
import { ChatPanel } from '../../client/extensions/nocobase-agent-chat/chat-panel.js';
import { ChatHeaderButton } from '../../client/extensions/nocobase-agent-chat/launchers.js';
const { api, project, agentState, panel } = vi.hoisted(() => ({
  api: vi.fn(),
  project: { id: 2, name: 'Project B' },
  agentState: { ready: true },
  panel: {
    available: true,
    open: true,
    mode: 'docked',
    view: 'history',
    conversationId: 'runner-chat',
    openChat: vi.fn(),
    closeChat: vi.fn(),
    toggleChat: vi.fn(),
    setMode: vi.fn(),
  },
}));
vi.mock('@nocobase/app-plugin-agents/client/chat', () => ({
  useChatPanel: () => panel,
  CHAT_PANEL_ID: 'chat-panel',
  CHAT_PANEL_ATTRIBUTE: 'data-chat-panel',
  CHAT_MOBILE_QUERY: '(max-width: 639px)',
  CHAT_DOCK_QUERY: '(min-width: 1280px)',
  modifierKeyLabel: () => 'Ctrl',
}));
vi.mock('../../client/pages/me.js', () => ({
  useMe: () => ({ isAdmin: true, me: { role: 'admin' } }),
}));
vi.mock('../../client/pages/reach-data.js', () => ({
  useProject: () => ({ project }),
  useProjects: () => ({ projects: [{ id: 1, name: 'Project A' }, project] }),
}));
vi.mock('../../client/online-agent/api.js', async (original) => ({
  ...(await original<typeof import('../../client/online-agent/api.js')>()),
  useOnlineApi: () => api,
  useOnlineResource: (path: string) => ({
    data:
      path === 'definitions'
        ? [
            {
              id: 'online-default',
              name: 'Default',
              enabled: true,
              ready: agentState.ready,
            },
            { id: 'online-custom', name: 'Custom', enabled: true, ready: true },
          ]
        : [],
    loading: false,
  }),
}));
function Entry() {
  const chat = useOnlineChat();
  const [visible, setVisible] = useState(true);
  return (
    <>
      <button
        onClick={() => chat.open({ draft: 'Source question', projectId: '1' })}
      >
        Source A
      </button>
      <button onClick={() => chat.select('history')}>History entry</button>
      <button onClick={() => setVisible(!visible)}>Toggle panel</button>
      <button onClick={() => chat.setAgentId('online-custom')}>
        Custom agent
      </button>
      {visible && <OnlineChatView />}
    </>
  );
}
function mount() {
  return render(
    <MemoryRouter>
      <OnlineChatProvider>
        <Entry />
      </OnlineChatProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  setDictionary(null);
  vi.clearAllMocks();
  api.mockReset();
  agentState.ready = true;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
test('the chat panel ignores Runner history and exposes only online chat with compact header actions', () => {
  render(
    <MemoryRouter>
      <OnlineChatProvider>
        <ChatHeaderButton />
        <ChatPanel />
      </OnlineChatProvider>
    </MemoryRouter>,
  );
  const chat = within(screen.getByTestId('chat-panel'));
  expect(chat.getByRole('textbox', { name: '消息' })).toBeVisible();
  expect(chat.queryByRole('tablist')).not.toBeInTheDocument();
  expect(
    chat.queryByRole('button', { name: /Runner|在线 Agent/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(chat.getByRole('button', { name: '展开', exact: true }));
  expect(panel.setMode).toHaveBeenCalledWith('expanded');
  fireEvent.click(chat.getByRole('button', { name: '关闭', exact: true }));
  expect(panel.closeChat).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByTestId('chat-header-button'));
  expect(panel.toggleChat).toHaveBeenCalledOnce();
});
test('Enter submits once while Shift+Enter and Chinese composition preserve the draft', async () => {
  api.mockReturnValue(new Promise(() => {}));
  mount();
  const composer = screen.getByRole('textbox', { name: '消息' });
  fireEvent.change(composer, { target: { value: '中文问题' } });
  fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
  fireEvent.keyDown(composer, { key: 'Enter', isComposing: true });
  fireEvent.keyDown(composer, { key: 'Enter', keyCode: 229 });
  expect(api).not.toHaveBeenCalled();
  expect(composer).toHaveValue('中文问题');
  fireEvent.keyDown(composer, { key: 'Enter' });
  fireEvent.keyDown(composer, { key: 'Enter' });
  expect(api).toHaveBeenCalledTimes(1);
  expect(composer).toBeDisabled();
});
test('a missing agent default blocks new chats but not a conversation with its own model', async () => {
  agentState.ready = false;
  api.mockResolvedValue({
    conversation: {
      id: 'history',
      agentId: 'online-default',
      projectId: '1',
      revision: 0,
      model: { modelService: 'saved-service', model: 'saved-model' },
    },
    runs: [],
  });
  mount();
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), {
    target: { value: 'Follow up' },
  });
  expect(
    screen.getByRole('button', { name: '发送', exact: true }),
  ).toBeDisabled();
  fireEvent.click(screen.getByText('History entry'));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: '发送', exact: true }),
    ).toBeEnabled(),
  );
  api.mockReturnValue(new Promise(() => {}));
  fireEvent.keyDown(screen.getByRole('textbox', { name: '消息' }), {
    key: 'Enter',
  });
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'conversations/history/messages',
      expect.objectContaining({ text: 'Follow up' }),
    ),
  );
});
test('new conversations use the current project and draft replacements require confirmation', async () => {
  api.mockResolvedValue({ id: 'created' });
  mount();
  fireEvent.click(screen.getByText('Source A'));
  expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue(
    'Source question',
  );
  expect(screen.getByText('项目：Project A')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '新对话', exact: true }));
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: '取消',
    }),
  );
  expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue(
    'Source question',
  );
  fireEvent.click(screen.getByRole('button', { name: '新对话', exact: true }));
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: '丢弃',
      exact: true,
    }),
  );
  expect(screen.getByText('项目：Project B')).toBeVisible();
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), {
    target: { value: 'New context' },
  });
  fireEvent.click(screen.getByRole('button', { name: '发送', exact: true }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'conversations',
      expect.objectContaining({ projectId: '2', text: 'New context' }),
    ),
  );
});
test('agent and draft survive reopening chat; a new source question cannot silently replace them', () => {
  mount();
  fireEvent.click(screen.getByText('Custom agent'));
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), {
    target: { value: 'Keep draft' },
  });
  fireEvent.click(screen.getByText('Toggle panel'));
  fireEvent.click(screen.getByText('Toggle panel'));
  expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue(
    'Keep draft',
  );
  expect(screen.getByRole('combobox')).toHaveTextContent('Custom');
  fireEvent.click(screen.getByText('Source A'));
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: '取消',
    }),
  );
  expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue(
    'Keep draft',
  );
});
test.each([401, 403, 404])(
  'history loading and denial (%s) block shortcut submission',
  async (status) => {
    let reject!: (error: unknown) => void;
    api.mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    mount();
    fireEvent.click(screen.getByText('History entry'));
    const composer = screen.getByRole('textbox', { name: '消息' });
    fireEvent.change(composer, { target: { value: 'Follow up' } });
    fireEvent.keyDown(composer, { key: 'Enter', ctrlKey: true });
    expect(api).toHaveBeenCalledTimes(1);
    await act(async () => {
      reject(new OnlineApiError(status, 'accessDenied'));
    });
    fireEvent.keyDown(composer, { key: 'Enter', metaKey: true });
    expect(api).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: '发送', exact: true }),
    ).toBeDisabled();
    fireEvent.click(screen.getByText('Source A'));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: '丢弃',
        exact: true,
      }),
    );
    expect(
      screen.getByRole('button', { name: '发送', exact: true }),
    ).toBeEnabled();
    api.mockResolvedValue({ id: 'source-created' });
    fireEvent.click(screen.getByRole('button', { name: '发送', exact: true }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        'conversations',
        expect.objectContaining({ projectId: '1', text: 'Source question' }),
      ),
    );
  },
);

test('terminal chat stops polling and refresh preserves the draft and loaded answer', async () => {
  const detail = {
    conversation: {
      id: 'history',
      agentId: 'online-default',
      projectId: '1',
      revision: 0,
    },
    runs: [
      {
        id: 'answer',
        agentName: 'Online',
        model: { model: 'Fixture' },
        status: 'completed',
        input: 'Question',
        output: 'Saved answer',
        events: [{ type: 'text', text: 'Saved answer' }],
        usage: { inputTokens: 1, outputTokens: 1 },
      },
    ],
  };
  const timeout = vi.spyOn(globalThis, 'setTimeout');
  api.mockResolvedValue(detail);
  mount();
  fireEvent.click(screen.getByText('History entry'));
  await screen.findByText('Saved answer');
  expect(timeout.mock.calls.some(([, delay]) => delay === 2000)).toBe(false);
  const composer = screen.getByRole('textbox', { name: '消息' });
  fireEvent.change(composer, { target: { value: 'Keep draft' } });
  let resolve!: (value: unknown) => void;
  api.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: '刷新', exact: true }));
  expect(
    screen.getByRole('button', { name: '刷新', exact: true }),
  ).toBeDisabled();
  expect(screen.getByText('Saved answer')).toBeVisible();
  expect(composer).toHaveValue('Keep draft');
  await act(async () => resolve(detail));
  expect(
    screen.getByRole('button', { name: '刷新', exact: true }),
  ).toBeEnabled();
  api.mockResolvedValue(detail);
  fireEvent(window, new Event('focus'));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
  expect(composer).toHaveValue('Keep draft');
});

test('active chat polls until completion and ignores Ctrl+Enter during composition', async () => {
  const detail = {
    conversation: {
      id: 'history',
      agentId: 'online-default',
      projectId: '1',
      revision: 0,
    },
    runs: [
      {
        id: 'answer',
        agentName: 'Online',
        model: { model: 'Fixture' },
        status: 'running',
        input: 'Question',
        events: [{ type: 'text', text: 'Partial answer' }],
        usage: { inputTokens: 1, outputTokens: 1 },
      },
    ],
  };
  let poll: () => void = () => {};
  const original = globalThis.setTimeout;
  const timeout = vi
    .spyOn(globalThis, 'setTimeout')
    .mockImplementation((callback, delay, ...args) => {
      if (delay !== 2000) return original(callback, delay, ...args);
      poll = callback as () => void;
      return 0 as never;
    });
  api.mockResolvedValue(detail);
  mount();
  fireEvent.click(screen.getByText('History entry'));
  await screen.findByText('Partial answer');
  expect(timeout.mock.calls.filter(([, delay]) => delay === 2000)).toHaveLength(
    1,
  );
  api.mockResolvedValue({
    ...detail,
    runs: [{ ...detail.runs[0], status: 'completed' }],
  });
  await act(async () => poll());
  expect(timeout.mock.calls.filter(([, delay]) => delay === 2000)).toHaveLength(
    1,
  );
  const composer = screen.getByRole('textbox', { name: '消息' });
  fireEvent.change(composer, { target: { value: '中文草稿' } });
  fireEvent.keyDown(composer, {
    key: 'Enter',
    ctrlKey: true,
    isComposing: true,
  });
  expect(api).toHaveBeenCalledTimes(2);
});

test.each(
  [401, 403, 404].flatMap((status) =>
    (['send', 'cancel'] as const).map((operation) => ({ status, operation })),
  ),
)(
  '$operation denial ($status) clears the transcript, blocks sending, and fences pending reads',
  async ({ status, operation }) => {
    const detail = {
      conversation: {
        id: 'history',
        agentId: 'online-default',
        projectId: '1',
        revision: 0,
      },
      runs: [
        {
          id: 'answer',
          agentName: 'Online',
          model: { model: 'Fixture' },
          status: operation === 'send' ? 'completed' : 'running',
          input: 'Private question',
          events: [{ type: 'text', text: 'Private answer' }],
          usage: { inputTokens: 1, outputTokens: 1 },
        },
      ],
    };
    let resolveRead!: (value: unknown) => void;
    let readSignal!: AbortSignal;
    api
      .mockResolvedValueOnce(detail)
      .mockImplementation((_path, body, _method, signal) => {
        if (body !== undefined)
          return Promise.reject(new OnlineApiError(status, 'accessDenied'));
        readSignal = signal;
        return new Promise((resolve) => {
          resolveRead = resolve;
        });
      });
    mount();
    fireEvent.click(screen.getByText('History entry'));
    await screen.findByText('Private answer');
    // A focus refresh may already be in flight when the write is denied.
    fireEvent(window, new Event('focus'));
    const composer = screen.getByRole('textbox', { name: '消息' });
    fireEvent.change(composer, { target: { value: 'Follow up' } });
    if (operation === 'send') {
      fireEvent.click(
        screen.getByRole('button', { name: '发送', exact: true }),
      );
    } else {
      fireEvent.click(
        screen.getByRole('button', { name: '停止', exact: true }),
      );
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: '停止',
          exact: true,
        }),
      );
    }
    await waitFor(() =>
      expect(screen.queryByText('Private answer')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Private question')).not.toBeInTheDocument();
    expect(readSignal.aborted).toBe(true);
    await act(async () => resolveRead(detail));
    expect(screen.queryByText('Private answer')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '发送', exact: true }),
    ).toBeDisabled();
    expect(composer).toHaveValue('Follow up');
    const calls = api.mock.calls.length;
    fireEvent.keyDown(composer, { key: 'Enter', ctrlKey: true });
    fireEvent(window, new Event('focus'));
    expect(api).toHaveBeenCalledTimes(calls);
    // Recovery is explicit and fetches current authorization again.
    api.mockResolvedValue(detail);
    fireEvent.click(screen.getByRole('button', { name: '刷新', exact: true }));
    await screen.findByText('Private answer');
  },
);

test('new-conversation denial blocks retries until an explicit refresh', async () => {
  api.mockRejectedValue(new OnlineApiError(403, 'accessDenied'));
  mount();
  const composer = screen.getByRole('textbox', { name: '消息' });
  fireEvent.change(composer, { target: { value: 'New question' } });
  fireEvent.click(screen.getByRole('button', { name: '发送', exact: true }));
  await screen.findByRole('alert');
  expect(
    screen.getByRole('button', { name: '发送', exact: true }),
  ).toBeDisabled();
  fireEvent.keyDown(composer, { key: 'Enter', metaKey: true });
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '刷新', exact: true }));
  expect(
    screen.getByRole('button', { name: '发送', exact: true }),
  ).toBeEnabled();
  expect(composer).toHaveValue('New question');
});
