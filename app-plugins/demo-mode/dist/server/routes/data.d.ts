import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { type AppApiRouteContribution } from '@nocobase/app-server/router';
/** The settings item whose grants open the demo data: `read` for its status, `manage` to import, clear and reset. */
export declare const DEMO_DATA_SETTINGS = "demoMode.data";
/** The demo data endpoints, for whoever holds the demo data settings grant. */
export declare const dataRoutes: AppApiRouteContribution<AppPluginApplication>;
//# sourceMappingURL=data.d.ts.map