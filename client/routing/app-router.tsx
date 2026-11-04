import { NavBadgeProvider } from '../components/app-shell/nav-badges.js';
import {
  GuestAuthentication,
  RequiredAuthentication,
} from '@nocobase/app-plugin-authentication/client';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';

import { EMPTY_ARRAY } from '#lib/constants';

import { PermissionGenerationProvider } from '#hooks/use-permission-generation';
import { MeProvider } from '../pages/me.js';
import { WorkspaceCacheProvider } from '../pages/workspace-cache.js';
import { TaskDraftNavigationGuard } from '../pages/task-detail/drafts.js';
import { AppLayout } from '../layouts/app-layout.js';
import { matchRouteTree } from './route-navigation.js';
import { renderRouteTree } from './route-tree.js';
import { SessionPreparation } from './session-preparation.js';
import { StandalonePageLayout } from './standalone-page-layout.js';

export interface AppRouterProps {
  readonly clientRoutes: readonly AppClientRegisteredRoute[];
}

export function AppRouter({ clientRoutes }: AppRouterProps): ReactElement {
  const routeGroups = useMemo(
    () => ({
      guest: clientRoutes.filter((route) => route.auth === 'guest'),
      optional: clientRoutes.filter((route) => route.auth === 'optional'),
      required: filterRouteTree(
        clientRoutes,
        (route) => route.auth === 'required',
      ),
    }),
    [clientRoutes],
  );
  usePreloadOpenedPage(routeGroups.required);

  return (
    <Routes>
      <Route
        element={
          <RequiredAuthentication>
            <SessionPreparation>
              {/* Keep business identity and reports inside the official session boundary. */}
              <PermissionGenerationProvider>
                <MeProvider>
                  <WorkspaceCacheProvider>
                    <TaskDraftNavigationGuard />
                    <NavBadgeProvider>
                      <Outlet />
                    </NavBadgeProvider>
                  </WorkspaceCacheProvider>
                </MeProvider>
              </PermissionGenerationProvider>
            </SessionPreparation>
          </RequiredAuthentication>
        }
      >
        <Route element={<AppLayout routes={routeGroups.required} />}>
          {renderRouteTree(routeGroups.required)}
        </Route>
      </Route>

      <Route
        element={
          <GuestAuthentication>
            <Outlet />
          </GuestAuthentication>
        }
      >
        <Route element={<StandalonePageLayout />}>
          {renderRouteTree(routeGroups.guest)}
        </Route>
      </Route>

      <Route element={<StandalonePageLayout />}>
        {renderRouteTree(routeGroups.optional)}
      </Route>

      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  );
}

/**
 * Starts downloading the code of the page the application was opened at, beside the session, member and permission
 * reads its route waits for. The code is public: signing in and the access check still decide what renders.
 */
function usePreloadOpenedPage(
  routes: readonly AppClientRegisteredRoute[],
): void {
  const { pathname } = useLocation();
  const [opened] = useState(pathname);
  useEffect(() => {
    for (const { route } of matchRouteTree(routes, opened) ?? EMPTY_ARRAY)
      // ClientRoute loads it again and reports a failure itself.
      route.componentLoader?.().catch(() => undefined);
  }, [routes, opened]);
}

/** Pure groups can span shells; a page and its descendants always share their shell. */
function filterRouteTree(
  routes: readonly AppClientRegisteredRoute[],
  predicate: (route: AppClientRegisteredRoute) => boolean,
): AppClientRegisteredRoute[] {
  return routes.flatMap((route) => {
    if (route.componentLoader) return predicate(route) ? [route] : [];
    const children = filterRouteTree(route.children ?? EMPTY_ARRAY, predicate);
    return children.length ? [{ ...route, children }] : [];
  });
}
