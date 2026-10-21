import type { DemoDailySchedule } from './types.js';
export declare function localMinute(now: Date, timezone: string): {
    day: string;
    hour: number;
    minute: number;
};
/** Reject the second occurrence of a repeated wall minute, even after downtime during the first. */
export declare function firstWallMinute(now: Date, timezone: string): boolean;
/** Scan UTC minutes so DST gaps are skipped and folds choose the first occurrence. */
export declare function nextDailyRun(schedule: DemoDailySchedule | null, now?: Date, lastDay?: string | null): string | null;
//# sourceMappingURL=schedule.d.ts.map