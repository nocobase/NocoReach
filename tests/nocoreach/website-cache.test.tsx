import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePolled } from '../../client/pages/data-website/use-polled';
import {
  GA4_HISTORY_CACHE_MS,
  GA4_PARTIAL_CACHE_MS,
  ga4CacheExpiry,
  GA4_TODAY_CACHE_MS,
  GA4_REALTIME_CACHE_MS,
} from '../../shared/ga4-cache.js';
import {
  useFreshData,
  useWorkspaceCache,
  WorkspaceCacheProvider,
} from '../../client/pages/workspace-cache';

const auth = vi.hoisted(() => ({
  session: { user: { id: 'u' }, session: { id: 's' } },
  isPending: false,
  revision: 0,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => auth,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => auth.revision,
}));

const fetcher = vi.fn<() => Promise<string>>();
function Poll({ id = '1' }: { id?: string }) {
  const { data, error } = usePolled(`live:${id}`, fetcher, 60000);
  return (
    <p>
      {data ?? 'loading'}
      {error ? ': failed' : ''}
    </p>
  );
}
function Report({ id = '1' }: { id?: string }) {
  const { data, error, reload } = useFreshData(
    `data-view:website:${id}`,
    fetcher,
    {
      staleTime: GA4_HISTORY_CACHE_MS,
      retryDelay: GA4_PARTIAL_CACHE_MS,
    },
  );
  return (
    <>
      <button onClick={reload}>{data ?? 'loading'}</button>
      {error ? <p role='alert'>failed</p> : null}
    </>
  );
}
function setup(poll = true) {
  const tree = (show = true, id = '1') => (
    <WorkspaceCacheProvider>
      {show ? poll ? <Poll id={id} /> : <Report id={id} /> : null}
    </WorkspaceCacheProvider>
  );
  const view = render(tree());
  return {
    ...view,
    show: (show = true, id = '1') => view.rerender(tree(show, id)),
  };
}
async function flush() {
  await act(async () => {});
}
async function visible(value: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(value);
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-16T00:00:00Z'));
  sessionStorage.clear();
  auth.session = { user: { id: 'u' }, session: { id: 's' } };
  auth.revision = 0;
  fetcher.mockReset().mockResolvedValue('visitors');
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('reuses historical reports on navigation, expires them, and still forces an explicit reload', async () => {
  const view = setup(false);
  await flush();
  view.show(false);
  view.show();
  expect(screen.getByText('visitors')).toBeTruthy();
  await flush();
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('visitors'));
  await flush();
  expect(fetcher).toHaveBeenCalledTimes(2);
  // A previous manual reload must not force unrelated key changes.
  view.show(true, '2');
  await flush();
  view.show(true, '1');
  await flush();
  expect(fetcher).toHaveBeenCalledTimes(3);
  await act(async () => vi.advanceTimersByTimeAsync(60 * 60000));
  view.show(false);
  view.show();
  await flush();
  expect(fetcher).toHaveBeenCalledTimes(3);
  await act(async () =>
    vi.advanceTimersByTimeAsync(GA4_HISTORY_CACHE_MS - 60 * 60000),
  );
  view.show(false);
  view.show();
  await flush();
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it.each([false, true])(
  'backs off failed historical reads across navigation and retries after five minutes (previous data=%s)',
  async (previousData) => {
    if (!previousData) fetcher.mockRejectedValue(new Error('quota exceeded'));
    const view = setup(false);
    await flush();
    if (previousData) {
      await act(async () => vi.advanceTimersByTimeAsync(GA4_HISTORY_CACHE_MS));
      fetcher.mockRejectedValue(new Error('quota exceeded'));
      view.show(false);
      view.show();
      await flush();
    }
    const failedReads = fetcher.mock.calls.length;
    expect(screen.getByRole('alert').textContent).toBe('failed');
    for (let i = 0; i < 3; i++) {
      view.show(false);
      view.show();
      await flush();
      expect(fetcher).toHaveBeenCalledTimes(failedReads);
      expect(screen.getByRole('button').textContent).toBe(
        previousData ? 'visitors' : 'loading',
      );
      expect(screen.getByRole('alert').textContent).toBe('failed');
    }
    fetcher.mockResolvedValue('recovered');
    await act(async () =>
      vi.advanceTimersByTimeAsync(GA4_PARTIAL_CACHE_MS - 1),
    );
    view.show(false);
    view.show();
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(failedReads);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    view.show(false);
    view.show();
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(failedReads + 1);
    expect(screen.getByRole('button').textContent).toBe('recovered');
    expect(screen.queryByRole('alert')).toBeNull();
  },
);

it('lets an explicit historical reload bypass backoff and clears failure state after success', async () => {
  fetcher.mockRejectedValueOnce(new Error('quota exceeded'));
  const view = setup(false);
  await flush();
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button'));
  await flush();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button').textContent).toBe('visitors');
  expect(screen.queryByRole('alert')).toBeNull();
  view.show(false);
  view.show();
  await flush();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('keeps immediate retry on navigation when a caller does not opt into backoff', async () => {
  function DefaultReport() {
    const { data } = useFreshData('default', fetcher);
    return <p>{data ?? 'loading'}</p>;
  }
  const tree = (show: boolean) => (
    <WorkspaceCacheProvider>
      {show ? <DefaultReport /> : null}
    </WorkspaceCacheProvider>
  );
  fetcher.mockRejectedValueOnce(new Error('temporary failure'));
  const view = render(tree(true));
  await flush();
  view.rerender(tree(false));
  view.rerender(tree(true));
  await flush();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByText('visitors')).toBeTruthy();
});

it('does not extend the server cache lifetime by another six hours in the browser', async () => {
  const load = vi.fn(async () => ({
    label: 'server report',
    cacheExpiresAt: Date.now() + 60000,
  }));
  function CachedReport() {
    const { data } = useFreshData('data-view:server-expiry', load, {
      staleTime: GA4_HISTORY_CACHE_MS,
      expiresAt: ga4CacheExpiry,
    });
    return <p>{data?.label ?? 'loading'}</p>;
  }
  const tree = (show: boolean) => (
    <WorkspaceCacheProvider>
      {show ? <CachedReport /> : null}
    </WorkspaceCacheProvider>
  );
  const view = render(tree(true));
  await flush();
  await act(async () => vi.advanceTimersByTimeAsync(59999));
  view.rerender(tree(false));
  view.rerender(tree(true));
  await flush();
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  view.rerender(tree(false));
  view.rerender(tree(true));
  await flush();
  expect(load).toHaveBeenCalledTimes(2);
});

it.each([GA4_TODAY_CACHE_MS, GA4_REALTIME_CACHE_MS])(
  'polls at the server expiry instead of restarting a %i ms lifetime',
  async (every) => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        label: 'cached',
        cacheExpiresAt: Date.now() + 5000,
      })
      .mockImplementation(async () => ({
        label: 'fresh',
        cacheExpiresAt: Date.now() + every,
      }));
    function ExpiringPoll() {
      const { data } = usePolled<{ label: string; cacheExpiresAt: number }>(
        'expiring',
        load,
        every,
        ga4CacheExpiry,
      );
      return <p>{data?.label}</p>;
    }
    const tree = (show: boolean) => (
      <WorkspaceCacheProvider>
        {show ? <ExpiringPoll /> : null}
      </WorkspaceCacheProvider>
    );
    const view = render(tree(true));
    await flush();
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    view.rerender(tree(false));
    view.rerender(tree(true));
    await flush();
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByText('fresh')).toBeTruthy();
  },
);

function Invalidate() {
  const cache = useWorkspaceCache();
  return (
    <button
      onClick={() =>
        cache.invalidate(
          (key) => key === 'data-view:website:1' || key === 'live:1',
        )
      }
    >
      Invalidate
    </button>
  );
}

it.each([false, true])(
  'fences late responses and reloads mounted invalidated reports (poll=%s)',
  async (poll) => {
    const old = Promise.withResolvers<string>();
    fetcher
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue('new connection');
    const tree = (show: boolean) => (
      <WorkspaceCacheProvider>
        <Invalidate />
        {show ? poll ? <Poll /> : <Report /> : null}
      </WorkspaceCacheProvider>
    );
    const view = render(tree(true));
    await flush();
    fireEvent.click(screen.getByText('Invalidate'));
    await flush();
    expect(screen.getByText('new connection')).toBeTruthy();
    await act(async () => old.resolve('old connection'));
    expect(screen.queryByText('old connection')).toBeNull();
    view.rerender(tree(false));
    view.rerender(tree(true));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByText('new connection')).toBeTruthy();
  },
);

it('evicts stored reports when unmounted without invalidating other projects', async () => {
  const tree = (show: boolean) => (
    <WorkspaceCacheProvider>
      <Invalidate />
      {show ? (
        <>
          <Report />
          <Report id='10' />
        </>
      ) : null}
    </WorkspaceCacheProvider>
  );
  const view = render(tree(true));
  await flush();
  view.rerender(tree(false));
  expect(sessionStorage.getItem('nr-cache:data-view:website:1')).not.toBeNull();
  fireEvent.click(screen.getByText('Invalidate'));
  expect(sessionStorage.getItem('nr-cache:data-view:website:1')).toBeNull();
  expect(
    sessionStorage.getItem('nr-cache:data-view:website:10'),
  ).not.toBeNull();
  view.rerender(tree(true));
  await flush();
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('reuses polled results across page and browser tab switches until they expire', async () => {
  const view = setup();
  await flush();
  await visible('hidden');
  await visible('visible');
  view.show(false);
  view.show();
  expect(screen.getByText('visitors')).toBeTruthy();
  await flush();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await visible('hidden');
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(fetcher).toHaveBeenCalledTimes(1);
  await visible('visible');
  expect(fetcher).toHaveBeenCalledTimes(2);
  await visible('visible');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('does not fetch on a hidden initial mount, and refreshes on the visible interval', async () => {
  await visible('hidden');
  setup();
  await act(async () => vi.advanceTimersByTimeAsync(120000));
  expect(fetcher).not.toHaveBeenCalled();
  await visible('visible');
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('schedules the next poll from cache expiry after a slow response and a remount', async () => {
  const slow = Promise.withResolvers<string>();
  fetcher.mockReturnValueOnce(slow.promise).mockResolvedValue('updated');
  const view = setup();
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  await act(async () => slow.resolve('visitors'));
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  view.show(false);
  view.show();
  await flush();
  await act(async () => vi.advanceTimersByTimeAsync(49999));
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByText('updated')).toBeTruthy();
});

it('shares a pending poll after remount and does not overlap slow reads', async () => {
  const slow = Promise.withResolvers<string>();
  fetcher.mockReturnValue(slow.promise);
  const view = setup();
  await flush();
  await act(async () => vi.advanceTimersByTimeAsync(120000));
  await visible('visible');
  view.show(false);
  view.show();
  await flush();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => slow.resolve('done'));
  expect(screen.getByText('done')).toBeTruthy();
});

it('keeps the last successful poll on failure and backs off across visibility and navigation events', async () => {
  const view = setup();
  await flush();
  fetcher.mockRejectedValue(new Error('quota exceeded'));
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(screen.getByText('visitors: failed')).toBeTruthy();
  await visible('hidden');
  await visible('visible');
  view.show(false);
  view.show();
  await flush();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByText('visitors: failed')).toBeTruthy();
  fetcher.mockResolvedValue('recovered');
  await act(async () => vi.advanceTimersByTimeAsync(60000));
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(screen.getByText('recovered')).toBeTruthy();
});

it('does not show a previous project or its late response after switching projects', async () => {
  const slow = Promise.withResolvers<string>();
  fetcher.mockReturnValueOnce(slow.promise).mockResolvedValue('project two');
  const view = setup();
  await flush();
  view.show(true, '2');
  expect(screen.getByText('loading')).toBeTruthy();
  await flush();
  await act(async () => slow.resolve('project one'));
  expect(screen.getByText('project two')).toBeTruthy();
  expect(screen.queryByText('project one')).toBeNull();
});

it.each(['session', 'revision'])(
  'invalidates fresh results and fences late reads on %s changes',
  async (change) => {
    const old = Promise.withResolvers<string>();
    fetcher.mockReturnValueOnce(old.promise).mockResolvedValue('new scope');
    const view = setup();
    await flush();
    if (change === 'session')
      auth.session = { user: { id: 'other' }, session: { id: 'other' } };
    else auth.revision++;
    view.show();
    expect(screen.getByText('loading')).toBeTruthy();
    await flush();
    await act(async () => old.resolve('old scope'));
    expect(screen.getByText('new scope')).toBeTruthy();
    view.show(false);
    view.show();
    await flush();
    expect(screen.getByText('new scope')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);
