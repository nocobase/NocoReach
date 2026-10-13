import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  NavBadgeProvider,
  refreshNavBadges,
  useNavBadge,
} from '../../client/components/app-shell/nav-badges';
const state = vi.hoisted(() => ({
  project: { id: 1 },
  me: { id: 'u', role: 'member' },
  action: vi.fn(),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: state.project }),
}));
vi.mock('../../client/pages/me', () => ({ useMe: () => ({ me: state.me }) }));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action: state.action },
}));
vi.mock('../../client/i18n', () => ({ $t: (key: string) => key }));
function Probe() {
  const badge = useNavBadge('insights');
  return (
    <>
      <output>
        {badge.status}:{badge.count ?? 'unknown'}
      </output>
      <button onClick={refreshNavBadges}>Refresh</button>
    </>
  );
}
const tree = () => (
  <MemoryRouter>
    <NavBadgeProvider>
      <Probe />
    </NavBadgeProvider>
  </MemoryRouter>
);
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const counts = (insights: number) => ({
  insights,
  opportunities: 2,
  tasks: 3,
});
beforeEach(() => {
  state.project = { id: 1 };
  state.me = { id: 'u', role: 'member' };
  state.action.mockReset();
});
it('clears project counts immediately and rejects responses from the old project and older same-project requests', async () => {
  const requests = [deferred(), deferred(), deferred(), deferred()];
  let next = 0;
  state.action.mockImplementation((resource: string) =>
    resource === 'nrHealth' ? Promise.resolve({}) : requests[next++].promise,
  );
  const view = render(tree());
  await waitFor(() => expect(next).toBe(1));
  await act(async () => requests[0].resolve(counts(9)));
  expect(screen.getByText('ready:9')).toBeTruthy();
  fireEvent.click(screen.getByText('Refresh'));
  await waitFor(() => expect(next).toBe(2));
  state.project = { id: 2 };
  view.rerender(tree());
  expect(screen.getByText('loading:unknown')).toBeTruthy();
  await waitFor(() => expect(next).toBe(3));
  fireEvent.click(screen.getByText('Refresh'));
  await waitFor(() => expect(next).toBe(4));
  await act(async () => requests[3].resolve(counts(5)));
  await act(async () => {
    requests[2].resolve(counts(88));
    requests[1].resolve(counts(99));
  });
  expect(screen.getByText('ready:5')).toBeTruthy();
});
it('distinguishes zero, first-read failure, later failure and invalid responses', async () => {
  let response: unknown = counts(0),
    fail = true;
  state.action.mockImplementation((resource: string) =>
    resource === 'nrHealth'
      ? Promise.resolve({})
      : fail
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(response),
  );
  render(tree());
  await screen.findByText('error:unknown');
  fail = false;
  fireEvent.click(screen.getByText('Refresh'));
  await screen.findByText('ready:0');
  fail = true;
  fireEvent.click(screen.getByText('Refresh'));
  await screen.findByText('error:unknown');
  for (const invalid of [
    { tasks: 0, opportunities: 0 },
    counts(-1),
    counts(1.5),
  ]) {
    fail = false;
    response = invalid;
    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'));
    });
    await waitFor(() => expect(screen.getByText('error:unknown')).toBeTruthy());
  }
});
it('starts fresh after unmount/re-entry and membership loss', async () => {
  const request = deferred();
  state.action.mockImplementation((resource: string) =>
    resource === 'nrHealth' ? Promise.resolve({}) : request.promise,
  );
  const view = render(tree());
  await waitFor(() => expect(state.action).toHaveBeenCalled());
  state.me = { id: 'u', role: '' };
  view.rerender(tree());
  await act(async () => request.resolve(counts(9)));
  expect(screen.getByText('loading:unknown')).toBeTruthy();
  view.unmount();
  state.me = { id: 'v', role: 'member' };
  state.action.mockImplementation((resource: string) =>
    resource === 'nrHealth'
      ? Promise.resolve({})
      : Promise.reject(new Error('offline')),
  );
  render(tree());
  await screen.findByText('error:unknown');
});
