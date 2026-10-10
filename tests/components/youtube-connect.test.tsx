import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  YouTubeConnect,
  type YouTubeStatus,
} from '../../client/pages/youtube-connect';
import {
  nocobaseClient as api,
  NocoReachHttpError,
} from '../../client/lib/nocoreach-api';
import { confirmAction } from '../../client/components/reach/confirm';
import { setDictionary } from '../../client/i18n';
import en from '../../client/i18n/en.json';
import { HealthPanel } from '../../client/pages/data-health';
import { catalog, sourceState } from '../../client/pages/data-sources';

vi.mock('../../client/components/reach/confirm', () => ({
  confirmAction: vi.fn(async () => true),
}));
vi.mock('../../client/lib/toast', () => ({ toast: { success: vi.fn() } }));
const ID = 'Im69kzhpR3I';
const empty: YouTubeStatus = {
  configured: false,
  connected: false,
  syncing: false,
  runId: null,
  revision: null,
  terms: [],
  videoUrls: [],
  autoSync: false,
  fetchedAt: null,
  expired: false,
  videos: [],
  total: 0,
  lastSync: null,
};
const active: YouTubeStatus = {
  ...empty,
  configured: true,
  connected: true,
  revision: 'v1',
  terms: ['NocoBase'],
  fetchedAt: '2026-10-10T13:00:00Z',
  total: 1,
  lastSync: { at: '2026-10-10T13:00:00Z', ok: true, errors: [] },
  videos: [
    {
      id: ID,
      url: `https://www.youtube.com/watch?v=${ID}`,
      title: 'Tutorial',
      description: 'Public description',
      channel: 'Channel',
      publishedAt: '2026-10-09',
      views: 10,
      likes: null,
      comments: null,
      fetchedAt: '2026-10-10T13:00:00Z',
      transcript: {
        status: 'manual',
        language: 'en',
        text: 'Actual transcript',
        truncated: false,
      },
    },
  ],
};
beforeEach(() => {
  setDictionary(null);
  vi.spyOn(api, 'action');
  vi.mocked(confirmAction).mockReset().mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setDictionary(null);
});
function setup(props: Partial<Parameters<typeof YouTubeConnect>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <YouTubeConnect projectId={1} onChange={() => {}} {...props} />
    </QueryClientProvider>,
  );
}
it('saves keyword configuration without API keys, defaults to manual and blocks invalid empty input', async () => {
  vi.mocked(api.action).mockResolvedValue(empty);
  setup();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '保存并读取' }));
  expect(api.action).toHaveBeenCalledTimes(1);
  const terms = screen.getByLabelText('YouTube 搜索词');
  expect(terms).toHaveFocus();
  expect(terms).toHaveAttribute('aria-invalid', 'true');
  expect(terms.getAttribute('aria-describedby')).toContain(
    screen.getByRole('alert').id,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    '请填写搜索词或 YouTube 视频链接',
  );
  await user.type(terms, 'NocoBase');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(terms).not.toHaveAttribute('aria-invalid');
  vi.mocked(api.action).mockResolvedValue({
    ...empty,
    configured: true,
    syncing: true,
    runId: 'run1',
    revision: 'v1',
    terms: ['NocoBase'],
  });
  await user.click(screen.getByRole('button', { name: '保存并读取' }));
  await waitFor(() =>
    expect(api.action).toHaveBeenCalledWith(
      'nrYouTube',
      'connect',
      expect.objectContaining({
        body: {
          projectId: 1,
          terms: 'NocoBase',
          videoUrls: '',
          autoSync: false,
          revision: null,
        },
      }),
    ),
  );
  expect(
    await screen.findByRole('button', { name: '停止并暂停自动读取' }),
  ).toBeVisible();
  expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
});
it('shows public provenance and real captions, preserves null counts and supports read-only members', async () => {
  vi.mocked(api.action).mockResolvedValue(active);
  setup({ readOnly: true });
  const user = userEvent.setup();
  expect(await screen.findByRole('link', { name: 'Tutorial' })).toHaveAttribute(
    'href',
    `https://www.youtube.com/watch?v=${ID}`,
  );
  expect(screen.getByText('播放 10 · 点赞 — · 评论 —')).toBeVisible();
  expect(screen.getByText(/来源：YouTube（yt-dlp）/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: '修改' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: '立即读取' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByText(/字幕 · 人工字幕/));
  expect(screen.getByText('Actual transcript')).toBeVisible();
});
it('requires confirmation before replacing cached criteria and sends the latest revision', async () => {
  vi.mocked(api.action).mockResolvedValue(active);
  setup();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '修改' }));
  const input = await screen.findByLabelText('YouTube 搜索词');
  await user.clear(input);
  await user.type(input, 'New keyword');
  vi.mocked(confirmAction).mockResolvedValueOnce(false);
  await user.click(screen.getByRole('button', { name: '保存并读取' }));
  expect(confirmAction).toHaveBeenCalledWith(
    expect.objectContaining({ description: expect.stringContaining('清除') }),
  );
  expect(api.action).toHaveBeenCalledTimes(2);
  expect(input).toHaveValue('New keyword');
  await user.click(screen.getByRole('button', { name: '保存并读取' }));
  await waitFor(() =>
    expect(api.action).toHaveBeenCalledWith(
      'nrYouTube',
      'connect',
      expect.objectContaining({
        body: expect.objectContaining({ revision: 'v1', terms: 'New keyword' }),
      }),
    ),
  );
});
it('keeps entered values after a rejected save and can cancel editing', async () => {
  vi.mocked(api.action).mockResolvedValue(active);
  setup();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '修改' }));
  const input = await screen.findByLabelText('YouTube 搜索词');
  await user.clear(input);
  await user.type(input, 'Changed');
  vi.mocked(api.action).mockRejectedValueOnce(
    new NocoReachHttpError('YouTube 配置已被修改，请重新打开后重试', 409, {}),
  );
  await user.click(screen.getByRole('button', { name: '保存并读取' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('配置已被修改');
  expect(input).toHaveValue('Changed');
  await user.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.getByRole('button', { name: '修改' })).toBeVisible();
});
it('cancel sends the current runId and pauses automatically; disconnect carries revision', async () => {
  vi.mocked(api.action).mockResolvedValue({
    ...active,
    syncing: true,
    runId: 'current-run',
  });
  setup();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: '停止并暂停自动读取' }),
  );
  await waitFor(() =>
    expect(api.action).toHaveBeenCalledWith(
      'nrYouTube',
      'cancel',
      expect.objectContaining({ body: { projectId: 1, runId: 'current-run' } }),
    ),
  );
  await user.click(screen.getByRole('button', { name: '断开' }));
  await waitFor(() =>
    expect(api.action).toHaveBeenCalledWith(
      'nrYouTube',
      'disconnect',
      expect.objectContaining({ body: { projectId: 1, revision: 'v1' } }),
    ),
  );
});
it.each([401, 403, 404])(
  'handles HTTP %s without a blind retry button',
  async (status) => {
    vi.mocked(api.action).mockRejectedValue(
      new NocoReachHttpError('request failed', status, {}),
    );
    setup();
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '重试' }),
    ).not.toBeInTheDocument();
    if (status === 401)
      expect(screen.getByRole('link', { name: '重新登录' })).toHaveAttribute(
        'href',
        '/main/login',
      );
  },
);
it('renders English form, scope and validation text', async () => {
  setDictionary(en);
  vi.mocked(api.action).mockResolvedValue(empty);
  setup();
  const user = userEvent.setup();
  expect(await screen.findByLabelText('YouTube keywords')).toBeVisible();
  expect(
    screen.getByText(
      'Public content research; does not include channel-owner Analytics',
    ),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Save and read' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Enter keywords or a YouTube video link.',
  );
  expect(screen.getByLabelText('YouTube keywords')).toHaveFocus();
});
it('catalog status distinguishes configuration, verified data and partial failure', () => {
  const source = catalog.find((s) => s.id === 'youtube')!;
  expect(sourceState(source, {})).toBe('ready');
  expect(
    sourceState(source, { youtube: { configured: true, connected: false } }),
  ).toBe('partial');
  expect(
    sourceState(source, {
      youtube: {
        configured: true,
        connected: true,
        lastSync: { ok: true, errors: [] },
      },
    }),
  ).toBe('connected');
  expect(
    sourceState(source, {
      youtube: {
        configured: true,
        connected: true,
        lastSync: { ok: true, errors: ['captions failed'] },
      },
    }),
  ).toBe('partial');
});

it('does not let an earlier status response hide a newly started run', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  vi.mocked(api.action).mockResolvedValue(active);
  render(
    <QueryClientProvider client={client}>
      <YouTubeConnect projectId={1} onChange={() => {}} />
    </QueryClientProvider>,
  );
  await screen.findByRole('button', { name: '立即读取' });
  let resolve!: (state: YouTubeStatus) => void;
  vi.mocked(api.action).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  let refetch!: Promise<void>;
  act(() => {
    refetch = client.refetchQueries({ queryKey: ['nocoreach', 'youtube', 1] });
  });
  await waitFor(() => expect(resolve).toBeTypeOf('function'));
  vi.mocked(api.action).mockResolvedValue({
    ...active,
    syncing: true,
    runId: 'new-run',
  });
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: '立即读取' }));
  await screen.findByRole('button', { name: '停止并暂停自动读取' });
  await act(async () => {
    resolve(active);
    await refetch;
  });
  expect(
    screen.getByRole('button', { name: '停止并暂停自动读取' }),
  ).toBeVisible();
  client.clear();
});

it('hides the YouTube health retry action for read-only members', async () => {
  vi.mocked(api.action).mockResolvedValue({
    checkedAt: '',
    items: [
      {
        id: 'youtube',
        name: 'YouTube',
        state: 'warning',
        message: 'YouTube 上次读取失败，请手动重试',
        lastSuccessAt: null,
        dataThrough: null,
        nextSyncAt: null,
        retry: { resource: 'nrYouTube', action: 'sync', body: {} },
      },
    ],
  });
  const view = render(
    <HealthPanel
      projectId={1}
      reloadKey={0}
      onChange={() => {}}
      canRetry={(item) => item.id !== 'youtube'}
    />,
  );
  await screen.findByText('YouTube');
  expect(
    screen.queryByRole('button', { name: '重试' }),
  ).not.toBeInTheDocument();
  view.rerender(
    <HealthPanel
      projectId={1}
      reloadKey={0}
      onChange={() => {}}
      canRetry={() => true}
    />,
  );
  expect(screen.getByRole('button', { name: '重试' })).toBeVisible();
});

it('clears a missing-criteria error when a valid video is provided instead', async () => {
  vi.mocked(api.action).mockResolvedValue(empty);
  setup();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '保存并读取' }));
  await user.type(
    screen.getByLabelText('指定 YouTube 视频'),
    `https://youtu.be/${ID}`,
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByLabelText('YouTube 搜索词')).toHaveValue('');
});
it('focuses the first invalid field and clears only corrected field errors', async () => {
  vi.mocked(api.action).mockResolvedValue(empty);
  setup();
  const user = userEvent.setup();
  const terms = await screen.findByLabelText('YouTube 搜索词');
  const videos = screen.getByLabelText('指定 YouTube 视频');
  await user.type(terms, 'x');
  await user.type(videos, 'https://example.com/not-youtube');
  await user.click(screen.getByRole('button', { name: '保存并读取' }));
  expect(terms).toHaveFocus();
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  await user.clear(terms);
  await user.type(terms, 'NocoBase');
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(terms).toHaveFocus();
  await user.click(screen.getByRole('button', { name: '保存并读取' }));
  expect(videos).toHaveFocus();
  expect(videos.getAttribute('aria-describedby')).toContain(
    screen.getByRole('alert').id,
  );
  await user.clear(videos);
  await user.type(videos, ID);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(api.action).toHaveBeenCalledTimes(1);
});
it('preserves raw multiline IME draft text while clearing corrected validation', async () => {
  vi.mocked(api.action).mockResolvedValue(empty);
  setup();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '保存并读取' }));
  const terms = screen.getByLabelText('YouTube 搜索词');
  fireEvent.compositionStart(terms);
  fireEvent.change(terms, { target: { value: '  中文关键词  \n第二行' } });
  fireEvent.compositionEnd(terms, { data: '中文关键词' });
  expect(terms).toHaveValue('  中文关键词  \n第二行');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
