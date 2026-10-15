// 页面 (client/pages/content-index.tsx): 更新时间, 访问, 搜索点击 and 搜索曝光 sort newest or largest first, then only flip
// between descending and ascending; pages without a value stay at the bottom both ways; unsorted columns show ↕.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, it, vi } from 'vitest';

import ContentPage from '#pages/content-index';
import { WorkspaceCacheProvider } from '#pages/workspace-cache';

const { action, taskList } = vi.hoisted(() => ({
  action: vi.fn(),
  taskList: { current: [] as unknown[] },
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
  useProject: () => ({ project: { id: 1, domains: ['x.com'] } }),
  taskRecords: async () => taskList.current,
}));

const page = (
  title: string,
  lastmod: string | null,
  views: number | null,
  clicks: number | null,
  impressions: number | null,
) => ({
  url: `https://x.com/${title}`,
  type: 'other',
  title,
  lastmod,
  views,
  clicks,
  impressions,
});

it('sorts the four figures descending first, then flips, with missing values last', async () => {
  action.mockResolvedValue({
    range: '28',
    cutoff: '2026-10-10',
    summary: {
      pages: 3,
      origin: 'https://x.com',
      enriched: 3,
      types: { other: 3 },
    },
    pages: [
      page('A', '2026-01-01T08:00:00Z', 5, null, 10),
      page('B', null, 50, 3, null),
      page('C', '2025-01-01', null, 1, 5),
    ],
  });
  const router = createMemoryRouter(
    [
      {
        path: '/content',
        element: (
          <WorkspaceCacheProvider>
            <ContentPage />
          </WorkspaceCacheProvider>
        ),
      },
    ],
    { initialEntries: ['/content'] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByText('A');
  const order = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('button')[0].textContent)
      .join('');
  const headers = screen.getAllByRole('columnheader');
  const sortButton = (i: number) =>
    headers[i].querySelector('button[aria-pressed]') as HTMLElement;
  // 页面 (with its type), 更新时间, 访问, 访问变化, 搜索点击, 点击变化, 搜索曝光, 进行中的任务
  expect(order()).toBe('BAC');
  expect(sortButton(2).getAttribute('aria-pressed')).toBe('true');
  expect(sortButton(2).querySelector('[data-unsorted]')).toBeNull();
  for (const i of [1, 3, 4, 5, 6])
    expect(sortButton(i).querySelector('[data-unsorted]')).not.toBeNull();
  expect(screen.getByText('2026-01-01')).toBeTruthy();

  for (const [i, desc, asc] of [
    [1, 'ACB', 'CAB'],
    [2, 'BAC', 'ABC'],
    [4, 'BCA', 'CBA'],
    [6, 'ACB', 'CAB'],
  ] as const) {
    const button = sortButton(i);
    await userEvent.click(button);
    expect(order()).toBe(desc);
    await userEvent.click(button);
    expect(order()).toBe(asc);
    await userEvent.click(button);
    expect(order()).toBe(desc);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  }
});

it('counts its tabs from the pages listed, with pages outside the sitemap counted and in a tab of their own', async () => {
  action.mockResolvedValue({
    range: '28',
    cutoff: '2026-10-10',
    summary: {
      pages: 2,
      origin: 'https://x.com',
      enriched: 2,
      types: { page: 1, blog: 1 },
    },
    pages: [
      { ...page('Home', null, 900, 1, 10), type: 'page' },
      { ...page('Post', null, 50, null, null), type: 'blog' },
      {
        url: 'https://x.com/solutions/all-in-one',
        type: 'page',
        outsideSitemap: true,
        views: 1016,
        clicks: null,
        impressions: null,
      },
      {
        url: 'https://x.com/blog/timeline',
        type: 'blog',
        outsideSitemap: true,
        views: 1596,
        clicks: null,
        impressions: null,
      },
    ],
  });
  const router = createMemoryRouter(
    [
      {
        path: '/content',
        element: (
          <WorkspaceCacheProvider>
            <ContentPage />
          </WorkspaceCacheProvider>
        ),
      },
    ],
    { initialEntries: ['/content'] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByText('Home');
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
    '全部 (4)',
    '其他页面 (2)',
    '博客 (2)',
    '站点地图外 (2)',
  ]);
  await userEvent.click(screen.getByRole('tab', { name: '站点地图外 (2)' }));
  expect(
    screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('button')[0].textContent),
  ).toEqual(['/blog/timeline', '/solutions/all-in-one']);
});

it('shows a page’s active task as its number, its title on up to two lines, and how many more there are', async () => {
  const work = (url: string) => ({
    schemaVersion: 2,
    stage: 'flow',
    flow: { stages: [{ key: 'b', name: '修改', kind: 'agent' }] },
    stageIndex: 0,
    page: { url },
  });
  taskList.current = [
    {
      id: 14,
      title: '提升 www.nocobase.com 首页的搜索点击率：改写标题和描述',
      evidence: { no: 14, work: work('https://x.com/Home') },
    },
    {
      id: 15,
      title: '首页补充结构化数据',
      evidence: { no: 15, work: work('https://x.com/Home') },
    },
  ];
  action.mockResolvedValue({
    range: '28',
    cutoff: '2026-10-10',
    summary: {
      pages: 1,
      origin: 'https://x.com',
      enriched: 1,
      types: { page: 1 },
    },
    pages: [{ ...page('Home', null, 900, 1, 10), type: 'page' }],
  });
  const router = createMemoryRouter(
    [
      {
        path: '/content',
        element: (
          <WorkspaceCacheProvider>
            <ContentPage />
          </WorkspaceCacheProvider>
        ),
      },
    ],
    { initialEntries: ['/content'] },
  );
  render(<RouterProvider router={router} />);
  const title = await screen.findByText(
    '提升 www.nocobase.com 首页的搜索点击率：改写标题和描述',
  );
  expect(title.className).toContain('line-clamp-2');
  const button = title.closest('button')!;
  expect(button.getAttribute('title')).toBe(
    '提升 www.nocobase.com 首页的搜索点击率：改写标题和描述',
  );
  expect(within(button).getByText('T-14')).toBeTruthy();
  expect(
    within(button).getByLabelText('还有 1 个进行中的任务').textContent,
  ).toBe('+1');
  taskList.current = [];
});

it('shows how each page moved against the period before, sorts by it, and says when GA4 does not track a site', async () => {
  action.mockResolvedValue({
    range: '28',
    cutoff: '2026-10-10',
    complete: true,
    summary: {
      pages: 3,
      origin: 'https://x.com',
      enriched: 3,
      types: { page: 3 },
    },
    pages: [
      {
        ...page('Up', null, 1100, 30, 300),
        type: 'page',
        previousViews: 1000,
        previousClicks: 20,
      },
      {
        ...page('Down', null, 400, 5, 50),
        type: 'page',
        previousViews: 1000,
        previousClicks: 10,
      },
      {
        ...page('Docs', null, null, 13, 2975),
        type: 'page',
        ga4Untracked: true,
        previousViews: null,
        previousClicks: null,
      },
    ],
  });
  const router = createMemoryRouter(
    [
      {
        path: '/content',
        element: (
          <WorkspaceCacheProvider>
            <ContentPage />
          </WorkspaceCacheProvider>
        ),
      },
    ],
    { initialEntries: ['/content'] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByText('Up');
  const cells = (name: string) => {
    const row = screen.getByRole('button', { name }).closest('tr')!;
    return within(row)
      .getAllByRole('cell')
      .map((c) => c.textContent);
  };
  expect(cells('Up').slice(2, 5)).toEqual(['1,100', '+100', '30']);
  expect(cells('Down').slice(2, 6)).toEqual(['400', '−600', '5', '−5']);
  expect(cells('Docs').slice(2, 4)).toEqual(['未统计', '—']);
  // The percentage is in the change's tooltip; the type sits under the page.
  expect(screen.getByText('−600').getAttribute('title')).toBe('−60%');
  expect(cells('Up')[0]).toContain('其他页面');
  const order = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('button')[0].textContent)
      .join(',');
  const header = screen
    .getAllByRole('columnheader')
    .find((h) => h.textContent?.includes('访问变化'))!
    .querySelector('button[aria-pressed]') as HTMLElement;
  await userEvent.click(header);
  expect(order()).toBe('Up,Down,Docs');
  await userEvent.click(header);
  expect(order()).toBe('Down,Up,Docs');
});

it('says, in the outside-sitemap tab, when only the busiest of those pages are listed', async () => {
  action.mockResolvedValue({
    range: '28',
    cutoff: '2026-10-10',
    complete: true,
    summary: {
      pages: 1,
      origin: 'https://x.com',
      enriched: 1,
      types: { page: 1 },
    },
    outsideSitemap: { shown: 1, total: 340 },
    pages: [
      { ...page('Home', null, 900, 1, 10), type: 'page' },
      {
        url: 'https://x.com/solutions',
        type: 'page',
        outsideSitemap: true,
        views: 600,
        clicks: 0,
        impressions: 0,
      },
    ],
  });
  const router = createMemoryRouter(
    [
      {
        path: '/content',
        element: (
          <WorkspaceCacheProvider>
            <ContentPage />
          </WorkspaceCacheProvider>
        ),
      },
    ],
    { initialEntries: ['/content'] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByText('Home');
  expect(document.querySelector('[data-outside-cap]')).toBeNull();
  await userEvent.click(screen.getByRole('tab', { name: '站点地图外 (1)' }));
  expect(
    screen.getByText('只显示流量最高的 1 个，站点地图外一共有 340 个页面。'),
  ).toBeTruthy();
});
