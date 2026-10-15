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
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import {
  OnlineChatProvider,
  useOnlineChat,
} from '../../client/online-agent/context.js';
import { OnlineChatView } from '../../client/online-agent/chat.js';
import { OnlineApiError } from '../../client/online-agent/api.js';
const { api, project } = vi.hoisted(() => ({
  api: vi.fn(),
  project: { id: 2, name: 'Project B' },
}));
vi.mock('@nocobase/app-plugin-agents/client/chat', () => ({
  useChatPanel: () => ({ openChat: vi.fn() }),
}));
vi.mock('../../client/pages/me.js', () => ({
  useMe: () => ({ isAdmin: true }),
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
              ready: true,
            },
            { id: 'online-custom', name: 'Custom', enabled: true, ready: true },
          ]
        : [],
    loading: false,
  }),
}));
function Entry() {
  const chat = useOnlineChat();
  return (
    <>
      <button
        onClick={() => chat.open({ draft: 'Source question', projectId: '1' })}
      >
        Source A
      </button>
      <button onClick={() => chat.select('history')}>History entry</button>
      <button
        onClick={() =>
          chat.setMode(chat.mode === 'online' ? 'runner' : 'online')
        }
      >
        Mode
      </button>
      <button onClick={() => chat.setAgentId('online-custom')}>
        Custom agent
      </button>
      {chat.mode === 'online' && <OnlineChatView />}
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
  api.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
test('agent and draft survive mode changes; a new source question cannot silently replace them', () => {
  mount();
  fireEvent.click(screen.getByText('Custom agent'));
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), {
    target: { value: 'Keep draft' },
  });
  fireEvent.click(screen.getByText('Mode'));
  fireEvent.click(screen.getByText('Mode'));
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
test.each([403, 404])(
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
