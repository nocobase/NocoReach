import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import {
  Job,
  type JobExecutionContext,
  type JobExecutor,
} from '@nocobase/jobs';
import { reachToken } from './index.js';
const TYPE = 'app.nocoreach-analysis';
const reference = (id: string) => ({ type: TYPE, id });
// A single domain analysis call needs Scheduler visibility, not a new multi-step workflow.
export function registerAnalysisSchedule(app: Application): {
  start: () => Promise<JobExecutor>;
  stop: () => Promise<void>;
} {
  const reach = app.container.resolve(reachToken),
    scheduler = app.container.resolve(schedulerServiceToken);
  let executor: Promise<JobExecutor> | undefined;
  const read = async (id: string) =>
    (
      await reach.store
        .repository('nrSnapshots')
        .findOne({ filter: { key: `analysis-occurrence:${id}` } })
    )?.get('payload');
  const write = async (id: string, payload: object) =>
    reach.store.transaction(async () => {
      const repo = reach.store.repository('nrSnapshots'),
        key = `analysis-occurrence:${id}`,
        row = await repo.findOne({ filter: { key } });
      if (row) await repo.update({ filterByTk: row.id, values: { payload } });
      else await repo.create({ values: { key, payload } });
    });
  const handle = scheduler.registerTarget({
    type: TYPE,
    title: 'NocoReach 每日分析',
    validate: (config) => ({
      valid:
        !!config &&
        typeof config === 'object' &&
        Object.keys(config).length === 0,
    }),
    start: async (_config, { occurrenceId }) => {
      if (!(await read(occurrenceId)))
        await (await ready()).addJob(new AnalysisTick({ occurrenceId }));
      return { state: 'accepted', reference: reference(occurrenceId) };
    },
    inspect: async (ref) => {
      const saved = await read(ref.id);
      if (saved?.completion)
        return { state: 'completed', completion: saved.completion };
      return saved ? { state: 'running' } : { state: 'pending' };
    },
  });
  class AnalysisTick extends Job<{ occurrenceId: string }> {
    static readonly jobName = 'nocoreach-analysis';
    override async execute(_context: JobExecutionContext): Promise<void> {
      const id = this.payload.occurrenceId,
        previous = await read(id);
      if (previous?.completion) {
        await handle.reportCompletion(id, reference(id), previous.completion);
        return;
      }
      // An interrupted paid request has an uncertain outcome and is never automatically repeated.
      if (previous?.started) {
        const completion = {
          status: 'failed' as const,
          reason: 'analysis-interrupted-review-required',
        };
        await write(id, { completion });
        await handle.reportCompletion(id, reference(id), completion);
        return;
      }
      await write(id, { started: new Date().toISOString() });
      let completion: { status: 'succeeded' | 'failed'; reason?: string };
      try {
        await reach.analysis.tick();
        const result = await reach.analysis.running;
        completion =
          result?.ok === false
            ? { status: 'failed', reason: 'analysis-failed' }
            : { status: 'succeeded' };
      } catch {
        completion = { status: 'failed', reason: 'analysis-failed' };
      }
      await write(id, { completion });
      await handle.reportCompletion(id, reference(id), completion);
    }
  }
  function ready(): Promise<JobExecutor> {
    return (executor ??= (async () => {
      const ex = app.container
        .resolve(jobExecutorServiceToken)
        .getJobExecutor('nocoreach-analysis');
      ex.registerJob(AnalysisTick);
      await ex.setup();
      return ex;
    })());
  }
  scheduler.defineSchedule({
    key: 'nocoreach.daily-analysis',
    title: 'NocoReach 每日分析',
    description:
      '每天 09:00 分析已接入数据；每分钟检查补跑和已确认可重试的失败。',
    schedule: { cron: '10 * * * * *', timezone: 'Asia/Shanghai' },
    target: { type: TYPE, config: {} },
  });
  return {
    start: ready,
    stop: async () => {
      await (await executor)?.shutdown();
    },
  };
}
