import { resolveAppUrl } from '@nocobase/app-client';
export const resolvePortalUrl = resolveAppUrl;
export const resolveNocoBaseSettingsUrl = (path = ''): string => resolveAppUrl(`/settings${path}`);
