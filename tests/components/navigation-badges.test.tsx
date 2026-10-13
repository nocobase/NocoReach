import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import appRoutes from '../../client/routes';
import enUS from '../../client/locales/en-US';
import english from '../../shared/i18n/en.json';
import { setDictionary } from '../../client/i18n';
import {
  NavBadgeProvider,
  refreshNavBadges,
} from '../../client/components/app-shell/nav-badges';
import {
  AppSidebar,
  AppSidebarProvider,
  AppSidebarToggle,
} from '../../client/layouts/components/app-sidebar';
import { NavigationMenu } from '../../client/layouts/components/navigation-menu';
import {
  buildRouteNavigation,
  routeKey,
} from '../../client/routing/route-navigation';
const fixture = vi.hoisted(() => ({
  action: vi.fn(),
  project: { id: 1 },
  counts: { insights: 1, opportunities: 9, tasks: 100 },
  fail: false,
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action: fixture.action, wrapRequests: vi.fn() },
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: fixture.project }),
}));
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: 'u', role: 'member' } }),
}));
const runtime = await createTestI18nRuntime({
  application: { namespace: 'nocoreach', resources: enUS },
});
const routes = resolveAppClientContributions([
  { packageName: 'nocoreach', routes: appRoutes, source: 'application' },
]).routes;
const items = buildRouteNavigation(routes, new Set()).filter((item) =>
  ['/home', '/opportunities', '/actions'].includes(item.route.path),
);
function tree(scope = 'session-a') {
  return (
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter>
        <NavBadgeProvider key={scope}>
          <AppSidebarProvider>
            <AppSidebar label='Navigation'>
              <NavigationMenu
                items={items}
                label='Business menu'
                selectedKey={routeKey(items[2].route)}
              />
            </AppSidebar>
            <AppSidebarToggle />
          </AppSidebarProvider>
        </NavBadgeProvider>
      </MemoryRouter>
    </TestI18nProvider>
  );
}
const badges = () => Array.from(document.querySelectorAll('[data-nav-count]'));
beforeEach(() => {
  localStorage.clear();
  setDictionary(english);
  fixture.project = { id: 1 };
  fixture.counts = { insights: 1, opportunities: 9, tasks: 100 };
  fixture.fail = false;
  fixture.action.mockReset();
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  fixture.action.mockImplementation((resource: string) =>
    resource === 'nrHealth'
      ? Promise.resolve({})
      : fixture.fail
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ ...fixture.counts }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  setDictionary(null);
});
it('maps the actual three application menu routes to one badge each and retains selected/text/accessibility state', async () => {
  render(tree());
  await waitFor(() => expect(badges()).toHaveLength(3));
  expect(items.map((item) => item.route.path)).toEqual([
    '/home',
    '/opportunities',
    '/actions',
  ]);
  for (const [index, title] of [
    'Insights',
    'Opportunities',
    'Tasks',
  ].entries()) {
    const link = screen.getByRole('link', { name: new RegExp(`^${title},`) });
    expect(link).toHaveAttribute('href', items[index].route.path);
    expect(within(link).getByText(title)).toBeInTheDocument();
    expect(link.style.paddingInlineEnd).toContain('ch');
    const badge = link.parentElement!.querySelector('[data-nav-count]');
    expect(badge).toHaveAttribute('data-slot', 'sidebar-menu-badge');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(badge).toHaveTextContent(String([1, 9, 100][index]));
  }
  const taskLink = screen.getByRole('link', { name: /^Tasks, / });
  expect(taskLink).toHaveAttribute('aria-current', 'page');
  expect(taskLink).toHaveAttribute('data-active');
  expect(taskLink).toHaveClass(
    'data-active:bg-sidebar-primary',
    'data-active:text-sidebar-primary-foreground',
  );
});
it.each([0, 1, 9, 10, 99, 100])(
  'renders accurate count %s without adding a duplicate task badge',
  async (count) => {
    fixture.counts = { insights: count, opportunities: count, tasks: count };
    render(tree());
    await waitFor(() =>
      expect(fixture.action).toHaveBeenCalledWith(
        'nrStrategy',
        'badges',
        expect.objectContaining({ body: { projectId: '1' } }),
      ),
    );
    await act(async () => {});
    expect(badges()).toHaveLength(count > 0 ? 3 : 0);
    for (const badge of badges()) expect(badge.textContent).toBe(String(count));
    expect(
      screen
        .getByRole('link', { name: count > 0 ? /^Tasks, / : 'Tasks' })
        .parentElement!.querySelectorAll('[data-nav-count]'),
    ).toHaveLength(count > 0 ? 1 : 0);
  },
);
it('clears rendered counts during loading/error and updates after the existing refresh event', async () => {
  render(tree());
  await waitFor(() => expect(badges()).toHaveLength(3));
  let resolve!: (value: unknown) => void;
  const pending = new Promise((r) => {
    resolve = r;
  });
  fixture.action.mockImplementation((resource: string) =>
    resource === 'nrHealth' ? Promise.resolve({}) : pending,
  );
  await act(async () => refreshNavBadges());
  expect(badges()).toHaveLength(0);
  expect(screen.getByRole('link', { name: 'Tasks' })).toBeInTheDocument();
  await act(async () => resolve({ insights: 0, opportunities: 10, tasks: 99 }));
  expect(badges().map((b) => b.textContent)).toEqual(['10', '99']);
  fixture.action.mockImplementation((resource: string) =>
    resource === 'nrHealth'
      ? Promise.resolve({})
      : Promise.reject(new Error('offline')),
  );
  await act(async () => refreshNavBadges());
  expect(badges()).toHaveLength(0);
  expect(screen.getByRole('link', { name: 'Tasks' })).toBeInTheDocument();
});
it('discards visible counts on project and session boundaries and ignores delayed old results', async () => {
  const view = render(tree());
  await waitFor(() => expect(badges()).toHaveLength(3));
  let resolve!: (value: unknown) => void;
  fixture.action.mockImplementation((resource: string) =>
    resource === 'nrHealth'
      ? Promise.resolve({})
      : new Promise((r) => {
          resolve = r;
        }),
  );
  fixture.project = { id: 2 };
  view.rerender(tree());
  expect(badges()).toHaveLength(0);
  await waitFor(() =>
    expect(fixture.action).toHaveBeenCalledWith(
      'nrStrategy',
      'badges',
      expect.objectContaining({ body: { projectId: '2' } }),
    ),
  );
  const oldResolve = resolve;
  view.rerender(tree('session-b'));
  expect(badges()).toHaveLength(0);
  await act(async () =>
    oldResolve({ insights: 999, opportunities: 999, tasks: 999 }),
  );
  expect(badges()).toHaveLength(0);
  await act(async () => resolve({ insights: 10, opportunities: 0, tasks: 1 }));
  expect(badges().map((b) => b.textContent)).toEqual(['10', '1']);
});
it('keeps count in the collapsed link name and tooltip while the primitive hides the visual badge', async () => {
  localStorage.setItem('nocobase:sidebar:collapsed', 'true');
  const user = userEvent.setup();
  render(tree());
  const link = await screen.findByRole('link', { name: /^Tasks, / });
  const badge = link.parentElement!.querySelector('[data-nav-count]');
  expect(badge).toHaveClass('group-data-[collapsible=icon]:hidden');
  expect(link.style.paddingInlineEnd).toContain('3ch');
  await user.hover(link);
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    link.getAttribute('aria-label')!,
  );
});
it('renders the same counts in the mobile sheet and closes the sheet on navigation', async () => {
  vi.stubGlobal('innerWidth', 390);
  const user = userEvent.setup();
  render(tree());
  await waitFor(() => expect(fixture.action).toHaveBeenCalled());
  await user.click(screen.getByRole('button', { name: 'Open navigation' }));
  const sheet = await screen.findByRole('dialog', { name: 'Navigation' });
  await waitFor(() =>
    expect(sheet.querySelectorAll('[data-nav-count]')).toHaveLength(3),
  );
  const link = within(sheet).getByRole('link', { name: /^Tasks, / });
  expect(link.closest('[data-collapsible="icon"]')).toBeNull();
  await user.click(link);
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
});
