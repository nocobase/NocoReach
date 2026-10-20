import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { type ClientApplication, resolveAppBase } from '@nocobase/app-client';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClientRoute } from '../../client/routing/client-route.js';
import { DefaultClientServiceProvider } from '../../client/service-provider.js';

const fixture = vi.hoisted(() => ({ prepare: vi.fn(), allowed: true }));
vi.mock('../../client/i18n/index.js', async (original) => ({
  ...(await original<typeof import('../../client/i18n/index.js')>()),
  prepareBusinessLocale: fixture.prepare,
  connectLocale: () => () => undefined,
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({ can: fixture.allowed, isPending: false }),
}));
vi.mock('../../client/routing/navigation-data.js', () => ({
  NavigationData: () => null,
}));

beforeEach(() => {
  fixture.allowed = true;
  fixture.prepare
    .mockReset()
    .mockImplementation(() => new Promise<void>(() => {}));
});
afterEach(() => {
  history.replaceState(null, '', '/');
});
function route(
  name: string,
  extra: Partial<AppClientRegisteredRoute> = {},
): AppClientRegisteredRoute {
  return {
    id: name,
    name,
    path: '/' + name,
    auth: 'required',
    authz: 'skip',
    source: 'application',
    packageName: 'nocoreach',
    componentLoader: vi.fn(async () => ({
      default: () => <h1>Page ready</h1>,
    })),
    ...extra,
  };
}

it.each([
  'home',
  'inbox',
  'login',
  'register',
  'forgot-password',
  'reset-password',
  'device',
])(
  '%s renders without loading or waiting for business catalogs',
  async (name) => {
    const page = route(name);
    render(<ClientRoute route={page} />);
    expect(await screen.findByText('Page ready')).toBeVisible();
    expect(fixture.prepare).not.toHaveBeenCalled();
  },
);

it('leaves plugin catalogs to their owning namespace', async () => {
  render(
    <ClientRoute
      route={route('settings', { source: 'plugin', packageName: 'example' })}
    />,
  );
  expect(await screen.findByText('Page ready')).toBeVisible();
  expect(fixture.prepare).not.toHaveBeenCalled();
});

it.each([
  ['growth-overview', 'workspace'],
  ['members', 'all'],
  ['member-invitations', 'all'],
])(
  '%s waits for its %s copy before evaluating the page',
  async (name, scope) => {
    let ready!: () => void;
    fixture.prepare.mockReturnValue(
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
    );
    const page = route(name);
    render(<ClientRoute route={page} />);
    expect(fixture.prepare).toHaveBeenCalledExactlyOnceWith(scope);
    expect(page.componentLoader).not.toHaveBeenCalled();
    await act(async () => {
      ready();
    });
    expect(await screen.findByText('Page ready')).toBeVisible();
  },
);

it('does not prepare a denied business page', () => {
  fixture.allowed = false;
  const page = route('members', { authz: 'pages.members' });
  render(<ClientRoute route={page} />);
  expect(fixture.prepare).not.toHaveBeenCalled();
  expect(page.componentLoader).not.toHaveBeenCalled();
});

it.each([
  '/login',
  '/register',
  '/device',
  '/inbox',
  '/plugin/settings',
  '/members',
])('startup does not eagerly load business catalogs for %s', async (path) => {
  history.replaceState(null, '', resolveAppBase().replace(/\/$/, '') + path);
  const provider = new DefaultClientServiceProvider({
    runtime: { i18n: {} },
    container: { instance: vi.fn() },
  } as unknown as ClientApplication);
  try {
    provider.register();
    expect(fixture.prepare).not.toHaveBeenCalled();
  } finally {
    await provider.shutdown();
  }
});

it.each(['/', '/home', '/opportunities', '/actions'])(
  'startup warms only workspace copy for %s without waiting for it',
  async (path) => {
    history.replaceState(null, '', resolveAppBase().replace(/\/$/, '') + path);
    const provider = new DefaultClientServiceProvider({
      runtime: { i18n: {} },
      container: { instance: vi.fn() },
    } as unknown as ClientApplication);
    try {
      provider.register();
      expect(fixture.prepare).toHaveBeenCalledExactlyOnceWith('workspace');
    } finally {
      await provider.shutdown();
    }
  },
);
