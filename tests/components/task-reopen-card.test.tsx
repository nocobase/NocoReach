import { NavigationGuardProvider } from '@nocobase/app-client';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { $t, setDictionary } from '../../client/i18n';
import { TaskDraftProvider } from '../../client/pages/task-detail/drafts';
import { TaskDetail } from '../../client/pages/task-detail';
import type { TaskData } from '../../client/pages/task-execution-types';
import { stepOf } from '../../client/pages/task-list-model';
import english from '../../shared/i18n/en.json';

// The closed card says where Reopen takes the task, for every closed task, and a reopened Agent step that the closing
// stopped waits for Start this step again (2026-10-29 user decision).

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/lib/nocoreach-api', async (original) => {
  const module =
    await original<typeof import('../../client/lib/nocoreach-api')>();
  return {
    ...module,
    nocobaseClient: { ...module.nocobaseClient, action, wrapRequests: vi.fn() },
  };
});
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: '1' }, can: () => true }),
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
}));

const CLOSED = '2026-10-29T14:51:19.087Z';
const stages = [
  { key: 'build', name: 'Change', kind: 'agent', mode: 'change' },
  { key: 'review', name: 'Review', kind: 'review' },
  { key: 'release', name: 'Publish', kind: 'release' },
  { key: 'observe', name: 'Watch', kind: 'observe' },
];
const delivered = {
  id: 'artifact-1',
  stepId: 'build',
  planVersion: 0,
  version: 1,
  content: 'Changed the title',
  createdAt: '2026-10-28T12:10:00Z',
  createdBy: 'agent',
};
function data(work: object, runs: object[] = []): TaskData {
  return {
    task: {
      id: 51,
      title: 'Rewrite the pricing title',
      brief: '',
      evidence: { no: 51 },
    },
    work: {
      revision: 3,
      stage: 'flow',
      plan: null,
      planVersion: 0,
      step: 0,
      stageIndex: 1,
      humanOwnerId: '1',
      humanOwnerName: 'Super Admin',
      playbook: {
        id: 'optimize-page',
        name: 'Optimize page',
        kind: 'build',
        version: 1,
        next: [],
      },
      flow: { id: 'optimize-page', name: 'Optimize page', version: 1, stages },
      results: [delivered],
      history: [
        { at: '2026-10-28T12:00:00Z', actor: '1', action: 'startTask' },
      ],
      ...work,
    },
    runs,
    artifacts: [],
    reviews: [],
    agent: {
      repo: { repo: 'nocobase/site', baseBranch: 'main' },
      online: true,
      agentId: 'codex',
      options: [{ id: 'codex', name: 'codex' }],
    },
  } as unknown as TaskData;
}
const stoppedRun = {
  id: 'run-1',
  stepId: 'build',
  planVersion: 0,
  status: 'failed',
  error: 'cancelled',
  mode: 'build',
  pluginRunId: 'p1',
  createdAt: '2026-10-29T14:40:00Z',
  endedAt: CLOSED,
};
beforeEach(() => {
  setDictionary(english, 'en-US');
  action.mockReset();
  action.mockImplementation((resource: string, command: string) => {
    if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
    if (command === 'members')
      return Promise.resolve([{ id: '1', name: 'Super Admin' }]);
    if (command === 'advance' || command === 'get')
      return Promise.resolve(current);
    return Promise.resolve([]);
  });
});
let current: TaskData;
afterEach(() => {
  cleanup();
  setDictionary(null);
});
function mount(d: TaskData) {
  current = d;
  return render(
    <MemoryRouter initialEntries={['/actions/51']}>
      <NavigationGuardProvider>
        <TaskDraftProvider>
          <TaskDetail projectId={1} taskId='51' initial={d} />
        </TaskDraftProvider>
      </NavigationGuardProvider>
    </MemoryRouter>,
  );
}
const card = () =>
  screen
    .getByText(
      $t('taskDetail.closedValue', {
        0: $t('taskExecution.stopped', { 0: 'Review' }),
      }),
    )
    .closest('section') ?? document.body;

test('closed at review: the card says Reopen returns to the review and offers it', async () => {
  const user = userEvent.setup();
  mount(data({ cancelledAt: CLOSED, cancelledBy: '1' }));
  expect(
    screen.getByText(
      new RegExp(
        $t('taskExecution.reopenToReview', { 0: 'Review' }).replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&',
        ),
      ),
    ),
  ).toBeVisible();
  expect(document.body).not.toHaveTextContent(
    /can't continue|opportunities page/,
  );
  action.mockImplementation((resource: string, command: string) => {
    if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
    if (command === 'members') return Promise.resolve([]);
    if (command === 'advance')
      return Promise.resolve(
        data({
          history: [
            {
              at: CLOSED,
              actor: '1',
              action: 'unarchiveTask',
              stageKey: 'review',
            },
          ],
        }),
      );
    return Promise.resolve([]);
  });
  await user.click(
    within(card()).getByRole('button', { name: $t('common.reopen') }),
  );
  const advance = action.mock.calls.find(
    ([, command]) => command === 'advance',
  );
  expect((advance?.[2] as { body: { command: string } }).body.command).toBe(
    'unarchiveTask',
  );
});

test('each kind of closed task says where Reopen takes it', () => {
  const cases: [object, object[], string][] = [
    [
      { stageIndex: 0, cancelledAt: CLOSED, results: [] },
      [stoppedRun],
      $t('taskExecution.reopenRestart', { 0: 'Change' }),
    ],
    [
      {
        cancelledAt: CLOSED,
        prClose: { number: 4, state: 'closed' },
        results: [
          {
            ...delivered,
            pr: {
              url: 'https://github.com/nocobase/site/pull/4',
              number: 4,
              branch: 'nocoreach/task-51',
              files: [],
            },
          },
        ],
      },
      [],
      $t('taskExecution.reopenResubmit', { 0: 'Change' }),
    ],
    [
      {
        stage: 'plan',
        flow: undefined,
        playbook: undefined,
        results: [],
        archivedAt: CLOSED,
      },
      [],
      $t('taskExecution.reopenToStart'),
    ],
    [
      {
        stage: 'done',
        stageIndex: 3,
        observeFrom: '2026-10-20T00:00:00Z',
        archivedAt: CLOSED,
      },
      [],
      $t('taskExecution.reopenToDone'),
    ],
    [
      { cancelledAt: CLOSED },
      [{ ...stoppedRun, status: 'running', endedAt: undefined }],
      $t('taskExecution.reopenAfterStopping'),
    ],
  ];
  for (const [work, runs, hint] of cases) {
    mount(data(work, runs));
    expect(document.body.textContent).toContain(hint);
    expect(
      screen.getByRole('button', { name: $t('common.reopen') }),
    ).toBeVisible();
    cleanup();
  }
});

test('a reopened Agent step the closing stopped waits for Start this step again, not as a failure', async () => {
  const user = userEvent.setup();
  const reopenedAt = '2026-10-29T15:00:00Z';
  mount(
    data(
      {
        stageIndex: 0,
        results: [],
        history: [
          { at: '2026-10-28T12:00:00Z', actor: '1', action: 'startTask' },
          { at: CLOSED, actor: '1', action: 'cancelTask' },
          {
            at: reopenedAt,
            actor: '1',
            action: 'unarchiveTask',
            stageKey: 'build',
            note: 'stopped',
          },
        ],
      },
      [stoppedRun],
    ),
  );
  expect(screen.getByText($t('taskDetail.restartStopped'))).toBeVisible();
  expect(screen.queryByText($t('taskDetail.agentDidNotFinish'))).toBeNull();
  expect(
    screen.queryByText($t('taskDetail.stoppedCheckChangesAlreadyPushed')),
  ).toBeNull();
  // Activity says where it went back to.
  expect(
    screen.getByText($t('playbook.reopenedTaskAt', { 0: 'Change' })),
  ).toBeVisible();
  await user.click(
    screen.getByRole('button', { name: $t('taskDetail.startStepAgain') }),
  );
  const advance = action.mock.calls.find(
    ([, command]) => command === 'advance',
  );
  expect(
    (advance?.[2] as { body: { command: string; stageKey: string } }).body,
  ).toMatchObject({ command: 'retryStage', stageKey: 'build' });
});

test('a withdrawn change reads as one to submit again', () => {
  mount(
    data(
      {
        stageIndex: 0,
        history: [
          {
            at: '2026-10-29T15:00:00Z',
            actor: '1',
            action: 'unarchiveTask',
            stageKey: 'build',
            note: 'withdrawn',
          },
        ],
      },
      [
        {
          ...stoppedRun,
          status: 'succeeded',
          error: undefined,
          artifactId: 'artifact-1',
        },
      ],
    ),
  );
  expect(screen.getByText($t('taskDetail.restartWithdrawn'))).toBeVisible();
  expect(
    screen.getByRole('button', { name: $t('taskDetail.startStepAgain') }),
  ).toBeVisible();
});

test('the task list reads a reopened step as waiting for you, not as a failed run, until it is started again', () => {
  const reopened = data({
    stageIndex: 0,
    results: [],
    latestRun: { id: 'run-1', status: 'failed' },
    history: [
      { at: CLOSED, actor: '1', action: 'cancelTask' },
      {
        at: '2026-10-29T15:00:00Z',
        actor: '1',
        action: 'unarchiveTask',
        stageKey: 'build',
        note: 'stopped',
      },
    ],
  }).work;
  expect(stepOf(reopened)).toEqual({
    text: $t('taskList.waitingRestart'),
    tone: 'amber',
  });
  reopened.history.push({
    at: '2026-10-29T15:05:00Z',
    actor: '1',
    action: 'runQueued',
    runId: 'run-2',
  });
  reopened.latestRun = { id: 'run-2', status: 'queued' };
  expect(stepOf(reopened)?.text).toBe($t('taskList.waitingAgentPickUp'));
});
