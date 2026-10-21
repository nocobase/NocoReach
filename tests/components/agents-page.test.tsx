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

// The overview and the local agents section read the project and the Agents plugin; their own tests cover them.
const seen = vi.hoisted(() => ({
  refresh: [] as number[],
  localAgentsId: [] as (string | undefined)[],
}));
vi.mock('../../client/pages/agents/roles', () => ({
  AgentRoles: ({
    refresh,
    localAgentsId,
  }: {
    refresh: number;
    localAgentsId?: string;
  }) => {
    seen.refresh.push(refresh);
    seen.localAgentsId.push(localAgentsId);
    return <p>Who does the work</p>;
  },
}));
vi.mock('../../client/pages/agents/runner', () => ({
  LocalAgents: ({ id }: { id: string }) => (
    <section id={id}>Local agents</section>
  ),
}));

const access = vi.hoisted(() => ({ can: true, isPending: false }));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => access,
}));
beforeEach(() => {
  Object.assign(access, { can: true, isPending: false });
  seen.refresh = [];
  seen.localAgentsId = [];
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

function mount(path = '/agents') {
  const router = createMemoryRouter(
    [
      {
        path: '/agents',
        Component: AgentsPage,
        children: [
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

test('shows who does the work and the local agents on one page without tabs', () => {
  mount();
  expect(
    screen.getByRole('heading', { level: 1, name: 'Agent' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Who does the work')).toBeInTheDocument();
  expect(screen.getByText('Local agents')).toHaveAttribute(
    'id',
    'local-agents',
  );
  expect(seen.localAgentsId.at(-1)).toBe('local-agents');
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  expect(screen.queryAllByRole('link')).toEqual([]);
});

test('leaves out the local agents without the Agents page grant', () => {
  access.can = false;
  mount();
  expect(screen.getByText('Who does the work')).toBeInTheDocument();
  expect(screen.queryByText('Local agents')).not.toBeInTheDocument();
  expect(seen.localAgentsId.at(-1)).toBeUndefined();
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
