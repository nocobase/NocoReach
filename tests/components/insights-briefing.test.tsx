import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import StrategyPage from '../../client/pages/strategy/index';
import {
  NavBadgeProvider,
  useNavBadge,
} from '../../client/components/app-shell/nav-badges';
import type {
  InsightBatch,
  Opportunity,
  StrategyState,
} from '../../shared/strategy-model';
import { insightPending } from '../../shared/strategy-pending';
import { WorkspaceCacheProvider } from '../../client/pages/workspace-cache';

const fixture = vi.hoisted(() => ({
  action: vi.fn(),
  openChat: vi.fn(),
  resume: vi.fn(),
  threads: [] as unknown[],
  /** Holds the owner's conversation list back, as a slow connection does. */
  threadsHeld: null as Promise<void> | null,
  details: {} as Record<string, unknown>,
  posts: [] as { path: string; body: unknown }[],
  panelOpen: false,
  state: undefined as unknown as StrategyState,
  tasks: [] as unknown[],
  cards: [] as unknown[],
  areas: [] as unknown[],
  runs: [] as unknown[],
  schedule: null as unknown,
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action: fixture.action },
}));
vi.mock('../../client/pages/reach-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../client/pages/reach-data')>()),
  useProject: () => ({ project: { id: 1 } }),
}));
vi.mock('../../client/pages/me', async () => ({
  useMe: () => ({
    me: { id: 'u', role: 'member' },
    mine: (id?: string) => id === 'u',
  }),
  taskOwner: (await import('../../shared/task-pending')).taskOwner,
}));
// Translations show their key, with any values after a colon.
vi.mock('../../client/i18n', async () => {
  const text = (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key;
  const { createElement, Fragment, useState } = await import('react');
  return {
    useMessageState: useState,
    $t: text,
    // Elements among the values (links) are rendered, each after a comma.
    $tj: (key: string, values?: Record<string, unknown>) =>
      createElement(
        Fragment,
        null,
        key,
        ...Object.values(values || {}).flatMap((v, i) => [
          i ? ',' : ':',
          v as never,
        ]),
      ),
    $legacyText: (value: string) => value,
    $legacyJsx: (value: string) => value,
    $legacyFragment: (value: string) => value,
    getCurrentLocale: () => 'en-US',
    translateSystemError: (value: string) => value,
    renderMessage: () => '',
  };
});
vi.mock('@nocobase/i18n/client', async (original) => ({
  ...(await original<typeof import('@nocobase/i18n/client')>()),
  useTranslation: () => ({ t: (key: string) => key }),
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
vi.mock('../../client/pages/data-health', () => ({
  loadHealth: () => Promise.resolve({ items: [] }),
  healthText: (name: string) => name,
}));
vi.mock('../../client/online-agent/context', () => ({
  useOptionalOnlineChat: () => ({
    open: fixture.openChat,
    resume: fixture.resume,
    activity: 0,
    agentId: 'online-default',
  }),
}));
vi.mock('@nocobase/app-plugin-agents/client/chat', async (original) => ({
  ...(await original<
    typeof import('@nocobase/app-plugin-agents/client/chat')
  >()),
  useChatPanel: () => ({ open: fixture.panelOpen }),
}));
// The chat's records: the owner's questions asked from Insights in project 1, each conversation's turns, and what is
// sent.
vi.mock('../../client/online-agent/api', () => ({
  useOnlineApi: () => async (path: string, body?: unknown) => {
    if (body !== undefined) {
      fixture.posts.push({ path, body });
      return {};
    }
    if (path === 'threads?projectId=1') {
      if (fixture.threadsHeld) await fixture.threadsHeld;
      return fixture.threads;
    }
    const id = /^conversations\/(.+)$/.exec(path)?.[1];
    if (id && fixture.details[id]) return fixture.details[id];
    throw new Error(`Unexpected ${path}`);
  },
}));
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
vi.mock('../../client/components/reach/page', () => ({
  PageContainer: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
  PageHeader: ({
    description,
    actions,
  }: {
    description?: ReactNode;
    actions?: ReactNode;
  }) => (
    <header>
      {description}
      {actions}
    </header>
  ),
  Section: ({ children, ...rest }: { children: ReactNode }) => (
    <section {...rest}>{children}</section>
  ),
}));

const card = (id: string, extra: Partial<Opportunity> = {}): Opportunity => ({
  id,
  title: `Opportunity ${id}`,
  observation: '',
  meaning: '',
  evidenceText: '',
  limitation: '',
  suggestion: `Do ${id}`,
  objective: '',
  source: 'search',
  ...extra,
});
const batch = (generatedAt: string, items: Opportunity[]): InsightBatch => ({
  generatedAt,
  items,
  observations: ['Search clicks held steady this week.'],
  evidence: {
    analysisVersion: 3,
    periodDays: 28,
    capturedAt: '',
    availableThrough: null,
    searchQueries: [],
    pages: [],
    industryCandidates: [],
    limitations: [],
    signals: { computedAt: '', coverage: {}, missing: [], items: [] },
  },
});
// Seven opportunities wait (two high, one raised two days earlier), one is ignored and one already became a task.
const initial = (): StrategyState => ({
  revision: 1,
  goal: null,
  proposals: [
    {
      id: 'p',
      title: '',
      brief: '',
      status: '',
      goalVersion: null,
      evidence: batch('', []).evidence,
      taskId: 5,
      insight: card('handed'),
    },
  ],
  insights: batch('2026-10-21T08:00:00Z', [
    card('a', { priority: 'low' }),
    card('b', { priority: 'high' }),
    card('c'),
    card('d', { priority: 'medium' }),
    card('e', { priority: 'high', firstSeenAt: '2026-10-19' }),
    card('f'),
    card('g', { priority: 'low' }),
    card('ignored', { priority: 'high' }),
    card('handed', { priority: 'high' }),
  ]),
  opportunityMeta: { ignored: { status: 'ignored' } },
  watch: {
    today: {
      key: 'today',
      source: 'gsc',
      since: '2026-10-14',
      startTitle: 'Pricing page clicks dipped',
      startFacts: [],
      decideBy: '2026-10-21',
      ended: { at: '2026-10-21T08:00:00Z', outcome: 'normal' },
    },
    earlier: {
      key: 'earlier',
      source: 'gsc',
      since: '2026-10-10',
      startTitle: 'Docs traffic dropped',
      startFacts: [],
      decideBy: '2026-10-18',
      ended: { at: '2026-10-18T08:00:00Z', outcome: 'normal' },
    },
    open: {
      key: 'open',
      source: 'gsc',
      since: '2026-10-20',
      startTitle: 'Blog impressions rose',
      startFacts: [],
      decideBy: '2026-10-27',
    },
  },
});
const metric = (
  key: string,
  value: number | null,
  change: number | null = null,
) => ({
  key,
  value,
  change,
});
function BadgeProbe() {
  const insights = useNavBadge('insights');
  return <output>badge:{insights.count ?? 'unknown'}</output>;
}
beforeEach(() => {
  fixture.state = initial();
  fixture.tasks = [];
  fixture.cards = [];
  fixture.areas = [];
  fixture.runs = [];
  fixture.schedule = null;
  fixture.action.mockReset();
  fixture.openChat.mockReset();
  fixture.resume.mockReset();
  fixture.threads = [];
  fixture.threadsHeld = null;
  fixture.details = {};
  fixture.posts = [];
  fixture.panelOpen = false;
  fixture.action.mockImplementation(
    (resource: string, action: string, options: { body?: object }) => {
      const body = (options?.body || {}) as Record<string, unknown>;
      if (resource === 'nrHealth') return Promise.resolve({});
      if (resource === 'nrStrategy' && action === 'badges')
        return Promise.resolve({
          insights: insightPending(fixture.state, []),
          opportunities: 0,
          tasks: 0,
        });
      if (resource === 'nrStrategy' && action === 'state')
        return Promise.resolve(fixture.state);
      if (resource === 'nrStrategy' && action === 'context')
        return Promise.resolve({ evidence: fixture.state.insights!.evidence });
      if (resource === 'nrStrategy' && action === 'reviewOpportunity') {
        fixture.state = {
          ...fixture.state,
          revision: fixture.state.revision + 1,
          opportunityMeta: {
            ...fixture.state.opportunityMeta,
            [String(body.insightId)]: { status: String(body.status) },
          },
        };
        return Promise.resolve(fixture.state);
      }
      if (resource === 'nrStrategy' && action === 'confirmDirection') {
        fixture.tasks = [
          ...fixture.tasks,
          {
            id: 99,
            title: 'New',
            status: 'todo',
            createdAt: '2026-10-21T10:00:00Z',
            evidence: {},
          },
        ];
        fixture.state = {
          ...fixture.state,
          revision: fixture.state.revision + 1,
          proposals: [
            ...fixture.state.proposals,
            {
              id: 'new',
              title: '',
              brief: '',
              status: '',
              goalVersion: null,
              evidence: fixture.state.insights!.evidence,
              taskId: 99,
              insight: fixture.state.insights!.items.find(
                (c) => c.id === body.insightId,
              ),
            },
          ],
        };
        return Promise.resolve(fixture.state);
      }
      if (resource === 'nrTaskWork' && action === 'list')
        return Promise.resolve(fixture.tasks);
      if (resource === 'nrDataViews')
        return Promise.resolve({ cards: fixture.cards });
      if (resource === 'nrInsights')
        return Promise.resolve({ areas: fixture.areas });
      if (resource === 'nrAnalysis')
        return Promise.resolve({
          running: false,
          runs: fixture.runs,
          schedule: fixture.schedule,
        });
      if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
      throw new Error(`Unexpected request ${resource}/${action}`);
    },
  );
});
function setup() {
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
// Earlier days are folded above today until asked for.
const showEarlier = async () =>
  fireEvent.click(
    await screen.findByRole('button', { name: /strategy.earlierAnalyses/ }),
  );
const decisionGroup = (n: number) =>
  screen.findByRole('group', { name: `strategy.decideCount:${n}` });
const decisions = () =>
  within(screen.getByRole('group', { name: /strategy.decideCount/ }))
    .getAllByRole('listitem')
    .map((a) => a.getAttribute('data-opportunity-id'));

it('lists every waiting opportunity in the message of the day, most important first: five lines, then the rest folded', async () => {
  setup();
  await decisionGroup(7);
  expect(screen.getByText('strategy.briefHeadline:7')).toBeTruthy();
  // The analysis notes stay folded until asked for.
  expect(screen.queryByText('Search clicks held steady this week.')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: /strategy.analysisNotes:1/ }),
  );
  expect(screen.getByText('Search clicks held steady this week.')).toBeTruthy();
  // High first (the newer of the two ahead), unrated last.
  expect(decisions()).toEqual(['b', 'e', 'd', 'a', 'g']);
  // Those of today's analysis already decided stay in the day, after the rest, with where they went.
  const group = screen.getByRole('group', { name: 'strategy.decideCount:7' });
  for (const tag of [
    'strategy.pendingCount:7',
    'strategy.handedCount:1',
    'strategy.dismissedCount:1',
  ])
    expect(within(group).getByText(tag)).toBeTruthy();
  const more = screen.getByRole('button', { name: /strategy.moreToDecide:4/ });
  expect(more.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(more);
  expect(more.getAttribute('aria-expanded')).toBe('true');
  expect(decisions()).toEqual([
    'b',
    'e',
    'd',
    'a',
    'g',
    'c',
    'f',
    'handed',
    'ignored',
  ]);
  const handed = group.querySelector('[data-opportunity-id=handed]')!;
  expect(handed.textContent).toContain('strategy.handedOffAgent');
  expect(
    within(handed as HTMLElement).queryByRole('button', {
      name: 'common.handOffAgent',
    }),
  ).toBeNull();
});

it('Ignore records the decision and the line leaves, with the count and the menu badge', async () => {
  setup();
  await decisionGroup(7);
  await screen.findByText('badge:7');
  fireEvent.click(
    within(screen.getByRole('listitem', { name: 'Opportunity b' })).getByRole(
      'button',
      { name: 'common.ignore' },
    ),
  );
  await decisionGroup(6);
  expect(fixture.action).toHaveBeenCalledWith(
    'nrStrategy',
    'reviewOpportunity',
    expect.objectContaining({
      body: expect.objectContaining({ insightId: 'b', status: 'ignored' }),
    }),
  );
  expect(decisions()).toEqual(['e', 'd', 'a', 'g', 'c']);
  // It stays in the day as dismissed.
  expect(screen.getByText('strategy.dismissedCount:2')).toBeTruthy();
  await screen.findByText('badge:6');
});

it('Hand off to agent turns the opportunity into a task and takes it off the list', async () => {
  setup();
  await decisionGroup(7);
  fireEvent.click(
    within(screen.getByRole('listitem', { name: 'Opportunity e' })).getByRole(
      'button',
      { name: 'common.handOffAgent' },
    ),
  );
  await decisionGroup(6);
  expect(fixture.action).toHaveBeenCalledWith(
    'nrStrategy',
    'confirmDirection',
    expect.objectContaining({
      body: expect.objectContaining({ insightId: 'e' }),
    }),
  );
  expect(decisions()).not.toContain('e');
  expect(await screen.findByText('strategy.handedCount:2')).toBeTruthy();
});

it('the tiles show at most five numbers that have data, the summary names the ones that moved, and the current situation sits beside the day', async () => {
  fixture.cards = [
    {
      id: 'gsc',
      metrics: [
        metric('clicks', 1200, -0.31),
        metric('impressions', 54000, 0.02),
      ],
      series: [],
    },
    {
      id: 'ga4',
      metrics: [metric('sessions', 900, 0.12), metric('conversions', 0)],
      series: [],
    },
    { id: 'github', metrics: [metric('stars', 30)], series: [] },
    { id: 'packages', metrics: [metric('downloads', 4000, 0.9)], series: [] },
    { id: 'discourse', metrics: [metric('topics', null)], series: [] },
  ];
  fixture.areas = [
    {
      id: 'site',
      title: 'Site',
      items: [
        {
          key: 'a',
          text: 'Pages indexed: 120',
          values: [],
          source: 'site',
          to: '/website',
        },
        {
          key: 'b',
          text: 'Sitemap found',
          values: [],
          source: 'site',
          to: '/website',
        },
        {
          key: 'c',
          text: 'Google interest {0}',
          values: ['↓ 36%'],
          source: 'trends',
          to: '/trends',
          tone: 'amber',
        },
      ],
    },
  ];
  setup();
  const tiles = await screen.findByRole('region', {
    name: 'strategy.keyMetrics',
  });
  await within(tiles).findByText('1,200');
  expect(within(tiles).getAllByRole('link')).toHaveLength(5);
  // The cards say what their numbers and changes cover.
  expect(within(tiles).getByText('strategy.metricWindow:28')).toBeTruthy();
  // Downloads is the sixth number: it waits under All data, and is not named in the summary either.
  expect(within(tiles).queryByText('4,000')).toBeNull();
  expect(within(tiles).getByText('+30')).toBeTruthy();
  const brief = screen.getByRole('group', { name: 'strategy.todayBrief' });
  expect(
    within(brief)
      .getAllByRole('link')
      .map((l) => l.textContent),
  ).toEqual([
    'common.searchClicks ↓ 31%',
    'strategy.sessions ↑ 12%',
    'strategy.watchingChip:1',
  ]);
  const situation = screen.getByRole('region', {
    name: 'strategy.currentSituation',
  });
  expect(await within(situation).findByText('Pages indexed: 120')).toBeTruthy();
  // One list without group captions, the lines to deal with first.
  expect(
    within(situation)
      .getAllByRole('listitem')
      .map((l) => l.textContent),
  ).toEqual(['Google interest ↓ 36%', 'Pages indexed: 120', 'Sitemap found']);
  expect(within(situation).queryByRole('heading', { level: 3 })).toBeNull();
  // No Refresh beside the tiles; All data is gone.
  expect(within(tiles).queryByRole('button')).toBeNull();
  expect(screen.queryByText('strategy.allData')).toBeNull();
});

it('the subtitle says how the insights are analyzed, linking the rules and the schedule', async () => {
  fixture.runs = [{ ok: true, trigger: 'workflow' }];
  fixture.schedule = { workflowId: 1, enabled: true, cron: '0 9 * * *' };
  setup();
  const link = await screen.findByRole('link', {
    name: 'strategy.everyDayAt:09:00',
  });
  expect(link.getAttribute('href')).toBe('/schedules');
  const sentence = link.parentElement!;
  expect(sentence.textContent).toBe(
    'strategy.howAnalyzedDaily:strategy.analysisRulesLink,strategy.everyDayAt:09:00',
  );
  expect(
    within(sentence)
      .getByRole('link', { name: 'strategy.analysisRulesLink' })
      .getAttribute('href'),
  ).toBe('/rules');
  // No data date, no last-run time and no period: the period is the metric cards'.
  expect(
    screen.queryByText(/strategy.lastDaysDataThrough|strategy.lastAnalyzed/),
  ).toBeNull();
});

it('a paused daily analysis says so, still linking Settings › Automatic runs', async () => {
  fixture.schedule = { workflowId: 1, enabled: false, cron: '0 9 * * *' };
  setup();
  const link = await screen.findByRole('link', {
    name: 'strategy.dailyAnalysisPaused',
  });
  expect(link.getAttribute('href')).toBe('/schedules');
  expect(link.parentElement!.textContent).toContain(
    'strategy.howAnalyzedPaused:',
  );
});

it('without a daily schedule the subtitle names the rules only', async () => {
  setup();
  const rules = await screen.findByRole('link', {
    name: 'strategy.analysisRulesLink',
  });
  expect(rules.parentElement!.textContent).toBe(
    'strategy.howAnalyzedManual:strategy.analysisRulesLink',
  );
  expect(
    screen.queryByRole('link', { name: /strategy.everyDayAt/ }),
  ).toBeNull();
});

it('the day also says which watches ended and which tasks wait for you', async () => {
  fixture.tasks = [
    {
      id: 7,
      title: 'Review the new title',
      status: 'todo',
      evidence: { createdBy: { id: 'u' }, work: { stage: 'plan' } },
    },
  ];
  setup();
  const ended = await screen.findByText('Pricing page clicks dipped');
  expect(ended.closest('[data-watch-ended]')!.textContent).toContain(
    'strategy.backNormal',
  );
  const waiting = await screen.findByRole('region', {
    name: 'strategy.taskStatus',
  });
  expect(
    await within(waiting).findByRole('button', {
      name: /Review the new title/,
    }),
  ).toBeTruthy();
});

it('earlier days fold into one line each, with where every opportunity went', async () => {
  fixture.state.insightHistory = [
    batch('2026-10-18T08:00:00Z', [
      card('old-done', { firstSeenAt: '2026-10-18' }),
      card('old-ignored', { firstSeenAt: '2026-10-18' }),
    ]),
  ];
  fixture.state.opportunityMeta = {
    ...fixture.state.opportunityMeta,
    'old-ignored': { status: 'ignored' },
  };
  fixture.state.proposals.push({
    id: 'q',
    title: '',
    brief: '',
    status: '',
    goalVersion: null,
    evidence: batch('', []).evidence,
    taskId: 35,
    taskNo: 35,
    insight: card('old-done'),
  });
  setup();
  await decisionGroup(7);
  await showEarlier();
  const days = screen
    .getAllByRole('region')
    .filter(
      (r) =>
        r.firstElementChild?.tagName === 'H3' &&
        r.getAttribute('aria-label') !== 'strategy.analysisFeed',
    );
  // Only 10/18: e, raised 10/19, still waits and so stands in today's message.
  expect(days).toHaveLength(1);
  const day = days[0];
  const toggle = within(day).getByRole('button', { expanded: false });
  expect(toggle.textContent).toContain('strategy.daySuggested:2');
  expect(toggle.textContent).toContain('strategy.dayWatchesEnded:1');
  expect(toggle.textContent).toContain('strategy.handedCount:1');
  expect(toggle.textContent).toContain('strategy.dismissedCount:1');
  expect(within(day).queryByText('Opportunity old-done')).toBeNull();
  fireEvent.click(toggle);
  expect(within(day).getByText('Opportunity old-done')).toBeTruthy();
  expect(within(day).getByText('strategy.handedOffAgent · T-35')).toBeTruthy();
  expect(within(day).getByText('strategy.dismissed')).toBeTruthy();
  expect(within(day).getByText('Docs traffic dropped')).toBeTruthy();
});

const run = (id: string, input: string, output: string, at: string) => ({
  id,
  input,
  output,
  status: 'completed',
  createdAt: at,
  agentName: 'Online Agent',
  events: [
    { type: 'toolCall', id: `${id}-1`, name: 'daily_analysis', args: {} },
    { type: 'toolCall', id: `${id}-2`, name: 'project_data', args: {} },
  ],
});
const thread = (id: string, day: string, extra: object = {}) => ({
  id,
  subject: { kind: 'insights', day },
  question: `question ${id}`,
  answer: `answer ${id}`,
  status: 'completed',
  turns: 2,
  updatedAt: `${day}T10:12:00Z`,
  ...extra,
});

it('today’s conversation follows the analysis, a quoted opportunity above its question', async () => {
  fixture.threads = [thread('t-day', '2026-10-21')];
  fixture.details['t-day'] = {
    conversation: { id: 't-day', revision: 4 },
    runs: [
      run(
        'r1',
        'Which page fell most?',
        '**smartsheet** fell out of the top 100',
        '2026-10-21T10:00:00Z',
      ),
      run(
        'r2',
        '[O-5 Opportunity b](/opportunities?item=b)\nHow long until it shows?',
        'One to three weeks.',
        '2026-10-21T10:05:00Z',
      ),
    ],
  };
  setup();
  await decisionGroup(7);
  const conversation = await waitFor(() => {
    const found = document.querySelector(
      '[data-day-conversation="2026-10-21"]',
    );
    expect(found).toBeTruthy();
    return found as HTMLElement;
  });
  // Folded to one line when the page opens, so the day's analysis is what shows.
  const fold = within(conversation).getByRole('button', {
    name: /strategy.conversationTurns:2/,
  });
  expect(fold.getAttribute('aria-expanded')).toBe('false');
  expect(conversation.querySelectorAll('[data-turn]')).toHaveLength(0);
  fireEvent.click(fold);
  const turns = conversation.querySelectorAll('[data-turn]');
  expect(turns).toHaveLength(2);
  expect(turns[0].textContent).toContain('Which page fell most?');
  expect(within(turns[0] as HTMLElement).getByText('smartsheet')).toBeTruthy();
  // The quote shows as a line above the question, not as raw Markdown.
  expect(turns[1].textContent).toContain('O-5 Opportunity b');
  expect(turns[1].textContent).not.toContain('](');
  // The data the answer read is folded.
  const tools = within(turns[1] as HTMLElement).getByRole('button', {
    name: /strategy.toolsUsed:2/,
  });
  expect(
    within(turns[1] as HTMLElement).queryByText('strategy.toolDailyAnalysis'),
  ).toBeNull();
  fireEvent.click(tools);
  expect(
    within(turns[1] as HTMLElement).getByText('strategy.toolDailyAnalysis'),
  ).toBeTruthy();
  // No questions under the opportunity lines any more.
  const b = screen.getByRole('listitem', { name: 'Opportunity b' });
  expect(within(b).queryByText(/How long/)).toBeNull();
  // And folds again.
  fireEvent.click(fold);
  expect(conversation.querySelectorAll('[data-turn]')).toHaveLength(0);
});

it('today’s message counts only what was decided today; a hand-off from an earlier day stays on its day', async () => {
  // O-30, raised on 10/18 and handed off then as T-27, is listed again by today's analysis.
  fixture.state.insights!.items.push(
    card('old-handed', { no: 30, firstSeenAt: '2026-10-18' }),
  );
  fixture.state.proposals.push({
    id: 'p-old',
    title: '',
    brief: '',
    status: '',
    goalVersion: null,
    evidence: batch('', []).evidence,
    taskId: 27,
    taskNo: 27,
    insight: card('old-handed'),
  });
  fixture.tasks = [
    {
      id: 27,
      title: 'T',
      status: 'todo',
      createdAt: '2026-10-18T09:00:00Z',
      evidence: {},
    },
  ];
  setup();
  const group = await decisionGroup(7);
  await waitFor(() =>
    expect(within(group).getByText('strategy.handedCount:1')).toBeTruthy(),
  );
  expect(group.querySelector('[data-opportunity-id=old-handed]')).toBeNull();
  await showEarlier();
  const day = screen
    .getAllByRole('region')
    .find((r) => r.getAttribute('aria-label')?.includes('10'))!;
  expect(day.textContent).toContain('strategy.handedCount:1');
});

it('Ask AI on a line quotes it in the input; sending starts or continues the day’s conversation', async () => {
  setup();
  await decisionGroup(7);
  const b = screen.getByRole('listitem', { name: 'Opportunity b' });
  fireEvent.click(within(b).getByRole('button', { name: 'strategy.askAi' }));
  const input = screen.getByRole('textbox', { name: 'strategy.composerLabel' });
  expect(
    screen.getByRole('button', { name: 'strategy.removeReference' }),
  ).toBeTruthy();
  fireEvent.change(input, { target: { value: 'Why this one?' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(fixture.posts).toHaveLength(1));
  expect(fixture.posts[0]).toEqual({
    path: 'conversations',
    body: {
      requestId: expect.any(String),
      agentId: 'online-default',
      projectId: '1',
      subject: { kind: 'insights', day: '2026-10-21' },
      text: expect.stringMatching(
        /^\[Opportunity b\]\([^)]*\/opportunities\?item=b\)\nWhy this one\?$/,
      ),
    },
  });
  // The quote is cleared after sending.
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'strategy.removeReference' }),
    ).toBeNull(),
  );
  expect(fixture.openChat).not.toHaveBeenCalled();
});

it('a follow-up joins the day’s existing conversation at its revision', async () => {
  fixture.threads = [thread('t-day', '2026-10-21')];
  fixture.details['t-day'] = {
    conversation: { id: 't-day', revision: 4 },
    runs: [run('r1', 'First', 'Answer', '2026-10-21T10:00:00Z')],
  };
  setup();
  const input = await screen.findByRole('textbox', {
    name: 'strategy.composerLabel',
  });
  fireEvent.change(input, { target: { value: 'And then?' } });
  fireEvent.click(screen.getByRole('button', { name: 'strategy.send' }));
  await waitFor(() => expect(fixture.posts).toHaveLength(1));
  expect(fixture.posts[0]).toEqual({
    path: 'conversations/t-day/messages',
    body: { requestId: expect.any(String), revision: 4, text: 'And then?' },
  });
});

it('a question sent before the page has read the day’s conversations still joins the day’s conversation', async () => {
  fixture.threads = [thread('t-day', '2026-10-21')];
  fixture.details['t-day'] = {
    conversation: { id: 't-day', revision: 4 },
    runs: [run('r1', 'First', 'Answer', '2026-10-21T10:00:00Z')],
  };
  let release!: () => void;
  fixture.threadsHeld = new Promise((resolve) => {
    release = resolve;
  });
  setup();
  const input = await screen.findByRole('textbox', {
    name: 'strategy.composerLabel',
  });
  fireEvent.change(input, { target: { value: 'And then?' } });
  fireEvent.click(screen.getByRole('button', { name: 'strategy.send' }));
  release();
  await waitFor(() => expect(fixture.posts).toHaveLength(1));
  expect(fixture.posts[0]).toEqual({
    path: 'conversations/t-day/messages',
    body: { requestId: expect.any(String), revision: 4, text: 'And then?' },
  });
});

it('a side panel opened before the page has read the day’s conversations continues the day’s conversation', async () => {
  fixture.threads = [thread('t-day', '2026-10-21')];
  let release!: () => void;
  fixture.threadsHeld = new Promise((resolve) => {
    release = resolve;
  });
  const view = setup();
  await screen.findByRole('textbox', { name: 'strategy.composerLabel' });
  fixture.panelOpen = true;
  view.rerender();
  release();
  await waitFor(() => expect(fixture.resume).toHaveBeenCalledWith('t-day', ''));
  expect(fixture.openChat).not.toHaveBeenCalled();
});

it('with the side panel open the conversation moves there and the page gives it room', async () => {
  fixture.threads = [thread('t-day', '2026-10-21')];
  fixture.details['t-day'] = {
    conversation: { id: 't-day', revision: 4 },
    runs: [run('r1', 'First', 'Answer', '2026-10-21T10:00:00Z')],
  };
  fixture.areas = [
    {
      id: 'site',
      title: 'Site',
      items: [
        {
          key: 'a',
          text: '54 pages not updated',
          values: [],
          source: 'site',
          to: '/website',
          tone: 'amber',
        },
        // Amber for the audit's warnings, but a zero: neither shown nor counted.
        {
          key: 'audit',
          text: '{0} critical audit issues',
          values: ['0'],
          source: 'site',
          to: '/website',
          tone: 'amber',
        },
      ],
    },
  ];
  const view = setup();
  await waitFor(() =>
    expect(document.querySelector('[data-day-conversation]')).toBeTruthy(),
  );
  fixture.panelOpen = true;
  view.rerender();
  // Opening the panel continues the day's conversation there.
  await waitFor(() => expect(fixture.resume).toHaveBeenCalledWith('t-day', ''));
  expect(document.querySelector('[data-day-conversation]')).toBeNull();
  expect(
    screen.queryByRole('textbox', { name: 'strategy.composerLabel' }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: /strategy.conversationInPanel/ }),
  );
  expect(fixture.resume).toHaveBeenCalledTimes(2);
  // The current situation folds to one line under the day's date.
  expect(screen.queryByText('54 pages not updated')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: /strategy.situationAttention:1/ }),
  );
  expect(await screen.findByText('54 pages not updated')).toBeTruthy();
  // Ask AI on a line now quotes it into the panel's conversation.
  const b = screen.getByRole('listitem', { name: 'Opportunity b' });
  fireEvent.click(within(b).getByRole('button', { name: 'strategy.askAi' }));
  expect(fixture.resume).toHaveBeenLastCalledWith(
    't-day',
    expect.stringMatching(
      /^\[Opportunity b\]\([^)]*\/opportunities\?item=b\)\n$/,
    ),
  );
});

it('earlier days sit above today, folded, and show their conversation when opened', async () => {
  fixture.threads = [thread('t-old', '2026-10-18', { turns: 1 })];
  fixture.details['t-old'] = {
    conversation: { id: 't-old', revision: 1 },
    runs: [
      run('r-old', 'question t-old', 'answer t-old', '2026-10-18T10:00:00Z'),
    ],
  };
  setup();
  await decisionGroup(7);
  // Nothing of the earlier days shows until asked for, and the button sits above today.
  const earlier = await screen.findByRole('button', {
    name: /strategy.earlierAnalyses:1/,
  });
  const feed = screen.getByRole('region', { name: 'strategy.analysisFeed' });
  expect(
    earlier.compareDocumentPosition(
      within(feed).getByRole('group', { name: 'strategy.decideCount:7' }),
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByText(/strategy.dayThreads/)).toBeNull();
  fireEvent.click(earlier);
  const days = screen
    .getAllByRole('region')
    .filter(
      (r) =>
        r.firstElementChild?.tagName === 'H3' &&
        r.getAttribute('aria-label') !== 'strategy.analysisFeed',
    );
  // 10/18: a watch ended and a question was asked (e, raised 10/19, still waits and so stands in today's message).
  expect(days).toHaveLength(1);
  // The question count comes with the conversation list, which may still be on its way.
  await waitFor(() =>
    expect(days[0].textContent).toContain('strategy.dayThreads:1'),
  );
  fireEvent.click(within(days[0]).getByRole('button', { expanded: false }));
  expect(await within(days[0]).findByText('question t-old')).toBeTruthy();
  // They fold again from above them or from just above today.
  const hide = screen.getAllByRole('button', {
    name: /strategy.collapseEarlier/,
  });
  expect(hide).toHaveLength(2);
  fireEvent.click(hide[1]);
  expect(screen.queryByText(/strategy.dayThreads/)).toBeNull();
  expect(
    screen.getByRole('button', { name: /strategy.earlierAnalyses:1/ }),
  ).toBeTruthy();
});

it('the current situation lists a label and a value per line in group order, without a refresh of its own', async () => {
  const item = (
    key: string,
    text: string,
    values: string[] = [],
    group?: string,
  ) => ({
    key,
    text,
    values,
    source: 'site',
    to: '/website',
    ...(group ? { group } : {}),
  });
  fixture.areas = [
    {
      id: 'site',
      title: 'Site',
      items: [
        item('a', 'Pages indexed: 120'),
        item('rule-site-stale', 'Stale pages {0}', ['54'], 'handle'),
        item('rule-gsc-click-drop', 'Pages losing clicks {0}', ['3'], 'worse'),
        item('trends', 'Google interest {0}', ['↓ 56%'], 'voice'),
        item('c', 'Sitemap found'),
        item('rank', '{0} up, {1} down this week', ['3', '0'], 'voice'),
        item('x', 'X mentions {0}', ['58', '↑ 12%'], 'voice'),
        item('striking', '{0} queries close to page one', ['5'], 'chance'),
        // Lines whose numbers are all zero are left out: a count of zero, even with a change beside it.
        item('audit', '{0} critical audit issues', ['0'], 'handle'),
        item(
          'hackernews',
          'Hacker News mentions {0}',
          ['0', '↓ 100%'],
          'voice',
        ),
      ],
    },
  ];
  setup();
  const situation = await screen.findByRole('region', {
    name: 'strategy.currentSituation',
  });
  expect(
    await within(situation).findByText('strategy.situationStale'),
  ).toBeTruthy();
  const rows = within(situation)
    .getAllByRole('listitem')
    .map((l) =>
      [...l.querySelectorAll('button > span')].map((s) => s.textContent),
    );
  // Getting worse, to handle, opportunities, then share of voice and lines without a group; a known line reads as a
  // short label with its value on the right, a line without a label keeps its sentence.
  expect(rows).toEqual([
    ['strategy.situationClickDrop', '3'],
    ['strategy.situationStale', '54'],
    ['strategy.situationStriking', '5'],
    ['Pages indexed: 120'],
    ['strategy.situationTrends', '↓ 56%'],
    ['Sitemap found'],
    ['strategy.situationRank', '↑3↓0'],
    ['strategy.situationX', '58↑ 12%'],
  ]);
  // Getting worse and to handle need attention.
  expect(
    [...situation.querySelectorAll('[data-attention]')].map(
      (b) => (b as HTMLElement).dataset.item,
    ),
  ).toEqual(['rule-gsc-click-drop', 'rule-site-stale']);
  // A count is red when getting worse, amber to handle, plain otherwise; a change is coloured by its direction, as on
  // the metric cards (a zero plain).
  const ink = (key: string) =>
    [
      ...situation.querySelectorAll(
        `[data-item="${key}"] > span:last-child > span`,
      ),
    ].map((v) => `${v.textContent} ${v.className}`);
  expect(ink('rule-gsc-click-drop')).toEqual(['3 text-nr-ink-red']);
  expect(ink('rule-site-stale')).toEqual(['54 text-nr-ink-amber']);
  expect(ink('striking')).toEqual(['5 text-foreground']);
  expect(ink('trends')).toEqual(['↓ 56% text-nr-ink-red']);
  expect(ink('rank')).toEqual(['↑3 text-nr-ink-green', '↓0 text-foreground']);
  expect(ink('x')).toEqual(['58 text-foreground', '↑ 12% text-nr-ink-green']);
  // No icons or logos in the rows (the heading keeps its ⓘ).
  expect(
    situation.querySelector('li svg, li img, [data-slot="source-logo"]'),
  ).toBeNull();
  expect(
    within(situation).queryByRole('button', { name: 'strategy.refreshBlock' }),
  ).toBeNull();
  // The page has one refresh, which runs the analysis again.
  expect(
    screen.getByRole('button', { name: 'strategy.updateAnalysis' }),
  ).toBeTruthy();
});

it('the current situation shows the lines to deal with and six more, the rest on Show all', async () => {
  fixture.areas = [
    {
      id: 'site',
      title: 'Site',
      items: [
        {
          key: 'rule-site-stale',
          text: 'Stale pages {0}',
          values: ['54'],
          source: 'site',
          to: '/website',
          group: 'handle',
        },
        ...Array.from({ length: 8 }, (_, k) => ({
          key: `line-${k}`,
          text: `Line ${k}`,
          values: [],
          source: 'site',
          to: '/website',
        })),
      ],
    },
  ];
  setup();
  const situation = await screen.findByRole('region', {
    name: 'strategy.currentSituation',
  });
  await within(situation).findByText('strategy.situationStale');
  expect(within(situation).getAllByRole('listitem')).toHaveLength(7);
  fireEvent.click(
    within(situation).getByRole('button', {
      name: 'strategy.situationShowAll:9',
    }),
  );
  expect(within(situation).getAllByRole('listitem')).toHaveLength(9);
  fireEvent.click(
    within(situation).getByRole('button', { name: 'common.collapse' }),
  );
  expect(within(situation).getAllByRole('listitem')).toHaveLength(7);
});

it('the current situation shows only the rows its column has room for', async () => {
  // jsdom has no layout: the column is 200px high and scrolls, each row 33px, the list at its top.
  const getStyle = window.getComputedStyle.bind(window);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const spies = [
    vi
      .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute('data-situation-column') ? 200 : 0;
      }),
    vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: Element) {
        return { top: 0, height: this.tagName === 'LI' ? 33 : 0 } as DOMRect;
      }),
    vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((el, pseudo) =>
        el.hasAttribute('data-situation-column')
          ? ({ overflowY: 'auto' } as CSSStyleDeclaration)
          : getStyle(el, pseudo),
      ),
  ];
  try {
    fixture.areas = [
      {
        id: 'site',
        title: 'Site',
        items: [
          {
            key: 'rule-site-stale',
            text: 'Stale pages {0}',
            values: ['54'],
            source: 'site',
            to: '/website',
            group: 'handle',
          },
          ...Array.from({ length: 8 }, (_, k) => ({
            key: `line-${k}`,
            text: `Line ${k}`,
            values: [],
            source: 'site',
            to: '/website',
          })),
        ],
      },
    ];
    setup();
    const situation = await screen.findByRole('region', {
      name: 'strategy.currentSituation',
    });
    await within(situation).findByText('strategy.situationStale');
    // (200 - 28 for Show all) / 33: five rows, the line to deal with and four more.
    await waitFor(() =>
      expect(within(situation).getAllByRole('listitem')).toHaveLength(5),
    );
    expect(
      within(situation).getByRole('button', {
        name: 'strategy.situationShowAll:9',
      }),
    ).toBeTruthy();
  } finally {
    spies.forEach((s) => s.mockRestore());
    vi.unstubAllGlobals();
  }
});

it('a rule line opens its items titled as in the list, handed to the Agent once some are ticked, without a hint', async () => {
  fixture.areas = [
    {
      id: 'search',
      title: 'Search',
      items: [
        {
          key: 'rule-gsc-click-drop',
          text: 'Page search clicks falling',
          values: ['2'],
          source: 'Search performance',
          to: '/seo-opportunities',
          group: 'worse',
          rows: [
            {
              key: 'gsc-click-drop:/a',
              title: '/a clicks down 43%',
              url: 'https://e.com/a',
            },
            {
              key: 'gsc-click-drop:/b',
              title: '/b clicks down 32%',
              url: 'https://e.com/b',
            },
          ],
          total: 2,
          handOff: {
            playbookId: 'optimize-page',
            title: 'Page search clicks falling: {0}',
          },
        },
      ],
    },
  ];
  setup();
  const situation = await screen.findByRole('region', {
    name: 'strategy.currentSituation',
  });
  fireEvent.click(
    await within(situation).findByText('strategy.situationClickDrop'),
  );
  const drawer = await screen.findByRole('dialog');
  expect(
    within(drawer).getByRole('heading', {
      name: 'strategy.situationClickDrop',
    }),
  ).toBeTruthy();
  const handOff = within(drawer).getByRole('button', {
    name: 'common.handOffAgent',
  });
  expect((handOff as HTMLButtonElement).disabled).toBe(true);
  expect(within(drawer).queryByRole('tooltip')).toBeNull();
  fireEvent.click(within(drawer).getAllByRole('checkbox')[1]);
  expect(
    (
      within(drawer).getByRole('button', {
        name: /common.handOffAgent/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});

it('a handed-off opportunity says where its task stands now', async () => {
  fixture.tasks = [
    {
      id: 5,
      title: 'Done task',
      status: 'todo',
      createdAt: '2026-10-21T08:30:00Z',
      evidence: { work: { stage: 'done' } },
    },
  ];
  setup();
  const group = await decisionGroup(7);
  fireEvent.click(
    within(group).getByRole('button', { name: /strategy.moreToDecide/ }),
  );
  const handed = await waitFor(() => {
    const line = group.querySelector('[data-opportunity-id=handed]');
    expect(line?.textContent).toContain('common.completed');
    return line!;
  });
  expect(handed.textContent).not.toContain('strategy.handedOffAgent');
});

it('an opportunity handed off as several tasks shows how many and how many are done, and opens the opportunity', async () => {
  const handed = fixture.state.insights!.items.find((c) => c.id === 'handed')!;
  const proposal = (taskId: number) => ({
    id: `p${taskId}`,
    title: '',
    brief: '',
    status: '',
    goalVersion: null,
    taskId,
    taskNo: taskId,
    insight: handed,
  });
  fixture.state.proposals = [proposal(7), proposal(6), proposal(5)];
  fixture.tasks = [
    {
      id: 5,
      status: '',
      createdAt: '2026-10-21T09:00:00Z',
      evidence: { work: { stage: 'done' } },
    },
    {
      id: 6,
      status: '',
      createdAt: '2026-10-21T09:00:00Z',
      evidence: {
        work: {
          stage: 'flow',
          flow: { stages: [{ kind: 'agent' }] },
          stageIndex: 0,
        },
      },
    },
    { id: 7, status: '', createdAt: '2026-10-21T09:00:00Z', evidence: {} },
  ];
  setup();
  const group = await screen.findByRole('group', {
    name: /strategy.decideCount/,
  });
  fireEvent.click(
    within(group).getByRole('button', { name: /strategy.moreToDecide/ }),
  );
  const line = group.querySelector(
    '[data-opportunity-id=handed]',
  ) as HTMLElement;
  await waitFor(() =>
    expect(
      within(line).getByText('opportunityTasks.progressTag:3,1'),
    ).toBeTruthy(),
  );
  expect(
    within(line)
      .getByText('opportunityTasks.progressTag:3,1')
      .closest('a')!
      .getAttribute('href'),
  ).toBe('/opportunities?item=handed');
});

it('handing off an opportunity with several places asks which ones first', async () => {
  const items = fixture.state.insights!.evidence.signals!.items;
  for (const key of ['top11', 'top15'])
    items.push({
      key,
      type: 'change',
      source: 'gsc',
      title: key,
      facts: [],
      strength: 1,
      actionable: true,
      action: 'optimize',
      url: `https://www.nocobase.com/en/blog/${key}`,
    });
  fixture.state.insights!.items[1] = card('b', {
    priority: 'high',
    signalIds: ['top11', 'top15'],
  });
  const action = fixture.action.getMockImplementation()!;
  fixture.action.mockImplementation(
    (resource: string, name: string, options: { body?: object }) =>
      resource === 'nrStrategy' && name === 'handOffPlan'
        ? Promise.resolve({
            parts: ['top11', 'top15'].map((key) => ({
              key: `page:nocobase.com/en/blog/${key}`,
              kind: 'page',
              url: `https://www.nocobase.com/en/blog/${key}`,
              label: key,
              title: `Update ${key}`,
              playbookId: 'optimize-page',
              signalIds: [key],
            })),
          })
        : action(resource, name, options),
  );
  setup();
  const line = (await decisionGroup(7)).querySelector(
    '[data-opportunity-id=b]',
  ) as HTMLElement;
  fireEvent.click(
    within(line).getByRole('button', { name: 'common.handOffAgent' }),
  );
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('Update top11')).toBeTruthy();
  expect(
    fixture.action.mock.calls.some(([, name]) => name === 'confirmDirection'),
  ).toBe(false);
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: 'opportunityTasks.createTasks:2',
    }),
  );
  await waitFor(() =>
    expect(fixture.action).toHaveBeenCalledWith(
      'nrStrategy',
      'confirmDirection',
      expect.objectContaining({
        body: expect.objectContaining({
          insightId: 'b',
          parts: [
            'page:nocobase.com/en/blog/top11',
            'page:nocobase.com/en/blog/top15',
          ],
        }),
      }),
    ),
  );
});
