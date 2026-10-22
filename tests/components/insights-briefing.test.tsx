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
  details: {} as Record<string, unknown>,
  posts: [] as { path: string; body: unknown }[],
  panelOpen: false,
  state: undefined as unknown as StrategyState,
  tasks: [] as unknown[],
  cards: [] as unknown[],
  areas: [] as unknown[],
  runs: [] as unknown[],
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
  return {
    useMessageState: (await import('react')).useState,
    $t: text,
    $tj: text,
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
    if (path === 'threads?projectId=1') return fixture.threads;
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
  fixture.action.mockReset();
  fixture.openChat.mockReset();
  fixture.resume.mockReset();
  fixture.threads = [];
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
        return Promise.resolve({ running: false, runs: fixture.runs });
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
      ],
    },
  ];
  setup();
  const tiles = await screen.findByRole('region', {
    name: 'strategy.keyMetrics',
  });
  await within(tiles).findByText('1,200');
  expect(within(tiles).getAllByRole('link')).toHaveLength(5);
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
  // No Refresh beside the tiles; All data is gone.
  expect(within(tiles).queryByRole('button')).toBeNull();
  expect(screen.queryByText('strategy.allData')).toBeNull();
});

it('a run of the daily workflow links to Settings › Automatic runs', async () => {
  fixture.runs = [{ ok: true, trigger: 'workflow' }];
  setup();
  const link = await screen.findByRole('link', {
    name: 'strategy.dailyAutomatic',
  });
  expect(link.getAttribute('href')).toBe('/schedules');
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
  expect(days[0].textContent).toContain('strategy.dayThreads:1');
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

it('the current situation beside the day lists every line, those needing attention first, without a refresh of its own', async () => {
  const item = (key: string, text: string, tone?: string) => ({
    key,
    text,
    values: [],
    source: 'site',
    to: '/website',
    ...(tone ? { tone } : {}),
  });
  fixture.areas = [
    {
      id: 'site',
      title: 'Site',
      items: [
        item('a', 'Pages indexed: 120'),
        item('b', '54 pages not updated for a year', 'amber'),
        item('c', 'Sitemap found'),
        item('d', 'No critical audit issues'),
      ],
    },
  ];
  setup();
  const situation = await screen.findByRole('region', {
    name: 'strategy.currentSituation',
  });
  expect(
    await within(situation).findByText('54 pages not updated for a year'),
  ).toBeTruthy();
  const lines = within(situation)
    .getAllByRole('listitem')
    .map((l) => l.textContent);
  expect(lines).toEqual([
    '54 pages not updated for a year',
    'Pages indexed: 120',
    'Sitemap found',
    'No critical audit issues',
  ]);
  expect(
    within(situation).queryByRole('button', { name: 'strategy.refreshBlock' }),
  ).toBeNull();
  // The page has one refresh, which runs the analysis again.
  expect(
    screen.getByRole('button', { name: 'strategy.updateAnalysis' }),
  ).toBeTruthy();
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
