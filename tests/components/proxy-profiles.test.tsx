import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import enUS from '../../client/locales/en-US';
import { setDictionary } from '../../client/i18n';
import enDictionary from '../../client/i18n/en.json';
import ProfilePage from '../../client/pages/proxy-profiles';
import EditProfile from '../../client/pages/proxy-profiles/edit';
import { ConnectionNetwork } from '../../client/components/connection-network';
import {
  proxyRequest,
  sourceConnection,
} from '../../client/pages/proxy-profiles/api';
import { switchProject } from '../../client/pages/current-project';
const state = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { role: state.role }, isAdmin: state.role === 'admin' }),
}));
vi.mock('../../client/pages/proxy-profiles/api', async (original) => ({
  ...(await original<object>()),
  proxyRequest: vi.fn(),
}));
vi.mock('../../client/pages/reach-data', () => ({
  loadProjects: vi.fn(async () => [
    { id: 1, name: '项目一' },
    { id: 2, name: '项目二' },
  ]),
}));
vi.mock('../../client/pages/current-project', () => ({
  switchProject: vi.fn(),
}));

const runtime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
});
const profile = {
  id: '86f2c028-4100-4d0e-989d-fd0b2233c58a',
  name: '香港出口',
  url: 'http://proxy.example:7890',
  username: 'alice',
  hasPassword: true,
  revision: 2,
  references: 2,
  referenceDetails: [
    { projectId: '1', connection: 'google' },
    { projectId: '2', connection: 'site' },
  ],
  updatedAt: '2026-10-10T00:00:00Z',
};
beforeEach(() => {
  setDictionary(null);
  cleanup();
  vi.mocked(proxyRequest).mockReset();
  state.role = 'admin';
  vi.mocked(switchProject).mockClear();
});
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
});
function setup(path = '/proxy-profiles', network = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/proxy-profiles',
        element: network ? (
          <ConnectionNetwork projectId='1' source='ga4' />
        ) : (
          <ProfilePage />
        ),
        children: [
          { path: 'new', element: <EditProfile /> },
          { path: ':profileId/edit', element: <EditProfile /> },
        ],
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
it('members cannot load or manage profiles', async () => {
  state.role = 'member';
  setup();
  expect(await screen.findByText('只有管理员能管理网络出口')).toBeVisible();
  expect(proxyRequest).not.toHaveBeenCalled();
});
it.each(['socks5', 'socks5h'])(
  'accepts a %s URL, explains DNS and keeps credentials separate',
  async (protocol) => {
    vi.mocked(proxyRequest).mockImplementation(async (action, body) =>
      action === 'list' ? [] : { ...profile, ...body },
    );
    const user = userEvent.setup();
    setup('/proxy-profiles/new');
    const url = `${protocol}://proxy.example:1080`;
    await user.type(await screen.findByLabelText('名称 *'), 'SOCKS');
    await user.type(screen.getByLabelText('代理地址 *'), url);
    await user.type(screen.getByLabelText('用户名'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'secret');
    expect(screen.getByText(/socks5:\/\/ 在本机解析目标域名/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() =>
      expect(proxyRequest).toHaveBeenCalledWith(
        'save',
        expect.objectContaining({ url, username: 'alice', password: 'secret' }),
      ),
    );
  },
);
it('creates through a route dialog, validates input, preserves failed submissions and returns to the list', async () => {
  let created = false,
    fail = true;
  vi.mocked(proxyRequest).mockImplementation(async (action, body) => {
    if (action === 'list') return created ? [profile] : [];
    if (action === 'save') {
      if (fail) throw new Error('保存失败');
      created = true;
      return { ...profile, ...body };
    }
    return {};
  });
  const user = userEvent.setup(),
    router = setup();
  await user.click(await screen.findByRole('button', { name: '新增 Profile' }));
  await user.click(
    await screen.findByRole('button', { name: '保存', exact: true }),
  );
  expect(screen.getByLabelText('名称 *')).toHaveFocus();
  expect(screen.getByText('请填写名称')).toBeVisible();
  await user.type(screen.getByLabelText('名称 *'), 'HK');
  fireEvent.compositionStart(screen.getByLabelText('名称 *'));
  fireEvent.change(screen.getByLabelText('名称 *'), {
    target: { value: '香港出口' },
  });
  fireEvent.compositionEnd(screen.getByLabelText('名称 *'));
  await user.type(screen.getByLabelText('代理地址 *'), profile.url);
  await user.click(screen.getByRole('button', { name: '保存', exact: true }));
  expect(await screen.findByText('保存失败')).toBeVisible();
  expect(screen.getByLabelText('名称 *')).toHaveValue('香港出口');
  fail = false;
  await user.click(screen.getByRole('button', { name: '保存', exact: true }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/proxy-profiles'),
  );
  expect(await screen.findByText('香港出口')).toBeVisible();
});
it('loads latest edit data without passwords and keeps URL search on close', async () => {
  vi.mocked(proxyRequest).mockImplementation(async (action) =>
    action === 'list' ? [profile] : profile,
  );
  const user = userEvent.setup(),
    router = setup(`/proxy-profiles/${profile.id}/edit?q=香港`);
  await waitFor(() =>
    expect(screen.getByLabelText('名称 *')).toHaveValue(profile.name),
  );
  expect(screen.getByLabelText('密码')).toHaveValue('');
  await user.click(
    screen.getByRole('checkbox', { name: '保存时清除用户名和密码' }),
  );
  await user.click(screen.getByRole('button', { name: '保存', exact: true }));
  await waitFor(() =>
    expect(proxyRequest).toHaveBeenCalledWith(
      'save',
      expect.objectContaining({ clearAuth: true, revision: 2, id: profile.id }),
    ),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/proxy-profiles'),
  );
  expect(router.state.location.search).toBe('?q=香港');
});
it.each([false, true])(
  'preserves edit drafts and their revision when reconnect refresh fails=%s',
  async (fails) => {
    const refresh = Promise.withResolvers<typeof profile>();
    let reads = 0;
    vi.mocked(proxyRequest).mockImplementation(async (action) => {
      if (action === 'list') return [profile];
      if (action === 'get') return ++reads === 1 ? profile : refresh.promise;
      throw Object.assign(new Error('配置已被修改，请重新打开后编辑'), {
        status: 409,
      });
    });
    const user = userEvent.setup();
    setup(`/proxy-profiles/${profile.id}/edit`);
    const name = await screen.findByLabelText('名称 *');
    await user.clear(name);
    await user.type(name, '未保存的出口');
    await user.type(screen.getByLabelText('密码'), 'new-password');
    await user.click(
      screen.getByRole('checkbox', { name: '保存时清除用户名和密码' }),
    );
    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.getByLabelText('名称 *')).toHaveValue('未保存的出口');
    await act(async () => {
      if (fails) refresh.reject(new Error('临时故障'));
      else refresh.resolve({ ...profile, name: '别处更新的出口', revision: 3 });
      await refresh.promise.catch(() => undefined);
    });
    expect(screen.getByLabelText('名称 *')).toHaveValue('未保存的出口');
    expect(screen.getByLabelText('密码')).toHaveValue('new-password');
    expect(
      screen.getByRole('checkbox', { name: '保存时清除用户名和密码' }),
    ).toBeChecked();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() =>
      expect(proxyRequest).toHaveBeenCalledWith(
        'save',
        expect.objectContaining({
          id: profile.id,
          name: '未保存的出口',
          password: 'new-password',
          clearAuth: true,
          revision: 2,
        }),
      ),
    );
    expect(
      await screen.findByText('配置已被修改，请重新打开后编辑'),
    ).toBeVisible();
    expect(screen.getByLabelText('名称 *')).toHaveValue('未保存的出口');
  },
);
it('search has a clear action and prevents deleting a referenced profile', async () => {
  vi.mocked(proxyRequest).mockResolvedValue([profile]);
  const user = userEvent.setup();
  setup();
  await user.type(
    await screen.findByRole('textbox', { name: '搜索名称或代理地址' }),
    'missing',
  );
  expect(screen.getByText('没有匹配的 Profile')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '清除搜索' }));
  await user.click(
    screen.getByRole('button', { name: `操作 ${profile.name}` }),
  );
  expect(
    await screen.findByRole('menuitem', { name: '使用中，无法删除' }),
  ).toHaveAttribute('aria-disabled', 'true');
});
it.each([
  { language: 'zh-CN', label: '代理 Profile', loading: '正在加载' },
  { language: 'en-US', label: 'Proxy profiles', loading: 'Loading' },
])(
  'keeps the network label visible during the first load in $language',
  async ({ language, label, loading }) => {
    if (language === 'en-US') setDictionary(enDictionary);
    let resolveProfiles!: (profiles: (typeof profile)[]) => void;
    const pendingProfiles = new Promise<(typeof profile)[]>((resolve) => {
      resolveProfiles = resolve;
    });
    vi.mocked(proxyRequest).mockImplementation(async (action) =>
      action === 'list' ? pendingProfiles : { google: profile.id },
    );
    setup('/proxy-profiles', true);
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByRole('status', { name: loading })).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await act(async () => resolveProfiles([profile]));
    const select = await screen.findByRole('combobox', { name: label });
    expect(select).toHaveTextContent(profile.name);
    expect(screen.getByLabelText(label)).toBe(select);
    expect(
      screen.queryByRole('status', { name: loading }),
    ).not.toBeInTheDocument();
  },
);

it('selects a profile, saves before testing, and shares Google/DataForSEO connection identities', async () => {
  let selection: Record<string, string> = {};
  vi.mocked(proxyRequest).mockImplementation(async (action, body: any) => {
    if (action === 'list') return [profile];
    if (action === 'selections') return selection;
    if (action === 'select') {
      selection = { google: body.profileId };
      return selection;
    }
    return {
      reachable: true,
      status: 401,
      elapsedMs: 20,
      target: 'www.googleapis.com',
    };
  });
  const user = userEvent.setup();
  setup('/proxy-profiles', true);
  await user.click(await screen.findByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: profile.name }));
  expect(screen.getByRole('button', { name: '测试连接' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(proxyRequest).toHaveBeenCalledWith('select', {
      projectId: '1',
      connection: 'google',
      profileId: profile.id,
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '测试连接' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: '测试连接' }));
  expect(await screen.findByText(/www.googleapis.com/)).toBeVisible();
  expect(sourceConnection.gsc).toBe(sourceConnection.ga4);
  expect(sourceConnection.reddit).toBe(sourceConnection.keywords);
  expect(sourceConnection.repo).toBeUndefined();
});

it('shows the projects and connections using a profile and opens the selected connection', async () => {
  vi.mocked(proxyRequest).mockResolvedValue([profile]);
  const user = userEvent.setup();
  setup();
  const references = await screen.findByRole('button', {
    name: `查看引用 ${profile.name}`,
  });
  expect(references).toHaveAttribute('aria-expanded', 'false');
  await user.click(references);
  expect(
    await screen.findByRole('button', { name: '项目一 · Google' }),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: '项目二 · 网站内容' }));
  expect(switchProject).toHaveBeenCalledWith(2, '/connections?source=site');
  await user.click(references);
  expect(
    screen.queryByRole('button', { name: '项目一 · Google' }),
  ).not.toBeInTheDocument();
});

it.each(['testConnection', 'select'])(
  'retries a failed %s operation instead of only reloading settings',
  async (operation) => {
    let attempts = 0;
    let selection: Record<string, string> = {};
    vi.mocked(proxyRequest).mockImplementation(async (action, body) => {
      if (action === 'list') return [profile];
      if (action === 'selections') return selection;
      if (action === operation && ++attempts === 1) throw new Error('临时故障');
      if (action === 'select') {
        selection = { google: (body as { profileId: string }).profileId };
        return selection;
      }
      return {
        reachable: true,
        status: 200,
        elapsedMs: 1,
        target: 'www.googleapis.com',
      };
    });
    const user = userEvent.setup();
    setup('/proxy-profiles', true);
    await screen.findByRole('combobox');
    if (operation === 'select') {
      await user.click(screen.getByRole('combobox'));
      await user.click(
        await screen.findByRole('option', { name: profile.name }),
      );
    }
    await user.click(
      screen.getByRole('button', {
        name: operation === 'select' ? '保存' : '测试连接',
      }),
    );
    expect(await screen.findByText('临时故障')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(attempts).toBe(2));
    await waitFor(() =>
      expect(screen.queryByText('临时故障')).not.toBeInTheDocument(),
    );
    expect(
      vi
        .mocked(proxyRequest)
        .mock.calls.filter(([action]) => action === operation)
        .map(([, body]) => body),
    ).toEqual([
      operation === 'select'
        ? { projectId: '1', connection: 'google', profileId: profile.id }
        : { projectId: '1', connection: 'google' },
      operation === 'select'
        ? { projectId: '1', connection: 'google', profileId: profile.id }
        : { projectId: '1', connection: 'google' },
    ]);
    if (operation === 'testConnection')
      expect(await screen.findByText(/www.googleapis.com/)).toBeVisible();
    else
      await waitFor(() =>
        expect(screen.getByRole('button', { name: '保存' })).toBeDisabled(),
      );
  },
);

it('retries the failed profile test for the same profile', async () => {
  let attempts = 0;
  vi.mocked(proxyRequest).mockImplementation(async (action) => {
    if (action === 'list') return [profile];
    if (action === 'test' && ++attempts === 1) throw new Error('临时故障');
    return {
      reachable: true,
      status: 200,
      elapsedMs: 1,
      target: 'example.com',
    };
  });
  const user = userEvent.setup();
  setup();
  await user.click(
    await screen.findByRole('button', { name: `操作 ${profile.name}` }),
  );
  await user.click(await screen.findByRole('menuitem', { name: '测试连接' }));
  expect(await screen.findByText('临时故障')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByText(/HTTP 200/)).toBeVisible();
  expect(screen.queryByText('临时故障')).not.toBeInTheDocument();
  expect(
    vi.mocked(proxyRequest).mock.calls.filter(([action]) => action === 'test'),
  ).toEqual([
    ['test', { id: profile.id }],
    ['test', { id: profile.id }],
  ]);
});

it('still retries a settings load failure without testing or saving', async () => {
  let attempts = 0;
  vi.mocked(proxyRequest).mockImplementation(async (action) => {
    if (action === 'list') {
      if (++attempts === 1) throw new Error('加载失败');
      return [profile];
    }
    return {};
  });
  const user = userEvent.setup();
  setup('/proxy-profiles', true);
  await user.click(await screen.findByRole('button', { name: '重试' }));
  expect(await screen.findByRole('combobox')).toBeVisible();
  expect(screen.queryByText('加载失败')).not.toBeInTheDocument();
  expect(
    vi
      .mocked(proxyRequest)
      .mock.calls.every(([action]) => ['list', 'selections'].includes(action)),
  ).toBe(true);
});

it('renders SOCKS guidance in English with the real translation dictionary', async () => {
  setDictionary(enDictionary);
  vi.mocked(proxyRequest).mockResolvedValue([]);
  setup('/proxy-profiles/new');
  expect(
    await screen.findByText(
      'Supports HTTP, HTTPS, SOCKS5 and SOCKS5H proxies, including the corresponding proxy port provided by Clash.',
    ),
  ).toBeVisible();
  expect(
    screen.getByText(
      'socks5:// resolves target names locally; socks5h:// resolves them through the proxy. Public web downloads always validate public IPs locally first.',
    ),
  ).toBeVisible();
});

it('keeps an invalid profile draft open while validation and labels follow language changes', async () => {
  vi.mocked(proxyRequest).mockImplementation(async (action) =>
    action === 'list' ? [] : {},
  );
  const user = userEvent.setup();
  setup('/proxy-profiles/new?q=keep');
  await user.click(
    await screen.findByRole('button', { name: '保存', exact: true }),
  );
  const input = screen.getByLabelText('名称 *');
  expect(screen.getByText('请填写名称')).toBeVisible();
  await user.type(input, 'Unsaved profile');
  expect(screen.getByLabelText('代理地址 *')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  act(() => setDictionary(enDictionary));
  expect(screen.getByLabelText('Name *')).toBe(input);
  expect(screen.getByLabelText('Username')).toBeVisible();
  expect(screen.getByLabelText('Password')).toBeVisible();
  expect(input).toHaveValue('Unsaved profile');
  expect(
    screen.getByText(
      enDictionary[
        '请输入 HTTP、HTTPS、SOCKS5 或 SOCKS5H 代理地址，不要在地址中包含账号密码'
      ],
    ),
  ).toBeVisible();
  act(() => setDictionary(null));
  expect(screen.getByLabelText('名称 *')).toBe(input);
  expect(input).toHaveValue('Unsaved profile');
  expect(
    screen.getByText(
      '请输入 HTTP、HTTPS、SOCKS5 或 SOCKS5H 代理地址，不要在地址中包含账号密码',
    ),
  ).toBeVisible();
});
