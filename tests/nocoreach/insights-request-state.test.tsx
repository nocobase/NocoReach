import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import {
  act,
  cleanup,
  fireEvent,
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
import StrategyPage from '../../client/pages/strategy/index';
import DataGitHub from '../../client/pages/data-github';
import { NocoReachHttpError } from '../../client/lib/nocoreach-api';
import { WorkspaceCacheProvider } from '../../client/pages/workspace-cache';

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

const requests = { tasks, metrics: vi.fn(), summary: vi.fn() };
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
  disconnect?.();
  setDictionary(null);
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
  'keeps a paused report while dates are edited, but drops it after a %s change',
  async (scope) => {
    action.mockResolvedValue({ connected: false });
    const view = await setup('en-US', true);
    await screen.findByRole('button', { name: 'Connect GitHub' });
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: 'Connect GitHub' });

    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '' },
    });
    expect(
      screen.getByRole('button', { name: 'Connect GitHub' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(action).toHaveBeenCalledTimes(2);

    if (scope === 'session') fixture.session.session.id = 'session-b';
    else fixture.revision++;
    view.rerender();
    expect(screen.queryByRole('button', { name: 'Connect GitHub' })).toBeNull();
    expect(action).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole('button', { name: 'Last 28 days' }));
    await screen.findByRole('button', { name: 'Connect GitHub' });
    expect(action).toHaveBeenCalledTimes(3);
  },
);

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
