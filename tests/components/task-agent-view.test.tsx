import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  $t,
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import OptimizationWork from '../../client/pages/optimization-work';
import {
  placeOf,
  runCounts,
  taskAgentOf,
  type AgentStatus,
} from '../../client/pages/task-agents';
import type { Work } from '../../client/pages/task-execution-types';

const fixture = vi.hoisted(() => ({
  tasks: [] as unknown[],
  status: {} as AgentStatus,
  action: vi.fn(),
}));
vi.mock('../../client/pages/me', async (original) => ({
  ...(await original<typeof import('../../client/pages/me')>()),
  useMe: () => ({
    me: { id: 'me' },
    isAdmin: true,
    can: () => true,
    mine: (owner?: string | null) => (owner ? owner === 'me' : true),
  }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 7, name: 'Fixture' } }),
  taskRecords: async () => fixture.tasks,
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { wrapRequests: () => {}, action: fixture.action },
  resolvePortalUrl: (p: string) => p,
  getPortalBase: () => '/',
}));
vi.mock('@nocobase/app-plugin-agents/client/kit', () => ({
  useRunnerOptions: () => ({ options: [], loading: false, online: 2 }),
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
}));

const flow = {
  id: 'optimize-page',
  name: '优化现有页面',
  version: 1,
  stages: [
    { key: 'change', name: '修改', kind: 'agent', mode: 'change' },
    { key: 'review', name: '看效果并发布', kind: 'review' },
    { key: 'release', name: '上线', kind: 'release' },
    { key: 'observe', name: '观察', kind: 'observe' },
  ],
};
function work(patch: Partial<Work> = {}): Work {
  return {
    revision: 1,
    stage: 'flow',
    plan: null,
    planVersion: 0,
    step: 0,
    results: [],
    history: [],
    stageIndex: 0,
    flow,
    humanOwnerId: 'me',
    humanOwnerName: 'Super Admin',
    ...patch,
  } as Work;
}
const task = (no: number, w: Work | undefined, updatedAt = '2026-10-20') => ({
  id: no,
  title: `Task ${no}`,
  brief: '',
  status: 'open',
  updatedAt,
  evidence: { no, work: w },
});
// Studio's Agents: Codex is the project default and online, Claude is online, Fable has no runtime online.
const STATUS: AgentStatus = {
  revision: 3,
  agentId: 'codex',
  defaultAgentId: 'codex',
  options: [
    { id: 'claude', name: 'Claude Code · Opus', online: true, busy: 0 },
    { id: 'codex', name: 'Codex · GPT-6 Astra', online: true, busy: 1 },
    { id: 'fable', name: 'Claude · Fable 5.1', online: false, busy: 0 },
  ],
};

let disconnect: (() => void) | undefined;
beforeEach(() => {
  fixture.status = STATUS;
  fixture.action.mockReset();
  fixture.action.mockImplementation(async (resource: string) =>
    resource === 'nrAgent' ? fixture.status : [],
  );
});
afterEach(() => {
  cleanup();
  disconnect?.();
  disconnect = undefined;
  setDictionary(null);
  localStorage.clear();
});
async function mount(entry: string, locale: 'zh-CN' | 'en-US' = 'zh-CN') {
  const runtime = new I18nRuntime({
    defaultLocale: locale,
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  function Page() {
    useNocoReachLocale();
    const location = useLocation();
    return (
      <>
        <output data-testid='url'>
          {location.pathname}
          {location.search}
        </output>
        <OptimizationWork />
      </>
    );
  }
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={[entry]}>
        <Page />
      </MemoryRouter>
    </I18nProvider>,
  );
  await waitFor(() =>
    expect(
      screen.queryByText($t('common.loadingTasks')),
    ).not.toBeInTheDocument(),
  );
}

test('a task runs with its own Agent, else the project default, else the only one; none is Unassigned', () => {
  expect(taskAgentOf(work({ agentId: 'claude' }), STATUS)?.name).toBe(
    'Claude Code · Opus',
  );
  expect(taskAgentOf(work(), STATUS)?.name).toBe('Codex · GPT-6 Astra');
  const one = { options: [STATUS.options![2]] };
  expect(taskAgentOf(work(), one)).toMatchObject({
    name: 'Claude · Fable 5.1',
    online: false,
  });
  // Its own Agent was removed and several remain: nothing to guess from.
  expect(taskAgentOf(work({ agentId: 'gone' }), STATUS)).toBeNull();
  expect(taskAgentOf(work(), { options: STATUS.options })).toBeNull();
});

test('places a task as running, next in line or waiting for a person, and leaves out the rest', () => {
  expect(placeOf(undefined, true)).toMatchObject({
    lane: 'waiting',
    ask: { text: '确认开始' },
  });
  expect(placeOf(undefined, false)?.ask?.text).toBe('选 Agent 并开始');
  expect(
    placeOf(work({ latestRun: { id: 'r', status: 'running' } }), true)?.lane,
  ).toBe('running');
  expect(
    placeOf(work({ latestRun: { id: 'r', status: 'queued' } }), true)?.lane,
  ).toBe('queued');
  expect(
    placeOf(work({ latestRun: { id: 'r', status: 'failed' } }), true),
  ).toMatchObject({ lane: 'waiting', ask: { text: '运行失败', tone: 'red' } });
  expect(placeOf(work({ stageIndex: 1 }), true)?.ask?.text).toBe(
    '看效果并发布',
  );
  expect(
    placeOf(
      work({
        stageIndex: 2,
        release: { state: 'not_seen' } as Work['release'],
      }),
      true,
    )?.ask?.text,
  ).toBe('确认是否上线');
  for (const w of [
    work({ stageIndex: 2, release: { state: 'verifying' } as Work['release'] }),
    work({ stageIndex: 3 }),
    work({ stage: 'done' }),
    work({ archivedAt: '2026-10-20' }),
  ])
    expect(placeOf(w, true)).toBeNull();
  expect(
    runCounts([
      work({ latestRun: { id: 'a', status: 'running' } }),
      work({ latestRun: { id: 'b', status: 'queued' } }),
      work({ latestRun: { id: 'c', status: 'failed' } }),
      work({ latestRun: { id: 'd', status: 'failed' }, cancelledAt: 'x' }),
    ]),
  ).toEqual({ running: 1, queued: 1, failed: 1 });
});

function studioTasks() {
  return [
    task(38, work({ latestRun: { id: 'r1', status: 'running' } })),
    task(40, work({ latestRun: { id: 'r2', status: 'queued' } }), '2026-10-19'),
    task(52, work({ latestRun: { id: 'r3', status: 'queued' } }), '2026-10-18'),
    task(
      41,
      work({ stageIndex: 1, humanOwnerId: 'u2', humanOwnerName: '张三' }),
    ),
    task(37, work({ stageIndex: 1 }), '2026-10-10'),
    task(
      53,
      work({ agentId: 'claude', latestRun: { id: 'r4', status: 'failed' } }),
    ),
    task(
      10,
      work({ agentId: 'fable', latestRun: { id: 'r5', status: 'queued' } }),
    ),
    task(39, work({ agentId: 'gone', stage: 'plan', flow: undefined })),
    task(7, work({ stage: 'done' })),
  ];
}

test('By Agent lays the tasks out per Agent: working on, up next in order, then waiting with yours first', async () => {
  fixture.tasks = studioTasks();
  await mount('/actions?view=agent');
  const board = await screen.findByLabelText('按 Agent 查看任务');
  const columns = within(board).getAllByRole('region');
  // The project default first, then the others; Unassigned last.
  expect(columns.map((c) => c.getAttribute('aria-label'))).toEqual([
    'Codex · GPT-6 Astra',
    'Claude Code · Opus',
    'Claude · Fable 5.1',
    '未分配',
  ]);
  const codex = columns[0];
  expect(codex).toHaveTextContent('运行中');
  expect(within(codex).getByText('正在做')).toBeVisible();
  // Up next, oldest first.
  const next = within(codex).getByRole('list');
  expect(
    within(next)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['1T-52Task 52', '2T-40Task 40']);
  // Waiting: yours first and highlighted, then someone else's by name.
  const cards = codex.querySelectorAll('[data-task-id]');
  const waiting = [...cards].filter((c) =>
    ['37', '41'].includes(c.getAttribute('data-task-id')!),
  );
  expect(waiting.map((c) => c.getAttribute('data-task-id'))).toEqual([
    '37',
    '41',
  ]);
  expect(waiting[0]).toHaveAttribute('data-mine');
  expect(waiting[0]).toHaveTextContent('看效果并发布等你去处理');
  expect(waiting[1]).not.toHaveAttribute('data-mine');
  expect(waiting[1]).toHaveTextContent('等张三');
  expect(columns[1]).toHaveTextContent('运行失败');
  // No runtime online: said in the header and on what waits for it.
  expect(columns[2]).toHaveTextContent('没有在线的运行环境');
  expect(columns[2]).toHaveTextContent('等运行环境上线');
  expect(columns[3]).toHaveTextContent('选 Agent 并开始');
  expect(board).not.toHaveTextContent('Task 7');
  // The line above: runs, not what waits for you (Waiting for me counts that).
  expect(screen.getByLabelText('运行情况')).toHaveTextContent(
    '运行中1排队中3运行失败1运行环境 2 个在线',
  );
  await userEvent
    .setup()
    .click(within(codex).getByRole('button', { name: /Task 37/ }));
  await waitFor(() =>
    expect(screen.getByTestId('url')).toHaveTextContent('/actions/37'),
  );
});

test('an Agent with nothing to do says so', async () => {
  fixture.tasks = [
    task(38, work({ latestRun: { id: 'r1', status: 'running' } })),
  ];
  await mount('/actions?view=agent', 'en-US');
  const claude = await screen.findByRole('region', {
    name: 'Claude Code · Opus',
  });
  expect(claude).toHaveTextContent('Idle');
  expect(claude).toHaveTextContent('Nothing running or queued');
  expect(screen.queryByRole('region', { name: 'Unassigned' })).toBeNull();
});

test('cards on the board and the list name the Agent, and the Agent filter narrows every view', async () => {
  const user = userEvent.setup();
  fixture.tasks = studioTasks();
  await mount('/actions?view=board');
  const card = (no: number) =>
    document.querySelector(`[data-task-id="${no}"]`) as HTMLElement;
  await waitFor(() =>
    expect(card(38)).toHaveTextContent('Codex · GPT-6 Astra'),
  );
  expect(card(53)).toHaveTextContent('Claude Code · Opus');
  expect(card(39)).toHaveTextContent('未分配');
  expect(document.body).not.toHaveTextContent(/·\s*Agent\b/);
  await user.selectOptions(
    screen.getByRole('combobox', { name: '按本地 Agent 筛选' }),
    'Claude · Fable 5.1',
  );
  expect(screen.getByTestId('url')).toHaveTextContent('agent=fable');
  expect(screen.getByText('Task 10')).toBeVisible();
  expect(screen.queryByText('Task 38')).toBeNull();
  // The list shows the Agent in the Executor column.
  await user.click(screen.getByRole('button', { name: '列表' }));
  const table = screen.getByRole('table');
  expect(within(table).getByText('Claude · Fable 5.1')).toBeVisible();
  expect(within(table).queryByText('Task 38')).toBeNull();
});
