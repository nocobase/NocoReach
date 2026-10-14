// 审计 (client/pages/site-audit.tsx, audit-performance.tsx): two tabs since 2026-10-14 — 网站审计 and 性能检查 with every
// Lighthouse check made so far, a row's full result and the earlier checks of the same page and device.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SiteAudit from '#pages/site-audit';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('#lib/nocoreach-api', () => ({ nocobaseClient: { action } }));
vi.mock('#pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, domains: ['x.com'] } }),
}));

const scores = (p: number) => ({
  performance: p,
  accessibility: 94,
  'best-practices': 96,
  seo: 100,
});
const lcp = (v: string) => [
  { key: 'largest-contentful-paint', label: 'LCP', value: v, score: 40 },
];
const record = (i: number, extra: Record<string, unknown> = {}) => ({
  id: String(i),
  status: 'completed',
  url: `https://x.com/p${i}`,
  finalUrl: `https://x.com/p${i}`,
  strategy: i % 2 ? 'desktop' : 'mobile',
  createdAt: new Date(Date.UTC(2026, 9, 14) - i * 3600000).toISOString(),
  scores: scores(40 + i),
  metrics: lcp(`${i} s`),
  issueCount: 1,
  issues: [
    {
      category: 'performance',
      key: 'unused-javascript',
      title: 'Reduce unused JavaScript',
      value: '',
      severity: 'high',
    },
  ],
  errorCode: null,
  ...extra,
});
// 30 checks: two of /pricing on mobile (the newest and an older one), one without a result.
const records = Array.from({ length: 30 }, (_, i) =>
  record(
    i,
    i === 0 || i === 4
      ? {
          url: 'https://x.com/pricing',
          finalUrl: 'https://x.com/pricing',
          strategy: 'mobile',
        }
      : i === 7
        ? {
            status: 'failed',
            scores: null,
            metrics: [],
            issueCount: null,
            issues: [],
            errorCode: 'provider_status_40501',
          }
        : {},
  ),
);
const full = (id: string) => ({
  id,
  status: 'completed',
  createdAt: records.find((r) => r.id === id)!.createdAt,
  spec: { url: 'https://x.com/pricing', strategy: 'mobile' },
  result: {
    url: 'https://x.com/pricing',
    finalUrl: 'https://x.com/pricing',
    strategy: 'mobile',
    version: '12.6.0',
    scores: scores(62),
    metrics: lcp('3.8 s'),
    issues: [
      {
        category: 'performance',
        key: 'unused-javascript',
        title: 'Reduce unused JavaScript',
        description: '',
        value: '1.2 s',
        score: 20,
        savingsMs: 1200,
        savingsBytes: null,
        severity: 'high',
      },
    ],
  },
});

function renderPage(path: string) {
  const router = createMemoryRouter(
    [{ path: '/audit', element: <SiteAudit /> }],
    { initialEntries: [path] },
  );
  return { router, ...render(<RouterProvider router={router} />) };
}

describe('审计', () => {
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
            total: 10,
            read: 10,
            pending: 0,
            counts: { critical: 0, warning: 1, notice: 0 },
            issues: [
              {
                type: 'title',
                severity: 'warning',
                title: '缺标题',
                description: '',
                job: 'content',
                count: 1,
                pages: [],
              },
            ],
          };
        if (name === 'status')
          return { connected: true, suggested: 'https://x.com/' };
        if (name === 'list') return records;
        if (name === 'getRun') return full(String(options.body.runId));
        if (name === 'run') return full('0');
        throw new Error(`unexpected ${resource}:${name}`);
      },
    );
  });

  it('opens on 网站审计 and switches to 性能检查 with every check made so far', async () => {
    const { router } = renderPage('/audit');
    expect(await screen.findByText('缺标题')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: '性能检查' }));
    expect(router.state.location.search).toBe('?view=performance');
    expect(await screen.findByText('共 30 次检查')).toBeTruthy();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(26);
    expect(within(table).getByText('没有结果')).toBeTruthy();
    await userEvent.click(
      within(screen.getByRole('group', { name: '按设备筛选' })).getByRole(
        'button',
        { name: '电脑' },
      ),
    );
    expect(within(table).getAllByRole('row')).toHaveLength(16);
    expect(screen.queryByText('缺标题')).toBeNull();
  });

  it('shows a check in full with the other checks of the same page, and opens one of them', async () => {
    renderPage('/audit?view=performance');
    const table = await screen.findByRole('table');
    await userEvent.click(
      within(table).getAllByRole('button', { name: '/pricing' })[0],
    );
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('没通过的检查（1）')).toBeTruthy();
    expect(within(drawer).getByText('12.6.0', { exact: false })).toBeTruthy();
    const history = drawer.querySelector('[data-page-history]') as HTMLElement;
    const entries = within(history).getAllByRole('button');
    expect(entries).toHaveLength(2);
    expect(entries[0].getAttribute('aria-current')).toBe('true');
    await userEvent.click(entries[1]);
    await waitFor(() =>
      expect(action).toHaveBeenLastCalledWith(
        'nrLighthouse',
        'getRun',
        expect.objectContaining({
          body: expect.objectContaining({ runId: '4' }),
        }),
      ),
    );
  });

  it('runs a check from the form, opens its result and reloads the list; 页面 links fill the address in', async () => {
    renderPage('/audit?lighthouse=https%3A%2F%2Fx.com%2Fpricing');
    const input = await screen.findByRole('textbox', { name: /网址/ });
    expect((input as HTMLInputElement).value).toBe('https://x.com/pricing');
    await screen.findByText('共 30 次检查');
    await userEvent.click(screen.getByRole('button', { name: '检查' }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith(
        'nrLighthouse',
        'run',
        expect.objectContaining({
          body: expect.objectContaining({
            url: 'https://x.com/pricing',
            strategy: 'mobile',
          }),
        }),
      ),
    );
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(
      action.mock.calls.filter(([, name]) => name === 'list'),
    ).toHaveLength(2);
  });
});
