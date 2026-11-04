import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NavBadgeProvider,
  refreshNavBadges,
  refreshNavSources,
  useNavBadge,
  useNavSources,
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
      <input aria-label='Conversation draft' />
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
  const draft = screen.getByRole('textbox', { name: 'Conversation draft' });
  fireEvent.change(draft, { target: { value: 'Keep this conversation' } });
  await waitFor(() => expect(next).toBe(1));
  await act(async () => requests[0].resolve(counts(9)));
  expect(screen.getByText('ready:9')).toBeTruthy();
  fireEvent.click(screen.getByText('Refresh'));
  await waitFor(() => expect(next).toBe(2));
  state.project = { id: 2 };
  view.rerender(tree());
  expect(screen.getByRole('textbox', { name: 'Conversation draft' })).toBe(
    draft,
  );
  expect(draft).toHaveValue('Keep this conversation');
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
describe('when the counts and sources are read again', () => {
  let page = 0;
  function Navigate() {
    const navigate = useNavigate();
    return <button onClick={() => navigate(`/page-${++page}`)}>Go</button>;
  }
  function Sources() {
    return <p>{JSON.stringify(useNavSources())}</p>;
  }
  const shell = () => (
    <MemoryRouter>
      <NavBadgeProvider>
        <Probe />
        <Sources />
        <Navigate />
      </NavBadgeProvider>
    </MemoryRouter>
  );
  const sent = (resource: string) =>
    state.action.mock.calls.filter(([name]) => name === resource).length;
  const connected = () => sent('nrHealth');
  const badges = () => sent('nrStrategy');
  // Lets the mocked answers and the state they publish settle.
  const settle = () =>
    act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  const wait = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const go = async () => {
    fireEvent.click(screen.getByText('Go'));
    await settle();
  };
  const focus = async () => {
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await settle();
  };
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-04T08:00:00Z') });
    window.localStorage.clear();
    state.action.mockImplementation((resource: string) =>
      Promise.resolve(resource === 'nrHealth' ? { github: true } : counts(9)),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the sources once across route changes and a focus, and the counts again only once they are 15 s old', async () => {
    render(shell());
    await settle();
    expect([connected(), badges()]).toEqual([1, 1]);
    for (let i = 0; i < 5; i++) {
      await wait(2000);
      await go();
    }
    await focus();
    // Load, five route changes and a focus within 15 s: one read each, where every trigger read both before.
    expect([connected(), badges()]).toEqual([1, 1]);
    expect(screen.getByText('ready:9')).toBeTruthy();
    await wait(6000);
    await go();
    expect([connected(), badges()]).toEqual([1, 2]);
    await go();
    await focus();
    expect([connected(), badges()]).toEqual([1, 2]);
  });

  it('keeps the ready count on screen while a stale count is read on a route change', async () => {
    const requests = [deferred(), deferred()];
    let next = 0;
    state.action.mockImplementation((resource: string) =>
      resource === 'nrHealth' ? Promise.resolve({}) : requests[next++].promise,
    );
    render(shell());
    await settle();
    await act(async () => requests[0].resolve(counts(9)));
    await wait(15000);
    await go();
    expect(next).toBe(2);
    expect(screen.getByText('ready:9')).toBeTruthy();
    await act(async () => requests[1].resolve(counts(7)));
    expect(screen.getByText('ready:7')).toBeTruthy();
  });

  it('joins a read in flight on a route change, focus or the minute, and never aborts it', async () => {
    const requests = [deferred(), deferred()];
    let next = 0;
    state.action.mockImplementation((resource: string) =>
      resource === 'nrHealth' ? Promise.resolve({}) : requests[next++].promise,
    );
    render(shell());
    await settle();
    await act(async () => requests[0].resolve(counts(9)));
    await wait(20000);
    await go();
    expect(next).toBe(2);
    const signal = (
      state.action.mock.calls.filter(
        ([name]) => name === 'nrStrategy',
      )[1][2] as {
        signal: AbortSignal;
      }
    ).signal;
    for (let i = 0; i < 3; i++) await go();
    await focus();
    await wait(40000);
    // The minute's read joined the one in flight too.
    expect(next).toBe(2);
    expect(signal.aborted).toBe(false);
    await act(async () => requests[1].resolve(counts(4)));
    expect(screen.getByText('ready:4')).toBeTruthy();
  });

  it('reads the sources every minute, on focus at most once a minute, and both at once on refreshNavBadges()', async () => {
    render(shell());
    await settle();
    expect([connected(), badges()]).toEqual([1, 1]);
    await wait(30000);
    await focus();
    // The counts are 30 s old, the sources not yet a minute.
    expect([connected(), badges()]).toEqual([1, 2]);
    await wait(30000);
    expect([connected(), badges()]).toEqual([2, 3]);
    await wait(1000);
    await focus();
    expect([connected(), badges()]).toEqual([2, 3]);
    // A hidden tab's interval is throttled: its clock moves on without the minute's read.
    vi.setSystemTime(Date.now() + 61000);
    await focus();
    expect([connected(), badges()]).toEqual([3, 4]);
    await focus();
    expect([connected(), badges()]).toEqual([3, 4]);
    await act(async () => refreshNavBadges());
    await settle();
    expect([connected(), badges()]).toEqual([4, 5]);
    await act(async () => refreshNavSources());
    await settle();
    expect([connected(), badges()]).toEqual([5, 5]);
  });

  it('publishes only the read that follows a write, whether the read in flight answers first or last', async () => {
    for (const older of ['first', 'last'] as const) {
      state.action.mockReset();
      const reads: Record<string, ReturnType<typeof deferred>[]> = {
        nrHealth: [],
        nrStrategy: [],
      };
      state.action.mockImplementation((resource: string) => {
        const read = deferred();
        reads[resource].push(read);
        return read.promise;
      });
      const view = render(shell());
      await settle();
      await act(async () => {
        reads.nrHealth[0].resolve({ github: false });
        reads.nrStrategy[0].resolve(counts(1));
      });
      expect(screen.getByText('ready:1')).toBeTruthy();
      expect(screen.getByText('{"github":false}')).toBeTruthy();
      // The minute's reads are in flight when a write (a connection, a decision) sends the event.
      await wait(60000);
      expect([reads.nrHealth.length, reads.nrStrategy.length]).toEqual([2, 2]);
      await act(async () => refreshNavBadges());
      await settle();
      expect([reads.nrHealth.length, reads.nrStrategy.length]).toEqual([3, 3]);
      const before = async () => {
        reads.nrHealth[1].resolve({ github: false, reddit: true });
        reads.nrStrategy[1].resolve(counts(5));
        await settle();
      };
      const after = async () => {
        reads.nrHealth[2].resolve({ github: true });
        reads.nrStrategy[2].resolve(counts(2));
        await settle();
      };
      if (older === 'first') {
        await act(before);
        // The answer from before the write is never shown, not even for a moment.
        expect(screen.getByText('ready:1')).toBeTruthy();
        expect(screen.getByText('{"github":false}')).toBeTruthy();
        await act(after);
      } else {
        await act(after);
        await act(before);
      }
      expect(screen.getByText('ready:2')).toBeTruthy();
      expect(screen.getByText('{"github":true}')).toBeTruthy();
      expect(
        JSON.parse(
          window.localStorage.getItem('nocoreach:nav-sources:u:1') ?? 'null',
        ),
      ).toEqual({ github: true });
      view.unmount();
      window.localStorage.clear();
    }
  });

  it('reads both again for another project, at once', async () => {
    const view = render(shell());
    await settle();
    expect([connected(), badges()]).toEqual([1, 1]);
    state.project = { id: 2 };
    view.rerender(shell());
    await settle();
    expect([connected(), badges()]).toEqual([2, 2]);
    for (const resource of ['nrHealth', 'nrStrategy'])
      expect(
        state.action.mock.calls
          .filter(([name]) => name === resource)
          .map(([, , options]) => (options as { body: unknown }).body),
      ).toEqual([{ projectId: '1' }, { projectId: '2' }]);
  });
});
