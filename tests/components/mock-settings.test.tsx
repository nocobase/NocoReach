import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import type { ReactNode } from 'react';
import {
  MockSettingsPage,
  MockIndicator,
} from '../../client/mock-integrations.js';
import { nocobaseClient } from '../../client/lib/nocoreach-api.js';
import { toast } from '../../client/lib/toast.js';
import { setDictionary } from '../../client/i18n/index.js';
import enDictionary from '../../shared/i18n/en.json';
import enUS from '../../client/locales/en-US.js';
import type { MockStatus } from '../../app-plugins/nocoreach-mock/server/types.js';

const state = vi.hoisted(() => ({
  role: 'admin' as string | null,
  project: 1,
  user: '1',
}));
vi.mock('../../client/pages/me.js', () => ({
  useMe: () => ({ me: { id: state.user, role: state.role } }),
}));
vi.mock('../../client/pages/current-project.js', () => ({
  currentProjectId: () => state.project,
}));
vi.mock('../../client/pages/nocoreach-page.js', () => ({
  NocoReachPage: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../client/lib/nocoreach-api.js', () => ({
  nocobaseClient: { action: vi.fn(), wrapRequests: vi.fn() },
}));
vi.mock('../../client/lib/toast.js', () => ({ toast: { success: vi.fn() } }));
const runtime = await createTestI18nRuntime({
  application: { namespace: 'nocoreach', resources: enUS },
});
const status = (patch: Partial<MockStatus> = {}): MockStatus => ({
  projectId: String(state.project),
  enabled: true,
  globalEnabled: true,
  environment: 'test',
  simulated: true,
  scenario: 'normal',
  seed: 'demo-seed',
  clock: '2026-10-12T00:00:00.000Z',
  revision: 2,
  coverage: ['google', 'github', 'youtube'],
  defaults: { website: 'https://nocobloom.example' },
  ...patch,
});
function setup(indicator = false) {
  const tree = () => (
    <TestI18nProvider runtime={runtime}>
      {indicator ? <MockIndicator /> : <MockSettingsPage />}
    </TestI18nProvider>
  );
  const result = render(tree());
  return { ...result, refresh: () => result.rerender(tree()) };
}
function savedPayload(body: unknown): MockStatus {
  return status({
    ...(body as Partial<MockStatus>),
    revision: Number((body as { revision: number }).revision) + 1,
  });
}
beforeEach(() => {
  state.role = 'admin';
  state.project = 1;
  state.user = '1';
  setDictionary(null);
  vi.mocked(nocobaseClient.action).mockReset();
  vi.mocked(toast.success).mockClear();
  vi.mocked(nocobaseClient.action).mockImplementation(
    async (_resource, action, options) =>
      action === 'configure' ? savedPayload(options?.body) : status(),
  );
});
afterEach(() => {
  cleanup();
});
it('hides configuration from members and unresolved access without requesting settings', () => {
  state.role = 'member';
  const view = setup();
  expect(screen.getByText('只有管理员能修改模拟数据设置。')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: '保存设置' }),
  ).not.toBeInTheDocument();
  expect(nocobaseClient.action).not.toHaveBeenCalled();
  state.role = null;
  view.refresh();
  expect(nocobaseClient.action).not.toHaveBeenCalled();
});
it('shows loading then deployment instructions with no writable controls when globally off', async () => {
  let complete!: (value: MockStatus) => void;
  vi.mocked(nocobaseClient.action).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  setup();
  expect(screen.getByLabelText('正在读取模拟数据设置')).toBeVisible();
  await act(async () => {
    complete(status({ globalEnabled: false }));
  });
  expect(screen.getByText('此部署尚未启用模拟')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: '保存设置' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/独立数据库和 storage/)).toBeVisible();
});
it('saves scoped settings with a revision and applies returned values immediately', async () => {
  const user = userEvent.setup();
  setup();
  const seed = await screen.findByLabelText('随机种子 *');
  await user.clear(seed);
  await user.type(seed, '项目一 seed-2');
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  await waitFor(() =>
    expect(nocobaseClient.action).toHaveBeenCalledWith(
      'nrMock',
      'configure',
      expect.objectContaining({
        body: expect.objectContaining({
          projectId: '1',
          seed: '项目一 seed-2',
          revision: 2,
        }),
        signal: expect.any(AbortSignal),
      }),
    ),
  );
  expect(await screen.findByText('模拟设置已保存')).toBeVisible();
  expect(screen.getByText('版本: 3')).toBeVisible();
  expect(toast.success).toHaveBeenCalledWith('模拟设置已保存');
  expect(seed).toHaveValue('项目一 seed-2');
});
it('validates on submit, focuses first error and retains failed values', async () => {
  const user = userEvent.setup();
  setup();
  const seed = await screen.findByLabelText('随机种子 *');
  await user.clear(seed);
  fireEvent.blur(seed);
  expect(
    screen.queryByText('请输入 1–128 个允许的字符作为种子。'),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  expect(seed).toHaveFocus();
  expect(screen.getByText('请输入 1–128 个允许的字符作为种子。')).toBeVisible();
  await user.type(seed, 'retained');
  expect(
    screen.queryByText('请输入 1–128 个允许的字符作为种子。'),
  ).not.toBeInTheDocument();
  vi.mocked(nocobaseClient.action).mockRejectedValueOnce(
    Object.assign(new Error('raw stack detail'), { status: 503 }),
  );
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  expect(
    await screen.findByText('请求未完成，已保留你的修改。请重试或联系管理员。'),
  ).toBeVisible();
  expect(screen.queryByText('raw stack detail')).not.toBeInTheDocument();
  expect(seed).toHaveValue('retained');
  await user.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByText('模拟设置已保存')).toBeVisible();
});
it('preserves edits on conflict and reloads only when requested', async () => {
  const user = userEvent.setup();
  setup();
  const seed = await screen.findByLabelText('随机种子 *');
  await user.clear(seed);
  await user.type(seed, 'unsaved');
  vi.mocked(nocobaseClient.action).mockRejectedValueOnce(
    Object.assign(new Error('NR_MOCK_REVISION_CONFLICT'), { status: 409 }),
  );
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  expect(await screen.findByText(/设置已被修改/)).toBeVisible();
  expect(seed).toHaveValue('unsaved');
  vi.mocked(nocobaseClient.action).mockResolvedValueOnce(
    status({ seed: 'latest', revision: 8 }),
  );
  await user.click(screen.getByRole('button', { name: '重新读取最新设置' }));
  await waitFor(() =>
    expect(screen.getByLabelText('随机种子 *')).toHaveValue('latest'),
  );
  expect(screen.getByText('版本: 8')).toBeVisible();
});
it('confirms reset, preserves cancel and prevents duplicate pending requests', async () => {
  const user = userEvent.setup();
  setup();
  await screen.findByLabelText('随机种子 *');
  await user.click(screen.getByRole('button', { name: '重置模拟场景' }));
  let dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(/不删除业务数据/)).toBeVisible();
  expect(nocobaseClient.action).not.toHaveBeenCalledWith(
    'nrMock',
    'reset',
    expect.anything(),
  );
  await user.click(within(dialog).getByRole('button', { name: '取消' }));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole('button', { name: '重置模拟场景' }));
  dialog = await screen.findByRole('alertdialog');
  let finish!: (data: MockStatus) => void;
  vi.mocked(nocobaseClient.action).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const reset = within(dialog).getByRole('button', { name: '重置模拟场景' });
  fireEvent.click(reset);
  fireEvent.click(reset);
  expect(
    within(dialog).getByRole('button', { name: '正在重置…' }),
  ).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: '取消' })).toBeDisabled();
  expect(
    vi
      .mocked(nocobaseClient.action)
      .mock.calls.filter(([, action]) => action === 'reset'),
  ).toHaveLength(1);
  await act(async () => {
    finish(status({ revision: 3 }));
  });
  expect(await screen.findByText('模拟场景已重置')).toBeVisible();
  expect(screen.getByLabelText('随机种子 *')).toHaveValue('demo-seed');
});
it('discards a previous project’s delayed response', async () => {
  let first!: (data: MockStatus) => void;
  vi.mocked(nocobaseClient.action).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        first = resolve;
      }),
  );
  const view = setup();
  state.project = 2;
  view.refresh();
  await screen.findByLabelText('随机种子 *');
  await act(async () => {
    first(status({ projectId: '1', seed: 'old-project' }));
  });
  expect(screen.getByText('项目: 2')).toBeVisible();
  expect(screen.getByLabelText('随机种子 *')).toHaveValue('demo-seed');
});
it('switches both languages without discarding unsaved input', async () => {
  const user = userEvent.setup();
  setup();
  const seed = await screen.findByLabelText('随机种子 *');
  await user.clear(seed);
  await user.type(seed, 'keep-me');
  act(() => setDictionary(enDictionary));
  expect(
    await screen.findByRole('heading', { name: 'Simulated data' }),
  ).toBeVisible();
  expect(screen.getByLabelText('Seed *')).toHaveValue('keep-me');
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeVisible();
  act(() => setDictionary(null));
  expect(screen.getByLabelText('随机种子 *')).toHaveValue('keep-me');
});
it.each([
  [401, '登录已过期，请重新登录后继续。'],
  [403, '你没有此操作权限，请联系管理员检查访问权限。'],
  [404, '此项目不存在或暂不可用，请选择可访问的项目。'],
] as const)(
  'handles %s without a meaningless retry',
  async (statusCode, message) => {
    vi.mocked(nocobaseClient.action).mockRejectedValueOnce(
      Object.assign(new Error('private'), { status: statusCode }),
    );
    setup();
    expect(await screen.findByText(message)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '重试' }),
    ).not.toBeInTheDocument();
  },
);
it('shows the global indicator to members even when their project is disabled', async () => {
  state.role = 'member';
  vi.mocked(nocobaseClient.action).mockResolvedValueOnce(
    status({ enabled: false, simulated: false }),
  );
  setup(true);
  expect(await screen.findByTestId('mock-environment-indicator')).toBeVisible();
  await userEvent.hover(screen.getByTestId('mock-environment-indicator'));
  expect(
    await screen.findByText('演示数据 · 演示环境，当前项目已暂停模拟。'),
  ).toBeVisible();
});
it('keeps status failures in the icon and supports retry', async () => {
  vi.mocked(nocobaseClient.action).mockRejectedValueOnce(
    Object.assign(new Error('cannot read'), { status: 503 }),
  );
  setup(true);
  const retry = await screen.findByRole('button', { name: '无法确认模拟状态' });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await userEvent.click(retry);
  await screen.findByLabelText('演示数据');
  expect(await screen.findByTestId('mock-environment-indicator')).toBeVisible();
});
it('aborts an unmounted form and suppresses its late success notification', async () => {
  const user = userEvent.setup();
  const view = setup();
  await screen.findByLabelText('随机种子 *');
  let finish!: (value: MockStatus) => void;
  let signal: AbortSignal | undefined;
  vi.mocked(nocobaseClient.action).mockImplementationOnce((_r, _a, options) => {
    signal = options?.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish(status({ revision: 3 }));
  });
  expect(toast.success).not.toHaveBeenCalled();
});

it('shows bilingual demo details on focus without a banner', async () => {
  setup(true);
  const icon = await screen.findByLabelText('演示数据');
  expect(
    screen.queryByTestId('mock-environment-banner'),
  ).not.toBeInTheDocument();
  await userEvent.tab();
  expect(icon).toHaveFocus();
  expect(
    await screen.findByText('演示数据 · 当前项目使用演示数据。'),
  ).toBeVisible();
  act(() => setDictionary(enDictionary));
  expect(screen.getByLabelText('Demo data')).toBeVisible();
  expect(
    screen.getByText('Demo data · This project uses demo data.'),
  ).toBeVisible();
});
it('hides the indicator when globally off or signed out and ignores stale project status', async () => {
  let finish!: (data: MockStatus) => void;
  vi.mocked(nocobaseClient.action).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = setup(true);
  expect(
    screen.queryByTestId('mock-environment-indicator'),
  ).not.toBeInTheDocument();
  vi.mocked(nocobaseClient.action).mockResolvedValueOnce(
    status({ projectId: '2', globalEnabled: false }),
  );
  state.project = 2;
  view.refresh();
  await act(async () => {
    finish(status({ projectId: '1' }));
  });
  expect(
    screen.queryByTestId('mock-environment-indicator'),
  ).not.toBeInTheDocument();
  state.project = 3;
  view.refresh();
  await screen.findByLabelText('演示数据');
  state.role = null;
  view.refresh();
  expect(
    screen.queryByTestId('mock-environment-indicator'),
  ).not.toBeInTheDocument();
});
