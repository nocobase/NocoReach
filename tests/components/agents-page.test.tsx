import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import AgentsPage, { AgentsPageLayout } from '../../client/pages/agents/index';

const access = vi.hoisted(() => ({ can: true, isPending: false }));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => access,
}));
beforeEach(() => Object.assign(access, { can: true, isPending: false }));

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
