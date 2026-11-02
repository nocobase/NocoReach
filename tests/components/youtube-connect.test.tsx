import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  render as renderBase,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  YouTubeConnect,
  type YouTubeStatus,
} from '../../client/pages/youtube-connect';
import { nocobaseClient as api } from '../../client/lib/nocoreach-api';
import { confirmAction } from '../../client/components/reach/confirm';
import { setDictionary } from '../../client/i18n';
import en from '../../shared/i18n/en.json';
import { getCatalog, sourceState } from '../../client/pages/data-sources';

// YouTube's drawer (2026-11-02): read through DataForSEO by search term. The panels link to the data page, so they
// render inside a router.
const render = (ui: ReactElement) => renderBase(ui, { wrapper: MemoryRouter });

const auth = vi.hoisted(() => ({
  session: { user: { id: 'admin-a' }, session: { id: 'session-a' } },
  isPending: false,
  refresh: vi.fn(),
  revision: 0,
}));
const authorization = vi.hoisted(() => ({
  can: vi.fn<
    (requirement: {
      resource: { type: string; id: string };
      action: string;
    }) => Promise<boolean>
  >(),
  invalidate: vi.fn(),
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => auth,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => auth.revision,
  useAuthorizationClient: () => authorization,
}));
vi.mock('../../client/components/reach/confirm', () => ({
  confirmAction: vi.fn(async () => true),
}));
vi.mock('../../client/lib/toast', () => ({ toast: { success: vi.fn() } }));

const empty: YouTubeStatus = {
  configured: false,
  connected: false,
  dataforseo: true,
  syncing: false,
  runId: null,
  revision: null,
  terms: [],
  videoUrls: [],
  autoSync: false,
  fetchedAt: null,
  total: 0,
  recordingSince: null,
  recent: [],
  pendingDetails: 0,
  pausedUntil: null,
  repeatedMisses: [],
  spend: { monthUsd: 3.12, budgetUsd: 10 },
  estimate: { monthlyUsd: 0, searchUsd: 0.002, videoUsd: 0.006 },
  lastSync: null,
  nextSyncAt: null,
};
const video = (n: number, title: string, views: number) => ({
  id: `video00000${n}`,
  url: `https://www.youtube.com/watch?v=video00000${n}`,
  title,
  channel: 'NocoBase',
  publishedAt: `2026-10-${20 + n}`,
  firstSeenAt: '2026-11-02T08:03:00Z',
  views,
});
const active: YouTubeStatus = {
  ...empty,
  configured: true,
  connected: true,
  revision: 'v1',
  terms: ['NocoBase', 'NocoBase tutorial', 'open source no-code'],
  autoSync: true,
  fetchedAt: '2026-11-02T08:03:00Z',
  total: 31,
  recordingSince: '2026-10-11T08:00:00Z',
  recent: [
    video(1, 'Build an internal CRM with NocoBase in 20 minutes', 12300),
    video(2, 'NocoBase vs Appsmith', 3410),
  ],
  estimate: {
    monthlyUsd: 0.72,
    searchUsd: 0.002,
    videoUsd: 0.006,
  },
  lastSync: { at: '2026-11-02T08:03:00Z', ok: true, errors: [], missed: [] },
  nextSyncAt: '2026-11-03T00:00:00Z',
};
beforeEach(() => {
  auth.session = { user: { id: 'admin-a' }, session: { id: 'session-a' } };
  auth.isPending = false;
  auth.refresh.mockReset();
  authorization.can.mockReset().mockResolvedValue(true);
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
const request = (action: string) =>
  vi
    .mocked(api.action)
    .mock.calls.filter(
      ([resource, name]) => resource === 'nrYouTube' && name === action,
    );

it('asks for DataForSEO first and opens its drawer', async () => {
  vi.mocked(api.action).mockResolvedValue({ ...empty, dataforseo: false });
  const onOpenSource = vi.fn();
  setup({ onOpenSource });
  expect(await screen.findByText('DataForSEO 还没接入')).toBeVisible();
  expect(
    screen.getByText(
      'YouTube 通过 DataForSEO 读取，先在“数据接入”接好 DataForSEO 再填搜索词。',
    ),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: '填写搜索词' })).toBeNull();
  await userEvent.click(
    screen.getByRole('button', { name: '去接入 DataForSEO' }),
  );
  expect(onOpenSource).toHaveBeenCalledWith('keywords');
});

it('adds search terms in a dialog, offering the project name, and reads at once with daily reading on', async () => {
  vi.mocked(api.action).mockResolvedValue(empty);
  setup({ suggested: 'Acme' });
  const user = userEvent.setup();
  expect(
    await screen.findByText('还没有填写搜索词，填写后开始读取。'),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: '填写搜索词' }));
  const dialog = await screen.findByRole('dialog', {
    name: '填写 YouTube 搜索词',
  });
  const terms = within(dialog).getByLabelText('YouTube 搜索词');
  expect(terms).toHaveValue('Acme');
  await user.clear(terms);
  await user.click(within(dialog).getByRole('button', { name: '保存并读取' }));
  expect(within(dialog).getByText('请至少填写一个搜索词')).toBeVisible();
  await user.type(terms, 'Acme{Enter}Acme tutorial');
  await user.type(
    within(dialog).getByLabelText('单独跟踪的视频（可选）'),
    'https://example.com/video',
  );
  await user.click(within(dialog).getByRole('button', { name: '保存并读取' }));
  expect(request('connect')).toHaveLength(0);
  await user.clear(within(dialog).getByLabelText('单独跟踪的视频（可选）'));
  vi.mocked(api.action).mockResolvedValue({ ...active, syncing: true });
  await user.click(within(dialog).getByRole('button', { name: '保存并读取' }));
  await waitFor(() =>
    expect(request('connect')[0][2]).toMatchObject({
      body: {
        projectId: 1,
        terms: ['Acme', 'Acme tutorial'],
        videoUrls: [],
        autoSync: true,
        revision: null,
      },
      headers: { 'X-NocoReach-Confirmation-Session': 'session-a' },
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    screen.getByText('正在读取，通常需要一两分钟，可以关闭面板稍后查看。'),
  ).toBeVisible();
});

it('shows the terms, recently found videos, daily reading and what it costs', async () => {
  vi.mocked(api.action).mockResolvedValue(active);
  setup();
  const box = await screen.findByRole('region', { name: '搜索词' });
  for (const term of active.terms)
    expect(within(box).getByText(term)).toBeVisible();
  expect(
    within(box).getByText(/^已记录 31 个视频 · 从 .*2026.* 开始记录$/),
  ).toBeVisible();
  expect(
    within(box).getByRole('link', {
      name: 'Build an internal CRM with NocoBase in 20 minutes',
    }),
  ).toHaveAttribute('href', active.recent[0].url);
  // A shortened count joins the word after it; a plain one keeps its space.
  expect(within(box).getByText(/1\.2 万次播放/)).toBeVisible();
  expect(within(box).getByText(/3,410 次播放/)).toBeVisible();
  expect(within(box).getByRole('switch')).toBeChecked();
  expect(
    within(box).getByText(
      '按现在 3 个搜索词，预计每月约 $0.7，计入 DataForSEO 每月预算（本月已用 $3.12 / $10）。',
    ),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: '查看数据' })).toHaveAttribute(
    'href',
    '/data/youtube',
  );
  // Nothing about collectors or tool versions.
  expect(screen.queryByText(/采集器|工具版本|字幕/)).toBeNull();
});

it('turns daily reading off and reads now', async () => {
  vi.mocked(api.action).mockResolvedValue(active);
  setup();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('switch'));
  await waitFor(() =>
    expect(request('connect')[0][2]).toMatchObject({
      body: {
        terms: active.terms,
        videoUrls: [],
        autoSync: false,
        revision: 'v1',
      },
    }),
  );
  await user.click(screen.getByRole('button', { name: '立即读取' }));
  await waitFor(() => expect(request('sync')).toHaveLength(1));
});

it('says the cost as a monthly estimate while daily reading is off', async () => {
  vi.mocked(api.action).mockResolvedValue({ ...active, autoSync: false });
  setup();
  expect(
    await screen.findByText(
      '每天自动读取已关闭；开启后预计每月约 $0.7，计入 DataForSEO 每月预算（本月已用 $3.12 / $10）。',
    ),
  ).toBeVisible();
  expect(screen.queryByText(/每次读取约/)).toBeNull();
});

it('changes the terms and tracked videos in a dialog', async () => {
  vi.mocked(api.action).mockResolvedValue({
    ...active,
    videoUrls: ['https://www.youtube.com/watch?v=Im69kzhpR3I'],
  });
  setup();
  const user = userEvent.setup();
  expect(await screen.findByText('另外单独跟踪 1 个视频')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '修改' }));
  const dialog = await screen.findByRole('dialog', {
    name: '修改 YouTube 搜索词',
  });
  expect(within(dialog).getByLabelText('YouTube 搜索词')).toHaveValue(
    active.terms.join('\n'),
  );
  const videos = within(dialog).getByLabelText('单独跟踪的视频（可选）');
  expect(videos).toHaveValue('https://www.youtube.com/watch?v=Im69kzhpR3I');
  await user.type(videos, '{Enter}https://youtu.be/dQw4w9WgXcQ');
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(request('connect')[0][2]).toMatchObject({
      body: {
        videoUrls: [
          'https://www.youtube.com/watch?v=Im69kzhpR3I',
          'https://youtu.be/dQw4w9WgXcQ',
        ],
        autoSync: true,
      },
    }),
  );
});

it('says when the month’s budget is used up and when reading resumes', async () => {
  vi.mocked(api.action).mockResolvedValue({
    ...active,
    pausedUntil: '2026-12-01T00:00:00.000Z',
    spend: { monthUsd: 10, budgetUsd: 10 },
  });
  const onOpenSource = vi.fn();
  setup({ onOpenSource });
  expect(await screen.findByText('本月 DataForSEO 预算已用完')).toBeVisible();
  expect(
    screen.getByText(
      /^已用 \$10\.00 \/ \$10，YouTube 本月暂停读取，.*12.*1.* 自动恢复；已有视频照常查看。$/,
    ),
  ).toBeVisible();
  // Read now waits too, and says until when.
  const readNow = screen.getByRole('button', { name: '立即读取' });
  expect(readNow).toBeDisabled();
  expect(readNow.parentElement).toHaveAttribute(
    'title',
    expect.stringMatching(
      /^本月 DataForSEO 预算已用完，.*12.*1.* 自动恢复；调高预算后可以再读。$/,
    ),
  );
  await userEvent.click(screen.getByRole('button', { name: '调整预算' }));
  expect(onOpenSource).toHaveBeenCalledWith('keywords');
});

it('names a term that timed out once in a grey line, and flags one missed three days in a row', async () => {
  const missed = {
    ...active,
    lastSync: {
      ...active.lastSync!,
      missed: [{ term: 'open source no-code', reason: 'timeout' as const }],
    },
  };
  vi.mocked(api.action).mockResolvedValue(missed);
  const { unmount } = setup();
  const note = await screen.findByText(
    '“open source no-code”这次读取超时，其他 2 个词已更新。明天会照常再读，也可以点“立即读取”。',
  );
  expect(note).toHaveAttribute('data-missed-note');
  expect(note).toHaveClass('text-muted-foreground');
  expect(screen.queryByText('有搜索词连续 3 天没读到')).toBeNull();
  unmount();
  vi.mocked(api.action).mockResolvedValue({
    ...missed,
    repeatedMisses: ['open source no-code'],
  });
  setup();
  expect(await screen.findByText('有搜索词连续 3 天没读到')).toBeVisible();
  expect(
    screen.getByText(
      '“open source no-code”连续 3 天没读到。可以换一个搜索词，或点“立即读取”再试。',
    ),
  ).toBeVisible();
  expect(document.querySelector('[data-missed-note]')).toBeNull();
});

it('shows a failed read plainly, in English too', async () => {
  vi.mocked(api.action).mockResolvedValue({
    ...active,
    autoSync: false,
    lastSync: {
      at: '2026-11-02T08:03:00Z',
      ok: false,
      errors: ['这次通过 DataForSEO 读取 YouTube 超时。'],
      code: 'timeout',
    },
  });
  setDictionary(en);
  setup();
  expect(
    await screen.findByText('The last read did not get through'),
  ).toBeVisible();
  expect(
    screen.getByText('Reading YouTube through DataForSEO timed out this time.'),
  ).toBeVisible();
  expect(screen.getByText('Click "Read now" to try again.')).toBeVisible();
});

it('lets read-only members see the terms and the data, without changing them', async () => {
  vi.mocked(api.action).mockResolvedValue(active);
  setup({ readOnly: true });
  expect(await screen.findByRole('link', { name: '查看数据' })).toBeVisible();
  for (const name of ['修改', '立即读取', '清理已获取数据', '断开'])
    expect(screen.queryByRole('button', { name })).toBeNull();
  expect(screen.getByRole('switch')).toHaveAttribute('data-disabled');
});

it('confirms before disconnecting and sends the current revision', async () => {
  vi.mocked(api.action).mockResolvedValue(active);
  setup();
  await userEvent.click(await screen.findByRole('button', { name: '断开' }));
  expect(confirmAction).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(request('disconnect')[0][2]).toMatchObject({
      body: { projectId: 1, revision: 'v1' },
    }),
  );
});

it('shows the card as connected once search terms are saved', () => {
  const source = getCatalog().find((s) => s.id === 'youtube')!;
  expect(sourceState(source, {})).toBe('ready');
  expect(sourceState(source, { youtube: { configured: false } })).toBe('ready');
  expect(sourceState(source, { youtube: { configured: true } })).toBe(
    'connected',
  );
  expect(source.guide?.needs).toEqual([
    '已接入的 DataForSEO',
    '搜索词，例如 NocoBase（最多 5 个）',
  ]);
  // The cost is said once the terms are set, as a monthly estimate; no price per search or per video.
  expect(source.guide?.intro).toMatch(/预计每月费用/);
  expect(source.guide?.intro).not.toMatch(/\$0\.0/);
});
