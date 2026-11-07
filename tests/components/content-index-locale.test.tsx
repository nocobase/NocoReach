// Pages (client/pages/content-index.tsx): the notes the server adds under the Visits, Search clicks and Search
// impressions column help are written in Chinese, range label included; they read in the interface language.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { TooltipProvider } from '#components/ui/tooltip';
import { setDictionary } from '#i18n';
import ContentPage from '#pages/content-index';
import { WorkspaceCacheProvider } from '#pages/workspace-cache';
import english from '../../shared/i18n/en.json';
import { systemMessageText } from '../../shared/i18n/messages';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('#lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: () => {} },
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: 'u' }, session: { id: 's' } },
    isPending: false,
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => 0,
}));
vi.mock('#pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, domains: ['x.com'] } }),
  taskRecords: async () => [],
}));

afterEach(() => setDictionary(null));

const CJK = /[㐀-鿿＀-￯　-〿]/;
const fill = (text: string, label: string) => text.replace('{0}', label);

// What the server answers (server/nocoreach/site-content.ts): every synced day for All time, the top-page samples
// for the other ranges.
const cases = [
  {
    range: 'all',
    note: 'messages.pageFiguresFromSyncedData',
    label: 'rangePicker.allTime',
  },
  {
    range: '28',
    note: 'messages.trafficSearchDataComeTop',
    label: 'common.last28Days',
  },
  {
    range: '6m',
    note: 'messages.trafficSearchDataComeTop',
    label: 'rangePicker.last6Months',
  },
] as const;

const show = async (range: string, limitation: string) => {
  action.mockResolvedValue({
    range,
    cutoff: '2026-10-10',
    ...(range === 'all'
      ? { window: { start: '2025-01-01', end: '2026-10-10', all: true } }
      : {}),
    summary: {
      pages: 1,
      origin: 'https://x.com',
      enriched: 1,
      types: { page: 1 },
    },
    pages: [
      {
        url: 'https://x.com/home',
        type: 'page',
        title: 'Home',
        views: 9,
        clicks: 1,
        impressions: 10,
      },
    ],
    limitations: [limitation],
  });
  const router = createMemoryRouter(
    [
      {
        path: '/content',
        element: (
          <TooltipProvider>
            <WorkspaceCacheProvider>
              <ContentPage />
            </WorkspaceCacheProvider>
          </TooltipProvider>
        ),
      },
    ],
    { initialEntries: [`/content?days=${range}`] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByText('Home');
};
// The column's help opens on hover (client/components/seo/sortable-header.tsx).
const help = async (column: string) => {
  const trigger = screen.getByRole('button', { name: column });
  await userEvent.hover(trigger);
  const tip = await waitFor(() => {
    const el = document.querySelector<HTMLElement>(
      '[data-slot="tooltip-content"]',
    );
    expect(el).toBeTruthy();
    return el!;
  });
  const text = tip.textContent || '';
  await userEvent.unhover(trigger);
  await waitFor(() =>
    expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull(),
  );
  return text;
};

for (const { range, note, label } of cases) {
  it(`shows the ${range} range note of each figure column in English`, async () => {
    setDictionary(english as Record<string, string>);
    await show(range, systemMessageText(note, { 0: systemMessageText(label) }));
    const expected = fill(english[note], english[label]);
    for (const column of ['Visits', 'Search clicks', 'Search impressions']) {
      const text = await help(`Sort by ${column}`);
      expect(text).toContain(expected);
      expect(text).not.toMatch(CJK);
    }
    // The column's own line names the range the page picked.
    expect(await help('Sort by Visits')).toContain(english[label]);
  });
}

it('keeps the note in Chinese in the Chinese interface', async () => {
  const text = systemMessageText('messages.trafficSearchDataComeTop', {
    0: systemMessageText('common.last28Days'),
  });
  await show('28', text);
  expect(await help('按访问排序')).toContain(text);
});
