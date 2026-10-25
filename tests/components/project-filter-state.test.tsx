import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { $t, setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import DataTrends from '../../client/pages/data-trends';
import DomainOverview from '../../client/pages/domain-overview';

const state = vi.hoisted(() => ({
  domain: 'example.com',
  view: {
    connected: true,
    product: 'Product',
    maxRivals: 1,
    terms: ['Product', 'Alpha'],
    keywords: [],
    lastRun: { at: '2026-10-25T00:00:00Z', ok: true, errors: [] },
    competitors: [
      { id: 'alpha', name: 'Alpha', included: true },
      { id: 'beta', name: 'Beta', included: false },
    ],
  },
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({
    project: { id: 7, name: 'Product', domains: [state.domain] },
    error: '',
  }),
}));
vi.mock('../../client/pages/workspace-cache', () => ({
  useFreshData: () => ({ data: state.view }),
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    action: vi.fn((_resource: string, action: string) =>
      Promise.resolve(
        action === 'status'
          ? { configured: true, verifiedAt: '2026-10-25' }
          : [],
      ),
    ),
    wrapRequests: vi.fn(),
  },
}));
beforeEach(() => {
  setDictionary(english);
  state.domain = 'example.com';
});
afterEach(() => {
  cleanup();
  setDictionary(null);
});

test('a cleared domain stays empty until the project domain changes', async () => {
  const user = userEvent.setup();
  const page = () => (
    <MemoryRouter>
      <DomainOverview />
    </MemoryRouter>
  );
  const view = render(page());
  const input = await screen.findByRole('textbox', {
    name: $t('domainOverview.domain'),
  });
  await waitFor(() => expect(input).toHaveValue('example.com'));
  await user.clear(input);
  view.rerender(page());
  expect(input).toHaveValue('');
  state.domain = 'new.example.com';
  view.rerender(page());
  await waitFor(() => expect(input).toHaveValue('new.example.com'));
});

test('competitor choices survive renders and unchanged polling results', async () => {
  const user = userEvent.setup();
  const page = () => (
    <MemoryRouter initialEntries={['/?tab=brand']}>
      <DataTrends />
    </MemoryRouter>
  );
  const view = render(page());
  const alpha = screen.getByRole('button', { name: 'Alpha', exact: true });
  expect(alpha).toHaveAttribute('aria-pressed', 'true');
  await user.click(alpha);
  expect(alpha).toHaveAttribute('aria-pressed', 'false');
  state.view = {
    ...state.view,
    competitors: state.view.competitors.map((c) => ({ ...c })),
  };
  view.rerender(page());
  expect(alpha).toHaveAttribute('aria-pressed', 'false');
  state.view = {
    ...state.view,
    competitors: state.view.competitors.map((c) => ({
      ...c,
      included: c.id === 'beta',
    })),
  };
  view.rerender(page());
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Beta', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true'),
  );
});
