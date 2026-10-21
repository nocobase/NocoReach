import type { DemoClock } from './types.js';
/** Days are counted in the dataset's time zone, so "three days ago at 10:00" is a local office hour there. */
export declare function createDemoClock(now: Date, timeZone?: string, salt?: string): DemoClock;
//# sourceMappingURL=clock.d.ts.map