import { NavigationGuardProvider } from '@nocobase/app-client';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import en from '../../shared/i18n/en.json';
import { TaskDraftProvider } from '../../client/pages/task-detail/drafts';
import { TaskDetail } from '../../client/pages/task-detail';
import { TaskAgentField } from '../../client/pages/task-detail/agent-field';
import { NocoReachHttpError } from '../../client/lib/nocoreach-api';
import type { TaskData } from '../../client/pages/task-execution-types';
import type { Playbook } from '../../client/pages/playbook-model';

const { action, advance, access } = vi.hoisted(() => ({
  action: vi.fn(),
  advance: vi.fn(),
  access: { allowed: true },
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => {
  const module =
    await original<typeof import('../../client/lib/nocoreach-api')>();
  return {
    ...module,
    nocobaseClient: { ...module.nocobaseClient, action, wrapRequests: vi.fn() },
  };
});
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: '1' }, can: () => access.allowed }),
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
}));

const playbook: Playbook = {
  id: 'research',
  name: '调研',
  category: 'research',
  description: '',
  kind: 'plan',
  next: [],
  version: 1,
  steps: [
    { key: 'analyze', name: '分析', kind: 'analyze', instruction: 'Research' },
  ],
};
function initial(): TaskData {
  return {
    task: { id: 1, title: '选择任务 Agent', brief: '' },
    work: {
      revision: 4,
      stage: 'plan',
      plan: null,
      planVersion: 0,
      step: 0,
      results: [],
      history: [],
      humanOwnerId: '1',
      humanOwnerName: 'Owner',
    },
    runs: [],
    artifacts: [],
    reviews: [],
    playbookDefault: 'research',
    agent: {
      repo: null,
      online: true,
      agentId: null,
      defaultAgentId: null,
      options: [
        { id: 'codex', name: 'NocoReach Codex' },
        { id: 'claude', name: 'Research Claude' },
      ],
    },
  };
}
beforeEach(() => {
  access.allowed = true;
  setDictionary(null);
  action.mockReset();
  advance.mockReset();
  action.mockImplementation((resource: string, command: string) => {
    if (command === 'advance') return advance();
    if (resource === 'nrPlaybooks')
      return Promise.resolve({ playbooks: [playbook] });
    if (command === 'members')
      return Promise.resolve([{ id: '1', name: 'Owner' }]);
    return Promise.resolve([]);
  });
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});
function mount(data = initial()) {
  return render(
    <MemoryRouter>
      <NavigationGuardProvider>
        <TaskDraftProvider>
          <TaskDetail projectId={1} taskId='1' initial={data} />
        </TaskDraftProvider>
      </NavigationGuardProvider>
    </MemoryRouter>,
  );
}

test('task confirmation exposes the agent picker and persists selection before enabling start', async () => {
  const user = userEvent.setup();
  const data = initial();
  mount(data);
  const start = await screen.findByRole('button', { name: '确定开始执行' });
  expect(start).toBeDisabled();
  const selected = structuredClone(data);
  selected.work.agentId = 'codex';
  selected.work.agentName = 'NocoReach Codex';
  selected.work.revision++;
  selected.agent!.agentId = 'codex';
  advance.mockResolvedValueOnce(selected);
  await user.click(screen.getByRole('combobox', { name: '执行 Agent' }));
  await user.click(
    await screen.findByRole('option', { name: 'NocoReach Codex' }),
  );
  await waitFor(() => expect(start).toBeEnabled());
  expect(action).toHaveBeenCalledWith(
    'nrTaskWork',
    'advance',
    expect.objectContaining({
      body: expect.objectContaining({
        taskId: '1',
        revision: 4,
        command: 'setAgent',
        agentId: 'codex',
      }),
    }),
  );
  // Once chosen, the picker folds into one line that names the Agent.
  expect(await screen.findByText('由 NocoReach Codex 来做')).toBeVisible();
  expect(
    screen.queryByRole('combobox', { name: '执行 Agent' }),
  ).not.toBeInTheDocument();
});

test('with exactly one Agent available, starting saves it on the task first', async () => {
  const user = userEvent.setup();
  const data = initial();
  data.agent!.options = [{ id: 'codex', name: 'NocoReach Codex' }];
  const saved = structuredClone(data);
  saved.work.revision = 5;
  saved.work.agentId = 'codex';
  saved.agent!.agentId = 'codex';
  advance.mockResolvedValueOnce(saved).mockResolvedValueOnce(saved);
  mount(data);
  expect(await screen.findByText('由 NocoReach Codex 来做')).toBeVisible();
  await screen.findByRole('option', { name: /调研/ });
  await user.click(screen.getByRole('button', { name: '确定开始执行' }));
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrTaskWork',
      'advance',
      expect.objectContaining({
        body: expect.objectContaining({ command: 'startTask', revision: 5 }),
      }),
    ),
  );
  expect(action).toHaveBeenCalledWith(
    'nrTaskWork',
    'advance',
    expect.objectContaining({
      body: expect.objectContaining({ command: 'setAgent', agentId: 'codex' }),
    }),
  );
});

test('failed reassignment retains the saved agent and shows the server error', async () => {
  const user = userEvent.setup();
  const data = initial();
  data.work.agentId = 'codex';
  data.agent!.agentId = 'codex';
  mount(data);
  await screen.findByRole('option', { name: /调研/ });
  advance.mockRejectedValueOnce(new Error('任务已更新，请刷新后再保存'));
  await user.click(screen.getByRole('button', { name: '换一个' }));
  // A selected popup can reopen under the pointer in jsdom; use its keyboard interaction.
  screen.getByRole('combobox', { name: '执行 Agent' }).focus();
  await user.keyboard('[ArrowDown]');
  await user.click(
    await screen.findByRole('option', { name: 'Research Claude' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('任务已更新');
  expect(
    screen.getByRole('combobox', { name: '执行 Agent' }),
  ).toHaveTextContent('NocoReach Codex');
});

test.each(['queued', 'running'])(
  'started tasks offer no reassignment while %s',
  (status) => {
    const data = initial();
    data.work.stage = 'flow';
    data.work.flow = {
      id: 'research',
      name: '调研',
      version: 1,
      stages: [
        { key: 'analyze', name: '分析', kind: 'agent', mode: 'analyze' },
      ],
    };
    data.work.agentId = 'codex';
    data.agent!.agentId = 'codex';
    data.runs = [
      {
        id: 'run',
        status,
        planVersion: 0,
        stepId: 'analyze',
        createdAt: new Date().toISOString(),
        agentId: 'codex',
        agentName: 'NocoReach Codex',
      },
    ];
    mount(data);
    expect(
      screen.getByRole('heading', { name: /Agent 正在分析/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole('combobox', { name: '执行 Agent' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '换一个' }),
    ).not.toBeInTheDocument();
  },
);

test('a task reader cannot reassign its agent', () => {
  access.allowed = false;
  mount();
  expect(screen.getByRole('combobox', { name: '执行 Agent' })).toBeDisabled();
  expect(screen.getByText('只有负责人和管理员能更换')).toBeVisible();
});

test('default, unavailable and empty agent states are translated with the real dictionary', () => {
  setDictionary(en);
  const data = initial();
  data.agent!.defaultAgentId = 'codex';
  data.agent!.agentId = 'codex';
  const props = { busy: false, onChange: vi.fn(async () => true) };
  const view = render(
    <MemoryRouter>
      <TaskAgentField data={data} {...props} />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('combobox', { name: 'Execution agent' }),
  ).toHaveTextContent('Project default: NocoReach Codex');
  data.work.agentId = 'removed';
  data.work.agentName = 'Old agent';
  data.agent!.agentId = 'removed';
  view.rerender(
    <MemoryRouter>
      <TaskAgentField data={data} {...props} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('combobox')).toHaveTextContent(
    'Unavailable: Old agent',
  );
  expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
  data.agent!.options = [];
  view.rerender(
    <MemoryRouter>
      <TaskAgentField data={data} {...props} />
    </MemoryRouter>,
  );
  expect(
    screen.getByText(
      'No Agent is available yet. Ask an administrator to connect one under AI team.',
    ),
  ).toBeVisible();
});

test.each([false, true])(
  'simulated release is labeled without live verification or revert actions (English: %s)',
  async (english) => {
    if (english) setDictionary(en);
    const data = initial();
    data.work.stage = 'done';
    data.work.flow = {
      id: 'build',
      name: 'Build',
      version: 1,
      stages: [{ key: 'release', name: 'Release', kind: 'release' }],
    };
    data.work.release = {
      state: 'simulated',
      note: 'Demo change',
      pages: [],
      pr: {
        number: 1,
        url: 'https://github.com/example/site/pull/1',
        headSha: 'abc1234',
      },
    };
    mount(data);
    expect(
      await screen.findByText(
        english ? 'Simulated publication complete' : '模拟发布完成',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        english
          ? "The demo doesn't publish anything to the live site."
          : '演示环境不会真的发布到网站。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '撤回当前修改' }),
    ).not.toBeInTheDocument();
  },
);

function reviewTask(): TaskData {
  const data = initial();
  data.work.stage = 'flow';
  data.work.flow = {
    id: 'legacy',
    name: 'Legacy',
    version: 1,
    stages: [
      { key: 'draft', name: '旧草稿', kind: 'agent', instruction: 'Draft' },
      { key: 'review', name: '审核', kind: 'review' },
    ],
  };
  data.work.stageIndex = 0;
  return data;
}

test.each(['agent'] as const)(
  '%s results keep manual review and send the appropriate feedback command',
  async (kind) => {
    const user = userEvent.setup();
    const data = reviewTask();
    data.work.flow!.stages[0].kind = kind;
    data.work.stageIndex = 1;
    data.work.results = [
      {
        id: 'old-draft',
        stepId: 'draft',
        planVersion: 0,
        content: 'Historical draft',
        version: 1,
        createdAt: '2026-01-01',
        createdBy: 'agent',
      },
    ];
    advance.mockResolvedValue(data);
    mount(data);
    expect(
      await screen.findByRole('button', { name: '提修改意见' }),
    ).toBeEnabled();
    expect(
      screen.queryByPlaceholderText('为历史任务留言'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '直接编辑' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '接受' })).toBeEnabled();
    // Feedback is written in the result's card, next to what it is about.
    await user.click(screen.getByRole('button', { name: '提修改意见' }));
    await user.type(
      screen.getByRole('textbox', { name: '提修改意见' }),
      'Keep this result.',
    );
    await user.click(screen.getByRole('button', { name: '发送意见' }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith(
        'nrTaskWork',
        'advance',
        expect.objectContaining({
          body: expect.objectContaining({
            command: 'requestStageChanges',
            comment: 'Keep this result.',
          }),
        }),
      ),
    );
  },
);

// The task's saved Agent was removed after its last run failed, and one other Agent is available (2026-10-17 report:
// "任务 Agent 已失效，请重新选择" with nowhere to choose).
function failedWithRemovedAgent(): TaskData {
  const data = initial();
  data.work.stage = 'flow';
  data.work.flow = {
    id: 'research',
    name: '调研',
    version: 1,
    stages: [{ key: 'analyze', name: '分析', kind: 'agent', mode: 'analyze' }],
  };
  data.work.stageIndex = 0;
  data.work.agentId = 'removed';
  data.work.agentName = 'Old agent';
  data.agent!.agentId = 'removed';
  data.agent!.options = [
    { id: 'codex', name: 'NocoReach Codex', online: true },
  ];
  data.runs = [
    {
      id: 'run',
      status: 'failed',
      planVersion: 0,
      stepId: 'analyze',
      createdAt: new Date().toISOString(),
      error: 'agent_failed',
    },
  ];
  return data;
}

test('a removed task Agent is replaced by the only available one when retrying', async () => {
  const user = userEvent.setup();
  const data = failedWithRemovedAgent();
  const saved = structuredClone(data);
  saved.work.revision = 5;
  saved.work.agentId = 'codex';
  saved.agent!.agentId = 'codex';
  advance.mockResolvedValueOnce(saved).mockResolvedValueOnce(saved);
  mount(data);
  expect(screen.getByText('由 NocoReach Codex 来做')).toBeVisible();
  expect(screen.getByText(/原来选的 Agent 已不可用/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: '再试一次' }));
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrTaskWork',
      'advance',
      expect.objectContaining({
        body: expect.objectContaining({
          command: 'retryStage',
          stageKey: 'analyze',
          revision: 5,
        }),
      }),
    ),
  );
  expect(action).toHaveBeenCalledWith(
    'nrTaskWork',
    'advance',
    expect.objectContaining({
      body: expect.objectContaining({ command: 'setAgent', agentId: 'codex' }),
    }),
  );
});

test('the Agent can be changed even when only one is available', async () => {
  const user = userEvent.setup();
  const data = failedWithRemovedAgent();
  data.work.agentId = 'codex';
  data.agent!.agentId = 'codex';
  mount(data);
  await user.click(screen.getByRole('button', { name: '换一个' }));
  expect(screen.getByRole('combobox', { name: '执行 Agent' })).toBeVisible();
  expect(screen.getByRole('link', { name: '管理 Agent' })).toBeVisible();
});

test('a conflict reloads the task so the page offers what the server holds now', async () => {
  const user = userEvent.setup();
  const data = failedWithRemovedAgent();
  data.work.agentId = 'codex';
  data.agent!.agentId = 'codex';
  data.agent!.options = [
    { id: 'codex', name: 'NocoReach Codex', online: true },
    { id: 'claude', name: 'Research Claude', online: true },
  ];
  const current = structuredClone(data);
  current.work.revision = 6;
  current.agent!.options = [
    { id: 'claude', name: 'Research Claude', online: true },
  ];
  action.mockImplementation((resource: string, command: string) => {
    if (command === 'advance')
      return Promise.reject(
        new NocoReachHttpError('任务 Agent 已失效，请重新选择', 409, {}),
      );
    if (command === 'get') return Promise.resolve(current);
    if (resource === 'nrPlaybooks')
      return Promise.resolve({ playbooks: [playbook] });
    if (command === 'members')
      return Promise.resolve([{ id: '1', name: 'Owner' }]);
    return Promise.resolve([]);
  });
  mount(data);
  await user.click(screen.getByRole('button', { name: '再试一次' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '任务 Agent 已失效，请重新选择',
  );
  // Reloaded: the removed Agent is no longer offered, and the remaining one is used.
  expect(await screen.findByText('由 Research Claude 来做')).toBeVisible();
  expect(screen.getByText(/原来选的 Agent 已不可用/)).toBeVisible();
});

test('a failed run says why in plain words and what to do, from the official reason', () => {
  const data = failedWithRemovedAgent();
  data.work.agentId = 'codex';
  data.agent!.agentId = 'codex';
  data.runs = [
    { ...data.runs[0], id: 'run-2', createdAt: '2026-10-19T08:49:00Z' },
    { ...data.runs[0], id: 'run-1', createdAt: '2026-10-18T08:49:00Z' },
  ];
  data.execution = {
    runId: 'run-2',
    run: { failureReason: 'leaseExpired' },
    events: [],
    truncated: false,
    canInspect: true,
  };
  mount(data);
  expect(screen.getByText(/运行 Agent 的电脑中途断开了连接/)).toBeVisible();
  expect(screen.getByText(/确认那台电脑开着、联网/)).toBeVisible();
  expect(screen.getByText(/已经连续 2 次没做完/)).toBeVisible();
  expect(document.body).not.toHaveTextContent('agent_failed');
  expect(document.body).not.toHaveTextContent('leaseExpired');
});

test("without an official reason, the Agent's own message or a plain fallback is shown", () => {
  const data = failedWithRemovedAgent();
  data.work.agentId = 'codex';
  data.agent!.agentId = 'codex';
  data.runs[0].errorDetail = '仓库里找不到要改的页面';
  data.runs[0].error = 'page_missing';
  const view = mount(data);
  expect(screen.getByText('Agent 说：仓库里找不到要改的页面')).toBeVisible();
  view.unmount();
  data.runs[0].errorDetail = 'agent_failed';
  data.runs[0].error = 'agent_failed';
  mount(data);
  expect(
    screen.getByText('这次运行没有完成，也没有留下具体原因。'),
  ).toBeVisible();
  expect(screen.queryByText(/已经连续/)).toBeNull();
});
