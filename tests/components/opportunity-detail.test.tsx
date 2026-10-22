import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import OpportunityLibrary from '../../client/pages/strategy/library';
import type {
  Opportunity,
  Signal,
  StrategyState,
} from '../../shared/strategy-model';

const fixture = vi.hoisted(() => ({
  action: vi.fn(),
  tasks: [] as unknown[],
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action: fixture.action },
}));
vi.mock('../../client/pages/reach-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../client/pages/reach-data')>()),
  useProject: () => ({ project: { id: 1 }, error: '' }),
  taskRecords: async () => fixture.tasks,
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: () => undefined,
}));
const text = vi.hoisted(
  () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${Object.values(params).join('|')})` : key,
);
vi.mock('../../client/i18n', async () => ({
  useMessageState: (await import('react')).useState,
  $t: text,
  $tj: text,
  $legacyText: (value: string) => value,
  $legacyFragment: (value: string) => value,
  getCurrentLocale: () => 'en-US',
  isChinese: () => false,
  translateSystemError: (value: string) => value,
  renderMessage: () => '',
}));

const signal: Signal = {
  key: 'gsc-drop',
  type: 'change',
  source: 'gsc',
  title: 'Site-wide impressions down 24%',
  facts: ['729,806 vs 964,024'],
  strength: 3,
  actionable: true,
  action: 'optimize',
};
const card: Opportunity = {
  id: 'o36',
  no: 36,
  title: 'Check why site-wide impressions keep falling',
  observation: 'Impressions 729,806 against 964,024 the 28 days before.',
  meaning: 'Impressions fell far more than clicks: likely indexing.',
  priorityReason: 'Two periods down in a row',
  suggestion: 'Check index coverage and crawl errors in Search Console.',
  objective: 'Stop the decline',
  target: 'www.nocobase.com indexing',
  audience: 'Site operators',
  priority: 'high',
  effort: 'medium',
  confidence: 'verify',
  limitation: 'No crawl data connected.',
  evidenceText: 'GSC totals',
  source: 'gsc',
  signalIds: ['gsc-drop'],
  change: 'new',
};
const other: Opportunity = {
  ...card,
  id: 'o37',
  no: 37,
  title: 'Add AI and self-hosting to the home page',
  observation: 'The home page ranks 12.3 on average.',
  priority: 'medium',
  change: 'unchanged',
};
const state: StrategyState = {
  revision: 3,
  goal: null,
  proposals: [],
  insights: {
    generatedAt: '2026-10-20T01:00:00Z',
    items: [card, other],
    evidence: {
      analysisVersion: 3,
      capturedAt: '',
      availableThrough: null,
      periodDays: 28,
      searchQueries: [],
      pages: [],
      industryCandidates: [],
      limitations: [],
      signals: { computedAt: '', coverage: {}, missing: [], items: [signal] },
    },
  },
};
const playbooks = {
  playbooks: [
    {
      id: 'optimize-page',
      name: 'Improve existing page',
      kind: 'build',
      category: 'optimize',
      steps: [],
    },
  ],
};

beforeEach(() => {
  fixture.tasks = [];
  fixture.action.mockReset();
  fixture.action.mockImplementation(
    async (resource: string, action: string) => {
      if (resource === 'nrStrategy' && action === 'state') return state;
      if (resource === 'nrPlaybooks') return playbooks;
      if (resource === 'nrStrategy' && action === 'confirmDirection')
        return {
          ...state,
          proposals: [{ id: 'p', insight: { id: 'o36' }, taskId: 7 }],
        };
      return [];
    },
  );
});

const show = (entry = '/opportunities') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <OpportunityLibrary />
    </MemoryRouter>,
  );

it('reads the selected opportunity in a detail with no owner or playbook form', async () => {
  show();
  const brief = await screen.findByRole('article', { name: card.title });
  for (const label of [
    'strategy.briefWhatHappened',
    'strategy.briefWhyWorthDoing',
    'strategy.briefWhatToDo',
    'strategy.priorityHigh',
    'strategy.effortMedium',
    'strategy.confidenceVerify',
  ])
    expect(brief.textContent).toContain(label);
  expect(brief.textContent).toContain(card.observation);
  expect(brief.textContent).toContain(card.meaning);
  expect(brief.textContent).toContain(card.priorityReason);
  expect(brief.textContent).toContain(card.suggestion);
  expect(brief.textContent).toContain('strategy.briefWhere');
  expect(brief.textContent).toContain(card.target);
  // The audience and goal are not shown: the Agent reads the audience from Memory, the goal goes in its brief.
  expect(brief.textContent).not.toContain(card.audience);
  expect(brief.textContent).not.toContain(card.objective);
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(
    fixture.action.mock.calls.some(([resource]) => resource === 'nrTaskWork'),
  ).toBe(false);
});

it('hands off with the recommended playbook and leaves the owner to the task', async () => {
  show();
  await screen.findByRole('article', { name: card.title });
  await waitFor(() =>
    expect(
      fixture.action.mock.calls.some(
        ([resource]) => resource === 'nrPlaybooks',
      ),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole('button', { name: 'common.handOffAgent' }));
  await waitFor(() =>
    expect(fixture.action).toHaveBeenCalledWith(
      'nrStrategy',
      'confirmDirection',
      expect.objectContaining({
        body: expect.objectContaining({
          insightId: 'o36',
          playbookId: 'optimize-page',
        }),
      }),
    ),
  );
  expect(
    fixture.action.mock.calls.some(([resource]) => resource === 'nrTaskWork'),
  ).toBe(false);
});

it('lists every pending opportunity and opens the one a link points to', async () => {
  show('/opportunities?item=o37');
  const detail = await screen.findByRole('article', { name: other.title });
  expect(detail.textContent).toContain(other.observation);
  expect(screen.queryByRole('article', { name: card.title })).toBeNull();
  const listed = screen.getAllByRole('button', { current: true });
  expect(listed).toHaveLength(1);
  expect(listed[0].textContent).toContain(other.title);
  expect(
    screen.getByRole('button', { name: new RegExp(card.title) }),
  ).toBeTruthy();
});

// O-43 cites two blog pages: handed off one task per page (2026-10-22).
const pageSignal = (key: string): Signal => ({
  ...signal,
  key,
  title: `${key} ranks lower`,
  url: `https://www.nocobase.com/en/blog/${key}`,
});
const several: StrategyState = {
  ...state,
  insights: {
    ...state.insights!,
    items: [
      {
        ...card,
        id: 'o43',
        no: 43,
        title: 'Update the comparison pages',
        signalIds: ['top11', 'top15'],
      },
    ],
    evidence: {
      ...state.insights!.evidence,
      signals: {
        computedAt: '',
        coverage: {},
        missing: [],
        items: [pageSignal('top11'), pageSignal('top15')],
      },
    },
  },
};
const place = (key: string, task?: { id: string; no: number }) => ({
  key: `page:nocobase.com/en/blog/${key}`,
  kind: 'page',
  url: `https://www.nocobase.com/en/blog/${key}`,
  label: key,
  title: `Update ${key}`,
  playbookId: 'optimize-page',
  signalIds: [key],
  ...(task ? { task } : {}),
});
const proposal = (taskId: number, key?: string) => ({
  id: `p${taskId}`,
  title: '',
  brief: '',
  status: 'approved',
  goalVersion: null,
  insight: several.insights!.items[0],
  taskId,
  taskNo: taskId,
  ...(key ? { part: { ...place(key), signalIds: [key] } } : {}),
});

it('hands off an opportunity with several places as the tasks ticked, then lists them on the opportunity', async () => {
  let current = several;
  fixture.action.mockImplementation(
    async (resource: string, action: string) => {
      if (resource === 'nrStrategy' && action === 'state') return current;
      if (resource === 'nrPlaybooks') return playbooks;
      if (resource === 'nrStrategy' && action === 'handOffPlan')
        return { parts: [place('top11'), place('top15')] };
      if (resource === 'nrStrategy' && action === 'confirmDirection') {
        current = {
          ...several,
          revision: 4,
          proposals: [proposal(42, 'top15')],
        };
        fixture.tasks = [
          {
            id: 42,
            title: 'Update top15',
            status: '',
            evidence: { no: 42, work: { stage: 'plan' } },
          },
        ];
        return current;
      }
      return [];
    },
  );
  show();
  await screen.findByRole('article', { name: 'Update the comparison pages' });
  fireEvent.click(screen.getByRole('button', { name: 'common.handOffAgent' }));
  const dialog = await screen.findByRole('dialog');
  const places = within(dialog).getAllByRole('checkbox');
  expect(places).toHaveLength(2);
  expect(within(dialog).getByText('Update top11')).toBeTruthy();
  // The playbook each place starts with.
  expect(within(dialog).getAllByText('Improve existing page')).toHaveLength(2);
  fireEvent.click(places[0]);
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: 'opportunityTasks.createTasks(1)',
    }),
  );
  await waitFor(() =>
    expect(fixture.action).toHaveBeenCalledWith(
      'nrStrategy',
      'confirmDirection',
      expect.objectContaining({
        body: expect.objectContaining({
          insightId: 'o43',
          parts: ['page:nocobase.com/en/blog/top15'],
        }),
      }),
    ),
  );
  // It stays on Opportunities, the opportunity open with its tasks; no task page opens.
  const tasks = await waitFor(() => {
    const el = document.querySelector('[data-opportunity-tasks]');
    if (!el) throw new Error('no task list yet');
    return el as HTMLElement;
  });
  expect(
    within(tasks)
      .getByRole('link', { name: 'Update top15' })
      .getAttribute('href'),
  ).toBe('/actions/42');
});

it('a handed-off opportunity lists its tasks with their progress and hands off the places left', async () => {
  // T-34 was handed off before places existed and is done; T-42 was created for top15 and is under way.
  fixture.tasks = [
    {
      id: 34,
      title: 'Update the comparison pages',
      status: '',
      evidence: { no: 34, work: { stage: 'done' } },
    },
    {
      id: 42,
      title: 'Update top15',
      status: '',
      evidence: {
        no: 42,
        work: {
          stage: 'flow',
          flow: { stages: [{ kind: 'agent' }] },
          stageIndex: 0,
        },
      },
    },
  ];
  fixture.action.mockImplementation(
    async (resource: string, action: string) => {
      if (resource === 'nrStrategy' && action === 'state')
        return { ...several, proposals: [proposal(42, 'top15'), proposal(34)] };
      if (resource === 'nrPlaybooks') return playbooks;
      if (resource === 'nrStrategy' && action === 'handOffPlan')
        return {
          parts: [
            place('top11', { id: '34', no: 34 }),
            place('top15', { id: '42', no: 42 }),
          ],
        };
      return [];
    },
  );
  show('/opportunities?item=o43');
  const detail = await screen.findByRole('article', {
    name: 'Update the comparison pages',
  });
  const tasks = detail.querySelector('[data-opportunity-tasks]') as HTMLElement;
  await waitFor(() =>
    expect(tasks.textContent).toContain(
      'common.completed 1 · common.inProgress 1',
    ),
  );
  expect(
    within(tasks)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href')),
  ).toEqual(['/actions/34', '/actions/42']);
  expect(detail.textContent).not.toContain('strategy.openTask');
  // Both places have an open task: nothing left to hand off.
  expect(
    within(detail).queryByRole('button', { name: 'common.handOffAgent' }),
  ).toBeNull();
});
