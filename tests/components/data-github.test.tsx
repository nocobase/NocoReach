// GitHub page (client/pages/data-github/), 我们的仓库 rebuilt 2026-10-14 in the shape of 访问. The page is fed what the
// real view (server/nocoreach/github-view.ts) builds from a small repository history, so the two stay in step.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DataGitHub from '#pages/data-github/index';
import { WorkspaceCacheProvider } from '#pages/workspace-cache';
// @ts-expect-error The server modules are plain JavaScript under ts-nocheck.
import { addCommit, addIssue } from '../../server/nocoreach/github-source.js';
// @ts-expect-error The server modules are plain JavaScript under ts-nocheck.
import { githubView } from '../../server/nocoreach/github-view.js';
// @ts-expect-error The server modules are plain JavaScript under ts-nocheck.
import { windowFor } from '../../server/nocoreach/data-views.js';

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
  taskRecords: async () => [],
}));

type Raw = Record<string, unknown>;
function state() {
  const daily: Record<string, Raw> = {},
    views: Record<string, Raw> = {},
    clones: Record<string, Raw> = {};
  for (let i = 0; i < 40; i++) {
    const d = new Date(Date.UTC(2026, 8, 1) + i * 86400000)
      .toISOString()
      .slice(0, 10);
    daily[d] = {
      stars: 1000 + i * 4,
      forks: 100 + Math.floor(i / 3),
      watchers: 30,
    };
    if (i >= 30) {
      views[d] = { count: 60 + i, uniques: 20 };
      clones[d] = { count: 9, uniques: 3 };
    }
  }
  return {
    repo: 'o/r',
    url: 'https://github.com/o/r',
    description: 'An open-source app builder',
    status: 'active',
    daily,
    starHistory: { complete: true },
    traffic: {
      views,
      clones,
      referrers: {
        '2026-10-10': [
          { referrer: 'Google', count: 40, uniques: 25 },
          { referrer: 'chatgpt.com', count: 9, uniques: 7 },
          { referrer: 'nocobase.com', count: 51, uniques: 30 },
        ],
      },
      paths: {
        '2026-10-10': [
          { path: '/o/r', title: 'r', count: 70, uniques: 40 },
          { path: '/o/r/releases', title: 'Releases', count: 30, uniques: 20 },
        ],
      },
    },
    profile: {
      languages: { TypeScript: 900, CSS: 100 },
      topics: ['low-code', 'ai'],
      contributors: [
        { login: 'lead', contributions: 50 },
        { login: 'ann', contributions: 9 },
      ],
    },
    issues: {
      total: 1,
      top: [
        {
          title: 'Docs for linkage',
          url: 'https://github.com/o/r/issues/1',
          comments: 4,
          state: 'open',
        },
      ],
      labels: { bug: 3 },
    },
    discussions: {
      enabled: true,
      total: 0,
      answered: 0,
      categories: {},
      top: [],
    },
  };
}
function activity() {
  const items = {},
    details = {},
    team = new Set<string>(),
    commits = {};
  const at = (d: string) => `${d}T08:00:00Z`;
  addIssue(
    items,
    team,
    {
      number: 1,
      title: 'Docs for linkage',
      html_url: 'https://github.com/o/r/issues/1',
      comments: 4,
      created_at: at('2026-09-20'),
      closed_at: at('2026-09-22'),
      author_association: 'CONTRIBUTOR',
      user: { login: 'ann' },
    },
    details,
  );
  addIssue(
    items,
    team,
    {
      number: 2,
      title: 'Fix the chart',
      html_url: 'https://github.com/o/r/pull/2',
      created_at: at('2026-10-02'),
      closed_at: at('2026-10-03'),
      author_association: 'CONTRIBUTOR',
      user: { login: 'ann' },
      pull_request: { merged_at: at('2026-10-03') },
    },
    details,
  );
  addIssue(
    items,
    team,
    {
      number: 3,
      title: 'New sidebar',
      created_at: at('2026-10-05'),
      closed_at: null,
      author_association: 'MEMBER',
      user: { login: 'lead' },
      pull_request: { merged_at: null },
    },
    details,
  );
  for (const [d, who] of [
    ['2026-09-05', 'lead'],
    ['2026-10-02', 'ann'],
    ['2026-10-06', 'bob'],
  ])
    addCommit(commits, {
      author: { login: who },
      commit: { author: { date: at(d) } },
    });
  return {
    repo: 'o/r',
    version: 2,
    complete: true,
    items,
    details,
    commits,
    team: [...team],
    members: [],
    releases: [
      {
        tag: 'v2',
        name: 'Version 2',
        date: '2026-10-01',
        url: 'https://github.com/o/r/releases/v2',
        downloads: 12,
        assets: [{ name: 'app.zip', downloads: 12, size: 4096 }],
      },
    ],
  };
}
const viewFor = (body: Raw, token = true) =>
  githubView(state(), token ? activity() : null, body, {
    windowFor,
    end: '2026-10-09',
    own: ['nocobase.com'],
    token,
  });

function renderPage(path = '/github') {
  const router = createMemoryRouter(
    [
      {
        path: '/github',
        element: (
          <WorkspaceCacheProvider>
            <DataGitHub />
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
    expect(document.querySelector('[data-metric="stars"]')).toBeTruthy(),
  );

describe('GitHub', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(() => {
    // Dates in the current year are written without the year: fix the year the fixtures are in.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 21, 12));
    sessionStorage.clear();
    action.mockReset();
    action.mockImplementation(
      async (_r: string, name: string, options: { body: Raw }) => {
        if (name !== 'github') throw new Error(`unexpected ${name}`);
        return viewFor(options.body);
      },
    );
  });

  it('describes the page, links the repository beside the range, and shows the eight figures', async () => {
    renderPage();
    await ready();
    expect(
      screen.getByText(
        '项目仓库的 Star、贡献、Issue、PR 和访问来源，以及 GitHub 上关注话题的热门动向。',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('An open-source app builder')).toBeNull();
    const summary = document.querySelector('.nr-range-summary') as HTMLElement;
    expect(
      within(summary).getByRole('link', { name: 'o/r' }).getAttribute('href'),
    ).toBe('https://github.com/o/r');
    expect(summary.textContent).toBe('o/r · 09-12 至 10-09 · 对比前 28 天');
    for (const key of [
      'stars',
      'forks',
      'views',
      'clones',
      'commits',
      'contributors',
      'issues',
      'pulls',
    ])
      expect(tile(key)).toBeTruthy();
    expect(within(tile('stars')).getByText('112')).toBeTruthy();
    expect(within(tile('stars')).getByText('累计 1,152')).toBeTruthy();
    expect(within(tile('contributors')).getByText('2')).toBeTruthy();
    expect(
      within(tile('pulls')).getByText('合并率 100.0% · 待处理 1'),
    ).toBeTruthy();
    expect(within(tile('views')).getByText('日均独立访客 20')).toBeTruthy();
  });

  it('a figure picks the daily line', async () => {
    renderPage();
    await ready();
    expect(document.querySelector('[data-trend="stars"]')).toBeTruthy();
    expect(screen.getByText('新增 Star · 按天')).toBeTruthy();
    await userEvent.click(
      within(tile('commits')).getByRole('button', { name: '提交' }),
    );
    expect(tile('commits').querySelector('[aria-pressed="true"]')).toBeTruthy();
    const trend = document.querySelector(
      '[data-trend="commits"]',
    ) as HTMLElement;
    expect(within(trend).getByText('提交 · 按天')).toBeTruthy();
    // No strip of daily average, peak and last 7 days under the chart (removed 2026-10-14).
    expect(trend.querySelector('[data-stats]')).toBeNull();
    expect(screen.getByRole('button', { name: '全部时间' })).toBeTruthy();
  });

  it('全部时间 asks for every record and drops the period before', async () => {
    renderPage('/github?days=all');
    await ready();
    expect(action).toHaveBeenCalledWith(
      'nrDataViews',
      'github',
      expect.objectContaining({
        body: expect.objectContaining({ range: 'all' }),
      }),
    );
    expect(
      (document.querySelector('.nr-range-summary') as HTMLElement).textContent,
    ).toBe('o/r · 09-01 至 10-09 · 全部记录');
    expect(tile('stars').textContent).not.toMatch(/[▲▼]/);
  });

  it('says why views are empty before the first saved day', async () => {
    action.mockImplementation(
      async (_r: string, _n: string, options: { body: Raw }) =>
        viewFor({
          ...options.body,
          range: 'custom',
          from: '2026-09-02',
          to: '2026-09-08',
        }),
    );
    renderPage('/github?days=custom&from=2026-09-02&to=2026-09-08');
    await ready();
    expect(
      within(tile('views')).getByText('从 2026-10-01 起保存'),
    ).toBeTruthy();
    await userEvent.click(
      within(tile('views')).getByRole('button', { name: '浏览' }),
    );
    expect(
      within(
        document.querySelector('[data-trend="views"]') as HTMLElement,
      ).getByText(
        'GitHub 只保留最近 14 天，NocoReach 从 2026-10-01 起每天保存，所以这之前没有数据。',
      ),
    ).toBeTruthy();
  });

  it('shows community health, where visits come from and what the repository is made of', async () => {
    renderPage();
    await ready();
    const health = document.querySelector('[data-health]') as HTMLElement;
    expect(within(health).getByText('外部 PR 占比（估算）')).toBeTruthy();
    expect(within(health).getByText('0 / 1')).toBeTruthy();
    const sources = document.querySelector('[data-sources]') as HTMLElement;
    expect(within(sources).getByText('AI 助手')).toBeTruthy();
    expect(within(sources).getByText(/AI 助手带来 9 次浏览/)).toBeTruthy();
    const composition = document.querySelector(
      '[data-composition]',
    ) as HTMLElement;
    expect(within(composition).getByText('TypeScript')).toBeTruthy();
    expect(within(composition).getByText('low-code')).toBeTruthy();
  });

  it('lists referring sites, pages, contributors, issues, pull requests and releases on the table tabs', async () => {
    const { router } = renderPage();
    await ready();
    const report = document.querySelector('[data-report]') as HTMLElement;
    expect(within(report).getByText('chatgpt.com')).toBeTruthy();
    expect(within(report).getByText('自有')).toBeTruthy();
    await userEvent.click(
      within(report).getByRole('button', { name: 'chatgpt.com' }),
    );
    expect(await screen.findByText('来源网站 · chatgpt.com')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '关闭详情' }));
    await userEvent.click(
      within(report).getByRole('tab', { name: '热门页面' }),
    );
    expect(router.state.location.search).toBe('?tab=paths');
    expect(within(report).getByText('仓库首页')).toBeTruthy();
    await userEvent.click(within(report).getByRole('tab', { name: '贡献者' }));
    expect(within(report).getAllByText('外部').length).toBeGreaterThan(0);
    expect(within(report).getByText('bob')).toBeTruthy();
    await userEvent.click(within(report).getByRole('tab', { name: 'Issue' }));
    expect(
      within(report).getByRole('link', { name: 'Docs for linkage' }),
    ).toBeTruthy();
    await userEvent.click(within(report).getByRole('tab', { name: 'PR' }));
    expect(within(report).getByText('Fix the chart')).toBeTruthy();
    expect(within(report).getByText('已合并')).toBeTruthy();
    await userEvent.type(within(report).getByRole('textbox'), 'sidebar');
    expect(within(report).queryByText('Fix the chart')).toBeNull();
    expect(within(report).getByText('New sidebar')).toBeTruthy();
    await userEvent.click(
      within(report).getByRole('tab', { name: '版本发布' }),
    );
    expect(within(report).getByText('Version 2')).toBeTruthy();
  });

  it('says the history needs a token when none is connected', async () => {
    action.mockImplementation(
      async (_r: string, _n: string, options: { body: Raw }) =>
        viewFor(options.body, false),
    );
    renderPage();
    await ready();
    expect(within(tile('commits')).getByText('需要 token')).toBeTruthy();
    await userEvent.click(
      within(tile('commits')).getByRole('button', { name: '提交' }),
    );
    expect(
      screen.getByText(
        '贡献者、提交、Issue、PR 和版本发布的历史，需要在数据接入中填写 token 后补全。',
      ),
    ).toBeTruthy();
  });
});
