import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ChatPanel } from '../../client/extensions/nocobase-agent-chat/chat-panel.js';

const state = vi.hoisted(() => {
  let resolve!: () => void;
  return {
    loaded: vi.fn(),
    ready: new Promise<void>((done) => {
      resolve = done;
    }),
    resolve: () => resolve(),
    member: true,
    fail: false,
    panel: {
      available: true,
      open: false,
      mode: 'docked',
      closeChat: vi.fn(),
      setMode: vi.fn(),
    },
  };
});
vi.mock('@nocobase/app-plugin-agents/client/chat', () => ({
  CHAT_DOCK_QUERY: 'wide',
  CHAT_MOBILE_QUERY: 'mobile',
  CHAT_PANEL_ATTRIBUTE: 'data-chat-panel',
  CHAT_PANEL_ID: 'chat-panel',
  useChatPanel: () => state.panel,
}));
vi.mock('../../client/pages/me.js', () => ({
  useMe: () => ({ me: { role: state.member ? 'member' : null } }),
}));
vi.mock('../../client/hooks/use-media-query.js', () => ({
  useMediaQuery: (query: string) => query === 'wide',
}));
vi.mock(
  '../../client/extensions/nocobase-agent-chat/panel-body.js',
  async () => {
    state.loaded();
    await state.ready;
    return {
      default: () => {
        if (state.fail) throw new Error('Fixture panel failure');
        return <textarea aria-label='Conversation draft' />;
      },
    };
  },
);
afterEach(() => {
  cleanup();
  state.panel.open = false;
  state.member = true;
  state.fail = false;
  vi.restoreAllMocks();
});

test('loads chat content on first open, supports closing while loading and preserves the mounted draft', async () => {
  const view = render(<ChatPanel />);
  expect(state.loaded).not.toHaveBeenCalled();
  expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();
  state.panel.open = true;
  view.rerender(<ChatPanel />);
  expect(await screen.findByRole('status')).toHaveTextContent('正在加载');
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  expect(state.panel.closeChat).toHaveBeenCalledOnce();
  state.panel.open = false;
  view.rerender(<ChatPanel />);
  await act(async () => {
    state.resolve();
    await state.ready;
  });
  expect(state.loaded).toHaveBeenCalledOnce();
  expect(screen.getByTestId('chat-panel')).not.toBeVisible();
  state.panel.open = true;
  view.rerender(<ChatPanel />);
  const draft = await screen.findByRole('textbox', {
    name: 'Conversation draft',
  });
  fireEvent.change(draft, { target: { value: 'Keep this draft' } });
  state.panel.open = false;
  view.rerender(<ChatPanel />);
  state.panel.open = true;
  view.rerender(<ChatPanel />);
  expect(screen.getByRole('textbox')).toBe(draft);
  expect(draft).toHaveValue('Keep this draft');
  expect(state.loaded).toHaveBeenCalledOnce();
  state.member = false;
  view.rerender(<ChatPanel />);
  expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();
});

test('contains panel failures while keeping the page and the close action usable', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  state.fail = true;
  state.panel.open = true;
  render(
    <>
      <main>Usable page</main>
      <ChatPanel />
    </>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '操作未完成，请重试。',
  );
  expect(screen.getByText('Usable page')).toBeVisible();
  expect(screen.getByRole('button', { name: '重新加载' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  expect(state.panel.closeChat).toHaveBeenCalled();
});
