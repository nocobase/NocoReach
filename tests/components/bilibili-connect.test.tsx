import { systemMessageKey } from '../../shared/i18n/messages';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import enUS from '../../client/locales/en-US';
import { setDictionary } from '../../client/i18n';
import enDictionary from '../../shared/i18n/en.json';
import { BilibiliConnect } from '../../client/pages/bilibili-connect';
import {
  bilibiliRequest,
  type BilibiliStatus,
} from '../../client/pages/bilibili-api';
import { confirmAction } from '../../client/components/reach/confirm';
import { toast } from '../../client/lib/toast';
import { nocobaseClient } from '../../client/lib/nocoreach-api';
const authorization = vi.hoisted(() => ({
  revision: 0,
  can: vi.fn<
    (requirement: {
      resource: { type: string; id: string };
      action: string;
    }) => Promise<boolean>
  >(),
  invalidate: vi.fn(),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationClient: () => authorization,
  useAuthorizationRevision: () => authorization.revision,
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: 'admin-a' }, session: { id: 'session-a' } },
    isPending: false,
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
const LATEST = '733eb60f-1c36-46e7-87e6-78d9cfe51400';
// As the server describes a project: daily reading is off until a first save turns it on.
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
  autoSync: false,
  queued: null,
  pausedCode: null,
  nextSyncAt: null,
  recordingSince: null,
});
const connected = (): BilibiliStatus => ({
  ...base(),
  connected: true,
  revision: REV,
  collectorId: 'shared',
  terms: ['NocoBase'],
  autoSync: true,
});
const lastRun = (
  value: Partial<NonNullable<BilibiliStatus['lastRun']>> = {},
): NonNullable<BilibiliStatus['lastRun']> => ({
  at: '2026-10-11T00:00:00.000Z',
  ok: true,
  errorCode: null,
  retryAt: null,
  found: 0,
  added: 0,
  capped: false,
  partial: false,
  ...value,
});
const call = vi.mocked(bilibiliRequest);
/** The mutations sent so far, without the status reads between them. */
const sent = () =>
  call.mock.calls
    .filter(([, action]) => action !== 'status')
    .map(([, action]) => action);
const statusReads = () =>
  call.mock.calls.filter(([, action]) => action === 'status').length;
/** The text of the last toast of a kind; toasts take a function so they follow the language. */
function toastText(kind: 'success' | 'info' | 'warning') {
  const message = vi.mocked(toast[kind]).mock.lastCall?.[0];
  return typeof message === 'function' ? message() : message;
}
beforeEach(() => {
  cleanup();
  setDictionary(null);
  authorization.revision = 0;
  authorization.can.mockReset().mockResolvedValue(true);
  call.mockReset();
  vi.mocked(confirmAction).mockClear();
  vi.mocked(confirmAction).mockResolvedValue(true);
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.info).mockClear();
  vi.mocked(toast.warning).mockClear();
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
  const element = (id: number, refreshKey = 0) => (
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter>
        <BilibiliConnect
          projectId={id}
          isAdmin={isAdmin}
          refreshKey={refreshKey}
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
    refreshCollector: (key: number) => result.rerender(element(projectId, key)),
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
/** Add search terms (not yet connected) or Change (connected) reloads the status, then opens the dialog. */
async function openDialog(
  user = userEvent.setup(),
  button = '填写搜索词',
  title = '填写 Bilibili 搜索词',
) {
  await user.click(await screen.findByRole('button', { name: button }));
  return screen.findByRole('dialog', { name: title });
}
it('opens a real form in a dialog, validates on submit, associates errors and focuses the first invalid field', async () => {
  call.mockResolvedValue(base());
  view();
  expect(
    await screen.findByText('还没有填写搜索词，填写后开始读取。'),
  ).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  const dialog = await openDialog();
  const terms = within(dialog).getByRole('textbox', { name: '搜索词' });
  expect(
    within(dialog).getByText(
      '每行一个，最多 5 个，每个 1–80 字；也可只填写下方视频。',
    ),
  ).toBeVisible();
  expect(
    screen.queryByText('请至少填写一个搜索词或视频。'),
  ).not.toBeInTheDocument();
  await userEvent.click(
    within(dialog).getByRole('button', { name: '保存并读取' }),
  );
  expect(
    await screen.findByText('请至少填写一个搜索词或视频。'),
  ).toBeInTheDocument();
  await waitFor(() => expect(terms).toHaveFocus());
  expect(terms).toHaveAttribute('aria-invalid', 'true');
  expect(terms).toHaveAttribute(
    'aria-describedby',
    'bili-terms-help bili-terms-error',
  );
  expect(sent()).toEqual([]);
  // Opening the dialog read the latest status first.
  expect(statusReads()).toBe(2);
});
it('preserves middle edits, saves only the configuration on a later save and updates immediately without reading', async () => {
  call.mockImplementation(async (_id, action) =>
    action === 'connect'
      ? { ...connected(), revision: LATEST, terms: ['Noco-Base'] }
      : connected(),
  );
  const { onChange } = view();
  const user = userEvent.setup();
  const dialog = await openDialog(user, '修改', '修改 Bilibili 搜索词');
  const input = within(dialog).getByRole('textbox', { name: '搜索词' });
  expect(input).toHaveValue('NocoBase');
  await user.clear(input);
  await user.type(input, 'NocoBase');
  fireEvent.change(input, { target: { value: 'Noco-Base' } });
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    within(screen.getByRole('region', { name: '搜索词' })).getByText(
      'Noco-Base',
    ),
  ).toBeVisible();
  expect(call).toHaveBeenCalledWith(1, 'connect', {
    collectorId: 'shared',
    terms: 'Noco-Base',
    bvids: '',
    revision: REV,
  });
  expect(sent()).toEqual(['connect']);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(toastText('success')).toBe('Bilibili 配置已保存。');
});
it('tool checks do not imply platform verification or start collection', async () => {
  call.mockImplementation(async (_id, action) =>
    action === 'test'
      ? { toolInstalled: true, browser: 'unchecked', login: 'unchecked' }
      : base(),
  );
  view();
  const dialog = await openDialog();
  await userEvent.click(
    within(dialog).getByRole('button', { name: '检查采集器' }),
  );
  expect(
    await within(dialog).findByText('OpenCLI 可用，平台尚未验证'),
  ).toBeInTheDocument();
  expect(screen.queryByText('已取得可确认内容')).not.toBeInTheDocument();
  expect(sent()).toEqual(['test']);
});
it('edit loads the latest configuration before showing fields; a failed save keeps the draft', async () => {
  call
    .mockResolvedValueOnce(connected())
    .mockResolvedValueOnce({
      ...connected(),
      revision: LATEST,
      terms: ['Latest'],
    })
    .mockRejectedValueOnce(
      Object.assign(new Error('RAW SECRET'), { status: 409 }),
    );
  view();
  const dialog = await openDialog(undefined, '修改', '修改 Bilibili 搜索词');
  const input = within(dialog).getByRole('textbox', { name: '搜索词' });
  expect(input).toHaveValue('Latest');
  await userEvent.clear(input);
  await userEvent.type(input, 'My draft');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(
    await within(dialog).findByText(
      '配置已变更或操作正在运行，请重新载入状态。',
    ),
  ).toBeInTheDocument();
  expect(input).toHaveValue('My draft');
  expect(screen.getByRole('dialog', { name: '修改 Bilibili 搜索词' })).toBe(
    dialog,
  );
  expect(screen.queryByText('RAW SECRET')).not.toBeInTheDocument();
  expect(call).toHaveBeenLastCalledWith(
    1,
    'connect',
    expect.objectContaining({
      terms: 'My draft',
      revision: LATEST,
    }),
  );
});
it('members have read-only evidence with no configuration, tool checks, reading or disconnect controls', async () => {
  call.mockResolvedValue(connected());
  view(1, false);
  const box = await screen.findByRole('region', { name: '搜索词' });
  expect(within(box).getByText('NocoBase')).toBeVisible();
  for (const name of [
    '修改',
    '填写搜索词',
    '立即读取',
    '断开',
    '检查采集器',
    '保存',
    '保存并读取',
    '清理已获取数据',
  ])
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.getByRole('switch')).toHaveAttribute('data-disabled');
});
it('asks members to have an administrator set up a configured collector before reading', async () => {
  call.mockResolvedValue(base());
  view(1, false);
  expect(
    await screen.findByText('请管理员配置采集器后开始读取。'),
  ).toBeVisible();
  expect(
    screen.queryByText('还没有填写搜索词，填写后开始读取。'),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it.each([
  ['connect', '填写搜索词'],
  ['test', '检查采集器'],
  ['sync', '立即读取'],
  ['cancel', '停止读取'],
  ['disconnect', '断开'],
])(
  'exposes only the granted Bilibili %s operation and sends it for the current project',
  async (allowed, label) => {
    authorization.can.mockImplementation(
      async ({ resource, action }) =>
        resource.type === 'nocoreach' &&
        resource.id === '1' &&
        action === `nrBilibili.${allowed}`,
    );
    const state =
      allowed === 'connect'
        ? base()
        : {
            ...connected(),
            checking: allowed === 'cancel',
            requestId: allowed === 'cancel' ? 'running-collection' : null,
          };
    call.mockImplementation(async (_project, action) =>
      action === 'test'
        ? { toolInstalled: true }
        : action === 'status'
          ? state
          : connected(),
    );
    view();
    const button = await screen.findByRole('button', {
      name: label,
      exact: true,
    });
    for (const other of [
      '填写搜索词',
      '保存并读取',
      '保存',
      '检查采集器',
      '立即读取',
      '停止读取',
      '修改',
      '断开',
    ]) {
      if (other !== label)
        expect(
          screen.queryByRole('button', { name: other, exact: true }),
        ).not.toBeInTheDocument();
    }
    if (allowed === 'connect') {
      await userEvent.click(button);
      const dialog = await screen.findByRole('dialog', {
        name: '填写 Bilibili 搜索词',
      });
      expect(
        within(dialog).queryByRole('button', { name: '检查采集器' }),
      ).not.toBeInTheDocument();
      await userEvent.type(
        within(dialog).getByRole('textbox', { name: '搜索词' }),
        'NocoBase',
      );
      // Without the sync permission the first save does not promise a read.
      expect(
        within(dialog).queryByRole('button', { name: '保存并读取' }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        within(dialog).getByRole('button', { name: '保存' }),
      );
    } else {
      // Checking the collector alone stays in the panel, without a dialog or the criteria.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      // Daily reading is part of the configuration.
      expect(screen.getByRole('switch')).toHaveAttribute('data-disabled');
      await userEvent.click(button);
    }
    // Without the sync permission the first save does not read either.
    await waitFor(() =>
      expect(
        call.mock.calls
          .filter(([, action]) => action !== 'status')
          .map(([project, action]) => [project, action]),
      ).toEqual([[1, allowed]]),
    );
  },
);
it('keeps a collector test and sync from overlapping when both actions are granted without configuration access', async () => {
  authorization.can.mockImplementation(async ({ action }) =>
    ['nrBilibili.test', 'nrBilibili.sync'].includes(action),
  );
  const pending = deferred<{ toolInstalled: boolean }>();
  call.mockImplementation(async (_project, action) =>
    action === 'test' ? pending.promise : connected(),
  );
  view();
  await userEvent.click(
    await screen.findByRole('button', { name: '检查采集器' }),
  );
  const sync = screen.getByRole('button', { name: '立即读取' });
  expect(sync).toBeDisabled();
  await act(async () => pending.resolve({ toolInstalled: true }));
  expect(sync).toBeEnabled();
  await userEvent.click(sync);
  await waitFor(() =>
    expect(
      call.mock.calls
        .filter(([, action]) => action !== 'status')
        .map(([, action]) => action),
    ).toEqual(['test', 'sync']),
  );
});
it('keeps criteria drafts when a collector changes and saves with its new ID and revision', async () => {
  call.mockResolvedValue({
    ...connected(),
    collectors: [
      { id: 'shared', name: 'Research browser' },
      { id: 'backup', name: 'Backup browser' },
    ],
  });
  const result = view();
  const user = userEvent.setup();
  const dialog = await openDialog(user, '修改', '修改 Bilibili 搜索词');
  expect(within(dialog).getByRole('combobox')).toHaveTextContent(
    'Research browser',
  );
  const terms = within(dialog).getByRole('textbox', { name: '搜索词' });
  const videos = within(dialog).getByRole('textbox', {
    name: 'BV 号或视频链接',
  });
  await user.clear(terms);
  await user.type(terms, 'My draft');
  await user.type(videos, 'BV1MW421X7gM');
  const latest = {
    ...connected(),
    revision: LATEST,
    collectorId: 'project-bilibili-1',
    collectors: [{ id: 'project-bilibili-1', name: 'Project collector' }],
  };
  call.mockResolvedValue(latest);
  result.refreshCollector(1);
  // A single remaining collector needs no choice.
  await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
  expect(screen.getByRole('textbox', { name: '搜索词' })).toBe(terms);
  expect(terms).toHaveValue('My draft');
  expect(videos).toHaveValue('BV1MW421X7gM');
  await user.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(call).toHaveBeenLastCalledWith(
      1,
      'connect',
      expect.objectContaining({
        collectorId: latest.collectorId,
        revision: latest.revision,
        terms: 'My draft',
        bvids: 'BV1MW421X7gM',
      }),
    ),
  );
});
it('translates the project collector label when the language changes', async () => {
  call.mockResolvedValue({
    ...connected(),
    collectorId: 'project-bilibili-1',
    collectors: [
      {
        id: 'project-bilibili-1',
        name: '当前项目采集器',
        nameKey: 'collectorConnection.projectSource',
      },
      { id: 'backup', name: 'Backup browser' },
    ],
  });
  view();
  const dialog = await openDialog(undefined, '修改', '修改 Bilibili 搜索词');
  const collector = within(dialog).getByRole('combobox');
  expect(collector).toHaveTextContent('当前项目采集器');
  act(() => setDictionary(enDictionary));
  expect(
    screen.getByRole('dialog', { name: 'Change Bilibili search terms' }),
  ).toBe(dialog);
  expect(collector).toHaveTextContent('Project collector');
  expect(screen.queryByText('当前项目采集器')).not.toBeInTheDocument();
  // The initial read and the one before the dialog; the language switch reads nothing.
  expect(call).toHaveBeenCalledTimes(2);
});
it('keeps deployment collector names and choices independent of ID prefixes', async () => {
  setDictionary(enDictionary);
  call.mockResolvedValue({
    ...base(),
    collectors: [
      { id: 'project-bilibili-1', name: '当前项目采集器' },
      { id: 'backup', name: 'Backup browser' },
    ],
  });
  view();
  const user = userEvent.setup();
  const dialog = await openDialog(
    user,
    'Add search terms',
    'Enter Bilibili search terms',
  );
  const collector = within(dialog).getByRole('combobox');
  expect(collector).toBeVisible();
  expect(collector).toHaveTextContent('当前项目采集器');
  await user.click(collector);
  await user.click(
    await screen.findByRole('option', { name: 'Backup browser' }),
  );
  await user.type(
    within(dialog).getByRole('textbox', {
      name: enDictionary['common.searchTerm'],
    }),
    'NocoBase',
  );
  await user.click(
    within(dialog).getByRole('button', { name: 'Save and read' }),
  );
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      1,
      'connect',
      expect.objectContaining({
        collectorId: 'backup',
        terms: 'NocoBase',
      }),
    ),
  );
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
      title: 'bilibili.disconnectBilibili',
      description: 'bilibili.stopFutureCollectionRetainSaved',
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
  expect(
    await screen.findByText(
      '正在读取，通常需要一两分钟，可以关闭面板稍后查看。',
    ),
  ).toBeVisible();
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
  expect(button).toHaveTextContent('正在读取…');
  expect(toast.success).not.toHaveBeenCalled();
  await act(async () => {
    d.resolve({
      ...connected(),
      lastRun: lastRun({ ok: false, errorCode: 'unconfirmed_empty' }),
    });
  });
  expect(
    await screen.findByRole('heading', { name: '上次没有读到' }),
  ).toBeVisible();
  expect(
    screen.getByText(
      '本次未取得可确认的结果，不能据此判断没有相关视频。可以点“立即读取”重试。',
    ),
  ).toBeVisible();
  expect(toast.success).not.toHaveBeenCalled();
  expect(toastText('warning')).toBe(
    '本次未取得可确认的结果，不能据此判断没有相关视频。',
  );
});

it.each([
  ['zh', 'cancel-first'],
  ['zh', 'sync-first'],
  ['en', 'cancel-first'],
  ['en', 'sync-first'],
] as const)(
  'treats a stopped sync as cancellation without conflict feedback (%s, %s)',
  async (locale, order) => {
    if (locale === 'en') setDictionary(enDictionary);
    const pending = Promise.withResolvers<BilibiliStatus>();
    const cancel = Promise.withResolvers<BilibiliStatus>();
    const saved: BilibiliStatus = {
      ...connected(),
      verifiedAt: '2026-10-01T00:00:00.000Z',
      lastRun: lastRun({ at: '2026-10-01T00:00:00.000Z' }),
    };
    let state: BilibiliStatus = saved;
    let retry = false;
    call.mockImplementation(async (_id, action) => {
      if (action === 'sync' && !retry) {
        state = { ...saved, checking: true, requestId: 'active-read' };
        return pending.promise;
      }
      if (action === 'cancel') {
        state = saved;
        return cancel.promise;
      }
      return state;
    });
    view();
    await userEvent.click(
      await screen.findByRole('button', {
        name: locale === 'en' ? 'Read now' : '立即读取',
      }),
    );
    const stop = await screen.findByRole('button', {
      name: locale === 'en' ? 'Stop collection' : '停止读取',
    });
    await waitFor(() => expect(stop).toBeEnabled(), { timeout: 3500 });
    await userEvent.click(stop);
    const cancelled = Object.assign(new Error('already translated'), {
      status: 409,
      payload: {
        error: { message: 'Bilibili 读取已停止，已保存数据保持不变。' },
      },
    });
    if (order === 'cancel-first') {
      await act(async () => cancel.resolve(saved));
      await act(async () => pending.reject(cancelled));
    } else {
      await act(async () => pending.reject(cancelled));
      await act(async () => cancel.resolve(saved));
    }
    await waitFor(() =>
      expect(
        call.mock.calls.filter(([, action]) => action === 'status').length,
      ).toBeGreaterThanOrEqual(3),
    );
    const errorRetry = () =>
      screen.queryByRole('button', { name: /Reload status|重新载入状态/ });
    expect(errorRetry()).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(call.mock.calls.filter(([, action]) => action === 'cancel')).toEqual(
      [[1, 'cancel', { requestId: 'active-read' }]],
    );
    act(() => setDictionary(locale === 'en' ? null : enDictionary));
    expect(errorRetry()).not.toBeInTheDocument();
    retry = true;
    await userEvent.click(
      screen.getByRole('button', { name: /Read now|立即读取/ }),
    );
    await waitFor(() =>
      expect(
        call.mock.calls.filter(([, action]) => action === 'sync'),
      ).toHaveLength(2),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  },
);

it.each([
  'Bilibili 配置已变更，请重新载入后再保存。',
  '采集器正在处理其他请求，请稍后再试。',
])(
  'keeps a genuine 409 visible after successful status reads: %s',
  async (message) => {
    call.mockImplementation(async (_id, action) => {
      if (action === 'sync')
        throw Object.assign(new Error(message), {
          status: 409,
          payload: { error: { message } },
        });
      return connected();
    });
    view();
    await userEvent.click(
      await screen.findByRole('button', { name: '立即读取' }),
    );
    expect(
      await screen.findByText('配置已变更或操作正在运行，请重新载入状态。'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '重新载入状态' }));
    await waitFor(() =>
      expect(
        call.mock.calls.filter(([, action]) => action === 'status'),
      ).toHaveLength(3),
    );
    act(() => setDictionary(enDictionary));
    expect(
      screen.getByText(
        'The configuration changed or an operation is running. Reload its status.',
      ),
    ).toBeVisible();
  },
);
it.each([500, 0])(
  'retains a sync failure (%s) and the saved snapshot after successful status reads, then clears it on retry',
  async (status) => {
    const saved: BilibiliStatus = {
      ...connected(),
      verifiedAt: '2026-10-01T00:00:00.000Z',
      total: 1,
      recordingSince: '2026-10-01T00:00:00.000Z',
      recent: [
        {
          id: 'BV1MW421X7gM',
          title: 'Saved before the failed request',
          url: 'https://www.bilibili.com/video/BV1MW421X7gM',
          views: 123,
          likes: 0,
          comments: null,
          publishedAt: null,
          publishedAtPrecision: null,
          collectedAt: '2026-10-01T00:00:00.000Z',
          completeness: 'video_metadata',
          fromEarlierConfig: false,
          sources: [],
        },
      ],
      lastRun: lastRun({ at: '2026-10-01T00:00:00.000Z', found: 1, added: 1 }),
    };
    const failureMessage =
      status === 0
        ? '网络请求未完成，请检查网络连接后重试。'
        : 'QA_SYNC_REQUEST_FAILURE';
    let fail = true;
    call.mockImplementation(async (_id, action) => {
      if (action === 'sync' && fail)
        throw Object.assign(
          status === 0
            ? new TypeError('Failed to fetch')
            : new Error('QA_SYNC_REQUEST_FAILURE'),
          { status },
        );
      return saved;
    });
    view();
    await userEvent.click(
      await screen.findByRole('button', { name: '立即读取' }),
    );
    await waitFor(() =>
      expect(
        call.mock.calls.filter(([, action]) => action === 'status'),
      ).toHaveLength(2),
    );
    expect(screen.getByText(failureMessage)).toBeInTheDocument();
    // Saved results stay counted and listed; the full list lives on the data page.
    const box = screen.getByRole('region', { name: '搜索词' });
    expect(
      within(box).getByText(/^已记录 1 个视频 · 从 .*2026.* 开始记录$/),
    ).toBeVisible();
    expect(
      within(box).getByRole('link', {
        name: 'Saved before the failed request',
      }),
    ).toHaveAttribute('href', 'https://www.bilibili.com/video/BV1MW421X7gM');
    expect(within(box).getByText(/123 次播放/)).toBeVisible();
    expect(screen.getByRole('link', { name: '查看数据' })).toHaveAttribute(
      'href',
      '/data/bilibili',
    );
    expect(toast.success).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '重新载入状态' }));
    await waitFor(() =>
      expect(
        call.mock.calls.filter(([, action]) => action === 'status'),
      ).toHaveLength(3),
    );
    expect(screen.getByText(failureMessage)).toBeInTheDocument();
    act(() => setDictionary(enDictionary));
    expect(
      screen.getByText(
        status === 0
          ? 'The network request failed. Check your connection and try again.'
          : failureMessage,
      ),
    ).toBeVisible();
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
    act(() => setDictionary(null));
    expect(screen.getByText(failureMessage)).toBeVisible();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: '立即读取' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(failureMessage)).not.toBeInTheDocument();
  },
);
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
it('shows tracked and recently found videos in English, falling back to the BV ID when the title is missing', async () => {
  setDictionary(enDictionary);
  call.mockResolvedValue({
    ...connected(),
    bvids: ['BV1MW421X7gM'],
    verifiedAt: '2026-10-10T00:00:00Z',
    total: 1,
    recordingSince: '2026-10-10T00:00:00Z',
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
  const box = await screen.findByRole('region', { name: 'Search terms' });
  expect(within(box).getByText('NocoBase')).toBeVisible();
  expect(
    within(box).getByText('Also tracking videos by link: 1'),
  ).toBeVisible();
  expect(
    within(box).getByText(/^Videos recorded: 1 · recording since .*2026/),
  ).toBeVisible();
  expect(within(box).getByText('Recently found videos')).toBeVisible();
  expect(
    within(box).getByRole('link', { name: 'BV1MW421X7gM' }),
  ).toHaveAttribute('href', 'https://www.bilibili.com/video/BV1MW421X7gM');
  // An unknown view count is left out rather than shown as zero.
  expect(within(box).queryByText(/views/)).not.toBeInTheDocument();
  expect(
    within(box).getByRole('switch', {
      name: /^Read automatically every day\s*· Updated /,
    }),
  ).toBeChecked();
  // The collector's deployment notes now live on the page above the panel.
  expect(
    screen.queryByText(/upstream mode|Up to 500 recent public records/),
  ).not.toBeInTheDocument();
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
  const dialog = await openDialog();
  await userEvent.click(
    within(dialog).getByRole('button', { name: '检查采集器' }),
  );
  expect(
    await within(dialog).findByText(
      '采集器尚未安装 OpenCLI，请管理员完成安装。',
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('OpenCLI 可用，平台尚未验证'),
  ).not.toBeInTheDocument();
});

it('keeps a conflict draft when reloading the latest revision and resubmits it with that revision', async () => {
  call
    .mockResolvedValueOnce(connected())
    .mockResolvedValueOnce(connected())
    .mockRejectedValueOnce(
      Object.assign(new Error('conflict'), { status: 409 }),
    )
    .mockResolvedValueOnce({
      ...connected(),
      revision: LATEST,
      terms: ['Other editor'],
    })
    .mockResolvedValueOnce({
      ...connected(),
      revision: LATEST,
      terms: ['My draft'],
    });
  view();
  const dialog = await openDialog(undefined, '修改', '修改 Bilibili 搜索词');
  const input = within(dialog).getByRole('textbox', { name: '搜索词' });
  await userEvent.clear(input);
  await userEvent.type(input, 'My draft');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await userEvent.click(
    await within(dialog).findByRole('button', { name: '重新载入状态' }),
  );
  await waitFor(() => expect(call).toHaveBeenCalledTimes(4));
  expect(within(dialog).getByRole('textbox', { name: '搜索词' })).toHaveValue(
    'My draft',
  );
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(call).toHaveBeenLastCalledWith(
      1,
      'connect',
      expect.objectContaining({ terms: 'My draft', revision: LATEST }),
    ),
  );
});

it.each([false, true])(
  'releases the parent save guard after completion, including after unmount: %s',
  async (unmount) => {
    const saving = deferred<BilibiliStatus>();
    const onSavingChange = vi.fn();
    call.mockImplementation((_id, action) =>
      action === 'connect'
        ? saving.promise
        : Promise.resolve(action === 'sync' ? connected() : base()),
    );
    const result = view(1, true, vi.fn(), onSavingChange);
    const dialog = await openDialog();
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: '搜索词' }),
      'Saved draft',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: '保存并读取' }),
    );
    expect(onSavingChange).toHaveBeenLastCalledWith(true);
    expect(
      within(dialog).getByRole('button', { name: /保存并读取/ }),
    ).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '取消' })).toBeDisabled();
    if (unmount) result.unmount();
    await act(async () => saving.resolve(connected()));
    await waitFor(() => expect(onSavingChange).toHaveBeenLastCalledWith(false));
    if (unmount) {
      expect(result.onChange).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      // A panel that is gone does not start the first read.
      expect(sent()).toEqual(['connect']);
      return;
    }
    expect(
      vi
        .mocked(toast.success)
        .mock.calls.map(([message]) =>
          typeof message === 'function' ? message() : message,
        ),
    ).toContain('Bilibili 配置已保存。');
  },
);

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
        : {
            ...base(),
            collectors: [
              { id: 'project-bilibili-1', name: 'Project collector' },
            ],
          },
    );
    view();
    const dialog = await openDialog(
      undefined,
      english ? 'Add search terms' : '填写搜索词',
      english ? 'Enter Bilibili search terms' : '填写 Bilibili 搜索词',
    );
    await userEvent.click(
      within(dialog).getByRole('button', {
        name: english ? 'Check collector' : '检查采集器',
      }),
    );
    expect(call).toHaveBeenCalledWith(1, 'test', {
      collectorId: 'project-bilibili-1',
    });
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
  const dialog = await openDialog();
  await userEvent.click(
    within(dialog).getByRole('button', { name: '保存并读取' }),
  );
  expect(await screen.findByText('请至少填写一个搜索词或视频。')).toBeVisible();
  act(() => setDictionary(enDictionary));
  expect(
    screen.getByText('Enter at least one search term or video.'),
  ).toBeVisible();
  const input = screen.getByRole('textbox', {
    name: enDictionary['common.searchTerm'],
  });
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
    const dialog = await openDialog();
    await userEvent.click(
      within(dialog).getByRole('button', { name: '检查采集器' }),
    );
    expect(await screen.findByText(raw)).toBeVisible();
    act(() => setDictionary(enDictionary));
    expect(
      screen.getByText(known ? enDictionary[systemMessageKey(raw)!] : raw),
    ).toBeVisible();
    act(() => setDictionary(null));
    expect(screen.getByText(raw)).toBeVisible();
  },
);

it('keeps search terms literal while translating collection status', async () => {
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
    lastRun: lastRun({ ok: false, errorCode: 'security_block' }),
  });
  view();
  expect(
    await screen.findByRole('heading', { name: '上次没有读到' }),
  ).toBeVisible();
  expect(
    screen.getByText(
      'Bilibili 要求验证或拒绝了访问，本次读取已停止。可以点“立即读取”重试。',
    ),
  ).toBeVisible();
  act(() => setDictionary(enDictionary));
  expect(
    screen.getByRole('heading', { name: 'The last read did not get through' }),
  ).toBeVisible();
  expect(
    screen.getByText(
      'Bilibili requires verification or denied access. Collection has stopped. Click "Read now" to try again.',
    ),
  ).toBeVisible();
  const box = screen.getByRole('region', { name: 'Search terms' });
  expect(within(box).getByText('正在读取…')).toBeVisible();
  expect(within(box).getByRole('link', { name: '原样 未知' })).toBeVisible();
});

it('clears the saved videos from the connection after both confirmations and refreshes the status', async () => {
  const clear = vi.spyOn(nocobaseClient, 'action').mockResolvedValue({});
  call.mockResolvedValue({ ...connected(), total: 3 });
  const { onChange } = view();
  await userEvent.click(
    await screen.findByRole('button', { name: '清理已获取数据' }),
  );
  await waitFor(() =>
    expect(clear).toHaveBeenCalledWith(
      'nrBilibili',
      'clear',
      expect.objectContaining({ body: { projectId: 1, revision: REV } }),
    ),
  );
  expect(confirmAction).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  expect(
    call.mock.calls.filter(([, action]) => action === 'status'),
  ).toHaveLength(2);
  clear.mockRestore();
});

it('offers no clearing to members without administration', async () => {
  call.mockResolvedValue({ ...connected(), total: 3 });
  view(1, false);
  expect(await screen.findByRole('link', { name: '查看数据' })).toBeVisible();
  expect(
    screen.queryByRole('button', { name: '清理已获取数据' }),
  ).not.toBeInTheDocument();
});

it('says a read is queued while the collector is busy, and toasts that instead of success', async () => {
  const failed = {
    ...connected(),
    lastRun: lastRun({ ok: false, errorCode: 'timeout' }),
  };
  const queued: BilibiliStatus = {
    ...failed,
    queued: { retries: 1, retryAt: '2026-11-02T08:10:00.000Z' },
    nextSyncAt: '2026-11-02T08:10:00.000Z',
  };
  call.mockImplementation(async (_id, action) =>
    action === 'sync' ? queued : failed,
  );
  view();
  expect(
    await screen.findByRole('heading', { name: '上次没有读到' }),
  ).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '立即读取' }));
  await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
  expect(toastText('info')).toBe('采集器正在处理另一个读取，已排队');
  expect(toast.success).not.toHaveBeenCalled();
  expect(toast.warning).not.toHaveBeenCalled();
  expect(
    await screen.findByRole('heading', {
      name: '采集器正在处理另一个读取，已排队',
    }),
  ).toBeVisible();
  expect(
    screen.getByText('约 10 分钟后自动再试，最多再试 3 次。不用手动操作。'),
  ).toBeVisible();
  // The queued retry is the most pressing: the last read's problem waits behind it.
  expect(
    screen.queryByRole('heading', { name: '上次没有读到' }),
  ).not.toBeInTheDocument();
});

it('says daily reading paused after three empty reads, with the reason, in both languages', async () => {
  call.mockResolvedValue({
    ...connected(),
    pausedCode: 'login_required',
    lastRun: lastRun({ ok: false, errorCode: 'login_required' }),
  });
  view();
  expect(
    await screen.findByRole('heading', {
      name: '连续 3 次没有读到，已暂停每天自动读取',
    }),
  ).toBeVisible();
  expect(
    screen.getByText(
      'Bilibili 要求登录，本次读取已停止。请管理员检查采集器所选模式。已有视频照常查看；过几小时后点“立即读取”重试，读到后每天自动读取会恢复。',
    ),
  ).toBeVisible();
  // One notice at a time: the pause already names the last read's reason.
  expect(
    screen.queryByRole('heading', { name: '上次没有读到' }),
  ).not.toBeInTheDocument();
  act(() => setDictionary(enDictionary));
  expect(
    screen.getByRole('heading', {
      name: 'Nothing read 3 times in a row, so daily reading is paused',
    }),
  ).toBeVisible();
  expect(
    screen.getByText(/^Bilibili requires login\. .* daily reading resumes\.$/),
  ).toBeVisible();
});

it.each([
  [true, false, '已关闭每天自动读取'],
  [false, true, '已开启每天自动读取'],
])(
  'switches daily reading from %s to %s with the saved criteria and says so',
  async (from, to, message) => {
    const onSavingChange = vi.fn();
    call.mockImplementation(async (_id, action) =>
      action === 'connect'
        ? { ...connected(), autoSync: to }
        : { ...connected(), autoSync: from },
    );
    const { onChange } = view(1, true, vi.fn(), onSavingChange);
    const toggle = await screen.findByRole('switch', {
      name: '每天自动读取',
    });
    if (from) expect(toggle).toBeChecked();
    else expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(1, 'connect', {
        collectorId: 'shared',
        terms: ['NocoBase'],
        bvids: [],
        autoSync: to,
        revision: REV,
      }),
    );
    await waitFor(() => expect(toastText('success')).toBe(message));
    if (to) expect(screen.getByRole('switch')).toBeChecked();
    else expect(screen.getByRole('switch')).not.toBeChecked();
    expect(sent()).toEqual(['connect']);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onSavingChange.mock.calls).toEqual([[true], [false]]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  },
);

it('reads right after the first save, and a later change only saves', async () => {
  let state = base();
  call.mockImplementation(async (_id, action, body) => {
    if (action === 'connect')
      state = {
        ...connected(),
        // Each saved change gets a new revision.
        revision: state.connected ? LATEST : REV,
        terms: String((body as { terms: string }).terms).split('\n'),
      };
    if (action === 'sync')
      state = {
        ...state,
        verifiedAt: '2026-11-02T08:00:00.000Z',
        lastRun: lastRun({ at: '2026-11-02T08:00:00.000Z' }),
      };
    return state;
  });
  view();
  const user = userEvent.setup();
  const dialog = await openDialog(user);
  expect(
    within(dialog).queryByRole('button', { name: '保存' }),
  ).not.toBeInTheDocument();
  await user.type(
    within(dialog).getByRole('textbox', { name: '搜索词' }),
    'NocoBase{Enter}低代码',
  );
  await user.click(within(dialog).getByRole('button', { name: '保存并读取' }));
  await waitFor(() => expect(sent()).toEqual(['connect', 'sync']));
  expect(call).toHaveBeenCalledWith(1, 'connect', {
    collectorId: 'shared',
    terms: 'NocoBase\n低代码',
    bvids: '',
    revision: null,
  });
  await waitFor(() => expect(toastText('success')).toBe('Bilibili 读取完成。'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const box = screen.getByRole('region', { name: '搜索词' });
  expect(within(box).getByText('低代码')).toBeVisible();
  const edit = await openDialog(user, '修改', '修改 Bilibili 搜索词');
  expect(
    within(edit).queryByRole('button', { name: '保存并读取' }),
  ).not.toBeInTheDocument();
  await user.type(
    within(edit).getByRole('textbox', { name: '搜索词' }),
    '{Enter}开源',
  );
  await user.click(within(edit).getByRole('button', { name: '保存' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(call).toHaveBeenLastCalledWith(1, 'connect', {
    collectorId: 'shared',
    terms: 'NocoBase\n低代码\n开源',
    bvids: '',
    revision: REV,
  });
  expect(sent()).toEqual(['connect', 'sync', 'connect']);
  expect(toastText('success')).toBe('Bilibili 配置已保存。');
});

it('accepts five search terms but not six', async () => {
  call.mockImplementation(async (_id, action) =>
    action === 'status' ? base() : connected(),
  );
  view();
  const user = userEvent.setup();
  const dialog = await openDialog(user);
  const terms = within(dialog).getByRole('textbox', { name: '搜索词' });
  const save = within(dialog).getByRole('button', { name: '保存并读取' });
  // Commas separate terms as well as lines.
  fireEvent.change(terms, {
    target: { value: 'NocoBase\n低代码\n开源，无代码\n内部工具\n数据库' },
  });
  await user.click(save);
  expect(
    await within(dialog).findByText('最多填写 5 个搜索词，每个 1–80 字。'),
  ).toBeVisible();
  expect(terms).toHaveAttribute('aria-invalid', 'true');
  expect(sent()).toEqual([]);
  fireEvent.change(terms, {
    target: { value: 'NocoBase\n低代码\n开源，无代码\n内部工具' },
  });
  await waitFor(() =>
    expect(
      within(dialog).queryByText('最多填写 5 个搜索词，每个 1–80 字。'),
    ).not.toBeInTheDocument(),
  );
  await user.click(save);
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      1,
      'connect',
      expect.objectContaining({
        terms: 'NocoBase\n低代码\n开源，无代码\n内部工具',
      }),
    ),
  );
});

it('does not reopen the dialog by itself when its collector goes away and comes back', async () => {
  let status = base();
  call.mockImplementation(async () => status);
  const { refreshCollector } = view();
  await openDialog();
  status = { ...base(), configured: false, collectors: [] };
  refreshCollector(1);
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  status = base();
  refreshCollector(2);
  expect(
    await screen.findByRole('button', { name: '填写搜索词' }),
  ).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('reads nothing after a first save whose answer arrived for a superseded panel', async () => {
  const save = deferred<BilibiliStatus>();
  call.mockImplementation(async (_project, action) =>
    action === 'connect' ? save.promise : base(),
  );
  const user = userEvent.setup();
  const { refreshCollector } = view();
  const dialog = await openDialog(user);
  await user.type(
    within(dialog).getByRole('textbox', { name: '搜索词' }),
    'NocoBase',
  );
  await user.click(within(dialog).getByRole('button', { name: '保存并读取' }));
  await waitFor(() => expect(sent()).toEqual(['connect']));
  // The collector changed while the save was on its way, so its answer belongs to an older panel.
  refreshCollector(1);
  await act(async () => save.resolve(connected()));
  await waitFor(() => expect(statusReads()).toBeGreaterThan(2));
  expect(sent()).toEqual(['connect']);
});
