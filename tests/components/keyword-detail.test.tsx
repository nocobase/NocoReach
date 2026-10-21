// Keyword details (client/pages/keyword-detail.tsx): a page over the Keywords tab it was opened from. It shows the overview,
// the 12 months, related keywords (a click opens that keyword), the site's pages Google showed for it, the top 10 with
// the site marked, and its header trail leads back to the same tab without its own parameters.
import {
  PageBreadcrumbProvider,
  usePageBreadcrumbLevels,
} from '@nocobase/app-client';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import KeywordDetailPage from '#pages/keyword-detail';
import { WorkspaceCacheProvider } from '#pages/workspace-cache';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
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
  useProject: () => ({ project: { id: 1, domains: ['nocobase.com'] } }),
}));
vi.mock('#pages/keyword-hand-off', () => ({
  KeywordHandOffDialog: () => null,
}));

const item = (keyword: string, volume: number) => ({
  keyword,
  volume,
  cpc: 29.88,
  competition: 0.32,
  competitionLevel: 'LOW',
  difficulty: 55,
  intent: 'commercial',
  monthlySearches: [
    { year: 2025, month: 9, volume: 1600 },
    { year: 2026, month: 8, volume: 2400 },
  ],
  trend: { monthly: 0, quarterly: 26, yearly: 50 },
  coreKeyword: 'crm',
  serpFeatures: ['ai_overview'],
  resultsCount: 141000,
  referringDomains: 120,
  backlinks: 5000,
});
const site = (over = {}) => ({
  keyword: 'open source crm',
  market: { locationCode: 2840, language: 'en' },
  dataforseo: true,
  saved: null,
  tracking: null,
  gsc: {
    connected: true,
    cutoff: '2026-10-12',
    window: { start: '2026-09-15', end: '2026-10-12' },
    pages: [
      {
        url: 'https://www.nocobase.com/en/blog/crm',
        clicks: 1,
        impressions: 1689,
        position: 13.7,
      },
    ],
    queries: [
      {
        query: 'best open source crm 2026',
        clicks: 3,
        impressions: 90,
        position: 9,
        page: 'https://www.nocobase.com/en/blog/top',
      },
    ],
  },
  mentions: [
    { url: 'https://www.nocobase.com/en/solutions/crm', title: 'Build a CRM' },
  ],
  ...over,
});
function answer(market: unknown) {
  action.mockImplementation(async (resource: string, act: string) => {
    if (resource === 'nrDataViews') return { connected: true, trend: [] };
    if (act === 'site') return site();
    if (act === 'market') return market;
    if (act === 'serp')
      return {
        connected: true,
        source: 'lookup',
        status: 'ready',
        at: '2026-10-15T01:00:00Z',
        items: [
          {
            position: 1,
            title: 'Best CRM',
            url: 'https://reddit.com/r/crm',
            domain: 'reddit.com',
            own: false,
          },
          {
            position: 7,
            title: 'GitHub open source CRM',
            url: 'https://www.nocobase.com/en/blog/crm',
            domain: 'www.nocobase.com',
            own: true,
          },
        ],
        questions: ['What is the best open source CRM?'],
        related: [],
        features: [],
      };
    throw new Error(`unexpected ${resource}/${act}`);
  });
}
// What the layout's header would show: the trail the page declares.
function Trail() {
  const levels = usePageBreadcrumbLevels();
  return (
    <ol aria-label='trail'>
      {levels?.map((level) => (
        <li key={level.label}>
          {level.to ? <Link to={level.to}>{level.label}</Link> : level.label}
        </li>
      ))}
    </ol>
  );
}

function open(
  url = '/keywords/detail?tab=saved&kw=open%20source%20crm&kwLoc=2840&kwLang=en',
) {
  const router = createMemoryRouter(
    [
      {
        path: '/keywords',
        element: (
          <WorkspaceCacheProvider>
            <PageBreadcrumbProvider>
              <Trail />
              <p>keywords list</p>
              <Outlet />
            </PageBreadcrumbProvider>
          </WorkspaceCacheProvider>
        ),
        children: [{ path: 'detail', element: <KeywordDetailPage /> }],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}
beforeEach(() => {
  action.mockReset();
});

it('shows the overview, the related keywords, the site pages and the top 10 with the site marked', async () => {
  answer({
    connected: true,
    overview: {
      status: 'ready',
      at: '2026-10-15T01:00:00Z',
      item: item('open source crm', 1600),
    },
    related: {
      status: 'ready',
      message: null,
      related: [item('crm open source', 880)],
      matching: [],
      questions: [],
    },
  });
  open();
  expect(
    await screen.findByRole('heading', { level: 1, name: 'open source crm' }),
  ).toBeVisible();
  const overview = await screen.findByLabelText('概览');
  expect(within(overview).getByText('1,600')).toBeVisible();
  expect(within(overview).getByText('同比 +50% · 3 个月 +26%')).toBeVisible();
  expect(within(overview).getByText('上位主题：crm')).toBeVisible();
  expect(within(overview).getByText('AI 概览')).toBeVisible();
  expect(screen.getByRole('tab', { name: '相关搜索 (1)' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getByRole('tab', { name: '问题 (1)' })).toBeVisible();
  expect(screen.getByRole('link', { name: '/en/blog/crm' })).toHaveAttribute(
    'href',
    'https://www.nocobase.com/en/blog/crm',
  );
  expect(screen.getByRole('link', { name: 'Build a CRM' })).toBeVisible();
  const top = await screen.findByText('GitHub open source CRM');
  expect(within(top.closest('li')!).getByText('本站')).toBeVisible();
});

it('opens a related keyword in place, and its trail goes back to the tab it came from', async () => {
  answer({
    connected: true,
    overview: { status: 'ready', at: 't', item: item('open source crm', 1600) },
    related: {
      status: 'ready',
      message: null,
      related: [item('crm open source', 880)],
      matching: [],
      questions: [],
    },
  });
  const router = open();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'crm open source' }),
  );
  expect(new URLSearchParams(router.state.location.search).get('kw')).toBe(
    'crm open source',
  );
  expect(
    await screen.findByRole('heading', { level: 1, name: 'crm open source' }),
  ).toBeVisible();
  // The header's trail is the only way back (L6): Keywords › crm open source, without the detail's own parameters.
  const trail = screen.getByRole('list', { name: 'trail' });
  const [keywords, current] = within(trail).getAllByRole('listitem');
  expect(within(keywords!).getByRole('link')).toHaveAttribute(
    'href',
    '/keywords?tab=saved',
  );
  expect(current).toHaveTextContent('crm open source');
  expect(screen.queryByRole('link', { name: /返回/ })).toBeNull();
});

it('says what to do when DataForSEO is not connected, and what a keyword without market data means', async () => {
  answer({ connected: false });
  open();
  expect(
    (await screen.findAllByText(/接上 DataForSEO 后/)).length,
  ).toBeGreaterThan(0);
  expect(screen.getByRole('link', { name: '/en/blog/crm' })).toBeVisible();
  action.mockReset();
  answer({
    connected: true,
    overview: { status: 'ready', at: 't', item: null },
    related: {
      status: 'ready',
      message: null,
      related: [],
      matching: [],
      questions: [],
    },
  });
  open('/keywords/detail?kw=self%20hosted%20crm&kwLoc=2840&kwLang=en');
  expect(
    await screen.findByText(/DataForSEO 的关键词库里没有这个词的数据/),
  ).toBeVisible();
});
