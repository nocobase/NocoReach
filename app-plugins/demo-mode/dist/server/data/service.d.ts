import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { UserManagementService } from '@nocobase/app-plugin-users/server/tokens';
import { ApiError } from '@nocobase/app-server/router';
import type { DatabaseManager } from '@nocobase/db';
import type { DemoDataSettings, DemoMode } from '../config.js';
import type { DemoModels } from './models.js';
import type { DemoDataset, DemoDataStatus } from './types.js';
export interface DemoDataService {
    /** Registers the application's dataset, once, from a service provider's `register()` or `boot()`. */
    register(dataset: DemoDataset): void;
    /** Re-read the environment model binding, without changing it. */
    load(): Promise<void>;
    /** Provision the environment model at application startup, independently of business data. */
    initialize(): Promise<void>;
    status(): Promise<DemoDataStatus>;
    /** Starts an import without waiting for it; `status()` tells how far it got and, when it stopped, why. */
    start(actorId: string, language?: string): Promise<DemoDataStatus>;
    /** Imports and waits, for commands, schedules and tests. */
    importNow(actorId: string, language?: string): Promise<DemoDataStatus>;
    /** Clears application business data and disables demo accounts; environment configuration stays. */
    clear(actorId: string): Promise<DemoDataStatus>;
    /** Clears what is there and imports again; waits when `wait` is set. */
    reset(actorId?: string, language?: string, options?: {
        readonly wait?: boolean;
    }): Promise<DemoDataStatus>;
    /** Settles when no import or clear runs in this process. */
    whenIdle(): Promise<void>;
    /** The simulated model, for applications that generate text in-process. */
    readonly models: DemoModels;
}
export interface DemoDataDependencies {
    readonly withPolicy?: (run: () => Promise<void>) => Promise<void>;
    readonly database: DatabaseManager;
    readonly settings: DemoDataSettings;
    readonly mode: () => DemoMode;
    readonly models: DemoModels;
    /** Where the model gateway reaches the simulated model, such as `http://127.0.0.1:13000/main/api/demoMode/models/v1`. */
    readonly modelBaseUrl: () => string;
    readonly users?: () => UserManagementService | undefined;
    readonly authorization?: () => AppAuthorization | undefined;
    readonly agents?: () => Agents | undefined;
    readonly logger?: {
        info(details: object, message: string): void;
        warn(details: object, message: string): void;
    };
}
export declare function demoDataError(reason: string, message: string, status?: 'FAILED_PRECONDITION' | 'NOT_FOUND' | 'ALREADY_EXISTS' | 'INVALID_ARGUMENT'): ApiError;
export declare class DefaultDemoDataService implements DemoDataService {
    private readonly deps;
    readonly models: DemoModels;
    private dataset;
    /** The import or clear this process runs, so a second one is refused at once and progress is live. */
    private running;
    private percent;
    private readonly runtime;
    constructor(deps: DemoDataDependencies);
    whenIdle(): Promise<void>;
    register(dataset: DemoDataset): void;
    initialize(): Promise<void>;
    load(): Promise<void>;
    status(): Promise<DemoDataStatus>;
    start(actorId: string, language?: string): Promise<DemoDataStatus>;
    importNow(actorId: string, language?: string): Promise<DemoDataStatus>;
    clear(actorId: string): Promise<DemoDataStatus>;
    reset(actorId?: string, language?: string, options?: {
        readonly wait?: boolean;
    }): Promise<DemoDataStatus>;
    private requireDataset;
    /** Persist a lease even before the first import, so competing processes cannot clear and import together. */
    private claimEmptyClear;
    private stale;
    private exclusive;
    /** Claims the dataset row before anything is written, so a second import beside this one is refused. */
    private claim;
    private populate;
    /** Clears everything the import created and forgets it. */
    private remove;
    private undo;
    private clearContext;
    private countsOf;
    private createAccount;
    private createPermissionSet;
    private assign;
    private permissionSets;
    private touch;
    private row;
    private records;
}
//# sourceMappingURL=service.d.ts.map