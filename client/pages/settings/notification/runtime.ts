import { createApiClient, resolveAppUrl } from '@nocobase/app-client';

import { NotificationClient } from './notification-client.js';

let notificationClient: NotificationClient | undefined;

export function getNotificationClient(): NotificationClient {
  notificationClient ??= new NotificationClient(
    createApiClient({ baseURL: resolveAppUrl('/api') }),
  );
  return notificationClient;
}
