import { systemMessageKey } from '../../shared/i18n/messages';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  render as renderBase,
  screen,
  waitFor,
  within,
  fireEvent,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import {
  XiaohongshuConnect,
  type XiaohongshuView,
} from '../../client/pages/xiaohongshu-connect';
import { xiaohongshuRequest } from '../../client/pages/xiaohongshu-api';
import { sourceState, getCatalog } from '../../client/pages/data-sources';
import { setDictionary } from '../../client/i18n';
import { nocobaseClient } from '../../client/lib/nocoreach-api';
import english from '../../shared/i18n/en.json';

// The panels link to their data pages, so they render inside a router.
const render = (ui: ReactElement) => renderBase(ui, { wrapper: MemoryRouter });
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
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: 'admin' }, session: { id: 'session-a' } },
    refresh: vi.fn(),
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationClient: () => authorization,
  useAuthorizationRevision: () => authorization.revision,
}));
vi.mock('../../client/pages/xiaohongshu-api', () => ({
  xiaohongshuRequest: vi.fn(),
}));
vi.mock('../../client/components/reach/confirm', () => ({
  confirmAction: vi.fn(async () => true),
}));
const seenAt = '2026-10-01T00:00:00Z';
const note: XiaohongshuView['recent'][number] = {
  id: '69a123456789abcdef012345',
  title: '已保存的笔记',
  url: 'https://www.xiaohongshu.com/explore/69a123456789abcdef012345',
  likes: null,
  likesText: null,
  estimatedPublishedAt: '2026-03-01',
};
const empty: XiaohongshuView = {
  connected: false,
  configured: true,
  revision: 0,
  collectors: [{ id: 'team', name: '团队浏览器' }],
  collectorId: null,
  query: '',
  verifiedAt: null,
  lastRun: null,
  total: 0,
  running: null,
  queued: null,
  recent: [],
  recordingSince: null,
};
const queued = { retries: 0, retryAt: '2026-10-01T00:10:00Z' };
const notesRecorded = '已记录 1 条笔记 · 从 2026-10-01 开始记录';
let stored: XiaohongshuView;
beforeEach(() => {
  cleanup();
  setDictionary(null);
  authorization.revision = 0;
  authorization.can.mockReset().mockResolvedValue(true);
  stored = structuredClone(empty);
  vi.mocked(xiaohongshuRequest).mockReset();
  vi.mocked(xiaohongshuRequest).mockImplementation(
    async (_project, action, values) => {
      const input = values as Record<string, unknown> | undefined;
      if (action === 'connect')
        stored = {
          ...stored,
          connected: true,
          revision: 1,
          collectorId: String(input?.collectorId),
          query: String(input?.query),
        };
      if (action === 'search')
        stored = {
          ...stored,
          verifiedAt: seenAt,
          recent: [note],
          total: 1,
          recordingSince: seenAt,
          lastRun: { at: seenAt, ok: true, count: 1 },
        };
      if (action === 'test')
        return {
          toolInstalled: true,
          browser: 'unchecked',
          login: 'unchecked',
        };
      if (action === 'disconnect')
        stored = { ...stored, connected: false, revision: stored.revision + 1 };
      return structuredClone(stored);
    },
  );
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});
const setup = (projectId = 1, onChange = vi.fn()) =>
  render(
    <XiaohongshuConnect
      key={projectId}
      projectId={projectId}
      onChange={onChange}
    />,
  );
// The search phrase and collector are edited in a dialog opened from the panel.
async function openForm(
  user: ReturnType<typeof userEvent.setup>,
  button = '填写搜索词',
) {
  await user.click(await screen.findByRole('button', { name: button }));
  return screen.findByRole('dialog');
}
it('saves with the collector assumed ready, leaves the collector check to its row, then reads by hand', async () => {
  const user = userEvent.setup();
  setup();
  expect(
    await screen.findByText('还没有填写搜索词，填写后开始读取。'),
  ).toBeVisible();
  const dialog = await openForm(user);
  expect(
    within(dialog).getByRole('heading', { name: '填写小红书搜索词' }),
  ).toBeVisible();
  const input = within(dialog).getByLabelText('搜索词');
  // One term, as the collector takes; the hint says so.
  expect(input.tagName).toBe('INPUT');
  expect(input).toHaveAccessibleDescription('只填 1 个，2–60 字符。');
  expect(
    within(dialog).queryByRole('button', { name: '检查采集器' }),
  ).not.toBeInTheDocument();
  await user.type(input, 'NocoBase');
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(
    await screen.findByText('采集条件已保存，可以立即搜索。'),
  ).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(xiaohongshuRequest).toHaveBeenCalledWith(1, 'connect', {
    collectorId: 'team',
    query: 'NocoBase',
    revision: 0,
  });
  expect(xiaohongshuRequest).not.toHaveBeenCalledWith(
    1,
    'search',
    expect.anything(),
  );
  const terms = screen.getByRole('region', { name: '搜索词' });
  expect(within(terms).getByText('NocoBase')).toBeVisible();
  expect(within(terms).getByText('手动读取')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '立即读取' }));
  // Notes are listed in full on the data page (data-collector-pages.test.tsx).
  expect(await screen.findByText('小红书笔记已采集并保存。')).toBeVisible();
  expect(screen.getByText(notesRecorded)).toBeVisible();
  expect(within(terms).getByText(/更新于/)).toBeVisible();
  expect(screen.getByRole('link', { name: note.title })).toBeVisible();
  expect(screen.getByRole('link', { name: '查看数据' })).toBeVisible();
});
it('validates at submit, focuses the first bad field, and preserves failed drafts', async () => {
  const user = userEvent.setup();
  setup();
  const dialog = await openForm(user);
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(within(dialog).getByLabelText('搜索词')).toHaveFocus();
  await user.type(within(dialog).getByLabelText('搜索词'), '中文产品');
  vi.mocked(xiaohongshuRequest).mockRejectedValueOnce(
    new TypeError('Failed to fetch'),
  );
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(
    await within(dialog).findByText('网络请求未完成，请检查网络连接后重试。'),
  ).toBeVisible();
  act(() => setDictionary(english));
  expect(
    within(dialog).getByText(
      'The network request failed. Check your connection and try again.',
    ),
  ).toBeVisible();
  expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
  act(() => setDictionary(null));
  expect(
    within(dialog).getByText('网络请求未完成，请检查网络连接后重试。'),
  ).toBeVisible();
  expect(within(dialog).getByLabelText('搜索词')).toHaveValue('中文产品');
});
it('members can view old notes but never see mutation controls', async () => {
  authorization.can.mockResolvedValue(false);
  stored = {
    ...empty,
    connected: true,
    revision: 1,
    collectorId: 'team',
    query: 'NocoBase',
    total: 1,
    recordingSince: seenAt,
    recent: [note],
  };
  const app = setup();
  expect(await screen.findByText(notesRecorded)).toBeVisible();
  expect(screen.getByRole('link', { name: note.title })).toBeVisible();
  expect(screen.getByRole('link', { name: '查看数据' })).toBeVisible();
  const controls = [
    '填写搜索词',
    '修改',
    '保存',
    '立即读取',
    '取消采集',
    '断开',
    '检查采集器',
    '清理已获取数据',
  ];
  for (const name of controls)
    expect(
      screen.queryByRole('button', { name, exact: true }),
    ).not.toBeInTheDocument();
  app.unmount();
  stored = { ...empty };
  setup();
  expect(
    await screen.findByText(
      '尚未有可确认的笔记，请管理员配置采集器并手动搜索。',
    ),
  ).toBeVisible();
  for (const name of controls)
    expect(
      screen.queryByRole('button', { name, exact: true }),
    ).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});
it.each([
  ['connect', '填写搜索词'],
  ['test', '检查采集器'],
  ['search', '立即读取'],
  ['cancel', '取消采集'],
  ['disconnect', '断开'],
])(
  'exposes only the granted Xiaohongshu %s operation and keeps saved notes readable',
  async (allowed, label) => {
    authorization.can.mockImplementation(
      async ({ resource, action }) =>
        resource.type === 'nocoreach' &&
        resource.id === '1' &&
        action === `nrXiaohongshu.${allowed}`,
    );
    stored = {
      ...empty,
      connected: allowed !== 'connect',
      revision: 1,
      collectorId: 'team',
      query: 'NocoBase',
      recent: [note],
      total: 1,
      recordingSince: seenAt,
      running: allowed === 'cancel' ? 'running-collection' : null,
    };
    setup();
    const button = await screen.findByRole('button', {
      name: label,
      exact: true,
    });
    expect(screen.getByRole('link', { name: '查看数据' })).toBeVisible();
    if (allowed !== 'connect')
      expect(screen.getByText(notesRecorded)).toBeVisible();
    for (const other of [
      '填写搜索词',
      '修改',
      '保存',
      '检查采集器',
      '立即读取',
      '取消采集',
      '断开',
    ]) {
      if (other !== label)
        expect(
          screen.queryByRole('button', { name: other, exact: true }),
        ).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(button);
    if (allowed === 'connect') {
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText('搜索词')).toHaveValue('NocoBase');
      expect(
        within(dialog).queryByRole('button', { name: '检查采集器' }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        within(dialog).getByRole('button', { name: '保存' }),
      );
    }
    await waitFor(() =>
      expect(
        vi
          .mocked(xiaohongshuRequest)
          .mock.calls.filter(([, action]) => action !== 'status')
          .map(([project, action]) => [project, action]),
      ).toEqual([[1, allowed]]),
    );
  },
);
it('retries a failed collector refresh after initial setup', async () => {
  stored = { ...empty, configured: false, collectors: [] };
  const result = setup();
  const user = userEvent.setup();
  // An administrator without a collector sets one up above the panel, so the panel itself stays empty.
  await waitFor(() => {
    expect(
      screen.queryByRole('status', { name: '正在读取…' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('尚未配置小红书采集器')).not.toBeInTheDocument();
  });
  expect(
    screen.queryByRole('button', { name: '填写搜索词' }),
  ).not.toBeInTheDocument();
  vi.mocked(xiaohongshuRequest).mockRejectedValueOnce(
    new TypeError('Failed to fetch'),
  );
  result.rerender(
    <XiaohongshuConnect
      key={1}
      projectId={1}
      refreshKey={1}
      onChange={vi.fn()}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '网络请求未完成，请检查网络连接后重试。',
  );
  stored = {
    ...empty,
    collectors: [{ id: 'project-xiaohongshu-1', name: 'Project collector' }],
  };
  await user.click(screen.getByRole('button', { name: '重试' }));
  const add = await screen.findByRole('button', { name: '填写搜索词' });
  expect(add).toBeEnabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  const dialog = await openForm(user);
  expect(within(dialog).getByLabelText('搜索词')).toBeEnabled();
  expect(within(dialog).getByLabelText('采集器')).toHaveValue(
    'project-xiaohongshu-1',
  );
  expect(within(dialog).getByRole('button', { name: '保存' })).toBeEnabled();
});
it('translates the project collector label when the language changes', async () => {
  stored = {
    ...empty,
    connected: true,
    collectorId: 'project-xiaohongshu-1',
    collectors: [
      {
        id: 'project-xiaohongshu-1',
        name: '当前项目采集器',
        nameKey: 'collectorConnection.projectSource',
      },
      { id: 'backup', name: 'Backup browser' },
    ],
    query: 'NocoBase',
  };
  setup();
  const user = userEvent.setup();
  const dialog = await openForm(user, '修改');
  expect(
    within(dialog).getByRole('heading', { name: '修改小红书搜索词' }),
  ).toBeVisible();
  const collector = within(dialog).getByRole('combobox', { name: '采集器' });
  expect(collector).toHaveDisplayValue('当前项目采集器');
  act(() => setDictionary(english));
  expect(collector).toHaveDisplayValue('Project collector');
  expect(
    within(dialog).queryByRole('option', { name: '当前项目采集器' }),
  ).not.toBeInTheDocument();
  // The initial read and the read that opens the dialog; a language change reads nothing.
  expect(xiaohongshuRequest).toHaveBeenCalledTimes(2);
});
it('keeps deployment collector names and choices independent of ID prefixes', async () => {
  setDictionary(english);
  stored = {
    ...empty,
    collectors: [
      { id: 'project-xiaohongshu-1', name: '当前项目采集器' },
      { id: 'backup', name: 'Backup browser' },
    ],
  };
  setup();
  const user = userEvent.setup();
  const dialog = await openForm(user, english['youtube.addTerms']);
  const collector = within(dialog).getByRole('combobox', { name: 'Collector' });
  expect(collector).toBeVisible();
  expect(
    within(dialog).getByRole('option', { name: '当前项目采集器' }),
  ).toBeInTheDocument();
  await user.selectOptions(collector, 'backup');
  await user.type(
    within(dialog).getByLabelText(english['common.searchTerm']),
    'NocoBase',
  );
  await user.click(
    within(dialog).getByRole('button', { name: english['common.save'] }),
  );
  await waitFor(() =>
    expect(xiaohongshuRequest).toHaveBeenCalledWith(1, 'connect', {
      collectorId: 'backup',
      query: 'NocoBase',
      revision: 0,
    }),
  );
});
it.each([false, true])(
  'ignores superseded status reads, including failures (reject: %s)',
  async (reject) => {
    let resolveOld!: (value: XiaohongshuView) => void;
    let rejectOld!: (error: Error) => void;
    vi.mocked(xiaohongshuRequest).mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          resolveOld = resolve;
          rejectOld = reject;
        }),
    );
    const result = setup();
    stored = { ...empty, query: 'Current query' };
    result.rerender(
      <XiaohongshuConnect
        key={1}
        projectId={1}
        refreshKey={1}
        onChange={vi.fn()}
      />,
    );
    const dialog = await openForm(userEvent.setup());
    const input = within(dialog).getByLabelText('搜索词');
    expect(input).toHaveValue('Current query');
    fireEvent.change(input, { target: { value: 'Unsaved draft' } });
    await act(async () => {
      if (reject)
        rejectOld(
          Object.assign(new Error('Old permission failure'), { status: 403 }),
        );
      else resolveOld({ ...empty, connected: true, query: 'Old query' });
    });
    expect(input).toHaveValue('Unsaved draft');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Old query')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '保存' })).toBeEnabled();
  },
);
it.each([false, true])(
  'ignores an earlier refresh after saving the connection (reject: %s)',
  async (reject) => {
    stored.collectors = [
      { id: 'project-xiaohongshu-1', name: 'Project collector' },
    ];
    const result = setup();
    const user = userEvent.setup();
    const dialog = await openForm(user);
    await user.type(within(dialog).getByLabelText('搜索词'), 'NocoBase');
    const previous = structuredClone(stored);
    let resolveOld!: (value: XiaohongshuView) => void;
    let rejectOld!: (error: Error) => void;
    vi.mocked(xiaohongshuRequest).mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          resolveOld = resolve;
          rejectOld = reject;
        }),
    );
    result.rerender(
      <XiaohongshuConnect
        key={1}
        projectId={1}
        refreshKey={1}
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => expect(xiaohongshuRequest).toHaveBeenCalledTimes(3));
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    await screen.findByRole('button', { name: '立即读取' });
    await act(async () => {
      if (reject)
        rejectOld(
          Object.assign(new Error('Old permission failure'), { status: 403 }),
        );
      else resolveOld(previous);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '填写搜索词' }),
    ).not.toBeInTheDocument();
    const search = screen.getByRole('button', { name: '立即读取' });
    expect(search).toBeEnabled();
    await user.click(search);
    expect(xiaohongshuRequest).toHaveBeenCalledWith(1, 'search', {
      revision: 1,
    });
  },
);
it('keeps the sole available collector selected when editing an unavailable connection', async () => {
  stored = {
    ...empty,
    connected: true,
    revision: 1,
    collectorId: 'team',
    query: 'NocoBase',
  };
  setup();
  const user = userEvent.setup();
  await screen.findByRole('button', { name: '修改' });
  stored = {
    ...stored,
    connected: false,
    collectorId: null,
    collectors: [{ id: 'backup', name: 'Backup browser' }],
  };
  // Opening the dialog reads the latest status first, which no longer has the saved collector.
  let dialog = await openForm(user, '修改');
  let query = within(dialog).getByLabelText('搜索词');
  expect(within(dialog).getByLabelText('采集器')).toHaveValue('backup');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  await user.type(query, ' draft');
  await user.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  dialog = await openForm(user);
  query = within(dialog).getByLabelText('搜索词');
  expect(query).toHaveValue('NocoBase');
  expect(within(dialog).getByLabelText('采集器')).toHaveValue('backup');
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(xiaohongshuRequest).toHaveBeenCalledWith(1, 'connect', {
    collectorId: 'backup',
    query: 'NocoBase',
    revision: 1,
  });
  expect(await screen.findByRole('button', { name: '立即读取' })).toBeEnabled();
});
it('recovers status errors without clearing failed mutations or unsaved drafts', async () => {
  const result = setup();
  const dialog = await openForm(userEvent.setup());
  const input = within(dialog).getByLabelText('搜索词');
  fireEvent.change(input, { target: { value: 'Unsaved draft' } });
  vi.mocked(xiaohongshuRequest).mockRejectedValueOnce(
    new Error('Save rejected'),
  );
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await within(dialog).findByText('Save rejected');
  vi.mocked(xiaohongshuRequest).mockRejectedValueOnce(
    new TypeError('Failed to fetch'),
  );
  const element = (refreshKey: number) => (
    <XiaohongshuConnect
      key={1}
      projectId={1}
      refreshKey={refreshKey}
      onChange={vi.fn()}
    />
  );
  result.rerender(element(1));
  // The dialog stays open and shows the failed status read with the failed save.
  await within(dialog).findByText('网络请求未完成，请检查网络连接后重试。');
  result.rerender(element(2));
  await waitFor(() =>
    expect(
      screen.queryByText('网络请求未完成，请检查网络连接后重试。'),
    ).not.toBeInTheDocument(),
  );
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Save rejected');
  expect(input).toHaveValue('Unsaved draft');
});
it('a search failure preserves old data and does not render a zero count', async () => {
  stored = {
    ...empty,
    connected: true,
    revision: 1,
    collectorId: 'team',
    query: 'NocoBase',
    total: 1,
    recordingSince: seenAt,
    recent: [note],
    verifiedAt: seenAt,
  };
  const onChange = vi.fn();
  setup(1, onChange);
  const user = userEvent.setup();
  await screen.findByText(notesRecorded);
  vi.mocked(xiaohongshuRequest).mockImplementation(async (_p, action) => {
    if (action === 'search') {
      stored.lastRun = {
        at: seenAt,
        ok: false,
        errorCode: 'no_results',
      };
      throw new Error('未返回结果');
    }
    return structuredClone(stored);
  });
  await user.click(screen.getByRole('button', { name: '立即读取' }));
  expect(await screen.findByText('上次没有读到')).toBeVisible();
  expect(
    screen.getByText(
      '本次未返回可确认的笔记，未验证当前登录状态；这不代表全网没有提及。可以点“立即读取”重试。',
    ),
  ).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('未返回结果');
  expect(screen.getByText(notesRecorded)).toBeVisible();
  expect(screen.getByRole('link', { name: note.title })).toBeVisible();
  expect(screen.queryByText(/已记录 0 条/)).not.toBeInTheDocument();
  expect(onChange).toHaveBeenCalledOnce();
});
it('shows existing in-flight work after reopening and lets an administrator cancel it', async () => {
  stored = {
    ...empty,
    connected: true,
    revision: 1,
    collectorId: 'team',
    query: 'NocoBase',
    running: 'in-flight-id',
  };
  setup();
  const user = userEvent.setup();
  const cancel = await screen.findByRole('button', { name: '取消采集' });
  expect(
    screen.getByText(
      '正在使用采集器的浏览器搜索，最多约 80 秒。关闭面板后仍会继续，可重新打开查看或取消。',
    ),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: '正在读取…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '修改' })).toBeDisabled();
  await user.click(cancel);
  await waitFor(() =>
    expect(xiaohongshuRequest).toHaveBeenCalledWith(1, 'cancel', {
      requestId: 'in-flight-id',
    }),
  );
  expect(await screen.findByText('已请求取消采集。')).toBeVisible();
});
it('keeps the current draft during a revision-conflict refresh and supports IME edits', async () => {
  setup();
  const dialog = await openForm(userEvent.setup());
  const input = within(dialog).getByLabelText('搜索词');
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: '中文产品' } });
  fireEvent.compositionEnd(input);
  vi.mocked(xiaohongshuRequest).mockImplementation(async (_p, action) => {
    if (action === 'connect') {
      stored.revision = 5;
      throw Object.assign(new Error('连接已变更'), { status: 409 });
    }
    return structuredClone(stored);
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await within(dialog).findByText('连接已变更');
  await waitFor(() =>
    expect(xiaohongshuRequest).toHaveBeenLastCalledWith(1, 'status'),
  );
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(input).toHaveValue('中文产品');
});
it('loads the new collector revision after an earlier save response settles', async () => {
  const result = setup();
  const user = userEvent.setup();
  const dialog = await openForm(user);
  await user.type(within(dialog).getByLabelText('搜索词'), 'Draft query');
  const saved = {
    ...empty,
    connected: true,
    revision: 1,
    collectorId: 'team',
    query: 'Draft query',
  };
  const latest = {
    ...saved,
    revision: 2,
    collectorId: 'project-xiaohongshu-1',
    collectors: [{ id: 'project-xiaohongshu-1', name: 'Project collector' }],
    total: 2,
  };
  let resolveSave!: (value: XiaohongshuView) => void;
  vi.mocked(xiaohongshuRequest).mockImplementation(async (_project, action) =>
    action === 'connect'
      ? new Promise<XiaohongshuView>((resolve) => {
          resolveSave = resolve;
        })
      : latest,
  );
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  result.rerender(
    <XiaohongshuConnect
      key={1}
      projectId={1}
      refreshKey={1}
      onChange={vi.fn()}
    />,
  );
  // The initial read, the read that opened the dialog and the pending save; the refresh waits for the save.
  expect(xiaohongshuRequest).toHaveBeenCalledTimes(3);
  await act(async () => resolveSave(saved));
  expect(await screen.findByText('已记录 2 条笔记')).toBeVisible();
  expect(
    screen.queryByText('采集条件已保存，可以立即搜索。'),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '立即读取' }));
  expect(xiaohongshuRequest).toHaveBeenCalledWith(1, 'search', { revision: 2 });
});
it('late data from an unmounted project never appears in the new project', async () => {
  let resolve!: (value: XiaohongshuView) => void;
  vi.mocked(xiaohongshuRequest).mockImplementation(async (project) =>
    project === 1
      ? new Promise((r) => {
          resolve = r;
        })
      : { ...empty, connected: true, query: 'second' },
  );
  const rendered = setup(1);
  await waitFor(() =>
    expect(xiaohongshuRequest).toHaveBeenCalledWith(1, 'status'),
  );
  rendered.rerender(
    <XiaohongshuConnect key={2} projectId={2} onChange={vi.fn()} />,
  );
  expect(await screen.findByText('second')).toBeVisible();
  await act(async () => resolve({ ...empty, connected: true, query: 'first' }));
  expect(screen.queryByText('first')).not.toBeInTheDocument();
  expect(screen.getByText('second')).toBeVisible();
});
it('English copy is complete and permission failures do not invite retry', async () => {
  setDictionary(english);
  const app = setup();
  const user = userEvent.setup();
  expect(
    await screen.findByRole('heading', { name: 'Search terms' }),
  ).toBeVisible();
  expect(
    screen.getByText('No search terms yet. Reading starts once you add them.'),
  ).toBeVisible();
  const dialog = await openForm(user, 'Add search terms');
  expect(
    within(dialog).getByRole('heading', {
      name: 'Enter Xiaohongshu search term',
    }),
  ).toBeVisible();
  for (const name of ['Cancel', 'Save'])
    expect(within(dialog).getByRole('button', { name })).toBeVisible();
  expect(
    within(dialog).getByLabelText('Search term'),
  ).toHaveAccessibleDescription('One term only, 2–60 characters.');
  app.unmount();
  vi.mocked(xiaohongshuRequest).mockRejectedValue(
    Object.assign(new Error('权限不足'), { status: 403 }),
  );
  setup();
  expect(
    await screen.findByText(
      'You do not have permission to perform this action.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Retry' }),
  ).not.toBeInTheDocument();
});
it('catalog names Xiaohongshu and marks it connected once search terms are saved, whatever the last read did', () => {
  const source = getCatalog().find((item) => item.id === 'xiaohongshu')!;
  expect(source.name).toBe('小红书');
  // Without saved search terms the panel offers the next step, whether or not a collector is set up yet.
  expect(sourceState(source, {})).toBe('ready');
  expect(sourceState(source, { xiaohongshu: null })).toBe('ready');
  expect(
    sourceState(source, {
      xiaohongshu: { configured: false, connected: false },
    }),
  ).toBe('ready');
  expect(
    sourceState(source, {
      xiaohongshu: { configured: true, connected: false },
    }),
  ).toBe('ready');
  // A read that fails or has not run yet is the panel's notice, not a card state.
  for (const lastRun of [null, { ok: true }, { ok: false, errorCode: 'busy' }])
    expect(
      sourceState(source, {
        xiaohongshu: {
          configured: true,
          connected: true,
          verifiedAt: lastRun ? seenAt : null,
          lastRun,
        },
      }),
    ).toBe('connected');
});

it('locks a pending cancel action against duplicate clicks', async () => {
  stored = {
    ...empty,
    connected: true,
    collectorId: 'team',
    query: 'NocoBase',
    running: 'pending-request',
  };
  let finish!: () => void;
  vi.mocked(xiaohongshuRequest).mockImplementation(async (_p, action) => {
    if (action === 'cancel')
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    return structuredClone(stored);
  });
  setup();
  const button = await screen.findByRole('button', { name: '取消采集' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(button).toHaveTextContent('正在取消…');
  expect(
    vi
      .mocked(xiaohongshuRequest)
      .mock.calls.filter(([, action]) => action === 'cancel'),
  ).toHaveLength(1);
  finish();
  await waitFor(() => expect(button).toBeEnabled());
});

it('marks all required fields and revalidates corrected values after the first submit', async () => {
  stored.collectors.push({ id: 'backup', name: 'Backup browser' });
  setup();
  const user = userEvent.setup();
  const dialog = await openForm(user);
  const query = within(dialog).getByLabelText('搜索词');
  const collector = within(dialog).getByLabelText('采集器');
  for (const field of [query, collector])
    expect(field).toHaveAttribute('aria-required', 'true');
  // Only the collector shows a required mark; the search term reads as Bilibili's does.
  expect(within(dialog).getAllByText('*')).toHaveLength(1);
  await user.selectOptions(collector, '');
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(collector).toHaveFocus();
  expect(query).toHaveAttribute('aria-invalid', 'true');
  await user.type(query, '中');
  expect(screen.getByText('请填写 2–60 个字符的小红书搜索词。')).toBeVisible();
  await user.type(query, '文');
  expect(
    screen.queryByText('请填写 2–60 个字符的小红书搜索词。'),
  ).not.toBeInTheDocument();
  expect(query).toHaveAttribute('aria-invalid', 'false');
  await user.clear(query);
  expect(screen.getByText('请填写 2–60 个字符的小红书搜索词。')).toBeVisible();
  await user.type(query, '产品');
  await user.selectOptions(collector, 'team');
  expect(collector).toHaveAttribute('aria-invalid', 'false');
  expect(screen.queryAllByRole('alert')).toHaveLength(0);
  expect(xiaohongshuRequest).not.toHaveBeenCalledWith(
    1,
    'connect',
    expect.anything(),
  );
});

it('preserves drafts across live language changes', async () => {
  const app = setup();
  const dialog = await openForm(userEvent.setup());
  const input = within(dialog).getByLabelText('搜索词');
  fireEvent.change(input, { target: { value: '用户草稿 {0}' } });
  await act(async () => setDictionary(english));
  expect(within(dialog).getByLabelText(english['common.searchTerm'])).toBe(
    input,
  );
  expect(input).toHaveValue('用户草稿 {0}');
  await act(async () => setDictionary(null));
  expect(input).toHaveValue('用户草稿 {0}');
  app.unmount();
});

it('keeps one pending collector check across live language changes for someone who may only check it', async () => {
  authorization.can.mockImplementation(
    async ({ action }) => action === 'nrXiaohongshu.test',
  );
  const app = setup();
  let resolve!: (value: unknown) => void;
  const button = await screen.findByRole('button', { name: '检查采集器' });
  vi.mocked(xiaohongshuRequest).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  fireEvent.click(button);
  fireEvent.click(screen.getByRole('button', { name: '正在检查…' }));
  await act(async () => setDictionary(english));
  expect(
    screen.getByRole('button', { name: english['common.checking'] }),
  ).toBeDisabled();
  expect(
    vi.mocked(xiaohongshuRequest).mock.calls.filter((c) => c[1] === 'test'),
  ).toHaveLength(1);
  await act(async () => resolve({}));
  expect(
    await screen.findByText(
      english['xiaohongshu.collectorReachableOpencliInstalledBrowser'],
    ),
  ).toBeVisible();
  await act(async () => setDictionary(null));
  expect(
    screen.getByText(
      '采集器可达，OpenCLI 已安装；浏览器和小红书登录状态仍未验证。',
    ),
  ).toBeVisible();
  app.unmount();
});

it('retranslates exact owned errors but preserves unknown upstream payload text', async () => {
  setup();
  const user = userEvent.setup();
  const dialog = await openForm(user);
  await user.type(within(dialog).getByLabelText('搜索词'), 'NocoBase');
  const message = '此项目没有可用的指定小红书采集器，请联系管理员。';
  vi.mocked(xiaohongshuRequest).mockRejectedValueOnce(
    Object.assign(new Error('already localized'), {
      payload: { error: { message } },
    }),
  );
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
  await act(async () => setDictionary(english));
  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    english[systemMessageKey(message)!],
  );
  const raw = '上游：保存连接，网络超时；用户草稿 {0}';
  vi.mocked(xiaohongshuRequest).mockRejectedValueOnce(
    Object.assign(new Error('must not use translated message'), {
      payload: { error: { message: raw } },
    }),
  );
  fireEvent.click(
    within(dialog).getByRole('button', { name: english['common.save'] }),
  );
  await waitFor(() =>
    expect(within(dialog).getByRole('alert')).toHaveTextContent(raw),
  );
  await act(async () => setDictionary(null));
  expect(within(dialog).getByRole('alert')).toHaveTextContent(raw);
});

it('clears the saved notes from the connection after both confirmations and refreshes the status', async () => {
  const clear = vi.spyOn(nocobaseClient, 'action').mockResolvedValue({});
  stored = {
    ...stored,
    connected: true,
    revision: 2,
    query: 'NocoBase',
    recent: [note],
    total: 1,
  };
  const onChange = vi.fn();
  setup(1, onChange);
  await userEvent.click(
    await screen.findByRole('button', { name: '清理已获取数据' }),
  );
  await waitFor(() =>
    expect(clear).toHaveBeenCalledWith(
      'nrXiaohongshu',
      'clear',
      expect.objectContaining({ body: { projectId: 1, revision: 2 } }),
    ),
  );
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  expect(xiaohongshuRequest).toHaveBeenCalledTimes(2);
  clear.mockRestore();
});

it('tells the person when a read is queued behind another, or when the collector stayed busy', async () => {
  stored = {
    ...empty,
    connected: true,
    revision: 1,
    collectorId: 'team',
    query: 'NocoBase',
    queued,
    // A queued retry takes precedence over the failed read that queued it.
    lastRun: { at: seenAt, ok: false, errorCode: 'busy' },
  };
  const app = setup();
  expect(
    await screen.findByText('采集器正在处理另一个读取，已排队'),
  ).toBeVisible();
  expect(
    screen.getByText('约 10 分钟后自动再试，最多再试 3 次。不用手动操作。'),
  ).toBeVisible();
  expect(
    screen.queryByText('采集器一直在处理其他读取，这次没有读到'),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('上次没有读到')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '立即读取' })).toBeEnabled();
  app.unmount();
  stored = { ...stored, queued: null };
  setup();
  expect(
    await screen.findByText('采集器一直在处理其他读取，这次没有读到'),
  ).toBeVisible();
  expect(screen.getByText('可以点“立即读取”重试。')).toBeVisible();
  expect(
    screen.queryByText('采集器正在处理另一个读取，已排队'),
  ).not.toBeInTheDocument();
});

it('reports a read the busy collector queued instead of saying notes were saved', async () => {
  stored = {
    ...empty,
    connected: true,
    revision: 1,
    collectorId: 'team',
    query: 'NocoBase',
  };
  const onChange = vi.fn();
  setup(1, onChange);
  const user = userEvent.setup();
  vi.mocked(xiaohongshuRequest).mockImplementation(async (_p, action) => {
    if (action === 'search')
      stored = {
        ...stored,
        queued,
        lastRun: { at: seenAt, ok: false, errorCode: 'busy' },
      };
    return structuredClone(stored);
  });
  await user.click(await screen.findByRole('button', { name: '立即读取' }));
  await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
  const statuses = screen
    .getAllByRole('status')
    .map((status) => status.textContent);
  // The queue notice says it once, with when it tries again; no second line repeats the title.
  expect(statuses).not.toContain('采集器正在处理另一个读取，已排队');
  expect(statuses).toContain(
    '采集器正在处理另一个读取，已排队约 10 分钟后自动再试，最多再试 3 次。不用手动操作。',
  );
  expect(screen.getAllByText('采集器正在处理另一个读取，已排队')).toHaveLength(
    1,
  );
  expect(
    screen.queryByText('小红书笔记已采集并保存。'),
  ).not.toBeInTheDocument();
  expect(xiaohongshuRequest).toHaveBeenCalledWith(1, 'search', {
    revision: 1,
  });
});

it('lists the recently found notes with their likes, as counted or as the page showed them', async () => {
  const recent: XiaohongshuView['recent'] = [
    { ...note, id: 'exact', title: '精确点赞', likes: 1234 },
    {
      ...note,
      id: 'large',
      title: '大量点赞',
      likes: 12345,
      estimatedPublishedAt: null,
    },
    { ...note, id: 'text', title: '页面点赞', likesText: '10万+' },
    { ...note, id: 'none', title: '没有点赞', estimatedPublishedAt: null },
  ];
  stored = {
    ...empty,
    connected: true,
    revision: 1,
    collectorId: 'team',
    query: 'NocoBase',
    total: 4,
    recent,
  };
  const app = setup();
  expect(await screen.findByText('最近找到的笔记')).toBeVisible();
  const item = (title: string) => {
    const link = screen.getByRole('link', { name: title });
    expect(link).toHaveAttribute('href', note.url);
    return link.closest('li')!;
  };
  expect(item('精确点赞')).toHaveTextContent(/03-01 · 1,234 赞$/);
  expect(item('大量点赞')).toHaveTextContent(/^大量点赞 · 1\.2 万赞$/);
  expect(item('页面点赞')).toHaveTextContent(/03-01 · 10 万\+ 赞$/);
  expect(item('没有点赞')).toHaveTextContent(/^没有点赞$/);
  app.unmount();
  setDictionary(english);
  setup();
  expect(await screen.findByText('Recently found notes')).toBeVisible();
  expect(item('大量点赞')).toHaveTextContent(/^大量点赞 · 12\.3K likes$/);
  expect(item('页面点赞')).toHaveTextContent(/· 100K\+ likes$/);
});
