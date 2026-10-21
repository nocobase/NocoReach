import { DemoAgentProxy, type DemoAgentAdapter } from './agent-proxy.js';
import type { DatabaseManager } from '@nocobase/db';
import type { DemoModeSettings } from '../config.js';
import type { DemoWriteGuard } from '../guard.js';
import type { DemoConfigurationView, DemoDailySchedule, DemoMockAdapter, DemoWriteCapability, DemoWriteRule } from './types.js';
/** All instances read shared configuration; no process-local policy cache can retain revoked access. */
export declare class DemoConfigurationService {
    private readonly database;
    private readonly settings;
    private readonly guard;
    private readonly data;
    private readonly policy;
    runWithPolicy<T>(run: () => Promise<T>): Promise<T>;
    private currentPolicy;
    private readonly writes;
    private readonly adapters;
    constructor(database: DatabaseManager, settings: DemoModeSettings, guard: DemoWriteGuard, data: () => Promise<{
        importing: unknown;
        languages: readonly string[];
    }>);
    get enabled(): boolean;
    requireEnabled(): void;
    registerWrite(capability: DemoWriteCapability): void;
    registerMock(adapter: DemoMockAdapter): void;
    registerAgent<Input, Output>(adapter: DemoAgentAdapter<Input, Output>): DemoAgentProxy<Input, Output>;
    /** Async workers must not inherit the originating HTTP request's stale policy snapshot. */
    withFreshPolicy<T>(run: () => Promise<T>): Promise<T>;
    initialize(): Promise<void>;
    private row;
    private decode;
    read(includeBusy?: boolean): Promise<DemoConfigurationView>;
    save(section: 'rules' | 'mocks' | 'schedule', expectedRevision: number, input: unknown): Promise<DemoConfigurationView>;
    /** Rules usable by the SQL guard without application row context. */
    wholeTableRules(): Promise<readonly {
        table: string;
        statement: string;
    }[]>;
    /** Call only around the declared, already-authorized business operation, never around a general dispatcher. */
    runWrite<T>(id: string, operation: DemoWriteRule['operation'], input: unknown, run: () => Promise<T>): Promise<T>;
    /**
     * As `runWrite`, for an operation that writes through several capabilities: each configured, in-scope rule adds
     * its table and statement to what the guard lets through; an entry with no rule allows nothing. One entry whose
     * rule is configured but out of scope refuses the whole operation.
     */
    runWrites<T>(entries: readonly (readonly [
        id: string,
        operation: DemoWriteRule['operation']
    ])[], input: unknown, run: () => Promise<T>): Promise<T>;
    requireMock(id: string): Promise<void>;
    invokeMock<T = unknown>(id: string, input: unknown): Promise<T>;
    /** A durable claim prevents repeated DST minutes and multiple processes from resetting the same local day twice. */
    claimDaily(now: Date): Promise<DemoDailySchedule | null>;
}
//# sourceMappingURL=service.d.ts.map