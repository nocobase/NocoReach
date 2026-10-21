import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import OnlineAgentSettings from '../../client/online-agent/settings';

const state = vi.hoisted(() => ({
  resources: {} as Record<string, { data?: unknown; error?: unknown }>,
  revisions: [] as [string, number | undefined][],
}));
vi.mock('../../client/online-agent/api', () => ({
  OnlineApiError: class extends Error {},
  useOnlineApi: () => vi.fn(),
  useOnlineResource: (path: string, revision?: number) => {
    state.revisions.push([path, revision]);
    return { ...state.resources[path], loading: false, update: vi.fn() };
  },
}));
vi.mock('../../client/online-agent/controls', () => ({
  OnlineError: () => null,
  OnlineConfirm: () => null,
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true }),
}));
vi.mock('../../client/pages/agents/index', () => ({
  AgentsPageLayout: ({ children }: { children: React.ReactNode }) => children,
}));
beforeEach(() => {
  state.resources = { definitions: { data: [] } };
  state.revisions = [];
});

function mount() {
  const router = createMemoryRouter(
    [{ path: '/agents/online', Component: OnlineAgentSettings }],
    { initialEntries: ['/agents/online'] },
  );
  render(<RouterProvider router={router} />);
}

// The model service step lives in the Agent page's roles overview now; the tab only lists chat agents.
test('offers to create a chat agent while there is none', () => {
  state.resources.models = { data: { services: [] } };
  mount();
  expect(screen.getByText('还没有对话 Agent')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '添加对话 Agent' })).toBeVisible();
});
