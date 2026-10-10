import { beforeEach, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import enUS from '../../client/locales/en-US';
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
vi.mock('@/i18n', () => ({ $t: (v: string) => v }));
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
  cleanup();
  vi.mocked(proxyRequest).mockReset();
  state.role = 'admin';
  vi.mocked(switchProject).mockClear();
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
