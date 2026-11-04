import type {
  AppClientRegisteredRoute,
  AppClientRouteComponentModule,
} from '@nocobase/app-client/plugins';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ClientRoute } from '../../client/routing/client-route.tsx';

const access = vi.hoisted(() => ({ can: true, isPending: false }));

vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => access,
}));

const route: AppClientRegisteredRoute = {
  id: 'recoverable',
  name: 'recoverable',
  path: '/recoverable',
  auth: 'required',
  authz: 'skip',
  packageName: 'test',
  source: 'application',
  componentLoader: async () => {
    throw new Error('Module unavailable');
  },
};

// Loading a lazy route and rendering its error boundary can take longer than Testing Library's one-second default on
// a loaded CI runner. A page that never renders still fails, well inside the 30-second test timeout.
const ROUTE_LOAD_TIMEOUT = { timeout: 10_000 };

const healthyModule: AppClientRouteComponentModule = {
  default: () => <h2>Recovered page</h2>,
};

describe('client route loading beside the access check', () => {
  const guarded: AppClientRegisteredRoute = {
    ...route,
    authz: { resource: { type: 'page', id: 'recoverable' }, action: 'access' },
  };

  it("starts loading a page's code while access is checked, and renders it only once allowed", async () => {
    Object.assign(access, { can: false, isPending: true });
    const componentLoader = vi.fn(async () => healthyModule);
    const { rerender } = render(
      <ClientRoute route={{ ...guarded, componentLoader }} />,
    );
    expect(componentLoader).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Loading page')).toBeVisible();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('Recovered page')).not.toBeInTheDocument();

    Object.assign(access, { can: true, isPending: false });
    rerender(<ClientRoute route={{ ...guarded, componentLoader }} />);
    expect(
      await screen.findByText('Recovered page', {}, ROUTE_LOAD_TIMEOUT),
    ).toBeVisible();
    expect(componentLoader).toHaveBeenCalledTimes(1);
  });

  it('shows Access denied rather than a load failure for a page the user may not open', async () => {
    Object.assign(access, { can: false, isPending: false });
    const componentLoader = vi.fn(async () => {
      throw new Error('Module unavailable');
    });
    render(<ClientRoute route={{ ...guarded, componentLoader }} />);
    expect(
      await screen.findByText('Access denied', {}, ROUTE_LOAD_TIMEOUT),
    ).toBeVisible();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Access denied')).toBeVisible();
    expect(screen.queryByText('Unable to load page')).not.toBeInTheDocument();
    Object.assign(access, { can: true, isPending: false });
  });
});

describe('client route loading recovery', () => {
  it('clears a previous failure when the same mounted route loads successfully', async () => {
    const { rerender } = render(<ClientRoute route={route} />);
    expect(
      await screen.findByText('Unable to load page', {}, ROUTE_LOAD_TIMEOUT),
    ).toBeVisible();

    rerender(
      <ClientRoute
        route={{ ...route, componentLoader: async () => healthyModule }}
      />,
    );

    expect(
      await screen.findByText('Recovered page', {}, ROUTE_LOAD_TIMEOUT),
    ).toBeVisible();
    expect(screen.queryByText('Unable to load page')).not.toBeInTheDocument();
  });

  it('ignores a superseded loader failure after the replacement succeeds', async () => {
    let rejectLoad!: (error: Error) => void;
    const pending = new Promise<AppClientRouteComponentModule>(
      (_resolve, reject) => {
        rejectLoad = reject;
      },
    );
    const { rerender } = render(
      <ClientRoute route={{ ...route, componentLoader: () => pending }} />,
    );
    rerender(
      <ClientRoute
        route={{ ...route, componentLoader: async () => healthyModule }}
      />,
    );
    expect(
      await screen.findByText('Recovered page', {}, ROUTE_LOAD_TIMEOUT),
    ).toBeVisible();

    await act(async () => {
      rejectLoad(new Error('Stale failure'));
      await pending.catch(() => undefined);
    });
    expect(screen.getByText('Recovered page')).toBeVisible();
    expect(screen.queryByText('Unable to load page')).not.toBeInTheDocument();
  });
});
