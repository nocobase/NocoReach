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
    screen.getByRole('option', { name: 'NocoReach Codex · Runner Agent' }),
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
  expect(
    screen.getByRole('combobox', { name: '执行 Agent' }),
  ).toHaveTextContent('NocoReach Codex');
  expect(screen.getByRole('status')).toHaveTextContent('执行 Agent 已保存');
});

test('failed reassignment retains the saved agent and shows the server error', async () => {
  const user = userEvent.setup();
  const data = initial();
  data.work.agentId = 'codex';
  data.agent!.agentId = 'codex';
  mount(data);
  await screen.findByRole('option', { name: /调研/ });
  advance.mockRejectedValueOnce(new Error('任务已更新，请刷新后再保存'));
  // A selected popup can reopen under the pointer in jsdom; use its keyboard interaction.
  screen.getByRole('combobox', { name: '执行 Agent' }).focus();
  await user.keyboard('[ArrowDown]');
  await user.click(
    await screen.findByRole('option', {
      name: 'Research Claude · Runner Agent',
    }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('任务已更新');
  expect(
    screen.getByRole('combobox', { name: '执行 Agent' }),
  ).toHaveTextContent('NocoReach Codex');
});

test.each(['queued', 'running'])(
  'started tasks show the assigned agent in properties and block reassignment while %s',
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
        executorId: 'runner-agent',
        executorKind: 'runner',
        createdAt: new Date().toISOString(),
        agentId: 'codex',
        agentName: 'NocoReach Codex',
      },
    ];
    mount(data);
    expect(screen.getByRole('combobox', { name: '执行 Agent' })).toBeDisabled();
    expect(
      screen.getByText('任务正在排队或执行，结束后再更换 Agent'),
    ).toBeVisible();
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
      'No team-accessible runner agents. Create one or contact an administrator.',
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
          ? 'The demo does not merge the PR or publish changes to the live site.'
          : '演示环境不会合并 PR 或发布线上修改。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '撤回当前修改' }),
    ).not.toBeInTheDocument();
  },
);
