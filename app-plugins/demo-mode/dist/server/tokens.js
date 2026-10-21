import { createServiceToken, } from '@nocobase/service-provider';
export const demoConfigurationToken = createServiceToken('@nocobase/app-plugin-demo-mode/configuration');
export const demoModeServiceToken = createServiceToken('@nocobase/app-plugin-demo-mode/service');
/**
 * The demo dataset an application registers, and importing, clearing and resetting it. An application registers its
 * dataset from a service provider (`register(dataset)`); the demo page drives it through `/api/demoMode/data`.
 */
export const demoDataToken = createServiceToken('@nocobase/app-plugin-demo-mode/data');
//# sourceMappingURL=tokens.js.map