import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { GoogleConnection } from '../../client/pages/google-connection';
import SearchPage from '../../client/pages/search-performance';
import {
  useFreshData,
  useWorkspaceCache,
  WorkspaceCacheProvider,
} from '../../client/pages/workspace-cache';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
const f = vi.hoisted(() => ({
  action: vi.fn(),
  project: 1,
  user: 'test',
  session: 'test-session',
  revision: 1,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    isPending: false,
    session: { user: { id: f.user }, session: { id: f.session } },
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => f.revision,
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action: f.action, wrapRequests: vi.fn() },
}));
vi.mock('../../client/pages/reach-data', () => ({
  useUnsavedWarning: () => {},
  useProject: () => ({
    project: { id: f.project, name: 'Test', domains: ['example.invalid'] },
  }),
}));
vi.mock('../../client/pages/hand-off-bar', () => ({ HandOffBar: () => null }));
vi.mock('../../client/pages/analytics', () => ({ safeLink: (v: string) => v }));
vi.mock('../../client/pages/sync-panel', () => ({ SyncPanel: () => null }));
vi.mock('../../client/components/reach/confirm', () => ({
  confirmAction: async () => true,
}));
const connect = () =>
  screen.queryByRole('button', {
    name: english['searchPerformance.connectSearchConsole'],
  });
const noData = () =>
  screen.queryByText(english['searchPerformance.searchConsoleConnected']);
function setup() {
  const tree = (visible = true) => (
    <MemoryRouter>
      <WorkspaceCacheProvider>
        {visible ? <SearchPage /> : null}
      </WorkspaceCacheProvider>
    </MemoryRouter>
  );
  const view = render(tree());
  return { ...view, show: (visible = true) => view.rerender(tree(visible)) };
}
const calls = () => f.action.mock.calls.filter((x) => x[1] === 'search');
beforeEach(() => {
  window.history.replaceState({}, '', '/');
  sessionStorage.clear();
  localStorage.clear();
  setDictionary(english);
  f.project = 1;
  f.user = 'test';
  f.session = 'test-session';
  f.revision = 1;
  f.action.mockReset();
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});
it('fresh load: pending and failure never show connect', async () => {
  const pending = Promise.withResolvers();
  f.action.mockReturnValue(pending.promise);
  setup();
  expect(connect()).toBeNull();
  await act(async () => pending.reject(new Error('Synthetic unavailable')));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Synthetic unavailable',
  );
  expect(connect()).toBeNull();
});
it('negative cache is hidden during refresh and failure', async () => {
  f.action.mockResolvedValue({ connected: false });
  const view = setup();
  await waitFor(() => expect(connect()).not.toBeNull());
  view.show(false);
  const pending = Promise.withResolvers();
  f.action.mockReturnValue(pending.promise);
  view.show();
  expect(calls()).toHaveLength(2);
  expect(connect()).toBeNull();
  await act(async () => pending.reject(new Error('Synthetic unavailable')));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Synthetic unavailable',
  );
  expect(connect()).toBeNull();
});
it('return after connection: stale negative is replaced when fresh response succeeds', async () => {
  f.action.mockResolvedValue({ connected: false });
  const view = setup();
  await waitFor(() => expect(connect()).not.toBeNull());
  view.show(false);
  f.action.mockResolvedValue({ connected: true, cutoff: null });
  view.show();
  await waitFor(() => expect(noData()).not.toBeNull());
  expect(connect()).toBeNull();
  expect(calls()).toHaveLength(2);
});
it('restoring visibility revalidates mounted Google reports', async () => {
  f.action.mockResolvedValue({ connected: false });
  setup();
  await waitFor(() => expect(connect()).not.toBeNull());
  f.action.mockResolvedValue({ connected: true, cutoff: null });
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(calls()).toHaveLength(2);
  expect(noData()).not.toBeNull();
});
it('different project key hides old negative while fetching new project', async () => {
  f.action.mockResolvedValue({ connected: false });
  const view = setup();
  await waitFor(() => expect(connect()).not.toBeNull());
  const pending = Promise.withResolvers();
  f.action.mockReturnValue(pending.promise);
  f.project = 2;
  view.show();
  expect(connect()).toBeNull();
  expect(calls().at(-1)?.[2].body.projectId).toBe(2);
  await act(async () => pending.resolve({ connected: true, cutoff: null }));
  expect(noData()).not.toBeNull();
});
it('connected with data renders report instead of connect', async () => {
  f.action.mockImplementation(async (_r, a) =>
    a === 'searchCountries'
      ? { countries: [] }
      : {
          connected: true,
          cutoff: '2026-10-10',
          window: {
            start: '2026-10-10',
            end: '2026-10-10',
            days: 1,
            previousStart: '2026-10-09',
            previousEnd: '2026-10-09',
          },
          totals: { clicks: 42, impressions: 100, ctr: 0.42, position: 3 },
          trend: [],
          striking: [],
          queries: { rows: [], total: 0 },
          pages: { rows: [], total: 0 },
        },
  );
  setup();
  await screen.findByText('42');
  expect(connect()).toBeNull();
  expect(noData()).toBeNull();
});

it.each(['success', 'failure'])(
  'abandoned request late %s cannot replace a fresh report',
  async (mode) => {
    const old = Promise.withResolvers();
    f.action.mockReturnValue(old.promise);
    const view = setup();
    expect(calls()).toHaveLength(1);
    view.show(false);
    await act(async () => {});
    f.action.mockResolvedValue({ connected: true, cutoff: null });
    view.show();
    await waitFor(() => expect(noData()).not.toBeNull());
    expect(calls()).toHaveLength(2);
    await act(async () => {
      if (mode === 'success') old.resolve({ connected: false });
      else old.reject(new Error('Late failure'));
    });
    expect(connect()).toBeNull();
    expect(noData()).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  },
);

function RefreshControl() {
  const cache = useWorkspaceCache();
  return (
    <button onClick={() => cache.invalidateGoogleReports(String(f.project))}>
      Invalidate Google
    </button>
  );
}
it.each(['success', 'failure'])(
  'project invalidation rejects old late %s without overriding the refreshed state',
  async (mode) => {
    const old = Promise.withResolvers();
    f.action.mockReturnValue(old.promise);
    render(
      <MemoryRouter>
        <WorkspaceCacheProvider>
          <RefreshControl />
          <SearchPage />
        </WorkspaceCacheProvider>
      </MemoryRouter>,
    );
    f.action.mockResolvedValue({ connected: true, cutoff: null });
    await act(async () => screen.getByText('Invalidate Google').click());
    await waitFor(() => expect(noData()).not.toBeNull());
    expect(calls()).toHaveLength(2);
    await act(async () => {
      if (mode === 'success') old.resolve({ connected: false });
      else old.reject(new Error('Late failure'));
    });
    expect(noData()).not.toBeNull();
    expect(connect()).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  },
);
function Probe({
  enabled = true,
  google = true,
}: {
  enabled?: boolean;
  google?: boolean;
}) {
  const result = useFreshData<string>(
    enabled ? 'data-view:search:1:probe' : null,
    () => f.action('probe'),
    google ? 1 : undefined,
  );
  return <span data-testid='probe'>{JSON.stringify(result)}</span>;
}
it('disabled keys do not retain prior data or errors', async () => {
  f.action.mockResolvedValue('old');
  const tree = (enabled: boolean) => (
    <WorkspaceCacheProvider>
      <Probe enabled={enabled} />
    </WorkspaceCacheProvider>
  );
  const view = render(tree(true));
  await screen.findByText(/old/);
  view.rerender(tree(false));
  expect(screen.getByTestId('probe')).toHaveTextContent('{"loading":false}');
});
it('StrictMode and multiple Google subscribers share the valid pending request', async () => {
  const pending = Promise.withResolvers();
  f.action.mockReturnValue(pending.promise);
  const tree = (second: boolean) => (
    <StrictMode>
      <WorkspaceCacheProvider>
        <RefreshControl />
        <Probe />
        {second ? <Probe /> : null}
      </WorkspaceCacheProvider>
    </StrictMode>
  );
  const view = render(tree(true));
  expect(f.action).toHaveBeenCalledTimes(1);
  view.rerender(tree(false));
  await act(async () => {});
  expect(f.action).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve('fresh'));
  expect(screen.getByTestId('probe')).toHaveTextContent('fresh');
  f.action.mockResolvedValue('updated');
  await act(async () => screen.getByText('Invalidate Google').click());
  expect(f.action).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('probe')).toHaveTextContent('updated');
});
it('visibility does not refresh non Google reports', async () => {
  f.action.mockResolvedValue('ordinary');
  render(
    <WorkspaceCacheProvider>
      <Probe google={false} />
    </WorkspaceCacheProvider>,
  );
  await screen.findByText(/ordinary/);
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(f.action).toHaveBeenCalledTimes(1);
});

it.each(['select', 'disconnect', 'authorized'])(
  'Google %s success invalidates reports and notifies project readers',
  async (action) => {
    const saved = vi.fn();
    window.addEventListener('reach-project-saved', saved);
    let connected = false;
    f.action.mockImplementation(async (_r, a) => {
      if (a === 'search') return { connected, cutoff: null };
      if (a === 'status')
        return {
          configured: true,
          authorized: true,
          connection: { status: 'ready_for_sync' },
        };
      if (a === 'resources')
        return {
          analytics: [{ id: f.user, name: 'Synthetic GA4' }],
          searchConsole: [{ id: 'site', name: 'Synthetic GSC' }],
        };
      if (a === 'select' || a === 'disconnect') connected = true;
      return {};
    });
    const tree = (show = false) => (
      <MemoryRouter>
        <WorkspaceCacheProvider>
          <SearchPage />
          {show ? <GoogleConnection projectId='1' /> : null}
        </WorkspaceCacheProvider>
      </MemoryRouter>
    );
    const view = render(tree());
    await waitFor(() => expect(connect()).not.toBeNull());
    if (action === 'authorized') {
      connected = true;
      window.history.replaceState({}, '', '/?google=authorized');
    }
    view.rerender(tree(true));
    if (action === 'select') {
      await screen.findByText(english['google.pickGa4SearchConsole']);
      await act(async () =>
        screen.getByText(english['google.pickGa4SearchConsole']).click(),
      );
      fireEvent.change(
        await screen.findByLabelText(english['google.ga4Property']),
        { target: { value: 'test' } },
      );
      fireEvent.change(
        screen.getByLabelText(english['google.searchConsoleProperty']),
        { target: { value: 'site' } },
      );
      await act(async () =>
        screen.getByText(english['google.confirmResources']).click(),
      );
    } else if (action === 'disconnect') {
      await screen.findByText(english['google.disconnect']);
      await act(async () =>
        screen.getByText(english['google.disconnect']).click(),
      );
    }
    await waitFor(() => expect(noData()).not.toBeNull());
    expect(saved).toHaveBeenCalled();
    expect(connect()).toBeNull();
    window.removeEventListener('reach-project-saved', saved);
  },
);
it('OAuth callback does not invalidate when the status read fails', async () => {
  window.history.replaceState({}, '', '/?google=authorized');
  f.action.mockImplementation(async (_r, a) => {
    if (a === 'status') throw new Error('Synthetic status failure');
    return { connected: false };
  });
  render(
    <MemoryRouter>
      <WorkspaceCacheProvider>
        <SearchPage />
        <GoogleConnection projectId='1' />
      </WorkspaceCacheProvider>
    </MemoryRouter>,
  );
  await waitFor(() => expect(connect()).not.toBeNull());
  await screen.findByText(/Synthetic status failure/);
  expect(calls()).toHaveLength(1);
});

it.each(['user', 'session', 'revision'] as const)(
  'Google reports remain isolated after %s changes',
  async (field) => {
    const old = Promise.withResolvers();
    f.action.mockReturnValue(old.promise);
    const tree = () => (
      <WorkspaceCacheProvider>
        <Probe />
      </WorkspaceCacheProvider>
    );
    const view = render(tree());
    if (field === 'revision') f.revision++;
    else f[field] = 'successor';
    f.action.mockResolvedValue('successor report');
    view.rerender(tree());
    await screen.findByText(/successor report/);
    await act(async () => old.resolve('old private report'));
    expect(screen.getByTestId('probe')).not.toHaveTextContent(
      'old private report',
    );
    expect(
      sessionStorage.getItem('nr-cache:data-view:search:1:probe'),
    ).not.toContain('old private report');
  },
);
it('project invalidation clears stored search and country snapshots but preserves other projects', async () => {
  f.action.mockImplementation(async (_r, a) =>
    a === 'searchCountries'
      ? { countries: [] }
      : {
          connected: true,
          cutoff: '2026-10-10',
          window: { start: '2026-10-10', end: '2026-10-10', days: 1 },
          totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
          queries: { rows: [], total: 0 },
          pages: { rows: [], total: 0 },
          striking: [],
          trend: [],
        },
  );
  render(
    <MemoryRouter>
      <WorkspaceCacheProvider>
        <RefreshControl />
        <SearchPage />
      </WorkspaceCacheProvider>
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(f.action.mock.calls.some((x) => x[1] === 'searchCountries')).toBe(
      true,
    ),
  );
  await act(async () => {});
  sessionStorage.setItem(
    'nr-cache:data-view:search:2:test',
    JSON.stringify({ value: { connected: false }, at: Date.now() }),
  );
  const pending = Promise.withResolvers();
  f.action.mockReturnValue(pending.promise);
  await act(async () => screen.getByText('Invalidate Google').click());
  expect(
    Object.keys(sessionStorage).filter(
      (key) =>
        key.startsWith('nr-cache:data-view:search:1:') ||
        key.startsWith('nr-cache:data-view:search-countries:1:'),
    ),
  ).toHaveLength(0);
  expect(
    sessionStorage.getItem('nr-cache:data-view:search:2:test'),
  ).not.toBeNull();
  await act(async () => pending.resolve({ connected: true, cutoff: null }));
  expect(noData()).not.toBeNull();
});
it('a filtered report with zero results still shows the report and clear filters action', async () => {
  f.action.mockImplementation(async (_r, a) =>
    a === 'searchCountries'
      ? { countries: [] }
      : {
          connected: true,
          cutoff: '2026-10-10',
          filtered: true,
          window: { start: '2026-10-10', end: '2026-10-10', days: 1 },
          totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
          queries: { rows: [], total: 0 },
          pages: { rows: [], total: 0 },
          striking: [],
          trend: [],
        },
  );
  render(
    <MemoryRouter initialEntries={['/?q=missing']}>
      <WorkspaceCacheProvider>
        <SearchPage />
      </WorkspaceCacheProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: english['common.exportCsv'] });
  expect(connect()).toBeNull();
  expect(noData()).toBeNull();
  expect(
    screen.getAllByRole('button', { name: english['common.clearFilters'] })
      .length,
  ).toBeGreaterThan(0);
});
it('OAuth callback status retry invalidates only after a successful authorization confirmation', async () => {
  window.history.replaceState({}, '', '/?google=authorized');
  let statusFails = true;
  f.action.mockImplementation(async (_r, a) => {
    if (a === 'status') {
      if (statusFails) throw new Error('Synthetic status failure');
      return { configured: true, authorized: true, connection: null };
    }
    return { connected: !statusFails, cutoff: null };
  });
  render(
    <MemoryRouter>
      <WorkspaceCacheProvider>
        <SearchPage />
        <GoogleConnection projectId='1' />
      </WorkspaceCacheProvider>
    </MemoryRouter>,
  );
  await screen.findByText(/Synthetic status failure/);
  await waitFor(() => expect(connect()).not.toBeNull());
  statusFails = false;
  await act(async () => screen.getByText(english['common.retry']).click());
  await waitFor(() => expect(noData()).not.toBeNull());
  expect(calls()).toHaveLength(2);
});
it('a queued response cannot persist after the final Google subscriber unmounts', async () => {
  const pending = Promise.withResolvers();
  f.action.mockReturnValue(pending.promise);
  const tree = (show: boolean) => (
    <WorkspaceCacheProvider>{show ? <Probe /> : null}</WorkspaceCacheProvider>
  );
  const view = render(tree(true));
  pending.resolve('abandoned private report');
  view.rerender(tree(false));
  await act(async () => {});
  expect(
    sessionStorage.getItem('nr-cache:data-view:search:1:probe'),
  ).toBeNull();
});
