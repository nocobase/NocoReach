import { NavigationGuardProvider } from '@nocobase/app-client';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { TaskDraftProvider } from '../../client/pages/task-detail/drafts';
import { TaskDetail } from '../../client/pages/task-detail';
import type { TaskData } from '../../client/pages/task-execution-types';

// Accept and start (2026-10-24 user report, T-44): accepting an outline with a next playbook starts the new task and
// takes the person to it; the old task names it with where it stands; a new task that could not start says why.
const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/lib/nocoreach-api', async (original) => {
  const module =
    await original<typeof import('../../client/lib/nocoreach-api')>();
  return {
    ...module,
    nocobaseClient: { ...module.nocobaseClient, action, wrapRequests: vi.fn() },
  };
});
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: '1' }, can: () => true }),
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
}));

const PLAYBOOKS = [
  {
    id: 'content-outline',
    name: '内容选题与大纲',
    kind: 'plan',
    category: 'create',
    steps: [
      { key: 'analyze', name: '写大纲', kind: 'analyze' },
      { key: 'accept', name: '审核', kind: 'review' },
    ],
    next: ['blog-post', 'new-doc'],
  },
  {
    id: 'blog-post',
    name: '写博客文章',
    kind: 'build',
    category: 'create',
    steps: [
      { key: 'change', name: '修改', kind: 'change' },
      { key: 'review', name: '审核', kind: 'review' },
    ],
  },
  {
    id: 'new-doc',
    name: '新建文档页',
    kind: 'build',
    category: 'create',
    steps: [
      { key: 'change', name: '修改', kind: 'change' },
      { key: 'review', name: '审核', kind: 'review' },
    ],
  },
];
const STAGES = [
  { key: 'analyze', name: '写大纲', kind: 'agent', mode: 'analyze' },
  { key: 'accept', name: '审核', kind: 'review', checklist: [] },
];
const OUTLINE = {
  id: 'outline-1',
  stepId: 'analyze',
  planVersion: 0,
  version: 1,
  content: '# 给 AI 概览补可引用问答页\n\n- 问题一',
  createdAt: '2026-10-24T02:00:00Z',
  createdBy: 'agent',
};
const NEXT_TITLE = '写博客文章：给 AI 概览补可引用问答页';

// T-43 on Studio: an accepted-outline task waiting at its review, before and after the hand-over.
function outlineTask(done = false): TaskData {
  return {
    task: {
      id: 43,
      title: '给 AI 概览补可引用问答页',
      brief: '',
      evidence: { no: 43 },
    },
    work: {
      revision: 6,
      stage: done ? 'done' : 'flow',
      plan: null,
      planVersion: 0,
      step: 0,
      stageIndex: done ? 2 : 1,
      humanOwnerId: '1',
      humanOwnerName: 'Super Admin',
      playbook: {
        id: 'content-outline',
        name: '内容选题与大纲',
        kind: 'plan',
        version: 3,
        next: ['blog-post', 'new-doc'],
      },
      flow: {
        id: 'content-outline',
        name: '内容选题与大纲',
        version: 3,
        stages: STAGES,
      },
      results: [
        done
          ? {
              ...OUTLINE,
              approvedAt: '2026-10-24T03:00:00Z',
              approvedBy: '1',
            }
          : OUTLINE,
      ],
      history: [],
      ...(done ? { nextTaskId: '44' } : {}),
    },
    runs: [],
    artifacts: [],
    reviews: [],
    related: done
      ? [
          {
            id: 44,
            no: 44,
            title: NEXT_TITLE,
            relation: 'next',
            state: 'doing',
          },
        ]
      : [],
    agent: {
      repo: null,
      online: true,
      agentId: 'codex',
      options: [{ id: 'codex', name: 'Codex' }],
    },
  } as unknown as TaskData;
}

// T-44 as it would wait when nothing could be decided for it: two Agents, no project default, no repository.
function waitingTask(): TaskData {
  return {
    task: {
      id: 44,
      title: NEXT_TITLE,
      brief: '',
      evidence: {
        no: 44,
        handoff: {
          taskId: '43',
          playbook: '内容选题与大纲',
          content: '# 给 AI 概览补可引用问答页',
        },
      },
    },
    work: {
      revision: 0,
      stage: 'plan',
      plan: null,
      planVersion: 0,
      step: 0,
      results: [],
      history: [],
      playbookId: 'new-doc',
      prevTaskId: '43',
      humanOwnerId: '1',
      humanOwnerName: 'Super Admin',
    },
    runs: [],
    artifacts: [],
    reviews: [],
    playbookDefault: 'new-doc',
    related: [
      {
        id: 43,
        no: 43,
        title: '给 AI 概览补可引用问答页',
        relation: 'prev',
        state: 'done',
      },
    ],
    agent: {
      repo: null,
      online: true,
      agentId: null,
      options: [
        { id: 'codex', name: 'Codex' },
        { id: 'claude', name: 'Claude Code' },
      ],
    },
  } as unknown as TaskData;
}

function Where() {
  const at = useLocation();
  return <output data-testid='at'>{at.pathname}</output>;
}
function mount(data: TaskData) {
  return render(
    <MemoryRouter initialEntries={[`/actions/${data.task.id}`]}>
      <NavigationGuardProvider>
        <TaskDraftProvider>
          <TaskDetail
            projectId={1}
            taskId={String(data.task.id)}
            initial={data}
          />
          <Where />
        </TaskDraftProvider>
      </NavigationGuardProvider>
    </MemoryRouter>,
  );
}
const commands: Record<string, unknown>[] = [];
beforeEach(() => {
  setDictionary(null);
  commands.length = 0;
  action.mockReset();
  action.mockImplementation(
    (
      resource: string,
      command: string,
      init?: { body?: Record<string, unknown> },
    ) => {
      if (resource === 'nrPlaybooks')
        return Promise.resolve({ playbooks: PLAYBOOKS });
      if (command === 'members')
        return Promise.resolve([{ id: '1', name: 'Super Admin' }]);
      if (resource === 'nrTaskWork' && command === 'advance') {
        commands.push(init!.body!);
        return Promise.resolve(outlineTask(true));
      }
      return Promise.resolve([]);
    },
  );
});
afterEach(() => cleanup());

test('Accept and start names the next playbook, hands the outline over and lands on the new task', async () => {
  const user = userEvent.setup();
  mount(outlineTask());
  const button = await screen.findByRole('button', {
    name: '接受并开始写博客文章',
  });
  await user.click(button);
  await vi.waitFor(() =>
    expect(screen.getByTestId('at').textContent).toBe('/actions/44'),
  );
  expect(commands).toEqual([
    expect.objectContaining({
      command: 'approveStage',
      stageKey: 'accept',
      artifactId: 'outline-1',
      next: 'blog-post',
    }),
  ]);
});

test('without a next playbook, accepting stays on the task', async () => {
  const user = userEvent.setup();
  mount(outlineTask());
  await user.click(await screen.findByRole('combobox', { name: '接着做' }));
  await user.click(await screen.findByRole('option', { name: '不接着做' }));
  await user.click(screen.getByRole('button', { name: '接受' }));
  await vi.waitFor(() => expect(commands).toHaveLength(1));
  expect(commands[0].next).toBeUndefined();
  expect(screen.getByTestId('at').textContent).toBe('/actions/43');
});

test('the old task names the task it was handed over to, with where it stands, in its card and its properties', async () => {
  const user = userEvent.setup();
  mount(outlineTask(true));
  const card = screen.getByRole('region', { name: '已完成' });
  const line = card.querySelector('[data-handed-over]') as HTMLElement;
  expect(line.textContent).toBe(`已交给 T-44 ${NEXT_TITLE}进行中`);
  const properties = screen.getByRole('complementary', { name: '属性' });
  const chain = within(properties).getByRole('button', {
    name: `下一步：T-44 ${NEXT_TITLE}`,
  });
  expect(chain.parentElement!.textContent).toContain('进行中');
  await user.click(
    within(line).getByRole('button', { name: `T-44 ${NEXT_TITLE}` }),
  );
  expect(screen.getByTestId('at').textContent).toBe('/actions/44');
});

test('a handed-over task that could not start says so, and marks the Agent and repository it is missing', async () => {
  mount(waitingTask());
  const card = screen.getByRole('region', { name: '等你处理' });
  expect(
    await within(card).findByText(
      '这个任务由“内容选题与大纲”交接而来，它交付的文档就是任务说明。下面有需要你先确定的内容，所以没有自动开始。',
    ),
  ).toBeVisible();
  expect(within(card).getByText('请先为任务选择 Agent。')).toBeVisible();
  const repo = card.querySelector(
    '[data-start-blocker="noRepository"]',
  ) as HTMLElement;
  expect(repo.textContent).toContain('还没有接入网站源码仓库');
  expect(
    within(repo).getByRole('button', { name: '去数据接入' }),
  ).toBeVisible();
  expect(
    within(card).getByRole('button', { name: '确定开始执行' }),
  ).toBeDisabled();
});

test('a handed-over task with nothing missing keeps the usual hand-over line', async () => {
  const data = waitingTask();
  data.agent = {
    repo: { repo: 'org/site', baseBranch: 'main' },
    online: true,
    agentId: 'codex',
    options: [{ id: 'codex', name: 'Codex' }],
  };
  mount(data);
  const card = screen.getByRole('region', { name: '等你处理' });
  expect(
    await within(card).findByText(
      '这个任务由“内容选题与大纲”交接而来，它交付的文档就是任务说明。Agent 尚未开始，请先阅读再开始。',
    ),
  ).toBeVisible();
  expect(card.querySelector('[data-start-blocker]')).toBeNull();
  expect(
    within(card).getByRole('button', { name: '确定开始执行' }),
  ).toBeEnabled();
});
