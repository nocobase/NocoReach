import { ApiClientError } from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  cleanup,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';
import SchedulesPage from '../../client/pages/schedules/index.js';
import EditDialog from '../../client/pages/schedules/edit.js';
import HistoryDrawer from '../../client/pages/schedules/history.js';
import { dailyTime, type Schedule } from '../../client/pages/schedules/data.js';

const mocks = vi.hoisted(() => ({ api: { request: vi.fn() }, toast: vi.fn() }));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => mocks.api,
}));
vi.mock('../../client/components/ui/toast.js', () => ({
  toast: { add: mocks.toast },
}));
// Project names for the run history; the workspace cache behind useProjects is not part of this page.
vi.mock('../../client/pages/reach-data.js', () => ({
  useProjects: () => ({ projects: [{ id: 1, name: 'NocoBloom' }] }),
}));
const schedule: Schedule = {
  id: 'schedule-1',
  key: 'nocoreach.daily-analysis',
  title: 'Daily analysis',
  description: 'Server description.',
  cron: '0 9 * * *',
  timezone: 'UTC',
  enabled: true,
  lifecycleState: 'active',
  scheduleStatus: 'active',
  targetState: 'ready',
  runCount: 6,
  completedCount: 5,
  lastRunAt: '2026-10-15T09:00:00Z',
  nextRunAt: '2026-10-16T09:00:00Z',
};
const occurrence = {
  id: 'run-1',
  status: 'succeeded',
  startedAt: '2026-10-15T09:00:00Z',
  finishedAt: '2026-10-15T09:02:00Z',
  resultSummary: { projects: { '1': { ok: true, items: 5 } } },
};
let current: Schedule;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
// jsdom has no layout observer; actual popup layout is checked in the browser.
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterAll(() => {
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  vi.unstubAllGlobals();
});
beforeEach(() => {
  current = { ...schedule };
  mocks.toast.mockReset();
  mocks.api.request
    .mockReset()
    .mockImplementation(
      async ({ path, method }: { path: string; method?: string }) => {
        if (method === 'POST') {
          current = {
            ...current,
            enabled: path.endsWith('/enable'),
            scheduleStatus: path.endsWith('/enable') ? 'active' : 'paused',
          };
          return { data: current };
        }
        if (path.includes('/occurrences'))
          return { data: [occurrence], meta: {} };
        if (path === 'scheduler/schedules/schedule-1') return { data: current };
        return { data: [current], meta: { page: 1, pageSize: 20, total: 1 } };
      },
    );
});
afterEach(cleanup);
async function mount(path = '/schedules', locale = 'en-US') {
  const runtime = await createTestI18nRuntime({
    locale,
    application: {
      namespace: 'nocoreach',
      resources: locale === 'zh-CN' ? zhCN : enUS,
    },
  });
  return render(
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path='/schedules' element={<SchedulesPage />}>
            <Route path=':scheduleId' element={<HistoryDrawer />} />
            <Route path=':scheduleId/edit' element={<EditDialog />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </TestI18nProvider>,
  );
}
const posts = () =>
  mocks.api.request.mock.calls.filter(([r]) => r.method === 'POST');
async function menu(name: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'More actions' }));
  await user.click(await screen.findByRole('menuitem', { name }));
}

describe('automatic runs', () => {
  it('describes the daily analysis in plain words and keeps scheduler states out of the card', async () => {
    await mount('/schedules', 'zh-CN');
    expect(
      await screen.findByRole('heading', { name: '自动运行' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('1 个项目，5 条建议')).toBeInTheDocument();
    expect(screen.getByText('每天 09:00')).toBeInTheDocument();
    expect(screen.getByText('已开启')).toBeInTheDocument();
    expect(screen.getByText(/更新到“洞察”和“机会”/u)).toBeInTheDocument();
    expect(screen.queryByText('0 9 * * *')).toBeNull();
    expect(screen.queryByText('就绪')).toBeNull();
    expect(screen.queryByText('Server description.')).toBeNull();
    // One item: no pagination.
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(
      screen.getByRole('link', { name: '去数据接入查看' }),
    ).toHaveAttribute('href', '/connections');
  });
  it('shows the scheduler details only on request', async () => {
    await mount();
    await menu('Technical details');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('0 9 * * *')).toBeInTheDocument();
    expect(within(dialog).getByText('Ready')).toBeInTheDocument();
    expect(
      within(dialog).getByText('nocoreach.daily-analysis'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('6')).toBeInTheDocument();
  });
  it('asks before pausing, updates the returned state, and turns on without a dialog', async () => {
    await mount();
    await menu('Pause');
    const dialog = await screen.findByRole('alertdialog');
    expect(posts()).toHaveLength(0);
    expect(dialog).toHaveTextContent('A run already started finishes');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pause' }));
    expect(
      await screen.findByText('Paused', { selector: '[data-slot="badge"]' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Paused, no automatic runs')).toBeInTheDocument();
    await menu('Turn on');
    await waitFor(() =>
      expect(mocks.api.request).toHaveBeenCalledWith({
        method: 'POST',
        path: 'scheduler/schedules/schedule-1/enable',
      }),
    );
    expect(
      await screen.findByText('On', { selector: '[data-slot="badge"]' }),
    ).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });
  it('keeps a failed pause in the dialog and prevents duplicate submissions', async () => {
    await mount();
    await menu('Pause');
    let reject!: (error: Error) => void;
    mocks.api.request.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pause' }));
    expect(
      within(dialog).getByRole('button', { name: 'Saving…' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled();
    await act(async () => reject(new Error('private upstream secret')));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'The request failed',
    );
    expect(dialog).not.toHaveTextContent('private upstream secret');
    expect(within(dialog).getByRole('button', { name: 'Pause' })).toBeEnabled();
  });
  it.each([401, 403, 404])(
    'handles HTTP %s without leaking the response or offering retry',
    async (status) => {
      mocks.api.request.mockRejectedValue(
        new ApiClientError('private response', {
          status,
          method: 'GET',
          url: '/fixture',
        }),
      );
      await mount();
      expect(await screen.findByRole('alert')).not.toHaveTextContent(
        'private response',
      );
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      if (status === 401)
        expect(
          screen.getByRole('button', { name: 'Sign in again' }),
        ).toBeInTheDocument();
    },
  );
  it('keeps the list page in overlay links and pages through the server', async () => {
    await mount('/schedules?page=2');
    expect(
      await screen.findByRole('button', { name: 'Run history' }),
    ).toHaveAttribute('href', '/schedules/schedule-1?page=2');
    expect(screen.getByRole('button', { name: 'Change time' })).toHaveAttribute(
      'href',
      '/schedules/schedule-1/edit?page=2',
    );
    expect(mocks.api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'scheduler/schedules?page=2&pageSize=20',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() =>
      expect(mocks.api.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'scheduler/schedules?page=1&pageSize=20',
        }),
      ),
    );
  });
  it('opens the run history by project name, loads the opaque cursor, and clears extra records on refresh', async () => {
    const defaultImplementation = mocks.api.request.getMockImplementation()!;
    mocks.api.request.mockImplementation((input) => {
      if (input.path.includes('/occurrences?pageSize=20'))
        return Promise.resolve(
          input.path.includes('pageToken=')
            ? {
                data: [
                  {
                    ...occurrence,
                    id: 'run-2',
                    status: 'failed',
                    reason: 'Model unavailable',
                    resultSummary: {},
                  },
                ],
                meta: {},
              }
            : { data: [occurrence], meta: { nextPageToken: 'opaque+cursor/' } },
        );
      return defaultImplementation(input);
    });
    await mount('/schedules/schedule-1');
    const drawer = await screen.findByRole('dialog');
    expect(
      await within(drawer).findByText('Daily analysis · Run history'),
    ).toBeInTheDocument();
    expect(await within(drawer).findByText('NocoBloom')).toBeInTheDocument();
    expect(within(drawer).getByText('5 suggestions')).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Load more' }));
    expect(
      await within(drawer).findByText('Model unavailable'),
    ).toBeInTheDocument();
    expect(mocks.api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'scheduler/schedules/schedule-1/occurrences?pageSize=20&pageToken=opaque%2Bcursor%2F',
      }),
    );
    fireEvent.click(within(drawer).getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(within(drawer).queryByText('Model unavailable')).toBeNull(),
    );
    expect(
      await within(drawer).findByRole('button', { name: 'Load more' }),
    ).toBeInTheDocument();
  });
  it.each([401, 403, 404])(
    'hides the whole run history when pagination returns %s',
    async (status) => {
      const original = mocks.api.request.getMockImplementation()!;
      mocks.api.request.mockImplementation((input) => {
        if (input.path.includes('pageToken='))
          return Promise.reject(
            new ApiClientError('denied', {
              status,
              method: 'GET',
              url: '/fixture',
            }),
          );
        if (input.path.includes('/occurrences?pageSize=20'))
          return Promise.resolve({
            data: [occurrence],
            meta: { nextPageToken: 'next' },
          });
        return original(input);
      });
      await mount('/schedules/schedule-1');
      const drawer = await screen.findByRole('dialog');
      await within(drawer).findByText('5 suggestions');
      fireEvent.click(
        within(drawer).getByRole('button', { name: 'Load more' }),
      );
      await within(drawer).findByRole('alert');
      expect(within(drawer).queryByText('5 suggestions')).toBeNull();
      expect(
        within(drawer).queryByText('Daily analysis · Run history'),
      ).toBeNull();
    },
  );
  it('clears the cards when a refresh reports revoked access', async () => {
    await mount();
    await screen.findByText('Daily analysis');
    mocks.api.request.mockRejectedValue(
      new ApiClientError('denied', {
        status: 403,
        method: 'GET',
        url: '/fixture',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Daily analysis')).toBeNull();
  });
  it('reloads the list and ends the confirmation when the task was removed', async () => {
    await mount();
    await menu('Pause');
    const dialog = await screen.findByRole('alertdialog');
    const defaultImplementation = mocks.api.request.getMockImplementation()!;
    mocks.api.request.mockImplementation((input) => {
      if (input.method === 'POST')
        return Promise.reject(
          new ApiClientError('gone', {
            status: 404,
            method: 'POST',
            url: '/fixture',
          }),
        );
      if (input.path.startsWith('scheduler/schedules?'))
        return Promise.resolve({
          data: [],
          meta: { page: 1, pageSize: 20, total: 0 },
        });
      return defaultImplementation(input);
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pause' }));
    expect(await screen.findByText('No automatic runs')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('shows the empty state and offers nothing for a definition the application dropped', async () => {
    mocks.api.request.mockResolvedValueOnce({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    const view = await mount();
    expect(await screen.findByText('No automatic runs')).toBeInTheDocument();
    view.unmount();
    current = {
      ...current,
      enabled: false,
      lifecycleState: 'inactive',
      scheduleStatus: 'paused',
    };
    await mount();
    await screen.findByText('Daily analysis');
    expect(screen.queryByRole('button', { name: 'Change time' })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      await screen.findByRole('menuitem', { name: 'Turn on' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Run now' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
  it('ignores the old page response after navigation', async () => {
    const defaultImplementation = mocks.api.request.getMockImplementation()!;
    let finishOld!: (value: unknown) => void;
    let pending = false;
    mocks.api.request.mockImplementation((input) => {
      if (pending && input.path.startsWith('scheduler/schedules?')) {
        pending = false;
        return new Promise((resolve) => {
          finishOld = resolve;
        });
      }
      return defaultImplementation(input);
    });
    await mount('/schedules?page=2');
    await screen.findByText('Daily analysis');
    pending = true;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    const oldSignal = mocks.api.request.mock.calls.findLast(([r]) =>
      r.path.startsWith('scheduler/schedules?'),
    )![0].signal as AbortSignal;
    // Navigation can happen through links or browser back while a refresh is pending.
    cleanup();
    await mount('/schedules?page=1');
    await screen.findByText('Daily analysis');
    await act(async () =>
      finishOld({
        data: [{ ...schedule, title: 'Stale private task' }],
        meta: { page: 2, pageSize: 20, total: 21 },
      }),
    );
    expect(oldSignal.aborted).toBe(true);
    expect(screen.queryByText('Stale private task')).toBeNull();
  });
  it('aborts a pending request on unmount', async () => {
    mocks.api.request.mockImplementation(() => new Promise(() => {}));
    const view = await mount();
    const signal = mocks.api.request.mock.calls[0]![0].signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});

it('changes the time from a deep link, starting from the server, and shows the new time on the card', async () => {
  const defaultRequest = mocks.api.request.getMockImplementation()!;
  mocks.api.request.mockImplementation(async (options) => {
    if (options.method === 'PUT') {
      expect(options.json).toEqual({ time: '14:30', timezone: 'UTC' });
      current = { ...current, cron: '30 14 * * *' };
      return { data: current };
    }
    return defaultRequest(options);
  });
  await mount('/schedules/schedule-1/edit?page=2', 'zh-CN');
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('修改“Daily analysis”的时间');
  const input = await within(dialog).findByLabelText('每天');
  expect(input).toHaveValue('09:00');
  // UTC midnight in UTC: when most sources update.
  expect(dialog).toHaveTextContent('多数数据源每天约 00:00 更新');
  fireEvent.change(input, { target: { value: '14:30' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(await screen.findByText('每天 14:30')).toBeInTheDocument();
  expect(
    mocks.api.request.mock.calls.filter(([r]) => r.method === 'PUT'),
  ).toHaveLength(1);
});

it('rejects an invalid time without saving and keeps server details out of a failed save', async () => {
  const defaultRequest = mocks.api.request.getMockImplementation()!;
  mocks.api.request.mockImplementation(async (options) => {
    if (options.method === 'PUT') throw new Error('private stack');
    return defaultRequest(options);
  });
  await mount('/schedules/schedule-1/edit');
  const dialog = await screen.findByRole('dialog');
  const input = await within(dialog).findByLabelText('Every day at');
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Enter a valid time',
  );
  expect(
    mocks.api.request.mock.calls.filter(([r]) => r.method === 'PUT'),
  ).toHaveLength(0);
  fireEvent.change(input, { target: { value: '07:15' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(
    await within(dialog).findByText('The request failed. Try again.'),
  ).toBeInTheDocument();
  expect(dialog).not.toHaveTextContent('private stack');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('confirms a manual run and reuses its request id after an uncertain failure', async () => {
  const defaultRequest = mocks.api.request.getMockImplementation()!;
  const ids: string[] = [];
  mocks.api.request.mockImplementation(async (options) => {
    if (options.path.endsWith('/trigger')) {
      ids.push(options.json.requestId);
      if (ids.length === 1) throw new Error('private token');
      return { data: { occurrenceId: 'manual-1' } };
    }
    return defaultRequest(options);
  });
  await mount();
  await menu('Run now');
  expect(ids).toHaveLength(0);
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Run now' }));
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: 'Run now' }),
    ).not.toBeDisabled(),
  );
  expect(screen.queryByText('private token')).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Run now' }));
  await waitFor(() => expect(ids).toHaveLength(2));
  expect(ids[0]).toBe(ids[1]);
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
  );
});

it('searches timezones, names them plainly, and saves the selection', async () => {
  const defaultRequest = mocks.api.request.getMockImplementation()!;
  current = { ...current, timezone: 'America/New_York' };
  mocks.api.request.mockImplementation(async (options) => {
    if (options.method === 'PUT') {
      expect(options.json).toEqual({
        time: '09:00',
        timezone: 'Asia/Shanghai',
      });
      current = {
        ...current,
        timezone: 'Asia/Shanghai',
        nextRunAt: '2026-10-17T01:00:00Z',
      };
      return { data: current };
    }
    return defaultRequest(options);
  });
  await mount('/schedules/schedule-1/edit');
  const picker = await screen.findByRole('combobox', { name: 'Timezone' });
  expect(picker).toHaveTextContent('Eastern Time · America/New_York');
  fireEvent.click(picker);
  const search = await screen.findByPlaceholderText(
    'Search timezones, e.g. Shanghai',
  );
  fireEvent.change(search, { target: { value: 'Shanghai' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Asia/Shanghai' }));
  expect(picker).toHaveTextContent('China Standard Time · Asia/Shanghai');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(await screen.findByText('China Standard Time')).toBeInTheDocument();
});

it('reads the daily time from five- and six-field crons only', () => {
  expect(dailyTime('0 9 * * *')).toBe('09:00');
  expect(dailyTime('0 30 7 * * *')).toBe('07:30');
  expect(dailyTime('*/5 * * * *')).toBeNull();
  expect(dailyTime('0 9 * * 1')).toBeNull();
});
