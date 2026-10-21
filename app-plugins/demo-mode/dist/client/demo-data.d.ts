import type { DemoDataStatus } from '../server/data/types.js';
export type { DemoAccountSummary, DemoDataState, DemoDataStatus, } from '../server/data/types.js';
export interface DemoDataControls {
    /** Null until the first answer; stays at the last answer while a later request fails. */
    readonly status: DemoDataStatus | null;
    readonly loading: boolean;
    /** The last request's failure, cleared by the next success. */
    readonly error: unknown;
    /** Whether an import, clear or reset this page sent is still being answered. */
    readonly pending: boolean;
    refresh(): Promise<void>;
    importData(language?: string): Promise<void>;
    clear(): Promise<void>;
    reset(language?: string): Promise<void>;
}
/**
 * The demo data endpoints for an application's own demo page: the status, polled every second while an import runs,
 * and the actions. Each action resolves with the new status in `status` and rejects with the API error, so the page
 * can show it.
 */
export declare function useDemoData(options?: {
    readonly enabled?: boolean;
}): DemoDataControls;
//# sourceMappingURL=demo-data.d.ts.map