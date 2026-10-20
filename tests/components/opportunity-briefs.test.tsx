import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import OpportunityLibrary from '../../client/pages/strategy/library';
import type {
  Opportunity,
  Signal,
  StrategyState,
} from '../../shared/strategy-model';

const fixture = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action: fixture.action },
}));
vi.mock('../../client/pages/reach-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../client/pages/reach-data')>()),
  useProject: () => ({ project: { id: 1 }, error: '' }),
  taskRecords: async () => [],
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
const state: StrategyState = {
  revision: 3,
  goal: null,
  proposals: [],
  insights: {
    generatedAt: '2026-10-20T01:00:00Z',
    items: [card],
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

it('reads each pending opportunity as a brief with no owner or playbook form', async () => {
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
  expect(brief.textContent).toContain(card.target);
  expect(brief.textContent).toContain(card.audience);
  expect(brief.textContent).toContain(card.objective);
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

it('marks the opportunity a link points to', async () => {
  show('/opportunities?item=o36');
  const brief = await screen.findByRole('article', { name: card.title });
  expect(brief.getAttribute('data-marked')).toBe('true');
});
