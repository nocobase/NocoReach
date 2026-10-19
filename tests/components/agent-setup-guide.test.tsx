import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  ModelSetupGuide,
  RunnerSetupGuide,
} from '../../client/pages/agents/setup-guide';

const state = vi.hoisted(() => ({
  runners: { loading: false, online: 0, options: [] as { value: string }[] },
  agents: { loading: false, failed: false, options: [] as { value: string }[] },
  // Grants the viewer does not hold: a resource id (every action) or `id:action`.
  denied: new Set<string>(),
  pending: false,
}));
vi.mock('@nocobase/app-plugin-agents/client/kit', () => ({
  useRunnerOptions: () => state.runners,
  useAgentOptions: () => state.agents,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: (request?: { resource: { id: string }; action: string }) => ({
    can:
      !state.pending &&
      (!request ||
        (!state.denied.has(request.resource.id) &&
          !state.denied.has(`${request.resource.id}:${request.action}`))),
    isPending: state.pending,
  }),
}));
beforeEach(() => {
  state.runners = { loading: false, online: 0, options: [] };
  state.agents = { loading: false, failed: false, options: [] };
  state.denied.clear();
  state.pending = false;
});

function mount(element: React.ReactNode) {
  const router = createMemoryRouter([{ path: '*', element }], {
    initialEntries: ['/agents/runner?view=saved'],
  });
  return render(<RouterProvider router={router} />);
}

test('points to adding a runtime when there is none', () => {
  mount(<RunnerSetupGuide />);
  expect(screen.getByText('先添加一个运行环境')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '添加运行环境' })).toHaveAttribute(
    'href',
    '/agents/runtimes/connect?view=saved',
  );
});

test('leaves out the add button without the runtimes grant', () => {
  state.denied.add('runtimes');
  mount(<RunnerSetupGuide />);
  expect(screen.getByText('先添加一个运行环境')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('does not claim no runtime exists to a viewer who sees only their own', () => {
  state.denied.add('agents.runners');
  state.denied.add('agents.agents');
  mount(<RunnerSetupGuide />);
  expect(screen.queryByText('先添加一个运行环境')).not.toBeInTheDocument();
  expect(
    screen.getByText('请联系管理员启用 Runner Agent，或添加你自己的运行环境。'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '添加运行环境' })).toBeVisible();
});

test('says when every runtime is offline', () => {
  state.runners = { loading: false, online: 0, options: [{ value: 'r1' }] };
  mount(<RunnerSetupGuide />);
  expect(screen.getByText('运行环境都不在线')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '查看运行环境' })).toHaveAttribute(
    'href',
    '/agents/runtimes?view=saved',
  );
});

test('asks to enable an agent once a runtime is online', () => {
  state.runners = { loading: false, online: 1, options: [{ value: 'r1' }] };
  const { unmount } = mount(<RunnerSetupGuide />);
  expect(screen.getByText(/在下方“新发现”中启用/)).toBeInTheDocument();
  unmount();
  state.denied.add('agents.agents:manage');
  mount(<RunnerSetupGuide />);
  expect(
    screen.getByText('请联系管理员启用 Runner Agent。'),
  ).toBeInTheDocument();
});

test('shows nothing once an agent is enabled, while loading, or when agents cannot be listed', () => {
  state.agents = { loading: false, failed: false, options: [{ value: 'a' }] };
  const enabled = mount(<RunnerSetupGuide />);
  expect(enabled.container).toBeEmptyDOMElement();
  enabled.unmount();
  state.agents = { loading: false, failed: true, options: [] };
  const failed = mount(<RunnerSetupGuide />);
  expect(failed.container).toBeEmptyDOMElement();
  failed.unmount();
  state.agents = { loading: false, failed: false, options: [] };
  state.runners = { loading: true, online: 0, options: [] };
  const loading = mount(<RunnerSetupGuide />);
  expect(loading.container).toBeEmptyDOMElement();
  loading.unmount();
  state.runners = { loading: false, online: 0, options: [] };
  state.pending = true;
  expect(mount(<RunnerSetupGuide />).container).toBeEmptyDOMElement();
});

test('points to adding a model service only to who may add one', () => {
  const { unmount } = mount(<ModelSetupGuide />);
  expect(screen.getByText('先添加模型服务')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '添加模型服务' })).toHaveAttribute(
    'href',
    '/agents/models?view=saved',
  );
  unmount();
  // Reading model services opens the models tab, but adding one takes manage.
  state.denied.add('agents.services:manage');
  mount(<ModelSetupGuide />);
  expect(
    screen.getByText('在线 Agent 需要模型服务才能回答问题，请联系管理员添加。'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('waits for the model permission checks', () => {
  state.pending = true;
  expect(mount(<ModelSetupGuide />).container).toBeEmptyDOMElement();
});
