// 小红书, Bilibili and YouTube data pages (client/pages/data-*.tsx): each reads its platform's period report and lists
// the saved records published in the range; connection settings stay in 数据源.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ComponentType } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import DataXiaohongshu from '../../client/pages/data-xiaohongshu';
import DataBilibili from '../../client/pages/data-bilibili';
import DataYouTube from '../../client/pages/data-youtube';
import { setDictionary } from '../../client/i18n';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
const authorization = vi.hoisted(() => ({
  revision: 0,
  can: vi.fn<(requirement: { action: string }) => Promise<boolean>>(),
  invalidate: vi.fn(),
}));
vi.mock('#lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: '1' }, session: { id: 'session-a' } },
    isPending: false,
    refresh: vi.fn(),
  }),
}));
vi.mock('#lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationClient: () => authorization,
  useAuthorizationRevision: () => authorization.revision,
}));
vi.mock('#pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, name: 'NocoBase' } }),
}));

const window28 = {
  start: '2026-09-20',
  end: '2026-10-17',
  days: 28,
  previousStart: '2026-08-23',
  previousEnd: '2026-09-19',
};
const trend = {
  unit: 'day',
  points: [
    { date: '2026-10-01', published: 1 },
    { date: '2026-10-02', published: 0 },
  ],
};
const kpi = (key: string, label: string, value: number) => ({
  key,
  label,
  value,
  previous: null,
  complete: true,
  change: null,
});

function show(Page: ComponentType, path: string) {
  const router = createMemoryRouter(
    [
      { path, Component: Page },
      { path: '/connections', Component: () => <p>Data sources page</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}
const calls = (name: string) => action.mock.calls.filter(([, a]) => a === name);

beforeEach(() => {
  setDictionary(null);
  action.mockReset();
  authorization.can.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});

const xiaohongshu = {
  connected: true,
  revision: 3,
  configured: true,
  collectorId: 'team',
  collectors: [{ id: 'team', name: 'Team' }],
  query: 'NocoBase',
  verifiedAt: '2026-10-16T00:00:00Z',
  lastRun: { at: '2026-10-16T00:00:00Z', ok: true, count: 1 },
  total: 4,
  running: null,
  window: window28,
  kpis: [kpi('published', '期间发布', 1), kpi('total', '累计保存', 4)],
  matched: 1,
  trend,
  groups: [{ kind: 'term', name: 'NocoBase', count: 1 }],
  notes: [
    {
      id: '69a123456789abcdef012345',
      title: '分析。任务。',
      url: 'https://www.xiaohongshu.com/explore/69a123456789abcdef012345',
      likes: null,
      likesText: null,
      publishedAt: null,
      estimatedPublishedAt: '2026-10-01',
      firstSeenAt: '2026-10-16T00:00:00Z',
      lastSeenAt: '2026-10-16T00:00:00Z',
      query: 'NocoBase',
    },
  ],
};

it('lists Xiaohongshu notes of the period literally and searches with the current revision', async () => {
  action.mockImplementation(async (_resource, name) =>
    name === 'search' ? {} : xiaohongshu,
  );
  show(DataXiaohongshu, '/data/xiaohongshu');
  expect(
    await screen.findByRole('link', { name: '分析。任务。' }),
  ).toHaveAttribute('href', xiaohongshu.notes[0].url);
  expect(action).toHaveBeenCalledWith(
    'nrXiaohongshu',
    'report',
    expect.objectContaining({
      body: {
        projectId: 1,
        range: '28',
        from: undefined,
        to: undefined,
        limit: 20,
        sort: 'published',
        order: 'desc',
      },
    }),
  );
  expect(screen.getByText(/页面显示点赞：—/)).toBeVisible();
  expect(screen.getByText('发布趋势')).toBeVisible();
  expect(
    screen.getByRole('heading', { name: '搜索词' }).closest('[data-groups]'),
  ).toHaveTextContent('NocoBase1');
  expect(screen.getByText(/推算发布日：2026-10-01/)).toBeVisible();
  expect(screen.getByText('期间发布')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '立即搜索' }));
  await waitFor(() => expect(calls('search')).toHaveLength(1));
  expect(calls('search')[0][2]).toMatchObject({
    body: { projectId: 1, revision: 3 },
  });
  await waitFor(() => expect(calls('report')).toHaveLength(2));
});

it('sends an unconnected Xiaohongshu page to its connection settings', async () => {
  action.mockResolvedValue({
    ...xiaohongshu,
    connected: false,
    total: 0,
    notes: [],
  });
  const router = show(DataXiaohongshu, '/data/xiaohongshu');
  await userEvent.click(
    await screen.findByRole('button', { name: '接入小红书' }),
  );
  expect(router.state.location.pathname).toBe('/connections');
  expect(router.state.location.search).toBe('?source=xiaohongshu');
});

const bilibili = {
  connected: false,
  configured: true,
  revision: 'r2',
  collectors: [],
  collectorId: null,
  terms: ['NocoBase'],
  bvids: [],
  verifiedAt: null,
  checking: false,
  requestId: null,
  total: 1,
  lastRun: null,
  window: window28,
  kpis: [kpi('published', 'Published in period', 1)],
  matched: 1,
  trend,
  groups: [
    { kind: 'term', name: 'NocoBase', count: 1 },
    { kind: 'video', name: 'BV1MW421X7gM', count: 1 },
  ],
  videos: [
    {
      id: 'BV1MW421X7gM',
      title: null,
      url: 'https://www.bilibili.com/video/BV1MW421X7gM',
      views: null,
      likes: 0,
      comments: null,
      publishedAt: '2026-10-03T12:34:00.000Z',
      publishedAtPrecision: 'minute',
      collectedAt: '2026-10-10T00:00:00Z',
      completeness: 'video_metadata',
      fromEarlierConfig: true,
      sources: [],
    },
  ],
};

it('keeps saved Bilibili videos readable after disconnecting, without turning unknown counts into zero', async () => {
  setDictionary((await import('../../shared/i18n/en.json')).default);
  action.mockResolvedValue(bilibili);
  show(DataBilibili, '/data/bilibili');
  expect(
    await screen.findByRole('link', { name: 'BV1MW421X7gM' }),
  ).toBeVisible();
  expect(screen.getByText(/Views — · Likes 0 · Comments —/)).toBeVisible();
  expect(screen.getByText('Earlier config')).toBeVisible();
  // Sources link to the Bilibili search or the video itself.
  expect(screen.getByRole('link', { name: /TermNocoBase/ })).toHaveAttribute(
    'href',
    'https://search.bilibili.com/all?keyword=NocoBase',
  );
  expect(
    screen.getByRole('link', { name: /VideoBV1MW421X7gM/ }),
  ).toHaveAttribute('href', 'https://www.bilibili.com/video/BV1MW421X7gM');
  expect(
    screen.getByText('Disconnected. Showing the data saved earlier'),
  ).toBeVisible();
  // A disconnected platform cannot collect; its settings stay one click away.
  expect(
    screen.queryByRole('button', { name: 'Read now' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Connection settings' }),
  ).toBeVisible();
});

const youtube = {
  configured: true,
  connected: true,
  syncing: false,
  runId: null,
  revision: 'v1',
  terms: ['NocoBase'],
  videoUrls: [],
  autoSync: false,
  fetchedAt: '2026-10-16T00:00:00Z',
  total: 1,
  lastSync: { at: '2026-10-16T00:00:00Z', ok: true, errors: [] },
  window: window28,
  kpis: [kpi('published', '期间发布', 1)],
  matched: 1,
  trend,
  groups: [{ kind: 'channel', name: 'NocoBase', count: 1 }],
  videos: [
    {
      id: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Tutorial',
      description: 'Public description',
      channel: 'NocoBase',
      publishedAt: '2026-10-02',
      views: 10,
      likes: null,
      comments: null,
      fetchedAt: '2026-10-16T00:00:00Z',
      transcript: {
        status: 'manual',
        language: 'en',
        text: 'Actual transcript',
        truncated: false,
      },
    },
  ],
};

it('shows YouTube provenance and captions, and offers reading only with the sync permission', async () => {
  authorization.can.mockImplementation(
    async ({ action: name }) => name !== 'nrYouTube.sync',
  );
  action.mockResolvedValue(youtube);
  show(DataYouTube, '/data/youtube');
  expect(await screen.findByRole('link', { name: 'Tutorial' })).toHaveAttribute(
    'href',
    youtube.videos[0].url,
  );
  expect(screen.getByText(/播放 10 · 点赞 — · 评论 —/)).toBeVisible();
  await userEvent.click(screen.getByText(/字幕 · 人工字幕/));
  expect(screen.getByText('Actual transcript')).toBeVisible();
  await waitFor(() =>
    expect(authorization.can).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'nrYouTube.sync' }),
    ),
  );
  expect(
    screen.queryByRole('button', { name: '立即读取' }),
  ).not.toBeInTheDocument();
});

it('polls only the YouTube status while a read runs, then reads the report once', async () => {
  let reports = 0;
  action.mockImplementation(async (_resource, name) => {
    if (name === 'status') return { syncing: false };
    reports += 1;
    return reports === 1
      ? { ...youtube, syncing: true, matched: 0, videos: [] }
      : youtube;
  });
  show(DataYouTube, '/data/youtube');
  expect(await screen.findByText('读取完成后会自动更新')).toBeVisible();
  expect(
    await screen.findByRole('link', { name: 'Tutorial' }, { timeout: 4000 }),
  ).toBeVisible();
  // The poll leaves the saved page and its captions out.
  expect(calls('status')[0][2]).toMatchObject({
    body: { projectId: 1, summary: true },
  });
  expect(calls('report')).toHaveLength(2);
});

it('asks the server for more records instead of slicing a full report', async () => {
  action.mockImplementation(async (_resource, _name, options) => ({
    ...xiaohongshu,
    matched: 25,
    notes: Array.from({ length: Math.min(25, options.body.limit) }, (_, i) => ({
      ...xiaohongshu.notes[0],
      id: `note-${i}`,
      title: `Note ${i}`,
    })),
  }));
  show(DataXiaohongshu, '/data/xiaohongshu');
  expect(await screen.findByRole('link', { name: 'Note 19' })).toBeVisible();
  expect(screen.getByText('笔记（25）')).toBeVisible();
  expect(calls('report')[0][2]).toMatchObject({ body: { limit: 20 } });
  await userEvent.click(screen.getByRole('button', { name: '显示更多' }));
  expect(await screen.findByRole('link', { name: 'Note 24' })).toBeVisible();
  expect(calls('report').at(-1)![2]).toMatchObject({ body: { limit: 40 } });
  expect(
    screen.queryByRole('button', { name: '显示更多' }),
  ).not.toBeInTheDocument();
});

it('sorts on the server from a column header and keeps the order in the URL', async () => {
  action.mockResolvedValue(bilibili);
  const router = show(DataBilibili, '/data/bilibili');
  await screen.findByRole('link', { name: 'BV1MW421X7gM' });
  await userEvent.click(screen.getByRole('button', { name: '按播放排序' }));
  await waitFor(() =>
    expect(calls('report').at(-1)![2]).toMatchObject({
      body: { sort: 'views', order: 'desc', limit: 20 },
    }),
  );
  expect(router.state.location.search).toBe('?sort=views&order=desc');
  await userEvent.click(screen.getByRole('button', { name: '按播放排序' }));
  await waitFor(() =>
    expect(calls('report').at(-1)![2]).toMatchObject({
      body: { sort: 'views', order: 'asc' },
    }),
  );
  // A third click goes back to the default, newest first, which leaves the URL.
  await userEvent.click(screen.getByRole('button', { name: '按播放排序' }));
  await waitFor(() =>
    expect(calls('report').at(-1)![2]).toMatchObject({
      body: { sort: 'published', order: 'desc' },
    }),
  );
  expect(router.state.location.search).toBe('');
});

it('offers ticked videos to the Agent', async () => {
  action.mockResolvedValue(youtube);
  show(DataYouTube, '/data/youtube');
  await screen.findByRole('link', { name: 'Tutorial' });
  expect(
    screen.queryByRole('button', { name: /交给 Agent/ }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('checkbox', { name: '选择这一行' }));
  expect(
    await screen.findByRole('button', { name: /交给 Agent/ }),
  ).toBeVisible();
});

it('keeps the shown rows and offers Retry when a reload fails', async () => {
  action.mockResolvedValueOnce(youtube).mockRejectedValue(new Error('down'));
  show(DataYouTube, '/data/youtube');
  await screen.findByRole('link', { name: 'Tutorial' });
  await userEvent.click(screen.getByRole('button', { name: '刷新' }));
  expect(
    await screen.findByText('列表没有更新，显示的是上次的结果'),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Tutorial' })).toBeVisible();
  expect(screen.getByRole('button', { name: '重试' })).toBeVisible();
});
