import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import { resolveDemoModeSettings } from '../config.js';
import { DemoReadOnlyError } from '../errors.js';
import { DemoWriteGuard, demoWriteGuardToken, } from '../guard.js';
import { createDemoModeMiddleware, } from '../middleware.js';
import { DefaultDemoModeService } from '../services/demo-mode.js';
import { demoModeServiceToken, demoConfigurationToken } from '../tokens.js';
/** A table that never exists: if the guard ever fails to refuse the probe, the database rejects it instead. */
const PROBE_SQL = 'DELETE FROM __nocobase_demo_mode_probe__ WHERE 1 = 0';
export class DemoModeProvider extends ServiceProvider {
    name = '@nocobase/app-plugin-demo-mode';
    guard;
    connectionNames;
    register() {
        const settings = resolveDemoModeSettings(this.app.config);
        this.app.container.instance(demoModeServiceToken, new DefaultDemoModeService(settings));
        const guard = new DemoWriteGuard(settings);
        this.app.container.instance(demoWriteGuardToken, guard);
        if (settings.mode === 'off')
            return;
        this.guard = guard;
        // The root router runs this before every route, including those contributed later and the WebSocket upgrade.
        this.app.router.use('*', createDemoModeMiddleware({
            guard,
            settings,
            runWithPolicy: (run) => this.app.container.resolve(demoConfigurationToken).runWithPolicy(run),
            allowed: () => this.app.container.resolve(demoConfigurationToken).wholeTableRules(),
            attachConnections: () => this.attachConnections(),
            logger: {
                info: (details, message) => this.logger()?.info(details, message),
                warn: (details, message) => this.logger()?.warn(details, message),
            },
        }));
    }
    /** Guards every connection and proves it with a probe write, refusing to start when a connection is not guarded. */
    async ready() {
        const guard = this.guard;
        if (!guard)
            return;
        await this.attachConnections();
        for (const name of this.connections()) {
            const knex = await this.client(name);
            try {
                await guard.run({ method: 'PROBE', path: '', blocked: [], probe: true }, async () => await knex.raw(PROBE_SQL));
            }
            catch (error) {
                if (error instanceof DemoReadOnlyError)
                    continue;
                throw new Error(`Demo mode could not guard database connection "${name}"; refusing to start.`, { cause: error });
            }
            throw new Error(`Demo mode could not guard database connection "${name}"; refusing to start.`);
        }
        const { mode, allowTables } = this.app.container.resolve(demoModeServiceToken);
        this.logger()?.warn({ mode, allowTables, connections: this.connections() }, mode === 'read-only'
            ? 'Demo mode is on: requests cannot change the database except authorized demo imports and allowed tables'
            : 'Demo mode is observing: writes requests make are logged, not refused');
    }
    async attachConnections() {
        const guard = this.guard;
        if (!guard)
            return;
        for (const name of this.connections()) {
            guard.attach(await this.client(name));
        }
    }
    async client(name) {
        return this.app.container
            .resolve(databaseManagerToken)
            .connection(name)
            .client();
    }
    connections() {
        this.connectionNames ??= Object.keys(this.app.config.get('database')
            ?.connections ?? {});
        return this.connectionNames;
    }
    logger() {
        const container = this.app.container;
        return container.has(loggingToken)
            ? container.resolve(loggingToken).getLogger('demo-mode')
            : undefined;
    }
}
//# sourceMappingURL=demo-mode.js.map