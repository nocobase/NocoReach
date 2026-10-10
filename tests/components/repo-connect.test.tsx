import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { NocoReachHttpError } from '../../client/lib/nocoreach-api';
import { RepoConnect } from '../../client/pages/repo-connect';
const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/lib/nocoreach-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action },
}));
const initial = {
  revision: 2,
  agentId: 'agent',
  repo: { repo: 'team/site', baseBranch: 'main', allowedPaths: [] },
  online: true,
  options: [{ id: 'agent', name: 'Team agent' }],
};
beforeEach(() => {
  action.mockReset();
  action.mockResolvedValue(initial);
});
function mount() {
  return render(
    <MemoryRouter>
      <RepoConnect projectId={1} onChange={() => {}} />
    </MemoryRouter>,
  );
}
test('saves the entered repository and current revision, preserving typed input after a conflict', async () => {
  const user = userEvent.setup();
  mount();
  const repo = await screen.findByRole('textbox', { name: '仓库链接' });
  await user.clear(repo);
  await user.type(repo, 'team/new-site');
  action.mockRejectedValueOnce(new NocoReachHttpError('设置已更新', 409, {}));
  await user.type(repo, '{Enter}');
  expect(await screen.findByRole('alert')).toHaveTextContent('设置已更新');
  expect(repo).toHaveValue('team/new-site');
  expect(action).toHaveBeenCalledWith(
    'nrAgent',
    'saveRepo',
    expect.objectContaining({
      body: expect.objectContaining({
        projectId: '1',
        revision: 2,
        repo: 'team/new-site',
      }),
    }),
  );
});
test('load failures offer retry and project defaults link to the dedicated AI page', async () => {
  action.mockRejectedValueOnce(new Error('offline'));
  const user = userEvent.setup();
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '读取网站源码设置失败',
  );
  action.mockResolvedValue({ ...initial, options: [] });
  await user.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByRole('link', { name: '项目 AI' })).toHaveAttribute(
    'href',
    '/project-ai',
  );
  expect(
    screen.queryByRole('button', { name: '保存 Agent' }),
  ).not.toBeInTheDocument();
});

test.each([401, 403, 404])(
  'does not offer retry for status %s',
  async (status) => {
    action.mockRejectedValueOnce(
      new NocoReachHttpError('无权读取', status, {}),
    );
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('无权读取');
    expect(
      screen.queryByRole('button', { name: '重试' }),
    ).not.toBeInTheDocument();
  },
);

test('shows translated validation errors next to the field and preserves input', async () => {
  const user = userEvent.setup();
  mount();
  const repo = await screen.findByRole('textbox', { name: '仓库链接' });
  await user.clear(repo);
  await user.type(repo, 'invalid');
  action.mockRejectedValueOnce(
    new NocoReachHttpError('Enter a GitHub repository URL', 400, {}),
  );
  await user.type(repo, '{Enter}');
  await waitFor(() => expect(repo).toHaveAttribute('aria-invalid', 'true'));
  expect(repo).toHaveValue('invalid');
  expect(repo).toHaveAccessibleDescription('Enter a GitHub repository URL');
});
