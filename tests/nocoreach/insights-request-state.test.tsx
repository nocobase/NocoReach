import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import english from '../../shared/i18n/en.json';
import chinese from '../../shared/i18n/zh.json';
import { GOOGLE_PROGRESS_CACHE_MS } from '../../shared/google-cache';
import StrategyPage from '../../client/pages/strategy/index';
import DataGitHub from '../../client/pages/data-github';
import { NocoReachHttpError } from '../../client/lib/nocoreach-api';
import { WorkspaceCacheProvider } from '../../client/pages/workspace-cache';
import { refreshNavBadges } from '../../client/components/app-shell/nav-badges';

const { action, tasks, fixture } = vi.hoisted(() => ({
  action: vi.fn(),
  tasks: vi.fn(),
  fixture: {
    project: 1,
    session: { user: { id: 'tester' }, session: { id: 'session-a' } },
    revision: 0,
  },
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ session: fixture.session, isPending: false }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => fixture.revision,
  useCan: () => ({ can: true, isPending: false, error: null }),
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({
    project: { id: fixture.project, name: 'Test project', domains: [] },
  }),
  taskRecords: (id: number) => tasks(id),
  useUnsavedWarning: () => {},
}));
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: 'tester' }, mine: () => true, can: () => true }),
  taskOwner: () => 'tester',
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
}));

const requests = {
  tasks,
  metrics: vi.fn(),
  summary: vi.fn(),
  overview: vi.fn(),
};
const blocks = [
  {
    kind: 'tasks',
    title: 'strategy.taskStatus',
    empty: 'strategy.noWaitingTasks',
  },
  {
    kind: 'metrics',
    title: 'strategy.keyMetrics',
    empty: 'strategy.noDataYet',
  },
  {
    kind: 'summary',
    title: 'strategy.currentSituation',
    empty: 'strategy.noCurrentSituation',
  },
] as const;
const values = {
  tasks: [{ id: 1, title: 'Known task', status: 'todo' }],
  metrics: {
    cards: [
      { id: 'gsc', metrics: [{ key: 'clicks', value: 12345, change: null }] },
    ],
  },
  summary: {
    areas: [
      {
        id: 'site',
        title: 'Site',
        items: [
          {
            key: 'known',
            text: 'Known situation',
            values: [],
            source: 'site',
            to: '/website',
          },
        ],
      },
    ],
  },
};
const known = {
  tasks: 'Known task',
  metrics: '12,345',
  summary: 'Known situation',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((r, fail) => {
    resolve = r;
    reject = fail;
  });
  return { promise, resolve, reject };
}
let disconnect: (() => void) | undefined;
beforeEach(() => {
  sessionStorage.clear();
  fixture.project = 1;
  fixture.session.session.id = 'session-a';
  fixture.revision = 0;
  tasks.mockReset().mockResolvedValue([]);
  requests.overview.mockReset().mockResolvedValue({
    state: { revision: 1, goal: null, proposals: [] },
    periodDays: 28,
    availableThrough: null,
  });
  requests.metrics.mockReset().mockResolvedValue({ cards: [] });
  requests.summary.mockReset().mockResolvedValue({ areas: [] });
  action
    .mockReset()
    .mockImplementation(
      async (
        resource: string,
        operation: string,
        options: { body: { projectId: number } },
      ) => {
        if (resource === 'nrStrategy' && operation === 'overview')
          return requests.overview(options.body.projectId);
        if (resource === 'nrStrategy')
          return operation === 'state'
            ? { revision: 1, goal: null, proposals: [] }
            : {
                project: {},
                evidence: { periodDays: 28, availableThrough: null },
              };
        if (resource === 'nrAnalysis')
          return { running: false, last: null, runs: [], schedule: null };
        if (resource === 'nrPlaybooks') return { revision: 1, playbooks: [] };
        if (resource === 'nrHealth') return { items: [] };
        if (resource === 'nrDataViews')
          return requests.metrics(options.body.projectId);
        if (resource === 'nrInsights')
          return requests.summary(options.body.projectId);
        throw new Error(`Unexpected request ${resource}/${operation}`);
      },
    );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  disconnect?.();
  setDictionary(null);
  vi.restoreAllMocks();
});
function Page({ report = false }: { report?: boolean }) {
  useNocoReachLocale();
  return report ? <DataGitHub /> : <StrategyPage />;
}
async function setup(locale = 'en-US', report = false) {
  let visible = true;
  const runtime = new I18nRuntime({
    defaultLocale: locale,
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  const tree = () => (
    <I18nProvider runtime={runtime}>
      <MemoryRouter>
        <WorkspaceCacheProvider>
          {visible && <Page report={report} />}
        </WorkspaceCacheProvider>
      </MemoryRouter>
    </I18nProvider>
  );
  const view = render(tree());
  return {
    rerender: () => view.rerender(tree()),
    show: (next: boolean) => {
      visible = next;
      view.rerender(tree());
    },
  };
}

it('starts independent blocks before the overview returns and never requests the AI context', async () => {
  const pending = deferred<unknown>();
  requests.overview.mockReturnValueOnce(pending.promise);
  await setup();
  await waitFor(() => expect(requests.metrics).toHaveBeenCalledTimes(1));
  expect(requests.summary).toHaveBeenCalledTimes(1);
  expect(tasks).toHaveBeenCalledTimes(1);
  expect(
    action.mock.calls.some(
      ([resource, operation]) =>
        resource === 'nrStrategy' && ['state', 'context'].includes(operation),
    ),
  ).toBe(false);
  await act(async () =>
    pending.resolve({
      state: { revision: 1, goal: null, proposals: [] },
      periodDays: 28,
      availableThrough: '2026-10-18',
    }),
  );
  expect(await screen.findByText(/2026-10-18/)).toBeInTheDocument();
});

it('shows the cached overview and blocks immediately on return while revalidating', async () => {
  requests.overview.mockResolvedValueOnce({
    state: { revision: 1, goal: null, proposals: [] },
    periodDays: 28,
    availableThrough: '2026-10-18',
  });
  tasks.mockResolvedValueOnce(values.tasks);
  const view = await setup();
  await screen.findByText(/Known task/);
  const pending = deferred<unknown>();
  requests.overview.mockReturnValueOnce(pending.promise);
  const pendingTasks = deferred<unknown>();
  tasks.mockReturnValueOnce(pendingTasks.promise);
  // A committed navigation hands its reads to the page for one second.
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1001);
  view.show(false);
  view.show(true);
  expect(screen.getByText(/2026-10-18/)).toBeInTheDocument();
  expect(screen.getByText(/Known task/)).toBeInTheDocument();
  await waitFor(() => expect(requests.overview).toHaveBeenCalledTimes(2));
  await act(async () => {
    pending.resolve({
      state: { revision: 2, goal: null, proposals: [] },
      periodDays: 28,
      availableThrough: '2026-10-19',
    });
    pendingTasks.resolve([]);
  });
  expect(await screen.findByText(/2026-10-19/)).toBeInTheDocument();
  expect(screen.queryByText(/Known task/)).toBeNull();
});

it.each(['project', 'session', 'revision'])(
  'does not expose the previous overview after changing %s',
  async (scope) => {
    requests.overview.mockResolvedValueOnce({
      state: { revision: 1, goal: null, proposals: [] },
      periodDays: 28,
      availableThrough: '2026-10-18',
    });
    const view = await setup();
    await screen.findByText(/2026-10-18/);
    const pending = deferred<unknown>();
    requests.overview.mockReturnValueOnce(pending.promise);
    if (scope === 'project') fixture.project = 2;
    if (scope === 'session') fixture.session.session.id = 'session-b';
    if (scope === 'revision') fixture.revision++;
    view.rerender();
    expect(screen.queryByText(/2026-10-18/)).toBeNull();
    await act(async () =>
      pending.resolve({
        state: { revision: 2, goal: null, proposals: [] },
        periodDays: 28,
        availableThrough: '2026-10-19',
      }),
    );
    expect(await screen.findByText(/2026-10-19/)).toBeInTheDocument();
  },
);

it('removes a cached overview after a forbidden revalidation', async () => {
  requests.overview.mockResolvedValueOnce({
    state: { revision: 1, goal: null, proposals: [] },
    periodDays: 28,
    availableThrough: '2026-10-18',
  });
  const view = await setup();
  await screen.findByText(/2026-10-18/);
  requests.overview.mockRejectedValue(
    new NocoReachHttpError('Denied', 403, {}),
  );
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1001);
  view.show(false);
  view.show(true);
  await screen.findByText(english['strategy.notLoadInsightsTryAgain']);
  expect(screen.queryByText(/2026-10-18/)).toBeNull();
  view.show(false);
  view.show(true);
  expect(screen.queryByText(/2026-10-18/)).toBeNull();
});
for (const block of blocks) {
  it.each(['en-US', 'zh-CN'])(
    `${block.kind}: initial failure is independent and retry restores real empty state (%s)`,
    async (locale) => {
      const copy = locale === 'en-US' ? english : chinese;
      requests[block.kind].mockRejectedValueOnce(
        new Error('private failure details'),
      );
      await setup(locale);
      const section = await screen.findByRole('region', {
        name: copy[block.title],
      });
      expect(await within(section).findByRole('alert')).toHaveTextContent(
        copy['strategy.blockFailed'],
      );
      expect(within(section).queryByText(copy[block.empty])).toBeNull();
      expect(screen.queryByText('private failure details')).toBeNull();
      for (const other of blocks.filter((b) => b.kind !== block.kind)) {
        expect(
          (
            await screen.findAllByRole('region', { name: copy[other.title] })
          )[0],
        ).toHaveAttribute('aria-busy', 'false');
      }
      await userEvent.click(
        within(section).getByRole('button', { name: copy['common.retry'] }),
      );
      await waitFor(() =>
        expect(within(section).queryByRole('alert')).toBeNull(),
      );
      expect(
        within(section).getAllByText(copy[block.empty]).length,
      ).toBeGreaterThan(0);
      expect(requests[block.kind]).toHaveBeenCalledTimes(2);
      for (const other of blocks.filter((b) => b.kind !== block.kind))
        expect(requests[other.kind]).toHaveBeenCalledTimes(1);
    },
  );
  it(`${block.kind}: loading, known data, failed refresh and recovery remain distinct`, async () => {
    const pending = deferred<unknown>();
    requests[block.kind]
      .mockReturnValueOnce(pending.promise)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(values[block.kind]);
    await setup();
    const section = (
      await screen.findAllByRole('region', { name: english[block.title] })
    )[0];
    expect(within(section).getByRole('status')).toHaveTextContent(
      english['common.loadingLoading'],
    );
    expect(within(section).queryByText(english[block.empty])).toBeNull();
    expect(
      within(section).getByRole('button', { name: 'Refresh' }),
    ).toBeDisabled();
    await act(async () => pending.resolve(values[block.kind]));
    expect(
      within(section).getByText(known[block.kind], { exact: false }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(section).getByRole('button', { name: 'Refresh' }),
    );
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      english['strategy.blockStale'],
    );
    expect(
      within(section).getByText(known[block.kind], { exact: false }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(section).getByRole('button', { name: 'Retry' }),
    );
    await waitFor(() =>
      expect(within(section).queryByRole('alert')).toBeNull(),
    );
    expect(
      within(section).getByText(known[block.kind], { exact: false }),
    ).toBeInTheDocument();
  });
}
it.each(['project', 'session', 'revision'])(
  'isolates all known data after a %s change and ignores late responses',
  async (scope) => {
    for (const b of blocks) requests[b.kind].mockResolvedValue(values[b.kind]);
    const view = await setup();
    await screen.findByText('Known situation');
    const late = deferred<unknown>();
    tasks
      .mockReturnValueOnce(late.promise)
      .mockRejectedValue(new Error('new scope unavailable'));
    await userEvent.click(
      within(
        screen.getByRole('region', { name: english['strategy.taskStatus'] }),
      ).getByRole('button', { name: 'Refresh' }),
    );
    requests.metrics.mockRejectedValue(new Error('new scope unavailable'));
    requests.summary.mockRejectedValue(new Error('new scope unavailable'));
    if (scope === 'project') fixture.project = 2;
    if (scope === 'session') fixture.session.session.id = 'session-b';
    if (scope === 'revision') fixture.revision++;
    view.rerender();
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(3));
    await act(async () =>
      late.resolve([{ id: 99, title: 'Late private task', status: 'todo' }]),
    );
    for (const text of [...Object.values(known), 'Late private task'])
      expect(screen.queryByText(text, { exact: false })).toBeNull();
  },
);

it.each(['session', 'revision'])(
  'keeps the committed report while dates are edited, but drops it after a %s change',
  async (scope) => {
    action.mockResolvedValue({ connected: false });
    const view = await setup('en-US', true);
    await screen.findByRole('button', { name: 'Connect GitHub' });
    const dataViewRequests = () =>
      action.mock.calls.filter(([resource]) => resource === 'nrDataViews');
    const initialRequests = dataViewRequests().length;

    await userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(dataViewRequests()).toHaveLength(initialRequests);

    // Custom opens its calendar; a picked day only starts a draft.
    await userEvent.click(
      within(screen.getAllByRole('grid')[0]).getAllByRole('button')[0],
    );
    expect(
      screen.getByRole('button', { name: 'Connect GitHub' }),
    ).toBeInTheDocument();
    // The open calendar announces its months; the report itself shows no loading status.
    expect(
      screen
        .queryAllByRole('status')
        .filter((status) => !status.closest('[data-slot=calendar]')),
    ).toHaveLength(0);
    expect(dataViewRequests()).toHaveLength(initialRequests);

    if (scope === 'session') fixture.session.session.id = 'session-b';
    else fixture.revision++;
    view.rerender();
    expect(screen.queryByRole('button', { name: 'Connect GitHub' })).toBeNull();
    await waitFor(() =>
      expect(dataViewRequests()).toHaveLength(initialRequests + 1),
    );

    await screen.findByRole('button', { name: 'Connect GitHub' });
    expect(dataViewRequests()).toHaveLength(initialRequests + 1);
  },
);

it('does not query custom drafts until a valid range is applied', async () => {
  action.mockResolvedValue({ connected: false });
  await setup('en-US', true);
  await screen.findByRole('button', { name: 'Connect GitHub' });
  const dataViewRequests = () =>
    action.mock.calls.filter(([resource]) => resource === 'nrDataViews');
  const initialRequests = dataViewRequests().length;

  await userEvent.click(screen.getByRole('button', { name: 'Custom' }));
  // The calendar replaces its day buttons when it rerenders, so look them up for each click.
  const days = () =>
    within(screen.getAllByRole('grid')[0]).getAllByRole('button');
  // Each day's cell carries its yyyy-mm-dd date.
  const [from, to] = days()
    .slice(0, 2)
    .map((day) => day.closest('td')!.getAttribute('data-day'));
  await userEvent.click(days()[0]);
  await userEvent.click(days()[1]);
  expect(dataViewRequests()).toHaveLength(initialRequests);

  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() =>
    expect(dataViewRequests()).toHaveLength(initialRequests + 1),
  );
  expect(dataViewRequests().at(-1)?.[2].body).toMatchObject({
    range: 'custom',
    from,
    to,
  });
});

it.each([401, 403, 404])(
  'hides cached content and avoids retry after HTTP %s',
  async (status) => {
    requests.summary
      .mockResolvedValueOnce(values.summary)
      .mockRejectedValueOnce(
        new NocoReachHttpError('private error', status, {}),
      );
    await setup();
    const section = await screen.findByRole('region', {
      name: english['strategy.currentSituation'],
    });
    await within(section).findByText('Known situation');
    await userEvent.click(
      within(section).getByRole('button', { name: 'Refresh' }),
    );
    expect(await within(section).findByRole('alert')).not.toHaveTextContent(
      'private error',
    );
    expect(within(section).queryByText('Known situation')).toBeNull();
    expect(within(section).queryByRole('button', { name: 'Retry' })).toBeNull();
    if (status === 401)
      expect(
        within(section).getByRole('button', {
          name: english['common.signAgain'],
        }),
      ).toBeInTheDocument();
  },
);

for (const block of blocks) {
  it.each([401, 403, 404])(
    `${block.kind}: discards unavailable cached results before a later page visit after HTTP %s`,
    async (status) => {
      const pending = deferred<unknown>();
      requests[block.kind]
        .mockResolvedValueOnce(values[block.kind])
        .mockRejectedValueOnce(
          new NocoReachHttpError('unavailable', status, {}),
        )
        .mockReturnValueOnce(pending.promise);
      const view = await setup();
      let section = (
        await screen.findAllByRole('region', { name: english[block.title] })
      )[0];
      await within(section).findByText(known[block.kind], { exact: false });
      await userEvent.click(
        within(section).getByRole('button', { name: 'Refresh' }),
      );
      await within(section).findByRole('alert');
      expect(
        within(section).queryByText(known[block.kind], { exact: false }),
      ).toBeNull();
      if (block.kind === 'metrics')
        expect(
          sessionStorage.getItem(
            'nr-cache:data-view:overview:1:{"range":"28"}',
          ),
        ).toBeNull();

      // The primary reads succeed again; the section's own revalidation is still pending.
      view.show(false);
      view.show(true);
      if (block.kind === 'metrics') {
        // Cached failures avoid repeated reads during the Google report cooldown,
        // while unavailable report data must remain absent on every visit.
        section = (
          await screen.findAllByRole('region', {
            name: english[block.title],
          })
        )[0];
        await within(section).findByRole('alert');
        expect(requests.metrics).toHaveBeenCalledTimes(2);
        expect(within(section).queryByText(known.metrics)).toBeNull();
        expect(
          sessionStorage.getItem(
            'nr-cache:data-view:overview:1:{"range":"28"}',
          ),
        ).toBeNull();
        const later = Date.now() + GOOGLE_PROGRESS_CACHE_MS;
        vi.spyOn(Date, 'now').mockReturnValue(later);
        view.show(false);
        view.show(true);
      }
      await waitFor(() =>
        expect(requests[block.kind]).toHaveBeenCalledTimes(3),
      );
      section = screen.getAllByRole('region', {
        name: english[block.title],
      })[0];
      expect(within(section).getByRole('status')).toBeInTheDocument();
      expect(
        within(section).queryByText(known[block.kind], { exact: false }),
      ).toBeNull();
      await act(async () => pending.resolve(values[block.kind]));
      expect(
        within(section).getByText(known[block.kind], { exact: false }),
      ).toBeInTheDocument();
    },
  );
}

it.each([401, 403, 404])(
  'a late HTTP %s from the previous session cannot erase the new session cache',
  async (status) => {
    const late = deferred<unknown>();
    requests.metrics.mockReturnValueOnce(late.promise);
    const view = await setup();
    await waitFor(() => expect(requests.metrics).toHaveBeenCalledTimes(1));
    requests.metrics.mockResolvedValue(values.metrics);
    fixture.session.session.id = 'session-b';
    view.rerender();
    await screen.findByText('12,345');
    const key = 'nr-cache:data-view:overview:1:{"range":"28"}';
    const saved = sessionStorage.getItem(key);
    expect(saved).not.toBeNull();
    await act(async () =>
      late.reject(
        new NocoReachHttpError('expired previous session', status, {}),
      ),
    );
    expect(sessionStorage.getItem(key)).toBe(saved);
    expect(screen.getByText('12,345')).toBeInTheDocument();
  },
);

const analysisStatus = (running: boolean) => ({
  running,
  last: null,
  runs: [],
  schedule: null,
});
const analysisReads = () =>
  action.mock.calls.filter(
    ([resource, operation]) =>
      resource === 'nrAnalysis' && operation === 'status',
  );

it('keeps one analysis poll across badge invalidations and publishes completion once', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.mocked(refreshNavBadges).mockClear();
  let running = true;
  const original = action.getMockImplementation()!;
  action.mockImplementation((resource, operation, options) =>
    resource === 'nrAnalysis'
      ? Promise.resolve(analysisStatus(running))
      : original(resource, operation, options),
  );
  await act(async () => {
    await setup();
  });
  expect(analysisReads()).toHaveLength(2);
  for (let i = 0; i < 3; i++)
    await act(async () => {
      window.dispatchEvent(new Event('nocoreach:badges'));
    });
  expect(analysisReads()).toHaveLength(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(analysisReads()).toHaveLength(3);
  running = false;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(analysisReads()).toHaveLength(4);
  expect(
    action.mock.calls.filter(
      ([resource, operation]) =>
        resource === 'nrStrategy' && operation === 'state',
    ),
  ).toHaveLength(1);
  expect(refreshNavBadges).toHaveBeenCalledOnce();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9000);
  });
  expect(analysisReads()).toHaveLength(4);
});

it('aborts a pending initial status and ignores its late running response after leaving', async () => {
  const pending = deferred<unknown>();
  const original = action.getMockImplementation()!;
  action.mockImplementation((resource, operation, options) =>
    resource === 'nrAnalysis'
      ? pending.promise
      : original(resource, operation, options),
  );
  const view = await setup();
  await waitFor(() => expect(analysisReads()).toHaveLength(1));
  const signal = analysisReads()[0][2].signal as AbortSignal;
  view.show(false);
  expect(signal.aborted).toBe(true);
  await act(async () => {
    pending.resolve(analysisStatus(true));
  });
  expect(analysisReads()).toHaveLength(1);
});

it.each(['project', 'session', 'authorization'] as const)(
  'cancels the old poll when the %s boundary changes',
  async (boundary) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const original = action.getMockImplementation()!;
    action.mockImplementation((resource, operation, options) =>
      resource === 'nrAnalysis'
        ? Promise.resolve(analysisStatus(true))
        : original(resource, operation, options),
    );
    let view!: Awaited<ReturnType<typeof setup>>;
    await act(async () => {
      view = await setup();
    });
    const oldSignal = analysisReads()[0][2].signal as AbortSignal;
    if (boundary === 'project') fixture.project = 2;
    if (boundary === 'session')
      fixture.session = { user: { id: 'other' }, session: { id: 'session-b' } };
    if (boundary === 'authorization') fixture.revision++;
    await act(async () => {
      view.rerender();
    });
    expect(oldSignal.aborted).toBe(true);
    const before = analysisReads().length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(analysisReads()).toHaveLength(before + 1);
    expect(analysisReads().at(-1)?.[2].signal).not.toBe(oldSignal);
    view.show(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(analysisReads()).toHaveLength(before + 1);
  },
);

it('ignores a completed analysis state read after switching projects', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.mocked(refreshNavBadges).mockClear();
  const pending = deferred<unknown>();
  const original = action.getMockImplementation()!;
  let reads = 0;
  action.mockImplementation((resource, operation, options) => {
    if (resource === 'nrAnalysis')
      return Promise.resolve(analysisStatus(++reads === 1));
    if (resource === 'nrStrategy' && operation === 'state')
      return pending.promise;
    return original(resource, operation, options);
  });
  let view!: Awaited<ReturnType<typeof setup>>;
  await act(async () => {
    view = await setup();
  });
  const stateRead = action.mock.calls.find(
    ([resource, operation]) =>
      resource === 'nrStrategy' && operation === 'state',
  )!;
  expect(stateRead).toBeDefined();
  fixture.project = 2;
  await act(async () => {
    view.rerender();
  });
  expect(stateRead[2].signal.aborted).toBe(true);
  await act(async () => {
    pending.resolve({ revision: 99, goal: null, proposals: [] });
  });
  expect(refreshNavBadges).not.toHaveBeenCalled();
  expect(
    screen.queryByText(english['strategy.opportunitiesUpdated']),
  ).not.toBeInTheDocument();
});

it('does not start another poll when an initial status returns during a manual run', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const initial = deferred<unknown>();
  const run = deferred<unknown>();
  const original = action.getMockImplementation()!;
  let reads = 0;
  action.mockImplementation((resource, operation, options) => {
    if (resource === 'nrAnalysis')
      return operation === 'run'
        ? run.promise
        : ++reads === 1
          ? initial.promise
          : Promise.resolve(analysisStatus(true));
    return original(resource, operation, options);
  });
  await act(async () => {
    await setup();
  });
  const button = screen.getByRole('button', {
    name: english['strategy.updateAnalysis'],
  });
  await act(async () => {
    button.click();
    button.click();
  });
  expect(
    action.mock.calls.filter(
      ([resource, operation]) =>
        resource === 'nrAnalysis' && operation === 'run',
    ),
  ).toHaveLength(1);
  await act(async () => {
    initial.resolve(analysisStatus(true));
  });
  expect(analysisReads()).toHaveLength(1);
  await act(async () => {
    run.resolve(analysisStatus(true));
  });
  expect(analysisReads()).toHaveLength(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(analysisReads()).toHaveLength(3);
});
