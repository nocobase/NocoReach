import { NavigationGuardProvider } from '@nocobase/app-client';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { $t, setDictionary } from '../../client/i18n';
import { TaskDraftProvider } from '../../client/pages/task-detail/drafts';
import { TaskDetail } from '../../client/pages/task-detail';
import type { TaskData } from '../../client/pages/task-execution-types';
import english from '../../shared/i18n/en.json';

// Change playbook after the start (2026-11-11 user decision, ui-references/change-playbook-2026-11-11): a step a person
// stopped reads as stopped, not as a failure, and offers Change playbook, as does the playbook's line in Given to the
// agent at the start; the start card comes back in place, and Start sends the change as one request.

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
  useMe: () => ({ me: { id: '1', name: 'Super Admin' }, can: () => true }),
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
}));

const STOPPED = '2026-11-11T14:20:00Z';
const docStages = [
  { key: 'analyze', name: 'Write outline', kind: 'agent', mode: 'analyze' },
  { key: 'accept', name: 'Review', kind: 'review' },
];
const playbook = (id: string, name: string, kind = 'plan') => ({
  id,
  name,
  kind,
  category: 'research',
  description: '',
  version: 1,
  next: [],
  steps: [
    {
      key: 'analyze',
      name: 'Analyze',
      kind: kind === 'build' ? 'change' : 'analyze',
    },
    { key: 'accept', name: 'Review', kind: 'review' },
  ],
});
const PLAYBOOKS = [
  playbook('content-outline', 'Content topic and outline'),
  playbook('keyword-research', 'Keyword research'),
];
const stoppedRun = {
  id: 'run-1',
  stepId: 'analyze',
  planVersion: 0,
  status: 'failed',
  error: 'cancelled',
  mode: 'analyze',
  pluginRunId: 'p1',
  createdAt: '2026-11-11T14:18:00Z',
  endedAt: STOPPED,
};
function data(work: object = {}, runs: object[] = [stoppedRun]): TaskData {
  return {
    task: {
      id: 78,
      title: 'Content topic and outline: fde',
      brief: 'Goal: rank for fde',
      evidence: { no: 78 },
    },
    work: {
      revision: 4,
      stage: 'flow',
      plan: null,
      planVersion: 0,
      step: 0,
      stageIndex: 0,
      humanOwnerId: '1',
      humanOwnerName: 'Super Admin',
      playbook: {
        id: 'content-outline',
        name: 'Content topic and outline',
        kind: 'plan',
        version: 1,
        next: [],
      },
      flow: {
        id: 'content-outline',
        name: 'Content topic and outline',
        version: 1,
        stages: docStages,
      },
      results: [],
      latestRun: { id: 'run-1', status: 'failed', stopped: true },
      history: [
        { at: '2026-11-11T14:18:00Z', actor: '1', action: 'startTask' },
        {
          at: STOPPED,
          actor: '1',
          action: 'cancelRun',
          runId: 'run-1',
          stageKey: 'analyze',
        },
      ],
      ...work,
    },
    runs,
    artifacts: [],
    reviews: [],
    agent: {
      online: true,
      agentId: 'claude',
      options: [
        { id: 'claude', name: 'Claude' },
        { id: 'codex', name: 'Codex' },
      ],
    },
  } as unknown as TaskData;
}
let current: TaskData;
const commands: Record<string, unknown>[] = [];
beforeEach(() => {
  setDictionary(english, 'en-US');
  commands.length = 0;
  action.mockReset();
  action.mockImplementation(
    (
      resource: string,
      command: string,
      init?: { body?: Record<string, unknown> },
    ) => {
      if (resource === 'nrPlaybooks')
        return Promise.resolve({ revision: 1, playbooks: PLAYBOOKS });
      if (command === 'members')
        return Promise.resolve([{ id: '1', name: 'Super Admin' }]);
      if (command === 'advance') {
        commands.push(init!.body!);
        return Promise.resolve(current);
      }
      if (command === 'get') return Promise.resolve(current);
      return Promise.resolve([]);
    },
  );
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});
function mount(d: TaskData) {
  current = d;
  return render(
    <MemoryRouter initialEntries={['/actions/78']}>
      <NavigationGuardProvider>
        <TaskDraftProvider>
          <TaskDetail projectId={1} taskId='78' initial={d} />
        </TaskDraftProvider>
      </NavigationGuardProvider>
    </MemoryRouter>,
  );
}
const now = () =>
  screen.getByRole('region', { name: $t('common.needsAction') });
const buttons = (region: HTMLElement) =>
  within(region)
    .getAllByRole('button')
    .map((b) => b.textContent);

test('a step a person stopped is grey and offers to start again or change the playbook', () => {
  mount(data());
  const card = now();
  expect(card).toHaveTextContent($t('taskDetail.stoppedTitle'));
  expect(card).toHaveTextContent(/Super Admin stopped "Write outline" at /);
  expect(card).not.toHaveAttribute('data-error');
  expect(card).not.toHaveTextContent($t('taskDetail.agentDidNotFinish'));
  expect(card).not.toHaveTextContent($t('taskDetail.technicalDetails'));
  expect(card).not.toHaveTextContent($t('taskDetail.stoppedSiteNote'));
  expect(buttons(card)).toEqual([
    $t('taskDetail.startStepAgain'),
    $t('taskDetail.changePlaybook'),
    $t('taskDetail.switchAgent'),
    $t('taskDetail.messageAgent'),
  ]);
  // The playbook's line under Given to the agent at the start offers it too.
  const given = screen.getByRole('region', {
    name: $t('taskDetail.givenAtStart'),
  });
  expect(
    within(given).getByRole('button', {
      name: $t('taskDetail.changePlaybook'),
    }),
  ).toBeVisible();
});

test('a page change stopped halfway asks a developer to check the site', () => {
  mount(
    data({
      playbook: {
        id: 'optimize-page',
        name: 'Optimize page',
        kind: 'build',
        version: 1,
        next: [],
      },
    }),
  );
  expect(now()).toHaveTextContent($t('taskDetail.stoppedSiteNote'));
});

test('Change playbook brings the start card back in place; Cancel changes nothing', async () => {
  const user = userEvent.setup();
  mount(data());
  await user.click(
    within(now()).getByRole('button', {
      name: $t('taskDetail.changePlaybook'),
    }),
  );
  const card = now();
  expect(card).toHaveTextContent($t('taskDetail.restartTitle'));
  expect(card).toHaveTextContent($t('taskDetail.restartIntro'));
  expect(card).toHaveTextContent(
    $t('taskDetail.originalPlaybook', { 0: 'Content topic and outline' }),
  );
  expect(
    screen.queryByRole('region', { name: $t('taskDetail.givenAtStart') }),
  ).toBeNull();
  // The playbook started with is preselected, and starting it again is not a change.
  expect(
    within(card).getByRole('combobox', { name: $t('common.playbook') }),
  ).toHaveTextContent('Content topic and outline');
  expect(
    within(card).getByRole('button', { name: $t('taskDetail.confirmStart') }),
  ).toBeDisabled();
  await user.click(
    within(card).getByRole('button', { name: $t('common.cancel') }),
  );
  expect(now()).toHaveTextContent($t('taskDetail.stoppedTitle'));
  expect(commands).toEqual([]);
});

test('Start sends the change of playbook as one request', async () => {
  const user = userEvent.setup();
  mount(
    data(
      {
        stageIndex: 1,
        results: [
          {
            id: 'outline-1',
            stepId: 'analyze',
            planVersion: 0,
            version: 1,
            content: 'Outline',
            createdAt: '2026-11-11T14:00:00Z',
            createdBy: 'agent',
            approvedAt: '2026-11-11T14:10:00Z',
          },
        ],
        latestRun: { id: 'run-0', status: 'succeeded' },
      },
      [],
    ),
  );
  const given = screen.getByRole('region', {
    name: $t('taskDetail.givenAtStart'),
  });
  await user.click(
    within(given).getByRole('button', {
      name: $t('taskDetail.changePlaybook'),
    }),
  );
  const card = now();
  // What was approved under the earlier playbook is named, and stays in Activity.
  expect(card).toHaveTextContent(
    $t('taskDetail.restartApproved', {
      0: $t('taskDetail.quotedName', { 0: 'Write outline' }),
    }),
  );
  await user.click(
    within(card).getByRole('combobox', { name: $t('common.playbook') }),
  );
  await user.click(
    await screen.findByRole('option', { name: 'Keyword research' }),
  );
  await user.click(
    within(card).getByRole('button', { name: $t('taskDetail.confirmStart') }),
  );
  expect(commands.map((c) => c.command)).toEqual(['restartWithPlaybook']);
  expect(commands[0]).toMatchObject({
    playbookId: 'keyword-research',
    revision: 4,
  });
});

test('no Change playbook while the Agent runs or once the task is published', () => {
  mount(
    data({ latestRun: { id: 'run-2', status: 'running' } }, [
      {
        ...stoppedRun,
        id: 'run-2',
        status: 'running',
        error: undefined,
        endedAt: undefined,
      },
    ]),
  );
  expect(document.body).not.toHaveTextContent($t('taskDetail.changePlaybook'));
  cleanup();
  const stages = [
    { key: 'build', name: 'Change', kind: 'agent', mode: 'change' },
    { key: 'review', name: 'Review', kind: 'review' },
    { key: 'release', name: 'Publish', kind: 'release' },
    { key: 'observe', name: 'Watch', kind: 'observe' },
  ];
  mount(
    data(
      {
        stage: 'flow',
        stageIndex: 2,
        flow: {
          id: 'optimize-page',
          name: 'Optimize page',
          version: 1,
          stages,
        },
        release: { state: 'verifying', pages: [], note: '' },
      },
      [],
    ),
  );
  expect(document.body).not.toHaveTextContent($t('taskDetail.changePlaybook'));
});
