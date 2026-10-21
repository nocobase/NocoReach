import { DemoAgentProxy } from './agent-proxy.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { demoDataError } from '../data/service.js';
import { ConfigurationInput } from './schemas.js';
import { firstWallMinute, localMinute, nextDailyRun } from './schedule.js';
const protectedTable = /^(?:user|account|session|verification|auth|ag_|demo_mode_|permission|role|secret|api_key)/u;
const invalid = (message) => demoDataError('DEMO_CONFIGURATION_INVALID', message, 'INVALID_ARGUMENT');
/** All instances read shared configuration; no process-local policy cache can retain revoked access. */
export class DemoConfigurationService {
    database;
    settings;
    guard;
    data;
    policy = new AsyncLocalStorage();
    async runWithPolicy(run) {
        if (!this.enabled || this.policy.getStore())
            return run();
        return this.policy.run(await this.read(false), run);
    }
    async currentPolicy() {
        return this.policy.getStore() ?? this.read(false);
    }
    writes = new Map();
    adapters = new Map();
    constructor(database, settings, guard, data) {
        this.database = database;
        this.settings = settings;
        this.guard = guard;
        this.data = data;
    }
    get enabled() {
        return this.settings.mode !== 'off';
    }
    requireEnabled() {
        if (!this.enabled)
            throw demoDataError('DEMO_MODE_REQUIRED', 'Demo management is unavailable in this deployment.', 'NOT_FOUND');
    }
    registerWrite(capability) {
        if (this.writes.has(capability.id))
            throw new Error(`Duplicate demo capability: ${capability.id}`);
        if (!/^[a-z][a-z0-9_]*$/u.test(capability.table) ||
            protectedTable.test(capability.table))
            throw invalid('A protected or invalid table cannot be exposed.');
        if (!capability.operations.length ||
            !capability.scopes.length ||
            capability.scopes.some((scope) => scope.id !== 'all' && !capability.checkScope))
            throw invalid('Each scoped capability needs a scope resolver.');
        this.writes.set(capability.id, capability);
    }
    registerMock(adapter) {
        if (this.adapters.has(adapter.id))
            throw new Error(`Duplicate demo mock: ${adapter.id}`);
        this.adapters.set(adapter.id, adapter);
    }
    registerAgent(adapter) {
        return new DemoAgentProxy(this, adapter);
    }
    /** Async workers must not inherit the originating HTTP request's stale policy snapshot. */
    withFreshPolicy(run) {
        return this.policy.exit(() => this.runWithPolicy(run));
    }
    async initialize() {
        if (!this.enabled)
            return;
        if (await this.row())
            return;
        try {
            await this.database
                .query()
                .insertInto('demoModeConfiguration')
                .values({
                id: 'default',
                revision: 0,
                value: JSON.stringify({ rules: [], mocks: {}, schedule: null }),
            })
                .execute();
        }
        catch (error) {
            if (!(await this.row()))
                throw error;
        }
    }
    async row() {
        return this.database
            .query()
            .selectFrom('demoModeConfiguration')
            .selectAll()
            .where('id', '=', 'default')
            .executeTakeFirst();
    }
    decode(row) {
        const stored = typeof row.value === 'string'
            ? JSON.parse(row.value)
            : row.value;
        return {
            revision: Number(row.revision),
            rules: stored.rules,
            schedule: stored.schedule,
            mocks: {
                ...Object.fromEntries([...this.adapters.values()].map((a) => [
                    a.id,
                    a.defaultEnabled === true,
                ])),
                ...stored.mocks,
            },
        };
    }
    async read(includeBusy = true) {
        this.requireEnabled();
        const row = await this.row();
        if (!row)
            throw new Error('Demo configuration has not been initialized.');
        const value = this.decode(row);
        return {
            ...value,
            busy: includeBusy && Boolean((await this.data()).importing),
            mode: this.settings.mode,
            fixedTables: [...this.settings.allowTables],
            capabilities: [...this.writes.values()].map((item) => ({
                id: item.id,
                title: item.title,
                table: item.table,
                operations: item.operations,
                scopes: item.scopes,
            })),
            adapters: [...this.adapters.values()].map((item) => ({
                id: item.id,
                title: item.title,
                kind: item.kind,
                scope: item.scope,
                defaultEnabled: item.defaultEnabled,
            })),
            nextRun: nextDailyRun(value.schedule, new Date(), row.lastDay),
        };
    }
    async save(section, expectedRevision, input) {
        this.requireEnabled();
        const parsed = ConfigurationInput[section].safeParse({
            expectedRevision,
            value: input,
        });
        if (!parsed.success)
            throw invalid('Invalid demo configuration.');
        input = parsed.data.value;
        const status = await this.data();
        if (status.importing)
            throw demoDataError('DEMO_DATA_BUSY', 'Wait for the demo operation to finish.');
        const current = await this.read();
        if (current.revision !== expectedRevision)
            throw demoDataError('DEMO_CONFIGURATION_CONFLICT', 'The configuration changed. Reload before saving.', 'ALREADY_EXISTS');
        let value = input;
        if (section === 'rules') {
            const rules = input;
            const keys = new Set();
            for (const rule of rules) {
                const capability = this.writes.get(rule.capability);
                const key = `${rule.capability}:${rule.operation}`;
                if (!capability ||
                    !capability.operations.includes(rule.operation) ||
                    !capability.scopes.some((scope) => scope.id === rule.scope) ||
                    keys.has(key))
                    throw invalid('Unknown or duplicate write rule.');
                keys.add(key);
            }
        }
        else if (section === 'mocks') {
            if (Object.keys(input).some((id) => !this.adapters.has(id)))
                throw invalid('Unknown mock adapter.');
            value = { ...current.mocks, ...input };
        }
        else {
            const schedule = input;
            if (schedule.enabled) {
                try {
                    localMinute(new Date(), schedule.timezone);
                }
                catch {
                    throw invalid('Invalid timezone.');
                }
                if (!status.languages.includes(schedule.language))
                    throw invalid('Unsupported dataset language.');
            }
        }
        const updated = {
            rules: current.rules,
            mocks: current.mocks,
            schedule: current.schedule,
            [section]: value,
        };
        const result = await this.database
            .query()
            .updateTable('demoModeConfiguration')
            .set({ revision: expectedRevision + 1, value: JSON.stringify(updated) })
            .where('id', '=', 'default')
            .where('revision', '=', expectedRevision)
            .execute();
        if (result.updatedCount !== 1)
            throw demoDataError('DEMO_CONFIGURATION_CONFLICT', 'The configuration changed. Reload before saving.', 'ALREADY_EXISTS');
        return this.read();
    }
    /** Rules usable by the SQL guard without application row context. */
    async wholeTableRules() {
        if (!this.enabled)
            return [];
        const { rules } = await this.currentPolicy();
        return rules.flatMap((rule) => {
            const capability = this.writes.get(rule.capability);
            return capability &&
                rule.scope === 'all' &&
                capability.scopes.some((scope) => scope.id === 'all') &&
                capability.operations.includes(rule.operation)
                ? [{ table: capability.table, statement: rule.operation }]
                : [];
        });
    }
    /** Call only around the declared, already-authorized business operation, never around a general dispatcher. */
    runWrite(id, operation, input, run) {
        return this.runWrites([[id, operation]], input, run);
    }
    /**
     * As `runWrite`, for an operation that writes through several capabilities: each configured, in-scope rule adds
     * its table and statement to what the guard lets through; an entry with no rule allows nothing. One entry whose
     * rule is configured but out of scope refuses the whole operation.
     */
    async runWrites(entries, input, run) {
        if (!this.enabled)
            return run();
        const { rules } = await this.currentPolicy();
        const allowed = [];
        for (const [id, operation] of entries) {
            const capability = this.writes.get(id);
            const rule = rules.find((item) => item.capability === id && item.operation === operation);
            if (!capability ||
                !rule ||
                !capability.operations.includes(operation) ||
                !capability.scopes.some((scope) => scope.id === rule.scope))
                continue;
            if (rule.scope !== 'all' &&
                !(await capability.checkScope?.(rule.scope, input)))
                throw demoDataError('DEMO_SCOPE_DENIED', 'This operation is outside the configured demo scope.');
            allowed.push({ table: capability.table, statement: operation });
        }
        return allowed.length ? this.guard.runAllowed(allowed, run) : run();
    }
    async requireMock(id) {
        this.requireEnabled();
        if (!this.adapters.has(id) || !(await this.currentPolicy()).mocks[id])
            throw demoDataError('DEMO_MOCK_UNAVAILABLE', 'This demo call has no enabled adapter.');
    }
    async invokeMock(id, input) {
        this.requireEnabled();
        const adapter = this.adapters.get(id);
        if (!adapter || !(await this.currentPolicy()).mocks[id])
            throw demoDataError('DEMO_MOCK_UNAVAILABLE', 'This demo call has no enabled adapter.');
        return (await adapter.invoke(input));
    }
    /** A durable claim prevents repeated DST minutes and multiple processes from resetting the same local day twice. */
    async claimDaily(now) {
        if (!this.enabled)
            return null;
        const row = await this.row();
        if (!row)
            return null;
        const config = this.decode(row);
        const schedule = config.schedule;
        if (!schedule?.enabled)
            return null;
        const local = localMinute(now, schedule.timezone);
        if (local.hour !== schedule.hour ||
            local.minute !== schedule.minute ||
            row.lastDay === local.day ||
            !firstWallMinute(now, schedule.timezone))
            return null;
        const result = await this.database
            .query()
            .updateTable('demoModeConfiguration')
            .set({ lastDay: local.day })
            .where('id', '=', 'default')
            .where('revision', '=', config.revision)
            .where('lastDay', row.lastDay === null ? 'is' : '=', row.lastDay)
            .execute();
        return result.updatedCount === 1 ? schedule : null;
    }
}
//# sourceMappingURL=service.js.map