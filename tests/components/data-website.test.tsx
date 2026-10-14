// 访问 (client/pages/data-website/): the page GA4's reports were redrawn on (2026-10-14), with the server's answers
// stubbed — 今天 with 实时, the eight figures, the channel shares (GA4's AI Assistant among them), the report tables and a row's detail.
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import english from '../../shared/i18n/en.json';
import { setDictionary } from '../../client/i18n';
import DataWebsite from '../../client/pages/data-website/index';
import { WorkspaceCacheProvider } from '../../client/pages/workspace-cache';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: () => {} },
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, name: 'Site', domains: ['x.com'] } }),
}));
// The workspace cache belongs to a signed-in session.
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: 'u' }, session: { id: 'test-session' } },
    isPending: false,
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => 0,
  useCan: () => ({ can: true, isPending: false, error: null }),
}));

const values = (sessions: number, extra: Record<string, number> = {}) => ({
  users: Math.round(sessions * 0.8),
  newUsers: Math.round(sessions * 0.5),
  sessions,
  engaged: Math.round(sessions * 0.6),
  duration: sessions * 80,
  views: sessions * 3,
  events: sessions * 9,
  keyEvents: Math.round(sessions / 50),
  keyEventRate: 0.02,
  ...extra,
});
const row = (
  key: string,
  dims: Record<string, string>,
  sessions: number,
  extra: Record<string, unknown> = {},
) => ({ key, dims, ...values(sessions), ...extra });
const days = (from: number, n: number, base: number) =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-10-${String(from + i).padStart(2, '0')}`,
    ...values(base + i),
  }));
const report = {
  connected: true,
  cutoff: '2026-10-10',
  window: {
    start: '2026-10-04',
    end: '2026-10-10',
    days: 7,
    previousStart: '2026-09-27',
    previousEnd: '2026-10-03',
  },
  totals: {
    current: values(1000, { duration: 102 * 800 }),
    previous: values(800),
  },
  changes: {
    channel: [
      {
        key: 'Organic Search',
        current: { views: 2000, users: 500 },
        previous: { views: 1600, users: 400 },
      },
      {
        key: 'Referral',
        current: { views: 1000, users: 300 },
        previous: { views: 800, users: 240 },
      },
    ],
    page: [
      { key: '/docs', current: { views: 900 }, previous: { views: 600 } },
      { key: '/', current: { views: 600 }, previous: { views: 550 } },
    ],
  },
  daily: days(4, 9, 100),
  previousDaily: days(27, 4, 90).map((d, i) => ({
    ...d,
    date: `2026-09-${27 + i}`,
  })),
  tables: {
    channel: [
      row(
        'Organic Search',
        { sessionDefaultChannelGroup: 'Organic Search' },
        600,
      ),
      row('Referral', { sessionDefaultChannelGroup: 'Referral' }, 300),
      row('AI Assistant', { sessionDefaultChannelGroup: 'AI Assistant' }, 70),
    ],
    sourceMedium: [
      row(
        'google\u0001organic',
        { sessionSource: 'google', sessionMedium: 'organic' },
        580,
      ),
      row(
        'chatgpt.com\u0001referral',
        { sessionSource: 'chatgpt.com', sessionMedium: 'referral' },
        70,
        { ai: 'ChatGPT' },
      ),
    ],
    campaign: [],
    landing: [
      row('/docs?x=1', { landingPagePlusQueryString: '/docs?x=1' }, 200),
    ],
    page: [
      row('/docs', { pagePath: '/docs' }, 100, {
        title: 'Docs',
        queries: [
          {
            keyword: 'nocobase docs',
            clicks: 9,
            impressions: 300,
            position: 3,
          },
        ],
      }),
    ],
    event: [
      row('sign_up', { eventName: 'sign_up' }, 0, {
        events: 40,
        keyEvents: 40,
      }),
    ],
    newVsReturning: [
      row('new', { newVsReturning: 'new' }, 750),
      row('returning', { newVsReturning: 'returning' }, 250),
    ],
    device: [row('desktop', { deviceCategory: 'desktop' }, 810)],
    country: [
      row(
        'US\u0001United States',
        { countryId: 'US', country: 'United States' },
        400,
      ),
    ],
    browser: [],
    os: [],
    language: [],
  },
  missing: ['city'],
};
const hours = Array.from({ length: 24 }, (_, h) => ({
  hour: h,
  today: h < 14 ? 50 : null,
  yesterday: 45,
  lastWeek: 52,
}));
const today = {
  connected: true,
  timeZone: 'Asia/Shanghai',
  date: '2026-10-14',
  lastWeekDate: '2026-10-07',
  time: '14:20',
  through: 14,
  hours,
  totals: {
    today: { users: 398, views: 1284, sessions: 512, keyEvents: 9 },
    yesterday: { users: 350, views: 1146, sessions: 480, keyEvents: 7 },
    lastWeek: { users: 410, views: 1338, sessions: 530, keyEvents: 8 },
  },
  fullDay: { yesterday: 1080, lastWeek: 1248 },
  sources: [
    {
      source: 'google',
      medium: 'organic',
      sessions: 214,
      users: 200,
      ai: null,
    },
    {
      source: 'chatgpt.com',
      medium: 'referral',
      sessions: 48,
      users: 40,
      ai: 'ChatGPT',
    },
  ],
};
const live = {
  connected: true,
  fetchedAt: '2026-10-14T06:20:00Z',
  users: 37,
  views: 120,
  eventCount: 400,
  keyEvents: 2,
  perMinute: Array.from({ length: 30 }, (_, i) => i % 5),
  pages: [{ title: 'Docs', users: 9, views: 14 }],
  countries: [{ id: 'US', name: 'United States', users: 20 }],
  cities: [],
  devices: [{ name: 'desktop', users: 30 }],
  events: [{ name: 'page_view', count: 120 }],
};

function renderPage(path = '/website') {
  const router = createMemoryRouter(
    [
      {
        path: '/website',
        element: (
          <WorkspaceCacheProvider>
            <DataWebsite />
          </WorkspaceCacheProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  return { router, ...render(<RouterProvider router={router} />) };
}

describe('访问', () => {
  beforeEach(() => {
    sessionStorage.clear();
    action.mockImplementation(async (_resource: string, name: string) => {
      if (name === 'website') return report;
      if (name === 'websiteToday') return today;
      if (name === 'websiteRealtime') return live;
      if (name === 'websiteRow')
        return {
          connected: true,
          daily: days(4, 7, 10),
          previousDaily: days(27, 7, 8),
          totals: { current: values(100), previous: values(80) },
        };
      throw new Error(`unexpected ${name}`);
    });
  });
  afterEach(() => {
    action.mockReset();
    cleanup();
    act(() => setDictionary(null));
  });

  it('shows 今天 with 实时 and today against yesterday and last week up to the same hour, and today’s sources', async () => {
    renderPage();
    const card = await screen
      .findByText('今天浏览量')
      .then((el) => el.closest('[data-today-card]') as HTMLElement);
    await waitFor(() => expect(within(card).getByText('37')).toBeTruthy());
    expect(within(card).getByText('1,284')).toBeTruthy();
    expect(within(card).getByText('昨天同时段')).toBeTruthy();
    expect(within(card).getByText('12%', { exact: false })).toBeTruthy();
    expect(
      within(card).getByText('截至 14:00 · Asia/Shanghai · 每 10 分钟更新'),
    ).toBeTruthy();
    expect(within(card).getByText('ChatGPT')).toBeTruthy();
    await userEvent.click(
      within(card).getByRole('button', { name: /实时详情/ }),
    );
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('正在看的页面')).toBeTruthy();
    expect(within(drawer).getByText('美国')).toBeTruthy();
  });

  it('says why 实时 could not be read, and which parts GA4 left out', async () => {
    const fallback = action.getMockImplementation()!;
    action.mockImplementation(async (resource: string, name: string) => {
      if (name === 'websiteRealtime')
        throw new Error(
          '没能从 GA4 读取数据：HTTP 429 · Exhausted concurrent requests quota.',
        );
      return fallback(resource, name);
    });
    renderPage();
    expect(
      await screen.findByText(
        '实时数据没有读出来：没能从 GA4 读取数据：HTTP 429 · Exhausted concurrent requests quota.',
      ),
    ).toBeTruthy();
    cleanup();
    action.mockImplementation(async (resource: string, name: string) =>
      name === 'websiteRealtime'
        ? {
            ...live,
            missing: [
              { part: 'cities', reason: 'HTTP 400 · Field city is not valid' },
            ],
          }
        : fallback(resource, name),
    );
    sessionStorage.clear();
    renderPage();
    const card = await screen
      .findByText('今天浏览量')
      .then((el) => el.closest('[data-today-card]') as HTMLElement);
    await waitFor(() => expect(within(card).getByText('37')).toBeTruthy());
    await userEvent.click(
      within(card).getByRole('button', { name: /实时详情/ }),
    );
    const drawer = await screen.findByRole('dialog');
    expect(
      within(drawer).getByText(
        '部分实时数据没有读出来：HTTP 400 · Field city is not valid',
      ),
    ).toBeTruthy();
  });

  it('shows GA4’s eight figures, one picking the line, and the channel shares with GA4’s AI 助手 among them', async () => {
    renderPage();
    const tiles = await screen.findByRole('group', { name: '指标' });
    expect(
      within(tiles)
        .getAllByRole('button')
        .filter((b) => b.hasAttribute('aria-pressed')),
    ).toHaveLength(8);
    expect(within(tiles).getByText('1 分 42 秒')).toBeTruthy();
    const newUsers = within(tiles).getByRole('button', {
      name: '新用户',
      pressed: false,
    });
    await userEvent.click(newUsers);
    expect(newUsers.getAttribute('aria-pressed')).toBe('true');
    expect(
      document
        .querySelector('[data-website-chart]')
        ?.getAttribute('data-website-chart'),
    ).toBe('newUsers');
    expect(tiles.querySelector('button button')).toBeNull();
    const channels = screen
      .getByRole('heading', { name: '渠道' })
      .closest('[data-slot=card]') as HTMLElement;
    expect(within(channels).getByText('自然搜索')).toBeTruthy();
    expect(within(channels).getByText('AI 助手')).toBeTruthy();
    expect(within(channels).getByText('7.0%')).toBeTruthy();
    expect(within(channels).queryByText('其中 AI 助手')).toBeNull();
  });

  it('says where the picked figure’s change came from: channels with their shares, and the pages that moved most', async () => {
    renderPage();
    const drivers = () =>
      document.querySelector('[data-change-drivers]')?.textContent ?? '';
    await waitFor(() =>
      expect(drivers()).toBe(
        '活跃用户比前一期多了 160，主要来自自然搜索（+100）和引荐（+60）。',
      ),
    );
    const tiles = screen.getByRole('group', { name: '指标' });
    await userEvent.click(
      within(tiles).getByRole('button', { name: '浏览量', pressed: false }),
    );
    expect(drivers()).toBe(
      '浏览量比前一期多了 600，主要来自自然搜索（+400，占 67%）和引荐（+200，占 33%）。变化最大的页面：/docs（+300）和/（+50）。',
    );
    await userEvent.click(
      within(tiles).getByRole('button', { name: '互动率', pressed: false }),
    );
    expect(document.querySelector('[data-change-drivers]')).toBeNull();
  });

  it('switches reports and dimensions, and opens a row with its days against the period before', async () => {
    const { router } = renderPage();
    const by = await screen.findByRole('group', { name: '按什么看' });
    expect(screen.getAllByText('引荐').length).toBeGreaterThan(0);
    await userEvent.click(within(by).getByRole('button', { name: 'AI 助手' }));
    expect(router.state.location.search).toBe('?by=ai');
    const table = screen.getByRole('table');
    expect(within(table).queryByText('google')).toBeNull();
    expect(within(table).getByText('chatgpt.com')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: '地区' }));
    expect(router.state.location.search).toBe('?tab=geo');
    await userEvent.click(screen.getByRole('button', { name: '美国' }));
    const drawer = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith(
        'nrDataViews',
        'websiteRow',
        expect.objectContaining({
          body: expect.objectContaining({
            table: 'country',
            dims: { countryId: 'US', country: 'United States' },
          }),
        }),
      ),
    );
    expect(within(drawer).getByText('前一期')).toBeTruthy();
    expect(within(drawer).getAllByText('+25.0%').length).toBeGreaterThan(0);
    await userEvent.click(
      within(drawer).getByRole('button', { name: '关闭详情' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '城市' }));
    expect(
      screen.getByText('GA4 这次没有返回这张表，稍后刷新再看'),
    ).toBeTruthy();
  });

  it('lists pages with their search queries', async () => {
    renderPage('/website?tab=pages');
    expect(await screen.findByText('/docs')).toBeTruthy();
    expect(screen.getByText('Docs')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /\/docs/ }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('nocobase docs')).toBeTruthy();
  });

  it('reads in English, naming the reports GA4 left out', async () => {
    act(() => setDictionary(english));
    renderPage();
    const tiles = await screen.findByRole('group', { name: 'Metrics' });
    expect(within(tiles).getByText('Active users')).toBeTruthy();
    expect(within(tiles).getByText('1 min 42 s')).toBeTruthy();
    expect(
      within(
        screen
          .getByRole('heading', { name: 'Channel' })
          .closest('[data-slot=card]') as HTMLElement,
      ).getByText('AI assistant'),
    ).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: 'Traffic acquisition' }),
    ).toBeTruthy();
    expect(await screen.findByText('Views today')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'About the data' }),
    );
    expect(await screen.findByText("GA4 didn't return: City")).toBeTruthy();
    // A figure's ⓘ explains it in the page's language, and opening it does not pick the line.
    await userEvent.click(
      within(tiles).getByRole('button', { name: 'What is Active users' }),
    );
    expect(
      await screen.findByText(
        'People who visited in the selected period (deduplicated by GA4: a person counts once however often they came).',
      ),
    ).toBeTruthy();
    expect(
      within(tiles)
        .getByRole('button', { name: 'Active users' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    await userEvent.click(
      within(tiles).getByRole('button', { name: 'What is Sessions' }),
    );
    expect(
      within(tiles)
        .getByRole('button', { name: 'Sessions' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });
});
