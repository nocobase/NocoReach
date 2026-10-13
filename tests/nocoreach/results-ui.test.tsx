import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import ResultsPage from '../../client/pages/results/index.js';
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
  simulated: false,
  occurredAt: null,
  pages: [],
  status: 'unavailable',
  latest: null,
};
it('distinguishes a true empty result from a failed read and a failed refresh', async () => {
  action.mockResolvedValueOnce({ items: [], total: 0 });
  render(
    <MemoryRouter>
      <ResultsPage />
    </MemoryRouter>,
  );
  expect(await screen.findByText(english['results.empty'])).toBeInTheDocument();
  action.mockRejectedValueOnce(new Error('network'));
  fireEvent.click(
    screen.getByRole('button', { name: english['results.refresh'] }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    english['results.stale'],
  );
});
it('discards protected stale results when access is revoked', async () => {
  action.mockResolvedValueOnce({ items: [row], total: 1 });
  render(
    <MemoryRouter>
      <ResultsPage />
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
    english['results.loadFailed'],
  );
  expect(screen.queryByText('T-11 · Completed task A')).not.toBeInTheDocument();
});
it('ignores a late previous-project response after a project switch', async () => {
  const old = Promise.withResolvers<{ items: (typeof row)[]; total: number }>();
  action
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ items: [], total: 0 });
  const view = render(
    <MemoryRouter>
      <ResultsPage />
    </MemoryRouter>,
  );
  fixture.project = 2;
  view.rerender(
    <MemoryRouter>
      <ResultsPage />
    </MemoryRouter>,
  );
  expect(await screen.findByText(english['results.empty'])).toBeInTheDocument();
  old.resolve({ items: [row], total: 1 });
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('T-11 · Completed task A')).not.toBeInTheDocument();
});
