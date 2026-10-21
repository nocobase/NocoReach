import type { DemoDataDependencies } from './service.js';
/** Environment infrastructure: provision at startup and retain across every dataset clear/reset. */
export declare class DemoModelRuntime {
    private readonly deps;
    constructor(deps: DemoDataDependencies);
    private get enabled();
    private row;
    load(): Promise<void>;
    initialize(): Promise<void>;
}
//# sourceMappingURL=model-runtime.d.ts.map