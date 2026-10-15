import type { MockProfileSettings } from './api';

export const scenarioLabels: Record<MockProfileSettings['scenario'], string> = {
  normal: 'networkProfiles.scenarios.normal',
  newdata: 'networkProfiles.scenarios.newdata',
  empty: 'networkProfiles.scenarios.empty',
  pagination: 'networkProfiles.scenarios.pagination',
  'rate-limit': 'networkProfiles.scenarios.rateLimit',
  'login-expired': 'networkProfiles.scenarios.loginExpired',
  timeout: 'networkProfiles.scenarios.timeout',
  malformed: 'networkProfiles.scenarios.malformed',
  error: 'networkProfiles.scenarios.error',
  'slow-cancel': 'networkProfiles.scenarios.slowCancel',
};
