import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Routes,
  Route,
  Link,
  useNavigate,
  useParams,
} from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { WorkspaceCacheProvider } from '../../client/pages/workspace-cache';
import {
  TaskDraftScope,
  useTaskDraft,
  TaskDraftProvider,
} from '../../client/pages/task-detail/drafts';
import { TaskDetail } from '../../client/pages/task-detail';
import type { TaskData } from '../../client/pages/task-execution-types';
import type { Playbook } from '../../client/pages/playbook-model';

const { action, advance, access, identity } = vi.hoisted(() => ({
  action: vi.fn(),
  advance: vi.fn(),
  access: { allowed: true },
  identity: { user: 'user-1', session: 'session-1', revision: 1 },
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => {
  const module =
    await original<typeof import('../../client/lib/nocoreach-api')>();
  return {
    ...module,
    nocobaseClient: { ...module.nocobaseClient, action, wrapRequests: vi.fn() },
  };
});
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    isPending: false,
    session: { user: { id: identity.user }, session: { id: identity.session } },
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => identity.revision,
}));
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

function reviewData(): TaskData {
  const data = initial();
  data.task.evidence = { insight: { id: 'opportunity-1', no: 1 } };
  data.related = [{ id: '2', title: 'Next task', relation: 'next' }];
  data.work.flow = {
    id: 'research',
    name: 'Research',
    stages: [
      { key: 'write', name: 'Write', kind: 'agent', instruction: 'Write' },
      { key: 'review', name: 'Review', kind: 'review', instruction: 'Review' },
    ],
  };
  data.work.stageIndex = 1;
  data.work.results = [
    {
      id: 'artifact-1',
      content: 'Original text',
      version: 1,
      createdAt: '2026-10-13T00:00:00Z',
    },
  ];
  return data;
}
function mount(data = reviewData()) {
  function TaskRoute() {
    const { id } = useParams();
    return <TaskDetail projectId={1} taskId={id!} initial={data} />;
  }
  function Navigation() {
    const navigate = useNavigate();
    return (
      <>
        <Link to='/elsewhere'>Sidebar</Link>
        <button onClick={() => navigate(-1)}>Back</button>
        <button onClick={() => navigate(1)}>Forward</button>
        <Link to='/actions/1'>Return</Link>
      </>
    );
  }
  return render(
    <MemoryRouter initialEntries={['/actions/1']}>
      <TaskDraftProvider>
        <Navigation />
        <Routes>
          <Route path='/actions/:id' element={<TaskRoute />} />
          <Route path='*' element={<p>Other page</p>} />
        </Routes>
      </TaskDraftProvider>
    </MemoryRouter>,
  );
}
function unload() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
async function editBoth() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '直接编辑' }));
  await user.clear(screen.getByRole('textbox', { name: '编辑内容' }));
  await user.type(
    screen.getByRole('textbox', { name: '编辑内容' }),
    'Draft body',
  );
  await user.type(
    screen.getByRole('textbox', { name: '给执行者的话' }),
    'Draft comment',
  );
  return user;
}
test.each(['source', 'related', 'sidebar', 'breadcrumb', 'back-forward'])(
  'retains both editors across %s navigation',
  async (kind) => {
    mount();
    const user = await editBoth();
    if (kind === 'source')
      await user.click(screen.getByRole('button', { name: /来自/ }));
    if (kind === 'related')
      await user.click(screen.getByRole('button', { name: /Next task/ }));
    if (kind === 'sidebar' || kind === 'back-forward')
      await user.click(screen.getByRole('link', { name: 'Sidebar' }));
    if (kind === 'breadcrumb')
      await user.click(
        screen.getByRole('button', { name: '任务', exact: true }),
      );
    expect(unload()).toBe(true);
    if (kind === 'related')
      expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
        '',
      );
    await user.click(screen.getByRole('button', { name: 'Back', exact: true }));
    expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
      'Draft body',
    );
    expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
      'Draft comment',
    );
    if (kind === 'back-forward') {
      await user.click(
        screen.getByRole('button', { name: 'Forward', exact: true }),
      );
      expect(screen.queryByRole('textbox', { name: '编辑内容' })).toBeNull();
      await user.click(
        screen.getByRole('button', { name: 'Back', exact: true }),
      );
      expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
        'Draft body',
      );
    }
  },
);
test('clearing and cancelling one editor preserves the other; discard clears all', async () => {
  mount();
  const user = await editBoth();
  await user.clear(screen.getByRole('textbox', { name: '给执行者的话' }));
  expect(unload()).toBe(true);
  await user.type(
    screen.getByRole('textbox', { name: '给执行者的话' }),
    'Comment remains',
  );
  await user.click(screen.getByRole('button', { name: '取消', exact: true }));
  expect(unload()).toBe(true);
  expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
    'Comment remains',
  );
  await user.click(screen.getByRole('button', { name: '丢弃任务草稿' }));
  expect(unload()).toBe(false);
  expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue('');
});
test('unrelated successful commands and failed saves preserve drafts; successful output save preserves comment', async () => {
  const data = reviewData();
  mount(data);
  const user = await editBoth();
  advance.mockResolvedValue({ ...data, work: { ...data.work, revision: 5 } });
  await user.selectOptions(
    screen.getByRole('combobox', { name: '负责人' }),
    '1',
  );
  expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
    'Draft body',
  );
  expect(unload()).toBe(true);
  advance.mockRejectedValueOnce(new Error('Save failed'));
  await user.click(screen.getByRole('button', { name: '保存修改' }));
  await screen.findByText('Save failed');
  expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
    'Draft body',
  );
  advance.mockResolvedValue({
    ...data,
    work: {
      ...data.work,
      revision: 6,
      results: [{ ...data.work.results[0]!, content: 'Draft body' }],
    },
  });
  await user.click(screen.getByRole('button', { name: '保存修改' }));
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: '编辑内容' })).toBeNull(),
  );
  expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
    'Draft comment',
  );
  expect(unload()).toBe(true);
  await user.clear(screen.getByRole('textbox', { name: '给执行者的话' }));
  expect(unload()).toBe(false);
});
test('clean browsing and opening an unchanged editor do not warn', async () => {
  mount();
  expect(unload()).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: '直接编辑' }));
  expect(unload()).toBe(false);
});

test('sending a comment clears only that editor', async () => {
  const data = reviewData();
  mount(data);
  const user = await editBoth();
  advance.mockResolvedValue({ ...data, work: { ...data.work, revision: 5 } });
  await user.click(screen.getByRole('button', { name: '发送并要求修改' }));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
      '',
    ),
  );
  expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
    'Draft body',
  );
  expect(unload()).toBe(true);
});

function DraftInput({
  project = 1,
  task = '1',
}: {
  project?: number;
  task?: string;
}) {
  return (
    <TaskDraftScope scope={`${project}:${task}`}>
      <DraftField />
    </TaskDraftScope>
  );
}
function DraftField() {
  const [value, setValue] = useTaskDraft('comment', '');
  return (
    <input
      aria-label='Isolated draft'
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}
test.each(['user', 'session', 'revision'] as const)(
  'drops drafts when authenticated %s changes',
  async (key) => {
    const view = render(
      <WorkspaceCacheProvider>
        <DraftInput />
      </WorkspaceCacheProvider>,
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Isolated draft' }),
      'Private draft',
    );
    expect(unload()).toBe(true);
    if (key === 'revision') identity.revision += 1;
    else identity[key] += '-new';
    view.rerender(
      <WorkspaceCacheProvider>
        <DraftInput />
      </WorkspaceCacheProvider>,
    );
    expect(screen.getByRole('textbox', { name: 'Isolated draft' })).toHaveValue(
      '',
    );
    expect(unload()).toBe(false);
  },
);
test('isolates identical task ids across projects and restores the original draft', async () => {
  const view = render(
    <TaskDraftProvider>
      <DraftInput />
    </TaskDraftProvider>,
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Isolated draft' }),
    'Project one',
  );
  view.rerender(
    <TaskDraftProvider>
      <DraftInput project={2} />
    </TaskDraftProvider>,
  );
  expect(screen.getByRole('textbox', { name: 'Isolated draft' })).toHaveValue(
    '',
  );
  view.rerender(
    <TaskDraftProvider>
      <DraftInput />
    </TaskDraftProvider>,
  );
  expect(screen.getByRole('textbox', { name: 'Isolated draft' })).toHaveValue(
    'Project one',
  );
});

test('a save finishing after navigation does not erase a newer comment draft', async () => {
  const data = reviewData();
  let finish!: (value: TaskData) => void;
  advance.mockReturnValue(
    new Promise<TaskData>((resolve) => {
      finish = resolve;
    }),
  );
  mount(data);
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('textbox', { name: '给执行者的话' }),
    'Submitted comment',
  );
  await user.click(screen.getByRole('button', { name: '发送并要求修改' }));
  await user.click(screen.getByRole('link', { name: 'Sidebar' }));
  await user.click(screen.getByRole('button', { name: 'Back', exact: true }));
  await user.type(
    screen.getByRole('textbox', { name: '给执行者的话' }),
    ' plus newer text',
  );
  finish(data);
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
      'Submitted comment plus newer text',
    ),
  );
  expect(unload()).toBe(true);
});
