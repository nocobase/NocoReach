import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  state: undefined as unknown,
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
  fixture.state = state;
  fixture.tasks = [];
  fixture.action.mockReset();
  fixture.action.mockImplementation(
    async (resource: string, action: string) => {
      if (resource === 'nrStrategy' && action === 'state') return fixture.state;
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

it('a handed-off opportunity shows where its task stands, and Handled filters by it', async () => {
  // O-36 became T-34, now done; O-37 became T-35, in progress; the change "X mentions up 80%" was handed off on its
  // own as T-40, now waiting for confirmation.
  const spike: Signal = {
    ...signal,
    key: 'x-spike',
    source: 'x',
    title: 'X mentions up 80%',
  };
  fixture.state = {
    ...state,
    insights: {
      ...state.insights!,
      evidence: {
        ...state.insights!.evidence,
        signals: {
          ...state.insights!.evidence.signals!,
          items: [signal, spike],
        },
      },
    },
    proposals: [
      { id: 'p', insight: { id: 'o36' }, taskId: 7, taskNo: 34 },
      { id: 'q', insight: { id: 'o37' }, taskId: 8, taskNo: 35 },
      { id: 'r', signalKey: 'x-spike', taskId: 9, taskNo: 40 },
    ],
  };
  fixture.tasks = [
    { id: 7, status: 'todo', evidence: { no: 34, work: { stage: 'done' } } },
    {
      id: 8,
      status: 'todo',
      evidence: { no: 35, work: { boardState: 'doing' } },
    },
    {
      id: 9,
      status: 'todo',
      evidence: { no: 40, work: { boardState: 'review' } },
    },
  ];
  show('/opportunities?tab=done');
  const table = await screen.findByRole('table', { name: 'strategy.handled' });
  const row = (id: string) =>
    table.querySelector(`[data-opportunity-id="${id}"]`)?.textContent;
  await waitFor(() => expect(row('o36')).toContain('common.completed · T-34'));
  expect(row('o37')).toContain('results.taskState.doing · T-35');
  const change = () =>
    table.querySelector('[data-change="x-spike"]')?.textContent;
  expect(change()).toContain('results.taskState.review · T-40');
  expect(table.textContent).not.toContain('strategy.handedOffAgent');
  // The filter offers the same labels; Done keeps only O-36.
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('combobox', { name: 'strategy.filterWhereWent' }),
  );
  await user.click(
    await screen.findByRole('option', { name: 'common.completed' }),
  );
  await waitFor(() => expect(row('o37')).toBeUndefined());
  expect(row('o36')).toContain('common.completed · T-34');
  expect(change()).toBeUndefined();
  // Its detail says so too, beside the link to the task.
  fireEvent.click(screen.getByRole('button', { name: card.title }));
  const detail = await screen.findByRole('article', { name: card.title });
  expect(detail.textContent).toContain('|common.completedstrategy.task(T-34))');
  expect(
    screen.getByRole('button', { name: /strategy.openTask/ }),
  ).toBeTruthy();
});

it('a change handed off on its own says in its detail where its task stands', async () => {
  const spike: Signal = {
    ...signal,
    key: 'x-spike',
    source: 'x',
    title: 'X mentions up 80%',
  };
  fixture.state = {
    ...state,
    insights: {
      ...state.insights!,
      evidence: {
        ...state.insights!.evidence,
        signals: {
          ...state.insights!.evidence.signals!,
          items: [signal, spike],
        },
      },
    },
    proposals: [{ id: 'r', signalKey: 'x-spike', taskId: 9, taskNo: 40 }],
  };
  fixture.tasks = [
    {
      id: 9,
      status: 'todo',
      evidence: { no: 40, work: { boardState: 'review' } },
    },
  ];
  show('/opportunities?tab=done');
  fireEvent.click(
    await screen.findByRole('button', { name: /X mentions up 80%/ }),
  );
  const detail = await screen.findByRole('dialog');
  expect(detail.textContent).toContain('results.taskState.review');
  expect(detail.textContent).not.toContain('strategy.progress');
});

it('Handled sorts by number, where it went and first found, never by title', async () => {
  // O-36 done (T-34), O-37 waiting for review (T-35).
  fixture.state = {
    ...state,
    proposals: [
      { id: 'p', insight: { id: 'o36' }, taskId: 7, taskNo: 34 },
      { id: 'q', insight: { id: 'o37' }, taskId: 8, taskNo: 35 },
    ],
  };
  fixture.tasks = [
    { id: 7, status: 'todo', evidence: { no: 34, work: { stage: 'done' } } },
    {
      id: 8,
      status: 'todo',
      evidence: { no: 35, work: { boardState: 'review' } },
    },
  ];
  show('/opportunities?tab=done');
  const table = await screen.findByRole('table', { name: 'strategy.handled' });
  const order = () =>
    [...table.querySelectorAll('[data-opportunity-id]')].map((r) =>
      r.getAttribute('data-opportunity-id'),
    );
  // Newest number first by default.
  await waitFor(() => expect(order()).toEqual(['o37', 'o36']));
  const header = (name: string) =>
    screen.getByRole('button', {
      name: new RegExp(`sortableHeader.sort.*${name}`),
    });
  expect(
    screen.queryByRole('button', { name: /sortableHeader.sort.*common.title/ }),
  ).toBeNull();
  fireEvent.click(header('common.identifier'));
  expect(order()).toEqual(['o36', 'o37']);
  // Where it went: what waits for you before what is done.
  fireEvent.click(header('strategy.whereWent'));
  expect(order()).toEqual(['o37', 'o36']);
  fireEvent.click(header('strategy.whereWent'));
  expect(order()).toEqual(['o36', 'o37']);
  expect(
    table
      .querySelector('th[aria-sort="descending"]')
      ?.textContent?.includes('strategy.whereWent'),
  ).toBe(true);
});
