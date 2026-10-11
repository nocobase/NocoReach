import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NocoReachHttpError } from '../../client/lib/nocoreach-api';
import { ProjectAISettings } from '../../client/pages/project-ai';
const { action, access } = vi.hoisted(() => ({
  action: vi.fn(),
  access: { admin: true, can: true },
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action },
}));
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ isAdmin: access.admin }),
  AdminOnlyNote: () => null,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({ can: access.can }),
}));
vi.mock('../../client/lib/toast', () => ({ toast: { success: vi.fn() } }));
const initial = {
  revision: 2,
  agentId: 'runner',
  repo: null,
  online: false,
  options: [
    { id: 'runner', name: 'Runner', type: 'runner', online: false },
    { id: 'online', name: 'Research', type: 'online', online: true },
  ],
};
beforeEach(() => {
  action.mockReset();
  action.mockResolvedValue(initial);
  access.admin = true;
  access.can = true;
});
afterEach(cleanup);
const mount = () =>
  render(
    <MemoryRouter>
      <ProjectAISettings projectId={2} projectName='Example' />
    </MemoryRouter>,
  );
test('saves an online project default and uses the returned revision', async () => {
  const user = userEvent.setup();
  mount();
  const picker = await screen.findByRole('combobox');
  expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  await user.click(picker);
  await user.click(
    await screen.findByRole('option', { name: 'Research · 在线 Agent · 就绪' }),
  );
  action.mockResolvedValueOnce({ ...initial, revision: 3, agentId: 'online' });
  await user.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled(),
  );
  expect(action).toHaveBeenCalledWith(
    'nrAgent',
    'select',
    expect.objectContaining({
      body: { projectId: '2', revision: 2, agentId: 'online' },
    }),
  );
});
test('keeps selection after a conflict until an explicit reload', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole('combobox'));
  await user.click(
    await screen.findByRole('option', { name: 'Research · 在线 Agent · 就绪' }),
  );
  action.mockRejectedValueOnce(new NocoReachHttpError('Conflict', 409, {}));
  await user.click(screen.getByRole('button', { name: '保存' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('你的选择已保留');
  expect(screen.getByRole('combobox')).toHaveTextContent('Research');
  expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '重新加载' }));
  await waitFor(() =>
    expect(screen.getByRole('combobox')).toHaveTextContent('Runner'),
  );
});
test('members see a disabled default and no save or unauthorized management links', async () => {
  access.admin = false;
  access.can = false;
  mount();
  expect(await screen.findByRole('combobox')).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: '保存' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
test.each([401, 403, 404])(
  'a permanent load error %s does not offer a retry',
  async (status) => {
    action.mockRejectedValueOnce(
      new NocoReachHttpError('internal details', status, {}),
    );
    mount();
    expect(await screen.findByRole('alert')).not.toHaveTextContent(
      'internal details',
    );
    expect(
      screen.queryByRole('button', { name: '重新加载' }),
    ).not.toBeInTheDocument();
  },
);

test.each([401, 403, 404])(
  'a permanent save error %s prevents resubmitting stale configuration',
  async (status) => {
    const user = userEvent.setup();
    mount();
    expect(await screen.findByRole('combobox')).toHaveTextContent(
      '等待可用 Runner',
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(
      await screen.findByRole('option', {
        name: 'Research · 在线 Agent · 就绪',
      }),
    );
    action.mockRejectedValueOnce(
      new NocoReachHttpError('internal details', status, {}),
    );
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).not.toHaveTextContent(
      'internal details',
    );
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    if (status === 404)
      expect(screen.getByRole('link', { name: '返回项目' })).toHaveAttribute(
        'href',
        '/home',
      );
    if (status === 401)
      expect(screen.getByRole('link', { name: '重新登录' })).toHaveAttribute(
        'href',
        '/login',
      );
  },
);
