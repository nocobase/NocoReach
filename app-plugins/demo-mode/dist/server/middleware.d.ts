import type { MiddlewareHandler } from 'hono';
import type { DemoModeSettings } from './config.js';
import type { DemoWriteGuard } from './guard.js';
/**
 * The `Server-Timing` metric a response carries when the request had a write refused. Browsers expose it to page
 * scripts through `PerformanceResourceTiming.serverTiming`, so the client plugin notices every refusal without
 * wrapping `fetch` or depending on how an application reads its errors.
 */
export declare const DEMO_SERVER_TIMING_METRIC = "demo-read-only";
export interface DemoModeLogger {
    info(details: object, message: string): void;
    warn(details: object, message: string): void;
}
export interface DemoModeMiddlewareOptions {
    readonly guard: DemoWriteGuard;
    readonly settings: DemoModeSettings;
    /** Guards every connection's current knex client; a reconnect since the last request leaves a new one unguarded. */
    readonly attachConnections: () => Promise<void>;
    readonly logger?: DemoModeLogger;
    readonly runWithPolicy?: (run: () => Promise<void>) => Promise<void>;
    readonly allowed?: () => Promise<readonly {
        table: string;
        statement: string;
    }[]>;
}
/**
 * Runs each request inside the write guard and, when the guard refused a write and the route failed, answers with the
 * demo error instead of whatever the route made of the failure, marked with the `Server-Timing` metric. A route that
 * swallows the failure and still succeeds keeps its answer unmarked: pages commonly make such best-effort writes while
 * reading, and telling the visitor a change was refused when they changed nothing would only confuse them.
 */
export declare function createDemoModeMiddleware(options: DemoModeMiddlewareOptions): MiddlewareHandler;
//# sourceMappingURL=middleware.d.ts.map