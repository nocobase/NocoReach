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
  admin: true,
  services: [] as {
    name: string;
    title?: string;
    models?: { value: string; label: string }[];
  }[],
  defaultModel: null as { modelService: string; model: string } | null,
  // Chat panel › Settings.
  online: {} as {
    enabled: boolean;
    ready: boolean;
    defaultModel: boolean;
    model: { modelService: string; model: string } | null;
    instructions: string;
    revision: number;
  },
  // Reading Chat panel › Settings failed.
  onlineError: null as Error | null,
  runners: { options: [] as unknown[], loading: false, online: 0 },
  status: {
    revision: 3,
    agentId: null as string | null,
    options: [] as {
      id: string;
      name: string;
      tool?: string;
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
      ? {
          data: {
            services: state.services.map((s) => ({ models: [], ...s })),
            defaultModel: state.defaultModel,
          },
        }
      : state.onlineError
        ? { data: undefined, error: state.onlineError }
        : { data: state.online },
}));
vi.mock('@nocobase/app-plugin-agents/client/kit', () => ({
  useRunnerOptions: () => state.runners,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({ can: true, isPending: false }),
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: state.admin, isPending: false }),
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
  state.admin = true;
  state.services = [
    {
      name: 'openai-compatible',
      title: 'OpenAI-compatible',
      models: [
        { value: 'deepseek-v4.1-flash', label: 'deepseek-v4.1-flash' },
        { value: 'deepseek-v4.1-pro', label: 'deepseek-v4.1-pro' },
      ],
    },
  ];
  state.defaultModel = {
    modelService: 'openai-compatible',
    model: 'deepseek-v4.1-flash',
  };
  state.onlineError = null;
  state.online = {
    enabled: true,
    ready: true,
    defaultModel: true,
    model: null,
    instructions: '',
    revision: 2,
  };
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
      <AgentRoles />
    </MemoryRouter>,
  );
// A row is named by its work followed by the line under it.
const row = (work: string) =>
  screen
    .getByRole('rowheader', { name: new RegExp(`^${work}`) })
    .closest('tr')!;
// A row's explanation sits on the line below it.
// What is wrong sits in the row's own Runs on cell, in small type (2026-10-22 user report: it was a line of body text
// below the row).
const detail = (work: string) =>
  row(work).querySelectorAll('td')[0] as HTMLElement;

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
  // What each group means sits in its ⓘ.
  expect(screen.getByRole('button', { name: '云端模型是什么' })).toBeVisible();
  expect(
    screen.getByRole('button', { name: '本地 Agent是什么' }),
  ).toBeVisible();
  // One Settings button on every row.
  expect(
    within(row('对话栏')).getByRole('button', { name: '设置' }),
  ).toHaveAttribute('href', '/agents/chat');
  for (const work of ['每日分析', '执行任务'])
    expect(
      within(row(work)).getByRole('button', { name: '设置' }),
    ).toBeVisible();
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
    within(row('执行任务')).getByRole('button', { name: '设置' }),
  ).toBeVisible();
});

test('a tool that is not signed in is not fixed by an agent with the same tool', async () => {
  const user = userEvent.setup();
  const failing = {
    id: 'fable',
    name: 'Claude · Fable 5.1',
    tool: 'claude',
    online: true,
    health: {
      state: 'attention',
      group: 'toolLogin',
      count: 3,
      at: '2026-10-21T11:30:38Z',
      runnerName: 'CheeseMacBook-Pro',
      tool: 'claude',
    },
  };
  const haiku = {
    id: 'haiku',
    name: 'Claude · Haiku 4.5',
    tool: 'claude',
    online: true,
  };
  state.status.agentId = 'fable';
  state.status.options = [failing, haiku];
  const view = mount();
  await waitFor(() =>
    expect(within(row('执行任务')).getByText('需要处理')).toBeVisible(),
  );
  expect(screen.queryByRole('button', { name: /改用/ })).toBeNull();
  expect(
    within(row('执行任务')).getByRole('button', { name: '设置' }),
  ).toBeVisible();
  view.unmount();

  state.status.options = [
    failing,
    haiku,
    { id: 'astra', name: 'Codex · GPT-6 Astra', tool: 'codex', online: true },
  ];
  mount();
  await user.click(
    await within(row('执行任务')).findByRole('button', {
      name: '改用 Codex · GPT-6 Astra',
    }),
  );
  expect(state.action).toHaveBeenCalledWith(
    'nrAgent',
    'saveDefault',
    expect.objectContaining({
      body: { projectId: '1', revision: 3, agentId: 'astra' },
    }),
  );
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
    ).toHaveAttribute('href', '/agents/models');
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

test('a Chat panel that is turned off is turned on from its row', async () => {
  const user = userEvent.setup();
  state.online = {
    enabled: false,
    ready: false,
    defaultModel: true,
    model: null,
    instructions: 'Be brief.',
    revision: 2,
  };
  mount();
  await waitFor(() =>
    expect(detail('对话栏')).toHaveTextContent('对话 Agent 已停用。'),
  );
  await user.click(within(row('对话栏')).getByRole('button', { name: '启用' }));
  expect(state.onlineApi).toHaveBeenCalledWith(
    'settings',
    { enabled: true, instructions: 'Be brief.', model: null, revision: 2 },
    'PUT',
  );
});

test('a Chat panel whose model cannot answer needs attention and opens its settings', async () => {
  state.online = { ...state.online, ready: false };
  mount();
  await waitFor(() =>
    expect(detail('对话栏')).toHaveTextContent('对话 Agent 用的模型不可用。'),
  );
  expect(
    within(row('对话栏')).getByRole('button', { name: '设置' }),
  ).toHaveAttribute('href', '/agents/chat');
});

test('a Chat panel without a system default chat model points to the daily analysis model', async () => {
  // The plugin offers its online agent only while a system default chat model exists, even with a model of its own.
  state.online = {
    ...state.online,
    model: { modelService: 'openai-compatible', model: 'deepseek-v4.1-pro' },
    ready: false,
    defaultModel: false,
  };
  mount();
  await waitFor(() =>
    expect(detail('对话栏')).toHaveTextContent(
      '对话 Agent 还需要一个系统默认对话模型',
    ),
  );
  expect(
    within(row('对话栏')).getByRole('button', { name: '设置' }),
  ).not.toHaveAttribute('href');
});

test('a Chat panel whose settings cannot be read needs attention', async () => {
  state.onlineError = new Error('403');
  mount();
  await waitFor(() =>
    expect(within(row('对话栏')).getByText('需要处理')).toBeVisible(),
  );
  expect(detail('对话栏')).toHaveTextContent('无法读取对话栏的设置。');
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
  ).toHaveAttribute('href', '/agents/runtimes/connect');
  expect(screen.getByText('最快配置')).toBeVisible();
});

test('Daily analysis › Settings changes the model the analysis runs on', async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(within(row('每日分析')).getByText('正常')).toBeVisible(),
  );
  await user.click(
    within(row('每日分析')).getByRole('button', { name: '设置' }),
  );
  const dialog = await screen.findByRole('dialog', { name: '每日分析' });
  expect(
    within(dialog).getByText(/对话栏没有单独选模型时，也用这个/),
  ).toBeVisible();
  expect(within(dialog).getByRole('button', { name: '保存' })).toBeDisabled();
  await user.click(
    within(dialog).getByRole('combobox', { name: '用哪个模型' }),
  );
  await user.click(
    await screen.findByRole('option', {
      name: 'OpenAI-compatible / deepseek-v4.1-pro',
    }),
  );
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith('nrOnlineAI', 'setModel', {
      method: 'POST',
      body: {
        modelService: 'openai-compatible',
        model: 'deepseek-v4.1-pro',
        projectId: '1',
      },
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('Tasks › Settings picks the project default and says which agents can work', async () => {
  const user = userEvent.setup();
  state.status.options = [
    { id: 'codex', name: 'Codex · GPT-6 Astra', tool: 'codex', online: true },
    {
      id: 'fable',
      name: 'Claude · Fable 5.1',
      tool: 'claude',
      online: true,
      health: {
        state: 'attention',
        group: 'toolLogin',
        count: 2,
        at: null,
        runnerName: null,
        tool: 'claude',
      },
    },
    { id: 'idle', name: 'Claude · Haiku 4.5', tool: 'claude', online: false },
  ];
  mount();
  await waitFor(() =>
    expect(within(row('执行任务')).getByText('正常')).toBeVisible(),
  );
  await user.click(
    within(row('执行任务')).getByRole('button', { name: '设置' }),
  );
  const dialog = await screen.findByRole('dialog', { name: '执行任务' });
  await user.click(
    within(dialog).getByRole('combobox', { name: '项目默认 Agent' }),
  );
  expect(
    await screen.findByRole('option', { name: 'Codex · GPT-6 Astra · 在线' }),
  ).toBeVisible();
  expect(
    screen.getByRole('option', { name: 'Claude · Fable 5.1 · 没登录' }),
  ).toBeVisible();
  expect(
    screen.getByRole('option', { name: 'Claude · Haiku 4.5 · 不在线' }),
  ).toBeVisible();
  await user.click(
    screen.getByRole('option', { name: 'Claude · Haiku 4.5 · 不在线' }),
  );
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith('nrAgent', 'saveDefault', {
      method: 'POST',
      body: { projectId: '1', revision: 3, agentId: 'idle' },
    }),
  );
});

test('members see the overview without Settings buttons', async () => {
  state.admin = false;
  mount();
  await waitFor(() =>
    expect(within(row('执行任务')).getByText('正常')).toBeVisible(),
  );
  expect(screen.queryByRole('button', { name: '设置' })).toBeNull();
});

test('a last task that did not finish is a small line in the row, and column headings are for screen readers', async () => {
  state.status.options = [
    {
      id: 'codex',
      name: 'Codex · GPT-6 Astra',
      tool: 'codex',
      online: true,
      health: { state: 'ok', at: '2026-10-22T13:54:00Z', outcome: 'failed' },
    },
  ];
  mount();
  await waitFor(() =>
    expect(within(row('执行任务')).getByText('正常')).toBeVisible(),
  );
  const line = within(row('执行任务')).getByText(/上次任务 .+ 没有完成/);
  expect(line).toHaveClass('text-xs');
  expect(screen.queryByText(/可以在任务页再试一次/)).toBeNull();
  expect(
    screen.getByRole('columnheader', { name: '工作' }).closest('thead'),
  ).toHaveClass('sr-only');
});
