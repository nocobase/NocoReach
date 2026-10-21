import { type ServiceToken } from '@nocobase/service-provider';
import type { DemoModeSettings } from './config.js';
import { type SqlWrite } from './sql.js';
/** What the guard knows about one HTTP request while it runs. */
export interface DemoRequestState {
    readonly method: string;
    readonly path: string;
    /** Writes refused, or in `observe` mode the writes that would have been. */
    readonly blocked: SqlWrite[];
    /** Set only by the startup probe, which must be refused in every mode. */
    readonly probe?: boolean;
    /** Refuse writes to allowed tables too, for requests that would misuse them, such as ending other visitors' sessions. */
    readonly strict?: boolean;
    readonly allowed?: readonly {
        table: string;
        statement: string;
    }[];
}
/** The part of a knex client the guard uses: its `query` event, emitted synchronously before a query runs. */
export interface QueryEventSource {
    on(event: 'query', listener: (query: {
        sql?: unknown;
    }) => void): unknown;
}
export interface GuardedKnex {
    readonly client: QueryEventSource;
}
/**
 * Refuses database writes made on behalf of an HTTP request.
 *
 * A request runs inside `run()`, which puts its state in async-local storage. Each knex client gets one `query`
 * listener; knex emits that event synchronously before it sends a query, from transaction clients too, so throwing
 * there stops the statement before the database sees it. Work with no request around it — migrations, seeds, jobs and
 * schedules — has no state and is never refused.
 */
export declare class DemoWriteGuard {
    private readonly settings;
    private readonly storage;
    private readonly guarded;
    constructor(settings: DemoModeSettings);
    run<T>(state: DemoRequestState, fn: () => T): T;
    /** Only authorized demo lifecycle handlers use this; their background work inherits the same exemption. */
    runDemoData<T>(fn: () => T): T;
    runAllowed<T>(allowed: readonly {
        table: string;
        statement: string;
    }[], fn: () => T): T;
    /** Whether `knex`'s current client is guarded. A reconnect replaces the client, so callers check again. */
    isAttached(knex: GuardedKnex): boolean;
    attach(knex: GuardedKnex): void;
    private inspect;
}
/** Internal token, deliberately absent from the plugin's public service exports. */
export declare const demoWriteGuardToken: ServiceToken<DemoWriteGuard>;
//# sourceMappingURL=guard.d.ts.map