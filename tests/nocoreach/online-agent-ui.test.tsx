import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    setView: vi.fn(),
    selectConversation: vi.fn(),
    newAgentId: null,
  },
}));
vi.mock('@nocobase/app-plugin-agents/client/chat', async (original) => ({
  ...(await original<
    typeof import('@nocobase/app-plugin-agents/client/chat')
  >()),
  useChatAgents: () => ({
    data: [
      {
        id: 'runner-codex',
        name: 'Codex',
        availability: { online: true },
        isMyDefault: true,
      },
    ],
    isSuccess: true,
  }),
  useConversation: () => ({ data: undefined }),
  useAgentText: () => ({ name: (agent: { name: string }) => agent.name }),
  useChatPanel: () => panel,
  CHAT_PANEL_ID: 'chat-panel',
  CHAT_PANEL_ATTRIBUTE: 'data-chat-panel',
  CHAT_MOBILE_QUERY: '(max-width: 639px)',
  CHAT_DOCK_QUERY: '(min-width: 1280px)',
  modifierKeyLabel: () => 'Ctrl',
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true }),
}));
vi.mock('../../client/pages/me.js', () => ({
  useMe: () => ({ me: { role: 'member' } }),
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
      <output data-testid='active-chat-mode'>{chat.mode}</output>
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
test('the chat panel starts online without type tabs and puts the picker inside the composer', () => {
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
    chat.getByTestId('chat-agent-picker').closest('[data-slot=input-group]'),
  ).not.toBeNull();
  fireEvent.click(chat.getByRole('button', { name: '展开', exact: true }));
  expect(panel.setMode).toHaveBeenCalledWith('expanded');
  fireEvent.click(chat.getByRole('button', { name: '关闭', exact: true }));
  expect(panel.closeChat).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByTestId('chat-header-button'));
  expect(panel.toggleChat).toHaveBeenCalledOnce();
});
test('nothing in the chat panel can stretch the page beside it', () => {
  render(
    <MemoryRouter>
      <OnlineChatProvider>
        <ChatPanel />
      </OnlineChatProvider>
    </MemoryRouter>,
  );
  const panelElement = screen.getByTestId('chat-panel');
  // Screen-reader-only text is absolutely positioned. Laid out against the panel instead of the scroller around it, a
  // long conversation made the whole document taller, and the page beside the chat scrolled on into blank space
  // (2026-10-28). Each scroller is the containing block of what it scrolls, and the panel clips the rest.
  expect(panelElement).toHaveClass('overflow-hidden');
  const scrollers = [
    ...panelElement.querySelectorAll<HTMLElement>('[class*="overflow-y-auto"]'),
  ];
  expect(scrollers).toContain(screen.getByRole('log'));
  for (const scroller of scrollers) expect(scroller).toHaveClass('relative');
  fireEvent.click(
    within(panelElement).getByRole('button', { name: '对话记录' }),
  );
  for (const scroller of panelElement.querySelectorAll<HTMLElement>(
    '[class*="overflow-y-auto"]',
  ))
    expect(scroller).toHaveClass('relative');
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
  expect(screen.getByTestId('chat-agent-picker')).toHaveTextContent('Custom');
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

test('a read error replaces a conversation not yet loaded, sits above the composer for a loaded one, and clears on the next read', async () => {
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
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(
    (callback, delay, ...args) => {
      if (delay !== 2000) return original(callback, delay, ...args);
      poll = callback as () => void;
      return 0 as never;
    },
  );
  const unreachable = new OnlineApiError(503, 'unavailable');
  api.mockRejectedValue(unreachable);
  mount();
  fireEvent.click(screen.getByText('History entry'));
  const log = screen.getByRole('log');
  expect(log).toContainElement(await screen.findByRole('alert'));
  api.mockResolvedValue(detail);
  await act(async () => poll());
  await within(log).findByText('Partial answer');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  // NocoReach restarting mid-reply: the transcript stays, and the error shows between it and the composer.
  api.mockRejectedValue(unreachable);
  await act(async () => poll());
  const alert = await screen.findByRole('alert');
  expect(log).not.toContainElement(alert);
  expect(within(log).getByText('Partial answer')).toBeVisible();
  expect(
    log.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    alert.compareDocumentPosition(
      screen.getByRole('textbox', { name: '消息' }),
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    within(alert).getByRole('button', { name: '重试', exact: true }),
  ).toBeEnabled();
  api.mockResolvedValue({
    ...detail,
    runs: [{ ...detail.runs[0], status: 'completed' }],
  });
  await act(async () => poll());
  await waitFor(() =>
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
  );
  expect(within(log).getByText('Partial answer')).toBeVisible();
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

test('the composer menu selects online definitions and Runner agents without submitting or losing the online draft', async () => {
  const user = userEvent.setup();
  mount();
  const composer = screen.getByRole('textbox', { name: '消息' });
  await user.type(composer, 'Keep this draft');
  await user.click(screen.getByTestId('chat-agent-picker'));
  await user.click(await screen.findByRole('menuitem', { name: /Custom/ }));
  expect(screen.getByTestId('chat-agent-picker')).toHaveTextContent('Custom');
  expect(composer).toHaveValue('Keep this draft');
  await user.click(screen.getByTestId('chat-agent-picker'));
  await user.click(await screen.findByRole('menuitem', { name: /Codex/ }));
  expect(panel.selectConversation).toHaveBeenCalledWith(null, 'runner-codex');
  expect(screen.getByTestId('active-chat-mode')).toHaveTextContent('runner');
  expect(api).not.toHaveBeenCalled();
  await user.click(screen.getByTestId('chat-agent-picker'));
  await user.click(await screen.findByRole('menuitem', { name: /Custom/ }));
  expect(screen.getByTestId('active-chat-mode')).toHaveTextContent('online');
  expect(composer).toHaveValue('Keep this draft');
});

test('choosing another online agent confirms before replacing a drafted existing conversation', async () => {
  api.mockResolvedValue({
    conversation: {
      id: 'history',
      title: 'Saved chat',
      agentId: 'online-default',
      projectId: '1',
      revision: 0,
    },
    runs: [],
  });
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByText('History entry'));
  await screen.findByText('Saved chat');
  await user.type(
    screen.getByRole('textbox', { name: '消息' }),
    'Unsent follow-up',
  );
  await user.click(screen.getByTestId('chat-agent-picker'));
  await user.click(await screen.findByRole('menuitem', { name: /Custom/ }));
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: '取消',
    }),
  );
  expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue(
    'Unsent follow-up',
  );
  await user.click(screen.getByTestId('chat-agent-picker'));
  await user.click(await screen.findByRole('menuitem', { name: /Custom/ }));
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: '丢弃',
    }),
  );
  expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue('');
  expect(screen.getByTestId('chat-agent-picker')).toHaveTextContent('Custom');
  expect(screen.queryByText('Saved chat')).not.toBeInTheDocument();
});

test('Continue picks up the latest reply that stopped partway and reads the conversation again; earlier replies offer none', async () => {
  const stopped = (id: string) => ({
    id,
    agentName: 'Online',
    model: { model: 'Fixture' },
    status: 'failed',
    error: 'stalled',
    input: `Question ${id}`,
    output: `Kept ${id}\n`,
    events: [{ type: 'text', text: `Kept ${id}\n` }],
    usage: { inputTokens: 1, outputTokens: 1 },
  });
  const detail = {
    conversation: {
      id: 'history',
      agentId: 'online-default',
      projectId: '1',
      revision: 3,
      activeRunId: 'latest',
    },
    runs: [stopped('earlier'), stopped('latest')],
  };
  api.mockImplementation(async (path: string) =>
    path === 'runs/latest/continue' ? detail.conversation : detail,
  );
  mount();
  fireEvent.click(screen.getByText('History entry'));
  await screen.findByText('Kept latest');
  expect(
    screen.getAllByText('回答没写完：模型连续 90 秒没有新的输出。'),
  ).toHaveLength(2);
  const buttons = screen.getAllByRole('button', { name: '继续' });
  expect(buttons).toHaveLength(1);
  const reads = api.mock.calls.length;
  fireEvent.click(buttons[0]);
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('runs/latest/continue', {}),
  );
  await waitFor(() => expect(api.mock.calls.length).toBeGreaterThan(reads + 1));
  expect(api.mock.calls.at(-1)![0]).toBe('conversations/history');
});

test('a refused Continue shows why under the conversation', async () => {
  const detail = {
    conversation: {
      id: 'history',
      agentId: 'online-default',
      projectId: '1',
      revision: 1,
      activeRunId: 'latest',
    },
    runs: [
      {
        id: 'latest',
        agentName: 'Online',
        model: { model: 'Fixture' },
        status: 'failed',
        error: 'modelNetwork',
        input: 'Question',
        output: 'Kept\n',
        events: [{ type: 'text', text: 'Kept\n' }],
        usage: { inputTokens: 1, outputTokens: 1 },
      },
    ],
  };
  api.mockImplementation(async (path: string) => {
    if (path === 'runs/latest/continue')
      throw new OnlineApiError(503, 'requestFailed');
    return detail;
  });
  mount();
  fireEvent.click(screen.getByText('History entry'));
  fireEvent.click(await screen.findByRole('button', { name: '继续' }));
  expect(
    await screen.findByText(
      '暂时连不上 NocoReach（服务器可能正在更新），请稍后再试。',
    ),
  ).toBeVisible();
});
