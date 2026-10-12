import { KeyRound, UsersRound } from 'lucide-react';
import authorization from './authorization/routes.js';
import defaultAccess from './authz-default-access/routes.js';
import sharingRules from './authz-sharing-rules/routes.js';
import restrictionRules from './authz-restriction-rules/routes.js';
import scheduler from './scheduler/routes.js';
import databaseExplorer from './database-explorer/routes.js';
import notification from './notification/routes.js';
import { defineAdministrationRoutes } from './routes.js';

// The access identifiers are the original plugin grants, so saved permissions
// remain valid even though the application now owns these page components.
export const settingsRoutes = [
  authorization,
  defaultAccess,
  sharingRules,
  restrictionRules,
  defineAdministrationRoutes('@nocobase/app-plugin-users', [
    {
      name: 'users',
      path: '/users',
      navigation: { title: 'management.users.nav.users', icon: UsersRound },
      authz: { resource: { type: 'page', id: 'users' }, action: 'access' },
      componentLoader: () => import('./users/pages/users-page.js'),
    },
  ]),
  defineAdministrationRoutes('@nocobase/app-plugin-api-keys', [
    {
      name: 'api-keys',
      path: '/api-keys',
      navigation: { title: 'management.api-keys.nav.apiKeys', icon: KeyRound },
      authz: { resource: { type: 'page', id: 'api-keys' }, action: 'access' },
      componentLoader: () => import('./api-keys/pages/api-keys-page.js'),
    },
  ]),
  ...scheduler,
  databaseExplorer,
  notification,
];
