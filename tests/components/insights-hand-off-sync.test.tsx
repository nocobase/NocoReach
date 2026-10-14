import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import StrategyPage from '../../client/pages/strategy/index';
import {
  NavBadgeProvider,
  useNavBadge,
} from '../../client/components/app-shell/nav-badges';
import type { StrategyState } from '../../shared/strategy-model';
import type { PendingTask } from '../../shared/task-pending';
import { insightPending } from '../../shared/strategy-pending';
import { WorkspaceCacheProvider } from '../../client/pages/workspace-cache';
const fixture = vi.hoisted(() => ({
  action: vi.fn(),
  project: { id: 1 },
  failReload: false,
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action: fixture.action },
}));
vi.mock('../../client/pages/reach-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../client/pages/reach-data')>()),
  useProject: () => ({ project: fixture.project }),
}));
vi.mock('../../client/pages/me', async () => ({
  useMe: () => ({
    me: { id: 'u', role: 'member' },
    mine: (id?: string) => id === 'u',
  }),
  taskOwner: (await import('../../shared/task-pending')).taskOwner,
}));
vi.mock('../../client/i18n', async () => ({
  useMessageState: (await import('react')).useState,
  $t: (key: string) => key,
  $tj: (key: string) => key,
  $legacyText: (text: string) => text,
  getCurrentLocale: () => 'en-US',
  translateSystemError: (text: string) => text,
  renderMessage: () => '',
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: 'u' }, session: { id: 'test-session' } },
    isPending: false,
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => 0,
  useCan: () => ({ can: true, isPending: false, error: null }),
}));
vi.mock('../../client/pages/data-health', () => ({ HealthAlert: () => null }));
vi.mock('../../client/pages/playbook-snapshot', () => ({
  localizeWorkSnapshots: (value: unknown) => value,
}));
vi.mock('../../client/pages/keyword-api', () => ({
  marketLabel: () => '',
  metric: () => '',
}));
vi.mock('../../client/components/seo/intent-badge', () => ({
  getIntentLabels: () => ({ unknown: '' }),
  toIntent: () => 'unknown',
}));
vi.mock('../../client/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));
vi.mock('../../client/components/ui/dialog', () => {
  const Box = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ children }: { children: ReactNode }) => (
      <div role='dialog'>{children}</div>
    ),
    DialogContent: Box,
    DialogDescription: Box,
    DialogFooter: Box,
    DialogHeader: Box,
    DialogTitle: Box,
  };
});
vi.mock('../../client/components/reach/page', () => ({
  PageContainer: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
  PageHeader: () => null,
}));
vi.mock('../../client/pages/strategy/hand-off', () => ({
  HandOffNotice: () => null,
  recommendedFor: () => undefined,
}));
// Keep the real page loader, handoff callback, draft creation and shared page predicates. The view probes make its
// task collection and waiting-strip inputs observable while keeping the user on the original route.
vi.mock('../../client/pages/strategy/insights-view', async () => {
  const { useState } = await import('react');
  const { DraftHandOffDialog } =
    await import('../../client/pages/keyword-hand-off');
  const { insightPending, signalDisposition } =
    await import('../../shared/strategy-pending');
  return {
    KpiCards: () => null,
    AreaList: () => null,
    Effects: () => null,
    WaitingStrip: ({ tasks }: { tasks: PendingTask[] }) => (
      <output>waiting:{tasks.length}</output>
    ),
    TodayChanges: ({
      state,
      tasks,
      projectId,
      onHandOff,
    }: {
      state: StrategyState;
      tasks: PendingTask[];
      projectId: number;
      onHandOff: (r: {
        ok: boolean;
        text: () => string;
        taskId?: number;
      }) => void;
    }) => {
      const [open, setOpen] = useState(false);
      const disposition = signalDisposition(
        { key: 'standalone' },
        state,
        tasks,
      );
      return (
        <>
          <output>
            page:{insightPending(state, tasks)}/{disposition.next}
          </output>
          <button
            disabled={disposition.next === 'task'}
            onClick={() => setOpen(true)}
          >
            Hand off standalone
          </button>
          {open ? (
            <DraftHandOffDialog
              projectId={projectId}
              draft={{
                title: 'Standalone',
                objective: 'Goal',
                brief: 'Evidence',
                signalKey: 'standalone',
              }}
              playbookId='optimize-page'
              onClose={() => setOpen(false)}
              onDone={(r) => {
                setOpen(false);
                onHandOff(r);
              }}
            />
          ) : null}
        </>
      );
    },
  };
});
const initial = (): StrategyState => ({
  revision: 1,
  goal: null,
  proposals: [],
  insights: {
    generatedAt: '2026-10-13',
    items: [],
    signalReviews: { standalone: { verdict: 'do', reason: '' } },
    evidence: {
      analysisVersion: 3,
      periodDays: 28,
      capturedAt: '',
      availableThrough: null,
      searchQueries: [],
      pages: [],
      industryCandidates: [],
      limitations: [],
      signals: {
        computedAt: '',
        coverage: {},
        missing: [],
        items: [
          {
            key: 'standalone',
            type: 'change',
            source: 'gsc',
            title: 'Standalone',
            facts: [],
            strength: 1,
            actionable: true,
            action: null,
          },
        ],
      },
    },
  },
});
function BadgeProbe() {
  const insights = useNavBadge('insights'),
    tasks = useNavBadge('tasks');
  return (
    <output>
      badge:{insights.count ?? 'unknown'}/{tasks.count ?? 'unknown'}
    </output>
  );
}
beforeEach(() => {
  fixture.action.mockReset();
  fixture.failReload = false;
  fixture.project = { id: 1 };
});
function setup() {
  let current = initial(),
    tasks: PendingTask[] = [];
  fixture.action.mockImplementation((resource: string, action: string) => {
    if (resource === 'nrHealth') return Promise.resolve({});
    if (resource === 'nrStrategy' && action === 'badges')
      return Promise.resolve({
        insights: insightPending(current, tasks),
        opportunities: 0,
        tasks: tasks.length,
      });
    if (resource === 'nrStrategy' && action === 'confirmDirection') {
      current = {
        ...current,
        revision: 2,
        proposals: [
          {
            id: 'new',
            title: 'Standalone',
            brief: '',
            status: '',
            goalVersion: null,
            evidence: current.insights!.evidence,
            signalKey: 'standalone',
            taskId: 99,
          },
        ],
      };
      tasks = [
        { id: 99, status: '待处理', evidence: { createdBy: { id: 'u' } } },
      ];
      return Promise.resolve(current);
    }
    if (resource === 'nrStrategy' && action === 'state')
      return Promise.resolve(current);
    if (resource === 'nrStrategy' && action === 'context')
      return Promise.resolve({ evidence: current.insights!.evidence });
    if (resource === 'nrTaskWork' && action === 'list')
      return fixture.failReload && tasks.length
        ? Promise.reject(new Error('read failed'))
        : Promise.resolve(tasks);
    if (resource === 'nrAnalysis')
      return Promise.resolve({ running: false, runs: [] });
    if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
    throw new Error(`Unexpected request ${resource}/${action}`);
  });
  const tree = () => (
    <MemoryRouter>
      <WorkspaceCacheProvider>
        <NavBadgeProvider>
          <BadgeProbe />
          <StrategyPage />
        </NavBadgeProvider>
      </WorkspaceCacheProvider>
    </MemoryRouter>
  );
  const view = render(tree());
  return { ...view, rerender: () => view.rerender(tree()) };
}
it('updates the original Insights page task collection and badge after an actual standalone draft handoff', async () => {
  setup();
  await screen.findByText('page:1/hand');
  await screen.findByText('badge:1/0');
  expect(screen.getByText('strategy.noWaitingTasks')).toBeTruthy();
  fireEvent.click(screen.getByText('Hand off standalone'));
  await screen.findByText('page:0/task');
  await screen.findByText('waiting:1');
  await screen.findByText('badge:0/1');
  expect(
    (screen.getByText('Hand off standalone') as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    fixture.action.mock.calls.filter(
      ([r, a]) => r === 'nrTaskWork' && a === 'list',
    ),
  ).toHaveLength(2);
});
it('keeps the last page data and exposes a read error if its post-handoff task reload fails', async () => {
  setup();
  await screen.findByText('page:1/hand');
  fixture.failReload = true;
  fireEvent.click(screen.getByText('Hand off standalone'));
  await screen.findByText('strategy.notLoadInsightsTryAgain');
  await screen.findByText('badge:0/1');
  expect(screen.getByText('page:1/hand')).toBeTruthy();
  expect(screen.getByText('strategy.noWaitingTasks')).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('does not let a pending task-block refresh overwrite the successful handoff snapshot', async () => {
  setup();
  await screen.findByText('page:1/hand');
  const old = Promise.withResolvers<PendingTask[]>();
  const original = fixture.action.getMockImplementation()!;
  let delayNextList = true;
  fixture.action.mockImplementation(
    (resource: string, action: string, ...args: unknown[]) => {
      if (resource === 'nrTaskWork' && action === 'list' && delayNextList) {
        delayNextList = false;
        return old.promise;
      }
      return original(resource, action, ...args);
    },
  );
  fireEvent.click(screen.getAllByText('strategy.refreshBlock')[0]);
  await waitFor(() => expect(delayNextList).toBe(false));
  fireEvent.click(screen.getByText('Hand off standalone'));
  await screen.findByText('page:0/task');
  await screen.findByText('waiting:1');
  await act(async () => {
    old.resolve([]);
    await old.promise;
  });
  expect(screen.getByText('page:0/task')).toBeTruthy();
  expect(screen.getByText('waiting:1')).toBeTruthy();
  expect(screen.queryByText('strategy.noWaitingTasks')).toBeNull();
});
it('ignores an old project handoff reload after switching to another project', async () => {
  const view = setup();
  await screen.findByText('page:1/hand');
  const old = Promise.withResolvers<PendingTask[]>();
  const original = fixture.action.getMockImplementation()!;
  fixture.action.mockImplementation(
    (
      resource: string,
      action: string,
      options: { body?: { projectId?: number | string } },
      ...args: unknown[]
    ) => {
      if (String(options?.body?.projectId) === '2') {
        if (resource === 'nrStrategy' && action === 'state')
          return Promise.resolve(initial());
        if (resource === 'nrTaskWork' && action === 'list')
          return Promise.resolve([]);
      }
      if (resource === 'nrTaskWork' && action === 'list') return old.promise;
      return original(resource, action, options, ...args);
    },
  );
  fireEvent.click(screen.getByText('Hand off standalone'));
  await screen.findByText('badge:0/1');
  fixture.project = { id: 2 };
  view.rerender();
  await screen.findByText('page:1/hand');
  await act(async () => {
    old.resolve([
      { id: 99, status: 'todo', evidence: { createdBy: { id: 'u' } } },
    ]);
    await old.promise;
  });
  expect(screen.getByText('page:1/hand')).toBeTruthy();
  expect(screen.getByText('strategy.noWaitingTasks')).toBeTruthy();
  expect(screen.queryByText('waiting:1')).toBeNull();
});
