import type {
  AppClientRegisteredRoute,
  AppClientRouteComponentModule,
} from '@nocobase/app-client/plugins';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClientRoute } from '../../client/routing/client-route';
import { WorkspaceCacheProvider } from '../../client/pages/workspace-cache';
import {
  tasksQuery,
  useWorkspaceQuery,
} from '../../client/pages/workspace-queries';
import OptimizationWork from '../../client/pages/optimization-work';
import { NocoReachHttpError } from '../../client/lib/nocoreach-api';
import { $t } from '../../client/i18n';
import type { TaskData } from '../../client/pages/task-execution-types';

const fixture = vi.hoisted(() => ({
  action: vi.fn(),
  allowed: true,
  pending: false,
  role: 'member' as string | null,
  projectId: 1 as number | undefined,
  projectError: '',
  revision: 0,
  session: { user: { id: 'tester' }, session: { id: 'session-a' } },
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ session: fixture.session, isPending: false }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => fixture.revision,
  useCan: () => ({ can: fixture.allowed, isPending: fixture.pending }),
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action: fixture.action },
}));
vi.mock('../../client/pages/me', async () => ({
  taskOwner: (await import('../../shared/task-pending')).taskOwner,
  useMe: () => ({
    me: { id: 'tester', role: fixture.role },
    mine: () => true,
    can: () => true,
    isAdmin: false,
  }),
}));
vi.mock('../../client/pages/reach-data', async (original) => ({
  ...(await original<typeof import('../../client/pages/reach-data')>()),
  useProject: () => ({
    project: fixture.projectId ? { id: fixture.projectId } : undefined,
    error: fixture.projectError,
  }),
}));

type Task = {
  id: number;
  title: string;
  brief: string;
  status: string;
  updatedAt: string;
};
const task: Task = {
  id: 1,
  title: 'Shared project task',
  brief: '',
  status: 'todo',
  updatedAt: '2026-10-19',
};
function TaskProbe() {
  const view = useWorkspaceQuery(tasksQuery<Task>(fixture.projectId!));
  return (
    <p>
      {view.error
        ? 'Read failed'
        : (view.data?.[0]?.title ?? 'Waiting for tasks')}
    </p>
  );
}
const pendingModules: Array<() => void> = [];
function route(name = 'action-center') {
  const module = Promise.withResolvers<AppClientRouteComponentModule>();
  pendingModules.push(() => module.resolve({ default: () => null }));
  const value: AppClientRegisteredRoute = {
    id: name,
    name,
    path: '/actions',
    auth: 'required',
    authz: { resource: { type: 'page', id: name }, action: 'access' },
    packageName: 'nocoreach',
    source: 'application',
    componentLoader: vi.fn(() => module.promise),
  };
  return { value, module };
}
function setup(initial: AppClientRegisteredRoute) {
  let selected = initial;
  const tree = () => (
    <MemoryRouter>
      <WorkspaceCacheProvider>
        <ClientRoute key={selected.id} route={selected} />
      </WorkspaceCacheProvider>
    </MemoryRouter>
  );
  const view = render(tree());
  return {
    ...view,
    update: (next = selected) => {
      selected = next;
      view.rerender(tree());
    },
  };
}
const listReads = () =>
  fixture.action.mock.calls.filter(
    ([r, a]) => r === 'nrTaskWork' && a === 'list',
  );
beforeEach(() => {
  sessionStorage.clear();
  Object.assign(fixture, {
    allowed: true,
    pending: false,
    role: 'member',
    projectId: 1,
    projectError: '',
    revision: 0,
    session: { user: { id: 'tester' }, session: { id: 'session-a' } },
  });
  fixture.action
    .mockReset()
    .mockImplementation(async (resource: string, action: string) => {
      if (resource === 'nrTaskWork' && action === 'list') return [task];
      if (resource === 'nrStrategy' && action === 'overview')
        return {
          state: { revision: 1, goal: null, proposals: [] },
          periodDays: 28,
          availableThrough: null,
        };
      if (resource === 'nrStrategy' && action === 'state')
        return { revision: 1, goal: null, proposals: [] };
      if (resource === 'nrInsights') return { areas: [] };
      if (resource === 'nrDataViews') return { cards: [] };
      if (resource === 'nrPlaybooks') return { revision: 1, playbooks: [] };
      return [];
    });
});
afterEach(async () => {
  cleanup();
  await act(async () => {
    pendingModules.splice(0).forEach((finish) => finish());
  });
  vi.restoreAllMocks();
});

it('starts data while the route module is pending and hands a completed read to the page once', async () => {
  const target = route();
  setup(target.value);
  await waitFor(() => expect(listReads()).toHaveLength(1));
  expect(screen.queryByText(task.title)).toBeNull();
  await act(async () => target.module.resolve({ default: TaskProbe }));
  expect(await screen.findByText(task.title)).toBeVisible();
  expect(listReads()).toHaveLength(1);
});

it.each(['growth-overview', 'opportunity-library'])(
  'reuses %s task data on the first visit to the real Tasks page and refreshes stale data without blanking it',
  async (name) => {
    const initial = route(name);
    const view = setup(initial.value);
    await waitFor(() => expect(listReads()).toHaveLength(1));
    if (name === 'opportunity-library')
      expect(
        fixture.action.mock.calls.some(
          ([resource, action]) =>
            resource === 'nrTaskWork' && action === 'members',
        ),
      ).toBe(false);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1001);
    const pending = Promise.withResolvers<Task[]>();
    fixture.action.mockImplementationOnce(() => pending.promise);
    const target = route();
    await act(async () => target.module.resolve({ default: OptimizationWork }));
    view.update(target.value);
    expect(await screen.findByText(task.title)).toBeVisible();
    await waitFor(() => expect(listReads()).toHaveLength(2));
    await act(async () =>
      pending.resolve([{ ...task, title: 'Updated task' }]),
    );
    expect(await screen.findByText('Updated task')).toBeVisible();
    expect(screen.queryByText(task.title)).toBeNull();
    expect(
      Object.keys(sessionStorage).some((key) => key.includes('project-tasks:')),
    ).toBe(false);
  },
);

it.each([
  'pending',
  'denied',
  'membership',
  'project',
  'project-error',
  'plugin',
])(
  'does not read business data before the %s boundary is satisfied',
  async (boundary) => {
    const target = route();
    if (boundary === 'pending') fixture.pending = true;
    if (boundary === 'denied') fixture.allowed = false;
    if (boundary === 'membership') fixture.role = null;
    if (boundary === 'project') fixture.projectId = undefined;
    if (boundary === 'project-error') fixture.projectError = 'Unavailable';
    setup(
      boundary === 'plugin'
        ? { ...target.value, source: 'plugin', packageName: 'another-package' }
        : target.value,
    );
    await act(async () => {});
    expect(fixture.action).not.toHaveBeenCalled();
    if (boundary === 'pending' || boundary === 'denied')
      expect(target.value.componentLoader).not.toHaveBeenCalled();
  },
);

it.each(['project', 'session', 'permission'])(
  'isolates late navigation reads after changing %s',
  async (boundary) => {
    const old = Promise.withResolvers<Task[]>();
    fixture.action.mockReturnValueOnce(old.promise);
    const target = route();
    const view = setup(target.value);
    await waitFor(() => expect(listReads()).toHaveLength(1));
    await act(async () => target.module.resolve({ default: TaskProbe }));
    if (boundary === 'project') fixture.projectId = 2;
    if (boundary === 'session')
      fixture.session = { user: { id: 'other' }, session: { id: 'session-b' } };
    if (boundary === 'permission') fixture.revision++;
    fixture.action.mockResolvedValue([{ ...task, title: 'Current scope' }]);
    view.update();
    expect(await screen.findByText('Current scope')).toBeVisible();
    await act(async () => old.resolve([{ ...task, title: 'Old scope' }]));
    expect(screen.queryByText('Old scope')).toBeNull();
    expect(screen.getByText('Current scope')).toBeVisible();
  },
);

it('fences a pending read on mutation and shares the refreshed tasks with the next page', async () => {
  const old = Promise.withResolvers<Task[]>();
  fixture.action.mockReturnValueOnce(old.promise);
  const target = route();
  const view = setup(target.value);
  await act(async () => target.module.resolve({ default: TaskProbe }));
  await waitFor(() => expect(listReads()).toHaveLength(1));
  await act(async () => window.dispatchEvent(new Event('nocoreach:badges')));
  expect(await screen.findByText(task.title)).toBeVisible();
  await act(async () => old.resolve([{ ...task, title: 'Obsolete task' }]));
  expect(screen.queryByText('Obsolete task')).toBeNull();
  const next = route('opportunity-library');
  await act(async () => next.module.resolve({ default: TaskProbe }));
  view.update(next.value);
  expect(await screen.findByText(task.title)).toBeVisible();
  expect(listReads()).toHaveLength(2);
});

it('does not retain unavailable task data after a forbidden revalidation', async () => {
  const target = route();
  const view = setup(target.value);
  await act(async () => target.module.resolve({ default: TaskProbe }));
  await screen.findByText(task.title);
  fixture.action.mockRejectedValue(
    new NocoReachHttpError('Forbidden', 403, {}),
  );
  await act(async () => window.dispatchEvent(new Event('nocoreach:badges')));
  await screen.findByText('Read failed');
  const next = route();
  await act(async () => next.module.resolve({ default: OptimizationWork }));
  view.update({ ...next.value, id: 'next-tasks' });
  expect(screen.queryByText(task.title)).toBeNull();
});

it('keeps newly refreshed tasks when an older task action finishes', async () => {
  const mutation = Promise.withResolvers<TaskData>();
  const revalidation = Promise.withResolvers<Task[]>();
  let rows = [task];
  let delayRead = false;
  fixture.action.mockImplementation(
    async (_resource: string, action: string) => {
      if (action === 'advance') return mutation.promise;
      return delayRead ? revalidation.promise : rows;
    },
  );
  const target = route();
  setup(target.value);
  await act(async () => target.module.resolve({ default: OptimizationWork }));
  await screen.findByText(task.title);
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', {
      name: $t('common.moreActions', { 0: task.title }),
    }),
  );
  await user.click(
    await screen.findByRole('menuitem', { name: $t('common.closeTask') }),
  );
  await waitFor(() =>
    expect(
      fixture.action.mock.calls.some(([, action]) => action === 'advance'),
    ).toBe(true),
  );
  rows = [task, { ...task, id: 2, title: 'Task added while saving' }];
  await act(async () => window.dispatchEvent(new Event('nocoreach:badges')));
  await screen.findByText('Task added while saving');
  delayRead = true;
  await act(async () =>
    mutation.resolve({
      task,
      work: {
        revision: 2,
        stage: 'plan',
        plan: null,
        planVersion: 0,
        step: 0,
        results: [],
        history: [],
        archivedAt: '2026-10-19',
      },
      runs: [],
      artifacts: [],
      reviews: [],
    }),
  );
  expect(screen.getByText('Task added while saving')).toBeVisible();
  expect(screen.queryByText(task.title)).toBeNull();
});
