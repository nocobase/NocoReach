// GitHub page · GitHub 热点 (client/pages/data-github/hot.tsx). The tab is fed what the real view
// (server/nocoreach/github-trends.ts) builds from a recorded day, so the two stay in step.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DataGitHub from '#pages/data-github/index';
import { WorkspaceCacheProvider } from '#pages/workspace-cache';
// @ts-expect-error The server module is plain JavaScript under ts-nocheck.
import { GitHubTrends, KEY } from '../../server/nocoreach/github-trends.js';

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
const repo = (
  name: string,
  stars: number,
  topics: string[] = [],
  language = 'TypeScript',
) => ({
  repo: name,
  url: `https://github.com/${name}`,
  description: `${name} does things`,
  language,
  topics,
  stars,
});
function recorded(): Raw {
  return {
    topics: ['mcp', 'low-code'],
    topicsAuto: true,
    heat: {
      mcp: { '2026-10-14': { total: 94810, new7: 3979 } },
      'low-code': { '2026-10-14': { total: 2745, new7: 29 } },
    },
    weekly: {
      mcp: {
        '2026-09-07': 2000,
        '2026-09-14': 2100,
        '2026-09-21': 1900,
        '2026-09-28': 2000,
        '2026-10-05': 3000,
      },
      'low-code': { '2026-09-28': 30, '2026-10-05': 29 },
    },
    leaders: { mcp: ['mcp-org/server'], 'low-code': ['n8n-io/n8n'] },
    topicNew: { mcp: ['fresh/mcp-kit'], 'low-code': [] },
    newHot: { date: '2026-10-14', all: ['wheres/anatomy'] },
    repos: {
      'mcp-org/server': repo('mcp-org/server', 12000, ['mcp']),
      'n8n-io/n8n': repo('n8n-io/n8n', 207290, ['low-code', 'workflow']),
      'fresh/mcp-kit': repo('fresh/mcp-kit', 900, ['mcp'], 'Python'),
      'wheres/anatomy': repo('wheres/anatomy', 8485, ['svg']),
    },
    stars: {
      'mcp-org/server': {
        '2026-10-07': 11000,
        '2026-10-13': 11900,
        '2026-10-14': 12000,
      },
      'n8n-io/n8n': { '2026-10-07': 206000, '2026-10-14': 207290 },
      'fresh/mcp-kit': { '2026-10-13': 700, '2026-10-14': 900 },
    },
    trending: {
      '2026-10-14': {
        daily: [
          {
            repo: 'n8n-io/n8n',
            url: 'https://github.com/n8n-io/n8n',
            description: 'Workflow automation',
            language: 'TypeScript',
            stars: 207290,
            forks: 60000,
            gained: 812,
          },
        ],
        weekly: [],
        monthly: [],
      },
    },
    lastRun: {
      at: '2026-10-14T09:00:00Z',
      day: '2026-10-14',
      ok: true,
      errors: [],
      limited: false,
      token: true,
    },
  };
}
function trends(state: Raw | null) {
  const rows: Record<string, unknown> = {
    [KEY('1')]: state,
    'competitors:1': { list: [{ name: 'n8n', repo: 'n8n-io/n8n' }] },
    'github:1': {
      repo: 'me/app',
      profile: { topics: ['low-code', 'ai-agents'] },
    },
  };
  const store = {
    findOne: async ({ filter }: { filter: { key: string } }) =>
      rows[filter.key] != null
        ? { id: filter.key, get: () => rows[filter.key] }
        : null,
    update: async ({
      filterByTk,
      values,
    }: {
      filterByTk: string;
      values: { payload: unknown };
    }) => {
      rows[filterByTk] = values.payload;
    },
    create: async ({
      values,
    }: {
      values: { key: string; payload: unknown };
    }) => {
      rows[values.key] = values.payload;
    },
  };
  const plugin = {
    mock: { enabled: true, clock: () => '2026-10-14T10:00:00Z' },
    db: {
      getRepository: () => store,
      sequelize: {
        transaction: (fn: (t: object) => unknown) => fn({}),
        query: async () => undefined,
      },
    },
    github: {
      token: () => 'github_pat_x',
      state: async () => rows['github:1'],
    },
    competitors: { state: async () => rows['competitors:1'] },
  };
  const t = new GitHubTrends(plugin, async () => {
    throw new Error('no network in tests');
  });
  t.refresh = async () => rows[KEY('1')];
  return t;
}

function renderPage(path = '/github?view=hot') {
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

describe('GitHub 热点', () => {
  let t: ReturnType<typeof trends>;
  beforeEach(() => {
    sessionStorage.clear();
    t = trends(recorded());
    action.mockReset();
    action.mockImplementation(
      async (resource: string, name: string, options: { body: Raw }) => {
        if (resource === 'nrGitHubTrends')
          return name === 'setTopics'
            ? t.setTopics('1', options.body)
            : t.view('1');
        if (resource === 'nrDataViews') return { connected: false };
        throw new Error(`unexpected ${resource}:${name}`);
      },
    );
  });

  it('opens from the repository tab and lists the followed topics with last week against the four before', async () => {
    const { router } = renderPage('/github');
    await userEvent.click(
      await screen.findByRole('tab', { name: 'GitHub 热点' }),
    );
    expect(router.state.location.search).toBe('?view=hot');
    await waitFor(() =>
      expect(document.querySelector('[data-hot-topics]')).toBeTruthy(),
    );
    const topics = document.querySelector('[data-hot-topics]') as HTMLElement;
    const mcp = topics.querySelector('[data-topic="mcp"]') as HTMLElement;
    expect(within(mcp).getByText('94,810')).toBeTruthy();
    expect(within(mcp).getByText('↑ 50%')).toBeTruthy();
    expect(within(mcp).getByText('mcp-org/server')).toBeTruthy();
  });

  it('adds a topic and saves the list', async () => {
    renderPage();
    await waitFor(() =>
      expect(document.querySelector('[data-hot-topics]')).toBeTruthy(),
    );
    const topics = document.querySelector('[data-hot-topics]') as HTMLElement;
    await userEvent.click(
      within(topics).getByRole('button', { name: '编辑话题' }),
    );
    await userEvent.type(
      within(topics).getByRole('textbox', { name: '添加话题' }),
      'AI Agents',
    );
    await userEvent.click(
      within(topics).getByRole('button', { name: '添加话题' }),
    );
    await userEvent.click(within(topics).getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith(
        'nrGitHubTrends',
        'setTopics',
        expect.objectContaining({
          body: expect.objectContaining({
            topics: ['mcp', 'low-code', 'ai-agents'],
          }),
        }),
      ),
    );
  });

  it('ranks gainers for today, this week and a topic; marks competitors on Trending; shows new repositories', async () => {
    renderPage();
    await waitFor(() =>
      expect(document.querySelector('[data-hot-gainers]')).toBeTruthy(),
    );
    const gainers = document.querySelector('[data-hot-gainers]') as HTMLElement;
    expect(
      [...gainers.querySelectorAll('[data-gainer]')].map((x) =>
        x.getAttribute('data-gainer'),
      ),
    ).toEqual(['n8n-io/n8n', 'mcp-org/server']);
    await userEvent.click(
      within(gainers).getByRole('button', { name: '今天' }),
    );
    expect(
      [...gainers.querySelectorAll('[data-gainer]')].map((x) =>
        x.getAttribute('data-gainer'),
      ),
    ).toEqual(['fresh/mcp-kit', 'mcp-org/server']);
    await userEvent.click(
      within(gainers).getByRole('combobox', { name: '话题' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: 'low-code' }),
    );
    expect(
      within(gainers).getByText(
        /^从 (2026-)?10-07 起记录，今天的涨幅要记满天数后才有。$/,
      ),
    ).toBeTruthy();
    const trending = document.querySelector(
      '[data-hot-trending]',
    ) as HTMLElement;
    expect(
      within(
        trending.querySelector('[data-trending="n8n-io/n8n"]') as HTMLElement,
      ).getByText('竞品'),
    ).toBeTruthy();
    const fresh = document.querySelector('[data-hot-fresh]') as HTMLElement;
    expect(within(fresh).getByText('wheres/anatomy')).toBeTruthy();
    await userEvent.click(
      within(fresh).getByRole('button', { name: '关注的话题' }),
    );
    expect(within(fresh).getByText('fresh/mcp-kit')).toBeTruthy();
  });

  it('offers the first read before anything is recorded', async () => {
    t = trends(null);
    renderPage();
    expect(await screen.findByText('还没有读取过 GitHub 热点')).toBeTruthy();
    expect(screen.getByRole('button', { name: '立即更新' })).toBeTruthy();
  });
});
