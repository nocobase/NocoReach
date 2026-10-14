// 页面 (client/pages/content-index.tsx): 更新时间, 访问, 搜索点击 and 搜索曝光 sort newest or largest first, then only flip
// between descending and ascending; pages without a value stay at the bottom both ways; unsorted columns show ↕.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, it, vi } from 'vitest';

import ContentPage from '#pages/content-index';
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
  useProject: () => ({ project: { id: 1, domains: ['x.com'] } }),
  taskRecords: async () => [],
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
  // 页面, 类型, 更新时间, 访问, 搜索点击, 搜索曝光, 进行中的任务
  expect(order()).toBe('BAC');
  expect(sortButton(3).getAttribute('aria-pressed')).toBe('true');
  expect(sortButton(3).querySelector('[data-unsorted]')).toBeNull();
  for (const i of [2, 4, 5])
    expect(sortButton(i).querySelector('[data-unsorted]')).not.toBeNull();
  expect(screen.getByText('2026-01-01')).toBeTruthy();

  for (const [i, desc, asc] of [
    [2, 'ACB', 'CAB'],
    [3, 'BAC', 'ABC'],
    [4, 'BCA', 'CBA'],
    [5, 'ACB', 'CAB'],
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
