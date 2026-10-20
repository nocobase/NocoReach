import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  waitFor,
  cleanup,
  within,
} from '@testing-library/react';
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
import ProxyForm from '../../client/pages/proxy-profiles/proxy-form';
import { ConnectionNetwork } from '../../client/components/connection-network';
import { proxyRequest } from '../../client/pages/proxy-profiles/api';
import { toast } from '../../client/lib/toast';

const state = vi.hoisted(() => ({
  grants: null as string[] | null,
  client: { can: vi.fn(), invalidate: vi.fn() },
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationClient: () => state.client,
  useAuthorizationRevision: () => state.grants?.join(',') ?? '*',
}));
vi.mock('../../client/pages/proxy-profiles/api', async (original) => ({
  ...(await original<object>()),
  proxyRequest: vi.fn(),
}));
vi.mock('../../client/pages/reach-data', () => ({
  loadProjects: vi.fn(async () => []),
  useProject: () => ({ project: { id: 1, name: 'NocoBase' }, error: '' }),
}));
vi.mock('../../client/pages/current-project', () => ({
  switchProject: vi.fn(),
}));
vi.mock('../../client/lib/toast', () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
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
const reachable = (target: string, proxied = true) => ({
  reachable: true,
  status: 200,
  elapsedMs: 120,
  target,
  proxied,
});
beforeEach(() => {
  setDictionary(null);
  cleanup();
  vi.mocked(proxyRequest).mockReset();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  state.grants = null;
  state.client.can.mockReset();
  state.client.can.mockImplementation(
    async ({ resource, action }) =>
      state.grants === null ||
      state.grants.includes(
        resource.id === '$app' ? action : `${action}@${resource.id}`,
      ),
  );
});
afterEach(() => cleanup());

function setup(element: React.ReactNode, path = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: '/', element },
      {
        path: '/proxy-profiles',
        element,
        children: [{ path: 'proxy', element: <ProxyForm /> }],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <TestI18nProvider runtime={runtime}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TestI18nProvider>,
  );
  return router;
}
const calls = (action: string) =>
  vi.mocked(proxyRequest).mock.calls.filter(([name]) => name === action);

it('shows the proxy in plain words and how each data source of the project is reached', async () => {
  vi.mocked(proxyRequest).mockImplementation(async (action, body: any) => {
    if (action === 'capabilities') return live;
    if (action === 'network') return { proxy: saved };
    if (action === 'selections') return { site: 'direct' };
    if (action === 'testConnection')
      return body.connection === 'github'
        ? {
            reachable: false,
            status: 0,
            elapsedMs: 15000,
            target: 'api.github.com',
            proxied: true,
            reason: 'timeout',
          }
        : body.connection === 'discord'
          ? {
              reachable: false,
              status: 0,
              elapsedMs: 300,
              target: 'discord.com',
              proxied: false,
              reason: 'reset',
            }
          : reachable(body.connection, body.connection !== 'site');
    throw new Error(`unexpected ${action}`);
  });
  const user = userEvent.setup();
  setup(<NetworkPage />);
  expect(await screen.findByRole('heading', { name: '网络' })).toBeVisible();
  expect(await screen.findByText('使用中')).toBeVisible();
  expect(screen.getByText('proxy.corp.example:8080')).toBeVisible();
  expect(screen.getByText('需要，用户名 alice')).toBeVisible();
  expect(
    await screen.findByText(/项目“NocoBase”里各数据来源是否经过代理/),
  ).toBeVisible();
  expect(
    await screen.findByRole('switch', { name: 'Google 经过代理' }),
  ).toBeChecked();
  expect(
    screen.getByRole('switch', { name: '网站内容 经过代理' }),
  ).not.toBeChecked();
  expect(screen.getAllByRole('switch')).toHaveLength(11);
  expect(
    screen.getByText(/YouTube、Bilibili、小红书通过采集器读取/),
  ).toBeVisible();
  // Nothing is checked until asked.
  expect(screen.getAllByText('未检查')).toHaveLength(11);
  expect(calls('testConnection')).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: '检查连通' }));
  await waitFor(() => expect(screen.getAllByText('能访问')).toHaveLength(9));
  expect(calls('testConnection')).toHaveLength(11);
  expect(screen.getAllByText('连不上')).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'GitHub 为什么连不上' }));
  expect(await screen.findByText('连接超时。')).toBeVisible();
  expect(screen.getByText(/请检查代理地址、用户名和密码/)).toBeVisible();
  await user.keyboard('{Escape}');
  await user.click(
    screen.getByRole('button', { name: 'Discord 为什么连不上' }),
  );
  expect(
    await screen.findByText('服务器无法直接访问 Discord，可以打开“经过代理”。'),
  ).toBeVisible();
});

it('turns the proxy on for one data source and checks it again', async () => {
  let selection: Record<string, string> = { site: 'direct' };
  vi.mocked(proxyRequest).mockImplementation(async (action, body: any) => {
    if (action === 'capabilities') return live;
    if (action === 'network') return { proxy: saved };
    if (action === 'selections') return selection;
    if (action === 'select') {
      selection = body.profileId ? { site: body.profileId } : {};
      return selection;
    }
    if (action === 'testConnection') return reachable(body.connection);
    throw new Error(`unexpected ${action}`);
  });
  const user = userEvent.setup();
  setup(<NetworkPage />);
  await user.click(await screen.findByRole('button', { name: '检查连通' }));
  await waitFor(() => expect(calls('testConnection')).toHaveLength(11));
  await waitFor(() => expect(screen.getAllByText('能访问')).toHaveLength(11));
  await user.click(screen.getByRole('switch', { name: '网站内容 经过代理' }));
  await waitFor(() =>
    expect(proxyRequest).toHaveBeenCalledWith('select', {
      projectId: '1',
      connection: 'site',
      profileId: null,
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('switch', { name: '网站内容 经过代理' }),
    ).toBeChecked(),
  );
  expect(toast.success).toHaveBeenCalledTimes(1);
  // Only the data source whose route changed is checked again.
  await waitFor(() => expect(calls('testConnection')).toHaveLength(12));
  expect(calls('testConnection').at(-1)?.[1]).toEqual({
    projectId: '1',
    connection: 'site',
  });
});

it('edits the proxy in a dialog, validates on submit, and checks every data source after saving', async () => {
  let network: { proxy: typeof saved | null } = { proxy: saved };
  vi.mocked(proxyRequest).mockImplementation(async (action, body: any) => {
    if (action === 'capabilities') return live;
    if (action === 'network') return network;
    if (action === 'selections') return {};
    if (action === 'saveNetwork') {
      network = {
        proxy: body.url
          ? {
              ...saved,
              url: body.url,
              username: body.username,
              hasPassword: !!body.username,
              revision: 3,
            }
          : null,
      };
      return network;
    }
    if (action === 'testConnection') return reachable(body.connection);
    throw new Error(`unexpected ${action}`);
  });
  const user = userEvent.setup();
  const router = setup(<NetworkPage />, '/proxy-profiles');
  await user.click(await screen.findByRole('button', { name: '编辑' }));
  const dialog = await screen.findByRole('dialog', { name: '编辑代理' });
  const address = await within(dialog).findByLabelText(/^代理地址\s*\*$/);
  expect(address).toHaveValue(saved.url);
  expect(within(dialog).getByLabelText(/^用户名/)).toHaveValue('alice');
  expect(within(dialog).getByLabelText('密码')).toHaveAttribute(
    'placeholder',
    '已保存，不修改可留空',
  );
  // Validated on submit, not while typing.
  await user.clear(address);
  expect(within(dialog).queryByText('请填写代理地址')).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(await within(dialog).findByText('请填写代理地址')).toBeVisible();
  expect(address).toHaveFocus();
  await user.type(address, 'ftp://proxy');
  expect(
    within(dialog).getByText(/请输入 HTTP、HTTPS、SOCKS5 或 SOCKS5H 代理地址/),
  ).toBeVisible();
  expect(calls('saveNetwork')).toHaveLength(0);
  await user.clear(address);
  await user.type(address, 'socks5h://proxy.corp.example:1080');
  // Without sign-in, the saved username and password are cleared.
  await user.click(
    within(dialog).getByRole('switch', { name: '代理需要登录' }),
  );
  expect(within(dialog).queryByLabelText(/^用户名/)).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(proxyRequest).toHaveBeenCalledWith('saveNetwork', {
      url: 'socks5h://proxy.corp.example:1080',
      username: '',
      password: undefined,
      revision: 2,
    }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/proxy-profiles'),
  );
  expect(toast.success).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('proxy.corp.example:1080')).toBeVisible();
  expect(screen.getByText('不需要')).toBeVisible();
  // Saving checks every data source once.
  await waitFor(() => expect(calls('testConnection')).toHaveLength(11));
});

it('keeps the dialog open with the server error and what was typed', async () => {
  vi.mocked(proxyRequest).mockImplementation(async (action) => {
    if (action === 'capabilities') return live;
    if (action === 'network') return { proxy: null };
    if (action === 'selections') return {};
    throw new Error('代理配置无效');
  });
  const user = userEvent.setup();
  setup(<NetworkPage />, '/proxy-profiles');
  expect(await screen.findByText('未设置')).toBeVisible();
  // Without a proxy there is nothing to turn off per data source.
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '设置代理' }));
  const dialog = await screen.findByRole('dialog', { name: '设置代理' });
  const address = await within(dialog).findByLabelText(/^代理地址\s*\*$/);
  await user.type(address, 'http://proxy.corp.example:8080');
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(await within(dialog).findByText('代理配置无效')).toBeVisible();
  expect(address).toHaveValue('http://proxy.corp.example:8080');
});

it('turns the proxy off after confirming', async () => {
  let network: { proxy: typeof saved | null } = { proxy: saved };
  vi.mocked(proxyRequest).mockImplementation(async (action, body: any) => {
    if (action === 'capabilities') return live;
    if (action === 'network') return network;
    if (action === 'selections') return {};
    if (action === 'saveNetwork') {
      network = { proxy: body.url ? saved : null };
      return network;
    }
    throw new Error(`unexpected ${action}`);
  });
  const user = userEvent.setup();
  setup(<NetworkPage />);
  await user.click(
    await screen.findByRole('button', { name: '代理的更多操作' }),
  );
  await user.click(await screen.findByRole('menuitem', { name: '停用代理' }));
  const confirm = await screen.findByRole('alertdialog', {
    name: '停用代理“proxy.corp.example:8080”？',
  });
  await user.click(within(confirm).getByRole('button', { name: '停用' }));
  await waitFor(() =>
    expect(proxyRequest).toHaveBeenCalledWith('saveNetwork', {
      url: '',
      username: '',
      revision: 2,
    }),
  );
  expect(await screen.findByText('未设置')).toBeVisible();
  expect(toast.success).toHaveBeenCalledTimes(1);
});

it('allows granted mock profile access and denies an identity without a network grant', async () => {
  state.grants = ['nrProxyProfiles.capabilities', 'nrProxyProfiles.list'];
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
  state.grants = [];
  setup(<NetworkPage />);
  expect(await screen.findByText('只有管理员能管理网络出口')).toBeVisible();
  expect(proxyRequest).not.toHaveBeenCalled();
});

it('explains a data source list the identity may not see, and hides the edit actions without the save grant', async () => {
  state.grants = ['nrProxyProfiles.capabilities', 'nrProxyProfiles.network'];
  vi.mocked(proxyRequest).mockImplementation(async (action) => {
    if (action === 'capabilities') return live;
    if (action === 'network') return { proxy: saved };
    throw new Error(`unexpected ${action}`);
  });
  setup(<NetworkPage />);
  expect(await screen.findByText(/你没有这个项目数据接入的权限/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: '编辑' }),
  ).not.toBeInTheDocument();
  expect(proxyRequest).not.toHaveBeenCalledWith(
    'selections',
    expect.anything(),
  );
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
  const toggle = await screen.findByRole('switch', { name: '经过代理' });
  expect(toggle).toBeChecked();
  expect(
    screen.getByText(/GitHub 仓库、Traffic 与 Discussions 共用此设置/),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: '在网络设置中查看全部数据来源' }),
  ).toHaveAttribute('href', '/proxy-profiles');
  await user.click(toggle);
  await waitFor(() =>
    expect(proxyRequest).toHaveBeenCalledWith('select', {
      projectId: '1',
      connection: 'github',
      profileId: 'direct',
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole('switch', { name: '经过代理' })).not.toBeChecked(),
  );
  await user.click(screen.getByRole('switch', { name: '经过代理' }));
  await waitFor(() =>
    expect(proxyRequest).toHaveBeenCalledWith('select', {
      projectId: '1',
      connection: 'github',
      profileId: null,
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole('switch', { name: '经过代理' })).toBeChecked(),
  );
});

it('shows a YouTube switch only for an explicit proxy left from before, so it can be turned off', async () => {
  vi.mocked(proxyRequest).mockImplementation(async (action) => {
    if (action === 'capabilities') return live;
    if (action === 'network') return { proxy: saved };
    if (action === 'selections') return { youtube: saved.id };
    if (action === 'select') return { youtube: 'direct' };
    throw new Error(`unexpected ${action}`);
  });
  const user = userEvent.setup();
  setup(<ConnectionNetwork projectId={1} source='youtube' />);
  const toggle = await screen.findByRole('switch', { name: '经过代理' });
  expect(screen.getByText(/YouTube 通过采集器读取/)).toBeVisible();
  await user.click(toggle);
  await waitFor(() =>
    expect(proxyRequest).toHaveBeenCalledWith('select', {
      projectId: '1',
      connection: 'youtube',
      profileId: 'direct',
    }),
  );
});

it.each([
  ['without a proxy', 'site', { proxy: null }, {}],
  ['for browser collectors', 'bilibili', { proxy: saved }, {}],
  ['for YouTube without an explicit proxy', 'youtube', { proxy: saved }, {}],
  [
    'for YouTube turned off',
    'youtube',
    { proxy: saved },
    { youtube: 'direct' },
  ],
])('shows no switch %s', async (_case, source, network, selections) => {
  vi.mocked(proxyRequest).mockImplementation(async (action) => {
    if (action === 'capabilities') return live;
    if (action === 'network') return network;
    if (action === 'selections') return selections;
    throw new Error(`unexpected ${action}`);
  });
  setup(
    <>
      <ConnectionNetwork projectId={1} source={source} />
      <p>loaded</p>
    </>,
  );
  // Settled once the proxy settings have been read.
  await waitFor(() => expect(calls('network').length).toBeGreaterThan(0));
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});
