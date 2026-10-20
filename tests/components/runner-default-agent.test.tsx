import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import RunnerAgents from '../../client/pages/agents/runner';
const state = vi.hoisted(() => ({
  action: vi.fn(),
  canSave: true,
  project: { id: 1, name: 'Example' },
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action: state.action },
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: state.project }),
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: (action: string, projectId: number) => ({
    can:
      state.canSave &&
      action === 'nrAgent.saveDefault' &&
      projectId === state.project.id,
  }),
}));
vi.mock('../../client/pages/agents/index', () => ({
  AgentsPageLayout: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@nocobase/app-plugin-agents/client/kit', () => ({
  RunnerAgentsSection: () => <p>Runner list</p>,
}));
beforeEach(() => {
  state.canSave = true;
  state.project = { id: 1, name: 'Example' };
  state.action.mockReset();
  state.action.mockResolvedValue({
    revision: 2,
    agentId: null,
    options: [{ id: 'codex', name: 'Codex' }],
  });
});

test('saves and clears the project default using its revision', async () => {
  const user = userEvent.setup();
  render(<RunnerAgents />);
  expect(await screen.findByText(/Example.*未单独指定/)).toBeInTheDocument();
  const select = await screen.findByRole('combobox', {
    name: '项目默认 Agent',
  });
  state.action.mockResolvedValueOnce({ revision: 3, agentId: 'codex' });
  await user.click(select);
  await user.click(await screen.findByRole('option', { name: 'Codex' }));
  await screen.findByText('默认 Agent 已保存');
  expect(state.action).toHaveBeenLastCalledWith('nrAgent', 'saveDefault', {
    method: 'POST',
    body: { projectId: '1', revision: 2, agentId: 'codex' },
  });
  state.action.mockResolvedValueOnce({ revision: 4, agentId: null });
  await user.click(select);
  await user.click(
    await screen.findByRole('option', { name: '不设置默认 Agent' }),
  );
  await waitFor(() => expect(select).toHaveTextContent('不设置默认 Agent'));
  expect(state.action).toHaveBeenLastCalledWith('nrAgent', 'saveDefault', {
    method: 'POST',
    body: { projectId: '1', revision: 3, agentId: null },
  });
});

test('readers without saveDefault cannot change the project default', async () => {
  state.canSave = false;
  render(<RunnerAgents />);
  expect(await screen.findByRole('combobox')).toBeDisabled();
});

test('a failed save shows an error and reloads the current revision', async () => {
  const user = userEvent.setup();
  render(<RunnerAgents />);
  const select = await screen.findByRole('combobox');
  state.action
    .mockRejectedValueOnce(new Error('Conflict'))
    .mockResolvedValueOnce({
      revision: 3,
      agentId: null,
      options: [{ id: 'codex', name: 'Codex' }],
    });
  await user.click(select);
  await user.click(await screen.findByRole('option', { name: 'Codex' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Conflict');
  await waitFor(() => expect(state.action).toHaveBeenCalledTimes(3));
  expect(select).toHaveTextContent('不设置默认 Agent');
});

test('switching projects discards a late response for the previous project', async () => {
  let resolve!: (value: unknown) => void;
  state.action.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const { rerender } = render(<RunnerAgents />);
  state.project = { id: 2, name: 'Second' };
  rerender(<RunnerAgents />);
  await screen.findByRole('combobox');
  resolve({
    revision: 99,
    agentId: 'old',
    options: [{ id: 'old', name: 'Old project agent' }],
  });
  await waitFor(() =>
    expect(screen.getByRole('combobox')).toHaveTextContent('不设置默认 Agent'),
  );
  expect(screen.queryByText('Old project agent')).not.toBeInTheDocument();
});
