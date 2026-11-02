import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
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

// Tasks › Board (2026-11-02 user decision "every column by time"): each column runs newest activity first, a card shows
// the time of its last line in Activity, and cards move between columns only.

type Task = {
  id: number;
  title: string;
  brief: string;
  status: string;
  updatedAt: string;
  createdAt?: string;
  evidence?: { no?: number; work?: Work };
};
const { taskRecords, action } = vi.hoisted(() => ({
  taskRecords: vi.fn<() => Promise<Task[]>>(),
  action: vi.fn(async (..._args: unknown[]): Promise<unknown> => []),
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
afterEach(() => {
  cleanup();
  setDictionary(null);
  localStorage.clear();
  vi.clearAllMocks();
});

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
// Every task was just written by something Activity does not show (an effect check, a run starting), which used to
// put "Just now" on every card.
function task(
  no: number,
  work: Partial<Work>,
  history: Work['history'],
  extra: Partial<Task> = {},
): Task {
  return {
    id: 1000 + no,
    title: `Task ${no}`,
    brief: '',
    status: '',
    updatedAt: new Date(now).toISOString(),
    createdAt: hoursAgo(24 * 20),
    evidence: {
      no,
      work: {
        revision: 1,
        stage: 'done',
        plan: null,
        planVersion: 0,
        step: 0,
        results: [],
        humanOwnerId: '1',
        humanOwnerName: 'Super Admin',
        ...work,
        history,
      } as Work,
    },
    ...extra,
  };
}
const tasks = [
  task(46, {}, [
    { at: hoursAgo(24 * 6), action: 'approveStage' },
    { at: hoursAgo(0.1), action: 'runQueued' },
  ]),
  task(33, {}, [
    { at: hoursAgo(24 * 10), action: 'live' },
    { at: hoursAgo(21), action: 'effect', note: '7' },
  ]),
  task(49, {}, [{ at: hoursAgo(24 * 4), action: 'approveStage' }]),
  task(52, {}, [{ at: hoursAgo(1), action: 'confirmLive' }]),
  // Doing: the one dragged to the top before keeps no place there.
  task(10, { stage: 'plan', boardState: 'doing' }, [
    { at: hoursAgo(5), action: 'startTask' },
  ]),
  task(11, { stage: 'plan', boardState: 'doing' }, [
    { at: hoursAgo(2), action: 'comment', comment: 'Note' },
  ]),
];

async function setup() {
  taskRecords.mockImplementation(async () => tasks);
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  const disconnect = connectLocale(runtime);
  function Page() {
    useNocoReachLocale();
    return <OptimizationWork />;
  }
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={['/actions?view=board']}>
        <Page />
      </MemoryRouter>
    </I18nProvider>,
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('status', { name: $t('common.loadingTasks') }),
    ).not.toBeInTheDocument(),
  );
  return disconnect;
}
const column = (name: string) => screen.getByRole('region', { name });
const cards = (name: string) =>
  [...column(name).querySelectorAll('article')].map((card) =>
    card.querySelector('.font-mono')?.textContent?.trim(),
  );
const card = (no: number) =>
  document.querySelector<HTMLElement>(`article[data-task-id="${1000 + no}"]`)!;

test('each column runs newest activity first and a card shows its last line in Activity', async () => {
  const disconnect = await setup();
  expect(cards($t('common.completed'))).toEqual([
    'T-52',
    'T-33',
    'T-49',
    'T-46',
  ]);
  expect(cards($t('common.inProgress'))).toEqual(['T-11', 'T-10']);
  expect(within(card(52)).getByText('1 h ago')).toBeInTheDocument();
  expect(within(card(33)).getByText('21 h ago')).toBeInTheDocument();
  expect(screen.queryByText('Just now')).not.toBeInTheDocument();
  disconnect();
});

test('a card moves between columns only: no Move up or down, and dropping it in its own column does nothing', async () => {
  const user = userEvent.setup();
  const disconnect = await setup();
  await user.click(
    within(card(11)).getByRole('button', {
      name: $t('common.moreActions', { 0: 'Task 11' }),
    }),
  );
  const items = (await screen.findAllByRole('menuitem')).map(
    (item) => item.textContent,
  );
  expect(items).toContain(
    $t('workBoard.move', { 0: $t('common.needsConfirmation') }),
  );
  expect(items).not.toContain(
    $t('workBoard.move', { 0: $t('common.inProgress') }),
  );
  expect(items).not.toContain($t('common.moveUp'));
  expect(items).not.toContain($t('common.moveDown'));
  await user.keyboard('{Escape}');

  const transfer = { setData: () => {}, effectAllowed: '' };
  const advances = () =>
    action.mock.calls.filter((call) => call[1] === 'advance');
  // Dropped on its neighbour in its own column: the column is not offered as a target and nothing is sent.
  fireEvent.dragStart(card(11), { dataTransfer: transfer });
  fireEvent.dragOver(card(10), { dataTransfer: transfer });
  expect(column($t('common.inProgress'))).not.toHaveClass('ring-2');
  fireEvent.drop(card(10), { dataTransfer: transfer });
  expect(advances()).toHaveLength(0);
  // Dropped in another column: its state changes, with no position.
  action.mockImplementation(async (_resource, name) =>
    name === 'advance' ? { task: {}, work: tasks[5].evidence!.work } : [],
  );
  fireEvent.dragStart(card(11), { dataTransfer: transfer });
  fireEvent.dragOver(column($t('common.pending')), { dataTransfer: transfer });
  expect(column($t('common.pending'))).toHaveClass('ring-2');
  fireEvent.drop(column($t('common.pending')), { dataTransfer: transfer });
  await waitFor(() => expect(advances()).toHaveLength(1));
  const body = (advances()[0][2] as { body: Record<string, unknown> }).body;
  expect(body).toMatchObject({ command: 'moveWork', state: 'todo' });
  expect(body).not.toHaveProperty('beforeId');
  disconnect();
});
