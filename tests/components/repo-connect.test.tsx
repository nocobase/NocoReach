import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { NocoReachHttpError } from '../../client/lib/nocoreach-api';
import { RepoConnect } from '../../client/pages/repo-connect';
const { action, authorization, access, confirm } = vi.hoisted(() => ({
  action: vi.fn(),
  authorization: { can: vi.fn(), invalidate: vi.fn() },
  access: {
    actions: ['nrAgent.saveRepo', 'nrAgent.removeRepo', 'nrAgent.checkRepo'],
  },
  confirm: vi.fn(async () => true),
}));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<object>()),
  useAuthorizationClient: () => authorization,
  useAuthorizationRevision: () => 'test-revision',
}));
vi.mock('../../client/components/reach/confirm', () => ({
  confirmAction: confirm,
}));
vi.mock('../../client/lib/nocoreach-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action },
}));

// Website source in two repositories (2026-10-29): one checked and with a pull request, one whose branch is missing.
const at = new Date().toISOString();
const list = {
  revision: 3,
  sites: ['www.example.com', 'docs.example.com'],
  repos: [
    {
      id: 'site',
      repo: 'team/site',
      baseBranch: 'main',
      allowedPaths: [],
      urls: ['www.example.com'],
      check: { at, repo: 'ok', branch: 'ok', runner: 'online' },
      lastPr: {
        number: 188,
        url: 'https://github.com/team/site/pull/188',
        title: 'Rewrite the pricing title',
        at,
        taskId: '7',
      },
    },
    {
      id: 'docs',
      repo: 'team/docs',
      baseBranch: 'release',
      allowedPaths: ['content'],
      urls: ['docs.example.com'],
      check: { at, repo: 'ok', branch: 'missing', runner: 'online' },
      lastPr: null,
    },
  ],
};
const calls = (name: string) =>
  action.mock.calls
    .filter(([, a]) => a === name)
    .map(([, , init]) => init.body);
beforeEach(() => {
  access.actions = [
    'nrAgent.saveRepo',
    'nrAgent.removeRepo',
    'nrAgent.checkRepo',
  ];
  authorization.can.mockReset();
  authorization.can.mockImplementation(
    async ({
      resource,
      action,
    }: {
      resource: { id: string };
      action: string;
    }) => resource.id === '1' && access.actions.includes(action),
  );
  action.mockReset();
  action.mockResolvedValue(list);
  confirm.mockClear();
});
function mount() {
  return render(
    <MemoryRouter>
      <RepoConnect projectId={1} onChange={() => {}} />
    </MemoryRouter>,
  );
}
const card = async (name: string) =>
  (await screen.findByRole('link', { name })).closest(
    '[data-repo]',
  ) as HTMLElement;

test('a card per repository says whether it can be written, what it serves and its latest PR', async () => {
  mount();
  const site = within(await card('team/site'));
  expect(site.getByText('可以写入')).toBeInTheDocument();
  expect(site.getByText('www.example.com')).toBeInTheDocument();
  expect(site.getByText('main · 整个仓库')).toBeInTheDocument();
  expect(
    site.getByText(/仓库和分支都在，Runner 在线，推送正常/),
  ).toBeInTheDocument();
  expect(
    site.getByRole('link', { name: '#188 Rewrite the pricing title' }),
  ).toHaveAttribute('href', 'https://github.com/team/site/pull/188');
  const docs = within(await card('team/docs'));
  expect(docs.getByText('有问题')).toBeInTheDocument();
  expect(docs.getByText(/仓库里没有 release 分支/)).toBeInTheDocument();
  expect(docs.getByText('release · 只改 content')).toBeInTheDocument();
  expect(docs.getByText('还没有')).toBeInTheDocument();
});

test('Check again checks that repository and shows the result', async () => {
  const user = userEvent.setup();
  mount();
  const docs = within(await card('team/docs'));
  action.mockResolvedValueOnce({
    ...list,
    repos: [
      list.repos[0],
      {
        ...list.repos[1],
        check: { at, repo: 'ok', branch: 'ok', runner: 'offline' },
      },
    ],
  });
  await user.click(docs.getByRole('button', { name: '重新检查' }));
  expect(calls('checkRepo')).toEqual([{ projectId: '1', id: 'docs' }]);
  expect(
    await docs.findByText(/现在没有在线的 Runner，还不能确认能否推送/),
  ).toBeInTheDocument();
  expect(docs.getByText('待确认')).toBeInTheDocument();
});

test('another repository takes an address from the one that has it, saying so first, then is checked', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(
    await screen.findByRole('button', { name: '接入另一个仓库' }),
  );
  const dialog = within(await screen.findByRole('dialog'));
  await user.type(dialog.getByRole('textbox', { name: '仓库链接' }), 'team/v3');
  await user.click(dialog.getByRole('button', { name: 'docs.example.com' }));
  expect(
    dialog.getByText('docs.example.com 现在归 team/docs，保存后改归这个仓库。'),
  ).toBeInTheDocument();
  // A path of its own, typed in.
  await user.click(dialog.getByRole('button', { name: '其他网址或路径' }));
  await user.type(
    dialog.getByRole('textbox', { name: '其他网址或路径' }),
    'https://www.example.com/v3/{Enter}',
  );
  expect(
    dialog.getByRole('button', { name: 'www.example.com/v3' }),
  ).toHaveAttribute('aria-pressed', 'true');
  const saved = {
    ...list,
    revision: 4,
    repos: [...list.repos, { ...list.repos[1], id: 'v3', repo: 'team/v3' }],
  };
  action.mockResolvedValueOnce(saved).mockResolvedValueOnce(saved);
  await user.click(dialog.getByRole('button', { name: '保存并检查' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(calls('saveRepo')).toEqual([
    {
      projectId: '1',
      revision: 3,
      repo: 'team/v3',
      baseBranch: 'main',
      urls: ['docs.example.com', 'www.example.com/v3'],
      allowedPaths: [],
    },
  ]);
  expect(calls('checkRepo')).toEqual([{ projectId: '1', id: 'v3' }]);
});

test('a refused save keeps the dialog and what was typed', async () => {
  const user = userEvent.setup();
  mount();
  const docs = within(await card('team/docs'));
  await user.click(docs.getByRole('button', { name: '编辑' }));
  const dialog = within(await screen.findByRole('dialog'));
  expect(dialog.getByRole('textbox', { name: '仓库链接' })).toHaveValue(
    'team/docs',
  );
  expect(
    dialog.getByRole('textbox', {
      name: '允许修改的目录（逗号分隔，留空为整个仓库）',
    }),
  ).toHaveValue('content');
  const branch = dialog.getByRole('textbox', { name: '基础分支' });
  await user.clear(branch);
  await user.type(branch, 'main');
  action.mockRejectedValueOnce(new NocoReachHttpError('设置已更新', 409, {}));
  await user.click(dialog.getByRole('button', { name: '保存并检查' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('设置已更新');
  expect(branch).toHaveValue('main');
  expect(calls('saveRepo')[0]).toMatchObject({
    id: 'docs',
    baseBranch: 'main',
  });
});

test('removing asks first, saying new tasks leave it and PRs stay', async () => {
  const user = userEvent.setup();
  mount();
  const docs = within(await card('team/docs'));
  await user.click(docs.getByRole('button', { name: '移除' }));
  expect(confirm).toHaveBeenCalledTimes(1);
  const ask = (
    confirm.mock.calls[0] as unknown as [
      { title: () => string; description: () => string },
    ]
  )[0];
  expect(ask.title()).toBe('移除仓库 team/docs？');
  expect(ask.description()).toBe(
    '新任务将无法修改此仓库，已经开的 PR 不受影响。',
  );
  await waitFor(() =>
    expect(calls('removeRepo')).toEqual([
      { projectId: '1', revision: 3, id: 'docs' },
    ]),
  );
});

test('without settings permission the cards are read-only', async () => {
  access.actions = [];
  mount();
  await card('team/site');
  expect(screen.queryByRole('button', { name: '编辑' })).toBeNull();
  expect(screen.queryByRole('button', { name: '移除' })).toBeNull();
  expect(screen.queryByRole('button', { name: '重新检查' })).toBeNull();
  expect(screen.queryByRole('button', { name: '接入另一个仓库' })).toBeNull();
});

test('a load failure offers a retry', async () => {
  action.mockRejectedValueOnce(new Error('offline'));
  const user = userEvent.setup();
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '读取网站源码设置失败',
  );
  await user.click(screen.getByRole('button', { name: '重试' }));
  expect(await card('team/site')).toBeInTheDocument();
});
