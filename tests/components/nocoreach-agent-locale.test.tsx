import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary, useNocoReachLocale } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import { RepoConnect } from '../../client/pages/repo-connect';
import { TaskAgentField } from '../../client/pages/task-detail/agent-field';
import type { TaskData } from '../../client/pages/task-execution-types';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
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
test('official task agent picker preserves user names and selection while saved notice changes language', async () => {
  const user = userEvent.setup();
  function Field() {
    useNocoReachLocale();
    const [agentId, setAgentId] = useState<string | null>(null);
    const data = {
      work: { agentId },
      agent: {
        agentId,
        online: true,
        options: [{ id: 'runner', name: '分析。任务。', type: 'runner' }],
      },
    } as TaskData;
    return (
      <TaskAgentField
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
      <Field />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('combobox'));
  // Select opens on an animation frame, after the trigger click has completed.
  await user.click(await screen.findByRole('option', { name: '分析。任务。' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    '执行 Agent 已保存',
  );
  switchLanguage(true);
  expect(screen.getByRole('status')).toHaveTextContent('Execution agent saved');
  expect(screen.getByRole('combobox')).toHaveTextContent('分析。任务。');
  switchLanguage(false);
  expect(screen.getByRole('status')).toHaveTextContent('执行 Agent 已保存');
  expect(screen.getByRole('combobox')).toHaveTextContent('分析。任务。');
});
