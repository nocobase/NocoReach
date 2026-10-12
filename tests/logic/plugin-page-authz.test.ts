// @vitest-environment node

import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.js';

// The plugins whose pages the permission workspace offers as page grants. The AI employee settings are granted under
// System management instead, one settings item per page.
const MANAGEMENT_PAGE_GRANTS = [
  'users',
  'notification.logs',
  'api-keys',
  'database-explorer',
];

describe('plugin page authorization', () => {
  it('offers a page grant for each listed plugin', () => {
    const resolved = resolveAppClientContributions([
      {
        packageName: 'nocoreach',
        source: 'application',
        routes: applicationRoutes,
      },
    ]);
    const pages = entryPages([...resolved.routes]);

    // A page may check another resource type; each plugin still offers a page grant.
    const granted = pages.filter(
      (route) =>
        typeof route.authz === 'object' &&
        route.authz.resource.type === 'page' &&
        route.authz.action === 'access',
    );
    expect(
      granted.map((route) =>
        typeof route.authz === 'object' ? route.authz.resource.id : '',
      ),
    ).toEqual(expect.arrayContaining(MANAGEMENT_PAGE_GRANTS));
  });
});

/** Pages without a page above them: nested pages share their parent's check. */
function entryPages(
  routes: readonly AppClientRegisteredRoute[],
): AppClientRegisteredRoute[] {
  return routes.flatMap((route) =>
    route.componentLoader ? [route] : entryPages(route.children ?? []),
  );
}
