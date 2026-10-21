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
    model?: { modelService: string; model: string } | null;
    instructions?: string;
    revision?: number;
  }[],
  runners: { options: [] as unknown[], loading: false, online: 0 },
  status: {
    revision: 3,
    agentId: null as string | null,
    options: [] as {
      id: string;
      name: string;
      online?: boolean;
      health?: unknown;
    }[],
    runners: null as unknown,
  },
  analysis: {
    model: 'deepseek-v4.1-flash' as string | null,
    analysis: { last: { at: '2026-10-21T00:00:00Z', ok: true } } as unknown,
  },
  discovered: [] as unknown[],
  action: vi.fn(),
  request: vi.fn(),
  onlineApi: vi.fn(),
}));
vi.mock('../../client/online-agent/api', () => ({
  useOnlineApi: () => state.onlineApi,
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
    {
      id: 'online',
      name: 'Online Agent',
      enabled: true,
      ready: true,
      model: null,
      instructions: '',
      revision: 2,
    },
  ];
  state.runners = { options: [{ value: 'mac' }], loading: false, online: 1 };
  state.status = {
    revision: 3,
    agentId: 'codex',
    options: [
      {
        id: 'codex',
        name: 'Codex · GPT-6 Astra',
        online: true,
        health: {
          state: 'ok',
          at: '2026-10-21T02:00:00Z',
          outcome: 'completed',
        },
      },
    ],
    runners: { team: 1, personal: 0, mine: 0, names: ['mac'] },
  };
  state.analysis = {
    model: 'deepseek-v4.1-flash',
    analysis: { last: { at: '2026-10-21T00:00:00Z', ok: true } },
  };
  state.discovered = [];
  state.action.mockReset();
  state.action.mockImplementation((resource: string, action: string) =>
    Promise.resolve(
      resource === 'nrOnlineAI'
        ? state.analysis
        : action === 'status'
          ? state.status
          : { revision: 4, agentId: 'x' },
    ),
  );
  state.request.mockReset();
  state.request.mockImplementation(() =>
    Promise.resolve({ data: state.discovered }),
  );
  state.onlineApi.mockReset();
  state.onlineApi.mockResolvedValue({});
});
afterEach(() => cleanup());
const mount = () =>
  render(
    <MemoryRouter>
      <AgentRoles localAgentsId='local-agents' />
    </MemoryRouter>,
  );
const row = (work: string) =>
  screen.getByRole('rowheader', { name: work }).closest('tr')!;
// A row's explanation sits on the line below it.
const detail = (work: string) => row(work).nextElementSibling as HTMLElement;

test('says which work cloud models and local agents do, with what each uses and whether it works', async () => {
  mount();
  await waitFor(() =>
    expect(within(row('执行任务')).getByText('正常')).toBeVisible(),
  );
  for (const work of ['每日分析', '对话栏'])
    expect(within(row(work)).getByText('正常')).toBeVisible();
  expect(
    within(row('每日分析')).getByText('deepseek-v4.1-flash'),
  ).toBeVisible();
  expect(within(row('对话栏')).getByText('deepseek-v4.1-flash')).toBeVisible();
  expect(
    within(row('执行任务')).getByText('Codex · GPT-6 Astra'),
  ).toBeVisible();
  expect(within(row('执行任务')).getByText(/mac · 团队共用/)).toBeVisible();
  expect(screen.getByRole('rowheader', { name: /云端模型/ })).toBeVisible();
  expect(screen.getByRole('rowheader', { name: /本地 Agent/ })).toBeVisible();
  expect(screen.getByRole('link', { name: '模型服务' })).toHaveAttribute(
    'href',
    '/models',
  );
  expect(screen.getByRole('link', { name: '运行环境' })).toHaveAttribute(
    'href',
    '/runtimes',
  );
  expect(screen.getByText(/在对话栏里选了本地 Agent 时/)).toBeVisible();
  expect(
    within(row('对话栏')).getByRole('button', { name: '设置' }),
  ).toHaveAttribute('href', '/agents/chat/online');
  expect(screen.queryByText('最快配置')).toBeNull();
});

test('an online agent whose latest tasks failed because the tool is not signed in needs attention', async () => {
  state.status.options = [
    {
      id: 'codex',
      name: 'Claude · Fable 5.1',
      online: true,
      health: {
        state: 'attention',
        group: 'toolLogin',
        count: 3,
        at: '2026-10-21T11:30:38Z',
        runnerName: 'CheeseMacBook-Pro',
        tool: 'claude',
      },
    },
  ];
  mount();
  await waitFor(() =>
    expect(within(row('执行任务')).getByText('需要处理')).toBeVisible(),
  );
  expect(detail('执行任务')).toHaveTextContent(
    '最近 3 个任务都失败了：CheeseMacBook-Pro 上的 Claude Code 没有登录。请管理这台电脑的人登录 Claude Code，或换一个本地 Agent。',
  );
  expect(
    within(row('执行任务')).getByRole('button', { name: '更换' }),
  ).toBeVisible();
});

test('without a model service, analysis and chat point to connecting one', async () => {
  state.services = [];
  state.analysis = { model: null, analysis: { last: null } };
  mount();
  await waitFor(() => expect(screen.getByText('最快配置')).toBeVisible());
  for (const work of ['每日分析', '对话栏']) {
    expect(within(row(work)).getByText('需要处理')).toBeVisible();
    expect(
      within(row(work)).getByRole('button', { name: '接入模型服务' }),
    ).toHaveAttribute('href', '/models');
    expect(within(row(work)).getByText('—')).toBeVisible();
  }
});

test('a project on simulated data runs the daily analysis without a model service', async () => {
  state.services = [];
  state.analysis = {
    model: 'synthetic-fixture-v1',
    analysis: { last: { at: '2026-10-21T00:00:00Z', ok: true } },
  };
  mount();
  await waitFor(() =>
    expect(within(row('每日分析')).getByText('正常')).toBeVisible(),
  );
  expect(
    within(row('每日分析')).getByText('synthetic-fixture-v1'),
  ).toBeVisible();
  expect(within(row('对话栏')).getByText('需要处理')).toBeVisible();
});

test('a daily analysis that did not finish last time needs attention', async () => {
  state.analysis = {
    model: 'deepseek-v4.1-flash',
    analysis: { last: { at: '2026-10-21T00:00:00Z', ok: false } },
  };
  mount();
  await waitFor(() =>
    expect(within(row('每日分析')).getByText('需要处理')).toBeVisible(),
  );
  expect(detail('每日分析')).toHaveTextContent(/上次运行（.+）没有完成/);
});

test('a chat agent that is turned off is turned on from its row', async () => {
  const user = userEvent.setup();
  state.online = [
    {
      id: 'online',
      name: 'Online Agent',
      enabled: false,
      ready: false,
      model: null,
      instructions: 'Be brief.',
      revision: 2,
    },
  ];
  mount();
  await waitFor(() =>
    expect(detail('对话栏')).toHaveTextContent('Online Agent 已停用。'),
  );
  await user.click(within(row('对话栏')).getByRole('button', { name: '启用' }));
  expect(state.onlineApi).toHaveBeenCalledWith(
    'definitions/online',
    {
      name: 'Online Agent',
      instructions: 'Be brief.',
      model: null,
      revision: 2,
      enabled: true,
    },
    'PUT',
  );
});

test('an offline default is replaced by an enabled agent that is online', async () => {
  const user = userEvent.setup();
  state.status.options = [
    { id: 'codex', name: 'Codex · GPT-6 Astra', online: false },
    { id: 'claude', name: 'Claude Code · Opus', online: true },
  ];
  mount();
  await waitFor(() =>
    expect(detail('执行任务')).toHaveTextContent(/所在运行环境不在线/),
  );
  await user.click(
    within(row('执行任务')).getByRole('button', {
      name: '改用 Claude Code · Opus',
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

test('a discovered agent on an online runtime is enabled and made the default in one step', async () => {
  const user = userEvent.setup();
  state.status = { revision: 3, agentId: null, options: [], runners: null };
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

test('with no runtime yet, tasks and the setup point to adding one', async () => {
  state.runners = { options: [], loading: false, online: 0 };
  state.status = { revision: 3, agentId: null, options: [], runners: null };
  mount();
  await waitFor(() =>
    expect(detail('执行任务')).toHaveTextContent('还没有运行环境。'),
  );
  expect(
    within(row('执行任务')).getByRole('button', { name: '添加运行环境' }),
  ).toHaveAttribute('href', '/runtimes/connect');
  expect(screen.getByText('最快配置')).toBeVisible();
});
