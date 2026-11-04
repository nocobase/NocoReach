// What pages hand to the Agent is shown on the task page and read by the Agent in the interface language, so its
// punctuation follows that language too (2026-11-02): an English brief read "Scores: Performance 62，Accessibility 94"
// and "- https://x.com/p（Mobile，Nov 2）：Performance 62，LCP 3.8 s" because the separators were written as Chinese marks.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setDictionary } from '#i18n';
import { combineDrafts } from '#pages/hand-off-bar';
import { keywordDraft } from '#pages/keyword-hand-off';
import {
  competitorEventsDraft,
  competitorKeywordsDraft,
  discussionsDraft,
  trackedDraft,
  trendsDraft,
} from '#pages/seo-hand-off';
import { auditDraft } from '#pages/site-audit-draft';
import SiteAudit from '#pages/site-audit';
import english from '../../shared/i18n/en.json';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('#lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
vi.mock('#pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, domains: ['x.com'] } }),
}));

// Chinese and Japanese marks that a template literal used to put between the parts of a line.
const FULL_WIDTH = /[，：；、（）。！？「」]/u;
const fields = (d: {
  title: string;
  objective: string;
  brief: string;
  subject?: string;
}) => [d.title, d.objective, d.brief, d.subject ?? ''].join('\n');

const scores = (p: number) => ({
  performance: p,
  accessibility: 94,
  'best-practices': 96,
  seo: 100,
});
const issue = {
  category: 'performance',
  key: 'unused-javascript',
  title: 'Reduce unused JavaScript',
  description: '',
  value: '1.2 s',
  score: 20,
  savingsMs: 1200,
  savingsBytes: null,
  severity: 'high',
};
const records = [0, 1, 2].map((i) => ({
  id: String(i),
  status: 'completed',
  url: `https://x.com/p${i}`,
  finalUrl: `https://x.com/p${i}`,
  strategy: i % 2 ? 'desktop' : 'mobile',
  createdAt: new Date(Date.UTC(2026, 10, 2) - i * 3600000).toISOString(),
  scores: scores(60 + i),
  metrics: [
    {
      key: 'largest-contentful-paint',
      label: 'LCP',
      value: `${i + 3}.8 s`,
      score: 40,
    },
  ],
  issueCount: 1,
  issues: [issue],
  errorCode: null,
}));
const run = (id: string) => {
  const r = records.find((x) => x.id === id)!;
  return {
    id,
    status: 'completed',
    createdAt: r.createdAt,
    spec: { url: r.url, strategy: r.strategy },
    result: { ...r, version: '12.6.0', scores: scores(62) },
  };
};

function renderPerformance() {
  const router = createMemoryRouter(
    [{ path: '/audit', element: <SiteAudit /> }],
    { initialEntries: ['/audit?view=performance'] },
  );
  return render(<RouterProvider router={router} />);
}

async function handedOffBrief(): Promise<string> {
  await waitFor(() =>
    expect(
      action.mock.calls.some(([, name]) => name === 'confirmDirection'),
    ).toBe(true),
  );
  const [, , { body }] = action.mock.calls.find(
    ([, name]) => name === 'confirmDirection',
  )!;
  return fields(body);
}

describe('hand-off punctuation', () => {
  beforeEach(() => {
    action.mockReset();
    action.mockImplementation(
      async (
        resource: string,
        name: string,
        options: { body: Record<string, unknown> },
      ) => {
        if (resource === 'nrAudit')
          return {
            connected: true,
            total: 1,
            read: 1,
            pending: 0,
            counts: { critical: 0, warning: 0, notice: 0 },
            issues: [],
          };
        if (resource === 'nrStrategy')
          return { revision: name === 'state' ? 1 : 2, proposals: [] };
        if (name === 'status')
          return { connected: true, suggested: 'https://x.com/' };
        if (name === 'list') return records;
        if (name === 'getRun') return run(String(options.body.runId));
        throw new Error(`unexpected ${resource}:${name}`);
      },
    );
    act(() => setDictionary(english));
  });
  afterEach(() => act(() => setDictionary(null)));

  it('hands off a Performance result in English with English punctuation', async () => {
    renderPerformance();
    const table = await screen.findByRole('table');
    await userEvent.click(within(table).getByRole('button', { name: '/p0' }));
    const drawer = await screen.findByRole('dialog');
    await within(drawer).findAllByText('Reduce unused JavaScript', {
      exact: false,
    });
    await userEvent.click(
      within(drawer).getByRole('button', { name: 'Hand off to agent' }),
    );
    const brief = await handedOffBrief();
    expect(brief).toContain(
      'Scores: Performance 62, Accessibility 94, Best practices 96, SEO 100',
    );
    expect(brief).toContain('Metrics: LCP 3.8 s');
    // The check's Lighthouse title follows in parentheses only when its name here reads differently.
    expect(brief).toContain('- [Performance] Reduce unused JavaScript: 1.2 s');
    expect(brief).not.toMatch(FULL_WIDTH);
  });

  it('hands off ticked Performance results in English with English punctuation', async () => {
    renderPerformance();
    const table = await screen.findByRole('table');
    const boxes = within(table).getAllByRole('checkbox');
    await userEvent.click(boxes[1]);
    await userEvent.click(boxes[2]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Hand off to agent' }),
    );
    const brief = await handedOffBrief();
    expect(brief).toMatch(
      /- https:\/\/x\.com\/p\d \((Mobile|Computer), [^)]+\): Performance 6\d, Accessibility 94, Best practices 96, SEO 100, LCP \d\.8 s/,
    );
    expect(brief).toContain('  - [Performance] ');
    expect(brief).not.toMatch(FULL_WIDTH);
  });

  it('builds every data page draft with the punctuation of the interface language', () => {
    const tracked = trackedDraft([
      {
        keyword: 'open source crm',
        market: 'US',
        latest: {
          at: '2026-11-01T08:00:00Z',
          position: 7,
          url: 'https://x.com/crm',
        },
        previous: { at: '2026-10-25T08:00:00Z', position: 9 },
      },
      {
        keyword: 'no code',
        market: 'DE',
        latest: null,
        previous: null,
      },
    ]);
    const events = competitorEventsDraft([
      {
        competitor: 'Rival',
        type: 'page',
        title: 'Pricing',
        url: 'https://rival.com/pricing',
        detail: '',
        at: '2026-11-01T00:00:00Z',
      },
      {
        competitor: 'Other',
        type: 'release',
        title: 'v2',
        url: 'https://other.com/v2',
        detail: '',
        at: '2026-11-01T00:00:00Z',
      },
    ]);
    const drafts = [
      tracked,
      discussionsDraft('GitHub Issues (x/y)', 'issue', [
        {
          title: 'Login fails',
          url: 'https://github.com/x/y/issues/1',
          meta: '3 comments',
        },
        { title: 'Docs', url: 'https://github.com/x/y/issues/2' },
      ]),
      trendsDraft('crm', 'United States', [
        { query: 'crm free', value: 120, kind: 'rising' },
        { query: 'crm', value: 100, kind: 'top' },
      ]),
      competitorKeywordsDraft('rival.com', 'United States', [
        {
          keyword: 'crm',
          position: 3,
          volume: 1000,
          url: 'https://rival.com/crm',
        },
        { keyword: 'erp', position: 8, volume: 500 },
      ]),
      events,
      auditDraft(
        ['Missing title', 'Broken link'].map((title) => ({
          type: title,
          severity: 'warning',
          title,
          description: '',
          job: 'tech',
          count: 2,
          pages: [{ url: 'https://x.com/a', title: 'A', detail: '404' }],
        })),
      ),
      keywordDraft(
        ['crm', 'erp'].map((keyword) => ({
          keyword,
          market: { locationCode: 2840, language: 'en' },
          volume: 1000,
          difficulty: 30,
          intent: 'commercial',
        })),
      ),
    ];
    for (const d of [...drafts, combineDrafts(drafts.slice(0, 2))])
      expect(fields(d)).not.toMatch(FULL_WIDTH);
    expect(tracked.brief).toContain(
      '- open source crm (US): Nov 1 Google rank 7 (https://x.com/crm)',
    );
    expect(tracked.objective).toContain('open source crm, no code');
    expect(events.brief).toContain(
      '- Rival · New pages: Pricing (found Nov 1) https://rival.com/pricing',
    );

    // Chinese keeps its own marks.
    act(() => setDictionary(null));
    const chinese = trackedDraft([
      {
        keyword: 'crm',
        market: '美国',
        latest: {
          at: '2026-11-01T08:00:00Z',
          position: 7,
          url: 'https://x.com/crm',
        },
        previous: null,
      },
      { keyword: 'erp', market: '美国', latest: null, previous: null },
    ]);
    expect(chinese.brief).toContain('- crm（美国）：');
    expect(chinese.brief).toContain('（https://x.com/crm）');
    expect(chinese.objective).toContain('crm、erp');
  });
});
