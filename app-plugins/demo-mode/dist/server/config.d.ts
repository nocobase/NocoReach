import type { AppConfigAccessor } from '@nocobase/app-server/config';
/**
 * - `off`: the plugin does nothing.
 * - `read-only`: every database write an HTTP request causes is refused before it reaches the database.
 * - `observe`: nothing is refused; each write a request would have been refused is logged, to find what to allow.
 */
export type DemoMode = 'off' | 'read-only' | 'observe';
export interface DemoModeSettings {
    readonly mode: DemoMode;
    /** Physical table names, lower-cased, whose writes requests may still make, such as sign-in sessions. */
    readonly allowTables: ReadonlySet<string>;
    readonly data: DemoDataSettings;
}
/** How the demo dataset an application registers is imported, answered by models and reset on a schedule. */
export interface DemoDataSettings {
    /** Whether startup provisions the dedicated environment model as the default chat model. */
    readonly models: boolean;
    /** Where the model gateway reaches this application's simulated model; derived from the server address when absent. */
    readonly modelBaseUrl?: string;
}
/** The configuration section an application may declare; the environment variables below override it. */
export interface DemoModeConfig {
    readonly mode?: DemoMode;
    readonly allowTables?: readonly string[];
    readonly data?: {
        readonly models?: boolean;
        readonly modelBaseUrl?: string;
    };
}
export declare const DEMO_MODE_ENV = "NOCOBASE_DEMO_MODE";
export declare const DEMO_MODE_ALLOW_TABLES_ENV = "NOCOBASE_DEMO_ALLOW_TABLES";
export declare const DEMO_DATA_MODELS_ENV = "NOCOBASE_DEMO_DATA_MODELS";
export declare const DEMO_DATA_MODEL_BASE_URL_ENV = "NOCOBASE_DEMO_DATA_MODEL_BASE_URL";
/**
 * Tables official plugins write while someone only signs in, signs out or browses: Better Auth's session rows, and
 * its verification rows for one-time codes. Anything else is refused until a deployment allows it.
 */
export declare const DEFAULT_ALLOW_TABLES: readonly string[];
export declare class DemoModeConfigError extends Error {
    constructor(message: string);
}
export declare function resolveDemoModeSettings(config: Pick<AppConfigAccessor, 'get'>, env?: NodeJS.ProcessEnv): DemoModeSettings;
//# sourceMappingURL=config.d.ts.map