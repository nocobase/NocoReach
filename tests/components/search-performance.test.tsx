// 搜索表现 (client/pages/search-performance/), 2026-10-14: search types, the four figures picking the line, 国家/地区 ·
// 设备 · 搜索结果呈现, 上升最快 · 下降最快 · 新出现, 细分, and a query's detail.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SearchPerformancePage from '#pages/search-performance/index';
import { WorkspaceCacheProvider } from '#pages/workspace-cache';

const { action, project } = vi.hoisted(() => ({
  action: vi.fn(),
  project: {
    id: 1,
    domains: ['example.com'],
    searchConsoleProperty: 'sc-domain:example.com',
  },
}));
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

type Raw = Record<string, any>;
const window = {
  start: '2026-10-01',
  end: '2026-10-07',
  days: 7,
  previousStart: '2026-09-24',
  previousEnd: '2026-09-30',
};
const day = (i: number) => `2026-10-0${i + 1}`;
const mover = (key: string, clicks: number, previousClicks: number) => ({
  key,
  clicks,
  previousClicks,
  change: clicks - previousClicks,
  impressions: clicks * 10,
  previousImpressions: previousClicks * 10,
  position: 8,
  previousPosition: previousClicks ? 9 : null,
});
function report(type = 'web'): Raw {
  const discover = type === 'discover';
  return {
    connected: true,
    cutoff: window.end,
    window,
    type,
    noQueries: discover,
    noPosition: discover,
    filtered: false,
    complete: true,
    previousComplete: true,
    totals: { clicks: 700, impressions: 7000, ctr: 0.1, position: 9 },
    previous: { clicks: 560, impressions: 6000, ctr: 560 / 6000, position: 10 },
    trend: Array.from({ length: 7 }, (_, i) => ({
      date: day(i),
      clicks: 100,
      impressions: 1000,
      ctr: 0.1,
      position: 9,
      previousDate: `2026-09-${24 + i}`,
      previousClicks: 80,
      previousImpressions: 857,
      previousCtr: 0.093,
      previousPosition: 10,
    })),
    striking: discover
      ? []
      : [
          {
            query: 'crm tool',
            page: 'https://example.com/crm',
            clicks: 30,
            impressions: 900,
            position: 11,
          },
        ],
    queries: discover
      ? null
      : {
          rows: [
            {
              key: 'crm tool',
              clicks: 30,
              impressions: 900,
              ctr: 1 / 30,
              position: 11,
            },
          ],
          total: 1,
        },
    pages: {
      rows: [
        {
          key: 'https://example.com/crm',
          clicks: 30,
          impressions: 900,
          ctr: 1 / 30,
          position: 11,
        },
      ],
      total: 1,
    },
    movers: {
      query: discover
        ? null
        : {
            rising: [mover('crm tool', 30, 10)],
            falling: [mover('old query', 2, 9)],
            fresh: [mover('brand new', 4, 0)],
          },
      page: {
        rising: [mover('https://example.com/crm', 30, 10)],
        falling: [],
        fresh: [],
      },
    },
    pairDays: 7,
    preliminary: [],
  };
}
const row = (key: string, clicks: number, previousClicks: number) => ({
  key,
  clicks,
  impressions: clicks * 10,
  ctr: 0.1,
  position: 7,
  previousClicks,
  previousImpressions: previousClicks * 10,
});
const breakdown = {
  connected: true,
  countries: [row('usa', 400, 300), row('chn', 200, 200)],
  devices: [row('MOBILE', 450, 300), row('DESKTOP', 250, 260)],
  appearances: [row('VIDEO', 70, 50)],
};

function renderPage(path = '/search') {
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
  return { router, ...render(<RouterProvider router={router} />) };
}
const tile = (key: string) =>
  document.querySelector(`[data-metric="${key}"]`) as HTMLElement;
const ready = () =>
  waitFor(() =>
    expect(document.querySelector('[data-metric="clicks"]')).toBeTruthy(),
  );

describe('搜索表现', () => {
  beforeEach(() => {
    sessionStorage.clear();
    project.searchConsoleProperty = 'sc-domain:example.com';
    action.mockReset();
    action.mockImplementation(
      async (_r: string, name: string, options: { body: Raw }) => {
        if (name === 'view' || name === 'sitemaps') return { connected: false };
        if (name === 'search') return report(options.body.type);
        if (name === 'searchBreakdown') return breakdown;
        if (name === 'searchRow')
          return {
            connected: true,
            trend: report().trend,
            related: [
              {
                key: 'https://example.com/crm',
                clicks: 30,
                impressions: 900,
                ctr: 1 / 30,
                position: 11,
              },
            ],
          };
        throw new Error(`unexpected ${name}`);
      },
    );
  });

  it('a figure picks the line, and the cards break the period down by country, device and appearance', async () => {
    const { router } = renderPage();
    await ready();
    expect(document.querySelector('[data-trend="clicks"]')).toBeTruthy();
    await userEvent.click(
      within(tile('position')).getByRole('button', { name: '平均排名' }),
    );
    expect(router.state.location.search).toBe('?metric=position');
    expect(document.querySelector('[data-trend="position"]')).toBeTruthy();
    const devices = await waitFor(() => {
      const card = document.querySelector(
        '[data-breakdown-card="device"]',
      ) as HTMLElement;
      expect(within(card).getByText('手机')).toBeTruthy();
      return card;
    });
    expect(within(devices).getByText('64.3%')).toBeTruthy();
    const countries = document.querySelector(
      '[data-breakdown-card="country"]',
    ) as HTMLElement;
    await userEvent.click(within(countries).getAllByRole('button')[1]);
    expect(router.state.location.search).toContain('country=usa');
  });

  it('switches the search type; Discover has no queries and no positions', async () => {
    renderPage();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Discover' }));
    await waitFor(() =>
      expect(tile('position').textContent).toContain(
        'Discover 和 Google 新闻没有排名',
      ),
    );
    expect(action).toHaveBeenCalledWith(
      'nrDataViews',
      'search',
      expect.objectContaining({
        body: expect.objectContaining({ type: 'discover' }),
      }),
    );
    const report = document.querySelector('[data-report]') as HTMLElement;
    expect(within(report).queryByRole('tab', { name: '查询' })).toBeNull();
    expect(
      within(report).getByRole('tab', { name: '页面', selected: true }),
    ).toBeTruthy();
  });

  it('lists rising, falling and new queries, the breakdown tables, and opens a query', async () => {
    const { router } = renderPage();
    await ready();
    const report = document.querySelector('[data-report]') as HTMLElement;
    await userEvent.click(
      within(report).getByRole('tab', { name: '上升最快' }),
    );
    expect(within(report).getByText('+20')).toBeTruthy();
    await userEvent.click(
      within(report).getByRole('tab', { name: '下降最快' }),
    );
    expect(within(report).getByText('old query')).toBeTruthy();
    await userEvent.click(within(report).getByRole('tab', { name: '新出现' }));
    expect(within(report).getByText('brand new')).toBeTruthy();
    await userEvent.click(within(report).getByRole('button', { name: '页面' }));
    expect(router.state.location.search).toContain('by=page');
    await userEvent.click(within(report).getByRole('tab', { name: '细分' }));
    await userEvent.click(within(report).getByRole('button', { name: '设备' }));
    expect(within(report).getByText('桌面')).toBeTruthy();
    await userEvent.click(within(report).getByRole('tab', { name: '查询' }));
    await userEvent.click(
      within(report).getByRole('button', { name: 'crm tool' }),
    );
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('查询 · crm tool')).toBeTruthy();
    expect(
      await within(drawer).findByText('https://example.com/crm'),
    ).toBeTruthy();
    expect(action).toHaveBeenCalledWith(
      'nrDataViews',
      'searchRow',
      expect.objectContaining({
        body: expect.objectContaining({
          dimension: 'query',
          key: 'crm tool',
          start: '2026-10-01',
        }),
      }),
    );
  });
  it('reuses reports across tabs and does not request breakdowns while index or sitemaps are active', async () => {
    const { router } = renderPage();
    await ready();
    await screen.findByText('桌面');
    await act(async () => router.navigate('/search?view=index&country=usa'));
    await act(async () => router.navigate('/search?view=sitemaps&type=image'));
    expect(
      action.mock.calls.filter(([, name]) => name === 'searchBreakdown'),
    ).toHaveLength(1);
    await act(async () => router.navigate('/search'));
    await ready();
    for (const name of ['search', 'searchBreakdown'])
      expect(
        action.mock.calls.filter(([, called]) => called === name),
      ).toHaveLength(1);
    await act(async () => router.navigate('/search?view=index'));
    project.searchConsoleProperty = 'sc-domain:changed.test';
    await act(async () => router.navigate('/search'));
    await ready();
    for (const name of ['search', 'searchBreakdown'])
      expect(
        action.mock.calls.filter(([, called]) => called === name),
      ).toHaveLength(2);
  });

  it('hydrates the main report and breakdown from the same session after a browser refresh', async () => {
    const view = renderPage();
    await ready();
    await screen.findByText('桌面');
    const saved = Object.entries(sessionStorage);
    view.unmount();
    for (const [key, value] of saved) sessionStorage.setItem(key, value);
    action.mockClear();
    renderPage();
    await ready();
    await screen.findByText('桌面');
    expect(action).not.toHaveBeenCalled();
  });

  it('refreshes local sync data after one minute while retaining historical breakdowns', async () => {
    const view = renderPage();
    await ready();
    await screen.findByText('桌面');
    const now = Date.now();
    const date = vi.spyOn(Date, 'now').mockReturnValue(now + 60001);
    try {
      await act(async () => view.router.navigate('/search?view=index'));
      await act(async () => view.router.navigate('/search'));
      await ready();
      expect(
        action.mock.calls.filter(([, name]) => name === 'search'),
      ).toHaveLength(2);
      expect(
        action.mock.calls.filter(([, name]) => name === 'searchBreakdown'),
      ).toHaveLength(1);
    } finally {
      date.mockRestore();
    }
  });
});
