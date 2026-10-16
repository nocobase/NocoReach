import { NavigationGuardProvider } from '@nocobase/app-client';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Routes,
  Route,
  Link,
  useNavigate,
  useParams,
  Outlet,
} from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import locales from '../../client/locales';
import { AppBrand } from '../../client/layouts/components/app-brand';
import Home from '../../client/pages/home';
import { WorkspaceCacheProvider } from '../../client/pages/workspace-cache';
import {
  TaskDraftScope,
  TaskDraftProvider,
  TaskDraftNavigationGuard,
} from '../../client/pages/task-detail/drafts';
import { useTaskDraft } from '../../client/pages/task-detail/draft-store';
import { TaskDetail } from '../../client/pages/task-detail';
import TaskPage from '../../client/pages/task-work';
import type { TaskData } from '../../client/pages/task-execution-types';
import type { Playbook } from '../../client/pages/playbook-model';

const { action, advance, access, identity, backend } = vi.hoisted(() => ({
  action: vi.fn(),
  advance: vi.fn(),
  access: { allowed: true },
  identity: { user: 'user-1', session: 'session-1', revision: 1 },
  backend: { data: null as TaskData | null },
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
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1 }, error: '' }),
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
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  backend.data = null;
  setDictionary(null);
  action.mockReset();
  advance.mockReset();
  action.mockImplementation((resource: string, command: string) => {
    if (command === 'advance') return advance();
    if (command === 'get') return Promise.resolve(backend.data);
    if (resource === 'nrPlaybooks')
      return Promise.resolve({ playbooks: [playbook] });
    if (command === 'members')
      return Promise.resolve([{ id: '1', name: 'Owner' }]);
    return Promise.resolve([]);
  });
});
afterEach(() => {
  const dialog = screen.queryByRole('alertdialog');
  if (dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  cleanup();
  vi.restoreAllMocks();
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
function mount(data = reviewData(), production = false, entry = '/actions/1') {
  backend.data = data;
  function TaskRoute() {
    const { taskId } = useParams();
    return <TaskDetail projectId={1} taskId={taskId!} initial={data} />;
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
    <MemoryRouter initialEntries={['/prior', entry]}>
      <NavigationGuardProvider>
        <TaskDraftProvider>
          <TaskDraftNavigationGuard />
          <Navigation />
          <Routes>
            <Route
              path='/actions/:taskId'
              element={production ? <TaskPage /> : <TaskRoute />}
            />
            <Route path='*' element={<p>Other page</p>} />
          </Routes>
        </TaskDraftProvider>
      </NavigationGuardProvider>
    </MemoryRouter>,
  );
}
function unload() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
async function discardDrafts(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '丢弃任务草稿' }));
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: '丢弃任务草稿',
    }),
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
}
async function editBoth() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '直接编辑' }));
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
test('Results return preserves its filters and retains both task drafts', async () => {
  mount(
    reviewData(),
    false,
    '/actions/1?resultDay=28&resultQuery=%3Fday%3D28%26status%3Dcompleted',
  );
  const user = await editBoth();
  const link = screen.getByRole('link', { name: '成果', exact: true });
  expect(link).toHaveAttribute('href', '/results/1?day=28&status=completed');
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  await user.click(link);
  expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
    'Draft body',
  );
  await user.click(link);
  expect(screen.getByText('Other page')).toBeInTheDocument();
  expect(unload()).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Back', exact: true }));
  expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
    'Draft body',
  );
  expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
    'Draft comment',
  );
});

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
  await discardDrafts(user);
  expect(unload()).toBe(false);
  expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue('');
});
test('cancelling task draft deletion preserves both editors and unload protection', async () => {
  mount();
  const user = await editBoth();
  await user.click(screen.getByRole('button', { name: '丢弃任务草稿' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog).toHaveTextContent('丢弃任务“选择任务 Agent”的草稿？');
  expect(dialog).toHaveTextContent('丢弃后无法恢复这些文本');
  expect(unload()).toBe(true);
  await user.click(within(dialog).getByRole('button', { name: '取消' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
    'Draft body',
  );
  expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
    'Draft comment',
  );
  expect(unload()).toBe(true);
  await discardDrafts(user);
  expect(screen.queryByRole('textbox', { name: '编辑内容' })).toBeNull();
  expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue('');
  expect(unload()).toBe(false);
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
test('a late save from the old session cannot clear the new session draft', async () => {
  const pending = Promise.withResolvers<void>();
  function DeferredDraft() {
    const [value, setValue, clear] = useTaskDraft('comment', '');
    return (
      <>
        <input
          aria-label='Session draft'
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button
          onClick={() => {
            void pending.promise.then(clear);
          }}
        >
          Save draft
        </button>
      </>
    );
  }
  const content = (
    <WorkspaceCacheProvider>
      <DeferredDraft />
    </WorkspaceCacheProvider>
  );
  const view = render(content);
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Session draft' }),
    'Old session text',
  );
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  identity.session += '-replaced';
  view.rerender(
    <WorkspaceCacheProvider>
      <DeferredDraft />
    </WorkspaceCacheProvider>,
  );
  expect(screen.getByRole('textbox', { name: 'Session draft' })).toHaveValue(
    '',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Session draft' }),
    'New session text',
  );
  await act(async () => pending.resolve());
  expect(screen.getByRole('textbox', { name: 'Session draft' })).toHaveValue(
    'New session text',
  );
  expect(unload()).toBe(true);
  view.unmount();
  expect(unload()).toBe(false);
});

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

test.each(['output', 'comment'])(
  'keeps a pending %s save mounted across links and history',
  async (kind) => {
    const data = reviewData();
    const pending = Promise.withResolvers<TaskData>();
    advance.mockReturnValue(pending.promise);
    mount(data, true);
    const user = await editBoth();
    await user.click(
      screen.getByRole('button', {
        name: kind === 'output' ? '保存修改' : '发送并要求修改',
      }),
    );
    await user.click(screen.getByRole('link', { name: 'Sidebar' }));
    expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
      'Draft body',
    );
    await user.click(screen.getByRole('button', { name: 'Back', exact: true }));
    expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
      'Draft body',
    );
    expect(
      action.mock.calls.filter(([, command]) => command === 'get'),
    ).toHaveLength(1);
    const saved = {
      ...data,
      work: {
        ...data.work,
        revision: 5,
        results:
          kind === 'output'
            ? [
                {
                  ...data.work.results[0]!,
                  id: 'artifact-2',
                  content: 'Draft body',
                },
              ]
            : data.work.results,
      },
    };
    await act(async () => {
      pending.resolve(saved);
    });
    if (kind === 'output') {
      await waitFor(() =>
        expect(screen.queryByRole('textbox', { name: '编辑内容' })).toBeNull(),
      );
      await user.click(screen.getByRole('button', { name: '直接编辑' }));
      expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
        'Draft body',
      );
      advance.mockResolvedValue(saved);
      await user.click(screen.getByRole('button', { name: '保存修改' }));
      expect(
        action.mock.calls.filter(([, command]) => command === 'advance').at(-1),
      ).toEqual([
        'nrTaskWork',
        'advance',
        expect.objectContaining({
          body: expect.objectContaining({
            revision: 5,
            artifactId: 'artifact-2',
            content: 'Draft body',
          }),
        }),
      ]);
      expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
        'Draft comment',
      );
    } else {
      expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
        '',
      );
      expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
        'Draft body',
      );
    }
    expect(unload()).toBe(true);
  },
);

test('restores an earlier artifact draft for comparison without rebinding it to new output', async () => {
  const data = reviewData();
  mount(data, true);
  const user = await editBoth();
  await user.click(screen.getByRole('link', { name: 'Sidebar' }));
  const current = {
    ...data,
    work: {
      ...data.work,
      revision: 5,
      results: [
        {
          ...data.work.results[0]!,
          id: 'artifact-2',
          content: 'Collaborator saved text',
        },
      ],
    },
  };
  backend.data = current;
  await user.click(screen.getByRole('button', { name: 'Back', exact: true }));
  const earlier = await screen.findByRole('textbox', {
    name: '早前未提交的文本 1',
  });
  expect(earlier).toHaveValue('Draft body');
  expect(earlier).toHaveAttribute('readonly');
  expect(screen.queryByRole('textbox', { name: '编辑内容' })).toBeNull();
  await user.click(screen.getByRole('button', { name: '直接编辑' }));
  expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
    'Collaborator saved text',
  );
  advance.mockResolvedValue(current);
  await user.click(screen.getByRole('button', { name: '保存修改' }));
  expect(
    action.mock.calls.filter(([, command]) => command === 'advance').at(-1),
  ).toEqual([
    'nrTaskWork',
    'advance',
    expect.objectContaining({
      body: expect.objectContaining({
        revision: 5,
        artifactId: 'artifact-2',
        content: 'Collaborator saved text',
      }),
    }),
  ]);
  expect(earlier).toHaveValue('Draft body');
  await user.click(screen.getByRole('button', { name: '丢弃这份草稿' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog).toHaveTextContent('丢弃早前未提交的文本 1？');
  await user.click(within(dialog).getByRole('button', { name: '取消' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(earlier).toHaveValue('Draft body');
  expect(unload()).toBe(true);
  await user.click(screen.getByRole('button', { name: '丢弃这份草稿' }));
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: '丢弃这份草稿',
    }),
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(
    screen.queryByRole('textbox', { name: '早前未提交的文本 1' }),
  ).toBeNull();
  expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
    'Draft comment',
  );
  expect(unload()).toBe(true);
});

test('keeps an unsent comment readable after accepting the final stage', async () => {
  const data = reviewData();
  mount(data);
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('textbox', { name: '给执行者的话' }),
    'Keep this note',
  );
  advance.mockResolvedValue({
    ...data,
    work: { ...data.work, revision: 5, stage: 'done' },
  });
  await user.click(screen.getByRole('button', { name: '接受', exact: true }));
  const note = screen.getByRole('textbox', { name: '给执行者的话' });
  expect(note).toHaveValue('Keep this note');
  expect(note).toHaveAttribute('readonly');
  expect(screen.queryByRole('button', { name: '发送并要求修改' })).toBeNull();
  expect(unload()).toBe(true);
  await discardDrafts(user);
  expect(screen.queryByRole('textbox', { name: '给执行者的话' })).toBeNull();
  expect(unload()).toBe(false);
});

test.each([false, true])(
  'publishing saves the retained release note without clearing the comment (simulated: %s)',
  async (simulated) => {
    const config = document.getElementById('nocobase-runtime-config')!;
    const originalConfig = config.textContent;
    config.textContent = JSON.stringify({
      version: 1,
      config: {},
      public: { nocoreachMock: { enabled: simulated, environment: 'demo' } },
    });
    try {
      const data = reviewData();
      data.work.stage = 'flow';
      data.work.flow!.stages.push({
        key: 'release',
        name: 'Release',
        kind: 'release',
      });
      mount(data);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: '发布说明' }));
      await user.type(
        screen.getByRole('textbox', { name: '发布说明' }),
        'Release draft',
      );
      await user.type(
        screen.getByRole('textbox', { name: '给执行者的话' }),
        'Keep this comment',
      );
      await user.click(screen.getByRole('link', { name: 'Sidebar' }));
      await user.click(
        screen.getByRole('button', { name: 'Back', exact: true }),
      );
      expect(screen.getByRole('textbox', { name: '发布说明' })).toHaveValue(
        'Release draft',
      );
      advance.mockResolvedValue({
        ...data,
        work: {
          ...data.work,
          revision: 5,
          stageIndex: 2,
          stage: simulated ? 'done' : 'flow',
          release: {
            state: simulated ? 'simulated' : 'not_seen',
            reason: 'manual',
            note: 'Release draft',
            pages: [],
          },
        },
      });
      await user.click(
        screen.getByRole('button', {
          name: simulated ? '模拟发布' : '发布',
          exact: true,
        }),
      );
      expect(
        action.mock.calls.filter(([, command]) => command === 'advance').at(-1),
      ).toEqual([
        'nrTaskWork',
        'advance',
        expect.objectContaining({
          body: expect.objectContaining({
            command: 'approveStage',
            artifactId: 'artifact-1',
            release: { note: 'Release draft' },
          }),
        }),
      ]);
      expect(screen.queryByRole('textbox', { name: '发布说明' })).toBeNull();
      expect(
        screen.queryByRole('textbox', { name: /早前未提交的文本/ }),
      ).toBeNull();
      expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
        'Keep this comment',
      );
      expect(unload()).toBe(true);
      await discardDrafts(user);
      expect(unload()).toBe(false);
    } finally {
      config.textContent = originalConfig;
    }
  },
);

test('cancelling a navigation preserves both editors and explicit discard removes the prompt', async () => {
  mount();
  const user = await editBoth();
  vi.mocked(window.confirm).mockReturnValue(false);
  await user.click(screen.getByRole('link', { name: 'Sidebar' }));
  expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
    'Draft body',
  );
  expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
    'Draft comment',
  );
  expect(window.confirm).toHaveBeenCalledOnce();
  await discardDrafts(user);
  await user.click(screen.getByRole('link', { name: 'Sidebar' }));
  await screen.findByText('Other page');
  expect(window.confirm).toHaveBeenCalledOnce();
});

test('brand navigation reaches the landing page with one confirmation and retains both drafts', async () => {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={['/actions/1']}>
        <NavigationGuardProvider>
          <TaskDraftProvider>
            <TaskDraftNavigationGuard />
            <AppBrand />
            <Link to='/actions/1'>Return to task</Link>
            <Routes>
              <Route path='/' element={<Home />} />
              <Route path='/home' element={<h1>Insights landing</h1>} />
              <Route
                path='/actions/1'
                element={
                  <TaskDetail projectId={1} taskId='1' initial={reviewData()} />
                }
              />
            </Routes>
          </TaskDraftProvider>
        </NavigationGuardProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
  const user = await editBoth();
  // A second confirmation must not strand the user on the root redirect.
  vi.mocked(window.confirm).mockReturnValue(false).mockReturnValueOnce(true);
  await user.click(screen.getByRole('link', { name: 'NocoReach home' }));
  expect(
    await screen.findByRole('heading', { name: 'Insights landing' }),
  ).toBeVisible();
  expect(window.confirm).toHaveBeenCalledOnce();
  vi.mocked(window.confirm).mockReturnValue(true);
  await user.click(screen.getByRole('link', { name: 'Return to task' }));
  expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
    'Draft body',
  );
  expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
    'Draft comment',
  );
});

test('protects drafts when history leaves the authenticated workspace after leaving the task', async () => {
  function Navigation() {
    const navigate = useNavigate();
    return (
      <>
        <button onClick={() => navigate(-1)}>Back</button>
        <Link to='/elsewhere'>Sidebar</Link>
        <Link to='/actions/1'>Task</Link>
        <Link to='/forgot-password'>Outside workspace</Link>
      </>
    );
  }
  function Workspace() {
    return (
      <TaskDraftProvider>
        <TaskDraftNavigationGuard />
        <Navigation />
        <Outlet />
      </TaskDraftProvider>
    );
  }
  render(
    <MemoryRouter initialEntries={['/forgot-password', '/actions/1']}>
      <NavigationGuardProvider>
        <Routes>
          <Route path='/forgot-password' element={<p>Guest page</p>} />
          <Route element={<Workspace />}>
            <Route
              path='/actions/1'
              element={
                <TaskDetail projectId={1} taskId='1' initial={reviewData()} />
              }
            />
            <Route path='/elsewhere' element={<p>Other workspace page</p>} />
          </Route>
        </Routes>
      </NavigationGuardProvider>
    </MemoryRouter>,
  );
  const user = await editBoth();
  await user.click(screen.getByRole('link', { name: 'Sidebar' }));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  vi.mocked(window.confirm).mockReturnValue(false);
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.queryByText('Guest page')).toBeNull();
  expect(screen.getByRole('textbox', { name: '编辑内容' })).toHaveValue(
    'Draft body',
  );
  expect(screen.getByRole('textbox', { name: '给执行者的话' })).toHaveValue(
    'Draft comment',
  );
  vi.mocked(window.confirm).mockReturnValue(true);
  await user.click(screen.getByRole('link', { name: 'Outside workspace' }));
  await screen.findByText('Guest page');
  expect(unload()).toBe(false);
});

test('renders task material citations as text and webpage citations as links', async () => {
  const data = reviewData();
  data.work.results[0]!.report = {
    kind: 'research',
    asOf: '2026-10-16',
    uncertainties: [],
    sources: [
      { title: '项目知识快照', material: 'knowledge' },
      { title: '公开来源', url: 'https://example.com/source' },
    ],
  };
  mount(data);
  expect(await screen.findByText(/项目知识快照 · 任务材料/)).toBeTruthy();
  expect(screen.queryByRole('link', { name: /项目知识快照/ })).toBeNull();
  expect(
    screen.getByRole('link', { name: '公开来源' }).getAttribute('href'),
  ).toBe('https://example.com/source');
});

test('revalidates a failed research result without requesting another agent run', async () => {
  advance.mockResolvedValue(reviewData());
  const data = reviewData();
  data.work.stageIndex = 0;
  data.work.results = [];
  data.work.flow!.stages[0].mode = 'analyze';
  data.runs = [
    {
      id: 'failed-run',
      status: 'failed',
      mode: 'plan',
      error: 'invalid_agent_result',
      stepId: 'write',
      planVersion: 0,
      createdAt: '2026-10-16T08:00:00Z',
    },
  ];
  mount(data);
  await userEvent.click(
    await screen.findByRole('button', { name: '重新校验成果' }),
  );
  expect(action).toHaveBeenCalledWith(
    'nrTaskWork',
    'advance',
    expect.objectContaining({
      body: expect.objectContaining({
        command: 'recoverResult',
        runId: 'failed-run',
        stageKey: 'write',
      }),
    }),
  );
});

test('does not offer result recovery for repository changes', async () => {
  const data = reviewData();
  data.work.stageIndex = 0;
  data.work.results = [];
  data.runs = [
    {
      id: 'build-run',
      status: 'failed',
      mode: 'build',
      error: 'invalid_agent_result',
      stepId: 'write',
      planVersion: 0,
      createdAt: '2026-10-16T08:00:00Z',
    },
  ];
  mount(data);
  expect(screen.queryByRole('button', { name: '重新校验成果' })).toBeNull();
});
