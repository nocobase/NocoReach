import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { $t, setDictionary } from '../../client/i18n';
import KeywordResearch from '../../client/pages/keyword-research';
import { countryLabel, languageLabel } from '../../client/pages/keyword-api';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/pages/reach-data.js', () => ({
  useProject: () => ({ project: { id: 2, name: 'Project B' } }),
}));
vi.mock('../../client/pages/keyword-hand-off', () => ({
  KeywordHandOffDialog: () => null,
}));
vi.mock('../../client/pages/strategy/hand-off', () => ({
  HandOffNotice: () => null,
}));
vi.mock('#lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
  resolvePortalUrl: (path: string) => path,
}));

const item = (id: string, keyword: string, volume: number) => ({
  id,
  keyword,
  volume,
  difficulty: 20,
  cpc: 1,
  competition: 0.3,
  intent: 'commercial',
  position: null,
  url: '',
  monthlySearches: [],
});
const ITEMS: Record<string, ReturnType<typeof item>[]> = {
  suggestions: [item('0', '低代码平台', 900), item('1', '低代码 开源', 300)],
  related: [item('0', '低代码平台', 900), item('1', '无代码工具', 500)],
};
let runs: Record<string, unknown>[] = [];

beforeEach(() => {
  setDictionary(null);
  vi.clearAllMocks();
  runs = [];
  action.mockImplementation(
    async (
      _resource: string,
      name: string,
      options: { body: Record<string, unknown> },
    ) => {
      const body = options.body;
      if (name === 'status')
        return {
          configured: true,
          verifiedAt: '2026-11-01',
          monthlyBudgetUsd: 5,
        };
      if (name === 'list') return [];
      if (name === 'ranks') return { connected: false, ranks: {} };
      if (name === 'run') {
        const view = String(body.view);
        const run = {
          id: String(runs.length + 1),
          status: 'completed',
          spec: {
            view,
            target: body.target,
            locationCode: body.locationCode,
            language: body.language,
            limit: body.limit,
            estimatedUsd: 0.024,
            reservationUsd: 0.05,
          },
          result: { items: ITEMS[view] ?? [], totalCount: null },
          costUsd: 0.024,
          createdAt: '2026-11-25T08:00:00Z',
          completedAt: '2026-11-25T08:00:01Z',
        };
        runs.push(run);
        return run;
      }
      if (name === 'getRun') return runs.find((r) => r.id === body.runId);
      return null;
    },
  );
});

test('Singapore in Simplified Chinese with two methods: two queries, shown before, and one merged list naming the methods of each row', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/keywords?tab=research']}>
      <KeywordResearch embedded />
    </MemoryRouter>,
  );
  const country = await screen.findByRole('combobox', {
    name: $t('keywordMarket.country'),
  });
  await user.clear(country);
  await user.type(country, countryLabel(2702));
  await user.click(
    await screen.findByRole('option', { name: countryLabel(2702) }),
  );
  // A country comes with its main language, and offers only the languages DataForSEO has for it.
  const language = screen.getByRole('combobox', {
    name: $t('keywordMarket.language'),
  });
  expect(language).toHaveTextContent(languageLabel('en'));
  await user.click(language);
  expect(
    (await screen.findAllByRole('option')).map((o) => o.textContent),
  ).toEqual([languageLabel('en'), languageLabel('zh-CN')]);
  await user.click(
    screen.getByRole('option', { name: languageLabel('zh-CN') }),
  );

  const plan = () => document.querySelector('[data-query-plan]')?.textContent;
  expect(plan()).toContain(
    $t('keywordResearch.queryPlan', { 0: 1, 1: '0.03' }),
  );
  await user.click(
    screen
      .getAllByRole('button', { name: $t('keywordResearch.method') })
      .find((b) => b.getAttribute('aria-haspopup') === 'menu')!,
  );
  await user.click(
    await screen.findByRole('menuitemcheckbox', {
      name: $t('keyword.relatedSearches'),
    }),
  );
  await user.keyboard('{Escape}');
  expect(plan()).toContain(
    $t('keywordResearch.queryPlan', { 0: 2, 1: '0.05' }),
  );
  // Nothing is looked up before Query is clicked.
  expect(action.mock.calls.filter((c) => c[1] === 'run')).toHaveLength(0);

  await user.type(
    screen.getByRole('textbox', { name: $t('common.keywords') }),
    '低代码',
  );
  await user.click(screen.getByRole('button', { name: $t('common.query') }));
  await waitFor(() =>
    expect(document.querySelectorAll('[data-found-by]')).toHaveLength(3),
  );
  const calls = action.mock.calls
    .filter((c) => c[1] === 'run')
    .map((c) => (c[2] as { body: Record<string, unknown> }).body);
  expect(calls.map((b) => [b.view, b.locationCode, b.language])).toEqual([
    ['suggestions', 2702, 'zh-CN'],
    ['related', 2702, 'zh-CN'],
  ]);
  const row = (keyword: string) =>
    screen.getByText(keyword).closest('tr') as HTMLElement;
  expect(
    within(row('低代码平台')).getByText($t('keyword.containsTerm')),
  ).toBeTruthy();
  expect(
    within(row('低代码平台')).getByText($t('keyword.relatedSearches')),
  ).toBeTruthy();
  expect(
    row('低代码 开源')
      .querySelector('[data-found-by]')
      ?.getAttribute('data-found-by'),
  ).toBe('suggestions');
  expect(
    row('无代码工具')
      .querySelector('[data-found-by]')
      ?.getAttribute('data-found-by'),
  ).toBe('related');
});
