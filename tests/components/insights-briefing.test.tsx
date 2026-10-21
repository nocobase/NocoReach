import { fireEvent, render, screen, within } from '@testing-library/react';
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
  state: undefined as unknown as StrategyState,
  tasks: [] as unknown[],
  cards: [] as unknown[],
  areas: [] as unknown[],
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
  useOptionalOnlineChat: () => ({ open: fixture.openChat }),
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
  PageHeader: () => null,
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
  fixture.action.mockReset();
  fixture.openChat.mockReset();
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
        return Promise.resolve({ running: false, runs: [] });
      if (resource === 'nrPlaybooks') return Promise.resolve({ playbooks: [] });
      throw new Error(`Unexpected request ${resource}/${action}`);
    },
  );
});
function setup() {
  return render(
    <MemoryRouter>
      <WorkspaceCacheProvider>
        <NavBadgeProvider>
          <BadgeProbe />
          <StrategyPage />
        </NavBadgeProvider>
      </WorkspaceCacheProvider>
    </MemoryRouter>,
  );
}
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
  // High first (the newer of the two ahead), unrated last; ignored and handed-off ones never show.
  expect(decisions()).toEqual(['b', 'e', 'd', 'a', 'g']);
  const more = screen.getByRole('button', { name: /strategy.moreToDecide:2/ });
  expect(more.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(more);
  expect(more.getAttribute('aria-expanded')).toBe('true');
  expect(decisions()).toEqual(['b', 'e', 'd', 'a', 'g', 'c', 'f']);
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
});

it('the tiles show at most five numbers that have data, the summary names the ones that moved, and Status opens in a drawer', async () => {
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
  expect(screen.queryByText('Pages indexed: 120')).toBeNull();
  fireEvent.click(await screen.findByText('strategy.situationCount:2'));
  expect(await screen.findByText('Pages indexed: 120')).toBeTruthy();
  expect(screen.getByText('strategy.situationHelp')).toBeTruthy();
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
  const days = screen
    .getAllByRole('region')
    .filter(
      (r) =>
        r.firstElementChild?.tagName === 'H3' &&
        r.getAttribute('aria-label') !== 'strategy.analysisFeed',
    );
  // Newest first: 10/19, when e was raised (still waiting), then 10/18 with two raised and a watch that ended.
  expect(days).toHaveLength(2);
  expect(within(days[0]).getByText('strategy.pendingCount:1')).toBeTruthy();
  const day = days[1];
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

it('Ask AI opens the chat with the analysis day named', async () => {
  setup();
  await decisionGroup(7);
  fireEvent.click(
    screen.getByRole('button', { name: /strategy.askPlaceholder/ }),
  );
  expect(fixture.openChat).toHaveBeenCalledWith({
    draft: expect.stringMatching(/^strategy.askDraft:10\/21/),
    projectId: '1',
  });
});
