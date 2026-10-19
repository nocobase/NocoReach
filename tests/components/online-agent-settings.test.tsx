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
vi.mock('../../client/pages/agents/setup-guide', () => ({
  ModelSetupGuide: () => <p>Model guide</p>,
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

test('asks for a model service first and still offers to create an agent', () => {
  state.resources.models = { data: { services: [] } };
  mount();
  expect(screen.getByText('Model guide')).toBeInTheDocument();
  expect(screen.getByText('还没有在线 Agent')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '添加在线 Agent' })).toBeVisible();
});

test('shows no model guide once a service exists', () => {
  state.resources.models = { data: { services: [{ name: 'openai' }] } };
  mount();
  expect(screen.queryByText('Model guide')).not.toBeInTheDocument();
});

test('shows no model guide when the catalog cannot be read', () => {
  state.resources.models = { error: new Error('offline') };
  mount();
  expect(screen.queryByText('Model guide')).not.toBeInTheDocument();
});

test('reads the catalog again on every refresh', () => {
  state.resources.models = { data: { services: [] } };
  mount();
  expect(state.revisions).toContainEqual(['models', 0]);
});
