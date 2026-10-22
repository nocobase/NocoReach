import { usePageBreadcrumb } from '@nocobase/app-client';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { usePageTab } from '../../client/hooks/use-page-tab.js';
import { AppLayout } from '../../client/layouts/app-layout.js';
import enUS from '../../client/locales/en-US.js';

// Breadcrumb titles are route data, not keys any namespace owns: the trail translates each through its package's
// namespace with the title itself as `defaultValue`, so the runtime is not strict.
const runtime = await createTestI18nRuntime({
  application: { namespace: '@nocobase/app-template-default', resources: enUS },
  strict: false,
});

function I18n({ children }: { readonly children: ReactNode }) {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

// This shell-only harness has no NocoReach identity/API; the banner is covered by mock-settings.test.tsx.
// Shell-only tests have no authenticated NocoReach member; chat launchers remain hidden.
vi.mock('../../client/pages/me.js', () => ({
  useMe: () => ({ me: undefined }),
}));
vi.mock('../../client/mock-integrations.js', () => ({
  MockIndicator: ({ fallback }: { fallback: ReactNode }) => fallback,
}));

vi.mock('@nocobase/app-plugin-i18n/client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@nocobase/app-plugin-i18n/client')
  >()),
  useSyncServerLocale: () => {},
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useClientApplication: () => ({ runtime: { routes: [] } }),
}));
vi.mock('../../client/routing/route-navigation.js', async (original) => ({
  ...(await original<
    typeof import('../../client/routing/route-navigation.js')
  >()),
  useRouteNavigation: () => ({ items: [], denied: new Set(), loading: false }),
}));
vi.mock('../../client/layouts/components/app-sidebar.js', async (original) => ({
  ...(await original<
    typeof import('../../client/layouts/components/app-sidebar.js')
  >()),
  AppSidebar: () => null,
}));
beforeEach(() =>
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
);
afterEach(() => vi.unstubAllGlobals());
vi.mock('../../client/layouts/components/header-actions.js', () => ({
  HeaderActions: () => null,
}));
// NocoReach's project switcher needs NocoReach's API and request cache; tests/logic/client-shell.test.tsx checks its
// place in the header.
vi.mock('../../client/pages/project-switcher.js', () => ({
  ProjectSwitcher: () => null,
}));

const detail: AppClientRegisteredRoute = {
  id: 'detail',
  name: 'detail',
  packageName: 'test',
  source: 'application',
  auth: 'required',
  path: '/orders/:id',
  breadcrumb: { title: 'Detail' },
  componentLoader: async () => ({ default: () => null }),
};
const routes = [
  {
    ...detail,
    id: 'orders',
    name: 'orders',
    path: '/orders',
    breadcrumb: { title: 'Orders' },
    children: [detail],
  },
];

function OrderPage(): ReactElement {
  usePageBreadcrumb([
    { label: 'Orders', to: '/orders?status=open' },
    { label: 'Order #42' },
  ]);
  return <h1>Order #42</h1>;
}

function renderLayout(
  page: ReactElement,
  url = '/orders/42',
  path = '/orders/:id',
): HTMLElement {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route element={<AppLayout routes={routes} />}>
          <Route path={path} element={page} />
        </Route>
      </Routes>
    </MemoryRouter>,
    { wrapper: I18n },
  );
  return screen.getByRole('banner');
}

it('shows the route trail of a nested page in its header', () => {
  const header = renderLayout(<h1>Detail page</h1>);
  const trail = within(header).getByRole('navigation', { name: 'Breadcrumb' });
  expect(within(trail).getByRole('link', { name: 'Orders' })).toHaveAttribute(
    'href',
    '/orders',
  );
  expect(within(trail).getByText('Detail')).toHaveAttribute(
    'aria-current',
    'page',
  );
  // The header carries the only trail: the page renders none of its own.
  expect(
    screen.getAllByRole('navigation', { name: 'Breadcrumb' }),
  ).toHaveLength(1);
});

it('shows the trail a page declares, with its record names, in place of the route trail', () => {
  const header = renderLayout(<OrderPage />);
  const trail = within(header).getByRole('navigation', { name: 'Breadcrumb' });
  expect(within(trail).getByRole('link', { name: 'Orders' })).toHaveAttribute(
    'href',
    '/orders?status=open',
  );
  expect(within(trail).getByText('Order #42')).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(within(trail).queryByText('Detail')).toBeNull();
});

// jsdom lays nothing out: place the page's heading relative to the top of the element the page scrolls in.
function placeHeading(bottom: number): void {
  const scroller = screen.getByRole('main').firstElementChild as HTMLElement;
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ y: 64, height: 600 }),
  );
  vi.spyOn(
    screen.getByRole('heading', { level: 1 }),
    'getBoundingClientRect',
  ).mockReturnValue(DOMRect.fromRect({ y: bottom - 32, height: 32 }));
  fireEvent.scroll(scroller);
}

it("keeps a top-level page's own title out of the header until the page's heading scrolls away", async () => {
  const header = renderLayout(<h1>Orders</h1>, '/orders', '/orders');
  // The trail would only repeat the heading right below it.
  expect(
    within(header).queryByRole('navigation', { name: 'Breadcrumb' }),
  ).toBeNull();
  expect(
    within(header).getByRole('navigation', {
      name: 'Breadcrumb',
      hidden: true,
    }),
  ).toHaveTextContent('Orders');
  // A top-level page has no level to go back to: the compact header keeps the brand.
  expect(within(header).queryByRole('link', { name: /^Back to/ })).toBeNull();

  placeHeading(40);
  await waitFor(() =>
    expect(
      within(header).getByRole('navigation', { name: 'Breadcrumb' }),
    ).toHaveTextContent('Orders'),
  );

  placeHeading(120);
  await waitFor(() =>
    expect(
      within(header).queryByRole('navigation', { name: 'Breadcrumb' }),
    ).toBeNull(),
  );
});

function TabbedOrders(): ReactElement {
  usePageTab('Open');
  return <h1>Orders</h1>;
}

it("names a top-level page's selected tab after it once the heading scrolls away", async () => {
  const header = renderLayout(
    <TabbedOrders />,
    '/orders?status=open',
    '/orders',
  );
  const scroller = screen.getByRole('main').firstElementChild as HTMLElement;
  const scrollTo = vi.fn();
  scroller.scrollTo = scrollTo;
  placeHeading(40);
  const trail = await waitFor(() =>
    within(header).getByRole('navigation', { name: 'Breadcrumb' }),
  );
  expect(within(trail).getByText('Open')).toHaveAttribute(
    'aria-current',
    'page',
  );
  // The page's own level leads to its default tab, from the top.
  const page = within(trail).getByRole('link', { name: 'Orders' });
  expect(page).toHaveAttribute('href', '/orders');
  fireEvent.click(page);
  expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  // A tab is the page itself, not a level below it: the compact header keeps the brand.
  expect(within(header).queryByRole('link', { name: /^Back to/ })).toBeNull();
});

it('leaves the tab out of the trail of a page below another one', () => {
  function TabbedOrder(): ReactElement {
    usePageTab('Open');
    return <OrderPage />;
  }
  const header = renderLayout(<TabbedOrder />);
  const trail = within(header).getByRole('navigation', { name: 'Breadcrumb' });
  expect(trail).toHaveTextContent('OrdersOrder #42');
  expect(within(trail).queryByText('Open')).toBeNull();
});

it('leads back to the parent level from the compact header of a page below another one', () => {
  const header = renderLayout(<OrderPage />);
  // Where the compact brand would be: the trail does not fit there, and the page has no BackButton of its own.
  expect(
    within(header).getByRole('link', { name: 'Back to Orders' }),
  ).toHaveAttribute('href', '/orders?status=open');
  expect(
    within(header).queryByRole('link', { name: 'NocoReach home' }),
  ).toBeNull();
});

// Chat's network and realtime behavior is checked separately; these tests only exercise layout and locale.
vi.mock('@nocobase/app-plugin-agents/client/chat', () => ({
  ChatProvider: ({ children }: { children: React.ReactNode }) => children,
  useChatPanel: () => ({ available: false }),
}));
