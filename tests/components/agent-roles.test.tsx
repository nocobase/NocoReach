import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { AgentRoles } from '../../client/pages/agents/roles';

const state = vi.hoisted(() => ({
  services: [] as { name: string }[],
  online: [] as {
    id: string;
    name: string;
    enabled: boolean;
    ready: boolean;
  }[],
  runners: { options: [] as unknown[], loading: false, online: 0 },
  status: {
    revision: 3,
    agentId: null as string | null,
    options: [] as { id: string; name: string; online?: boolean }[],
  },
  discovered: [] as unknown[],
  action: vi.fn(),
  request: vi.fn(),
}));
vi.mock('../../client/online-agent/api', () => ({
  useOnlineResource: (path: string) =>
    path === 'models'
      ? { data: { services: state.services } }
      : { data: state.online },
}));
vi.mock('@nocobase/app-plugin-agents/client/kit', () => ({
  useRunnerOptions: () => state.runners,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({ can: true, isPending: false }),
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true, isPending: false }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, name: 'NocoBase' } }),
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action: state.action, wrapRequests: vi.fn() },
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => ({ request: state.request }),
}));

beforeEach(() => {
  setDictionary(null);
  state.services = [{ name: 'OpenAI-compatible' }];
  state.online = [
    { id: 'online', name: 'Online Agent', enabled: true, ready: true },
  ];
  state.runners = { options: [{ value: 'mac' }], loading: false, online: 1 };
  state.status = {
    revision: 3,
    agentId: 'codex',
    options: [{ id: 'codex', name: 'Codex · GPT-6 Astra', online: true }],
  };
  state.discovered = [];
  state.action.mockReset();
  state.action.mockImplementation((resource: string, action: string) =>
    Promise.resolve(
      action === 'status' ? state.status : { revision: 4, agentId: 'x' },
    ),
  );
  state.request.mockReset();
  state.request.mockImplementation(() =>
    Promise.resolve({ data: state.discovered }),
  );
});
afterEach(() => cleanup());
const mount = () =>
  render(
    <MemoryRouter>
      <AgentRoles />
    </MemoryRouter>,
  );
const card = (name: string) => screen.getByRole('region', { name });

test('each AI says what it does, never does and needs; nothing to set up when all work', async () => {
  mount();
  await waitFor(() =>
    expect(within(card('执行 Agent')).getByText('可用')).toBeVisible(),
  );
  for (const name of ['每日分析', '对话 Agent'])
    expect(within(card(name)).getByText('可用')).toBeVisible();
  expect(within(card('每日分析')).getByText(/生成洞察和机会/)).toBeVisible();
  expect(
    within(card('执行 Agent')).getByText('项目默认：Codex · GPT-6 Astra'),
  ).toBeVisible();
  expect(screen.queryByText('最快配置')).toBeNull();
});

test('without a model service, analysis and chat point to connecting one', async () => {
  state.services = [];
  mount();
  await waitFor(() => expect(screen.getByText('最快配置')).toBeVisible());
  for (const name of ['每日分析', '对话 Agent']) {
    expect(within(card(name)).getByText('需要处理')).toBeVisible();
    expect(
      within(card(name)).getByRole('button', { name: '接入模型服务' }),
    ).toHaveAttribute('href', '/agents/models');
  }
});

test('an offline default is replaced by an enabled agent that is online', async () => {
  const user = userEvent.setup();
  state.status.options = [
    { id: 'codex', name: 'Codex · GPT-6 Astra', online: false },
    { id: 'claude', name: 'Claude Code · Opus', online: true },
  ];
  mount();
  const execution = await waitFor(() => card('执行 Agent'));
  expect(
    await within(execution).findByText(/所在运行环境不在线/),
  ).toBeVisible();
  await user.click(
    within(execution).getByRole('button', { name: '改用 Claude Code · Opus' }),
  );
  expect(state.action).toHaveBeenCalledWith(
    'nrAgent',
    'saveDefault',
    expect.objectContaining({
      body: { projectId: '1', revision: 3, agentId: 'claude' },
    }),
  );
});

test('a discovered agent on an online runtime is enabled and made the default in one step', async () => {
  const user = userEvent.setup();
  state.status = { revision: 3, agentId: null, options: [] };
  state.discovered = [
    {
      id: 'claude',
      name: 'Claude Code · Opus',
      status: 'pending',
      canEdit: true,
      revision: 7,
      description: null,
      suggestion: { en: 'Strong writer.', zh: '擅长写作。' },
      runners: { team: 1, personal: 0, mine: 0, names: ['mac'] },
    },
  ];
  mount();
  const button = await screen.findAllByRole('button', {
    name: '启用 Claude Code · Opus 并设为默认',
  });
  await user.click(button[0]);
  await waitFor(() =>
    expect(state.request).toHaveBeenCalledWith({
      path: 'agents/claude',
      method: 'PATCH',
      json: { expectedRevision: 7, enabled: true, description: '擅长写作。' },
    }),
  );
  expect(state.action).toHaveBeenCalledWith(
    'nrAgent',
    'saveDefault',
    expect.objectContaining({
      body: { projectId: '1', revision: 3, agentId: 'claude' },
    }),
  );
});

test('with no runtime yet, the execution agent and the setup point to adding one', async () => {
  state.runners = { options: [], loading: false, online: 0 };
  state.status = { revision: 3, agentId: null, options: [] };
  mount();
  const execution = await waitFor(() => card('执行 Agent'));
  expect(await within(execution).findByText('还没有运行环境。')).toBeVisible();
  expect(
    within(execution).getByRole('button', { name: '添加运行环境' }),
  ).toHaveAttribute('href', '/agents/runtimes/connect');
  expect(screen.getByText('最快配置')).toBeVisible();
});
