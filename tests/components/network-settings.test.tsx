import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import enUS from '../../client/locales/en-US';
import { setDictionary } from '../../client/i18n';
import NetworkPage from '../../client/pages/network';
import { ConnectionNetwork } from '../../client/components/connection-network';
import { proxyRequest } from '../../client/pages/proxy-profiles/api';
import { toast } from '../../client/lib/toast';

const state = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { role: state.role }, isAdmin: state.role === 'admin' }),
}));
vi.mock('../../client/pages/proxy-profiles/api', async (original) => ({
  ...(await original<object>()),
  proxyRequest: vi.fn(),
}));
vi.mock('../../client/pages/reach-data', () => ({
  loadProjects: vi.fn(async () => []),
}));
vi.mock('../../client/pages/current-project', () => ({
  switchProject: vi.fn(),
}));
vi.mock('../../client/lib/toast', () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const runtime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
});
const live = { mockEnabled: false, scenarios: [] };
const saved = {
  id: '86f2c028-4100-4d0e-989d-fd0b2233c58a',
  url: 'http://proxy.corp.example:8080',
  username: 'alice',
  hasPassword: true,
  revision: 2,
};
beforeEach(() => {
  setDictionary(null);
  cleanup();
  vi.mocked(proxyRequest).mockReset();
  vi.mocked(toast.success).mockClear();
  state.role = 'admin';
});
afterEach(() => cleanup());

function setup(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter([{ path: '/', element }], {
    initialEntries: ['/'],
  });
  render(
    <TestI18nProvider runtime={runtime}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TestI18nProvider>,
  );
}

it('saves the one proxy, keeps a saved password when left blank, and clears back to direct', async () => {
  let network: { proxy: typeof saved | null } = { proxy: saved };
  vi.mocked(proxyRequest).mockImplementation(async (action, body: any) => {
    if (action === 'capabilities') return live;
    if (action === 'network') return network;
    if (action === 'saveNetwork') {
      network = {
        proxy: body.url
          ? { ...saved, url: body.url, username: body.username, revision: 3 }
          : null,
      };
      return network;
    }
    throw new Error(`unexpected ${action}`);
  });
  const user = userEvent.setup();
  setup(<NetworkPage />);
  expect(await screen.findByRole('heading', { name: '网络' })).toBeVisible();
  const address = await screen.findByLabelText('代理地址');
  expect(address).toHaveValue(saved.url);
  expect(screen.getByLabelText('用户名')).toHaveValue('alice');
  expect(screen.getByLabelText('密码')).toHaveAttribute(
    'placeholder',
    '已保存，留空保留',
  );
  const save = screen.getByRole('button', { name: '保存' });
  expect(save).toBeDisabled();
  await user.clear(address);
  await user.type(address, 'socks5h://proxy.corp.example:1080');
  await user.click(save);
  await waitFor(() =>
    expect(proxyRequest).toHaveBeenCalledWith('saveNetwork', {
      url: 'socks5h://proxy.corp.example:1080',
      username: 'alice',
      password: undefined,
      revision: 2,
    }),
  );
  await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  // The form reloads with the new revision; clearing the address saves direct.
  await waitFor(() =>
    expect(screen.getByLabelText('代理地址')).toHaveValue(
      'socks5h://proxy.corp.example:1080',
    ),
  );
  await user.clear(screen.getByLabelText('代理地址'));
  await user.clear(screen.getByLabelText('用户名'));
  await user.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(proxyRequest).toHaveBeenCalledWith('saveNetwork', {
      url: '',
      username: '',
      password: undefined,
      revision: 3,
    }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('代理地址')).toHaveValue(''),
  );
});

it('shows the saving error and keeps the form as typed', async () => {
  vi.mocked(proxyRequest).mockImplementation(async (action) => {
    if (action === 'capabilities') return live;
    if (action === 'network') return { proxy: null };
    throw new Error('请输入 HTTP、HTTPS、SOCKS5 或 SOCKS5H 代理地址');
  });
  const user = userEvent.setup();
  setup(<NetworkPage />);
  await user.type(await screen.findByLabelText('代理地址'), 'ftp://proxy');
  await user.click(screen.getByRole('button', { name: '保存' }));
  expect(await screen.findByText(/SOCKS5H 代理地址/)).toBeVisible();
  expect(screen.getByLabelText('代理地址')).toHaveValue('ftp://proxy');
});

it('keeps the profile list for mock deployments and the page for administrators', async () => {
  vi.mocked(proxyRequest).mockImplementation(async (action) => {
    if (action === 'capabilities')
      return { mockEnabled: true, scenarios: ['normal'] };
    if (action === 'list') return [];
    throw new Error(`unexpected ${action}`);
  });
  setup(<NetworkPage />);
  expect(await screen.findByText('尚未添加网络 Profile')).toBeVisible();
  expect(proxyRequest).not.toHaveBeenCalledWith('network');
  cleanup();
  vi.mocked(proxyRequest).mockClear();
  state.role = 'member';
  setup(<NetworkPage />);
  expect(await screen.findByText('只有管理员能管理网络出口')).toBeVisible();
  expect(proxyRequest).not.toHaveBeenCalled();
});

it('turns the default proxy off and on for one connection in this project', async () => {
  let selection: Record<string, string> = {};
  vi.mocked(proxyRequest).mockImplementation(async (action, body: any) => {
    if (action === 'capabilities') return live;
    if (action === 'network') return { proxy: saved };
    if (action === 'selections') return selection;
    if (action === 'select') {
      selection = body.profileId ? { github: body.profileId } : {};
      return selection;
    }
    throw new Error(`unexpected ${action}`);
  });
  const user = userEvent.setup();
  setup(<ConnectionNetwork projectId={1} source='github-traffic' />);
  const toggle = await screen.findByRole('switch', { name: '通过代理访问' });
  expect(toggle).toBeChecked();
  expect(
    screen.getByText(/GitHub 仓库、Traffic 与 Discussions 共用此设置/),
  ).toBeVisible();
  await user.click(toggle);
  await waitFor(() =>
    expect(proxyRequest).toHaveBeenCalledWith('select', {
      projectId: '1',
      connection: 'github',
      profileId: 'direct',
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('switch', { name: '通过代理访问' }),
    ).not.toBeChecked(),
  );
  await user.click(screen.getByRole('switch', { name: '通过代理访问' }));
  await waitFor(() =>
    expect(proxyRequest).toHaveBeenCalledWith('select', {
      projectId: '1',
      connection: 'github',
      profileId: null,
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole('switch', { name: '通过代理访问' })).toBeChecked(),
  );
});

it.each([
  ['without a proxy', 'site', { proxy: null }],
  ['for browser collectors', 'bilibili', { proxy: saved }],
])('shows no switch %s', async (_case, source, network) => {
  vi.mocked(proxyRequest).mockImplementation(async (action) => {
    if (action === 'capabilities') return live;
    if (action === 'network') return network;
    if (action === 'selections') return {};
    throw new Error(`unexpected ${action}`);
  });
  setup(
    <>
      <ConnectionNetwork projectId={1} source={source} />
      <p>loaded</p>
    </>,
  );
  // Settled once the proxy settings have been read.
  await waitFor(() =>
    expect(
      vi
        .mocked(proxyRequest)
        .mock.calls.some(([action]) => action === 'network'),
    ).toBe(true),
  );
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});
