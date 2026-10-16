// Keywords › AI suggestions › Market trends (client/pages/keyword-trends.tsx): beside "From the website", hot topics
// with keywords and the numbers that make them hot. A topic filters the table, a row opens the keyword's page over the
// tab, ticked rows are saved, tracked or handed to the Agent with why they are hot, and the category terms can be
// changed. Without DataForSEO it says what to connect instead of looking.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import { KeywordSuggestions } from '#pages/keyword-suggestions';
import { HandOffBar } from '#pages/hand-off-bar';
import type { HandOffKeyword } from '#pages/keyword-hand-off';

const { action, handOff, tracking } = vi.hoisted(() => ({
  action: vi.fn(),
  handOff: vi.fn(),
  tracking: vi.fn(),
}));
vi.mock('#lib/nocoreach-api', () => ({ nocobaseClient: { action } }));
vi.mock('#pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, domains: ['nocobase.com'] } }),
}));
vi.mock('#pages/keyword-hand-off', async (original) => ({
  ...(await original<typeof import('#pages/keyword-hand-off')>()),
  KeywordHandOffDialog: (props: { rows: HandOffKeyword[] }) => {
    handOff(props.rows);
    return null;
  },
  DraftHandOffDialog: () => null,
}));
vi.mock('#pages/rank-tracking-tab', () => ({
  StartTrackingDialog: (props: { keywords: unknown[] }) => {
    tracking(props.keywords);
    return null;
  },
}));
vi.mock('#pages/strategy/hand-off', () => ({ HandOffNotice: () => null }));

const months = (from: number, to: number) =>
  Array.from({ length: 12 }, (_, i) => ({
    year: 2026,
    month: i + 1,
    volume: i === 0 ? from : i === 11 ? to : from,
  }));
const view = (over = {}) => ({
  at: '2026-10-16T02:00:00Z',
  market: { locationCode: 2840, language: 'en' },
  seeds: ['no code', 'ai agent'],
  seedsBy: 'ai',
  dataforseo: true,
  partial: null,
  basis: { candidates: 40, rising: 3, github: 1 },
  topics: [
    {
      id: 't1',
      name: 'AI agent builders',
      why: 'No-code agent builders took off this year.',
      github: {
        topic: 'ai-agents',
        lastWeek: 1240,
        priorAverage: 590,
        total: 9000,
      },
      count: 2,
      volume: 41900,
      fastest: 8387,
      rise: 350,
    },
    {
      id: 't2',
      name: 'Internal tools',
      why: 'Internal tools with AI are growing.',
      github: null,
      count: 1,
      volume: 2900,
      fastest: 320,
      rise: null,
    },
  ],
  items: [
    {
      id: 'k1',
      keyword: 'no-code ai agent builder',
      topicId: 't1',
      reason: 'Comparison searches, a page against others',
      page: null,
      seed: 'ai agent',
      growth: { pct: 8387, from: 390, to: 33100, months: 12 },
      trends: null,
      metrics: {
        volume: 33100,
        difficulty: 42,
        cpc: 3,
        competition: 0.4,
        intent: 'commercial',
        monthlySearches: months(390, 33100),
      },
      site: null,
    },
    {
      id: 'k2',
      keyword: 'ai agent builder open source',
      topicId: 't1',
      reason: 'Open source is our point',
      page: null,
      seed: 'ai agent',
      growth: { pct: 1122, from: 720, to: 8800, months: 12 },
      trends: { rise: 350, term: 'NocoBase' },
      metrics: {
        volume: 8800,
        difficulty: 31,
        cpc: 2,
        competition: 0.3,
        intent: 'informational',
        monthlySearches: months(720, 8800),
      },
      site: {
        position: 18.4,
        clicks: 3,
        impressions: 900,
        page: 'https://www.nocobase.com/blog/ai-agents',
      },
    },
    {
      id: 'k3',
      keyword: 'ai internal tool',
      topicId: 't2',
      reason: 'Closest to the product',
      page: 'https://www.nocobase.com/docs/agents',
      seed: 'internal tool',
      growth: { pct: 320, from: 690, to: 2900, months: 12 },
      trends: null,
      metrics: {
        volume: 2900,
        difficulty: 24,
        cpc: 1,
        competition: 0.2,
        intent: 'informational',
        monthlySearches: months(690, 2900),
      },
      site: null,
    },
  ],
  ...over,
});
function answer(first: object, next: object = first) {
  action.mockImplementation(async (resource: string, act: string) => {
    if (resource === 'nrKeywordTrends' && act === 'view') return first;
    if (resource === 'nrKeywordTrends' && act === 'find') return next;
    if (resource === 'nrKeywordTrends' && act === 'save')
      return { saved: 2, skipped: 0 };
    if (resource === 'nrKeywordSuggest' && act === 'view')
      return {
        items: [],
        market: { locationCode: 2840, language: 'en' },
        dataforseo: true,
      };
    if (resource === 'nrKeywordSuggest' && act === 'suggest')
      return {
        items: [],
        market: { locationCode: 2840, language: 'en' },
        dataforseo: true,
      };
    throw new Error(`unexpected ${resource}/${act}`);
  });
}
function open(url = '/keywords?tab=suggest&from=market') {
  const router = createMemoryRouter(
    [
      {
        path: '/keywords',
        element: (
          <>
            <KeywordSuggestions onSaved={() => {}} />
            <HandOffBar projectId={1} />
          </>
        ),
      },
      { path: '/keywords/detail', element: <p>keyword detail</p> },
      { path: '/connections', element: <p>connections</p> },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}
const calls = (act: string) =>
  action.mock.calls.filter(([r, a]) => r === 'nrKeywordTrends' && a === act);
beforeEach(() => {
  action.mockReset();
  handOff.mockReset();
  tracking.mockReset();
});

it('shows hot topics with their numbers and filters the keywords by topic', async () => {
  answer(view());
  open();
  const card = await screen.findByRole('button', { name: /AI agent builders/ });
  expect(within(card).getByText('最快 +8,387%')).toBeVisible();
  expect(within(card).getByText('合计 41,900/月')).toBeVisible();
  expect(within(card).getByText('Google Trends 上升 +350%')).toBeVisible();
  expect(within(card).getByText('GitHub ai-agents 2.1×')).toBeVisible();
  expect(
    screen.getByText(/按品类词 no code · ai agent 找涨得最快的说法/),
  ).toBeVisible();
  const row = screen.getByText('no-code ai agent builder').closest('tr')!;
  expect(within(row).getByText('12 个月 +8,387%')).toBeVisible();
  expect(within(row).getByText('390 → 33,100')).toBeVisible();
  expect(within(row).getByText('还没有，需要新页面')).toBeVisible();
  const ranked = screen
    .getByText('ai agent builder open source')
    .closest('tr')!;
  expect(within(ranked).getByText('排名 18.4')).toBeVisible();
  expect(
    within(ranked).getByText('720 → 8,800 · Google Trends 上升 +350%'),
  ).toBeVisible();
  const related = screen.getByText('ai internal tool').closest('tr')!;
  expect(within(related).getByText('有相关页面')).toBeVisible();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Internal tools/ }));
  expect(
    screen.getByRole('button', { name: /Internal tools/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    screen.getByRole('tab', { name: 'Internal tools (1)' }),
  ).toHaveAttribute('aria-selected', 'true');
  expect(
    screen.queryByText('no-code ai agent builder'),
  ).not.toBeInTheDocument();
  expect(calls('find')).toHaveLength(0);
});

it('opens a keyword over the tab and keeps the source in the address', async () => {
  answer(view());
  const router = open();
  const user = userEvent.setup();
  await user.click(await screen.findByText('ai internal tool'));
  expect(router.state.location.pathname).toBe('/keywords/detail');
  const params = new URLSearchParams(router.state.location.search);
  expect([
    params.get('kw'),
    params.get('kwLoc'),
    params.get('from'),
    params.get('tab'),
  ]).toEqual(['ai internal tool', '2840', 'market', 'suggest']);
});

it('switches between the website and market trends through the address', async () => {
  answer(view());
  const router = open('/keywords?tab=suggest');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: '市场热点' }));
  expect(new URLSearchParams(router.state.location.search).get('from')).toBe(
    'market',
  );
  expect(await screen.findByText('no-code ai agent builder')).toBeVisible();
  await user.click(screen.getByRole('tab', { name: '从官网出发' }));
  expect(
    new URLSearchParams(router.state.location.search).get('from'),
  ).toBeNull();
});

it('saves, tracks and hands ticked keywords to the Agent with why they are hot', async () => {
  answer(view());
  open();
  const user = userEvent.setup();
  for (const k of ['no-code ai agent builder', 'ai agent builder open source'])
    await user.click(
      within((await screen.findByText(k)).closest('tr')!).getByRole('checkbox'),
    );
  await user.click(screen.getByRole('button', { name: '保存' }));
  expect(calls('save')[0][2]).toMatchObject({
    body: { projectId: 1, ids: ['k1', 'k2'] },
  });
  for (const k of ['no-code ai agent builder', 'ai agent builder open source'])
    await user.click(
      within(screen.getByText(k).closest('tr')!).getByRole('checkbox'),
    );
  await user.click(screen.getByRole('button', { name: '跟踪排名' }));
  expect(tracking).toHaveBeenLastCalledWith([
    {
      keyword: 'no-code ai agent builder',
      market: { locationCode: 2840, language: 'en' },
    },
    {
      keyword: 'ai agent builder open source',
      market: { locationCode: 2840, language: 'en' },
    },
  ]);
  await user.click(screen.getByRole('button', { name: '交给 Agent' }));
  const rows = handOff.mock.lastCall![0] as HandOffKeyword[];
  expect(rows[0]).toMatchObject({
    keyword: 'no-code ai agent builder',
    volume: 33100,
    difficulty: 42,
    intent: 'commercial',
  });
  expect(rows[0].why).toBe(
    'AI agent builders · 12 个月 +8,387% (390 → 33,100) · Comparison searches, a page against others',
  );
  expect(rows[1].rank).toMatchObject({ position: 18.4 });
  const { keywordDraft } = await vi.importActual<
    typeof import('#pages/keyword-hand-off')
  >('#pages/keyword-hand-off');
  expect(keywordDraft(rows).brief).toContain(
    '；为什么现在做：AI agent builders · 12 个月 +8,387%',
  );
});

it('changes the category terms only when they are valid, then finds again with them', async () => {
  answer(view(), view({ seeds: ['mcp server'], seedsBy: 'user' }));
  open();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '改品类词' }));
  const dialog = screen.getByRole('dialog', { name: '改品类词' });
  const input = within(dialog).getByLabelText('品类词');
  expect(input).toHaveValue('no code, ai agent');
  await user.clear(input);
  await user.type(input, 'a, b, c, d, e');
  await user.click(within(dialog).getByRole('button', { name: '重新找热点' }));
  expect(within(dialog).getByText(/请填写 1–4 个品类词/)).toBeVisible();
  expect(input).toHaveFocus();
  expect(calls('find')).toHaveLength(0);
  await user.clear(input);
  await user.type(input, 'MCP Server');
  await user.click(within(dialog).getByRole('button', { name: '重新找热点' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(calls('find')[0][2]).toMatchObject({
    body: { seeds: ['mcp server'] },
  });
  expect(await screen.findByText(/按品类词 mcp server/)).toBeVisible();
});

it('looks the first time it opens, and says what to connect without DataForSEO', async () => {
  answer(
    {
      items: [],
      topics: [],
      seeds: [],
      market: { locationCode: 2840, language: 'en' },
      dataforseo: true,
    },
    view(),
  );
  open();
  expect(await screen.findByText('no-code ai agent builder')).toBeVisible();
  expect(calls('find')).toHaveLength(1);
  cleanup();
  action.mockReset();
  answer({
    items: [],
    topics: [],
    seeds: [],
    market: { locationCode: 2840, language: 'en' },
    dataforseo: false,
  });
  const router = open();
  expect(await screen.findByText('市场热点要用 DataForSEO')).toBeVisible();
  expect(calls('find')).toHaveLength(0);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '去接入' }));
  expect(router.state.location.pathname).toBe('/connections');
});

it('shows a failed search with a retry and keeps found topics when finding again fails', async () => {
  answer({
    items: [],
    topics: [],
    seeds: [],
    market: { locationCode: 2840, language: 'en' },
    dataforseo: true,
  });
  action.mockImplementation(async (resource: string, act: string) => {
    if (act === 'view')
      return {
        items: [],
        topics: [],
        seeds: [],
        market: { locationCode: 2840, language: 'en' },
        dataforseo: true,
      };
    if (act === 'find')
      throw new Error('本月 DataForSEO 预算已用完（$5.00 / $5）');
    throw new Error(`unexpected ${resource}/${act}`);
  });
  open();
  expect(await screen.findByText('市场热点没有找完')).toBeVisible();
  expect(screen.getByRole('button', { name: /重试/ })).toBeVisible();
  cleanup();
  action.mockReset();
  action.mockImplementation(async (resource: string, act: string) => {
    if (act === 'view') return view();
    if (act === 'find') throw new Error('AI 没有整理出可用的热门话题，请重试');
    throw new Error(`unexpected ${resource}/${act}`);
  });
  open();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '重新找热点' }));
  expect(
    await screen.findByText('AI 没有整理出可用的热门话题，请重试'),
  ).toBeVisible();
  expect(screen.getByText('no-code ai agent builder')).toBeVisible();
});
