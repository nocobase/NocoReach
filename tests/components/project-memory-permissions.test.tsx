import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ProjectKnowledgePage from '../../client/pages/project-knowledge';

const { action, access } = vi.hoisted(() => ({
  action: vi.fn(),
  access: { admin: true },
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action },
}));
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ isAdmin: access.admin }),
  AdminOnlyNote: () => null,
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
  access.admin = true;
  action.mockReset();
  action.mockImplementation(async (resource: string) =>
    resource === 'nrMemory' ? status : { items: [] },
  );
});
afterEach(cleanup);

test('members cannot retry or check memory updates but can acknowledge a failed draft', async () => {
  access.admin = false;
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
])('administrators can use %s to run %s', async (label, operation) => {
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
});
