import { AppCommand } from '@nocobase/app-cli';
import { type Interfaces } from '@oclif/core';
import type { DemoDataStatus } from '../server/data/types.js';
type Result = Pick<DemoDataStatus, 'available' | 'datasetId' | 'present' | 'state' | 'language' | 'counts' | 'failure'> | {
    operation: string;
    language?: string;
    actor?: string;
    dryRun: true;
};
/** Uses the same dataset service as HTTP and Scheduler; no server listener is needed. */
export default class DemoData extends AppCommand {
    static summary: string;
    static args: {
        operation: Interfaces.Arg<string, Interfaces.CustomOptions>;
    };
    static flags: {
        actor: Interfaces.OptionFlag<string | undefined>;
        language: Interfaces.OptionFlag<string | undefined>;
        force: Interfaces.BooleanFlag<boolean>;
        'dry-run': Interfaces.BooleanFlag<boolean>;
    };
    run(): Promise<Result>;
}
export {};
//# sourceMappingURL=data.d.ts.map