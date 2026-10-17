import { systemMessageKey } from '../../shared/i18n/messages';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  XiaohongshuConnect,
  type XiaohongshuView,
} from '../../client/pages/xiaohongshu-connect';
import { xiaohongshuRequest } from '../../client/pages/xiaohongshu-api';
import { sourceState, getCatalog } from '../../client/pages/data-sources';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
const role = vi.hoisted(() => ({ isAdmin: true }));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: 'admin' }, session: { id: 'session-a' } },
    refresh: vi.fn(),
  }),
}));
vi.mock('../../client/pages/me', () => ({ useMe: () => role }));
vi.mock('../../client/pages/xiaohongshu-api', () => ({
  xiaohongshuRequest: vi.fn(),
}));
vi.mock('../../client/components/reach/confirm', () => ({
  confirmAction: vi.fn(async () => true),
}));
const note = {
  id: '69a123456789abcdef012345',
  title: '已保存的笔记',
  url: 'https://www.xiaohongshu.com/explore/69a123456789abcdef012345',
  likes: null,
  likesText: null,
  publishedAt: null,
  estimatedPublishedAt: '2026-03-01',
  firstSeenAt: '2026-10-01T00:00:00Z',
  lastSeenAt: '2026-10-01T00:00:00Z',
  query: 'NocoBase',
} as const;
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
  notes: [],
  latestIds: [],
};
let stored: XiaohongshuView;
beforeEach(() => {
  cleanup();
  setDictionary(null);
  role.isAdmin = true;
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
          verifiedAt: note.lastSeenAt,
          notes: [note],
          total: 1,
          lastRun: { at: note.lastSeenAt, ok: true, count: 1 },
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
it('saves with the collector assumed ready, checks health honestly, then searches', async () => {
  const user = userEvent.setup();
  setup();
  expect(getCatalog().find((item) => item.id === 'xiaohongshu')?.uses).toEqual([
    'collect',
  ]);
  const input = await screen.findByLabelText('小红书搜索词');
  await user.type(input, 'NocoBase');
  await user.click(screen.getByRole('button', { name: '检查采集器' }));
  expect(
    await screen.findByText(
      '采集器可达，OpenCLI 已安装；浏览器和小红书登录状态仍未验证。',
    ),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: '保存连接' }));
  expect(
    await screen.findByText('采集条件已保存，可以立即搜索。'),
  ).toBeVisible();
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
  await user.click(screen.getByRole('button', { name: '立即搜索' }));
  expect(
    await screen.findByRole('link', { name: '已保存的笔记' }),
  ).toBeVisible();
  expect(screen.getByText('页面显示点赞：未知')).toBeVisible();
  expect(screen.getByText(/推算发布日：2026-03-01/)).toBeVisible();
});
it('validates at submit, focuses the first bad field, and preserves failed drafts', async () => {
  const user = userEvent.setup();
  setup();
  await screen.findByLabelText('小红书搜索词');
  await user.click(screen.getByRole('button', { name: '保存连接' }));
  expect(screen.getByLabelText('小红书搜索词')).toHaveFocus();
  await user.type(screen.getByLabelText('小红书搜索词'), '中文产品');
  vi.mocked(xiaohongshuRequest).mockRejectedValueOnce(
    new TypeError('Failed to fetch'),
  );
  await user.click(screen.getByRole('button', { name: '保存连接' }));
  expect(
    await screen.findByText('网络请求未完成，请检查网络连接后重试。'),
  ).toBeVisible();
  act(() => setDictionary(english));
  expect(
    screen.getByText(
      'The network request failed. Check your connection and try again.',
    ),
  ).toBeVisible();
  expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
  act(() => setDictionary(null));
  expect(
    screen.getByText('网络请求未完成，请检查网络连接后重试。'),
  ).toBeVisible();
  expect(screen.getByLabelText('小红书搜索词')).toHaveValue('中文产品');
});
it('members can view old notes but never see mutation controls', async () => {
  role.isAdmin = false;
  stored = {
    ...empty,
    connected: true,
    revision: 1,
    collectorId: 'team',
    query: 'NocoBase',
    total: 1,
    notes: [note],
  };
  setup();
  expect(
    await screen.findByRole('link', { name: '已保存的笔记' }),
  ).toBeVisible();
  for (const name of ['保存连接', '立即搜索', '修改连接', '断开', '检查采集器'])
    expect(
      screen.queryByRole('button', { name, exact: true }),
    ).not.toBeInTheDocument();
});
it('retries a failed collector refresh after initial setup', async () => {
  stored = { ...empty, configured: false, collectors: [] };
  const result = setup();
  const user = userEvent.setup();
  await screen.findByText('还没有已保存的笔记');
  expect(
    screen.queryByRole('button', { name: '保存连接' }),
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
  expect(await screen.findByLabelText('小红书搜索词')).toBeEnabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '保存连接' })).toBeEnabled();
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
    ],
    query: 'NocoBase',
  };
  setup();
  expect(await screen.findByText(/项目采集器/)).toBeVisible();
  act(() => setDictionary(english));
  expect(screen.getByText(/Project collector/)).toBeVisible();
  expect(screen.queryByText(/项目采集器/)).not.toBeInTheDocument();
  expect(xiaohongshuRequest).toHaveBeenCalledTimes(1);
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
  const collector = await screen.findByRole('combobox', { name: 'Collector' });
  expect(collector).toBeVisible();
  expect(
    screen.getByRole('option', { name: '当前项目采集器' }),
  ).toBeInTheDocument();
  await user.selectOptions(collector, 'backup');
  await user.type(
    screen.getByLabelText(english['xiaohongshu.xiaohongshuSearchPhrase']),
    'NocoBase',
  );
  await user.click(
    screen.getByRole('button', { name: english['xiaohongshu.saveConnection'] }),
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
    const input = await screen.findByLabelText('小红书搜索词');
    expect(input).toHaveValue('Current query');
    fireEvent.change(input, { target: { value: 'Unsaved draft' } });
    await act(async () => {
      if (reject)
        rejectOld(
          Object.assign(new Error('Old permission failure'), { status: 403 }),
        );
      else resolveOld({ ...empty, query: 'Old query' });
    });
    expect(input).toHaveValue('Unsaved draft');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存连接' })).toBeEnabled();
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
    await user.type(await screen.findByLabelText('小红书搜索词'), 'NocoBase');
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
    await waitFor(() => expect(xiaohongshuRequest).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole('button', { name: '保存连接' }));
    await screen.findByRole('button', { name: '立即搜索' });
    await act(async () => {
      if (reject)
        rejectOld(
          Object.assign(new Error('Old permission failure'), { status: 403 }),
        );
      else resolveOld(previous);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '保存连接' }),
    ).not.toBeInTheDocument();
    const search = screen.getByRole('button', { name: '立即搜索' });
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
  await screen.findByRole('button', { name: '修改连接' });
  stored = {
    ...stored,
    connected: false,
    collectorId: null,
    collectors: [{ id: 'backup', name: 'Backup browser' }],
  };
  await user.click(screen.getByRole('button', { name: '修改连接' }));
  const query = await screen.findByLabelText('小红书搜索词');
  expect(screen.getByLabelText('采集器')).toHaveValue('backup');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  await user.type(query, ' draft');
  await user.click(screen.getByRole('button', { name: '取消' }));
  expect(query).toHaveValue('NocoBase');
  expect(screen.getByLabelText('采集器')).toHaveValue('backup');
  await user.click(screen.getByRole('button', { name: '保存连接' }));
  expect(xiaohongshuRequest).toHaveBeenCalledWith(1, 'connect', {
    collectorId: 'backup',
    query: 'NocoBase',
    revision: 1,
  });
  expect(await screen.findByRole('button', { name: '立即搜索' })).toBeEnabled();
});
it('recovers status errors without clearing failed mutations or unsaved drafts', async () => {
  const result = setup();
  const input = await screen.findByLabelText('小红书搜索词');
  fireEvent.change(input, { target: { value: 'Unsaved draft' } });
  vi.mocked(xiaohongshuRequest).mockRejectedValueOnce(
    new Error('Save rejected'),
  );
  fireEvent.click(screen.getByRole('button', { name: '保存连接' }));
  await screen.findByText('Save rejected');
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
  await screen.findByText('网络请求未完成，请检查网络连接后重试。');
  result.rerender(element(2));
  await waitFor(() =>
    expect(
      screen.queryByText('网络请求未完成，请检查网络连接后重试。'),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Save rejected');
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
    notes: [note],
    verifiedAt: note.lastSeenAt,
  };
  const onChange = vi.fn();
  setup(1, onChange);
  const user = userEvent.setup();
  await screen.findByRole('link', { name: note.title });
  vi.mocked(xiaohongshuRequest).mockImplementation(async (_p, action) => {
    if (action === 'search') {
      stored.lastRun = {
        at: note.lastSeenAt,
        ok: false,
        errorCode: 'no_results',
      };
      throw new Error('未返回结果');
    }
    return structuredClone(stored);
  });
  await user.click(screen.getByRole('button', { name: '立即搜索' }));
  expect(await screen.findByText(/这不代表全网没有提及/)).toBeVisible();
  expect(screen.getByRole('link', { name: note.title })).toBeVisible();
  expect(screen.getByText(/下方保留的是上次成功采集的数据/)).toBeVisible();
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
  await user.click(await screen.findByRole('button', { name: '取消采集' }));
  await waitFor(() =>
    expect(xiaohongshuRequest).toHaveBeenCalledWith(1, 'cancel', {
      requestId: 'in-flight-id',
    }),
  );
});
it('keeps the current draft during a revision-conflict refresh and supports IME edits', async () => {
  setup();
  await screen.findByLabelText('小红书搜索词');
  const input = screen.getByLabelText('小红书搜索词');
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
  fireEvent.click(screen.getByRole('button', { name: '保存连接' }));
  await screen.findByText('连接已变更');
  expect(input).toHaveValue('中文产品');
});
it('loads the new collector revision after an earlier save response settles', async () => {
  const result = setup();
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('小红书搜索词'), 'Draft query');
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
  };
  let resolveSave!: (value: XiaohongshuView) => void;
  vi.mocked(xiaohongshuRequest).mockImplementation(async (_project, action) =>
    action === 'connect'
      ? new Promise<XiaohongshuView>((resolve) => {
          resolveSave = resolve;
        })
      : latest,
  );
  await user.click(screen.getByRole('button', { name: '保存连接' }));
  result.rerender(
    <XiaohongshuConnect
      key={1}
      projectId={1}
      refreshKey={1}
      onChange={vi.fn()}
    />,
  );
  expect(xiaohongshuRequest).toHaveBeenCalledTimes(2);
  await act(async () => resolveSave(saved));
  expect(await screen.findByText(/Project collector/)).toBeVisible();
  expect(
    screen.queryByText('采集条件已保存，可以立即搜索。'),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '立即搜索' }));
  expect(xiaohongshuRequest).toHaveBeenCalledWith(1, 'search', { revision: 2 });
});
it('late data from an unmounted project never appears in the new project', async () => {
  let resolve!: (value: XiaohongshuView) => void;
  vi.mocked(xiaohongshuRequest).mockImplementation(async (project) =>
    project === 1
      ? new Promise((r) => {
          resolve = r;
        })
      : { ...empty, query: 'second' },
  );
  const rendered = setup(1);
  await waitFor(() =>
    expect(xiaohongshuRequest).toHaveBeenCalledWith(1, 'view'),
  );
  rendered.rerender(
    <XiaohongshuConnect key={2} projectId={2} onChange={vi.fn()} />,
  );
  expect(await screen.findByLabelText('小红书搜索词')).toHaveValue('second');
  resolve({ ...empty, query: 'first' });
  await waitFor(() =>
    expect(screen.getByLabelText('小红书搜索词')).toHaveValue('second'),
  );
});
it('English copy is complete and permission failures do not invite retry', async () => {
  setDictionary(english);
  setup();
  await screen.findByRole('button', { name: 'Save connection' });
  expect(screen.getByRole('button', { name: 'Save connection' })).toBeVisible();
  cleanup();
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
it('catalog distinguishes missing setup, unverified, failed and collected browser connections', () => {
  const source = getCatalog().find((item) => item.id === 'xiaohongshu')!;
  expect(sourceState(source, {})).toBe('pending');
  expect(sourceState(source, { xiaohongshu: null })).toBe('attention');
  expect(
    sourceState(source, {
      xiaohongshu: { configured: false, connected: false },
    }),
  ).toBe('unconfigured');
  expect(
    sourceState(source, {
      xiaohongshu: { configured: true, connected: false },
    }),
  ).toBe('ready');
  expect(
    sourceState(source, {
      xiaohongshu: { configured: true, connected: true, verifiedAt: null },
    }),
  ).toBe('pending');
  expect(
    sourceState(source, {
      xiaohongshu: {
        configured: true,
        connected: true,
        verifiedAt: note.lastSeenAt,
        lastRun: { ok: true },
      },
    }),
  ).toBe('done');
  expect(
    sourceState(source, {
      xiaohongshu: {
        configured: true,
        connected: true,
        verifiedAt: note.lastSeenAt,
        lastRun: { ok: false },
      },
    }),
  ).toBe('attention');
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
  const query = await screen.findByLabelText('小红书搜索词');
  const collector = screen.getByLabelText('采集器');
  for (const field of [query, collector])
    expect(field).toHaveAttribute('aria-required', 'true');
  expect(screen.getAllByText('*')).toHaveLength(2);
  await user.selectOptions(collector, '');
  await user.click(screen.getByRole('button', { name: '保存连接' }));
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
});

it('preserves drafts and one pending health request across live language changes', async () => {
  const app = setup();
  const input = await screen.findByLabelText('小红书搜索词');
  fireEvent.change(input, { target: { value: '用户草稿 {0}' } });
  let resolve!: (value: unknown) => void;
  vi.mocked(xiaohongshuRequest).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: '检查采集器' }));
  fireEvent.click(screen.getByRole('button', { name: '正在检查…' }));
  await act(async () => setDictionary(english));
  expect(
    screen.getByLabelText(english['xiaohongshu.xiaohongshuSearchPhrase']),
  ).toBe(input);
  expect(input).toHaveValue('用户草稿 {0}');
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
  expect(input).toHaveValue('用户草稿 {0}');
  app.unmount();
});

it('retranslates exact owned errors but preserves unknown upstream payload text', async () => {
  setup();
  await screen.findByLabelText('小红书搜索词');
  const message = '此项目没有可用的指定小红书采集器，请联系管理员。';
  vi.mocked(xiaohongshuRequest).mockRejectedValueOnce(
    Object.assign(new Error('already localized'), {
      payload: { error: { message } },
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: '检查采集器' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  await act(async () => setDictionary(english));
  expect(screen.getByRole('alert')).toHaveTextContent(
    english[systemMessageKey(message)!],
  );
  const raw = '上游：保存连接，网络超时；用户草稿 {0}';
  vi.mocked(xiaohongshuRequest).mockRejectedValueOnce(
    Object.assign(new Error('must not use translated message'), {
      payload: { error: { message: raw } },
    }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: english['common.checkCollector'] }),
  );
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(raw));
  await act(async () => setDictionary(null));
  expect(screen.getByRole('alert')).toHaveTextContent(raw);
});
