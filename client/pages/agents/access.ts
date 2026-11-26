import type { AppClientRoutePageDefinition } from '@nocobase/app-client/plugins';

// The check a tab of the Agent page shows behind: its route's authz. Keep the routes in client/nocoreach-routes.ts
// on the plugin's authz so a tab shows exactly to those its route admits.
export const routeAccess = ({ authz }: AppClientRoutePageDefinition) =>
  authz === 'skip' ? undefined : authz;

/**
 * The Runtimes tab stays behind the `runtimes` page every role holds (server/access/roles.ts), not the plugin's
 * `agents.runners` read (Agents 2.0.0-beta.19): anyone signed in may add a personal runner and see their own, which
 * the plugin's API still allows; only managers of runners see every runner and share one with the team.
 */
export const RUNTIMES_ACCESS = {
  resource: { type: 'page', id: 'runtimes' },
  action: 'access',
} as const;
