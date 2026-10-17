import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ProjectKnowledgePage from '../../client/pages/project-knowledge';

const { action, access } = vi.hoisted(() => ({
  action: vi.fn(),
  access: { actions: ['nrMemory.draft', 'nrMemory.check', 'nrMemory.seen'] },
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action },
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: (action: string, projectId: number) => ({
    can: projectId === 2 && access.actions.includes(action),
  }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 2, name: 'Example' } }),
  useUnsavedWarning: vi.fn(),
}));

const status = {
  running: null,
  aiReady: true,
  draft: {
    status: 'failed',
    at: '2026-10-12T00:00:00Z',
    error: 'Draft failed',
    seen: false,
  },
  lastCheck: null,
  suggestions: [],
};
beforeEach(() => {
  access.actions = ['nrMemory.draft', 'nrMemory.check', 'nrMemory.seen'];
  action.mockReset();
  action.mockImplementation(async (resource: string) =>
    resource === 'nrMemory' ? status : { items: [] },
  );
});
afterEach(cleanup);

test('seen permission can acknowledge a failed draft without granting draft or check', async () => {
  access.actions = ['nrMemory.seen'];
  const user = userEvent.setup();
  render(<ProjectKnowledgePage />);
  const seen = await screen.findByRole('button', { name: '知道了' });
  expect(
    screen.queryByRole('button', { name: '重试' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: '立即检查' }),
  ).not.toBeInTheDocument();
  expect(seen).toBeEnabled();
  await user.click(seen);
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith('nrMemory', 'seen', {
      method: 'POST',
      body: { projectId: '2' },
      unwrap: 'data',
    }),
  );
  expect(
    action.mock.calls.filter(
      ([resource, operation]) =>
        resource === 'nrMemory' && ['draft', 'check'].includes(operation),
    ),
  ).toEqual([]);
});

test.each([
  ['重试', 'draft'],
  ['立即检查', 'check'],
])(
  'a custom role can use %s with only its %s permission',
  async (label, operation) => {
    access.actions = [`nrMemory.${operation}`];
    const user = userEvent.setup();
    render(<ProjectKnowledgePage />);
    const button = await screen.findByRole('button', { name: label });
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith('nrMemory', operation, {
        method: 'POST',
        body: { projectId: '2' },
        unwrap: 'data',
      }),
    );
  },
);
