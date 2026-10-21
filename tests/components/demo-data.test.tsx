import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import type { DemoDataStatus } from '@nocobase/app-plugin-demo-mode/client/demo-data';
import DemoDataPage from '../../client/pages/demo-data';
import enUS from '../../client/locales/en-US';
import { setDictionary } from '../../client/i18n';
import { confirmAction } from '../../client/components/reach/confirm';
import { toast } from '../../client/lib/toast';

vi.mock('../../client/pages/demo-management/access', () => ({
  useDemoAccess: () => ({
    revision: 0,
    mode: 'read-only',
    enabled: true,
    visible: true,
    pending: false,
    readData: true,
    manageData: true,
    readConfiguration: false,
    configure: false,
  }),
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
  useNavigationGuard: vi.fn(),
}));
const controls = vi.hoisted(() => ({
  status: null as DemoDataStatus | null,
  loading: false,
  pending: false,
  error: null as unknown,
  refresh: vi.fn(),
  importData: vi.fn(),
  reset: vi.fn(),
  clear: vi.fn(),
}));
const cache = vi.hoisted(() => ({ invalidate: vi.fn() }));
vi.mock('@nocobase/app-plugin-demo-mode/client/demo-data', () => ({
  useDemoData: () => controls,
}));
vi.mock('../../client/pages/workspace-cache', () => ({
  useWorkspaceCache: () => cache,
}));
vi.mock('../../client/components/reach/confirm', () => ({
  confirmAction: vi.fn(),
}));
vi.mock('../../client/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../../client/pages/nocoreach-page', () => ({
  NocoReachPage: ({
    projectRequired,
    children,
  }: {
    projectRequired: boolean;
    children: ReactNode;
  }) => (projectRequired ? <p>Create your first project</p> : children),
}));
const runtime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
});
const base = (): DemoDataStatus => ({
  available: true,
  datasetId: 'nocoreach',
  languages: ['zh-CN', 'en-US'],
  present: false,
  state: null,
  language: null,
  createdAt: null,
  finishedAt: null,
  records: 0,
  counts: {},
  accounts: [],
  accountsByLanguage: {},
  importing: null,
  failure: null,
  mode: 'off',
  model: { enabled: true, service: null },
});
const view = () => (
  <MemoryRouter>
    <TestI18nProvider runtime={runtime}>
      <DemoDataPage />
    </TestI18nProvider>
  </MemoryRouter>
);
beforeEach(() => {
  vi.clearAllMocks();
  setDictionary(null);
  controls.status = base();
  controls.loading = controls.pending = false;
  controls.error = null;
  vi.mocked(confirmAction).mockResolvedValue(true);
  controls.importData.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});

it('asks for confirmation before importing and respects cancellation', async () => {
  render(view());
  fireEvent.click(screen.getByRole('button', { name: '导入演示数据' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(controls.importData).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  fireEvent.click(screen.getByRole('button', { name: '导入演示数据' }));
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: '导入',
    }),
  );
  await waitFor(() =>
    expect(controls.importData).toHaveBeenCalledWith('zh-CN'),
  );
});

it('keeps the imported English language when resetting without a new selection', async () => {
  controls.status = {
    ...base(),
    present: true,
    state: 'ready',
    language: 'en-US',
    mode: 'read-only',
  };
  render(view());
  fireEvent.click(screen.getByRole('button', { name: '重置' }));
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: '重置',
    }),
  );
  await waitFor(() => expect(controls.reset).toHaveBeenCalledWith('en-US'));
});

it('allows importing in read-only mode after confirmation', async () => {
  controls.status = { ...base(), mode: 'read-only' };
  render(view());
  expect(screen.getByRole('combobox')).toBeEnabled();
  expect(screen.getByRole('button', { name: '导入演示数据' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '导入演示数据' }));
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: '导入',
    }),
  );
  await waitFor(() =>
    expect(controls.importData).toHaveBeenCalledWith('zh-CN'),
  );
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

it('keeps a pending import disabled in read-only mode', () => {
  controls.status = { ...base(), mode: 'read-only' };
  controls.pending = true;
  render(view());
  expect(screen.getByRole('combobox')).toBeDisabled();
  expect(screen.getByRole('button', { name: '导入演示数据' })).toBeDisabled();
});

it('allows clearing and resetting in read-only mode with an explicit full-data confirmation', async () => {
  controls.status = {
    ...base(),
    present: true,
    state: 'ready',
    mode: 'read-only',
  };
  render(view());
  expect(screen.getByRole('combobox')).toBeEnabled();
  expect(screen.getByRole('button', { name: '重置' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '清除' })).toBeEnabled();
  expect(screen.getByText('当前处于演示模式')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '清除' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(/所有项目/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(controls.clear).not.toHaveBeenCalled();
});

it('disables full cleanup outside demo mode', () => {
  controls.status = { ...base(), present: true, state: 'ready' };
  render(view());
  expect(screen.getByRole('button', { name: '重置' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '清除' })).toBeDisabled();
  expect(screen.getByText('重置和清空仅限演示模式')).toBeInTheDocument();
});

it('allows clearing existing business data before the first demo import', async () => {
  controls.status = { ...base(), mode: 'observe' };
  render(view());
  expect(screen.getByRole('button', { name: '重置' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '清除' }));
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: '清除',
    }),
  );
  await waitFor(() => expect(controls.clear).toHaveBeenCalledOnce());
});

it('updates cached project data even when the import completes before its first response', () => {
  const rendered = render(view());
  controls.status = {
    ...base(),
    present: true,
    state: 'ready',
    language: 'zh-CN',
    finishedAt: '2026-10-20T00:00:00Z',
  };
  rendered.rerender(view());
  expect(cache.invalidate).toHaveBeenCalledTimes(1);
  expect(toast.success).toHaveBeenCalledTimes(1);
});

it('does not expose internal failure messages', () => {
  controls.status = {
    ...base(),
    state: 'failed',
    failure: {
      code: 'DEMO_DATA_ACCOUNT_CONFLICT',
      message: 'SQL error with secret details',
    },
  };
  render(view());
  expect(
    screen.queryByText('SQL error with secret details'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('已有同名账号，不能创建演示账号'),
  ).toBeInTheDocument();
});

it('does not offer retry for a denied status read', () => {
  controls.status = null;
  controls.error = { status: 403, reason: 'DEMO_DATA_ACCESS_REQUIRED' };
  render(view());
  expect(
    screen.queryByRole('button', { name: '重试' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('只有管理员可以管理演示数据')).toBeInTheDocument();
});

it('keeps previous data with visible feedback when refresh fails', () => {
  controls.status = { ...base(), present: true, state: 'ready' };
  controls.error = { status: 500 };
  render(view());
  expect(screen.getByText('操作没有完成，请重试')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重置' })).toBeInTheDocument();
});

it('shows a sign-in action for an expired session and no retry for a missing endpoint', () => {
  controls.status = null;
  controls.error = { status: 401 };
  const rendered = render(view());
  expect(screen.getByRole('link', { name: '重新登录' })).toHaveAttribute(
    'href',
    '/login',
  );
  controls.error = { status: 404 };
  rendered.rerender(view());
  expect(
    screen.queryByRole('button', { name: '重试' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('当前应用没有提供演示数据。')).toBeInTheDocument();
});

it('marks a refresh busy while retaining the current data', () => {
  controls.status = { ...base(), present: true, state: 'ready' };
  controls.loading = true;
  render(view());
  expect(screen.getByRole('button', { name: '刷新' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '刷新' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  expect(screen.getByRole('button', { name: '重置' })).toBeInTheDocument();
});

it('lets an administrator reach demo import before creating any projects', async () => {
  const { default: routes } = await import('../../client/routes');
  const route = routes[1]?.routes
    .find((r) => r.name === 'nav-settings')
    ?.children?.find((r) => r.name === 'demo-data');
  expect(route?.componentLoader).toBeTypeOf('function');
  const { default: Page } = await route!.componentLoader!();
  render(
    <MemoryRouter>
      <TestI18nProvider runtime={runtime}>
        <Page />
      </TestI18nProvider>
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('button', { name: '导入演示数据' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('Create your first project'),
  ).not.toBeInTheDocument();
});

it('retains a failed lifecycle confirmation and supports retry', async () => {
  controls.importData.mockRejectedValueOnce({ status: 500 });
  render(view());
  fireEvent.click(screen.getByRole('button', { name: '导入演示数据' }));
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '导入' }));
  await waitFor(() =>
    expect(within(dialog).getByRole('alert')).toBeInTheDocument(),
  );
  expect(dialog).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: '导入' }));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
  );
});
