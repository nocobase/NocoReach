import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import AgentsPage, { AgentsPageLayout } from '../../client/pages/agents/index';

const access = vi.hoisted(() => ({ can: true, isPending: false }));
// Resource ids denied on top of `access`: `runtimes`, `usage` (pages) and `agents.services` (settings) guard the plugin tabs.
const denied = vi.hoisted(() => new Set<string>());
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: (request?: { resource: { id: string } }) =>
    request && denied.has(request.resource.id)
      ? { can: false, isPending: false }
      : access,
}));
beforeEach(() => {
  Object.assign(access, { can: true, isPending: false });
  denied.clear();
});

function mount(path = '/agents?view=saved') {
  const router = createMemoryRouter(
    [
      {
        path: '/agents',
        Component: AgentsPage,
        children: [
          {
            path: 'runner',
            element: (
              <AgentsPageLayout>
                <p>Runner content</p>
              </AgentsPageLayout>
            ),
          },
          {
            path: 'online',
            element: (
              <AgentsPageLayout>
                <p>Online content</p>
                <Outlet />
              </AgentsPageLayout>
            ),
            children: [{ path: ':id/edit', element: <p>Online editor</p> }],
          },
          { path: 'runtimes', element: <h1>Runtimes page</h1> },
          { path: 'models', element: <h1>Models page</h1> },
          { path: 'usage', element: <h1>Usage page</h1> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

test('opens Runner by default and keeps tab navigation and history in the URL', async () => {
  const user = userEvent.setup();
  const router = mount();
  expect(await screen.findByText('Runner content')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/agents/runner');
  expect(router.state.historyAction).toBe('REPLACE');
  await user.click(screen.getByRole('link', { name: '在线 Agent' }));
  expect(await screen.findByText('Online content')).toBeInTheDocument();
  expect(router.state.location.search).toBe('?view=saved');
  expect(screen.getByRole('link', { name: '在线 Agent' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await router.navigate(-1);
  expect(await screen.findByText('Runner content')).toBeInTheDocument();
  await router.navigate(1);
  expect(await screen.findByText('Online content')).toBeInTheDocument();
});

test('keeps online management accessible without the Runner page grant', async () => {
  access.can = false;
  const router = mount();
  expect(await screen.findByText('Online content')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/agents/online');
  expect(router.state.location.search).toBe('?view=saved');
  expect(
    screen.queryByRole('link', { name: 'Runner Agent' }),
  ).not.toBeInTheDocument();
});

test('does not redirect before the Runner permission resolves', () => {
  access.can = false;
  access.isPending = true;
  const router = mount();
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/agents');
});

test('direct online editor URLs keep the online tab and list mounted', () => {
  const router = mount('/agents/online/online-default/edit?view=saved');
  expect(screen.getByText('Online content')).toBeInTheDocument();
  expect(screen.getByText('Online editor')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '在线 Agent' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(router.state.location.pathname).toBe(
    '/agents/online/online-default/edit',
  );
});

test('shows runtimes, models and usage as tabs of the Agent page', async () => {
  const user = userEvent.setup();
  const router = mount('/agents/runner');
  expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
    'Runner Agent',
    '运行环境',
    '在线 Agent',
    '模型',
    '用量',
  ]);
  await user.click(screen.getByRole('link', { name: '运行环境' }));
  expect(await screen.findByText('Runtimes page')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/agents/runtimes');
  await user.click(screen.getByRole('link', { name: '模型' }));
  expect(await screen.findByText('Models page')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/agents/models');
  expect(screen.getByRole('link', { name: '模型' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await user.click(screen.getByRole('link', { name: '用量' }));
  expect(await screen.findByText('Usage page')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/agents/usage');
});

test('hides the runtimes, models and usage tabs without their grants', () => {
  denied.add('runtimes');
  denied.add('agents.services');
  denied.add('usage');
  mount('/agents/online');
  expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
    'Runner Agent',
    '在线 Agent',
  ]);
});

test('keeps the usage filters to the usage tab', async () => {
  const router = mount('/agents/runner?view=saved');
  expect(screen.getByRole('link', { name: '用量' })).toHaveAttribute(
    'href',
    '/agents/usage',
  );
  await router.navigate('/agents/usage?groupBy=agent');
  expect(await screen.findByText('Usage page')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Runner Agent' })).toHaveAttribute(
    'href',
    '/agents/runner',
  );
});
