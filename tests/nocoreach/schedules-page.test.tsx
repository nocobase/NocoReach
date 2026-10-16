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
import { MemoryRouter, Routes, Route } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';
import SchedulesPage from '../../client/pages/schedules/index.js';
import DetailPage from '../../client/pages/schedules/detail.js';
import type { Schedule } from '../../client/pages/schedules/data.js';

const mocks = vi.hoisted(() => ({ api: { request: vi.fn() }, toast: vi.fn() }));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useApiClient: () => mocks.api,
}));
vi.mock('../../client/components/ui/toast.js', () => ({
  toast: { add: mocks.toast },
}));
const schedule: Schedule = {
  id: 'schedule-1',
  key: 'nocoreach.daily-analysis',
  title: 'Daily analysis',
  description: 'Analyse project signals.',
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
            <Route path=':scheduleId' element={<DetailPage />} />
            <Route path=':scheduleId/edit' element={<DetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </TestI18nProvider>,
  );
}

describe('scheduled task management', () => {
  it('shows independent scheduling states and timezone in both languages', async () => {
    await mount('/schedules', 'zh-CN');
    expect(await screen.findByText('已启用')).toBeInTheDocument();
    expect(screen.getByText('UTC')).toBeInTheDocument();
    expect(screen.getByText('就绪')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '定时任务' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Daily analysis' }),
    ).toHaveAttribute('href', '/schedules/schedule-1');
  });
  it('requires confirmation before disabling, updates returned state, and enables without a dialog', async () => {
    await mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(
      mocks.api.request.mock.calls.filter(([r]) => r.method === 'POST'),
    ).toHaveLength(0);
    expect(dialog).toHaveTextContent('Work already started will continue');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }));
    expect(
      await screen.findByText('Disabled', { selector: '[data-slot="badge"]' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
    await waitFor(() =>
      expect(mocks.api.request).toHaveBeenCalledWith({
        method: 'POST',
        path: 'scheduler/schedules/schedule-1/enable',
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Disable' }),
    ).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });
  it('keeps failed disable in the dialog and prevents duplicate submissions', async () => {
    await mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    let reject!: (error: Error) => void;
    mocks.api.request.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }));
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
    expect(
      within(dialog).getByRole('button', { name: 'Disable' }),
    ).toBeEnabled();
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
  it('preserves the list page in detail links and requests real server pages', async () => {
    await mount('/schedules?page=2');
    expect(
      await screen.findByRole('link', { name: 'Daily analysis' }),
    ).toHaveAttribute('href', '/schedules/schedule-1?page=2');
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
  it('opens history directly, loads the opaque cursor, and clears additional records on refresh', async () => {
    const defaultImplementation = mocks.api.request.getMockImplementation()!;
    mocks.api.request.mockImplementation((input) => {
      if (input.path.includes('/occurrences'))
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
    expect(await screen.findByText('5 results')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Model unavailable')).toBeInTheDocument();
    expect(mocks.api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'scheduler/schedules/schedule-1/occurrences?pageSize=20&pageToken=opaque%2Bcursor%2F',
      }),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Refresh' }).at(-1)!);
    await waitFor(() =>
      expect(screen.queryByText('Model unavailable')).toBeNull(),
    );
    expect(
      await screen.findByRole('button', { name: 'Load more' }),
    ).toBeInTheDocument();
  });
  it.each([401, 403, 404])(
    'hides the entire detail when pagination returns %s',
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
        if (input.path.includes('/occurrences'))
          return Promise.resolve({
            data: [occurrence],
            meta: { nextPageToken: 'next' },
          });
        return original(input);
      });
      await mount('/schedules/schedule-1');
      await screen.findByText('5 results');
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      await screen.findByRole('alert');
      expect(
        screen.queryByRole('heading', { name: 'Daily analysis' }),
      ).toBeNull();
      expect(screen.queryByText('5 results')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull();
    },
  );
  it('clears displayed records when a refresh reports revoked access', async () => {
    await mount();
    await screen.findByText('Ready');
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
  it('keeps a confirmed disable action fixed when refresh changes enabled state', async () => {
    const defaultImplementation = mocks.api.request.getMockImplementation()!;
    await mount();
    await screen.findByText('Ready');
    let resolveRefresh!: (value: unknown) => void;
    mocks.api.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    const dialog = await screen.findByRole('alertdialog');
    current = { ...current, enabled: false, scheduleStatus: 'paused' };
    await act(async () =>
      resolveRefresh({
        data: [current],
        meta: { page: 1, pageSize: 20, total: 1 },
      }),
    );
    mocks.api.request.mockImplementation(defaultImplementation);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }));
    await waitFor(() =>
      expect(mocks.api.request).toHaveBeenCalledWith({
        method: 'POST',
        path: 'scheduler/schedules/schedule-1/disable',
      }),
    );
    expect(
      mocks.api.request.mock.calls.filter(([r]) => r.path.endsWith('/enable')),
    ).toHaveLength(0);
  });
  it('reloads the list and ends the confirmation when the task was removed', async () => {
    await mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    const dialog = await screen.findByRole('alertdialog');
    mocks.api.request
      .mockRejectedValueOnce(
        new ApiClientError('gone', {
          status: 404,
          method: 'POST',
          url: '/fixture',
        }),
      )
      .mockResolvedValueOnce({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }));
    expect(await screen.findByText('No scheduled tasks')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull();
  });
  it('retains history and keeps refresh disabled until both reads finish', async () => {
    const defaultImplementation = mocks.api.request.getMockImplementation()!;
    await mount('/schedules/schedule-1');
    await screen.findByText('5 results');
    let resolveHistory!: (value: unknown) => void;
    mocks.api.request.mockImplementation((input) =>
      input.path.includes('/occurrences')
        ? new Promise((resolve) => {
            resolveHistory = resolve;
          })
        : defaultImplementation(input),
    );
    const refresh = screen.getAllByRole('button', { name: 'Refresh' }).at(-1)!;
    fireEvent.click(refresh);
    await waitFor(() => expect(resolveHistory).toBeDefined());
    expect(screen.getByText('5 results')).toBeInTheDocument();
    expect(refresh).toBeDisabled();
    await act(async () => resolveHistory({ data: [], meta: {} }));
    expect(await screen.findByText('No execution history')).toBeInTheDocument();
    expect(refresh).toBeEnabled();
  });
  it('shows empty states and disables inactive definitions', async () => {
    mocks.api.request.mockResolvedValueOnce({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
    const view = await mount();
    expect(await screen.findByText('No scheduled tasks')).toBeInTheDocument();
    view.unmount();
    current = {
      ...current,
      enabled: false,
      lifecycleState: 'inactive',
      scheduleStatus: 'paused',
    };
    await mount();
    expect(
      await screen.findByRole('button', { name: 'Enable' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/no longer defined by the application/u),
    ).toBeInTheDocument();
  });
  it('ignores the old page response after navigation', async () => {
    const defaultImplementation = mocks.api.request.getMockImplementation()!;
    let finishOld!: (value: unknown) => void;
    let calls = 0;
    mocks.api.request.mockImplementation((input) => {
      calls += 1;
      if (calls === 2)
        return new Promise((resolve) => {
          finishOld = resolve;
        });
      return defaultImplementation(input);
    });
    await mount('/schedules?page=2');
    await screen.findByText('Ready');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    // Navigation can happen through links/browser back even while refresh is pending.
    const oldSignal = mocks.api.request.mock.calls[1]![0].signal as AbortSignal;
    cleanup();
    await mount('/schedules?page=1');
    await screen.findByText('Ready');
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

it('edits a fresh daily time through a deep link and keeps server details out of errors', async () => {
  const defaultRequest = mocks.api.request.getMockImplementation()!;
  mocks.api.request.mockImplementation(async (options) => {
    if (options.method === 'PUT') {
      expect(options.json).toEqual({ time: '14:30' });
      current = { ...current, cron: '30 14 * * *' };
      return { data: current };
    }
    return defaultRequest(options);
  });
  await mount('/schedules/schedule-1/edit?page=2', 'zh-CN');
  const input = await screen.findByLabelText('每日执行时间');
  expect(input).toHaveValue('09:00');
  fireEvent.change(input, { target: { value: '14:30' } });
  fireEvent.click(screen.getByRole('button', { name: '保存时间' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect((await screen.findAllByText('30 14 * * *')).length).toBeGreaterThan(0);
  expect(
    mocks.api.request.mock.calls.filter(([r]) => r.method === 'PUT'),
  ).toHaveLength(1);
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
  await mount('/schedules/schedule-1');
  fireEvent.click(await screen.findByRole('button', { name: 'Run now' }));
  expect(ids).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm run' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Confirm run' }),
    ).not.toBeDisabled(),
  );
  expect(screen.queryByText('private token')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm run' }));
  await waitFor(() => expect(ids).toHaveLength(2));
  expect(ids[0]).toBe(ids[1]);
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
  );
});

it('exposes time editing directly from the task list and opens the prefilled editor', async () => {
  await mount('/schedules?page=2', 'zh-CN');
  const edit = await screen.findByRole('button', { name: '编辑时间' });
  expect(edit).toHaveAttribute('href', '/schedules/schedule-1/edit?page=2');
  fireEvent.click(edit);
  expect(await screen.findByLabelText('每日执行时间')).toHaveValue('09:00');
});
