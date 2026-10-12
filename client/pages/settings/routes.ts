import {
  defineAppRoutes,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

/**
 * app-client 3 removed the settings surface. NocoReach keeps its existing URLs
 * and shell using ordinary application routes, with the original access grants.
 * The migrated pages retain their plugin translation namespaces.
 */
export function defineAdministrationRoutes(
  namespace: string,
  routes: readonly AppClientRouteDefinition[],
): AppClientRouteContribution {
  const prefix = `management.${namespace.replace('@nocobase/app-plugin-', '')}`;
  const translate = (
    route: AppClientRouteDefinition,
  ): AppClientRouteDefinition => ({
    ...route,
    ...(route.navigation
      ? {
          navigation: {
            ...route.navigation,
            title: route.navigation.title.startsWith('management.')
              ? route.navigation.title
              : `${prefix}.${route.navigation.title}`,
          },
        }
      : {}),
    ...(route.breadcrumb
      ? {
          breadcrumb: { title: `${prefix}.${route.breadcrumb.title}` },
        }
      : {}),
    ...(route.children ? { children: route.children.map(translate) } : {}),
  });
  return defineAppRoutes(
    routes.map((route) =>
      translate({
        ...route,
        auth: 'required',
        ...(route.parent ? {} : { path: `/settings${route.path ?? ''}` }),
      }),
    ),
  );
}
