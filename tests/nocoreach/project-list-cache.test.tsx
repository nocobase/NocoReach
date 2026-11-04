import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useProjects } from '../../client/pages/reach-data';
import { WorkspaceCacheProvider } from '../../client/pages/workspace-cache';

const auth = vi.hoisted(() => ({
  session: { user: { id: 'user' }, session: { id: 'session' } },
  isPending: false,
  revision: 0,
}));
const api = vi.hoisted(() => ({ action: vi.fn(), wrapRequests: vi.fn() }));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => auth,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => auth.revision,
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: api,
}));

function Projects() {
  const { projects, error } = useProjects();
  return <output>{error || projects?.[0]?.name || 'loading'}</output>;
}
function setup() {
  const tree = (count: number) => (
    <WorkspaceCacheProvider>
      {Array.from({ length: count }, (_, i) => (
        <Projects key={i} />
      ))}
    </WorkspaceCacheProvider>
  );
  const view = render(tree(1));
  return (count: number) => view.rerender(tree(count));
}
beforeEach(() => {
  sessionStorage.clear();
  auth.revision = 0;
  api.action.mockReset().mockResolvedValue([{ id: 1, name: 'Project' }]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('reuses a fresh list across staggered mounts and refreshes all readers after a save', async () => {
  const show = setup();
  await screen.findByText('Project');
  show(3);
  await act(async () => {});
  expect(api.action).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText('Project')).toHaveLength(3);
  api.action.mockResolvedValue([{ id: 1, name: 'Updated' }]);
  await act(async () => window.dispatchEvent(new Event('reach-project-saved')));
  expect(api.action).toHaveBeenCalledTimes(2);
  expect(screen.getAllByText('Updated')).toHaveLength(3);
});

it('revalidates expired lists and never reuses them across authorization revisions', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(100_000);
  const show = setup();
  await screen.findByText('Project');
  show(0);
  clock.mockReturnValue(131_000);
  api.action.mockResolvedValue([{ id: 1, name: 'After expiry' }]);
  show(1);
  await screen.findByText('After expiry');
  expect(api.action).toHaveBeenCalledTimes(2);
  auth.revision += 1;
  api.action.mockResolvedValue([{ id: 2, name: 'New access' }]);
  show(1);
  expect(screen.queryByText('After expiry')).toBeNull();
  await screen.findByText('New access');
  expect(api.action).toHaveBeenCalledTimes(3);
});
