import { z } from 'zod';
import type { DemoConfigurationView, DemoWriteRule, DemoDailySchedule } from './types.js';
export declare const WriteRule: z.ZodType<DemoWriteRule>;
export declare const DailySchedule: z.ZodType<DemoDailySchedule>;
export declare const ConfigurationInput: Record<'rules' | 'mocks' | 'schedule', z.ZodType<{
    expectedRevision: number;
    value: DemoWriteRule[] | Record<string, boolean> | DemoDailySchedule;
}>>;
export declare const ConfigurationView: z.ZodType<DemoConfigurationView>;
//# sourceMappingURL=schemas.d.ts.map