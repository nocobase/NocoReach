import { type ServiceToken } from '@nocobase/service-provider';
import type { DemoMode } from './config.js';
import type { DemoDataService } from './data/service.js';
import type { DemoConfigurationService } from './configuration/service.js';
export declare const demoConfigurationToken: ServiceToken<DemoConfigurationService>;
export type { DemoConfigurationService } from './configuration/service.js';
export type * from './configuration/types.js';
/** Which demo mode this application runs in, for plugins that want to adapt, such as by skipping outbound calls. */
export interface DemoModeService {
    readonly mode: DemoMode;
    /** Physical tables, lower-cased, whose writes requests may still make. */
    readonly allowTables: readonly string[];
}
export declare const demoModeServiceToken: ServiceToken<DemoModeService>;
/**
 * The demo dataset an application registers, and importing, clearing and resetting it. An application registers its
 * dataset from a service provider (`register(dataset)`); the demo page drives it through `/api/demoMode/data`.
 */
export declare const demoDataToken: ServiceToken<DemoDataService>;
export type { DemoDataService } from './data/service.js';
export type * from './data/types.js';
export type { DemoModels } from './data/models.js';
export type { DemoAgentAdapter, DemoAgentProxy, } from './configuration/agent-proxy.js';
//# sourceMappingURL=tokens.d.ts.map