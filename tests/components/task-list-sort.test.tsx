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
import { afterEach, expect, test, vi } from 'vitest';
import {
  $t,
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import OptimizationWork from '../../client/pages/optimization-work';
import type { Work } from '../../client/pages/task-execution-types';
import {
  nextSort,
  sortTasks,
  taskSort,
  type SortableTask,
} from '../../client/pages/task-sort';
import { SYSTEM_PLAYBOOKS, stagesFor } from '../../shared/playbook-catalog';

// Tasks list sorting (2026-10-29 user request): every column header sorts on every tab, Closed starts with the latest
// closed, and the sort is kept in the address.

type Task = SortableTask & { brief: string; status: string };
const { taskRecords, action } = vi.hoisted(() => ({
  taskRecords: vi.fn<() => Promise<Task[]>>(),
  action: vi.fn(async () => []),
}));
vi.mock('../../client/pages/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../client/pages/me')>()),
  useMe: () => ({
    me: { id: '1' },
    isAdmin: true,
    can: () => true,
    mine: () => true,
  }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, name: 'Example' } }),
  taskRecords,
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { wrapRequests: () => {}, action },
  resolvePortalUrl: (p: string) => p,
  getPortalBase: () => '/',
}));
vi.mock('@nocobase/app-plugin-agents/client/kit', () => ({
  useRunnerOptions: () => ({ options: [], loading: false, online: 0 }),
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
}));
let disconnect: (() => void) | undefined;
afterEach(() => {
  cleanup();
  disconnect?.();
  disconnect = undefined;
  setDictionary(null);
  localStorage.clear();
  vi.clearAllMocks();
});

const stages = stagesFor(
  SYSTEM_PLAYBOOKS.find((p) => p.id === 'keyword-research')!,
);
function task(
  no: number,
  title: string,
  updatedAt: string,
  work: Partial<Work>,
  owner = 'Super Admin',
): Task {
  return {
    id: 1000 + no,
    title,
    brief: '',
    status: '',
    updatedAt,
    evidence: {
      no,
      work: {
        revision: 1,
        stage: 'flow',
        plan: null,
        planVersion: 0,
        step: 0,
        results: [],
        history: [],
        stageIndex: 1,
        flow: {
          id: 'keyword-research',
          name: 'Keyword research',
          version: 3,
          stages,
        },
        humanOwnerId: '1',
        humanOwnerName: owner,
        ...work,
      } as Work,
    },
  };
}
// Closed tasks as on Studio: T-1 closed first, T-51 last; T-50 put away before it started.
const closed = [
  task(1, 'Alpha', '2026-10-22T10:36:38Z', {
    cancelledAt: '2026-10-22T10:35:37Z',
  }),
  task(51, 'Charlie', '2026-10-29T14:51:19Z', {
    cancelledAt: '2026-10-29T14:51:19Z',
  }),
  task(
    50,
    'Bravo',
    '2026-10-28T01:35:20Z',
    { stage: 'plan', flow: undefined, archivedAt: '2026-10-28T01:35:20Z' },
    'Lin',
  ),
];

async function setup(tasks: Task[], query = '') {
  taskRecords.mockImplementation(async () => tasks);
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
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
        <output data-testid='query'>{location.search}</output>
        <OptimizationWork />
      </>
    );
  }
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={[`/actions${query}`]}>
        <Page />
      </MemoryRouter>
    </I18nProvider>,
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('status', { name: $t('common.loadingTasks') }),
    ).not.toBeInTheDocument(),
  );
}
const rowNumbers = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('td')?.textContent);
const query = () =>
  new URLSearchParams(screen.getByTestId('query').textContent ?? '');
const header = (name: string) =>
  screen.getByRole('columnheader', { name: new RegExp(name) });

test('Closed lists the latest closed first and every header sorts, kept in the address', async () => {
  const user = userEvent.setup();
  await setup(closed, '?scope=closed');
  expect(rowNumbers()).toEqual(['T-51', 'T-50', 'T-1']);
  const whenClosed = header($t('workBoard.whenClosed'));
  expect(whenClosed).toHaveAttribute('aria-sort', 'descending');
  for (const name of [
    'common.identifier',
    'common.title',
    'common.status',
    'common.owner',
    'common.executor',
    'workBoard.updated',
  ])
    expect(header($t(name))).toHaveAttribute('aria-sort', 'none');
  // The same affordance as the Keywords tables: a faint ⇅ until a column is chosen.
  expect(
    header($t('common.title')).querySelector('[data-unsorted]'),
  ).not.toBeNull();

  await user.click(within(header($t('common.identifier'))).getByRole('button'));
  expect(rowNumbers()).toEqual(['T-51', 'T-50', 'T-1']);
  expect(query().get('sort')).toBe('no');
  expect(query().get('order')).toBe('desc');
  await user.click(within(header($t('common.identifier'))).getByRole('button'));
  expect(rowNumbers()).toEqual(['T-1', 'T-50', 'T-51']);
  expect(header($t('common.identifier'))).toHaveAttribute(
    'aria-sort',
    'ascending',
  );

  await user.click(within(header($t('common.title'))).getByRole('button'));
  expect(rowNumbers()).toEqual(['T-1', 'T-50', 'T-51']);
  await user.click(within(header($t('common.owner'))).getByRole('button'));
  expect(rowNumbers()[0]).toBe('T-50');
  expect(query().get('scope')).toBe('closed');

  // Changing the scope goes back to that scope's own default order.
  await user.click(
    screen.getByRole('button', { name: $t('optimizationWork.current') }),
  );
  expect(query().get('sort')).toBeNull();
});

test('a sort in the address is applied on load, and every closed task offers Reopen', async () => {
  const user = userEvent.setup();
  await setup(closed, '?scope=closed&sort=updated&order=asc');
  expect(rowNumbers()).toEqual(['T-1', 'T-50', 'T-51']);
  expect(header($t('workBoard.updated'))).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  for (const t of closed) {
    await user.click(
      screen.getByRole('button', {
        name: $t('common.moreActions', { 0: t.title }),
      }),
    );
    expect(
      await screen.findByRole('menuitem', { name: $t('common.reopen') }),
    ).toBeVisible();
    await user.keyboard('{Escape}');
  }
});

test('sorting reads each column as it shows: status by what needs you, snoozed by the day it comes back', () => {
  const current = [
    task(3, 'Todo', '2026-10-29T00:00:00Z', {
      stage: 'plan',
      flow: undefined,
    }),
    task(4, 'Review', '2026-10-20T00:00:00Z', {}),
    task(5, 'Doing', '2026-10-28T00:00:00Z', { stageIndex: 0 }),
  ];
  const byStatus = sortTasks(
    current,
    taskSort('current', null, null),
    'current',
  );
  expect(byStatus.map((t) => t.title)).toEqual(['Review', 'Doing', 'Todo']);
  const snoozed = [
    task(6, 'Later', '2026-10-01T00:00:00Z', {
      snooze: {
        until: '2026-11-05T01:00:00Z',
        day: '2026-11-05',
        at: '',
        by: '1',
      },
    }),
    task(7, 'Sooner', '2026-10-02T00:00:00Z', {
      snooze: {
        until: '2026-11-01T01:00:00Z',
        day: '2026-11-01',
        at: '',
        by: '1',
      },
    }),
  ];
  expect(
    sortTasks(snoozed, taskSort('snoozed', null, null), 'snoozed').map(
      (t) => t.title,
    ),
  ).toEqual(['Sooner', 'Later']);
  // A missing value stays last whichever way the column sorts.
  const noNumber = { ...task(8, 'No number', '2026-10-03T00:00:00Z', {}) };
  delete noNumber.evidence!.no;
  for (const order of ['asc', 'desc'] as const)
    expect(
      sortTasks([noNumber, ...current], { sort: 'no', order }, 'current').at(-1)
        ?.title,
    ).toBe('No number');
  expect(nextSort('closed', { sort: 'title', order: 'asc' }, 'step')).toEqual({
    sort: 'step',
    order: 'desc',
  });
  expect(nextSort('current', { sort: 'no', order: 'desc' }, 'no')).toEqual({
    sort: 'no',
    order: 'asc',
  });
  expect(taskSort('done', 'bogus', 'up')).toEqual({
    sort: 'updated',
    order: 'desc',
  });
});
