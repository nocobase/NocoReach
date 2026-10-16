import type { SchedulerService } from '@nocobase/app-plugin-scheduler/server/tokens';
import { DEFAULT_CRON } from './daily-analysis.js';
import type { LegacyDatabase } from './legacy/database.js';
import type { LegacyWorkflows } from './legacy/schedule.js';

export const ANALYSIS_SCHEDULE = 'nocoreach.daily-analysis';
export const TIMING_KEY = 'daily-analysis:schedule-settings';
export const DAILY_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
interface Timing {
  cron: string;
  timezone: string;
  changedAt?: string;
}

/** App-owned configuration; the patched Scheduler still owns rules and history. */
export class ScheduleManagement {
  private saving: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly db: LegacyDatabase,
    private readonly workflows: LegacyWorkflows,
    private readonly scheduler: SchedulerService,
  ) {}

  async timing(): Promise<Timing> {
    const row = await this.db
      .getRepository('nrSnapshots')
      .findOne({ filter: { key: TIMING_KEY } });
    return (
      (row?.get('payload') as Timing | undefined) ?? {
        cron: DEFAULT_CRON,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    );
  }

  async supported(id: string): Promise<boolean> {
    const row = await this.workflows.definition(ANALYSIS_SCHEDULE);
    return row?.id === id && row?.lifecycleState === 'active';
  }

  save(
    time: string,
  ): Promise<Awaited<ReturnType<SchedulerService['refreshSchedule']>>> {
    if (!DAILY_TIME.test(time)) throw new Error('Invalid daily time.');
    const work = this.saving.then(async () => {
      const repo = this.db.getRepository('nrSnapshots');
      const row = await repo.findOne({ filter: { key: TIMING_KEY } });
      const previous = await this.timing();
      const [hour, minute] = time.split(':').map(Number);
      const next: Timing = {
        ...previous,
        cron: `${minute} ${hour} * * *`,
        changedAt: new Date().toISOString(),
      };
      if (row)
        await repo.update({ filterByTk: row.id, values: { payload: next } });
      else await repo.create({ values: { key: TIMING_KEY, payload: next } });
      try {
        return await this.scheduler.refreshSchedule(ANALYSIS_SCHEDULE);
      } catch (error) {
        // A rejected save must not unexpectedly become effective after restart.
        if (row)
          await repo.update({
            filterByTk: row.id,
            values: { payload: previous },
          });
        else await repo.destroy({ filter: { key: TIMING_KEY } });
        await this.scheduler.refreshSchedule(ANALYSIS_SCHEDULE);
        throw error;
      }
    });
    this.saving = work.catch(() => undefined);
    return work;
  }

  trigger(requestId: string) {
    return this.scheduler.triggerSchedule(ANALYSIS_SCHEDULE, requestId);
  }
}
