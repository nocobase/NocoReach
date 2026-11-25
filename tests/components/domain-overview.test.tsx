// Competitors › Domain lookup (client/pages/domain-overview.tsx): a lookup reopened with every keyword page already read
// shows your site's Search Console clicks on all of them, asking in batches the server reads whole, and asks for them on
// a competitor's site too, for the hand-off.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import DomainOverview from '#pages/domain-overview';
import { rankBatches } from '#pages/domain-rank-batches';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('#lib/nocoreach-api', () => ({ nocobaseClient: { action } }));
vi.mock('#pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, domains: ['acme.example'] } }),
}));

const TOTAL = 1312;
const page = (target: string, offset: number) => ({
  id: 100 + offset,
  status: 'completed',
  spec: {
    kind: 'domain',
    view: 'keywords',
    target,
    locationCode: 2840,
    language: 'en',
    ...(offset ? { offset } : {}),
  },
  createdAt: '2026-11-20T00:00:00Z',
  completedAt: '2026-11-20T00:00:00Z',
  result: {
    totalCount: TOTAL,
    summary: { traffic: 9, keywords: TOTAL, top3: 1, top10: 2 },
    items: Array.from({ length: Math.min(100, TOTAL - offset) }, (_, i) => ({
      id: String(i),
      keyword: `word ${offset + i}`,
      url: `https://${target}/`,
      volume: 10,
      difficulty: 5,
      intent: null,
      position: 3,
      traffic: 1,
      keywords: null,
      cpc: null,
    })),
  },
});
const reopened = (target: string) => ({
  ...page(target, 0),
  pages: Array.from({ length: 13 }, (_, i) => page(target, (i + 1) * 100)),
});
let asked: string[][];

beforeEach(() => {
  asked = [];
  action.mockReset();
  action.mockImplementation(
    async (
      resource: string,
      act: string,
      options: { body: { runId?: string; keywords?: string[] } },
    ) => {
      if (resource === 'nrKeywords' && act === 'status')
        return {
          configured: true,
          verifiedAt: '2026-11-01',
          monthlyBudgetUsd: 5,
        };
      if (resource === 'nrDomains' && act === 'list') return [];
      if (resource === 'nrDomains' && act === 'getRun')
        return reopened(
          options.body.runId === '1' ? 'acme.example' : 'rival.example',
        );
      if (resource === 'nrDataViews' && act === 'ranks') {
        const words = options.body.keywords ?? [];
        asked.push(words);
        return {
          connected: true,
          cutoff: '2026-11-20',
          ranks: Object.fromEntries(
            words
              .filter((w) => w === 'word 1311')
              .map((w) => [w, { clicks: 77, position: 4 }]),
          ),
        };
      }
      throw new Error(`unexpected ${resource}.${act}`);
    },
  );
});

const open = (url: string) =>
  render(
    <RouterProvider
      router={createMemoryRouter(
        [{ path: '/research/domain', element: <DomainOverview /> }],
        { initialEntries: [url] },
      )}
    />,
  );

it('groups pages so each site-clicks request stays within 1,000 keywords', () => {
  const pages = reopened('acme.example');
  const batches = rankBatches([pages, ...pages.pages]);
  expect(
    batches.map((b) => b.reduce((n, p) => n + p.result.items.length, 0)),
  ).toEqual([1000, 312]);
});

it('shows your site clicks on the last page of a reopened lookup', async () => {
  open('/research/domain?d=acme.example&loc=2840&lang=en&k=1');
  expect(
    await screen.findByText(/1,312 \/ 共 1,312|1,312 of 1,312 loaded/),
  ).toBeTruthy();
  await waitFor(() => expect(asked).toHaveLength(2));
  expect(asked.map((w) => w.length)).toEqual([1000, 312]);
  await userEvent.click(screen.getByRole('button', { name: /筛选|Filter/ }));
  await userEvent.type(screen.getByLabelText(/^(包含|Include)$/), 'word 1311');
  const row = (await screen.findByText('word 1311')).closest('tr')!;
  expect(row.textContent).toContain('77');
});

it("asks for your site's clicks on a competitor's keywords too", async () => {
  open('/research/domain?d=rival.example&loc=2840&lang=en&k=2');
  expect(
    await screen.findByText(/1,312 \/ 共 1,312|1,312 of 1,312 loaded/),
  ).toBeTruthy();
  await waitFor(() => expect(asked.flat()).toContain('word 1311'));
});
