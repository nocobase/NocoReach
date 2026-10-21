import { AsyncLocalStorage } from 'node:async_hooks';
import { createServiceToken, } from '@nocobase/service-provider';
import { DemoReadOnlyError } from './errors.js';
import { classifySql } from './sql.js';
/**
 * Refuses database writes made on behalf of an HTTP request.
 *
 * A request runs inside `run()`, which puts its state in async-local storage. Each knex client gets one `query`
 * listener; knex emits that event synchronously before it sends a query, from transaction clients too, so throwing
 * there stops the statement before the database sees it. Work with no request around it — migrations, seeds, jobs and
 * schedules — has no state and is never refused.
 */
export class DemoWriteGuard {
    settings;
    storage = new AsyncLocalStorage();
    guarded = new WeakSet();
    constructor(settings) {
        this.settings = settings;
    }
    run(state, fn) {
        return this.storage.run(state, fn);
    }
    /** Only authorized demo lifecycle handlers use this; their background work inherits the same exemption. */
    runDemoData(fn) {
        return this.storage.exit(fn);
    }
    runAllowed(allowed, fn) {
        const state = this.storage.getStore();
        return state
            ? this.storage.run({ ...state, allowed: [...(state.allowed ?? []), ...allowed] }, fn)
            : fn();
    }
    /** Whether `knex`'s current client is guarded. A reconnect replaces the client, so callers check again. */
    isAttached(knex) {
        return this.guarded.has(knex.client);
    }
    attach(knex) {
        const client = knex.client;
        if (this.guarded.has(client))
            return;
        this.guarded.add(client);
        client.on('query', (query) => this.inspect(query));
    }
    inspect(query) {
        const state = this.storage.getStore();
        if (!state || typeof query.sql !== 'string')
            return;
        const writes = classifySql(query.sql).filter((write) => state.probe ||
            state.strict ||
            !write.table ||
            (!this.settings.allowTables.has(write.table) &&
                !state.allowed?.some((rule) => rule.table === write.table && rule.statement === write.statement)));
        if (writes.length === 0)
            return;
        state.blocked.push(...writes);
        if (state.probe || this.settings.mode === 'read-only') {
            throw new DemoReadOnlyError(writes);
        }
    }
}
/** Internal token, deliberately absent from the plugin's public service exports. */
export const demoWriteGuardToken = createServiceToken('@nocobase/app-plugin-demo-mode/write-guard');
//# sourceMappingURL=guard.js.map