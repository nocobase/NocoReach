// GitHub page (client/pages/data-github/), rebuilt 2026-10-14 after the first NocoReach's GitHub page. The page is fed
// what the real view (server/nocoreach/github-view.ts) builds from a small repository history, so the two stay in step.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    team = new Set<string>(),
    commits = {};
  const at = (d: string) => `${d}T08:00:00Z`;
  addIssue(items, team, {
    number: 1,
    created_at: at('2026-09-20'),
    closed_at: at('2026-09-22'),
    author_association: 'CONTRIBUTOR',
    user: { login: 'ann' },
  });
  addIssue(items, team, {
    number: 2,
    created_at: at('2026-10-02'),
    closed_at: at('2026-10-03'),
    author_association: 'CONTRIBUTOR',
    user: { login: 'ann' },
    pull_request: { merged_at: at('2026-10-03') },
  });
  addIssue(items, team, {
    number: 3,
    created_at: at('2026-10-05'),
    closed_at: null,
    author_association: 'MEMBER',
    user: { login: 'lead' },
    pull_request: { merged_at: null },
  });
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
    complete: true,
    items,
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

describe('GitHub', () => {
  beforeEach(() => {
    sessionStorage.clear();
    action.mockReset();
    action.mockImplementation(
      async (_r: string, name: string, options: { body: Raw }) => {
        if (name !== 'github') throw new Error(`unexpected ${name}`);
        return viewFor(options.body);
      },
    );
  });

  it('shows the eight figures, the history chart by group with its stats, and every-day Traffic apart', async () => {
    const { router } = renderPage();
    await waitFor(() =>
      expect(document.querySelector('[data-metric="stars"]')).toBeTruthy(),
    );
    for (const key of [
      'stars',
      'forks',
      'views',
      'clones',
      'contributors',
      'merge',
      'ai',
      'downloads',
    ])
      expect(document.querySelector(`[data-metric="${key}"]`)).toBeTruthy();
    expect(
      within(
        document.querySelector('[data-metric="stars"]') as HTMLElement,
      ).getByText('1,152'),
    ).toBeTruthy();
    expect(
      within(
        document.querySelector('[data-metric="ai"]') as HTMLElement,
      ).getByText('9'),
    ).toBeTruthy();
    expect(
      within(
        document.querySelector('[data-metric="merge"]') as HTMLElement,
      ).getByText('100.0%'),
    ).toBeTruthy();
    const community = document.querySelector(
      '[data-trend="communityView"]',
    ) as HTMLElement;
    expect(within(community).getByText('新增 Star · 日均')).toBeTruthy();
    await userEvent.click(
      within(community).getByRole('button', { name: 'Pull requests' }),
    );
    expect(router.state.location.search).toBe('?communityView=pullRequests');
    expect(within(community).getByText('新增 PR · 日均')).toBeTruthy();
    await userEvent.click(
      within(community).getByRole('button', { name: '累计 Star' }),
    );
    expect(within(community).getByText('期末')).toBeTruthy();
    expect(
      within(
        document.querySelector('[data-trend="trafficView"]') as HTMLElement,
      ).getByText('浏览 · 日均'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: '全部时间' })).toBeTruthy();
  });

  it('全部时间 asks for every record and drops the period before', async () => {
    renderPage('/github?days=all');
    await waitFor(() =>
      expect(document.querySelector('[data-metric="stars"]')).toBeTruthy(),
    );
    expect(action).toHaveBeenCalledWith(
      'nrDataViews',
      'github',
      expect.objectContaining({
        body: expect.objectContaining({ range: 'all' }),
      }),
    );
    expect(
      screen.getByText('2026-09-01 至 2026-10-09 · 全部记录'),
    ).toBeTruthy();
    expect(
      within(
        document.querySelector('[data-trend="communityView"]') as HTMLElement,
      ).getByText('没有可比的上期'),
    ).toBeTruthy();
  });

  it('says why Traffic is empty before the first saved day', async () => {
    renderPage('/github?days=7&from=&to=');
    await waitFor(() =>
      expect(document.querySelector('[data-metric="stars"]')).toBeTruthy(),
    );
    action.mockImplementation(
      async (_r: string, _n: string, options: { body: Raw }) =>
        viewFor({
          ...options.body,
          range: 'custom',
          from: '2026-09-02',
          to: '2026-09-08',
        }),
    );
    sessionStorage.clear();
    renderPage('/github?days=custom&from=2026-09-02&to=2026-09-08');
    expect(
      await screen.findAllByText(
        'GitHub 只保留最近 14 天，NocoReach 从 2026-10-01 起每天保存，所以这之前没有数据。',
      ),
    ).toBeTruthy();
  });

  it('lists referring sites by kind, popular content by area, and the repository on its tabs', async () => {
    renderPage();
    await waitFor(() =>
      expect(document.querySelector('[data-metric="stars"]')).toBeTruthy(),
    );
    const referrers = document.querySelector('[data-referrers]') as HTMLElement;
    await userEvent.click(
      within(referrers).getByRole('button', { name: '最新快照' }),
    );
    expect(within(referrers).getByText('chatgpt.com')).toBeTruthy();
    expect(within(referrers).getByText('AI 助手')).toBeTruthy();
    expect(within(referrers).getByText('自有')).toBeTruthy();
    const paths = document.querySelector('[data-paths]') as HTMLElement;
    await userEvent.click(
      within(paths).getByRole('button', { name: '最新快照' }),
    );
    expect(within(paths).getByText('仓库首页')).toBeTruthy();
    const composition = document.querySelector(
      '[data-composition]',
    ) as HTMLElement;
    expect(within(composition).getByText('TypeScript')).toBeTruthy();
    await userEvent.click(
      within(composition).getByRole('button', { name: '贡献者' }),
    );
    expect(within(composition).getByText('外部')).toBeTruthy();
    await userEvent.click(
      within(composition).getByRole('button', { name: '安装包' }),
    );
    expect(within(composition).getByText('app.zip')).toBeTruthy();
    const efficiency = document.querySelector(
      '[data-efficiency]',
    ) as HTMLElement;
    expect(within(efficiency).getByText('外部 PR 占比（估算）')).toBeTruthy();
    expect(within(efficiency).getByText('0 / 1')).toBeTruthy();
  });

  it('says the history needs a token when none is connected', async () => {
    action.mockImplementation(
      async (_r: string, _n: string, options: { body: Raw }) =>
        viewFor(options.body, false),
    );
    renderPage('/github?communityView=commits');
    await waitFor(() =>
      expect(
        screen.getByText(
          '贡献者、Commits、Issues、PR 和 Releases 的历史要在数据接入里接入 token 后补全。',
        ),
      ).toBeTruthy(),
    );
  });
});
