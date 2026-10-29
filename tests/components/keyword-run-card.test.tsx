import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { $t, setDictionary } from '../../client/i18n';
import { OnlineTranscript } from '../../client/online-agent/transcript.js';
import { usePageChange } from '../../client/online-agent/page-changes.js';
import type { OnlineRun } from '../../shared/online-agent.js';
import type { KeywordRunProposal } from '../../shared/keyword-run.js';

const { action, access } = vi.hoisted(() => ({
  action: vi.fn(),
  access: { can: true },
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: access.can }),
}));
vi.mock('#lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));

const SEEDS = [
  'internal tool builder',
  'approval workflow',
  'retool alternative',
];
const market = { locationCode: 2840, language: 'en' };
const proposal = (
  over: Partial<KeywordRunProposal> = {},
): KeywordRunProposal => ({
  kind: 'list',
  projectId: '2',
  revision: 'r1',
  market,
  marketChanged: false,
  direction: null,
  before: SEEDS,
  after: ['internal tool builder', 'retool alternative', 'workflow automation'],
  added: ['workflow automation'],
  removed: ['approval workflow'],
  same: false,
  by: 'person',
  notes: [],
  maxUsd: 0.07092,
  reused: 2,
  monthUsd: 0.25,
  budgetUsd: 10,
  withinBudget: true,
  ...over,
});
const runWith = (output: unknown): OnlineRun => ({
  id: 'reply',
  agentId: 'online-default',
  agentName: 'Online Agent',
  requestHash: 'hash',
  ownerId: 'owner',
  projectId: '2',
  conversationId: 'from-keywords',
  sequence: 0,
  model: { modelService: 'service', model: 'test-model' },
  instructions: '',
  input: 'Add or remove a seed word',
  status: 'completed',
  createdAt: '2026-10-28T00:00:00Z',
  startedAt: null,
  finishedAt: null,
  deadline: null,
  holder: null,
  cancelRequested: false,
  output: 'Confirm it in the card.',
  events: [
    { type: 'toolCall', id: 'k1', name: 'propose_keyword_run', args: {} },
    {
      type: 'toolResult',
      id: 'k1',
      name: 'propose_keyword_run',
      output: JSON.stringify(output),
      ok: true,
    },
    { type: 'text', text: 'Confirm it in the card.' },
  ],
  usage: { inputTokens: 1, outputTokens: 1 },
  error: null,
  revision: 0,
});
type View = Record<string, unknown>;
let views: View[];
const listView = (over: View = {}): View => ({
  at: 'r1',
  market,
  seeds: SEEDS,
  stats: { found: 80, picked: 40 },
  items: [],
  digs: [],
  running: null,
  ...over,
});
function Listener({ reload }: { reload: () => void }) {
  usePageChange('keywords', '2', reload);
  return null;
}
const mount = (output: unknown, reload = vi.fn()) =>
  render(
    <MemoryRouter>
      <Listener reload={reload} />
      <OnlineTranscript run={runWith(output)} />
    </MemoryRouter>,
  );
beforeEach(() => {
  setDictionary(null);
  vi.clearAllMocks();
  access.can = true;
  views = [listView()];
  // Each read returns the next state, the last one from then on.
  action.mockImplementation(async (_resource: string, op: string) =>
    op === 'view' || op === 'suggest' || op === 'dig'
      ? views.length > 1
        ? views.shift()
        : views[0]
      : null,
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('a proposed seed change shows the seeds before and after and the cost; Confirm runs it through the page action, follows it and refreshes the page', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const reload = vi.fn();
  mount({ proposal: proposal() }, reload);
  const card = await screen.findByRole('region', {
    name: $t('keywordRun.proposal'),
  });
  await waitFor(() =>
    expect(card).toHaveAttribute('data-keyword-run', 'pending'),
  );
  expect(within(card).getByText($t('keywordRun.added'))).toBeVisible();
  expect(
    within(card).getByText(/^internal tool builder(、|, )retool alternative$/),
  ).toBeVisible();
  expect(within(card).getByText('approval workflow')).toHaveClass(
    'line-through',
  );
  expect(within(card).getByText('workflow automation')).toHaveClass(
    'text-primary',
  );
  expect(card.querySelector('[data-keyword-run-cost]')?.textContent).toBe(
    `${$t('keywordSuggestions.seedsCost', { 0: '0.08' })}${$t('keywordSuggestions.seedsReused', { 0: 2 })} · ${$t('keywordSuggestions.seedsMonth', { 0: '0.25', 1: '10.00' })}`,
  );
  // Confirm's reply, the read its own page-change notice makes, then the finished list on the next poll.
  views = [
    listView({ running: { stage: 'lookup', mode: 'list' } }),
    listView({ running: { stage: 'lookup', mode: 'list' } }),
    listView({
      at: 'r2',
      seeds: proposal().after,
      stats: { found: 120, picked: 38 },
      items: Array.from({ length: 38 }, () => ({})),
    }),
  ];
  fireEvent.click(
    within(card).getByRole('button', { name: $t('keywordRun.confirm') }),
  );
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrKeywordSuggest',
      'suggest',
      expect.objectContaining({
        body: {
          projectId: '2',
          seeds: proposal().after,
          notes: [],
          by: 'person',
          market,
        },
      }),
    ),
  );
  expect(
    await within(card).findByText($t('keywordSuggestions.stage.lookup')),
  ).toBeVisible();
  expect(reload).toHaveBeenCalled();
  const before = reload.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3100);
  });
  await waitFor(() => expect(card).toHaveAttribute('data-keyword-run', 'done'));
  expect(
    within(card).getByText($t('keywordRun.found', { 0: 120, 1: 38 })),
  ).toBeVisible();
  expect(
    within(card).getByRole('link', { name: $t('common.view') }),
  ).toHaveAttribute('href', '/keywords?tab=suggest');
  expect(reload.mock.calls.length).toBeGreaterThan(before);
});

test('the same seeds say so instead of a silent refresh; past the budget or without permission there is nothing to confirm', async () => {
  mount({
    proposal: proposal({
      after: SEEDS,
      added: [],
      removed: [],
      same: true,
      by: 'ai',
      maxUsd: 0.0192,
      reused: 3,
    }),
  });
  const card = await screen.findByRole('region', {
    name: $t('keywordRun.proposal'),
  });
  await waitFor(() =>
    expect(card).toHaveAttribute('data-keyword-run', 'pending'),
  );
  expect(within(card).getByText($t('keywordRun.same'))).toBeVisible();
  expect(within(card).queryByText($t('keywordRun.added'))).toBeNull();
  cleanup();
  mount({
    proposal: proposal({ withinBudget: false, monthUsd: 9.95, maxUsd: 0.291 }),
  });
  const poor = await screen.findByRole('region', {
    name: $t('keywordRun.proposal'),
  });
  await waitFor(() =>
    expect(poor).toHaveAttribute('data-keyword-run', 'pending'),
  );
  expect(within(poor).getByRole('alert').textContent).toBe(
    $t('keywordSuggest.budgetTooLow', { 0: '0.05', 1: '0.30' }),
  );
  expect(
    within(poor).queryByRole('button', { name: $t('keywordRun.confirm') }),
  ).toBeNull();
  cleanup();
  access.can = false;
  mount({ proposal: proposal() });
  const viewer = await screen.findByRole('region', {
    name: $t('keywordRun.proposal'),
  });
  await waitFor(() =>
    expect(viewer).toHaveAttribute('data-keyword-run', 'pending'),
  );
  expect(
    within(viewer).queryByRole('button', { name: $t('keywordRun.confirm') }),
  ).toBeNull();
});

test('a list that moved on makes the proposal out of date; a dig proposal confirms through dig and links its group', async () => {
  views = [listView({ at: 'r9', seeds: ['something else'] })];
  mount({ proposal: proposal() });
  const old = await screen.findByRole('region', {
    name: $t('keywordRun.proposal'),
  });
  await waitFor(() =>
    expect(old).toHaveAttribute('data-keyword-run', 'outdated'),
  );
  expect(within(old).getByText($t('keywordRun.outdated'))).toBeVisible();
  expect(
    within(old).queryByRole('button', { name: $t('keywordRun.confirm') }),
  ).toBeNull();
  cleanup();
  const dig = proposal({
    kind: 'dig',
    direction: 'approval workflow',
    before: [],
    after: ['approval workflow'],
    added: ['approval workflow'],
    removed: [],
    by: 'ai',
    notes: [
      {
        seed: 'approval workflow',
        from: ['direction'],
        why: 'The direction asked for',
      },
    ],
  });
  views = [listView()];
  mount({ proposal: dig });
  const card = await screen.findByRole('region', {
    name: $t('keywordRun.proposal'),
  });
  await waitFor(() =>
    expect(card).toHaveAttribute('data-keyword-run', 'pending'),
  );
  expect(within(card).getByText($t('keywordRun.newGroup'))).toBeVisible();
  expect(
    within(card).getByText(
      $t('keywordRun.because', { 0: 'The direction asked for' }),
      { exact: false },
    ),
  ).toBeVisible();
  views = [
    listView({
      digs: [
        {
          id: 'g1',
          direction: 'approval workflow',
          seeds: ['approval workflow'],
          at: 'r2',
          items: [{}, {}],
        },
      ],
    }),
  ];
  fireEvent.click(
    within(card).getByRole('button', { name: $t('keywordRun.confirm') }),
  );
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrKeywordSuggest',
      'dig',
      expect.objectContaining({
        body: expect.objectContaining({
          seeds: ['approval workflow'],
          direction: 'approval workflow',
          by: 'ai',
        }),
      }),
    ),
  );
  await waitFor(() => expect(card).toHaveAttribute('data-keyword-run', 'done'));
  expect(within(card).getByText($t('keywordRun.dug', { 0: 2 }))).toBeVisible();
  expect(
    within(card).getByRole('link', { name: $t('common.view') }),
  ).toHaveAttribute('href', '/keywords?tab=suggest&group=g1');
});

test('Confirm while NocoReach is not answering says so, reads the list again and stays to try again', async () => {
  mount({ proposal: proposal() });
  const card = await screen.findByRole('region', {
    name: $t('keywordRun.proposal'),
  });
  await waitFor(() =>
    expect(card).toHaveAttribute('data-keyword-run', 'pending'),
  );
  const reads = () =>
    action.mock.calls.filter(([, op]) => op === 'view').length;
  const before = reads();
  // A gateway's bare 502 while NocoReach restarts: no envelope of NocoReach's own.
  action.mockImplementationOnce(async () => {
    throw Object.assign(new Error('common.serviceUnavailable'), {
      status: 502,
      payload: '<html>Bad gateway</html>',
    });
  });
  fireEvent.click(
    within(card).getByRole('button', { name: $t('keywordRun.confirm') }),
  );
  expect(await within(card).findByRole('alert')).toHaveTextContent(
    $t('common.serviceUnavailable'),
  );
  await waitFor(() => expect(reads()).toBeGreaterThan(before));
  expect(
    within(card).getByRole('button', { name: $t('keywordRun.confirm') }),
  ).toBeEnabled();
  // No answer at all reads the same, never as the browser's own words.
  action.mockImplementationOnce(async () => {
    throw new TypeError('Failed to fetch');
  });
  fireEvent.click(
    within(card).getByRole('button', { name: $t('keywordRun.confirm') }),
  );
  await waitFor(() =>
    expect(within(card).getByRole('alert')).toHaveTextContent(
      $t('common.serviceUnavailable'),
    ),
  );
  expect(within(card).queryByText('Failed to fetch')).toBeNull();
});
