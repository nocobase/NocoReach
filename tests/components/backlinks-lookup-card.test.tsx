// A backlinks lookup the online agent proposed shows as a card in the conversation: the view, target, cost and the
// month's spending, and nothing is looked up until the user clicks Look up there. A saved lookup shows done with a
// link to the page, and the button is gone without the run permission or over the budget.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { $t, setDictionary } from '../../client/i18n';
import { OnlineTranscript } from '../../client/online-agent/transcript.js';
import type { OnlineRun } from '../../shared/online-agent.js';
import type { BacklinksLookupProposal } from '../../shared/backlinks.js';

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

const proposal = (
  over: Partial<BacklinksLookupProposal> = {},
): BacklinksLookupProposal => ({
  projectId: '2',
  view: 'gap',
  target: 'acme.example',
  competitors: ['a.example', 'b.example'],
  estimatedUsd: 0.0552,
  monthUsd: 1.25,
  budgetUsd: 5,
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
  conversationId: 'c',
  sequence: 0,
  model: { modelService: 'service', model: 'test-model' },
  instructions: '',
  input: 'Which sites link to competitors but not to us?',
  status: 'completed',
  createdAt: '2026-11-10T00:00:00Z',
  startedAt: null,
  finishedAt: null,
  deadline: null,
  holder: null,
  cancelRequested: false,
  output: 'Look it up on the card.',
  events: [
    { type: 'toolCall', id: 'b1', name: 'backlinks', args: {} },
    {
      type: 'toolResult',
      id: 'b1',
      name: 'backlinks',
      output: JSON.stringify(output),
      ok: true,
    },
    { type: 'text', text: 'Look it up on the card.' },
  ],
  usage: { inputTokens: 1, outputTokens: 1 },
  error: null,
  revision: 0,
});
const mount = (output: unknown) =>
  render(
    <MemoryRouter>
      <OnlineTranscript run={runWith(output)} />
    </MemoryRouter>,
  );
let saved: unknown;
beforeEach(() => {
  setDictionary(null);
  vi.clearAllMocks();
  access.can = true;
  saved = null;
  action.mockImplementation(async (_resource: string, op: string) =>
    op === 'saved'
      ? saved
      : op === 'run'
        ? {
            id: 42,
            status: 'completed',
            createdAt: '2026-11-10T01:00:00Z',
            completedAt: '2026-11-10T01:00:00Z',
          }
        : null,
  );
});
afterEach(() => cleanup());

test('a proposed lookup costs nothing until Look up on the card runs it through the page action', async () => {
  mount({ saved: false, proposal: proposal() });
  const card = await screen.findByRole('region', {
    name: $t('backlinks.proposalTitle'),
  });
  expect(card.textContent).toContain('acme.example');
  expect(card.textContent).toContain('a.example');
  expect(card.textContent).toContain('$0.055');
  expect(card.textContent).toContain('$1.25 / $5.00');
  expect(action.mock.calls.filter(([, op]) => op === 'run')).toHaveLength(0);
  fireEvent.click(
    await within(card).findByRole('button', { name: $t('common.query') }),
  );
  const link = await within(card).findByRole('link', {
    name: $t('common.view'),
  });
  expect(link.getAttribute('href')).toBe('/backlinks?view=gap&gap=42');
  const runs = action.mock.calls.filter(([, op]) => op === 'run');
  expect(runs).toHaveLength(1);
  expect(runs[0][2].body).toMatchObject({
    projectId: '2',
    view: 'gap',
    target: 'acme.example',
    competitors: ['a.example', 'b.example'],
    requestKey: expect.any(String),
  });
});

test('a lookup saved since shows done; no button without the run permission or over the budget', async () => {
  saved = { id: 9, status: 'completed', createdAt: '2026-11-09T00:00:00Z' };
  mount({
    saved: false,
    proposal: proposal({ view: 'links', competitors: null }),
  });
  const card = await screen.findByRole('region', {
    name: $t('backlinks.proposalTitle'),
  });
  const link = await within(card).findByRole('link', {
    name: $t('common.view'),
  });
  expect(link.getAttribute('href')).toBe(
    '/backlinks?t=acme.example&l=9&bt=links',
  );
  cleanup();
  saved = null;
  access.can = false;
  mount({ saved: false, proposal: proposal() });
  const denied = await screen.findByRole('region', {
    name: $t('backlinks.proposalTitle'),
  });
  await screen.findByText(/acme\.example/);
  expect(
    within(denied).queryByRole('button', { name: $t('common.query') }),
  ).toBeNull();
  cleanup();
  access.can = true;
  mount({ saved: false, proposal: proposal({ withinBudget: false }) });
  const over = await screen.findByRole('region', {
    name: $t('backlinks.proposalTitle'),
  });
  expect(await within(over).findByRole('alert')).toBeTruthy();
  expect(
    within(over).queryByRole('button', { name: $t('common.query') }),
  ).toBeNull();
});

test('a saved lookup the tool read stays a folded tool call', async () => {
  mount({ saved: true, rows: [] });
  expect(
    screen.queryByRole('region', { name: $t('backlinks.proposalTitle') }),
  ).toBeNull();
});
