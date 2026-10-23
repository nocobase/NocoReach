import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import ResultsPage from '../../client/pages/results/index.js';
import AllResultsPage from '../../client/pages/results/all.js';
import ResultDetailPage from '../../client/pages/results/detail.js';
import { NocoReachHttpError } from '../../client/lib/nocoreach-api.js';
import { setDictionary } from '../../client/i18n/index.js';
import english from '../../shared/i18n/en.json';
const { action, fixture } = vi.hoisted(() => ({
  action: vi.fn(),
  fixture: { project: 1 },
}));
vi.mock('../../client/pages/reach-data.js', () => ({
  useProject: () => ({ project: { id: fixture.project } }),
}));
// The drawer's own close is RouteOverlay's; here only where it is told to go matters.
vi.mock('../../client/components/route-drawer.js', () => ({
  RouteDrawer: ({
    children,
    closeTo,
  }: {
    children: React.ReactNode;
    closeTo: unknown;
  }) => <div data-close-to={JSON.stringify(closeTo)}>{children}</div>,
}));
vi.mock('../../client/lib/nocoreach-api.js', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api.js')>()),
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
beforeEach(() => {
  action.mockReset();
  fixture.project = 1;
  setDictionary(english);
});
afterEach(cleanup);
const row = {
  taskId: '11',
  taskNo: 11,
  title: 'Completed task A',
  taskState: 'done',
  closed: false,
  archived: false,
  simulated: false,
  occurredAt: null,
  pages: [],
  status: 'unavailable',
  latest: null,
  phase: 'delivered',
  nextDay: null,
  nextDate: null,
};
it('distinguishes a true empty result from a failed read and a failed refresh', async () => {
  action.mockResolvedValueOnce({ items: [], total: 0 });
  render(
    <MemoryRouter>
      <AllResultsPage />
    </MemoryRouter>,
  );
  expect(
    await screen.findByText(english['results.board.empty']),
  ).toBeInTheDocument();
  action.mockRejectedValueOnce(new Error('network'));
  fireEvent.click(
    screen.getByRole('button', { name: english['results.refresh'] }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    english['results.stale'],
  );
  expect(
    screen.getByRole('button', { name: english['common.retry'] }),
  ).toBeInTheDocument();
});
it('discards protected stale results when access is revoked', async () => {
  action.mockResolvedValueOnce({ items: [row], total: 1 });
  render(
    <MemoryRouter>
      <AllResultsPage />
    </MemoryRouter>,
  );
  expect(
    await screen.findByText('T-11 · Completed task A'),
  ).toBeInTheDocument();
  action.mockRejectedValueOnce(new NocoReachHttpError('Forbidden', 403, {}));
  fireEvent.click(
    screen.getByRole('button', { name: english['results.refresh'] }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    english['results.noAccess'],
  );
  expect(
    screen.queryByRole('button', { name: english['common.retry'] }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('T-11 · Completed task A')).not.toBeInTheDocument();
});
it('ignores a late previous-project response after a project switch', async () => {
  const old = Promise.withResolvers<{ items: (typeof row)[]; total: number }>();
  action
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ items: [], total: 0 });
  const view = render(
    <MemoryRouter>
      <AllResultsPage />
    </MemoryRouter>,
  );
  fixture.project = 2;
  view.rerender(
    <MemoryRouter>
      <AllResultsPage />
    </MemoryRouter>,
  );
  expect(
    await screen.findByText(english['results.board.empty']),
  ).toBeInTheDocument();
  old.resolve({ items: [row], total: 1 });
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('T-11 · Completed task A')).not.toBeInTheDocument();
});
const board = (overrides: object = {}) => ({
  window: { start: '2026-07-19', end: '2026-10-16' },
  total: 3,
  counts: {
    live: 2,
    delivered: 1,
    up: 1,
    down: 1,
    flat: 0,
    insufficient: 0,
    waiting: 0,
  },
  totals: { clicks: { before: 300, after: 360, tasks: 2 }, views: null },
  changes: [
    {
      taskId: '8',
      taskNo: 8,
      title: 'Rewrite the title',
      liveDate: '2026-09-12T00:00:00.000Z',
      status: 'up',
      day: 28,
      metric: 'clicks',
      before: 100,
      after: 200,
      percent: 100,
      nextDay: null,
      nextDate: null,
    },
    {
      taskId: '9',
      taskNo: 9,
      title: 'Add internal links',
      liveDate: '2026-10-01T00:00:00.000Z',
      status: 'down',
      day: 7,
      metric: 'clicks',
      before: 200,
      after: 160,
      percent: -20,
      nextDay: 28,
      nextDate: '2026-11-01',
    },
  ],
  attention: [
    {
      ...row,
      taskId: '9',
      taskNo: 9,
      title: 'Add internal links',
      phase: 'live',
      status: 'down',
      occurredAt: '2026-10-01T00:00:00.000Z',
      nextDay: 28,
      nextDate: '2026-11-01',
    },
    {
      ...row,
      taskId: '14',
      taskNo: 14,
      title: 'Write the pricing FAQ',
      phase: 'delivered',
      taskState: 'done',
    },
  ],
  ...overrides,
});
const renderBoard = (url = '/results') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path='/results' element={<ResultsPage />} />
      </Routes>
    </MemoryRouter>,
  );
it('shows the work of the period: counts, page totals, each change and what needs a look', async () => {
  action.mockResolvedValueOnce(board());
  renderBoard('/results?days=28');
  expect(action).toHaveBeenCalledWith('nrTaskWork', 'board', {
    method: 'POST',
    body: { projectId: '1', range: '28' },
    unwrap: 'data',
  });
  expect(await screen.findByText('+60')).toBeInTheDocument();
  expect(screen.getByText('300 → 360 · ↑ 20%')).toBeInTheDocument();
  expect(
    screen.getByText(english['results.board.noTotals']),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Up · ↑ 100% · Search clicks 100 → 200 · day 28'),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      /^Down · ↓ 20% · Search clicks 200 → 160 · day 7 · Day 28 result around Nov 1(, \d{4})?$/,
    ),
  ).toBeInTheDocument();
  // A result opens its drawer over the dashboard, keeping the period.
  for (const link of screen.getAllByRole('link', {
    name: 'T-9 · Add internal links',
  }))
    expect(link).toHaveAttribute('href', '/results/9?days=28');
  expect(
    screen.getByRole('link', { name: english['results.board.viewAll'] }),
  ).toHaveAttribute('href', '/results/all?days=28');
  // Only work with an outcome: a finished delivery reads Delivered; nothing waits to go live.
  expect(
    screen.getByText(english['results.phase.delivered']),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      english['results.board.deliveredAlso'].replace('{0}', '1'),
    ),
  ).toBeInTheDocument();
  const rows = screen.getAllByRole('row');
  expect(rows[1]).toHaveTextContent('T-9 · Add internal links');
  expect(rows[2]).toHaveTextContent('T-14 · Write the pricing FAQ');
});
it('opens on 90 days and says so inside each card when nothing went live', async () => {
  action.mockResolvedValueOnce(
    board({
      total: 0,
      counts: { ...board().counts, live: 0, delivered: 0, up: 0, down: 0 },
      totals: { clicks: null, views: null },
      changes: [],
      attention: [],
    }),
  );
  renderBoard();
  expect(action.mock.calls[0][2].body).toEqual({
    projectId: '1',
    range: '90',
  });
  expect(
    await screen.findByText(english['results.board.noChanges']),
  ).toBeInTheDocument();
  expect(screen.getByText(english['results.board.empty'])).toBeInTheDocument();
  expect(screen.getAllByText(english['results.board.noTotals'])).toHaveLength(
    2,
  );
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
it('keeps the numbers after a failed refresh and drops them when access is gone', async () => {
  action.mockResolvedValueOnce(board());
  renderBoard();
  expect(await screen.findByText('+60')).toBeInTheDocument();
  action.mockRejectedValueOnce(new Error('network'));
  fireEvent.click(
    screen.getByRole('button', { name: english['results.refresh'] }),
  );
  expect(await screen.findByText(english['results.stale'])).toBeInTheDocument();
  expect(screen.getByText('+60')).toBeInTheDocument();
  action.mockRejectedValueOnce(new NocoReachHttpError('Forbidden', 403, {}));
  fireEvent.click(
    screen.getByRole('button', { name: english['results.refresh'] }),
  );
  expect(
    await screen.findByText(english['results.noAccess']),
  ).toBeInTheDocument();
  expect(screen.queryByText('+60')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: english['common.retry'] }),
  ).not.toBeInTheDocument();
});
it('reloads the board for another period', async () => {
  action.mockResolvedValue(board());
  renderBoard();
  await screen.findByText('+60');
  fireEvent.click(
    screen.getByRole('button', { name: english['common.last28Days'] }),
  );
  await waitFor(() =>
    expect(action.mock.calls.at(-1)?.[2].body).toEqual({
      projectId: '1',
      range: '28',
    }),
  );
});

it('offers to sign in again when the session has ended, and sends no request for an invalid period', async () => {
  action.mockRejectedValueOnce(new NocoReachHttpError('Unauthorized', 401, {}));
  renderBoard();
  expect(
    (await screen.findByText(english['common.signAgain'])).closest('a'),
  ).toHaveAttribute('href', '/login');
  expect(
    screen.queryByRole('button', { name: english['common.retry'] }),
  ).not.toBeInTheDocument();
  cleanup();
  action.mockReset();
  renderBoard('/results?days=custom&from=2026-10-10&to=2026-10-01');
  expect(
    await screen.findByText(english['rangePicker.reversedDates']),
  ).toBeInTheDocument();
  expect(action).not.toHaveBeenCalled();
});
it('lists the period with its own filters, and clearing them keeps the period', async () => {
  action.mockResolvedValue({ items: [], total: 0 });
  render(
    <MemoryRouter
      initialEntries={['/results/all?days=28&q=docs&status=delivered']}
    >
      <Routes>
        <Route path='/results/all' element={<AllResultsPage />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText(english['results.noMatches'])).toBeVisible();
  expect(action).toHaveBeenLastCalledWith('nrTaskWork', 'results', {
    method: 'POST',
    body: {
      projectId: '1',
      range: '28',
      page: 1,
      order: 'desc',
      q: 'docs',
      status: 'delivered',
    },
    unwrap: 'data',
  });
  fireEvent.click(
    screen.getAllByRole('button', { name: english['results.clear'] }).at(-1)!,
  );
  expect(
    screen.getByRole('textbox', { name: english['results.search'] }),
  ).toHaveFocus();
  await waitFor(() =>
    expect(action).toHaveBeenLastCalledWith('nrTaskWork', 'results', {
      method: 'POST',
      body: { projectId: '1', range: '28', page: 1, order: 'desc' },
      unwrap: 'data',
    }),
  );
  expect(
    await screen.findByText(english['results.board.empty']),
  ).toBeInTheDocument();
});
it('closes the result drawer back to the view it was opened from, without its checkpoint', async () => {
  action.mockReturnValue(new Promise(() => {}));
  const { container } = render(
    <MemoryRouter initialEntries={['/results/all/7?days=28&q=docs&day=28']}>
      <Routes>
        <Route path='/results/all/:taskId' element={<ResultDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(
    JSON.parse(
      container
        .querySelector('[data-close-to]')!
        .getAttribute('data-close-to')!,
    ),
  ).toEqual({ pathname: '..', search: '?days=28&q=docs' });
});

it('shows a skeleton shaped like the board on the first read', () => {
  action.mockReturnValue(new Promise(() => {}));
  renderBoard();
  expect(
    screen.getByRole('status', { name: english['common.loading'] }),
  ).toBeInTheDocument();
});
it('explains an invalid period on the full list instead of an empty page', async () => {
  render(
    <MemoryRouter
      initialEntries={[
        '/results/all?days=custom&from=2026-10-10&to=2026-10-01',
      ]}
    >
      <Routes>
        <Route path='/results/all' element={<AllResultsPage />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(
    await screen.findByText(english['rangePicker.reversedDates']),
  ).toBeInTheDocument();
  expect(action).not.toHaveBeenCalled();
});

it('says a result archived after it finished is archived, and never calls a stopped task done', async () => {
  action.mockResolvedValueOnce({
    items: [
      {
        ...row,
        taskId: '21',
        taskNo: 21,
        title: 'Pricing FAQ',
        archived: true,
      },
      {
        ...row,
        taskId: '22',
        taskNo: 22,
        title: 'Title rewrite',
        phase: 'live',
        status: 'waiting',
        taskState: 'closed',
        closed: true,
      },
    ],
    total: 2,
  });
  render(
    <MemoryRouter initialEntries={['/results/all?days=28']}>
      <Routes>
        <Route path='/results/all' element={<AllResultsPage />} />
      </Routes>
    </MemoryRouter>,
  );
  const archived = await screen.findByText('T-21 · Pricing FAQ');
  expect(archived.closest('td')).toHaveTextContent(
    `${english['results.taskState.done']} · ${english['results.archived']}`,
  );
  const stopped = screen.getByText('T-22 · Title rewrite').closest('td')!;
  expect(stopped).toHaveTextContent(english['results.taskState.closed']);
  expect(stopped).not.toHaveTextContent(english['results.taskState.done']);
});
