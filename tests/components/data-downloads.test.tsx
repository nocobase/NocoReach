// 下载量 page (client/pages/data-downloads/), rebuilt 2026-10-14 in the shape of 访问 and GitHub. The page is fed what
// the real view (server/nocoreach/downloads-view.ts) builds from a small package history, so the two stay in step.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DataDownloads from '#pages/data-downloads/index';
import { WorkspaceCacheProvider } from '#pages/workspace-cache';
// @ts-expect-error The server modules are plain JavaScript under ts-nocheck.
import { downloadsView } from '../../server/nocoreach/downloads-view.js';
// @ts-expect-error The server modules are plain JavaScript under ts-nocheck.
import { windowFor, netChange } from '../../server/nocoreach/data-views.js';

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
const END = '2026-10-13';
const d = (n: number) =>
  new Date(Date.parse(`${END}T00:00:00Z`) - n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const platforms = [
  { os: 'linux', arch: 'amd64' },
  { os: 'linux', arch: 'arm64' },
];
function state() {
  const npm: Raw = {},
    pulls: Raw = {};
  for (let i = 0; i < 70; i++) {
    npm[d(i)] = i < 28 ? 200 : 100;
    pulls[d(i)] = 10_000 - i * 50;
  }
  return {
    packages: [
      { id: 'npm:app', registry: 'npm', name: 'app', title: 'app' },
      { id: 'docker:o/app', registry: 'docker', name: 'o/app', title: 'o/app' },
    ],
    daily: { 'npm:app': npm },
    samples: { 'docker:o/app': pulls },
    lastSync: { at: `${END}T02:00:00Z`, ok: true, errors: [] },
    meta: {
      'npm:app': {
        tags: { latest: '2.1.0', beta: '2.2.0-beta.1' },
        versions: [
          {
            version: '2.2.0-beta.1',
            published: `${d(2)}T08:00:00Z`,
            tags: ['beta'],
            lastWeek: 30,
          },
          {
            version: '2.1.0',
            published: `${d(5)}T08:00:00Z`,
            tags: ['latest'],
            lastWeek: 900,
          },
          {
            version: '2.0.0',
            published: `${d(40)}T08:00:00Z`,
            tags: [],
            lastWeek: 70,
          },
        ],
        week: {
          at: END,
          total: 1000,
          groups: [
            { label: '2.1', count: 900 },
            { label: '2.0', count: 70 },
            { label: '2.2 beta', count: 30 },
          ],
        },
      },
      'docker:o/app': {
        total: 2,
        tags: [
          {
            tag: 'latest',
            pushed: `${d(5)}T09:00:00Z`,
            pulled: `${END}T01:00:00Z`,
            size: 300_000_000,
            digest: 'sha256:1',
            platforms,
          },
          {
            tag: '2.1.0-alpha.1',
            pushed: `${d(40)}T09:00:00Z`,
            pulled: null,
            size: 280_000_000,
            digest: 'sha256:2',
            platforms: platforms.slice(0, 1),
          },
        ],
      },
    },
  };
}
const github = {
  repo: 'o/app',
  daily: Object.fromEntries(
    Array.from({ length: 70 }, (_, i) => [
      d(i),
      { releaseDownloads: 900 - i * 5 },
    ]),
  ),
};
const activity = {
  repo: 'o/app',
  releases: [
    {
      tag: 'v2.1.0',
      name: '2.1.0',
      date: d(5),
      url: 'https://github.com/o/app/releases/v2.1.0',
      downloads: 40,
      assets: [{ name: 'app.zip', downloads: 30, size: 1024 }],
    },
  ],
};
const viewFor = (body: Raw) =>
  downloadsView(state(), github, activity, body, {
    windowFor,
    netChange,
    end: END,
  });

function renderPage(path = '/downloads') {
  const router = createMemoryRouter(
    [
      {
        path: '/downloads',
        element: (
          <WorkspaceCacheProvider>
            <DataDownloads />
          </WorkspaceCacheProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  return { router, ...render(<RouterProvider router={router} />) };
}
const tile = (id: string) =>
  document.querySelector(`[data-metric="${id}"]`) as HTMLElement;
const ready = () =>
  waitFor(() =>
    expect(document.querySelector('[data-metric="npm:app"]')).toBeTruthy(),
  );

describe('下载量', () => {
  beforeEach(() => {
    sessionStorage.clear();
    action.mockReset();
    action.mockImplementation(
      async (_r: string, name: string, options: { body: Raw }) => {
        if (name !== 'downloads') throw new Error(`unexpected ${name}`);
        return viewFor(options.body);
      },
    );
  });

  it('shows a figure per package and for the release files, a figure picking the line', async () => {
    renderPage();
    await ready();
    expect(
      screen.getByText('已接入的软件包下载量，以及各个包的版本发布情况。'),
    ).toBeTruthy();
    expect(within(tile('npm:app')).getByText('5,600')).toBeTruthy();
    expect(
      within(tile('npm:app')).getByText('日均 200 · 最新版本 2.1.0'),
    ).toBeTruthy();
    expect(within(tile('docker:o/app')).getByText('+1,400')).toBeTruthy();
    expect(within(tile('docker:o/app')).getByText('累计 10,000')).toBeTruthy();
    expect(within(tile('github:releases')).getByText('+140')).toBeTruthy();
    expect(document.querySelector('[data-trend="npm:app"]')).toBeTruthy();
    expect(screen.getByText('app · npm 下载 · 按天')).toBeTruthy();
    await userEvent.click(within(tile('docker:o/app')).getByRole('button'));
    expect(document.querySelector('[data-trend="docker:o/app"]')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '增长指数' }));
    expect(document.querySelector('[data-trend="index"]')).toBeTruthy();
  });

  it('says what was released, how last week split by version, and where the images run', async () => {
    renderPage();
    await ready();
    const releases = document.querySelector('[data-releases]') as HTMLElement;
    expect(within(releases).getByText('2.1.0')).toBeTruthy();
    expect(within(releases).getByText('6 天前')).toBeTruthy();
    expect(
      within(releases).getByText(
        '本期发布：npm 2 个版本 · Docker 1 个标签 · GitHub 1 个 Release',
      ),
    ).toBeTruthy();
    const versions = document.querySelector('[data-versions]') as HTMLElement;
    expect(within(versions).getByText('2.2 beta')).toBeTruthy();
    expect(within(versions).getByText('90.0%')).toBeTruthy();
    const environment = document.querySelector(
      '[data-environment]',
    ) as HTMLElement;
    expect(within(environment).getByText('linux/arm64')).toBeTruthy();
    expect(within(environment).getByText('50.0%')).toBeTruthy();
    expect(within(environment).getByText(/latest 镜像 300.0 MB/)).toBeTruthy();
    const coverage = document.querySelector('[data-coverage]') as HTMLElement;
    expect(
      within(
        coverage.querySelector('[data-coverage-row="alpha"]') as HTMLElement,
      ).getByText('amd64 1'),
    ).toBeTruthy();
    expect(within(coverage).getByText('300.0 MB')).toBeTruthy();
  });

  it('lists packages, versions, image tags and release files on the table tabs', async () => {
    const { router } = renderPage();
    await ready();
    const report = document.querySelector('[data-report]') as HTMLElement;
    await userEvent.click(within(report).getByRole('button', { name: 'app' }));
    expect(
      within(await screen.findByRole('dialog')).getByText('app · npm 下载'),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '关闭详情' }));
    await userEvent.click(within(report).getByRole('tab', { name: '版本' }));
    expect(router.state.location.search).toBe('?tab=versions');
    expect(within(report).getByText('2.2.0-beta.1')).toBeTruthy();
    await userEvent.click(
      within(report).getByRole('button', { name: '测试版' }),
    );
    expect(within(report).queryByText('2.0.0')).toBeNull();
    await userEvent.click(
      within(report).getByRole('tab', { name: 'Docker 标签' }),
    );
    expect(within(report).getByText('2.1.0-alpha.1')).toBeTruthy();
    expect(within(report).getByText('amd64 · arm64')).toBeTruthy();
    await userEvent.type(within(report).getByRole('textbox'), 'alpha');
    expect(within(report).queryByText('amd64 · arm64')).toBeNull();
    await userEvent.click(
      within(report).getByRole('tab', { name: 'Release 安装包' }),
    );
    expect(within(report).getByText('app.zip')).toBeTruthy();
  });
});
