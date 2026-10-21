import type { DemoMode, DemoModeSettings } from '../config.js';
import type { DemoModeService } from '../tokens.js';
export declare class DefaultDemoModeService implements DemoModeService {
    readonly mode: DemoMode;
    readonly allowTables: readonly string[];
    constructor(settings: DemoModeSettings);
}
//# sourceMappingURL=demo-mode.d.ts.map