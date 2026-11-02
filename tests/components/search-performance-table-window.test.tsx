// Search performance's tables have their own report, which can hold another period than the summary: they end at the
// last synced day until the day's sync lands, and a saved copy holds the window it was read for.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import SearchPerformancePage from '#pages/search-performance/index';
import { WorkspaceCacheProvider } from '#pages/workspace-cache';

const { action, project, csv } = vi.hoisted(() => ({
  action: vi.fn(),
  csv: vi.fn((..._args: unknown[]) => true),
  project: {
    id: 1,
    domains: ['example.com'],
    searchConsoleProperty: 'sc-domain:example.com',
  },
}));
vi.mock('#components/seo/csv', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  downloadCsv: csv,
}));
vi.mock('#pages/me', () => ({ useMe: () => ({ me: { role: 'member' } }) }));
vi.mock('#lib/nocoreach-api', () => ({ nocobaseClient: { action } }));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: 'u' }, session: { id: 's' } },
    isPending: false,
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => 0,
}));
vi.mock('#pages/reach-data', () => ({
  useProject: () => ({ project }),
  taskRecords: async () => [],
}));

const summaryWindow = {
  start: '2026-10-02',
  end: '2026-10-08',
  days: 7,
  previousStart: '2026-09-25',
  previousEnd: '2026-10-01',
};
const tableWindow = {
  start: '2026-10-01',
  end: '2026-10-07',
  days: 7,
  previousStart: '2026-09-24',
  previousEnd: '2026-09-30',
};
const summary = {
  connected: true,
  cutoff: summaryWindow.end,
  window: summaryWindow,
  filtered: false,
  // The cutoff moved and the day's sync has not landed: the summary cannot compare yet, the tables' period can.
  complete: false,
  previousComplete: false,
  totals: { clicks: 700, impressions: 7000, ctr: 0.1, position: 9 },
  previous: null,
  trend: [],
  preliminary: [],
  cacheExpiresAt: Date.now() + 3600000,
};
const mover = {
  key: 'a rising query',
  clicks: 30,
  previousClicks: 10,
  change: 20,
  impressions: 900,
  previousImpressions: 300,
  position: 8,
  previousPosition: 9,
};
const tables = {
  ...summary,
  window: tableWindow,
  complete: true,
  previousComplete: true,
  pairDays: 7,
  striking: [],
  queries: {
    rows: [
      {
        key: 'a query',
        clicks: 30,
        impressions: 900,
        ctr: 1 / 30,
        position: 11,
      },
    ],
    total: 1,
  },
  pages: { rows: [], total: 0 },
  movers: {
    query: { rising: [mover], falling: [], fresh: [] },
    page: { rising: [], falling: [], fresh: [] },
  },
};

function renderPage(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/search',
        element: (
          <WorkspaceCacheProvider>
            <SearchPerformancePage />
          </WorkspaceCacheProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  sessionStorage.clear();
  csv.mockClear();
  action.mockReset();
  action.mockImplementation(
    async (
      _resource: string,
      name: string,
      options: { body: Record<string, unknown> },
    ) => {
      if (name === 'search') return options.body.details ? tables : summary;
      if (name === 'searchBreakdown')
        return { connected: true, countries: [], devices: [], appearances: [] };
      if (name === 'searchRow')
        return { connected: true, trend: [], related: [] };
      return { connected: false };
    },
  );
});
afterEach(cleanup);

it('exports a table under the period it holds, and a breakdown under the summary it follows', async () => {
  const view = renderPage('/search?tab=queries');
  await waitFor(() => expect(screen.getByText('a query')).toBeTruthy());
  await userEvent.click(screen.getByRole('button', { name: '导出 CSV' }));
  expect(String(csv.mock.calls[0]![0])).toContain('10-07');
  expect(String(csv.mock.calls[0]![0])).not.toContain('10-08');
  view.unmount();

  csv.mockClear();
  renderPage('/search?tab=slices');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '导出 CSV' })).toBeTruthy(),
  );
  await userEvent.click(screen.getByRole('button', { name: '导出 CSV' }));
  expect(String(csv.mock.calls[0]![0])).toContain('10-08');
});

it("opens a row on the table's period, comparing by what that period holds", async () => {
  renderPage('/search');
  await userEvent.click(await screen.findByRole('tab', { name: '查询' }));
  await userEvent.click(await screen.findByRole('button', { name: 'a query' }));
  await waitFor(() =>
    expect(action.mock.calls.some(([, name]) => name === 'searchRow')).toBe(
      true,
    ),
  );
  const { body } = action.mock.calls.find(
    ([, name]) => name === 'searchRow',
  )![2] as { body: Record<string, unknown> };
  expect(body).toMatchObject({
    start: tableWindow.start,
    end: tableWindow.end,
    previousEnd: tableWindow.previousEnd,
    compare: true,
  });
  expect(body).not.toHaveProperty('days');
});

it('lists the movers of a period that can compare, though the summary cannot yet', async () => {
  renderPage('/search?tab=rising');
  expect(await screen.findByText('a rising query')).toBeTruthy();
});
