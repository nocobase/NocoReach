import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  SearchHistory,
  coverageNotes,
} from '#pages/search-performance/history';
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
it('says which days are missing and that an administrator fills them, without a member write', async () => {
  render(<SearchHistory projectId={1} report={report} reload={vi.fn()} />);
  expect(screen.getByText('数据不完整')).toBeTruthy();
  expect(
    screen.getByText(/^缺少 (2026-)?10-01 至 (2026-)?10-04 的数据。$/),
  ).toBeTruthy();
  expect(screen.getByText(/管理员打开此页面时会自动补齐/)).toBeTruthy();
  // Scheduled sync, the counts and the save time are in the page's info tip, not here.
  expect(screen.queryByText(/定时同步已关闭/)).toBeNull();
  expect(screen.queryByText(/有记录 2 天/)).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
  expect(state.action).not.toHaveBeenCalled();
});
it('shows nothing for a complete range and keeps its notes for the page info tip', () => {
  const complete: SearchReport = {
    ...report,
    complete: true,
    coverage: {
      current: {
        ...period,
        recordedDays: 6,
        noRecordDays: 1,
        missingDays: 0,
        missing: [],
        updatedAt: '2026-10-08T03:00:00Z',
      },
      previous: {
        ...period,
        start: '2026-09-24',
        end: '2026-09-30',
        recordedDays: 7,
        noRecordDays: 0,
        missingDays: 0,
        missing: [],
      },
    },
  };
  const { container } = render(
    <SearchHistory projectId={1} report={complete} reload={vi.fn()} />,
  );
  expect(container).toBeEmptyDOMElement();
  const notes = coverageNotes(complete);
  expect(notes.some((n) => n.startsWith('数据最后保存于'))).toBe(true);
  expect(notes.some((n) => /不按零流量计算/.test(n))).toBe(true);
  expect(notes.some((n) => /定时同步已关闭/.test(n))).toBe(true);
});
it('says when missing days are older than Search Console keeps, with nothing to press', () => {
  state.role = 'admin';
  const old: SearchReport = {
    ...report,
    coverage: {
      earliest: '2025-06-01',
      current: { ...period, missingDays: 0, missing: [] },
      previous: {
        ...period,
        start: '2024-10-12',
        end: '2025-10-11',
        missingDays: 232,
        missing: [{ start: '2024-10-12', end: '2025-05-31' }],
      },
    },
  };
  render(<SearchHistory projectId={1} report={old} reload={vi.fn()} />);
  expect(
    screen.getByText(/^对比期缺少 2024-10-12 至 2025-05-31 的数据/),
  ).toBeTruthy();
  expect(screen.getByText(/只提供 2025-06-01 之后的数据/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: '重新获取' })).toBeNull();
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
  expect(screen.getByText(/已保存的数据不受影响/)).toBeTruthy();
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
