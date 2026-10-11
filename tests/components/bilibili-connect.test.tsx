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
import { MemoryRouter } from 'react-router';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import enUS from '../../client/locales/en-US';
import { setDictionary } from '../../client/i18n';
import enDictionary from '../../client/i18n/en.json';
import { BilibiliConnect } from '../../client/pages/bilibili-connect';
import {
  bilibiliRequest,
  type BilibiliStatus,
} from '../../client/pages/bilibili-api';
import { confirmAction } from '../../client/components/reach/confirm';
import { toast } from '../../client/lib/toast';
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { session: { id: 'session-a' } },
    refresh: vi.fn(),
  }),
}));
vi.mock('../../client/pages/bilibili-api', async (actual) => ({
  ...(await actual<object>()),
  bilibiliRequest: vi.fn(),
}));
vi.mock('../../client/components/reach/confirm', () => ({
  confirmAction: vi.fn(async () => true),
}));
vi.mock('../../client/lib/toast', () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
const runtime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
});
const REV = '641664cf-f741-4e91-b9dd-854b88ed1570';
const base = (): BilibiliStatus => ({
  connected: false,
  configured: true,
  revision: null,
  collectors: [{ id: 'shared', name: 'Research browser' }],
  collectorId: null,
  terms: [],
  bvids: [],
  verifiedAt: null,
  checking: false,
  requestId: null,
  total: 0,
  recent: [],
  lastRun: null,
});
const connected = (): BilibiliStatus => ({
  ...base(),
  connected: true,
  revision: REV,
  collectorId: 'shared',
  terms: ['NocoBase'],
});
const call = vi.mocked(bilibiliRequest);
beforeEach(() => {
  cleanup();
  setDictionary(null);
  call.mockReset();
  vi.mocked(confirmAction).mockClear();
  vi.mocked(confirmAction).mockResolvedValue(true);
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.info).mockClear();
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});
function view(
  projectId = 1,
  isAdmin = true,
  onChange = vi.fn(),
  onSavingChange = vi.fn(),
) {
  const element = (id: number) => (
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter>
        <BilibiliConnect
          projectId={id}
          isAdmin={isAdmin}
          onChange={onChange}
          onSavingChange={onSavingChange}
        />
      </MemoryRouter>
    </TestI18nProvider>
  );
  const result = render(element(projectId));
  return {
    ...result,
    changeProject: (id: number) => result.rerender(element(id)),
    onChange,
  };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
it('loads a real form, validates on submit, associates errors and focuses the first invalid field', async () => {
  call.mockResolvedValue(base());
  view();
  const terms = await screen.findByRole('textbox', { name: '搜索词' });
  expect(
    screen.queryByText('请至少填写一个搜索词或视频。'),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '保存配置' }));
  expect(
    await screen.findByText('请至少填写一个搜索词或视频。'),
  ).toBeInTheDocument();
  await waitFor(() => expect(terms).toHaveFocus());
  expect(terms).toHaveAttribute('aria-invalid', 'true');
  expect(terms).toHaveAttribute(
    'aria-describedby',
    'bili-terms-help bili-terms-error',
  );
  expect(call.mock.calls.every(([, action]) => action === 'status')).toBe(true);
});
it('preserves middle edits, saves only config and updates immediately without calling collection', async () => {
  call.mockImplementation(async (_id, action) =>
    action === 'connect' ? connected() : base(),
  );
  const { onChange } = view();
  const input = await screen.findByRole('textbox', { name: '搜索词' });
  await userEvent.type(input, 'NocoBase');
  fireEvent.change(input, { target: { value: 'Noco-Base' } });
  await userEvent.click(screen.getByRole('button', { name: '保存配置' }));
  expect(await screen.findByText('已配置，尚未验证')).toBeInTheDocument();
  expect(call).toHaveBeenCalledWith(
    1,
    'connect',
    expect.objectContaining({
      collectorId: 'shared',
      terms: 'Noco-Base',
      bvids: '',
      revision: null,
    }),
  );
  expect(call.mock.calls.some(([, action]) => action === 'sync')).toBe(false);
  expect(onChange).toHaveBeenCalledTimes(1);
  const message = vi.mocked(toast.success).mock.lastCall?.[0];
  expect(typeof message === 'function' ? message() : message).toBe(
    'Bilibili 配置已保存。',
  );
});
it('tool checks do not imply platform verification or start collection', async () => {
  call.mockImplementation(async (_id, action) =>
    action === 'test'
      ? { toolInstalled: true, browser: 'unchecked', login: 'unchecked' }
      : base(),
  );
  view();
  await userEvent.click(
    await screen.findByRole('button', { name: '检查采集器' }),
  );
  expect(
    await screen.findByText('OpenCLI 可用，平台尚未验证'),
  ).toBeInTheDocument();
  expect(screen.queryByText('已取得可确认内容')).not.toBeInTheDocument();
  expect(call.mock.calls.some(([, action]) => action === 'sync')).toBe(false);
});
it('edit loads the latest configuration before showing fields; a failed save keeps the draft', async () => {
  call
    .mockResolvedValueOnce(connected())
    .mockResolvedValueOnce({
      ...connected(),
      revision: '733eb60f-1c36-46e7-87e6-78d9cfe51400',
      terms: ['Latest'],
    })
    .mockRejectedValueOnce(
      Object.assign(new Error('RAW SECRET'), { status: 409 }),
    );
  view();
  await userEvent.click(await screen.findByRole('button', { name: '修改' }));
  const input = await screen.findByRole('textbox', { name: '搜索词' });
  expect(input).toHaveValue('Latest');
  await userEvent.clear(input);
  await userEvent.type(input, 'My draft');
  await userEvent.click(screen.getByRole('button', { name: '保存配置' }));
  expect(
    await screen.findByText('配置已变更或操作正在运行，请重新载入状态。'),
  ).toBeInTheDocument();
  expect(input).toHaveValue('My draft');
  expect(screen.queryByText('RAW SECRET')).not.toBeInTheDocument();
  expect(call).toHaveBeenLastCalledWith(
    1,
    'connect',
    expect.objectContaining({
      terms: 'My draft',
      revision: '733eb60f-1c36-46e7-87e6-78d9cfe51400',
    }),
  );
});
it('members have read-only evidence with no configuration, tool checks, synchronization or disconnect controls', async () => {
  call.mockResolvedValue(connected());
  view(1, false);
  expect(await screen.findByText('Bilibili 读取状态')).toBeInTheDocument();
  for (const name of ['修改', '立即读取', '断开', '检查采集器', '保存配置'])
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});
it.each([401, 403, 404])(
  'handles HTTP %i without a misleading generic retry action',
  async (status) => {
    call.mockRejectedValue(Object.assign(new Error('RAW SECRET'), { status }));
    view();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '重新载入状态' }),
    ).not.toBeInTheDocument();
    if (status === 401)
      expect(screen.getByRole('link', { name: '重新登录' })).toHaveAttribute(
        'href',
        '/login',
      );
    else
      expect(
        screen.queryByRole('link', { name: '重新登录' }),
      ).not.toBeInTheDocument();
    expect(screen.queryByText('RAW SECRET')).not.toBeInTheDocument();
  },
);
it('requires disconnect confirmation and keeps the action revision', async () => {
  call.mockImplementation(async (_id, action) =>
    action === 'disconnect'
      ? { ...connected(), connected: false }
      : connected(),
  );
  view();
  await userEvent.click(await screen.findByRole('button', { name: '断开' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      1,
      'disconnect',
      { revision: REV },
      'session-a',
    ),
  );
  expect(confirmAction).toHaveBeenCalledWith(
    expect.objectContaining({
      title: '断开 Bilibili？',
      description: '停止后续读取，保留已保存的公开记录。',
    }),
  );
});
it('sends the matching operation ID when stopping and does not cancel merely on unmount', async () => {
  const state = {
    ...connected(),
    checking: true,
    requestId: 'current-operation',
  };
  call.mockImplementation(async (_id, action) =>
    action === 'cancel' ? connected() : state,
  );
  const result = view();
  await userEvent.click(
    await screen.findByRole('button', { name: '停止读取' }),
  );
  expect(call).toHaveBeenCalledWith(1, 'cancel', {
    requestId: 'current-operation',
  });
  result.unmount();
  expect(
    call.mock.calls.filter(([, action]) => action === 'cancel'),
  ).toHaveLength(1);
});
it('prevents duplicate sync clicks while waiting, without claiming success before the response', async () => {
  const d = deferred<BilibiliStatus>();
  call.mockImplementation(async (_id, action) =>
    action === 'sync' ? d.promise : connected(),
  );
  view();
  const button = await screen.findByRole('button', { name: '立即读取' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(
    call.mock.calls.filter(([, action]) => action === 'sync'),
  ).toHaveLength(1);
  expect(toast.success).not.toHaveBeenCalled();
  await act(async () => {
    d.resolve({
      ...connected(),
      lastRun: {
        at: new Date().toISOString(),
        ok: false,
        errorCode: 'unconfirmed_empty',
        retryAt: null,
        found: 0,
        added: 0,
        capped: false,
        partial: false,
      },
    });
  });
  expect(
    await screen.findByText(
      '本次未取得可确认的结果，不能据此判断没有相关视频。',
    ),
  ).toBeInTheDocument();
});
it('ignores a late response from a previous project', async () => {
  const old = deferred<BilibiliStatus>();
  call.mockImplementation(async (id) =>
    id === 1 ? old.promise : { ...connected(), terms: ['Current project'] },
  );
  const result = view();
  result.changeProject(2);
  expect(await screen.findByText(/Current project/)).toBeInTheDocument();
  await act(async () => {
    old.resolve({ ...connected(), terms: ['Stale project'] });
  });
  expect(screen.queryByText(/Stale project/)).not.toBeInTheDocument();
});
it('shows deployment and lossy-data limits in English, without converting unknown metrics to zero', async () => {
  setDictionary(enDictionary);
  call.mockResolvedValue({
    ...connected(),
    total: 1,
    recent: [
      {
        id: 'BV1MW421X7gM',
        title: null,
        url: 'https://www.bilibili.com/video/BV1MW421X7gM',
        views: null,
        likes: 0,
        comments: null,
        publishedAt: '2026-01-03T12:34:00.000Z',
        publishedAtPrecision: 'minute',
        collectedAt: '2026-10-10T00:00:00Z',
        completeness: 'video_metadata',
        fromEarlierConfig: true,
        sources: [
          {
            kind: 'video',
            value: 'BV1MW421X7gM',
            url: 'https://www.bilibili.com/video/BV1MW421X7gM',
          },
        ],
      },
    ],
  });
  view(1, false);
  expect(
    await screen.findByText('Views Unknown · Likes 0 · Comments Unknown'),
  ).toBeInTheDocument();
  expect(screen.getByText('From an earlier configuration')).toBeInTheDocument();
  expect(screen.getByText(/UTC \(minute precision\)/)).toBeInTheDocument();
  expect(
    screen.getByText(
      'The collector host manages network access; an administrator selects the upstream mode.',
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Up to 500 recent public records/),
  ).toBeInTheDocument();
});

it('shows an allowlisted tool recovery message instead of raw diagnostics', async () => {
  call.mockImplementation(async (_id, action) => {
    if (action === 'test')
      throw Object.assign(
        new Error('采集器尚未安装 OpenCLI，请管理员完成安装。'),
        { status: 502 },
      );
    return base();
  });
  view();
  await userEvent.click(
    await screen.findByRole('button', { name: '检查采集器' }),
  );
  expect(
    await screen.findByText('采集器尚未安装 OpenCLI，请管理员完成安装。'),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('OpenCLI 可用，平台尚未验证'),
  ).not.toBeInTheDocument();
});

it('keeps a conflict draft when reloading the latest revision and resubmits it with that revision', async () => {
  const latest = '733eb60f-1c36-46e7-87e6-78d9cfe51400';
  call
    .mockResolvedValueOnce(connected())
    .mockResolvedValueOnce(connected())
    .mockRejectedValueOnce(
      Object.assign(new Error('conflict'), { status: 409 }),
    )
    .mockResolvedValueOnce({
      ...connected(),
      revision: latest,
      terms: ['Other editor'],
    })
    .mockResolvedValueOnce({
      ...connected(),
      revision: latest,
      terms: ['My draft'],
    });
  view();
  await userEvent.click(await screen.findByRole('button', { name: '修改' }));
  const input = await screen.findByRole('textbox', { name: '搜索词' });
  await userEvent.clear(input);
  await userEvent.type(input, 'My draft');
  await userEvent.click(screen.getByRole('button', { name: '保存配置' }));
  await userEvent.click(
    await screen.findByRole('button', { name: '重新载入状态' }),
  );
  await waitFor(() => expect(call).toHaveBeenCalledTimes(4));
  expect(screen.getByRole('textbox', { name: '搜索词' })).toHaveValue(
    'My draft',
  );
  await userEvent.click(screen.getByRole('button', { name: '保存配置' }));
  await waitFor(() =>
    expect(call).toHaveBeenLastCalledWith(
      1,
      'connect',
      expect.objectContaining({ terms: 'My draft', revision: latest }),
    ),
  );
});

it('reports only configuration save pending state to the parent close guard and disables duplicate save', async () => {
  const saving = deferred<BilibiliStatus>();
  const onSavingChange = vi.fn();
  call.mockImplementation((_id, action) =>
    action === 'connect' ? saving.promise : Promise.resolve(base()),
  );
  view(1, true, vi.fn(), onSavingChange);
  await userEvent.type(
    await screen.findByRole('textbox', { name: '搜索词' }),
    'Saved draft',
  );
  await userEvent.click(screen.getByRole('button', { name: '保存配置' }));
  expect(onSavingChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole('button', { name: '正在保存…' })).toBeDisabled();
  await act(async () => saving.resolve(connected()));
  await waitFor(() => expect(onSavingChange).toHaveBeenLastCalledWith(false));
  const message = vi.mocked(toast.success).mock.lastCall?.[0];
  expect(typeof message === 'function' ? message() : message).toBe(
    'Bilibili 配置已保存。',
  );
});
it.each([false, true])(
  'shows anonymous HTTP readiness without implying a browser or live verification (English: %s)',
  async (english) => {
    if (english) setDictionary(enDictionary);
    call.mockImplementation(async (_id, action) =>
      action === 'test'
        ? {
            upstream: 'anonymous-http',
            platformVerified: false,
            browser: 'not_required',
            login: 'not_used',
          }
        : base(),
    );
    view();
    await userEvent.click(
      await screen.findByRole('button', {
        name: english ? 'Check collector' : '检查采集器',
      }),
    );
    expect(
      await screen.findByText(
        english
          ? 'Anonymous HTTP is ready; the platform has not been verified'
          : '匿名 HTTP 已就绪，平台尚未验证',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        english
          ? 'OpenCLI is available; the platform has not been verified'
          : 'OpenCLI 可用，平台尚未验证',
      ),
    ).not.toBeInTheDocument();
    expect(call.mock.calls.some(([, action]) => action === 'sync')).toBe(false);
  },
);

it('retranslates existing validation errors and preserves the draft during a locale switch', async () => {
  call.mockResolvedValue(base());
  view();
  await userEvent.click(
    await screen.findByRole('button', { name: '保存配置' }),
  );
  expect(await screen.findByText('请至少填写一个搜索词或视频。')).toBeVisible();
  act(() => setDictionary(enDictionary));
  expect(
    screen.getByText('Enter at least one search term or video.'),
  ).toBeVisible();
  const input = screen.getByRole('textbox', { name: enDictionary['搜索词'] });
  fireEvent.change(input, { target: { value: '原样 NocoBase draft' } });
  act(() => setDictionary(null));
  expect(screen.getByRole('textbox', { name: '搜索词' })).toHaveValue(
    '原样 NocoBase draft',
  );
});

it.each([true, false])(
  'keeps a displayed tool error reactive only when it is application-owned: %s',
  async (known) => {
    const raw = known
      ? '采集器尚未安装 OpenCLI，请管理员完成安装。'
      : 'Upstream: 原样未知，搜索词 raw {0}';
    call.mockImplementation(async (_id, action) => {
      if (action === 'test')
        throw Object.assign(new Error('wrapper text'), {
          status: 502,
          payload: { error: { message: raw } },
        });
      return base();
    });
    view();
    await userEvent.click(
      await screen.findByRole('button', { name: '检查采集器' }),
    );
    expect(await screen.findByText(raw)).toBeVisible();
    act(() => setDictionary(enDictionary));
    expect(
      screen.getByText(
        known ? enDictionary[raw as keyof typeof enDictionary] : raw,
      ),
    ).toBeVisible();
    act(() => setDictionary(null));
    expect(screen.getByText(raw)).toBeVisible();
  },
);

it('keeps saved titles and search terms literal while translating collection status', async () => {
  call.mockResolvedValue({
    ...connected(),
    terms: ['正在读取…'],
    total: 1,
    recent: [
      {
        id: 'BV1MW421X7gM',
        title: '原样 未知',
        url: 'https://www.bilibili.com/video/BV1MW421X7gM',
        views: null,
        likes: 0,
        comments: null,
        publishedAt: null,
        publishedAtPrecision: null,
        collectedAt: '2026-10-11T00:00:00Z',
        completeness: 'search_summary',
        fromEarlierConfig: false,
        sources: [],
      },
    ],
    lastRun: {
      at: '2026-10-11T00:00:00Z',
      ok: false,
      errorCode: 'security_block',
      retryAt: null,
      found: 0,
      added: 0,
      capped: false,
      partial: false,
    },
  });
  view();
  expect(
    await screen.findByText('Bilibili 要求验证或拒绝了访问，本次读取已停止。'),
  ).toBeVisible();
  act(() => setDictionary(enDictionary));
  expect(
    screen.getByText(
      'Bilibili requires verification or denied access. Collection has stopped.',
    ),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: '原样 未知' })).toBeVisible();
  expect(
    screen.getByText(new RegExp(`${enDictionary['搜索词']}：正在读取…`)),
  ).toBeVisible();
});
