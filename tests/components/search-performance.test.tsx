import type { ReactElement } from 'react';
// 搜索表现 (client/pages/search-performance/), 2026-10-14: search types, the four figures picking the line, 国家/地区 ·
// 设备 · 搜索结果呈现, 上升最快 · 下降最快 · 新出现, 细分, and a query's detail.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SearchPerformancePage from '#pages/search-performance/index';
import { setDictionary } from '#i18n';
import english from '../../shared/i18n/en.json';
import { WorkspaceCacheProvider } from '#pages/workspace-cache';

vi.mock('recharts', async (original) => {
  const actual = await original<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) => (
      <actual.ResponsiveContainer width={600} height={260}>
        {children}
      </actual.ResponsiveContainer>
    ),
  };
});

const { action, project } = vi.hoisted(() => ({
  action: vi.fn(),
  project: {
    id: 1,
    domains: ['example.com'],
    searchConsoleProperty: 'sc-domain:example.com',
  },
}));
vi.mock('#pages/me', () => ({ useMe: () => ({ me: { role: 'member' } }) }));
vi.mock('#lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
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
// The details load with the page; wait for their table.
const loadDetails = async () => {
  await waitFor(() =>
    expect(document.querySelector('[data-report]')).toBeTruthy(),
  );
};
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
    await loadDetails();
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

  // The average position falls as the ranking rises, so its ↑ comes with words saying so and the previous position on
  // hover; the other figures keep their bare change.
  const withPositions = (previous: number, current: number) => {
    const searchReport = report();
    searchReport.totals.position = current;
    searchReport.previous.position = previous;
    const base = action.getMockImplementation()!;
    action.mockImplementation(
      async (r: string, name: string, options: { body: Raw }) =>
        name === 'search' ? searchReport : base(r, name, options),
    );
  };
  const positionChange = () => {
    const delta = tile('position').querySelector(
      '[data-slot="delta"]',
    ) as HTMLElement;
    const note = tile('position').querySelector('[data-delta-note]');
    return {
      direction: delta.dataset.direction,
      text: delta.textContent,
      tone: delta.className.match(/text-nr-ink-\w+/)?.[0],
      note: note?.textContent,
    };
  };

  it('reads a smaller average position as a ranking that rose, with the previous position on hover', async () => {
    withPositions(11.8, 11.0);
    renderPage();
    await ready();
    expect(within(tile('position')).getByText('11.0')).toBeTruthy();
    expect(positionChange()).toEqual({
      direction: 'up',
      text: '↑ 0.8',
      tone: 'text-nr-ink-green',
      note: '排名上升',
    });
    await userEvent.hover(tile('position').querySelector('[data-delta-tip]')!);
    expect(await screen.findByText('上期 11.8')).toBeTruthy();
    for (const key of ['clicks', 'impressions', 'ctr']) {
      expect(tile(key).querySelector('[data-delta-note]')).toBeNull();
      expect(tile(key).querySelector('[data-delta-tip]')).toBeNull();
    }
  });

  it('reads a larger average position as a ranking that fell', async () => {
    withPositions(10.2, 11.0);
    renderPage();
    await ready();
    expect(positionChange()).toEqual({
      direction: 'down',
      text: '↓ 0.8',
      tone: 'text-nr-ink-red',
      note: '排名下降',
    });
  });

  it('adds no words to an average position that did not change', async () => {
    withPositions(11.02, 11.0);
    renderPage();
    await ready();
    expect(positionChange()).toMatchObject({
      direction: 'flat',
      note: undefined,
    });
  });

  it('says which way the ranking moved in English, and its ⓘ agrees with the arrow', async () => {
    try {
      setDictionary(english, 'en-US');
      withPositions(11.8, 11.0);
      renderPage();
      await ready();
      expect(positionChange()).toMatchObject({
        text: '↑ 0.8',
        note: 'ranked higher',
      });
      await userEvent.hover(
        tile('position').querySelector('[data-delta-tip]')!,
      );
      expect(await screen.findByText('Previous: 11.8')).toBeTruthy();
      await userEvent.hover(
        within(tile('position')).getByRole('button', {
          name: 'What is Average position',
        }),
      );
      const help = await screen.findByText(
        /^Our average position in Google search results/,
      );
      expect(help.textContent).toContain('↑ means the ranking rose');
      expect(help.textContent).not.toMatch(/decrease is an improvement/);
    } finally {
      setDictionary(null);
    }
  });

  it('reads web search only, with no search type choice', async () => {
    renderPage();
    await ready();
    expect(screen.queryByRole('button', { name: 'Discover' })).toBeNull();
    expect(screen.queryByRole('group', { name: '搜索类型' })).toBeNull();
    for (const [, , options] of action.mock.calls)
      expect((options as { body?: object }).body).not.toHaveProperty('type');
  });

  it('lists rising, falling and new queries, the breakdown tables, and opens a query', async () => {
    const { router } = renderPage();
    await ready();
    await loadDetails();
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
    const chart = document.querySelector('[data-row-line]') as HTMLElement;
    const series = within(chart)
      .getAllByRole('listitem')
      .map((entry) => within(entry).getByRole('button'));
    expect(series).toHaveLength(2);
    for (const button of series) {
      expect(button.getAttribute('aria-pressed')).toBe('true');
      await userEvent.click(button);
      expect(button.getAttribute('aria-pressed')).toBe('false');
    }
    expect(
      chart.querySelectorAll('.recharts-area, .recharts-line'),
    ).toHaveLength(0);
    for (const name of series.map((button) => button.textContent!)) {
      await userEvent.click(
        within(chart).getByRole('button', { name, exact: true }),
      );
      expect(
        within(chart)
          .getByRole('button', { name, exact: true })
          .getAttribute('aria-pressed'),
      ).toBe('true');
    }
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
    await loadDetails();
    await screen.findByText('桌面');
    await act(async () => router.navigate('/search?view=index&country=usa'));
    await act(async () => router.navigate('/search?view=sitemaps&type=image'));
    expect(
      action.mock.calls.filter(([, name]) => name === 'searchBreakdown'),
    ).toHaveLength(1);
    await act(async () => router.navigate('/search'));
    await ready();
    expect(
      action.mock.calls.filter(([, name]) => name === 'search'),
    ).toHaveLength(2);
    expect(
      action.mock.calls.filter(([, name]) => name === 'searchBreakdown'),
    ).toHaveLength(1);
    await act(async () => router.navigate('/search?view=index'));
    project.searchConsoleProperty = 'sc-domain:changed.test';
    await act(async () => router.navigate('/search'));
    await ready();
    await loadDetails();
    expect(
      action.mock.calls.filter(([, name]) => name === 'search'),
    ).toHaveLength(4);
    expect(
      action.mock.calls.filter(([, name]) => name === 'searchBreakdown'),
    ).toHaveLength(2);
  });

  it('hydrates the main report and breakdown from the same session after a browser refresh', async () => {
    const view = renderPage();
    await ready();
    await loadDetails();
    await screen.findByText('桌面');
    const saved = Object.entries(sessionStorage);
    view.unmount();
    for (const [key, value] of saved) sessionStorage.setItem(key, value);
    action.mockClear();
    renderPage();
    await ready();
    await loadDetails();
    await screen.findByText('桌面');
    expect(action).not.toHaveBeenCalled();
  });

  it('refreshes local sync data after one minute while retaining historical breakdowns', async () => {
    const view = renderPage();
    await ready();
    await loadDetails();
    await screen.findByText('桌面');
    const now = Date.now();
    const date = vi.spyOn(Date, 'now').mockReturnValue(now + 60001);
    try {
      await act(async () => view.router.navigate('/search?view=index'));
      await act(async () => view.router.navigate('/search'));
      await ready();
      expect(
        action.mock.calls.filter(([, name]) => name === 'search'),
      ).toHaveLength(4);
      expect(
        action.mock.calls.filter(([, name]) => name === 'searchBreakdown'),
      ).toHaveLength(1);
    } finally {
      date.mockRestore();
    }
  });
  it('starts a newly selected metric with every series visible', async () => {
    renderPage();
    await ready();
    const chart = document.querySelector('[data-trend]') as HTMLElement;
    const legend = within(chart).getAllByRole('listitem');
    expect(legend.length).toBeGreaterThanOrEqual(2);
    const buttons = legend.map((item) => within(item).getByRole('button'));
    for (const button of buttons) await userEvent.click(button);
    expect(
      buttons.every(
        (button) => button.getAttribute('aria-pressed') === 'false',
      ),
    ).toBe(true);
    await userEvent.click(
      within(tile('position')).getByRole('button', { name: '平均排名' }),
    );
    const next = document.querySelector(
      '[data-trend="position"]',
    ) as HTMLElement;
    const visible = within(next)
      .getAllByRole('listitem')
      .map((item) => within(item).getByRole('button'));
    expect(visible.length).toBeGreaterThanOrEqual(2);
    expect(
      visible.every((button) => button.getAttribute('aria-pressed') === 'true'),
    ).toBe(true);
  });

  it('toggles current, previous and preliminary daily series independently', async () => {
    const original = action.getMockImplementation()!;
    action.mockImplementation(async (...args) => {
      const result = await original(...args);
      return args[1] === 'search'
        ? {
            ...result,
            preliminary: [{ date: '2026-10-08', clicks: 12, impressions: 120 }],
          }
        : result;
    });
    renderPage();
    await ready();
    const chart = document.querySelector('[data-trend]') as HTMLElement;
    const series = within(chart)
      .getAllByRole('listitem')
      .map((entry) => within(entry).getByRole('button'));
    expect(series).toHaveLength(3);
    for (let index = 0; index < series.length; index++) {
      expect(series[index].getAttribute('aria-pressed')).toBe('true');
      await userEvent.click(series[index]);
      expect(series[index].getAttribute('aria-pressed')).toBe('false');
      expect(chart.querySelectorAll('.recharts-area')).toHaveLength(
        series.length - index - 1,
      );
    }
    for (const name of series.map((button) => button.textContent!))
      await userEvent.click(
        within(chart).getByRole('button', { name, exact: true }),
      );
    expect(
      within(chart)
        .getAllByRole('listitem')
        .map((entry) => within(entry).getByRole('button'))
        .every((button) => button.getAttribute('aria-pressed') === 'true'),
    ).toBe(true);
  });
});
