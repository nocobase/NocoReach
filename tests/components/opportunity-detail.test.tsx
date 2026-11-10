import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import OpportunityLibrary from '../../client/pages/strategy/library';
import {
  GROWTH_KINDS,
  type Growth,
  type GrowthKind,
} from '../../shared/growth';
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
  // Sources not read yet: links into data pages stay as they are.
  useNavSources: () => null,
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

it('Watching colours the current value as its change, once, without a tag beside the title', async () => {
  const watched = (
    key: string,
    title: string,
    chip?: Signal['chip'],
  ): Signal => ({
    key,
    type: 'change',
    source: 'gsc',
    title,
    facts: [],
    strength: 2,
    actionable: false,
    action: null,
    ...(chip ? { chip } : {}),
  });
  const items = [
    watched('w-drop', 'Trial conversion dipped', {
      tone: 'red',
      text: '↓ 18%',
    }),
    // A drop that is good news: the rule's tone, not the arrow, gives the colour.
    watched('w-good', 'Bounce rate fell', { tone: 'green', text: '↓ 9%' }),
    watched('w-none', 'Localised case study interest'),
  ];
  const review = {
    verdict: 'watch',
    reason: 'Too early',
    waitingFor: 'A full week',
    decideBy: '2026-10-30',
  };
  fixture.state = {
    ...state,
    insights: {
      ...state.insights!,
      evidence: {
        ...state.insights!.evidence!,
        signals: { computedAt: '', coverage: {}, missing: [], items },
      },
      signalReviews: Object.fromEntries(items.map((s) => [s.key, review])),
    },
  };
  show('/opportunities?tab=watch');
  const value = async (key: string) => {
    const row = await waitFor(() => {
      const r = document.querySelector(`[data-watch="${key}"]`);
      expect(r).toBeTruthy();
      return r!;
    });
    return row.querySelector('[data-start-now] > span')!;
  };
  const drop = await value('w-drop');
  expect([drop.textContent, drop.className]).toEqual([
    '↓ 18%',
    expect.stringContaining('text-nr-ink-red'),
  ]);
  const good = await value('w-good');
  expect(good.className).toContain('text-nr-ink-green');
  const none = await value('w-none');
  expect([none.textContent, none.className]).toEqual([
    '—',
    expect.stringContaining('text-muted-foreground'),
  ]);
  // The colour shows once: no "Now" before the value and no chip beside the title.
  const row = document.querySelector('[data-watch="w-drop"]')!;
  expect(row.textContent).not.toContain('strategy.now');
  expect(row.querySelector('td')!.textContent).not.toContain('↓ 18%');
});

it('shows the shared skeleton while the opportunities load', () => {
  fixture.action.mockImplementation(() => new Promise(() => {}));
  show();
  expect(
    screen
      .getByRole('status', { name: 'strategy.loadingOpportunities' })
      .querySelectorAll('[data-slot="skeleton"]'),
  ).toHaveLength(6);
});

// A growth opportunity (2026-11-10): its category and kind as tags, Growth potential where What happened was, and the rows
// behind it with "View all" to the page listing them. The figures are the server's, never the model's.
it('reads a growth opportunity as its tags, growth potential and evidence', async () => {
  const growth: Growth = {
    kind: 'demand-gap',
    category: 'new-content',
    figures: [
      {
        label: { key: 'growth.figure.monthlySearchesTotal' },
        value: 8900,
      },
      {
        label: { key: 'growth.figure.extraVisits' },
        value: 640,
        estimate: true,
      },
    ],
    evidence: {
      columns: [
        { key: 'keyword', label: 'growth.column.keyword', format: 'text' },
        { key: 'volume', label: 'growth.column.volume', format: 'count' },
      ],
      rows: [
        { keyword: 'gantt chart', volume: 5400 },
        { keyword: 'gantt chart template', volume: 3500 },
      ],
      total: 14,
      unit: 'growth.unit.keywords',
      link: '/keywords?tab=suggest',
    },
  };
  fixture.state = {
    ...state,
    insights: {
      ...state.insights!,
      items: [{ ...card, growth }],
    },
  };
  show();
  const brief = await screen.findByRole('article', { name: card.title });
  expect(
    brief.querySelector('[data-growth-category="new-content"]')!.textContent,
  ).toBe('growth.category.newContent');
  expect(brief.querySelector('[data-growth-kind]')!.textContent).toBe(
    'growth.kind.demandGap',
  );
  const potential = within(brief).getByRole('region', { name: 'growth.title' });
  expect(potential.textContent).toContain('growth.figure.monthlySearchesTotal');
  expect(potential.textContent).toContain('8,900');
  expect(potential.textContent).toContain('640');
  const evidence = within(brief).getByRole('region', {
    name: 'growth.evidence(growth.unit.keywords(14))',
  });
  expect(within(evidence).getAllByRole('row')).toHaveLength(3);
  expect(evidence.textContent).toContain('gantt chart template');
  expect(
    within(evidence)
      .getByRole('link', { name: /growth\.viewAll/ })
      .getAttribute('href'),
  ).toBe('/keywords?tab=suggest');
  // Growth potential takes the place of What happened; the rest of the detail is as before.
  expect(brief.textContent).not.toContain('strategy.briefWhatHappened');
  expect(brief.textContent).not.toContain(card.observation);
  expect(brief.textContent).toContain('strategy.briefWhyWorthDoing');
  // The list shows the same two tags in place of the signal chip and sources.
  const listed = screen.getByRole('button', { current: true });
  expect(listed.querySelector('[data-growth-kind="demand-gap"]')).toBeTruthy();
});

// A page that does not exist yet has no address to show: Where to change says it is a new page, the section it goes
// under and the existing pages to link to it from (2026-11-10 review).
it('says where a new page goes instead of an address that does not exist yet', async () => {
  fixture.state = {
    ...state,
    insights: {
      ...state.insights!,
      items: [
        {
          ...card,
          category: 'create',
          target: '',
          newPage: {
            section: '/blog/',
            linkFrom: ['/features/timeline', '/templates'],
          },
        },
      ],
    },
  };
  show();
  const brief = await screen.findByRole('article', { name: card.title });
  expect(brief.textContent).toContain('growth.where.newPage(/blog/)');
  expect(brief.textContent).toContain(
    'growth.where.linkFrom(/features/timeline · /templates)',
  );
  expect(brief.textContent).not.toContain(card.target);
});

// Where to change says which of the three it is (2026-11-10): an existing page or off the site (a new page above).
it('says whether the change is on an existing page or off the site', async () => {
  fixture.state = {
    ...state,
    insights: {
      ...state.insights!,
      items: [
        card,
        {
          ...other,
          target: '',
          offsite: 'Submit to the saas-review.example roundup author',
        },
      ],
    },
  };
  show();
  const brief = await screen.findByRole('article', { name: card.title });
  expect(brief.querySelector('[data-where="existing"]')!.textContent).toBe(
    `growth.where.existing(${card.target})`,
  );
  fireEvent.click(
    screen.getByRole('button', { name: new RegExp(other.title) }),
  );
  const offsite = await screen.findByRole('article', { name: other.title });
  expect(offsite.querySelector('[data-where="offsite"]')!.textContent).toBe(
    'growth.where.offsite(Submit to the saas-review.example roundup author)',
  );
});

// The four categories filter every tab (2026-11-10), kept in the address (?category=): each counts the tab's own items.
it('filters the opportunities by category on every tab, from the address', async () => {
  const growth = (kind: GrowthKind): Growth => ({
    kind,
    category: GROWTH_KINDS[kind],
    figures: [{ label: { key: 'growth.figure.clicks28' }, value: 1 }],
  });
  const third: Opportunity = {
    ...card,
    id: 'o38',
    no: 38,
    title: 'Older opportunity without a growth',
    objective: 'other',
  };
  fixture.state = {
    ...state,
    insights: {
      ...state.insights!,
      items: [
        { ...card, growth: growth('rising') },
        { ...other, growth: growth('rank-drop') },
        third,
      ],
    },
  };
  show('/opportunities?category=optimize');
  await screen.findByRole('article', { name: other.title });
  const filter = screen.getByRole('group', {
    name: 'growth.category.filter',
  });
  expect(
    within(filter)
      .getAllByRole('button')
      .map((b) => [b.textContent, b.getAttribute('aria-pressed')]),
  ).toEqual([
    ['growth.category.all 3', 'false'],
    ['growth.category.trending 1', 'false'],
    ['growth.category.newContent 0', 'false'],
    ['growth.category.competitorGaps 0', 'false'],
    ['growth.category.optimize 1', 'true'],
  ]);
  const listed = () =>
    screen
      .getAllByRole('button', { current: undefined })
      .filter((b) => b.hasAttribute('aria-current'))
      .map((b) => b.textContent);
  expect(listed()).toEqual([expect.stringContaining(other.title)]);
  fireEvent.click(
    within(filter).getByRole('button', { name: 'growth.category.trending 1' }),
  );
  await screen.findByRole('article', { name: card.title });
  expect(listed()).toEqual([expect.stringContaining(card.title)]);
  // All shows the one without a category too.
  fireEvent.click(
    within(filter).getByRole('button', { name: 'growth.category.all 3' }),
  );
  expect(listed()).toHaveLength(3);
  // Another tab keeps the filter and counts its own items.
  fireEvent.click(
    within(filter).getByRole('button', { name: 'growth.category.trending 1' }),
  );
  fireEvent.click(screen.getByRole('button', { name: /^strategy\.handled/ }));
  expect(
    within(
      screen.getByRole('group', { name: 'growth.category.filter' }),
    ).getByRole('button', { name: 'growth.category.trending 0' }),
  ).toHaveAttribute('aria-pressed', 'true');
});
