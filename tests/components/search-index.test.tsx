// 搜索表现 · 索引 and 站点地图 (client/pages/search-performance/indexing.tsx, sitemaps.tsx), 2026-10-14: the sub-page
// tabs, figures picking the table's tab, reasons filtering it, a page's detail, ticked pages handed to the Agent, and
// submitted and unsubmitted sitemaps.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SearchPerformancePage from '#pages/search-performance/index';
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
  useProject: () => ({ project: { id: 1, domains: ['example.com'] } }),
  taskRecords: async () => [],
}));
const { dialog } = vi.hoisted(() => ({ dialog: vi.fn() }));
vi.mock('#pages/keyword-hand-off', async (original) => ({
  ...(await original<object>()),
  DraftHandOffDialog: (props: { draft: { title: string; brief: string } }) => {
    dialog(props);
    return <div role='alertdialog'>{props.draft.title}</div>;
  },
}));

type Raw = Record<string, any>;
const page = (path: string, extra: Raw) => ({
  url: `https://example.com${path}`,
  type: path.startsWith('/docs') ? 'docs' : 'page',
  checkedAt: '2026-10-14T08:00:00.000Z',
  lastCrawlTime: '2026-10-12T05:00:00Z',
  crawledAs: 'MOBILE',
  canonicalMismatch: false,
  rich: [],
  error: null,
  ...extra,
});
const indexView = (extra: Raw = {}): Raw => ({
  connected: true,
  site: 'sc-domain:example.com',
  hasContent: true,
  total: 5,
  outside: 2,
  now: '2026-10-14T09:00:00.000Z',
  running: false,
  lastRunAt: '2026-10-14T08:00:00.000Z',
  lastError: null,
  quota: { used: 4, daily: 500 },
  history: [
    { date: '2026-10-13', indexed: 2, notIndexed: 1, checked: 3 },
    { date: '2026-10-14', indexed: 2, notIndexed: 2, checked: 4 },
  ],
  pages: [
    page('/', {
      status: 'indexed',
      coverageState: 'Submitted and indexed',
      verdict: 'PASS',
    }),
    page('/pricing', {
      status: 'indexed',
      coverageState: 'Submitted and indexed',
      verdict: 'PASS',
      canonicalMismatch: true,
      rich: [{ type: 'FAQ', errors: 1, warnings: 0 }],
    }),
    page('/docs/a', {
      status: 'notIndexed',
      coverageState: 'Crawled - currently not indexed',
      verdict: 'NEUTRAL',
      lastCrawlTime: '2026-08-01T00:00:00Z',
    }),
    page('/blog/b', {
      status: 'notIndexed',
      coverageState: 'Discovered - currently not indexed',
      verdict: 'NEUTRAL',
      lastCrawlTime: null,
      crawledAs: null,
    }),
    { url: 'https://example.com/new', type: 'page', status: 'unchecked' },
  ],
  ...extra,
});
const sitemaps: Raw = {
  connected: true,
  site: 'sc-domain:example.com',
  readAt: '2026-10-14T09:00:00.000Z',
  sitemaps: [
    {
      path: 'https://example.com/sitemap.xml',
      type: 'sitemap',
      isIndex: true,
      isPending: false,
      lastSubmitted: '2026-05-01T00:00:00Z',
      lastDownloaded: '2026-10-13T00:00:00Z',
      warnings: 2,
      errors: 0,
      contents: [
        { type: 'web', submitted: 12 },
        { type: 'image', submitted: 3 },
      ],
      checked: 4,
      indexed: 2,
      children: [
        {
          path: 'https://example.com/sitemap-docs.xml',
          type: 'sitemap',
          isIndex: false,
          isPending: false,
          lastSubmitted: null,
          lastDownloaded: '2026-10-13T00:00:00Z',
          warnings: 2,
          errors: 0,
          contents: [{ type: 'web', submitted: 5 }],
          checked: 1,
          indexed: 0,
        },
      ],
    },
  ],
  unsubmitted: [
    { path: 'https://example.com/blog/sitemap.xml', checked: 0, indexed: 0 },
  ],
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
  return { router, ...render(<RouterProvider router={router} />) };
}
const tile = (key: string) =>
  document.querySelector(`[data-index-tile="${key}"]`) as HTMLElement;
const table = () => document.querySelector('[data-report]') as HTMLElement;

describe('搜索表现 · 索引 and 站点地图', () => {
  let index: Raw;
  beforeEach(() => {
    sessionStorage.clear();
    action.mockReset();
    dialog.mockReset();
    index = indexView();
    action.mockImplementation(
      async (resource: string, name: string, options: { body: Raw }) => {
        if (resource === 'nrSearchIndex' && name === 'view') return index;
        if (resource === 'nrSearchIndex' && name === 'sitemaps')
          return sitemaps;
        if (resource === 'nrSearchIndex' && name === 'page')
          return {
            connected: true,
            site: 'sc-domain:example.com',
            url: options.body.url,
            result: {
              checkedAt: '2026-10-14T08:00:00.000Z',
              verdict: 'PASS',
              coverageState: 'Submitted and indexed',
              robotsTxtState: 'ALLOWED',
              indexingState: 'INDEXING_ALLOWED',
              pageFetchState: 'SUCCESSFUL',
              lastCrawlTime: '2026-10-12T05:00:00Z',
              googleCanonical: 'https://example.com/plans',
              userCanonical: 'https://example.com/pricing',
              crawledAs: 'MOBILE',
              sitemaps: ['https://example.com/sitemap-pages.xml'],
              referringUrls: ['https://example.com/'],
              link: 'https://search.google.com/search-console/inspect?id=1',
              richResults: {
                verdict: 'FAIL',
                types: [
                  {
                    type: 'FAQ',
                    items: 1,
                    issues: [
                      {
                        item: 'Unnamed item',
                        message: 'Missing field "acceptedAnswer"',
                        severity: 'ERROR',
                      },
                    ],
                  },
                ],
              },
              indexed: true,
              canonicalMismatch: true,
            },
          };
        if (name === 'search') return { connected: true, cutoff: null };
        throw new Error(`unexpected ${resource}.${name}`);
      },
    );
  });

  it('switches sub-pages through ?view=, keeping only the time range', async () => {
    const { router } = renderPage('/search?days=90&type=image&tab=pages');
    await userEvent.click(await screen.findByRole('tab', { name: '索引' }));
    expect(router.state.location.search).toBe('?days=90&view=index');
    await waitFor(() => expect(tile('indexed')).toBeTruthy());
    await userEvent.click(screen.getByRole('tab', { name: '站点地图' }));
    expect(router.state.location.search).toBe('?days=90&view=sitemaps');
    await userEvent.click(screen.getByRole('tab', { name: '效果' }));
    expect(router.state.location.search).toBe('?days=90');
  });

  it('shows indexed and not indexed pages; a figure picks the tab and a reason filters the table', async () => {
    const { router } = renderPage('/search?view=index');
    await waitFor(() => expect(tile('indexed')).toBeTruthy());
    expect(tile('indexed').textContent).toContain('2');
    expect(tile('indexed').textContent).toContain('占已检查 50%');
    expect(tile('notIndexed').textContent).toContain('2 种原因');
    expect(tile('canonical').textContent).toContain('1');
    expect(tile('rich').textContent).toContain('1 个错误 · 0 个警告');
    expect(
      document.querySelector('[data-index-status]')!.textContent,
    ).toContain('已检查 4 / 5 个页面');
    expect(document.querySelector('[data-index-history]')).toBeTruthy();
    const crawl = document.querySelector('[data-index-crawl]') as HTMLElement;
    expect(within(crawl).getByText('从未抓取')).toBeTruthy();
    await userEvent.click(
      within(tile('canonical')).getByRole('button', { name: '规范网址不一致' }),
    );
    expect(router.state.location.search).toContain('list=canonical');
    expect(within(table()).getByText('/pricing')).toBeTruthy();
    expect(within(table()).queryByText('/docs/a')).toBeNull();
    const reasons = document.querySelector(
      '[data-index-reasons]',
    ) as HTMLElement;
    await userEvent.click(
      within(reasons).getByRole('button', { name: '已抓取 - 尚未编入索引' }),
    );
    expect(router.state.location.search).toContain('list=notIndexed');
    expect(router.state.location.search).toContain(
      'reason=Crawled+-+currently+not+indexed',
    );
    expect(within(table()).getByText('/docs/a')).toBeTruthy();
    expect(within(table()).queryByText('/blog/b')).toBeNull();
  });

  it("opens a page with Google's answer and hands ticked pages to the Agent", async () => {
    renderPage('/search?view=index');
    await waitFor(() => expect(tile('indexed')).toBeTruthy());
    await userEvent.click(
      within(table()).getByRole('button', { name: '/pricing' }),
    );
    const drawer = await screen.findByRole('dialog');
    expect(
      await within(drawer).findByText('https://example.com/plans'),
    ).toBeTruthy();
    expect(within(drawer).getByText('手机版 Googlebot')).toBeTruthy();
    expect(
      within(drawer).getByText(/Missing field "acceptedAnswer"/),
    ).toBeTruthy();
    expect(
      within(drawer).getByRole('link', { name: /在 Search Console 中打开/ }),
    ).toBeTruthy();
    await userEvent.click(
      within(drawer).getByRole('button', { name: '交给 Agent' }),
    );
    await waitFor(() => expect(dialog).toHaveBeenCalled());
    const draft = dialog.mock.calls[0][0].draft;
    expect(draft.title).toBe('解决 /pricing 的索引问题');
    expect(draft.brief).toContain('Google 选的规范网址与页面声明的不同');
    expect(draft.brief).toContain('常见问题 1 个错误');
    expect(dialog.mock.calls[0][0].playbookId).toBe('optimize-page');
  });

  it('says when the first pages are being checked and asks for the website first', async () => {
    index = indexView({
      running: true,
      pages: [
        { url: 'https://example.com/', type: 'page', status: 'unchecked' },
      ],
    });
    const { unmount } = renderPage('/search?view=index');
    expect(await screen.findByText('正在检查第一批页面')).toBeTruthy();
    unmount();
    sessionStorage.clear();
    index = indexView({ hasContent: false, total: 0, pages: [] });
    renderPage('/search?view=index');
    expect(await screen.findByText('先接入网站')).toBeTruthy();
  });

  it('lists submitted sitemaps with their files and the ones not submitted', async () => {
    const { router } = renderPage('/search?view=sitemaps');
    const urls = await waitFor(() => {
      const el = document.querySelector(
        '[data-sitemaps-tile="urls"]',
      ) as HTMLElement;
      expect(el).toBeTruthy();
      return el;
    });
    expect(urls.textContent).toContain('15');
    expect(urls.textContent).toContain('网页 12 · 图片 3');
    expect(within(table()).getByText('2 / 4')).toBeTruthy();
    expect(within(table()).getByText('未提交')).toBeTruthy();
    await userEvent.click(
      within(table()).getByRole('tab', { name: '未提交 1' }),
    );
    expect(router.state.location.search).toContain('list=unsubmitted');
    expect(within(table()).queryByText('/sitemap.xml')).toBeNull();
    await userEvent.click(
      within(table()).getByRole('button', { name: '/blog/sitemap.xml' }),
    );
    const drawer = await screen.findByRole('dialog');
    expect(
      within(drawer).getByText(/Search Console 里没有它的提交记录/),
    ).toBeTruthy();
    await userEvent.click(within(drawer).getByRole('button', { name: /关闭/ }));
    await userEvent.click(within(table()).getByRole('tab', { name: '全部 2' }));
    await userEvent.click(
      within(table()).getByRole('button', { name: '/sitemap.xml' }),
    );
    const detail = await screen.findByRole('dialog');
    expect(within(detail).getByText('/sitemap-docs.xml')).toBeTruthy();
    expect(
      within(detail).getByText('已检查的 4 个页面里，2 个已编入索引。'),
    ).toBeTruthy();
  });
});
