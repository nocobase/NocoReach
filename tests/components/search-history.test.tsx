import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SearchHistory } from '#pages/search-performance/history';
import type { SearchReport } from '#pages/search-performance/index';

const state = vi.hoisted(() => ({ role: 'member', action: vi.fn() }));
vi.mock('#pages/me', () => ({ useMe: () => ({ me: { role: state.role } }) }));
vi.mock('#lib/nocoreach-api', () => ({
  nocobaseClient: { action: state.action },
}));
beforeEach(() => {
  state.role = 'member';
  state.action.mockReset().mockResolvedValue({ jobs: [] });
});
afterEach(() => vi.useRealTimers());
const period = {
  start: '2026-10-01',
  end: '2026-10-07',
  days: 7,
  recordedDays: 2,
  noRecordDays: 1,
  missingDays: 4,
  records: [{ start: '2026-10-06', end: '2026-10-07' }],
  noRecords: [{ start: '2026-10-05', end: '2026-10-05' }],
  missing: [{ start: '2026-10-01', end: '2026-10-04' }],
  updatedAt: null,
};
const report: SearchReport = {
  connected: true,
  complete: false,
  window: { ...period, previousStart: '2026-09-24', previousEnd: '2026-09-30' },
  coverage: {
    current: period,
    previous: { ...period, start: '2026-09-24', end: '2026-09-30' },
  },
  history: { scheduleEnabled: false, jobs: [] },
};
it('shows partial coverage, no records and the administrator requirement without a member write', () => {
  render(<SearchHistory projectId={1} report={report} reload={vi.fn()} />);
  expect(screen.getByText(/已取得数据合计/)).toBeTruthy();
  expect(
    screen.getByText(/有记录 2 天.*无记录 1 天.*尚未获取 4 天/),
  ).toBeTruthy();
  expect(screen.getByText(/不视为零流量/)).toBeTruthy();
  expect(screen.getByText(/请管理员打开此范围/)).toBeTruthy();
  expect(screen.getByText(/定时同步已关闭/)).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(state.action).not.toHaveBeenCalled();
});
it('automatically fills current before previous, and polling reads without enqueueing again', async () => {
  state.role = 'admin';
  const reload = vi.fn();
  const view = render(
    <SearchHistory
      projectId={1}
      property='one'
      report={report}
      reload={reload}
    />,
  );
  await waitFor(() => expect(state.action).toHaveBeenCalledTimes(2));
  expect(state.action.mock.calls.map((c) => c[2].body)).toEqual([
    {
      projectId: 1,
      scope: 'gscOverview',
      startDate: period.start,
      endDate: period.end,
      mode: 'missing',
    },
    {
      projectId: 1,
      scope: 'gscOverview',
      startDate: '2026-09-24',
      endDate: '2026-09-30',
      mode: 'missing',
    },
  ]);
  vi.useFakeTimers();
  view.rerender(
    <SearchHistory
      projectId={1}
      property='one'
      report={{
        ...report,
        history: {
          scheduleEnabled: true,
          jobs: [
            {
              id: '1',
              status: 'running',
              startDate: period.start,
              endDate: period.end,
            },
          ],
        },
      }}
      reload={reload}
    />,
  );
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(reload).toHaveBeenCalledTimes(3);
  expect(state.action).toHaveBeenCalledTimes(2);
  view.rerender(
    <SearchHistory
      projectId={1}
      property='one'
      report={report}
      reload={reload}
    />,
  );
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(reload).toHaveBeenCalledTimes(3);
});
it('shows failed and paused work with explicit retry/resume, retaining the coverage', async () => {
  state.role = 'admin';
  const failed = {
    ...report,
    history: {
      scheduleEnabled: true,
      jobs: [
        {
          id: '1',
          status: 'failed',
          startDate: period.start,
          endDate: period.end,
        },
      ],
    },
  };
  const view = render(
    <SearchHistory projectId={1} report={failed} reload={vi.fn()} />,
  );
  await waitFor(() => expect(state.action).toHaveBeenCalledTimes(2));
  expect(screen.getByText(/旧数据已保留/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(state.action).toHaveBeenLastCalledWith(
    'nrGoogle',
    'syncControl',
    expect.objectContaining({ body: { projectId: 1, command: 'retry' } }),
  );
  view.rerender(
    <SearchHistory
      projectId={1}
      report={{
        ...report,
        history: {
          scheduleEnabled: true,
          jobs: [
            {
              id: '1',
              status: 'paused',
              startDate: period.start,
              endDate: period.end,
            },
          ],
        },
      }}
      reload={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: '恢复获取' }));
  expect(state.action).toHaveBeenLastCalledWith(
    'nrGoogle',
    'syncControl',
    expect.objectContaining({ body: { projectId: 1, command: 'resume' } }),
  );
});
