import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary, useNocoReachLocale } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import { RepoConnect } from '../../client/pages/repo-connect';
import { AgentMenu } from '../../client/pages/task-detail/agent-menu';
import type { TaskData } from '../../client/pages/task-execution-types';

const { action, authorization } = vi.hoisted(() => ({
  action: vi.fn(),
  authorization: { can: vi.fn(async () => true), invalidate: vi.fn() },
}));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<object>()),
  useAuthorizationClient: () => authorization,
  useAuthorizationRevision: () => 'test-revision',
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
const initial = {
  revision: 2,
  repo: { repo: 'team/site', baseBranch: 'main', allowedPaths: [] },
  options: [],
};
function RepoPage() {
  useNocoReachLocale();
  return <RepoConnect projectId={1} onChange={() => {}} />;
}
function switchLanguage(englishMode: boolean) {
  act(() => setDictionary(englishMode ? english : null));
}
beforeEach(() => {
  setDictionary(null);
  action.mockReset();
  action.mockResolvedValue(initial);
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});
test('official repository form keeps drafts while its load and save errors change language', async () => {
  const user = userEvent.setup();
  action.mockRejectedValueOnce(new Error('offline'));
  render(
    <MemoryRouter>
      <RepoPage />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '读取网站源码设置失败。',
  );
  switchLanguage(true);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Could not load repository settings.',
  );
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  const repository = await screen.findByRole('textbox', {
    name: 'Repository link',
  });
  await user.clear(repository);
  await user.type(repository, 'team/my-draft');
  action.mockRejectedValueOnce(new Error('offline'));
  await user.click(screen.getByRole('button', { name: 'Save repository' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The operation failed. Please retry.',
  );
  switchLanguage(false);
  expect(screen.getByRole('alert')).toHaveTextContent('操作未完成，请重试。');
  expect(repository).toHaveValue('team/my-draft');
  switchLanguage(true);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The operation failed. Please retry.',
  );
  expect(repository).toHaveValue('team/my-draft');
});
test("the task header's Agent menu keeps user-named Agents literal while its own copy changes language", async () => {
  const user = userEvent.setup();
  function Menu() {
    useNocoReachLocale();
    const [agentId, setAgentId] = useState<string | null>(null);
    const data = {
      work: { agentId },
      agent: {
        agentId,
        online: true,
        options: [
          { id: 'runner', name: '分析。任务。', type: 'runner', online: true },
          { id: 'other', name: 'Other', type: 'runner', online: false },
        ],
      },
    } as TaskData;
    return (
      <AgentMenu
        data={data}
        busy={false}
        onChange={async (next) => {
          setAgentId(next);
          return true;
        }}
      />
    );
  }
  render(
    <MemoryRouter>
      <Menu />
    </MemoryRouter>,
  );
  const trigger = () => screen.getByRole('button', { name: /^Agent ·/ });
  expect(trigger()).toHaveTextContent('未选择');
  await user.click(trigger());
  expect(
    await screen.findByRole('menuitemradio', { name: /Other.*不在线/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('menuitem', { name: '管理 Agent' }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('menuitemradio', { name: /分析。任务。/ }));
  expect(trigger()).toHaveTextContent('分析。任务。');
  switchLanguage(true);
  expect(trigger()).toHaveTextContent('分析。任务。');
  switchLanguage(false);
  expect(trigger()).toHaveTextContent('分析。任务。');
});
