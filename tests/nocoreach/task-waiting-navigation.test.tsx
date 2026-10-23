import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import {
  $t,
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import OptimizationWork from '../../client/pages/optimization-work';
import { WaitingStrip } from '../../client/pages/strategy/insights-view';
import { isWaitingTask } from '../../client/pages/task-waiting';
import type { Work } from '../../client/pages/task-execution-types';

const fixture = vi.hoisted(() => ({
  admin: false,
  projectId: 7,
  records: vi.fn(),
}));
vi.mock('../../client/pages/me', async (original) => ({
  ...(await original<typeof import('../../client/pages/me')>()),
  useMe: () => ({
    me: { id: 'me' },
    isAdmin: fixture.admin,
    can: () => true,
    mine: (owner?: string | null) => (owner ? owner === 'me' : fixture.admin),
  }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: fixture.projectId, name: 'Fixture' } }),
  taskRecords: fixture.records,
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { wrapRequests: () => {}, action: vi.fn() },
  resolvePortalUrl: (p: string) => p,
  getPortalBase: () => '/',
}));
vi.mock('@nocobase/app-plugin-agents/client/kit', () => ({
  useRunnerOptions: () => ({ options: [], loading: false, online: 0 }),
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
}));
const makeTask = (
  id: number,
  state: Work['boardState'],
  owner = 'me',
  closed = false,
) => ({
  id,
  title: `Fixture task ${id}`,
  brief: '',
  status: 'open',
  updatedAt: '2026-10-13',
  evidence: {
    work: {
      revision: 1,
      stage: 'plan',
      plan: null,
      planVersion: 0,
      step: 0,
      results: [],
      history: [],
      boardState: state,
      humanOwnerId: owner,
      ...(closed ? { archivedAt: '2026-10-12' } : {}),
    } satisfies Work,
  },
});
const tasks = [
  makeTask(1, 'review'),
  makeTask(2, 'review'),
  makeTask(3, 'doing'),
  makeTask(4, 'todo', 'other'),
  makeTask(5, 'done'),
  makeTask(6, 'todo', 'me', true),
  makeTask(7, 'todo', ''),
];
let disconnect: (() => void) | undefined;
afterEach(() => {
  cleanup();
  disconnect?.();
  setDictionary(null);
  localStorage.clear();
  vi.clearAllMocks();
  fixture.admin = false;
  fixture.projectId = 7;
});
async function setup(entry = '/insights', locale = 'zh-CN') {
  fixture.records.mockImplementation(async (projectId: number) =>
    projectId === 7 ? tasks : [makeTask(8, 'todo')],
  );
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
    const location = useLocation(),
      navigate = useNavigate();
    return (
      <>
        <output data-testid='url'>
          {location.pathname}
          {location.search}
        </output>
        <button onClick={() => navigate(-1)}>Back</button>
        <button onClick={() => navigate(1)}>Forward</button>
        {location.pathname === '/insights' ? (
          <WaitingStrip
            tasks={tasks.filter((t) =>
              isWaitingTask(t, (owner) =>
                owner ? owner === 'me' : fixture.admin,
              ),
            )}
            label={() => 'Review'}
          />
        ) : (
          <OptimizationWork />
        )}
      </>
    );
  }
  const result = render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={[entry]}>
        <Page />
      </MemoryRouter>
    </I18nProvider>,
  );
  return { runtime, ...result };
}
async function assertWaiting(ids = [1, 2]) {
  await waitFor(() =>
    expect(
      screen.queryByRole('status', { name: $t('common.loadingTasks') }),
    ).not.toBeInTheDocument(),
  );
  for (const id of ids)
    expect(screen.getByText(`Fixture task ${id}`)).toBeInTheDocument();
  for (const id of [1, 2, 3, 4, 5, 6, 7].filter((id) => !ids.includes(id)))
    expect(screen.queryByText(`Fixture task ${id}`)).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', {
      name: new RegExp($t('optimizationWork.waitingForMe')),
    }),
  ).toHaveAttribute('aria-pressed', 'true');
}
test.each(['zh-CN', 'en-US'])(
  'home count opens the same waiting set with visible scope in %s',
  async (locale) => {
    localStorage.setItem('nr-tasks-view', 'board');
    await setup('/insights', locale);
    expect(
      screen.getByText($t('strategy.thingsNeed', { 0: 2 })),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: $t('strategy.view') }),
    );
    await assertWaiting();
    expect(screen.getByTestId('url')).toHaveTextContent(
      '/actions?scope=waiting&view=list',
    );
    expect(
      screen.getByText($t('optimizationWork.waitingMemberScope')),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', {
        name: $t('optimizationWork.filterStatus'),
      }),
    ).not.toBeInTheDocument();
    expect(fixture.records).toHaveBeenCalledWith(7);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(
      screen.getByText($t('strategy.thingsNeed', { 0: 2 })),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Forward' }));
    await assertWaiting();
  },
);
test('URL reload and scope history preserve ownership and allow returning to current tasks', async () => {
  await setup('/actions?scope=waiting&view=list');
  await assertWaiting();
  await userEvent.click(screen.getByRole('button', { name: /^当前/ }));
  expect(screen.getByText('Fixture task 3')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Back' }));
  await assertWaiting();
});
test('admin waiting scope includes unassigned tasks but excludes other owners', async () => {
  fixture.admin = true;
  const { runtime } = await setup('/actions?scope=waiting&view=list');
  await assertWaiting([1, 2, 7]);
  expect(
    screen.getByText($t('optimizationWork.waitingAdminScope')),
  ).toBeInTheDocument();
  await act(() => runtime.changeLanguage('en-US'));
  expect(
    screen.getByText($t('optimizationWork.waitingAdminScope')),
  ).toBeInTheDocument();
});
test('a refreshed waiting URL reads the selected project only', async () => {
  fixture.projectId = 8;
  await setup('/actions?scope=waiting&view=list');
  await assertWaiting([8]);
  expect(fixture.records).toHaveBeenCalledWith(8);
});
test('owner fallback and lifecycle transitions match the original home rules', () => {
  const mine = (owner?: string | null) => owner === 'me';
  expect(
    isWaitingTask(
      { status: 'open', evidence: { createdBy: { id: 'me' } } },
      mine,
    ),
  ).toBe(true);
  expect(
    isWaitingTask(
      { status: '已完成', evidence: { createdBy: { id: 'me' } } },
      mine,
    ),
  ).toBe(false);
  const task = makeTask(10, undefined);
  task.evidence.work.stage = 'execution';
  expect(isWaitingTask(task, mine)).toBe(true);
  task.evidence.work.stage = 'work';
  expect(isWaitingTask(task, mine)).toBe(false);
  task.evidence.work.cancelledAt = '2026-10-13';
  expect(isWaitingTask(task, mine)).toBe(false);
});
