// 访问 (client/pages/data-website/): the page GA4's reports were redrawn on (2026-10-14), with the server's answers
// stubbed — 今天 with 实时, the eight figures, the channel shares with AI 助手, the report tables and a row's detail.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DataWebsite from '@/pages/data-website/index';
import { WorkspaceCacheProvider } from '@/pages/workspace-cache';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('@/lib/nocoreach-api', () => ({ nocobaseClient: { action } }));
vi.mock('@/pages/reach-data', () => ({ useProject: () => ({ project: { id: 1, name: 'Site', domains: ['x.com'] } }) }));

const values = (sessions: number, extra: Record<string, number> = {}) => ({ users: Math.round(sessions * 0.8), newUsers: Math.round(sessions * 0.5), sessions, engaged: Math.round(sessions * 0.6), duration: sessions * 80, views: sessions * 3, events: sessions * 9, keyEvents: Math.round(sessions / 50), keyEventRate: 0.02, ...extra });
const row = (key: string, dims: Record<string, string>, sessions: number, extra: Record<string, unknown> = {}) => ({ key, dims, ...values(sessions), ...extra });
const days = (from: number, n: number, base: number) => Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(from + i).padStart(2, '0')}`, ...values(base + i) }));
const report = {
  connected: true, cutoff: '2026-10-10', window: { start: '2026-10-04', end: '2026-10-10', days: 7, previousStart: '2026-09-27', previousEnd: '2026-10-03' },
  notes: ['关键事件沿用 GA4 里的定义，不等于成交'],
  totals: { current: values(1000, { duration: 102 * 800 }), previous: values(800) },
  daily: days(4, 9, 100), previousDaily: days(27, 4, 90).map((d, i) => ({ ...d, date: `2026-09-${27 + i}` })),
  tables: {
    channel: [row('Organic Search', { sessionDefaultChannelGroup: 'Organic Search' }, 600), row('Referral', { sessionDefaultChannelGroup: 'Referral' }, 300)],
    sourceMedium: [row('google\u0001organic', { sessionSource: 'google', sessionMedium: 'organic' }, 580), row('chatgpt.com\u0001referral', { sessionSource: 'chatgpt.com', sessionMedium: 'referral' }, 70, { ai: 'ChatGPT' })],
    campaign: [], landing: [row('/docs?x=1', { landingPagePlusQueryString: '/docs?x=1' }, 200)],
    page: [row('/docs', { pagePath: '/docs' }, 100, { title: 'Docs', queries: [{ keyword: 'nocobase docs', clicks: 9, impressions: 300, position: 3 }] })],
    event: [row('sign_up', { eventName: 'sign_up' }, 0, { events: 40, keyEvents: 40 })],
    newVsReturning: [row('new', { newVsReturning: 'new' }, 750), row('returning', { newVsReturning: 'returning' }, 250)],
    device: [row('desktop', { deviceCategory: 'desktop' }, 810)],
    country: [row('US\u0001United States', { countryId: 'US', country: 'United States' }, 400)],
    city: [], language: [], browser: [], os: [],
  },
  missing: [], ai: { sessions: 70, sources: 1 },
};
const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, today: h < 14 ? 50 : null, yesterday: 45, lastWeek: 52 }));
const today = {
  connected: true, timeZone: 'Asia/Shanghai', date: '2026-10-14', lastWeekDate: '2026-10-07', time: '14:20', through: 14, hours,
  totals: { today: { users: 398, views: 1284, sessions: 512, keyEvents: 9 }, yesterday: { users: 350, views: 1146, sessions: 480, keyEvents: 7 }, lastWeek: { users: 410, views: 1338, sessions: 530, keyEvents: 8 } },
  fullDay: { yesterday: 1080, lastWeek: 1248 },
  sources: [{ source: 'google', medium: 'organic', sessions: 214, users: 200, ai: null }, { source: 'chatgpt.com', medium: 'referral', sessions: 48, users: 40, ai: 'ChatGPT' }],
};
const live = { connected: true, fetchedAt: '2026-10-14T06:20:00Z', users: 37, views: 120, eventCount: 400, keyEvents: 2, perMinute: Array.from({ length: 30 }, (_, i) => i % 5), pages: [{ title: 'Docs', users: 9, views: 14 }], countries: [{ id: 'US', name: 'United States', users: 20 }], cities: [], devices: [{ name: 'desktop', users: 30 }], events: [{ name: 'page_view', count: 120, users: 37 }] };

function renderPage(path = '/website') {
  const router = createMemoryRouter([{ path: '/website', element: <WorkspaceCacheProvider><DataWebsite /></WorkspaceCacheProvider> }], { initialEntries: [path] });
  return { router, ...render(<RouterProvider router={router} />) };
}

describe('访问', () => {
  beforeEach(() => {
    sessionStorage.clear();
    action.mockImplementation(async (_resource: string, name: string) => {
      if (name === 'website') return report;
      if (name === 'websiteToday') return today;
      if (name === 'websiteRealtime') return live;
      if (name === 'websiteRow') return { connected: true, daily: days(4, 7, 10), previousDaily: days(27, 7, 8), totals: { current: values(100), previous: values(80) } };
      throw new Error(`unexpected ${name}`);
    });
  });
  afterEach(() => action.mockReset());

  it('shows 今天 with 实时 and today against yesterday and last week up to the same hour, and today’s sources', async () => {
    renderPage();
    const card = await screen.findByText('今天浏览量').then((el) => el.closest('[data-today-card]') as HTMLElement);
    await waitFor(() => expect(within(card).getByText('37')).toBeTruthy());
    expect(within(card).getByText('1,284')).toBeTruthy();
    expect(within(card).getByText('昨天同时段')).toBeTruthy();
    expect(within(card).getByText('12%', { exact: false })).toBeTruthy();
    expect(within(card).getByText('截至 14:00 · Asia/Shanghai · 每 10 分钟更新')).toBeTruthy();
    expect(within(card).getByText('ChatGPT')).toBeTruthy();
    await userEvent.click(within(card).getByRole('button', { name: /实时详情/ }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('正在看的页面')).toBeTruthy();
    expect(within(drawer).getByText('美国')).toBeTruthy();
  });

  it('shows GA4’s eight figures, one picking the line, and the channel shares with AI 助手 apart', async () => {
    renderPage();
    const tiles = await screen.findByRole('group', { name: '指标' });
    const buttons = within(tiles).getAllByRole('button', { pressed: false }).concat(within(tiles).getAllByRole('button', { pressed: true }));
    expect(buttons).toHaveLength(8);
    expect(within(tiles).getByText('1 分 42 秒')).toBeTruthy();
    const newUsers = tiles.querySelector('[data-metric="新用户"]') as HTMLElement;
    await userEvent.click(newUsers);
    expect(newUsers.getAttribute('aria-pressed')).toBe('true');
    const channels = screen.getByText('其中 AI 助手').closest('[data-slot=card]') as HTMLElement;
    expect(within(channels).getByText('自然搜索')).toBeTruthy();
    expect(within(channels).getByText('7.0%')).toBeTruthy();
  });

  it('switches reports and dimensions, and opens a row with its days against the period before', async () => {
    const { router } = renderPage();
    await screen.findByRole('group', { name: '按什么看' });
    expect(screen.getAllByText('引荐').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'AI 助手' }));
    expect(router.state.location.search).toBe('?by=ai');
    const table = screen.getByRole('table');
    expect(within(table).queryByText('google')).toBeNull();
    expect(within(table).getByText('chatgpt.com')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: '地区' }));
    expect(router.state.location.search).toBe('?tab=geo');
    await userEvent.click(screen.getByRole('button', { name: '美国' }));
    const drawer = await screen.findByRole('dialog');
    await waitFor(() => expect(action).toHaveBeenCalledWith('nrDataViews', 'websiteRow', expect.objectContaining({ body: expect.objectContaining({ table: 'country', dims: { countryId: 'US', country: 'United States' } }) })));
    expect(within(drawer).getByText('前一期')).toBeTruthy();
    expect(within(drawer).getAllByText('+25.0%').length).toBeGreaterThan(0);
  });

  it('lists pages with their search queries', async () => {
    renderPage('/website?tab=pages');
    expect(await screen.findByText('/docs')).toBeTruthy();
    expect(screen.getByText('Docs')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /\/docs/ }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('nocobase docs')).toBeTruthy();
  });
});
