import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { type AppApiRouteContribution } from '@nocobase/app-server/router';
/**
 * An OpenAI-compatible chat model served by the application itself, which the simulated model environment service
 * points at. Answers come from the dataset's scripts; the key the service was given is the only credential.
 */
export declare const modelRoutes: AppApiRouteContribution<AppPluginApplication>;
//# sourceMappingURL=models.d.ts.map