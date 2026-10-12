import {
  ClientApplicationContext,
  type ClientApplication,
  createAppClientConfig,
} from '@nocobase/app-client';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import { AppLayout } from '../../client/layouts/app-layout.js';
vi.mock('@nocobase/app-plugin-i18n/client', () => ({
  useSyncServerLocale: () => {},
}));

// The header's inbox button reads the in-app notification plugin's API, which these tests do not serve; it is
// covered by tests/components/inbox.test.tsx.
vi.mock('../../client/components/inbox-header-button', () => ({
  InboxHeaderButton: () => null,
}));
// NocoReach's project switcher needs NocoReach's API and request cache, and translates with its own `$t`, not the
// shell's namespace; tests/logic/client-shell.test.tsx checks its place in the header.
vi.mock('../../client/pages/project-switcher', () => ({
  ProjectSwitcher: () => null,
}));

vi.mock('../../client/routing/client-route.js', () => ({
  ClientRoute: () => <p>Preferences content</p>,
}));
vi.mock('../../client/theme/index.js', () => ({ ThemeSettings: () => null }));
vi.mock('../../client/layouts/components/user-menu.js', () => ({
  UserMenu: () => null,
}));
vi.mock('../../client/routing/route-navigation.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../client/routing/route-navigation.js')
  >()),
  useRouteNavigation: (routes: readonly AppClientRegisteredRoute[]) => ({
    items: routes.map((route) => ({ route, children: [] })),
    loading: false,
    denied: new Set<string>(),
  }),
}));

const route: AppClientRegisteredRoute = {
  id: 'preferences',
  name: 'preferences',
  path: '/preferences',
  packageName: 'test',
  source: 'application',
  auth: 'optional',
  navigation: { title: 'Preferences' },
  componentLoader: async () => ({ default: () => <p>Preferences content</p> }),
};

/** The page the shell opens on: the header names it. */
const overview: AppClientRegisteredRoute = {
  id: 'overview',
  name: 'overview',
  path: '/',
  packageName: 'test',
  source: 'application',
  auth: 'optional',
  breadcrumb: { title: 'Overview' },
  componentLoader: async () => ({ default: () => null }),
};

async function setup(children: ReactNode, path = '/') {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'test-app',
  });
  runtime.registerApplicationNamespace('test-app', locales);
  await runtime.init('en-US');
  const app = {
    config: createAppClientConfig({ rawConfig: {} }),
    runtime: { routes: [route] },
  } as unknown as ClientApplication;
  render(
    <I18nProvider runtime={runtime}>
      <ClientApplicationContext.Provider value={app}>
        <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
      </ClientApplicationContext.Provider>
    </I18nProvider>,
  );
  return runtime;
}

describe('shell translations', () => {
  it('updates header, footer, tooltips and accessible labels without remounting', async () => {
    const runtime = await setup(<AppLayout routes={[overview]} />);
    // The header's trail, where a tagline used to be.
    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toHaveTextContent('Overview');
    expect(
      screen.getByText('Find the opportunities in your data.'),
    ).toBeVisible();
    await act(() => runtime.changeLanguage('zh-CN'));
    expect(screen.getByRole('navigation', { name: '面包屑' })).toBeVisible();
    expect(screen.getByText('从数据里找机会。')).toBeVisible();
    // NocoReach's slogan; its name is emphasised, not a link to a site.
    expect(
      screen.getByText('帮你做出来。', { exact: false }),
    ).toHaveTextContent('NocoReach 帮你做出来。');
    expect(
      screen.getByRole('button', { name: '展开或收起导航' }),
    ).toHaveAttribute('title', '展开或收起导航');
    expect(
      screen.queryByRole('link', { name: '设置' }),
    ).not.toBeInTheDocument();
    await act(() => runtime.changeLanguage('en-US'));
    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toBeVisible();
  });
});

// Chat's network and realtime behavior is checked separately; these tests only exercise layout and locale.
vi.mock('@nocobase/app-plugin-agents/client/chat', () => ({
  ChatProvider: ({ children }: { children: React.ReactNode }) => children,
  useChatPanel: () => ({ available: false }),
}));
