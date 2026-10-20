import type { AppClientRoutePageDefinition } from '@nocobase/app-client/plugins';

// The check a tab of the Agent page shows behind: its route's authz. Keep the routes in client/nocoreach-routes.ts
// on the plugin's authz so a tab shows exactly to those its route admits.
export const routeAccess = ({ authz }: AppClientRoutePageDefinition) =>
  authz === 'skip' ? undefined : authz;
