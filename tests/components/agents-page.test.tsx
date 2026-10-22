import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  RouterProvider,
  useOutletContext,
} from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import AgentsPage from '../../client/pages/agents/index';
import type { AgentSettingsContext } from '../../client/online-agent/edit';

// The overview reads the project and the Agents plugin; its own test covers it.
const seen = vi.hoisted(() => ({
  refresh: [] as number[],
  localAgentsTo: [] as (string | undefined)[],
}));
vi.mock('../../client/pages/agents/roles', () => ({
  AgentRoles: ({
    refresh,
    localAgentsTo,
  }: {
    refresh: number;
    localAgentsTo?: string;
  }) => {
    seen.refresh.push(refresh);
    seen.localAgentsTo.push(localAgentsTo);
    return <p>Who does the work</p>;
  },
}));

const access = vi.hoisted(() => ({ can: true, isPending: false }));
// Resource ids denied on top of `access`: `agents` (the Local agents tab), `runtimes`, `usage` (pages) and
// `agents.services` (settings) guard the tabs.
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
  seen.refresh = [];
  seen.localAgentsTo = [];
});

function ChatDialog() {
  const context = useOutletContext<AgentSettingsContext>();
  return (
    <div role='dialog'>
      <p>Back to {context.back}</p>
      <button type='button' onClick={context.refresh}>
        Save
      </button>
    </div>
  );
}

function mount(path = '/agents?view=saved') {
  const router = createMemoryRouter(
    [
      {
        path: '/agents',
        Component: AgentsPage,
        children: [
          { path: 'runner', element: <p>Local agents content</p> },
          { path: 'runtimes', element: <h1>Runtimes page</h1> },
          { path: 'models', element: <h1>Models page</h1> },
          { path: 'usage', element: <h1>Usage page</h1> },
          { path: 'chat/new', Component: ChatDialog },
          { path: 'chat/:onlineAgentId', Component: ChatDialog },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}
const tabNames = () =>
  screen
    .getAllByRole('link')
    .filter((link) => link.closest('nav'))
    .map((link) => link.textContent);

test('shows who does the work above four tabs and opens Local agents first', async () => {
  const router = mount();
  expect(screen.getByText('Who does the work')).toBeInTheDocument();
  expect(await screen.findByText('Local agents content')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/agents/runner');
  expect(router.state.location.search).toBe('?view=saved');
  expect(router.state.historyAction).toBe('REPLACE');
  expect(tabNames()).toEqual(['本地 Agent', '运行环境', '模型服务', '用量']);
  expect(seen.localAgentsTo.at(-1)).toBe('/agents/runner');
});

test('switches tabs in the URL and keeps the usage filters to the usage tab', async () => {
  const user = userEvent.setup();
  const router = mount('/agents/runner?view=saved');
  await user.click(screen.getByRole('link', { name: '运行环境' }));
  expect(await screen.findByText('Runtimes page')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/agents/runtimes');
  expect(router.state.location.search).toBe('?view=saved');
  expect(screen.getByRole('link', { name: '运行环境' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByRole('link', { name: '用量' })).toHaveAttribute(
    'href',
    '/agents/usage',
  );
  await router.navigate('/agents/usage?groupBy=agent');
  expect(await screen.findByText('Usage page')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '本地 Agent' })).toHaveAttribute(
    'href',
    '/agents/runner',
  );
  await router.navigate(-1);
  expect(await screen.findByText('Runtimes page')).toBeInTheDocument();
});

test('shows only the tabs the reader may open, and opens the first of them', async () => {
  denied.add('agents');
  denied.add('usage');
  const router = mount();
  expect(await screen.findByText('Runtimes page')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/agents/runtimes');
  expect(tabNames()).toEqual(['运行环境', '模型服务']);
  expect(seen.localAgentsTo.at(-1)).toBeUndefined();
});

test('does not redirect before the permissions resolve', () => {
  access.isPending = true;
  const router = mount();
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/agents');
});

test('opens the chat agent settings over the page and reads the overview again after a save', async () => {
  const user = userEvent.setup();
  mount('/agents/chat/online-default');
  expect(screen.getByText('Who does the work')).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toHaveTextContent('Back to /agents');
  expect(seen.refresh.at(-1)).toBe(0);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(seen.refresh.at(-1)).toBe(1);
});
