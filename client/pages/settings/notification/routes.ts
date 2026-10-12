import { defineAdministrationRoutes } from '#pages/settings/routes';
import { type AppClientRouteContribution } from '@nocobase/app-client/plugins';
import { BellRing, FileClock } from 'lucide-react';

export const NOTIFICATION_LOGS_RESOURCE: string = 'notification.logs';

const routes: AppClientRouteContribution = defineAdministrationRoutes(
  '@nocobase/app-plugin-notification',
  [
    {
      name: 'notifications',
      path: '/notifications',
      navigation: { title: 'nav.notifications', icon: BellRing },
      breadcrumb: { title: 'nav.notifications' },
      children: [
        {
          name: 'logs',
          path: '/logs',
          navigation: { title: 'nav.logs', icon: FileClock },
          breadcrumb: { title: 'nav.logs' },
          authz: {
            resource: { type: 'page', id: NOTIFICATION_LOGS_RESOURCE },
            action: 'access',
          },
          componentLoader: () => import('./pages/notification-logs-page.js'),
        },
      ],
    },
  ],
);

export default routes;
