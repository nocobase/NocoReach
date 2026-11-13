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
      tool?: string;
      online?: boolean;
      health?: unknown;
    }[],
    runners: null as unknown,
  },
  analysis: {
    model: 'deepseek-v4.1-flash' as string | null,
    analysis: { last: { at: '2026-10-21T00:00:00Z', ok: true } } as unknown,
    editing: undefined as unknown,
  },
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
    editing: { choice: null, model: 'deepseek-v4.1-flash', available: true },
  };
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
  state.request.mockImplementation(() => Promise.resolve({ data: [] }));
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
  for (const work of ['每日分析', '编辑与建议', '对话栏'])
    expect(within(row(work)).getByText('正常')).toBeVisible();
  expect(
    within(row('每日分析')).getByText('deepseek-v4.1-flash'),
  ).toBeVisible();
  // Editing and suggestions sits between them and, without a model of its own, runs on the daily analysis's.
  const rows = screen.getAllByRole('rowheader').map((cell) => cell.textContent);
  expect(rows.slice(1, 4)).toEqual([
    '每日分析每天找机会，每周整理项目知识',
    '编辑与建议改写选中的文字、整理新任务、推荐关键词和竞品等',
    '对话栏回答你的问题',
  ]);
  expect(
    within(row('编辑与建议')).getByText('deepseek-v4.1-flash'),
  ).toBeVisible();
  expect(within(row('编辑与建议')).getByText('和每日分析相同')).toHaveClass(
    'text-xs',
  );
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
  ).toHaveAttribute('href', '/agents/chat/online');
  for (const work of ['每日分析', '编辑与建议', '执行任务'])
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

test('without a model service, analysis, editing and chat point to connecting one', async () => {
  state.services = [];
  state.analysis = { model: null, analysis: { last: null } };
  mount();
  await waitFor(() => expect(screen.getByText('最快配置')).toBeVisible());
  for (const work of ['每日分析', '编辑与建议', '对话栏']) {
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
  // The simulated model answers the on-demand helpers too.
  expect(within(row('编辑与建议')).getByText('正常')).toBeVisible();
  expect(
    within(row('编辑与建议')).getByText('synthetic-fixture-v1'),
  ).toBeVisible();
  expect(within(row('对话栏')).getByText('需要处理')).toBeVisible();
});

test('model services without an enabled chat model leave analysis and editing without a model', async () => {
  state.defaultModel = null;
  state.analysis = { model: null, analysis: { last: null } };
  mount();
  await waitFor(() =>
    expect(within(row('每日分析')).getByText('需要处理')).toBeVisible(),
  );
  for (const work of ['每日分析', '编辑与建议']) {
    expect(within(row(work)).getByText('需要处理')).toBeVisible();
    expect(detail(work)).toHaveTextContent('模型服务里没有启用的对话模型。');
    expect(
      within(row(work)).getByRole('button', { name: '查看模型服务' }),
    ).toHaveAttribute('href', '/agents/models');
  }
  expect(screen.queryByText('还没有接入模型服务。')).toBeNull();
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
  // A failed analysis run says nothing about the model the helpers use.
  expect(within(row('编辑与建议')).getByText('正常')).toBeVisible();
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

test('opens runtime configuration when no enabled agent is available', async () => {
  state.status.agentId = null;
  state.status.options = [];
  mount();
  await waitFor(() =>
    expect(
      within(row('执行任务')).getByRole('button', { name: '查看运行环境' }),
    ).toHaveAttribute('href', '/agents/runtimes'),
  );
  expect(state.request).not.toHaveBeenCalled();
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
    within(dialog).getByText(
      '从「模型服务」里已启用的对话模型中选。编辑与建议、对话栏没有单独选模型时，也用这个。',
    ),
  ).toBeVisible();
  expect(within(dialog).getByText(/运行时间在/)).toBeVisible();
  expect(within(dialog).getByRole('button', { name: '保存' })).toBeDisabled();
  await user.click(
    within(dialog).getByRole('combobox', { name: '用哪个模型' }),
  );
  // Only the models themselves: following another row is Editing and suggestions' option.
  expect(screen.queryByRole('option', { name: /和每日分析相同/ })).toBeNull();
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

// Each cloud model row picks its own model, as models are good at different things (2026-11-13 user decision).
test('Editing and suggestions › Settings gives it a model of its own', async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(within(row('编辑与建议')).getByText('正常')).toBeVisible(),
  );
  await user.click(
    within(row('编辑与建议')).getByRole('button', { name: '设置' }),
  );
  const dialog = await screen.findByRole('dialog', { name: '编辑与建议' });
  expect(
    within(dialog).getByText(
      '从「模型服务」里已启用的对话模型中选。不单独选时，用每日分析的模型。',
    ),
  ).toBeVisible();
  expect(within(dialog).queryByText(/运行时间在/)).toBeNull();
  expect(
    within(dialog).getByRole('combobox', { name: '用哪个模型' }),
  ).toHaveTextContent('和每日分析相同（deepseek-v4.1-flash）');
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
        role: 'editing',
        modelService: 'openai-compatible',
        model: 'deepseek-v4.1-pro',
        projectId: '1',
      },
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('Editing and suggestions with a model of its own names it and can go back to the daily analysis’s', async () => {
  const user = userEvent.setup();
  state.analysis.editing = {
    choice: { modelService: 'openai-compatible', model: 'deepseek-v4.1-pro' },
    model: 'deepseek-v4.1-pro',
    available: true,
  };
  mount();
  await waitFor(() =>
    expect(within(row('编辑与建议')).getByText('正常')).toBeVisible(),
  );
  expect(
    within(row('编辑与建议')).getByText('deepseek-v4.1-pro'),
  ).toBeVisible();
  expect(within(row('编辑与建议')).queryByText('和每日分析相同')).toBeNull();
  expect(
    within(row('每日分析')).getByText('deepseek-v4.1-flash'),
  ).toBeVisible();
  await user.click(
    within(row('编辑与建议')).getByRole('button', { name: '设置' }),
  );
  const dialog = await screen.findByRole('dialog', { name: '编辑与建议' });
  expect(
    within(dialog).getByRole('combobox', { name: '用哪个模型' }),
  ).toHaveTextContent('OpenAI-compatible / deepseek-v4.1-pro');
  await user.click(
    within(dialog).getByRole('combobox', { name: '用哪个模型' }),
  );
  await user.click(
    await screen.findByRole('option', {
      name: '和每日分析相同（deepseek-v4.1-flash）',
    }),
  );
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(state.action).toHaveBeenCalledWith('nrOnlineAI', 'setModel', {
      method: 'POST',
      body: { role: 'editing', model: null, projectId: '1' },
    }),
  );
});

test('an own editing model that is no longer available needs attention', async () => {
  state.analysis.editing = {
    choice: { modelService: 'removed', model: 'gemini-old' },
    model: 'gemini-old',
    available: false,
  };
  mount();
  await waitFor(() =>
    expect(within(row('编辑与建议')).getByText('需要处理')).toBeVisible(),
  );
  expect(within(row('编辑与建议')).getByText('gemini-old')).toBeVisible();
  expect(detail('编辑与建议')).toHaveTextContent('所选的模型不可用。');
  expect(
    within(row('编辑与建议')).getByRole('button', { name: '设置' }),
  ).toBeVisible();
  // The daily analysis keeps running on its own model.
  expect(within(row('每日分析')).getByText('正常')).toBeVisible();
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
